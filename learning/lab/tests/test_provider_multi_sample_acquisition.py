from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from learning_lab.provider_multi_sample_acquisition import (
    MAX_PROVIDER_SAMPLES,
    PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION,
    PROVIDER_MULTI_SAMPLE_STANDING,
    ProviderMultiSampleAcquisitionService,
    acquire_and_start_provider_multi_sample_adaptive_entry,
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


class ProviderMultiSampleAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
        fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
        self.traces = {trace["generation_trace_id"]: trace for trace in fixture["traces"]}
        self.research_calls = []
        self.model_calls = []

    def tearDown(self):
        self.td.cleanup()

    def research_provider(self, goal):
        self.research_calls.append(goal)
        return copy.deepcopy(self.capture)

    def model_provider_for(self, trace_ids):
        outputs = [copy.deepcopy(self.traces[trace_id]["output"]) for trace_id in trace_ids]

        def provider(prompt, sample_index):
            self.model_calls.append((sample_index, copy.deepcopy(prompt)))
            return copy.deepcopy(outputs[sample_index])

        return provider

    def acquire(self, trace_ids=(A, B, C), operation_id="OP-022", batch_id="BATCH-022", crash=None):
        return ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
            operation_id=operation_id,
            batch_id=batch_id,
            desired_outcome=GOAL,
            sample_count=len(trace_ids),
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=self.research_provider,
            model_candidate_provider=self.model_provider_for(trace_ids),
            inject_crash_after=crash,
        )

    def test_one_research_call_and_n_same_prompt_model_samples(self):
        out = self.acquire((A, B, C))
        self.assertEqual(out["acquisition_version"], PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION)
        self.assertEqual(out["standing"], PROVIDER_MULTI_SAMPLE_STANDING)
        self.assertEqual(len(self.research_calls), 1)
        self.assertEqual([index for index, _ in self.model_calls], [0, 1, 2])
        self.assertEqual(len({json.dumps(prompt, sort_keys=True) for _, prompt in self.model_calls}), 1)
        self.assertEqual(len(out["packet_ids"]), 3)
        packets = [self.repo.get_object("open_goal_input_packet", packet_id, 1) for packet_id in out["packet_ids"]]
        self.assertEqual(len({packet["research_evidence_digest"] for packet in packets}), 1)
        self.assertEqual(len({packet["model_trace"]["prompt_digest"] for packet in packets}), 1)
        self.assertEqual(len({packet["model_output_digest"] for packet in packets}), 3)

    def test_exact_completed_replay_invokes_no_provider(self):
        first = self.acquire((A, B, C), operation_id="OP-REPLAY", batch_id="BATCH-REPLAY")
        research_before = len(self.research_calls)
        model_before = len(self.model_calls)

        def forbidden_research(goal):
            raise AssertionError("research provider must not be called on exact replay")

        def forbidden_model(prompt, index):
            raise AssertionError("model provider must not be called on exact replay")

        replay = ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
            operation_id="OP-REPLAY",
            batch_id="BATCH-REPLAY",
            desired_outcome=GOAL,
            sample_count=3,
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=forbidden_research,
            model_candidate_provider=forbidden_model,
        )
        self.assertEqual(first, replay)
        self.assertEqual(len(self.research_calls), research_before)
        self.assertEqual(len(self.model_calls), model_before)

    def test_crash_after_shared_research_never_reacquires_research(self):
        with self.assertRaisesRegex(RuntimeError, "RESEARCH_CAPTURE_STORED"):
            self.acquire((A, B, C), operation_id="OP-CRASH-R", batch_id="BATCH-CRASH-R", crash="RESEARCH_CAPTURE_STORED")
        self.assertEqual(len(self.research_calls), 1)
        self.assertEqual(len(self.model_calls), 0)

        def forbidden_research(goal):
            raise AssertionError("durable batch research must be reused")

        outputs = [copy.deepcopy(self.traces[x]["output"]) for x in (A, B, C)]
        resumed_calls = []

        def model_provider(prompt, index):
            resumed_calls.append(index)
            return copy.deepcopy(outputs[index])

        out = ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
            operation_id="OP-CRASH-R",
            batch_id="BATCH-CRASH-R",
            desired_outcome=GOAL,
            sample_count=3,
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=forbidden_research,
            model_candidate_provider=model_provider,
        )
        self.assertEqual(out["sample_count"], 3)
        self.assertEqual(resumed_calls, [0, 1, 2])

    def test_crash_after_sample_one_does_not_resample_durable_sample(self):
        with self.assertRaisesRegex(RuntimeError, "SAMPLE_1_STORED"):
            self.acquire((A, B, C), operation_id="OP-CRASH-S1", batch_id="BATCH-CRASH-S1", crash="SAMPLE_1_STORED")
        self.assertEqual(len(self.research_calls), 1)
        self.assertEqual([index for index, _ in self.model_calls], [0])

        outputs = [copy.deepcopy(self.traces[x]["output"]) for x in (A, B, C)]
        resumed_model_calls = []

        def forbidden_research(goal):
            raise AssertionError("shared research must not be reacquired")

        def resumed_model(prompt, index):
            resumed_model_calls.append(index)
            return copy.deepcopy(outputs[index])

        out = ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
            operation_id="OP-CRASH-S1",
            batch_id="BATCH-CRASH-S1",
            desired_outcome=GOAL,
            sample_count=3,
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=forbidden_research,
            model_candidate_provider=resumed_model,
        )
        self.assertEqual(out["sample_count"], 3)
        self.assertEqual(resumed_model_calls, [1, 2])

    def test_crash_after_sample_two_only_calls_final_missing_sample(self):
        with self.assertRaisesRegex(RuntimeError, "SAMPLE_2_STORED"):
            self.acquire((A, B, C), operation_id="OP-CRASH-S2", batch_id="BATCH-CRASH-S2", crash="SAMPLE_2_STORED")
        self.assertEqual([index for index, _ in self.model_calls], [0, 1])

        outputs = [copy.deepcopy(self.traces[x]["output"]) for x in (A, B, C)]
        resumed = []
        out = ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
            operation_id="OP-CRASH-S2",
            batch_id="BATCH-CRASH-S2",
            desired_outcome=GOAL,
            sample_count=3,
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=lambda goal: (_ for _ in ()).throw(AssertionError("research resampled")),
            model_candidate_provider=lambda prompt, index: (resumed.append(index), copy.deepcopy(outputs[index]))[1],
        )
        self.assertEqual(out["sample_count"], 3)
        self.assertEqual(resumed, [2])

    def test_duplicate_model_outputs_fail_closed_without_hidden_resampling(self):
        with self.assertRaisesRegex(ValueError, "PROVIDER_MULTI_SAMPLE_DUPLICATE_OUTPUT"):
            self.acquire((A, A), operation_id="OP-DUP", batch_id="BATCH-DUP")
        self.assertEqual(len(self.research_calls), 1)
        self.assertEqual([index for index, _ in self.model_calls], [0, 1])
        self.assertIsNone(self.repo.get_object("open_goal_provider_multi_sample_batch", "BATCH-DUP", 1))

        before = len(self.model_calls)
        with self.assertRaisesRegex(ValueError, "PROVIDER_MULTI_SAMPLE_DUPLICATE_OUTPUT"):
            self.acquire((A, A), operation_id="OP-DUP", batch_id="BATCH-DUP")
        self.assertEqual(len(self.model_calls), before)

    def test_sample_count_is_bounded(self):
        service = ProviderMultiSampleAcquisitionService(self.repo)
        for count in (0, 1, MAX_PROVIDER_SAMPLES + 1):
            with self.assertRaisesRegex(ValueError, "COUNT_OUT_OF_BOUNDS"):
                service.acquire_and_admit(
                    operation_id=f"OP-COUNT-{count}",
                    batch_id=f"BATCH-COUNT-{count}",
                    desired_outcome=GOAL,
                    sample_count=count,
                    model_id="CONTROLLED-PROVIDER-IMPL022",
                    research_capture_provider=self.research_provider,
                    model_candidate_provider=lambda prompt, index: copy.deepcopy(self.traces[A]["output"]),
                )
        self.assertEqual(self.research_calls, [])
        self.assertEqual(self.model_calls, [])

    def test_acquisition_handoff_selects_then_enters_existing_adaptive_journey(self):
        out = acquire_and_start_provider_multi_sample_adaptive_entry(
            repo=self.repo,
            operation_id="OP-HANDOFF-SELECT",
            batch_id="BATCH-HANDOFF-SELECT",
            request_id="REQ-HANDOFF-SELECT",
            learner_id="LRN-022",
            desired_outcome=GOAL,
            sample_count=3,
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=self.research_provider,
            model_candidate_provider=self.model_provider_for((A, B, C)),
            claimed_skill_ids=[],
            now=0,
        )
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["selection_decision"], "SELECT")
        self.assertTrue(out["journey_created"])
        self.assertIsNotNone(out["course_id"])
        self.assertEqual(out["provider_multi_sample_count"], 3)
        self.assertFalse(out["model_ranking_used"])
        self.assertFalse(out["scalar_ranking_used"])

    def test_acquisition_handoff_tie_abstains_without_course_or_journey(self):
        out = acquire_and_start_provider_multi_sample_adaptive_entry(
            repo=self.repo,
            operation_id="OP-HANDOFF-ABSTAIN",
            batch_id="BATCH-HANDOFF-ABSTAIN",
            request_id="REQ-HANDOFF-ABSTAIN",
            learner_id="LRN-022",
            desired_outcome=GOAL,
            sample_count=2,
            model_id="CONTROLLED-PROVIDER-IMPL022",
            research_capture_provider=self.research_provider,
            model_candidate_provider=self.model_provider_for((A, D)),
            claimed_skill_ids=[],
            now=0,
        )
        self.assertEqual(out["status"], "ABSTAIN")
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertFalse(out["journey_created"])
        self.assertIsNone(out["course_id"])
        self.assertIn("NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE", out["selection_reason_codes"])

    def test_changed_completed_operation_conflicts_before_provider_calls(self):
        self.acquire((A, B), operation_id="OP-CONFLICT", batch_id="BATCH-CONFLICT")
        research_before = len(self.research_calls)
        model_before = len(self.model_calls)
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
                operation_id="OP-CONFLICT",
                batch_id="BATCH-CONFLICT",
                desired_outcome=GOAL,
                sample_count=3,
                model_id="CONTROLLED-PROVIDER-IMPL022",
                research_capture_provider=self.research_provider,
                model_candidate_provider=self.model_provider_for((A, B, C)),
            )
        self.assertEqual(len(self.research_calls), research_before)
        self.assertEqual(len(self.model_calls), model_before)


if __name__ == "__main__":
    unittest.main()
