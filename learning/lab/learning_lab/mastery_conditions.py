from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .models import GateState, MasteryStage


MASTERY_CONDITION_POLICY_VERSION = "001M-S03-v2"
DEFAULT_RETENTION_DELAY_SECONDS = 3600

ASSISTANCE_INDEPENDENT = "INDEPENDENT"
ASSISTANCE_ORDINARY_SCAFFOLD = "INSTRUCTIONAL_SCAFFOLD"
ASSISTANCE_SUBSTANTIAL_HINTS = "SUBSTANTIAL_HINTS"
ASSISTANCE_AI = "AI_ASSISTED"
ASSISTANCE_COLLABORATIVE = "COLLABORATIVE"
ASSISTANCE_TOOL = "TOOL_ASSISTED"
ASSISTANCE_TOOL_PERMITTED = "TOOL_PERMITTED"
ASSISTANCE_ACCOMMODATION = "AUTHORIZED_ACCOMMODATION"
ASSISTANCE_UNKNOWN = "UNKNOWN_ASSISTANCE"

KNOWN_ASSISTANCE = {
    ASSISTANCE_INDEPENDENT,
    ASSISTANCE_ORDINARY_SCAFFOLD,
    ASSISTANCE_SUBSTANTIAL_HINTS,
    ASSISTANCE_AI,
    ASSISTANCE_COLLABORATIVE,
    ASSISTANCE_TOOL,
    ASSISTANCE_TOOL_PERMITTED,
    ASSISTANCE_ACCOMMODATION,
    ASSISTANCE_UNKNOWN,
}

NON_INDEPENDENT_ASSISTANCE = {
    ASSISTANCE_ORDINARY_SCAFFOLD,
    ASSISTANCE_SUBSTANTIAL_HINTS,
    ASSISTANCE_AI,
    ASSISTANCE_COLLABORATIVE,
    ASSISTANCE_UNKNOWN,
}


def _assistance(a: Mapping[str, Any]) -> str:
    value = a.get("assistance_condition")
    if value:
        normalized = str(value).upper()
        return normalized if normalized in KNOWN_ASSISTANCE else ASSISTANCE_UNKNOWN
    return ASSISTANCE_ORDINARY_SCAFFOLD if bool(a.get("assisted")) else ASSISTANCE_INDEPENDENT


def _is_stale(a: Mapping[str, Any]) -> bool:
    return str(a.get("evidence_standing", "CURRENT")).upper() == "STALE"


def _integrity_ok(a: Mapping[str, Any]) -> bool:
    return not bool(a.get("answer_revealed_before_commit"))


def _independence_eligible(a: Mapping[str, Any], independence_required: bool) -> Tuple[bool, Optional[str]]:
    if not independence_required:
        return True, None
    condition = _assistance(a)
    if condition == ASSISTANCE_ACCOMMODATION:
        if bool(a.get("accommodation_authorized", False)):
            return True, None
        # Authorization standing remains an interpretation blocker. The observed
        # performance is not relabeled as scaffolded, but it cannot close mastery.
        return True, None
    if condition in {ASSISTANCE_TOOL, ASSISTANCE_TOOL_PERMITTED}:
        if bool(a.get("tool_part_of_construct", False)):
            return True, None
        return False, "ASSISTANCE_BREAKS_INDEPENDENCE"
    if condition in NON_INDEPENDENT_ASSISTANCE:
        return False, "ASSISTANCE_BREAKS_INDEPENDENCE"
    return condition == ASSISTANCE_INDEPENDENT, None if condition == ASSISTANCE_INDEPENDENT else "ASSISTANCE_BREAKS_INDEPENDENCE"


def _attempt_ref(a: Mapping[str, Any]) -> str:
    return str(a.get("attempt_id", ""))


