from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from .mastery_conditions import MASTERY_CONDITION_POLICY_VERSION, evaluate_mastery_conditions
from .mastery_evidence_reader import validated_attempts_for_skill
from .models import GateState, MasteryProjection, MasteryStage


S04_ADAPTIVE_MASTERY_BINDING_VERSION = "001M-S04-ADAPTIVE-CONSUMES-S03-V2"


def _latest_correct(attempts, attempt_ids):
    allowed = set(attempt_ids)
    values = [a for a in attempts if a.get("attempt_id") in allowed and bool(a.get("correct"))]
    return max(values, key=lambda a: int(a.get("submitted_at", 0)), default=None)


def _s03_bound_compute_projection(self, learner_id: str, course_id: str, skill_id: str, now: int) -> Dict[str, Any]:
    """Adaptive projection view bound to the qualified S03 mastery evaluator.

    Adaptation may add freshness/revalidation standing after S03 evaluates evidence,
    but it may not redefine evidence, independence, retention, transfer, assistance,
    uncertainty, coverage, or historical as-of semantics.
    """
    all_attempts = validated_attempts_for_skill(self.repo, learner_id, course_id, skill_id)
    as_of = int(now)
    attempts = [a for a in all_attempts if int(a.get("submitted_at", 0)) <= as_of]
    future_attempt_ids = sorted(
        str(a.get("attempt_id"))
        for a in all_attempts
        if int(a.get("submitted_at", 0)) > as_of
    )
    transfer_required = bool(self._transfer_required(skill_id))
    evaluated = evaluate_mastery_conditions(
        attempts,
        retention_delay_seconds=int(self.RETENTION_DELAY_SECONDS),
        retention_required=True,
        transfer_required=transfer_required,
        independence_required=True,
        policy_version=MASTERY_CONDITION_POLICY_VERSION,
    )

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
    return body


def install_s04_adaptive_mastery_binding() -> None:
    from .adaptive import AdaptiveLearningEngine

    if getattr(AdaptiveLearningEngine, "_s04_s03_mastery_binding_installed", False):
        return
    AdaptiveLearningEngine._s04_prebinding_compute_projection = AdaptiveLearningEngine._compute_projection
    AdaptiveLearningEngine._compute_projection = _s03_bound_compute_projection
    AdaptiveLearningEngine._s04_s03_mastery_binding_installed = True
