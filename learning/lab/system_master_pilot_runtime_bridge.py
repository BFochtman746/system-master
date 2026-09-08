from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.real_learner_pilot_runtime_binding import (
    current_runtime_binding_summary,
    capture_runtime_turn,
    mark_runtime_bound_pilot_complete,
    mark_runtime_bound_pilot_withdrawn,
    start_runtime_bound_pilot,
)
from learning_lab.repository import Repository


PILOT_RUNTIME_BRIDGE_VERSION = "SYSTEM-MASTER-PILOT-001-RUNTIME-BRIDGE-V1"
_ALLOWED_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_PARTICIPANT = re.compile(r"^[A-Z0-9][A-Z0-9_-]{5,63}$")
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_FORBIDDEN_EVIDENCE_FIELDS = frozenset({
    "response",
    "raw_response",
    "answer_text",
    "free_text",
    "learner_text",
    "score",
    "max_score",
    "passed",
    "correct",
    "response_digest",
    "item_family_id",
    "family_id",
    "novel_context",
    "assistance_used",
    "answer_revealed",
    "selected_authority",
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


def _reject_evidence_injection(request: Mapping[str, Any]) -> None:
    present = sorted(_FORBIDDEN_EVIDENCE_FIELDS.intersection(str(key) for key in request.keys()))
    if present:
        _fail("PILOT_RUNTIME_EVIDENCE_INJECTION_FORBIDDEN:" + ",".join(present))


def dispatch(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("REQUEST_MUST_BE_OBJECT")
    _reject_evidence_injection(request)
    operation = _required_text(request.get("operation"), "operation", _ALLOWED_ID)
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    repo = Repository(str(_state_path(state_key)))

    if operation == "START_REAL_LEARNER_PILOT":
        result = start_runtime_bound_pilot(
            repo=repo,
            operation_id=_required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID),
            pilot_id=_required_text(request.get("pilot_id"), "pilot_id", _ALLOWED_ID),
            participant_key=_required_text(request.get("participant_key"), "participant_key", _ALLOWED_PARTICIPANT),
            journey_id=_required_text(request.get("journey_id"), "journey_id", _ALLOWED_ID),
            session_id=_required_text(request.get("session_id"), "session_id", _ALLOWED_ID),
            learner_id=_required_text(request.get("learner_id"), "learner_id", _ALLOWED_ID),
            course_id=_required_text(request.get("course_id"), "course_id", _ALLOWED_ID),
            started_at=_required_time(request.get("started_at"), "started_at"),
            consented_at=_required_time(request.get("consented_at"), "consented_at"),
            consent_recorded=request.get("consent_recorded") is True,
        )
    elif operation == "CAPTURE_REAL_LEARNER_PILOT_TURN":
        result = capture_runtime_turn(
            repo=repo,
            operation_id=_required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID),
            pilot_id=_required_text(request.get("pilot_id"), "pilot_id", _ALLOWED_ID),
            turn_id=_required_text(request.get("turn_id"), "turn_id", _ALLOWED_ID),
        )
    elif operation == "GET_REAL_LEARNER_PILOT_SUMMARY":
        result = current_runtime_binding_summary(
            repo=repo,
            pilot_id=_required_text(request.get("pilot_id"), "pilot_id", _ALLOWED_ID),
        )
    elif operation == "COMPLETE_REAL_LEARNER_PILOT":
        result = mark_runtime_bound_pilot_complete(
            repo=repo,
            operation_id=_required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID),
            pilot_id=_required_text(request.get("pilot_id"), "pilot_id", _ALLOWED_ID),
            completed_at=_required_time(request.get("completed_at"), "completed_at"),
        )
    elif operation == "WITHDRAW_REAL_LEARNER_PILOT":
        result = mark_runtime_bound_pilot_withdrawn(
            repo=repo,
            operation_id=_required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID),
            pilot_id=_required_text(request.get("pilot_id"), "pilot_id", _ALLOWED_ID),
            withdrawn_at=_required_time(request.get("withdrawn_at"), "withdrawn_at"),
        )
    else:
        _fail("UNSUPPORTED_OPERATION")

    return {
        "pilot_runtime_bridge_version": PILOT_RUNTIME_BRIDGE_VERSION,
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
            "pilot_runtime_bridge_version": PILOT_RUNTIME_BRIDGE_VERSION,
            "error": str(exc),
        }, sort_keys=True, separators=(",", ":")) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
