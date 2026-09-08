from __future__ import annotations

import copy
from hashlib import sha256
from typing import Any, Callable, Dict, Optional, Tuple

from .live_open_goal import (
    CallableModelCapturePort,
    NormalizedLiveResearchPort,
    RecordedModelGenerationPort,
)
from .repository import Repository, canonical_json, digest


OPEN_GOAL_INPUT_PACKET_VERSION = "OPEN-GOAL-INPUT-PACKET-V1"
OPEN_GOAL_PROVIDER_PROMPT_VERSION = "OPEN-GOAL-PROVIDER-PROMPT-V1"
PACKET_STANDING = "SEALED_PROVIDER_INPUT_PACKET_NOT_COURSE_VERIFIED"

_MODEL_INSTRUCTION = (
    "Using only admitted research claims, generate a bounded course candidate with skills, lessons, "
    "practice, independent mastery, delayed retention, transfer, tutor probes, and an oracle descriptor. "
    "Do not mark the course verified; flag pedagogical judgments for review."
)


def _stable_id(prefix: str, value: Any, size: int = 16) -> str:
    return f"{prefix}-{sha256(canonical_json(value).encode('utf-8')).hexdigest()[:size].upper()}"


def _packet_digest(packet: Dict[str, Any]) -> str:
    unsigned = {k: v for k, v in packet.items() if k != "packet_digest"}
    return digest(unsigned)


