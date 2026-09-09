from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any, Dict, Mapping, Sequence

from .real_learner_effectiveness_study_design import (
    REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
    validate_effectiveness_study_design,
)


REAL_LEARNER_EFFECTIVENESS_STUDY_EXECUTION_RECEIPT_VERSION = (
    "REAL-LEARNER-EFFECTIVENESS-STUDY-EXECUTION-RECEIPT-V1"
)


class RealLearnerEffectivenessStudyExecutionReceiptError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerEffectivenessStudyExecutionReceiptError(code)


def _mapping(value: Any, code: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _fail(code)
    return value


def _text(value: Any, code: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(code)
    return value.strip()


def _digest(value: Any, code: str) -> str:
    rendered = _text(value, code).lower()
    if not re.fullmatch(r"[0-9a-f]{64}", rendered):
        _fail(code)
    return rendered


def _timestamp(value: Any, code: str) -> datetime:
    rendered = _text(value, code)
    try:
        parsed = datetime.fromisoformat(rendered.replace("Z", "+00:00"))
    except ValueError:
        _fail(code)
    if parsed.tzinfo is None:
        _fail(code)
    return parsed.astimezone(timezone.utc)


def _nonnegative_int(value: Any, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        _fail(code)
    return value


def _positive_int(value: Any, code: str) -> int:
    rendered = _nonnegative_int(value, code)
    if rendered <= 0:
        _fail(code)
    return rendered


def _scan_for_participant_data(value: Any, *, path: str = "root") -> None:
    forbidden_keys = {
        "participant_key",
        "learner_id",
        "raw_response",
        "free_text_response",
        "direct_pii",
        "email",
        "phone",
        "address",
        "full_name",
        "date_of_birth",
    }
    if isinstance(value, Mapping):
        for key, child in value.items():
            if str(key).lower() in forbidden_keys:
                _fail("STUDY_EXECUTION_RECEIPT_PARTICIPANT_DATA_FORBIDDEN:" + path + "." + str(key))
            _scan_for_participant_data(child, path=path + "." + str(key))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for index, child in enumerate(value):
            _scan_for_participant_data(child, path=f"{path}[{index}]")


def canonical_study_plan_digest(study_plan: Mapping[str, Any]) -> str:
    rendered = json.dumps(study_plan, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(rendered.encode("utf-8")).hexdigest()


def _validate_flow(receipt: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    flow = _mapping(receipt.get("flow"), "STUDY_EXECUTION_RECEIPT_FLOW_REQUIRED")
    screened = _nonnegative_int(flow.get("screened_count"), "STUDY_EXECUTION_RECEIPT_SCREENED_COUNT_INVALID")
    enrolled = _positive_int(flow.get("enrolled_count"), "STUDY_EXECUTION_RECEIPT_ENROLLED_COUNT_INVALID")
    assigned = _nonnegative_int(flow.get("assigned_count"), "STUDY_EXECUTION_RECEIPT_ASSIGNED_COUNT_INVALID")
    pre_assignment_exclusions = _nonnegative_int(
        flow.get("pre_assignment_exclusion_count"),
        "STUDY_EXECUTION_RECEIPT_PRE_ASSIGNMENT_EXCLUSION_COUNT_INVALID",
    )
    analysis_denominator = _positive_int(
        flow.get("analysis_denominator_count"),
        "STUDY_EXECUTION_RECEIPT_ANALYSIS_DENOMINATOR_INVALID",
    )
    observed = _nonnegative_int(
        flow.get("primary_outcome_observed_count"),
        "STUDY_EXECUTION_RECEIPT_PRIMARY_OUTCOME_OBSERVED_INVALID",
    )
    missing = _nonnegative_int(
        flow.get("primary_outcome_missing_count"),
        "STUDY_EXECUTION_RECEIPT_PRIMARY_OUTCOME_MISSING_INVALID",
    )

    if screened < enrolled:
        _fail("STUDY_EXECUTION_RECEIPT_SCREENED_BELOW_ENROLLED")
    if pre_assignment_exclusions != enrolled - assigned and causal:
        _fail("STUDY_EXECUTION_RECEIPT_PRE_ASSIGNMENT_EXCLUSIONS_INCONSISTENT")
    expected_denominator = assigned if causal else enrolled
    if analysis_denominator != expected_denominator:
        _fail("STUDY_EXECUTION_RECEIPT_ANALYSIS_DENOMINATOR_MISMATCH")
    if observed + missing != analysis_denominator:
        _fail("STUDY_EXECUTION_RECEIPT_PRIMARY_OUTCOME_ACCOUNTING_INCOMPLETE")

    groups = _mapping(flow.get("groups"), "STUDY_EXECUTION_RECEIPT_GROUP_FLOW_REQUIRED")
    if not groups:
        _fail("STUDY_EXECUTION_RECEIPT_GROUP_FLOW_REQUIRED")
    denominator_sum = 0
    observed_sum = 0
    missing_sum = 0
    normalized_groups: Dict[str, Dict[str, int]] = {}
    for group_id, value in sorted(groups.items()):
        group_key = _text(group_id, "STUDY_EXECUTION_RECEIPT_GROUP_ID_INVALID")
        group = _mapping(value, "STUDY_EXECUTION_RECEIPT_GROUP_INVALID")
        denominator = _positive_int(
            group.get("denominator_count"),
            "STUDY_EXECUTION_RECEIPT_GROUP_DENOMINATOR_INVALID",
        )
        group_observed = _nonnegative_int(
            group.get("primary_outcome_observed_count"),
            "STUDY_EXECUTION_RECEIPT_GROUP_OBSERVED_INVALID",
        )
        group_missing = _nonnegative_int(
            group.get("primary_outcome_missing_count"),
            "STUDY_EXECUTION_RECEIPT_GROUP_MISSING_INVALID",
        )
        if group_observed + group_missing != denominator:
            _fail("STUDY_EXECUTION_RECEIPT_GROUP_OUTCOME_ACCOUNTING_INCOMPLETE")
        denominator_sum += denominator
        observed_sum += group_observed
        missing_sum += group_missing
        normalized_groups[group_key] = {
            "denominator_count": denominator,
            "primary_outcome_observed_count": group_observed,
            "primary_outcome_missing_count": group_missing,
        }
    if denominator_sum != analysis_denominator or observed_sum != observed or missing_sum != missing:
        _fail("STUDY_EXECUTION_RECEIPT_GROUP_TOTALS_MISMATCH")
    if causal and len(normalized_groups) < 2:
        _fail("STUDY_EXECUTION_RECEIPT_CAUSAL_REQUIRES_AT_LEAST_TWO_GROUPS")

    missing_reasons = _mapping(
        flow.get("missing_primary_outcome_reasons"),
        "STUDY_EXECUTION_RECEIPT_MISSING_REASON_ACCOUNTING_REQUIRED",
    )
    missing_reason_total = 0
    normalized_reasons: Dict[str, int] = {}
    for reason, count in sorted(missing_reasons.items()):
        reason_key = _text(reason, "STUDY_EXECUTION_RECEIPT_MISSING_REASON_INVALID")
        reason_count = _nonnegative_int(count, "STUDY_EXECUTION_RECEIPT_MISSING_REASON_COUNT_INVALID")
        missing_reason_total += reason_count
        normalized_reasons[reason_key] = reason_count
    if missing_reason_total != missing:
        _fail("STUDY_EXECUTION_RECEIPT_MISSING_REASON_TOTAL_MISMATCH")

    return {
        "screened_count": screened,
        "enrolled_count": enrolled,
        "assigned_count": assigned,
        "pre_assignment_exclusion_count": pre_assignment_exclusions,
        "analysis_denominator_count": analysis_denominator,
        "primary_outcome_observed_count": observed,
        "primary_outcome_missing_count": missing,
        "groups": normalized_groups,
        "missing_primary_outcome_reasons": normalized_reasons,
    }


def _validate_amendments(
    receipt: Mapping[str, Any],
    *,
    first_primary_outcome_access_at: datetime,
) -> Dict[str, Any]:
    amendments = receipt.get("amendments", [])
    if isinstance(amendments, (str, bytes)) or not isinstance(amendments, Sequence):
        _fail("STUDY_EXECUTION_RECEIPT_AMENDMENTS_INVALID")
    post_outcome_primary_analysis_change = False
    normalized = []
    seen_ids = set()
    for amendment in amendments:
        amendment = _mapping(amendment, "STUDY_EXECUTION_RECEIPT_AMENDMENT_INVALID")
        amendment_id = _text(amendment.get("amendment_id"), "STUDY_EXECUTION_RECEIPT_AMENDMENT_ID_REQUIRED")
        if amendment_id in seen_ids:
            _fail("STUDY_EXECUTION_RECEIPT_DUPLICATE_AMENDMENT_ID")
        seen_ids.add(amendment_id)
        scope = _text(amendment.get("scope"), "STUDY_EXECUTION_RECEIPT_AMENDMENT_SCOPE_REQUIRED")
        effective_at = _timestamp(
            amendment.get("effective_at"),
            "STUDY_EXECUTION_RECEIPT_AMENDMENT_TIME_REQUIRED",
        )
        amendment_digest = _digest(
            amendment.get("amendment_digest"),
            "STUDY_EXECUTION_RECEIPT_AMENDMENT_DIGEST_REQUIRED",
        )
        _text(amendment.get("reason_ref"), "STUDY_EXECUTION_RECEIPT_AMENDMENT_REASON_REQUIRED")
        if scope == "PRIMARY_ANALYSIS_PLAN" and effective_at > first_primary_outcome_access_at:
            post_outcome_primary_analysis_change = True
        normalized.append(
            {
                "amendment_id": amendment_id,
                "scope": scope,
                "effective_at": effective_at.isoformat(),
                "amendment_digest": amendment_digest,
            }
        )
    return {
        "count": len(normalized),
        "post_outcome_primary_analysis_change": post_outcome_primary_analysis_change,
        "entries": normalized,
    }


def validate_study_execution_receipt(
    *,
    study_plan: Mapping[str, Any],
    receipt: Mapping[str, Any],
) -> Dict[str, Any]:
    study_plan = _mapping(study_plan, "STUDY_EXECUTION_RECEIPT_STUDY_PLAN_REQUIRED")
    receipt = _mapping(receipt, "STUDY_EXECUTION_RECEIPT_REQUIRED")
    _scan_for_participant_data(receipt)

    design = validate_effectiveness_study_design(study_plan)
    version = _text(receipt.get("receipt_version"), "STUDY_EXECUTION_RECEIPT_VERSION_REQUIRED")
    if version != REAL_LEARNER_EFFECTIVENESS_STUDY_EXECUTION_RECEIPT_VERSION:
        _fail("STUDY_EXECUTION_RECEIPT_VERSION_MISMATCH")
    study_id = _text(receipt.get("study_id"), "STUDY_EXECUTION_RECEIPT_STUDY_ID_REQUIRED")
    if study_id != design["study_id"]:
        _fail("STUDY_EXECUTION_RECEIPT_STUDY_ID_MISMATCH")

    expected_plan_digest = canonical_study_plan_digest(study_plan)
    plan_digest = _digest(receipt.get("study_plan_digest"), "STUDY_EXECUTION_RECEIPT_PLAN_DIGEST_REQUIRED")
    if plan_digest != expected_plan_digest:
        _fail("STUDY_EXECUTION_RECEIPT_PLAN_DIGEST_MISMATCH")

    binding = _mapping(receipt.get("binding"), "STUDY_EXECUTION_RECEIPT_BINDING_REQUIRED")
    if _text(binding.get("study_design_version"), "STUDY_EXECUTION_RECEIPT_DESIGN_VERSION_REQUIRED") != REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION:
        _fail("STUDY_EXECUTION_RECEIPT_DESIGN_VERSION_MISMATCH")
    if _text(binding.get("intervention_subject_sha"), "STUDY_EXECUTION_RECEIPT_INTERVENTION_SHA_REQUIRED").lower() != design["intervention"]["subject_sha"]:
        _fail("STUDY_EXECUTION_RECEIPT_INTERVENTION_SHA_MISMATCH")
    if _digest(binding.get("runtime_binding_digest"), "STUDY_EXECUTION_RECEIPT_RUNTIME_DIGEST_REQUIRED") != design["intervention"]["runtime_binding_digest"]:
        _fail("STUDY_EXECUTION_RECEIPT_RUNTIME_DIGEST_MISMATCH")
    if _digest(binding.get("protocol_digest"), "STUDY_EXECUTION_RECEIPT_PROTOCOL_DIGEST_REQUIRED") != design["protocol"]["protocol_digest"]:
        _fail("STUDY_EXECUTION_RECEIPT_PROTOCOL_DIGEST_MISMATCH")
    if _digest(binding.get("analysis_plan_digest"), "STUDY_EXECUTION_RECEIPT_ANALYSIS_DIGEST_REQUIRED") != design["protocol"]["analysis_plan_digest"]:
        _fail("STUDY_EXECUTION_RECEIPT_ANALYSIS_DIGEST_MISMATCH")

    governance_ref = _text(receipt.get("governance_authority_ref"), "STUDY_EXECUTION_RECEIPT_GOVERNANCE_REF_REQUIRED")
    if governance_ref != _text(study_plan["governance"].get("authority_ref"), "STUDY_EXECUTION_RECEIPT_PLAN_GOVERNANCE_REF_REQUIRED"):
        _fail("STUDY_EXECUTION_RECEIPT_GOVERNANCE_REF_MISMATCH")

    execution = _mapping(receipt.get("execution"), "STUDY_EXECUTION_RECEIPT_EXECUTION_TIMES_REQUIRED")
    started_at = _timestamp(execution.get("started_at"), "STUDY_EXECUTION_RECEIPT_STARTED_AT_REQUIRED")
    completed_at = _timestamp(execution.get("completed_at"), "STUDY_EXECUTION_RECEIPT_COMPLETED_AT_REQUIRED")
    first_outcome_at = _timestamp(
        execution.get("first_primary_outcome_access_at"),
        "STUDY_EXECUTION_RECEIPT_FIRST_OUTCOME_ACCESS_REQUIRED",
    )
    protocol_frozen_at = _timestamp(study_plan["protocol"].get("frozen_at"), "STUDY_EXECUTION_RECEIPT_PLAN_FROZEN_AT_REQUIRED")
    if started_at < protocol_frozen_at:
        _fail("STUDY_EXECUTION_RECEIPT_STARTED_BEFORE_PROTOCOL_FREEZE")
    if completed_at < started_at:
        _fail("STUDY_EXECUTION_RECEIPT_COMPLETION_PRECEDES_START")
    if first_outcome_at < started_at or first_outcome_at > completed_at:
        _fail("STUDY_EXECUTION_RECEIPT_OUTCOME_ACCESS_OUTSIDE_EXECUTION")

    causal = design["claim_target"] == "CAUSAL_EFFECTIVENESS"
    flow = _validate_flow(receipt, causal=causal)

    identity = _mapping(receipt.get("identity_authority"), "STUDY_EXECUTION_RECEIPT_IDENTITY_AUTHORITY_REQUIRED")
    authority_ref = _text(identity.get("authority_ref"), "STUDY_EXECUTION_RECEIPT_IDENTITY_AUTHORITY_REF_REQUIRED")
    attestation_digest = _digest(
        identity.get("attestation_digest"),
        "STUDY_EXECUTION_RECEIPT_IDENTITY_ATTESTATION_DIGEST_REQUIRED",
    )
    verified_unique_units = _positive_int(
        identity.get("verified_unique_unit_count"),
        "STUDY_EXECUTION_RECEIPT_UNIQUE_UNIT_COUNT_INVALID",
    )
    if verified_unique_units != flow["analysis_denominator_count"]:
        _fail("STUDY_EXECUTION_RECEIPT_UNIQUE_UNIT_COUNT_MISMATCH")
    if causal:
        expected_identity_ref = _text(
            study_plan["identity_independence"].get("unique_human_authority_ref"),
            "STUDY_EXECUTION_RECEIPT_PLAN_UNIQUE_HUMAN_AUTHORITY_REQUIRED",
        )
        if authority_ref != expected_identity_ref:
            _fail("STUDY_EXECUTION_RECEIPT_IDENTITY_AUTHORITY_MISMATCH")

    evidence = _mapping(receipt.get("evidence"), "STUDY_EXECUTION_RECEIPT_EVIDENCE_REQUIRED")
    normalized_evidence = {
        "primary_outcome_dataset_digest": _digest(
            evidence.get("primary_outcome_dataset_digest"),
            "STUDY_EXECUTION_RECEIPT_OUTCOME_DATASET_DIGEST_REQUIRED",
        ),
        "scoring_implementation_digest": _digest(
            evidence.get("scoring_implementation_digest"),
            "STUDY_EXECUTION_RECEIPT_SCORING_DIGEST_REQUIRED",
        ),
        "participant_flow_digest": _digest(
            evidence.get("participant_flow_digest"),
            "STUDY_EXECUTION_RECEIPT_FLOW_DIGEST_REQUIRED",
        ),
        "protocol_deviation_digest": _digest(
            evidence.get("protocol_deviation_digest"),
            "STUDY_EXECUTION_RECEIPT_DEVIATION_DIGEST_REQUIRED",
        ),
    }
    allocation_audit = evidence.get("allocation_audit_digest")
    if causal:
        normalized_evidence["allocation_audit_digest"] = _digest(
            allocation_audit,
            "STUDY_EXECUTION_RECEIPT_ALLOCATION_AUDIT_DIGEST_REQUIRED",
        )
    elif allocation_audit not in (None, ""):
        normalized_evidence["allocation_audit_digest"] = _digest(
            allocation_audit,
            "STUDY_EXECUTION_RECEIPT_ALLOCATION_AUDIT_DIGEST_INVALID",
        )

    incidents = _mapping(receipt.get("incidents"), "STUDY_EXECUTION_RECEIPT_INCIDENTS_REQUIRED")
    contamination_count = _nonnegative_int(
        incidents.get("assistance_or_contamination_count"),
        "STUDY_EXECUTION_RECEIPT_CONTAMINATION_COUNT_INVALID",
    )
    protocol_deviation_count = _nonnegative_int(
        incidents.get("protocol_deviation_count"),
        "STUDY_EXECUTION_RECEIPT_PROTOCOL_DEVIATION_COUNT_INVALID",
    )
    _bool_value = incidents.get("all_incidents_preserved")
    if _bool_value is not True:
        _fail("STUDY_EXECUTION_RECEIPT_INCIDENTS_NOT_FULLY_PRESERVED")

    amendments = _validate_amendments(
        receipt,
        first_primary_outcome_access_at=first_outcome_at,
    )

    if amendments["post_outcome_primary_analysis_change"]:
        standing = "EXECUTION_RECEIPT_POST_OUTCOME_ANALYSIS_CHANGE_DESCRIPTIVE_ONLY"
        prospective_analysis_intact = False
    elif causal:
        standing = "EXECUTION_RECEIPT_READY_FOR_PRESPECIFIED_CAUSAL_ANALYSIS"
        prospective_analysis_intact = True
    else:
        standing = "EXECUTION_RECEIPT_READY_FOR_FEASIBILITY_ANALYSIS"
        prospective_analysis_intact = True

    return {
        "execution_receipt_version": REAL_LEARNER_EFFECTIVENESS_STUDY_EXECUTION_RECEIPT_VERSION,
        "study_id": study_id,
        "claim_target": design["claim_target"],
        "receipt_standing": standing,
        "study_plan_digest": expected_plan_digest,
        "binding": {
            "intervention_subject_sha": design["intervention"]["subject_sha"],
            "runtime_binding_digest": design["intervention"]["runtime_binding_digest"],
            "protocol_digest": design["protocol"]["protocol_digest"],
            "analysis_plan_digest": design["protocol"]["analysis_plan_digest"],
        },
        "flow": flow,
        "identity_authority": {
            "authority_ref": authority_ref,
            "attestation_digest": attestation_digest,
            "verified_unique_unit_count": verified_unique_units,
            "direct_identity_in_receipt": False,
        },
        "evidence": normalized_evidence,
        "incidents": {
            "assistance_or_contamination_count": contamination_count,
            "protocol_deviation_count": protocol_deviation_count,
            "all_incidents_preserved": True,
        },
        "amendments": amendments,
        "analysis_admission": {
            "prospective_primary_analysis_intact": prospective_analysis_intact,
            "inferential_calculation_performed": False,
        },
        "claims": {
            "receipt_structurally_valid": True,
            "human_execution_independently_verified_by_this_validator": False,
            "learning_effectiveness_proven": False,
            "causal_effect_proven": False,
            "population_generalization_proven": False,
            "psychometric_validity_proven": False,
            "external_standard_compliance_proven": False,
        },
        "truth_boundary": {
            "execution_receipt_is_not_effect_estimate": True,
            "receipt_validation_does_not_prove_real_human_identity": True,
            "identity_authority_is_external_to_minimized_receipt": True,
            "post_outcome_primary_analysis_change_blocks_prospective_causal_standing": True,
            "synthetic_test_receipts_are_not_human_evidence": True,
        },
    }
