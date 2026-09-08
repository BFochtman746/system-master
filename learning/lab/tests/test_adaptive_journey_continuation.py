from __future__ import annotations

import json
import os
import tempfile
import unittest

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    BaselineDiagnosticDirector,
    DomainGeneralLearningEngine,
    DomainGeneralTutorDirector,
    GIT_DOMAIN_KEY,
    MultiSessionDirector,
    Repository,
    default_domain_registry,
)
from learning_lab.adaptive_journey_continuation import (
    AdaptiveJourneyContinuationError,
    submit_current_evidence_and_continue,
)


class AdaptiveJourneyContinuationTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.registry = default_domain_registry()
        self.spec = self.registry.by_key(GIT_DOMAIN_KEY)
        self.engine = DomainGeneralLearningEngine(self.repo, registry=self.registry)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-027",
            job_id="JOB-CREATE-027",
            goal_id="G-IMPL027-GIT",
            title=self.spec.desired_outcome,
            desired_outcome=self.spec.desired_outcome,
        )
        self.course_id = created["course_id"]
        self.diagnostic = BaselineDiagnosticDirector(self.repo, scorer=self.spec.behavior_oracle.score)
        self.sessions = MultiSessionDirector(self.repo, self.engine)
        self.tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        self.journey = AdaptiveEntryJourneyDirector(
            self.repo, self.engine, self.diagnostic, self.tutor, self.sessions
        )
        self.journey.start_journey(
            operation_id="OP-JOURNEY-027",
            journey_id="J-027",
            diagnostic_id="D-027",
            learner_id="L-027",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        self.sessions.start_session(
            operation_id="OP-SESSION-027",
            session_id="S-027",
            learner_id="L-027",
            course_id=self.course_id,
            started_at=0,
        )

    def tearDown(self):
        self.td.cleanup()

    def submit(self, interaction_id, response, submitted_at, **kwargs):
        return submit_current_evidence_and_continue(
            repo=self.repo,
            operation_id=f"OP-{interaction_id}",
            interaction_id=interaction_id,
            journey_id="J-027",
            session_id="S-027",
            learner_id=kwargs.pop("learner_id", "L-027"),
            course_id=kwargs.pop("course_id", self.course_id),
            response=response,
            submitted_at=submitted_at,
            **kwargs,
        )

    def test_diagnostic_probe_is_routing_only_then_independent_verification(self):
        result = self.submit("I-DIAG", "git add notes.txt", 10)
        self.assertEqual(result["before_action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(result["before_action"]["target_id"], "P-GIT-STAGE-1")
        self.assertEqual(result["evidence"]["evidence_kind"], "DIAGNOSTIC_ROUTING_ONLY")
        self.assertTrue(result["evidence"]["routing_only"])
        self.assertFalse(result["evidence"]["qualifies_mastery"])
        self.assertEqual(self.repo.count_attempts(), 0)
        self.assertEqual(result["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(result["next_action"]["target_id"], "M-GIT-STAGE-1")
        self.assertFalse(result["response_echoed"])
        self.assertNotIn("git add notes.txt", json.dumps(result, sort_keys=True))

    def test_mastery_evidence_uses_engine_then_routes_to_retention_wait(self):
        self.submit("I-DIAG", "git add notes.txt", 10)
        response = 'git add app.txt; git commit -m "Feature work"'
        result = self.submit("I-MASTERY", response, 120)
        self.assertEqual(result["before_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(result["evidence"]["evidence_kind"], "MASTERY_CHECK")
        self.assertTrue(result["evidence"]["correct"])
        self.assertEqual(self.repo.count_attempts(), 1)
        self.assertIn(result["next_action"]["action_type"], {"RETENTION_WAIT", "RETENTION_CHECK"})
        self.assertNotIn(response, json.dumps(result, sort_keys=True))

    def test_retention_evidence_advances_after_real_delay(self):
        self.submit("I-DIAG", "git add notes.txt", 10)
        self.submit("I-MASTERY", 'git add app.txt; git commit -m "Feature work"', 120)
        result = self.submit(
            "I-RETENTION",
            'git add later.txt; git commit -m "Later work"',
            4000,
        )
        self.assertEqual(result["before_action"]["action_type"], "RETENTION_CHECK")
        self.assertEqual(result["evidence"]["evidence_kind"], "RETENTION_CHECK")
        self.assertTrue(result["evidence"]["correct"])
        self.assertEqual(self.repo.count_attempts(), 2)
        self.assertNotIn(result["next_action"]["action_type"], {"RETENTION_WAIT", "RETENTION_CHECK"})

    def test_exact_interaction_replay_is_stable_and_does_not_duplicate_evidence(self):
        first = self.submit("I-REPLAY", "git add notes.txt", 10)
        attempts_before = self.repo.count_attempts()
        second = self.submit("I-REPLAY", "git add notes.txt", 10)
        self.assertEqual(first, second)
        self.assertEqual(attempts_before, self.repo.count_attempts())
        probes = self.repo.get_object("diagnostic_probe", "PROBE-I-REPLAY", 1)
        self.assertIsNotNone(probes)

    def test_answer_reveal_is_rejected_for_independent_mastery(self):
        self.submit("I-DIAG", "git add notes.txt", 10)
        with self.assertRaisesRegex(ValueError, "IntegrityPolicyViolation"):
            self.submit(
                "I-REVEAL",
                'git add app.txt; git commit -m "Feature work"',
                120,
                answer_revealed_before_commit=True,
            )
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_wrong_learner_scope_fails_before_evidence_write(self):
        with self.assertRaisesRegex(AdaptiveJourneyContinuationError, "JOURNEY_SCOPE_MISMATCH"):
            self.submit("I-SCOPE", "git add notes.txt", 10, learner_id="OTHER")
        self.assertEqual(self.repo.count_attempts(), 0)
        self.assertIsNone(self.repo.get_object("diagnostic_probe", "PROBE-I-SCOPE", 1))

    def test_tutor_action_requires_tutor_interaction_instead_of_becoming_mastery(self):
        first = self.submit("I-WRONG", "git status", 10)
        self.assertEqual(first["next_action"]["action_type"], "TUTOR_REMEDIATION")
        with self.assertRaisesRegex(
            AdaptiveJourneyContinuationError,
            "CURRENT_ACTION_REQUIRES_TUTOR_INTERACTION:TUTOR_REMEDIATION",
        ):
            self.submit("I-NOT-TUTOR", "please help", 11)
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_retention_wait_refuses_early_evidence(self):
        self.submit("I-DIAG", "git add notes.txt", 10)
        self.submit("I-MASTERY", 'git add app.txt; git commit -m "Feature work"', 120)
        with self.assertRaisesRegex(
            AdaptiveJourneyContinuationError,
            "CURRENT_ACTION_DOES_NOT_ACCEPT_EVIDENCE:RETENTION_WAIT",
        ):
            self.submit("I-EARLY", 'git add later.txt; git commit -m "Later work"', 121)
        self.assertEqual(self.repo.count_attempts(), 1)


if __name__ == "__main__":
    unittest.main()
