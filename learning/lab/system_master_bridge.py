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
    LiveReplayOpenGoalLearningEngine,
    LiveReplayOpenGoalTutorDirector,
    MultiSessionDirector,
    NormalizedLiveResearchPort,
    RecordedModelGenerationPort,
    Repository,
    default_domain_registry,
)
from learning_lab.http_research_provider import acquire_bind_and_start_full_http_adaptive_entry
from learning_lab.production_provider_config import acquire_configured_and_start_full_http_adaptive_entry
from learning_lab.provider_multi_candidate_runtime import start_provider_multi_candidate_adaptive_entry
from learning_lab.provider_packet_runtime import start_provider_packet_adaptive_entry

BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-BRIDGE-V7"
QUALIFIED_LEARNING_BOUNDARY = "LEARNING-LAB-QUAL-001"
RUNTIME_BINDING_VERSION = "LEARNING-DOMAIN-RUNTIME-BINDING-V1"
OPEN_GOAL_RUNTIME_BINDING_VERSION = "LEARNING-OPEN-GOAL-RUNTIME-BINDING-V1"
FULL_HTTP_RUNTIME_BINDING_VERSION = "SYSTEM-MASTER-FULL-HTTP-PROVIDER-BINDING-V1"
CONFIGURED_HTTP_RUNTIME_BINDING_VERSION = "SYSTEM-MASTER-CONFIGURED-HTTP-PROVIDER-BINDING-V1"
_RESEARCH_TOKEN_ENV = "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN"
_MODEL_TOKEN_ENV = "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN"
_ALLOWED_STATE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_ALLOWED_REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_ALLOWED_DOMAIN_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,95}$")
_ALLOWED_SKILL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_SOURCE_ROOT = Path(__file__).resolve().parent / "sources"
_OPEN_GOAL_CAPTURE = "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
_OPEN_GOAL_MODEL_TRACE = "MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json"


def _fail(code: str) -> None:
    raise ValueError(code)


