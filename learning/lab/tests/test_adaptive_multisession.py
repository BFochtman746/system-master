import os
import tempfile
import unittest

from learning_lab import AdaptiveLearningEngine, MultiSessionDirector, REAL_GIT_OUTCOME, Repository


class AdaptiveMultiSessionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "lab.sqlite3"))
        self.engine = AdaptiveLearningEngine(self.repo)
        self.created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT",
            title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME,
        )
        self.course_id = self.created["course_id"]
        self.director = MultiSessionDirector(self.repo, self.engine)

    def tearDown(self):
        self.td.cleanup()

    def stage_mastered(self, learner="L", t0=100):
        self.engine.submit_attempt(
            operation_id=f"OP-{learner}-SM", attempt_id=f"A-{learner}-SM", learner_id=learner,
            course_id=self.course_id, item_id="M-GIT-STAGE-1",
            response="git add app.txt; git commit -m 'Feature work'", submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{learner}-SR", attempt_id=f"A-{learner}-SR", learner_id=learner,
            course_id=self.course_id, item_id="R-GIT-STAGE-1",
            response="git add later.txt; git commit -m 'Later work'", submitted_at=t0 + 3900,
        )

    def branch_retained(self, learner="L", t0=5000):
        self.engine.submit_attempt(
            operation_id=f"OP-{learner}-BM", attempt_id=f"A-{learner}-BM", learner_id=learner,
            course_id=self.course_id, item_id="M-GIT-BRANCH-1",
            response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic",
            submitted_at=t0,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-{learner}-BR", attempt_id=f"A-{learner}-BR", learner_id=learner,
            course_id=self.course_id, item_id="R-GIT-BRANCH-1",
            response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix",
            submitted_at=t0 + 4000,
        )

    def full_retained(self, learner="L"):
        self.stage_mastered(learner)
        return self.branch_retained(learner)

    def test_retention_only_does_not_masquerade_as_transfer(self):
        out = self.full_retained()
        self.assertEqual(out["projection"]["stage"], "RETAINED")
        self.assertEqual(out["projection"]["gate_states"]["TRANSFER"], "IN_PROGRESS")
        action = self.engine.next_action("L", self.course_id, now=9000)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")
        self.assertEqual(action["target_id"], "T-GIT-TRANSFER-RELEASE")

    def test_novel_transfer_task_executes_and_reaches_mastery(self):
        self.full_retained()
        task = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        out = self.engine.submit_transfer_attempt(
            operation_id="OP-T", attempt_id="A-T", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=9100,
        )
        self.assertTrue(out["attempt"]["correct"])
        self.assertTrue(out["task_novelty"]["base_branch_changed"])
        self.assertEqual(out["projection"]["stage"], "MASTERED")
        self.assertEqual(out["projection"]["gate_states"]["TRANSFER"], "SATISFIED")
        self.assertEqual(self.engine.next_action("L", self.course_id, now=9100)["action_type"], "COURSE_COMPLETE")

    def test_assisted_transfer_cannot_satisfy_transfer_gate(self):
        self.full_retained()
        task = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        out = self.engine.submit_transfer_attempt(
            operation_id="OP-TA", attempt_id="A-TA", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=9100, assisted=True,
        )
        self.assertEqual(out["projection"]["stage"], "RETAINED")
        self.assertIn("A-TA", out["projection"]["excluded_attempts"])
        action = self.engine.next_action("L", self.course_id, now=9100)
        self.assertEqual(action["target_id"], "T-GIT-TRANSFER-INTEGRATION")

    def test_transfer_before_current_retention_is_rejected(self):
        self.stage_mastered()
        self.engine.submit_attempt(
            operation_id="OP-BM", attempt_id="A-BM", learner_id="L", course_id=self.course_id,
            item_id="M-GIT-BRANCH-1",
            response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic",
            submitted_at=5000,
        )
        task = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        with self.assertRaisesRegex(ValueError, "TRANSFER_NOT_ELIGIBLE"):
            self.engine.submit_transfer_attempt(
                operation_id="OP-EARLY-T", attempt_id="A-EARLY-T", learner_id="L", course_id=self.course_id,
                task_id=task["item_id"], response=task["answer"], submitted_at=5100,
            )

    def test_failed_transfer_family_cannot_be_reused_to_manufacture_success(self):
        self.full_retained()
        task = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        self.engine.submit_transfer_attempt(
            operation_id="OP-TF", attempt_id="A-TF", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response="git merge urgent", submitted_at=9100,
        )
        out = self.engine.submit_transfer_attempt(
            operation_id="OP-TF2", attempt_id="A-TF2", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=9200,
        )
        self.assertEqual(out["projection"]["stage"], "RETAINED")
        self.assertEqual(out["projection"]["excluded_attempts"].get("A-TF2"), "EXPOSED_TRANSFER_FAMILY_CANNOT_QUALIFY_AFTER_FAILURE")
        self.assertEqual(self.engine.next_action("L", self.course_id, now=9200)["target_id"], "T-GIT-TRANSFER-INTEGRATION")

    def test_stale_retention_regresses_current_state_and_selects_maintenance(self):
        self.stage_mastered()
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        proj = self.engine.current_projection("L", self.course_id, "S-GIT-STAGE-COMMIT", now=now)
        self.assertEqual(proj["stage"], "REVALIDATION_DUE")
        self.assertEqual(proj["gate_states"]["RETENTION"], "STALE")
        action = self.engine.next_action("L", self.course_id, now=now)
        self.assertEqual(action["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(action["target_id"], "MN-GIT-STAGE-2")

    def test_repeating_same_stale_retention_family_does_not_refresh(self):
        self.stage_mastered()
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        out = self.engine.submit_attempt(
            operation_id="OP-REPEAT-R", attempt_id="A-REPEAT-R", learner_id="L", course_id=self.course_id,
            item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=now,
        )
        self.assertEqual(out["projection"]["stage"], "REVALIDATION_DUE")
        self.assertEqual(out["projection"]["excluded_attempts"].get("A-REPEAT-R"), "REPEATED_RETENTION_FAMILY_NOT_FRESH")

    def test_fresh_maintenance_family_restores_retention(self):
        self.stage_mastered()
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        task = self.engine.maintenance_task("MN-GIT-STAGE-2")
        out = self.engine.submit_maintenance_attempt(
            operation_id="OP-MN", attempt_id="A-MN", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=now,
        )
        self.assertTrue(out["fresh_family"])
        self.assertEqual(out["projection"]["stage"], "MASTERED")
        self.assertEqual(out["projection"]["gate_states"]["RETENTION"], "SATISFIED")

    def test_after_branch_revalidation_old_transfer_no_longer_counts(self):
        self.full_retained()
        t1 = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        self.engine.submit_transfer_attempt(
            operation_id="OP-T1", attempt_id="A-T1", learner_id="L", course_id=self.course_id,
            task_id=t1["item_id"], response=t1["answer"], submitted_at=9100,
        )
        now = 9100 + self.engine.RETENTION_FRESHNESS_SECONDS + 100
        # Stage retention is stale first; refresh it with the fresh maintenance family.
        sm = self.engine.maintenance_task("MN-GIT-STAGE-2")
        self.engine.submit_maintenance_attempt(
            operation_id="OP-SMN", attempt_id="A-SMN", learner_id="L", course_id=self.course_id,
            task_id=sm["item_id"], response=sm["answer"], submitted_at=now,
        )
        # Branch retention is stale too; refresh it.
        bm = self.engine.maintenance_task("MN-GIT-BRANCH-2")
        out = self.engine.submit_maintenance_attempt(
            operation_id="OP-BMN", attempt_id="A-BMN", learner_id="L", course_id=self.course_id,
            task_id=bm["item_id"], response=bm["answer"], submitted_at=now + 10,
        )
        self.assertEqual(out["projection"]["stage"], "RETAINED")
        self.assertEqual(out["projection"]["gate_states"]["TRANSFER"], "IN_PROGRESS")
        action = self.engine.next_action("L", self.course_id, now=now + 10)
        self.assertEqual(action["action_type"], "TRANSFER_CHECK")
        self.assertEqual(action["target_id"], "T-GIT-TRANSFER-INTEGRATION")

    def test_second_fresh_transfer_after_revalidation_restores_course_complete(self):
        self.full_retained()
        t1 = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        self.engine.submit_transfer_attempt(operation_id="OP-T1", attempt_id="A-T1", learner_id="L", course_id=self.course_id, task_id=t1["item_id"], response=t1["answer"], submitted_at=9100)
        now = 9100 + self.engine.RETENTION_FRESHNESS_SECONDS + 100
        sm = self.engine.maintenance_task("MN-GIT-STAGE-2")
        self.engine.submit_maintenance_attempt(operation_id="OP-SMN", attempt_id="A-SMN", learner_id="L", course_id=self.course_id, task_id=sm["item_id"], response=sm["answer"], submitted_at=now)
        bm = self.engine.maintenance_task("MN-GIT-BRANCH-2")
        self.engine.submit_maintenance_attempt(operation_id="OP-BMN", attempt_id="A-BMN", learner_id="L", course_id=self.course_id, task_id=bm["item_id"], response=bm["answer"], submitted_at=now + 10)
        t2 = self.engine.transfer_task("T-GIT-TRANSFER-INTEGRATION")
        out = self.engine.submit_transfer_attempt(operation_id="OP-T2", attempt_id="A-T2", learner_id="L", course_id=self.course_id, task_id=t2["item_id"], response=t2["answer"], submitted_at=now + 20)
        self.assertEqual(out["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action("L", self.course_id, now=now + 20)["action_type"], "COURSE_COMPLETE")

    def test_multi_session_director_reads_durable_cross_session_evidence(self):
        self.director.start_session(operation_id="OP-S1", session_id="S1", learner_id="L", course_id=self.course_id, started_at=0)
        d1 = self.director.plan_next(operation_id="OP-D1", decision_id="D1", session_id="S1", learner_id="L", course_id=self.course_id, now=0)
        self.assertEqual(d1["next_action"]["action_type"], "LESSON")
        self.director.complete_session(operation_id="OP-S1-END", session_id="S1", ended_at=10)
        self.stage_mastered()
        self.director.start_session(operation_id="OP-S2", session_id="S2", learner_id="L", course_id=self.course_id, started_at=4100)
        d2 = self.director.plan_next(operation_id="OP-D2", decision_id="D2", session_id="S2", learner_id="L", course_id=self.course_id, now=4100)
        self.assertEqual(d2["session_count"], 2)
        self.assertEqual(d2["next_action"]["skill_id"], "S-GIT-BRANCH-MERGE")
        self.assertEqual(d2["next_action"]["action_type"], "LESSON")

    def test_director_requires_active_session(self):
        with self.assertRaisesRegex(ValueError, "LEARNING_SESSION_REQUIRED"):
            self.director.plan_next(operation_id="OP-D", decision_id="D", session_id="NOPE", learner_id="L", course_id=self.course_id, now=0)
        self.director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=self.course_id, started_at=0)
        self.director.complete_session(operation_id="OP-E", session_id="S", ended_at=1)
        with self.assertRaisesRegex(ValueError, "LEARNING_SESSION_NOT_ACTIVE"):
            self.director.plan_next(operation_id="OP-D2", decision_id="D2", session_id="S", learner_id="L", course_id=self.course_id, now=2)

    def test_tutor_help_is_blocked_during_transfer_check(self):
        from learning_lab import TutorDirector
        self.full_retained()
        tutor = TutorDirector(self.repo, self.engine)
        out = tutor.process_turn(
            operation_id="OP-TUTOR-TRANSFER", turn_id="TT", session_id="TS", learner_id="L",
            course_id=self.course_id, skill_id="S-GIT-BRANCH-MERGE", probe_id=None,
            response="give me the first command", requested_help_level=3, now=9100,
            active_assessment_item_id="T-GIT-TRANSFER-RELEASE",
        )
        self.assertEqual(out["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.assertEqual(out["next_action"]["action_type"], "TRANSFER_CHECK")
        self.assertEqual(out["teaching_move"]["support_level_after"], 0)
        self.assertNotIn("git switch -c urgent", out["teaching_move"]["content"].lower())

    def test_tutor_cannot_bypass_stale_prerequisite(self):
        from learning_lab import TutorDirector
        self.stage_mastered()
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        tutor = TutorDirector(self.repo, self.engine)
        out = tutor.process_turn(
            operation_id="OP-TUTOR-STALE", turn_id="TSTALE", session_id="TS2", learner_id="L",
            course_id=self.course_id, skill_id="S-GIT-BRANCH-MERGE", probe_id="TP-BRANCH-1",
            response="git switch -c hotfix", requested_help_level=0, now=now,
        )
        self.assertEqual(out["teaching_move"]["move"], "PREREQUISITE_BLOCKED")
        self.assertIn("S-GIT-STAGE-COMMIT", out["missing_prerequisite_skill_ids"])
        self.assertEqual(out["next_action"]["action_type"], "MAINTENANCE_RECHECK")

    def test_assisted_maintenance_does_not_refresh_stale_retention(self):
        self.stage_mastered()
        now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        task = self.engine.maintenance_task("MN-GIT-STAGE-2")
        out = self.engine.submit_maintenance_attempt(
            operation_id="OP-AMN", attempt_id="A-AMN", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=now, assisted=True,
        )
        self.assertEqual(out["projection"]["stage"], "REVALIDATION_DUE")
        self.assertEqual(out["projection"]["excluded_attempts"].get("A-AMN"), "ASSISTANCE_BREAKS_INDEPENDENCE")

    def test_transfer_task_claims_are_grounded_in_frozen_dossier(self):
        course = self.engine.course(self.course_id)
        dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1)
        admitted = {c["claim_id"] for c in dossier["claims"]}
        for tid in ("T-GIT-TRANSFER-RELEASE", "T-GIT-TRANSFER-INTEGRATION"):
            task = self.engine.transfer_task(tid)
            self.assertTrue(set(task["claim_refs"]).issubset(admitted))
            self.assertTrue(task["novelty"]["base_branch_changed"])

    def test_director_waits_until_retention_delay_instead_of_inviting_early_check(self):
        self.engine.submit_attempt(
            operation_id="OP-WM", attempt_id="A-WM", learner_id="L", course_id=self.course_id,
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100,
        )
        action = self.engine.next_action("L", self.course_id, now=200)
        self.assertEqual(action["action_type"], "RETENTION_WAIT")
        self.assertEqual(action["earliest_due_at"], 100 + self.engine.RETENTION_DELAY_SECONDS)

    def test_course_complete_is_revoked_as_current_claim_when_retention_goes_stale(self):
        self.full_retained()
        t1 = self.engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        self.engine.submit_transfer_attempt(
            operation_id="OP-TC", attempt_id="A-TC", learner_id="L", course_id=self.course_id,
            task_id=t1["item_id"], response=t1["answer"], submitted_at=9100,
        )
        self.assertEqual(self.engine.next_action("L", self.course_id, now=9100)["action_type"], "COURSE_COMPLETE")
        stale_now = 9100 + self.engine.RETENTION_FRESHNESS_SECONDS + 100
        action = self.engine.next_action("L", self.course_id, now=stale_now)
        self.assertEqual(action["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(action["skill_id"], "S-GIT-STAGE-COMMIT")


if __name__ == "__main__":
    unittest.main()
