from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE_002 = ROOT / "extraction-calibration-001" / "candidate-002"
if str(CANDIDATE_002) not in sys.path:
    sys.path.insert(0, str(CANDIDATE_002))

from source_heldout_label_ontology import validate_task_label


FALSE_CERTAINTY_THRESHOLD = 0.8
ALLOWED_STATUSES = {"ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"}
QUESTION_CLOSED = re.compile(r"status:(Q[0-9]+-[0-9]+)=CLOSED$")


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    status: str


def _prediction(task: str, raw: dict, source_end: int) -> Prediction:
    label = validate_task_label(task, str(raw.get("label", "")).strip(), source_end)
    confidence = float(raw.get("confidence", 0.0))
    if confidence < 0.0 or confidence > 1.0:
        raise ValueError(f"confidence out of range for {label}: {confidence}")
    status = str(raw.get("status", "")).strip()
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"invalid status for {label}: {status}")
    return Prediction(label=label, confidence=confidence, status=status)


def _labels(task: str, checkpoint: dict, key: str, source_end: int) -> set[str]:
    values = {str(x) for x in checkpoint.get(key, [])}
    for value in values:
        validate_task_label(task, value, source_end)
    return values


def _checkpoint_map(payload: dict) -> dict[str, dict]:
    checkpoints = payload.get("checkpoints", [])
    if not isinstance(checkpoints, list):
        raise ValueError("checkpoints list required")
    out: dict[str, dict] = {}
    for checkpoint in checkpoints:
        checkpoint_id = str(checkpoint.get("checkpoint_id", "")).strip()
        if not checkpoint_id:
            raise ValueError("checkpoint_id required")
        if checkpoint_id in out:
            raise ValueError(f"duplicate checkpoint_id: {checkpoint_id}")
        out[checkpoint_id] = checkpoint
    return out


