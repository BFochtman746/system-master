from __future__ import annotations

import ast
import copy
from typing import Any, Dict, Iterable, List, Optional

from .engine import InjectedCrash
from .repository import Repository, digest


WORKPLACE_PERFORMANCE_VERSION = "AUTHENTIC-WORKPLACE-PERFORMANCE-V1"
WORKPLACE_RUBRIC_VERSION = "WORKPLACE-CRITERION-RUBRIC-V1"
CAPABILITY_DOSSIER_VERSION = "LEARNING-CAPABILITY-EVIDENCE-DOSSIER-V1"
PORTFOLIO_HANDOFF_VERSION = "LEARNING-TO-PORTFOLIO-EVIDENCE-HANDOFF-V2"
DEFENSE_REVIEW_POLICY_VERSION = "WORKPLACE-DEFENSE-REVIEW-V1"

FORBIDDEN_EXTERNAL_CLAIMS = {
    "JOB_READY", "QUALIFIED_FOR_ROLE", "HIRED", "CERTIFIED", "LICENSED",
    "ACCREDITED", "COLLEGE_CREDIT_AWARDED", "SUBJECT_MATTER_EXPERT",
}

_ALLOWED_AST = {
    ast.Expression, ast.ListComp, ast.DictComp, ast.comprehension,
    ast.Name, ast.Load, ast.Store, ast.Constant, ast.List, ast.Dict, ast.Tuple, ast.Subscript,
    ast.Compare, ast.Eq, ast.NotEq, ast.Gt, ast.GtE, ast.Lt, ast.LtE,
    ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not,
}


def _parse_expression(expression: str, required_form: str) -> ast.Expression:
    tree = ast.parse(str(expression).strip(), mode="eval")
    nodes = list(ast.walk(tree))
    if len(nodes) > 120:
        raise ValueError("WORKPLACE_EXPRESSION_AST_BUDGET_EXCEEDED")
    for node in nodes:
        if type(node) not in _ALLOWED_AST:
            raise ValueError("WORKPLACE_EXPRESSION_NODE_FORBIDDEN:" + type(node).__name__)
        if isinstance(node, ast.Name) and node.id not in {"records", "r"}:
            raise ValueError("WORKPLACE_EXPRESSION_NAME_FORBIDDEN:" + node.id)
    if required_form == "LIST_COMPREHENSION" and not isinstance(tree.body, ast.ListComp):
        raise ValueError("WORKPLACE_LIST_COMPREHENSION_REQUIRED")
    if required_form == "DICT_COMPREHENSION" and not isinstance(tree.body, ast.DictComp):
        raise ValueError("WORKPLACE_DICT_COMPREHENSION_REQUIRED")
    return tree


def _safe_eval(expression: str, records: List[Dict[str, Any]], required_form: str) -> Any:
    tree = _parse_expression(expression, required_form)
    return eval(compile(tree, "<workplace-performance>", "eval"), {"__builtins__": {}}, {"records": copy.deepcopy(records)})


def _expected_outputs(scenario: Dict[str, Any]) -> Dict[str, Any]:
    rows = scenario["records"]
    req = scenario["requirements"]
    threshold = int(req["priority_threshold"])
    id_field = req.get("id_field", "order_id")
    status_field = req.get("status_field", "status")
    status_match = req.get("status_match", "late")
    value_field = req.get("value_field", "amount")
    priority_output_key = req.get("priority_output_key", "priority_order_ids")
    mapping_output_key = req.get("mapping_output_key", "late_amount_by_id")
    priority = [r[id_field] for r in rows if r[status_field] == status_match and int(r[value_field]) >= threshold]
    mapping = {r[id_field]: r[value_field] for r in rows if r[status_field] == status_match}
    return {priority_output_key: priority, mapping_output_key: mapping}


