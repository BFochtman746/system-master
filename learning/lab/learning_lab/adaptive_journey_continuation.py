from __future__ import annotations

import copy
import hashlib
from typing import Any, Dict, Sequence, Tuple

from .adaptive import MultiSessionDirector
from .adaptive_entry import AdaptiveEntryJourneyDirector
from .baseline_diagnostic import BaselineDiagnosticDirector
from .domain_general import DomainGeneralLearningEngine, DomainGeneralTutorDirector, default_domain_registry
from .live_open_goal import LiveReplayOpenGoalTutorDirector, NormalizedLiveResearchPort
from .multi_candidate import StochasticMultiCandidateLearningEngine, StochasticRecordedModelPort
from .provider_acquisition import OpenGoalInputPacketService
from .repository import Repository


ADAPTIVE_JOURNEY_CONTINUATION_VERSION = "ADAPTIVE-JOURNEY-EVIDENCE-CONTINUATION-V1"
_PROVIDER_GOAL_PREFIX = "G-SM-PROVIDER-MC-"


class AdaptiveJourneyContinuationError(ValueError):
    pass


def _response_digest(response: str) -> str:
    return hashlib.sha256(response.encode("utf-8")).hexdigest()


def _provider_runtime_components(
    repo: Repository,
    *,
    course: Dict[str, Any],
    learner_id: str,
    now: int,
) -> Tuple[Any, Any, Any]:
    goal_id = course.get("goal_id", "")
    if not isinstance(goal_id, str) or not goal_id.startswith(_PROVIDER_GOAL_PREFIX):
        raise AdaptiveJourneyContinuationError("DYNAMIC_PROVIDER_RUNTIME_BINDING_NOT_FOUND")
    lineage = goal_id[len(_PROVIDER_GOAL_PREFIX):]
    if not lineage:
        raise AdaptiveJourneyContinuationError("DYNAMIC_PROVIDER_LINEAGE_INVALID")
    job_id = f"SYSTEM-MASTER-PROVIDER-MC-{lineage}-V1"
    binding = repo.get_object("provider_multi_candidate_runtime_binding", job_id, 1)
    if binding is None:
        raise AdaptiveJourneyContinuationError("DYNAMIC_PROVIDER_RUNTIME_BINDING_NOT_FOUND")
    packet_ids = binding.get("packet_ids")
    if not isinstance(packet_ids, list) or len(packet_ids) < 2:
        raise AdaptiveJourneyContinuationError("DYNAMIC_PROVIDER_PACKET_SET_INVALID")

    packet_service = OpenGoalInputPacketService(repo)
    packets = [packet_service.load(packet_id) for packet_id in packet_ids]
    research_port = NormalizedLiveResearchPort([copy.deepcopy(packets[0]["research_capture"])])
    candidate_port = StochasticRecordedModelPort(
        [copy.deepcopy(packet["model_trace"]) for packet in packets]
    )
    engine = StochasticMultiCandidateLearningEngine(
        repo,
        research_port=research_port,
        candidate_model_port=candidate_port,
    )
    domain_key = course.get("domain_key")
    if not domain_key:
        raise AdaptiveJourneyContinuationError("COURSE_DOMAIN_KEY_MISSING")
    if not engine.registry.has_key(domain_key):
        # Existing engine behavior rehydrates the sealed dynamic domain from persisted
        # course/verification state. No provider call is made here.
        engine.next_action(learner_id, course["course_id"], now=now)
    spec = engine.registry.by_key(domain_key)
    return engine, spec.behavior_oracle.score, LiveReplayOpenGoalTutorDirector(repo, engine)


def _runtime_components(
    repo: Repository,
    *,
    course_id: str,
    learner_id: str,
    now: int,
) -> Tuple[Any, Any, Any]:
    course = repo.get_object("course", course_id, 1)
    if course is None:
        raise AdaptiveJourneyContinuationError("COURSE_NOT_FOUND")
    registry = default_domain_registry()
    domain_key = course.get("domain_key")
    if isinstance(domain_key, str) and registry.has_key(domain_key):
        engine = DomainGeneralLearningEngine(repo, registry=registry)
        spec = registry.by_key(domain_key)
        return engine, spec.behavior_oracle.score, DomainGeneralTutorDirector(repo, engine)
    return _provider_runtime_components(repo, course=course, learner_id=learner_id, now=now)


def _summary_from_result(action_type: str, result: Dict[str, Any]) -> Dict[str, Any]:
    if action_type == "DIAGNOSTIC_PROBE":
        probe = result["probe"]
        return {
            "evidence_kind": "DIAGNOSTIC_ROUTING_ONLY",
            "item_id": probe["item_id"],
            "skill_id": probe["skill_id"],
            "correct": probe["correct"],
            "standing": probe["standing"],
            "routing_only": True,
            "qualifies_mastery": False,
        }
    attempt = result["attempt"]
    projection = result["projection"]
    return {
        "evidence_kind": attempt["mode"],
        "item_id": attempt["item_id"],
        "skill_id": attempt["skill_id"],
        "correct": attempt["correct"],
        "assisted": attempt["assisted"],
        "answer_revealed_before_commit": attempt["answer_revealed_before_commit"],
        "projection_stage": projection["stage"],
        "gate_states": copy.deepcopy(projection["gate_states"]),
        "reason_codes": list(projection.get("reason_codes", [])),
    }


