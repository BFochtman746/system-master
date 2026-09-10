from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path

from learning_lab.cssgb_full_standard_i_a_2 import (
    CSSGB_001E_BATCH_02_ASSESSMENT_TARGET_ID,
    CSSGB_001E_BATCH_02_CRITERION_ID,
    CSSGB_001E_BATCH_02_DOMAIN_KEY,
    CSSGB_001E_BATCH_02_LESSON_ID,
    CSSGB_001E_BATCH_02_OUTCOME,
    CSSGB_001E_BATCH_02_REQUIREMENT_ID,
    CSSGB_001E_BATCH_02_SKILL_ID,
    CSSGB_ALIGNMENT_SCORING_TYPE,
    CSSGBGoalProjectAlignmentOracle,
    build_i_a_2_slice_course,
    i_a_2_dossier,
)
from learning_lab.domain_general import DomainGeneralLearningEngine, DomainRegistry, DomainSpec
from learning_lab.real_course import validate_grounding, validate_instructional_design
from learning_lab.repository import Repository

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
QDIR = ROOT / "qualification" / "learning"
EVIDENCE_DIR = Path(os.environ.get("EVIDENCE_DIR", os.environ.get("RUNNER_TEMP", str(ROOT)) + "/learning-001e-batch-02-evidence"))
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
CANDIDATE_NAME = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-BATCH-02-CANDIDATE-062A.json"
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


def canonical_digest(value: object) -> str:
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


