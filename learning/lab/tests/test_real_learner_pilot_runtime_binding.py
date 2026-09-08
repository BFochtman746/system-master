from __future__ import annotations

import inspect
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
from learning_lab.real_learner_pilot import adjudicate_pilot_record
from learning_lab.real_learner_pilot_runtime_binding import (
    PILOT_CURRENT_RUNTIME_BINDING_VERSION,
    PilotRuntimeBindingError,
    capture_runtime_turn,
    current_runtime_binding_summary,
    mark_runtime_bound_pilot_withdrawn,
    materialize_runtime_bound_pilot_record,
    start_runtime_bound_pilot,
)
from learning_lab.unified_turn_controller import prepare_learning_turn, submit_learning_turn


class RealLearnerPilotRuntimeBindingTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        registry = default_domain_registry()
        spec = registry.by_key(GIT_DOMAIN_KEY)
        self.engine = DomainGeneralLearningEngine(self.repo, registry=registry)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-PILOT-REFRESH",
            job_id="JOB-CREATE-PILOT-REFRESH",
            goal_id="G-PILOT-REFRESH",
            title=spec.desired_outcome,
            desired_outcome=spec.desired_outcome,
        )
        self.course_id = created["course_id"]
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=spec.behavior_oracle.score)
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        sessions = MultiSessionDirector(self.repo, self.engine)
        journey = AdaptiveEntryJourneyDirector(self.repo, self.engine, diagnostic, tutor, sessions)
        journey.start_journey(
            operation_id="OP-J-PILOT-REFRESH",
            journey_id="J-PILOT-REFRESH",
            diagnostic_id="D-PILOT-REFRESH",
            learner_id="L-PILOT-REFRESH",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        sessions.start_session(
            operation_id="OP-S-PILOT-REFRESH",
            session_id="S-PILOT-REFRESH",
            learner_id="L-PILOT-REFRESH",
            course_id=self.course_id,
            started_at=0,
        )
        self.start_pilot()

    def tearDown(self):
        self.td.cleanup()

    def start_pilot(self):
        return start_runtime_bound_pilot(
            repo=self.repo,
            operation_id="OP-PILOT-START",
            pilot_id="PILOT-001-REFRESH-0001",
            participant_key="LRN-REFRESH-0001",
            journey_id="J-PILOT-REFRESH",
            session_id="S-PILOT-REFRESH",
            learner_id="L-PILOT-REFRESH",
            course_id=self.course_id,
            started_at=0,
            consented_at=1,
            consent_recorded=True,
        )

    def prepare_submit(self, turn_id: str, prepared_at: int, response: str):
        turn = prepare_learning_turn(
            repo=self.repo,
            operation_id=f"OP-PREP-{turn_id}",
            turn_id=turn_id,
            journey_id="J-PILOT-REFRESH",
            session_id="S-PILOT-REFRESH",
            learner_id="L-PILOT-REFRESH",
            course_id=self.course_id,
            now=prepared_at,
        )
        submission = submit_learning_turn(
            repo=self.repo,
            operation_id=f"OP-SUBMIT-{turn_id}",
            turn_id=turn_id,
            turn_binding_digest=turn["turn_binding_digest"],
            response=response,
            submitted_at=prepared_at,
        )
        return turn, submission

    def capture(self, turn_id: str, suffix: str):
        return capture_runtime_turn(
            repo=self.repo,
            operation_id=f"OP-CAPTURE-{suffix}",
            pilot_id="PILOT-001-REFRESH-0001",
            turn_id=turn_id,
        )

    def test_current_runtime_baseline_and_verification_materialize_without_raw_response(self):
        diag_turn, diag_submission = self.prepare_submit("TURN-PILOT-DIAG", 10, "git add notes.txt")
        self.assertEqual(diag_turn["action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(diag_submission["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.capture("TURN-PILOT-DIAG", "DIAG")

        verify_response = 'git add app.txt; git commit -m "Feature work"'
        verify_turn, verify_submission = self.prepare_submit("TURN-PILOT-VERIFY", 120, verify_response)
        self.assertEqual(verify_turn["action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertTrue(verify_submission["evidence"]["correct"])
        self.capture("TURN-PILOT-VERIFY", "VERIFY")

        record = materialize_runtime_bound_pilot_record(
            repo=self.repo, pilot_id="PILOT-001-REFRESH-0001"
        )
        result = adjudicate_pilot_record(record)
        self.assertEqual(result["status"], "VALID_IN_PROGRESS")
        self.assertEqual(result["participant_outcome"], "INCOMPLETE")
        by_type = {row["event_type"]: row for row in record["events"]}
        self.assertEqual(by_type["BASELINE_COMPLETED"]["payload"]["score"], 1)
        self.assertEqual(by_type["BASELINE_COMPLETED"]["payload"]["max_score"], 1)
        self.assertEqual(by_type["ROUTE_SELECTED"]["payload"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertTrue(by_type["INDEPENDENT_VERIFICATION_COMPLETED"]["payload"]["passed"])
        self.assertEqual(
            by_type["INDEPENDENT_VERIFICATION_COMPLETED"]["payload"]["item_family_id"],
            "F-GIT-STAGE-M1",
        )
        rendered = json.dumps(record, sort_keys=True)
        self.assertNotIn("git add notes.txt", rendered)
        self.assertNotIn(verify_response, rendered)
        self.assertNotIn("response\"", rendered)

    def test_runtime_summary_preserves_truth_boundary(self):
        self.prepare_submit("TURN-PILOT-DIAG", 10, "git add notes.txt")
        self.capture("TURN-PILOT-DIAG", "DIAG")
        summary = current_runtime_binding_summary(
            repo=self.repo, pilot_id="PILOT-001-REFRESH-0001"
        )
        self.assertEqual(summary["binding_version"], PILOT_CURRENT_RUNTIME_BINDING_VERSION)
        self.assertEqual(summary["truth_boundary"]["pilot_runtime_receipt_binding"], "PROVEN_BY_THIS_SOFTWARE_PATH")
        self.assertEqual(summary["truth_boundary"]["human_participant_record"], "NOT_PROVEN_UNTIL_REAL_PARTICIPANT_EXECUTION")
        self.assertEqual(summary["truth_boundary"]["real_learner_effectiveness"], "NOT_PROVEN")
        self.assertFalse(summary["authority_boundary"]["pilot_scores_supplied_by_caller"])
        self.assertFalse(summary["authority_boundary"]["a01_may_manufacture_human_evidence"])

    def test_capture_api_cannot_accept_caller_score_digest_or_family(self):
        params = set(inspect.signature(capture_runtime_turn).parameters)
        self.assertEqual(params, {"repo", "operation_id", "pilot_id", "turn_id"})
        self.assertNotIn("score", params)
        self.assertNotIn("response_digest", params)
        self.assertNotIn("item_family_id", params)
        self.assertNotIn("passed", params)

    def test_duplicate_turn_capture_fails_closed_but_exact_operation_replay_is_stable(self):
        self.prepare_submit("TURN-PILOT-DIAG", 10, "git add notes.txt")
        first = self.capture("TURN-PILOT-DIAG", "DIAG")
        replay = capture_runtime_turn(
            repo=self.repo,
            operation_id="OP-CAPTURE-DIAG",
            pilot_id="PILOT-001-REFRESH-0001",
            turn_id="TURN-PILOT-DIAG",
        )
        self.assertEqual(first, replay)
        with self.assertRaisesRegex(PilotRuntimeBindingError, "PILOT_RUNTIME_TURN_ALREADY_CAPTURED"):
            self.capture("TURN-PILOT-DIAG", "DIAG-OTHER-OP")

    def test_wrong_scope_turn_is_rejected_before_pilot_receipt(self):
        registry = default_domain_registry()
        spec = registry.by_key(GIT_DOMAIN_KEY)
        other_engine = DomainGeneralLearningEngine(self.repo, registry=registry)
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=spec.behavior_oracle.score)
        tutor = DomainGeneralTutorDirector(self.repo, other_engine)
        sessions = MultiSessionDirector(self.repo, other_engine)
        journey = AdaptiveEntryJourneyDirector(self.repo, other_engine, diagnostic, tutor, sessions)
        journey.start_journey(
            operation_id="OP-J-OTHER",
            journey_id="J-OTHER",
            diagnostic_id="D-OTHER",
            learner_id="L-OTHER",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        sessions.start_session(
            operation_id="OP-S-OTHER",
            session_id="S-OTHER",
            learner_id="L-OTHER",
            course_id=self.course_id,
            started_at=0,
        )
        turn = prepare_learning_turn(
            repo=self.repo,
            operation_id="OP-PREP-OTHER",
            turn_id="TURN-OTHER",
            journey_id="J-OTHER",
            session_id="S-OTHER",
            learner_id="L-OTHER",
            course_id=self.course_id,
            now=10,
        )
        submit_learning_turn(
            repo=self.repo,
            operation_id="OP-SUBMIT-OTHER",
            turn_id="TURN-OTHER",
            turn_binding_digest=turn["turn_binding_digest"],
            response="git add notes.txt",
            submitted_at=10,
        )
        with self.assertRaisesRegex(PilotRuntimeBindingError, "PILOT_RUNTIME_SCOPE_MISMATCH"):
            self.capture("TURN-OTHER", "OTHER")

    def test_withdrawal_remains_valid_terminal_and_excluded(self):
        self.prepare_submit("TURN-PILOT-DIAG", 10, "git add notes.txt")
        self.capture("TURN-PILOT-DIAG", "DIAG")
        result = mark_runtime_bound_pilot_withdrawn(
            repo=self.repo,
            operation_id="OP-PILOT-WITHDRAW",
            pilot_id="PILOT-001-REFRESH-0001",
            withdrawn_at=20,
        )
        self.assertEqual(result["adjudication"]["status"], "VALID_WITHDRAWN")
        self.assertEqual(result["adjudication"]["participant_outcome"], "WITHDRAWN")
        self.assertFalse(result["adjudication"]["eligible_for_effectiveness_review"])


if __name__ == "__main__":
    unittest.main()
