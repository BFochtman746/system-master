from __future__ import annotations

import copy
import json
import os
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from learning_lab import (
    CourseRefreshLearningEngine,
    NormalizedLiveResearchPort,
    RecordedModelGenerationPort,
    Repository,
    StochasticRecordedModelPort,
    PROFESSIONAL_QUALITY_PROFILE_VERSION,
)
from learning_lab.engine import InjectedCrash
from learning_lab.repository import digest

ROOT = Path(__file__).resolve().parents[1]
BASE_CAPTURE = json.loads((ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8"))
BASE_MULTI = json.loads((ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json").read_text(encoding="utf-8"))
REFRESH_CAPTURE = json.loads((ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V2_REFRESH.json").read_text(encoding="utf-8"))
REFRESH_TRACE = json.loads((ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_REFRESH_V2.json").read_text(encoding="utf-8"))
GOAL = BASE_MULTI["goal"]
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
BASE_IDS = [A, B, C]
SERIES = "SERIES-PY-COMP"
REVIEW = {"standing": "LAB_HUMAN_REVIEW_FIXTURE_APPROVED", "reviewer": "SYNTHETIC_REVIEW_FIXTURE"}


def rehash_capture(cap):
    x = copy.deepcopy(cap)
    x["normalized_evidence_digest"] = digest({"sources": x["sources"], "claims": x["claims"]})
    return x


def rehash_trace(trace, research_digest=None):
    x = copy.deepcopy(trace)
    if research_digest is not None:
        x["research_evidence_digest"] = research_digest
        x["prompt"]["research_dossier_digest"] = research_digest
    x["prompt_digest"] = digest(x["prompt"])
    x["output_digest"] = digest(x["output"])
    x["trace_digest"] = digest({k: v for k, v in x.items() if k != "trace_digest"})
    return x


def material_refresh_fixture():
    cap = copy.deepcopy(REFRESH_CAPTURE)
    cap["capture_id"] = "LIVE-RSCH-PY-COMP-MATERIAL-TEST"
    cap["capture_version"] = "2-MATERIAL-TEST"
    claim = next(c for c in cap["claims"] if c["claim_id"] == "CL-PY-COMP-002")
    claim["text"] += " [SYNTHETIC MATERIAL CHANGE FIXTURE]"
    cap = rehash_capture(cap)

    trace = copy.deepcopy(REFRESH_TRACE)
    trace["generation_trace_id"] = "MODEL-GEN-PY-COMP-MATERIAL-REFRESH-TEST"
    bp = trace["output"]["course_blueprint"]
    mastery = next(i for i in bp["items"] if i["item_id"] == "M-PY-LC-1")
    mastery["prompt"] = "Write one list comprehension that returns the squares of odd numbers produced by range(7)."
    mastery["answer"] = "[x**2 for x in range(7) if x % 2 == 1]"
    mastery["oracle_spec"]["expected"] = [1, 9, 25]
    mastery["rationale"] = "Synthetic material-change fixture: the independent mastery task construct changed."
    trace = rehash_trace(trace, cap["normalized_evidence_digest"])
    return cap, trace


def quality_regression_trace():
    trace = copy.deepcopy(REFRESH_TRACE)
    trace["generation_trace_id"] = "MODEL-GEN-PY-COMP-QUALITY-REGRESSION-TEST"
    trace["output"]["transfer_tasks"] = trace["output"]["transfer_tasks"][:1]
    return rehash_trace(trace, REFRESH_CAPTURE["normalized_evidence_digest"])


def sqlite_backup(src_path: str, dst_path: str):
    src = sqlite3.connect(src_path)
    dst = sqlite3.connect(dst_path)
    src.backup(dst)
    dst.close()
    src.close()


class CourseRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seed_td = tempfile.TemporaryDirectory()
        cls.seed_db = os.path.join(cls.seed_td.name, "seed.sqlite3")
        repo = Repository(cls.seed_db)
        engine = CourseRefreshLearningEngine(
            repo,
            research_port=NormalizedLiveResearchPort([BASE_CAPTURE]),
            candidate_model_port=StochasticRecordedModelPort(BASE_MULTI["traces"]),
            refresh_research_port=NormalizedLiveResearchPort([REFRESH_CAPTURE]),
            refresh_model_port=RecordedModelGenerationPort([REFRESH_TRACE]),
        )
        out = engine.create_multi_candidate_course_job(
            operation_id="BASE-OP", job_id="BASE-JOB", goal_id="G-PY-REFRESH",
            title="Python comprehensions", desired_outcome=GOAL, candidate_trace_ids=BASE_IDS,
        )
        cls.base_course_id = out["course_id"]
        engine.register_initial_active_course(
            operation_id="BASE-ACT", series_id=SERIES, course_id=cls.base_course_id,
            activated_at="2026-09-07T06:30:00-04:00", review_receipt=REVIEW,
        )
        # Establish real prior learner evidence through the already-qualified engine.
        engine.submit_attempt(
            operation_id="L-LC-M", attempt_id="A-LC-M", learner_id="L", course_id=cls.base_course_id,
            item_id="M-PY-LC-1", response="[n*n for n in range(0, 7, 2)]", submitted_at=100,
        )
        engine.submit_attempt(
            operation_id="L-LC-R", attempt_id="A-LC-R", learner_id="L", course_id=cls.base_course_id,
            item_id="R-PY-LC-1", response='[len(word) for word in ["cat","tiger","ox","horse"] if len(word) >= 4]', submitted_at=4000,
        )
        engine.submit_attempt(
            operation_id="L-DC-M", attempt_id="A-DC-M", learner_id="L", course_id=cls.base_course_id,
            item_id="M-PY-DC-1", response='{n: len(n) for n in ["Ada", "Linus", "Guido"]}', submitted_at=5000,
        )
        engine.submit_attempt(
            operation_id="L-DC-R", attempt_id="A-DC-R", learner_id="L", course_id=cls.base_course_id,
            item_id="R-PY-DC-1", response='{v: v*v*v for v in range(1,5)}', submitted_at=8900,
        )
        engine.submit_transfer_attempt(
            operation_id="L-DC-T", attempt_id="A-DC-T", learner_id="L", course_id=cls.base_course_id,
            task_id="T-PY-COMP-ODD-SQUARES", response='{k: k*k for k in range(1,8,2)}', submitted_at=9000,
        )
        cls.seed_course_digest = digest(repo.get_object("course", cls.base_course_id, 1))
        cls.seed_attempt_count = repo.count_attempts()

    @classmethod
    def tearDownClass(cls):
        cls.seed_td.cleanup()

    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.td.name, "test.sqlite3")
        sqlite_backup(self.seed_db, self.db)
        self.repo = Repository(self.db)
        self.engine = self.make_engine()

    def tearDown(self):
        self.td.cleanup()

    def make_engine(self, *, refresh_capture=None, refresh_trace=None, include_refresh=True):
        return CourseRefreshLearningEngine(
            self.repo,
            research_port=NormalizedLiveResearchPort([BASE_CAPTURE]),
            candidate_model_port=StochasticRecordedModelPort(BASE_MULTI["traces"]),
            refresh_research_port=NormalizedLiveResearchPort([refresh_capture or REFRESH_CAPTURE] if include_refresh else []),
            refresh_model_port=RecordedModelGenerationPort([refresh_trace or REFRESH_TRACE] if include_refresh else []),
        )

    def refresh(self, *, op="REFRESH-OP", job="REFRESH-JOB", crash=None):
        return self.engine.refresh_course_job(
            operation_id=op, job_id=job, series_id=SERIES, title="Python comprehensions refreshed",
            desired_outcome=GOAL, requested_at="2026-09-07T07:12:00-04:00",
            refresh_reason="SOURCE_FRESHNESS_RECHECK", crash_after_phase=crash,
        )

    def test_source_freshness_policy_detects_stale_active_research(self):
        s = self.engine.assess_source_freshness(series_id=SERIES, as_of="2026-09-07T07:12:00-04:00")
        self.assertEqual(s["status"], "STALE")
        self.assertTrue(s["trigger_required"])
        self.assertGreater(s["age_seconds"], s["max_age_seconds"])

    def test_freshness_only_refresh_creates_successor_without_mutating_active(self):
        out = self.refresh()
        self.assertEqual(out["state"], "READY_FOR_REVIEW")
        self.assertEqual(out["active_course_id_unchanged"], self.base_course_id)
        self.assertNotEqual(out["successor_course_id"], self.base_course_id)
        self.assertEqual(out["successor_course_version"], 2)
        self.assertEqual(self.engine.active_course(SERIES)["activation"]["course_id"], self.base_course_id)

    def test_freshness_only_diff_is_non_material(self):
        out = self.refresh()
        d = self.repo.get_object("course_semantic_diff", out["semantic_diff_id"], 1)
        self.assertEqual(d["source_diff"]["status"], "FRESHNESS_ONLY_REFRESH")
        self.assertEqual(d["semantic_class"], "NON_MATERIAL_SOURCE_REFRESH")
        self.assertEqual(d["affected_skill_ids"], [])
        self.assertFalse(d["mastery_revalidation_required"])

    def test_refresh_reason_and_source_trigger_are_auditable(self):
        self.refresh()
        t = self.repo.get_object("refresh_trigger", "REFRESH-TRIGGER-REFRESH-JOB", 1)
        self.assertEqual(t["refresh_reason"], "SOURCE_FRESHNESS_RECHECK")
        self.assertEqual(t["source_freshness_before_refresh"]["status"], "STALE")
        self.assertEqual(t["active_course_digest"], self.seed_course_digest)

    def test_professional_quality_profile_is_frozen_and_successor_passes_same_profile(self):
        out = self.refresh()
        v = self.repo.get_object("successor_validation", f"REFRESH-VAL-{out['successor_course_id']}", 1)
        q = v["professional_quality"]
        self.assertEqual(q["profile_id"], PROFESSIONAL_QUALITY_PROFILE_VERSION)
        self.assertEqual(q["status"], "PASS")
        self.assertEqual(q["external_recognition"], "NOT_CLAIMED")

    def test_quality_regression_blocks_factually_refreshed_successor(self):
        weak = quality_regression_trace()
        self.engine = self.make_engine(refresh_trace=weak)
        with self.assertRaisesRegex(ValueError, "PROFESSIONAL_QUALITY_GATE_FAILED"):
            self.refresh()

    def test_professional_quality_gate_does_not_claim_college_credit_or_accreditation(self):
        out = self.refresh()
        self.assertEqual(out["external_recognition"], "NOT_CLAIMED")
        self.assertIn("EXTERNAL_REVIEW_REQUIRED", out["quality_standing"])

    def test_historical_course_bytes_remain_immutable_after_refresh(self):
        self.refresh()
        old = self.repo.get_object("course", self.base_course_id, 1)
        self.assertEqual(digest(old), self.seed_course_digest)

    def test_historical_attempts_are_not_copied_or_rewritten_by_refresh(self):
        self.refresh()
        self.assertEqual(self.repo.count_attempts(), self.seed_attempt_count)

    def test_non_material_refresh_preserves_prior_mastery_by_explicit_lineage(self):
        self.refresh()
        plan = self.repo.get_object("learner_state_migration_plan", "MIGRATION-REFRESH-JOB", 1)
        row = next(x for x in plan["learners"] if x["learner_id"] == "L")
        decisions = {x["skill_id"]: x for x in row["skill_decisions"]}
        self.assertEqual(decisions["S-PY-LISTCOMP"]["decision"], "PRESERVE_BY_SEMANTIC_EQUIVALENCE")
        self.assertEqual(decisions["S-PY-LISTCOMP"]["successor_stage"], "MASTERED")
        self.assertEqual(decisions["S-PY-DICTCOMP"]["successor_stage"], "MASTERED")
        self.assertFalse(plan["historical_attempts_mutated"])

    def test_material_assessment_change_requires_revalidation_only_for_affected_skill(self):
        cap, trace = material_refresh_fixture()
        self.engine = self.make_engine(refresh_capture=cap, refresh_trace=trace)
        out = self.refresh(op="MAT-OP", job="MAT-JOB")
        self.assertEqual(out["semantic_class"], "MATERIAL_LEARNING_MEANING_CHANGE")
        self.assertIn("S-PY-LISTCOMP", out["affected_skill_ids"])
        self.assertNotIn("S-PY-DICTCOMP", out["affected_skill_ids"])
        plan = self.repo.get_object("learner_state_migration_plan", "MIGRATION-MAT-JOB", 1)
        row = next(x for x in plan["learners"] if x["learner_id"] == "L")
        decisions = {x["skill_id"]: x for x in row["skill_decisions"]}
        self.assertEqual(decisions["S-PY-LISTCOMP"]["decision"], "REVALIDATION_REQUIRED")
        self.assertEqual(decisions["S-PY-LISTCOMP"]["successor_stage"], "REVALIDATION_DUE")
        self.assertEqual(decisions["S-PY-DICTCOMP"]["decision"], "PRESERVE_BY_SEMANTIC_EQUIVALENCE")
        self.assertEqual(decisions["S-PY-DICTCOMP"]["successor_stage"], "MASTERED")

    def test_material_change_records_exact_assessment_and_source_basis_reasons(self):
        cap, trace = material_refresh_fixture()
        self.engine = self.make_engine(refresh_capture=cap, refresh_trace=trace)
        out = self.refresh(op="MAT2-OP", job="MAT2-JOB")
        d = self.repo.get_object("course_semantic_diff", out["semantic_diff_id"], 1)
        reasons = d["affected_skill_reason_codes"]["S-PY-LISTCOMP"]
        self.assertTrue(any(x.startswith("ASSESSMENT_MEANING_CHANGED:M-PY-LC-1") for x in reasons))
        self.assertTrue(any(x.startswith("ASSESSMENT_SOURCE_BASIS_CHANGED:M-PY-LC-1") for x in reasons))

    def test_successor_is_not_activated_automatically(self):
        out = self.refresh()
        active = self.engine.active_course(SERIES)["activation"]
        self.assertNotEqual(active["course_id"], out["successor_course_id"])
        self.assertEqual(active["activation_revision"], 1)

    def test_activation_requires_explicit_human_review_gate(self):
        out = self.refresh()
        with self.assertRaisesRegex(ValueError, "HUMAN_REVIEW_REQUIRED"):
            self.engine.activate_successor(
                operation_id="ACT-NO-REVIEW", series_id=SERIES, successor_course_id=out["successor_course_id"],
                expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00",
                review_receipt={"standing": "NOT_REVIEWED"},
            )

    def test_explicit_activation_advances_pointer_but_preserves_old_course(self):
        out = self.refresh()
        act = self.engine.activate_successor(
            operation_id="ACT-2", series_id=SERIES, successor_course_id=out["successor_course_id"],
            expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
        )
        self.assertEqual(act["activation_revision"], 2)
        self.assertEqual(self.engine.active_course(SERIES)["activation"]["course_id"], out["successor_course_id"])
        self.assertEqual(digest(self.repo.get_object("course", self.base_course_id, 1)), self.seed_course_digest)
        self.assertIsNotNone(self.repo.get_object("course_activation", SERIES, 1))
        self.assertIsNotNone(self.repo.get_object("course_activation", SERIES, 2))

    def test_activation_stale_base_is_blocked(self):
        out = self.refresh()
        self.engine.activate_successor(
            operation_id="ACT-FIRST", series_id=SERIES, successor_course_id=out["successor_course_id"],
            expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
        )
        with self.assertRaisesRegex(ValueError, "STALE_BASE"):
            self.engine.activate_successor(
                operation_id="ACT-STALE", series_id=SERIES, successor_course_id=out["successor_course_id"],
                expected_active_revision=1, activated_at="2026-09-07T07:21:00-04:00", review_receipt=REVIEW,
            )

    def test_activation_is_idempotent_for_same_operation_and_payload(self):
        out = self.refresh()
        a = self.engine.activate_successor(
            operation_id="ACT-IDEM", series_id=SERIES, successor_course_id=out["successor_course_id"],
            expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
        )
        b = self.engine.activate_successor(
            operation_id="ACT-IDEM", series_id=SERIES, successor_course_id=out["successor_course_id"],
            expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
        )
        self.assertEqual(a, b)
        self.assertEqual(self.repo.latest_object_version("course_activation", SERIES), 2)

    def test_activation_same_operation_changed_payload_conflicts(self):
        out = self.refresh()
        self.engine.activate_successor(
            operation_id="ACT-CONFLICT", series_id=SERIES, successor_course_id=out["successor_course_id"],
            expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
        )
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY"):
            self.engine.activate_successor(
                operation_id="ACT-CONFLICT", series_id=SERIES, successor_course_id=out["successor_course_id"],
                expected_active_revision=1, activated_at="2026-09-07T07:22:00-04:00", review_receipt=REVIEW,
            )

    def test_refresh_job_is_idempotent(self):
        a = self.refresh()
        b = self.refresh()
        self.assertEqual(a, b)
        self.assertEqual(self.repo.count_objects("course"), 2)

    def test_refresh_same_operation_changed_payload_conflicts(self):
        self.refresh()
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY"):
            self.engine.refresh_course_job(
                operation_id="REFRESH-OP", job_id="REFRESH-JOB", series_id=SERIES,
                title="changed title", desired_outcome=GOAL, requested_at="2026-09-07T07:12:00-04:00",
                refresh_reason="SOURCE_FRESHNESS_RECHECK",
            )

    def test_refresh_capture_drift_after_trigger_fails_closed(self):
        with self.assertRaises(InjectedCrash):
            self.refresh(op="CAP-OP", job="CAP-JOB", crash="REFRESH_TRIGGERED")
        bad = copy.deepcopy(REFRESH_CAPTURE)
        bad["claims"][0]["text"] += " drift"
        bad = rehash_capture(bad)
        self.engine = self.make_engine(refresh_capture=bad)
        with self.assertRaisesRegex(ValueError, "CAPTURE_DRIFT"):
            self.engine.refresh_course_job(
                operation_id="CAP-OP", job_id="CAP-JOB", series_id=SERIES,
                title="Python comprehensions refreshed", desired_outcome=GOAL,
                requested_at="2026-09-07T07:12:00-04:00", refresh_reason="SOURCE_FRESHNESS_RECHECK",
            )

    def test_refresh_model_drift_after_pin_fails_closed(self):
        with self.assertRaises(InjectedCrash):
            self.refresh(op="MODEL-OP", job="MODEL-JOB", crash="REFRESH_MODEL_PINNED")
        bad = copy.deepcopy(REFRESH_TRACE)
        bad["output"]["course_blueprint"]["skills"][0]["title"] += " drift"
        bad = rehash_trace(bad, REFRESH_CAPTURE["normalized_evidence_digest"])
        self.engine = self.make_engine(refresh_trace=bad)
        with self.assertRaisesRegex(ValueError, "MODEL_TRACE_PIN_DRIFT"):
            self.engine.refresh_course_job(
                operation_id="MODEL-OP", job_id="MODEL-JOB", series_id=SERIES,
                title="Python comprehensions refreshed", desired_outcome=GOAL,
                requested_at="2026-09-07T07:12:00-04:00", refresh_reason="SOURCE_FRESHNESS_RECHECK",
            )

    def test_recovery_after_candidate_generation_needs_no_research_or_model_provider(self):
        with self.assertRaises(InjectedCrash):
            self.refresh(op="OFF-OP", job="OFF-JOB", crash="REFRESH_CANDIDATE_GENERATED")
        self.engine = self.make_engine(include_refresh=False)
        out = self.engine.refresh_course_job(
            operation_id="OFF-OP", job_id="OFF-JOB", series_id=SERIES,
            title="Python comprehensions refreshed", desired_outcome=GOAL,
            requested_at="2026-09-07T07:12:00-04:00", refresh_reason="SOURCE_FRESHNESS_RECHECK",
        )
        self.assertEqual(out["state"], "READY_FOR_REVIEW")

    def test_all_refresh_crash_boundaries_recover_without_duplicate_successors(self):
        phases = [
            "REFRESH_TRIGGERED", "REFRESH_SOURCES_ACQUIRED", "REFRESH_MODEL_PINNED",
            "REFRESH_CANDIDATE_GENERATED", "SUCCESSOR_GENERATED_VALIDATED", "SEMANTIC_DIFF_COMPUTED",
        ]
        for i, phase in enumerate(phases):
            path = os.path.join(self.td.name, f"crash-{i}.sqlite3")
            sqlite_backup(self.seed_db, path)
            repo = Repository(path)
            e = CourseRefreshLearningEngine(
                repo, research_port=NormalizedLiveResearchPort([BASE_CAPTURE]),
                candidate_model_port=StochasticRecordedModelPort(BASE_MULTI["traces"]),
                refresh_research_port=NormalizedLiveResearchPort([REFRESH_CAPTURE]),
                refresh_model_port=RecordedModelGenerationPort([REFRESH_TRACE]),
            )
            with self.assertRaises(InjectedCrash):
                e.refresh_course_job(
                    operation_id=f"O-{i}", job_id=f"J-{i}", series_id=SERIES,
                    title="PY refresh", desired_outcome=GOAL, requested_at="2026-09-07T07:12:00-04:00",
                    refresh_reason="SOURCE_FRESHNESS_RECHECK", crash_after_phase=phase,
                )
            out = e.refresh_course_job(
                operation_id=f"O-{i}", job_id=f"J-{i}", series_id=SERIES,
                title="PY refresh", desired_outcome=GOAL, requested_at="2026-09-07T07:12:00-04:00",
                refresh_reason="SOURCE_FRESHNESS_RECHECK",
            )
            self.assertEqual(out["state"], "READY_FOR_REVIEW")
            self.assertEqual(repo.count_objects("course"), 2)

    def test_successor_learner_state_query_returns_preserved_or_revalidation_state(self):
        cap, trace = material_refresh_fixture()
        self.engine = self.make_engine(refresh_capture=cap, refresh_trace=trace)
        self.refresh(op="STATE-OP", job="STATE-JOB")
        a = self.engine.successor_learner_state(learner_id="L", migration_id="MIGRATION-STATE-JOB", skill_id="S-PY-LISTCOMP")
        b = self.engine.successor_learner_state(learner_id="L", migration_id="MIGRATION-STATE-JOB", skill_id="S-PY-DICTCOMP")
        self.assertEqual(a["stage"], "REVALIDATION_DUE")
        self.assertEqual(b["stage"], "MASTERED")

    def test_unknown_learner_does_not_receive_invented_mastery(self):
        self.refresh()
        x = self.engine.successor_learner_state(learner_id="NEW", migration_id="MIGRATION-REFRESH-JOB", skill_id="S-PY-LISTCOMP")
        self.assertEqual(x["decision"], "NO_PRIOR_EVIDENCE")
        self.assertEqual(x["stage"], "NOT_ASSESSED")

    def test_refresh_diff_preserves_historical_interpretability(self):
        out = self.refresh()
        d = self.repo.get_object("course_semantic_diff", out["semantic_diff_id"], 1)
        self.assertEqual(d["old_course_id"], self.base_course_id)
        self.assertEqual(d["old_course_digest"], self.seed_course_digest)
        self.assertEqual(d["new_course_id"], out["successor_course_id"])
        self.assertEqual(d["new_course_digest"], out["successor_course_digest"])


if __name__ == "__main__":
    unittest.main()
