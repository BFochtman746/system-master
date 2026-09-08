from __future__ import annotations

import copy
import inspect
import os
import tempfile
import unittest
from dataclasses import replace

from learning_lab import (
    DomainGeneralLearningEngine,
    DomainGeneralTutorDirector,
    DomainRegistry,
    MultiSessionDirector,
    REAL_FRACTION_OUTCOME,
    REAL_GIT_OUTCOME,
    Repository,
    default_domain_registry,
)
from learning_lab.domain_general import FRACTION_DOMAIN_KEY, GIT_DOMAIN_KEY
from learning_lab.engine import InjectedCrash


class DomainGeneralSecondDomainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.tmp.name, "lab.sqlite3"))
        self.engine = DomainGeneralLearningEngine(self.repo)
        self.created = self.engine.create_research_grounded_course_job(
            operation_id="OP-F-CREATE", job_id="JOB-F-CREATE", goal_id="G-FRAC",
            title="Unlike-denominator fractions", desired_outcome=REAL_FRACTION_OUTCOME,
        )
        self.course_id = self.created["course_id"]

    def tearDown(self):
        self.tmp.cleanup()

    def master_lcd(self, learner="L", prefix="X", t0=100):
        self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-LM", attempt_id=f"A-{prefix}-LM", learner_id=learner,
            course_id=self.course_id, item_id="M-FRAC-LCD-1",
            response="LCD=24; 5/8=15/24; 7/12=14/24", submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-LR", attempt_id=f"A-{prefix}-LR", learner_id=learner,
            course_id=self.course_id, item_id="R-FRAC-LCD-1",
            response="LCD=60; 3/10=18/60; 5/12=25/60", submitted_at=t0 + 3900,
        )

    def retain_add_sub(self, learner="L", prefix="X", t0=5000):
        self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-AM", attempt_id=f"A-{prefix}-AM", learner_id=learner,
            course_id=self.course_id, item_id="M-FRAC-ADD-1", response="19/12", submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{prefix}-AR", attempt_id=f"A-{prefix}-AR", learner_id=learner,
            course_id=self.course_id, item_id="R-FRAC-SUB-1", response="9/20", submitted_at=t0 + 4000,
        )

    def test_registry_has_two_materially_different_domains(self):
        self.assertEqual(self.engine.registry.domain_keys, [FRACTION_DOMAIN_KEY, GIT_DOMAIN_KEY])

    def test_fraction_course_is_real_grounded_candidate(self):
        self.assertEqual(self.created["domain_key"], FRACTION_DOMAIN_KEY)
        self.assertEqual(self.created["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")
        val = self.repo.get_object("course_validation", self.created["validation_id"], 1)
        self.assertEqual(val["grounding"]["status"], "PASS")
        self.assertEqual(val["domain_behavior_oracle"]["status"], "PASS")
        self.assertEqual(val["lesson_behavior_oracle"]["status"], "PASS")

    def test_fraction_research_claims_are_frozen_and_admitted(self):
        d = self.repo.get_object("research_dossier", "RSCH-FRACTIONS-UNLIKE-DENOMINATORS-001", 1)
        self.assertEqual(len(d["sources"]), 3)
        self.assertEqual(len(d["claims"]), 6)
        self.assertTrue(all(s["standing"] == "ADMITTED" for s in d["sources"]))

    def test_independent_math_oracle_accepts_equivalent_fraction_form(self):
        out = self.engine.submit_attempt(
            operation_id="OP-EQ", attempt_id="A-EQ", learner_id="L", course_id=self.course_id,
            item_id="M-FRAC-ADD-1", response="38/24", submitted_at=100,
        )
        self.assertTrue(out["attempt"]["correct"])

    def test_add_numerators_and_denominators_is_rejected(self):
        out = self.engine.submit_attempt(
            operation_id="OP-BAD", attempt_id="A-BAD", learner_id="L", course_id=self.course_id,
            item_id="M-FRAC-ADD-1", response="8/10", submitted_at=100,
        )
        self.assertFalse(out["attempt"]["correct"])
        self.assertEqual(out["projection"]["stage"], "BUILDING")

    def test_prerequisite_blocks_second_skill(self):
        action = self.engine.next_action("L", self.course_id, now=0)
        self.assertEqual(action["target_id"], "L-FRAC-EQUIV-LCD")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        out = tutor.process_turn(
            operation_id="OP-T-PRE", turn_id="T-PRE", session_id="S", learner_id="L",
            course_id=self.course_id, skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1",
            response="5/6", requested_help_level=0, now=0,
        )
        self.assertEqual(out["teaching_move"]["move"], "PREREQUISITE_BLOCKED")
        self.assertIn("S-FRAC-EQUIV-LCD", out["missing_prerequisite_skill_ids"])

    def test_full_fraction_lifecycle_reaches_course_complete(self):
        self.master_lcd(prefix="F")
        retained = self.retain_add_sub(prefix="F")
        self.assertEqual(retained["projection"]["stage"], "RETAINED")
        action = self.engine.next_action("L", self.course_id, now=9000)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")
        self.assertEqual(action["target_id"], "T-FRAC-TRANSFER-DISTANCE")
        t = self.engine.transfer_task(action["target_id"])
        out = self.engine.submit_transfer_attempt(
            operation_id="OP-F-T", attempt_id="A-F-T", learner_id="L", course_id=self.course_id,
            task_id=t["item_id"], response="31/24", submitted_at=9100,
        )
        self.assertEqual(out["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action("L", self.course_id, now=9100)["action_type"], "COURSE_COMPLETE")

    def test_fraction_retention_does_not_equal_transfer(self):
        self.master_lcd(prefix="R")
        retained = self.retain_add_sub(prefix="R")
        self.assertEqual(retained["projection"]["gate_states"]["TRANSFER"], "IN_PROGRESS")
        self.assertNotEqual(retained["projection"]["stage"], "MASTERED")

    def test_assisted_fraction_transfer_cannot_qualify(self):
        self.master_lcd(prefix="AT")
        self.retain_add_sub(prefix="AT")
        t = self.engine.transfer_task("T-FRAC-TRANSFER-DISTANCE")
        out = self.engine.submit_transfer_attempt(
            operation_id="OP-AT-T", attempt_id="A-AT-T", learner_id="L", course_id=self.course_id,
            task_id=t["item_id"], response="31/24", submitted_at=9100, assisted=True,
        )
        self.assertEqual(out["projection"]["stage"], "RETAINED")
        self.assertIn("A-AT-T", out["projection"]["excluded_attempts"])

    def test_failed_fraction_transfer_family_forces_new_family(self):
        self.master_lcd(prefix="TF")
        self.retain_add_sub(prefix="TF")
        t = self.engine.transfer_task("T-FRAC-TRANSFER-DISTANCE")
        self.engine.submit_transfer_attempt(
            operation_id="OP-TF1", attempt_id="A-TF1", learner_id="L", course_id=self.course_id,
            task_id=t["item_id"], response="7/8", submitted_at=9100,
        )
        action = self.engine.next_action("L", self.course_id, now=9100)
        self.assertEqual(action["target_id"], "T-FRAC-TRANSFER-TANK")

    def test_fraction_stale_retention_requires_fresh_maintenance_family(self):
        self.master_lcd(prefix="ST")
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        action = self.engine.next_action("L", self.course_id, now=now)
        self.assertEqual(action["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(action["target_id"], "MN-FRAC-LCD-2")
        repeated = self.engine.submit_attempt(
            operation_id="OP-ST-REP", attempt_id="A-ST-REP", learner_id="L", course_id=self.course_id,
            item_id="R-FRAC-LCD-1", response="LCD=60; 3/10=18/60; 5/12=25/60", submitted_at=now,
        )
        self.assertEqual(repeated["projection"]["stage"], "REVALIDATION_DUE")

    def test_fresh_fraction_maintenance_restores_current_retention(self):
        self.master_lcd(prefix="MN")
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        task = self.engine.maintenance_task("MN-FRAC-LCD-2")
        out = self.engine.submit_maintenance_attempt(
            operation_id="OP-MN", attempt_id="A-MN", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=now,
        )
        self.assertEqual(out["projection"]["stage"], "MASTERED")

    def test_fraction_tutor_abstains_when_cause_unknown(self):
        self.master_lcd(prefix="TA")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        out = tutor.process_turn(
            operation_id="OP-TA", turn_id="TA", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1", response="1/7",
            requested_help_level=3, now=5000,
        )
        self.assertEqual(out["diagnosis"]["status"], "ABSTAINED")
        self.assertIsNone(out["diagnosis"]["primary_cause"])
        self.assertEqual(out["teaching_move"]["support_level_after"], 1)
        self.assertTrue(out["teaching_move"]["overhelping_prevented"])

    def test_fraction_tutor_single_pattern_is_hypothesis(self):
        self.master_lcd(prefix="TH")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        out = tutor.process_turn(
            operation_id="OP-TH", turn_id="TH", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1", response="2/5",
            requested_help_level=0, now=5000,
        )
        self.assertEqual(out["diagnosis"]["primary_cause"], "ADDS_DENOMINATORS")
        self.assertEqual(out["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")

    def test_fraction_tutor_distinct_family_corroboration_supports_diagnosis(self):
        self.master_lcd(prefix="TC")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        tutor.process_turn(
            operation_id="OP-TC1", turn_id="TC1", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1", response="2/5", requested_help_level=0, now=5000,
        )
        out = tutor.process_turn(
            operation_id="OP-TC2", turn_id="TC2", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-2", response="3/7", requested_help_level=3, now=5001,
        )
        self.assertEqual(out["diagnosis"]["standing"], "EVIDENCE_SUPPORTED")
        self.assertEqual(out["teaching_move"]["move"], "TARGETED_REMEDIATION")
        self.assertLessEqual(out["teaching_move"]["support_level_after"], 2)
        self.assertTrue(out["teaching_move"]["overhelping_prevented"])

    def test_fraction_tutor_fades_then_routes_to_independent_mastery(self):
        self.master_lcd(prefix="TFD")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        tutor.process_turn(
            operation_id="OP-TFD1", turn_id="TFD1", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1", response="2/5", requested_help_level=2, now=5000,
        )
        out = tutor.process_turn(
            operation_id="OP-TFD2", turn_id="TFD2", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-2", response="11/12", requested_help_level=0, now=5001,
        )
        self.assertEqual(out["teaching_move"]["move"], "INDEPENDENT_RECHECK_PASSED")
        self.assertEqual(out["next_action"]["action_type"], "MASTERY_CHECK")
        self.assertEqual(out["next_action"]["target_id"], "M-FRAC-ADD-1")

    def test_fraction_tutor_cannot_help_during_mastery_or_transfer(self):
        self.master_lcd(prefix="TB")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        mastery = tutor.process_turn(
            operation_id="OP-TB-M", turn_id="TBM", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id=None, response="hint", requested_help_level=3, now=5000,
            active_assessment_item_id="M-FRAC-ADD-1",
        )
        self.assertEqual(mastery["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.retain_add_sub(prefix="TB", t0=5001)
        transfer = tutor.process_turn(
            operation_id="OP-TB-T", turn_id="TBT", session_id="S2", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id=None, response="hint", requested_help_level=3, now=9002,
            active_assessment_item_id="T-FRAC-TRANSFER-DISTANCE",
        )
        self.assertEqual(transfer["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.assertNotIn("31/24", transfer["teaching_move"]["content"])

    def test_generic_git_course_uses_same_engine_class(self):
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-G-CREATE", job_id="JOB-G-CREATE", goal_id="G-GIT2",
            title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME,
        )
        self.assertEqual(created["domain_key"], GIT_DOMAIN_KEY)
        out = self.engine.submit_attempt(
            operation_id="OP-G-M", attempt_id="A-G-M", learner_id="LG", course_id=created["course_id"],
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100,
        )
        self.assertTrue(out["attempt"]["correct"])

    def test_two_domains_coexist_in_one_repository_without_task_collision(self):
        git = self.engine.create_research_grounded_course_job(
            operation_id="OP-G2", job_id="JOB-G2", goal_id="G-GIT3", title="Git", desired_outcome=REAL_GIT_OUTCOME,
        )
        self.assertIsNotNone(self.repo.get_object("transfer_task", "T-GIT-TRANSFER-RELEASE", 1))
        self.assertIsNotNone(self.repo.get_object("transfer_task", "T-FRAC-TRANSFER-DISTANCE", 1))
        self.assertNotEqual(git["course_id"], self.course_id)

    def test_wrong_fraction_answer_key_is_caught_independently(self):
        base = default_domain_registry()
        frac = base.by_key(FRACTION_DOMAIN_KEY)
        git = base.by_key(GIT_DOMAIN_KEY)
        original_factory = frac.course_factory

        def bad_factory(**kwargs):
            course = original_factory(**kwargs)
            items = list(course.items)
            idx = next(i for i, x in enumerate(items) if x.item_id == "M-FRAC-ADD-1")
            items[idx] = replace(items[idx], answer="17/12")
            return replace(course, items=items)

        bad_frac = replace(frac, course_factory=bad_factory)
        bad_engine = DomainGeneralLearningEngine(self.repo, DomainRegistry([git, bad_frac]))
        with self.assertRaisesRegex(ValueError, "DOMAIN_BEHAVIOR_ORACLE_FAILED"):
            bad_engine.create_research_grounded_course_job(
                operation_id="OP-BK", job_id="JOB-BK", goal_id="G-BK", title="Bad key",
                desired_outcome=REAL_FRACTION_OUTCOME,
            )

    def test_wrong_fraction_worked_example_is_caught_by_behavior_oracle(self):
        base = default_domain_registry()
        frac = base.by_key(FRACTION_DOMAIN_KEY)
        git = base.by_key(GIT_DOMAIN_KEY)
        original_factory = frac.course_factory

        def bad_factory(**kwargs):
            course = original_factory(**kwargs)
            lessons = list(course.lessons)
            idx = next(i for i, x in enumerate(lessons) if x.lesson_id == "L-FRAC-ADD-SUB")
            lesson = lessons[idx]
            examples = list(lesson.worked_examples)
            examples[0] = "`1/2 + 1/3 = 4/6`."
            spans = copy.deepcopy(lesson.grounding_spans)
            spans[1]["text"] = examples[0]
            lessons[idx] = replace(lesson, worked_examples=examples, grounding_spans=spans)
            return replace(course, lessons=lessons)

        bad_frac = replace(frac, course_factory=bad_factory)
        bad_engine = DomainGeneralLearningEngine(self.repo, DomainRegistry([git, bad_frac]))
        with self.assertRaisesRegex(ValueError, "LESSON_BEHAVIOR_ORACLE_FAILED"):
            bad_engine.create_research_grounded_course_job(
                operation_id="OP-BE", job_id="JOB-BE", goal_id="G-BE", title="Bad example",
                desired_outcome=REAL_FRACTION_OUTCOME,
            )

    def test_domain_general_next_action_has_no_task_id_hardcodes(self):
        source = inspect.getsource(DomainGeneralLearningEngine.next_action)
        self.assertNotIn("MN-GIT", source)
        self.assertNotIn("T-GIT", source)
        self.assertNotIn("MN-FRAC", source)
        self.assertNotIn("T-FRAC", source)

    def test_fraction_course_build_recovers_after_research_checkpoint(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "recover.sqlite3")
            eng = DomainGeneralLearningEngine(Repository(path))
            kwargs = dict(operation_id="OP-R", job_id="JOB-R", goal_id="G-R", title="Fractions", desired_outcome=REAL_FRACTION_OUTCOME)
            with self.assertRaises(InjectedCrash):
                eng.create_research_grounded_course_job(**kwargs, crash_after_phase="RESEARCH_FROZEN")
            out = DomainGeneralLearningEngine(Repository(path)).create_research_grounded_course_job(**kwargs)
            replay = DomainGeneralLearningEngine(Repository(path)).create_research_grounded_course_job(**kwargs)
            self.assertEqual(out, replay)
            self.assertEqual(Repository(path).count_objects("course"), 1)

    def test_fraction_tutor_turn_recovers_idempotently(self):
        self.master_lcd(prefix="TR")
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        kwargs = dict(
            operation_id="OP-TR", turn_id="TR", session_id="S", learner_id="L", course_id=self.course_id,
            skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1", response="2/5", requested_help_level=2, now=5000,
        )
        with self.assertRaises(InjectedCrash):
            tutor.process_turn(**kwargs, crash_after_phase="OBSERVED")
        out = DomainGeneralTutorDirector(self.repo, self.engine).process_turn(**kwargs)
        replay = DomainGeneralTutorDirector(self.repo, self.engine).process_turn(**kwargs)
        self.assertEqual(out, replay)
        self.assertEqual(self.repo.count_tutor_turns("S"), 1)

    def test_multisession_director_is_domain_neutral(self):
        director = MultiSessionDirector(self.repo, self.engine)
        director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=self.course_id, started_at=0)
        out = director.plan_next(operation_id="OP-D", decision_id="D", session_id="S", learner_id="L", course_id=self.course_id, now=0)
        self.assertEqual(out["next_action"]["target_id"], "L-FRAC-EQUIV-LCD")
        self.assertEqual(out["next_action"]["action_type"], "LESSON")

    def test_transfer_and_maintenance_claim_refs_are_admitted(self):
        dossier = self.repo.get_object("research_dossier", "RSCH-FRACTIONS-UNLIKE-DENOMINATORS-001", 1)
        claims = {c["claim_id"] for c in dossier["claims"]}
        for task_id in ("T-FRAC-TRANSFER-DISTANCE", "T-FRAC-TRANSFER-TANK", "MN-FRAC-LCD-2", "MN-FRAC-ADD-2"):
            task = self.repo.get_object("transfer_task", task_id, 1) or self.repo.get_object("maintenance_task", task_id, 1)
            self.assertTrue(set(task["claim_refs"]).issubset(claims))


    def test_runtime_scoring_is_bound_to_course_domain_not_dispatcher_label(self):
        class LiarDispatcher:
            def score(self, item, response):
                return True
        self.engine.git_oracle = LiarDispatcher()
        out = self.engine.submit_attempt(
            operation_id="OP-DOMAIN-SCORE", attempt_id="A-DOMAIN-SCORE", learner_id="L", course_id=self.course_id,
            item_id="M-FRAC-ADD-1", response="8/10", submitted_at=100,
        )
        self.assertFalse(out["attempt"]["correct"])

    def test_cross_domain_task_id_collision_fails_closed(self):
        base = default_domain_registry()
        frac = base.by_key(FRACTION_DOMAIN_KEY)
        git = base.by_key(GIT_DOMAIN_KEY)
        colliding = copy.deepcopy(frac.maintenance_tasks)
        task = colliding.pop("MN-FRAC-LCD-2")
        task["item_id"] = "MN-GIT-STAGE-2"
        task["family_id"] = "F-COLLISION"
        colliding[task["item_id"]] = task
        bad_frac = replace(frac, maintenance_tasks=colliding)
        registry = DomainRegistry([git, bad_frac])
        with tempfile.TemporaryDirectory() as td:
            repo = Repository(os.path.join(td, "collision.sqlite3"))
            engine = DomainGeneralLearningEngine(repo, registry)
            engine.create_research_grounded_course_job(
                operation_id="OP-CG", job_id="JOB-CG", goal_id="G-CG", title="Git", desired_outcome=REAL_GIT_OUTCOME,
            )
            with self.assertRaisesRegex(ValueError, "DOMAIN_TASK_ID_COLLISION"):
                engine.create_research_grounded_course_job(
                    operation_id="OP-CF", job_id="JOB-CF", goal_id="G-CF", title="Fractions", desired_outcome=REAL_FRACTION_OUTCOME,
                )

    def test_unsupported_third_goal_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_REAL_GOAL"):
            self.engine.create_research_grounded_course_job(
                operation_id="OP-U", job_id="JOB-U", goal_id="G-U", title="Unknown",
                desired_outcome="Teach me everything about astronomy",
            )


if __name__ == "__main__":
    unittest.main()
