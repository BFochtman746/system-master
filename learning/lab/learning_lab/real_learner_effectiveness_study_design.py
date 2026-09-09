from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any, Dict, Iterable, Mapping, Sequence


REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION = "REAL-LEARNER-EFFECTIVENESS-STUDY-DESIGN-V1"


class RealLearnerEffectivenessStudyDesignError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerEffectivenessStudyDesignError(code)


def _mapping(value: Any, code: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _fail(code)
    return value


def _text(value: Any, code: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(code)
    return value.strip()


def _bool(value: Any, expected: bool, code: str) -> None:
    if value is not expected:
        _fail(code)


def _list_of_text(value: Any, code: str, *, allow_empty: bool = False) -> Sequence[str]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        _fail(code)
    rendered = []
    for item in value:
        rendered.append(_text(item, code))
    if not rendered and not allow_empty:
        _fail(code)
    return rendered


def _digest(value: Any, code: str, length: int = 64) -> str:
    rendered = _text(value, code).lower()
    if not re.fullmatch(rf"[0-9a-f]{{{length}}}", rendered):
        _fail(code)
    return rendered


def _sha(value: Any, code: str) -> str:
    rendered = _text(value, code).lower()
    if not re.fullmatch(r"[0-9a-f]{40}", rendered):
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


def _positive_int(value: Any, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        _fail(code)
    return value


def _scan_for_participant_data(value: Any, *, path: str = "root") -> None:
    forbidden_keys = {
        "participant_key",
        "learner_id",
        "raw_response",
        "free_text_response",
        "email",
        "phone",
        "address",
        "name",
        "date_of_birth",
    }
    if isinstance(value, Mapping):
        for key, child in value.items():
            if str(key).lower() in forbidden_keys:
                _fail("STUDY_DESIGN_PARTICIPANT_DATA_FORBIDDEN:" + path + "." + str(key))
            _scan_for_participant_data(child, path=path + "." + str(key))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for index, child in enumerate(value):
            _scan_for_participant_data(child, path=f"{path}[{index}]")


def _validate_governance(plan: Mapping[str, Any]) -> Dict[str, Any]:
    governance = _mapping(plan.get("governance"), "STUDY_DESIGN_GOVERNANCE_REQUIRED")
    status = _text(governance.get("status"), "STUDY_DESIGN_GOVERNANCE_STATUS_REQUIRED")
    allowed = {"APPROVED", "NOT_REQUIRED_BY_EXTERNAL_AUTHORITY"}
    if status not in allowed:
        _fail("STUDY_DESIGN_GOVERNANCE_NOT_RESOLVED")
    authority_ref = _text(governance.get("authority_ref"), "STUDY_DESIGN_GOVERNANCE_AUTHORITY_REQUIRED")
    _bool(governance.get("software_self_approved"), False, "STUDY_DESIGN_SOFTWARE_CANNOT_SELF_APPROVE_GOVERNANCE")
    return {"status": status, "authority_ref_present": bool(authority_ref)}


def _validate_protocol(plan: Mapping[str, Any]) -> Dict[str, Any]:
    protocol = _mapping(plan.get("protocol"), "STUDY_DESIGN_PROTOCOL_REQUIRED")
    protocol_version = _text(protocol.get("version"), "STUDY_DESIGN_PROTOCOL_VERSION_REQUIRED")
    protocol_digest = _digest(protocol.get("protocol_digest"), "STUDY_DESIGN_PROTOCOL_DIGEST_REQUIRED")
    analysis_plan_digest = _digest(protocol.get("analysis_plan_digest"), "STUDY_DESIGN_ANALYSIS_PLAN_DIGEST_REQUIRED")
    frozen_at = _timestamp(protocol.get("frozen_at"), "STUDY_DESIGN_PROTOCOL_FROZEN_AT_REQUIRED")
    first_outcome = protocol.get("first_outcome_access_at")
    if first_outcome not in (None, ""):
        first_outcome_at = _timestamp(first_outcome, "STUDY_DESIGN_FIRST_OUTCOME_ACCESS_INVALID")
        if frozen_at > first_outcome_at:
            _fail("STUDY_DESIGN_ANALYSIS_PLAN_NOT_PROSPECTIVE")
    amendment_policy = _text(protocol.get("amendment_policy"), "STUDY_DESIGN_AMENDMENT_POLICY_REQUIRED")
    if amendment_policy != "VERSIONED_AUDIT_TRAIL":
        _fail("STUDY_DESIGN_AMENDMENT_AUDIT_TRAIL_REQUIRED")
    return {
        "protocol_version": protocol_version,
        "protocol_digest": protocol_digest,
        "analysis_plan_digest": analysis_plan_digest,
        "prospective_freeze_verified": True,
    }


def _validate_population(plan: Mapping[str, Any]) -> Dict[str, Any]:
    population = _mapping(plan.get("population"), "STUDY_DESIGN_POPULATION_REQUIRED")
    recruitment_frame = _text(population.get("recruitment_frame"), "STUDY_DESIGN_RECRUITMENT_FRAME_REQUIRED")
    inclusion = _list_of_text(population.get("inclusion_criteria"), "STUDY_DESIGN_INCLUSION_CRITERIA_REQUIRED")
    exclusion = _list_of_text(
        population.get("exclusion_criteria"),
        "STUDY_DESIGN_EXCLUSION_CRITERIA_INVALID",
        allow_empty=True,
    )
    sites = _list_of_text(population.get("site_plan"), "STUDY_DESIGN_SITE_PLAN_REQUIRED")
    return {
        "recruitment_frame": recruitment_frame,
        "inclusion_criteria_count": len(inclusion),
        "exclusion_criteria_count": len(exclusion),
        "planned_site_count": len(sites),
    }


def _validate_outcome(plan: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    outcome = _mapping(plan.get("primary_outcome"), "STUDY_DESIGN_PRIMARY_OUTCOME_REQUIRED")
    required_text = (
        "outcome_id",
        "construct",
        "timepoint",
        "intended_interpretation",
        "measure_version",
        "scoring_version",
        "validity_evidence_ref",
        "reliability_or_scoring_evidence_ref",
        "overalignment_review_ref",
    )
    for key in required_text:
        _text(outcome.get(key), "STUDY_DESIGN_PRIMARY_OUTCOME_FIELD_REQUIRED:" + key)
    if causal:
        _bool(
            outcome.get("independent_assessment"),
            True,
            "STUDY_DESIGN_CAUSAL_OUTCOME_MUST_BE_INDEPENDENTLY_ASSESSED",
        )
    return {
        "outcome_id": outcome["outcome_id"],
        "construct": outcome["construct"],
        "timepoint": outcome["timepoint"],
        "validity_use_evidence_declared": True,
        "reliability_or_scoring_evidence_declared": True,
        "overalignment_review_declared": True,
    }


def _validate_sample_size(plan: Mapping[str, Any], *, claim_target: str) -> Dict[str, Any]:
    sample = _mapping(plan.get("sample_size"), "STUDY_DESIGN_SAMPLE_SIZE_REQUIRED")
    target_units = _positive_int(sample.get("target_units"), "STUDY_DESIGN_SAMPLE_TARGET_REQUIRED")
    basis = _text(sample.get("basis"), "STUDY_DESIGN_SAMPLE_BASIS_REQUIRED")
    _text(sample.get("rationale_ref"), "STUDY_DESIGN_SAMPLE_RATIONALE_REQUIRED")
    _bool(sample.get("assumptions_frozen"), True, "STUDY_DESIGN_SAMPLE_ASSUMPTIONS_NOT_FROZEN")
    progression = sample.get("progression_criteria", [])
    if claim_target == "FEASIBILITY":
        if basis != "FEASIBILITY_OBJECTIVES":
            _fail("STUDY_DESIGN_FEASIBILITY_SAMPLE_BASIS_INVALID")
        _list_of_text(progression, "STUDY_DESIGN_FEASIBILITY_PROGRESSION_CRITERIA_REQUIRED")
    else:
        if basis != "POWER_OR_PRECISION":
            _fail("STUDY_DESIGN_CAUSAL_SAMPLE_BASIS_INVALID")
    return {
        "target_units": target_units,
        "basis": basis,
        "statistical_adequacy_independently_verified": False,
    }


def _validate_attrition(plan: Mapping[str, Any]) -> Dict[str, Any]:
    attrition = _mapping(plan.get("attrition"), "STUDY_DESIGN_ATTRITION_PLAN_REQUIRED")
    if attrition.get("denominator") != "ALL_ASSIGNED_OR_ENROLLED_REQUIRED_BY_DESIGN":
        _fail("STUDY_DESIGN_ATTRITION_DENOMINATOR_INVALID")
    _text(attrition.get("missing_data_strategy"), "STUDY_DESIGN_MISSING_DATA_STRATEGY_REQUIRED")
    _bool(attrition.get("reasons_preserved"), True, "STUDY_DESIGN_ATTRITION_REASONS_MUST_BE_PRESERVED")
    _bool(
        attrition.get("post_outcome_exclusion_rule_predeclared"),
        True,
        "STUDY_DESIGN_POST_OUTCOME_EXCLUSION_RULE_NOT_PREDECLARED",
    )
    return {"complete_denominator_predeclared": True}


def _validate_baseline(plan: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    baseline = _mapping(plan.get("baseline"), "STUDY_DESIGN_BASELINE_PLAN_REQUIRED")
    covariates = _list_of_text(baseline.get("covariates"), "STUDY_DESIGN_BASELINE_COVARIATES_REQUIRED")
    adjustment = _text(baseline.get("adjustment_strategy"), "STUDY_DESIGN_BASELINE_ADJUSTMENT_REQUIRED")
    equivalence = _text(
        baseline.get("equivalence_assessment_plan"),
        "STUDY_DESIGN_BASELINE_EQUIVALENCE_PLAN_REQUIRED",
    )
    if causal and adjustment == "NONE":
        _fail("STUDY_DESIGN_CAUSAL_BASELINE_ADJUSTMENT_MUST_BE_PRESPECIFIED")
    return {
        "covariate_count": len(covariates),
        "adjustment_strategy": adjustment,
        "equivalence_plan_declared": bool(equivalence),
    }


def _validate_identity_and_independence(plan: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    identity = _mapping(plan.get("identity_independence"), "STUDY_DESIGN_IDENTITY_INDEPENDENCE_REQUIRED")
    _bool(identity.get("analysis_identity_separated"), True, "STUDY_DESIGN_ANALYSIS_IDENTITY_MUST_BE_SEPARATED")
    controls = _list_of_text(
        identity.get("assistance_contamination_controls"),
        "STUDY_DESIGN_CONTAMINATION_CONTROLS_REQUIRED",
    )
    assessor = _text(identity.get("assessor_independence"), "STUDY_DESIGN_ASSESSOR_INDEPENDENCE_REQUIRED")
    unique_ref = identity.get("unique_human_authority_ref")
    if causal:
        _text(unique_ref, "STUDY_DESIGN_CAUSAL_UNIQUE_HUMAN_AUTHORITY_REQUIRED")
    return {
        "unique_human_authority_declared": bool(unique_ref),
        "analysis_identity_separated": True,
        "contamination_control_count": len(controls),
        "assessor_independence": assessor,
    }


def _validate_assignment(plan: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    assignment = _mapping(plan.get("assignment"), "STUDY_DESIGN_ASSIGNMENT_REQUIRED")
    method = _text(assignment.get("method"), "STUDY_DESIGN_ASSIGNMENT_METHOD_REQUIRED")
    unit = _text(assignment.get("unit"), "STUDY_DESIGN_ASSIGNMENT_UNIT_REQUIRED")
    analysis_unit = _text(plan.get("analysis_unit"), "STUDY_DESIGN_ANALYSIS_UNIT_REQUIRED")
    if causal:
        if method != "RANDOMIZED":
            _fail("STUDY_DESIGN_V1_CAUSAL_REQUIRES_RANDOMIZED_ASSIGNMENT")
        _text(
            assignment.get("generation_and_concealment_ref"),
            "STUDY_DESIGN_RANDOMIZATION_AUTHORITY_REQUIRED",
        )
    return {"method": method, "assignment_unit": unit, "analysis_unit": analysis_unit}


def _validate_comparison(plan: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    comparison = _mapping(plan.get("comparison"), "STUDY_DESIGN_COMPARISON_PLAN_REQUIRED")
    present = comparison.get("present") is True
    if causal and not present:
        _fail("STUDY_DESIGN_CAUSAL_COMPARATOR_REQUIRED")
    if present:
        _text(comparison.get("description"), "STUDY_DESIGN_COMPARATOR_DESCRIPTION_REQUIRED")
        _list_of_text(
            comparison.get("contamination_controls"),
            "STUDY_DESIGN_COMPARATOR_CONTAMINATION_CONTROLS_REQUIRED",
        )
    return {"comparator_present": present}


def _validate_analysis(plan: Mapping[str, Any], *, causal: bool) -> Dict[str, Any]:
    analysis = _mapping(plan.get("analysis"), "STUDY_DESIGN_ANALYSIS_REQUIRED")
    estimand = _text(analysis.get("estimand"), "STUDY_DESIGN_ESTIMAND_REQUIRED")
    effect_measure = _text(analysis.get("effect_measure"), "STUDY_DESIGN_EFFECT_MEASURE_REQUIRED")
    uncertainty = _text(analysis.get("uncertainty_reporting"), "STUDY_DESIGN_UNCERTAINTY_REPORTING_REQUIRED")
    multiplicity = _text(analysis.get("multiplicity_policy"), "STUDY_DESIGN_MULTIPLICITY_POLICY_REQUIRED")
    subgroup = _text(analysis.get("subgroup_policy"), "STUDY_DESIGN_SUBGROUP_POLICY_REQUIRED")
    cluster = _text(analysis.get("cluster_strategy"), "STUDY_DESIGN_CLUSTER_STRATEGY_REQUIRED")
    analysis_population = _text(analysis.get("analysis_population"), "STUDY_DESIGN_ANALYSIS_POPULATION_REQUIRED")
    if causal:
        if uncertainty != "CONFIDENCE_INTERVAL":
            _fail("STUDY_DESIGN_CAUSAL_UNCERTAINTY_INTERVAL_REQUIRED")
        if subgroup != "PRESPECIFIED_ONLY":
            _fail("STUDY_DESIGN_CAUSAL_SUBGROUP_POLICY_INVALID")
    return {
        "estimand": estimand,
        "effect_measure": effect_measure,
        "uncertainty_reporting": uncertainty,
        "multiplicity_policy": multiplicity,
        "subgroup_policy": subgroup,
        "cluster_strategy": cluster,
        "analysis_population": analysis_population,
    }


def _validate_stopping_privacy_reporting(plan: Mapping[str, Any]) -> None:
    stopping = _mapping(plan.get("stopping"), "STUDY_DESIGN_STOPPING_RULE_REQUIRED")
    _text(stopping.get("rule"), "STUDY_DESIGN_STOPPING_RULE_REQUIRED")
    _bool(
        stopping.get("unplanned_outcome_peeking_allowed"),
        False,
        "STUDY_DESIGN_UNPLANNED_OUTCOME_PEEKING_FORBIDDEN",
    )

    privacy = _mapping(plan.get("privacy"), "STUDY_DESIGN_PRIVACY_REQUIRED")
    _bool(privacy.get("direct_pii_in_analysis"), False, "STUDY_DESIGN_DIRECT_PII_IN_ANALYSIS_FORBIDDEN")
    _bool(privacy.get("raw_response_in_analysis"), False, "STUDY_DESIGN_RAW_RESPONSE_IN_ANALYSIS_FORBIDDEN")
    _bool(privacy.get("identity_linkage_separate"), True, "STUDY_DESIGN_IDENTITY_LINKAGE_MUST_BE_SEPARATE")
    _text(privacy.get("retention_policy_ref"), "STUDY_DESIGN_RETENTION_POLICY_REQUIRED")

    reporting = _mapping(plan.get("reporting"), "STUDY_DESIGN_REPORTING_PLAN_REQUIRED")
    for key in (
        "participant_flow",
        "attrition_by_group",
        "protocol_deviations",
        "all_prespecified_outcomes",
    ):
        _bool(reporting.get(key), True, "STUDY_DESIGN_REPORTING_REQUIREMENT_MISSING:" + key)


def validate_effectiveness_study_design(plan: Mapping[str, Any]) -> Dict[str, Any]:
    plan = _mapping(plan, "STUDY_DESIGN_PLAN_REQUIRED")
    _scan_for_participant_data(plan)

    contract_version = _text(plan.get("contract_version"), "STUDY_DESIGN_CONTRACT_VERSION_REQUIRED")
    if contract_version != REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION:
        _fail("STUDY_DESIGN_CONTRACT_VERSION_MISMATCH")
    study_id = _text(plan.get("study_id"), "STUDY_DESIGN_STUDY_ID_REQUIRED")
    claim_target = _text(plan.get("claim_target"), "STUDY_DESIGN_CLAIM_TARGET_REQUIRED")
    if claim_target not in {"FEASIBILITY", "CAUSAL_EFFECTIVENESS"}:
        _fail("STUDY_DESIGN_CLAIM_TARGET_UNSUPPORTED")
    causal = claim_target == "CAUSAL_EFFECTIVENESS"

    intervention = _mapping(plan.get("intervention"), "STUDY_DESIGN_INTERVENTION_REQUIRED")
    subject_sha = _sha(intervention.get("subject_sha"), "STUDY_DESIGN_INTERVENTION_SHA_REQUIRED")
    runtime_digest = _digest(
        intervention.get("runtime_binding_digest"),
        "STUDY_DESIGN_RUNTIME_BINDING_DIGEST_REQUIRED",
    )

    governance = _validate_governance(plan)
    protocol = _validate_protocol(plan)
    population = _validate_population(plan)
    assignment = _validate_assignment(plan, causal=causal)
    comparison = _validate_comparison(plan, causal=causal)
    sample_size = _validate_sample_size(plan, claim_target=claim_target)
    outcome = _validate_outcome(plan, causal=causal)
    attrition = _validate_attrition(plan)
    baseline = _validate_baseline(plan, causal=causal)
    identity = _validate_identity_and_independence(plan, causal=causal)
    analysis = _validate_analysis(plan, causal=causal)
    _validate_stopping_privacy_reporting(plan)

    standing = (
        "DESIGN_READY_FOR_RANDOMIZED_EFFECTIVENESS_STUDY"
        if causal
        else "DESIGN_READY_FOR_FEASIBILITY_STUDY"
    )

    return {
        "study_design_version": REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
        "study_id": study_id,
        "claim_target": claim_target,
        "design_standing": standing,
        "intervention": {
            "subject_sha": subject_sha,
            "runtime_binding_digest": runtime_digest,
        },
        "protocol": protocol,
        "governance": governance,
        "population": population,
        "assignment": assignment,
        "comparison": comparison,
        "sample_size": sample_size,
        "primary_outcome": outcome,
        "attrition": attrition,
        "baseline": baseline,
        "identity_independence": identity,
        "analysis": analysis,
        "claims": {
            "study_design_ready": True,
            "study_executed": False,
            "learning_effectiveness_proven": False,
            "causal_effect_proven": False,
            "population_generalization_proven": False,
            "psychometric_validity_proven": False,
            "external_standard_compliance_proven": False,
        },
        "truth_boundary": {
            "design_readiness_is_not_result_evidence": True,
            "sample_size_adequacy_not_self_certified": True,
            "governance_not_self_created_by_software": True,
            "population_generalization_requires_executed_external_validity_evidence": True,
            "quasi_experimental_causal_claims_deferred_in_v1": True,
            "human_participant_evidence_created": False,
        },
    }
