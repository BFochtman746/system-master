from __future__ import annotations

import os
import tempfile
import unittest

from learning_lab.action_presentation import ActionPresentationError, _surface_for_action
from learning_lab.adaptive_tutor_continuation import AdaptiveTutorJourneyDirector
from learning_lab.repository import Repository
from learning_lab.unified_turn_controller import UnifiedTurnControllerError, _turn_mode


class _DiagnosticComplete:
    def next_action(self, diagnostic_id: str):
        return {
            "action_type": "COURSE_ENTRY_COMPLETE",
            "target_id": None,
            "skill_id": None,
            "reason_codes": ["ALL_SKILLS_CURRENTLY_SATISFIED"],
        }


class _RuntimeActionEngine:
    def __init__(self, action):
        self.action = dict(action)

    def next_action(self, learner_id: str, course_id: str, *, now: int):
        return dict(self.action)


class PostEntryTutorRouteUnificationTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.journey = {
            "journey_id": "J-POST",
            "diagnostic_id": "D-POST",
            "learner_id": "L-POST",
            "course_id": "COURSE-POST",
        }

    def tearDown(self):
        self.td.cleanup()

    def director_for(self, action):
        return AdaptiveTutorJourneyDirector(
            self.repo,
            _RuntimeActionEngine(action),
            _DiagnosticComplete(),
            None,
            None,
        )

    def test_post_entry_runtime_lesson_is_unified_to_tutor_instruction(self):
        director = self.director_for({
            "action_type": "LESSON",
            "target_id": "L-GIT-STAGE",
            "skill_id": "S-GIT-STAGE-COMMIT",
            "reason_codes": ["CURRICULUM_NEXT"],
        })
        composed = director._compose_action(journey=self.journey, now=100)
        self.assertEqual(composed["selected"]["action_type"], "TUTOR_INSTRUCTION")
        self.assertEqual(composed["selected"]["target_id"], "L-GIT-STAGE")
        self.assertIn("POST_ENTRY_TUTOR_ROUTE_UNIFIED", composed["selected"]["reason_codes"])
        self.assertEqual(composed["authority"], "LEARNING_ENGINE_POST_ENTRY_TUTOR_ROUTE")

    def test_post_entry_runtime_remediation_is_unified_to_tutor_remediation(self):
        director = self.director_for({
            "action_type": "REMEDIATION",
            "target_id": "L-GIT-STAGE",
            "skill_id": "S-GIT-STAGE-COMMIT",
            "reason_codes": ["REMEDIATION", "FAILED_CURRENTLY"],
        })
        composed = director._compose_action(journey=self.journey, now=100)
        self.assertEqual(composed["selected"]["action_type"], "TUTOR_REMEDIATION")
        self.assertEqual(composed["selected"]["target_id"], "L-GIT-STAGE")
        self.assertIn("POST_ENTRY_TUTOR_ROUTE_UNIFIED", composed["selected"]["reason_codes"])
        self.assertEqual(composed["authority"], "LEARNING_ENGINE_POST_ENTRY_TUTOR_ROUTE")

    def test_non_tutor_runtime_action_is_not_reclassified(self):
        action = {
            "action_type": "RETENTION_WAIT",
            "target_id": "R-GIT-STAGE-1",
            "skill_id": "S-GIT-STAGE-COMMIT",
            "reason_codes": ["RETENTION_DELAY_NOT_YET_MET"],
            "earliest_due_at": 500,
        }
        composed = self.director_for(action)._compose_action(journey=self.journey, now=100)
        self.assertEqual(composed["selected"], action)
        self.assertEqual(composed["authority"], "LEARNING_ENGINE_CURRENT_EVIDENCE")

    def test_presentation_fails_closed_if_raw_lesson_escapes(self):
        with self.assertRaisesRegex(ActionPresentationError, "RAW_TUTOR_ROUTE_ESCAPED:LESSON"):
            _surface_for_action(
                self.repo,
                {},
                {"action_type": "LESSON", "target_id": "L1", "skill_id": "S1", "reason_codes": []},
            )

    def test_presentation_fails_closed_if_raw_remediation_escapes(self):
        with self.assertRaisesRegex(ActionPresentationError, "RAW_TUTOR_ROUTE_ESCAPED:REMEDIATION"):
            _surface_for_action(
                self.repo,
                {},
                {"action_type": "REMEDIATION", "target_id": "L1", "skill_id": "S1", "reason_codes": []},
            )

    def test_unified_controller_has_no_legacy_tutor_mode(self):
        with self.assertRaisesRegex(UnifiedTurnControllerError, "UNSUPPORTED_PRESENTATION_SURFACE"):
            _turn_mode("LEGACY_TUTOR_CONTINUATION_REQUIRED")
        self.assertEqual(_turn_mode("TUTOR_INTERACTION_REQUIRED"), "TUTOR")


if __name__ == "__main__":
    unittest.main()
