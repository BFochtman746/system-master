from __future__ import annotations

import contextlib
import hashlib
import json
import re
import secrets
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

MAX_JCS_INTEGER = (1 << 53) - 1
ASCII_KEY = re.compile(r"^[\x20-\x7e]+$")
_HEX40 = re.compile(r"^[0-9a-f]{40}$")
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


class ControllerError(RuntimeError):
    code = "CONTROLLER_ERROR"


class IdempotencyConflict(ControllerError):
    code = "IDEMPOTENCY_CONFLICT"


class LeaseHeld(ControllerError):
    code = "LEASE_HELD"


class InvalidState(ControllerError):
    code = "INVALID_STATE"


class CanonicalizationError(ControllerError):
    code = "CANONICALIZATION_ERROR"


_uuid_lock = threading.Lock()
_uuid_last_ms = -1
_uuid_seq = 0


def new_uuid7() -> str:
    """Return RFC 9562 UUIDv7; use stdlib implementation when available."""
    factory = getattr(uuid, "uuid7", None)
    if factory is not None:
        return str(factory())

    # Development compatibility for Python 3.13. Production target is Python 3.14+.
    global _uuid_last_ms, _uuid_seq
    with _uuid_lock:
        current_ms = time.time_ns() // 1_000_000
        if current_ms != _uuid_last_ms:
            _uuid_last_ms = current_ms
            _uuid_seq = 0
        else:
            _uuid_seq += 1
            if _uuid_seq > 0xFFF:
                while True:
                    current_ms = time.time_ns() // 1_000_000
                    if current_ms > _uuid_last_ms:
                        _uuid_last_ms = current_ms
                        _uuid_seq = 0
                        break
                    time.sleep(0.0001)
        value = ((_uuid_last_ms & ((1 << 48) - 1)) << 80)
        value |= 0x7 << 76
        value |= (_uuid_seq & 0xFFF) << 64
        value |= 0b10 << 62
        value |= secrets.randbits(62)
        return str(uuid.UUID(int=value))


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def _validate_canonical_value(value: Any) -> None:
    if value is None or isinstance(value, (str, bool)):
        if isinstance(value, str):
            value.encode("utf-8", "strict")
        return
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > MAX_JCS_INTEGER:
            raise CanonicalizationError("integer exceeds interoperable IEEE-754 safe range")
        return
    if isinstance(value, float):
        raise CanonicalizationError("floating-point numbers are forbidden in command/event payload profile")
    if isinstance(value, list):
        for item in value:
            _validate_canonical_value(item)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or not ASCII_KEY.fullmatch(key):
                raise CanonicalizationError("object keys must be printable ASCII strings")
            _validate_canonical_value(item)
        return
    raise CanonicalizationError(f"unsupported JSON value type: {type(value).__name__}")


