from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, Iterable, List, Mapping, Tuple

from .mastery_conditions import MASTERY_CONDITION_POLICY_VERSION, evaluate_mastery_conditions
from .mastery_evidence_reader import validated_attempts_for_skill
from .models import GateState, MasteryProjection, MasteryStage


S04_ADAPTIVE_MASTERY_BINDING_VERSION = "001M-S04-ADAPTIVE-CONSUMES-S03-V5"


def _latest_correct(attempts, attempt_ids):
    allowed = set(attempt_ids)
    values = [a for a in attempts if a.get("attempt_id") in allowed and bool(a.get("correct"))]
    return max(values, key=lambda a: int(a.get("submitted_at", 0)), default=None)


def _material_transfer_task(task: Mapping[str, Any] | None) -> bool:
    if not task:
        return False
    novelty = task.get("novelty")
    if isinstance(novelty, str):
        return novelty.upper() in {"MATERIALLY_NOVEL", "NOVEL_CONTEXT"}
    if not isinstance(novelty, Mapping):
        return False
    # Versioned transfer-task catalogs use bounded domain-specific novelty fields:
    # booleans in some domains and explicit context/item-family declarations in
    # open domains. A non-empty admitted novelty contract is the Curriculum fact;
    # S04 only translates it to the S03 evaluator's normalized novelty standing.
    return bool(novelty)


