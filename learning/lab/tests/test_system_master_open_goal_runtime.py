from __future__ import annotations

import os
import tempfile
import unittest

import system_master_bridge as bridge


GOAL = "Use Python list and dictionary comprehensions to transform and filter data."


class SystemMasterOpenGoalRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous = os.environ.get("SYSTEM_MASTER_LEARNING_STATE_ROOT")
        os.environ["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = self.tmp.name

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("SYSTEM_MASTER_LEARNING_STATE_ROOT", None)
        else:
            os.environ["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = self.previous
        self.tmp.cleanup()

    def request(self, *, request_id: str, goal: str = GOAL, claimed: list[str] | None = None, state_key: str = "impl019"):
        return {
            "operation": "START_OPEN_GOAL_ADAPTIVE_ENTRY",
            "request_id": request_id,
            "state_key": state_key,
            "learner_id": "LRN-IMPL019",
            "desired_outcome": goal,
            "claimed_skill_ids": list(claimed or []),
            "now": 0,
        }

    def test_supported_open_goal_builds_dynamic_domain_and_enters_adaptive_journey(self):
        out = bridge.dispatch(self.request(
            request_id="REQ-OPEN-SUPPORTED",
            claimed=["S-PY-DICTCOMP"],
        ))
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["open_goal_runtime_binding_version"], bridge.OPEN_GOAL_RUNTIME_BINDING_VERSION)
        self.assertEqual(out["domain_key"], "python-comprehensions")
        self.assertIn("S-PY-LISTCOMP", out["course_skill_ids"])
        self.assertIn("S-PY-DICTCOMP", out["course_skill_ids"])
        self.assertEqual(out["next_action"]["action_type"], "TUTOR_INSTRUCTION")
        self.assertEqual(out["next_action"]["skill_id"], "S-PY-LISTCOMP")
        self.assertEqual(out["selected_authority"], "BASELINE_DIAGNOSTIC_ROUTING")

    def test_open_goal_response_preserves_research_model_oracle_provenance(self):
        out = bridge.dispatch(self.request(request_id="REQ-OPEN-PROV"))
        self.assertTrue(out["research_capture_id"])
        self.assertEqual(out["model_id"], "GPT-5.6 Sol")
        self.assertTrue(out["model_generation_trace_id"])
        self.assertEqual(out["oracle_type"], "PYTHON_COMPREHENSION_EXPRESSION")
        self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")
        self.assertTrue(out["verification_id"])

    def test_novice_open_goal_routes_to_tutor_instruction(self):
        out = bridge.dispatch(self.request(request_id="REQ-OPEN-NOVICE"))
        self.assertEqual(out["domain_key"], "python-comprehensions")
        self.assertEqual(out["next_action"]["action_type"], "TUTOR_INSTRUCTION")
        self.assertEqual(out["next_action"]["skill_id"], "S-PY-LISTCOMP")

    def test_unsupported_goal_abstains_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "LIVE_OPEN_GOAL_UNSUPPORTED_OR_INSUFFICIENT_RESEARCH"):
            bridge.dispatch(self.request(
                request_id="REQ-OPEN-UNSUPPORTED",
                goal="Learn Italian Renaissance painting conservation chemistry",
            ))

    def test_goal_without_exact_pinned_model_trace_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "MODEL_TRACE_GOAL_MISMATCH"):
            bridge.dispatch(self.request(
                request_id="REQ-OPEN-UNPINNED",
                goal="Use Python comprehensions to filter and transform lists and dictionaries.",
            ))

    def test_claimed_skill_must_belong_to_generated_course(self):
        with self.assertRaisesRegex(ValueError, "CLAIMED_SKILL_OUTSIDE_COURSE:S-GIT-BRANCH-MERGE"):
            bridge.dispatch(self.request(
                request_id="REQ-OPEN-WRONG-SKILL",
                claimed=["S-GIT-BRANCH-MERGE"],
            ))

    def test_exact_open_goal_request_replay_is_stable(self):
        request = self.request(
            request_id="REQ-OPEN-REPLAY",
            claimed=["S-PY-DICTCOMP"],
        )
        first = bridge.dispatch(request)
        replay = bridge.dispatch(request)
        self.assertEqual(first, replay)

    def test_registered_domain_runtime_remains_available(self):
        out = bridge.dispatch({
            "operation": "START_ADAPTIVE_ENTRY",
            "request_id": "REQ-REGISTERED-REGRESSION",
            "state_key": "registered-regression",
            "learner_id": "LRN-IMPL019",
            "domain_key": "fractions-unlike-denominators",
            "claimed_skill_ids": ["S-FRAC-ADD-SUB"],
            "now": 0,
        })
        self.assertEqual(out["domain_key"], "fractions-unlike-denominators")
        self.assertEqual(out["next_action"]["skill_id"], "S-FRAC-EQUIV-LCD")


if __name__ == "__main__":
    unittest.main()
