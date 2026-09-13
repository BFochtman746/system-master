#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

SPEC_SCHEMA = "CALENDAR-ACTION-SPEC-1.0"
PLAN_SCHEMA = "CALENDAR-ACTION-PLAN-1.0"
CONTRACT_ID = "CALENDAR-FOUNDATION-1.0"
CAPABILITY_ID = "C03"
OWNER = "SYSTEM_MASTER/CONNECTED_ACTIONS"
PLAN_NAME = "calendar-action-plan.json"
ACTION_TYPES = {"CREATE_EVENT", "UPDATE_EVENT", "DELETE_EVENT"}
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,63}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_TEXT = 4096


class CalendarActionPlanError(RuntimeError):
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
            raise CalendarActionPlanError(f"{label} may not traverse symlinks")


def _read_json(path: Path, label: str) -> dict[str, object]:
    if not path.exists() or not path.is_file() or path.is_symlink():
        raise CalendarActionPlanError(f"{label} must be an existing regular non-symlink file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CalendarActionPlanError(f"invalid {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise CalendarActionPlanError(f"{label} must contain a JSON object")
    return value


def _text(value: object, field: str, *, pattern: re.Pattern[str] | None = None, max_len: int = MAX_TEXT) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CalendarActionPlanError(f"{field} must be a non-empty string")
    result = value.strip()
    if len(result) > max_len:
        raise CalendarActionPlanError(f"{field} exceeds maximum length {max_len}")
    if any(ord(ch) < 32 and ch not in "\n\t" for ch in result):
        raise CalendarActionPlanError(f"{field} contains control characters")
    if pattern and not pattern.fullmatch(result):
        raise CalendarActionPlanError(f"{field} has invalid format")
    return result


def _optional_text(value: object, field: str, *, max_len: int = MAX_TEXT) -> str | None:
    if value is None:
        return None
    return _text(value, field, max_len=max_len)


def _timestamp(value: object, field: str) -> str:
    text = _text(value, field, max_len=64)
    if text.endswith("Z"):
        parse_value = text[:-1] + "+00:00"
    else:
        parse_value = text
    try:
        parsed = datetime.fromisoformat(parse_value)
    except ValueError as exc:
        raise CalendarActionPlanError(f"{field} must be an RFC3339/ISO-8601 timestamp with UTC offset") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise CalendarActionPlanError(f"{field} must include a UTC offset or Z")
    return text


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)


def _event_payload(value: object, field: str, *, partial: bool) -> dict[str, object]:
    if not isinstance(value, dict):
        raise CalendarActionPlanError(f"{field} must be an object")
    allowed = {"title", "start", "end", "location", "notes"}
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise CalendarActionPlanError(f"{field} has unknown fields: {', '.join(unknown)}")
    if not partial and not {"title", "start", "end"}.issubset(value):
        raise CalendarActionPlanError(f"{field} requires title, start, and end")
    if partial and not value:
        raise CalendarActionPlanError(f"{field} must contain at least one change")
    event: dict[str, object] = {}
    if "title" in value:
        event["title"] = _text(value.get("title"), f"{field}.title", max_len=512)
    has_start = "start" in value
    has_end = "end" in value
    if partial and has_start != has_end:
        raise CalendarActionPlanError(f"{field} must provide start and end together when changing time")
    if has_start:
        start = _timestamp(value.get("start"), f"{field}.start")
        end = _timestamp(value.get("end"), f"{field}.end")
        if _parse_timestamp(end) <= _parse_timestamp(start):
            raise CalendarActionPlanError(f"{field}.end must be after {field}.start")
        event["start"] = start
        event["end"] = end
    for key, max_len in (("location", 1024), ("notes", MAX_TEXT)):
        if key in value:
            item = _optional_text(value.get(key), f"{field}.{key}", max_len=max_len)
            if item is not None:
                event[key] = item
    return event


def _authority_binding(root: Path) -> dict[str, object]:
    authority_path = root / "governance/CURRENT-AUTHORITY.json"
    authority = _read_json(authority_path, "CURRENT-AUTHORITY.json")
    crosswalk_rel = authority.get("capability_crosswalk")
    if not isinstance(crosswalk_rel, str) or not crosswalk_rel:
        raise CalendarActionPlanError("current authority does not name capability_crosswalk")
    crosswalk_path = root / crosswalk_rel
    crosswalk = _read_json(crosswalk_path, "capability crosswalk")
    entries = crosswalk.get("capability_entries")
    if not isinstance(entries, list):
        raise CalendarActionPlanError("capability crosswalk has no capability_entries array")
    c03 = next((entry for entry in entries if isinstance(entry, dict) and entry.get("capability_id") == CAPABILITY_ID), None)
    if not isinstance(c03, dict) or c03.get("owner_path") != OWNER or not str(c03.get("disposition", "")).startswith("OWNED"):
        raise CalendarActionPlanError("current crosswalk does not bind C03 to SYSTEM_MASTER/CONNECTED_ACTIONS")
    return {
        "authority_id": authority.get("authority_id"),
        "authority_path": "governance/CURRENT-AUTHORITY.json",
        "authority_sha256": _sha(authority_path.read_bytes()),
        "crosswalk_id": crosswalk.get("crosswalk_id"),
        "crosswalk_path": crosswalk_rel,
        "crosswalk_sha256": _sha(crosswalk_path.read_bytes()),
        "owner_path": c03.get("owner_path"),
    }


def _normalize_action(item: object, index: int) -> dict[str, object]:
    if not isinstance(item, dict):
        raise CalendarActionPlanError(f"action {index} must be an object")
    action_type = _text(item.get("type"), f"action {index} type", max_len=32)
    if action_type not in ACTION_TYPES:
        raise CalendarActionPlanError(f"action {index} type is not admitted")
    action_id = _text(item.get("id"), f"action {index} id", pattern=ID_RE, max_len=64)
    common = {"id", "type"}
    action: dict[str, object] = {
        "sequence": index,
        "id": action_id,
        "type": action_type,
        "effect_class": "EXTERNAL_CALENDAR_WRITE_INTENT",
        "execution_permitted_by_foundation": False,
        "authority_requirement": "SEPARATE_CALENDAR_RUNTIME_AND_USER_AUTHORITY_REQUIRED",
    }
    if action_type == "CREATE_EVENT":
        allowed = common | {"event"}
        unknown = sorted(set(item) - allowed)
        if unknown:
            raise CalendarActionPlanError(f"action {action_id} has unknown fields: {', '.join(unknown)}")
        action["event"] = _event_payload(item.get("event"), f"action {action_id}.event", partial=False)
    elif action_type == "UPDATE_EVENT":
        allowed = common | {"event_id", "changes"}
        unknown = sorted(set(item) - allowed)
        if unknown:
            raise CalendarActionPlanError(f"action {action_id} has unknown fields: {', '.join(unknown)}")
        action["event_id"] = _text(item.get("event_id"), f"action {action_id}.event_id", pattern=ID_RE, max_len=64)
        action["changes"] = _event_payload(item.get("changes"), f"action {action_id}.changes", partial=True)
    else:
        allowed = common | {"event_id", "reason"}
        unknown = sorted(set(item) - allowed)
        if unknown:
            raise CalendarActionPlanError(f"action {action_id} has unknown fields: {', '.join(unknown)}")
        action["event_id"] = _text(item.get("event_id"), f"action {action_id}.event_id", pattern=ID_RE, max_len=64)
        reason = _optional_text(item.get("reason"), f"action {action_id}.reason", max_len=1024)
        if reason is not None:
            action["reason"] = reason
    return action


def _normalize_spec(raw: dict[str, object]) -> dict[str, object]:
    allowed = {"schema_version", "intent_id", "name", "calendar_ref", "actions"}
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise CalendarActionPlanError("unknown calendar intent fields: " + ", ".join(unknown))
    if raw.get("schema_version") != SPEC_SCHEMA:
        raise CalendarActionPlanError(f"schema_version must be {SPEC_SCHEMA}")
    intent_id = _text(raw.get("intent_id"), "intent_id", pattern=ID_RE, max_len=64)
    name = _text(raw.get("name"), "name", max_len=512)
    calendar_ref = _text(raw.get("calendar_ref"), "calendar_ref", pattern=ID_RE, max_len=64)
    actions_raw = raw.get("actions")
    if not isinstance(actions_raw, list) or not actions_raw or len(actions_raw) > 32:
        raise CalendarActionPlanError("actions must contain 1-32 entries")
    actions: list[dict[str, object]] = []
    seen: set[str] = set()
    for index, item in enumerate(actions_raw, start=1):
        action = _normalize_action(item, index)
        action_id = str(action["id"])
        if action_id in seen:
            raise CalendarActionPlanError(f"duplicate action id: {action_id}")
        seen.add(action_id)
        actions.append(action)
    return {
        "schema_version": SPEC_SCHEMA,
        "intent_id": intent_id,
        "name": name,
        "calendar_ref": calendar_ref,
        "actions": actions,
    }


def _boundary() -> dict[str, object]:
    return {
        "calendar_execution_authority": "NOT_GRANTED",
        "provider_api_access": False,
        "network_access": False,
        "credentials_authority": "NOT_GRANTED",
        "account_authority": "NOT_GRANTED",
        "calendar_write_authority": "NOT_GRANTED",
        "invitation_send_authority": "NOT_GRANTED",
        "notification_authority": "NOT_GRANTED",
        "external_side_effects": False,
    }


def _body(spec: dict[str, object], binding: dict[str, object]) -> dict[str, object]:
    return {
        "schema_version": PLAN_SCHEMA,
        "contract_id": CONTRACT_ID,
        "capability_id": CAPABILITY_ID,
        "owner": OWNER,
        "intent_id": spec["intent_id"],
        "name": spec["name"],
        "calendar_ref": spec["calendar_ref"],
        "source_sha256": _sha(_canonical(spec)),
        "authority_binding": binding,
        "actions": spec["actions"],
        "authority_boundary": _boundary(),
    }


def build(spec_file: str | os.PathLike[str], output_dir: str | os.PathLike[str], repo_root: str | os.PathLike[str] | None = None) -> dict[str, object]:
    spec_path = Path(spec_file)
    _assert_no_symlink_components(spec_path, "calendar intent spec")
    raw_output = Path(output_dir)
    _assert_no_symlink_components(raw_output.parent, "output path")
    output = raw_output.absolute()
    if output.exists():
        raise CalendarActionPlanError("output path already exists; refusing destructive replacement")
    root = Path(repo_root).resolve() if repo_root else _repo_root()
    binding = _authority_binding(root)
    spec = _normalize_spec(_read_json(spec_path, "calendar intent spec"))
    body = _body(spec, binding)
    plan = dict(body)
    plan["plan_sha256"] = _sha(_canonical(body))
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.c03-", dir=output.parent))
    try:
        (staging / PLAN_NAME).write_bytes(_pretty(plan))
        os.replace(staging, output)
        staging = None
        return plan
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def _validate_plan_action(action: object, index: int) -> None:
    if not isinstance(action, dict):
        raise CalendarActionPlanError("plan action must be an object")
    action_id = _text(action.get("id"), f"plan action {index} id", pattern=ID_RE, max_len=64)
    if action.get("sequence") != index:
        raise CalendarActionPlanError("plan action sequence is invalid")
    action_type = action.get("type")
    common = {"sequence", "id", "type", "effect_class", "execution_permitted_by_foundation", "authority_requirement"}
    if action_type == "CREATE_EVENT":
        expected = common | {"event"}
        _event_payload(action.get("event"), f"plan action {action_id}.event", partial=False)
    elif action_type == "UPDATE_EVENT":
        expected = common | {"event_id", "changes"}
        _text(action.get("event_id"), f"plan action {action_id}.event_id", pattern=ID_RE, max_len=64)
        _event_payload(action.get("changes"), f"plan action {action_id}.changes", partial=True)
    elif action_type == "DELETE_EVENT":
        expected = common | {"event_id"}
        if "reason" in action:
            expected.add("reason")
            _text(action.get("reason"), f"plan action {action_id}.reason", max_len=1024)
        _text(action.get("event_id"), f"plan action {action_id}.event_id", pattern=ID_RE, max_len=64)
    else:
        raise CalendarActionPlanError("plan action type is invalid")
    if set(action) != expected:
        raise CalendarActionPlanError("plan action fields do not match Foundation 1.0 schema")
    if action.get("effect_class") != "EXTERNAL_CALENDAR_WRITE_INTENT":
        raise CalendarActionPlanError("plan action effect class is invalid")
    if action.get("execution_permitted_by_foundation") is not False:
        raise CalendarActionPlanError("plan action execution authority is invalid")
    if action.get("authority_requirement") != "SEPARATE_CALENDAR_RUNTIME_AND_USER_AUTHORITY_REQUIRED":
        raise CalendarActionPlanError("plan action authority requirement is invalid")


def verify(output_dir: str | os.PathLike[str], repo_root: str | os.PathLike[str] | None = None) -> dict[str, object]:
    output = Path(output_dir)
    _assert_no_symlink_components(output, "output directory")
    if not output.exists() or not output.is_dir() or output.is_symlink():
        raise CalendarActionPlanError("output directory must be an existing non-symlink directory")
    plan = _read_json(output / PLAN_NAME, PLAN_NAME)
    digest = plan.get("plan_sha256")
    body = dict(plan)
    body.pop("plan_sha256", None)
    if not isinstance(digest, str) or not SHA_RE.fullmatch(digest) or _sha(_canonical(body)) != digest:
        raise CalendarActionPlanError("plan_sha256 does not match plan body")
    expected_top = {"schema_version", "contract_id", "capability_id", "owner", "intent_id", "name", "calendar_ref", "source_sha256", "authority_binding", "actions", "authority_boundary", "plan_sha256"}
    if set(plan) != expected_top:
        raise CalendarActionPlanError("plan fields do not match Foundation 1.0 schema")
    for key, expected in {"schema_version": PLAN_SCHEMA, "contract_id": CONTRACT_ID, "capability_id": CAPABILITY_ID, "owner": OWNER}.items():
        if plan.get(key) != expected:
            raise CalendarActionPlanError(f"plan {key} mismatch")
    _text(plan.get("intent_id"), "plan intent_id", pattern=ID_RE, max_len=64)
    _text(plan.get("name"), "plan name", max_len=512)
    _text(plan.get("calendar_ref"), "plan calendar_ref", pattern=ID_RE, max_len=64)
    if not isinstance(plan.get("source_sha256"), str) or not SHA_RE.fullmatch(str(plan["source_sha256"])):
        raise CalendarActionPlanError("plan source_sha256 is invalid")
    binding = _authority_binding(Path(repo_root).resolve() if repo_root else _repo_root())
    if plan.get("authority_binding") != binding:
        raise CalendarActionPlanError("calendar action plan authority binding is stale or invalid")
    actions = plan.get("actions")
    if not isinstance(actions, list) or not actions or len(actions) > 32:
        raise CalendarActionPlanError("plan actions must contain 1-32 entries")
    seen: set[str] = set()
    for index, action in enumerate(actions, start=1):
        _validate_plan_action(action, index)
        action_id = str(action["id"])
        if action_id in seen:
            raise CalendarActionPlanError("duplicate plan action id")
        seen.add(action_id)
    if plan.get("authority_boundary") != _boundary():
        raise CalendarActionPlanError("plan authority boundary mismatch")
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="C03 deterministic calendar-action intent compiler/verifier")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("spec")
    build_parser.add_argument("output")
    verify_parser = sub.add_parser("verify")
    verify_parser.add_argument("output")
    args = parser.parse_args()
    try:
        result = build(args.spec, args.output) if args.command == "build" else verify(args.output)
    except CalendarActionPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    print(json.dumps({"status": "PASS", "contract_id": CONTRACT_ID, "intent_id": result["intent_id"], "plan_sha256": result["plan_sha256"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