def evaluate_workplace_submission(*, scenario: Dict[str, Any], submission: Dict[str, Any]) -> Dict[str, Any]:
    failures: List[str] = []
    conditions = submission.get("conditions", {})
    if conditions.get("assisted") is not False:
        failures.append("ASSISTED_PERFORMANCE_NOT_INDEPENDENT")
    if conditions.get("answer_revealed_before_commit") is not False:
        failures.append("ANSWER_EXPOSURE_CONTAMINATED")
    if conditions.get("scenario_previously_seen") is not False:
        failures.append("SCENARIO_EXPOSURE_CONTAMINATED")
    if not submission.get("artifact", {}).get("priority_expression"):
        failures.append("PRIORITY_EXPRESSION_MISSING")
    mapping_expression = submission.get("artifact", {}).get("mapping_expression") or submission.get("artifact", {}).get("late_amount_expression")
    if not mapping_expression:
        failures.append("LATE_AMOUNT_EXPRESSION_MISSING")
    defenses = submission.get("defense_responses", {})
    required_defense_ids = {x["prompt_id"] for x in scenario.get("defense_prompts", [])}
    if set(defenses) != required_defense_ids or any(len(str(v).strip()) < 20 for v in defenses.values()):
        failures.append("DEFENSE_RESPONSE_STRUCTURALLY_INCOMPLETE")

    expected = _expected_outputs(scenario)
    artifact = submission.get("artifact", {})
    observed: Dict[str, Any] = {}
    mechanical = {
        "WP-PY-01": "FAILED",
        "WP-PY-02": "FAILED",
        "WP-PY-03": "FAILED",
        "WP-PY-04": "HUMAN_REVIEW_REQUIRED",
    }
    if not failures or not any(x.endswith("MISSING") for x in failures):
        try:
            priority_output_key = scenario.get("requirements", {}).get("priority_output_key", "priority_order_ids")
            observed[priority_output_key] = _safe_eval(
                artifact.get("priority_expression", ""), scenario["records"], "LIST_COMPREHENSION"
            )
            mechanical["WP-PY-01"] = "VERIFIED"
        except Exception as exc:
            failures.append("PRIORITY_ARTIFACT_INVALID:" + str(exc))
        try:
            mapping_output_key = scenario.get("requirements", {}).get("mapping_output_key", "late_amount_by_id")
            observed[mapping_output_key] = _safe_eval(
                artifact.get("mapping_expression") or artifact.get("late_amount_expression", ""), scenario["records"], "DICT_COMPREHENSION"
            )
            mechanical["WP-PY-02"] = "VERIFIED"
        except Exception as exc:
            failures.append("LATE_AMOUNT_ARTIFACT_INVALID:" + str(exc))

    if mechanical["WP-PY-01"] == mechanical["WP-PY-02"] == "VERIFIED":
        if observed == expected:
            mechanical["WP-PY-03"] = "VERIFIED"
        else:
            failures.append("BUSINESS_OUTPUT_MISMATCH")

    declared = artifact.get("declared_outputs")
    if declared is not None and declared != observed:
        failures.append("DECLARED_OUTPUT_DOES_NOT_MATCH_EXECUTED_ARTIFACT")

    independent_ok = not any(x in failures for x in (
        "ASSISTED_PERFORMANCE_NOT_INDEPENDENT", "ANSWER_EXPOSURE_CONTAMINATED", "SCENARIO_EXPOSURE_CONTAMINATED"
    ))
    mechanical_ok = all(mechanical[k] == "VERIFIED" for k in ("WP-PY-01", "WP-PY-02", "WP-PY-03"))
    structural_defense_ok = "DEFENSE_RESPONSE_STRUCTURALLY_INCOMPLETE" not in failures
    if not independent_ok:
        status = "INADMISSIBLE_FOR_INDEPENDENT_CAPABILITY_EVIDENCE"
    elif not mechanical_ok or not structural_defense_ok:
        status = "FAILED_WORKPLACE_PERFORMANCE"
    else:
        status = "MECHANICALLY_VERIFIED_DEFENSE_REVIEW_REQUIRED"

    result = {
        "version": WORKPLACE_PERFORMANCE_VERSION,
        "rubric_version": WORKPLACE_RUBRIC_VERSION,
        "scenario_id": scenario["scenario_id"],
        "scenario_digest": digest(scenario),
        "submission_id": submission.get("submission_id"),
        "submission_digest": digest(submission),
        "learner_id": submission.get("learner_id"),
        "course_id": submission.get("course_id"),
        "status": status,
        "independent_conditions_satisfied": independent_ok,
        "mechanical_artifact_verification": "PASS" if mechanical_ok else "FAIL",
        "defense_semantic_standing": "HUMAN_REVIEW_REQUIRED" if structural_defense_ok else "STRUCTURALLY_INCOMPLETE",
        "criterion_results": mechanical,
        "observed_outputs": observed,
        "expected_outputs_digest": digest(expected),
        "artifact_digest": digest(artifact),
        "defense_digest": digest(defenses),
        "evidence_observed_at": int(submission.get("observed_at", 0)),
        "failures": sorted(set(failures)),
        "limitations": [
            "BOUNDED_SCENARIO_ONLY",
            "DEFENSE_SEMANTIC_QUALITY_NOT_MECHANICALLY_VERIFIED",
            "NOT_A_JOB_READY_OR_ROLE_QUALIFICATION_DECISION",
        ],
    }
    result["evaluation_digest"] = digest(result)
    return result


