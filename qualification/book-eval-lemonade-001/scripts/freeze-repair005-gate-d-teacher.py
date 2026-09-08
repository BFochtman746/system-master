#!/usr/bin/env python3
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

VERSION = "BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE-v1"
PER_TOKEN = 8

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def canonical_json(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--status", required=True)
    ap.add_argument("--taxonomy", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--expected-raw-sha", required=True)
    args = ap.parse_args()

    raw_path = Path(args.raw)
    status_path = Path(args.status)
    taxonomy_path = Path(args.taxonomy)
    out_path = Path(args.output)
    manifest_path = Path(args.manifest)

    status = json.loads(status_path.read_text(encoding="utf-8-sig"))
    raw_sha = sha256_file(raw_path)
    taxonomy_sha = sha256_file(taxonomy_path)

    base_manifest = {
        "objective": "BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D",
        "freeze_version": VERSION,
        "raw_teacher_sha256": raw_sha,
        "expected_raw_teacher_sha256": args.expected_raw_sha.lower(),
        "status_output_sha256": str(status.get("output_sha256", "")).lower(),
        "status_sha256": sha256_file(status_path),
        "taxonomy_sha256": taxonomy_sha,
        "state": "TEACHER_FREEZE_VALIDATION_STARTED",
        "hidden_holdout_gold_used": bool(status.get("hidden_holdout_gold_used")),
        "visible_regression_gold_used": bool(status.get("visible_regression_gold_used")),
    }

    def fail(reason, extra=None):
        m = dict(base_manifest)
        m["state"] = "TEACHER_FREEZE_CONFLICT"
        m["failure_reason"] = reason
        if extra:
            m.update(extra)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(m, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        raise SystemExit(reason)

    if status.get("state") != "TEACHER_SYNTHETIC_FROZEN":
        fail("teacher status is not TEACHER_SYNTHETIC_FROZEN")
    if int(status.get("expected_records", -1)) != 440 or int(status.get("completed_records", -1)) != 440:
        fail("teacher status does not prove 440/440")
    if bool(status.get("hidden_holdout_gold_used")) or bool(status.get("visible_regression_gold_used")):
        fail("teacher status claims forbidden gold access")
    if raw_sha.lower() != args.expected_raw_sha.lower():
        fail("raw teacher SHA-256 does not match frozen v3 evidence")
    if str(status.get("output_sha256", "")).lower() != raw_sha.lower():
        fail("teacher status output_sha256 does not match raw teacher file")

    taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8-sig"))
    expected = {}
    ordered_ids = []
    all_tokens = set()
    for task, task_obj in taxonomy["task_modes"].items():
        for specialist, tokens in task_obj["specialists"].items():
            all_tokens.update(tokens)
            for token in tokens:
                for serial in range(1, PER_TOKEN + 1):
                    rid = f"DT-{task[:3]}-{specialist[:6]}-{token}-{serial:02d}"
                    if rid in expected:
                        fail("expected teacher ID collision", {"collision_id": rid})
                    expected[rid] = {
                        "task_mode": task,
                        "specialist_id": specialist,
                        "target_token": token,
                        "serial": serial,
                    }
                    ordered_ids.append(rid)

    if len(expected) != 440:
        fail("taxonomy does not imply exactly 440 expected teacher IDs", {"expected_ids": len(expected)})

    raw_lines = [line for line in raw_path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    grouped = defaultdict(list)
    parse_errors = []
    for physical_index, line in enumerate(raw_lines, start=1):
        try:
            row = json.loads(line)
        except Exception as exc:
            parse_errors.append({"line": physical_index, "error": f"{type(exc).__name__}:{exc}"})
            continue
        rid = row.get("teacher_record_id")
        if not rid:
            fail("teacher row missing teacher_record_id", {"physical_line": physical_index})
        grouped[rid].append(row)
    if parse_errors:
        fail("raw teacher JSONL contains unparsable rows", {"parse_errors": parse_errors[:20]})

    unknown = sorted(set(grouped) - set(expected))
    missing = sorted(set(expected) - set(grouped))
    if unknown:
        fail("raw teacher contains unknown IDs", {"unknown_ids": unknown})
    if missing:
        fail("raw teacher is missing expected IDs", {"missing_ids": missing})

    canonical_rows = {}
    duplicate_ids = []
    duplicate_physical_rows = 0
    conflicting = []
    for rid in ordered_ids:
        rows = grouped[rid]
        spec = expected[rid]
        normalized = defaultdict(list)
        for row in rows:
            normalized[canonical_json(row)].append(row)
        if len(normalized) != 1:
            conflicting.append({
                "teacher_record_id": rid,
                "physical_occurrences": len(rows),
                "distinct_payloads": len(normalized),
            })
            continue
        row = rows[0]
        if len(rows) > 1:
            duplicate_ids.append(rid)
            duplicate_physical_rows += len(rows) - 1

        if row.get("task_mode") != spec["task_mode"]:
            fail("teacher task_mode drift", {"teacher_record_id": rid})
        if row.get("specialist_id") != spec["specialist_id"]:
            fail("teacher specialist_id drift", {"teacher_record_id": rid})
        if row.get("target_token") != spec["target_token"]:
            fail("teacher target_token drift", {"teacher_record_id": rid})
        if int(row.get("serial", -1)) != spec["serial"]:
            fail("teacher serial drift", {"teacher_record_id": rid})
        if row.get("source_lane") != "TEACHER_SYNTHETIC" or row.get("rights_class") != "SYNTHETIC_ORIGINAL":
            fail("teacher source/rights drift", {"teacher_record_id": rid})
        if row.get("hidden_holdout_gold_used") is not False or row.get("visible_regression_gold_used") is not False:
            fail("teacher row claims forbidden gold access", {"teacher_record_id": rid})
        text = str(row.get("input_text", ""))
        leaked = sorted(token for token in all_tokens if token in text)
        if leaked:
            fail("ontology token leaked into teacher input_text", {"teacher_record_id": rid, "leaked_tokens": leaked})
        canonical_rows[rid] = row

    if conflicting:
        fail(
            "duplicate teacher IDs contain conflicting payloads",
            {
                "conflicting_duplicate_ids": conflicting,
                "raw_physical_records": len(raw_lines),
                "unique_teacher_ids": len(grouped),
            },
        )

    if len(canonical_rows) != 440:
        fail("canonical teacher row count is not 440", {"canonical_records": len(canonical_rows)})

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        for rid in ordered_ids:
            f.write(canonical_json(canonical_rows[rid]) + "\n")

    canonical_sha = sha256_file(out_path)
    manifest = dict(base_manifest)
    manifest.update({
        "state": "TEACHER_SYNTHETIC_CANONICAL_FROZEN",
        "raw_physical_records": len(raw_lines),
        "unique_teacher_ids": len(grouped),
        "canonical_records": 440,
        "duplicate_teacher_ids": duplicate_ids,
        "duplicate_teacher_id_count": len(duplicate_ids),
        "duplicate_physical_rows_removed": duplicate_physical_rows,
        "conflicting_duplicate_ids": [],
        "canonical_teacher_sha256": canonical_sha,
        "canonical_order": "taxonomy_task_specialist_token_then_serial_01_to_08",
        "raw_teacher_preserved_unchanged": True,
        "gold_boundary_pass": True,
    })
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