def response(*, alignment: str, goal_id: str = "G1", outcome_id: str = "O1", metric_ids=None, missing=None) -> str:
    return json.dumps(
        {
            "alignment": alignment,
            "goal_id": goal_id,
            "outcome_id": outcome_id,
            "metric_ids": metric_ids or [],
            "missing_evidence": missing or [],
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def main() -> None:
    candidate = load_local(CANDIDATE_NAME)
    contract = load_local(CONTRACT_NAME)
    if candidate.get("contract") != f"qualification/learning/{CONTRACT_NAME}":
        fail("CONTRACT_POINTER_DRIFT")
    if candidate.get("base_control_head") != "01b506c52239fa7a89c069401176fb28f4f9b023":
        fail("BASE_CONTROL_HEAD_DRIFT")
    if candidate.get("batch_size") != 1 or candidate.get("selection", {}).get("001d_ordinal") != 2:
        fail("BATCH_SELECTION_DRIFT")
    if contract.get("base_control_head") != "706d5eadd08897d1fa464aff804a245997822bde":
        fail("CONTRACT_PREDECESSOR_DRIFT")

    blueprint = git_show_json(BLUEPRINT_REF, BLUEPRINT_PATH)
    declared_digest = blueprint.get("artifact_digest_sha256")
    if declared_digest != EXPECTED_BLUEPRINT_DIGEST:
        fail("001D_DECLARED_BLUEPRINT_DIGEST_DRIFT", str(declared_digest))
    unsigned = copy.deepcopy(blueprint)
    unsigned.pop("artifact_digest_sha256", None)
    observed_digest = canonical_digest(unsigned)
    if observed_digest != EXPECTED_BLUEPRINT_DIGEST:
        fail("001D_BLUEPRINT_DIGEST_DRIFT", observed_digest)
    if candidate["selection"]["001d_blueprint_digest_sha256"] != declared_digest:
        fail("CANDIDATE_BLUEPRINT_DIGEST_DRIFT")

    nodes = blueprint.get("execution_nodes", [])
    if len(nodes) != 66:
        fail("001D_NODE_COUNT", str(len(nodes)))
    node = nodes[1]
    if node.get("ordinal") != 2:
        fail("SECOND_NODE_ORDINAL_DRIFT", str(node.get("ordinal")))
    if node["requirement"]["requirement_id"] != CSSGB_001E_BATCH_02_REQUIREMENT_ID:
        fail("SECOND_NODE_REQUIREMENT_DRIFT")
    if node["skill"]["skill_id"] != CSSGB_001E_BATCH_02_SKILL_ID:
        fail("SECOND_NODE_SKILL_DRIFT")
    if node["criterion"]["criterion_id"] != CSSGB_001E_BATCH_02_CRITERION_ID:
        fail("SECOND_NODE_CRITERION_DRIFT")
    if node["lesson_spec"]["lesson_id"] != CSSGB_001E_BATCH_02_LESSON_ID:
        fail("SECOND_NODE_LESSON_DRIFT")
    if node["assessment_binding"]["assessment_target_id"] != CSSGB_001E_BATCH_02_ASSESSMENT_TARGET_ID:
        fail("SECOND_NODE_ASSESSMENT_DRIFT")
    if node["assessment_binding"]["runtime_scoring_status"] != "RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND":
        fail("001D_SCORING_PRECONDITION_DRIFT")
    if node["assessment_binding"]["mastery_evidence_admission_allowed"] is not False:
        fail("001D_PREMATURE_MASTERY_ADMISSION")

    dossier = i_a_2_dossier()
    frozen = dossier.get("frozen_requirement_identity", {})
    if frozen.get("requirement_id") != CSSGB_001E_BATCH_02_REQUIREMENT_ID:
        fail("DOSSIER_FROZEN_REQUIREMENT_DRIFT")
    if frozen.get("supplemental_sources_replace_frozen_identity") is not False:
        fail("SUPPLEMENTAL_SOURCE_REPLACEMENT_FORBIDDEN")
    admitted_sources = [s for s in dossier.get("sources", []) if s.get("standing") == "ADMITTED"]
    if len(admitted_sources) != 4:
        fail("ADMITTED_SOURCE_COUNT", str(len(admitted_sources)))
    if len(dossier.get("claims", [])) != 4:
        fail("GROUNDED_CLAIM_COUNT", str(len(dossier.get("claims", []))))
    if any(s.get("authority") != "AMERICAN_SOCIETY_FOR_QUALITY" for s in admitted_sources):
        fail("NON_ASQ_SUPPLEMENTAL_SOURCE")
    if any(s.get("source_bytes_archived") is not False for s in admitted_sources):
        fail("SOURCE_ARCHIVE_STANDING_DRIFT")

    course = build_i_a_2_slice_course(
        goal_id="GOAL-ASQ-CSSGB-2022-001E-I-A-2",
        title="ASQ CSSGB 2022 I.A.2 Qualification Slice",
        desired_outcome=CSSGB_001E_BATCH_02_OUTCOME,
        dossier=dossier,
    )
    body = asdict(course)
    body["domain_key"] = CSSGB_001E_BATCH_02_DOMAIN_KEY
    grounding = validate_grounding(body, dossier)
    if grounding["status"] != "PASS" or not grounding.get("closed_world_span_coverage") or grounding.get("claim_coverage_percent") != 100:
        fail("GROUNDING_VALIDATION_FAILED", json.dumps(grounding, sort_keys=True))
    instructional = validate_instructional_design(body)
    if instructional["status"] != "PASS":
        fail("INSTRUCTIONAL_VALIDATION_FAILED", json.dumps(instructional, sort_keys=True))

    oracle = CSSGBGoalProjectAlignmentOracle()
    reference = oracle.validate_reference_items(body)
    if reference["status"] != "PASS" or reference.get("answer_key_used_as_oracle") is not False:
        fail("REFERENCE_ORACLE_FAILED", json.dumps(reference, sort_keys=True))
    lesson_behavior = oracle.validate_lesson_examples(body)
    if lesson_behavior["status"] != "PASS":
        fail("LESSON_ORACLE_FAILED", json.dumps(lesson_behavior, sort_keys=True))

    mastery = next(x for x in body["items"] if x["mode"] == "MASTERY_CHECK")
    p2 = next(x for x in body["items"] if x["item_id"] == "P-CSSGB-I-A-2-02")
    canonical_mastery = mastery["answer"]
    mutated = copy.deepcopy(mastery)
    mutated["answer"] = "MUTATED_ANSWER_FIELD_MUST_NOT_CONTROL_SCORING"
    negative_matrix = {
        "malformed_json_rejected": not oracle.score(mastery, "not-json"),
        "wrong_goal_id_rejected": not oracle.score(mastery, response(alignment="ALIGNED", goal_id="G9", metric_ids=["M1", "M2"])),
        "wrong_outcome_id_rejected": not oracle.score(mastery, response(alignment="ALIGNED", outcome_id="O9", metric_ids=["M1", "M2"])),
        "irrelevant_metric_rejected": not oracle.score(mastery, response(alignment="ALIGNED", metric_ids=["M1", "M3"])),
        "aligned_without_goal_metric_rejected": not oracle.score(mastery, response(alignment="ALIGNED", metric_ids=["M2"])),
        "aligned_without_outcome_metric_rejected": not oracle.score(mastery, response(alignment="ALIGNED", metric_ids=["M1"])),
        "not_established_without_missing_linkage_rejected": not oracle.score(p2, response(alignment="NOT_ESTABLISHED")),
        "not_established_with_metrics_rejected": not oracle.score(p2, response(alignment="NOT_ESTABLISHED", metric_ids=["M1"], missing=["OUTCOME_TO_GOAL_LINKAGE"])),
        "answer_mutation_does_not_change_oracle_correctness": oracle.score(mutated, canonical_mastery),
    }
    if not all(negative_matrix.values()):
        fail("ORACLE_NEGATIVE_MATRIX_FAILED", json.dumps(negative_matrix, sort_keys=True))

    def observer(probe, response_text):
        return False, None

    def move(signature, confirmed, abstained):
        return {"content": "Qualification-slice remediation is not claimed in 001E Batch 02.", "claim_refs": []}

    spec = DomainSpec(
        domain_key=CSSGB_001E_BATCH_02_DOMAIN_KEY,
        desired_outcome=CSSGB_001E_BATCH_02_OUTCOME,
        dossier=dossier,
        course_factory=build_i_a_2_slice_course,
        behavior_oracle=oracle,
        generation_adapter_id="CSSGB-001E-I-A-2-GROUNDED-CONTENT-V1",
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
            operation_id="OP-001E-B02-CREATE",
            job_id="JOB-001E-B02-CREATE",
            goal_id="GOAL-ASQ-CSSGB-2022-001E-I-A-2",
            title="ASQ CSSGB 2022 I.A.2 Qualification Slice",
            desired_outcome=CSSGB_001E_BATCH_02_OUTCOME,
        )
        course_id = created["course_id"]
        if created["state"] != "READY_FOR_REVIEW" or created["validation_status"] != "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED":
            fail("RUNTIME_CREATE_STANDING", json.dumps(created, sort_keys=True))
        stored = engine.course(course_id)
        if stored.get("state") != "READY_FOR_REVIEW" or stored.get("domain_key") != CSSGB_001E_BATCH_02_DOMAIN_KEY:
            fail("STORED_COURSE_STANDING")
        first_action = engine.next_action("LEARNER-PORTABLE-B02", course_id, now=2000)
        if first_action["action_type"] != "LESSON" or first_action["target_id"] != CSSGB_001E_BATCH_02_LESSON_ID:
            fail("FIRST_ACTION_NOT_LESSON", json.dumps(first_action, sort_keys=True))

        practice = next(x for x in stored["items"] if x["item_id"] == "P-CSSGB-I-A-2-01")
        practice_result = engine.submit_attempt(
            operation_id="OP-001E-B02-PRACTICE",
            attempt_id="ATT-001E-B02-PRACTICE",
            learner_id="LEARNER-PORTABLE-B02",
            course_id=course_id,
            item_id=practice["item_id"],
            response=practice["answer"],
            submitted_at=2100,
        )
        if practice_result["attempt"]["correct"] is not True or practice_result["projection"]["stage"] != "BUILDING":
            fail("PRACTICE_EVIDENCE_BOUNDARY", json.dumps(practice_result, sort_keys=True))
        if "PRACTICE_NOT_MASTERY" not in practice_result["projection"]["reason_codes"]:
            fail("PRACTICE_NOT_MASTERY_REASON_MISSING")

        bad_mastery = response(alignment="ALIGNED", metric_ids=["M1", "M3"])
        rejected = engine.submit_attempt(
            operation_id="OP-001E-B02-MASTERY-BAD",
            attempt_id="ATT-001E-B02-MASTERY-BAD",
            learner_id="LEARNER-PORTABLE-B02",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=bad_mastery,
            submitted_at=2200,
        )
        if rejected["attempt"]["correct"] is not False or rejected["projection"]["stage"] != "BUILDING":
            fail("ORACLE_REJECTED_ATTEMPT_NOT_RECORDED", json.dumps(rejected, sort_keys=True))

        accepted = engine.submit_attempt(
            operation_id="OP-001E-B02-MASTERY-GOOD",
            attempt_id="ATT-001E-B02-MASTERY-GOOD",
            learner_id="LEARNER-PORTABLE-B02",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=canonical_mastery,
            submitted_at=2300,
        )
        if accepted["attempt"]["correct"] is not True or accepted["projection"]["stage"] != "RETENTION_DUE":
            fail("MASTERY_DID_NOT_ADVANCE_TO_RETENTION_DUE", json.dumps(accepted, sort_keys=True))
        wait_action = engine.next_action("LEARNER-PORTABLE-B02", course_id, now=2301)
        if wait_action["action_type"] != "RETENTION_WAIT" or int(wait_action["earliest_due_at"]) != 5900:
            fail("RETENTION_WAIT_BOUNDARY", json.dumps(wait_action, sort_keys=True))

        retention = next(x for x in stored["items"] if x["mode"] == "RETENTION_CHECK")
        retained = engine.submit_attempt(
            operation_id="OP-001E-B02-RETENTION",
            attempt_id="ATT-001E-B02-RETENTION",
            learner_id="LEARNER-PORTABLE-B02",
            course_id=course_id,
            item_id=retention["item_id"],
            response=retention["answer"],
            submitted_at=5901,
        )
        if retained["attempt"]["correct"] is not True or retained["projection"]["stage"] != "MASTERED":
            fail("DELAYED_RETENTION_DID_NOT_MASTER_SLICE", json.dumps(retained, sort_keys=True))
        final_action = engine.next_action("LEARNER-PORTABLE-B02", course_id, now=5901)
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
        "phase": "001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION_BATCH_02",
        "batch_index": 2,
        "requirements_realized_this_batch": 1,
        "cumulative_requirements_realized": 2,
        "requirement_id": CSSGB_001E_BATCH_02_REQUIREMENT_ID,
        "001d_ordinal": 2,
        "001d_blueprint_digest_sha256": observed_digest,
        "grounding_status": grounding["status"],
        "grounding_claim_coverage_percent": grounding["claim_coverage_percent"],
        "admitted_source_count": len(admitted_sources),
        "instructional_design_status": instructional["status"],
        "worked_example_count": len(body["lessons"][0]["worked_examples"]),
        "practice_item_count": len([x for x in body["items"] if x["mode"] == "PRACTICE"]),
        "mastery_item_count": len([x for x in body["items"] if x["mode"] == "MASTERY_CHECK"]),
        "retention_item_count": len([x for x in body["items"] if x["mode"] == "RETENTION_CHECK"]),
        "scoring_type": CSSGB_ALIGNMENT_SCORING_TYPE,
        "oracle_reference_status": reference["status"],
        "lesson_behavior_status": lesson_behavior["status"],
        "oracle_negative_matrix": negative_matrix,
        "runtime_engine_path_verified": True,
        "runtime_course_state": "READY_FOR_REVIEW",
        "batch_01_adaptive_regression_semantics_reused": True,
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
        "next_successor": "Admit 001E Batch 02 into Learning control and select 001D ordinal 3 (ASQ-CSSGB-2022-I.A.3) without replaying 001A-001D or Batches 01-02."
    }
    for name, value in (
        ("qualification-summary.json", summary),
        ("grounding-validation.json", grounding),
        ("instructional-validation.json", instructional),
        ("runtime-evidence.json", runtime_evidence),
        ("materialized-i-a-2-course.json", body),
        ("i-a-2-grounding-dossier.json", dossier),
    ):
        (EVIDENCE_DIR / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