def adjudicate_workplace_defense_reviews(review_records: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    records = [copy.deepcopy(x) for x in review_records]
    if not records:
        return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "PENDING_HUMAN_DEFENSE_REVIEW", "records": []}
    admissible = [x for x in records if x.get("independence") == "INDEPENDENT" and x.get("standing") in {"APPROVE", "REVISE", "ABSTAIN"}]
    ids = [str(x.get("reviewer_id", "")) for x in admissible]
    if len(admissible) < 1 or any(not x for x in ids) or len(ids) != len(set(ids)):
        return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "PENDING_HUMAN_DEFENSE_REVIEW", "reason_codes": ["REVIEWER_IDENTITY_OR_INDEPENDENCE_INSUFFICIENT"], "records": records}
    if any(x.get("standing") == "ABSTAIN" for x in admissible):
        return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "ABSTAINED_REQUIRES_ADJUDICATION", "records": records}
    if len({x.get("standing") for x in admissible}) > 1:
        return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "DISAGREEMENT_REQUIRES_ADJUDICATION", "records": records}
    if {x.get("standing") for x in admissible} == {"REVISE"}:
        return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "REVISIONS_REQUIRED", "records": records}
    classes = {x.get("evidence_class", "UNKNOWN") for x in admissible}
    if classes == {"REAL_HUMAN_REVIEW"}:
        return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "INDEPENDENT_HUMAN_DEFENSE_APPROVED", "records": records}
    return {"policy_version": DEFENSE_REVIEW_POLICY_VERSION, "status": "SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE", "records": records}


