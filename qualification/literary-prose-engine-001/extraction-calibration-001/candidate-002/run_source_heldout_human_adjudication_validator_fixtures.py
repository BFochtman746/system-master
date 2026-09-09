from __future__ import annotations

from copy import deepcopy
from hashlib import sha256

from validate_source_heldout_human_adjudication import (
    ALLOWED_STATUSES,
    HIGH_RISK_TASKS,
    load_expected_matrix,
    validate_completed_packet,
    validate_packet_set,
)

VALID_LABEL = {
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


def digest(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def make_reviewers(packet_id: str, task: str) -> list[dict]:
    count = 2 if task in HIGH_RISK_TASKS else 1
    return [
        {
            "adjudicator_id": f"reviewer-{index + 1}",
            "independent_review_digest": digest(f"{packet_id}:review:{index + 1}"),
            "reviewed_without_model_predictions": True,
            "reviewed_without_other_adjudicator_labels": True,
        }
        for index in range(count)
    ]


def make_packet(expected: dict) -> dict:
    task = expected["task"]
    return {
        "packet_id": expected["packet_id"],
        "selection_case_id": expected["selection_case_id"],
        "work_id": expected["work_id"],
        "source_url": expected["source_url"],
        "source_sha256": expected["source_sha256"],
        "passage_char_length": 80,
        "passage_locator": {
            "selection_case_id": expected["selection_case_id"],
            "source_file_byte_start": expected["source_file_byte_start"],
            "source_file_byte_end_exclusive": expected["source_file_byte_end_exclusive"],
            "source_file_sha256": expected["source_file_sha256"],
        },
        "task": task,
        "adjudicators": make_reviewers(expected["packet_id"], task),
        "gold_labels": [{"label": VALID_LABEL[task], "status": "ASSERTED"}],
        "forbidden_labels": [],
        "intentionally_ambiguous": False,
        "allowed_statuses": ALLOWED_STATUSES,
        "adjudication_notes_digest": digest(f"{expected['packet_id']}:notes"),
        "model_input_contains_gold": False,
    }


def expect_value_error(fn, contains: str) -> None:
    try:
        fn()
    except ValueError as exc:
        assert contains in str(exc), (contains, str(exc))
    else:
        raise AssertionError(f"expected ValueError containing {contains!r}")


def main() -> None:
    expected = load_expected_matrix()
    assert len(expected) == 18
    packets = [make_packet(item) for item in expected.values()]

    result = validate_packet_set(packets, expected)
    assert result["result"] == "PASS"
    assert result["packet_count"] == 18
    assert result["model_input_contains_gold"] is False

    high_risk_packet = next(packet for packet in packets if packet["task"] in HIGH_RISK_TASKS)
    high_risk_expected = expected[high_risk_packet["packet_id"]]

    too_few_reviewers = deepcopy(high_risk_packet)
    too_few_reviewers["adjudicators"] = too_few_reviewers["adjudicators"][:1]
    expect_value_error(
        lambda: validate_completed_packet(too_few_reviewers, high_risk_expected),
        "requires at least 2 independent review",
    )

    exposed_gold = deepcopy(high_risk_packet)
    exposed_gold["model_input_contains_gold"] = True
    expect_value_error(
        lambda: validate_completed_packet(exposed_gold, high_risk_expected),
        "model_input_contains_gold must be false",
    )

    bad_digest = deepcopy(high_risk_packet)
    bad_digest["source_sha256"] = "0" * 64
    expect_value_error(
        lambda: validate_completed_packet(bad_digest, high_risk_expected),
        "source_sha256 mismatch",
    )

    invalid_label = deepcopy(high_risk_packet)
    invalid_label["gold_labels"] = [{"label": "free-form human prose label", "status": "ASSERTED"}]
    expect_value_error(
        lambda: validate_completed_packet(invalid_label, high_risk_expected),
        "label invalid for task",
    )

    overlap = deepcopy(high_risk_packet)
    overlap["forbidden_labels"] = [overlap["gold_labels"][0]["label"]]
    expect_value_error(
        lambda: validate_completed_packet(overlap, high_risk_expected),
        "gold/forbidden label overlap",
    )

    ambiguous_but_collapsed = deepcopy(high_risk_packet)
    ambiguous_but_collapsed["intentionally_ambiguous"] = True
    expect_value_error(
        lambda: validate_completed_packet(ambiguous_but_collapsed, high_risk_expected),
        "intentionally ambiguous packet must preserve",
    )

    duplicate_reviewer = deepcopy(high_risk_packet)
    duplicate_reviewer["adjudicators"][1]["adjudicator_id"] = duplicate_reviewer["adjudicators"][0]["adjudicator_id"]
    expect_value_error(
        lambda: validate_completed_packet(duplicate_reviewer, high_risk_expected),
        "duplicate adjudicator_id",
    )

    duplicated_set = deepcopy(packets)
    duplicated_set[-1] = deepcopy(duplicated_set[0])
    expect_value_error(
        lambda: validate_packet_set(duplicated_set, expected),
        "duplicate packet_id",
    )

    print("SOURCE_HELDOUT_002B_HUMAN_ADJUDICATION_VALIDATOR_FIXTURES=PASS")
    print(
        "checks=18_packet_matrix,source_binding,ontology,review_independence,dual_review_high_risk,"
        "gold_isolation,ambiguity_preservation,duplicate_rejection"
    )


if __name__ == "__main__":
    main()
