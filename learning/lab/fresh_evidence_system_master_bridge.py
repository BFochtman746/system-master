from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.configured_fresh_evidence_provider import acquire_configured_fresh_evidence
from learning_lab.repository import Repository


BRIDGE_VERSION = "SYSTEM-MASTER-FRESH-EVIDENCE-BRIDGE-V1"
OPERATION = "ACQUIRE_CONFIGURED_FRESH_EVIDENCE"
_ALLOWED_STATE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_ALLOWED_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_KIND = frozenset({"maintenance", "transfer"})


def _fail(code: str) -> None:
    raise ValueError(code)


def _required_text(value: Any, name: str, pattern: re.Pattern[str] = _ALLOWED_ID) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("REQUIRED:" + name)
    value = value.strip()
    if not pattern.fullmatch(value):
        _fail("INVALID:" + name)
    return value


def _required_time(value: Any, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        _fail("INVALID:" + name)
    return value


def _state_path(state_key: str) -> Path:
    root = Path(os.environ.get("SYSTEM_MASTER_LEARNING_STATE_ROOT", "learning/runtime-state")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    candidate = (root / f"{state_key}.sqlite3").resolve()
    if candidate.parent != root:
        _fail("STATE_PATH_ESCAPE")
    return candidate


def _request_digest(request: Mapping[str, Any]) -> str:
    raw = json.dumps(request, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def dispatch(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("REQUEST_MUST_BE_OBJECT")
    if request.get("operation") != OPERATION:
        _fail("UNSUPPORTED_OPERATION")

    forbidden = {
        "endpoint", "model_endpoint", "provider_id", "model_id", "sample_count",
        "credential", "api_key", "token", "bearer_token", "research_endpoint",
    }
    present = sorted(forbidden.intersection(request.keys()))
    if present:
        _fail("FRESH_EVIDENCE_RUNTIME_PROVIDER_OVERRIDE_FORBIDDEN:" + ",".join(present))

    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE)
    operation_id = _required_text(request.get("operation_id"), "operation_id")
    request_id = _required_text(request.get("request_id"), "request_id")
    course_id = _required_text(request.get("course_id"), "course_id")
    kind = request.get("kind")
    if kind not in _ALLOWED_KIND:
        _fail("INVALID:kind")
    skill_id = _required_text(request.get("skill_id"), "skill_id")
    criterion_id = _required_text(request.get("criterion_id"), "criterion_id")
    requested_at = _required_time(request.get("requested_at"), "requested_at")
    admitted_at = _required_time(request.get("admitted_at"), "admitted_at")

    repo = Repository(str(_state_path(state_key)))
    result = acquire_configured_fresh_evidence(
        repo=repo,
        operation_id=operation_id,
        request_id=request_id,
        course_id=course_id,
        kind=kind,
        skill_id=skill_id,
        criterion_id=criterion_id,
        requested_at=requested_at,
        admitted_at=admitted_at,
    )
    return {
        "status": "PASS",
        "bridge_version": BRIDGE_VERSION,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        **result,
    }


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            _fail("REQUEST_REQUIRED")
        result = dispatch(json.loads(raw))
        sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
        return 0
    except Exception as exc:
        sys.stdout.write(json.dumps({"status": "ERROR", "bridge_version": BRIDGE_VERSION, "error": str(exc)}, sort_keys=True, separators=(",", ":")) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
