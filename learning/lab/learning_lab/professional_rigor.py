from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List

from .repository import digest
from .professional_quality import evaluate_professional_quality


PROFESSIONAL_REVIEW_PROFILE_VERSION = "PROFESSIONAL-COURSE-REVIEW-READINESS-V2"
ASSESSMENT_VALIDITY_POLICY_VERSION = "ASSESSMENT-VALIDITY-EVIDENCE-V1"
REVIEW_ADJUDICATION_POLICY_VERSION = "EXTERNAL-REVIEW-ADJUDICATION-V1"
CAPABILITY_HANDOFF_VERSION = "LEARNING-CAPABILITY-EVIDENCE-HANDOFF-V1"

ALLOWED_INTERNAL_LEVELS = {
    "PROFESSIONAL_MODULE",
    "PROFESSIONAL_PROGRAM_CANDIDATE",
    "EXTERNAL_REVIEW_PACKAGE_READY",
}
FORBIDDEN_RECOGNITION_CLAIMS = {
    "ACCREDITED", "COLLEGE_CREDIT_AWARDED", "EXTERNALLY_CERTIFIED", "JOB_READY", "QUALIFIED_FOR_ROLE"
}


def _items_for(course: Dict[str, Any], criterion_id: str) -> List[Dict[str, Any]]:
    return [x for x in course.get("items", []) if x.get("criterion_id") == criterion_id]


def _transfer_for(package: Dict[str, Any], criterion_id: str) -> List[Dict[str, Any]]:
    return [x for x in package.get("transfer_tasks", []) if x.get("criterion_id") == criterion_id]


def evaluate_assessment_blueprint(course: Dict[str, Any], package: Dict[str, Any], descriptor: Dict[str, Any]) -> Dict[str, Any]:
    failures: List[str] = []
    rows: Dict[str, Any] = {}
    bp = descriptor.get("assessment_blueprint", {})
    criteria = {x["criterion_id"] for x in course.get("criteria", [])}
    if set(bp) != criteria:
        failures.append("ASSESSMENT_BLUEPRINT_CRITERION_SET_MISMATCH")
    for cid in sorted(criteria):
        spec = bp.get(cid, {})
        modes = {x.get("mode") for x in _items_for(course, cid)}
        if _transfer_for(package, cid):
            modes.add("TRANSFER_CHECK")
        required = set(spec.get("required_modes", []))
        missing = sorted(required - modes)
        if missing:
            failures.append(f"ASSESSMENT_BLUEPRINT_COVERAGE_GAP:{cid}:{','.join(missing)}")
        mastery = [x for x in _items_for(course, cid) if x.get("mode") == "MASTERY_CHECK"]
        independent = bool(mastery) and all(x.get("mode") == "MASTERY_CHECK" for x in mastery)
        rows[cid] = {"observed_modes": sorted(modes), "required_modes": sorted(required), "missing": missing, "independent_mastery_designated": independent}
    return {"policy_version": ASSESSMENT_VALIDITY_POLICY_VERSION, "status": "PASS" if not failures else "FAIL", "failures": failures, "criteria": rows}


def evaluate_passing_standard(descriptor: Dict[str, Any]) -> Dict[str, Any]:
    ps = descriptor.get("passing_standard", {})
    failures: List[str] = []
    if ps.get("type") != "CRITERION_REFERENCED":
        failures.append("PASSING_STANDARD_NOT_CRITERION_REFERENCED")
    rule = str(ps.get("rule", ""))
    for required_phrase in ("Every required independent mastery gate", "retention", "transfer", "No compensatory averaging"):
        if required_phrase.lower() not in rule.lower():
            failures.append("PASSING_STANDARD_RULE_INCOMPLETE:" + required_phrase.upper().replace(" ", "_"))
    if ps.get("numeric_probability_claim") not in (None, "NOT_USED"):
        failures.append("UNCALIBRATED_PASS_PROBABILITY_FORBIDDEN")
    return {"status": "PASS" if not failures else "FAIL", "failures": failures, "standard": copy.deepcopy(ps)}


