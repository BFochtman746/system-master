from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ALLOWED_STATUSES = ["ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"]

CASES = [
    {
        "selection_case_id": "PD-AUSTEN-CH34-001",
        "work_id": "PG-1342-PRIDE-AND-PREJUDICE",
        "landing_url": "https://www.gutenberg.org/ebooks/1342",
        "text_url": "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
        "start_anchor": "In vain have I struggled. It will not do.",
        "end_anchor": "And with these words he hastily left the room",
        "tasks": ["ENTITY_IDENTITY_COREFERENCE", "CAUSAL_GOAL_RELATIONS"],
        "stress_slice": "dialogue-heavy social causality and referent continuity",
    },
    {
        "selection_case_id": "PD-AUSTEN-CH36-002",
        "work_id": "PG-1342-PRIDE-AND-PREJUDICE",
        "landing_url": "https://www.gutenberg.org/ebooks/1342",
        "text_url": "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
        "start_anchor": "She grew absolutely ashamed of herself.",
        "end_anchor": "Till this moment, I never knew myself.",
        "tasks": ["EPISTEMIC_FOCALIZATION", "NARRATIVE_FUNCTION", "SETUP_PAYOFF_OPEN_QUESTION"],
        "stress_slice": "belief-versus-knowledge revision, delayed revelation and reinterpretation",
    },
    {
        "selection_case_id": "PD-CARROLL-CH01-003",
        "work_id": "PG-11-ALICES-ADVENTURES-IN-WONDERLAND",
        "landing_url": "https://www.gutenberg.org/ebooks/11",
        "text_url": "https://www.gutenberg.org/cache/epub/11/pg11.txt",
        "start_anchor": "There was nothing so _very_ remarkable in that",
        "end_anchor": "never once considering how",
        "tasks": ["ANCHOR_LOCALIZATION", "EVENT_IDENTITY", "ENTITY_IDENTITY_COREFERENCE"],
        "stress_slice": "salient event anchors, action continuity and explicit entity tracking",
    },
    {
        "selection_case_id": "PD-CARROLL-CH12-004",
        "work_id": "PG-11-ALICES-ADVENTURES-IN-WONDERLAND",
        "landing_url": "https://www.gutenberg.org/ebooks/11",
        "text_url": "https://www.gutenberg.org/cache/epub/11/pg11.txt",
        "start_anchor": "Who cares for you?",
        "end_anchor": "such a curious dream!",
        "tasks": ["STORY_VS_DISCOURSE_TIME", "ARC_ORCHESTRATION", "NARRATIVE_FUNCTION"],
        "stress_slice": "frame transition, ending orchestration and discourse/story boundary",
    },
    {
        "selection_case_id": "PD-MELVILLE-CH36-005",
        "work_id": "PG-2701-MOBY-DICK",
        "landing_url": "https://www.gutenberg.org/ebooks/2701",
        "text_url": "https://www.gutenberg.org/cache/epub/2701/pg2701.txt",
        "start_anchor": "All ye mast-headers have before now heard me give orders about",
        "end_anchor": "Death to Moby Dick! God hunt us all",
        "tasks": ["CAUSAL_GOAL_RELATIONS", "NARRATIVE_FUNCTION", "ARC_ORCHESTRATION"],
        "stress_slice": "explicit goal declaration, crew alignment and global narrative objective",
    },
    {
        "selection_case_id": "PD-MELVILLE-CH41-006",
        "work_id": "PG-2701-MOBY-DICK",
        "landing_url": "https://www.gutenberg.org/ebooks/2701",
        "text_url": "https://www.gutenberg.org/cache/epub/2701/pg2701.txt",
        "start_anchor": "Ahab had cherished a wild vindictiveness",
        "end_anchor": "he burst his hot heart",
        "tasks": ["EVENT_IDENTITY", "STORY_VS_DISCOURSE_TIME", "SETUP_PAYOFF_OPEN_QUESTION", "EPISTEMIC_FOCALIZATION"],
        "stress_slice": "retrospective event identity, temporal backstory, motivation and narrator knowledge boundary",
    },
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "SystemMasterLiteraryQualification/1.0"})
    with urlopen(req, timeout=45) as response:
        data = response.read()
    if not data:
        raise RuntimeError(f"empty source response: {url}")
    return data