def score_incremental_case(gold_case: dict, prediction_case: dict) -> dict:
    case_id = str(gold_case.get("case_id", "")).strip()
    if not case_id or case_id != str(prediction_case.get("case_id", "")).strip():
        raise ValueError("case_id mismatch")
    task = str(gold_case.get("task", "")).strip()
    if task != str(prediction_case.get("task", "")).strip():
        raise ValueError("task mismatch")
    source_text = str(gold_case.get("source_text", ""))
    if not source_text:
        raise ValueError("source_text required")

    gold_checkpoints = _checkpoint_map(gold_case)
    pred_checkpoints = _checkpoint_map(prediction_case)
    if set(gold_checkpoints) != set(pred_checkpoints):
        raise ValueError("checkpoint set mismatch")

    previous_source_end = 0
    rows: list[dict] = []
    for checkpoint_id in gold_checkpoints:
        gold = gold_checkpoints[checkpoint_id]
        pred = pred_checkpoints[checkpoint_id]
        source_end = int(gold.get("source_end", -1))
        if source_end <= previous_source_end or source_end > len(source_text):
            raise ValueError(f"invalid/nonmonotonic source_end at {checkpoint_id}")
        previous_source_end = source_end
        if int(pred.get("source_end", source_end)) != source_end:
            raise ValueError(f"prediction source_end mismatch at {checkpoint_id}")

        allowed = _labels(task, gold, "allowed_labels", source_end)
        knowledge_forbidden = _labels(task, gold, "knowledge_forbidden_labels", source_end)
        narrator_focalizer_forbidden = _labels(
            task, gold, "narrator_focalizer_forbidden_labels", source_end
        )
        revelation_forbidden = _labels(task, gold, "revelation_forbidden_labels", source_end)
        allowed_focalizers = _labels(task, gold, "allowed_focalizer_labels", source_end)
        open_questions = {str(x) for x in gold.get("open_question_ids", [])}

        predictions = [
            _prediction(task, raw, source_end) for raw in pred.get("predictions", [])
        ]
        asserted = [p for p in predictions if p.status == "ASSERTED"]
        non_abstain = [p for p in predictions if p.status != "ABSTAIN"]

        knowledge_before_exposure = sum(
            1 for p in asserted if p.label in knowledge_forbidden
        )
        narrator_focalizer_conflation = sum(
            1 for p in asserted if p.label in narrator_focalizer_forbidden
        )
        unsupported_revelation_resolution = sum(
            1 for p in asserted if p.label in revelation_forbidden
        )

        premature_question_closure = 0
        for p in asserted:
            match = QUESTION_CLOSED.fullmatch(p.label)
            if match is not None and match.group(1) in open_questions:
                premature_question_closure += 1

        high_conf_wrong = sum(
            1
            for p in non_abstain
            if p.confidence >= FALSE_CERTAINTY_THRESHOLD
            and p.status == "ASSERTED"
            and p.label not in allowed
        )

        omniscience_expected = bool(gold.get("intentionally_omniscient", False))
        omniscience_represented = None
        if omniscience_expected:
            predicted_focalizers = {
                p.label for p in non_abstain if p.label.startswith("focalizes:")
            }
            omniscience_represented = int(
                len(predicted_focalizers & allowed_focalizers) >= 2
                and predicted_focalizers <= allowed_focalizers
            )

        human_review_required = bool(gold.get("human_review_required", False))
        rows.append(
            {
                "checkpoint_id": checkpoint_id,
                "source_end": source_end,
                "knowledge_before_exposure_false_positive_count": knowledge_before_exposure,
                "narrator_focalizer_conflation_count": narrator_focalizer_conflation,
                "premature_question_closure_count": premature_question_closure,
                "unsupported_revelation_resolution_count": unsupported_revelation_resolution,
                "checkpoint_false_certainty_count": high_conf_wrong,
                "intentional_omniscience_expected": omniscience_expected,
                "intentional_omniscience_represented": omniscience_represented,
                "human_review_required": human_review_required,
            }
        )

    omniscience_rows = [r for r in rows if r["intentional_omniscience_expected"]]
    return {
        "case_id": case_id,
        "task": task,
        "checkpoint_count": len(rows),
        "knowledge_before_exposure_false_positive_count": sum(
            r["knowledge_before_exposure_false_positive_count"] for r in rows
        ),
        "narrator_focalizer_conflation_count": sum(
            r["narrator_focalizer_conflation_count"] for r in rows
        ),
        "premature_question_closure_count": sum(
            r["premature_question_closure_count"] for r in rows
        ),
        "unsupported_revelation_resolution_count": sum(
            r["unsupported_revelation_resolution_count"] for r in rows
        ),
        "checkpoint_false_certainty_count": sum(
            r["checkpoint_false_certainty_count"] for r in rows
        ),
        "intentional_omniscience_representation_rate": (
            sum(r["intentional_omniscience_represented"] for r in omniscience_rows)
            / len(omniscience_rows)
            if omniscience_rows
            else None
        ),
        "human_review_required_count": sum(r["human_review_required"] for r in rows),
        "checkpoints": rows,
        "canonical_state_write_authorized": False,
    }


def score_incremental_corpus(gold_payload: dict, prediction_payload: dict) -> dict:
    gold_cases = {str(c["case_id"]): c for c in gold_payload.get("cases", [])}
    pred_cases = {str(c["case_id"]): c for c in prediction_payload.get("cases", [])}
    if set(gold_cases) != set(pred_cases):
        raise ValueError("case set mismatch")
    scored = [
        score_incremental_case(gold_cases[case_id], pred_cases[case_id])
        for case_id in sorted(gold_cases)
    ]
    omniscience = [
        row["intentional_omniscience_representation_rate"]
        for row in scored
        if row["intentional_omniscience_representation_rate"] is not None
    ]
    return {
        "contract_id": "LITERARY-PERSPECTIVE-REVELATION-CALIBRATION-003-v1",
        "case_count": len(scored),
        "knowledge_before_exposure_false_positive_count": sum(
            row["knowledge_before_exposure_false_positive_count"] for row in scored
        ),
        "narrator_focalizer_conflation_count": sum(
            row["narrator_focalizer_conflation_count"] for row in scored
        ),
        "premature_question_closure_count": sum(
            row["premature_question_closure_count"] for row in scored
        ),
        "unsupported_revelation_resolution_count": sum(
            row["unsupported_revelation_resolution_count"] for row in scored
        ),
        "checkpoint_false_certainty_count": sum(
            row["checkpoint_false_certainty_count"] for row in scored
        ),
        "intentional_omniscience_representation_rate": (
            sum(omniscience) / len(omniscience) if omniscience else None
        ),
        "human_review_required_count": sum(
            row["human_review_required_count"] for row in scored
        ),
        "cases": scored,
        "canonical_state_write_authorized": False,
    }
