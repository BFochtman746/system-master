from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path

from learning_lab.cssgb_full_standard_i_b_1 import (
    ASSESSMENT_TARGET_ID, CRITERION_ID, DOMAIN_KEY, LESSON_ID, OUTCOME,
    REQUIREMENT_ID, SCORING_TYPE, SKILL_ID, CSSGBLeanValueFlowWasteOracle,
    build_course, dossier,
)
from learning_lab.domain_general import DomainGeneralLearningEngine, DomainRegistry, DomainSpec
from learning_lab.real_course import validate_grounding, validate_instructional_design
from learning_lab.repository import Repository

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
QDIR = ROOT / "qualification" / "learning"
EVIDENCE_DIR = Path(os.environ.get("EVIDENCE_DIR", os.environ.get("RUNNER_TEMP", str(ROOT)) + "/learning-001e-batch-04-evidence"))
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
CANDIDATE = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-BATCH-04-CANDIDATE-066A.json"
CONTRACT = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-CONTRACT-059.json"
BLUEPRINT_REF = "02dc615fcb5d44b997ed1322848eccc6e37bb172"
BLUEPRINT_PATH = "qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-BLUEPRINT-057B.json"
EXPECTED_DIGEST = "98aa0b621b0cbe5234d5dd8bdb9890a1692c4c9d91aaf955fd3a459632949e54"
EXPECTED_CONTROL = "63e6b5111be3a26763c51104889e8030a16c9955"


def fail(code: str, detail: str = "") -> None:
    message = f"{code}:{detail}" if detail else code
    (EVIDENCE_DIR / "failure-summary.json").write_text(json.dumps({"subject_sha":os.environ.get("GITHUB_SHA","LOCAL"),"result_class":"FAIL","failure":message}, indent=2) + "\n", encoding="utf-8")
    raise AssertionError(message)


def load(name: str):
    return json.loads((QDIR / name).read_text(encoding="utf-8"))


def git_json(ref: str, path: str):
    proc = subprocess.run(["git","show",f"{ref}:{path}"], cwd=ROOT, capture_output=True, text=True, check=False)
    if proc.returncode:
        fail("HISTORICAL_INPUT_UNAVAILABLE", proc.stderr.strip())
    return json.loads(proc.stdout)


def canonical_digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",",":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def answer(va, nva, waste, flow, improvement, unresolved=None, missing=None, observed=False):
    return json.dumps({
        "value_added_activity_ids": list(va),
        "non_value_added_activity_ids": list(nva),
        "waste_condition_ids": list(waste),
        "flow_problem_ids": list(flow),
        "improvement_action_id": improvement,
        "unresolved_activity_ids": list(unresolved or []),
        "missing_evidence": list(missing or []),
        "observed_improvement_claimed": observed,
    }, sort_keys=True, separators=(",",":"))


