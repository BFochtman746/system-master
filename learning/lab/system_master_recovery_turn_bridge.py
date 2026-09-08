from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.repository import Repository
from learning_lab.unified_fresh_evidence_recovery import (
    prepare_learning_turn_with_fresh_evidence_recovery,
)


RECOVERY_TURN_BRIDGE_VERSION = "SYSTEM-MASTER-RECOVERY-TURN-BRIDGE-V1"
OPERATION = "PREPARE_LEARNING_TURN_WITH_FRESH_EVIDENCE_RECOVERY"
_ALLOWED_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_FORBIDDEN_PROVIDER_FIELDS = frozenset({
    "endpoint", "model_endpoint", "research_endpoint", "provider_id", "model_id",
    "sample_count", "credential", "api_key", "token", "bearer_token",
    "kind", "skill_id", "criterion_id", "oracle_spec",
})


def _fail(code: str) -> None:
    raise ValueError(code)


def _required_text(value: Any, name: str, pattern: re.Pattern[str]) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("REQUIRED:" + name)
    value = value.strip()
    if not pattern.fullmatch(value):
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
    present = sorted(_FORBIDDEN_PROVIDER_FIELDS.intersection(request.keys()))
    if present:
        _fail("FRESH_RECOVERY_RUNTIME_OVERRIDE_FORBIDDEN:" + ",".join(present))

    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID)
    recovery_id = _required_text(request.get("recovery_id"), "recovery_id", _ALLOWED_ID)
    turn_id = _required_text(request.get("turn_id"), "turn_id", _ALLOWED_ID)
    journey_id = _required_text(request.get("journey_id"), "journey_id", _ALLOWED_ID)
    session_id = _required_text(request.get("session_id"), "session_id", _ALLOWED_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_ID)
    course_id = _required_text(request.get("course_id"), "course_id", _ALLOWED_ID)
    now = request.get("now")
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        _fail("INVALID:now")

    repo = Repository(str(_state_path(state_key)))
    result = prepare_learning_turn_with_fresh_evidence_recovery(
        repo=repo,
        operation_id=operation_id,
        recovery_id=recovery_id,
        turn_id=turn_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=now,
    )
    return {
        "recovery_turn_bridge_version": RECOVERY_TURN_BRIDGE_VERSION,
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
        sys.stdout.write(json.dumps({
            "status": "ERROR",
            "recovery_turn_bridge_version": RECOVERY_TURN_BRIDGE_VERSION,
            "error": str(exc),
        }, sort_keys=True, separators=(",", ":")) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
