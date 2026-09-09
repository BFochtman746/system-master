from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import sys

from model_backed_provider import ModelBackedNarrativeExtractor
from source_heldout_label_ontology import validate_task_label, validate_task_labels

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


def validate_all_task_grammars() -> None:
    passage_len = 80
    valid = {
        "ANCHOR_LOCALIZATION": "anchor:A0-4",
        "ENTITY_IDENTITY_COREFERENCE": "coref:C5-8->C0-4",
        "EVENT_IDENTITY": "same_event:EV0-4=EV5-9",
        "STORY_VS_DISCOURSE_TIME": "story:EV0-4_BEFORE_EV5-9",
        "CAUSAL_GOAL_RELATIONS": "goal:EV0-4_SUPPORTS_G5-9",
        "EPISTEMIC_FOCALIZATION": "believes:C0-4_P5-39",
        "NARRATIVE_FUNCTION": "function:A0-4=SETUP",
        "SETUP_PAYOFF_OPEN_QUESTION": "setup:A0-4->Q5-9",
        "ARC_ORCHESTRATION": "arc:C0-4_BEAT_A5-9=INTRODUCTION",
    }
    for task, label in valid.items():
        assert validate_task_label(task, label, passage_len) == label
        assert validate_task_label(task, f"abstain:{task}", passage_len) == f"abstain:{task}"

    expect_value_error(
        lambda: validate_task_label("EPISTEMIC_FOCALIZATION", "believes:Mara", passage_len),
        "label invalid for task",
    )
    expect_value_error(
        lambda: validate_task_label("EPISTEMIC_FOCALIZATION", "believes:C0-4_P5-999", passage_len),
        "source-bound span exceeds passage length",
    )
    expect_value_error(
        lambda: validate_task_label("ANCHOR_LOCALIZATION", "anchor:A9-4", passage_len),
        "source-bound span must have start < end",
    )
    expect_value_error(
        lambda: validate_task_labels(
            "ANCHOR_LOCALIZATION", ["anchor:A0-4", "anchor:A0-4"], passage_len
        ),
        "duplicate canonical labels",
    )


def main() -> None:
    req = request()
    good_label = "believes:C0-4_P5-39"

    validate_all_task_grammars()

    good_backend = RecordingBackend(
        [{"label": good_label, "confidence": 0.84, "status": "ASSERTED"}]
    )
    good = ModelBackedNarrativeExtractor(good_backend).extract(req)
    assert good["case_id"] == req.case_id
    assert good["task"] == req.task
    assert good["source_sha256"] == req.source_sha256
    assert good["canonical_state_write_authorized"] is False
    assert good["predictions"][0]["label"] == good_label
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
            RecordingBackend([{"label": "believes:Mara", "confidence": 0.84, "status": "ASSERTED"}])
        ).extract(req),
        "label invalid for task",
    )

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(
            RecordingBackend([{"label": "believes:C0-4_P5-999", "confidence": 0.84, "status": "ASSERTED"}])
        ).extract(req),
        "source-bound span exceeds passage length",
    )

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(
            RecordingBackend([{"label": good_label, "confidence": 1.2, "status": "ASSERTED"}])
        ).extract(req),
        "confidence out of range",
    )

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(
            RecordingBackend([{"label": good_label, "confidence": 0.5, "status": "CERTAIN"}])
        ).extract(req),
        "status invalid",
    )

    expect_value_error(
        lambda: ModelBackedNarrativeExtractor(RecordingBackend({"label": "x"})).extract(req),
        "prediction list",
    )

    print("CANDIDATE_002_MODEL_PROVIDER_FIXTURES=PASS")
    print(
        "checks=all_nine_task_grammars,source_bound_ids,bounds,duplicates,gold_isolation,"
        "digest_binding,forced_non_authority,abstention,confidence,status,shape"
    )


if __name__ == "__main__":
    main()