def main() -> None:
    candidate = load(CANDIDATE)
    contract = load(CONTRACT)
    if candidate.get("base_control_head") != EXPECTED_CONTROL:
        fail("BASE_CONTROL_HEAD_DRIFT")
    if candidate.get("selection", {}).get("001d_ordinal") != 4:
        fail("BATCH_SELECTION_DRIFT")
    if contract.get("base_control_head") != "706d5eadd08897d1fa464aff804a245997822bde":
        fail("CONTRACT_PREDECESSOR_DRIFT")

    bp = git_json(BLUEPRINT_REF, BLUEPRINT_PATH)
    if bp.get("artifact_digest_sha256") != EXPECTED_DIGEST:
        fail("001D_DECLARED_DIGEST_DRIFT")
    unsigned = copy.deepcopy(bp)
    unsigned.pop("artifact_digest_sha256", None)
    observed = canonical_digest(unsigned)
    if observed != EXPECTED_DIGEST:
        fail("001D_DIGEST_DRIFT", observed)
    nodes = bp.get("execution_nodes", [])
    if len(nodes) != 66:
        fail("001D_NODE_COUNT", str(len(nodes)))
    node = nodes[3]
    expected = [
        (node.get("ordinal") == 4, "ORDINAL"),
        (node["requirement"]["requirement_id"] == REQUIREMENT_ID, "REQUIREMENT"),
        (node["skill"]["skill_id"] == SKILL_ID, "SKILL"),
        (node["criterion"]["criterion_id"] == CRITERION_ID, "CRITERION"),
        (node["lesson_spec"]["lesson_id"] == LESSON_ID, "LESSON"),
        (node["criterion"]["outcome"] == OUTCOME, "OUTCOME"),
        (node["assessment_binding"]["assessment_target_id"] == ASSESSMENT_TARGET_ID, "ASSESSMENT"),
        (node["lesson_spec"]["materialization_status"] == "UNMATERIALIZED__GROUNDING_AND_REVIEW_REQUIRED", "MATERIALIZATION_PRECONDITION"),
        (node["assessment_binding"]["runtime_scoring_status"] == "RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND", "SCORING_PRECONDITION"),
        (node["assessment_binding"]["mastery_evidence_admission_allowed"] is False, "MASTERY_PRECONDITION"),
    ]
    for ok, name in expected:
        if not ok:
            fail("001D_IDENTITY_DRIFT", name)

    d = dossier()
    sources = [s for s in d.get("sources", []) if s.get("standing") == "ADMITTED"]
    if len(sources) != 3 or len(d.get("claims", [])) != 4:
        fail("GROUNDING_INPUT_COUNTS")
    if any(s.get("authority") != "AMERICAN_SOCIETY_FOR_QUALITY" for s in sources):
        fail("NON_ASQ_SOURCE")
    if any(s.get("source_bytes_archived") is not False for s in sources):
        fail("SOURCE_ARCHIVE_STANDING")
    if d["frozen_requirement_identity"]["supplemental_sources_replace_frozen_identity"] is not False:
        fail("SOURCE_REPLACEMENT_FORBIDDEN")

    course = build_course(goal_id="GOAL-ASQ-CSSGB-2022-001E-I-B-1", title="ASQ CSSGB 2022 I.B.1 Qualification Slice", desired_outcome=OUTCOME, dossier=d)
    body = asdict(course)
    body["domain_key"] = DOMAIN_KEY
    grounding = validate_grounding(body, d)
    if grounding["status"] != "PASS" or grounding.get("claim_coverage_percent") != 100 or not grounding.get("closed_world_span_coverage"):
        fail("GROUNDING_FAIL", json.dumps(grounding, sort_keys=True))
    instructional = validate_instructional_design(body)
    if instructional["status"] != "PASS":
        fail("INSTRUCTIONAL_FAIL", json.dumps(instructional, sort_keys=True))

    oracle = CSSGBLeanValueFlowWasteOracle()
    reference = oracle.validate_reference_items(body)
    lesson_behavior = oracle.validate_lesson_examples(body)
    if reference["status"] != "PASS" or reference.get("answer_key_used_as_oracle") is not False:
        fail("REFERENCE_ORACLE_FAIL", json.dumps(reference, sort_keys=True))
    if lesson_behavior["status"] != "PASS":
        fail("LESSON_BEHAVIOR_FAIL", json.dumps(lesson_behavior, sort_keys=True))

    mastery = next(i for i in body["items"] if i["mode"] == "MASTERY_CHECK")
    p2 = next(i for i in body["items"] if i["item_id"] == "P-CSSGB-I-B-1-02")
    canonical = mastery["answer"]
    mutated = copy.deepcopy(mastery)
    mutated["answer"] = "MUTATED_ANSWER_MUST_NOT_CONTROL_ORACLE"
    negative = {
        "malformed_json_rejected": not oracle.score(mastery, "not-json"),
        "wrong_value_added_set_rejected": not oracle.score(mastery, answer(["A1","A2"],["A3"],["W1","W2"],["F1"],"REMOVE_DUPLICATE_ENTRY_AND_QUEUE")),
        "wrong_nonvalue_set_rejected": not oracle.score(mastery, answer(["A1"],["A2"],["W1","W2"],["F1"],"REMOVE_DUPLICATE_ENTRY_AND_QUEUE")),
        "wrong_waste_set_rejected": not oracle.score(mastery, answer(["A1"],["A2","A3"],["W1"],["F1"],"REMOVE_DUPLICATE_ENTRY_AND_QUEUE")),
        "wrong_flow_set_rejected": not oracle.score(mastery, answer(["A1"],["A2","A3"],["W1","W2"],[],"REMOVE_DUPLICATE_ENTRY_AND_QUEUE")),
        "wrong_improvement_action_rejected": not oracle.score(mastery, answer(["A1"],["A2","A3"],["W1","W2"],["F1"],"ADD_MORE_WAIT")),
        "observed_improvement_claim_rejected": not oracle.score(mastery, answer(["A1"],["A2","A3"],["W1","W2"],["F1"],"REMOVE_DUPLICATE_ENTRY_AND_QUEUE", observed=True)),
        "unresolved_activity_forced_classification_rejected": not oracle.score(p2, answer(["A1","A3"],["A2"],["W1"],["F1"],"REDUCE_WAIT_BEFORE_HANDOFF",[],["A3_PURPOSE_RELATION_TO_CUSTOMER_NEED"])),
        "missing_evidence_omission_rejected": not oracle.score(p2, answer(["A1"],["A2"],["W1"],["F1"],"REDUCE_WAIT_BEFORE_HANDOFF",["A3"],[])),
        "answer_mutation_does_not_change_oracle_correctness": oracle.score(mutated, canonical),
    }
    if not all(negative.values()):
        fail("ORACLE_NEGATIVE_MATRIX_FAIL", json.dumps(negative, sort_keys=True))

    def observer(probe, response_text): return False, None
    def move(signature, confirmed, abstained): return {"content":"Qualification-slice remediation is not claimed in 001E Batch 04.","claim_refs":[]}
    spec = DomainSpec(domain_key=DOMAIN_KEY,desired_outcome=OUTCOME,dossier=d,course_factory=build_course,behavior_oracle=oracle,generation_adapter_id="CSSGB-001E-I-B-1-GROUNDED-CONTENT-V1",maintenance_tasks={},transfer_tasks={},transfer_required_skills=set(),tutor_probes={},tutor_observer=observer,tutor_move=move)

    with tempfile.TemporaryDirectory() as td:
        repo = Repository(str(Path(td) / "learning.sqlite"))
        engine = DomainGeneralLearningEngine(repo, registry=DomainRegistry([spec]))
        created = engine.create_research_grounded_course_job(operation_id="OP-B04-CREATE",job_id="JOB-B04-CREATE",goal_id="GOAL-ASQ-CSSGB-2022-001E-I-B-1",title="ASQ CSSGB 2022 I.B.1 Qualification Slice",desired_outcome=OUTCOME)
        cid = created["course_id"]
        if created["state"] != "READY_FOR_REVIEW" or created["validation_status"] != "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED":
            fail("CREATE_STANDING")
        stored = engine.course(cid)
        first = engine.next_action("L-B04", cid, now=4000)
        if first["action_type"] != "LESSON" or first["target_id"] != LESSON_ID:
            fail("FIRST_ACTION")
        practice = next(i for i in stored["items"] if i["item_id"] == "P-CSSGB-I-B-1-01")
        pr = engine.submit_attempt(operation_id="OP-B04-P",attempt_id="ATT-B04-P",learner_id="L-B04",course_id=cid,item_id=practice["item_id"],response=practice["answer"],submitted_at=4100)
        if not pr["attempt"]["correct"] or pr["projection"]["stage"] != "BUILDING" or "PRACTICE_NOT_MASTERY" not in pr["projection"]["reason_codes"]:
            fail("PRACTICE_BOUNDARY")
        bad = engine.submit_attempt(operation_id="OP-B04-M-BAD",attempt_id="ATT-B04-M-BAD",learner_id="L-B04",course_id=cid,item_id=mastery["item_id"],response=answer(["A1"],["A2","A3"],["W1","W2"],["F1"],"ADD_MORE_WAIT"),submitted_at=4200)
        if bad["attempt"]["correct"] is not False or bad["projection"]["stage"] != "BUILDING":
            fail("BAD_MASTERY_BOUNDARY")
        good = engine.submit_attempt(operation_id="OP-B04-M-GOOD",attempt_id="ATT-B04-M-GOOD",learner_id="L-B04",course_id=cid,item_id=mastery["item_id"],response=canonical,submitted_at=4300)
        if not good["attempt"]["correct"] or good["projection"]["stage"] != "RETENTION_DUE":
            fail("GOOD_MASTERY_BOUNDARY")
        wait = engine.next_action("L-B04", cid, now=4301)
        if wait["action_type"] != "RETENTION_WAIT" or int(wait["earliest_due_at"]) != 7900:
            fail("RETENTION_WAIT", json.dumps(wait, sort_keys=True))
        retention = next(i for i in stored["items"] if i["mode"] == "RETENTION_CHECK")
        retained = engine.submit_attempt(operation_id="OP-B04-R",attempt_id="ATT-B04-R",learner_id="L-B04",course_id=cid,item_id=retention["item_id"],response=retention["answer"],submitted_at=7901)
        if not retained["attempt"]["correct"] or retained["projection"]["stage"] != "MASTERED":
            fail("RETENTION_BOUNDARY")
        if engine.course(cid)["state"] != "READY_FOR_REVIEW":
            fail("COURSE_ACTIVATED_DURING_QUALIFICATION")
        runtime = {"first_action":first,"practice_projection":pr["projection"],"rejected_mastery_projection":bad["projection"],"accepted_mastery_projection":good["projection"],"retention_wait":wait,"retained_projection":retained["projection"]}

    summary = {
        "subject_sha":os.environ.get("GITHUB_SHA","LOCAL"),"result_class":"PASS","phase":"001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION_BATCH_04","batch_index":4,"requirements_realized_this_batch":1,"cumulative_requirements_realized":4,"requirement_id":REQUIREMENT_ID,"001d_ordinal":4,"001d_blueprint_digest_sha256":observed,"grounding_status":grounding["status"],"grounding_claim_coverage_percent":grounding["claim_coverage_percent"],"admitted_source_count":len(sources),"instructional_design_status":instructional["status"],"worked_example_count":2,"practice_item_count":2,"mastery_item_count":1,"retention_item_count":1,"scoring_type":SCORING_TYPE,"oracle_reference_status":reference["status"],"lesson_behavior_status":lesson_behavior["status"],"oracle_negative_matrix":negative,"runtime_engine_path_verified":True,"runtime_course_state":"READY_FOR_REVIEW","practice_not_mastery_verified":True,"mastery_advances_only_to_retention_due":True,"retention_delay_enforced":True,"delayed_distinct_retention_path_verified":True,"portable_fixture_mastery_only":True,"real_learner_mastery":"UNOBSERVED","psychometric_validity":"UNOBSERVED","sme_approval":"UNOBSERVED","certification_equivalence":"UNOBSERVED","a01_native_production_authority":"NOT_INFERRED","full_course_activation_allowed":False,"source_bytes_archived":False,"next_successor":"Admit Batch 04 and select exact 001D ordinal 5 (ASQ-CSSGB-2022-I.B.2) without replaying prior work."
    }
    for name, value in (("qualification-summary.json",summary),("grounding-validation.json",grounding),("instructional-validation.json",instructional),("runtime-evidence.json",runtime),("materialized-i-b-1-course.json",body),("i-b-1-grounding-dossier.json",d)):
        (EVIDENCE_DIR / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
