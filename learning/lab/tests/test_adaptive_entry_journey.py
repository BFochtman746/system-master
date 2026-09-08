import os
import tempfile
import unittest

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    AdaptiveLearningEngine,
    BaselineDiagnosticDirector,
    InjectedCrash,
    MultiSessionDirector,
    REAL_GIT_OUTCOME,
    Repository,
    TutorDirector,
)


class AdaptiveEntryJourneyTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "lab.sqlite3"))
        self.engine = AdaptiveLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE",
            job_id="JOB-CREATE",
            goal_id="G-GIT",
            title="Git feature branch workflow",
            desired_outcome=REAL_GIT_OUTCOME,
        )
        self.course_id = created["course_id"]
        self.diagnostic = BaselineDiagnosticDirector(self.repo, scorer=self.engine.git_oracle.score)
        self.tutor = TutorDirector(self.repo, self.engine)
        self.sessions = MultiSessionDirector(self.repo, self.engine)
        self.journey = AdaptiveEntryJourneyDirector(
            self.repo, self.engine, self.diagnostic, self.tutor, self.sessions
        )
        self.journey.start_journey(
            operation_id="OP-JOURNEY",
            journey_id="J1",
            diagnostic_id="D1",
            learner_id="L",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-BRANCH-MERGE"],
            started_at=0,
        )
        self.sessions.start_session(
            operation_id="OP-S1",
            session_id="S1",
            learner_id="L",
            course_id=self.course_id,
            started_at=0,
        )

    def tearDown(self):
        self.td.cleanup()

    def plan(self, operation_id, decision_id, session_id="S1", now=0, **kwargs):
        return self.journey.plan_next(
            operation_id=operation_id,
            decision_id=decision_id,
            journey_id="J1",
            session_id=session_id,
            now=now,
            **kwargs,
        )

    def record_probe(self, operation_id, probe_id, item_id, response, submitted_at):
        return self.journey.record_diagnostic_probe(
            journey_id="J1",
            now=submitted_at,
            operation_id=operation_id,
            probe_id=probe_id,
            diagnostic_id="D1",
            item_id=item_id,
            response=response,
            submitted_at=submitted_at,
        )

    def close_stage_skill(self, mastery_at=120, retention_at=4000):
        self.engine.submit_attempt(
            operation_id=f"OP-ST-M-{mastery_at}", attempt_id=f"A-ST-M-{mastery_at}",
            learner_id="L", course_id=self.course_id, item_id="M-GIT-STAGE-1",
            response="git add app.txt; git commit -m 'Feature work'", submitted_at=mastery_at,
        )
        return self.engine.submit_attempt(
            operation_id=f"OP-ST-R-{retention_at}", attempt_id=f"A-ST-R-{retention_at}",
            learner_id="L", course_id=self.course_id, item_id="R-GIT-STAGE-1",
            response="git add later.txt; git commit -m 'Later work'", submitted_at=retention_at,
        )

    def test_gap_routes_to_tutor_then_returns_to_claimed_skill_across_sessions(self):
        first = self.plan("OP-D1", "DEC-1", now=10)
        self.assertEqual(first["next_action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(first["next_action"]["skill_id"], "S-GIT-STAGE-COMMIT")
        self.assertEqual(first["next_action"]["target_id"], "P-GIT-STAGE-1")

        self.record_probe("OP-P1", "DP1", "P-GIT-STAGE-1", "git status", 20)
        remediation = self.plan("OP-D2", "DEC-2", now=21)
        self.assertEqual(remediation["next_action"]["action_type"], "TUTOR_REMEDIATION")
        self.assertEqual(remediation["next_action"]["target_id"], "L-GIT-STAGE-COMMIT")
        self.assertEqual(remediation["selected_authority"], "BASELINE_DIAGNOSTIC_ROUTING")

        tutor_turn = self.journey.process_tutor_turn(
            journey_id="J1", session_id="S1", operation_id="OP-T1", turn_id="T1",
            probe_id="TP-STAGE-1", response="git commit -m 'oops'",
            requested_help_level=0, now=22,
        )
        self.assertEqual(tutor_turn["probe_id"], "TP-STAGE-1")
        self.assertEqual(self.repo.count_attempts(), 0)

        self.engine.submit_attempt(
            operation_id="OP-PRACTICE", attempt_id="A-PRACTICE", learner_id="L",
            course_id=self.course_id, item_id="P-GIT-STAGE-2", response="git status", submitted_at=100,
        )
        self.close_stage_skill()

        self.sessions.complete_session(operation_id="OP-S1-END", session_id="S1", ended_at=4050)
        self.sessions.start_session(
            operation_id="OP-S2", session_id="S2", learner_id="L",
            course_id=self.course_id, started_at=4100,
        )
        returned = self.plan("OP-D3", "DEC-3", session_id="S2", now=4100)
        self.assertEqual(returned["session_count"], 2)
        self.assertEqual(returned["next_action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(returned["next_action"]["skill_id"], "S-GIT-BRANCH-MERGE")
        self.assertEqual(returned["next_action"]["target_id"], "P-GIT-BRANCH-1")

    def test_skip_ahead_stops_at_independent_verification_and_retention(self):
        self.record_probe("OP-P1", "DP1", "P-GIT-STAGE-1", "git add notes.txt", 10)
        verify = self.plan("OP-D1", "DEC-1", now=11)
        self.assertEqual(verify["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(verify["next_action"]["target_id"], "M-GIT-STAGE-1")
        self.assertEqual(self.repo.count_attempts(), 0)

        self.engine.submit_attempt(
            operation_id="OP-M", attempt_id="A-M", learner_id="L", course_id=self.course_id,
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'",
            submitted_at=120,
        )
        after_mastery = self.plan("OP-D2", "DEC-2", now=121)
        self.assertIn(after_mastery["next_action"]["action_type"], {"RETENTION_WAIT", "RETENTION_CHECK"})
        self.assertEqual(after_mastery["next_action"]["skill_id"], "S-GIT-STAGE-COMMIT")
        self.assertNotEqual(after_mastery["next_action"]["action_type"], "DIAGNOSTIC_PROBE")

    def test_stale_prerequisite_overrides_downstream_diagnostic_skip(self):
        self.record_probe("OP-P1", "DP1", "P-GIT-STAGE-1", "git add notes.txt", 10)
        self.close_stage_skill()
        downstream = self.plan("OP-D1", "DEC-1", now=4100)
        self.assertEqual(downstream["next_action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(downstream["next_action"]["skill_id"], "S-GIT-BRANCH-MERGE")

        stale_now = 4000 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        stale = self.plan("OP-D2", "DEC-2", now=stale_now)
        self.assertEqual(stale["next_action"]["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(stale["next_action"]["skill_id"], "S-GIT-STAGE-COMMIT")
        self.assertEqual(stale["selected_authority"], "LEARNING_ENGINE_CURRENT_EVIDENCE")
        self.assertEqual(stale["diagnostic_action"]["action_type"], "DIAGNOSTIC_PROBE")

    def test_entry_continues_through_transfer_to_course_complete(self):
        self.record_probe("OP-P1", "DP1", "P-GIT-STAGE-1", "git add notes.txt", 10)
        self.close_stage_skill()

        self.record_probe("OP-P2", "DP2", "P-GIT-BRANCH-1", "git switch -c feature", 4100)
        verify = self.plan("OP-D1", "DEC-1", now=4101)
        self.assertEqual(verify["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(verify["next_action"]["target_id"], "M-GIT-BRANCH-1")

        self.engine.submit_attempt(
            operation_id="OP-BM", attempt_id="A-BM", learner_id="L", course_id=self.course_id,
            item_id="M-GIT-BRANCH-1",
            response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic",
            submitted_at=5000,
        )
        self.engine.submit_attempt(
            operation_id="OP-BR", attempt_id="A-BR", learner_id="L", course_id=self.course_id,
            item_id="R-GIT-BRANCH-1",
            response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix",
            submitted_at=9000,
        )

        transfer = self.plan("OP-D2", "DEC-2", now=9000)
        self.assertEqual(transfer["state"], "RUNTIME_CONTINUATION")
        self.assertEqual(transfer["next_action"]["action_type"], "TRANSFER_CHECK")
        task = self.engine.transfer_task(transfer["next_action"]["target_id"])
        self.engine.submit_transfer_attempt(
            operation_id="OP-T", attempt_id="A-T", learner_id="L", course_id=self.course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=9100,
        )
        complete = self.plan("OP-D3", "DEC-3", now=9100)
        self.assertEqual(complete["next_action"]["action_type"], "COURSE_COMPLETE")

    def test_decision_replay_after_crash_is_stable_and_cannot_be_reordered(self):
        with self.assertRaises(InjectedCrash):
            self.plan(
                "OP-CRASH", "DEC-CRASH", now=10,
                crash_after_phase="DECISION_STORED_BEFORE_RETURN",
            )
        recovered = self.plan("OP-CRASH", "DEC-CRASH", now=10)
        replayed = self.plan("OP-CRASH", "DEC-CRASH", now=10)
        self.assertEqual(recovered, replayed)
        stored = self.repo.get_object("adaptive_entry_decision", "DEC-CRASH", 1)
        self.assertEqual(stored["result"], recovered)
        with self.assertRaisesRegex(ValueError, "ADAPTIVE_ENTRY_DECISION_ID_REUSE"):
            self.plan("OP-OTHER", "DEC-CRASH", now=11)

    def test_journey_start_recovers_after_durable_store_without_duplicate_diagnostic(self):
        with self.assertRaises(InjectedCrash):
            self.journey.start_journey(
                operation_id="OP-J2", journey_id="J2", diagnostic_id="D2", learner_id="L2",
                course_id=self.course_id, claimed_skill_ids=[], started_at=1,
                crash_after_phase="JOURNEY_STORED",
            )
        recovered = self.journey.start_journey(
            operation_id="OP-J2", journey_id="J2", diagnostic_id="D2", learner_id="L2",
            course_id=self.course_id, claimed_skill_ids=[], started_at=1,
        )
        self.assertEqual(recovered["journey_id"], "J2")
        self.assertIsNotNone(self.repo.get_object("baseline_diagnostic", "D2", 1))
        self.assertIsNotNone(self.repo.get_object("adaptive_entry_journey", "J2", 1))


if __name__ == "__main__":
    unittest.main()