def evaluate_rigor_and_depth(course: Dict[str, Any], package: Dict[str, Any], descriptor: Dict[str, Any]) -> Dict[str, Any]:
    failures: List[str] = []
    warnings: List[str] = []
    target = descriptor.get("target_level")
    if target not in ALLOWED_INTERNAL_LEVELS:
        failures.append("UNKNOWN_INTERNAL_TARGET_LEVEL")
    outcomes = descriptor.get("outcome_levels", {})
    criteria = {x["criterion_id"] for x in course.get("criteria", [])}
    if set(outcomes) != criteria:
        failures.append("OUTCOME_LEVEL_COVERAGE_GAP")
    if any(v not in {"APPLY_AND_EXPLAIN", "ANALYZE", "EVALUATE", "CREATE"} for v in outcomes.values()):
        failures.append("OUTCOME_LEVEL_BELOW_PROFESSIONAL_APPLICATION_FLOOR")
    prereqs = descriptor.get("entry_prerequisites", [])
    if not prereqs:
        failures.append("ENTRY_PREREQUISITES_UNDOCUMENTED")
    if any(x.get("status") != "DECLARED_ENTRY_REQUIREMENT" for x in prereqs):
        failures.append("ENTRY_PREREQUISITE_STANDING_INVALID")
    cap = descriptor.get("capstone", {})
    if not cap.get("required_for_this_module") or not cap.get("independent"):
        failures.append("INDEPENDENT_CAPSTONE_OR_TRANSFER_MISSING")
    workload = descriptor.get("workload_estimate", {})
    if int(workload.get("estimated_minutes", 0) or 0) <= 0:
        failures.append("WORKLOAD_ESTIMATE_MISSING")
    if workload.get("credit_hour_equivalency") != "NOT_CLAIMED":
        failures.append("CREDIT_HOUR_EQUIVALENCY_NOT_EXTERNALLY_ESTABLISHED")
    completeness = descriptor.get("subject_completeness", {})
    if completeness.get("claim") != "COMPLETE_FOR_DECLARED_BOUNDED_MODULE_SCOPE":
        failures.append("SUBJECT_SCOPE_COMPLETENESS_NOT_BOUNDED")
    if not completeness.get("requires_external_sme_confirmation"):
        failures.append("SME_COMPLETENESS_REVIEW_BOUNDARY_MISSING")
    if target == "PROFESSIONAL_MODULE":
        warnings.append("MODULE_SCOPE_NOT_STANDALONE_CERTIFICATE_OR_COLLEGE_CREDIT_PROGRAM")
    return {
        "status": "PASS" if not failures else "FAIL",
        "failures": failures,
        "warnings": warnings,
        "target_level": target,
        "outcome_levels": copy.deepcopy(outcomes),
        "entry_prerequisites": copy.deepcopy(prereqs),
        "workload_estimate": copy.deepcopy(workload),
        "capstone": copy.deepcopy(cap),
        "subject_completeness": copy.deepcopy(completeness),
    }


def evaluate_support_and_accessibility(descriptor: Dict[str, Any]) -> Dict[str, Any]:
    failures: List[str] = []
    support = descriptor.get("learner_support", {})
    access = descriptor.get("accessibility_review", {})
    for k in ("tutor_available", "support_fades_before_independent_mastery", "answer_reveal_prohibited_during_independent_checks", "technical_support_documented"):
        if not support.get(k):
            failures.append("LEARNER_SUPPORT_GAP:" + k.upper())
    if not access.get("content_text_equivalent"):
        failures.append("ACCESSIBILITY_TEXT_EQUIVALENT_MISSING")
    if not access.get("keyboard_or_nonpointer_path_required"):
        failures.append("ACCESSIBILITY_NONPOINTER_PATH_NOT_REQUIRED")
    if access.get("assistive_technology_conformance") not in {"TARGET_NATIVE_REVIEW_REQUIRED", "EXTERNALLY_VERIFIED"}:
        failures.append("ACCESSIBILITY_CONFORMANCE_STANDING_INVALID")
    return {"status": "PASS" if not failures else "FAIL", "failures": failures, "learner_support": copy.deepcopy(support), "accessibility": copy.deepcopy(access)}


