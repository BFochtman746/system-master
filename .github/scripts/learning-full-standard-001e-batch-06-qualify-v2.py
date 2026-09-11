from __future__ import annotations

import json
import os
import runpy
import tempfile
from dataclasses import asdict
from pathlib import Path

from learning_lab.cssgb_full_standard_i_c_1 import (
    DOMAIN_KEY,
    OUTCOME,
    REQUIREMENT_ID,
    CSSGBDFSSRoadmapRoleOracle,
    build_course,
    dossier,
)
from learning_lab.domain_general import DomainRegistry, DomainSpec
from learning_lab.domain_general_evidence_safe import EvidenceSafeDomainGeneralLearningEngine
from learning_lab.repository import Repository


ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
EVIDENCE_DIR = Path(
    os.environ.get(
        "EVIDENCE_DIR",
        os.environ.get("RUNNER_TEMP", str(ROOT)) + "/learning-001e-batch-06-v2-evidence",
    )
)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
QDIR = ROOT / "qualification" / "learning"
CANDIDATE_V2 = "LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-BATCH-06-CANDIDATE-070B.json"
LEGACY_QUALIFIER = ROOT / ".github" / "scripts" / "learning-full-standard-001e-batch-06-qualify.py"
EXPECTED_CONTROL = "cf6db676c0058b79c0b32b7300d425852958f83f"
PRESERVED_SUBJECT = "bd3f7de8490c7cfb6a7dcdd37cc1fa1d4656bced"