def _required_text(value: Any, name: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(f"REQUIRED:{name}")
    value = value.strip()
    if pattern is not None and not pattern.fullmatch(value):
        _fail(f"INVALID:{name}")
    return value


def _bounded_goal_text(value: Any, name: str) -> str:
    value = _required_text(value, name)
    if len(value) > 1000 or any(ord(ch) < 32 and ch not in "\t\n\r" for ch in value):
        _fail(f"INVALID:{name}")
    return value


def _bounded_endpoint(value: Any, name: str) -> str:
    value = _required_text(value, name)
    if len(value) > 2048 or any(ord(ch) < 32 for ch in value):
        _fail(f"INVALID:{name}")
    return value


def _required_secret(env_name: str) -> str:
    value = os.environ.get(env_name)
    if value is None or not value or len(value) > 4096 or "\x00" in value:
        _fail("PROVIDER_CREDENTIAL_REQUIRED:" + env_name)
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


def _goal_suffix(desired_outcome: str) -> str:
    return hashlib.sha256(desired_outcome.encode("utf-8")).hexdigest()[:16].upper()


def _claimed_skills(request: Mapping[str, Any]) -> list[str]:
    claimed = request.get("claimed_skill_ids", [])
    if not isinstance(claimed, list) or any(
        not isinstance(v, str) or not _ALLOWED_SKILL_ID.fullmatch(v) for v in claimed
    ):
        _fail("INVALID:claimed_skill_ids")
    if len(set(claimed)) != len(claimed):
        _fail("DUPLICATE:claimed_skill_ids")
    return list(claimed)


def _input_packet_ids(request: Mapping[str, Any]) -> list[str]:
    values = request.get("input_packet_ids")
    if not isinstance(values, list) or any(
        not isinstance(v, str) or not _ALLOWED_REQUEST_ID.fullmatch(v) for v in values
    ):
        _fail("INVALID:input_packet_ids")
    if len(values) < 2:
        _fail("PROVIDER_MULTI_CANDIDATE_SET_TOO_SMALL")
    if len(set(values)) != len(values):
        _fail("PROVIDER_MULTI_CANDIDATE_PACKET_ID_DUPLICATE")
    return list(values)


def _validate_claims(claimed: list[str], course: Mapping[str, Any]) -> set[str]:
    allowed_skill_ids = {skill["skill_id"] for skill in course["skills"]}
    unknown_claims = sorted(set(claimed) - allowed_skill_ids)
    if unknown_claims:
        _fail("CLAIMED_SKILL_OUTSIDE_COURSE:" + ",".join(unknown_claims))
    return allowed_skill_ids


def _journey_result(
    *,
    request: Mapping[str, Any],
    request_id: str,
    learner_id: str,
    claimed: list[str],
    now: int,
    repo: Repository,
    engine: Any,
    course_id: str,
    scorer: Any,
    tutor: Any,
) -> tuple[dict[str, Any], set[str]]:
    course = engine.course(course_id)
    allowed_skill_ids = _validate_claims(claimed, course)
    diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
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
    return ({
        "journey_id": journey_id,
        "session_id": session_id,
        "decision_id": decision_id,
        "selected_authority": decision.get("selected_authority"),
        "next_action": decision["next_action"],
    }, allowed_skill_ids)


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
    runtime, allowed_skill_ids = _journey_result(
        request=request,
        request_id=request_id,
        learner_id=learner_id,
        claimed=claimed,
        now=now,
        repo=repo,
        engine=engine,
        course_id=course_id,
        scorer=spec.behavior_oracle.score,
        tutor=DomainGeneralTutorDirector(repo, engine),
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
        **runtime,
    }


def _load_open_goal_ports() -> tuple[NormalizedLiveResearchPort, RecordedModelGenerationPort]:
    capture_path = _SOURCE_ROOT / _OPEN_GOAL_CAPTURE
    trace_path = _SOURCE_ROOT / _OPEN_GOAL_MODEL_TRACE
    if not capture_path.is_file() or not trace_path.is_file():
        _fail("OPEN_GOAL_QUALIFIED_INPUTS_MISSING")
    capture = json.loads(capture_path.read_text(encoding="utf-8"))
    trace = json.loads(trace_path.read_text(encoding="utf-8"))
    return NormalizedLiveResearchPort([capture]), RecordedModelGenerationPort([trace])


def _start_open_goal_adaptive_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    desired_outcome = _bounded_goal_text(request.get("desired_outcome"), "desired_outcome")
    claimed = _claimed_skills(request)
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")

    repo = Repository(str(_state_path(state_key)))
    research_port, model_port = _load_open_goal_ports()
    engine = LiveReplayOpenGoalLearningEngine(
        repo,
        research_port=research_port,
        model_generation_port=model_port,
    )
    goal_suffix = _goal_suffix(desired_outcome)
    goal_id = f"G-SM-OPEN-{goal_suffix}"
    job_id = f"SYSTEM-MASTER-OPEN-GOAL-{goal_suffix}-V1"
    course_result = engine.create_live_open_goal_course_job(
        operation_id=job_id,
        job_id=job_id,
        goal_id=goal_id,
        title=desired_outcome,
        desired_outcome=desired_outcome,
    )
    course_id = course_result["course_id"]
    course = engine.course(course_id)
    domain_key = course["domain_key"]
    if not engine.registry.has_key(domain_key):
        engine.next_action(learner_id, course_id, now=now)
    spec = engine.registry.by_key(domain_key)
    runtime, allowed_skill_ids = _journey_result(
        request=request,
        request_id=request_id,
        learner_id=learner_id,
        claimed=claimed,
        now=now,
        repo=repo,
        engine=engine,
        course_id=course_id,
        scorer=spec.behavior_oracle.score,
        tutor=LiveReplayOpenGoalTutorDirector(repo, engine),
    )
    return {
        "status": "PASS",
        "bridge_version": BRIDGE_VERSION,
        "open_goal_runtime_binding_version": OPEN_GOAL_RUNTIME_BINDING_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        "desired_outcome": desired_outcome,
        "domain_key": domain_key,
        "course_id": course_id,
        "course_skill_ids": sorted(allowed_skill_ids),
        "validation_status": course_result["validation_status"],
        "research_capture_id": course_result["research_capture_id"],
        "research_evidence_digest": course_result["research_evidence_digest"],
        "model_generation_trace_id": course_result["model_generation_trace_id"],
        "model_id": course_result["model_id"],
        "model_output_digest": course_result["model_output_digest"],
        "oracle_type": course_result["oracle_type"],
        "verification_id": course_result["verification_id"],
        **runtime,
    }


def _start_provider_packet_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    packet_id = _required_text(request.get("input_packet_id"), "input_packet_id", _ALLOWED_REQUEST_ID)
    claimed = _claimed_skills(request)
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")
    repo = Repository(str(_state_path(state_key)))
    result = start_provider_packet_adaptive_entry(
        repo=repo,
        request_id=request_id,
        learner_id=learner_id,
        packet_id=packet_id,
        claimed_skill_ids=claimed,
        now=now,
    )
    return {
        "bridge_version": BRIDGE_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        **result,
    }


def _start_provider_multi_candidate_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    packet_ids = _input_packet_ids(request)
    claimed = _claimed_skills(request)
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")
    repo = Repository(str(_state_path(state_key)))
    result = start_provider_multi_candidate_adaptive_entry(
        repo=repo,
        request_id=request_id,
        learner_id=learner_id,
        packet_ids=packet_ids,
        claimed_skill_ids=claimed,
        now=now,
    )
    return {
        "bridge_version": BRIDGE_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        **result,
    }


def _start_full_http_provider_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_REQUEST_ID)
    batch_id = _required_text(request.get("batch_id"), "batch_id", _ALLOWED_REQUEST_ID)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    desired_outcome = _bounded_goal_text(request.get("desired_outcome"), "desired_outcome")
    model_id = _required_text(request.get("model_id"), "model_id", _ALLOWED_REQUEST_ID)
    research_endpoint = _bounded_endpoint(request.get("research_endpoint"), "research_endpoint")
    model_endpoint = _bounded_endpoint(request.get("model_endpoint"), "model_endpoint")
    sample_count = request.get("sample_count")
    if not isinstance(sample_count, int) or isinstance(sample_count, bool) or not (2 <= sample_count <= 4):
        _fail("PROVIDER_MULTI_SAMPLE_COUNT_OUT_OF_BOUNDS")
    claimed = _claimed_skills(request)
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")

    research_token = _required_secret(_RESEARCH_TOKEN_ENV)
    model_token = _required_secret(_MODEL_TOKEN_ENV)
    repo = Repository(str(_state_path(state_key)))
    result = acquire_bind_and_start_full_http_adaptive_entry(
        repo=repo,
        operation_id=operation_id,
        batch_id=batch_id,
        request_id=request_id,
        learner_id=learner_id,
        desired_outcome=desired_outcome,
        sample_count=sample_count,
        research_endpoint=research_endpoint,
        model_endpoint=model_endpoint,
        model_id=model_id,
        claimed_skill_ids=claimed,
        now=now,
        research_credential_provider=lambda: research_token,
        model_credential_provider=lambda: model_token,
    )
    return {
        "bridge_version": BRIDGE_VERSION,
        "full_http_runtime_binding_version": FULL_HTTP_RUNTIME_BINDING_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        **result,
    }


