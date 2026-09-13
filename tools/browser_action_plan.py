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
from urllib.parse import urlsplit

SPEC_SCHEMA = "BROWSER-ACTION-SPEC-1.0"
PLAN_SCHEMA = "BROWSER-ACTION-PLAN-1.0"
CONTRACT_ID = "BROWSER-FOUNDATION-1.0"
CAPABILITY_ID = "C02"
OWNER = "SYSTEM_MASTER/CONNECTED_ACTIONS"
PLAN_NAME = "browser-action-plan.json"
ACTION_TYPES = {"NAVIGATE", "EXTRACT_TEXT", "CLICK"}
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,63}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class BrowserActionPlanError(RuntimeError):
    pass


def _canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def _pretty(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _read_json(path: Path, label: str) -> dict[str, object]:
    if not path.exists() or not path.is_file() or path.is_symlink():
        raise BrowserActionPlanError(f"{label} must be an existing regular non-symlink file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BrowserActionPlanError(f"invalid {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise BrowserActionPlanError(f"{label} must contain a JSON object")
    return value


def _text(value: object, field: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BrowserActionPlanError(f"{field} must be a non-empty string")
    result = value.strip()
    if pattern and not pattern.fullmatch(result):
        raise BrowserActionPlanError(f"{field} has invalid format")
    return result


def _validate_url(value: object) -> str:
    url = _text(value, "target_url")
    if any(ord(ch) < 32 or ch.isspace() for ch in url):
        raise BrowserActionPlanError("target_url may not contain whitespace or control characters")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise BrowserActionPlanError(f"target_url is invalid: {exc}") from exc
    if parsed.scheme != "https" or not parsed.netloc or not parsed.hostname:
        raise BrowserActionPlanError("target_url must be an absolute https URL")
    if parsed.username is not None or parsed.password is not None:
        raise BrowserActionPlanError("target_url may not contain embedded credentials")
    if port not in (None, 443):
        raise BrowserActionPlanError("target_url may not use a non-default port")
    if parsed.hostname in {"localhost", "localhost.localdomain"} or parsed.hostname.endswith(".localhost"):
        raise BrowserActionPlanError("target_url may not target localhost")
    return url


def _authority_binding(root: Path) -> dict[str, object]:
    authority_path = root / "governance/CURRENT-AUTHORITY.json"
    authority = _read_json(authority_path, "CURRENT-AUTHORITY.json")
    crosswalk_rel = authority.get("capability_crosswalk")
    if not isinstance(crosswalk_rel, str) or not crosswalk_rel:
        raise BrowserActionPlanError("current authority does not name capability_crosswalk")
    crosswalk_path = root / crosswalk_rel
    crosswalk = _read_json(crosswalk_path, "capability crosswalk")
    entries = crosswalk.get("capability_entries")
    if not isinstance(entries, list):
        raise BrowserActionPlanError("capability crosswalk has no capability_entries array")
    c02 = next((entry for entry in entries if isinstance(entry, dict) and entry.get("capability_id") == CAPABILITY_ID), None)
    if not isinstance(c02, dict) or c02.get("owner_path") != OWNER or not str(c02.get("disposition", "")).startswith("OWNED"):
        raise BrowserActionPlanError("current crosswalk does not bind C02 to SYSTEM_MASTER/CONNECTED_ACTIONS")
    return {
        "authority_id": authority.get("authority_id"),
        "authority_path": "governance/CURRENT-AUTHORITY.json",
        "authority_sha256": _sha(authority_path.read_bytes()),
        "crosswalk_id": crosswalk.get("crosswalk_id"),
        "crosswalk_path": crosswalk_rel,
        "crosswalk_sha256": _sha(crosswalk_path.read_bytes()),
        "owner_path": c02.get("owner_path"),
    }


def _normalize_spec(raw: dict[str, object]) -> dict[str, object]:
    allowed = {"schema_version", "intent_id", "name", "target_url", "actions"}
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise BrowserActionPlanError("unknown browser intent fields: " + ", ".join(unknown))
    if raw.get("schema_version") != SPEC_SCHEMA:
        raise BrowserActionPlanError(f"schema_version must be {SPEC_SCHEMA}")
    intent_id = _text(raw.get("intent_id"), "intent_id", ID_RE)
    name = _text(raw.get("name"), "name")
    target_url = _validate_url(raw.get("target_url"))
    actions_raw = raw.get("actions")
    if not isinstance(actions_raw, list) or not actions_raw or len(actions_raw) > 64:
        raise BrowserActionPlanError("actions must contain 1-64 entries")
    actions: list[dict[str, object]] = []
    seen: set[str] = set()
    for index, item in enumerate(actions_raw, start=1):
        if not isinstance(item, dict):
            raise BrowserActionPlanError(f"action {index} must be an object")
        unknown_action = sorted(set(item) - {"id", "type", "selector"})
        if unknown_action:
            raise BrowserActionPlanError(f"action {index} has unknown fields: {', '.join(unknown_action)}")
        action_id = _text(item.get("id"), f"action {index} id", ID_RE)
        if action_id in seen:
            raise BrowserActionPlanError(f"duplicate action id: {action_id}")
        seen.add(action_id)
        action_type = _text(item.get("type"), f"action {action_id} type")
        if action_type not in ACTION_TYPES:
            raise BrowserActionPlanError(f"action {action_id} type is not admitted")
        selector = item.get("selector")
        if action_type == "NAVIGATE":
            if selector is not None:
                raise BrowserActionPlanError(f"NAVIGATE action {action_id} may not declare selector")
            effect = "NETWORK_READ_INTENT"
            requirement = "SEPARATE_BROWSER_RUNTIME_ADMISSION_REQUIRED"
        else:
            selector = _text(selector, f"action {action_id} selector")
            if len(selector) > 512:
                raise BrowserActionPlanError(f"action {action_id} selector is too long")
            if action_type == "EXTRACT_TEXT":
                effect = "READ_ONLY_BROWSER_INTENT"
                requirement = "SEPARATE_BROWSER_RUNTIME_ADMISSION_REQUIRED"
            else:
                effect = "EXTERNAL_SIDE_EFFECT_INTENT"
                requirement = "SEPARATE_BROWSER_RUNTIME_AND_USER_AUTHORITY_REQUIRED"
        action: dict[str, object] = {
            "sequence": index,
            "id": action_id,
            "type": action_type,
            "effect_class": effect,
            "execution_permitted_by_foundation": False,
            "authority_requirement": requirement,
        }
        if selector is not None:
            action["selector"] = selector
        actions.append(action)
    return {
        "schema_version": SPEC_SCHEMA,
        "intent_id": intent_id,
        "name": name,
        "target_url": target_url,
        "actions": actions,
    }


def _body(spec: dict[str, object], binding: dict[str, object]) -> dict[str, object]:
    return {
        "schema_version": PLAN_SCHEMA,
        "contract_id": CONTRACT_ID,
        "capability_id": CAPABILITY_ID,
        "owner": OWNER,
        "intent_id": spec["intent_id"],
        "name": spec["name"],
        "target_url": spec["target_url"],
        "source_sha256": _sha(_canonical(spec)),
        "authority_binding": binding,
        "actions": spec["actions"],
        "authority_boundary": {
            "browser_execution_authority": "NOT_GRANTED",
            "network_access": False,
            "credentials_authority": "NOT_GRANTED",
            "cookies_or_session_authority": "NOT_GRANTED",
            "javascript_execution_authority": "NOT_GRANTED",
            "download_authority": "NOT_GRANTED",
            "upload_authority": "NOT_GRANTED",
            "form_submission_authority": "NOT_GRANTED",
            "external_side_effects": False,
        },
    }


def build(spec_file: str | os.PathLike[str], output_dir: str | os.PathLike[str], repo_root: str | os.PathLike[str] | None = None) -> dict[str, object]:
    spec_path = Path(spec_file)
    if spec_path.is_symlink():
        raise BrowserActionPlanError("browser intent spec may not be a symlink")
    output = Path(output_dir).resolve(strict=False)
    if output.exists():
        raise BrowserActionPlanError("output path already exists; refusing destructive replacement")
    root = Path(repo_root).resolve() if repo_root else _repo_root()
    binding = _authority_binding(root)
    spec = _normalize_spec(_read_json(spec_path, "browser intent spec"))
    body = _body(spec, binding)
    plan = dict(body)
    plan["plan_sha256"] = _sha(_canonical(body))
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.c02-", dir=output.parent))
    try:
        (staging / PLAN_NAME).write_bytes(_pretty(plan))
        os.replace(staging, output)
        staging = None
        return plan
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def verify(output_dir: str | os.PathLike[str], repo_root: str | os.PathLike[str] | None = None) -> dict[str, object]:
    output = Path(output_dir)
    if not output.exists() or not output.is_dir() or output.is_symlink():
        raise BrowserActionPlanError("output directory must be an existing non-symlink directory")
    plan = _read_json(output / PLAN_NAME, PLAN_NAME)
    digest = plan.get("plan_sha256")
    body = dict(plan)
    body.pop("plan_sha256", None)
    if not isinstance(digest, str) or not SHA_RE.fullmatch(digest) or _sha(_canonical(body)) != digest:
        raise BrowserActionPlanError("plan_sha256 does not match plan body")
    expected_top = {"schema_version", "contract_id", "capability_id", "owner", "intent_id", "name", "target_url", "source_sha256", "authority_binding", "actions", "authority_boundary", "plan_sha256"}
    if set(plan) != expected_top:
        raise BrowserActionPlanError("plan fields do not match Foundation 1.0 schema")
    for key, expected in {"schema_version": PLAN_SCHEMA, "contract_id": CONTRACT_ID, "capability_id": CAPABILITY_ID, "owner": OWNER}.items():
        if plan.get(key) != expected:
            raise BrowserActionPlanError(f"plan {key} mismatch")
    _text(plan.get("intent_id"), "plan intent_id", ID_RE)
    _text(plan.get("name"), "plan name")
    _validate_url(plan.get("target_url"))
    if not isinstance(plan.get("source_sha256"), str) or not SHA_RE.fullmatch(str(plan["source_sha256"])):
        raise BrowserActionPlanError("plan source_sha256 is invalid")
    binding = _authority_binding(Path(repo_root).resolve() if repo_root else _repo_root())
    if plan.get("authority_binding") != binding:
        raise BrowserActionPlanError("browser action plan authority binding is stale or invalid")
    actions = plan.get("actions")
    if not isinstance(actions, list) or not actions:
        raise BrowserActionPlanError("plan actions must be a non-empty array")
    seen: set[str] = set()
    for index, action in enumerate(actions, start=1):
        if not isinstance(action, dict):
            raise BrowserActionPlanError("plan action must be an object")
        action_id = _text(action.get("id"), f"plan action {index} id", ID_RE)
        if action_id in seen or action.get("sequence") != index:
            raise BrowserActionPlanError("plan action id/sequence is invalid")
        seen.add(action_id)
        action_type = action.get("type")
        if action_type == "NAVIGATE":
            expected_keys = {"sequence", "id", "type", "effect_class", "execution_permitted_by_foundation", "authority_requirement"}
            effect = "NETWORK_READ_INTENT"
            requirement = "SEPARATE_BROWSER_RUNTIME_ADMISSION_REQUIRED"
        elif action_type == "EXTRACT_TEXT":
            expected_keys = {"sequence", "id", "type", "selector", "effect_class", "execution_permitted_by_foundation", "authority_requirement"}
            _text(action.get("selector"), f"plan action {action_id} selector")
            effect = "READ_ONLY_BROWSER_INTENT"
            requirement = "SEPARATE_BROWSER_RUNTIME_ADMISSION_REQUIRED"
        elif action_type == "CLICK":
            expected_keys = {"sequence", "id", "type", "selector", "effect_class", "execution_permitted_by_foundation", "authority_requirement"}
            _text(action.get("selector"), f"plan action {action_id} selector")
            effect = "EXTERNAL_SIDE_EFFECT_INTENT"
            requirement = "SEPARATE_BROWSER_RUNTIME_AND_USER_AUTHORITY_REQUIRED"
        else:
            raise BrowserActionPlanError("plan action type is invalid")
        if set(action) != expected_keys or action.get("effect_class") != effect:
            raise BrowserActionPlanError("plan action fields/effect are invalid")
        if action.get("execution_permitted_by_foundation") is not False or action.get("authority_requirement") != requirement:
            raise BrowserActionPlanError("plan action authority requirement is invalid")
    boundary = {
        "browser_execution_authority": "NOT_GRANTED",
        "network_access": False,
        "credentials_authority": "NOT_GRANTED",
        "cookies_or_session_authority": "NOT_GRANTED",
        "javascript_execution_authority": "NOT_GRANTED",
        "download_authority": "NOT_GRANTED",
        "upload_authority": "NOT_GRANTED",
        "form_submission_authority": "NOT_GRANTED",
        "external_side_effects": False,
    }
    if plan.get("authority_boundary") != boundary:
        raise BrowserActionPlanError("plan authority boundary mismatch")
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="C02 deterministic browser-action intent compiler/verifier")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("spec")
    build_parser.add_argument("output")
    verify_parser = sub.add_parser("verify")
    verify_parser.add_argument("output")
    args = parser.parse_args()
    try:
        result = build(args.spec, args.output) if args.command == "build" else verify(args.output)
    except BrowserActionPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    print(json.dumps({"status": "PASS", "contract_id": CONTRACT_ID, "intent_id": result["intent_id"], "plan_sha256": result["plan_sha256"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
