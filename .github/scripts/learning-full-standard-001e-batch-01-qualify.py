from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path

from learning_lab.cssgb_full_standard import (
    CSSGB_001E_BATCH_01_CRITERION_ID,
    CSSGB_001E_BATCH_01_DOMAIN_KEY,
    CSSGB_001E_BATCH_01_LESSON_ID,
    CSSGB_001E_BATCH_01_OUTCOME,
    CSSGB_001E_BATCH_01_REQUIREMENT_ID,
    CSSGB_001E_BATCH_01_SKILL_ID,
    CSSGB_VALUE_SCORING_TYPE,
    CSSGBValueMechanismOracle,
    build_i_a_1_slice_course,
    i_a_1_dossier,
)
from learning_lab.domain_general import DomainGeneralLearningEngine, DomainRegistry, DomainSpec
from learning_lab.real_course import validate_grounding, validate_instructional_design
from learning_lab.repository import Repository, digest


ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
QDIR = ROOT / "qualification" / "learning"
EVIDENCE_DIR = Path(os.environ.get("EVIDENCE_DIR", os.environ.get("RUNNER_TEMP", ROOT) + "/learning-001e-batch-01-evidence"))
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
CANDIDATE_NAME = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-BATCH-01-CANDIDATE-060A.json"
CONTRACT_NAME = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-CONTRACT-059.json"
BLUEPRINT_REF = "02dc615fcb5d44b997ed1322848eccc6e37bb172"
BLUEPRINT_PATH = "qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-BLUEPRINT-057B.json"
EXPECTED_BLUEPRINT_DIGEST = "98aa0b621b0cbe5234d5dd8bdb9890a1692c4c9d91aaf955fd3a459632949e54"


def fail(code: str, detail: str = "") -> None:
    message = f"{code}:{detail}" if detail else code
    (EVIDENCE_DIR / "failure-summary.json").write_text(
        json.dumps({"subject_sha": os.environ.get("GITHUB_SHA", "LOCAL"), "result_class": "FAIL", "failure": message}, indent=2) + "\n",
        encoding="utf-8",
    )
    raise AssertionError(message)


def canonical_digest(value) -> str:
    text = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_local(name: str):
    return json.loads((QDIR / name).read_text(encoding="utf-8"))


def git_show_json(ref: str, path: str):
    proc = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        fail("HISTORICAL_INPUT_UNAVAILABLE", f"{ref}:{path}:{proc.stderr.strip()}")
    try:
        return json.loads(proc.stdout)
    except Exception as exc:
        fail("HISTORICAL_INPUT_JSON_INVALID", f"{ref}:{path}:{type(exc).__name__}")


def response(mechanisms, *, realized=False, missing=None):
    return json.dumps(
        {"mechanisms": mechanisms, "realized_impact_claimed": realized, "missing_evidence": missing or []},
        sort_keys=True,
        separators=(",", ":"),
    )