def _start_configured_full_http_provider_entry(request: Mapping[str, Any]) -> dict[str, Any]:
    state_key = _required_text(request.get("state_key"), "state_key", _ALLOWED_STATE_KEY)
    operation_id = _required_text(request.get("operation_id"), "operation_id", _ALLOWED_REQUEST_ID)
    batch_id = _required_text(request.get("batch_id"), "batch_id", _ALLOWED_REQUEST_ID)
    request_id = _required_text(request.get("request_id"), "request_id", _ALLOWED_REQUEST_ID)
    learner_id = _required_text(request.get("learner_id"), "learner_id", _ALLOWED_REQUEST_ID)
    desired_outcome = _bounded_goal_text(request.get("desired_outcome"), "desired_outcome")
    claimed = _claimed_skills(request)
    now = request.get("now")
    if not isinstance(now, int) or now < 0:
        _fail("INVALID:now")

    forbidden_runtime_fields = {
        "research_endpoint", "model_endpoint", "research_provider_id", "model_provider_id",
        "model_id", "sample_count", "research_token", "model_token", "credential", "api_key",
    }
    present = sorted(forbidden_runtime_fields.intersection(request.keys()))
    if present:
        _fail("CONFIGURED_PROVIDER_RUNTIME_OVERRIDE_FORBIDDEN:" + ",".join(present))

    repo = Repository(str(_state_path(state_key)))
    result = acquire_configured_and_start_full_http_adaptive_entry(
        repo=repo,
        operation_id=operation_id,
        batch_id=batch_id,
        request_id=request_id,
        learner_id=learner_id,
        desired_outcome=desired_outcome,
        claimed_skill_ids=claimed,
        now=now,
    )
    return {
        "bridge_version": BRIDGE_VERSION,
        "configured_http_runtime_binding_version": CONFIGURED_HTTP_RUNTIME_BINDING_VERSION,
        "qualified_learning_boundary": QUALIFIED_LEARNING_BOUNDARY,
        "request_digest": _request_digest(request),
        "state_key": state_key,
        **result,
    }


def dispatch(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("REQUEST_MUST_BE_OBJECT")
    operation = request.get("operation")
    if operation == "START_ADAPTIVE_ENTRY":
        return _start_adaptive_entry(request)
    if operation == "START_OPEN_GOAL_ADAPTIVE_ENTRY":
        return _start_open_goal_adaptive_entry(request)
    if operation == "START_OPEN_GOAL_PACKET_ADAPTIVE_ENTRY":
        return _start_provider_packet_entry(request)
    if operation == "START_OPEN_GOAL_MULTI_CANDIDATE_PACKET_ADAPTIVE_ENTRY":
        return _start_provider_multi_candidate_entry(request)
    if operation == "START_FULL_HTTP_PROVIDER_ADAPTIVE_ENTRY":
        return _start_full_http_provider_entry(request)
    if operation == "START_CONFIGURED_FULL_HTTP_PROVIDER_ADAPTIVE_ENTRY":
        return _start_configured_full_http_provider_entry(request)
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
