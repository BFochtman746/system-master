from __future__ import annotations

from hashlib import sha256

from model_backed_provider import ModelBackedNarrativeExtractor
from pathlib import Path
import sys

PARENT = Path(__file__).resolve().parents[1]
if str(PARENT) not in sys.path:
    sys.path.insert(0, str(PARENT))

from extractor_provider import ExtractionRequest


class RecordingBackend:
    backend_id = "RECORDING-MODEL-FIXTURE-v1"

    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict] = []

    def infer(self, *, task: str, authorized_source_text: str, source_sha256: str) -> list[dict]:
        self.calls.append(
            {
                "task": task,
                "authorized_source_text": authorized_source_text,
                "source_sha256": source_sha256,
            }
        )
        return self.response  # type: ignore[return-value]


def request() -> ExtractionRequest:
    text = "Mara believed the bell was a warning, but the narrator never confirms why it rang."
    return ExtractionRequest(
        case_id="fixture-case-001",
        task="EPISTEMIC_FOCALIZATION",
        authorized_source_text=text,
        source_sha256=sha256(text.encode("utf-8")).hexdigest(),
    )


def expect_value_error(fn, contains: str) -> None:
    try:
        fn()
        raise AssertionError(f"expected ValueError containing {contains!r}")
    except ValueError as exc:
        assert contains in str(exc), (contains, str(exc))


def main() -> None:
    req = request()

    good_backend = RecordingBackend(
        [{"label": "believes:Mara", "confidence": 0.84, "status": "ASSERTED"}]
    )
    good = ModelBackedNarrativeExtractor(good_backend).extract(req)
    assert good["case_id"] == req.case_id
    assert good["task"] == req.task
    assert good["source_sha256"] == req.source_sha256
    assert good["canonical_state_write_authorized"] is False
    assert good["predictions"][0]["label"] == "believes:Mara"
    assert len(good_backend.calls) == 1
    assert set(good_backend.calls[0]) == {"task", "authorized_source_text", "source_sha256"}
    assert "case_id" not in good_backend.calls[0]
    assert "gold_labels" not in good_backend.calls[0]
    assert "forbidden_labels" not in good_backend.calls[0]

    empty_backend = RecordingBackend([])
    empty = ModelBackedNarrativeExtractor(empty_backend).extract(req)
    assert empty["predictions"] == [
        {
            "label": "abstain:EPISTEMIC_FOCALIZATION",
            "confidence": 0.0,
            "status": "ABSTAIN",
        }
    ]

    bad_digest = ExtractionRequest(
        case_id=req.case_id,
        task=req.task,
        authorized_source_text=req.authorized_source_text,
        source_sha256="0" * 64,
    )
    digest_backend = RecordingBackend([])
    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(digest_backend).extract(bad_digest),
        "authorized source digest mismatch",
    )
    assert digest_backend.calls == []

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(
            RecordingBackend([{"label": "x", "confidence": 1.2, "status": "ASSERTED"}])
        ).extract(req),
        "confidence out of range",
    )

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(
            RecordingBackend([{"label": "x", "confidence": 0.5, "status": "CERTAIN"}])
        ).extract(req),
        "status invalid",
    )

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(RecordingBackend({"label": "x"})).extract(req),
        "prediction list",
    )

    print("CANDIDATE_002_MODEL_PROVIDER_FIXTURES=PASS")
    print("checks=gold_isolation,digest_binding,forced_non_authority,abstention,confidence,status,shape")


if __name__ == "__main__":
    main()
