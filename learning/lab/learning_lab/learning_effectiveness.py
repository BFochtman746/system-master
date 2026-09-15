from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence


LEARNING_EFFECTIVENESS_VERSION = "001M-S06-v1"
EVALUATION_PROTOCOL_KIND = "learning_effectiveness_protocol_s06"
EVALUATION_RESULT_KIND = "learning_effectiveness_result_s06"

RESULT_STANDINGS = (
    "PLANNED",
    "IN_PROGRESS",
    "EXPLORATORY",
    "INCONCLUSIVE",
    "SUPPORTIVE",
    "ADVERSE_SIGNAL",
    "SUPERSEDED",
    "NOT_GENERALIZABLE",
)

DESIGN_RANDOMIZED = "RANDOMIZED"
DESIGN_QUASI = "QUASI_EXPERIMENTAL"
DESIGN_OBSERVATIONAL = "OBSERVATIONAL"
DESIGN_N_OF_1 = "N_OF_1"
DESIGN_REPEATED = "WITHIN_LEARNER_REPEATED"

OUTCOME_IMMEDIATE = "IMMEDIATE_PERFORMANCE"
OUTCOME_RETENTION = "DELAYED_RETENTION"
OUTCOME_TRANSFER = "TRANSFER"
OUTCOME_INDEPENDENCE = "INDEPENDENT_PERFORMANCE"
OUTCOME_EFFICIENCY = "LEARNING_EFFICIENCY"
OUTCOME_SRL = "SELF_REGULATION"
OUTCOME_EXPERIENCE = "EXPERIENCE"
OUTCOME_BURDEN = "BURDEN"
OUTCOME_ADVERSE = "ADVERSE_EFFECT"

SENSITIVE_ATTRIBUTES = {
    "race", "ethnicity", "religion", "gender", "sexual_orientation",
    "disability", "health_condition", "political_affiliation",
}
RAW_SENSITIVE_INFERENCE_SOURCES = {
    "raw_chat", "camera", "voice", "physiological", "device_telemetry",
}
MATERIAL_CHANGE_FIELDS = {
    "model_provider", "model_version", "prompt_version", "curriculum_version",
    "tutoring_version", "assessment_version", "adaptive_policy_version",
    "scaffold_version", "tool_version",
}


