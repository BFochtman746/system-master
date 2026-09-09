from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import sys
from typing import Protocol

HERE = Path(__file__).resolve().parent
PARENT = HERE.parent
for path in (HERE, PARENT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from extractor_provider import ExtractionRequest, validate_provider_output
from source_heldout_label_ontology import validate_task_label


class ModelBackend(Protocol):
    backend_id: str

    def infer(self, *, task: str, authorized_source_text: str, source_sha256: str) -> list[dict]:
        """Return candidate prediction dicts only.

        The backend is intentionally not given case_id, gold labels, forbidden labels,
        human adjudication, canonical state, author decisions, or publication authority.
        """
        ...


@dataclass(frozen=True)
class ModelBackedNarrativeExtractor:
    backend: ModelBackend

    @property
    def provider_id(self) -> str:
        return f"MODEL-BACKED-NARRATIVE-EXTRACTOR-v1::{self.backend.backend_id}"

    def extract(self, request: ExtractionRequest) -> dict:
        actual_digest = sha256(request.authorized_source_text.encode("utf-8")).hexdigest()
        if actual_digest != request.source_sha256:
            raise ValueError("authorized source digest mismatch before model invocation")

        raw = self.backend.infer(
            task=request.task,
            authorized_source_text=request.authorized_source_text,
            source_sha256=request.source_sha256,
        )
        if not isinstance(raw, list):
            raise ValueError("model backend must return a prediction list")

        predictions: list[dict] = []
        passage_char_length = len(request.authorized_source_text)
        for item in raw:
            if not isinstance(item, dict):
                raise ValueError("model backend prediction must be an object")
            label = str(item.get("label", "")).strip()
            label = validate_task_label(request.task, label, passage_char_length)
            predictions.append(
                {
                    "label": label,
                    "confidence": float(item.get("confidence", 0.0)),
                    "status": str(item.get("status", "")).strip(),
                }
            )

        if not predictions:
            predictions = [
                {
                    "label": f"abstain:{request.task}",
                    "confidence": 0.0,
                    "status": "ABSTAIN",
                }
            ]

        payload = {
            "case_id": request.case_id,
            "task": request.task,
            "provider_id": self.provider_id,
            "source_sha256": request.source_sha256,
            "predictions": predictions,
            "canonical_state_write_authorized": False,
        }
        return validate_provider_output(request, payload)
