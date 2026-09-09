from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent

from source_heldout_label_ontology import TASKS, validate_task_label

ALLOWED_STATUSES = ["ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"]
HIGH_RISK_TASKS = {
    "EVENT_IDENTITY",
    "STORY_VS_DISCOURSE_TIME",
    "CAUSAL_GOAL_RELATIONS",
    "EPISTEMIC_FOCALIZATION",
    "SETUP_PAYOFF_OPEN_QUESTION",
    "ARC_ORCHESTRATION",
}
SHA256_RE = re.compile(r"[0-9a-f]{64}")
REQUIRED_FIELDS = {
    "packet_id",
    "selection_case_id",
    "work_id",
    "source_url",
    "source_sha256",
    "passage_char_length",
    "passage_locator",
    "task",
    "adjudicators",
    "gold_labels",
    "forbidden_labels",
    "intentionally_ambiguous",
    "allowed_statuses",
    "adjudication_notes_digest",
    "model_input_contains_gold",
}


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_expected_matrix(
    closure_path: Path | None = None,
    manifest_path: Path | None = None,
) -> dict[str, dict[str, Any]]:
    closure_path = closure_path or HERE / "SOURCE-HELDOUT-002A-HOSTED-CLOSURE-v1.json"
    manifest_path = manifest_path or HERE / "PUBLIC-DOMAIN-SOURCE-HELDOUT-MANIFEST-v1.json"
    closure = _load_json(closure_path)
    manifest = _load_json(manifest_path)

    source_urls = {work["work_id"]: work["source_url"] for work in manifest["works"]}
    expected: dict[str, dict[str, Any]] = {}
    for case in closure["cases"]:
        case_id = case["selection_case_id"]
        work_id = case["work_id"]
        for task in case["tasks"]:
            if task not in TASKS:
                raise ValueError(f"closure contains unsupported task {task}")
            packet_id = f"{case_id}--{task}"
            expected[packet_id] = {
                "packet_id": packet_id,
                "selection_case_id": case_id,
                "work_id": work_id,
                "source_url": source_urls[work_id],
                "source_sha256": case["passage_sha256"],
                "source_file_sha256": case["source_file_sha256"],
                "source_file_byte_start": case["byte_start"],
                "source_file_byte_end_exclusive": case["byte_end_exclusive"],
                "task": task,
            }
    if len(expected) != 18:
        raise ValueError(f"expected 18 case-task packets, found {len(expected)}")
    return expected


def _require_sha256(value: Any, field: str) -> str:
    if not isinstance(value, str) or SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{field} must be lowercase SHA-256 hex")
    return value


def _validate_locator(locator: Any, expected: dict[str, Any]) -> None:
    if not isinstance(locator, dict):
        raise ValueError("passage_locator must be an object")
    required = {
        "selection_case_id",
        "source_file_byte_start",
        "source_file_byte_end_exclusive",
        "source_file_sha256",
    }
    missing = required - set(locator)
    if missing:
        raise ValueError(f"passage_locator missing fields: {sorted(missing)}")
    if locator["selection_case_id"] != expected["selection_case_id"]:
        raise ValueError("passage_locator selection_case_id mismatch")
    if locator["source_file_byte_start"] != expected["source_file_byte_start"]:
        raise ValueError("passage_locator byte start mismatch")
    if locator["source_file_byte_end_exclusive"] != expected["source_file_byte_end_exclusive"]:
        raise ValueError("passage_locator byte end mismatch")
    if locator["source_file_sha256"] != expected["source_file_sha256"]:
        raise ValueError("passage_locator source file digest mismatch")


def _validate_adjudicators(task: str, adjudicators: Any) -> None:
    if not isinstance(adjudicators, list):
        raise ValueError("adjudicators must be a list")
    minimum = 2 if task in HIGH_RISK_TASKS else 1
    if len(adjudicators) < minimum:
        raise ValueError(f"task {task} requires at least {minimum} independent review(s)")

    ids: list[str] = []
    review_digests: list[str] = []
    for index, reviewer in enumerate(adjudicators):
        if not isinstance(reviewer, dict):
            raise ValueError(f"adjudicator {index} must be an object")
        reviewer_id = reviewer.get("adjudicator_id")
        if not isinstance(reviewer_id, str) or not reviewer_id.strip():
            raise ValueError(f"adjudicator {index} requires non-empty adjudicator_id")
        ids.append(reviewer_id.strip())
        review_digests.append(
            _require_sha256(reviewer.get("independent_review_digest"), "independent_review_digest")
        )
        if reviewer.get("reviewed_without_model_predictions") is not True:
            raise ValueError("adjudicator must be blind to model predictions")
        if reviewer.get("reviewed_without_other_adjudicator_labels") is not True:
            raise ValueError("adjudicator must submit independent review before seeing other labels")

    if len(ids) != len(set(ids)):
        raise ValueError("duplicate adjudicator_id within packet")
    if len(review_digests) != len(set(review_digests)):
        raise ValueError("duplicate independent_review_digest within packet")


