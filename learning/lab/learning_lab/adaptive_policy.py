from __future__ import annotations

import copy
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .repository import Repository, digest


ADAPTIVE_POLICY_VERSION = "001M-S04-ADAPTIVE-POLICY-V2"

DURABLE_PRIORITY = {
    "REVALIDATION_REQUIRED": 100,
    "RETENTION_DUE": 95,
    "TRANSFER_GAP": 90,
    "INDEPENDENT_EVIDENCE_REQUIRED": 85,
    "REMEDIATION": 80,
    "EVIDENCE_GAP": 75,
    "PREREQUISITE": 70,
    "CURRICULUM_NEXT": 60,
    "LEARNER_CHOICE": 50,
    "OTHER": 10,
}

FORBIDDEN_RANKING_KEYS = {
    "protected_attribute", "sensitive_attribute", "race", "ethnicity",
    "religion", "political_affiliation", "sexual_orientation", "health_condition",
}

PROXY_KEYS_NOT_OBJECTIVES = {
    "clicks", "streak", "streaks", "session_length", "time_on_task",
    "output_quantity", "message_count", "engagement_score",
}


class AdaptivePolicyError(ValueError):
    pass


def _candidate_id(candidate: Mapping[str, Any]) -> str:
    value = candidate.get("candidate_id") or candidate.get("target_id") or candidate.get("action_type")
    if not value:
        raise AdaptivePolicyError("ADAPTIVE_CANDIDATE_ID_REQUIRED")
    return str(value)


def _reason_priority(reason_codes: Sequence[str]) -> int:
    values = [DURABLE_PRIORITY.get(str(code), DURABLE_PRIORITY["OTHER"]) for code in reason_codes]
    return max(values) if values else DURABLE_PRIORITY["OTHER"]


