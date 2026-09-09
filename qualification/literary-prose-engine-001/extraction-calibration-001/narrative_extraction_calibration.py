from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple


FALSE_CERTAINTY_THRESHOLD = 0.8
ECE_BINS = 10
RISK_THRESHOLDS = (0.0, 0.5, 0.7, 0.8, 0.9)


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    status: str = "ASSERTED"


def _safe_div(num: float, den: float) -> float:
    return 0.0 if den == 0 else num / den


def _f1(precision: float, recall: float) -> float:
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def _validate_prediction(p: dict) -> Prediction:
    label = str(p.get("label", "")).strip()
    if not label:
        raise ValueError("prediction label required")
    confidence = float(p.get("confidence", 0.0))
    if confidence < 0.0 or confidence > 1.0:
        raise ValueError(f"confidence out of range for {label}: {confidence}")
    status = str(p.get("status", "ASSERTED"))
    if status not in {"ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"}:
        raise ValueError(f"invalid status for {label}: {status}")
    return Prediction(label=label, confidence=confidence, status=status)


def span_iou(a: Iterable[int], b: Iterable[int]) -> float:
    aa = list(a)
    bb = list(b)
    if len(aa) != 2 or len(bb) != 2:
        raise ValueError("span must contain [start, end]")
    a0, a1 = int(aa[0]), int(aa[1])
    b0, b1 = int(bb[0]), int(bb[1])
    if a0 < 0 or b0 < 0 or a1 <= a0 or b1 <= b0:
        raise ValueError("invalid half-open span")
    inter = max(0, min(a1, b1) - max(a0, b0))
    union = max(a1, b1) - min(a0, b0)
    return _safe_div(inter, union)


def _best_span_iou(gold_spans: List[dict], pred_spans: List[dict]) -> float:
    if not gold_spans:
        return 1.0 if not pred_spans else 0.0
    if not pred_spans:
        return 0.0
    scores = []
    for g in gold_spans:
        best = 0.0
        for p in pred_spans:
            if str(g.get("anchor_id")) != str(p.get("anchor_id")):
                continue
            best = max(best, span_iou(g["span"], p["span"]))
        scores.append(best)
    return sum(scores) / len(scores)


def _calibration_points(gold: set[str], predictions: List[Prediction]) -> List[Tuple[float, int]]:
    by_label: Dict[str, float] = {}
    for p in predictions:
        if p.status == "ABSTAIN":
            continue
        by_label[p.label] = max(by_label.get(p.label, 0.0), p.confidence)
    universe = gold | set(by_label)
    return [(by_label.get(label, 0.0), 1 if label in gold else 0) for label in sorted(universe)]


def brier_score(points: List[Tuple[float, int]]) -> float:
    if not points:
        return 0.0
    return sum((p - y) ** 2 for p, y in points) / len(points)


def expected_calibration_error(points: List[Tuple[float, int]], bins: int = ECE_BINS) -> float:
    if not points:
        return 0.0
    total = len(points)
    ece = 0.0
    for i in range(bins):
        low = i / bins
        high = (i + 1) / bins
        bucket = [(p, y) for p, y in points if (low <= p < high) or (i == bins - 1 and p == 1.0)]
        if not bucket:
            continue
        mean_conf = sum(p for p, _ in bucket) / len(bucket)
        mean_acc = sum(y for _, y in bucket) / len(bucket)
        ece += (len(bucket) / total) * abs(mean_conf - mean_acc)
    return ece


def risk_coverage_curve(gold: set[str], predictions: List[Prediction]) -> List[dict]:
    universe = gold | {p.label for p in predictions if p.status != "ABSTAIN"}
    out = []
    for threshold in RISK_THRESHOLDS:
        selected = [p for p in predictions if p.status != "ABSTAIN" and p.confidence >= threshold]
        correct = sum(1 for p in selected if p.label in gold)
        accuracy = _safe_div(correct, len(selected))
        coverage = _safe_div(len({p.label for p in selected}), len(universe))
        out.append({
            "threshold": threshold,
            "coverage": round(coverage, 6),
            "selective_accuracy": round(accuracy, 6),
            "risk": round(1.0 - accuracy if selected else 0.0, 6),
        })
    return out


