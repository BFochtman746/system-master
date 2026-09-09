from __future__ import annotations

import json
from pathlib import Path

from narrative_extraction_calibration import score_corpus, score_case, span_iou


ROOT = Path(__file__).resolve().parent
GOLD_PATH = ROOT / "fixtures" / "SYNTHETIC-STRESS-GOLD-v1.json"


def load_gold() -> dict:
    return json.loads(GOLD_PATH.read_text(encoding="utf-8"))


def prediction_from_gold(gold: dict, confidence: float = 0.95) -> dict:
    cases = []
    for case in gold["cases"]:
        ambiguous = bool(case.get("intentionally_ambiguous", False))
        status = "UNRESOLVED" if ambiguous else "ASSERTED"
        item = {
            "case_id": case["case_id"],
            "task": case["task"],
            "predictions": [
                {"label": label, "confidence": confidence, "status": status}
                for label in case.get("gold_labels", [])
            ],
        }
        if case.get("gold_spans"):
            item["predicted_spans"] = case["gold_spans"]
        cases.append(item)
    return {"prediction_id": "PERFECT-SYNTHETIC-v1", "cases": cases}


def bad_prediction(gold: dict) -> dict:
    cases = []
    for case in gold["cases"]:
        predictions = []
        labels = list(case.get("gold_labels", []))
        if labels:
            predictions.append({"label": labels[0], "confidence": 0.99, "status": "ASSERTED"})
        forbidden = list(case.get("forbidden_labels", []))
        if forbidden:
            predictions.append({"label": forbidden[0], "confidence": 0.99, "status": "ASSERTED"})
        else:
            predictions.append({"label": f"invented:{case['case_id']}", "confidence": 0.98, "status": "ASSERTED"})
        item = {"case_id": case["case_id"], "task": case["task"], "predictions": predictions}
        if case.get("gold_spans"):
            item["predicted_spans"] = [{"anchor_id": case["gold_spans"][0]["anchor_id"], "span": [0, 5]}]
        cases.append(item)
    return {"prediction_id": "OVERCONFIDENT-FAILURE-v1", "cases": cases}


def cautious_prediction(gold: dict) -> dict:
    cases = []
    for case in gold["cases"]:
        labels = list(case.get("gold_labels", []))
        predictions = []
        if labels:
            status = "UNRESOLVED" if case.get("intentionally_ambiguous") else "ASSERTED"
            predictions.append({"label": labels[0], "confidence": 0.92, "status": status})
        predictions.append({"label": f"uncertain:{case['case_id']}", "confidence": 0.2, "status": "ABSTAIN"})
        item = {"case_id": case["case_id"], "task": case["task"], "predictions": predictions}
        if case.get("gold_spans"):
            item["predicted_spans"] = case["gold_spans"]
        cases.append(item)
    return {"prediction_id": "CAUTIOUS-PARTIAL-v1", "cases": cases}


def main() -> None:
    gold = load_gold()
    assert len(gold["cases"]) == 12
    assert len({c["task"] for c in gold["cases"]}) == 9
    assert gold["contains_user_manuscript"] is False
    assert gold["contains_copyrighted_reference_body"] is False
    assert gold["named_author_target"] is False

    perfect = score_corpus(gold, prediction_from_gold(gold))
    assert perfect["case_count"] == 12
    assert perfect["task_count"] == 9
    assert perfect["aggregate"]["precision"] == 1.0
    assert perfect["aggregate"]["recall"] == 1.0
    assert perfect["aggregate"]["f1"] == 1.0
    assert perfect["aggregate"]["false_certainty_count"] == 0
    assert perfect["aggregate"]["ambiguity_preservation_rate"] == 1.0
    assert perfect["aggregate"]["premature_resolution_rate"] == 0.0
    assert perfect["aggregate"]["mean_span_iou"] == 1.0
    assert perfect["canonical_state_write_authorized"] is False

    bad = score_corpus(gold, bad_prediction(gold))
    assert bad["aggregate"]["f1"] < 1.0
    assert bad["aggregate"]["false_certainty_count"] >= 12
    assert bad["aggregate"]["mean_false_certainty_rate"] > 0.0
    assert bad["aggregate"]["ambiguity_preservation_rate"] == 0.0
    assert bad["aggregate"]["premature_resolution_rate"] == 1.0
    assert bad["aggregate"]["mean_span_iou"] == 0.0
    assert bad["aggregate"]["mean_brier_score"] > perfect["aggregate"]["mean_brier_score"]

    cautious = score_corpus(gold, cautious_prediction(gold))
    assert cautious["aggregate"]["false_certainty_count"] == 0
    assert cautious["aggregate"]["ambiguity_preservation_rate"] == 1.0
    assert cautious["aggregate"]["f1"] < perfect["aggregate"]["f1"]
    assert cautious["aggregate"]["mean_selective_accuracy"] == 1.0

    causal_gold = next(c for c in gold["cases"] if c["case_id"] == "causality-001")
    causal_bad = next(c for c in bad_prediction(gold)["cases"] if c["case_id"] == "causality-001")
    causal_score = score_case(causal_gold, causal_bad)
    assert causal_score["false_certainty_count"] >= 1

    ambiguity_gold = next(c for c in gold["cases"] if c["case_id"] == "chronology-ambiguous-001")
    asserted_ambiguity = {
        "case_id": ambiguity_gold["case_id"],
        "task": ambiguity_gold["task"],
        "predictions": [{"label": ambiguity_gold["gold_labels"][0], "confidence": 0.99, "status": "ASSERTED"}],
    }
    ambiguity_score = score_case(ambiguity_gold, asserted_ambiguity)
    assert ambiguity_score["premature_resolution"] == 1
    assert ambiguity_score["ambiguity_preserved"] == 0

    assert span_iou([10, 20], [10, 20]) == 1.0
    assert span_iou([10, 20], [15, 25]) == 1 / 3

    mismatch = prediction_from_gold(gold)
    mismatch["cases"] = mismatch["cases"][:-1]
    try:
        score_corpus(gold, mismatch)
        raise AssertionError("case mismatch should fail")
    except ValueError as exc:
        assert "case set mismatch" in str(exc)

    invalid_conf = prediction_from_gold(gold)
    invalid_conf["cases"][0]["predictions"][0]["confidence"] = 1.1
    try:
        score_corpus(gold, invalid_conf)
        raise AssertionError("invalid confidence should fail")
    except ValueError as exc:
        assert "confidence out of range" in str(exc)

    evidence = {
        "qualification": "LITERARY-NARRATIVE-EXTRACTION-CALIBRATION-001-FIXTURES",
        "fixture_cases": 12,
        "tasks": 9,
        "perfect_harness": perfect["aggregate"],
        "overconfident_failure_detected": True,
        "ambiguity_premature_resolution_detected": True,
        "false_causality_detected": True,
        "selective_abstention_supported": True,
        "source_rights_boundary": "PASS_SYNTHETIC_ONLY",
        "canonical_state_write_authorized": False,
    }
    print("EXTRACTION_CALIBRATION_FIXTURES=PASS")
    print(json.dumps(evidence, sort_keys=True))


if __name__ == "__main__":
    main()