def _copy_with_authoritative_transfer_context(self, attempts: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Translate frozen Curriculum transfer-task metadata into S03 evidence input.

    Historical adaptive attempts intentionally stored the task identity, while the
    materially-novel declaration remained on the versioned transfer task. S03
    requires novelty to be explicit at evaluation time. This bridge reads that
    already-admitted task metadata and enriches only the in-memory evaluation copy;
    it does not rewrite attempt evidence or create a new mastery authority.
    """
    values: List[Dict[str, Any]] = []
    for original in attempts:
        attempt = dict(original)
        if str(attempt.get("mode")) == "TRANSFER_CHECK" and not attempt.get("transfer_novelty"):
            task = self.repo.get_object("transfer_task", str(attempt.get("item_id", "")), 1)
            if _material_transfer_task(task):
                attempt["transfer_novelty"] = "MATERIALLY_NOVEL"
                attempt["transfer_context_id"] = str(attempt.get("item_id", ""))
        values.append(attempt)
    return values


def _mark_adaptive_freshness_exclusions(
    attempts: List[Dict[str, Any]],
    *,
    retention_qualified_ids: Iterable[str],
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """Apply adaptive freshness fences without changing S03 gate semantics.

    S03 decides whether evidence is admissible for mastery conditions. S04 adds the
    already-frozen adaptive rule that repeating the same successful retention family
    is not fresh maintenance evidence, and that transfer evidence must be current to
    the latest qualifying retention and use an uncompromised transfer family.
    """
    values = [dict(a) for a in attempts]
    seen_successful_retention_families = set()
    qualified = set(str(x) for x in retention_qualified_ids)
    exclusions: Dict[str, str] = {}
    for attempt in values:
        aid = str(attempt.get("attempt_id", ""))
        if aid not in qualified or not bool(attempt.get("correct")):
            continue
        family = str(attempt.get("item_family_id", ""))
        if family in seen_successful_retention_families:
            attempt["evidence_standing"] = "STALE"
            exclusions[aid] = "REPEATED_RETENTION_FAMILY_NOT_FRESH"
        else:
            seen_successful_retention_families.add(family)
    return values, exclusions


def _mark_transfer_freshness_exclusions(
    attempts: List[Dict[str, Any]],
    *,
    current_retention: Mapping[str, Any] | None,
    exclusions: Dict[str, str],
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    values = [dict(a) for a in attempts]
    compromised_families = {
        str(a.get("item_family_id", ""))
        for a in values
        if str(a.get("mode")) == "TRANSFER_CHECK"
        and (
            not bool(a.get("correct"))
            or bool(a.get("assisted"))
            or bool(a.get("answer_revealed_before_commit"))
        )
    }
    current_retention_time = (
        int(current_retention.get("submitted_at", 0)) if current_retention is not None else None
    )

    for attempt in values:
        if str(attempt.get("mode")) != "TRANSFER_CHECK":
            continue
        aid = str(attempt.get("attempt_id", ""))
        if not bool(attempt.get("correct")):
            continue
        if bool(attempt.get("assisted")) or bool(attempt.get("answer_revealed_before_commit")):
            continue
        family = str(attempt.get("item_family_id", ""))
        submitted_at = int(attempt.get("submitted_at", 0))
        if family in compromised_families:
            attempt["evidence_standing"] = "STALE"
            exclusions[aid] = "EXPOSED_TRANSFER_FAMILY_CANNOT_QUALIFY_AFTER_FAILURE"
        elif current_retention_time is not None and submitted_at < current_retention_time:
            attempt["evidence_standing"] = "STALE"
            exclusions[aid] = "TRANSFER_BEFORE_CURRENT_RETENTION"

    return values, exclusions


def _s03_bound_compute_projection(
    self,
    learner_id: str,
    course_id: str,
    skill_id: str,
    *,
    now: int,
    persist: bool = False,
) -> Dict[str, Any]:
    """Adaptive projection view bound to the qualified S03 mastery evaluator.

    Adaptation may add freshness/revalidation standing after S03 evaluates evidence,
    but it may not redefine evidence, independence, retention, transfer, assistance,
    uncertainty, coverage, or historical as-of semantics. The existing adaptive
    runtime persist contract is preserved: persistence stores only this S03-derived
    projection and does not restore the copied adaptive mastery calculation.
    """
    all_attempts = validated_attempts_for_skill(self.repo, learner_id, course_id, skill_id)
    as_of = int(now)
    attempts = [dict(a) for a in all_attempts if int(a.get("submitted_at", 0)) <= as_of]
    future_attempt_ids = sorted(
        str(a.get("attempt_id"))
        for a in all_attempts
        if int(a.get("submitted_at", 0)) > as_of
    )
    attempts = _copy_with_authoritative_transfer_context(self, attempts)
    transfer_required = bool(self._transfer_required(skill_id))

    def evaluate(values):
        return evaluate_mastery_conditions(
            values,
            retention_delay_seconds=int(self.RETENTION_DELAY_SECONDS),
            retention_required=True,
            transfer_required=transfer_required,
            independence_required=True,
            policy_version=MASTERY_CONDITION_POLICY_VERSION,
        )

    preliminary = evaluate(attempts)
    attempts, adaptive_exclusions = _mark_adaptive_freshness_exclusions(
        attempts,
        retention_qualified_ids=preliminary["retention"]["qualifying_attempt_ids"],
    )
    retention_evaluation = evaluate(attempts)
    current_retention = _latest_correct(
        attempts,
        retention_evaluation["retention"]["qualifying_attempt_ids"],
    )
    attempts, adaptive_exclusions = _mark_transfer_freshness_exclusions(
        attempts,
        current_retention=current_retention,
        exclusions=adaptive_exclusions,
    )
    evaluated = evaluate(attempts)
    evaluated["excluded_attempts"].update(adaptive_exclusions)

    stage = evaluated["stage"]
    gates = dict(evaluated["gate_states"])
    reasons = set(evaluated["reason_codes"])

    retention_success = _latest_correct(attempts, evaluated["retention"]["qualifying_attempt_ids"])
    retention_stale = bool(
        retention_success is not None
        and as_of - int(retention_success.get("submitted_at", 0)) > int(self.RETENTION_FRESHNESS_SECONDS)
    )
    if retention_stale and gates.get("RETENTION") == GateState.SATISFIED.value:
        gates["RETENTION"] = GateState.STALE.value
        stage = MasteryStage.REVALIDATION_DUE.value
        reasons.update({"RETENTION_STALE", "REVALIDATION_REQUIRED"})

    transfer_success = _latest_correct(attempts, evaluated["transfer"]["qualifying_attempt_ids"])
    transfer_stale = bool(
        transfer_required
        and transfer_success is not None
        and as_of - int(transfer_success.get("submitted_at", 0)) > int(self.TRANSFER_FRESHNESS_SECONDS)
    )
    if transfer_stale and gates.get("TRANSFER") == GateState.SATISFIED.value and not retention_stale:
        gates["TRANSFER"] = GateState.STALE.value
        stage = MasteryStage.RETAINED.value
        reasons.update({"TRANSFER_STALE", "FRESH_TRANSFER_REQUIRED"})

    projection = MasteryProjection(
        learner_id=learner_id,
        course_id=course_id,
        skill_id=skill_id,
        stage=stage,
        gate_states=gates,
        mastery_progress_percent=evaluated["mastery_progress_percent"],
        evidence_coverage_percent=evaluated["evidence_coverage_percent"],
        counted_attempt_ids=evaluated["counted_attempt_ids"],
        excluded_attempts=evaluated["excluded_attempts"],
        reason_codes=sorted(reasons),
    )
    body = asdict(projection)
    body.update({
        "evidence_coverage": evaluated["evidence_coverage"],
        "uncertainty": evaluated["uncertainty"],
        "assistance_conditions": evaluated["assistance_conditions"],
        "retention": evaluated["retention"],
        "transfer": evaluated["transfer"],
        "independence": evaluated["independence"],
        "stale_attempt_ids": evaluated["stale_attempt_ids"],
        "integrity_rejected_attempt_ids": evaluated["integrity_rejected_attempt_ids"],
        "mastery_condition_policy_version": evaluated["policy_version"],
        "universal_mastery_threshold": None,
        "retention_stale": retention_stale,
        "transfer_stale": transfer_stale,
        "adaptive_mastery_binding_version": S04_ADAPTIVE_MASTERY_BINDING_VERSION,
        "adaptive_is_mastery_authority": False,
        "mastery_authority": "S03_EVIDENCE_MASTERY_EVALUATOR",
        "projection_as_of": as_of,
        "future_attempt_ids_excluded": future_attempt_ids,
    })
    if persist:
        self.repo.append_projection(learner_id, course_id, skill_id, body)
        self.repo.emit("MasteryChanged", f"{learner_id}:{course_id}:{skill_id}", body)
    return body


def install_s04_adaptive_mastery_binding() -> None:
    from .adaptive import AdaptiveLearningEngine

    if getattr(AdaptiveLearningEngine, "_s04_s03_mastery_binding_installed", False):
        return
    AdaptiveLearningEngine._s04_prebinding_compute_projection = AdaptiveLearningEngine._compute_projection
    AdaptiveLearningEngine._compute_projection = _s03_bound_compute_projection
    AdaptiveLearningEngine._s04_s03_mastery_binding_installed = True