def build_capability_evidence_dossier(
    *, repo: Repository, course: Dict[str, Any], learner_id: str, evaluation: Dict[str, Any],
    defense_reviews: Iterable[Dict[str, Any]] = (), intended_use: str = "EMPLOYER_CAPABILITY_PRESENTATION",
) -> Dict[str, Any]:
    skill_rows = []
    all_mastered = True
    for skill in course.get("skills", []):
        sid = skill["skill_id"]
        projection = repo.latest_projection(learner_id, course["course_id"], sid)
        if not projection:
            all_mastered = False
            skill_rows.append({"skill_id": sid, "stage": "NO_PROJECTION", "canonical_evidence_refs": []})
            continue
        if projection.get("stage") != "MASTERED":
            all_mastered = False
        skill_rows.append({
            "skill_id": sid,
            "criterion_ids": list(skill.get("criterion_ids", [])),
            "stage": projection.get("stage"),
            "gate_states": copy.deepcopy(projection.get("gate_states", {})),
            "canonical_evidence_refs": list(projection.get("counted_attempt_ids", [])),
            "projection_reason_codes": list(projection.get("reason_codes", [])),
        })

    defense = adjudicate_workplace_defense_reviews(defense_reviews)
    perf_status = evaluation.get("status")
    if perf_status == "INADMISSIBLE_FOR_INDEPENDENT_CAPABILITY_EVIDENCE":
        claim_ceiling = "NO_INDEPENDENT_CAPABILITY_CLAIM"
    elif perf_status != "MECHANICALLY_VERIFIED_DEFENSE_REVIEW_REQUIRED":
        claim_ceiling = "NO_SUCCESSFUL_WORKPLACE_PERFORMANCE_CLAIM"
    elif not all_mastered:
        claim_ceiling = "BOUNDED_WORKPLACE_TASK_MECHANICALLY_DEMONSTRATED_NO_MASTERY_CLAIM"
    elif defense["status"] == "INDEPENDENT_HUMAN_DEFENSE_APPROVED":
        claim_ceiling = "AUTHENTIC_WORKPLACE_TASK_DEMONSTRATED_WITHIN_DECLARED_SCENARIO"
    else:
        claim_ceiling = "AUTHENTIC_WORKPLACE_ARTIFACT_MECHANICALLY_DEMONSTRATED_DEFENSE_REVIEW_PENDING"

    dossier = {
        "version": CAPABILITY_DOSSIER_VERSION,
        "learner_id": learner_id,
        "course_id": course["course_id"],
        "course_digest": digest(course),
        "intended_use": intended_use,
        "workplace_scenario_id": evaluation["scenario_id"],
        "workplace_scenario_digest": evaluation["scenario_digest"],
        "evidence_observed_at": int(evaluation.get("evidence_observed_at", 0)),
        "workplace_evaluation_id": "WPEVAL-" + str(evaluation["submission_id"]),
        "workplace_evaluation_digest": evaluation["evaluation_digest"],
        "canonical_workplace_evidence_refs": [
            "workplace_submission:" + str(evaluation["submission_id"]) + ":v1",
            "workplace_evaluation:WPEVAL-" + str(evaluation["submission_id"]) + ":v1",
        ],
        "artifact_ref": "workplace_submission:" + str(evaluation["submission_id"]) + ":v1#artifact",
        "artifact_digest": evaluation["artifact_digest"],
        "assessment_conditions": {
            "independent": evaluation["independent_conditions_satisfied"],
            "mechanical_artifact_verification": evaluation["mechanical_artifact_verification"],
            "defense_semantic_standing": evaluation["defense_semantic_standing"],
        },
        "criterion_results": copy.deepcopy(evaluation["criterion_results"]),
        "learning_skill_evidence": skill_rows,
        "defense_review": defense,
        "claim_ceiling": claim_ceiling,
        "forbidden_claims_without_external_authority": sorted(FORBIDDEN_EXTERNAL_CLAIMS),
        "external_eligibility_decision": "NOT_MADE",
        "portfolio_presentation_owner": "MOD-PORTFOLIO-001",
        "learning_competence_owner": "LEARNING_COMPETENCE_EVIDENCE_SEMANTICS",
        "limitations": [
            "BOUNDED_SCENARIO_NOT_ENTIRE_OCCUPATION",
            "EMPLOYER_DECIDES_RELEVANCE_AND_HIRING",
            "NO_JOB_READY_OR_QUALIFIED_FOR_ROLE_CLAIM",
            "NO_CERTIFICATION_OR_LICENSE_CLAIM",
            "DEFENSE_REQUIRES_REAL_HUMAN_REVIEW_FOR_STRONGEST_SCENARIO_CLAIM" if defense["status"] != "INDEPENDENT_HUMAN_DEFENSE_APPROVED" else "HUMAN_DEFENSE_REVIEW_RECORDED",
        ],
    }
    dossier["dossier_digest"] = digest(dossier)
    return dossier