def submit_current_evidence_and_continue(
    *,
    repo: Repository,
    operation_id: str,
    interaction_id: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    response: str,
    submitted_at: int,
    assisted: bool = False,
    answer_revealed_before_commit: bool = False,
) -> Dict[str, Any]:
    if not isinstance(response, str):
        raise AdaptiveJourneyContinuationError("LEARNER_RESPONSE_MUST_BE_TEXT")
    if len(response) > 8192:
        raise AdaptiveJourneyContinuationError("LEARNER_RESPONSE_TOO_LARGE")
    if not isinstance(submitted_at, int) or isinstance(submitted_at, bool) or submitted_at < 0:
        raise AdaptiveJourneyContinuationError("SUBMITTED_AT_INVALID")
    if not isinstance(assisted, bool) or not isinstance(answer_revealed_before_commit, bool):
        raise AdaptiveJourneyContinuationError("EVIDENCE_INTEGRITY_FLAGS_INVALID")

    engine, scorer, tutor = _runtime_components(
        repo,
        course_id=course_id,
        learner_id=learner_id,
        now=submitted_at,
    )
    diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)

    before = journey.plan_next(
        operation_id=f"{operation_id}:before",
        decision_id=f"DEC-BEFORE-{interaction_id}",
        journey_id=journey_id,
        session_id=session_id,
        now=submitted_at,
    )
    if before["learner_id"] != learner_id or before["course_id"] != course_id:
        raise AdaptiveJourneyContinuationError("JOURNEY_SCOPE_MISMATCH")

    action = before["next_action"]
    action_type = action["action_type"]
    target_id = action.get("target_id")
    if not target_id:
        raise AdaptiveJourneyContinuationError("CURRENT_ACTION_DOES_NOT_ACCEPT_EVIDENCE:" + action_type)

    if action_type == "DIAGNOSTIC_PROBE":
        evidence = journey.record_diagnostic_probe(
            journey_id=journey_id,
            now=submitted_at,
            operation_id=f"{operation_id}:evidence",
            probe_id=f"PROBE-{interaction_id}",
            diagnostic_id=before["diagnostic_id"],
            item_id=target_id,
            response=response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
        )
    elif action_type in {"INDEPENDENT_VERIFICATION", "MASTERY_CHECK", "RETENTION_CHECK"}:
        evidence = engine.submit_attempt(
            operation_id=f"{operation_id}:evidence",
            attempt_id=f"ATTEMPT-{interaction_id}",
            learner_id=learner_id,
            course_id=course_id,
            item_id=target_id,
            response=response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
        )
    elif action_type == "MAINTENANCE_RECHECK":
        evidence = engine.submit_maintenance_attempt(
            operation_id=f"{operation_id}:evidence",
            attempt_id=f"ATTEMPT-{interaction_id}",
            learner_id=learner_id,
            course_id=course_id,
            task_id=target_id,
            response=response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
        )
    elif action_type == "TRANSFER_CHECK":
        evidence = engine.submit_transfer_attempt(
            operation_id=f"{operation_id}:evidence",
            attempt_id=f"ATTEMPT-{interaction_id}",
            learner_id=learner_id,
            course_id=course_id,
            task_id=target_id,
            response=response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
        )
    elif action_type in {"TUTOR_INSTRUCTION", "TUTOR_REMEDIATION", "TRANSFER_REMEDIATION"}:
        raise AdaptiveJourneyContinuationError("CURRENT_ACTION_REQUIRES_TUTOR_INTERACTION:" + action_type)
    else:
        raise AdaptiveJourneyContinuationError("CURRENT_ACTION_DOES_NOT_ACCEPT_EVIDENCE:" + action_type)

    after = journey.plan_next(
        operation_id=f"{operation_id}:after",
        decision_id=f"DEC-AFTER-{interaction_id}",
        journey_id=journey_id,
        session_id=session_id,
        now=submitted_at,
    )
    return {
        "status": "PASS",
        "continuation_version": ADAPTIVE_JOURNEY_CONTINUATION_VERSION,
        "operation_id": operation_id,
        "interaction_id": interaction_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "response_digest": _response_digest(response),
        "response_echoed": False,
        "before_action": copy.deepcopy(action),
        "before_authority": before["selected_authority"],
        "evidence": _summary_from_result(action_type, evidence),
        "next_action": copy.deepcopy(after["next_action"]),
        "next_authority": after["selected_authority"],
    }
