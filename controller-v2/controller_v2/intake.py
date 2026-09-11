from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import tempfile
from multiprocessing.connection import Client, Listener
from multiprocessing.context import AuthenticationError
from pathlib import Path
from typing import Any, Callable

from .store import ControllerError, IdempotencyConflict

PROTOCOL_VERSION = "1.0"
MAX_FRAME_BYTES = 1_048_576
MIN_AUTHKEY_BYTES = 32
_ALLOWED_FIELDS = frozenset(
    {
        "protocol_version",
        "command_id",
        "command_type",
        "repository_id",
        "base_subject_id",
        "payload",
        "parent_transaction_id",
        "relation_to_parent",
    }
)
_REQUIRED_FIELDS = frozenset(
    {
        "protocol_version",
        "command_id",
        "command_type",
        "repository_id",
        "base_subject_id",
        "payload",
    }
)
_ALLOWED_RELATIONS = frozenset({"REPAIR", "RETRY_NEW_INTENT", "REBASE", "SUCCESSOR"})


class ProtocolError(ControllerError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class ControllerNotReady(ControllerError):
    code = "CONTROLLER_NOT_READY"


class _DuplicateKey(ValueError):
    pass


def _validate_authkey(authkey: bytes) -> bytes:
    if not isinstance(authkey, bytes):
        raise TypeError("authkey must be bytes")
    if len(authkey) < MIN_AUTHKEY_BYTES:
        raise ValueError(f"authkey must contain at least {MIN_AUTHKEY_BYTES} bytes")
    return authkey


def _encode_json(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _error_frame(code: str) -> bytes:
    return _encode_json(
        {
            "protocol_version": PROTOCOL_VERSION,
            "status": "ERROR",
            "error_code": code,
        }
    )


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateKey(key)
        value[key] = item
    return value


def _parse_request(frame: bytes) -> dict[str, Any]:
    if len(frame) > MAX_FRAME_BYTES:
        raise ProtocolError("PROTOCOL_FRAME_TOO_LARGE")
    try:
        text = frame.decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        raise ProtocolError("PROTOCOL_INVALID_UTF8") from exc
    try:
        value = json.loads(text, object_pairs_hook=_unique_object)
    except _DuplicateKey as exc:
        raise ProtocolError("PROTOCOL_DUPLICATE_KEY") from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise ProtocolError("PROTOCOL_INVALID_JSON") from exc
    if not isinstance(value, dict):
        raise ProtocolError("PROTOCOL_INVALID_REQUEST")

    fields = set(value)
    unknown = fields - _ALLOWED_FIELDS
    if unknown:
        raise ProtocolError("PROTOCOL_UNKNOWN_FIELD")
    if not _REQUIRED_FIELDS.issubset(fields):
        raise ProtocolError("PROTOCOL_INVALID_REQUEST")
    if value["protocol_version"] != PROTOCOL_VERSION:
        raise ProtocolError("PROTOCOL_UNSUPPORTED_VERSION")

    for name in ("command_id", "command_type", "repository_id", "base_subject_id"):
        if not isinstance(value[name], str) or not value[name]:
            raise ProtocolError("PROTOCOL_INVALID_REQUEST")
    if not isinstance(value["payload"], dict):
        raise ProtocolError("PROTOCOL_INVALID_REQUEST")

    parent_present = "parent_transaction_id" in value
    relation_present = "relation_to_parent" in value
    if parent_present != relation_present:
        raise ProtocolError("PROTOCOL_INVALID_REQUEST")
    if parent_present:
        if not isinstance(value["parent_transaction_id"], str) or not value["parent_transaction_id"]:
            raise ProtocolError("PROTOCOL_INVALID_REQUEST")
        if value["relation_to_parent"] not in _ALLOWED_RELATIONS:
            raise ProtocolError("PROTOCOL_INVALID_REQUEST")
    return value


def local_endpoint_for_database(db_path: str | Path, instance_id: str) -> tuple[str, str]:
    if not isinstance(instance_id, str) or not instance_id:
        raise ValueError("instance_id must be a non-empty string")
    resolved = str(Path(db_path).resolve())
    token = hashlib.sha256((resolved + "\0" + instance_id).encode("utf-8")).hexdigest()[:24]
    if os.name == "nt":
        return (rf"\\.\pipe\SystemMasterCtl-{token}", "AF_PIPE")
    return (str(Path(tempfile.gettempdir()) / f"system-master-ctl-{token}.sock"), "AF_UNIX")


class CommandIntake:
    def __init__(
        self,
        store,
        *,
        caller_type: str,
        caller_id: str,
        controller_version: str,
        controller_commit_oid: str,
        policy_version: str,
        policy_digest_sha256: str,
        ready_check: Callable[[], bool],
    ):
        if not callable(ready_check):
            raise TypeError("ready_check must be callable")
        self.store = store
        self.caller_type = caller_type
        self.caller_id = caller_id
        self.controller_version = controller_version
        self.controller_commit_oid = controller_commit_oid
        self.policy_version = policy_version
        self.policy_digest_sha256 = policy_digest_sha256
        self.ready_check = ready_check

    def _admit(self, request: dict[str, Any]) -> dict[str, Any]:
        if not self.ready_check():
            raise ControllerNotReady("controller is not READY")
        result = self.store.submit_command(
            command_id=request["command_id"],
            caller_type=self.caller_type,
            caller_id=self.caller_id,
            command_type=request["command_type"],
            payload=request["payload"],
            repository_id=request["repository_id"],
            base_subject_id=request["base_subject_id"],
            controller_version=self.controller_version,
            controller_commit_oid=self.controller_commit_oid,
            policy_version=self.policy_version,
            policy_digest_sha256=self.policy_digest_sha256,
            parent_transaction_id=request.get("parent_transaction_id"),
            relation_to_parent=request.get("relation_to_parent"),
        )
        return {
            "protocol_version": PROTOCOL_VERSION,
            "status": "ACCEPTED",
            "command_id": result.command_id,
            "transaction_id": result.transaction_id,
            "duplicate": bool(result.duplicate),
        }

    def handle_frame(self, frame: bytes) -> bytes:
        if not isinstance(frame, bytes):
            return _error_frame("PROTOCOL_INVALID_FRAME")
        try:
            request = _parse_request(frame)
            return _encode_json(self._admit(request))
        except ProtocolError as exc:
            return _error_frame(exc.code)
        except IdempotencyConflict:
            return _error_frame("IDEMPOTENCY_CONFLICT")
        except ControllerError as exc:
            return _error_frame(str(getattr(exc, "code", "CONTROLLER_ERROR")))
        except (KeyError, TypeError, ValueError, sqlite3.IntegrityError):
            return _error_frame("PROTOCOL_INVALID_REQUEST")
        except BaseException:
            return _error_frame("INTERNAL_ERROR")


class LocalCommandServer:
    def __init__(self, intake: CommandIntake, endpoint: tuple[str, str], authkey: bytes):
        self.intake = intake
        self.address, self.family = endpoint
        self._authkey = _validate_authkey(authkey)
        if self.family not in {"AF_PIPE", "AF_UNIX"}:
            raise ValueError("unsupported local IPC family")
        if self.family == "AF_PIPE" and os.name != "nt":
            raise ValueError("AF_PIPE is available only on Windows")
        if self.family == "AF_UNIX" and os.name == "nt":
            raise ValueError("AF_UNIX is not the Windows Controller transport")
        if self.family == "AF_UNIX" and Path(self.address).exists():
            raise ProtocolError("LOCAL_ENDPOINT_IN_USE")
        self._listener = Listener(self.address, family=self.family, authkey=self._authkey)
        self._closed = False

    def serve_once(self) -> bytes | None:
        if self._closed:
            raise ProtocolError("LOCAL_ENDPOINT_CLOSED")
        try:
            connection = self._listener.accept()
        except AuthenticationError:
            return None
        with connection:
            try:
                frame = connection.recv_bytes(MAX_FRAME_BYTES)
            except OSError:
                return None
            response = self.intake.handle_frame(frame)
            connection.send_bytes(response)
            return response

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._listener.close()
        if self.family == "AF_UNIX":
            path = Path(self.address)
            try:
                path.unlink()
            except FileNotFoundError:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


class LocalCommandClient:
    def __init__(self, endpoint: tuple[str, str], authkey: bytes):
        self.address, self.family = endpoint
        self._authkey = _validate_authkey(authkey)
        if self.family not in {"AF_PIPE", "AF_UNIX"}:
            raise ValueError("unsupported local IPC family")

    def request(self, request: dict[str, Any]) -> dict[str, Any]:
        try:
            frame = _encode_json(request)
        except (TypeError, ValueError) as exc:
            raise ProtocolError("PROTOCOL_INVALID_REQUEST") from exc
        if len(frame) > MAX_FRAME_BYTES:
            raise ProtocolError("PROTOCOL_FRAME_TOO_LARGE")
        with Client(self.address, family=self.family, authkey=self._authkey) as connection:
            connection.send_bytes(frame)
            response = connection.recv_bytes(MAX_FRAME_BYTES)
        try:
            value = json.loads(response.decode("utf-8", "strict"), object_pairs_hook=_unique_object)
        except (UnicodeDecodeError, json.JSONDecodeError, _DuplicateKey, ValueError) as exc:
            raise ProtocolError("PROTOCOL_INVALID_RESPONSE") from exc
        if not isinstance(value, dict):
            raise ProtocolError("PROTOCOL_INVALID_RESPONSE")
        return value