def assessment_evidence_state(*, descriptor: Dict[str, Any], mechanical_oracle_pass: bool) -> Dict[str, Any]:
    # Deliberately refuses to promote population-level psychometric claims from Lab mechanics.
    return {
        "policy_version": ASSESSMENT_VALIDITY_POLICY_VERSION,
        "content_alignment": "STRUCTURALLY_MAPPED_EXTERNAL_SME_REVIEW_REQUIRED",
        "mechanical_scoring_correctness": "SUPPORTED" if mechanical_oracle_pass else "FAILED",
        "response_process_evidence": "NOT_ESTABLISHED_REAL_LEARNERS_REQUIRED",
        "internal_structure_reliability": "NOT_ESTABLISHED_REAL_POPULATION_REQUIRED",
        "relations_to_other_variables": "NOT_ESTABLISHED",
        "consequences_fairness": "NOT_ESTABLISHED_EXTERNAL_OR_EMPIRICAL_REVIEW_REQUIRED",
        "automated_scoring_standing": "BOUNDED_MECHANICAL_ORACLE_ONLY" if mechanical_oracle_pass else "FAILED",
        "validity_claim": "PARTIAL_EVIDENCE_ONLY_NOT_FULLY_VALIDATED",
        "reliability_claim": "NOT_ESTABLISHED",
    }


def adjudicate_reviews(review_records: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    records = [copy.deepcopy(x) for x in review_records]
    if not records:
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "PENDING_INDEPENDENT_REVIEW", "reason_codes": ["NO_REVIEW_RECORDS"], "records": []}
    admissible = [x for x in records if x.get("independence") == "INDEPENDENT" and x.get("standing") in {"APPROVE", "REVISE", "ABSTAIN"}]
    reviewer_ids = [str(x.get("reviewer_id", "")) for x in admissible]
    if any(not x for x in reviewer_ids) or len(set(reviewer_ids)) != len(reviewer_ids):
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "PENDING_INDEPENDENT_REVIEW", "reason_codes": ["REVIEWER_IDENTITY_NOT_DISTINCT"], "records": records}
    if len(admissible) < 2:
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "PENDING_INDEPENDENT_REVIEW", "reason_codes": ["INSUFFICIENT_INDEPENDENT_REVIEWERS"], "records": records}
    roles = {x.get("role") for x in admissible}
    if "SUBJECT_MATTER_EXPERT" not in roles or not ({"FACULTY_REVIEWER", "ASSESSMENT_REVIEWER"} & roles):
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "PENDING_INDEPENDENT_REVIEW", "reason_codes": ["REVIEW_ROLE_COVERAGE_INCOMPLETE"], "records": records}
    if any(x["standing"] == "ABSTAIN" for x in admissible):
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "ABSTAINED_REQUIRES_ADJUDICATION", "reason_codes": ["REVIEWER_ABSTENTION"], "records": records}
    standings = {x["standing"] for x in admissible}
    if len(standings) > 1:
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "DISAGREEMENT_REQUIRES_ADJUDICATION", "reason_codes": ["REVIEWER_DISAGREEMENT"], "records": records}
    if standings == {"APPROVE"}:
        evidence_classes = {x.get("evidence_class", "UNKNOWN") for x in admissible}
        if evidence_classes == {"REAL_HUMAN_REVIEW"}:
            return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "INDEPENDENT_REVIEW_APPROVED", "reason_codes": ["TWO_OR_MORE_DISTINCT_INDEPENDENT_HUMAN_APPROVALS_WITH_ROLE_COVERAGE"], "records": records}
        return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE", "reason_codes": ["SYNTHETIC_FIXTURES_CANNOT_SATISFY_HUMAN_REVIEW_GATE"], "records": records}
    return {"policy_version": REVIEW_ADJUDICATION_POLICY_VERSION, "status": "REVISIONS_REQUIRED", "reason_codes": ["INDEPENDENT_REVIEW_REQUESTED_REVISIONS"], "records": records}


