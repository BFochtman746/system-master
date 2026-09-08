from __future__ import annotations

from hashlib import sha256
from typing import Any, Dict, List

from .adaptive import MultiSessionDirector
from .adaptive_entry import AdaptiveEntryJourneyDirector
from .baseline_diagnostic import BaselineDiagnosticDirector
from .live_open_goal import LiveReplayOpenGoalLearningEngine, LiveReplayOpenGoalTutorDirector
from .provider_acquisition import OpenGoalInputPacketService
from .repository import Repository


PROVIDER_PACKET_RUNTIME_VERSION = "OPEN-GOAL-PROVIDER-PACKET-RUNTIME-V1"


def _short_hash(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()[:16].upper()


def start_provider_packet_adaptive_entry(
    *,
    repo: Repository,
    request_id: str,
    learner_id: str,
    packet_id: str,
    claimed_skill_ids: List[str],
    now: int,
) -> Dict[str, Any]:
    service = OpenGoalInputPacketService(repo)
    packet = service.load(packet_id)
    research_port, model_port = service.ports_from_packet(packet)
    desired_outcome = packet["desired_outcome"]
    engine = LiveReplayOpenGoalLearningEngine(
        repo,
        research_port=research_port,
        model_generation_port=model_port,
    )

    lineage = f"{_short_hash(desired_outcome)}-{packet['packet_digest'][:16].upper()}"
    goal_id = f"G-SM-PACKET-{lineage}"
    job_id = f"SYSTEM-MASTER-PACKET-GOAL-{lineage}-V1"
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

    allowed_skill_ids = {skill["skill_id"] for skill in course["skills"]}
    unknown = sorted(set(claimed_skill_ids) - allowed_skill_ids)
    if unknown:
        raise ValueError("CLAIMED_SKILL_OUTSIDE_COURSE:" + ",".join(unknown))

    diagnostic = BaselineDiagnosticDirector(repo, scorer=spec.behavior_oracle.score)
    tutor = LiveReplayOpenGoalTutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)

    journey_id = f"SM-PACKET-J-{request_id}"
    diagnostic_id = f"SM-PACKET-D-{request_id}"
    session_id = f"SM-PACKET-S-{request_id}"
    decision_id = f"SM-PACKET-DEC-{request_id}"

    journey.start_journey(
        operation_id=f"{request_id}:packet-journey",
        journey_id=journey_id,
        diagnostic_id=diagnostic_id,
        learner_id=learner_id,
        course_id=course_id,
        claimed_skill_ids=claimed_skill_ids,
        started_at=now,
    )
    sessions.start_session(
        operation_id=f"{request_id}:packet-session",
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=now,
    )
    decision = journey.plan_next(
        operation_id=f"{request_id}:packet-plan",
        decision_id=decision_id,
        journey_id=journey_id,
        session_id=session_id,
        now=now,
    )

    return {
        "status": "PASS",
        "provider_packet_runtime_version": PROVIDER_PACKET_RUNTIME_VERSION,
        "packet_id": packet_id,
        "packet_digest": packet["packet_digest"],
        "packet_standing": packet["standing"],
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
        "journey_id": journey_id,
        "session_id": session_id,
        "decision_id": decision_id,
        "selected_authority": decision.get("selected_authority"),
        "next_action": decision["next_action"],
    }
