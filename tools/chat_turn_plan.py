#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

SPEC_SCHEMA = "CHAT-TURN-SPEC-1.0"
PLAN_SCHEMA = "CHAT-TURN-PLAN-1.0"
CONTRACT_ID = "CHAT-FOUNDATION-1.0"
CAPABILITY_ID = "C04"
OWNER = "SYSTEM_MASTER/CORE"
PLAN_NAME = "chat-turn-plan.json"
ROLES = {"system", "user", "assistant"}
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,63}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_MESSAGES = 64
MAX_CONTENT = 16384
MAX_TOTAL_CONTENT = 131072


class ChatTurnPlanError(RuntimeError):
    pass


def _canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def _pretty(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _assert_no_symlink_components(path: Path, label: str) -> None:
    absolute = path.absolute()
    parts = absolute.parts
    current = Path(parts[0])
    for part in parts[1:]:
        current = current / part
        if current.is_symlink():
            raise ChatTurnPlanError(f"{label} may not traverse symlinks")


def _read_json(path: Path, label: str) -> dict[str, object]:
    if not path.exists() or not path.is_file() or path.is_symlink():
        raise ChatTurnPlanError(f"{label} must be an existing regular non-symlink file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ChatTurnPlanError(f"invalid {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise ChatTurnPlanError(f"{label} must contain a JSON object")
    return value


def _identifier(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise ChatTurnPlanError(f"{field} must be a string")
    result = value.strip()
    if not ID_RE.fullmatch(result):
        raise ChatTurnPlanError(f"{field} has invalid format")
    return result


def _content(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ChatTurnPlanError(f"{field} must be a non-empty string")
    if len(value) > MAX_CONTENT:
        raise ChatTurnPlanError(f"{field} exceeds maximum length {MAX_CONTENT}")
    if any(ord(ch) < 32 and ch not in "\n\t" for ch in value):
        raise ChatTurnPlanError(f"{field} contains control characters")
    return value


def _authority_binding(root: Path) -> dict[str, object]:
    authority_path = root / "governance/CURRENT-AUTHORITY.json"
    authority = _read_json(authority_path, "CURRENT-AUTHORITY.json")
    crosswalk_rel = authority.get("capability_crosswalk")
    if not isinstance(crosswalk_rel, str) or not crosswalk_rel:
        raise ChatTurnPlanError("current authority does not name capability_crosswalk")
    crosswalk_path = root / crosswalk_rel
    crosswalk = _read_json(crosswalk_path, "capability crosswalk")
    entries = crosswalk.get("capability_entries")
    if not isinstance(entries, list):
        raise ChatTurnPlanError("capability crosswalk has no capability_entries array")
    c04 = next((entry for entry in entries if isinstance(entry, dict) and entry.get("capability_id") == CAPABILITY_ID), None)
    if not isinstance(c04, dict) or c04.get("owner_path") != OWNER or not str(c04.get("disposition", "")).startswith("OWNED"):
        raise ChatTurnPlanError("current crosswalk does not bind C04 to SYSTEM_MASTER/CORE")
    return {
        "authority_id": authority.get("authority_id"),
        "authority_path": "governance/CURRENT-AUTHORITY.json",
        "authority_sha256": _sha(authority_path.read_bytes()),
        "crosswalk_id": crosswalk.get("crosswalk_id"),
        "crosswalk_path": crosswalk_rel,
        "crosswalk_sha256": _sha(crosswalk_path.read_bytes()),
        "owner_path": c04.get("owner_path"),
    }


def _normalize_message(item: object, index: int) -> dict[str, object]:
    if not isinstance(item, dict):
        raise ChatTurnPlanError(f"message {index} must be an object")
    if set(item) != {"id", "role", "content"}:
        raise ChatTurnPlanError(f"message {index} fields must be exactly id, role, content")
    message_id = _identifier(item.get("id"), f"message {index} id")
    role = item.get("role")
    if role not in ROLES:
        raise ChatTurnPlanError(f"message {message_id} role is not admitted")
    content = _content(item.get("content"), f"message {message_id} content")
    return {"sequence": index, "id": message_id, "role": role, "content": content}


def _normalize_spec(raw: dict[str, object]) -> dict[str, object]:
    allowed = {"schema_version", "turn_id", "conversation_ref", "messages"}
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise ChatTurnPlanError("unknown chat-turn fields: " + ", ".join(unknown))
    if raw.get("schema_version") != SPEC_SCHEMA:
        raise ChatTurnPlanError(f"schema_version must be {SPEC_SCHEMA}")
    turn_id = _identifier(raw.get("turn_id"), "turn_id")
    conversation_ref = _identifier(raw.get("conversation_ref"), "conversation_ref")
    messages_raw = raw.get("messages")
    if not isinstance(messages_raw, list) or not messages_raw or len(messages_raw) > MAX_MESSAGES:
        raise ChatTurnPlanError(f"messages must contain 1-{MAX_MESSAGES} entries")
    messages: list[dict[str, object]] = []
    seen: set[str] = set()
    total_content = 0
    for index, item in enumerate(messages_raw, start=1):
        message = _normalize_message(item, index)
        message_id = str(message["id"])
        if message_id in seen:
            raise ChatTurnPlanError(f"duplicate message id: {message_id}")
        seen.add(message_id)
        total_content += len(str(message["content"]))
        messages.append(message)
    if total_content > MAX_TOTAL_CONTENT:
        raise ChatTurnPlanError(f"total message content exceeds maximum length {MAX_TOTAL_CONTENT}")
    if not any(message["role"] == "user" for message in messages):
        raise ChatTurnPlanError("chat turn requires at least one user message")
    if messages[-1]["role"] != "user":
        raise ChatTurnPlanError("final message must be the current user request")
    return {
        "schema_version": SPEC_SCHEMA,
        "turn_id": turn_id,
        "conversation_ref": conversation_ref,
        "messages": messages,
    }


def _boundary() -> dict[str, object]:
    return {
        "model_execution_authority": "NOT_GRANTED",
        "provider_api_access": False,
        "network_access": False,
        "credentials_authority": "NOT_GRANTED",
        "tool_execution_authority": "NOT_GRANTED",
        "connector_execution_authority": "NOT_GRANTED",
        "memory_write_authority": "NOT_GRANTED",
        "conversation_persistence_authority": "NOT_GRANTED",
        "autonomous_send_authority": "NOT_GRANTED",
        "external_side_effects": False,
    }


def _body(spec: dict[str, object], binding: dict[str, object]) -> dict[str, object]:
    return {
        "schema_version": PLAN_SCHEMA,
        "contract_id": CONTRACT_ID,
        "capability_id": CAPABILITY_ID,
        "owner": OWNER,
        "turn_id": spec["turn_id"],
        "conversation_ref": spec["conversation_ref"],
        "source_sha256": _sha(_canonical(spec)),
        "authority_binding": binding,
        "messages": spec["messages"],
        "authority_boundary": _boundary(),
    }


def build(spec_file: str | os.PathLike[str], output_dir: str | os.PathLike[str], repo_root: str | os.PathLike[str] | None = None) -> dict[str, object]:
    spec_path = Path(spec_file)
    _assert_no_symlink_components(spec_path, "chat turn spec")
    raw_output = Path(output_dir)
    _assert_no_symlink_components(raw_output.parent, "output path")
    output = raw_output.absolute()
    if output.exists():
        raise ChatTurnPlanError("output path already exists; refusing destructive replacement")
    root = Path(repo_root).resolve() if repo_root else _repo_root()
    binding = _authority_binding(root)
    spec = _normalize_spec(_read_json(spec_path, "chat turn spec"))
    body = _body(spec, binding)
    plan = dict(body)
    plan["plan_sha256"] = _sha(_canonical(body))
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.c04-", dir=output.parent))
    try:
        (staging / PLAN_NAME).write_bytes(_pretty(plan))
        os.replace(staging, output)
        staging = None
        return plan
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def _validate_plan_message(message: object, index: int) -> None:
    if not isinstance(message, dict) or set(message) != {"sequence", "id", "role", "content"}:
        raise ChatTurnPlanError("plan message fields do not match Foundation 1.0 schema")
    if message.get("sequence") != index:
        raise ChatTurnPlanError("plan message sequence is invalid")
    _identifier(message.get("id"), f"plan message {index} id")
    if message.get("role") not in ROLES:
        raise ChatTurnPlanError("plan message role is invalid")
    _content(message.get("content"), f"plan message {index} content")


def verify(output_dir: str | os.PathLike[str], repo_root: str | os.PathLike[str] | None = None) -> dict[str, object]:
    output = Path(output_dir)
    _assert_no_symlink_components(output, "output directory")
    if not output.exists() or not output.is_dir() or output.is_symlink():
        raise ChatTurnPlanError("output directory must be an existing non-symlink directory")
    plan = _read_json(output / PLAN_NAME, PLAN_NAME)
    digest = plan.get("plan_sha256")
    body = dict(plan)
    body.pop("plan_sha256", None)
    if not isinstance(digest, str) or not SHA_RE.fullmatch(digest) or _sha(_canonical(body)) != digest:
        raise ChatTurnPlanError("plan_sha256 does not match plan body")
    expected_top = {"schema_version", "contract_id", "capability_id", "owner", "turn_id", "conversation_ref", "source_sha256", "authority_binding", "messages", "authority_boundary", "plan_sha256"}
    if set(plan) != expected_top:
        raise ChatTurnPlanError("plan fields do not match Foundation 1.0 schema")
    for key, expected in {"schema_version": PLAN_SCHEMA, "contract_id": CONTRACT_ID, "capability_id": CAPABILITY_ID, "owner": OWNER}.items():
        if plan.get(key) != expected:
            raise ChatTurnPlanError(f"plan {key} mismatch")
    _identifier(plan.get("turn_id"), "plan turn_id")
    _identifier(plan.get("conversation_ref"), "plan conversation_ref")
    if not isinstance(plan.get("source_sha256"), str) or not SHA_RE.fullmatch(str(plan["source_sha256"])):
        raise ChatTurnPlanError("plan source_sha256 is invalid")
    binding = _authority_binding(Path(repo_root).resolve() if repo_root else _repo_root())
    if plan.get("authority_binding") != binding:
        raise ChatTurnPlanError("chat turn plan authority binding is stale or invalid")
    messages = plan.get("messages")
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        raise ChatTurnPlanError(f"plan messages must contain 1-{MAX_MESSAGES} entries")
    seen: set[str] = set()
    total_content = 0
    for index, message in enumerate(messages, start=1):
        _validate_plan_message(message, index)
        message_id = str(message["id"])
        if message_id in seen:
            raise ChatTurnPlanError("duplicate plan message id")
        seen.add(message_id)
        total_content += len(str(message["content"]))
    if total_content > MAX_TOTAL_CONTENT:
        raise ChatTurnPlanError("plan total message content exceeds limit")
    if not any(message["role"] == "user" for message in messages) or messages[-1]["role"] != "user":
        raise ChatTurnPlanError("plan must end with the current user request")
    if plan.get("authority_boundary") != _boundary():
        raise ChatTurnPlanError("plan authority boundary mismatch")
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="C04 deterministic local chat-turn compiler/verifier")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("spec")
    build_parser.add_argument("output")
    verify_parser = sub.add_parser("verify")
    verify_parser.add_argument("output")
    args = parser.parse_args()
    try:
        result = build(args.spec, args.output) if args.command == "build" else verify(args.output)
    except ChatTurnPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    print(json.dumps({"status": "PASS", "contract_id": CONTRACT_ID, "turn_id": result["turn_id"], "plan_sha256": result["plan_sha256"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