class OpenGoalInputPacketService:
    """Seals provider research/model outputs before the open-goal runtime can consume them.

    Providers are acquisition transports only. This service does not approve a course,
    select mastery evidence, or allow a model-generated candidate to self-verify.
    """

    def __init__(self, repo: Repository):
        self.repo = repo

    def capture_and_admit(
        self,
        *,
        operation_id: str,
        packet_id: str,
        desired_outcome: str,
        research_capture_provider: Callable[[str], Dict[str, Any]],
        model_id: str,
        model_candidate_provider: Callable[[Dict[str, Any]], Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not operation_id:
            raise ValueError("OPERATION_ID_REQUIRED")
        if not packet_id:
            raise ValueError("PACKET_ID_REQUIRED")
        if not desired_outcome or not desired_outcome.strip():
            raise ValueError("DESIRED_OUTCOME_REQUIRED")
        if not model_id or not model_id.strip():
            raise ValueError("MODEL_ID_REQUIRED")
        if not callable(research_capture_provider) or not callable(model_candidate_provider):
            raise ValueError("PROVIDER_CALLABLE_REQUIRED")

        payload = {
            "packet_id": packet_id,
            "desired_outcome": desired_outcome,
            "model_id": model_id,
            "packet_version": OPEN_GOAL_INPUT_PACKET_VERSION,
            "prompt_version": OPEN_GOAL_PROVIDER_PROMPT_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        capture = copy.deepcopy(research_capture_provider(desired_outcome))
        research_port = NormalizedLiveResearchPort([capture])
        interpretation = research_port.interpret(desired_outcome)
        plan = research_port.plan(interpretation)
        dossier = research_port.acquire(desired_outcome, plan)
        evidence_digest = digest({"sources": dossier["sources"], "claims": dossier["claims"]})

        prompt = {
            "prompt_version": OPEN_GOAL_PROVIDER_PROMPT_VERSION,
            "instruction": _MODEL_INSTRUCTION,
            "goal": desired_outcome,
            "research_dossier_digest": evidence_digest,
            "required_claim_ids": sorted(c["claim_id"] for c in dossier["claims"]),
        }
        trace = CallableModelCapturePort(model_id, model_candidate_provider).capture(prompt, evidence_digest)
        model_port = RecordedModelGenerationPort([trace])
        model_pin = model_port.pin(desired_outcome=desired_outcome, dossier=dossier)

        packet = {
            "packet_id": packet_id,
            "packet_version": OPEN_GOAL_INPUT_PACKET_VERSION,
            "prompt_version": OPEN_GOAL_PROVIDER_PROMPT_VERSION,
            "desired_outcome": desired_outcome,
            "domain_key": interpretation["domain_key"],
            "research_capture": capture,
            "research_capture_digest": digest(capture),
            "research_evidence_digest": evidence_digest,
            "research_interpretation_digest": digest(interpretation),
            "research_plan_digest": digest(plan),
            "model_trace": trace,
            "model_trace_digest": trace["trace_digest"],
            "model_output_digest": trace["output_digest"],
            "model_pin": model_pin,
            "standing": PACKET_STANDING,
            "authority_boundary": {
                "research_provider_is_course_authority": False,
                "model_provider_is_course_authority": False,
                "model_provider_can_self_verify": False,
                "packet_admission_is_course_verification": False,
                "independent_course_validation_required": True,
                "learning_engine_remains_mastery_authority": True,
            },
        }
        packet["packet_digest"] = _packet_digest(packet)
        self.validate_packet(packet)
        self.repo.put_object("open_goal_input_packet", packet_id, 1, packet)

        result = {
            "packet_id": packet_id,
            "packet_digest": packet["packet_digest"],
            "packet_version": OPEN_GOAL_INPUT_PACKET_VERSION,
            "desired_outcome": desired_outcome,
            "domain_key": packet["domain_key"],
            "research_capture_digest": packet["research_capture_digest"],
            "research_evidence_digest": evidence_digest,
            "model_trace_digest": packet["model_trace_digest"],
            "model_output_digest": packet["model_output_digest"],
            "standing": PACKET_STANDING,
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("OpenGoalInputPacketAdmitted", packet_id, {
            "packet_digest": packet["packet_digest"],
            "domain_key": packet["domain_key"],
            "standing": PACKET_STANDING,
        })
        return result

    def load(self, packet_id: str) -> Dict[str, Any]:
        packet = self.repo.get_object("open_goal_input_packet", packet_id, 1)
        if packet is None:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_NOT_FOUND")
        self.validate_packet(packet)
        return packet

    @staticmethod
    def validate_packet(packet: Dict[str, Any]) -> None:
        required = {
            "packet_id", "packet_version", "prompt_version", "desired_outcome", "domain_key",
            "research_capture", "research_capture_digest", "research_evidence_digest",
            "research_interpretation_digest", "research_plan_digest", "model_trace",
            "model_trace_digest", "model_output_digest", "model_pin", "standing",
            "authority_boundary", "packet_digest",
        }
        missing = sorted(required - set(packet))
        if missing:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_INCOMPLETE:" + ",".join(missing))
        if packet["packet_version"] != OPEN_GOAL_INPUT_PACKET_VERSION:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_VERSION_UNSUPPORTED")
        if packet["prompt_version"] != OPEN_GOAL_PROVIDER_PROMPT_VERSION:
            raise ValueError("OPEN_GOAL_PROVIDER_PROMPT_VERSION_UNSUPPORTED")
        if packet["standing"] != PACKET_STANDING:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_STANDING_INVALID")
        if _packet_digest(packet) != packet["packet_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_DIGEST_MISMATCH")
        if digest(packet["research_capture"]) != packet["research_capture_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_RESEARCH_CAPTURE_DRIFT")
        trace = packet["model_trace"]
        if trace.get("trace_digest") != packet["model_trace_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_MODEL_TRACE_REF_DRIFT")
        if trace.get("output_digest") != packet["model_output_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_MODEL_OUTPUT_REF_DRIFT")

        research_port = NormalizedLiveResearchPort([packet["research_capture"]])
        interpretation = research_port.interpret(packet["desired_outcome"])
        if digest(interpretation) != packet["research_interpretation_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_INTERPRETATION_DRIFT")
        plan = research_port.plan(interpretation)
        if digest(plan) != packet["research_plan_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_RESEARCH_PLAN_DRIFT")
        dossier = research_port.acquire(packet["desired_outcome"], plan)
        evidence_digest = digest({"sources": dossier["sources"], "claims": dossier["claims"]})
        if evidence_digest != packet["research_evidence_digest"]:
            raise ValueError("OPEN_GOAL_INPUT_PACKET_RESEARCH_EVIDENCE_DRIFT")

        model_port = RecordedModelGenerationPort([trace])
        pin = model_port.pin(desired_outcome=packet["desired_outcome"], dossier=dossier)
        if digest(pin) != digest(packet["model_pin"]):
            raise ValueError("OPEN_GOAL_INPUT_PACKET_MODEL_PIN_DRIFT")

        boundary = packet["authority_boundary"]
        if boundary.get("research_provider_is_course_authority") is not False:
            raise ValueError("RESEARCH_PROVIDER_AUTHORITY_ESCALATION")
        if boundary.get("model_provider_is_course_authority") is not False:
            raise ValueError("MODEL_PROVIDER_AUTHORITY_ESCALATION")
        if boundary.get("model_provider_can_self_verify") is not False:
            raise ValueError("MODEL_PROVIDER_SELF_VERIFICATION_FORBIDDEN")
        if boundary.get("packet_admission_is_course_verification") is not False:
            raise ValueError("PACKET_ADMISSION_SELF_APPROVAL_FORBIDDEN")
        if boundary.get("independent_course_validation_required") is not True:
            raise ValueError("INDEPENDENT_COURSE_VALIDATION_REQUIRED")
        if boundary.get("learning_engine_remains_mastery_authority") is not True:
            raise ValueError("LEARNING_MASTERY_AUTHORITY_REQUIRED")

    @staticmethod
    def ports_from_packet(packet: Dict[str, Any]) -> Tuple[NormalizedLiveResearchPort, RecordedModelGenerationPort]:
        OpenGoalInputPacketService.validate_packet(packet)
        return (
            NormalizedLiveResearchPort([copy.deepcopy(packet["research_capture"])]),
            RecordedModelGenerationPort([copy.deepcopy(packet["model_trace"])]),
        )