def build_portfolio_handoff(*, dossier: Dict[str, Any]) -> Dict[str, Any]:
    handoff = {
        "version": PORTFOLIO_HANDOFF_VERSION,
        "read_only": True,
        "portfolio_owner": "MOD-PORTFOLIO-001",
        "source_owner": "LEARNING_COMPETENCE_EVIDENCE_SEMANTICS",
        "capability_dossier_version": dossier["version"],
        "capability_dossier_digest": dossier["dossier_digest"],
        "learner_id": dossier["learner_id"],
        "course_id": dossier["course_id"],
        "scenario_id": dossier["workplace_scenario_id"],
        "claim_ceiling": dossier["claim_ceiling"],
        "canonical_workplace_evidence_refs": list(dossier.get("canonical_workplace_evidence_refs", [])),
        "artifact_ref": dossier.get("artifact_ref"),
        "artifact_digest": dossier.get("artifact_digest"),
        "allowed_presentation": [
            "DISPLAY_EXACT_CAPABILITY_CLAIM_AT_OR_BELOW_CEILING",
            "DISPLAY_EVIDENCE_CONDITIONS_AND_LIMITATIONS",
            "LINK_TO_VERIFIABLE_ARTIFACT_AND_EVIDENCE_REFS",
        ],
        "forbidden_without_external_authority": sorted(FORBIDDEN_EXTERNAL_CLAIMS),
        "portfolio_may_rewrite_competence_truth": False,
    }
    handoff["handoff_digest"] = digest(handoff)
    return handoff


def verify_portfolio_handoff(*, dossier: Dict[str, Any], handoff: Dict[str, Any]) -> Dict[str, Any]:
    failures = []
    expected_dossier = copy.deepcopy(dossier)
    stored = expected_dossier.pop("dossier_digest", None)
    if stored != digest(expected_dossier):
        failures.append("CAPABILITY_DOSSIER_DIGEST_MISMATCH")
    h = copy.deepcopy(handoff)
    stored_h = h.pop("handoff_digest", None)
    if stored_h != digest(h):
        failures.append("PORTFOLIO_HANDOFF_DIGEST_MISMATCH")
    if handoff.get("capability_dossier_digest") != dossier.get("dossier_digest"):
        failures.append("PORTFOLIO_HANDOFF_WRONG_DOSSIER")
    if handoff.get("claim_ceiling") != dossier.get("claim_ceiling"):
        failures.append("PORTFOLIO_CLAIM_CEILING_CHANGED")
    if handoff.get("read_only") is not True or handoff.get("portfolio_may_rewrite_competence_truth") is not False:
        failures.append("PORTFOLIO_MUTABILITY_BOUNDARY_VIOLATED")
    return {"status": "PASS" if not failures else "FAIL", "failures": failures}


