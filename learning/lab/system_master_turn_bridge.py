from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.repository import Repository
from learning_lab.unified_turn_controller import prepare_learning_turn, submit_learning_turn


TURN_BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-TURN-BRIDGE-V1"
_ALLOWED_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def _fail(code: str) -> None:
    raise ValueError(code)


def _required_text(value: Any, name: str, pattern: re.Pattern[str]) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("REQUIRED:" + name)
    value = value.strip()
    if not pattern.fullmatch(value):
        _fail("INVALID:" + name)
    return value


def _required_response(value: Any) -> str:
    if not isinstance(value, str):
        _fail("TURN_RESPONSE_MUST_BE_TEXT")
    if len(value) > 8192 or "\x00" in value:
        _fail("TURN_RESPONSE_INVALID")
    return value


def _state_path(state_key: str) -> Path:
    root = Path(os.environ.get("SYSTEM_MASTER_LEARNING_STATE_ROOT", "learning/runtime-state")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    candidate = (root / f"{state_key}.sqlite3").resolve()
    if candidate.parent != root:
        _fail("STATE_PATH_ESCAPE")
    return candidate


def _request_digest(request: Mapping[str, Any]) -> str:
    canonical = json.dumps(request, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def dispatch(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("REQUEST_MUST_BE_OBJECT")
    operation = request.get("operation")
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    repo = Repository(str(_state_path(state_key)))

    if operation == "PREPARE_LEARNING_TURN":
        operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID)
        turn_id = _required_text(request.get("turn_id"), "turn_id", _ALLOWED_ID)
        journey_id = _required_text(request.get("journey_id"), "journey_id", _ALLOWED_ID)
        session_id = _required_text(request.get("session_id"), "session_id", _ALLOWED_ID)
        learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_ID)
        course_id = _required_text(request.get("course_id"), "course_id", _ALLOWED_ID)
        now = request.get("now")
        if not isinstance(now, int) or isinstance(now, bool) or now < 0:
            _fail("INVALID:now")
        result = prepare_learning_turn(
            repo=repo,
            operation_id=operation_id,
            turn_id=turn_id,
            journey_id=journey_id,
            session_id=session_id,
            learner_id=learner_id,
            course_id=course_id,
            now=now,
        )
    elif operation == "SUBMIT_LEARNING_TURN":
        operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID)
        turn_id = _required_text(request.get("turn_id"), "turn_id", _ALLOWED_ID)
        turn_binding_digest = _required_text(
            request.get("turn_binding_digest"), "turn_binding_digest", _SHA256
        )
        response = _required_response(request.get("response"))
        submitted_at = request.get("submitted_at")
        if not isinstance(submitted_at, int) or isinstance(submitted_at, bool) or submitted_at < 0:
            _fail("INVALID:submitted_at")
        assisted = request.get("assisted", False)
        revealed = request.get("answer_revealed_before_commit", False)
        help_level = request.get("requested_help_level", 0)
        if not isinstance(assisted, bool) or not isinstance(revealed, bool):
            _fail("INVALID:evidence_integrity_flags")
        if not isinstance(help_level, int) or isinstance(help_level, bool):
            _fail("INVALID:requested_help_level")
        result = submit_learning_turn(
            repo=repo,
            operation_id=operation_id,
            turn_id=turn_id,
            turn_binding_digest=turn_binding_digest,
            response=response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=revealed,
            requested_help_level=help_level,
        )
    else:
        _fail("UNSUPPORTED_OPERATION")

    return {
        "turn_bridge_version": TURN_BRIDGE_VERSION,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        **result,
    }


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            _fail("REQUEST_REQUIRED")
        request = json.loads(raw)
        result = dispatch(request)
        sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
        sys.stdout.write("\n")
        return 0
    except Exception as exc:
        error = {"status": "ERROR", "turn_bridge_version": TURN_BRIDGE_VERSION, "error": str(exc)}
        sys.stdout.write(json.dumps(error, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
