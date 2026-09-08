from __future__ import annotations

import copy
import hashlib
from typing import Any, Dict

from .action_presentation import present_current_action
from .adaptive_journey_continuation import submit_current_evidence_and_continue
from .adaptive_tutor_continuation import (
    begin_current_tutor_interaction,
    submit_current_tutor_interaction,
)
from .repository import Repository, digest


UNIFIED_TURN_CONTROLLER_VERSION = "SYSTEM-MASTER-UNIFIED-LEARNING-TURN-V2"
TURN_KIND = "system_master_learning_turn"
TURN_SUBMISSION_KIND = "system_master_learning_turn_submission"
_RESPONSE_MODES = {"EVIDENCE", "TUTOR"}


class UnifiedTurnControllerError(ValueError):
    pass


def _response_digest(response: str) -> str:
    return hashlib.sha256(response.encode("utf-8")).hexdigest()


def _turn_mode(surface_kind: str) -> str:
    mapping = {
        "LEARNER_RESPONSE_REQUIRED": "EVIDENCE",
        "TUTOR_INTERACTION_REQUIRED": "TUTOR",
        "WAIT": "WAIT",
        "COURSE_COMPLETE": "COMPLETE",
        "TRANSFER_REMEDIATION_REQUIRED": "TRANSFER_REMEDIATION_REQUIRED",
        "FRESH_EVIDENCE_RESEARCH_REQUIRED": "FRESH_EVIDENCE_RESEARCH_REQUIRED",
    }
    if surface_kind not in mapping:
        raise UnifiedTurnControllerError("UNSUPPORTED_PRESENTATION_SURFACE:" + surface_kind)
    return mapping[surface_kind]


def _binding_digest(body: Dict[str, Any]) -> str:
    return digest({
        "turn_id": body["turn_id"],
        "journey_id": body["journey_id"],
        "session_id": body["session_id"],
        "learner_id": body["learner_id"],
        "course_id": body["course_id"],
        "mode": body["mode"],
        "action": body["action"],
        "presentation_id": body["presentation_id"],
        "tutor_interaction_id": body.get("tutor_interaction_id"),
        "prepared_at": body["prepared_at"],
        "controller_version": UNIFIED_TURN_CONTROLLER_VERSION,
    })


