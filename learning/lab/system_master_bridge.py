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
    BaselineDiagnosticDirector,
    DomainGeneralLearningEngine,
    DomainGeneralTutorDirector,
    GIT_DOMAIN_KEY,
    MultiSessionDirector,
    Repository,
    default_domain_registry,
)

BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-BRIDGE-V2"
QUALIFIED_LEARNING_BOUNDARY = "LEARNING-LAB-QUAL-001"
RUNTIME_BINDING_VERSION = "LEARNING-DOMAIN-RUNTIME-BINDING-V1"
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_ALLOWED_REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_DOMAIN_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,95}$")
_ALLOWED_SKILL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")


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


def _safe_suffix(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "-", value)


def _claimed_skills(request: Mapping[str, Any]) -> list[str]:
    claimed = request.get("claimed_skill_ids", [])
    if not isinstance(claimed, list) or any(
        not isinstance(v, str) or not _ALLOWED_SKILL_ID.fullmatch(v) for v in claimed
    ):
        _fail("INVALID:claimed_skill_ids")
    if len(set(claimed)) != len(claimed):
        _fail("DUPLICATE:claimed_skill_ids")
    return list(claimed)


def _start_adaptive_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    domain_key = _required_text(request.get("domain_key"), "domain_key", _ALLOWED_DOMAIN_KEY)
    claimed = _claimed_skills(request)
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")

    registry = default_domain_registry()
    spec = registry.by_key(domain_key)
    repo = Repository(str(_state_path(state_key)))
    engine = DomainGeneralLearningEngine(repo, registry=registry)

    domain_suffix = _safe_suffix(domain_key).upper()
    goal_id = f"G-SM-{domain_suffix}"
    job_id = f"SYSTEM-MASTER-LEARNING-COURSE-{domain_suffix}-V1"
    course_result = engine.create_research_grounded_course_job(
        operation_id=job_id,
        job_id=job_id,
        goal_id=goal_id,
        title=spec.desired_outcome,
        desired_outcome=spec.desired_outcome,
    )
    course_id = course_result["course_id"]
    course = engine.course(course_id)
    allowed_skill_ids = {skill["skill_id"] for skill in course["skills"]}
    unknown_claims = sorted(set(claimed) - allowed_skill_ids)
    if unknown_claims:
        _fail("CLAIMED_SKILL_OUTSIDE_COURSE:" + ",".join(unknown_claims))

    diagnostic = BaselineDiagnosticDirector(repo, scorer=engine.git_oracle.score)
    tutor = DomainGeneralTutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)

    safe = _safe_suffix(request_id)
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
        "runtime_binding_version": RUNTIME_BINDING_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        "domain_key": domain_key,
        "course_id": course_id,
        "course_skill_ids": sorted(allowed_skill_ids),
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
    if operation == "START_ADAPTIVE_ENTRY":
        return _start_adaptive_entry(request)
    if operation == "START_GIT_ADAPTIVE_ENTRY":
        legacy = dict(request)
        legacy["operation"] = "START_ADAPTIVE_ENTRY"
        legacy["domain_key"] = GIT_DOMAIN_KEY
        return _start_adaptive_entry(legacy)
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
