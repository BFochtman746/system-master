from __future__ import annotations

import copy
from typing import Any, Dict, Optional

from .adaptive import MultiSessionDirector
from .adaptive_journey_continuation import _runtime_components
from .adaptive_tutor_continuation import AdaptiveTutorJourneyDirector
from .baseline_diagnostic import BaselineDiagnosticDirector
from .repository import Repository, digest


ACTION_PRESENTATION_VERSION = "LEARNING-ACTION-PRESENTATION-V1"
PRESENTATION_KIND = "learning_action_presentation"
_FORBIDDEN_PRESENTATION_KEYS = {"answer", "rationale", "learner_response", "response"}
_ASSESSMENT_ACTIONS = {
    "DIAGNOSTIC_PROBE",
    "INDEPENDENT_VERIFICATION",
    "MASTERY_CHECK",
    "RETENTION_CHECK",
    "MAINTENANCE_RECHECK",
    "TRANSFER_CHECK",
}
_TUTOR_ACTIONS = {"TUTOR_INSTRUCTION", "TUTOR_REMEDIATION"}


class ActionPresentationError(ValueError):
    pass


def _contains_forbidden_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in _FORBIDDEN_PRESENTATION_KEYS:
                return True
            if _contains_forbidden_key(child):
                return True
    elif isinstance(value, list):
        return any(_contains_forbidden_key(child) for child in value)
    return False


