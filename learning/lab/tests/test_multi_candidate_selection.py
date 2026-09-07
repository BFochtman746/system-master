from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from learning_lab import (
    CallableStochasticModelCapturePort,
    NormalizedLiveResearchPort,
    Repository,
    StochasticMultiCandidateLearningEngine,
    StochasticRecordedModelPort,
)
from learning_lab.engine import InjectedCrash
from learning_lab.repository import digest

ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"


def load_capture():
    return json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))


def load_fixture():
    return json.loads(MULTI_PATH.read_text(encoding="utf-8"))


def traces_by_id():
    return {x["generation_trace_id"]: x for x in load_fixture()["traces"]}


def rehash_trace(trace):
    x = copy.deepcopy(trace)
    x["prompt_digest"] = digest(x["prompt"])
    x["output_digest"] = digest(x["output"])
    x["trace_digest"] = digest({k: v for k, v in x.items() if k != "trace_digest"})
    return x


class MultiCandidateSelectionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.td.name, "learning.sqlite3")
        self.capture = load_capture()
        self.fixture = load_fixture()
        self.traces = traces_by_id()
        self.repo = Repository(self.db)
        self.port = StochasticRecordedModelPort(self.fixture["traces"])
        self.engine = StochasticMultiCandidateLearningEngine(
            self.repo,
            research_port=NormalizedLiveResearchPort([self.capture]),
            candidate_model_port=self.port,
        )

    def tearDown(self):
        self.td.cleanup()

    def create(self, ids=(A, B, C), op="OP-MC", job="JOB-MC", gid="G-MC", crash=None):
        return self.engine.create_multi_candidate_course_job(
            operation_id=op,
            job_id=job,
            goal_id=gid,
            title="Python comprehensions multi-candidate",
            desired_outcome=GOAL,
            candidate_trace_ids=list(ids),
            crash_after_phase=crash,
        )

    def report_for_trace(self, trace_id, gid="G-MC"):
        es = self.repo.get_object("candidate_evaluation_set", f"MC-EVAL-SET-{gid}", 1)
        for rid in es["report_ids"]:
            r = self.repo.get_object("candidate_evaluation", rid, 1)
            if r["model_trace_id"] == trace_id:
                return r
        raise KeyError(trace_id)

    def test_fixture_has_same_prompt_research_and_model_for_all_candidates(self):
        self.assertEqual(len({x["prompt_digest"] for x in self.fixture["traces"]}), 1)
        self.assertEqual(len({x["research_evidence_digest"] for x in self.fixture["traces"]}), 1)
        self.assertEqual(len({x["model_id"] for x in self.fixture["traces"]}), 1)

    def test_callable_stochastic_capture_invokes_same_prompt_multiple_times(self):
        outputs = [copy.deepcopy(self.traces[A]["output"]), copy.deepcopy(self.traces[B]["output"])]
        calls = []
        def fn(prompt, index):
            calls.append((digest(prompt), index))
            return outputs[index]
        port = CallableStochasticModelCapturePort("TEST-MODEL", fn)
        traces = port.capture_candidates(
            prompt=copy.deepcopy(self.traces[A]["prompt"]),
            research_evidence_digest=self.traces[A]["research_evidence_digest"],
            count=2,
        )
        self.assertEqual(len(traces), 2)
        self.assertEqual(len(calls), 2)
        self.assertEqual(len({x[0] for x in calls}), 1)
        self.assertEqual(len({x["prompt_digest"] for x in traces}), 1)
        self.assertNotEqual(traces[0]["output_digest"], traces[1]["output_digest"])

    def test_duplicate_stochastic_outputs_do_not_count_as_two_candidates(self):
        dup = copy.deepcopy(self.traces[A])
        dup["generation_trace_id"] = "MODEL-GEN-PY-COMP-MC-A-DUP-20260907"
        dup = rehash_trace(dup)
        port = StochasticRecordedModelPort([self.traces[A], dup])
        dossier = self.engine.live_research_port.acquire(
            GOAL, self.engine.live_research_port.plan(self.engine.live_research_port.interpret(GOAL))
        )
        with self.assertRaisesRegex(ValueError, "DUPLICATE_OUTPUT"):
            port.pin_set(desired_outcome=GOAL, dossier=dossier, candidate_trace_ids=[A, dup["generation_trace_id"]])

    def test_candidate_set_requires_at_least_two_candidates(self):
        dossier = self.engine.live_research_port.acquire(
            GOAL, self.engine.live_research_port.plan(self.engine.live_research_port.interpret(GOAL))
        )
        with self.assertRaisesRegex(ValueError, "SET_TOO_SMALL"):
            self.port.pin_set(desired_outcome=GOAL, dossier=dossier, candidate_trace_ids=[A])

    def test_candidate_set_rejects_duplicate_trace_ids(self):
        dossier = self.engine.live_research_port.acquire(
            GOAL, self.engine.live_research_port.plan(self.engine.live_research_port.interpret(GOAL))
        )
        with self.assertRaisesRegex(ValueError, "TRACE_ID_DUPLICATE"):
            self.port.pin_set(desired_outcome=GOAL, dossier=dossier, candidate_trace_ids=[A, A])

    def test_candidate_set_rejects_prompt_mismatch(self):
        bad = copy.deepcopy(self.traces[B])
        bad["prompt"]["instruction"] += " changed"
        bad = rehash_trace(bad)
        port = StochasticRecordedModelPort([self.traces[A], bad])
        dossier = self.engine.live_research_port.acquire(
            GOAL, self.engine.live_research_port.plan(self.engine.live_research_port.interpret(GOAL))
        )
        with self.assertRaisesRegex(ValueError, "PROMPT_MISMATCH"):
            port.pin_set(desired_outcome=GOAL, dossier=dossier, candidate_trace_ids=[A, B])

    def test_candidate_set_rejects_mixed_model_ids_for_stochastic_same_model_slice(self):
        bad = copy.deepcopy(self.traces[B])
        bad["model_id"] = "OTHER-MODEL"
        bad = rehash_trace(bad)
        port = StochasticRecordedModelPort([self.traces[A], bad])
        dossier = self.engine.live_research_port.acquire(
            GOAL, self.engine.live_research_port.plan(self.engine.live_research_port.interpret(GOAL))
        )
        with self.assertRaisesRegex(ValueError, "MODEL_ID_MISMATCH"):
            port.pin_set(desired_outcome=GOAL, dossier=dossier, candidate_trace_ids=[A, B])

    def test_candidate_trace_output_tamper_is_rejected(self):
        bad = copy.deepcopy(self.traces[A])
        bad["output"]["course_blueprint"]["lessons"][0]["title"] += " tamper"
        with self.assertRaisesRegex(ValueError, "OUTPUT_DIGEST"):
            StochasticRecordedModelPort([bad, self.traces[B]])

    def test_model_candidate_self_ranking_field_is_forbidden(self):
        bad = copy.deepcopy(self.traces[A])
        bad["output"]["quality_score"] = 100
        bad = rehash_trace(bad)
        with self.assertRaisesRegex(ValueError, "SELF_RANKING_FORBIDDEN"):
            StochasticRecordedModelPort([bad, self.traces[B]])

    def test_candidate_set_is_pinned_before_generation(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="CANDIDATE_SET_PINNED")
        pin = self.repo.get_object("candidate_set_pin", "MC-PIN-G-MC", 1)
        self.assertEqual(pin["candidate_count"], 3)
        self.assertEqual(len(pin["manifest"]), 3)
        self.assertFalse(self.repo.get_object("candidate_set_ref", "MC-SET-REF-G-MC", 1))

    def test_candidate_set_drift_after_pin_fails_closed(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="CANDIDATE_SET_PINNED")
        drifted = [self.traces[A], self.traces[C]]  # B disappeared after exact set was pinned.
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([self.capture]),
            candidate_model_port=StochasticRecordedModelPort(drifted),
        )
        with self.assertRaisesRegex(ValueError, "DRIFT_AFTER_PIN"):
            e2.create_multi_candidate_course_job(
                operation_id="OP-MC", job_id="JOB-MC", goal_id="G-MC", title="Python comprehensions multi-candidate",
                desired_outcome=GOAL, candidate_trace_ids=[A, B, C],
            )

    def test_recovery_after_candidates_generated_needs_no_model_candidates(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="CANDIDATES_GENERATED")
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]),
            candidate_model_port=StochasticRecordedModelPort([]),
        )
        out = e2.create_multi_candidate_course_job(
            operation_id="OP-MC", job_id="JOB-MC", goal_id="G-MC", title="Python comprehensions multi-candidate",
            desired_outcome=GOAL, candidate_trace_ids=[A, B, C],
        )
        self.assertEqual(out["selection_decision"], "SELECT")
        self.assertEqual(out["selected_model_trace_id"], A)

    def test_invalid_candidate_is_rejected_without_poisoning_valid_set(self):
        out = self.create()
        self.assertEqual(out["selection_decision"], "SELECT")
        bad = self.report_for_trace(C)
        self.assertEqual(bad["hard_gate_status"], "REJECTED")
        self.assertIn("REFERENCE_ORACLE_GATE", bad["hard_gate_failures"])

    def test_candidate_a_passes_hard_gates(self):
        self.create()
        r = self.report_for_trace(A)
        self.assertEqual(r["hard_gate_status"], "PASS")
        self.assertEqual(r["evidence"]["reference_item_oracle"]["status"], "PASS")
        self.assertEqual(r["evidence"]["lesson_example_oracle"]["status"], "PASS")
        self.assertEqual(r["evidence"]["support_task_oracle"]["status"], "PASS")

    def test_candidate_b_is_valid_but_below_declared_mechanical_coverage_targets(self):
        self.create()
        r = self.report_for_trace(B)
        self.assertEqual(r["hard_gate_status"], "PASS")
        self.assertEqual(r["mechanical_metrics"]["validated_transfer_task_diversity"], 1)
        self.assertEqual(r["evidence"]["declared_diagnostic_probe_task_diversity"], 1)
        self.assertFalse(all(r["mechanical_target_attainment"].values()))

    def test_renamed_duplicate_tasks_do_not_inflate_diversity(self):
        dup = copy.deepcopy(self.traces[B])
        dup["generation_trace_id"] = "MODEL-GEN-PY-COMP-MC-DUP-20260907"
        tr = copy.deepcopy(dup["output"]["transfer_tasks"][0])
        tr["item_id"] = "T-PY-COMP-ODD-SQUARES-DUP"
        tr["family_id"] = "F-PY-TR-RENAMED"
        dup["output"]["transfer_tasks"].append(tr)
        pr = copy.deepcopy(dup["output"]["tutor_probes"][0])
        pr["probe_id"] = "TP-PY-LC-DUP"
        pr["family_id"] = "TF-PY-LC-RENAMED"
        pr["oracle_item_id"] = "TP-PY-LC-DUP"
        dup["output"]["tutor_probes"].append(pr)
        original_oracles = {x["item_id"]: x for x in dup["output"]["oracle_descriptor"]["additional_task_oracles"]}
        tr_oracle = copy.deepcopy(original_oracles["T-PY-COMP-ODD-SQUARES"])
        tr_oracle["item_id"] = tr["item_id"]
        pr_oracle = copy.deepcopy(original_oracles["TP-PY-LC-1"])
        pr_oracle["item_id"] = pr["oracle_item_id"]
        dup["output"]["oracle_descriptor"]["additional_task_oracles"].extend([tr_oracle, pr_oracle])
        dup = rehash_trace(dup)
        port = StochasticRecordedModelPort([self.traces[A], dup])
        db = os.path.join(self.td.name, "dup.sqlite3")
        e = StochasticMultiCandidateLearningEngine(
            Repository(db), research_port=NormalizedLiveResearchPort([self.capture]), candidate_model_port=port
        )
        out = e.create_multi_candidate_course_job(
            operation_id="OP", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL,
            candidate_trace_ids=[A, dup["generation_trace_id"]],
        )
        es = e.repo.get_object("candidate_evaluation_set", "MC-EVAL-SET-G", 1)
        report = next(
            e.repo.get_object("candidate_evaluation", rid, 1)
            for rid in es["report_ids"]
            if e.repo.get_object("candidate_evaluation", rid, 1)["model_trace_id"] == dup["generation_trace_id"]
        )
        self.assertEqual(report["hard_gate_status"], "PASS")
        self.assertEqual(report["mechanical_metrics"]["validated_transfer_task_diversity"], 1)
        self.assertEqual(report["evidence"]["declared_diagnostic_probe_task_diversity"], 1)
        self.assertEqual(out["selected_model_trace_id"], A)

    def test_candidate_a_uniquely_dominates_b_on_predeclared_mechanical_coverage(self):
        out = self.create(ids=(A, B))
        self.assertEqual(out["selection_decision"], "SELECT")
        self.assertEqual(out["selected_model_trace_id"], A)

    def test_selection_with_invalid_c_still_selects_a(self):
        out = self.create(ids=(A, B, C))
        self.assertEqual(out["selected_model_trace_id"], A)
        d = self.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        self.assertEqual(len(d["rejected_candidate_ids"]), 1)
        self.assertFalse(d["scalar_ranking_used"])
        self.assertFalse(d["model_ranking_used"])

    def test_candidate_order_does_not_change_selection(self):
        outputs = []
        for i, ids in enumerate(((A, B, C), (C, A, B), (B, C, A))):
            db = os.path.join(self.td.name, f"perm{i}.sqlite3")
            e = StochasticMultiCandidateLearningEngine(
                Repository(db), research_port=NormalizedLiveResearchPort([self.capture]),
                candidate_model_port=StochasticRecordedModelPort(self.fixture["traces"]),
            )
            r = e.create_multi_candidate_course_job(
                operation_id="OP", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL,
                candidate_trace_ids=list(ids),
            )
            outputs.append((r["selected_model_trace_id"], r["candidate_set_digest"], r["course_digest"]))
        self.assertEqual(len(set(outputs)), 1)

    def test_mechanically_tied_candidates_abstain_instead_of_digest_tiebreak(self):
        out = self.create(ids=(A, D))
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertEqual(out["state"], "ABSTAINED")
        self.assertIn("NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE", out["selection_reason_codes"])
        self.assertEqual(self.repo.count_objects("course"), 0)
        self.assertNotIn("python-comprehensions", self.engine.registry.domain_keys)

    def test_tie_abstention_is_order_invariant(self):
        results = []
        for i, ids in enumerate(((A, D), (D, A))):
            db = os.path.join(self.td.name, f"tie{i}.sqlite3")
            e = StochasticMultiCandidateLearningEngine(
                Repository(db), research_port=NormalizedLiveResearchPort([self.capture]),
                candidate_model_port=StochasticRecordedModelPort(self.fixture["traces"]),
            )
            r = e.create_multi_candidate_course_job(
                operation_id="OP", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL,
                candidate_trace_ids=list(ids),
            )
            dec = e.repo.get_object("candidate_selection_decision", "MC-SELECT-G", 1)
            results.append((r["selection_reason_codes"], dec["undominated_candidate_ids"], dec["evaluation_set_digest"]))
        self.assertEqual(results[0], results[1])

    def test_all_invalid_candidates_abstain(self):
        c2 = copy.deepcopy(self.traces[C])
        c2["generation_trace_id"] = "MODEL-GEN-PY-COMP-MC-C2-20260907"
        item = next(x for x in c2["output"]["course_blueprint"]["items"] if x["item_id"] == "M-PY-DC-1")
        item["answer"] = "{}"
        c2 = rehash_trace(c2)
        port = StochasticRecordedModelPort([self.traces[C], c2])
        e = StochasticMultiCandidateLearningEngine(
            Repository(os.path.join(self.td.name, "allbad.sqlite3")), research_port=NormalizedLiveResearchPort([self.capture]),
            candidate_model_port=port,
        )
        out = e.create_multi_candidate_course_job(
            operation_id="OP", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL,
            candidate_trace_ids=[C, c2["generation_trace_id"]],
        )
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertIn("NO_QUALIFIED_CANDIDATES", out["selection_reason_codes"])
        self.assertEqual(len(out["rejected_candidate_ids"]), 2)

    def test_valid_but_below_target_candidate_cannot_win_by_default(self):
        out = self.create(ids=(B, C))
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertEqual(out["selection_reason_codes"], ["NO_SELECTION_ELIGIBLE_CANDIDATES"])
        d = self.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        b_id = self.report_for_trace(B)["candidate_id"]
        self.assertIn(b_id, d["qualified_candidate_ids"])
        self.assertNotIn(b_id, d["selection_eligible_candidate_ids"])

    def test_selection_decision_contains_no_scalar_score(self):
        self.create()
        d = self.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        self.assertNotIn("score", d)
        self.assertFalse(d["scalar_ranking_used"])

    def test_selected_candidate_is_never_hard_gate_rejected(self):
        out = self.create()
        selected = out["selected_candidate_id"]
        es = self.repo.get_object("candidate_evaluation_set", "MC-EVAL-SET-G-MC", 1)
        report = next(self.repo.get_object("candidate_evaluation", rid, 1) for rid in es["report_ids"] if self.repo.get_object("candidate_evaluation", rid, 1)["candidate_id"] == selected)
        self.assertEqual(report["hard_gate_status"], "PASS")

    def test_only_selected_candidate_becomes_course(self):
        out = self.create()
        self.assertEqual(self.repo.count_objects("course"), 1)
        self.assertEqual(self.repo.get_object("course", out["course_id"], 1)["generation_adapter"], "RECORDED-STOCHASTIC-MODEL-PORT-V1:GPT-5.6 Sol")

    def test_selection_provenance_is_bound_into_selected_dossier(self):
        out = self.create()
        course = self.repo.get_object("course", out["course_id"], 1)
        dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1)
        self.assertEqual(dossier["candidate_selection"]["selected_candidate_id"], out["selected_candidate_id"])
        self.assertEqual(dossier["candidate_selection"]["decision_id"], out["selection_decision_id"])

    def test_human_review_boundary_survives_selection(self):
        out = self.create()
        self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")
        v = self.repo.get_object("multi_candidate_verification", out["verification_id"], 1)
        self.assertTrue(v["human_review_required"])
        self.assertFalse(v["model_ranking_used"])
        self.assertFalse(v["scalar_ranking_used"])

    def test_restart_rehydrates_selected_domain_from_persisted_selected_dossier(self):
        out = self.create()
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]), candidate_model_port=StochasticRecordedModelPort([])
        )
        self.assertNotIn("python-comprehensions", e2.registry.domain_keys)
        action = e2.next_action("L", out["course_id"], now=0)
        self.assertEqual(action["action_type"], "LESSON")
        self.assertIn("python-comprehensions", e2.registry.domain_keys)

    def test_full_selected_course_learning_path_still_reaches_completion(self):
        out = self.create()
        cid = out["course_id"]
        self.engine.submit_attempt(operation_id="OLM", attempt_id="ALM", learner_id="L", course_id=cid, item_id="M-PY-LC-1", response="[n*n for n in range(0,7,2)]", submitted_at=100)
        lr = self.engine.submit_attempt(operation_id="OLR", attempt_id="ALR", learner_id="L", course_id=cid, item_id="R-PY-LC-1", response='[len(w) for w in ["cat","tiger","ox","horse"] if len(w)>=4]', submitted_at=4000)
        self.assertEqual(lr["projection"]["stage"], "MASTERED")
        self.engine.submit_attempt(operation_id="ODM", attempt_id="ADM", learner_id="L", course_id=cid, item_id="M-PY-DC-1", response='{n:len(n) for n in ["Ada","Linus","Guido"]}', submitted_at=5000)
        dr = self.engine.submit_attempt(operation_id="ODR", attempt_id="ADR", learner_id="L", course_id=cid, item_id="R-PY-DC-1", response='{n:n**3 for n in range(1,5)}', submitted_at=9000)
        self.assertEqual(dr["projection"]["stage"], "RETAINED")
        action = self.engine.next_action("L", cid, now=9100)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")
        task = self.engine.transfer_task(action["target_id"])
        tr = self.engine.submit_transfer_attempt(operation_id="OT", attempt_id="AT", learner_id="L", course_id=cid, task_id=task["item_id"], response=task["answer"], submitted_at=9200)
        self.assertEqual(tr["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action("L", cid, now=9200)["action_type"], "COURSE_COMPLETE")

    def test_idempotent_replay_does_not_duplicate_candidate_or_course_effects(self):
        first = self.create()
        second = self.create()
        self.assertEqual(first, second)
        self.assertEqual(self.repo.count_objects("course"), 1)
        self.assertEqual(self.repo.count_objects("candidate_selection_decision"), 1)

    def test_same_operation_changed_candidate_set_conflicts(self):
        self.create()
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            self.create(ids=(A, D))

    def test_same_operation_candidate_order_is_idempotent_equivalent(self):
        first = self.create(ids=(A, B, C))
        second = self.create(ids=(C, B, A))
        self.assertEqual(first, second)

    def test_crash_after_evaluation_recovers_same_selection(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="CANDIDATES_EVALUATED")
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]), candidate_model_port=StochasticRecordedModelPort([])
        )
        out = e2.create_multi_candidate_course_job(
            operation_id="OP-MC", job_id="JOB-MC", goal_id="G-MC", title="Python comprehensions multi-candidate",
            desired_outcome=GOAL, candidate_trace_ids=[A, B, C],
        )
        self.assertEqual(out["selected_model_trace_id"], A)

    def test_crash_after_selection_recovers_same_selected_candidate(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="SELECTION_DECIDED")
        d0 = self.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]), candidate_model_port=StochasticRecordedModelPort([])
        )
        out = e2.create_multi_candidate_course_job(
            operation_id="OP-MC", job_id="JOB-MC", goal_id="G-MC", title="Python comprehensions multi-candidate",
            desired_outcome=GOAL, candidate_trace_ids=[A, B, C],
        )
        d1 = e2.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        self.assertEqual(digest(d0), digest(d1))
        self.assertEqual(out["selected_model_trace_id"], A)

    def test_crash_after_selected_course_build_does_not_duplicate_course(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="SELECTED_COURSE_BUILT")
        self.assertEqual(self.repo.count_objects("course"), 1)
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]), candidate_model_port=StochasticRecordedModelPort([])
        )
        out = e2.create_multi_candidate_course_job(
            operation_id="OP-MC", job_id="JOB-MC", goal_id="G-MC", title="Python comprehensions multi-candidate",
            desired_outcome=GOAL, candidate_trace_ids=[A, B, C],
        )
        self.assertEqual(self.repo.count_objects("course"), 1)
        self.assertEqual(out["selected_model_trace_id"], A)

    def test_same_goal_new_job_with_different_candidate_set_fails_identity_collision(self):
        self.create(ids=(A, B, C), op="OP-ONE", job="JOB-ONE", gid="G-SAME")
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([self.capture]),
            candidate_model_port=self.port,
        )
        with self.assertRaisesRegex(ValueError, "OBJECT_IDENTITY_COLLISION"):
            e2.create_multi_candidate_course_job(
                operation_id="OP-TWO", job_id="JOB-TWO", goal_id="G-SAME",
                title="Python comprehensions multi-candidate", desired_outcome=GOAL,
                candidate_trace_ids=[A, D],
            )

    def test_persisted_candidate_evaluation_body_tamper_is_detected(self):
        with self.assertRaises(InjectedCrash):
            self.create(crash="CANDIDATES_EVALUATED")
        es = self.repo.get_object("candidate_evaluation_set", "MC-EVAL-SET-G-MC", 1)
        rid = es["report_ids"][0]
        with self.repo.connect() as con:
            row = con.execute(
                "SELECT body FROM objects WHERE kind=? AND object_id=? AND version=1",
                ("candidate_evaluation", rid),
            ).fetchone()
            body = json.loads(row[0])
            body["hard_gate_status"] = "PASS" if body["hard_gate_status"] != "PASS" else "REJECTED"
            con.execute(
                "UPDATE objects SET body=? WHERE kind=? AND object_id=? AND version=1",
                (json.dumps(body, sort_keys=True, separators=(",", ":")), "candidate_evaluation", rid),
            )
        e2 = StochasticMultiCandidateLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]),
            candidate_model_port=StochasticRecordedModelPort([]),
        )
        with self.assertRaisesRegex(ValueError, "OBJECT_DIGEST_MISMATCH"):
            e2.create_multi_candidate_course_job(
                operation_id="OP-MC", job_id="JOB-MC", goal_id="G-MC",
                title="Python comprehensions multi-candidate", desired_outcome=GOAL,
                candidate_trace_ids=[A, B, C],
            )

    def test_abstention_is_a_successful_durable_outcome(self):
        out = self.create(ids=(A, D))
        job = self.repo.get_job("JOB-MC")
        self.assertEqual(job["state"], "SUCCEEDED")
        self.assertEqual(job["phase"], "ABSTAINED")
        self.assertEqual(out["state"], "ABSTAINED")

    def test_candidate_reports_explicitly_record_model_rank_not_used(self):
        self.create()
        for trace_id in (A, B, C):
            self.assertFalse(self.report_for_trace(trace_id)["model_rank_used"])

    def test_defective_candidate_can_have_high_coverage_but_still_cannot_win(self):
        self.create()
        c = self.report_for_trace(C)
        a = self.report_for_trace(A)
        self.assertEqual(c["mechanical_metrics"], a["mechanical_metrics"])
        self.assertEqual(c["hard_gate_status"], "REJECTED")
        d = self.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        self.assertNotIn(c["candidate_id"], d["qualified_candidate_ids"])

    def test_selection_reason_is_explainable_not_opaque_probability(self):
        out = self.create()
        self.assertEqual(out["selection_reason_codes"], ["ONLY_CANDIDATE_CLEARING_PREDECLARED_SELECTION_EVIDENCE_TARGETS"])
        d = self.repo.get_object("candidate_selection_decision", "MC-SELECT-G-MC", 1)
        self.assertEqual(d["winning_metrics"], {"validated_transfer_task_diversity": 2})


if __name__ == "__main__":
    unittest.main()
