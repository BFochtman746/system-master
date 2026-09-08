from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    AdaptiveLearningEngine,
    BaselineDiagnosticDirector,
    MultiSessionDirector,
    REAL_GIT_OUTCOME,
    Repository,
    TutorDirector,
)
from learning_lab.adaptive_journey_continuation import submit_current_evidence_and_continue
from learning_lab.adaptive_tutor_continuation import (
    TUTOR_HANDOFF_KIND,
    TUTOR_HANDOFF_STANDING,
    AdaptiveTutorContinuationError,
    begin_current_tutor_interaction,
    submit_current_tutor_interaction,
)
from learning_lab.provider_acquisition import OpenGoalInputPacketService
from learning_lab.provider_multi_candidate_runtime import start_provider_multi_candidate_adaptive_entry


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
PROVIDER_GOAL = "Use Python list and dictionary comprehensions to transform and filter data."


class AdaptiveTutorContinuationTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = AdaptiveLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE",
            job_id="JOB-CREATE",
            goal_id="G-GIT",
            title="Git feature branch workflow",
            desired_outcome=REAL_GIT_OUTCOME,
        )
        self.course_id = created["course_id"]
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=self.engine.git_oracle.score)
        tutor = TutorDirector(self.repo, self.engine)
        sessions = MultiSessionDirector(self.repo, self.engine)
        self.journey = AdaptiveEntryJourneyDirector(self.repo, self.engine, diagnostic, tutor, sessions)
        self.journey.start_journey(
            operation_id="OP-JOURNEY",
            journey_id="J1",
            diagnostic_id="D1",
            learner_id="L1",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        sessions.start_session(
            operation_id="OP-SESSION",
            session_id="S1",
            learner_id="L1",
            course_id=self.course_id,
            started_at=0,
        )
        self.journey.record_diagnostic_probe(
            journey_id="J1",
            now=10,
            operation_id="OP-DIAG",
            probe_id="DP1",
            diagnostic_id="D1",
            item_id="P-GIT-STAGE-1",
            response="git status",
            submitted_at=10,
        )
        routed = self.journey.plan_next(
            operation_id="OP-ROUTE",
            decision_id="DEC-ROUTE",
            journey_id="J1",
            session_id="S1",
            now=11,
        )
        self.assertEqual(routed["next_action"]["action_type"], "TUTOR_REMEDIATION")

    def tearDown(self):
        self.td.cleanup()

    def begin(self, suffix: str, now: int):
        return begin_current_tutor_interaction(
            repo=self.repo,
            operation_id=f"OP-BEGIN-{suffix}",
            tutor_interaction_id=f"TI-{suffix}",
            journey_id="J1",
            session_id="S1",
            learner_id="L1",
            course_id=self.course_id,
            now=now,
        )

    def submit(self, suffix: str, response: str, help_level: int, submitted_at: int):
        return submit_current_tutor_interaction(
            repo=self.repo,
            operation_id=f"OP-TURN-{suffix}",
            tutor_interaction_id=f"TI-{suffix}",
            turn_id=f"TURN-{suffix}",
            response=response,
            requested_help_level=help_level,
            submitted_at=submitted_at,
        )

    def complete_formative_handoff(self):
        first = self.begin("A", 20)
        self.assertEqual(first["probe_id"], "DG-TP-GIT-STAGE-1")
        wrong = self.submit("A", "git commit -m 'oops'", 1, 21)
        self.assertEqual(wrong["tutor_formative_only"], True)
        self.assertIsNone(wrong["formative_handoff"])

        second = self.begin("B", 22)
        self.assertEqual(second["probe_id"], "DG-TP-GIT-STAGE-2")
        correct = self.submit("B", "git add report.txt", 0, 23)
        self.assertEqual(correct["teaching_move"]["move"], "INDEPENDENT_RECHECK_PASSED")
        return correct

    def test_begin_exposes_fresh_formative_probe_with_answer_withheld(self):
        out = self.begin("BEGIN", 20)
        self.assertEqual(out["action_type"], "TUTOR_REMEDIATION")
        self.assertEqual(out["skill_id"], "S-GIT-STAGE-COMMIT")
        self.assertEqual(out["probe_id"], "DG-TP-GIT-STAGE-1")
        self.assertTrue(out["prompt"])
        self.assertTrue(out["answer_withheld"])
        self.assertFalse(out["qualifies_mastery"])
        self.assertNotIn("answer", out)
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_tutor_turn_remains_formative_and_writes_no_mastery_attempt(self):
        self.begin("FORM", 20)
        before = self.repo.count_attempts()
        out = self.submit("FORM", "git commit -m 'oops'", 1, 21)
        self.assertEqual(out["teaching_move"]["move"], "TARGETED_HINT")
        self.assertTrue(out["tutor_formative_only"])
        self.assertFalse(out["mastery_attempt_written"])
        self.assertEqual(self.repo.count_attempts(), before)
        self.assertNotIn("git commit -m 'oops'", json.dumps(out, sort_keys=True))

    def test_supported_remediation_then_fresh_unaided_recheck_hands_off_to_independent_verification(self):
        out = self.complete_formative_handoff()
        self.assertEqual(out["formative_handoff"]["standing"], TUTOR_HANDOFF_STANDING)
        self.assertFalse(out["formative_handoff"]["qualifies_mastery"])
        self.assertEqual(out["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(out["next_action"]["target_id"], "M-GIT-STAGE-1")
        self.assertEqual(out["next_authority"], "TUTOR_FORMATIVE_ROUTING_HANDOFF")
        self.assertEqual(self.repo.count_attempts(), 0)
        stored = self.repo.get_latest_object(TUTOR_HANDOFF_KIND, "J1:S-GIT-STAGE-COMMIT")
        self.assertEqual(stored["standing"], TUTOR_HANDOFF_STANDING)
        self.assertTrue(stored["routing_only"])
        self.assertFalse(stored["qualifies_mastery"])

    def test_exact_completed_tutor_replay_is_stable_without_duplicate_turn(self):
        self.begin("REPLAY", 20)
        first = self.submit("REPLAY", "git commit -m 'oops'", 1, 21)
        count = self.repo.count_tutor_turns("S1")
        replay = self.submit("REPLAY", "git commit -m 'oops'", 1, 21)
        self.assertEqual(first, replay)
        self.assertEqual(self.repo.count_tutor_turns("S1"), count)

    def test_failed_independent_verification_consumes_handoff_and_returns_to_remediation(self):
        self.complete_formative_handoff()
        evidence = submit_current_evidence_and_continue(
            repo=self.repo,
            operation_id="OP-INDEPENDENT-FAIL",
            interaction_id="INT-INDEPENDENT-FAIL",
            journey_id="J1",
            session_id="S1",
            learner_id="L1",
            course_id=self.course_id,
            response="git status",
            submitted_at=30,
            assisted=False,
            answer_revealed_before_commit=False,
        )
        self.assertEqual(evidence["before_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(evidence["evidence"]["evidence_kind"], "MASTERY_CHECK")
        self.assertFalse(evidence["evidence"]["correct"])
        self.assertEqual(evidence["next_action"]["action_type"], "TUTOR_REMEDIATION")
        self.assertNotEqual(evidence["next_authority"], "TUTOR_FORMATIVE_ROUTING_HANDOFF")
        self.assertEqual(self.repo.count_attempts(), 1)

    def test_wrong_learner_scope_fails_before_tutor_interaction_write(self):
        before = self.repo.count_objects("adaptive_tutor_interaction")
        with self.assertRaisesRegex(AdaptiveTutorContinuationError, "JOURNEY_SCOPE_MISMATCH"):
            begin_current_tutor_interaction(
                repo=self.repo,
                operation_id="OP-WRONG-SCOPE",
                tutor_interaction_id="TI-WRONG-SCOPE",
                journey_id="J1",
                session_id="S1",
                learner_id="OTHER",
                course_id=self.course_id,
                now=20,
            )
        self.assertEqual(self.repo.count_objects("adaptive_tutor_interaction"), before)

    def test_provider_generated_tutor_first_course_exposes_learning_owned_probe(self):
        td = tempfile.TemporaryDirectory()
        try:
            repo = Repository(os.path.join(td.name, "provider.sqlite3"))
            capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
            fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
            traces = {x["generation_trace_id"]: x for x in fixture["traces"]}
            service = OpenGoalInputPacketService(repo)
            packet_ids = []
            for suffix, trace_id in [
                ("A", "MODEL-GEN-PY-COMP-MC-A-20260907"),
                ("B", "MODEL-GEN-PY-COMP-MC-B-20260907"),
                ("C", "MODEL-GEN-PY-COMP-MC-C-20260907"),
            ]:
                packet_id = f"PACKET-IMPL028-{suffix}"
                packet_ids.append(packet_id)
                output = copy.deepcopy(traces[trace_id]["output"])
                service.capture_and_admit(
                    operation_id=f"OP-ADMIT-{suffix}",
                    packet_id=packet_id,
                    desired_outcome=PROVIDER_GOAL,
                    research_capture_provider=lambda goal, cap=copy.deepcopy(capture): copy.deepcopy(cap),
                    model_id="PROVIDER-MODEL-IMPL028",
                    model_candidate_provider=lambda prompt, out=output: copy.deepcopy(out),
                )
            started = start_provider_multi_candidate_adaptive_entry(
                repo=repo,
                request_id="REQ-IMPL028-PROVIDER",
                learner_id="LRN-IMPL028-PROVIDER",
                packet_ids=packet_ids,
                claimed_skill_ids=[],
                now=0,
            )
            self.assertEqual(started["status"], "PASS")
            self.assertEqual(started["next_action"]["action_type"], "TUTOR_INSTRUCTION")
            begun = begin_current_tutor_interaction(
                repo=repo,
                operation_id="OP-BEGIN-PROVIDER",
                tutor_interaction_id="TI-PROVIDER",
                journey_id=started["journey_id"],
                session_id=started["session_id"],
                learner_id="LRN-IMPL028-PROVIDER",
                course_id=started["course_id"],
                now=1,
            )
            self.assertEqual(begun["action_type"], "TUTOR_INSTRUCTION")
            self.assertTrue(begun["probe_id"])
            self.assertTrue(begun["prompt"])
            self.assertTrue(begun["answer_withheld"])
            self.assertFalse(begun["qualifies_mastery"])
        finally:
            td.cleanup()


if __name__ == "__main__":
    unittest.main()
