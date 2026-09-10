from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict

from learning_lab.cssgb_2022_value_mechanisms import (
    CRITERION_ID,
    DESIRED_OUTCOME,
    DOMAIN_KEY,
    ITEM_IDS,
    SCORING_TYPE,
    SKILL_ID,
    CSSGBValueMechanismOracle,
    build_course,
    dossier_copy,
    tutor_move,
    tutor_observer,
)
from learning_lab.domain_general import DomainGeneralLearningEngine, DomainRegistry, DomainSpec
from learning_lab.repository import Repository

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
QDIR = ROOT / "qualification" / "learning"
EVIDENCE_DIR = Path(os.environ.get("EVIDENCE_DIR", os.environ.get("RUNNER_TEMP", str(ROOT)))) / "learning-001e-batch-01-evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

CANDIDATE_NAME = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-BATCH-01-CANDIDATE-060A.json"
CONTRACT_NAME = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-CONTRACT-059.json"


def load_local(name: str) -> Dict[str, Any]:
    return json.loads((QDIR / name).read_text(encoding="utf-8"))


def git_show_json(ref: str, repo_path: str) -> Dict[str, Any]:
    r = subprocess.run(
        ["git", "show", f"{ref}:{repo_path}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        fail("HISTORICAL_INPUT_UNAVAILABLE", f"{ref}:{repo_path}:{r.stderr.strip()}")
    try:
        return json.loads(r.stdout)
    except Exception as exc:
        fail("HISTORICAL_INPUT_JSON_INVALID", f"{ref}:{repo_path}:{exc}")
    raise AssertionError("unreachable")


def canonical_text(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_text(value).encode("utf-8")).hexdigest()


def fail(code: str, detail: str = "") -> None:
    message = f"{code}:{detail}" if detail else code
    payload = {
        "subject_sha": os.environ.get("GITHUB_SHA", "LOCAL"),
        "result_class": "FAIL",
        "failure": message,
    }
    (EVIDENCE_DIR / "failure-summary.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    raise AssertionError(message)


def require(condition: bool, code: str, detail: str = "") -> None:
    if not condition:
        fail(code, detail)


def item_by_id(course: Dict[str, Any], item_id: str) -> Dict[str, Any]:
    for item in course.get("items", []):
        if item.get("item_id") == item_id:
            return item
    fail("ITEM_NOT_FOUND", item_id)
    raise AssertionError("unreachable")


candidate = load_local(CANDIDATE_NAME)
contract = load_local(CONTRACT_NAME)
require(candidate["contract"].endswith(CONTRACT_NAME), "CONTRACT_POINTER_DRIFT")
require(candidate["base_control_head"] == contract["base_control_head"], "BASE_CONTROL_HEAD_DRIFT")

pred = candidate["predecessor"]
blueprint = git_show_json(pred["durable_blueprint_commit"], pred["durable_blueprint_path"])
observed_blueprint_digest = sha256_json(blueprint)
require(observed_blueprint_digest == pred["blueprint_digest_sha256"], "BLUEPRINT_DIGEST_DRIFT", observed_blueprint_digest)
require(pred["blueprint_digest_sha256"] == contract["predecessor"]["blueprint_digest_sha256"], "CONTRACT_BLUEPRINT_DIGEST_DRIFT")
require(blueprint.get("course_identity", {}).get("state") == "READY_FOR_REVIEW", "BLUEPRINT_STATE_DRIFT")

nodes = blueprint.get("execution_nodes", [])
require(len(nodes) == 66, "BLUEPRINT_NODE_COUNT", str(len(nodes)))
first = nodes[0]
selection = candidate["selection"]
require(first.get("ordinal") == selection["ordinal"] == 1, "FIRST_NODE_ORDINAL_DRIFT")
require(first["requirement"]["requirement_id"] == selection["requirement_id"], "FIRST_REQUIREMENT_DRIFT")
require(first["skill"]["skill_id"] == selection["skill_id"] == SKILL_ID, "FIRST_SKILL_DRIFT")
require(first["criterion"]["criterion_id"] == selection["criterion_id"] == CRITERION_ID, "FIRST_CRITERION_DRIFT")
require(first["assessment_binding"]["assessment_target_id"] == selection["assessment_target_id"], "FIRST_ASSESSMENT_DRIFT")
require(first["lesson_spec"]["materialization_status"] == "UNMATERIALIZED__GROUNDING_AND_REVIEW_REQUIRED", "PREMATURE_001D_MATERIALIZATION")
require(first["assessment_binding"]["runtime_scoring_status"] == "RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND", "PREMATURE_001D_ORACLE_BIND")

# Dossier shape and evidence-boundary checks.
dossier = dossier_copy()
required_source_fields = set(contract["grounding_policy"]["source_record_fields"])
required_claim_fields = set(contract["grounding_policy"]["claim_record_fields"])
require(dossier.get("source_bytes_archived") is False, "SOURCE_ARCHIVE_STANDING_DRIFT")
require(bool(dossier.get("source_bytes_archive_limitation")), "SOURCE_ARCHIVE_LIMITATION_MISSING")
require(len(dossier.get("sources", [])) == candidate["grounding"]["source_count"], "SOURCE_COUNT_DRIFT")
require(len(dossier.get("claims", [])) == candidate["grounding"]["claim_count"], "CLAIM_COUNT_DRIFT")
for source in dossier["sources"]:
    require(required_source_fields.issubset(source), "SOURCE_RECORD_FIELD_GAP", source.get("source_id", "UNKNOWN"))
    require(source.get("standing") == "ADMITTED", "SOURCE_NOT_ADMITTED", source.get("source_id", "UNKNOWN"))
for claim in dossier["claims"]:
    require(required_claim_fields.issubset(claim), "CLAIM_RECORD_FIELD_GAP", claim.get("claim_id", "UNKNOWN"))

oracle = CSSGBValueMechanismOracle()
spec = DomainSpec(
    domain_key=DOMAIN_KEY,
    desired_outcome=DESIRED_OUTCOME,
    dossier=copy.deepcopy(dossier),
    course_factory=build_course,
    behavior_oracle=oracle,
    generation_adapter_id="CSSGB-2022-001E-B01-DETERMINISTIC-CONTENT-V1",
    maintenance_tasks={},
    transfer_tasks={},
    transfer_required_skills=set(),
    tutor_probes={},
    tutor_observer=tutor_observer,
    tutor_move=tutor_move,
)
registry = DomainRegistry([spec])

with tempfile.TemporaryDirectory() as td:
    repo = Repository(str(Path(td) / "learning.db"))
    engine = DomainGeneralLearningEngine(repo, registry=registry)
    result = engine.create_research_grounded_course_job(
        operation_id="OP-001E-B01-COURSE",
        job_id="JOB-001E-B01-COURSE",
        goal_id="GOAL-ASQ-CSSGB-2022-I.A.1-001E-B01",
        title="ASQ CSSGB 2022 I.A.1 - Value of Six Sigma",
        desired_outcome=DESIRED_OUTCOME,
    )
    require(result["state"] == "READY_FOR_REVIEW", "COURSE_ACTIVATION_BOUNDARY_BROKEN")
    require(result["validation_status"] == "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED", "COURSE_VALIDATION_STANDING_DRIFT")

    course = engine.course(result["course_id"])
    validation = repo.get_object("course_validation", result["validation_id"], 1)
    require(validation is not None, "COURSE_VALIDATION_MISSING")
    require(validation["grounding"]["status"] == "PASS", "GROUNDING_VALIDATION_FAILED")
    require(validation["instructional_design"]["status"] == "PASS", "INSTRUCTIONAL_VALIDATION_FAILED")
    require(validation["domain_behavior_oracle"]["status"] == "PASS", "REFERENCE_ORACLE_FAILED")
    require(validation["lesson_behavior_oracle"]["status"] == "PASS", "LESSON_BEHAVIOR_FAILED")

    require(len(course.get("skills", [])) == 1 and course["skills"][0]["skill_id"] == SKILL_ID, "COURSE_SKILL_MAPPING_DRIFT")
    require(len(course.get("criteria", [])) == 1 and course["criteria"][0]["criterion_id"] == CRITERION_ID, "COURSE_CRITERION_MAPPING_DRIFT")
    require(len(course.get("lessons", [])) == 1, "LESSON_COUNT_DRIFT")
    require(len(course.get("items", [])) == 4, "ITEM_COUNT_DRIFT")
    modes = [x["mode"] for x in course["items"]]
    require(modes.count("PRACTICE") == 2, "PRACTICE_COUNT_DRIFT")
    require(modes.count("MASTERY_CHECK") == 1, "MASTERY_COUNT_DRIFT")
    require(modes.count("RETENTION_CHECK") == 1, "RETENTION_COUNT_DRIFT")
    families = [x["family_id"] for x in course["items"]]
    require(len(families) == len(set(families)), "ASSESSMENT_FAMILY_REUSE")
    require(all(x.get("scoring_type") == SCORING_TYPE for x in course["items"]), "SCORING_TYPE_DRIFT")

    mastery = item_by_id(course, ITEM_IDS["mastery"])
    retention = item_by_id(course, ITEM_IDS["retention"])
    practice = item_by_id(course, ITEM_IDS["practice_1"])

    canonical_mastery = mastery["answer"]
    parsed = json.loads(canonical_mastery)
    semantically_equivalent_nonidentical = json.dumps(
        {
            "missing_evidence": parsed["missing_evidence"],
            "realized_impact_claimed": False,
            "mechanisms": list(reversed(parsed["mechanisms"])),
        },
        indent=2,
    )
    require(semantically_equivalent_nonidentical != canonical_mastery, "NONIDENTICAL_FIXTURE_COLLAPSED")
    oracle_checks = {
        "canonical_mastery_pass": oracle.score(mastery, canonical_mastery),
        "nonidentical_equivalent_pass": oracle.score(mastery, semantically_equivalent_nonidentical),
        "malformed_rejected": not oracle.score(mastery, "not-json"),
        "unsupported_pair_rejected": not oracle.score(
            mastery,
            json.dumps({
                "mechanisms": [
                    {"mechanism": "operational", "fact_ids": ["M-F1"]},
                    {"mechanism": "financial", "fact_ids": ["M-F1"]}
                ],
                "realized_impact_claimed": False,
                "missing_evidence": ["Financial evidence is absent."]
            })
        ),
        "unknown_fact_rejected": not oracle.score(
            mastery,
            json.dumps({
                "mechanisms": [
                    {"mechanism": "operational", "fact_ids": ["M-F1"]},
                    {"mechanism": "customer", "fact_ids": ["UNKNOWN-FACT"]}
                ],
                "realized_impact_claimed": False,
                "missing_evidence": ["Financial evidence is absent."]
            })
        ),
        "realized_impact_rejected": not oracle.score(
            mastery,
            json.dumps({
                "mechanisms": parsed["mechanisms"],
                "realized_impact_claimed": True,
                "missing_evidence": parsed["missing_evidence"]
            })
        ),
        "missing_evidence_omission_rejected": not oracle.score(
            mastery,
            json.dumps({
                "mechanisms": parsed["mechanisms"],
                "realized_impact_claimed": False,
                "missing_evidence": []
            })
        ),
    }
    for name, ok in oracle_checks.items():
        require(ok, "ORACLE_BEHAVIOR_DEFECT", name)

    learner_id = "SYNTHETIC-LEARNER-001E-B01"
    t0 = 1_000_000
    practice_result = engine.submit_attempt(
        operation_id="OP-001E-B01-PRACTICE",
        attempt_id="ATT-001E-B01-PRACTICE",
        learner_id=learner_id,
        course_id=result["course_id"],
        item_id=practice["item_id"],
        response=practice["answer"],
        submitted_at=t0,
    )
    require(practice_result["attempt"]["correct"] is True, "PRACTICE_ORACLE_PATH_FAILED")
    require(practice_result["projection"]["stage"] == "BUILDING", "PRACTICE_PROMOTED_TO_MASTERY")
    require("PRACTICE_NOT_MASTERY" in practice_result["projection"]["reason_codes"], "PRACTICE_BOUNDARY_REASON_MISSING")

    rejected_response = json.dumps({
        "mechanisms": parsed["mechanisms"],
        "realized_impact_claimed": True,
        "missing_evidence": parsed["missing_evidence"]
    })
    rejected_mastery = engine.submit_attempt(
        operation_id="OP-001E-B01-MASTERY-REJECT",
        attempt_id="ATT-001E-B01-MASTERY-REJECT",
        learner_id=learner_id,
        course_id=result["course_id"],
        item_id=mastery["item_id"],
        response=rejected_response,
        submitted_at=t0 + 100,
    )
    require(rejected_mastery["attempt"]["correct"] is False, "RUNTIME_ORACLE_REJECTION_NOT_RECORDED")

    accepted_mastery = engine.submit_attempt(
        operation_id="OP-001E-B01-MASTERY-PASS",
        attempt_id="ATT-001E-B01-MASTERY-PASS",
        learner_id=learner_id,
        course_id=result["course_id"],
        item_id=mastery["item_id"],
        response=semantically_equivalent_nonidentical,
        submitted_at=t0 + 200,
    )
    require(accepted_mastery["attempt"]["correct"] is True, "RUNTIME_ORACLE_ACCEPTANCE_NOT_RECORDED")
    require(accepted_mastery["projection"]["stage"] == "RETENTION_DUE", "MASTERY_BYPASSED_RETENTION_GATE")
    require(accepted_mastery["projection"]["gate_states"]["RETENTION"] == "IN_PROGRESS", "RETENTION_GATE_NOT_IN_PROGRESS")

    early_retention = engine.submit_attempt(
        operation_id="OP-001E-B01-RETENTION-EARLY",
        attempt_id="ATT-001E-B01-RETENTION-EARLY",
        learner_id=learner_id,
        course_id=result["course_id"],
        item_id=retention["item_id"],
        response=retention["answer"],
        submitted_at=t0 + 300,
    )
    require(early_retention["attempt"]["correct"] is True, "RETENTION_ORACLE_PATH_FAILED")
    require(early_retention["projection"]["stage"] == "RETENTION_DUE", "EARLY_RETENTION_SATISFIED_GATE")
    require(
        early_retention["projection"]["excluded_attempts"].get("ATT-001E-B01-RETENTION-EARLY") == "RETENTION_DELAY_NOT_MET",
        "EARLY_RETENTION_EXCLUSION_MISSING",
    )

    delayed_retention = engine.submit_attempt(
        operation_id="OP-001E-B01-RETENTION-DELAYED",
        attempt_id="ATT-001E-B01-RETENTION-DELAYED",
        learner_id=learner_id,
        course_id=result["course_id"],
        item_id=retention["item_id"],
        response=retention["answer"],
        submitted_at=t0 + 200 + engine.RETENTION_DELAY_SECONDS,
    )
    require(delayed_retention["attempt"]["correct"] is True, "DELAYED_RETENTION_ORACLE_FAILED")
    require(delayed_retention["projection"]["stage"] == "MASTERED", "SYNTHETIC_DELAYED_RETENTION_GATE_FAILED")
    require(engine.course(result["course_id"])["state"] == "READY_FOR_REVIEW", "COURSE_ACTIVATED_DURING_QUALIFICATION")

    summary = {
        "subject_sha": os.environ.get("GITHUB_SHA", "LOCAL"),
        "result_class": "PASS",
        "phase": "001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION",
        "batch_index": 1,
        "selected_requirement_id": selection["requirement_id"],
        "selected_skill_id": SKILL_ID,
        "selected_criterion_id": CRITERION_ID,
        "blueprint_digest_sha256": observed_blueprint_digest,
        "grounding": validation["grounding"],
        "instructional_design": validation["instructional_design"],
        "reference_oracle": validation["domain_behavior_oracle"],
        "lesson_example_oracle": validation["lesson_behavior_oracle"],
        "oracle_behavior_checks": oracle_checks,
        "runtime_attempt_checks": {
            "practice_correct_but_not_mastery": True,
            "oracle_rejection_recorded": True,
            "nonidentical_semantic_mastery_response_accepted": True,
            "mastery_stage_before_retention": accepted_mastery["projection"]["stage"],
            "early_retention_excluded": True,
            "synthetic_delayed_retention_stage": delayed_retention["projection"]["stage"],
        },
        "course_state": course["state"],
        "runtime_activation_allowed": False,
        "materialized_execution_node_count": 1,
        "instructional_content_materialized_for_ordinal_1": True,
        "qualified_scoring_oracle_bound_for_ordinal_1": True,
        "learner_mastery": "UNOBSERVED_REAL_LEARNER",
        "psychometric_validity": "UNOBSERVED",
        "retention_effectiveness": "UNOBSERVED_REAL_LEARNER",
        "transfer_effectiveness": "UNOBSERVED",
        "workplace_effectiveness": "UNOBSERVED",
        "sme_approval": "UNOBSERVED",
        "certification_equivalence": "UNOBSERVED",
        "a01_native_production_authority": "NOT_INFERRED",
        "standing": "001E_BATCH_01_MECHANICALLY_QUALIFIED__ONE_OF_66_NODES_REALIZED__FULL_COURSE_REMAINS_READY_FOR_REVIEW",
        "next_successor": candidate["on_pass"],
    }
    (EVIDENCE_DIR / "qualification-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "realized-course-slice.json").write_text(json.dumps(course, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "research-dossier.json").write_text(json.dumps(dossier, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, separators=(",", ":")))