def _validate_gold(task: str, gold_labels: Any, passage_char_length: int) -> list[dict[str, str]]:
    if not isinstance(gold_labels, list) or not gold_labels:
        raise ValueError("gold_labels must be a non-empty list")
    normalized: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for index, item in enumerate(gold_labels):
        if not isinstance(item, dict):
            raise ValueError(f"gold_labels[{index}] must be an object")
        label = validate_task_label(task, str(item.get("label", "")), passage_char_length)
        status = str(item.get("status", "")).strip()
        if status not in ALLOWED_STATUSES:
            raise ValueError(f"gold label status invalid: {status}")
        abstain_label = f"abstain:{task}"
        if (label == abstain_label) != (status == "ABSTAIN"):
            raise ValueError("ABSTAIN status and task-scoped abstain label must occur together")
        key = (label, status)
        if key in seen:
            raise ValueError("duplicate gold label/status pair")
        seen.add(key)
        normalized.append({"label": label, "status": status})
    return normalized


def _validate_forbidden(task: str, forbidden: Any, passage_char_length: int) -> list[str]:
    if not isinstance(forbidden, list):
        raise ValueError("forbidden_labels must be a list")
    labels = [validate_task_label(task, str(label), passage_char_length) for label in forbidden]
    if len(labels) != len(set(labels)):
        raise ValueError("duplicate forbidden label")
    if f"abstain:{task}" in labels:
        raise ValueError("task-scoped abstention may not be a forbidden semantic label")
    return labels


def validate_completed_packet(packet: Any, expected: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(packet, dict):
        raise ValueError("completed adjudication packet must be an object")
    missing = REQUIRED_FIELDS - set(packet)
    if missing:
        raise ValueError(f"packet missing required fields: {sorted(missing)}")

    for field in ("packet_id", "selection_case_id", "work_id", "source_url", "source_sha256", "task"):
        if packet[field] != expected[field]:
            raise ValueError(f"{field} mismatch for {expected['packet_id']}")

    _require_sha256(packet["source_sha256"], "source_sha256")
    passage_char_length = packet["passage_char_length"]
    if not isinstance(passage_char_length, int) or isinstance(passage_char_length, bool) or passage_char_length <= 0:
        raise ValueError("passage_char_length must be a positive integer")

    _validate_locator(packet["passage_locator"], expected)
    _validate_adjudicators(packet["task"], packet["adjudicators"])
    gold = _validate_gold(packet["task"], packet["gold_labels"], passage_char_length)
    forbidden = _validate_forbidden(packet["task"], packet["forbidden_labels"], passage_char_length)

    gold_label_strings = {item["label"] for item in gold if item["status"] != "ABSTAIN"}
    overlap = gold_label_strings & set(forbidden)
    if overlap:
        raise ValueError(f"gold/forbidden label overlap: {sorted(overlap)}")

    if not isinstance(packet["intentionally_ambiguous"], bool):
        raise ValueError("intentionally_ambiguous must be boolean")
    if packet["intentionally_ambiguous"]:
        statuses = {item["status"] for item in gold}
        if not ({"ALTERNATIVE", "UNRESOLVED", "ABSTAIN"} & statuses):
            raise ValueError("intentionally ambiguous packet must preserve ALTERNATIVE/UNRESOLVED/ABSTAIN")

    if packet["allowed_statuses"] != ALLOWED_STATUSES:
        raise ValueError("allowed_statuses must exactly match adjudication contract")
    _require_sha256(packet["adjudication_notes_digest"], "adjudication_notes_digest")
    if packet["model_input_contains_gold"] is not False:
        raise ValueError("model_input_contains_gold must be false")

    return packet


def validate_packet_set(
    packets: list[Any],
    expected_matrix: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    expected_matrix = expected_matrix or load_expected_matrix()
    if len(packets) != len(expected_matrix):
        raise ValueError(f"expected {len(expected_matrix)} completed packets, found {len(packets)}")

    by_id: dict[str, Any] = {}
    for packet in packets:
        if not isinstance(packet, dict):
            raise ValueError("packet set contains non-object")
        packet_id = packet.get("packet_id")
        if packet_id in by_id:
            raise ValueError(f"duplicate packet_id: {packet_id}")
        if packet_id not in expected_matrix:
            raise ValueError(f"unexpected packet_id: {packet_id}")
        validate_completed_packet(packet, expected_matrix[packet_id])
        by_id[packet_id] = packet

    missing = set(expected_matrix) - set(by_id)
    if missing:
        raise ValueError(f"missing expected packets: {sorted(missing)}")

    return {
        "result": "PASS",
        "packet_count": len(by_id),
        "expected_packet_count": len(expected_matrix),
        "all_expected_case_task_packets_present_once": True,
        "independent_review_thresholds_satisfied": True,
        "source_digest_and_locator_binding_satisfied": True,
        "ontology_validation_satisfied": True,
        "model_input_contains_gold": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--packets-dir", required=True)
    parser.add_argument("--closure")
    parser.add_argument("--manifest")
    args = parser.parse_args()

    expected = load_expected_matrix(
        Path(args.closure) if args.closure else None,
        Path(args.manifest) if args.manifest else None,
    )
    packet_paths = sorted(Path(args.packets_dir).glob("*.json"))
    packets = [_load_json(path) for path in packet_paths]
    result = validate_packet_set(packets, expected)
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