class LearningEffectivenessError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _required_text(value: Any, code: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise LearningEffectivenessError(code)
    return text


def _upper(value: Any) -> str:
    return str(value or "").strip().upper()


def _copy(value: Mapping[str, Any]) -> Dict[str, Any]:
    return deepcopy(dict(value))


def _normalize_versions(versions: Mapping[str, Any]) -> Dict[str, str]:
    if not isinstance(versions, Mapping) or not versions:
        raise LearningEffectivenessError("EVALUATION_VERSIONS_REQUIRED")
    required = {"curriculum_version", "assessment_version", "policy_version"}
    if not required.issubset(versions):
        raise LearningEffectivenessError("EVALUATION_CORE_VERSIONS_REQUIRED")
    return {str(k): _required_text(v, "EVALUATION_VERSION_VALUE_REQUIRED") for k, v in sorted(versions.items())}


def _normalize_outcome(outcome: Mapping[str, Any]) -> Dict[str, Any]:
    if not isinstance(outcome, Mapping):
        raise LearningEffectivenessError("OUTCOME_INVALID")
    family = _upper(outcome.get("family"))
    if family not in {
        OUTCOME_IMMEDIATE, OUTCOME_RETENTION, OUTCOME_TRANSFER, OUTCOME_INDEPENDENCE,
        OUTCOME_EFFICIENCY, OUTCOME_SRL, OUTCOME_EXPERIENCE, OUTCOME_BURDEN, OUTCOME_ADVERSE,
    }:
        raise LearningEffectivenessError("OUTCOME_FAMILY_INVALID")
    row = _copy(outcome)
    row["outcome_id"] = _required_text(row.get("outcome_id"), "OUTCOME_ID_REQUIRED")
    row["family"] = family
    row["instrument_version"] = _required_text(row.get("instrument_version"), "OUTCOME_INSTRUMENT_VERSION_REQUIRED")
    row["window"] = _required_text(row.get("window"), "OUTCOME_WINDOW_REQUIRED")
    row["primary"] = bool(row.get("primary", False))
    row["assistance_condition"] = _upper(row.get("assistance_condition") or "UNKNOWN")
    if family == OUTCOME_RETENTION and _upper(row.get("timing")) in {"", "IMMEDIATE"}:
        raise LearningEffectivenessError("RETENTION_DELAY_REQUIRED")
    if family == OUTCOME_TRANSFER:
        row["transfer_distance"] = _required_text(row.get("transfer_distance"), "TRANSFER_DISTANCE_REQUIRED")
        if not bool(row.get("materially_different_from_training")):
            raise LearningEffectivenessError("TRANSFER_MATERIAL_DIFFERENCE_REQUIRED")
    if family == OUTCOME_INDEPENDENCE and row["assistance_condition"] not in {"INDEPENDENT", "AUTHORIZED_ACCOMMODATION"}:
        row["independence_eligible"] = False
    else:
        row["independence_eligible"] = bool(row.get("independence_eligible", family == OUTCOME_INDEPENDENCE))
    if family == OUTCOME_EFFICIENCY:
        row["resource_measure"] = _required_text(row.get("resource_measure"), "EFFICIENCY_RESOURCE_MEASURE_REQUIRED")
        row["learning_outcome_reference"] = _required_text(
            row.get("learning_outcome_reference"), "EFFICIENCY_LEARNING_OUTCOME_REQUIRED"
        )
    return row


def build_evaluation_protocol(
    *,
    evaluation_id: str,
    intervention_id: str,
    comparator_id: str,
    design: str,
    versions: Mapping[str, Any],
    target_context: Mapping[str, Any],
    intended_claim: str,
    outcomes: Sequence[Mapping[str, Any]],
    confirmatory: bool,
    assignment_integrity: Optional[str] = None,
    identifying_assumptions: Optional[Sequence[str]] = None,
    analysis_plan: Optional[Mapping[str, Any]] = None,
    missingness_plan: Optional[Mapping[str, Any]] = None,
    contamination_plan: Optional[Mapping[str, Any]] = None,
    stopping_rule: Optional[str] = None,
    assistance_conditions: Optional[Sequence[str]] = None,
    accommodation_conditions: Optional[Sequence[str]] = None,
    comparator_is_strawman: bool = False,
    prospective: bool = True,
) -> Dict[str, Any]:
    design = _upper(design)
    if design not in {DESIGN_RANDOMIZED, DESIGN_QUASI, DESIGN_OBSERVATIONAL, DESIGN_N_OF_1, DESIGN_REPEATED}:
        raise LearningEffectivenessError("EVALUATION_DESIGN_INVALID")
    if not comparator_id:
        raise LearningEffectivenessError("COMPARATOR_REQUIRED")
    normalized_outcomes = [_normalize_outcome(x) for x in outcomes]
    if not normalized_outcomes:
        raise LearningEffectivenessError("OUTCOME_FAMILY_REQUIRED")
    if confirmatory:
        if not prospective:
            raise LearningEffectivenessError("CONFIRMATORY_MUST_BE_PROSPECTIVE")
        if not any(x["primary"] for x in normalized_outcomes):
            raise LearningEffectivenessError("CONFIRMATORY_PRIMARY_OUTCOME_REQUIRED")
        if not analysis_plan or not missingness_plan or not contamination_plan or not stopping_rule:
            raise LearningEffectivenessError("CONFIRMATORY_RULES_REQUIRED")
    target = _copy(target_context)
    if not target:
        raise LearningEffectivenessError("TARGET_CONTEXT_REQUIRED")
    if bool(target.get("consequential")) and not bool((analysis_plan or {}).get("adverse_effect_review")):
        raise LearningEffectivenessError("ADVERSE_EFFECT_REVIEW_REQUIRED")
    protocol = {
        "schema_version": LEARNING_EFFECTIVENESS_VERSION,
        "owner": "LEARNING",
        "generic_statistics_owner": "SHARED_ASSURANCE_OR_ANALYTICS",
        "evaluation_id": _required_text(evaluation_id, "EVALUATION_ID_REQUIRED"),
        "intervention_id": _required_text(intervention_id, "INTERVENTION_ID_REQUIRED"),
        "comparator_id": _required_text(comparator_id, "COMPARATOR_REQUIRED"),
        "comparator_is_strawman": bool(comparator_is_strawman),
        "design": design,
        "assignment_integrity": _upper(assignment_integrity or "NOT_APPLICABLE"),
        "identifying_assumptions": [str(x) for x in (identifying_assumptions or [])],
        "versions": _normalize_versions(versions),
        "target_context": target,
        "intended_claim": _required_text(intended_claim, "INTENDED_CLAIM_REQUIRED"),
        "outcomes": normalized_outcomes,
        "confirmatory": bool(confirmatory),
        "prospective": bool(prospective),
        "analysis_plan": _copy(analysis_plan or {}),
        "missingness_plan": _copy(missingness_plan or {}),
        "contamination_plan": _copy(contamination_plan or {}),
        "stopping_rule": str(stopping_rule or ""),
        "assistance_conditions": sorted({_upper(x) for x in (assistance_conditions or [])}),
        "accommodation_conditions": sorted({_upper(x) for x in (accommodation_conditions or [])}),
        "source_truth_effect": "NONE",
        "mastery_effect": "NONE",
        "retention_truth_effect": "NONE",
        "transfer_truth_effect": "NONE",
        "assessment_truth_effect": "NONE",
        "goal_truth_effect": "NONE",
        "self_regulation_truth_effect": "NONE",
    }
    protocol["protocol_digest"] = digest(protocol)
    return protocol


def validate_subgroup_request(request: Mapping[str, Any]) -> Dict[str, Any]:
    row = _copy(request)
    attribute = str(row.get("attribute") or "").strip().lower()
    if not attribute:
        raise LearningEffectivenessError("SUBGROUP_ATTRIBUTE_REQUIRED")
    source = str(row.get("attribute_source") or "").strip().lower()
    if source in RAW_SENSITIVE_INFERENCE_SOURCES and attribute in SENSITIVE_ATTRIBUTES:
        raise LearningEffectivenessError("SENSITIVE_TRAIT_INFERENCE_FORBIDDEN")
    if bool(row.get("collect_only_because_available")):
        raise LearningEffectivenessError("SUBGROUP_NECESSITY_REQUIRED")
    if not bool(row.get("authorized")) or not bool(row.get("necessary")):
        raise LearningEffectivenessError("SUBGROUP_AUTHORIZATION_REQUIRED")
    minimum = int(row.get("minimum_sample", 0))
    observed = int(row.get("observed_sample", 0))
    row["publish_detail"] = observed >= minimum > 0 and bool(row.get("reidentification_protection"))
    row["precision_standing"] = "BOUNDED" if row["publish_detail"] else "SUPPRESSED_OR_UNCERTAIN"
    return row


def _statistical_record(statistics: Mapping[str, Any]) -> Dict[str, Any]:
    row = _copy(statistics)
    for key in ("sample_count", "design_unit", "analysis_unit", "point_estimate"):
        if key not in row:
            raise LearningEffectivenessError("STATISTICAL_REPORT_INCOMPLETE")
    if int(row["sample_count"]) < 1:
        raise LearningEffectivenessError("STATISTICAL_SAMPLE_INVALID")
    row.setdefault("uncertainty", None)
    row["statistical_significance_is_educational_importance"] = False
    row["universal_effect_size_threshold"] = None
    if row.get("uncertainty") in (None, ""):
        row["precision_standing"] = "UNSTATED"
    else:
        row["precision_standing"] = "BOUNDED"
    return row


def _derive_claim_class(protocol: Mapping[str, Any]) -> str:
    design = protocol["design"]
    if design == DESIGN_RANDOMIZED and protocol.get("assignment_integrity") == "PASS":
        return "CAUSAL_BOUNDED"
    if design == DESIGN_QUASI:
        if not protocol.get("identifying_assumptions"):
            return "NON_CAUSAL_BOUNDED"
        return "QUASI_CAUSAL_BOUNDED"
    if design == DESIGN_N_OF_1:
        return "INDIVIDUAL_ONLY"
    if design == DESIGN_REPEATED:
        return "WITHIN_LEARNER_BOUNDED"
    return "OBSERVATIONAL_ASSOCIATION"


def finalize_evaluation(
    *,
    protocol: Mapping[str, Any],
    result_id: str,
    standing: str,
    observations: Sequence[Mapping[str, Any]],
    statistics: Mapping[str, Any],
    missingness: Mapping[str, Any],
    contamination: Mapping[str, Any],
    adverse_signals: Optional[Sequence[Mapping[str, Any]]] = None,
    subgroup_results: Optional[Sequence[Mapping[str, Any]]] = None,
    source_data_refs: Optional[Sequence[str]] = None,
    derived_data_refs: Optional[Sequence[str]] = None,
    analysis_code_ref: Optional[str] = None,
    environment_ref: Optional[str] = None,
    claim_text: Optional[str] = None,
) -> Dict[str, Any]:
    p = _copy(protocol)
    if p.get("protocol_digest") != digest({k: v for k, v in p.items() if k != "protocol_digest"}):
        raise LearningEffectivenessError("PROTOCOL_DIGEST_MISMATCH")
    standing = _upper(standing)
    if standing not in RESULT_STANDINGS:
        raise LearningEffectivenessError("RESULT_STANDING_INVALID")
    observations_out = [dict(x) for x in observations]
    if not observations_out:
        raise LearningEffectivenessError("OBSERVATIONS_REQUIRED")
    stats = _statistical_record(statistics)
    missing = _copy(missingness)
    contamination_row = _copy(contamination)
    missing.setdefault("reported", True)
    contamination_row.setdefault("reported", True)
    if not missing["reported"]:
        raise LearningEffectivenessError("MISSINGNESS_MUST_BE_REPORTED")
    if not contamination_row["reported"]:
        raise LearningEffectivenessError("CONTAMINATION_MUST_BE_REPORTED")

    families = {_upper(x.get("family")) for x in observations_out}
    immediate_only = families and families <= {OUTCOME_IMMEDIATE, OUTCOME_EXPERIENCE}
    task_completion_only = all(bool(x.get("task_completion_only")) for x in observations_out)
    ai_acceptance_only = all(bool(x.get("accepted_ai_output_only")) for x in observations_out)
    learning_families = {OUTCOME_IMMEDIATE, OUTCOME_RETENTION, OUTCOME_TRANSFER, OUTCOME_INDEPENDENCE, OUTCOME_EFFICIENCY}
    adverse = [dict(x) for x in (adverse_signals or [])]
    if any(bool(x.get("excessive_prompting_burden")) for x in observations_out):
        adverse.append({"code": "EXCESSIVE_PROMPTING_BURDEN", "material": True})
    if any(bool(x.get("time_increase_without_learning_benefit")) for x in observations_out):
        adverse.append({"code": "TIME_BURDEN_WITHOUT_BENEFIT", "material": True})
    if any(bool(x.get("accessibility_regression")) for x in observations_out):
        adverse.append({"code": "ACCESSIBILITY_REGRESSION", "material": True})
    if any(bool(x.get("integrity_degradation")) for x in observations_out):
        adverse.append({"code": "ASSESSMENT_INTEGRITY_DEGRADATION", "material": True})
    if any(bool(x.get("independent_performance_degraded")) for x in observations_out):
        adverse.append({"code": "INDEPENDENCE_DEGRADATION", "material": True})
    if any(bool(x.get("supported_improved")) and bool(x.get("unsupported_degraded")) for x in observations_out):
        adverse.append({"code": "DEPENDENCY_RISK", "material": True})
    if any(bool(x.get("immediate_improved")) and bool(x.get("retention_degraded")) for x in observations_out):
        adverse.append({"code": "RETENTION_CONFLICT", "material": True})

    requested_standing = standing
    if adverse and any(bool(x.get("material", True)) for x in adverse) and standing == "SUPPORTIVE":
        standing = "ADVERSE_SIGNAL"
    if standing == "SUPPORTIVE":
        if task_completion_only or ai_acceptance_only or not (families & learning_families):
            raise LearningEffectivenessError("LEARNING_OUTCOME_EVIDENCE_REQUIRED")
        if immediate_only and "retention" in str(p.get("intended_claim", "")).lower():
            raise LearningEffectivenessError("RETENTION_EVIDENCE_REQUIRED")
        if p.get("comparator_is_strawman"):
            standing = "NOT_GENERALIZABLE"
    if p.get("confirmatory") is False and standing == "SUPPORTIVE":
        standing = "EXPLORATORY"

    claim_class = _derive_claim_class(p)
    claim = str(claim_text or p.get("intended_claim") or "")
    if "randomized" in claim.lower() and claim_class != "CAUSAL_BOUNDED":
        raise LearningEffectivenessError("RANDOMIZED_CAUSAL_OVERCLAIM")
    if claim_class == "INDIVIDUAL_ONLY" and any(token in claim.lower() for token in ("population", "all learners", "universal")):
        standing = "NOT_GENERALIZABLE"

    subgroup_out = [validate_subgroup_request(x) for x in (subgroup_results or [])]
    if any(bool(x.get("material_adverse_signal")) for x in subgroup_out) and standing == "SUPPORTIVE":
        standing = "ADVERSE_SIGNAL"

    result = {
        "schema_version": LEARNING_EFFECTIVENESS_VERSION,
        "owner": "LEARNING",
        "result_id": _required_text(result_id, "RESULT_ID_REQUIRED"),
        "evaluation_id": p["evaluation_id"],
        "protocol_digest": p["protocol_digest"],
        "protocol_version": p["schema_version"],
        "intervention_versions": p["versions"],
        "measurement_instruments": [
            {"outcome_id": x["outcome_id"], "instrument_version": x["instrument_version"], "window": x["window"]}
            for x in p["outcomes"]
        ],
        "standing": standing,
        "requested_standing": requested_standing,
        "claim_class": claim_class,
        "claim_text": claim,
        "claim_scope": _copy(p["target_context"]),
        "observations": observations_out,
        "statistics": stats,
        "missingness": missing,
        "contamination": contamination_row,
        "adverse_signals": adverse,
        "subgroup_results": subgroup_out,
        "source_data_refs": list(source_data_refs or []),
        "derived_data_refs": list(derived_data_refs or []),
        "analysis_code_ref": str(analysis_code_ref or ""),
        "environment_ref": str(environment_ref or ""),
        "mastery_effect": "NONE",
        "retention_truth_effect": "NONE",
        "transfer_truth_effect": "NONE",
        "assessment_truth_effect": "NONE",
        "educational_effectiveness_proven": False,
        "universal_generalization_proven": False,
        "absence_of_adverse_effects_proven": False,
        "statistical_significance_is_educational_importance": False,
        "software_qualification_equivalent": False,
    }
    result["result_digest"] = digest(result)
    return result


def correct_evaluation_result(
    prior: Mapping[str, Any],
    *,
    successor_result_id: str,
    correction_reason: str,
    changed_inputs_or_analysis_ref: str,
    replacement: Mapping[str, Any],
) -> Dict[str, Any]:
    old = _copy(prior)
    if old.get("result_digest") != digest({k: v for k, v in old.items() if k != "result_digest"}):
        raise LearningEffectivenessError("PRIOR_RESULT_DIGEST_MISMATCH")
    successor = _copy(replacement)
    successor["result_id"] = _required_text(successor_result_id, "SUCCESSOR_RESULT_ID_REQUIRED")
    successor["supersedes_result_id"] = old["result_id"]
    successor["correction_reason"] = _required_text(correction_reason, "CORRECTION_REASON_REQUIRED")
    successor["changed_inputs_or_analysis_ref"] = _required_text(
        changed_inputs_or_analysis_ref, "CORRECTION_REFERENCE_REQUIRED"
    )
    successor["original_result_digest"] = old["result_digest"]
    successor.pop("result_digest", None)
    successor["result_digest"] = digest(successor)
    old["historical_standing"] = old.get("standing")
    old["standing"] = "SUPERSEDED"
    old["superseded_by_result_id"] = successor["result_id"]
    return {"original": old, "successor": successor}


def build_downstream_policy_consumption(
    *,
    result: Mapping[str, Any],
    consumer: str,
    policy_version: str,
    decision_type: str,
) -> Dict[str, Any]:
    decision = _upper(decision_type)
    if decision in {"CERTIFICATION", "LICENSING", "HIRING", "JOB_ELIGIBILITY"}:
        raise LearningEffectivenessError("DOWNSTREAM_DECISION_FORBIDDEN")
    if result.get("standing") in {"PLANNED", "IN_PROGRESS", "EXPLORATORY", "INCONCLUSIVE", "SUPERSEDED"}:
        raise LearningEffectivenessError("RESULT_NOT_POLICY_CONSUMABLE")
    if not result.get("result_digest"):
        raise LearningEffectivenessError("EXACT_RESULT_REFERENCE_REQUIRED")
    return {
        "consumer": _required_text(consumer, "CONSUMER_REQUIRED"),
        "policy_version": _required_text(policy_version, "POLICY_VERSION_REQUIRED"),
        "decision_type": decision,
        "evaluation_result_id": result["result_id"],
        "evaluation_result_digest": result["result_digest"],
        "standing": result["standing"],
        "mastery_effect": "NONE",
        "individual_learner_fact_projection": False,
        "optimize_immediate_correctness_only": False,
        "adverse_signal_remains_decision_relevant": result["standing"] == "ADVERSE_SIGNAL",
    }


def evaluate_change_control(previous_versions: Mapping[str, Any], current_versions: Mapping[str, Any]) -> Dict[str, Any]:
    previous = {str(k): str(v) for k, v in previous_versions.items()}
    current = {str(k): str(v) for k, v in current_versions.items()}
    changed = sorted(k for k in set(previous) | set(current) if previous.get(k) != current.get(k))
    material = sorted(k for k in changed if k in MATERIAL_CHANGE_FIELDS)
    return {
        "changed_fields": changed,
        "material_changes": material,
        "coverage_review_required": bool(material),
        "effectiveness_review_required": bool(material),
        "fresh_software_qualification_required": bool(changed),
        "standing_inherited_automatically": False if material else None,
    }


def software_qualification_report(*, executable_cases_passed: int, total_cases: int, regression_tests: int) -> Dict[str, Any]:
    if executable_cases_passed != total_cases or total_cases <= 0:
        raise LearningEffectivenessError("SOFTWARE_QUALIFICATION_INCOMPLETE")
    return {
        "standing": "PASS",
        "executable_cases": f"{executable_cases_passed}/{total_cases}",
        "regression_tests": int(regression_tests),
        "claim_class": "SOFTWARE_QUALIFICATION_ONLY",
        "educational_effectiveness_evidence": False,
        "measurement_validity_evidence": False,
        "system_master_proven_effective": False,
    }