def _target_record(repo: Repository, course: Dict[str, Any], action: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target_id = action.get("target_id")
    if not target_id:
        return None
    for item in course.get("items", []):
        if item.get("item_id") == target_id:
            return copy.deepcopy(item)
    for kind in ("maintenance_task", "transfer_task"):
        task = repo.get_object(kind, target_id, 1)
        if task is not None:
            return task
    return None


def _assessment_view(action: Dict[str, Any], target: Dict[str, Any]) -> Dict[str, Any]:
    prompt = target.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ActionPresentationError("ACTION_PROMPT_MISSING")
    action_type = action["action_type"]
    role = "INDEPENDENT_ASSESSMENT"
    qualifies_mastery = action_type in {"INDEPENDENT_VERIFICATION", "MASTERY_CHECK"}
    if action_type == "DIAGNOSTIC_PROBE":
        role = "DIAGNOSTIC_ROUTING_ONLY"
        qualifies_mastery = False
    elif action_type == "RETENTION_CHECK":
        role = "RETENTION_EVIDENCE"
        qualifies_mastery = False
    elif action_type == "MAINTENANCE_RECHECK":
        role = "MAINTENANCE_REVALIDATION"
        qualifies_mastery = False
    elif action_type == "TRANSFER_CHECK":
        role = "TRANSFER_EVIDENCE"
        qualifies_mastery = False
    return {
        "surface_kind": "LEARNER_RESPONSE_REQUIRED",
        "response_required": True,
        "prompt": prompt,
        "answer_withheld": True,
        "assessment_integrity_active": True,
        "evidence_role": role,
        "qualifies_mastery_if_passed": qualifies_mastery,
        "item_id": target.get("item_id"),
        "item_family_id": target.get("family_id"),
        "criterion_id": target.get("criterion_id"),
        "assessment_mode": target.get("mode"),
    }


def _surface_for_action(
    repo: Repository,
    course: Dict[str, Any],
    action: Dict[str, Any],
) -> Dict[str, Any]:
    action_type = action["action_type"]
    if action_type in _ASSESSMENT_ACTIONS:
        target = _target_record(repo, course, action)
        if target is None:
            raise ActionPresentationError("ACTION_TARGET_NOT_FOUND")
        return _assessment_view(action, target)
    if action_type == "RETENTION_WAIT":
        return {
            "surface_kind": "WAIT",
            "response_required": False,
            "prompt": None,
            "answer_withheld": True,
            "assessment_integrity_active": True,
            "prompt_withheld_until_due": True,
            "earliest_due_at": action.get("earliest_due_at"),
            "evidence_role": "RETENTION_WAIT",
        }
    if action_type in _TUTOR_ACTIONS:
        return {
            "surface_kind": "TUTOR_INTERACTION_REQUIRED",
            "response_required": False,
            "prompt": None,
            "answer_withheld": True,
            "assessment_integrity_active": False,
            "tutor_begin_required": True,
            "evidence_role": "FORMATIVE_ONLY",
        }
    if action_type == "TRANSFER_REMEDIATION":
        return {
            "surface_kind": "TRANSFER_REMEDIATION_REQUIRED",
            "response_required": False,
            "prompt": None,
            "answer_withheld": True,
            "assessment_integrity_active": False,
            "evidence_role": "FORMATIVE_REMEDIATION_PENDING",
        }
    if action_type == "MAINTENANCE_RESEARCH_REQUIRED":
        return {
            "surface_kind": "FRESH_EVIDENCE_RESEARCH_REQUIRED",
            "response_required": False,
            "prompt": None,
            "answer_withheld": True,
            "assessment_integrity_active": False,
            "evidence_role": "REVALIDATION_BLOCKED_PENDING_FRESH_TASK",
        }
    if action_type == "COURSE_COMPLETE":
        return {
            "surface_kind": "COURSE_COMPLETE",
            "response_required": False,
            "prompt": None,
            "answer_withheld": True,
            "assessment_integrity_active": False,
            "evidence_role": "COMPLETE",
        }
    if action_type in {"LESSON", "REMEDIATION"}:
        return {
            "surface_kind": "LEGACY_TUTOR_CONTINUATION_REQUIRED",
            "response_required": False,
            "prompt": None,
            "answer_withheld": True,
            "assessment_integrity_active": False,
            "evidence_role": "FORMATIVE_ONLY",
        }
    raise ActionPresentationError("UNSUPPORTED_ACTION_PRESENTATION:" + action_type)


def present_current_action(
    *,
    repo: Repository,
    operation_id: str,
    presentation_id: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    now: int,
) -> Dict[str, Any]:
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        raise ActionPresentationError("PRESENTATION_TIME_INVALID")
    payload = {
        "presentation_id": presentation_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "now": now,
        "version": ACTION_PRESENTATION_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior

    engine, scorer, tutor = _runtime_components(
        repo,
        course_id=course_id,
        learner_id=learner_id,
        now=now,
    )
    diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveTutorJourneyDirector(repo, engine, diagnostic, tutor, sessions)
    decision = journey.plan_next(
        operation_id=f"{operation_id}:plan",
        decision_id=f"PRESENT-{presentation_id}",
        journey_id=journey_id,
        session_id=session_id,
        now=now,
    )
    if decision["learner_id"] != learner_id or decision["course_id"] != course_id:
        raise ActionPresentationError("JOURNEY_SCOPE_MISMATCH")

    course = repo.get_object("course", course_id, 1)
    if course is None:
        raise ActionPresentationError("COURSE_NOT_FOUND")
    action = copy.deepcopy(decision["next_action"])
    surface = _surface_for_action(repo, course, action)
    result = {
        "status": "PASS",
        "presentation_version": ACTION_PRESENTATION_VERSION,
        "presentation_id": presentation_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "as_of": now,
        "selected_authority": decision["selected_authority"],
        "action": action,
        **surface,
        "source_course_digest": digest(course),
    }
    if _contains_forbidden_key(result):
        raise AssertionError("LEARNER_ACTION_PRESENTATION_SECRET_FIELD_LEAK")
    body = {
        "operation_id": operation_id,
        "payload_digest": digest(payload),
        "result": result,
    }
    repo.put_object(PRESENTATION_KIND, presentation_id, 1, body)
    repo.record_operation(operation_id, payload, result)
    repo.emit("LearningActionPresented", presentation_id, {
        "journey_id": journey_id,
        "session_id": session_id,
        "action_type": action["action_type"],
        "target_id": action.get("target_id"),
        "surface_kind": surface["surface_kind"],
        "answer_withheld": True,
    })
    return result
