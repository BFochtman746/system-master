from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    AdaptiveLearningEngine,
    BaselineDiagnosticDirector,
    MultiSessionDirector,
    REAL_GIT_OUTCOME,
    Repository,
    TutorDirector,
)

BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-BRIDGE-V1"
QUALIFIED_LEARNING_BOUNDARY = "LEARNING-LAB-QUAL-001"
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_ALLOWED_REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_SKILLS = {"S-GIT-STAGE-COMMIT", "S-GIT-BRANCH-MERGE"}


def _fail(code: str) -> None:
    raise ValueError(code)


def _required_text(value: Any, name: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(f"REQUIRED:{name}")
    value = value.strip()
    if pattern is not None and not pattern.fullmatch(value):
        _fail(f"INVALID:{name}")
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


def _start_git_adaptive_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    claimed = request.get("claimed_skill_ids", [])
    if not isinstance(claimed, list) or any(not isinstance(v, str) or v not in _ALLOWED_SKILLS for v in claimed):
        _fail("INVALID:claimed_skill_ids")
    if len(set(claimed)) != len(claimed):
        _fail("DUPLICATE:claimed_skill_ids")
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")

    repo = Repository(str(_state_path(state_key)))
    engine = AdaptiveLearningEngine(repo)
    course_result = engine.create_research_grounded_course_job(
        operation_id="SYSTEM-MASTER-LEARNING-GIT-COURSE-V1",
        job_id="SYSTEM-MASTER-LEARNING-GIT-COURSE-V1",
        goal_id="G-GIT",
        title="Git feature branch workflow",
        desired_outcome=REAL_GIT_OUTCOME,
    )
    course_id = course_result["course_id"]

    diagnostic = BaselineDiagnosticDirector(repo, scorer=engine.git_oracle.score)
    tutor = TutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)

    safe = re.sub(r"[^A-Za-z0-9_-]", "-", request_id)
    journey_id = f"SM-J-{safe}"
    diagnostic_id = f"SM-D-{safe}"
    session_id = f"SM-S-{safe}"
    decision_id = f"SM-DEC-{safe}"

    journey.start_journey(
        operation_id=f"{request_id}:journey",
        journey_id=journey_id,
        diagnostic_id=diagnostic_id,
        learner_id=learner_id,
        course_id=course_id,
        claimed_skill_ids=claimed,
        started_at=now,
    )
    sessions.start_session(
        operation_id=f"{request_id}:session",
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=now,
    )
    decision = journey.plan_next(
        operation_id=f"{request_id}:plan",
        decision_id=decision_id,
        journey_id=journey_id,
        session_id=session_id,
        now=now,
    )
    return {
        "status": "PASS",
        "bridge_version": BRIDGE_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        "course_id": course_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "decision_id": decision_id,
        "selected_authority": decision.get("selected_authority"),
        "next_action": decision["next_action"],
    }


def dispatch(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("REQUEST_MUST_BE_OBJECT")
    operation = request.get("operation")
    if operation == "START_GIT_ADAPTIVE_ENTRY":
        return _start_git_adaptive_entry(request)
    _fail("UNSUPPORTED_OPERATION")


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
        error = {"status": "ERROR", "bridge_version": BRIDGE_VERSION, "error": str(exc)}
        sys.stdout.write(json.dumps(error, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