class WorkplacePerformanceService:
    PHASES = ("SCENARIO_BOUND", "SUBMISSION_RECORDED", "ARTIFACT_VERIFIED", "DOSSIER_BUILT", "HANDOFF_BUILT")

    def __init__(self, repo: Repository, scenario: Dict[str, Any]):
        self.repo = repo
        self.scenario = copy.deepcopy(scenario)

    def execute(
        self, *, operation_id: str, job_id: str, course: Dict[str, Any], learner_id: str,
        submission: Dict[str, Any], defense_reviews: Iterable[Dict[str, Any]] = (),
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        reviews = [copy.deepcopy(x) for x in defense_reviews]
        if submission.get("learner_id") != learner_id:
            raise ValueError("WORKPLACE_SUBMISSION_LEARNER_MISMATCH")
        if submission.get("course_id") != course.get("course_id"):
            raise ValueError("WORKPLACE_SUBMISSION_COURSE_MISMATCH")
        course_skill_ids = {x.get("skill_id") for x in course.get("skills", [])}
        if not set(self.scenario.get("course_skill_refs", [])).issubset(course_skill_ids):
            raise ValueError("WORKPLACE_SCENARIO_SKILL_BINDING_MISMATCH")
        payload = {
            "job_id": job_id,
            "course_id": course["course_id"],
            "course_digest": digest(course),
            "learner_id": learner_id,
            "scenario_id": self.scenario["scenario_id"],
            "scenario_digest": digest(self.scenario),
            "submission_id": submission.get("submission_id"),
            "submission_digest": digest(submission),
            "defense_reviews_digest": digest(reviews),
            "version": WORKPLACE_PERFORMANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        job = self.repo.get_job(job_id)
        if job is not None and digest(job.get("payload", {})) != digest(payload):
            raise ValueError("WORKPLACE_JOB_PAYLOAD_DRIFT")
        checkpoint = int(job["checkpoint"]) if job else 0

        scenario_obj_id = "WPSCEN-" + self.scenario["scenario_id"]
        submission_id = str(submission["submission_id"])
        evaluation_id = "WPEVAL-" + submission_id
        dossier_id = "CAPDOS-" + submission_id
        handoff_id = "PORTHANDOFF-" + submission_id

        if checkpoint < 1:
            self.repo.put_object("workplace_scenario", scenario_obj_id, 1, self.scenario)
            self.repo.save_job(job_id, "RUNNING", "SCENARIO_BOUND", 1, payload)
            if crash_after_phase == "SCENARIO_BOUND":
                raise InjectedCrash("crash after scenario bound")
        else:
            persisted_scenario = self.repo.get_object("workplace_scenario", scenario_obj_id, 1)
            if persisted_scenario is None or digest(persisted_scenario) != digest(self.scenario):
                raise ValueError("WORKPLACE_SCENARIO_DRIFT")

        if checkpoint < 2:
            self.repo.put_object("workplace_submission", submission_id, 1, submission)
            self.repo.save_job(job_id, "RUNNING", "SUBMISSION_RECORDED", 2, payload)
            if crash_after_phase == "SUBMISSION_RECORDED":
                raise InjectedCrash("crash after submission recorded")
        else:
            persisted = self.repo.get_object("workplace_submission", submission_id, 1)
            if persisted is None or digest(persisted) != digest(submission):
                raise ValueError("WORKPLACE_SUBMISSION_DRIFT")

        if checkpoint < 3:
            evaluation = evaluate_workplace_submission(scenario=self.scenario, submission=submission)
            self.repo.put_object("workplace_evaluation", evaluation_id, 1, evaluation)
            self.repo.save_job(job_id, "RUNNING", "ARTIFACT_VERIFIED", 3, payload)
            if crash_after_phase == "ARTIFACT_VERIFIED":
                raise InjectedCrash("crash after artifact verified")
        else:
            evaluation = self.repo.get_object("workplace_evaluation", evaluation_id, 1)
            if evaluation is None:
                raise ValueError("WORKPLACE_EVALUATION_MISSING_AFTER_CHECKPOINT")

        if checkpoint < 4:
            dossier = build_capability_evidence_dossier(
                repo=self.repo, course=course, learner_id=learner_id, evaluation=evaluation,
                defense_reviews=reviews,
            )
            self.repo.put_object("capability_evidence_dossier", dossier_id, 1, dossier)
            self.repo.save_job(job_id, "RUNNING", "DOSSIER_BUILT", 4, payload)
            if crash_after_phase == "DOSSIER_BUILT":
                raise InjectedCrash("crash after dossier built")
        else:
            dossier = self.repo.get_object("capability_evidence_dossier", dossier_id, 1)
            if dossier is None:
                raise ValueError("CAPABILITY_DOSSIER_MISSING_AFTER_CHECKPOINT")

        if checkpoint < 5:
            handoff = build_portfolio_handoff(dossier=dossier)
            self.repo.put_object("portfolio_evidence_handoff", handoff_id, 1, handoff)
            self.repo.save_job(job_id, "RUNNING", "HANDOFF_BUILT", 5, payload)
            if crash_after_phase == "HANDOFF_BUILT":
                raise InjectedCrash("crash after handoff built")
        else:
            handoff = self.repo.get_object("portfolio_evidence_handoff", handoff_id, 1)
            if handoff is None:
                raise ValueError("PORTFOLIO_HANDOFF_MISSING_AFTER_CHECKPOINT")

        result = {
            "status": "COMPLETE",
            "workplace_evaluation_id": evaluation_id,
            "workplace_evaluation_digest": evaluation["evaluation_digest"],
            "capability_dossier_id": dossier_id,
            "capability_dossier_digest": dossier["dossier_digest"],
            "portfolio_handoff_id": handoff_id,
            "portfolio_handoff_digest": handoff["handoff_digest"],
            "claim_ceiling": dossier["claim_ceiling"],
        }
        self.repo.save_job(job_id, "COMPLETE", "COMPLETE", 6, payload)
        self.repo.record_operation(operation_id, payload, result)
        return result
