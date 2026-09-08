from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from learning_lab.provider_acquisition import (
    OPEN_GOAL_INPUT_PACKET_VERSION,
    PACKET_STANDING,
    OpenGoalInputPacketService,
)
from learning_lab.repository import Repository


GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
SOURCE_ROOT = Path(__file__).resolve().parents[1] / "sources"


class ProviderAcquisitionPacketTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(str(Path(self.tmp.name) / "learning.sqlite3"))
        self.base_capture = json.loads(
            (SOURCE_ROOT / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
        )
        self.base_trace = json.loads(
            (SOURCE_ROOT / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
        )
        self.research_calls = 0
        self.model_calls = 0

    def tearDown(self):
        self.tmp.cleanup()

    def research_provider(self, goal: str):
        self.research_calls += 1
        capture = copy.deepcopy(self.base_capture)
        capture["capture_id"] = "PROVIDER-CAPTURE-IMPL020-001"
        capture["captured_at"] = "2026-09-08T04:20:00Z"
        capture["capture_mode"] = "QUALIFIED_PROVIDER_GATEWAY_TEST"
        return capture

    def model_provider(self, prompt):
        self.model_calls += 1
        return copy.deepcopy(self.base_trace["output"])

    def capture(self, operation_id="OP-IMPL020-001", packet_id="PACKET-IMPL020-001"):
        return OpenGoalInputPacketService(self.repo).capture_and_admit(
            operation_id=operation_id,
            packet_id=packet_id,
            desired_outcome=GOAL,
            research_capture_provider=self.research_provider,
            model_id="PROVIDER-MODEL-IMPL020",
            model_candidate_provider=self.model_provider,
        )

    def test_fresh_provider_outputs_are_sealed_as_nonverified_packet(self):
        result = self.capture()
        self.assertEqual(result["packet_version"], OPEN_GOAL_INPUT_PACKET_VERSION)
        self.assertEqual(result["standing"], PACKET_STANDING)
        self.assertEqual(result["domain_key"], "python-comprehensions")
        self.assertEqual(self.research_calls, 1)
        self.assertEqual(self.model_calls, 1)
        packet = OpenGoalInputPacketService(self.repo).load(result["packet_id"])
        self.assertEqual(packet["research_capture"]["capture_id"], "PROVIDER-CAPTURE-IMPL020-001")
        self.assertEqual(packet["model_trace"]["model_id"], "PROVIDER-MODEL-IMPL020")
        self.assertFalse(packet["authority_boundary"]["model_provider_is_course_authority"])
        self.assertTrue(packet["authority_boundary"]["independent_course_validation_required"])

    def test_exact_operation_replay_does_not_recall_providers(self):
        first = self.capture()
        replay = self.capture()
        self.assertEqual(first, replay)
        self.assertEqual(self.research_calls, 1)
        self.assertEqual(self.model_calls, 1)

    def test_packet_digest_tamper_is_rejected(self):
        result = self.capture()
        packet = OpenGoalInputPacketService(self.repo).load(result["packet_id"])
        packet["standing"] = "COURSE_VERIFIED"
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_INPUT_PACKET_DIGEST_MISMATCH"):
            OpenGoalInputPacketService.validate_packet(packet)

    def test_research_capture_drift_is_rejected_even_with_recomputed_packet_digest_unavailable(self):
        result = self.capture()
        packet = OpenGoalInputPacketService(self.repo).load(result["packet_id"])
        packet["research_capture"]["claims"][0]["text"] += " tampered"
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_INPUT_PACKET_DIGEST_MISMATCH"):
            OpenGoalInputPacketService.validate_packet(packet)

    def test_model_self_verification_is_forbidden_at_admission(self):
        def bad_model(prompt):
            output = copy.deepcopy(self.base_trace["output"])
            output["validation_status"] = "VERIFIED"
            return output

        service = OpenGoalInputPacketService(self.repo)
        with self.assertRaisesRegex(ValueError, "MODEL_OUTPUT_SELF_VERIFICATION_FORBIDDEN"):
            service.capture_and_admit(
                operation_id="OP-IMPL020-BAD-MODEL",
                packet_id="PACKET-IMPL020-BAD-MODEL",
                desired_outcome=GOAL,
                research_capture_provider=self.research_provider,
                model_id="BAD-SELF-VERIFYING-MODEL",
                model_candidate_provider=bad_model,
            )

    def test_unsupported_research_goal_abstains_before_model_call(self):
        service = OpenGoalInputPacketService(self.repo)
        with self.assertRaisesRegex(ValueError, "LIVE_OPEN_GOAL_UNSUPPORTED_OR_INSUFFICIENT_RESEARCH"):
            service.capture_and_admit(
                operation_id="OP-IMPL020-UNSUPPORTED",
                packet_id="PACKET-IMPL020-UNSUPPORTED",
                desired_outcome="Learn Italian Renaissance painting conservation chemistry",
                research_capture_provider=self.research_provider,
                model_id="PROVIDER-MODEL-IMPL020",
                model_candidate_provider=self.model_provider,
            )
        self.assertEqual(self.research_calls, 1)
        self.assertEqual(self.model_calls, 0)

    def test_same_packet_identity_cannot_silently_rebind_changed_model_output(self):
        self.capture(operation_id="OP-IMPL020-FIRST", packet_id="PACKET-IMPL020-COLLIDE")

        def changed_model(prompt):
            output = copy.deepcopy(self.base_trace["output"])
            output["course_blueprint"]["lessons"][0]["title"] = "Changed provider candidate"
            return output

        with self.assertRaisesRegex(ValueError, "OBJECT_IDENTITY_COLLISION"):
            OpenGoalInputPacketService(self.repo).capture_and_admit(
                operation_id="OP-IMPL020-SECOND",
                packet_id="PACKET-IMPL020-COLLIDE",
                desired_outcome=GOAL,
                research_capture_provider=self.research_provider,
                model_id="PROVIDER-MODEL-IMPL020",
                model_candidate_provider=changed_model,
            )

    def test_packet_reconstructs_replay_ports(self):
        result = self.capture()
        packet = OpenGoalInputPacketService(self.repo).load(result["packet_id"])
        research_port, model_port = OpenGoalInputPacketService.ports_from_packet(packet)
        interpretation = research_port.interpret(GOAL)
        plan = research_port.plan(interpretation)
        dossier = research_port.acquire(GOAL, plan)
        pin = model_port.pin(desired_outcome=GOAL, dossier=dossier)
        self.assertEqual(pin["trace_digest"], packet["model_trace_digest"])
        self.assertEqual(pin["output_digest"], packet["model_output_digest"])


if __name__ == "__main__":
    unittest.main()
