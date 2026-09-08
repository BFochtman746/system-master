from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List, Optional, Sequence

from .live_open_goal import NormalizedLiveResearchPort
from .provider_acquisition import OpenGoalInputPacketService
from .provider_multi_candidate_runtime import start_provider_multi_candidate_adaptive_entry
from .repository import Repository, digest


PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION = "OPEN-GOAL-PROVIDER-MULTI-SAMPLE-ACQUISITION-V1"
PROVIDER_MULTI_SAMPLE_BATCH_VERSION = "OPEN-GOAL-PROVIDER-MULTI-SAMPLE-BATCH-V1"
PROVIDER_MULTI_SAMPLE_STANDING = "SEALED_PROVIDER_MULTI_SAMPLE_PACKET_SET_NOT_SELECTED_OR_VERIFIED"
MIN_PROVIDER_SAMPLES = 2
MAX_PROVIDER_SAMPLES = 8
_BATCH_INTENT_KIND = "open_goal_provider_multi_sample_batch_intent"
_BATCH_RESEARCH_KIND = "open_goal_provider_multi_sample_research_capture"
_BATCH_KIND = "open_goal_provider_multi_sample_batch"


def _inject(stage: Optional[str], expected: str) -> None:
    if stage == expected:
        raise RuntimeError("INJECTED_CRASH:" + expected)