def fail(code: str, detail: str = "") -> None:
    message = f"{code}:{detail}" if detail else code
    (EVIDENCE_DIR / "failure-summary-v2.json").write_text(
        json.dumps(
            {
                "subject_sha": os.environ.get("GITHUB_SHA", "LOCAL"),
                "result_class": "FAIL",
                "failure": message,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    raise AssertionError(message)


def load_local(name: str):
    return json.loads((QDIR / name).read_text(encoding="utf-8"))


def run_preserved_batch06_gate() -> dict:
    baseline_dir = EVIDENCE_DIR / "preserved-070a-gate"
    baseline_dir.mkdir(parents=True, exist_ok=True)
    previous = os.environ.get("EVIDENCE_DIR")
    os.environ["EVIDENCE_DIR"] = str(baseline_dir)
    try:
        namespace = runpy.run_path(str(LEGACY_QUALIFIER), run_name="learning_batch06_preserved_gate")
        namespace["main"]()
    finally:
        if previous is None:
            os.environ.pop("EVIDENCE_DIR", None)
        else:
            os.environ["EVIDENCE_DIR"] = previous
    summary_path = baseline_dir / "qualification-summary.json"
    if not summary_path.exists():
        fail("PRESERVED_GATE_SUMMARY_MISSING")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if summary.get("result_class") != "PASS":
        fail("PRESERVED_GATE_NOT_PASS", json.dumps(summary, sort_keys=True))
    if summary.get("requirement_id") != REQUIREMENT_ID or summary.get("001d_ordinal") != 6:
        fail("PRESERVED_GATE_IDENTITY_DRIFT")
    return summary


def build_spec() -> DomainSpec:
    d = dossier()
    oracle = CSSGBDFSSRoadmapRoleOracle()

    def observer(probe, response_text):
        return False, None

    def move(signature, confirmed, abstained):
        return {
            "content": "Sequence only supplied design dependencies, preserve gates, and refuse unsupported proprietary steps.",
            "claim_refs": [],
        }

    return DomainSpec(
        domain_key=DOMAIN_KEY,
        desired_outcome=OUTCOME,
        dossier=d,
        course_factory=build_course,
        behavior_oracle=oracle,
        generation_adapter_id="CSSGB-001E-I-C-1-GROUNDED-CONTENT-V1",
        maintenance_tasks={},
        transfer_tasks={},
        transfer_required_skills=set(),
        tutor_probes={},
        tutor_observer=observer,
        tutor_move=move,
    )


def evidence_safe_runtime() -> dict:
    with tempfile.TemporaryDirectory() as td:
        repo = Repository(str(Path(td) / "learning.sqlite"))
        engine = EvidenceSafeDomainGeneralLearningEngine(
            repo,
            registry=DomainRegistry([build_spec()]),
        )
        created = engine.create_research_grounded_course_job(
            operation_id="OP-B06-V2-CREATE",
            job_id="JOB-B06-V2-CREATE",
            goal_id="GOAL-ASQ-CSSGB-2022-001E-I-C-1-V2",
            title="ASQ CSSGB 2022 I.C.1 Evidence-Safe Qualification Slice",
            desired_outcome=OUTCOME,
        )
        if created.get("state") != "READY_FOR_REVIEW":
            fail("V2_CREATE_STANDING")
        course_id = created["course_id"]
        course = engine.course(course_id)
        if course.get("state") != "READY_FOR_REVIEW":
            fail("V2_COURSE_STATE")

        practice = next(item for item in course["items"] if item["mode"] == "PRACTICE")
        mastery = next(item for item in course["items"] if item["mode"] == "MASTERY_CHECK")
        retention = next(item for item in course["items"] if item["mode"] == "RETENTION_CHECK")

        practice_literal = json.dumps(json.loads(practice["answer"]), indent=2)
        if practice_literal == practice["answer"]:
            fail("PRACTICE_LITERAL_NOT_DISTINCT")
        practice_result = engine.submit_attempt(
            operation_id="OP-B06-V2-P",
            attempt_id="ATT-B06-V2-P",
            learner_id="L-B06-V2",
            course_id=course_id,
            item_id=practice["item_id"],
            response=practice_literal,
            submitted_at=7000,
        )
        if not practice_result["attempt"]["correct"]:
            fail("V2_PRACTICE_ORACLE_REJECTED_SEMANTIC_EQUIVALENT")
        if practice_result["attempt"]["response"] != practice_literal:
            fail("V2_PRACTICE_LITERAL_RESPONSE_NOT_PRESERVED")
        if practice_result["projection"]["stage"] != "BUILDING":
            fail("V2_PRACTICE_STAGE")
        if "PRACTICE_NOT_MASTERY" not in practice_result["projection"]["reason_codes"]:
            fail("V2_PRACTICE_NOT_MASTERY_MISSING")

        bad_literal = json.dumps(
            {
                "ordered_decision_ids": ["D1", "D2", "D3"],
                "dependency_links": [{"before_id": "D1", "after_id": "D2"}],
                "roadmap_role_ids": ["SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"],
                "unsupported_specific_step_ids": [],
                "missing_authority": [],
                "proprietary_roadmap_claimed": False,
                "observed_design_success_claimed": False,
            },
            indent=2,
        )
        bad_result = engine.submit_attempt(
            operation_id="OP-B06-V2-M-BAD",
            attempt_id="ATT-B06-V2-M-BAD",
            learner_id="L-B06-V2",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=bad_literal,
            submitted_at=7100,
        )
        if bad_result["attempt"]["correct"] is not False:
            fail("V2_BAD_MASTERY_ACCEPTED")
        if bad_result["attempt"]["response"] != bad_literal:
            fail("V2_BAD_LITERAL_RESPONSE_NOT_PRESERVED")
        if bad_result["attempt"]["response"] == "__ORACLE_REJECTED__":
            fail("V2_REJECTION_SENTINEL_PERSISTED")

        mastery_literal = json.dumps(json.loads(mastery["answer"]), indent=2)
        if mastery_literal == mastery["answer"]:
            fail("MASTERY_LITERAL_NOT_DISTINCT")
        good_result = engine.submit_attempt(
            operation_id="OP-B06-V2-M-GOOD",
            attempt_id="ATT-B06-V2-M-GOOD",
            learner_id="L-B06-V2",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=mastery_literal,
            submitted_at=7200,
        )
        if not good_result["attempt"]["correct"]:
            fail("V2_GOOD_MASTERY_REJECTED")
        if good_result["projection"]["stage"] != "RETENTION_DUE":
            fail("V2_GOOD_MASTERY_STAGE")
        if not good_result.get("behavior_oracle_applied"):
            fail("V2_ORACLE_MARKER_MISSING")
        if not good_result.get("literal_response_preserved"):
            fail("V2_LITERAL_RESPONSE_MARKER_MISSING")
        if good_result["attempt"]["response"] != mastery_literal:
            fail("V2_GOOD_LITERAL_RESPONSE_NOT_PRESERVED")
        if good_result["attempt"]["response"] == mastery["answer"]:
            fail("V2_REFERENCE_ANSWER_SUBSTITUTED")

        replay = engine.submit_attempt(
            operation_id="OP-B06-V2-M-GOOD",
            attempt_id="ATT-B06-V2-M-GOOD",
            learner_id="L-B06-V2",
            course_id=course_id,
            item_id=mastery["item_id"],
            response=mastery_literal,
            submitted_at=7200,
        )
        if replay != good_result:
            fail("V2_IDEMPOTENT_REPLAY_CHANGED_RESULT")
        if repo.count_attempts() != 3:
            fail("V2_IDEMPOTENT_REPLAY_DUPLICATED_ATTEMPT", str(repo.count_attempts()))

        conflict = None
        try:
            engine.submit_attempt(
                operation_id="OP-B06-V2-M-GOOD",
                attempt_id="ATT-B06-V2-M-GOOD",
                learner_id="L-B06-V2",
                course_id=course_id,
                item_id=mastery["item_id"],
                response="changed literal response",
                submitted_at=7200,
            )
        except ValueError as exc:
            conflict = str(exc)
        if conflict != "IDEMPOTENCY_DIGEST_MISMATCH":
            fail("V2_IDEMPOTENCY_CONFLICT_NOT_ENFORCED", str(conflict))

        wait = engine.next_action("L-B06-V2", course_id, now=7201)
        if wait.get("action_type") != "RETENTION_WAIT" or int(wait.get("earliest_due_at", -1)) != 10800:
            fail("V2_RETENTION_WAIT", json.dumps(wait, sort_keys=True))

        retention_literal = json.dumps(json.loads(retention["answer"]), indent=2)
        retained = engine.submit_attempt(
            operation_id="OP-B06-V2-R",
            attempt_id="ATT-B06-V2-R",
            learner_id="L-B06-V2",
            course_id=course_id,
            item_id=retention["item_id"],
            response=retention_literal,
            submitted_at=10801,
        )
        if not retained["attempt"]["correct"] or retained["projection"]["stage"] != "MASTERED":
            fail("V2_RETENTION_BOUNDARY")
        if retained["attempt"]["response"] != retention_literal:
            fail("V2_RETENTION_LITERAL_RESPONSE_NOT_PRESERVED")
        if engine.course(course_id)["state"] != "READY_FOR_REVIEW":
            fail("V2_COURSE_ACTIVATED")

        return {
            "engine_class": type(engine).__name__,
            "engine_evidence_contract_version": engine.EVIDENCE_CONTRACT_VERSION,
            "course_state": engine.course(course_id)["state"],
            "practice_semantic_noncanonical_response_accepted": True,
            "practice_literal_response_preserved": True,
            "bad_mastery_literal_response_preserved": True,
            "rejection_sentinel_not_persisted": True,
            "mastery_semantic_noncanonical_response_accepted": True,
            "mastery_literal_response_preserved": True,
            "reference_answer_not_substituted": True,
            "idempotent_exact_replay_verified": True,
            "changed_literal_request_conflict_verified": True,
            "retention_delay_enforced": True,
            "retention_literal_response_preserved": True,
            "portable_fixture_mastery_only": True,
            "real_learner_evidence": "UNOBSERVED",
        }


def main() -> None:
    candidate = load_local(CANDIDATE_V2)
    if candidate.get("base_control_head") != EXPECTED_CONTROL:
        fail("V2_BASE_CONTROL_HEAD_DRIFT")
    if candidate.get("selection", {}).get("001d_ordinal") != 6:
        fail("V2_BATCH_SELECTION_DRIFT")
    if candidate.get("selection", {}).get("requirement_id") != REQUIREMENT_ID:
        fail("V2_REQUIREMENT_DRIFT")
    if candidate.get("repair_lineage", {}).get("preserved_subject_sha") != PRESERVED_SUBJECT:
        fail("V2_REPAIR_LINEAGE_DRIFT")
    runtime_contract = candidate.get("runtime_implementation", {})
    if runtime_contract.get("engine_successor_class") != "EvidenceSafeDomainGeneralLearningEngine":
        fail("V2_ENGINE_SUCCESSOR_NOT_BOUND")
    if runtime_contract.get("engine_evidence_contract_version") != 1:
        fail("V2_EVIDENCE_CONTRACT_VERSION")

    preserved_summary = run_preserved_batch06_gate()
    safe_runtime = evidence_safe_runtime()

    summary = {
        "subject_sha": os.environ.get("GITHUB_SHA", "LOCAL"),
        "result_class": "PASS",
        "phase": "001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION_BATCH_06_REPAIRED",
        "batch_index": 6,
        "requirements_realized_this_batch": 1,
        "cumulative_requirements_realized": 6,
        "requirement_id": REQUIREMENT_ID,
        "001d_ordinal": 6,
        "base_control_head": EXPECTED_CONTROL,
        "preserved_070a_gate_result": preserved_summary["result_class"],
        "preserved_070a_subject_history": PRESERVED_SUBJECT,
        "evidence_safe_runtime": safe_runtime,
        "literal_response_evidence_repair_verified": True,
        "custom_oracle_semantic_scoring_verified": True,
        "literal_request_idempotency_verified": True,
        "runtime_course_state": "READY_FOR_REVIEW",
        "full_course_activation_allowed": False,
        "real_learner_mastery": "UNOBSERVED",
        "psychometric_validity": "UNOBSERVED",
        "sme_approval": "UNOBSERVED",
        "certification_equivalence": "UNOBSERVED",
        "a01_native_production_authority": "NOT_INFERRED",
        "next_successor": "Admit repaired Batch 06 and select exact 001D ordinal 7 (ASQ-CSSGB-2022-I.C.2) without replaying prior work.",
    }
    (EVIDENCE_DIR / "qualification-summary-v2.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "evidence-safe-runtime.json").write_text(
        json.dumps(safe_runtime, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "candidate-070b-snapshot.json").write_text(
        json.dumps(candidate, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
