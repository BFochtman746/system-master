from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Protocol


ALLOWED_STATUSES = {"ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"}


@dataclass(frozen=True)
class ExtractionRequest:
    case_id: str
    task: str
    authorized_source_text: str
    source_sha256: str

    @staticmethod
    def from_case(case: dict) -> "ExtractionRequest":
        text = str(case.get("synthetic_source", ""))
        if not text:
            raise ValueError("authorized source text required")
        digest = sha256(text.encode("utf-8")).hexdigest()
        return ExtractionRequest(
            case_id=str(case["case_id"]),
            task=str(case["task"]),
            authorized_source_text=text,
            source_sha256=digest,
        )


class ExtractorProvider(Protocol):
    provider_id: str

    def extract(self, request: ExtractionRequest) -> dict:
        ...


def validate_provider_output(request: ExtractionRequest, payload: dict) -> dict:
    if payload.get("case_id") != request.case_id:
        raise ValueError("provider case_id mismatch")
    if payload.get("task") != request.task:
        raise ValueError("provider task mismatch")
    if payload.get("source_sha256") != request.source_sha256:
        raise ValueError("provider source digest mismatch")
    if payload.get("canonical_state_write_authorized") is not False:
        raise ValueError("provider cannot authorize canonical state write")
    provider_id = str(payload.get("provider_id", "")).strip()
    if not provider_id:
        raise ValueError("provider_id required")
    predictions = payload.get("predictions")
    if not isinstance(predictions, list):
        raise ValueError("predictions list required")
    for prediction in predictions:
        label = str(prediction.get("label", "")).strip()
        if not label:
            raise ValueError("prediction label required")
        confidence = float(prediction.get("confidence", 0.0))
        if confidence < 0.0 or confidence > 1.0:
            raise ValueError("prediction confidence out of range")
        status = str(prediction.get("status", ""))
        if status not in ALLOWED_STATUSES:
            raise ValueError("prediction status invalid")
    return payload


class NoModelAbstentionBaseline:
    provider_id = "NO-MODEL-ABSTENTION-BASELINE-v1"

    def extract(self, request: ExtractionRequest) -> dict:
        payload = {
            "case_id": request.case_id,
            "task": request.task,
            "provider_id": self.provider_id,
            "source_sha256": request.source_sha256,
            "predictions": [
                {
                    "label": f"abstain:{request.task}",
                    "confidence": 0.0,
                    "status": "ABSTAIN",
                }
            ],
            "canonical_state_write_authorized": False,
        }
        return validate_provider_output(request, payload)
