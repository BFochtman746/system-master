from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest

from learning_lab import (
    OpenGoalLearningEngine,
    OpenGoalTutorDirector,
    Repository,
    RuntimeResearchCorpus,
)
from learning_lab.engine import InjectedCrash
from learning_lab.open_goal import BoundedGoalInterpreter, DeclarativeSQLiteOracle, OpenGoalResearchPlanner, OpenGoalSourceAcquirer
from learning_lab.repository import digest


GOAL = "Query a SQLite tasks table with SELECT, filter rows with WHERE, and sort results with ORDER BY."
BUNDLE_PATH = os.path.join(os.path.dirname(__file__), "..", "sources", "OPEN_GOAL_SQLITE_QUERY_FUNDAMENTALS_V1.json")


def load_bundle():
    with open(BUNDLE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class OpenGoalCompilerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "lab.sqlite3")
        self.repo = Repository(self.db)
        self.corpus = RuntimeResearchCorpus()
        self.engine = OpenGoalLearningEngine(self.repo, corpus=self.corpus)
        self.bundle = load_bundle()

    def tearDown(self):
        self.tmp.cleanup()

    def add_and_create(self, goal_id="G-SQL", op="OP-SQL", job="JOB-SQL"):
        self.corpus.add_bundle(self.bundle)
        return self.engine.create_open_goal_course_job(
            operation_id=op, job_id=job, goal_id=goal_id, title="SQLite query fundamentals", desired_outcome=GOAL,
        )

    def master_where(self, course_id, learner="L", prefix="W", t0=100):
        self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
            course_id=course_id, item_id="M-SQL-WHERE-1",
            response="select title, priority from tasks where owner = 'Ava'", submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
            course_id=course_id, item_id="R-SQL-WHERE-1",
            response="SELECT title, owner FROM tasks WHERE priority <= 1", submitted_at=t0 + 3900,
        )

    def retain_order(self, course_id, learner="L", prefix="O", t0=5000):
        self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
            course_id=course_id, item_id="M-SQL-ORDER-1",
            response="SELECT title, owner, priority FROM tasks WHERE done=0 ORDER BY priority ASC, owner ASC, title ASC",
            submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
            course_id=course_id, item_id="R-SQL-ORDER-1",
            response="SELECT title, priority FROM tasks WHERE priority>=2 ORDER BY priority DESC, title DESC",
            submitted_at=t0 + 4000,
        )

    def test_engine_starts_without_sqlite_domain(self):
        self.assertEqual(self.engine.registry.domain_keys, ["fractions-unlike-denominators", "git-feature-branch-workflow"])
        self.assertNotIn("sqlite-query-fundamentals", self.engine.registry.domain_keys)

    def test_adding_runtime_research_does_not_register_domain(self):
        self.corpus.add_bundle(self.bundle)
        self.assertNotIn("sqlite-query-fundamentals", self.engine.registry.domain_keys)

    def test_goal_interpreter_resolves_runtime_bundle(self):
        self.corpus.add_bundle(self.bundle)
        out = BoundedGoalInterpreter().interpret(GOAL, self.corpus)
        self.assertEqual(out["bundle_id"], self.bundle["bundle_id"])
        self.assertEqual(out["bundle_digest"], digest(self.bundle))
        self.assertGreaterEqual(out["match_score"], 2)

    def test_unsupported_goal_abstains(self):
        self.corpus.add_bundle(self.bundle)
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_UNSUPPORTED"):
            self.engine.create_open_goal_course_job(
                operation_id="OP-X", job_id="JOB-X", goal_id="GX", title="French",
                desired_outcome="Learn conversational French greetings and pronunciation.",
            )

    def test_ambiguous_runtime_research_match_abstains(self):
        a = copy.deepcopy(self.bundle)
        b = copy.deepcopy(self.bundle)
        a["bundle_id"] = "A"
        b["bundle_id"] = "B"
        b["domain_key"] = "another-sqlite-domain"
        c = RuntimeResearchCorpus([a, b])
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_AMBIGUOUS"):
            BoundedGoalInterpreter().interpret(GOAL, c)

    def test_runtime_bundle_same_id_different_bytes_rejected(self):
        self.corpus.add_bundle(self.bundle)
        b = copy.deepcopy(self.bundle)
        b["claims"][0]["text"] += " changed"
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_BUNDLE_VERSION_COLLISION"):
            self.corpus.add_bundle(b)

    def test_research_planner_is_goal_bound(self):
        self.corpus.add_bundle(self.bundle)
        i = BoundedGoalInterpreter().interpret(GOAL, self.corpus)
        p = OpenGoalResearchPlanner().plan(i, self.bundle)
        self.assertEqual(p["bundle_digest"], digest(self.bundle))
        self.assertEqual(p["oracle_type"], "SQLITE_SELECT_QUERY")
        self.assertEqual({c["concept_id"] for c in p["concepts"]}, {"SQL-C-SELECT", "SQL-C-WHERE", "SQL-C-ORDER"})

    def test_source_acquisition_requires_admitted_authoritative_sources(self):
        b = copy.deepcopy(self.bundle)
        for s in b["sources"]:
            s["standing"] = "REJECTED"
        c = RuntimeResearchCorpus([b])
        i = BoundedGoalInterpreter().interpret(GOAL, c)
        p = OpenGoalResearchPlanner().plan(i, b)
        with self.assertRaisesRegex(ValueError, "NO_ADMISSIBLE_SOURCES"):
            OpenGoalSourceAcquirer().acquire(GOAL, p, b)

    def test_open_goal_job_registers_third_domain_only_after_research(self):
        out = self.add_and_create()
        self.assertTrue(out["open_goal"])
        self.assertEqual(out["domain_key"], "sqlite-query-fundamentals")
        self.assertEqual(len(self.engine.registry.domain_keys), 3)
        self.assertIn("sqlite-query-fundamentals", self.engine.registry.domain_keys)

    def test_open_goal_job_uses_top_level_job_identity(self):
        out = self.add_and_create()
        self.assertEqual(out["job_id"], "JOB-SQL")
        self.assertEqual(out["course_build_job_id"], "JOB-SQL:COURSE")
        self.assertEqual(self.repo.get_job("JOB-SQL")["state"], "SUCCEEDED")

    def test_interpretation_plan_and_dossier_are_persisted(self):
        out = self.add_and_create()
        i = self.repo.get_object("goal_interpretation", "INT-G-SQL", 1)
        p = self.repo.get_object("research_plan", "PLAN-G-SQL", 1)
        d = self.repo.get_object("research_dossier", out["research_dossier_id"], 1)
        self.assertEqual(i["bundle_id"], self.bundle["bundle_id"])
        self.assertEqual(p["bundle_digest"], digest(self.bundle))
        self.assertEqual(len(d["sources"]), 2)
        self.assertEqual(len(d["claims"]), 6)

    def test_generated_course_is_grounded_and_mechanically_validated(self):
        out = self.add_and_create()
        val = self.repo.get_object("course_validation", out["validation_id"], 1)
        self.assertEqual(val["grounding"]["status"], "PASS")
        self.assertEqual(val["domain_behavior_oracle"]["status"], "PASS")
        self.assertEqual(val["lesson_behavior_oracle"]["status"], "PASS")
        self.assertEqual(val["instructional_design"]["status"], "PASS")
        self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")

    def test_course_explanation_is_generated_from_admitted_claims(self):
        out = self.add_and_create()
        course = self.engine.course(out["course_id"])
        dossier = self.repo.get_object("research_dossier", out["research_dossier_id"], 1)
        by_id = {c["claim_id"]: c["text"] for c in dossier["claims"]}
        l = next(x for x in course["lessons"] if x["lesson_id"] == "L-SQL-SELECT-WHERE")
        self.assertEqual(l["explanation"], " ".join(by_id[r] for r in ["CL-SQL-001", "CL-SQL-002", "CL-SQL-003"]))

    def test_sql_oracle_accepts_behaviorally_equivalent_query(self):
        out = self.add_and_create()
        attempt = self.engine.submit_attempt(
            operation_id="OP-EQ", attempt_id="A-EQ", learner_id="L", course_id=out["course_id"],
            item_id="M-SQL-WHERE-1", response="SeLeCt title,priority FROM tasks WHERE 'Ava'=owner", submitted_at=100,
        )
        self.assertTrue(attempt["attempt"]["correct"])

    def test_sql_oracle_rejects_wrong_generated_answer_key(self):
        d = copy.deepcopy(self.bundle)
        item = next(x for x in d["course_blueprint"]["items"] if x["item_id"] == "M-SQL-WHERE-1")
        item["answer"] = "SELECT title, priority FROM tasks WHERE owner = 'Ben'"
        oracle = DeclarativeSQLiteOracle(d["oracle_descriptor"], d["course_blueprint"])
        from learning_lab.open_goal import compile_course_from_dossier
        dossier = OpenGoalSourceAcquirer().acquire(
            GOAL,
            OpenGoalResearchPlanner().plan(BoundedGoalInterpreter().interpret(GOAL, RuntimeResearchCorpus([d])), d),
            d,
        )
        course = as_course_dict(compile_course_from_dossier(goal_id="G", title="SQL", desired_outcome=GOAL, dossier=dossier))
        result = oracle.validate_reference_items(course)
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(any(x["item_id"] == "M-SQL-WHERE-1" for x in result["failures"]))

    def test_sql_oracle_rejects_non_select_response(self):
        out = self.add_and_create()
        a = self.engine.submit_attempt(
            operation_id="OP-MUT", attempt_id="A-MUT", learner_id="L", course_id=out["course_id"],
            item_id="M-SQL-WHERE-1", response="DELETE FROM tasks", submitted_at=100,
        )
        self.assertFalse(a["attempt"]["correct"])

    def test_prerequisite_blocks_order_skill(self):
        out = self.add_and_create()
        action = self.engine.next_action("L", out["course_id"], now=0)
        self.assertEqual(action["target_id"], "L-SQL-SELECT-WHERE")
        tutor = OpenGoalTutorDirector(self.repo, self.engine)
        t = tutor.process_turn(
            operation_id="OP-T-PRE", turn_id="T-PRE", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-SQL-ORDER", probe_id="TP-SQL-ORDER-1", response="SELECT title FROM tasks",
            requested_help_level=0, now=0,
        )
        self.assertEqual(t["teaching_move"]["move"], "PREREQUISITE_BLOCKED")

    def test_full_open_goal_lifecycle_reaches_course_complete(self):
        out = self.add_and_create()
        cid = out["course_id"]
        self.master_where(cid)
        r = self.retain_order(cid)
        self.assertEqual(r["projection"]["stage"], "RETAINED")
        action = self.engine.next_action("L", cid, now=9000)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")
        t = self.engine.transfer_task(action["target_id"])
        x = self.engine.submit_transfer_attempt(
            operation_id="OP-T", attempt_id="A-T", learner_id="L", course_id=cid,
            task_id=t["item_id"], response="select owner,title,priority from tasks where done=0 order by owner asc, priority desc, title asc",
            submitted_at=9100,
        )
        self.assertEqual(x["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action("L", cid, now=9100)["action_type"], "COURSE_COMPLETE")

    def test_retention_is_not_transfer(self):
        out = self.add_and_create()
        cid = out["course_id"]
        self.master_where(cid)
        r = self.retain_order(cid)
        self.assertEqual(r["projection"]["stage"], "RETAINED")
        self.assertEqual(r["projection"]["gate_states"]["TRANSFER"], "IN_PROGRESS")

    def test_assisted_transfer_cannot_qualify(self):
        out = self.add_and_create()
        cid = out["course_id"]
        self.master_where(cid)
        self.retain_order(cid)
        task = self.engine.transfer_task("T-SQL-TRANSFER-BACKLOG")
        r = self.engine.submit_transfer_attempt(
            operation_id="OP-AT", attempt_id="A-AT", learner_id="L", course_id=cid, task_id=task["item_id"],
            response=task["answer"], submitted_at=9100, assisted=True,
        )
        self.assertEqual(r["projection"]["stage"], "RETAINED")
        self.assertIn("A-AT", r["projection"]["excluded_attempts"])

    def test_failed_transfer_family_forces_new_family(self):
        out = self.add_and_create()
        cid = out["course_id"]
        self.master_where(cid)
        self.retain_order(cid)
        task = self.engine.transfer_task("T-SQL-TRANSFER-BACKLOG")
        self.engine.submit_transfer_attempt(
            operation_id="OP-TF", attempt_id="A-TF", learner_id="L", course_id=cid, task_id=task["item_id"],
            response="SELECT title FROM tasks", submitted_at=9100,
        )
        self.assertEqual(self.engine.next_action("L", cid, now=9100)["target_id"], "T-SQL-TRANSFER-TRIAGE")

    def test_stale_prerequisite_requires_fresh_maintenance(self):
        out = self.add_and_create()
        cid = out["course_id"]
        self.master_where(cid, prefix="ST")
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 10
        action = self.engine.next_action("L", cid, now=now)
        self.assertEqual(action["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(action["target_id"], "MN-SQL-WHERE-2")

    def test_tutor_abstains_when_cause_unknown(self):
        out = self.add_and_create()
        tutor = OpenGoalTutorDirector(self.repo, self.engine)
        r = tutor.process_turn(
            operation_id="OP-TA", turn_id="TA", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-1", response="banana",
            requested_help_level=3, now=1,
        )
        self.assertEqual(r["diagnosis"]["status"], "ABSTAINED")
        self.assertIsNone(r["diagnosis"]["primary_cause"])
        self.assertTrue(r["teaching_move"]["overhelping_prevented"])

    def test_tutor_single_missing_where_is_hypothesis(self):
        out = self.add_and_create()
        tutor = OpenGoalTutorDirector(self.repo, self.engine)
        r = tutor.process_turn(
            operation_id="OP-TH", turn_id="TH", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-1", response="SELECT title FROM tasks",
            requested_help_level=0, now=1,
        )
        self.assertEqual(r["diagnosis"]["primary_cause"], "WHERE_OMITTED")
        self.assertEqual(r["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")

    def test_tutor_distinct_family_corroboration_supports_cause(self):
        out = self.add_and_create()
        tutor = OpenGoalTutorDirector(self.repo, self.engine)
        tutor.process_turn(
            operation_id="OP-TC1", turn_id="TC1", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-1", response="SELECT title FROM tasks",
            requested_help_level=1, now=1,
        )
        r = tutor.process_turn(
            operation_id="OP-TC2", turn_id="TC2", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-2", response="SELECT owner FROM tasks",
            requested_help_level=3, now=2,
        )
        self.assertEqual(r["diagnosis"]["standing"], "EVIDENCE_SUPPORTED")
        self.assertEqual(r["teaching_move"]["move"], "TARGETED_REMEDIATION")
        self.assertLessEqual(r["teaching_move"]["support_level_after"], 2)

    def test_tutor_context_strips_probe_answer_and_gold(self):
        out = self.add_and_create()
        tutor = OpenGoalTutorDirector(self.repo, self.engine)
        spec = self.engine._spec_for_course(out["course_id"])
        probe = spec.tutor_probes["TP-SQL-WHERE-1"]
        ctx = tutor._context(session_id="S", learner_id="L", course_id=out["course_id"], skill_id="S-SQL-SELECT-WHERE", probe=probe, active_item=None)
        text = json.dumps(ctx).lower()
        self.assertNotIn('"answer"', text)
        self.assertNotIn('oracle_spec', text)
        self.assertNotIn('error_rules', text)

    def test_tutor_cannot_help_during_open_goal_mastery(self):
        out = self.add_and_create()
        tutor = OpenGoalTutorDirector(self.repo, self.engine)
        r = tutor.process_turn(
            operation_id="OP-TB", turn_id="TB", session_id="S", learner_id="L", course_id=out["course_id"],
            skill_id="S-SQL-SELECT-WHERE", probe_id=None, response="hint", requested_help_level=3, now=1,
            active_assessment_item_id="M-SQL-WHERE-1",
        )
        self.assertEqual(r["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.assertNotIn("owner = 'ava'", r["teaching_move"]["content"].lower())

    def test_crash_recovery_after_goal_interpretation(self):
        self.corpus.add_bundle(self.bundle)
        with self.assertRaises(InjectedCrash):
            self.engine.create_open_goal_course_job(operation_id="OP-C1", job_id="JOB-C1", goal_id="GC1", title="SQL", desired_outcome=GOAL, crash_after_phase="GOAL_INTERPRETED")
        out = self.engine.create_open_goal_course_job(operation_id="OP-C1", job_id="JOB-C1", goal_id="GC1", title="SQL", desired_outcome=GOAL)
        self.assertEqual(out["state"], "READY_FOR_REVIEW")

    def test_crash_recovery_after_research_plan(self):
        self.corpus.add_bundle(self.bundle)
        with self.assertRaises(InjectedCrash):
            self.engine.create_open_goal_course_job(operation_id="OP-C2", job_id="JOB-C2", goal_id="GC2", title="SQL", desired_outcome=GOAL, crash_after_phase="RESEARCH_PLANNED")
        out = self.engine.create_open_goal_course_job(operation_id="OP-C2", job_id="JOB-C2", goal_id="GC2", title="SQL", desired_outcome=GOAL)
        self.assertEqual(out["state"], "READY_FOR_REVIEW")

    def test_crash_recovery_after_source_acquisition_without_corpus(self):
        self.corpus.add_bundle(self.bundle)
        with self.assertRaises(InjectedCrash):
            self.engine.create_open_goal_course_job(operation_id="OP-C3", job_id="JOB-C3", goal_id="GC3", title="SQL", desired_outcome=GOAL, crash_after_phase="SOURCES_ACQUIRED")
        restarted = OpenGoalLearningEngine(Repository(self.db), corpus=RuntimeResearchCorpus())
        out = restarted.create_open_goal_course_job(operation_id="OP-C3", job_id="JOB-C3", goal_id="GC3", title="SQL", desired_outcome=GOAL)
        self.assertEqual(out["state"], "READY_FOR_REVIEW")

    def test_bundle_digest_drift_before_acquisition_fails_closed(self):
        self.corpus.add_bundle(self.bundle)
        with self.assertRaises(InjectedCrash):
            self.engine.create_open_goal_course_job(operation_id="OP-DR", job_id="JOB-DR", goal_id="GDR", title="SQL", desired_outcome=GOAL, crash_after_phase="RESEARCH_PLANNED")
        changed = copy.deepcopy(self.bundle)
        changed["claims"][0]["text"] += " altered under same version"
        restarted = OpenGoalLearningEngine(Repository(self.db), corpus=RuntimeResearchCorpus([changed]))
        with self.assertRaisesRegex(ValueError, "BUNDLE_DIGEST_DRIFT"):
            restarted.create_open_goal_course_job(operation_id="OP-DR", job_id="JOB-DR", goal_id="GDR", title="SQL", desired_outcome=GOAL)

    def test_idempotent_open_goal_replay_does_not_duplicate_course(self):
        out1 = self.add_and_create()
        n = self.repo.count_objects("course")
        out2 = self.engine.create_open_goal_course_job(operation_id="OP-SQL", job_id="JOB-SQL", goal_id="G-SQL", title="SQLite query fundamentals", desired_outcome=GOAL)
        self.assertEqual(out1, out2)
        self.assertEqual(self.repo.count_objects("course"), n)

    def test_changed_payload_under_same_operation_conflicts(self):
        self.add_and_create()
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY"):
            self.engine.create_open_goal_course_job(operation_id="OP-SQL", job_id="JOB-SQL", goal_id="G-SQL", title="Changed title", desired_outcome=GOAL)

    def test_restart_with_empty_corpus_rehydrates_dynamic_domain_from_dossier(self):
        out = self.add_and_create()
        cid = out["course_id"]
        self.master_where(cid, prefix="RH")
        self.retain_order(cid, prefix="RHO")
        restarted = OpenGoalLearningEngine(Repository(self.db), corpus=RuntimeResearchCorpus())
        self.assertNotIn("sqlite-query-fundamentals", restarted.registry.domain_keys)
        action = restarted.next_action("L", cid, now=9000)
        self.assertIn("sqlite-query-fundamentals", restarted.registry.domain_keys)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")

    def test_fresh_stores_compile_identical_course_and_dossier(self):
        outputs = []
        for idx in range(2):
            with tempfile.TemporaryDirectory() as td:
                r = Repository(os.path.join(td, "x.sqlite3"))
                c = RuntimeResearchCorpus([self.bundle])
                e = OpenGoalLearningEngine(r, corpus=c)
                o = e.create_open_goal_course_job(operation_id=f"OP{idx}", job_id=f"J{idx}", goal_id="GDET", title="SQL", desired_outcome=GOAL)
                outputs.append((o["course_digest"], o["research_dossier_digest"]))
        self.assertEqual(outputs[0], outputs[1])


def as_course_dict(course):
    from dataclasses import asdict
    return asdict(course)


if __name__ == "__main__":
    unittest.main()
