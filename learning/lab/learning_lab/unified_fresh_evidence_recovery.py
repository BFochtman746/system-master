from __future__ import annotations

import copy
from typing import Any, Dict, Mapping, Optional

from .action_presentation import present_current_action
from .configured_fresh_evidence_provider import acquire_configured_fresh_evidence
from .fresh_evidence import FRESH_EVIDENCE_STANDING
from .repository import Repository, digest
from .unified_turn_controller import prepare_learning_turn


UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION = "UNIFIED-FRESH-EVIDENCE-RECOVERY-V1"
UNIFIED_FRESH_EVIDENCE_RECOVERY_INTENT_KIND = "unified_fresh_evidence_recovery_intent"
UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND = "unified_fresh_evidence_recovery_result"

_BLOCKERS = {
    "FRESH_EVIDENCE_RESEARCH_REQUIRED": {
        "action_type": "MAINTENANCE_RESEARCH_REQUIRED",
        "required_reason": "FRESH_RETENTION_FAMILY_REQUIRED",
        "kind": "maintenance",
    },
    "TRANSFER_REMEDIATION_REQUIRED": {
        "action_type": "TRANSFER_REMEDIATION",
        "required_reason": "FRESH_TRANSFER_TASK_REQUIRED",
        "kind": "transfer",
    },
}


class UnifiedFreshEvidenceRecoveryError(ValueError):
    pass


def _fail(code: str) -> None:
    raise UnifiedFreshEvidenceRecoveryError(code)


def _validate_time(now: int) -> None:
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        _fail("FRESH_RECOVERY_TIME_INVALID")


def _criterion_for_skill(course: Dict[str, Any], skill_id: str) -> str:
    skill = next((row for row in course.get("skills", []) if row.get("skill_id") == skill_id), None)
    if skill is None:
        _fail("FRESH_RECOVERY_SKILL_UNKNOWN")
    declared = [value for value in skill.get("criterion_ids", []) if isinstance(value, str) and value]
    known = {
        row.get("criterion_id")
        for row in course.get("criteria", [])
        if row.get("skill_id") == skill_id and isinstance(row.get("criterion_id"), str)
    }
    candidates = sorted(set(declared).intersection(known))
    if len(candidates) != 1:
        _fail("FRESH_RECOVERY_CRITERION_SCOPE_AMBIGUOUS")
    return candidates[0]


def _derive_blocker_scope(
    repo: Repository,
    course_id: str,
    presentation: Dict[str, Any],
) -> Optional[Dict[str, str]]:
    contract = _BLOCKERS.get(presentation.get("surface_kind"))
    if contract is None:
        return None
    if presentation.get("answer_withheld") is not True:
        _fail("FRESH_RECOVERY_PREFLIGHT_ANSWER_BOUNDARY_INVALID")
    action = presentation.get("action")
    if not isinstance(action, dict) or action.get("action_type") != contract["action_type"]:
        _fail("FRESH_RECOVERY_BLOCKER_ACTION_MISMATCH")
    reasons = set(action.get("reason_codes", []))
    if contract["required_reason"] not in reasons:
        _fail("FRESH_RECOVERY_BLOCKER_REASON_MISSING")
    skill_id = action.get("skill_id")
    if not isinstance(skill_id, str) or not skill_id:
        _fail("FRESH_RECOVERY_BLOCKER_SKILL_MISSING")
    course = repo.get_object("course", course_id, 1)
    if course is None:
        _fail("FRESH_RECOVERY_COURSE_NOT_FOUND")
    criterion_id = _criterion_for_skill(course, skill_id)
    return {
        "kind": contract["kind"],
        "skill_id": skill_id,
        "criterion_id": criterion_id,
    }


def _recovery_payload(
    *,
    recovery_id: str,
    turn_id: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    now: int,
) -> Dict[str, Any]:
    return {
        "recovery_id": recovery_id,
        "turn_id": turn_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "now": now,
        "version": UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION,
    }