def paragraph_bounds(data: bytes, start_anchor: bytes, end_anchor: bytes) -> tuple[int, int]:
    start_hit = data.find(start_anchor)
    if start_hit < 0:
        raise RuntimeError(f"start anchor not found: {start_anchor!r}")
    end_hit = data.find(end_anchor, start_hit + len(start_anchor))
    if end_hit < 0:
        raise RuntimeError(f"end anchor not found after start: {end_anchor!r}")

    sep = b"\r\n\r\n" if b"\r\n\r\n" in data else b"\n\n"
    before = data.rfind(sep, 0, start_hit)
    start = 0 if before < 0 else before + len(sep)
    after = data.find(sep, end_hit + len(end_anchor))
    end = len(data) if after < 0 else after
    if not (0 <= start < end <= len(data)):
        raise RuntimeError("invalid bounded passage offsets")
    return start, end


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    out_dir = Path(args.output_dir)
    shells_dir = out_dir / "adjudication-shells"
    shells_dir.mkdir(parents=True, exist_ok=True)

    source_cache: dict[str, bytes] = {}
    case_receipts = []
    packet_count = 0

    for case in CASES:
        text_url = case["text_url"]
        data = source_cache.setdefault(text_url, fetch_bytes(text_url))
        start, end = paragraph_bounds(
            data,
            case["start_anchor"].encode("utf-8"),
            case["end_anchor"].encode("utf-8"),
        )
        passage = data[start:end]
        passage_digest = sha256(passage)
        source_file_digest = sha256(data)

        case_receipt = {
            "selection_case_id": case["selection_case_id"],
            "work_id": case["work_id"],
            "source_url": case["landing_url"],
            "exact_text_route": text_url,
            "rights_observation": "PUBLIC_DOMAIN_IN_USA",
            "split": "TEST_ONLY",
            "source_file_sha256": source_file_digest,
            "passage_sha256": passage_digest,
            "passage_byte_start_in_source_file": start,
            "passage_byte_end_exclusive_in_source_file": end,
            "passage_byte_length": len(passage),
            "start_anchor_sha256": sha256(case["start_anchor"].encode("utf-8")),
            "end_anchor_sha256": sha256(case["end_anchor"].encode("utf-8")),
            "tasks": case["tasks"],
            "stress_slice": case["stress_slice"],
            "raw_source_body_committed": False,
            "raw_passage_text_committed": False,
            "human_gold_state": "PENDING",
            "model_prediction_state": "NOT_RUN",
        }
        case_receipts.append(case_receipt)

        for task in case["tasks"]:
            packet_id = f"{case['selection_case_id']}--{task}"
            shell = {
                "packet_id": packet_id,
                "standing": "GOLD_EMPTY_SHELL__HUMAN_ADJUDICATION_REQUIRED",
                "work_id": case["work_id"],
                "source_url": case["landing_url"],
                "exact_text_route": text_url,
                "source_file_sha256": source_file_digest,
                "source_sha256": passage_digest,
                "passage_locator": {
                    "selection_case_id": case["selection_case_id"],
                    "source_file_byte_start": start,
                    "source_file_byte_end_exclusive": end,
                    "source_file_sha256": source_file_digest,
                },
                "task": task,
                "adjudicators": [],
                "gold_labels": [],
                "forbidden_labels": [],
                "intentionally_ambiguous": None,
                "allowed_statuses": ALLOWED_STATUSES,
                "adjudication_notes_digest": None,
                "model_input_contains_gold": False,
                "prediction_frozen": False,
                "human_gold_fabricated": False,
            }
            (shells_dir / f"{packet_id}.json").write_text(
                json.dumps(shell, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )
            packet_count += 1

    task_coverage = sorted({task for case in CASES for task in case["tasks"]})
    expected_tasks = sorted([
        "ANCHOR_LOCALIZATION",
        "ARC_ORCHESTRATION",
        "CAUSAL_GOAL_RELATIONS",
        "ENTITY_IDENTITY_COREFERENCE",
        "EPISTEMIC_FOCALIZATION",
        "EVENT_IDENTITY",
        "NARRATIVE_FUNCTION",
        "SETUP_PAYOFF_OPEN_QUESTION",
        "STORY_VS_DISCOURSE_TIME",
    ])
    if task_coverage != expected_tasks:
        raise RuntimeError(f"task coverage mismatch: {task_coverage}")

    receipt = {
        "gate_id": "LITERARY-EXTRACTION-SOURCE-HELD-OUT-002A__PREHUMAN_SOURCE_CUSTODY",
        "result": "PASS",
        "case_count": len(case_receipts),
        "gold_empty_adjudication_shell_count": packet_count,
        "all_nine_task_families_covered": True,
        "raw_full_work_body_committed": False,
        "raw_passage_text_committed": False,
        "human_gold_fabricated": False,
        "model_score_claimed": False,
        "human_boundary_reached": True,
        "cases": case_receipts,
        "next_state": "BLOCKED — HUMAN",
        "next_required_event": "Independent adjudication under HUMAN-ADJUDICATION-PACKET-CONTRACT-v1.json; high-risk tasks require two independent reviews and unresolved disagreement must be preserved.",
        "a01_required": False,
    }
    (out_dir / "SOURCE-HELDOUT-002-PREHUMAN-CUSTODY-RECEIPT.json").write_text(
        json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "result": receipt["result"],
        "case_count": receipt["case_count"],
        "packet_count": receipt["gold_empty_adjudication_shell_count"],
        "all_nine_task_families_covered": receipt["all_nine_task_families_covered"],
        "human_boundary_reached": receipt["human_boundary_reached"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