def _sanitize_ranking_context(context: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for key, value in (context or {}).items():
        normalized = str(key).lower()
        if normalized in FORBIDDEN_RANKING_KEYS or normalized in PROXY_KEYS_NOT_OBJECTIVES:
            continue
        result[str(key)] = copy.deepcopy(value)
    return result


def evaluate_adaptive_candidates(
    candidates: Sequence[Mapping[str, Any]],
    *,
    learner_choice_candidate_id: Optional[str] = None,
    model_scores: Optional[Mapping[str, float]] = None,
    model_calibrated: bool = False,
    model_approved: bool = False,
    ranking_context: Optional[Mapping[str, Any]] = None,
    policy_version: str = ADAPTIVE_POLICY_VERSION,
    source_state: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Learning-owned adaptive next-action policy.

    Eligibility is deterministic and precedes ranking. Model scores are advisory
    only among already-eligible tied candidates and only when Assurance standing
    permits model use. Sensitive attributes and engagement/productivity proxies
    are never ranking objectives.
    """
    normalized: List[Dict[str, Any]] = []
    for index, raw in enumerate(candidates):
        item = copy.deepcopy(dict(raw))
        item["candidate_id"] = _candidate_id(item)
        item["reason_codes"] = sorted({str(code) for code in item.get("reason_codes", [])})
        item["blocker_reason_codes"] = sorted({str(code) for code in item.get("blocker_reason_codes", [])})
        item["eligible"] = bool(item.get("eligible", not item["blocker_reason_codes"])) and not item["blocker_reason_codes"]
        item["curriculum_order"] = int(item.get("curriculum_order", index))
        normalized.append(item)

    eligible = [item for item in normalized if item["eligible"]]
    rejected = [item for item in normalized if not item["eligible"]]
    safe_context = _sanitize_ranking_context(ranking_context)
    model_may_rank = bool(model_scores) and bool(model_calibrated) and bool(model_approved)
    model_participated = False

    if not eligible:
        return {
            "standing": "NO_ELIGIBLE_ACTION",
            "error": "NoEligibleAction",
            "selected_action": None,
            "eligible_candidates": [],
            "rejected_candidates": [
                {
                    "candidate_id": item["candidate_id"],
                    "action_type": item.get("action_type"),
                    "target_id": item.get("target_id"),
                    "blocker_reason_codes": item["blocker_reason_codes"] or ["INELIGIBLE_BY_POLICY"],
                }
                for item in rejected
            ],
            "decision_trace": {
                "adaptive_policy_version": policy_version,
                "source_state_digest": digest(source_state or {}),
                "eligible_candidate_ids": [],
                "rejected_candidate_ids": [item["candidate_id"] for item in rejected],
                "model_participated": False,
                "model_standing": "NOT_USED_NO_ELIGIBLE_ACTION",
                "ranking_context": safe_context,
                "learner_choice_candidate_id": learner_choice_candidate_id,
                "reason_codes": ["NO_ELIGIBLE_ACTION"],
                "explanation_kind": "BOUNDED_REASON_CODES",
            },
        }

    by_id = {item["candidate_id"]: item for item in eligible}
    learner_override_used = False
    if learner_choice_candidate_id is not None:
        requested = str(learner_choice_candidate_id)
        if requested in by_id:
            selected = by_id[requested]
            learner_override_used = True
        elif any(item["candidate_id"] == requested for item in rejected):
            raise AdaptivePolicyError("OVERRIDE_NOT_PERMITTED_INELIGIBLE_ACTION")
        else:
            raise AdaptivePolicyError("LEARNER_CHOICE_UNKNOWN_CANDIDATE")
    else:
        def deterministic_key(item: Mapping[str, Any]):
            return (-_reason_priority(item.get("reason_codes", [])), int(item.get("curriculum_order", 0)), item["candidate_id"])

        deterministic_ranked = sorted(eligible, key=deterministic_key)
        selected = deterministic_ranked[0]
        top_priority = _reason_priority(selected.get("reason_codes", []))
        tied = [item for item in deterministic_ranked if _reason_priority(item.get("reason_codes", [])) == top_priority]
        if model_may_rank and len(tied) > 1:
            model_participated = True
            selected = sorted(
                tied,
                key=lambda item: (
                    -float((model_scores or {}).get(item["candidate_id"], float("-inf"))),
                    int(item.get("curriculum_order", 0)), item["candidate_id"],
                ),
            )[0]

    model_standing = "NOT_REQUESTED"
    if model_scores:
        if not model_calibrated:
            model_standing = "IGNORED_NOT_CALIBRATED"
        elif not model_approved:
            model_standing = "IGNORED_NOT_APPROVED"
        elif model_may_rank:
            model_standing = "ADVISORY_ELIGIBLE_TIEBREAK_ONLY"

    selected_action = {
        key: copy.deepcopy(value)
        for key, value in selected.items()
        if key not in {"eligible", "blocker_reason_codes", "curriculum_order"}
    }
    selected_action["selection_reason_codes"] = sorted(
        set(selected.get("reason_codes", []))
        | ({"LEARNER_ELIGIBLE_OVERRIDE"} if learner_override_used else {"DETERMINISTIC_DURABLE_LEARNING_PRIORITY"})
    )
    selected_action["learner_override_used"] = learner_override_used
    selected_action["override_is_competence_evidence"] = False

    trace = {
        "adaptive_policy_version": policy_version,
        "source_state_digest": digest(source_state or {}),
        "eligible_candidate_ids": [item["candidate_id"] for item in eligible],
        "rejected_candidate_ids": [item["candidate_id"] for item in rejected],
        "selected_candidate_id": selected["candidate_id"],
        "selection_reason_codes": list(selected_action["selection_reason_codes"]),
        "model_participated": model_participated,
        "model_standing": model_standing,
        "learner_choice_candidate_id": learner_choice_candidate_id,
        "learner_override_used": learner_override_used,
        "ranking_context": safe_context,
        "forbidden_proxy_objectives_removed": sorted(
            key for key in (ranking_context or {}) if str(key).lower() in PROXY_KEYS_NOT_OBJECTIVES
        ),
        "sensitive_ranking_inputs_removed": sorted(
            key for key in (ranking_context or {}) if str(key).lower() in FORBIDDEN_RANKING_KEYS
        ),
        "explanation_kind": "BOUNDED_REASON_CODES",
    }
    return {
        "standing": "SELECTED",
        "selected_action": selected_action,
        "eligible_candidates": [copy.deepcopy(item) for item in eligible],
        "rejected_candidates": [copy.deepcopy(item) for item in rejected],
        "decision_trace": trace,
    }


def record_adaptive_decision(
    repo: Repository,
    *,
    operation_id: str,
    decision_id: str,
    candidates: Sequence[Mapping[str, Any]],
    learner_choice_candidate_id: Optional[str] = None,
    model_scores: Optional[Mapping[str, float]] = None,
    model_calibrated: bool = False,
    model_approved: bool = False,
    ranking_context: Optional[Mapping[str, Any]] = None,
    policy_version: str = ADAPTIVE_POLICY_VERSION,
    source_state: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Persist the existing LRN-E021 decision trace using repository primitives.

    Operation identity provides deterministic replay/conflict behavior. The trace is
    stored append-safe as an immutable version-1 object; later disposition requires a
    new decision identity rather than mutation.
    """
    payload = {
        "decision_id": str(decision_id),
        "candidates": copy.deepcopy(list(candidates)),
        "learner_choice_candidate_id": learner_choice_candidate_id,
        "model_scores": copy.deepcopy(dict(model_scores or {})),
        "model_calibrated": bool(model_calibrated),
        "model_approved": bool(model_approved),
        "ranking_context": copy.deepcopy(dict(ranking_context or {})),
        "policy_version": str(policy_version),
        "source_state": copy.deepcopy(dict(source_state or {})),
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior

    result = evaluate_adaptive_candidates(
        candidates,
        learner_choice_candidate_id=learner_choice_candidate_id,
        model_scores=model_scores,
        model_calibrated=model_calibrated,
        model_approved=model_approved,
        ranking_context=ranking_context,
        policy_version=policy_version,
        source_state=source_state,
    )
    trace = copy.deepcopy(result["decision_trace"])
    trace["decision_id"] = str(decision_id)
    trace["semantic_authority"] = "LRN-E021_ADAPTIVE_DECISION_TRACE"
    trace["immutable"] = True
    repo.put_object("adaptive_decision_trace", str(decision_id), 1, trace)
    out = copy.deepcopy(result)
    out["decision_trace"] = trace
    repo.record_operation(operation_id, payload, out)
    return out


def candidate_from_next_action(action: Mapping[str, Any], *, curriculum_order: int = 0) -> Dict[str, Any]:
    action_type = str(action.get("action_type", ""))
    reason_codes = list(action.get("reason_codes", []))
    blocker_codes: List[str] = []
    if action_type in {"PREREQUISITE_BLOCKED", "RETENTION_WAIT", "ASSESSMENT_INTEGRITY_BLOCKED"}:
        blocker_codes.append({
            "PREREQUISITE_BLOCKED": "PREREQUISITE_NOT_SATISFIED",
            "RETENTION_WAIT": "RETENTION_DELAY_NOT_YET_MET",
            "ASSESSMENT_INTEGRITY_BLOCKED": "ASSESSMENT_INTEGRITY_BLOCK",
        }[action_type])
    return {
        "candidate_id": f"{action_type}:{action.get('target_id') or 'NONE'}:{action.get('skill_id') or 'NONE'}",
        "action_type": action_type,
        "target_id": action.get("target_id"),
        "skill_id": action.get("skill_id"),
        "reason_codes": reason_codes,
        "blocker_reason_codes": blocker_codes,
        "eligible": not blocker_codes,
        "curriculum_order": curriculum_order,
    }