def score_case(gold_case: dict, prediction_case: dict) -> dict:
    if gold_case.get("case_id") != prediction_case.get("case_id"):
        raise ValueError("case_id mismatch")
    if gold_case.get("task") != prediction_case.get("task"):
        raise ValueError("task mismatch")

    gold = {str(x) for x in gold_case.get("gold_labels", [])}
    forbidden = {str(x) for x in gold_case.get("forbidden_labels", [])}
    preds = [_validate_prediction(p) for p in prediction_case.get("predictions", [])]
    asserted = [p for p in preds if p.status != "ABSTAIN"]
    predicted = {p.label for p in asserted}
    tp = len(gold & predicted)
    fp = len(predicted - gold)
    fn = len(gold - predicted)
    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    f1 = _f1(precision, recall)

    high_conf_wrong = [p for p in asserted if (p.label not in gold or p.label in forbidden) and p.confidence >= FALSE_CERTAINTY_THRESHOLD]
    high_conf_total = [p for p in asserted if p.confidence >= FALSE_CERTAINTY_THRESHOLD]
    false_certainty_rate = _safe_div(len(high_conf_wrong), len(high_conf_total))

    correct_predictions = sum(1 for p in asserted if p.label in gold and p.label not in forbidden)
    selective_accuracy = _safe_div(correct_predictions, len(asserted))
    universe = gold | predicted
    coverage = _safe_div(len(predicted), len(universe))

    intentionally_ambiguous = bool(gold_case.get("intentionally_ambiguous", False))
    allowed_ambiguity_statuses = set(gold_case.get("allowed_ambiguity_statuses", ["ALTERNATIVE", "UNRESOLVED", "ABSTAIN"]))
    premature_resolution = 0
    ambiguity_preserved = 1
    if intentionally_ambiguous:
        bad = [p for p in preds if p.status == "ASSERTED"]
        if bad:
            premature_resolution = 1
            ambiguity_preserved = 0
        elif preds and any(p.status not in allowed_ambiguity_statuses for p in preds):
            premature_resolution = 1
            ambiguity_preserved = 0

    points = _calibration_points(gold, preds)
    gold_spans = list(gold_case.get("gold_spans", []))
    pred_spans = list(prediction_case.get("predicted_spans", []))

    return {
        "case_id": gold_case["case_id"],
        "task": gold_case["task"],
        "intentionally_ambiguous": intentionally_ambiguous,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
        "coverage": round(coverage, 6),
        "selective_accuracy": round(selective_accuracy, 6),
        "false_certainty_rate": round(false_certainty_rate, 6),
        "false_certainty_count": len(high_conf_wrong),
        "ambiguity_preserved": ambiguity_preserved,
        "premature_resolution": premature_resolution,
        "span_iou": round(_best_span_iou(gold_spans, pred_spans), 6) if gold_spans or pred_spans else None,
        "brier_score": round(brier_score(points), 6),
        "expected_calibration_error": round(expected_calibration_error(points), 6),
        "risk_coverage_curve": risk_coverage_curve(gold, preds),
    }


def score_corpus(gold_payload: dict, prediction_payload: dict) -> dict:
    gold_cases = {c["case_id"]: c for c in gold_payload.get("cases", [])}
    pred_cases = {c["case_id"]: c for c in prediction_payload.get("cases", [])}
    if set(gold_cases) != set(pred_cases):
        missing = sorted(set(gold_cases) - set(pred_cases))
        extra = sorted(set(pred_cases) - set(gold_cases))
        raise ValueError(f"case set mismatch missing={missing} extra={extra}")

    scored = [score_case(gold_cases[cid], pred_cases[cid]) for cid in sorted(gold_cases)]
    task_names = sorted({x["task"] for x in scored})
    by_task = {}
    for task in task_names:
        rows = [x for x in scored if x["task"] == task]
        by_task[task] = _aggregate(rows)
    aggregate = _aggregate(scored)
    return {
        "contract_id": "LITERARY-NARRATIVE-EXTRACTION-CALIBRATION-001-v1",
        "case_count": len(scored),
        "task_count": len(task_names),
        "aggregate": aggregate,
        "by_task": by_task,
        "cases": scored,
        "canonical_state_write_authorized": False,
    }


def _aggregate(rows: List[dict]) -> dict:
    if not rows:
        return {}
    tp = sum(r["tp"] for r in rows)
    fp = sum(r["fp"] for r in rows)
    fn = sum(r["fn"] for r in rows)
    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    ambiguity_rows = [r for r in rows if r["intentionally_ambiguous"]]
    span_rows = [r for r in rows if r["span_iou"] is not None]
    high_conf_wrong = sum(r["false_certainty_count"] for r in rows)
    return {
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(_f1(precision, recall), 6),
        "mean_coverage": round(sum(r["coverage"] for r in rows) / len(rows), 6),
        "mean_selective_accuracy": round(sum(r["selective_accuracy"] for r in rows) / len(rows), 6),
        "false_certainty_count": high_conf_wrong,
        "mean_false_certainty_rate": round(sum(r["false_certainty_rate"] for r in rows) / len(rows), 6),
        "ambiguity_preservation_rate": round(sum(r["ambiguity_preserved"] for r in ambiguity_rows) / len(ambiguity_rows), 6) if ambiguity_rows else None,
        "premature_resolution_rate": round(sum(r["premature_resolution"] for r in ambiguity_rows) / len(ambiguity_rows), 6) if ambiguity_rows else None,
        "mean_span_iou": round(sum(r["span_iou"] for r in span_rows) / len(span_rows), 6) if span_rows else None,
        "mean_brier_score": round(sum(r["brier_score"] for r in rows) / len(rows), 6),
        "mean_expected_calibration_error": round(sum(r["expected_calibration_error"] for r in rows) / len(rows), 6),
    }