def evaluate_mastery_conditions(
    attempts: Sequence[Mapping[str, Any]],
    *,
    retention_delay_seconds: int = DEFAULT_RETENTION_DELAY_SECONDS,
    retention_required: bool = True,
    transfer_required: bool = False,
    independence_required: bool = True,
    policy_version: str = MASTERY_CONDITION_POLICY_VERSION,
) -> Dict[str, Any]:
    """Evaluate the existing Learning mastery gates with explicit S03 conditions.

    This is a subordinate evaluator for the existing MasteryProjection authority.
    It does not persist state, create a new semantic object, or infer certification.
    """
    attempts = list(attempts)
    excluded: Dict[str, str] = {}
    counted: List[str] = []
    assistance_conditions: Dict[str, str] = {}
    stale_attempts: List[str] = []
    integrity_rejected: List[str] = []
    unverified_accommodation_attempts: List[str] = []

    for a in attempts:
        aid = _attempt_ref(a)
        condition = _assistance(a)
        assistance_conditions[aid] = condition
        if _is_stale(a):
            stale_attempts.append(aid)
        if not _integrity_ok(a):
            integrity_rejected.append(aid)
        if condition == ASSISTANCE_ACCOMMODATION and not bool(a.get("accommodation_authorized", False)):
            unverified_accommodation_attempts.append(aid)

    mastery_candidates: List[Mapping[str, Any]] = []
    mastery_failures: List[Mapping[str, Any]] = []
    for a in attempts:
        if str(a.get("mode")) != "MASTERY_CHECK":
            continue
        aid = _attempt_ref(a)
        if _is_stale(a):
            excluded[aid] = "EVIDENCE_STALE"
            continue
        if not _integrity_ok(a):
            excluded[aid] = "ANSWER_REVEAL_BREAKS_INTEGRITY"
            continue
        independent_ok, reason = _independence_eligible(a, independence_required)
        if not independent_ok:
            excluded[aid] = reason or "ASSISTANCE_BREAKS_INDEPENDENCE"
            continue
        counted.append(aid)
        if bool(a.get("correct")):
            mastery_candidates.append(a)
        else:
            mastery_failures.append(a)

    mastery_success = mastery_candidates[-1] if mastery_candidates else None
    latest_mastery_failure = mastery_failures[-1] if mastery_failures else None

    mastery_conflict = False
    if mastery_success is not None and latest_mastery_failure is not None:
        mastery_conflict = int(latest_mastery_failure.get("submitted_at", 0)) > int(mastery_success.get("submitted_at", 0))

    valid_retention: List[Mapping[str, Any]] = []
    retention_too_early: List[str] = []
    retention_same_family: List[str] = []
    if mastery_success is not None:
        for a in attempts:
            if str(a.get("mode")) != "RETENTION_CHECK":
                continue
            aid = _attempt_ref(a)
            if _is_stale(a):
                excluded[aid] = "EVIDENCE_STALE"
                continue
            if not _integrity_ok(a):
                excluded[aid] = "ANSWER_REVEAL_BREAKS_INTEGRITY"
                continue
            independent_ok, reason = _independence_eligible(a, independence_required)
            if not independent_ok:
                excluded[aid] = reason or "ASSISTANCE_BREAKS_INDEPENDENCE"
                continue
            if str(a.get("item_family_id")) == str(mastery_success.get("item_family_id")):
                excluded[aid] = "SAME_FAMILY_NOT_INDEPENDENT_RETENTION"
                retention_same_family.append(aid)
                continue
            delay = int(a.get("submitted_at", 0)) - int(mastery_success.get("submitted_at", 0))
            if delay < int(retention_delay_seconds):
                excluded[aid] = "RETENTION_DELAY_NOT_MET"
                retention_too_early.append(aid)
                continue
            counted.append(aid)
            valid_retention.append(a)

    retention_successes = [a for a in valid_retention if bool(a.get("correct"))]
    retention_failures = [a for a in valid_retention if not bool(a.get("correct"))]
    retention_success = retention_successes[-1] if retention_successes else None
    retention_conflict = False
    if retention_successes and retention_failures:
        latest_success_time = max(int(a.get("submitted_at", 0)) for a in retention_successes)
        latest_failure_time = max(int(a.get("submitted_at", 0)) for a in retention_failures)
        retention_conflict = latest_failure_time > latest_success_time

    valid_transfer: List[Mapping[str, Any]] = []
    transfer_non_novel: List[str] = []
    if transfer_required:
        for a in attempts:
            if str(a.get("mode")) != "TRANSFER_CHECK":
                continue
            aid = _attempt_ref(a)
            if _is_stale(a):
                excluded[aid] = "EVIDENCE_STALE"
                continue
            if not _integrity_ok(a):
                excluded[aid] = "ANSWER_REVEAL_BREAKS_INTEGRITY"
                continue
            independent_ok, reason = _independence_eligible(a, independence_required)
            if not independent_ok:
                excluded[aid] = reason or "ASSISTANCE_BREAKS_INDEPENDENCE"
                continue
            novelty = str(a.get("transfer_novelty", "UNKNOWN")).upper()
            if novelty not in {"MATERIALLY_NOVEL", "NOVEL_CONTEXT"}:
                excluded[aid] = "TRANSFER_NOVELTY_NOT_ESTABLISHED"
                transfer_non_novel.append(aid)
                continue
            if mastery_success is not None and str(a.get("item_family_id")) == str(mastery_success.get("item_family_id")):
                excluded[aid] = "SAME_FAMILY_NOT_TRANSFER"
                transfer_non_novel.append(aid)
                continue
            counted.append(aid)
            valid_transfer.append(a)

    transfer_successes = [a for a in valid_transfer if bool(a.get("correct"))]
    transfer_failures = [a for a in valid_transfer if not bool(a.get("correct"))]
    transfer_success = transfer_successes[-1] if transfer_successes else None
    transfer_conflict = False
    if transfer_successes and transfer_failures:
        latest_success_time = max(int(a.get("submitted_at", 0)) for a in transfer_successes)
        latest_failure_time = max(int(a.get("submitted_at", 0)) for a in transfer_failures)
        transfer_conflict = latest_failure_time > latest_success_time

    if mastery_conflict:
        criterion_gate = GateState.CONFLICTED
    elif mastery_success is not None:
        criterion_gate = GateState.SATISFIED
    elif mastery_failures:
        criterion_gate = GateState.FAILED_CURRENTLY
    else:
        criterion_gate = GateState.UNKNOWN

    if not independence_required:
        independence_gate = GateState.NOT_APPLICABLE
    elif mastery_conflict:
        independence_gate = GateState.CONFLICTED
    elif mastery_success is not None:
        independence_gate = GateState.SATISFIED
    else:
        independence_gate = GateState.UNKNOWN

    if not retention_required:
        retention_gate = GateState.NOT_APPLICABLE
    elif mastery_success is None:
        retention_gate = GateState.UNKNOWN
    elif retention_conflict:
        retention_gate = GateState.CONFLICTED
    elif retention_success is not None:
        retention_gate = GateState.SATISFIED
    elif retention_failures:
        retention_gate = GateState.FAILED_CURRENTLY
    else:
        retention_gate = GateState.IN_PROGRESS

    if not transfer_required:
        transfer_gate = GateState.NOT_APPLICABLE
    elif mastery_success is None:
        transfer_gate = GateState.UNKNOWN
    elif retention_required and retention_gate != GateState.SATISFIED:
        transfer_gate = GateState.IN_PROGRESS
    elif transfer_conflict:
        transfer_gate = GateState.CONFLICTED
    elif transfer_success is not None:
        transfer_gate = GateState.SATISFIED
    elif transfer_failures:
        transfer_gate = GateState.FAILED_CURRENTLY
    else:
        transfer_gate = GateState.IN_PROGRESS

    gates = {
        "CRITERION_PERFORMANCE": criterion_gate.value,
        "INDEPENDENCE": independence_gate.value,
        "RETENTION": retention_gate.value,
        "TRANSFER": transfer_gate.value,
    }
    required_gates = ["CRITERION_PERFORMANCE"]
    if independence_required:
        required_gates.append("INDEPENDENCE")
    if retention_required:
        required_gates.append("RETENTION")
    if transfer_required:
        required_gates.append("TRANSFER")
    satisfied_required = [g for g in required_gates if gates[g] == GateState.SATISFIED.value]

    counted_set = set(counted)
    distinct_families = sorted({str(a.get("item_family_id")) for a in attempts if _attempt_ref(a) in counted_set})
    required_diversity = 2 if retention_required else 1
    if transfer_required:
        required_diversity = max(required_diversity, 3)
    diversity_sufficient = len(distinct_families) >= required_diversity

    missing_gates = [g for g in required_gates if gates[g] != GateState.SATISFIED.value]
    interpretation_blockers: List[str] = []
    if unverified_accommodation_attempts:
        interpretation_blockers.append("ACCOMMODATION_AUTHORIZATION_UNVERIFIED")
    coverage_standing = (
        "SUFFICIENT"
        if not missing_gates and diversity_sufficient and not interpretation_blockers
        else ("NO_EVIDENCE" if not attempts else "INSUFFICIENT")
    )

    uncertainty_reasons: List[str] = []
    if not attempts:
        uncertainty_reasons.append("NO_OWNER_VALID_EVIDENCE")
    if missing_gates:
        uncertainty_reasons.extend(f"UNSATISFIED_GATE:{g}" for g in missing_gates)
    if not diversity_sufficient:
        uncertainty_reasons.append("EVIDENCE_DIVERSITY_INSUFFICIENT")
    if stale_attempts:
        uncertainty_reasons.append("STALE_EVIDENCE_PRESENT")
    if any(value == ASSISTANCE_UNKNOWN for value in assistance_conditions.values()):
        uncertainty_reasons.append("ASSISTANCE_UNKNOWN")
    if unverified_accommodation_attempts:
        uncertainty_reasons.append("ACCOMMODATION_AUTHORIZATION_UNVERIFIED")
    if mastery_conflict or retention_conflict or transfer_conflict:
        uncertainty_reasons.append("CONTRADICTORY_EVIDENCE")

    conflicts = mastery_conflict or retention_conflict or transfer_conflict
    all_required_satisfied = all(gates[g] == GateState.SATISFIED.value for g in required_gates)
    mastery_ready = all_required_satisfied and not interpretation_blockers

    if conflicts:
        stage = MasteryStage.CONFLICTED_EVIDENCE
    elif not attempts:
        stage = MasteryStage.INSUFFICIENT_EVIDENCE
    elif criterion_gate == GateState.FAILED_CURRENTLY:
        stage = MasteryStage.BUILDING
    elif mastery_success is None:
        stage = MasteryStage.BUILDING
    elif retention_required and retention_gate != GateState.SATISFIED:
        stage = MasteryStage.RETENTION_DUE
    elif transfer_required and transfer_gate != GateState.SATISFIED:
        stage = MasteryStage.RETAINED if retention_gate == GateState.SATISFIED else MasteryStage.BUILDING
    elif mastery_ready:
        stage = MasteryStage.MASTERED
    else:
        stage = MasteryStage.BUILDING

    reasons: List[str] = []
    if not attempts:
        reasons.append("NO_ADMISSIBLE_EVIDENCE")
    if criterion_gate == GateState.FAILED_CURRENTLY:
        reasons.append("MASTERY_CHECK_FAILED")
    if mastery_success is None and attempts:
        reasons.append("INDEPENDENT_MASTERY_EVIDENCE_REQUIRED" if independence_required else "MASTERY_EVIDENCE_REQUIRED")
    if retention_required and mastery_success is not None and retention_gate != GateState.SATISFIED:
        reasons.append("RETENTION_EVIDENCE_REQUIRED")
    if transfer_required and transfer_gate != GateState.SATISFIED:
        reasons.append("TRANSFER_EVIDENCE_REQUIRED")
    if unverified_accommodation_attempts:
        reasons.append("ACCOMMODATION_AUTHORIZATION_REQUIRES_RESOLUTION")
    if conflicts:
        reasons.append("CONTRADICTORY_EVIDENCE_REQUIRES_RECHECK")
    if mastery_ready:
        reasons.append("ALL_REQUIRED_GATES_SATISFIED")
    if any(str(a.get("mode")) == "PRACTICE" for a in attempts) and mastery_success is None:
        reasons.append("PRACTICE_NOT_MASTERY")

    progress = int(round(100 * len(satisfied_required) / max(1, len(required_gates))))
    coverage_percent = int(round(100 * min(len(distinct_families), required_diversity) / max(1, required_diversity)))

    return {
        "stage": stage.value,
        "gate_states": gates,
        "mastery_progress_percent": progress,
        "evidence_coverage_percent": coverage_percent,
        "counted_attempt_ids": counted,
        "excluded_attempts": excluded,
        "reason_codes": sorted(set(reasons)),
        "evidence_coverage": {
            "standing": coverage_standing,
            "required_gates": required_gates,
            "satisfied_gates": satisfied_required,
            "missing_gates": missing_gates,
            "distinct_item_families": distinct_families,
            "required_diverse_families": required_diversity,
            "diversity_sufficient": diversity_sufficient,
            "interpretation_blockers": interpretation_blockers,
        },
        "uncertainty": {
            "standing": "CONFLICTED" if conflicts else ("LOW" if coverage_standing == "SUFFICIENT" else "MATERIAL"),
            "reason_codes": sorted(set(uncertainty_reasons)),
        },
        "assistance_conditions": assistance_conditions,
        "retention": {
            "required": retention_required,
            "delay_seconds": int(retention_delay_seconds),
            "policy_version": policy_version,
            "qualifying_attempt_ids": [_attempt_ref(a) for a in valid_retention],
            "too_early_attempt_ids": retention_too_early,
            "same_family_attempt_ids": retention_same_family,
        },
        "transfer": {
            "required": transfer_required,
            "policy_version": policy_version,
            "qualifying_attempt_ids": [_attempt_ref(a) for a in valid_transfer],
            "non_novel_attempt_ids": transfer_non_novel,
        },
        "independence": {
            "required": independence_required,
            "policy_version": policy_version,
            "accommodation_is_not_scaffold": True,
            "unverified_accommodation_attempt_ids": unverified_accommodation_attempts,
        },
        "stale_attempt_ids": stale_attempts,
        "integrity_rejected_attempt_ids": integrity_rejected,
        "policy_version": policy_version,
        "universal_mastery_threshold": None,
    }
