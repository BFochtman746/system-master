from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab.adaptive_journey_continuation import submit_current_evidence_and_continue
from learning_lab.repository import Repository


INTERACTION_BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-INTERACTION-BRIDGE-V1"
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


def _required_response(value: Any) -> str:
    if not isinstance(value, str):
        _fail("LEARNER_RESPONSE_MUST_BE_TEXT")
    if len(value) > 8192:
        _fail("LEARNER_RESPONSE_TOO_LARGE")
    if any(ord(ch) == 0 for ch in value):
        _fail("LEARNER_RESPONSE_NUL_FORBIDDEN")
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
    if request.get("operation") != "SUBMIT_ADAPTIVE_JOURNEY_EVIDENCE":
        _fail("UNSUPPORTED_OPERATION")

    operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_ID)
    interaction_id = _required_text(request.get("interaction_id"), "interaction_id", _ALLOWED_ID)
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    journey_id = _required_text(request.get("journey_id"), "journey_id", _ALLOWED_ID)
    session_id = _required_text(request.get("session_id"), "session_id", _ALLOWED_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_ID)
    course_id = _required_text(request.get("course_id"), "course_id", _ALLOWED_ID)
    response = _required_response(request.get("response"))
    submitted_at = request.get("submitted_at")
    if not isinstance(submitted_at, int) or isinstance(submitted_at, bool) or submitted_at < 0:
        _fail("INVALID:submitted_at")
    assisted = request.get("assisted", False)
    revealed = request.get("answer_revealed_before_commit", False)
    if not isinstance(assisted, bool) or not isinstance(revealed, bool):
        _fail("INVALID:evidence_integrity_flags")

    repo = Repository(str(_state_path(state_key)))
    result = submit_current_evidence_and_continue(
        repo=repo,
        operation_id=operation_id,
        interaction_id=interaction_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        response=response,
        submitted_at=submitted_at,
        assisted=assisted,
        answer_revealed_before_commit=revealed,
    )
    return {
        "interaction_bridge_version": INTERACTION_BRIDGE_VERSION,
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
        error = {"status": "ERROR", "interaction_bridge_version": INTERACTION_BRIDGE_VERSION, "error": str(exc)}
        sys.stdout.write(json.dumps(error, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
