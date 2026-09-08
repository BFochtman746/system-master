from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.real_learner_pilot_human_session import (
    HUMAN_RESPONSE_SOURCE,
    REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
    prepare_human_pilot_turn,
    stage_one_status,
    submit_human_pilot_turn,
)
from learning_lab.repository import Repository


HUMAN_SESSION_BRIDGE_VERSION = "SYSTEM-MASTER-REAL-LEARNER-HUMAN-SESSION-BRIDGE-V1"
_ALLOWED_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


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


def _required_bool(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        _fail("INVALID:" + name)
    return value


def _state_path(state_key: str) -> Path:
    root = Path(os.environ.get("SYSTEM_MASTER_LEARNING_STATE_ROOT", "learning/runtime-state")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    candidate = (root / f"{state_key}.sqlite3").resolve()
    if candidate.parent != root:
        _fail("STATE_PATH_ESCAPE")
    return candidate


def dispatch(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("REQUEST_MUST_BE_OBJECT")
    operation = _required_text(request.get("operation"), "operation", _ALLOWED_ID)
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    pilot_id = _required_text(request.get("pilot_id"), "pilot_id", _ALLOWED_ID)
    repo = Repository(str(_state_path(state_key)))

    if operation == "PREPARE_REAL_LEARNER_PILOT_TURN":
        result = prepare_human_pilot_turn(
            repo=repo,
            operation_id=_required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID),
            pilot_id=pilot_id,
            turn_id=_required_text(request.get("turn_id"), "turn_id", _ALLOWED_ID),
            now=_required_time(request.get("now"), "now"),
        )
    elif operation == "SUBMIT_REAL_LEARNER_PILOT_TURN":
        raw_response = request.get("response")
        if not isinstance(raw_response, str) or not raw_response:
            _fail("REQUIRED:response")
        result = submit_human_pilot_turn(
            repo=repo,
            operation_id=_required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID),
            pilot_id=pilot_id,
            turn_id=_required_text(request.get("turn_id"), "turn_id", _ALLOWED_ID),
            turn_binding_digest=_required_text(request.get("turn_binding_digest"), "turn_binding_digest", re.compile(r"^[0-9a-f]{64}$")),
            response=raw_response,
            submitted_at=_required_time(request.get("submitted_at"), "submitted_at"),
            response_source=_required_text(request.get("response_source"), "response_source", _ALLOWED_ID),
            participant_present=_required_bool(request.get("participant_present"), "participant_present"),
            response_was_actually_provided_by_participant=_required_bool(
                request.get("response_was_actually_provided_by_participant"),
                "response_was_actually_provided_by_participant",
            ),
            assistance_used=_required_bool(request.get("assistance_used"), "assistance_used"),
            answer_revealed_before_commit=_required_bool(
                request.get("answer_revealed_before_commit"),
                "answer_revealed_before_commit",
            ),
        )
        if result.get("response_echoed") is not False:
            _fail("HUMAN_SESSION_BRIDGE_RESPONSE_ECHO_FORBIDDEN")
    elif operation == "GET_REAL_LEARNER_PILOT_STAGE_ONE_STATUS":
        result = stage_one_status(repo=repo, pilot_id=pilot_id)
    else:
        _fail("UNSUPPORTED_OPERATION")

    rendered = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if operation == "SUBMIT_REAL_LEARNER_PILOT_TURN":
        raw_response = request["response"]
        if raw_response in rendered:
            _fail("HUMAN_SESSION_BRIDGE_RAW_RESPONSE_LEAK")
    return {
        "status": "PASS",
        "human_session_bridge_version": HUMAN_SESSION_BRIDGE_VERSION,
        "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
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
            "human_session_bridge_version": HUMAN_SESSION_BRIDGE_VERSION,
            "error": str(exc),
        }, sort_keys=True, separators=(",", ":")) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