class ProviderMultiSampleAcquisitionService:
    """Acquire one research capture and a bounded same-prompt stochastic model sample set.

    This service is acquisition authority only. It never ranks candidates, verifies a
    course, or mints learning evidence. Each model sample is admitted through the
    existing IMPL-020 packet boundary before the next provider call is allowed. A
    restart therefore reuses every durable sample instead of silently resampling it.
    """

    def __init__(self, repo: Repository):
        self.repo = repo

    def acquire_and_admit(
        self,
        *,
        operation_id: str,
        batch_id: str,
        desired_outcome: str,
        sample_count: int,
        model_id: str,
        research_capture_provider: Callable[[str], Dict[str, Any]],
        model_candidate_provider: Callable[[Dict[str, Any], int], Dict[str, Any]],
        inject_crash_after: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not operation_id:
            raise ValueError("OPERATION_ID_REQUIRED")
        if not batch_id:
            raise ValueError("PROVIDER_MULTI_SAMPLE_BATCH_ID_REQUIRED")
        if not desired_outcome or not desired_outcome.strip():
            raise ValueError("DESIRED_OUTCOME_REQUIRED")
        if not isinstance(sample_count, int) or isinstance(sample_count, bool):
            raise ValueError("PROVIDER_MULTI_SAMPLE_COUNT_INVALID")
        if sample_count < MIN_PROVIDER_SAMPLES or sample_count > MAX_PROVIDER_SAMPLES:
            raise ValueError("PROVIDER_MULTI_SAMPLE_COUNT_OUT_OF_BOUNDS")
        if not model_id or not model_id.strip():
            raise ValueError("MODEL_ID_REQUIRED")
        if not callable(research_capture_provider) or not callable(model_candidate_provider):
            raise ValueError("PROVIDER_CALLABLE_REQUIRED")

        payload = {
            "batch_id": batch_id,
            "desired_outcome": desired_outcome,
            "sample_count": sample_count,
            "model_id": model_id,
            "acquisition_version": PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION,
            "batch_version": PROVIDER_MULTI_SAMPLE_BATCH_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior

        # Freeze batch intent before any non-deterministic provider call. Reusing the
        # same batch identity with different sampling semantics must fail closed.
        self.repo.put_object(_BATCH_INTENT_KIND, batch_id, 1, copy.deepcopy(payload))

        research_checkpoint = self.repo.get_object(_BATCH_RESEARCH_KIND, batch_id, 1)
        if research_checkpoint is None:
            capture = copy.deepcopy(research_capture_provider(desired_outcome))
            research_port = NormalizedLiveResearchPort([capture])
            interpretation = research_port.interpret(desired_outcome)
            checkpoint = {
                "batch_id": batch_id,
                "desired_outcome": desired_outcome,
                "capture": capture,
                "capture_digest": digest(capture),
                "domain_key": interpretation["domain_key"],
            }
            self.repo.put_object(_BATCH_RESEARCH_KIND, batch_id, 1, checkpoint)
            _inject(inject_crash_after, "RESEARCH_CAPTURE_STORED")
        else:
            if research_checkpoint.get("desired_outcome") != desired_outcome:
                raise ValueError("PROVIDER_MULTI_SAMPLE_RESEARCH_GOAL_MISMATCH")
            capture = copy.deepcopy(research_checkpoint["capture"])
            if digest(capture) != research_checkpoint.get("capture_digest"):
                raise ValueError("PROVIDER_MULTI_SAMPLE_RESEARCH_CAPTURE_DRIFT")
            research_port = NormalizedLiveResearchPort([capture])
            interpretation = research_port.interpret(desired_outcome)
            if interpretation["domain_key"] != research_checkpoint.get("domain_key"):
                raise ValueError("PROVIDER_MULTI_SAMPLE_RESEARCH_DOMAIN_DRIFT")

        # Derive the normalized research identity once. Every packet is required to
        # preserve this identity, and every model invocation receives the same prompt
        # shape from the IMPL-020 packet admission service.
        plan = research_port.plan(interpretation)
        dossier = research_port.acquire(desired_outcome, plan)
        research_evidence_digest = digest({"sources": dossier["sources"], "claims": dossier["claims"]})

        packet_service = OpenGoalInputPacketService(self.repo)
        packet_ids: List[str] = []
        for sample_index in range(sample_count):
            packet_id = f"{batch_id}-S{sample_index + 1:02d}"
            packet_ids.append(packet_id)

            def sample_provider(prompt: Dict[str, Any], index: int = sample_index) -> Dict[str, Any]:
                return copy.deepcopy(model_candidate_provider(copy.deepcopy(prompt), index))

            packet_service.capture_and_admit(
                operation_id=f"{operation_id}:SAMPLE:{sample_index + 1:02d}",
                packet_id=packet_id,
                desired_outcome=desired_outcome,
                research_capture_provider=lambda goal, c=capture: copy.deepcopy(c),
                model_id=model_id,
                model_candidate_provider=sample_provider,
            )
            # Crash only after the packet and its operation result are durable. On
            # restart this sample must be reused and only later samples may execute.
            _inject(inject_crash_after, f"SAMPLE_{sample_index + 1}_STORED")

        packets = [packet_service.load(packet_id) for packet_id in packet_ids]
        research_ids = {packet["research_evidence_digest"] for packet in packets}
        prompt_digests = {packet["model_trace"]["prompt_digest"] for packet in packets}
        model_ids = {packet["model_trace"]["model_id"] for packet in packets}
        goals = {packet["desired_outcome"] for packet in packets}
        domains = {packet["domain_key"] for packet in packets}
        output_digests = [packet["model_output_digest"] for packet in packets]
        trace_ids = [packet["model_trace"]["generation_trace_id"] for packet in packets]

        if research_ids != {research_evidence_digest}:
            raise ValueError("PROVIDER_MULTI_SAMPLE_RESEARCH_EVIDENCE_MISMATCH")
        if len(prompt_digests) != 1:
            raise ValueError("PROVIDER_MULTI_SAMPLE_PROMPT_MISMATCH")
        if model_ids != {model_id}:
            raise ValueError("PROVIDER_MULTI_SAMPLE_MODEL_ID_MISMATCH")
        if goals != {desired_outcome}:
            raise ValueError("PROVIDER_MULTI_SAMPLE_GOAL_MISMATCH")
        if domains != {interpretation["domain_key"]}:
            raise ValueError("PROVIDER_MULTI_SAMPLE_DOMAIN_MISMATCH")
        if len(set(output_digests)) != len(output_digests):
            raise ValueError("PROVIDER_MULTI_SAMPLE_DUPLICATE_OUTPUT")
        if len(set(trace_ids)) != len(trace_ids):
            raise ValueError("PROVIDER_MULTI_SAMPLE_DUPLICATE_TRACE")

        manifest = [
            {
                "sample_index": index,
                "packet_id": packet["packet_id"],
                "packet_digest": packet["packet_digest"],
                "model_trace_id": packet["model_trace"]["generation_trace_id"],
                "model_trace_digest": packet["model_trace_digest"],
                "model_output_digest": packet["model_output_digest"],
            }
            for index, packet in enumerate(packets)
        ]
        batch = {
            "batch_id": batch_id,
            "batch_version": PROVIDER_MULTI_SAMPLE_BATCH_VERSION,
            "acquisition_version": PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION,
            "desired_outcome": desired_outcome,
            "domain_key": interpretation["domain_key"],
            "research_capture_digest": digest(capture),
            "research_evidence_digest": research_evidence_digest,
            "prompt_digest": next(iter(prompt_digests)),
            "model_id": model_id,
            "sample_count": sample_count,
            "manifest": manifest,
            "standing": PROVIDER_MULTI_SAMPLE_STANDING,
            "authority_boundary": {
                "research_provider_called_once_per_batch": True,
                "each_model_sample_sealed_before_next_call": True,
                "automatic_resample_after_durable_sample": False,
                "automatic_sampling_until_winner": False,
                "provider_is_selection_authority": False,
                "batch_admission_is_course_verification": False,
                "independent_selection_required": True,
                "learning_engine_remains_mastery_authority": True,
            },
        }
        batch["batch_digest"] = digest(batch)
        self.repo.put_object(_BATCH_KIND, batch_id, 1, batch)

        result = {
            "batch_id": batch_id,
            "batch_digest": batch["batch_digest"],
            "batch_version": PROVIDER_MULTI_SAMPLE_BATCH_VERSION,
            "acquisition_version": PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION,
            "desired_outcome": desired_outcome,
            "domain_key": interpretation["domain_key"],
            "research_evidence_digest": research_evidence_digest,
            "prompt_digest": batch["prompt_digest"],
            "model_id": model_id,
            "sample_count": sample_count,
            "packet_ids": list(packet_ids),
            "model_output_digests": list(output_digests),
            "standing": PROVIDER_MULTI_SAMPLE_STANDING,
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("ProviderMultiSampleBatchAdmitted", batch_id, {
            "batch_digest": batch["batch_digest"],
            "sample_count": sample_count,
            "standing": PROVIDER_MULTI_SAMPLE_STANDING,
        })
        return result

    def load(self, batch_id: str) -> Dict[str, Any]:
        batch = self.repo.get_object(_BATCH_KIND, batch_id, 1)
        if batch is None:
            raise ValueError("PROVIDER_MULTI_SAMPLE_BATCH_NOT_FOUND")
        unsigned = {key: value for key, value in batch.items() if key != "batch_digest"}
        if digest(unsigned) != batch.get("batch_digest"):
            raise ValueError("PROVIDER_MULTI_SAMPLE_BATCH_DIGEST_MISMATCH")
        if batch.get("standing") != PROVIDER_MULTI_SAMPLE_STANDING:
            raise ValueError("PROVIDER_MULTI_SAMPLE_BATCH_STANDING_INVALID")
        if not (MIN_PROVIDER_SAMPLES <= batch.get("sample_count", 0) <= MAX_PROVIDER_SAMPLES):
            raise ValueError("PROVIDER_MULTI_SAMPLE_BATCH_COUNT_INVALID")
        packet_service = OpenGoalInputPacketService(self.repo)
        for entry in batch.get("manifest", []):
            packet = packet_service.load(entry["packet_id"])
            if packet["packet_digest"] != entry["packet_digest"]:
                raise ValueError("PROVIDER_MULTI_SAMPLE_PACKET_DRIFT")
            if packet["model_trace_digest"] != entry["model_trace_digest"]:
                raise ValueError("PROVIDER_MULTI_SAMPLE_TRACE_DRIFT")
            if packet["model_output_digest"] != entry["model_output_digest"]:
                raise ValueError("PROVIDER_MULTI_SAMPLE_OUTPUT_DRIFT")
        return batch


def acquire_and_start_provider_multi_sample_adaptive_entry(
    *,
    repo: Repository,
    operation_id: str,
    batch_id: str,
    request_id: str,
    learner_id: str,
    desired_outcome: str,
    sample_count: int,
    model_id: str,
    research_capture_provider: Callable[[str], Dict[str, Any]],
    model_candidate_provider: Callable[[Dict[str, Any], int], Dict[str, Any]],
    claimed_skill_ids: Sequence[str],
    now: int,
    inject_crash_after: Optional[str] = None,
) -> Dict[str, Any]:
    acquisition = ProviderMultiSampleAcquisitionService(repo).acquire_and_admit(
        operation_id=operation_id,
        batch_id=batch_id,
        desired_outcome=desired_outcome,
        sample_count=sample_count,
        model_id=model_id,
        research_capture_provider=research_capture_provider,
        model_candidate_provider=model_candidate_provider,
        inject_crash_after=inject_crash_after,
    )
    runtime = start_provider_multi_candidate_adaptive_entry(
        repo=repo,
        request_id=request_id,
        learner_id=learner_id,
        packet_ids=acquisition["packet_ids"],
        claimed_skill_ids=list(claimed_skill_ids),
        now=now,
    )
    out = dict(runtime)
    out.update({
        "provider_multi_sample_acquisition_version": PROVIDER_MULTI_SAMPLE_ACQUISITION_VERSION,
        "provider_multi_sample_batch_version": PROVIDER_MULTI_SAMPLE_BATCH_VERSION,
        "provider_multi_sample_batch_id": acquisition["batch_id"],
        "provider_multi_sample_batch_digest": acquisition["batch_digest"],
        "provider_multi_sample_count": acquisition["sample_count"],
        "provider_multi_sample_standing": acquisition["standing"],
    })
    return out
