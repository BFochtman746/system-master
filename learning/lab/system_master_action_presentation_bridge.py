from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.action_presentation import present_current_action
from learning_lab.repository import Repository


ACTION_PRESENTATION_BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-ACTION-PRESENTATION-BRIDGE-V1"
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
    if request.get("operation") != "PRESENT_CURRENT_LEARNING_ACTION":
        _fail("UNSUPPORTED_OPERATION")

    operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID)
    presentation_id = _required_text(request.get("presentation_id"), "presentation_id", _ALLOWED_ID)
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    journey_id = _required_text(request.get("journey_id"), "journey_id", _ALLOWED_ID)
    session_id = _required_text(request.get("session_id"), "session_id", _ALLOWED_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_ID)
    course_id = _required_text(request.get("course_id"), "course_id", _ALLOWED_ID)
    now = request.get("now")
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        _fail("INVALID:now")

    repo = Repository(str(_state_path(state_key)))
    result = present_current_action(
        repo=repo,
        operation_id=operation_id,
        presentation_id=presentation_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=now,
    )
    return {
        "action_presentation_bridge_version": ACTION_PRESENTATION_BRIDGE_VERSION,
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
        error = {
            "status": "ERROR",
            "action_presentation_bridge_version": ACTION_PRESENTATION_BRIDGE_VERSION,
            "error": str(exc),
        }
        sys.stdout.write(json.dumps(error, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