def main() -> None:
    candidate = load_local(CANDIDATE_NAME)
    contract = load_local(CONTRACT_NAME)
    if candidate.get("contract") != f"qualification/learning/{CONTRACT_NAME}":
        fail("CONTRACT_POINTER_DRIFT")
    if candidate.get("base_control_head") != "507fcb84023998d6f56ef7459959054f85881716":
        fail("BASE_CONTROL_HEAD_DRIFT")
    if contract.get("base_control_head") != "706d5eadd08897d1fa464aff804a245997822bde":
        fail("CONTRACT_PREDECESSOR_DRIFT")
    if candidate.get("batch_size") != 1 or candidate.get("selection", {}).get("001d_ordinal") != 1:
        fail("BATCH_SELECTION_DRIFT")

    blueprint = git_show_json(BLUEPRINT_REF, BLUEPRINT_PATH)
    observed_blueprint_digest = canonical_digest(blueprint)
    if observed_blueprint_digest != EXPECTED_BLUEPRINT_DIGEST:
        fail("001D_BLUEPRINT_DIGEST_DRIFT", observed_blueprint_digest)
    if candidate["selection"]["001d_blueprint_digest_sha256"] != observed_blueprint_digest:
        fail("CANDIDATE_BLUEPRINT_DIGEST_DRIFT")
    nodes = blueprint.get("execution_nodes", [])
    if len(nodes) != 66:
        fail("001D_NODE_COUNT", str(len(nodes)))
    first = nodes[0]
    if first["ordinal"] != 1 or first["requirement"]["requirement_id"] != CSSGB_001E_BATCH_01_REQUIREMENT_ID:
        fail("FIRST_NODE_IDENTITY_DRIFT")
    if first["skill"]["skill_id"] != CSSGB_001E_BATCH_01_SKILL_ID:
        fail("FIRST_SKILL_IDENTITY_DRIFT")
    if first["criterion"]["criterion_id"] != CSSGB_001E_BATCH_01_CRITERION_ID:
        fail("FIRST_CRITERION_IDENTITY_DRIFT")
    if first["lesson_spec"]["lesson_id"] != CSSGB_001E_BATCH_01_LESSON_ID:
        fail("FIRST_LESSON_IDENTITY_DRIFT")
    if first["assessment_binding"]["runtime_scoring_status"] != "RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND":
        fail("001D_SCORING_PRECONDITION_DRIFT")
    if first["assessment_binding"]["mastery_evidence_admission_allowed"] is not False:
        fail("001D_PREMATURE_MASTERY_ADMISSION")

    dossier = i_a_1_dossier()
    if dossier["frozen_requirement_identity"]["requirement_id"] != CSSGB_001E_BATCH_01_REQUIREMENT_ID:
        fail("DOSSIER_FROZEN_REQUIREMENT_DRIFT")
    if dossier["frozen_requirement_identity"]["supplemental_sources_replace_frozen_identity"] is not False:
        fail("SUPPLEMENTAL_SOURCE_REPLACEMENT_FORBIDDEN")
    admitted_sources = [s for s in dossier["sources"] if s.get("standing") == "ADMITTED"]
    if len(admitted_sources) < 2:
        fail("INSUFFICIENT_ADMITTED_SOURCES", str(len(admitted_sources)))
    if len(dossier.get("claims", [])) < 4:
        fail("INSUFFICIENT_GROUNDED_CLAIMS")
    if any(s.get("authority") != "AMERICAN_SOCIETY_FOR_QUALITY" for s in admitted_sources):
        fail("NON_ASQ_SUPPLEMENTAL_SOURCE_IN_FIRST_BATCH")
    if any(s.get("source_bytes_archived") is not False for s in admitted_sources):
        fail("SOURCE_ARCHIVE_STANDING_DRIFT")

    course = build_i_a_1_slice_course(
        goal_id="GOAL-ASQ-CSSGB-2022-001E-I-A-1",
        title="ASQ CSSGB 2022 I.A.1 Qualification Slice",
        desired_outcome=CSSGB_001E_BATCH_01_OUTCOME,
        dossier=dossier,
    )
    body = asdict(course)
    body["domain_key"] = CSSGB_001E_BATCH_01_DOMAIN_KEY
    grounding = validate_grounding(body, dossier)
    if grounding["status"] != "PASS" or not grounding.get("closed_world_span_coverage"):
        fail("GROUNDING_VALIDATION_FAILED", json.dumps(grounding, sort_keys=True))
    instructional = validate_instructional_design(body)
    if instructional["status"] != "PASS":
        fail("INSTRUCTIONAL_VALIDATION_FAILED", json.dumps(instructional, sort_keys=True))

    oracle = CSSGBValueMechanismOracle()
    reference = oracle.validate_reference_items(body)
    if reference["status"] != "PASS" or reference.get("answer_key_used_as_oracle") is not False:
        fail("REFERENCE_ORACLE_FAILED", json.dumps(reference, sort_keys=True))
    lesson_behavior = oracle.validate_lesson_examples(body)
    if lesson_behavior["status"] != "PASS":
        fail("LESSON_ORACLE_FAILED", json.dumps(lesson_behavior, sort_keys=True))

    mastery = next(x for x in body["items"] if x["mode"] == "MASTERY_CHECK")
    p2 = next(x for x in body["items"] if x["item_id"] == "P-CSSGB-I-A-1-02")
    canonical_mastery = mastery["answer"]
    mutated_item = copy.deepcopy(mastery)
    mutated_item["answer"] = "THIS ANSWER FIELD MUST NOT CONTROL THE ORACLE"
    negative_matrix = {
        "malformed_json_rejected": not oracle.score(mastery, "not-json"),
        "realized_impact_true_rejected": not oracle.score(
            mastery,
            response([{"mechanism": "operational", "fact_ids": ["F1"]}, {"mechanism": "customer", "fact_ids": ["F3"]}], realized=True),
        ),
        "unknown_pair_rejected": not oracle.score(
            mastery,
            response([{"mechanism": "operational", "fact_ids": ["F1"]}, {"mechanism": "customer", "fact_ids": ["F1"]}]),
        ),
        "too_few_mechanisms_rejected": not oracle.score(
            mastery,
            response([{"mechanism": "operational", "fact_ids": ["F1"]}]),
        ),
        "required_missing_evidence_omitted_rejected": not oracle.score(
            p2,
            response([{"mechanism": "operational", "fact_ids": ["F1"]}, {"mechanism": "customer", "fact_ids": ["F2"]}]),
        ),
        "answer_mutation_does_not_change_oracle_correctness": oracle.score(mutated_item, canonical_mastery),
    }
    if not all(negative_matrix.values()):
        fail("ORACLE_NEGATIVE_MATRIX_FAILED", json.dumps(negative_matrix, sort_keys=True))

    def observer(probe, response_text):
        return False, None

    def move(signature, confirmed, abstained):
        return {"content": "Qualification slice tutor remediation is not claimed in 001E Batch 01.", "claim_refs": []}

    spec = DomainSpec(
        domain_key=CSSGB_001E_BATCH_01_DOMAIN_KEY,
        desired_outcome=CSSGB_001E_BATCH_01_OUTCOME,
        dossier=dossier,
        course_factory=build_i_a_1_slice_course,
        behavior_oracle=oracle,
        generation_adapter_id="CSSGB-001E-I-A-1-GROUNDED-CONTENT-V1",
        maintenance_tasks={},
        transfer_tasks={},
        transfer_required_skills=set(),
        tutor_probes={},
        tutor_observer=observer,
        tutor_move=move,
    )

    with tempfile.TemporaryDirectory() as td:
        repo = Repository(str(Path(td) / "learning.sqlite"))
        engine = DomainGeneralLearningEngine(repo, registry=DomainRegistry([spec]))
        created = engine.create_research_grounded_course_job(
            operation_id="OP-001E-B01-CREATE",
            job_id="JOB-001E-B01-CREATE",
            goal_id="GOAL-ASQ-CSSGB-2022-001E-I-A-1",
            title="ASQ CSSGB 2022 I.A.1 Qualification Slice",
            desired_outcome=CSSGB_001E_BATCH_01_OUTCOME,
        )
        course_id = created["course_id"]
        if created["state"] != "READY_FOR_REVIEW" or created["validation_status"] != "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED":
            fail("RUNTIME_CREATE_STANDING", json.dumps(created, sort_keys=True))
        stored = engine.course(course_id)
        if stored.get("state") != "READY_FOR_REVIEW" or stored.get("domain_key") != CSSGB_001E_BATCH_01_DOMAIN_KEY:
            fail("STORED_COURSE_STANDING")
        first_action = engine.next_action("LEARNER-PORTABLE-FIXTURE", course_id, now=1000)
        if first_action["action_type"] != "LESSON" or first_action["target_id"] != CSSGB_001E_BATCH_01_LESSON_ID:
            fail("FIRST_ACTION_NOT_LESSON", json.dumps(first_action, sort_keys=True))

        practice = next(x for x in stored["items"] if x["item_id"] == "P-CSSGB-I-A-1-01")
        practice_result = engine.submit_attempt(
            operation_id="OP-001E-B01-PRACTICE",
            attempt_id="ATT-001E-B01-PRACTICE",
            learner_id="LEARNER-PORTABLE-FIXTURE",
            course_id=course_id,
            item_id=practice["item_id"],
            response=practice["answer"],
            submitted_at=1100,
        )
        if practice_result["attempt"]["correct"] is not True or practice_result["projection"]["stage"] != "BUILDING":
            fail("PRACTICE_EVIDENCE_BOUNDARY", json.dumps(practice_result, sort_keys=True))

        bad_mastery = response(
            [{"mechanism": "operational", "fact_ids": ["F1"]}, {"mechanism": "customer", "fact_ids": ["F3"]}],
            realized=True,
        )
        rejected = engine.submit_attempt(
            operation_id="OP-001E-B01-MASTERY-BAD",
            attempt_id="ATT-001E-B01-MASTERY-BAD",
            learner_id="LEARNER-PORTABLE-FIXTURE",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=bad_mastery,
            submitted_at=1200,
        )
        if rejected["attempt"]["correct"] is not False or rejected["projection"]["stage"] != "BUILDING":
            fail("ORACLE_REJECTED_ATTEMPT_NOT_RECORDED")

        accepted = engine.submit_attempt(
            operation_id="OP-001E-B01-MASTERY-GOOD",
            attempt_id="ATT-001E-B01-MASTERY-GOOD",
            learner_id="LEARNER-PORTABLE-FIXTURE",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=canonical_mastery,
            submitted_at=1300,
        )
        if accepted["attempt"]["correct"] is not True or accepted["projection"]["stage"] != "RETENTION_DUE":
            fail("MASTERY_DID_NOT_ADVANCE_TO_RETENTION_DUE", json.dumps(accepted, sort_keys=True))
        wait_action = engine.next_action("LEARNER-PORTABLE-FIXTURE", course_id, now=1301)
        if wait_action["action_type"] != "RETENTION_WAIT" or int(wait_action["earliest_due_at"]) != 4900:
            fail("RETENTION_WAIT_BOUNDARY", json.dumps(wait_action, sort_keys=True))

        retention = next(x for x in stored["items"] if x["mode"] == "RETENTION_CHECK")
        retained = engine.submit_attempt(
            operation_id="OP-001E-B01-RETENTION",
            attempt_id="ATT-001E-B01-RETENTION",
            learner_id="LEARNER-PORTABLE-FIXTURE",
            course_id=course_id,
            item_id=retention["item_id"],
            response=retention["answer"],
            submitted_at=4901,
        )
        if retained["attempt"]["correct"] is not True or retained["projection"]["stage"] != "MASTERED":
            fail("DELAYED_RETENTION_DID_NOT_MASTER_SLICE", json.dumps(retained, sort_keys=True))
        final_action = engine.next_action("LEARNER-PORTABLE-FIXTURE", course_id, now=4901)
        if final_action["action_type"] != "COURSE_COMPLETE":
            fail("ONE_SKILL_SLICE_NOT_COMPLETE", json.dumps(final_action, sort_keys=True))

        runtime_evidence = {
            "created": created,
            "first_action": first_action,
            "practice_projection": practice_result["projection"],
            "rejected_mastery_projection": rejected["projection"],
            "accepted_mastery_projection": accepted["projection"],
            "retention_wait": wait_action,
            "retained_projection": retained["projection"],
            "final_action": final_action,
        }

    summary = {
        "subject_sha": os.environ.get("GITHUB_SHA", "LOCAL"),
        "result_class": "PASS",
        "phase": "001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION_BATCH_01",
        "batch_index": 1,
        "requirements_realized": 1,
        "requirement_id": CSSGB_001E_BATCH_01_REQUIREMENT_ID,
        "001d_ordinal": 1,
        "001d_blueprint_digest_sha256": observed_blueprint_digest,
        "grounding_status": grounding["status"],
        "grounding_claim_coverage_percent": grounding["claim_coverage_percent"],
        "admitted_source_count": len(admitted_sources),
        "instructional_design_status": instructional["status"],
        "worked_example_count": len(body["lessons"][0]["worked_examples"]),
        "practice_item_count": len([x for x in body["items"] if x["mode"] == "PRACTICE"]),
        "mastery_item_count": len([x for x in body["items"] if x["mode"] == "MASTERY_CHECK"]),
        "retention_item_count": len([x for x in body["items"] if x["mode"] == "RETENTION_CHECK"]),
        "scoring_type": CSSGB_VALUE_SCORING_TYPE,
        "oracle_reference_status": reference["status"],
        "lesson_behavior_status": lesson_behavior["status"],
        "oracle_negative_matrix": negative_matrix,
        "runtime_engine_path_verified": True,
        "runtime_course_state": "READY_FOR_REVIEW",
        "practice_not_mastery_verified": True,
        "oracle_rejection_recorded": True,
        "mastery_advances_only_to_retention_due": True,
        "retention_delay_enforced": True,
        "delayed_distinct_retention_path_verified": True,
        "portable_fixture_mastery_only": True,
        "real_learner_mastery": "UNOBSERVED",
        "psychometric_validity": "UNOBSERVED",
        "sme_approval": "UNOBSERVED",
        "certification_equivalence": "UNOBSERVED",
        "a01_native_production_authority": "NOT_INFERRED",
        "full_course_activation_allowed": False,
        "source_bytes_archived": False,
        "next_successor": "Admit 001E Batch 01 into Learning control and select 001D ordinal 2 (ASQ-CSSGB-2022-I.A.2) for the next bounded content/scoring realization batch."
    }
    (EVIDENCE_DIR / "qualification-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "grounding-validation.json").write_text(json.dumps(grounding, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "instructional-validation.json").write_text(json.dumps(instructional, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "runtime-evidence.json").write_text(json.dumps(runtime_evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "materialized-i-a-1-course.json").write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (EVIDENCE_DIR / "i-a-1-grounding-dossier.json").write_text(json.dumps(dossier, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
