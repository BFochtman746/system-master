from __future__ import annotations

import copy
from typing import Any, Dict, List, Sequence, Tuple

from .adaptive import MultiSessionDirector
from .adaptive_entry import AdaptiveEntryJourneyDirector
from .baseline_diagnostic import BaselineDiagnosticDirector
from .live_open_goal import LiveReplayOpenGoalTutorDirector, NormalizedLiveResearchPort
from .multi_candidate import (
    SELECTION_POLICY_VERSION,
    StochasticMultiCandidateLearningEngine,
    StochasticRecordedModelPort,
)
from .provider_acquisition import OpenGoalInputPacketService
from .repository import Repository, digest


PROVIDER_MULTI_CANDIDATE_RUNTIME_VERSION = "OPEN-GOAL-PROVIDER-MULTI-CANDIDATE-RUNTIME-V1"
PROVIDER_PACKET_SET_VERSION = "OPEN-GOAL-PROVIDER-PACKET-SET-V1"


def _packet_set(
    repo: Repository,
    packet_ids: Sequence[str],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    ids = sorted(packet_ids)
    if len(ids) < 2:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_SET_TOO_SMALL")
    if len(set(ids)) != len(ids):
        raise ValueError("PROVIDER_MULTI_CANDIDATE_PACKET_ID_DUPLICATE")

    service = OpenGoalInputPacketService(repo)
    packets = [service.load(packet_id) for packet_id in ids]

    goals = {p["desired_outcome"] for p in packets}
    research_evidence = {p["research_evidence_digest"] for p in packets}
    prompt_digests = {p["model_trace"]["prompt_digest"] for p in packets}
    model_ids = {p["model_trace"]["model_id"] for p in packets}
    domain_keys = {p["domain_key"] for p in packets}
    output_digests = [p["model_output_digest"] for p in packets]
    trace_ids = [p["model_trace"]["generation_trace_id"] for p in packets]

    if len(goals) != 1:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_GOAL_MISMATCH")
    if len(research_evidence) != 1:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_RESEARCH_EVIDENCE_MISMATCH")
    if len(prompt_digests) != 1:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_PROMPT_MISMATCH")
    if len(model_ids) != 1:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_MODEL_ID_MISMATCH")
    if len(domain_keys) != 1:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_DOMAIN_MISMATCH")
    if len(set(output_digests)) != len(output_digests):
        raise ValueError("PROVIDER_MULTI_CANDIDATE_DUPLICATE_OUTPUT")
    if len(set(trace_ids)) != len(trace_ids):
        raise ValueError("PROVIDER_MULTI_CANDIDATE_TRACE_ID_DUPLICATE")

    manifest = [
        {
            "packet_id": p["packet_id"],
            "packet_digest": p["packet_digest"],
            "model_trace_id": p["model_trace"]["generation_trace_id"],
            "model_trace_digest": p["model_trace_digest"],
            "model_output_digest": p["model_output_digest"],
        }
        for p in packets
    ]
    packet_set = {
        "packet_set_version": PROVIDER_PACKET_SET_VERSION,
        "desired_outcome": next(iter(goals)),
        "domain_key": next(iter(domain_keys)),
        "research_evidence_digest": next(iter(research_evidence)),
        "prompt_digest": next(iter(prompt_digests)),
        "model_id": next(iter(model_ids)),
        "packet_count": len(packets),
        "manifest": manifest,
        "authority_boundary": {
            "packet_order_can_select_winner": False,
            "model_ranking_used": False,
            "scalar_ranking_used": False,
            "independent_selection_required": True,
            "abstention_is_valid_outcome": True,
            "course_build_requires_select": True,
        },
    }
    packet_set["packet_set_digest"] = digest(packet_set)
    set_id = f"PROVIDER-MC-SET-{packet_set['packet_set_digest'][:20].upper()}"
    packet_set["packet_set_id"] = set_id
    # Recompute after binding the stable object identity into the sealed set.
    unsigned = {k: v for k, v in packet_set.items() if k != "packet_set_digest"}
    packet_set["packet_set_digest"] = digest(unsigned)
    repo.put_object("provider_multi_candidate_packet_set", set_id, 1, packet_set)
    return packet_set, packets


def _validate_claims(course: Dict[str, Any], claimed_skill_ids: Sequence[str]) -> List[str]:
    allowed = sorted(skill["skill_id"] for skill in course["skills"])
    unknown = sorted(set(claimed_skill_ids) - set(allowed))
    if unknown:
        raise ValueError("CLAIMED_SKILL_OUTSIDE_COURSE:" + ",".join(unknown))
    return allowed


def start_provider_multi_candidate_adaptive_entry(
    *,
    repo: Repository,
    request_id: str,
    learner_id: str,
    packet_ids: Sequence[str],
    claimed_skill_ids: Sequence[str],
    now: int,
) -> Dict[str, Any]:
    packet_set, packets = _packet_set(repo, packet_ids)
    desired_outcome = packet_set["desired_outcome"]

    research_port = NormalizedLiveResearchPort([copy.deepcopy(packets[0]["research_capture"])])
    candidate_port = StochasticRecordedModelPort(
        [copy.deepcopy(packet["model_trace"]) for packet in packets]
    )
    engine = StochasticMultiCandidateLearningEngine(
        repo,
        research_port=research_port,
        candidate_model_port=candidate_port,
    )

    lineage = packet_set["packet_set_digest"][:20].upper()
    goal_id = f"G-SM-PROVIDER-MC-{lineage}"
    job_id = f"SYSTEM-MASTER-PROVIDER-MC-{lineage}-V1"
    candidate_trace_ids = [packet["model_trace"]["generation_trace_id"] for packet in packets]
    selection_result = engine.create_multi_candidate_course_job(
        operation_id=job_id,
        job_id=job_id,
        goal_id=goal_id,
        title=desired_outcome,
        desired_outcome=desired_outcome,
        candidate_trace_ids=candidate_trace_ids,
    )
    selection_decision = repo.get_object(
        "candidate_selection_decision", selection_result["selection_decision_id"], 1
    )
    if selection_decision is None:
        raise ValueError("PROVIDER_MULTI_CANDIDATE_SELECTION_DECISION_MISSING")

    binding = {
        "runtime_version": PROVIDER_MULTI_CANDIDATE_RUNTIME_VERSION,
        "packet_set_id": packet_set["packet_set_id"],
        "packet_set_digest": packet_set["packet_set_digest"],
        "packet_ids": sorted(packet_ids),
        "candidate_set_digest": selection_decision["candidate_set_digest"],
        "selection_policy_version": selection_decision["policy_version"],
        "selection_decision_id": selection_result["selection_decision_id"],
        "selection_decision": selection_result["selection_decision"],
        "model_ranking_used": selection_decision["model_ranking_used"],
        "scalar_ranking_used": selection_decision["scalar_ranking_used"],
    }
    repo.put_object("provider_multi_candidate_runtime_binding", job_id, 1, binding)

    if selection_result["selection_decision"] == "ABSTAIN":
        return {
            "status": "ABSTAIN",
            "provider_multi_candidate_runtime_version": PROVIDER_MULTI_CANDIDATE_RUNTIME_VERSION,
            "packet_set_version": PROVIDER_PACKET_SET_VERSION,
            "packet_set_id": packet_set["packet_set_id"],
            "packet_set_digest": packet_set["packet_set_digest"],
            "packet_ids": sorted(packet_ids),
            "candidate_count": selection_result["candidate_count"],
            "candidate_set_digest": selection_decision["candidate_set_digest"],
            "selection_policy_version": SELECTION_POLICY_VERSION,
            "selection_decision_id": selection_result["selection_decision_id"],
            "selection_decision": "ABSTAIN",
            "selection_reason_codes": selection_result["selection_reason_codes"],
            "qualified_candidate_ids": selection_result["qualified_candidate_ids"],
            "rejected_candidate_ids": selection_result["rejected_candidate_ids"],
            "model_ranking_used": selection_decision["model_ranking_used"],
            "scalar_ranking_used": selection_decision["scalar_ranking_used"],
            "desired_outcome": desired_outcome,
            "research_evidence_digest": packet_set["research_evidence_digest"],
            "course_id": None,
            "journey_created": False,
        }

    course_id = selection_result["course_id"]
    course = engine.course(course_id)
    domain_key = course["domain_key"]
    if not engine.registry.has_key(domain_key):
        # Rehydrate the persisted selected dynamic domain on exact replay/process restart.
        engine.next_action(learner_id, course_id, now=now)
    spec = engine.registry.by_key(domain_key)
    allowed_skill_ids = _validate_claims(course, claimed_skill_ids)

    diagnostic = BaselineDiagnosticDirector(repo, scorer=spec.behavior_oracle.score)
    tutor = LiveReplayOpenGoalTutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)

    journey_id = f"SM-PROVIDER-MC-J-{request_id}"
    diagnostic_id = f"SM-PROVIDER-MC-D-{request_id}"
    session_id = f"SM-PROVIDER-MC-S-{request_id}"
    decision_id = f"SM-PROVIDER-MC-DEC-{request_id}"
    claimed = list(claimed_skill_ids)

    journey.start_journey(
        operation_id=f"{request_id}:provider-mc-journey",
        journey_id=journey_id,
        diagnostic_id=diagnostic_id,
        learner_id=learner_id,
        course_id=course_id,
        claimed_skill_ids=claimed,
        started_at=now,
    )
    sessions.start_session(
        operation_id=f"{request_id}:provider-mc-session",
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=now,
    )
    decision = journey.plan_next(
        operation_id=f"{request_id}:provider-mc-plan",
        decision_id=decision_id,
        journey_id=journey_id,
        session_id=session_id,
        now=now,
    )

    selected_packet = next(
        packet for packet in packets
        if packet["model_trace"]["generation_trace_id"] == selection_result["selected_model_trace_id"]
    )
    return {
        "status": "PASS",
        "provider_multi_candidate_runtime_version": PROVIDER_MULTI_CANDIDATE_RUNTIME_VERSION,
        "packet_set_version": PROVIDER_PACKET_SET_VERSION,
        "packet_set_id": packet_set["packet_set_id"],
        "packet_set_digest": packet_set["packet_set_digest"],
        "packet_ids": sorted(packet_ids),
        "candidate_count": selection_result["candidate_count"],
        "candidate_set_digest": selection_result["candidate_set_digest"],
        "selection_policy_version": SELECTION_POLICY_VERSION,
        "selection_decision_id": selection_result["selection_decision_id"],
        "selection_decision": "SELECT",
        "selection_reason_codes": selection_result["selection_reason_codes"],
        "selected_candidate_id": selection_result["selected_candidate_id"],
        "selected_packet_id": selected_packet["packet_id"],
        "selected_model_trace_id": selection_result["selected_model_trace_id"],
        "selected_model_output_digest": selection_result["selected_model_output_digest"],
        "model_ranking_used": selection_decision["model_ranking_used"],
        "scalar_ranking_used": selection_decision["scalar_ranking_used"],
        "desired_outcome": desired_outcome,
        "domain_key": domain_key,
        "research_evidence_digest": packet_set["research_evidence_digest"],
        "course_id": course_id,
        "course_skill_ids": allowed_skill_ids,
        "validation_status": selection_result["validation_status"],
        "verification_id": selection_result["verification_id"],
        "journey_created": True,
        "journey_id": journey_id,
        "session_id": session_id,
        "decision_id": decision_id,
        "selected_authority": decision.get("selected_authority"),
        "next_action": decision["next_action"],
    }