def prepare_learning_turn_with_fresh_evidence_recovery(
    *,
    repo: Repository,
    operation_id: str,
    recovery_id: str,
    turn_id: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    now: int,
    env: Optional[Mapping[str, str]] = None,
    crash_after_phase: Optional[str] = None,
) -> Dict[str, Any]:
    """Prepare one System Master Learning turn, auto-recovering fresh-task blockers.

    The caller supplies only ordinary Learning identity/scope. Recovery kind, skill,
    and criterion are derived from the answer-withheld Learning presentation. Provider
    configuration remains environment-owned. IMPL-032 may generate a candidate, but
    IMPL-031 must independently admit it before the final turn can be prepared.
    """

    if not all(isinstance(value, str) and value for value in (
        operation_id, recovery_id, turn_id, journey_id, session_id, learner_id, course_id
    )):
        _fail("FRESH_RECOVERY_IDENTITY_REQUIRED")
    _validate_time(now)
    payload = _recovery_payload(
        recovery_id=recovery_id,
        turn_id=turn_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=now,
    )
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior

    existing_result = repo.get_object(UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND, recovery_id, 1)
    if existing_result is not None:
        if existing_result.get("payload_digest") != digest(payload):
            _fail("FRESH_RECOVERY_ID_REUSE")
        result = copy.deepcopy(existing_result["result"])
        repo.record_operation(operation_id, payload, result)
        return result

    internal_key = digest(payload)[:32]
    intent = repo.get_object(UNIFIED_FRESH_EVIDENCE_RECOVERY_INTENT_KIND, recovery_id, 1)
    if intent is not None and intent.get("payload_digest") != digest(payload):
        _fail("FRESH_RECOVERY_ID_REUSE")

    if intent is None:
        preflight = present_current_action(
            repo=repo,
            operation_id=f"AUTO-RECOVERY:{internal_key}:preflight",
            presentation_id=f"AUTO-PREFLIGHT-{internal_key}",
            journey_id=journey_id,
            session_id=session_id,
            learner_id=learner_id,
            course_id=course_id,
            now=now,
        )
        scope = _derive_blocker_scope(repo, course_id, preflight)
        if scope is None:
            turn = prepare_learning_turn(
                repo=repo,
                operation_id=f"AUTO-RECOVERY:{internal_key}:final",
                turn_id=turn_id,
                journey_id=journey_id,
                session_id=session_id,
                learner_id=learner_id,
                course_id=course_id,
                now=now,
            )
            result = {
                **turn,
                "fresh_evidence_recovery_version": UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION,
                "recovery_id": recovery_id,
                "recovery_performed": False,
                "initial_surface_kind": preflight["surface_kind"],
                "provider_http_call_required": False,
            }
            repo.put_object(UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND, recovery_id, 1, {
                "payload_digest": digest(payload),
                "result": result,
            })
            repo.record_operation(operation_id, payload, result)
            repo.emit("UnifiedFreshEvidenceRecoveryBypassed", recovery_id, {
                "course_id": course_id,
                "learner_id": learner_id,
                "surface_kind": preflight["surface_kind"],
            })
            return result

        request_id = f"AUTO-FRESH-{internal_key}"
        intent = {
            "payload_digest": digest(payload),
            "recovery_version": UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION,
            "recovery_id": recovery_id,
            "initial_presentation_id": preflight["presentation_id"],
            "initial_surface_kind": preflight["surface_kind"],
            "initial_action": copy.deepcopy(preflight["action"]),
            "scope": copy.deepcopy(scope),
            "provider_request_id": request_id,
            "requested_at": now,
            "admitted_at": now,
            "authority_boundary": {
                "caller_selects_recovery_scope": False,
                "learning_state_selects_recovery_scope": True,
                "provider_is_candidate_generation_authority_only": True,
                "impl031_is_admission_authority": True,
                "learning_engine_remains_mastery_authority": True,
            },
        }
        repo.put_object(UNIFIED_FRESH_EVIDENCE_RECOVERY_INTENT_KIND, recovery_id, 1, intent)
        repo.emit("UnifiedFreshEvidenceRecoveryIntentFrozen", recovery_id, {
            "course_id": course_id,
            "learner_id": learner_id,
            "kind": scope["kind"],
            "skill_id": scope["skill_id"],
            "criterion_id": scope["criterion_id"],
            "provider_request_id": request_id,
        })

    if crash_after_phase == "INTENT_FROZEN":
        raise RuntimeError("INJECTED_CRASH_AFTER_UNIFIED_FRESH_RECOVERY_INTENT_FROZEN")

    scope = copy.deepcopy(intent["scope"])
    provider_phase = crash_after_phase if crash_after_phase in {
        "REQUEST_FROZEN", "CAPTURE_STORED", "ADMISSION_COMPLETED"
    } else None
    acquisition = acquire_configured_fresh_evidence(
        repo=repo,
        operation_id=f"AUTO-RECOVERY:{internal_key}:acquire",
        request_id=intent["provider_request_id"],
        course_id=course_id,
        kind=scope["kind"],
        skill_id=scope["skill_id"],
        criterion_id=scope["criterion_id"],
        requested_at=intent["requested_at"],
        admitted_at=intent["admitted_at"],
        env=env,
        crash_after_phase=provider_phase,
    )
    admission = acquisition.get("admission")
    if not isinstance(admission, dict) or admission.get("standing") != FRESH_EVIDENCE_STANDING:
        _fail("FRESH_RECOVERY_INDEPENDENT_ADMISSION_REQUIRED")

    if crash_after_phase == "ACQUISITION_COMPLETED":
        raise RuntimeError("INJECTED_CRASH_AFTER_UNIFIED_FRESH_RECOVERY_ACQUISITION_COMPLETED")

    turn = prepare_learning_turn(
        repo=repo,
        operation_id=f"AUTO-RECOVERY:{internal_key}:final",
        turn_id=turn_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=now,
    )
    if turn.get("answer_withheld") is not True:
        _fail("FRESH_RECOVERY_FINAL_ANSWER_BOUNDARY_INVALID")
    if turn.get("mode") != "EVIDENCE":
        _fail("FRESH_RECOVERY_DID_NOT_RESUME_TO_EVIDENCE")
    if turn.get("action", {}).get("target_id") != admission.get("task_id"):
        _fail("FRESH_RECOVERY_RESUMED_TARGET_MISMATCH")

    result = {
        **turn,
        "fresh_evidence_recovery_version": UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION,
        "recovery_id": recovery_id,
        "recovery_performed": True,
        "initial_surface_kind": intent["initial_surface_kind"],
        "recovery_kind": scope["kind"],
        "recovery_skill_id": scope["skill_id"],
        "recovery_criterion_id": scope["criterion_id"],
        "provider_request_id": intent["provider_request_id"],
        "provider_http_call_required": True,
        "capture_standing": acquisition.get("capture_standing"),
        "candidate_digest": acquisition.get("candidate_digest"),
        "admission_id": admission.get("admission_id"),
        "admission_standing": admission.get("standing"),
        "admitted_task_id": admission.get("task_id"),
        "admitted_family_id": admission.get("family_id"),
        "authority_boundary": copy.deepcopy(intent["authority_boundary"]),
    }
    repo.put_object(UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND, recovery_id, 1, {
        "payload_digest": digest(payload),
        "result": result,
    })
    repo.record_operation(operation_id, payload, result)
    repo.emit("UnifiedFreshEvidenceRecoveryCompleted", recovery_id, {
        "course_id": course_id,
        "learner_id": learner_id,
        "kind": scope["kind"],
        "skill_id": scope["skill_id"],
        "criterion_id": scope["criterion_id"],
        "task_id": admission.get("task_id"),
        "family_id": admission.get("family_id"),
        "answer_withheld": True,
    })
    return result
