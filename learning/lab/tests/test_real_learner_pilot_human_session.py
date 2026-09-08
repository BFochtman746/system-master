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
from learning_lab.real_learner_pilot_human_session import (
    HUMAN_RESPONSE_SOURCE,
    HUMAN_TURN_ATTESTATION_KIND,
    RealLearnerPilotHumanSessionError,
    prepare_human_pilot_turn,
    stage_one_status,
    submit_human_pilot_turn,
)
from learning_lab.real_learner_pilot_runtime_binding import start_runtime_bound_pilot
from learning_lab.unified_turn_controller import TURN_SUBMISSION_KIND


class RealLearnerPilotHumanSessionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        registry = default_domain_registry()
        spec = registry.by_key(GIT_DOMAIN_KEY)
        self.engine = DomainGeneralLearningEngine(self.repo, registry=registry)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-HUMAN-PILOT",
            job_id="JOB-CREATE-HUMAN-PILOT",
            goal_id="G-HUMAN-PILOT",
            title=spec.desired_outcome,
            desired_outcome=spec.desired_outcome,
        )
        self.course_id = created["course_id"]
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=spec.behavior_oracle.score)
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        sessions = MultiSessionDirector(self.repo, self.engine)
        journey = AdaptiveEntryJourneyDirector(self.repo, self.engine, diagnostic, tutor, sessions)
        journey.start_journey(
            operation_id="OP-J-HUMAN-PILOT",
            journey_id="J-HUMAN-PILOT",
            diagnostic_id="D-HUMAN-PILOT",
            learner_id="L-HUMAN-PILOT",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        sessions.start_session(
            operation_id="OP-S-HUMAN-PILOT",
            session_id="S-HUMAN-PILOT",
            learner_id="L-HUMAN-PILOT",
            course_id=self.course_id,
            started_at=0,
        )
        start_runtime_bound_pilot(
            repo=self.repo,
            operation_id="OP-START-HUMAN-PILOT",
            pilot_id="PILOT-HUMAN-0001",
            participant_key="LRN-HUMAN-0001",
            journey_id="J-HUMAN-PILOT",
            session_id="S-HUMAN-PILOT",
            learner_id="L-HUMAN-PILOT",
            course_id=self.course_id,
            started_at=0,
            consented_at=1,
            consent_recorded=True,
        )

    def tearDown(self):
        self.td.cleanup()

    def prepare(self, turn_id: str, now: int):
        return prepare_human_pilot_turn(
            repo=self.repo,
            operation_id=f"OP-PREP-{turn_id}",
            pilot_id="PILOT-HUMAN-0001",
            turn_id=turn_id,
            now=now,
        )

    def submit(self, turn, response: str, now: int, **overrides):
        args = {
            "repo": self.repo,
            "operation_id": f"OP-SUBMIT-{turn['turn_id']}",
            "pilot_id": "PILOT-HUMAN-0001",
            "turn_id": turn["turn_id"],
            "turn_binding_digest": turn["turn_binding_digest"],
            "response": response,
            "submitted_at": now,
            "response_source": HUMAN_RESPONSE_SOURCE,
            "participant_present": True,
            "response_was_actually_provided_by_participant": True,
            "assistance_used": False,
            "answer_revealed_before_commit": False,
        }
        args.update(overrides)
        return submit_human_pilot_turn(**args)

    def test_human_baseline_submission_is_digest_only_and_captured(self):
        raw = "git add notes.txt"
        turn = self.prepare("TURN-HUMAN-DIAG", 10)
        self.assertEqual(turn["action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertTrue(turn["answer_withheld"])
        result = self.submit(turn, raw, 10)
        self.assertTrue(result["human_source_attested"])
        self.assertFalse(result["response_echoed"])
        attestation = self.repo.get_object(HUMAN_TURN_ATTESTATION_KIND, turn["turn_id"], 1)
        self.assertIsNotNone(attestation)
        rendered = json.dumps(attestation, sort_keys=True)
        self.assertNotIn(raw, rendered)
        self.assertEqual(attestation["response_digest"], result["response_digest"])
        self.assertFalse(attestation["raw_response_stored"])
        runtime_submission = self.repo.get_object(TURN_SUBMISSION_KIND, turn["turn_id"], 1)
        self.assertNotIn(raw, json.dumps(runtime_submission, sort_keys=True))

    def test_nonhuman_source_is_rejected_before_runtime_submission(self):
        turn = self.prepare("TURN-HUMAN-SOURCE", 10)
        with self.assertRaisesRegex(RealLearnerPilotHumanSessionError, "HUMAN_PILOT_RESPONSE_SOURCE_REQUIRED"):
            self.submit(turn, "git add notes.txt", 10, response_source="MODEL_GENERATED")
        self.assertIsNone(self.repo.get_object(TURN_SUBMISSION_KIND, turn["turn_id"], 1))
        self.assertIsNone(self.repo.get_object(HUMAN_TURN_ATTESTATION_KIND, turn["turn_id"], 1))

    def test_assisted_independent_baseline_is_rejected_before_state_change(self):
        turn = self.prepare("TURN-HUMAN-ASSISTED", 10)
        with self.assertRaisesRegex(RealLearnerPilotHumanSessionError, "HUMAN_PILOT_INDEPENDENT_ASSISTANCE_FORBIDDEN"):
            self.submit(turn, "git add notes.txt", 10, assistance_used=True)
        self.assertIsNone(self.repo.get_object(TURN_SUBMISSION_KIND, turn["turn_id"], 1))
        self.assertIsNone(self.repo.get_object(HUMAN_TURN_ATTESTATION_KIND, turn["turn_id"], 1))

    def test_answer_reveal_independent_baseline_is_rejected_before_state_change(self):
        turn = self.prepare("TURN-HUMAN-REVEAL", 10)
        with self.assertRaisesRegex(RealLearnerPilotHumanSessionError, "HUMAN_PILOT_INDEPENDENT_ANSWER_REVEAL_FORBIDDEN"):
            self.submit(turn, "git add notes.txt", 10, answer_revealed_before_commit=True)
        self.assertIsNone(self.repo.get_object(TURN_SUBMISSION_KIND, turn["turn_id"], 1))

    def test_stage_one_reaches_retention_pending_after_real_runtime_verification_receipts(self):
        diag = self.prepare("TURN-HUMAN-STAGE-DIAG", 10)
        diag_result = self.submit(diag, "git add notes.txt", 10)
        self.assertEqual(diag_result["learning_submission"]["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")

        verify = self.prepare("TURN-HUMAN-STAGE-VERIFY", 120)
        self.assertEqual(verify["action"]["action_type"], "INDEPENDENT_VERIFICATION")
        verify_result = self.submit(verify, 'git add app.txt; git commit -m "Feature work"', 120)
        self.assertTrue(verify_result["learning_submission"]["evidence"]["correct"])

        status = stage_one_status(repo=self.repo, pilot_id="PILOT-HUMAN-0001")
        self.assertEqual(status["standing"], "STAGE_1_COMPLETE_RETENTION_PENDING")
        self.assertEqual(status["retention_not_before"], 3720)
        self.assertEqual(status["retention_minimum_delay_seconds"], 3600)
        self.assertTrue(status["all_captured_turns_human_attested"])
        self.assertEqual(status["participant_outcome"], "INCOMPLETE")
        self.assertFalse(status["eligible_for_effectiveness_review"])

    def test_exact_submission_replay_is_stable_and_different_response_fails_closed(self):
        turn = self.prepare("TURN-HUMAN-REPLAY", 10)
        first = self.submit(turn, "git add notes.txt", 10)
        replay = submit_human_pilot_turn(
            repo=self.repo,
            operation_id=f"OP-SUBMIT-{turn['turn_id']}",
            pilot_id="PILOT-HUMAN-0001",
            turn_id=turn["turn_id"],
            turn_binding_digest=turn["turn_binding_digest"],
            response="git add notes.txt",
            submitted_at=10,
            response_source=HUMAN_RESPONSE_SOURCE,
            participant_present=True,
            response_was_actually_provided_by_participant=True,
            assistance_used=False,
            answer_revealed_before_commit=False,
        )
        self.assertEqual(first, replay)
        with self.assertRaises(ValueError):
            submit_human_pilot_turn(
                repo=self.repo,
                operation_id=f"OP-SUBMIT-{turn['turn_id']}",
                pilot_id="PILOT-HUMAN-0001",
                turn_id=turn["turn_id"],
                turn_binding_digest=turn["turn_binding_digest"],
                response="different response",
                submitted_at=10,
                response_source=HUMAN_RESPONSE_SOURCE,
                participant_present=True,
                response_was_actually_provided_by_participant=True,
                assistance_used=False,
                answer_revealed_before_commit=False,
            )


if __name__ == "__main__":
    unittest.main()
