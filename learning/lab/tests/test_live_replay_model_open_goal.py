from __future__ import annotations

import copy
import http.server
import json
import os
import socketserver
import tempfile
import threading
import unittest
from pathlib import Path

from learning_lab import (
    CallableModelCapturePort,
    LiveReplayHTTPProbe,
    LiveReplayOpenGoalLearningEngine,
    LiveReplayOpenGoalTutorDirector,
    NormalizedLiveResearchPort,
    RecordedModelGenerationPort,
    Repository,
    live_open_goal_oracle_registry,
)
from learning_lab.engine import InjectedCrash
from learning_lab.repository import digest

ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MODEL_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."


def load_capture():
    return json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))


def load_model_trace():
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))


def recompute_model_trace(trace):
    t = copy.deepcopy(trace)
    t["prompt_digest"] = digest(t["prompt"])
    t["output_digest"] = digest(t["output"])
    t["trace_digest"] = digest({k: v for k, v in t.items() if k != "trace_digest"})
    return t


def recompute_capture(cap):
    c = copy.deepcopy(cap)
    c["normalized_evidence_digest"] = digest({"sources": c["sources"], "claims": c["claims"]})
    return c


class LiveReplayModelOpenGoalTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.td.name, "learning.sqlite3")
        self.repo = Repository(self.db)
        self.capture = load_capture()
        self.trace = load_model_trace()
        self.research = NormalizedLiveResearchPort([self.capture])
        self.model = RecordedModelGenerationPort([self.trace])
        self.engine = LiveReplayOpenGoalLearningEngine(
            self.repo, research_port=self.research, model_generation_port=self.model
        )

    def tearDown(self):
        self.td.cleanup()

    def create(self, *, op="OP-CREATE", job="JOB-CREATE", gid="G-PY", crash=None):
        return self.engine.create_live_open_goal_course_job(
            operation_id=op, job_id=job, goal_id=gid,
            title="Python comprehensions", desired_outcome=GOAL,
            crash_after_phase=crash,
        )

    def master_list(self, cid, learner="L", prefix="LC", t0=100):
        self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
            course_id=cid, item_id="M-PY-LC-1",
            response="[n*n for n in range(0, 7, 2)]", submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
            course_id=cid, item_id="R-PY-LC-1",
            response='[len(word) for word in ["cat","tiger","ox","horse"] if len(word) >= 4]',
            submitted_at=t0 + 3900,
        )

    def master_dict(self, cid, learner="L", prefix="DC", t0=5000):
        self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
            course_id=cid, item_id="M-PY-DC-1",
            response='{n: len(n) for n in ["Ada", "Linus", "Guido"]}', submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
            course_id=cid, item_id="R-PY-DC-1",
            response='{v: v*v*v for v in range(1,5)}', submitted_at=t0 + 3900,
        )

    def test_new_domain_not_registered_before_build(self):
        self.assertNotIn("python-comprehensions", self.engine.registry.domain_keys)
        self.create()
        self.assertIn("python-comprehensions", self.engine.registry.domain_keys)

    def test_live_research_capture_is_current_official_python_docs(self):
        self.assertEqual(self.capture["capture_mode"], "CHATGPT_WEB_LIVE_NORMALIZED")
        self.assertEqual({s["authority"] for s in self.capture["sources"]}, {"OFFICIAL_PYTHON_DOCUMENTATION"})
        self.assertEqual({s["observed_version"] for s in self.capture["sources"]}, {"Python 3.14.7 documentation"})

    def test_research_port_interprets_supported_goal(self):
        r = self.research.interpret(GOAL)
        self.assertEqual(r["domain_key"], "python-comprehensions")
        self.assertGreaterEqual(r["match_score"], 4)

    def test_research_port_abstains_on_unsupported_goal(self):
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED"):
            self.research.interpret("Learn Italian Renaissance painting conservation chemistry")

    def test_research_capture_digest_tamper_is_rejected(self):
        bad = copy.deepcopy(self.capture)
        bad["claims"][0]["text"] += " tampered"
        with self.assertRaisesRegex(ValueError, "DIGEST_MISMATCH"):
            NormalizedLiveResearchPort([bad])

    def test_model_trace_is_actual_recorded_candidate_not_validator(self):
        self.assertEqual(self.trace["capture_mode"], "CHAT_SESSION_MODEL_GENERATION")
        self.assertEqual(self.trace["model_role"], "CANDIDATE_GENERATOR_ONLY")
        self.assertNotIn("validation_status", self.trace["output"])

    def test_model_prompt_tamper_rejected(self):
        bad = copy.deepcopy(self.trace)
        bad["prompt"]["instruction"] += " altered"
        with self.assertRaisesRegex(ValueError, "PROMPT_DIGEST"):
            RecordedModelGenerationPort([bad])

    def test_model_output_tamper_rejected(self):
        bad = copy.deepcopy(self.trace)
        bad["output"]["course_blueprint"]["skills"][0]["title"] += " altered"
        with self.assertRaisesRegex(ValueError, "OUTPUT_DIGEST"):
            RecordedModelGenerationPort([bad])

    def test_generator_self_verification_field_is_rejected(self):
        bad = copy.deepcopy(self.trace)
        bad["output"]["validation_status"] = "PASS"
        bad = recompute_model_trace(bad)
        with self.assertRaisesRegex(ValueError, "SELF_VERIFICATION"):
            RecordedModelGenerationPort([bad])

    def test_oracle_registry_is_pluggable_and_contains_old_and_new_types(self):
        types = live_open_goal_oracle_registry().oracle_types
        self.assertIn("SQLITE_SELECT_QUERY", types)
        self.assertIn("PYTHON_COMPREHENSION_EXPRESSION", types)

    def test_course_records_research_model_and_oracle_provenance(self):
        out = self.create()
        self.assertEqual(out["model_id"], "GPT-5.6 Sol")
        self.assertEqual(out["oracle_type"], "PYTHON_COMPREHENSION_EXPRESSION")
        self.assertEqual(out["research_capture_id"], self.capture["capture_id"])
        receipt = self.repo.get_object("model_generation_receipt", out["model_generation_trace_id"], 1)
        self.assertEqual(receipt["standing"], "MODEL_GENERATED_CANDIDATE_NOT_VERIFIED")
        verification = self.repo.get_object("live_open_goal_verification", out["verification_id"], 1)
        self.assertFalse(verification["generator_self_approval"])
        self.assertTrue(verification["human_review_required"])

    def test_human_pedagogy_review_boundary_remains_explicit(self):
        out = self.create()
        verification = self.repo.get_object("live_open_goal_verification", out["verification_id"], 1)
        self.assertEqual(
            set(verification["human_review_dimensions"]),
            {"skill_decomposition", "lesson_sequence", "transfer_novelty_strength"},
        )
        self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")

    def test_model_wrong_answer_key_is_caught_by_independent_python_oracle(self):
        bad = copy.deepcopy(self.trace)
        item = next(x for x in bad["output"]["course_blueprint"]["items"] if x["item_id"] == "M-PY-LC-1")
        item["answer"] = "[x for x in range(7)]"
        bad = recompute_model_trace(bad)
        model = RecordedModelGenerationPort([bad])
        engine = LiveReplayOpenGoalLearningEngine(
            Repository(os.path.join(self.td.name, "badkey.sqlite3")), research_port=self.research, model_generation_port=model
        )
        with self.assertRaisesRegex(ValueError, "DOMAIN_BEHAVIOR_ORACLE_FAILED"):
            engine.create_live_open_goal_course_job(operation_id="O", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL)

    def test_model_wrong_worked_example_is_caught(self):
        bad = copy.deepcopy(self.trace)
        ex = bad["output"]["course_blueprint"]["lessons"][0]["worked_examples"][0]
        ex["text"] = "`[x * 3 for x in [1, 2, 3]]` creates `[2, 4, 6]` by transforming each input value."
        bad = recompute_model_trace(bad)
        model = RecordedModelGenerationPort([bad])
        engine = LiveReplayOpenGoalLearningEngine(
            Repository(os.path.join(self.td.name, "badexample.sqlite3")), research_port=self.research, model_generation_port=model
        )
        with self.assertRaisesRegex(ValueError, "LESSON_BEHAVIOR_ORACLE_FAILED"):
            engine.create_live_open_goal_course_job(operation_id="O", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL)

    def test_model_unknown_claim_reference_is_blocked_before_course(self):
        bad = copy.deepcopy(self.trace)
        bad["output"]["course_blueprint"]["items"][0]["claim_refs"].append("CL-INVENTED")
        bad = recompute_model_trace(bad)
        engine = LiveReplayOpenGoalLearningEngine(
            Repository(os.path.join(self.td.name, "badclaim.sqlite3")), research_port=self.research,
            model_generation_port=RecordedModelGenerationPort([bad]),
        )
        with self.assertRaisesRegex(ValueError, "UNKNOWN_CLAIM_REF"):
            engine.create_live_open_goal_course_job(operation_id="O", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL)

    def test_model_cannot_self_approve_pedagogical_judgment(self):
        bad = copy.deepcopy(self.trace)
        bad["output"]["pedagogy_review"][0]["standing"] = "VERIFIED"
        bad = recompute_model_trace(bad)
        engine = LiveReplayOpenGoalLearningEngine(
            Repository(os.path.join(self.td.name, "badped.sqlite3")), research_port=self.research,
            model_generation_port=RecordedModelGenerationPort([bad]),
        )
        with self.assertRaisesRegex(ValueError, "SELF_APPROVAL"):
            engine.create_live_open_goal_course_job(operation_id="O", job_id="J", goal_id="G", title="PY", desired_outcome=GOAL)

    def test_behaviorally_equivalent_mastery_answer_is_accepted(self):
        out = self.create()
        r = self.engine.submit_attempt(
            operation_id="OP-EQ", attempt_id="A-EQ", learner_id="L", course_id=out["course_id"], item_id="M-PY-LC-1",
            response="[n*n for n in range(0, 7, 2)]", submitted_at=100,
        )
        self.assertTrue(r["attempt"]["correct"])
        self.assertEqual(r["projection"]["stage"], "RETENTION_DUE")

    def test_python_oracle_rejects_code_execution_escape(self):
        out = self.create()
        r = self.engine.submit_attempt(
            operation_id="OP-MAL", attempt_id="A-MAL", learner_id="L", course_id=out["course_id"], item_id="M-PY-LC-1",
            response='__import__("os").system("echo unsafe")', submitted_at=100,
        )
        self.assertFalse(r["attempt"]["correct"])

    def test_python_oracle_rejects_unapproved_attribute_access(self):
        out = self.create()
        r = self.engine.submit_attempt(
            operation_id="OP-ATTR", attempt_id="A-ATTR", learner_id="L", course_id=out["course_id"], item_id="M-PY-LC-1",
            response='[x.__class__ for x in range(4)]', submitted_at=100,
        )
        self.assertFalse(r["attempt"]["correct"])

    def test_full_learning_path_reaches_course_complete_only_after_transfer(self):
        out = self.create()
        cid = out["course_id"]
        self.assertEqual(self.engine.next_action("L", cid, now=0)["action_type"], "LESSON")
        lr = self.master_list(cid)
        self.assertEqual(lr["projection"]["stage"], "MASTERED")
        dr = self.master_dict(cid)
        self.assertEqual(dr["projection"]["stage"], "RETAINED")
        action = self.engine.next_action("L", cid, now=9000)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")
        task = self.engine.transfer_task(action["target_id"])
        tr = self.engine.submit_transfer_attempt(
            operation_id="OP-TR", attempt_id="A-TR", learner_id="L", course_id=cid, task_id=task["item_id"],
            response='{k: k*k for k in range(1,8,2)}', submitted_at=9100,
        )
        self.assertEqual(tr["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action("L", cid, now=9100)["action_type"], "COURSE_COMPLETE")

    def test_assisted_transfer_does_not_become_mastery(self):
        out = self.create()
        cid = out["course_id"]
        self.master_list(cid)
        self.master_dict(cid)
        task = self.engine.transfer_task("T-PY-COMP-ODD-SQUARES")
        tr = self.engine.submit_transfer_attempt(
            operation_id="OP-ATR", attempt_id="A-ATR", learner_id="L", course_id=cid, task_id=task["item_id"],
            response=task["answer"], submitted_at=9100, assisted=True,
        )
        self.assertEqual(tr["projection"]["stage"], "RETAINED")
        self.assertIn("A-ATR", tr["projection"]["excluded_attempts"])

    def test_tutor_single_filter_omission_is_hypothesis_then_distinct_family_supports(self):
        out = self.create()
        cid = out["course_id"]
        tutor = LiveReplayOpenGoalTutorDirector(self.repo, self.engine)
        a = tutor.process_turn(
            operation_id="OP-T1", turn_id="T1", session_id="S", learner_id="L", course_id=cid,
            skill_id="S-PY-LISTCOMP", probe_id="TP-PY-LC-1", response="[x for x in range(6)]",
            requested_help_level=2, now=1,
        )
        self.assertEqual(a["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")
        b = tutor.process_turn(
            operation_id="OP-T2", turn_id="T2", session_id="S", learner_id="L", course_id=cid,
            skill_id="S-PY-LISTCOMP", probe_id="TP-PY-LC-2", response="[x for x in [1,2,3,4]]",
            requested_help_level=3, now=2,
        )
        self.assertEqual(b["diagnosis"]["standing"], "EVIDENCE_SUPPORTED")
        self.assertLessEqual(b["teaching_move"]["support_level_after"], 2)

    def test_tutor_context_does_not_contain_answer_or_oracle_gold(self):
        out = self.create()
        tutor = LiveReplayOpenGoalTutorDirector(self.repo, self.engine)
        spec = self.engine._spec_for_course(out["course_id"])
        ctx = tutor._context(
            session_id="S", learner_id="L", course_id=out["course_id"], skill_id="S-PY-LISTCOMP",
            probe=spec.tutor_probes["TP-PY-LC-1"], active_item=None,
        )
        text = json.dumps(ctx).lower()
        self.assertNotIn('"answer"', text)
        self.assertNotIn("oracle_spec", text)
        self.assertNotIn("error_rules", text)

    def test_tutor_cannot_help_during_mastery(self):
        out = self.create()
        tutor = LiveReplayOpenGoalTutorDirector(self.repo, self.engine)
        r = tutor.process_turn(
            operation_id="OP-TB", turn_id="TB", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-PY-LISTCOMP", probe_id=None, response="hint", requested_help_level=3, now=1,
            active_assessment_item_id="M-PY-LC-1",
        )
        self.assertEqual(r["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.assertNotIn("range(7)", r["teaching_move"]["content"])

    def test_idempotent_replay_does_not_duplicate_course(self):
        a = self.create()
        n = self.repo.count_objects("course")
        b = self.create()
        self.assertEqual(a, b)
        self.assertEqual(n, self.repo.count_objects("course"))

    def test_changed_payload_same_operation_conflicts(self):
        self.create()
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY"):
            self.engine.create_live_open_goal_course_job(
                operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-PY",
                title="Changed", desired_outcome=GOAL,
            )

    def test_crash_recovery_all_live_pipeline_boundaries(self):
        phases = [
            "GOAL_INTERPRETED", "RESEARCH_PLANNED", "SOURCES_ACQUIRED", "MODEL_PINNED",
            "MODEL_GENERATED", "ORACLE_BOUND", "LIVE_OPEN_GOAL_COURSE_GENERATED",
        ]
        for i, phase in enumerate(phases):
            db = os.path.join(self.td.name, f"crash-{i}.sqlite3")
            repo = Repository(db)
            e = LiveReplayOpenGoalLearningEngine(
                repo, research_port=NormalizedLiveResearchPort([self.capture]),
                model_generation_port=RecordedModelGenerationPort([self.trace]),
            )
            with self.assertRaises(InjectedCrash):
                e.create_live_open_goal_course_job(
                    operation_id=f"OP-{i}", job_id=f"JOB-{i}", goal_id=f"G-{i}",
                    title="PY", desired_outcome=GOAL, crash_after_phase=phase,
                )
            out = e.create_live_open_goal_course_job(
                operation_id=f"OP-{i}", job_id=f"JOB-{i}", goal_id=f"G-{i}", title="PY", desired_outcome=GOAL,
            )
            self.assertEqual(out["state"], "READY_FOR_REVIEW")

    def test_recovery_after_model_generation_needs_no_live_research_or_model_trace(self):
        with self.assertRaises(InjectedCrash):
            self.create(op="OP-RM", job="JOB-RM", gid="G-RM", crash="MODEL_GENERATED")
        restarted = LiveReplayOpenGoalLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]), model_generation_port=RecordedModelGenerationPort([])
        )
        out = restarted.create_live_open_goal_course_job(
            operation_id="OP-RM", job_id="JOB-RM", goal_id="G-RM", title="Python comprehensions", desired_outcome=GOAL,
        )
        self.assertEqual(out["state"], "READY_FOR_REVIEW")

    def test_research_capture_drift_before_acquisition_fails_closed(self):
        with self.assertRaises(InjectedCrash):
            self.create(op="OP-RD", job="JOB-RD", gid="G-RD", crash="RESEARCH_PLANNED")
        changed = copy.deepcopy(self.capture)
        changed["claims"][0]["text"] += " changed under same capture id"
        changed = recompute_capture(changed)
        restarted = LiveReplayOpenGoalLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([changed]), model_generation_port=self.model
        )
        with self.assertRaisesRegex(ValueError, "CAPTURE_DRIFT"):
            restarted.create_live_open_goal_course_job(
                operation_id="OP-RD", job_id="JOB-RD", goal_id="G-RD", title="Python comprehensions", desired_outcome=GOAL,
            )

    def test_model_trace_drift_after_pin_fails_closed(self):
        with self.assertRaises(InjectedCrash):
            self.create(op="OP-MD", job="JOB-MD", gid="G-MD", crash="MODEL_PINNED")
        changed = copy.deepcopy(self.trace)
        changed["output"]["course_blueprint"]["skills"][0]["title"] += " changed"
        changed = recompute_model_trace(changed)
        restarted = LiveReplayOpenGoalLearningEngine(
            Repository(self.db), research_port=self.research, model_generation_port=RecordedModelGenerationPort([changed])
        )
        with self.assertRaisesRegex(ValueError, "MODEL_TRACE_PIN_DRIFT"):
            restarted.create_live_open_goal_course_job(
                operation_id="OP-MD", job_id="JOB-MD", goal_id="G-MD", title="Python comprehensions", desired_outcome=GOAL,
            )

    def test_restart_rehydrates_dynamic_domain_from_persisted_generated_dossier(self):
        out = self.create()
        cid = out["course_id"]
        self.master_list(cid, prefix="RH-L")
        restarted = LiveReplayOpenGoalLearningEngine(
            Repository(self.db), research_port=NormalizedLiveResearchPort([]), model_generation_port=RecordedModelGenerationPort([])
        )
        self.assertNotIn("python-comprehensions", restarted.registry.domain_keys)
        action = restarted.next_action("L", cid, now=4100)
        self.assertIn("python-comprehensions", restarted.registry.domain_keys)
        self.assertEqual(action["action_type"], "LESSON")

    def test_fresh_stores_replay_same_course_research_and_model_digests(self):
        rows = []
        for i in range(2):
            with tempfile.TemporaryDirectory() as td:
                e = LiveReplayOpenGoalLearningEngine(
                    Repository(os.path.join(td, "x.sqlite3")),
                    research_port=NormalizedLiveResearchPort([self.capture]),
                    model_generation_port=RecordedModelGenerationPort([self.trace]),
                )
                o = e.create_live_open_goal_course_job(
                    operation_id=f"OP-{i}", job_id=f"J-{i}", goal_id="G-DET", title="PY", desired_outcome=GOAL,
                )
                rows.append((o["course_digest"], o["research_evidence_digest"], o["model_output_digest"]))
        self.assertEqual(rows[0], rows[1])

    def test_callable_model_capture_can_be_replayed_exactly(self):
        prompt = copy.deepcopy(self.trace["prompt"])
        cap = CallableModelCapturePort("TEST-MODEL", lambda p: copy.deepcopy(self.trace["output"])).capture(
            prompt, self.capture["normalized_evidence_digest"]
        )
        replay = RecordedModelGenerationPort([cap])
        dossier = self.research.acquire(GOAL, self.research.plan(self.research.interpret(GOAL)))
        out, receipt = replay.generate(goal_id="G", title="T", desired_outcome=GOAL, dossier=dossier)
        self.assertEqual(digest(out), cap["output_digest"])
        self.assertEqual(receipt["model_id"], "TEST-MODEL")

    def test_local_live_http_transport_capture_and_exact_replay(self):
        body = b"official-like source snapshot for live transport test\n"
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, fmt, *args):
                pass
        with socketserver.TCPServer(("127.0.0.1", 0), Handler) as server:
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            try:
                url = f"http://127.0.0.1:{server.server_address[1]}/source"
                probe = LiveReplayHTTPProbe()
                capture = probe.capture(url)
                self.assertEqual(capture["status"], 200)
                self.assertEqual(probe.replay(capture), body.decode())
            finally:
                server.shutdown()
                t.join(timeout=3)

    def test_http_replay_detects_changed_bytes(self):
        cap = {"body": "abc", "body_sha256": "wrong"}
        with self.assertRaisesRegex(ValueError, "REPLAY_DIGEST"):
            LiveReplayHTTPProbe.replay(cap)


if __name__ == "__main__":
    unittest.main()
