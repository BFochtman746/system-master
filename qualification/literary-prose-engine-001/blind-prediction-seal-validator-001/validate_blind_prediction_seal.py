#!/usr/bin/env python3
"""Fail-closed integrity validator and create-only writer for blind prediction seals."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

TOP_FIELDS = {
    "seal_id", "contract_id", "objective", "evaluation_branch", "prediction_records",
    "raw_prose_present", "candidate_prose_present", "manuscript_mutated",
    "revision_authority", "author_labels_accessed_before_seal",
}
RECORD_FIELDS = {
    "case_id", "passage_sha256", "semantic_disposition", "step_f_finding_class",
    "confidence", "abstention_or_downgrade_reason", "diagnosis_allowed",
    "revision_allowed",
}
SEMANTIC_DISPOSITIONS = {
    "REAL_LIMITATION", "WORKING_AS_INTENDED", "NEUTRAL_OBSERVATION", "UNCERTAIN"
}
FINDING_CLASSES = {
    "STRENGTH", "LIMITATION", "RISK", "OPPORTUNITY_SUPPORT", "NO_FINDING", "BLOCKED"
}
PROHIBITED_KEYS = {
    "author_label", "ground_truth", "ground_truth_label", "comparison_result",
    "raw_text", "passage_text", "source_excerpt", "quote", "rewrite_text",
    "candidate_text", "prompt_payload", "embedding_payload",
}
HEX = set("0123456789abcdef")


def _digest(value):
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(char in HEX for char in value.lower())
    )


def _finite_01(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0.0 <= value <= 1.0
    )


def _find_prohibited(value, path="$"):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in PROHIBITED_KEYS:
                return f"{path}.{key}"
            found = _find_prohibited(child, f"{path}.{key}")
            if found:
                return found
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found = _find_prohibited(child, f"{path}[{index}]")
            if found:
                return found
    return None


def validate(contract, seal):
    errors = []
    normalized = None
    if not isinstance(contract, dict):
        return {"standing": "REJECT", "errors": ["CONTRACT_OBJECT_REQUIRED"], "normalized": None}
    if not isinstance(seal, dict):
        return {"standing": "REJECT", "errors": ["SEAL_OBJECT_REQUIRED"], "normalized": None}

    prohibited = _find_prohibited(seal)
    if prohibited:
        errors.append(f"PROHIBITED_FIELD:{prohibited}")

    missing = sorted(TOP_FIELDS - set(seal))
    extra = sorted(set(seal) - TOP_FIELDS)
    if missing:
        errors.append("TOP_FIELDS_MISSING:" + ",".join(missing))
    if extra:
        errors.append("TOP_FIELDS_EXTRA:" + ",".join(extra))

    fixed = {
        "contract_id": contract.get("contract_id"),
        "objective": contract.get("objective"),
        "evaluation_branch": contract.get("blind_branch"),
        "raw_prose_present": False,
        "candidate_prose_present": False,
        "manuscript_mutated": False,
        "revision_authority": False,
        "author_labels_accessed_before_seal": False,
    }
    for field, expected in fixed.items():
        if seal.get(field) != expected:
            errors.append(f"FIXED_VALUE_MISMATCH:{field}")

    if not isinstance(seal.get("seal_id"), str) or not seal.get("seal_id"):
        errors.append("SEAL_ID_REQUIRED")

    cases = contract.get("cases")
    if not isinstance(cases, list) or not cases:
        errors.append("CONTRACT_CASES_REQUIRED")
        cases = []
    expected = {}
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            errors.append(f"CONTRACT_CASE_{index}_OBJECT_REQUIRED")
            continue
        case_id = case.get("case_id")
        digest = case.get("passage_sha256")
        if not isinstance(case_id, str) or not case_id:
            errors.append(f"CONTRACT_CASE_{index}_ID_REQUIRED")
            continue
        if case_id in expected:
            errors.append(f"CONTRACT_CASE_DUPLICATE:{case_id}")
            continue
        if not _digest(digest):
            errors.append(f"CONTRACT_CASE_DIGEST_INVALID:{case_id}")
            continue
        expected[case_id] = digest.lower()

    records = seal.get("prediction_records")
    if not isinstance(records, list):
        errors.append("PREDICTION_RECORDS_ARRAY_REQUIRED")
        records = []
    seen = {}
    clean_records = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append(f"RECORD_{index}_OBJECT_REQUIRED")
            continue
        missing = sorted(RECORD_FIELDS - set(record))
        extra = sorted(set(record) - RECORD_FIELDS)
        if missing:
            errors.append(f"RECORD_{index}_FIELDS_MISSING:" + ",".join(missing))
        if extra:
            errors.append(f"RECORD_{index}_FIELDS_EXTRA:" + ",".join(extra))
        case_id = record.get("case_id")
        if not isinstance(case_id, str) or not case_id:
            errors.append(f"RECORD_{index}_CASE_ID_REQUIRED")
        elif case_id in seen:
            errors.append(f"RECORD_CASE_DUPLICATE:{case_id}")
        else:
            seen[case_id] = index
        if case_id not in expected:
            errors.append(f"RECORD_CASE_UNEXPECTED:{case_id}")
        digest = record.get("passage_sha256")
        if not _digest(digest):
            errors.append(f"RECORD_DIGEST_INVALID:{case_id}")
        elif case_id in expected and digest.lower() != expected[case_id]:
            errors.append(f"RECORD_DIGEST_MISMATCH:{case_id}")
        if record.get("semantic_disposition") not in SEMANTIC_DISPOSITIONS:
            errors.append(f"RECORD_SEMANTIC_DISPOSITION_INVALID:{case_id}")
        if record.get("step_f_finding_class") not in FINDING_CLASSES:
            errors.append(f"RECORD_FINDING_CLASS_INVALID:{case_id}")
        confidence = record.get("confidence")
        if not _finite_01(confidence):
            errors.append(f"RECORD_CONFIDENCE_INVALID:{case_id}")
        if not isinstance(record.get("diagnosis_allowed"), bool):
            errors.append(f"RECORD_DIAGNOSIS_ALLOWED_BOOL_REQUIRED:{case_id}")
        if record.get("revision_allowed") is not False:
            errors.append(f"RECORD_REVISION_AUTHORITY_FORBIDDEN:{case_id}")
        reason = record.get("abstention_or_downgrade_reason")
        if reason is not None and (not isinstance(reason, str) or not reason.strip()):
            errors.append(f"RECORD_REASON_INVALID:{case_id}")
        explanation_needed = (
            record.get("semantic_disposition") == "UNCERTAIN"
            or record.get("step_f_finding_class") == "BLOCKED"
            or record.get("diagnosis_allowed") is False
            or (_finite_01(confidence) and confidence < 0.60)
        )
        if explanation_needed and not (isinstance(reason, str) and reason.strip()):
            errors.append(f"RECORD_REASON_REQUIRED:{case_id}")
        clean_records.append(record)

    missing_cases = sorted(set(expected) - set(seen))
    if missing_cases:
        errors.append("PREDICTION_CASES_MISSING:" + ",".join(missing_cases))
    if len(records) != len(expected):
        errors.append(f"PREDICTION_COUNT_MISMATCH:{len(records)}:{len(expected)}")

    if not errors:
        by_id = {record["case_id"]: dict(record) for record in clean_records}
        normalized = {key: seal[key] for key in sorted(TOP_FIELDS) if key != "prediction_records"}
        normalized["prediction_records"] = [by_id[case["case_id"]] for case in cases]
    return {"standing": "PASS" if not errors else "REJECT", "errors": errors, "normalized": normalized}


def canonical_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def create_only(target, normalized):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with target.open("xb") as handle:
            handle.write(canonical_bytes(normalized))
    except FileExistsError as exc:
        raise RuntimeError("SEAL_ALREADY_EXISTS") from exc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--create-target")
    parser.add_argument("--result")
    args = parser.parse_args()
    contract = json.loads(Path(args.contract).read_text(encoding="utf-8"))
    seal = json.loads(Path(args.candidate).read_text(encoding="utf-8"))
    result = validate(contract, seal)
    if result["standing"] == "PASS" and args.create_target:
        try:
            create_only(args.create_target, result["normalized"])
            result["create_result"] = "CREATED"
        except RuntimeError as exc:
            result["standing"] = "REJECT"
            result["errors"].append(str(exc))
            result["create_result"] = "REFUSED"
    out = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.result:
        Path(args.result).write_text(out, encoding="utf-8")
    print(out, end="")
    raise SystemExit(0 if result["standing"] == "PASS" else 2)


if __name__ == "__main__":
    main()
