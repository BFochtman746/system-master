from __future__ import annotations

import copy
import json

from perspective_revelation_calibration import score_incremental_corpus

SOURCE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def cp(checkpoint_id, source_end, **kwargs):
    row = {
        "checkpoint_id": checkpoint_id,
        "source_end": source_end,
        "allowed_labels": [],
        "knowledge_forbidden_labels": [],
        "narrator_focalizer_forbidden_labels": [],
        "revelation_forbidden_labels": [],
        "allowed_focalizer_labels": [],
        "open_question_ids": [],
        "intentionally_omniscient": False,
        "human_review_required": False,
    }
    row.update(kwargs)
    return row


def pred(checkpoint_id, source_end, predictions):
    return {
        "checkpoint_id": checkpoint_id,
        "source_end": source_end,
        "predictions": predictions,
    }


def p(label, confidence=0.95, status="ASSERTED"):
    return {"label": label, "confidence": confidence, "status": status}


def build_fixture():
    gold_cases = [
        {
            "case_id": "KNOWLEDGE-BEFORE-EXPOSURE",
            "task": "EPISTEMIC_FOCALIZATION",
            "source_text": SOURCE,
            "checkpoints": [
                cp(
                    "early",
                    20,
                    allowed_labels=["focalizes:C0-4_A10-15"],
                    knowledge_forbidden_labels=["knows:C0-4_P5-10"],
                ),
                cp(
                    "exposed",
                    40,
                    allowed_labels=["knows:C0-4_P5-10"],
                ),
            ],
        },
        {
            "case_id": "NARRATOR-FOCALIZER-CONFLATION",
            "task": "EPISTEMIC_FOCALIZATION",
            "source_text": SOURCE,
            "checkpoints": [
                cp(
                    "viewpoint",
                    20,
                    allowed_labels=["focalizes:C5-9_A10-15"],
                    narrator_focalizer_forbidden_labels=["focalizes:C0-4_A10-15"],
                )
            ],
        },
        {
            "case_id": "INTENTIONAL-OMNISCIENCE",
            "task": "EPISTEMIC_FOCALIZATION",
            "source_text": SOURCE,
            "checkpoints": [
                cp(
                    "omniscient",
                    20,
                    allowed_labels=[
                        "focalizes:C0-4_A10-15",
                        "focalizes:C5-9_A10-15",
                    ],
                    allowed_focalizer_labels=[
                        "focalizes:C0-4_A10-15",
                        "focalizes:C5-9_A10-15",
                    ],
                    intentionally_omniscient=True,
                )
            ],
        },
        {
            "case_id": "DELAYED-REVELATION",
            "task": "SETUP_PAYOFF_OPEN_QUESTION",
            "source_text": SOURCE,
            "checkpoints": [
                cp(
                    "open",
                    20,
                    allowed_labels=["status:Q5-10=OPEN"],
                    revelation_forbidden_labels=["status:Q5-10=CLOSED"],
                    open_question_ids=["Q5-10"],
                ),
                cp(
                    "revealed",
                    40,
                    allowed_labels=["status:Q5-10=CLOSED"],
                ),
            ],
        },
        {
            "case_id": "SUBJECTIVE-PERSPECTIVE-REVIEW",
            "task": "EPISTEMIC_FOCALIZATION",
            "source_text": SOURCE,
            "checkpoints": [
                cp(
                    "ambiguous",
                    20,
                    allowed_labels=["epistemic:C0-4_P5-10_UNRESOLVED"],
                    human_review_required=True,
                )
            ],
        },
    ]

    prediction_cases = [
        {
            "case_id": "KNOWLEDGE-BEFORE-EXPOSURE",
            "task": "EPISTEMIC_FOCALIZATION",
            "checkpoints": [
                pred("early", 20, [p("knows:C0-4_P5-10")]),
                pred("exposed", 40, [p("knows:C0-4_P5-10", 0.90)]),
            ],
        },
        {
            "case_id": "NARRATOR-FOCALIZER-CONFLATION",
            "task": "EPISTEMIC_FOCALIZATION",
            "checkpoints": [
                pred("viewpoint", 20, [p("focalizes:C0-4_A10-15")])
            ],
        },
        {
            "case_id": "INTENTIONAL-OMNISCIENCE",
            "task": "EPISTEMIC_FOCALIZATION",
            "checkpoints": [
                pred(
                    "omniscient",
                    20,
                    [
                        p("focalizes:C0-4_A10-15", 0.90),
                        p("focalizes:C5-9_A10-15", 0.90),
                    ],
                )
            ],
        },
        {
            "case_id": "DELAYED-REVELATION",
            "task": "SETUP_PAYOFF_OPEN_QUESTION",
            "checkpoints": [
                pred("open", 20, [p("status:Q5-10=CLOSED")]),
                pred("revealed", 40, [p("status:Q5-10=CLOSED", 0.90)]),
            ],
        },
        {
            "case_id": "SUBJECTIVE-PERSPECTIVE-REVIEW",
            "task": "EPISTEMIC_FOCALIZATION",
            "checkpoints": [
                pred(
                    "ambiguous",
                    20,
                    [p("epistemic:C0-4_P5-10_UNRESOLVED", 0.55, "UNRESOLVED")],
                )
            ],
        },
    ]
    return {"cases": gold_cases}, {"cases": prediction_cases}


def main():
    gold, predictions = build_fixture()
    result = score_incremental_corpus(gold, predictions)

    assert result["contract_id"] == "LITERARY-PERSPECTIVE-REVELATION-CALIBRATION-003-v1"
    assert result["case_count"] == 5
    assert result["knowledge_before_exposure_false_positive_count"] == 1
    assert result["narrator_focalizer_conflation_count"] == 1
    assert result["premature_question_closure_count"] == 1
    assert result["unsupported_revelation_resolution_count"] == 1
    assert result["checkpoint_false_certainty_count"] == 3
    assert result["intentional_omniscience_representation_rate"] == 1.0
    assert result["human_review_required_count"] == 1
    assert result["canonical_state_write_authorized"] is False

    early = next(c for c in result["cases"] if c["case_id"] == "KNOWLEDGE-BEFORE-EXPOSURE")
    assert early["knowledge_before_exposure_false_positive_count"] == 1
    assert early["checkpoints"][-1]["knowledge_before_exposure_false_positive_count"] == 0

    invalid_gold = copy.deepcopy(gold)
    invalid_predictions = copy.deepcopy(predictions)
    invalid_gold["cases"][0]["checkpoints"][1]["source_end"] = 10
    invalid_predictions["cases"][0]["checkpoints"][1]["source_end"] = 10
    try:
        score_incremental_corpus(invalid_gold, invalid_predictions)
    except ValueError as exc:
        assert "nonmonotonic" in str(exc)
    else:
        raise AssertionError("nonmonotonic checkpoint sequence must fail closed")

    print(json.dumps({
        "standing": "PASS",
        "contract_id": result["contract_id"],
        "case_count": result["case_count"],
        "knowledge_before_exposure_detection": True,
        "narrator_focalizer_conflation_detection": True,
        "delayed_revelation_premature_closure_detection": True,
        "intentional_omniscience_representable": True,
        "subjective_human_review_path_preserved": True,
        "later_correctness_does_not_erase_earlier_false_certainty": True,
        "nonmonotonic_checkpoint_rejected": True,
        "new_perspective_taxonomy_introduced": False,
        "canonical_state_write_authorized": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