def prepare_learning_turn(
    *,
    repo: Repository,
    operation_id: str,
    turn_id: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    now: int,
) -> Dict[str, Any]:
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        raise UnifiedTurnControllerError("TURN_TIME_INVALID")
    payload = {
        "turn_id": turn_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "now": now,
        "controller_version": UNIFIED_TURN_CONTROLLER_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior

    existing = repo.get_object(TURN_KIND, turn_id, 1)
    if existing is not None:
        if existing.get("prepare_payload_digest") != digest(payload):
            raise UnifiedTurnControllerError("TURN_ID_REUSE")
        result = copy.deepcopy(existing["result"])
        repo.record_operation(operation_id, payload, result)
        return result

    presentation_id = f"PRES-{turn_id}"
    presentation = present_current_action(
        repo=repo,
        operation_id=f"{operation_id}:presentation",
        presentation_id=presentation_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=now,
    )
    mode = _turn_mode(presentation["surface_kind"])
    tutor_interaction_id = None
    prompt = presentation.get("prompt")
    tutor_payload = None

    if mode == "TUTOR":
        tutor_interaction_id = f"TUTOR-{turn_id}"
        tutor_payload = begin_current_tutor_interaction(
            repo=repo,
            operation_id=f"{operation_id}:tutor-begin",
            tutor_interaction_id=tutor_interaction_id,
            journey_id=journey_id,
            session_id=session_id,
            learner_id=learner_id,
            course_id=course_id,
            now=now,
        )
        prompt = tutor_payload["prompt"]

    body = {
        "turn_id": turn_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "prepared_at": now,
        "mode": mode,
        "presentation_id": presentation_id,
        "tutor_interaction_id": tutor_interaction_id,
        "action": copy.deepcopy(presentation["action"]),
        "selected_authority": presentation["selected_authority"],
        "surface_kind": presentation["surface_kind"],
        "prompt": prompt,
        "answer_withheld": True,
        "response_required": mode in _RESPONSE_MODES,
        "earliest_due_at": presentation.get("earliest_due_at"),
        "evidence_role": presentation.get("evidence_role"),
        "presentation_version": presentation["presentation_version"],
        "tutor_payload": None if tutor_payload is None else {
            "probe_id": tutor_payload["probe_id"],
            "probe_family_id": tutor_payload["probe_family_id"],
            "action_type": tutor_payload["action_type"],
            "skill_id": tutor_payload["skill_id"],
            "qualifies_mastery": False,
        },
        "controller_version": UNIFIED_TURN_CONTROLLER_VERSION,
    }
    turn_binding_digest = _binding_digest(body)
    result = {
        "status": "PASS",
        **{k: copy.deepcopy(v) for k, v in body.items() if k != "tutor_payload"},
        "tutor": copy.deepcopy(body["tutor_payload"]),
        "turn_binding_digest": turn_binding_digest,
    }
    stored = {
        **body,
        "turn_binding_digest": turn_binding_digest,
        "prepare_payload_digest": digest(payload),
        "result": result,
    }
    repo.put_object(TURN_KIND, turn_id, 1, stored)
    repo.record_operation(operation_id, payload, result)
    repo.emit("SystemMasterLearningTurnPrepared", turn_id, {
        "journey_id": journey_id,
        "session_id": session_id,
        "mode": mode,
        "action_type": presentation["action"]["action_type"],
        "target_id": presentation["action"].get("target_id"),
        "answer_withheld": True,
    })
    return result


def submit_learning_turn(
    *,
    repo: Repository,
    operation_id: str,
    turn_id: str,
    turn_binding_digest: str,
    response: str,
    submitted_at: int,
    assisted: bool = False,
    answer_revealed_before_commit: bool = False,
    requested_help_level: int = 0,
) -> Dict[str, Any]:
    if not isinstance(response, str):
        raise UnifiedTurnControllerError("TURN_RESPONSE_MUST_BE_TEXT")
    if len(response) > 8192 or "\x00" in response:
        raise UnifiedTurnControllerError("TURN_RESPONSE_INVALID")
    if not isinstance(submitted_at, int) or isinstance(submitted_at, bool) or submitted_at < 0:
        raise UnifiedTurnControllerError("TURN_SUBMITTED_AT_INVALID")
    if not isinstance(assisted, bool) or not isinstance(answer_revealed_before_commit, bool):
        raise UnifiedTurnControllerError("TURN_INTEGRITY_FLAGS_INVALID")
    if not isinstance(requested_help_level, int) or isinstance(requested_help_level, bool):
        raise UnifiedTurnControllerError("TURN_HELP_LEVEL_INVALID")

    turn = repo.get_object(TURN_KIND, turn_id, 1)
    if turn is None:
        raise UnifiedTurnControllerError("TURN_NOT_FOUND")
    if turn.get("turn_binding_digest") != turn_binding_digest:
        raise UnifiedTurnControllerError("TURN_BINDING_MISMATCH")
    mode = turn["mode"]
    if mode not in _RESPONSE_MODES:
        raise UnifiedTurnControllerError("TURN_DOES_NOT_ACCEPT_RESPONSE:" + mode)

    response_digest = _response_digest(response)
    audit_payload = {
        "turn_id": turn_id,
        "turn_binding_digest": turn_binding_digest,
        "response_digest": response_digest,
        "submitted_at": submitted_at,
        "assisted": assisted,
        "answer_revealed_before_commit": answer_revealed_before_commit,
        "requested_help_level": requested_help_level,
        "mode": mode,
        "controller_version": UNIFIED_TURN_CONTROLLER_VERSION,
    }
    prior_operation = repo.operation_result(operation_id, audit_payload)
    if prior_operation is not None:
        return prior_operation

    input_digest = digest(audit_payload)
    existing = repo.get_object(TURN_SUBMISSION_KIND, turn_id, 1)
    if existing is not None:
        if existing.get("input_digest") != input_digest:
            raise UnifiedTurnControllerError("TURN_ALREADY_SUBMITTED_WITH_DIFFERENT_INPUT")
        result = copy.deepcopy(existing["result"])
        repo.record_operation(operation_id, audit_payload, result)
        return result

    if mode == "EVIDENCE":
        underlying = submit_current_evidence_and_continue(
            repo=repo,
            operation_id=f"TURN-SUBMIT:{turn_id}:evidence",
            interaction_id=f"TURN-EVIDENCE-{turn_id}",
            journey_id=turn["journey_id"],
            session_id=turn["session_id"],
            learner_id=turn["learner_id"],
            course_id=turn["course_id"],
            response=response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
        )
        authority = "LEARNING_EVIDENCE_CONTINUATION"
        next_action = copy.deepcopy(underlying["next_action"])
        next_authority = underlying["next_authority"]
        evidence = copy.deepcopy(underlying["evidence"])
    else:
        underlying = submit_current_tutor_interaction(
            repo=repo,
            operation_id=f"TURN-SUBMIT:{turn_id}:tutor",
            tutor_interaction_id=turn["tutor_interaction_id"],
            turn_id=f"TUTOR-TURN-{turn_id}",
            response=response,
            requested_help_level=requested_help_level,
            submitted_at=submitted_at,
        )
        authority = "LEARNING_TUTOR_CONTINUATION"
        next_action = copy.deepcopy(underlying["next_action"])
        next_authority = underlying["next_authority"]
        evidence = {
            "evidence_kind": "TUTOR_FORMATIVE_ONLY",
            "observation": copy.deepcopy(underlying["observation"]),
            "diagnosis": copy.deepcopy(underlying["diagnosis"]),
            "teaching_move": copy.deepcopy(underlying["teaching_move"]),
            "mastery_attempt_written": False,
        }

    result = {
        "status": "PASS",
        "controller_version": UNIFIED_TURN_CONTROLLER_VERSION,
        "turn_id": turn_id,
        "turn_binding_digest": turn_binding_digest,
        "mode": mode,
        "submitted_at": submitted_at,
        "response_digest": response_digest,
        "response_echoed": False,
        "submission_authority": authority,
        "evidence": evidence,
        "next_action": next_action,
        "next_authority": next_authority,
        "prepare_next_turn_required": True,
    }
    repo.put_object(TURN_SUBMISSION_KIND, turn_id, 1, {
        "turn_id": turn_id,
        "input_digest": input_digest,
        "result": result,
    })
    repo.record_operation(operation_id, audit_payload, result)
    repo.emit("SystemMasterLearningTurnSubmitted", turn_id, {
        "mode": mode,
        "next_action_type": next_action["action_type"],
        "next_authority": next_authority,
        "response_echoed": False,
    })
    return result