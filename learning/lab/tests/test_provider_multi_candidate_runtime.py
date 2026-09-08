from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from learning_lab.provider_acquisition import OpenGoalInputPacketService
from learning_lab.provider_multi_candidate_runtime import (
    PROVIDER_MULTI_CANDIDATE_RUNTIME_VERSION,
    start_provider_multi_candidate_adaptive_entry,
)
from learning_lab.repository import Repository


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"


class ProviderMultiCandidateRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
        fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
        self.traces = {x["generation_trace_id"]: x for x in fixture["traces"]}
        self.packet_results = {}

    def tearDown(self):
        self.td.cleanup()

    def admit(
        self,
        packet_id: str,
        trace_id: str,
        *,
        model_id: str = "PROVIDER-MODEL-IMPL021",
        capture=None,
        mutate_output=None,
    ):
        source_capture = copy.deepcopy(capture if capture is not None else self.capture)
        output = copy.deepcopy(self.traces[trace_id]["output"])
        if mutate_output is not None:
            mutate_output(output)

        result = OpenGoalInputPacketService(self.repo).capture_and_admit(
            operation_id=f"ADMIT:{packet_id}",
            packet_id=packet_id,
            desired_outcome=GOAL,
            research_capture_provider=lambda goal: copy.deepcopy(source_capture),
            model_id=model_id,
            model_candidate_provider=lambda prompt: copy.deepcopy(output),
        )
        self.packet_results[packet_id] = result
        return result

    def run_runtime(self, packet_ids, request_id="REQ-IMPL021", claimed=None):
        return start_provider_multi_candidate_adaptive_entry(
            repo=self.repo,
            request_id=request_id,
            learner_id="LRN-IMPL021",
            packet_ids=list(packet_ids),
            claimed_skill_ids=list(claimed or []),
            now=0,
        )

    def test_admitted_packets_select_independently_and_enter_adaptive_journey(self):
        self.admit("PACKET-A", A)
        self.admit("PACKET-B", B)
        self.admit("PACKET-C", C)
        out = self.run_runtime(["PACKET-A", "PACKET-B", "PACKET-C"], claimed=["S-PY-DICTCOMP"])
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["provider_multi_candidate_runtime_version"], PROVIDER_MULTI_CANDIDATE_RUNTIME_VERSION)
        self.assertEqual(out["selection_decision"], "SELECT")
        self.assertEqual(out["selected_packet_id"], "PACKET-A")
        self.assertEqual(out["selected_model_output_digest"], self.packet_results["PACKET-A"]["model_output_digest"])
        self.assertTrue(out["journey_created"])
        self.assertEqual(out["next_action"]["action_type"], "TUTOR_INSTRUCTION")
        self.assertEqual(out["next_action"]["skill_id"], "S-PY-LISTCOMP")
        self.assertFalse(out["model_ranking_used"])
        self.assertFalse(out["scalar_ranking_used"])
        self.assertEqual(self.repo.count_objects("course"), 1)

    def test_packet_order_cannot_change_selection_or_course(self):
        self.admit("PACKET-A", A)
        self.admit("PACKET-B", B)
        self.admit("PACKET-C", C)
        first = self.run_runtime(["PACKET-B", "PACKET-C", "PACKET-A"], request_id="REQ-ORDER-1")
        second = self.run_runtime(["PACKET-C", "PACKET-A", "PACKET-B"], request_id="REQ-ORDER-2")
        self.assertEqual(first["selected_packet_id"], "PACKET-A")
        self.assertEqual(first["selected_model_output_digest"], second["selected_model_output_digest"])
        self.assertEqual(first["packet_set_digest"], second["packet_set_digest"])
        self.assertEqual(first["candidate_set_digest"], second["candidate_set_digest"])
        self.assertEqual(first["course_id"], second["course_id"])

    def test_tied_packets_abstain_without_course_or_journey(self):
        self.admit("PACKET-A", A)
        self.admit("PACKET-D", D)
        out = self.run_runtime(["PACKET-D", "PACKET-A"])
        self.assertEqual(out["status"], "ABSTAIN")
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertIn("NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE", out["selection_reason_codes"])
        self.assertIsNone(out["course_id"])
        self.assertFalse(out["journey_created"])
        self.assertFalse(out["model_ranking_used"])
        self.assertFalse(out["scalar_ranking_used"])
        self.assertEqual(self.repo.count_objects("course"), 0)

    def test_weak_survivor_does_not_win_when_stronger_candidate_is_invalid(self):
        self.admit("PACKET-B", B)
        self.admit("PACKET-C", C)
        out = self.run_runtime(["PACKET-B", "PACKET-C"])
        self.assertEqual(out["status"], "ABSTAIN")
        self.assertEqual(out["selection_reason_codes"], ["NO_SELECTION_ELIGIBLE_CANDIDATES"])
        self.assertEqual(self.repo.count_objects("course"), 0)

    def test_duplicate_provider_outputs_do_not_count_as_two_candidates(self):
        self.admit("PACKET-A1", A)
        self.admit("PACKET-A2", A)
        with self.assertRaisesRegex(ValueError, "PROVIDER_MULTI_CANDIDATE_DUPLICATE_OUTPUT"):
            self.run_runtime(["PACKET-A1", "PACKET-A2"])
        self.assertEqual(self.repo.count_objects("course"), 0)

    def test_mixed_model_provider_identity_fails_before_selection(self):
        self.admit("PACKET-A", A, model_id="MODEL-ONE")
        self.admit("PACKET-B", B, model_id="MODEL-TWO")
        with self.assertRaisesRegex(ValueError, "PROVIDER_MULTI_CANDIDATE_MODEL_ID_MISMATCH"):
            self.run_runtime(["PACKET-A", "PACKET-B"])
        self.assertEqual(self.repo.count_objects("candidate_selection_decision"), 0)

    def test_mixed_research_evidence_fails_before_selection(self):
        self.admit("PACKET-A", A)
        changed = copy.deepcopy(self.capture)
        changed["claims"][0]["text"] += " Updated provider wording."
        changed.pop("normalized_evidence_digest", None)
        self.admit("PACKET-B", B, capture=changed)
        with self.assertRaisesRegex(ValueError, "PROVIDER_MULTI_CANDIDATE_RESEARCH_EVIDENCE_MISMATCH"):
            self.run_runtime(["PACKET-A", "PACKET-B"])
        self.assertEqual(self.repo.count_objects("candidate_selection_decision"), 0)

    def test_unadmitted_packet_fails_closed(self):
        self.admit("PACKET-A", A)
        with self.assertRaisesRegex(ValueError, "OPEN_GOAL_INPUT_PACKET_NOT_FOUND"):
            self.run_runtime(["PACKET-A", "PACKET-MISSING"])

    def test_model_self_ranking_is_rejected_at_multi_candidate_boundary(self):
        self.admit("PACKET-B", B)
        self.admit("PACKET-RANK", A, mutate_output=lambda out: out.__setitem__("quality_score", 100))
        with self.assertRaisesRegex(ValueError, "MODEL_CANDIDATE_SELF_RANKING_FORBIDDEN"):
            self.run_runtime(["PACKET-RANK", "PACKET-B"])
        self.assertEqual(self.repo.count_objects("course"), 0)

    def test_exact_runtime_replay_is_stable(self):
        self.admit("PACKET-A", A)
        self.admit("PACKET-B", B)
        self.admit("PACKET-C", C)
        first = self.run_runtime(["PACKET-A", "PACKET-B", "PACKET-C"], request_id="REQ-REPLAY")
        replay = self.run_runtime(["PACKET-A", "PACKET-B", "PACKET-C"], request_id="REQ-REPLAY")
        self.assertEqual(first, replay)
        self.assertEqual(self.repo.count_objects("course"), 1)
        self.assertEqual(self.repo.count_objects("candidate_selection_decision"), 1)

    def test_different_packet_sets_get_distinct_course_lineage(self):
        self.admit("PACKET-A", A)
        self.admit("PACKET-B", B)
        self.admit("PACKET-C", C)
        first = self.run_runtime(["PACKET-A", "PACKET-B"], request_id="REQ-SET-AB")
        second = self.run_runtime(["PACKET-A", "PACKET-B", "PACKET-C"], request_id="REQ-SET-ABC")
        self.assertEqual(first["status"], "PASS")
        self.assertEqual(second["status"], "PASS")
        self.assertNotEqual(first["packet_set_digest"], second["packet_set_digest"])
        self.assertNotEqual(first["course_id"], second["course_id"])
        self.assertEqual(first["selected_packet_id"], "PACKET-A")
        self.assertEqual(second["selected_packet_id"], "PACKET-A")


if __name__ == "__main__":
    unittest.main()