def build_external_review_dossier(*, course: Dict[str, Any], dossier: Dict[str, Any], package: Dict[str, Any], descriptor: Dict[str, Any], review_records: Iterable[Dict[str, Any]] = (), mechanical_oracle_pass: bool = True) -> Dict[str, Any]:
    base_quality = evaluate_professional_quality(course=course, dossier=dossier, package=package)
    blueprint = evaluate_assessment_blueprint(course, package, descriptor)
    passing = evaluate_passing_standard(descriptor)
    rigor = evaluate_rigor_and_depth(course, package, descriptor)
    support = evaluate_support_and_accessibility(descriptor)
    validity = assessment_evidence_state(descriptor=descriptor, mechanical_oracle_pass=mechanical_oracle_pass)
    reviews = adjudicate_reviews(review_records)
    hard_failures = []
    for section_name, section in (("base_quality", base_quality), ("assessment_blueprint", blueprint), ("passing_standard", passing), ("rigor", rigor), ("support_accessibility", support)):
        if section.get("status") == "FAIL":
            hard_failures.extend([section_name + ":" + x for x in section.get("failures", [])])
    if not mechanical_oracle_pass:
        hard_failures.append("assessment_validity:MECHANICAL_SCORING_ORACLE_FAILED")
    document_complete = not hard_failures
    external_review_status = reviews["status"]
    recognition = "NOT_CLAIMED"
    standalone_recognition_readiness = (
        "NOT_SUPPORTED_BY_BOUNDED_MODULE_SCOPE"
        if descriptor.get("target_level") == "PROFESSIONAL_MODULE"
        else "PENDING_EXTERNAL_REVIEW"
    )
    result = {
        "profile_id": PROFESSIONAL_REVIEW_PROFILE_VERSION,
        "course_id": course.get("course_id"),
        "course_digest": digest(course),
        "research_dossier_digest": digest(dossier),
        "descriptor_id": descriptor.get("descriptor_id"),
        "descriptor_digest": digest(descriptor),
        "internal_quality": base_quality,
        "rigor_depth": rigor,
        "assessment_blueprint": blueprint,
        "passing_standard": passing,
        "assessment_evidence": validity,
        "support_accessibility": support,
        "independent_review": reviews,
        "document_complete_for_review": document_complete,
        "external_review_readiness": "READY_TO_SUBMIT_FOR_INDEPENDENT_REVIEW" if document_complete else "BLOCKED",
        "standalone_certificate_or_credit_readiness": standalone_recognition_readiness,
        "external_recognition": recognition,
        "claim_boundary": "INTERNAL_QUALITY_AND_EVIDENCE_PACKAGE_ONLY",
        "limitations": [
            "NO_EXTERNAL_ACCREDITATION_OR_COLLEGE_CREDIT_CLAIM",
            "NO_EXTERNAL_CERTIFICATION_CLAIM",
            "NO_JOB_READY_OR_QUALIFIED_FOR_ROLE_CLAIM",
            "ASSESSMENT_RELIABILITY_NOT_ESTABLISHED_WITH_REAL_POPULATION",
            "SUBJECT_COMPLETENESS_REQUIRES_EXTERNAL_SME_CONFIRMATION",
            "TARGET_NATIVE_ACCESSIBILITY_REVIEW_PENDING",
        ],
    }
    result["dossier_digest"] = digest(result)
    return result


def build_capability_evidence_handoff_template(*, course: Dict[str, Any]) -> Dict[str, Any]:
    # This is only the Learning -> Portfolio contract shape; it does not create learner competence.
    return {
        "version": CAPABILITY_HANDOFF_VERSION,
        "course_id": course.get("course_id"),
        "course_digest": digest(course),
        "portfolio_owner": "MOD-PORTFOLIO-001",
        "learning_owner": "LEARNING_COMPETENCE_EVIDENCE_SEMANTICS",
        "required_learner_evidence_fields": [
            "exact_skill_and_criterion_refs", "canonical_evidence_refs", "assessment_conditions",
            "assistance_and_exposure", "freshness", "retention", "transfer", "provenance", "limitations"
        ],
        "allowed_claim_ceiling_by_learning_stage": {
            "DEMONSTRATED": "DEMONSTRATED_SKILL_WITHIN_SCOPE",
            "RETAINED": "RETAINED_SKILL_WHILE_CURRENT",
            "TRANSFER_DEMONSTRATED": "TRANSFER_DEMONSTRATED_FOR_DECLARED_CONTEXT",
            "MASTERED": "MASTERY_WITHIN_EXACT_POLICY_SCOPE"
        },
        "forbidden_without_external_authority": sorted(FORBIDDEN_RECOGNITION_CLAIMS),
        "course_completion_alone_is_competence": False,
    }