def canonical_json(value: Any) -> str:
    """RFC 8785-compatible restricted controller JSON profile.

    Printable-ASCII object keys, UTF-8 strings, IEEE-754 safe integers,
    booleans/null/arrays/objects, and no floating point values are allowed.
    """
    _validate_canonical_value(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def valid_oid(object_format: str, oid: str) -> bool:
    pattern = _HEX40 if object_format == "sha1" else _HEX64 if object_format == "sha256" else None
    return bool(pattern and pattern.fullmatch(oid))


@dataclass(frozen=True)
class CommandResult:
    command_id: str
    transaction_id: str
    duplicate: bool


@dataclass(frozen=True)
class LeaseResult:
    lease_id: str
    fencing_token: int


class ControllerStore:
    def __init__(self, db_path: str | Path, schema_path: str | Path):
        self.db_path = str(db_path)
        self.schema_path = Path(schema_path)

    def connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path, timeout=5.0, isolation_level=None)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("PRAGMA synchronous=FULL")
        con.execute("PRAGMA busy_timeout=5000")
        return con

    def initialize(self) -> None:
        con = self.connect()
        try:
            con.executescript(self.schema_path.read_text(encoding="utf-8"))
        finally:
            con.close()

    @contextlib.contextmanager
    def immediate(self) -> Iterator[sqlite3.Connection]:
        con = self.connect()
        try:
            con.execute("BEGIN IMMEDIATE")
            yield con
            con.execute("COMMIT")
        except BaseException:
            if con.in_transaction:
                con.execute("ROLLBACK")
            raise
        finally:
            con.close()

    def register_repository(self, repository_id: str, owner: str, name: str,
                            canonical_url: str, object_format: str = "sha1") -> None:
        with self.immediate() as con:
            con.execute(
                "INSERT OR IGNORE INTO repositories(repository_id,provider,owner,name,canonical_url,object_format,created_at_ms) "
                "VALUES(?, 'github', ?, ?, ?, ?, ?)",
                (repository_id, owner, name, canonical_url, object_format, now_ms()),
            )

    def register_subject(self, repository_id: str, oid: str, *, object_format: str = "sha1",
                         lineage_kind: str = "BASE", parent_subject_id: str | None = None,
                         created_by_transaction_id: str | None = None) -> str:
        if not valid_oid(object_format, oid):
            raise ValueError("invalid Git object id")
        with self.immediate() as con:
            existing = con.execute(
                "SELECT subject_id FROM subjects WHERE repository_id=? AND object_format=? AND object_oid=?",
                (repository_id, object_format, oid),
            ).fetchone()
            if existing:
                return str(existing["subject_id"])
            subject_id = new_uuid7()
            con.execute(
                "INSERT INTO subjects(subject_id,repository_id,object_format,object_oid,parent_subject_id,lineage_kind,created_by_transaction_id,created_at_ms) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (subject_id, repository_id, object_format, oid, parent_subject_id, lineage_kind,
                 created_by_transaction_id, now_ms()),
            )
            return subject_id

    def register_worker(self, worker_id: str, worker_kind: str, trust_class: str,
                        capabilities: dict[str, Any] | None = None) -> None:
        ts = now_ms()
        payload = canonical_json(capabilities or {})
        with self.immediate() as con:
            con.execute(
                "INSERT INTO workers(worker_id,worker_kind,trust_class,instance_nonce,capabilities_json,registered_at_ms,last_seen_at_ms,status) "
                "VALUES(?,?,?,?,?,?,?,'ONLINE')",
                (worker_id, worker_kind, trust_class, new_uuid7(), payload, ts, ts),
            )

    def ensure_resource(self, resource_key: str, resource_type: str = "REPOSITORY_REF") -> None:
        with self.immediate() as con:
            con.execute(
                "INSERT OR IGNORE INTO protected_resources(resource_key,resource_type,last_fencing_token,created_at_ms) VALUES(?,?,0,?)",
                (resource_key, resource_type, now_ms()),
            )

    def _append_event(self, con: sqlite3.Connection, *, transaction_id: str | None,
                      command_id: str | None, event_type: str, subject: str | None,
                      payload: dict[str, Any], destination: str = "github:control-state") -> str:
        payload_json = canonical_json(payload)
        digest = sha256_text(payload_json)
        event_id = new_uuid7()
        ts = now_ms()
        con.execute(
            "INSERT INTO controller_events(event_id,transaction_id,command_id,source,event_type,subject,spec_version,data_schema,data_schema_version,payload_json,payload_digest_sha256,occurred_at_ms,recorded_at_ms) "
            "VALUES(?,?,?,?,?,?, '1.0', ?,1,?,?,?,?)",
            (event_id, transaction_id, command_id, "urn:system-master:controller-v2", event_type,
             subject, f"urn:system-master:schema:{event_type}:1", payload_json, digest, ts, ts),
        )
        con.execute(
            "INSERT INTO outbox_deliveries(event_id,destination,state,attempt_count) VALUES(?,?,'PENDING',0)",
            (event_id, destination),
        )
        return event_id

    def submit_command(self, *, command_id: str, caller_type: str, caller_id: str,
                       command_type: str, payload: dict[str, Any], repository_id: str,
                       base_subject_id: str, controller_version: str, controller_commit_oid: str,
                       policy_version: str, policy_digest_sha256: str,
                       parent_transaction_id: str | None = None,
                       relation_to_parent: str | None = None) -> CommandResult:
        canonical_payload = canonical_json(payload)
        fingerprint = sha256_text(canonical_json({
            "caller_id": caller_id,
            "caller_type": caller_type,
            "command_schema_version": 1,
            "command_type": command_type,
            "payload": payload,
        }))
        ts = now_ms()
        with self.immediate() as con:
            prior = con.execute(
                "SELECT fingerprint_sha256 FROM commands WHERE command_id=?", (command_id,)
            ).fetchone()
            if prior:
                if prior["fingerprint_sha256"] != fingerprint:
                    raise IdempotencyConflict("same command_id was reused with different semantics")
                tx = con.execute("SELECT transaction_id FROM transactions WHERE command_id=?", (command_id,)).fetchone()
                if not tx:
                    raise InvalidState("accepted duplicate command has no transaction")
                return CommandResult(command_id, str(tx["transaction_id"]), True)

            con.execute(
                "INSERT INTO commands(command_id,caller_type,caller_id,command_type,command_schema_version,canonical_payload_json,fingerprint_sha256,disposition,rejection_code,received_at_ms) "
                "VALUES(?,?,?,?,1,?,?,'ACCEPTED',NULL,?)",
                (command_id, caller_type, caller_id, command_type, canonical_payload, fingerprint, ts),
            )
            transaction_id = new_uuid7()
            con.execute(
                "INSERT INTO transactions(transaction_id,command_id,repository_id,base_subject_id,candidate_subject_id,parent_transaction_id,relation_to_parent,controller_version,controller_commit_oid,policy_version,policy_digest_sha256,execution_state,qualification_state,promotion_state,terminal_code,row_version,created_at_ms,updated_at_ms) "
                "VALUES(?,?,?,?,NULL,?,?,?,?,?,?, 'ADMITTED','NOT_REQUESTED','NOT_ELIGIBLE',NULL,0,?,?)",
                (transaction_id, command_id, repository_id, base_subject_id, parent_transaction_id,
                 relation_to_parent, controller_version, controller_commit_oid, policy_version,
                 policy_digest_sha256, ts, ts),
            )
            self._append_event(
                con, transaction_id=transaction_id, command_id=command_id,
                event_type="controller.transaction.admitted", subject=base_subject_id,
                payload={"command_id": command_id, "transaction_id": transaction_id,
                         "base_subject_id": base_subject_id},
            )
            return CommandResult(command_id, transaction_id, False)

    def _update_state(self, field: str, transaction_id: str, new_state: str,
                      event_type: str) -> None:
        if field not in {"execution_state", "qualification_state", "promotion_state"}:
            raise ValueError("unsupported state field")
        with self.immediate() as con:
            row = con.execute(
                f"SELECT command_id, base_subject_id, candidate_subject_id, {field} old_state FROM transactions WHERE transaction_id=?",
                (transaction_id,),
            ).fetchone()
            if not row:
                raise KeyError(transaction_id)
            if row["old_state"] == new_state:
                return
            try:
                con.execute(
                    f"UPDATE transactions SET {field}=?, row_version=row_version+1, updated_at_ms=? WHERE transaction_id=?",
                    (new_state, now_ms(), transaction_id),
                )
            except sqlite3.IntegrityError as exc:
                raise InvalidState(str(exc)) from exc
            self._append_event(
                con, transaction_id=transaction_id, command_id=str(row["command_id"]),
                event_type=event_type, subject=str(row["candidate_subject_id"] or row["base_subject_id"]),
                payload={"from": str(row["old_state"]), "to": new_state,
                         "transaction_id": transaction_id},
            )

    def set_execution_state(self, transaction_id: str, state: str) -> None:
        self._update_state("execution_state", transaction_id, state, "controller.execution.state_changed")

    def set_qualification_state(self, transaction_id: str, state: str) -> None:
        self._update_state("qualification_state", transaction_id, state, "controller.qualification.state_changed")

    def set_promotion_state(self, transaction_id: str, state: str) -> None:
        self._update_state("promotion_state", transaction_id, state, "controller.promotion.state_changed")

    def bind_candidate(self, transaction_id: str, oid: str, *, object_format: str = "sha1",
                       lineage_kind: str = "CANDIDATE") -> str:
        if not valid_oid(object_format, oid):
            raise ValueError("invalid Git object id")
        with self.immediate() as con:
            tx = con.execute(
                "SELECT command_id, repository_id, base_subject_id, candidate_subject_id FROM transactions WHERE transaction_id=?",
                (transaction_id,),
            ).fetchone()
            if not tx:
                raise KeyError(transaction_id)
            existing_subject = con.execute(
                "SELECT subject_id FROM subjects WHERE repository_id=? AND object_format=? AND object_oid=?",
                (tx["repository_id"], object_format, oid),
            ).fetchone()
            if existing_subject:
                subject_id = str(existing_subject["subject_id"])
            else:
                subject_id = new_uuid7()
                con.execute(
                    "INSERT INTO subjects(subject_id,repository_id,object_format,object_oid,parent_subject_id,lineage_kind,created_by_transaction_id,created_at_ms) VALUES(?,?,?,?,?,?,?,?)",
                    (subject_id, tx["repository_id"], object_format, oid, tx["base_subject_id"],
                     lineage_kind, transaction_id, now_ms()),
                )
            if tx["candidate_subject_id"] is not None:
                if tx["candidate_subject_id"] == subject_id:
                    return subject_id
                raise InvalidState("candidate subject is already bound and immutable")
            con.execute(
                "UPDATE transactions SET candidate_subject_id=?, row_version=row_version+1, updated_at_ms=? WHERE transaction_id=?",
                (subject_id, now_ms(), transaction_id),
            )
            self._append_event(
                con, transaction_id=transaction_id, command_id=str(tx["command_id"]),
                event_type="controller.subject.candidate_bound", subject=subject_id,
                payload={"candidate_subject_id": subject_id, "object_oid": oid,
                         "object_format": object_format, "transaction_id": transaction_id},
            )
            return subject_id

    def acquire_lease(self, *, transaction_id: str, resource_key: str, worker_id: str,
                      ttl_ms: int = 60_000) -> LeaseResult:
        if ttl_ms <= 0:
            raise ValueError("ttl_ms must be positive")
        ts = now_ms()
        with self.immediate() as con:
            tx = con.execute(
                "SELECT command_id, execution_state, base_subject_id, candidate_subject_id FROM transactions WHERE transaction_id=?",
                (transaction_id,),
            ).fetchone()
            if not tx:
                raise KeyError(transaction_id)
            if tx["execution_state"] != "CLAIMABLE":
                raise InvalidState("transaction is not CLAIMABLE")
            if not con.execute("SELECT 1 FROM workers WHERE worker_id=? AND status='ONLINE'", (worker_id,)).fetchone():
                raise InvalidState("worker is not ONLINE")
            resource = con.execute(
                "SELECT last_fencing_token FROM protected_resources WHERE resource_key=?", (resource_key,)
            ).fetchone()
            if not resource:
                raise InvalidState("protected resource is not registered")
            active = con.execute(
                "SELECT lease_id,expires_at_ms FROM leases WHERE resource_key=? AND state='ACTIVE'", (resource_key,),
            ).fetchone()
            if active:
                if int(active["expires_at_ms"]) >= ts:
                    raise LeaseHeld(str(active["lease_id"]))
                con.execute(
                    "UPDATE leases SET state='EXPIRED', released_at_ms=?, release_reason='LEASE_TIMEOUT' WHERE lease_id=?",
                    (ts, active["lease_id"]),
                )
            fence = int(resource["last_fencing_token"]) + 1
            con.execute("UPDATE protected_resources SET last_fencing_token=? WHERE resource_key=?", (fence, resource_key))
            lease_id = new_uuid7()
            con.execute(
                "INSERT INTO leases(lease_id,resource_key,transaction_id,worker_id,fencing_token,state,acquired_at_ms,expires_at_ms,last_heartbeat_at_ms,released_at_ms,release_reason) "
                "VALUES(?,?,?,?,?,'ACTIVE',?,?,?,NULL,NULL)",
                (lease_id, resource_key, transaction_id, worker_id, fence, ts, ts + ttl_ms, ts),
            )
            con.execute(
                "UPDATE transactions SET execution_state='CLAIMED', row_version=row_version+1, updated_at_ms=? WHERE transaction_id=?",
                (ts, transaction_id),
            )
            self._append_event(
                con, transaction_id=transaction_id, command_id=str(tx["command_id"]),
                event_type="controller.lease.acquired", subject=str(tx["candidate_subject_id"] or tx["base_subject_id"]),
                payload={"fencing_token": fence, "lease_id": lease_id,
                         "resource_key": resource_key, "transaction_id": transaction_id, "worker_id": worker_id},
            )
            return LeaseResult(lease_id, fence)

    def renew_lease(self, lease_id: str, fencing_token: int, ttl_ms: int = 60_000) -> None:
        ts = now_ms()
        with self.immediate() as con:
            row = con.execute("SELECT expires_at_ms,state,fencing_token FROM leases WHERE lease_id=?", (lease_id,)).fetchone()
            if not row or row["state"] != "ACTIVE" or int(row["fencing_token"]) != fencing_token:
                raise InvalidState("lease is not active/current")
            new_expiry = max(int(row["expires_at_ms"]), ts + ttl_ms)
            con.execute("UPDATE leases SET last_heartbeat_at_ms=?, expires_at_ms=? WHERE lease_id=?", (ts, new_expiry, lease_id))

    def release_lease(self, lease_id: str, fencing_token: int, reason: str = "COMPLETED") -> None:
        ts = now_ms()
        with self.immediate() as con:
            row = con.execute("SELECT state,fencing_token FROM leases WHERE lease_id=?", (lease_id,)).fetchone()
            if not row or row["state"] != "ACTIVE" or int(row["fencing_token"]) != fencing_token:
                raise InvalidState("lease is not active/current")
            con.execute(
                "UPDATE leases SET state='RELEASED', released_at_ms=?, release_reason=? WHERE lease_id=?",
                (ts, reason, lease_id),
            )

    def get_transaction(self, transaction_id: str) -> sqlite3.Row:
        con = self.connect()
        try:
            row = con.execute("SELECT * FROM transactions WHERE transaction_id=?", (transaction_id,)).fetchone()
            if not row:
                raise KeyError(transaction_id)
            return row
        finally:
            con.close()

    def counts(self) -> dict[str, int]:
        con = self.connect()
        try:
            return {
                "commands": con.execute("SELECT count(*) FROM commands").fetchone()[0],
                "transactions": con.execute("SELECT count(*) FROM transactions").fetchone()[0],
                "events": con.execute("SELECT count(*) FROM controller_events").fetchone()[0],
                "pending_outbox": con.execute("SELECT count(*) FROM outbox_deliveries WHERE state='PENDING'").fetchone()[0],
            }
        finally:
            con.close()
