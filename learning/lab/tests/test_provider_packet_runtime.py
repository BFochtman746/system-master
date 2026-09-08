from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

import system_master_bridge as bridge
from learning_lab.provider_acquisition import PACKET_STANDING, OpenGoalInputPacketService
from learning_lab.repository import Repository


GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
SOURCE_ROOT = Path(__file__).resolve().parents[1] / "sources"


class ProviderPacketRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous = os.environ.get("SYSTEM_MASTER_LEARNING_STATE_ROOT")
        os.environ["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = self.tmp.name
        self.base_capture = json.loads(
            (SOURCE_ROOT / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
        )
        self.base_trace = json.loads(
            (SOURCE_ROOT / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
        )

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("SYSTEM_MASTER_LEARNING_STATE_ROOT", None)
        else:
            os.environ["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = self.previous
        self.tmp.cleanup()

    def repo(self, state_key: str = "impl020"):
        return Repository(str(Path(self.tmp.name) / f"{state_key}.sqlite3"))

    def admit(self, *, packet_id: str, operation_id: str, capture_id: str, state_key: str = "impl020"):
        def research_provider(goal):
            cap = copy.deepcopy(self.base_capture)
            cap["capture_id"] = capture_id
            cap["captured_at"] = "2026-09-08T04:25:00Z"
            cap["capture_mode"] = "QUALIFIED_PROVIDER_GATEWAY_TEST"
            return cap

        def model_provider(prompt):
            return copy.deepcopy(self.base_trace["output"])

        return OpenGoalInputPacketService(self.repo(state_key)).capture_and_admit(
            operation_id=operation_id,
            packet_id=packet_id,
            desired_outcome=GOAL,
            research_capture_provider=research_provider,
            model_id="PROVIDER-MODEL-IMPL020",
            model_candidate_provider=model_provider,
        )

    def request(self, packet_id: str, request_id: str, claimed=None, state_key: str = "impl020"):
        return {
            "operation": "START_OPEN_GOAL_PACKET_ADAPTIVE_ENTRY",
            "request_id": request_id,
            "state_key": state_key,
            "learner_id": "LRN-IMPL020",
            "input_packet_id": packet_id,
            "claimed_skill_ids": list(claimed or []),
            "now": 0,
        }

    def test_admitted_packet_reaches_independent_course_validation_and_adaptive_entry(self):
        admitted = self.admit(
            packet_id="PACKET-RUNTIME-001",
            operation_id="OP-PACKET-RUNTIME-001",
            capture_id="CAPTURE-RUNTIME-001",
        )
        out = bridge.dispatch(self.request("PACKET-RUNTIME-001", "REQ-PACKET-RUNTIME-001"))
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["packet_digest"], admitted["packet_digest"])
        self.assertEqual(out["packet_standing"], PACKET_STANDING)
        self.assertEqual(out["domain_key"], "python-comprehensions")
        self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")
        self.assertEqual(out["oracle_type"], "PYTHON_COMPREHENSION_EXPRESSION")
        self.assertEqual(out["next_action"]["action_type"], "TUTOR_INSTRUCTION")
        self.assertEqual(out["next_action"]["skill_id"], "S-PY-LISTCOMP")

    def test_packet_runtime_replay_is_byte_stable(self):
        self.admit(
            packet_id="PACKET-RUNTIME-REPLAY",
            operation_id="OP-PACKET-RUNTIME-REPLAY",
            capture_id="CAPTURE-RUNTIME-REPLAY",
        )
        request = self.request("PACKET-RUNTIME-REPLAY", "REQ-PACKET-RUNTIME-REPLAY")
        first = bridge.dispatch(request)
        replay = bridge.dispatch(request)
        self.assertEqual(first, replay)

    def test_unadmitted_packet_fails_before_course_creation(self):
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_INPUT_PACKET_NOT_FOUND"):
            bridge.dispatch(self.request("PACKET-DOES-NOT-EXIST", "REQ-MISSING-PACKET"))

    def test_claimed_skill_outside_packet_course_fails_closed(self):
        self.admit(
            packet_id="PACKET-RUNTIME-WRONG-SKILL",
            operation_id="OP-PACKET-RUNTIME-WRONG-SKILL",
            capture_id="CAPTURE-RUNTIME-WRONG-SKILL",
        )
        with self.assertRaisesRegex(ValueError, "CLAIMED_SKILL_OUTSIDE_COURSE:S-GIT-BRANCH-MERGE"):
            bridge.dispatch(self.request(
                "PACKET-RUNTIME-WRONG-SKILL",
                "REQ-PACKET-RUNTIME-WRONG-SKILL",
                claimed=["S-GIT-BRANCH-MERGE"],
            ))

    def test_new_packet_for_same_goal_gets_distinct_course_lineage(self):
        first_packet = self.admit(
            packet_id="PACKET-RUNTIME-A",
            operation_id="OP-PACKET-RUNTIME-A",
            capture_id="CAPTURE-RUNTIME-A",
        )
        second_packet = self.admit(
            packet_id="PACKET-RUNTIME-B",
            operation_id="OP-PACKET-RUNTIME-B",
            capture_id="CAPTURE-RUNTIME-B",
        )
        self.assertNotEqual(first_packet["packet_digest"], second_packet["packet_digest"])
        first = bridge.dispatch(self.request("PACKET-RUNTIME-A", "REQ-PACKET-RUNTIME-A"))
        second = bridge.dispatch(self.request("PACKET-RUNTIME-B", "REQ-PACKET-RUNTIME-B"))
        self.assertNotEqual(first["course_id"], second["course_id"])
        self.assertEqual(first["desired_outcome"], second["desired_outcome"])
        self.assertEqual(first["domain_key"], second["domain_key"])

    def test_packet_standing_never_claims_course_verification(self):
        self.admit(
            packet_id="PACKET-RUNTIME-STANDING",
            operation_id="OP-PACKET-RUNTIME-STANDING",
            capture_id="CAPTURE-RUNTIME-STANDING",
        )
        out = bridge.dispatch(self.request("PACKET-RUNTIME-STANDING", "REQ-PACKET-RUNTIME-STANDING"))
        self.assertEqual(out["packet_standing"], PACKET_STANDING)
        self.assertNotIn("VERIFIED", out["packet_standing"].replace("NOT_COURSE_VERIFIED", ""))
        self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")


if __name__ == "__main__":
    unittest.main()
