#!/usr/bin/env python3
"""Aggregate PQF-001F report-only quality evidence into one exact-subject JSON receipt."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "qualification-output" / "pqf-001f"
CONTRACT = ROOT / "qualification" / "pqf" / "PQF-001F-MULTI-LANGUAGE-QUALITY-BASELINE-CONTRACT-001.json"


def fail(message: str) -> None:
    raise SystemExit(f"PQF-001F baseline aggregation failed: {message}")


def pct(covered: int, total: int) -> float | None:
    if total == 0:
        return None
    return round((covered * 100.0) / total, 4)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def counter(covered: int, missed: int) -> dict[str, Any]:
    total = covered + missed
    return {"covered": covered, "missed": missed, "total": total, "pct": pct(covered, total)}


def parse_jacoco(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"missing JaCoCo XML: {path}")
    root = ET.parse(path).getroot()
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    included_files = 0
    excluded_test_files = 0
    for package in root.findall("package"):
        package_name = package.attrib.get("name", "")
        for source in package.findall("sourcefile"):
            name = source.attrib.get("name", "")
            # System Master intentionally compiles many *Test.java files as main classes so
            # QualificationBridgeTest can invoke them. They must not inflate production coverage.
            if name.endswith("Test.java") or name.endswith("Tests.java"):
                excluded_test_files += 1
                continue
            included_files += 1
            for item in source.findall("counter"):
                kind = item.attrib["type"]
                missed = int(item.attrib["missed"])
                covered = int(item.attrib["covered"])
                totals[kind][0] += covered
                totals[kind][1] += missed
    required = {"LINE", "BRANCH", "METHOD", "COMPLEXITY"}
    missing = sorted(required.difference(totals))
    if missing:
        fail(f"JaCoCo production-filtered counters missing: {missing}")
    return {
        "scope": "production Java sourcefiles excluding *Test.java/*Tests.java",
        "included_sourcefiles": included_files,
        "excluded_test_sourcefiles": excluded_test_files,
        "line": counter(*totals["LINE"]),
        "branch": counter(*totals["BRANCH"]),
        "method": counter(*totals["METHOD"]),
        "complexity": counter(*totals["COMPLEXITY"]),
    }


def parse_python_coverage(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"missing coverage.py JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    totals = data.get("totals") or {}
    statements = int(totals.get("num_statements", 0))
    covered_lines = int(totals.get("covered_lines", 0))
    branches = int(totals.get("num_branches", 0))
    covered_branches = int(totals.get("covered_branches", 0))
    if statements == 0:
        fail("coverage.py reported zero Python statements")
    return {
        "scope": "control-gateway/python + tools production Python; tests omitted from denominator",
        "files": len(data.get("files") or {}),
        "line": counter(covered_lines, max(0, statements - covered_lines)),
        "branch": counter(covered_branches, max(0, branches - covered_branches)),
        "excluded_lines": int(totals.get("excluded_lines", 0)),
        "partial_branches": int(totals.get("num_partial_branches", 0)),
    }


def normalize_istanbul_metric(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("invalid c8 summary metric")
    covered = int(value.get("covered", 0))
    total = int(value.get("total", 0))
    return {"covered": covered, "missed": max(0, total - covered), "total": total, "pct": pct(covered, total)}


def parse_js_coverage(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"missing c8 JSON summary: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    total = data.get("total") or {}
    required = ("lines", "branches", "functions", "statements")
    if any(key not in total for key in required):
        fail("c8 summary missing required total counters")
    result = {
        "scope": "control-gateway/src + system-master/book-system JavaScript; tests excluded; --all enabled",
        "files": max(0, len(data) - 1),
    }
    for key in required:
        result[key[:-1] if key.endswith("s") else key] = normalize_istanbul_metric(total[key])
    return result


def production_row(row: dict[str, str]) -> bool:
    raw = (row.get("file") or "").replace("\\", "/")
    name = Path(raw).name
    if "/test/" in raw or "/tests/" in raw:
        return False
    if name.startswith("test_") or name.endswith(".test.js") or name.endswith("Test.java") or name.endswith("Tests.java"):
        return False
    return True


def language_for(path: str) -> str:
    value = path.lower()
    if value.endswith(".java"):
        return "java"
    if value.endswith(".py"):
        return "python"
    if value.endswith((".js", ".mjs", ".cjs")):
        return "javascript"
    return "other"


def parse_lizard(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"missing Lizard CSV: {path}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"NLOC", "CCN", "token", "PARAM", "file", "function", "start", "end"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            fail(f"unexpected Lizard CSV columns: {reader.fieldnames}")
        for raw in reader:
            if not production_row(raw):
                continue
            try:
                row = {
                    "language": language_for(raw["file"]),
                    "file": raw["file"].replace("\\", "/"),
                    "function": raw["function"],
                    "nloc": int(raw["NLOC"]),
                    "ccn": int(raw["CCN"]),
                    "tokens": int(raw["token"]),
                    "parameters": int(raw["PARAM"]),
                    "start": int(raw["start"]),
                    "end": int(raw["end"]),
                }
            except (KeyError, TypeError, ValueError) as exc:
                fail(f"invalid Lizard CSV row: {exc}")
            if row["language"] != "other":
                rows.append(row)
    if not rows:
        fail("Lizard produced zero production functions")
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["language"]].append(row)
    by_language: dict[str, Any] = {}
    for language, items in sorted(grouped.items()):
        total_ccn = sum(item["ccn"] for item in items)
        by_language[language] = {
            "function_count": len(items),
            "function_nloc_total": sum(item["nloc"] for item in items),
            "average_ccn": round(total_ccn / len(items), 4),
            "max_ccn": max(item["ccn"] for item in items),
            "max_function_nloc": max(item["nloc"] for item in items),
            "max_parameter_count": max(item["parameters"] for item in items),
        }
    outliers = sorted(rows, key=lambda item: (item["ccn"], item["nloc"], item["tokens"]), reverse=True)[:30]
    return {
        "tool_semantics": "structural source complexity indicator; not a correctness verdict",
        "function_count": len(rows),
        "by_language": by_language,
        "top_30_by_ccn_then_nloc": outliers,
    }


def parse_jscpd(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"missing jscpd JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    stats = ((data.get("statistics") or {}).get("total") or {})
    sources = int(stats.get("sources", 0))
    if sources == 0:
        fail("jscpd reported zero analyzed sources")
    duplicates = data.get("duplicates") or []
    compact = []
    for clone in duplicates[:50]:
        first = clone.get("firstFile") or {}
        second = clone.get("secondFile") or {}
        compact.append({
            "format": clone.get("format"),
            "kind": clone.get("kind", "exact"),
            "lines": clone.get("lines"),
            "tokens": clone.get("tokens"),
            "first": {"name": first.get("name"), "start": first.get("start"), "end": first.get("end")},
            "second": {"name": second.get("name"), "start": second.get("start"), "end": second.get("end")},
        })
    return {
        "mode": "default exact/mild baseline; no normalized or near-miss clone policy yet",
        "sources": sources,
        "lines": int(stats.get("lines", 0)),
        "tokens": int(stats.get("tokens", 0)),
        "clones": int(stats.get("clones", len(duplicates))),
        "duplicated_lines": int(stats.get("duplicatedLines", 0)),
        "percentage": float(stats.get("percentage", 0.0)),
        "sample_first_50": compact,
    }


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"missing JSON: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    subject = os.environ.get("GITHUB_SHA") or os.environ.get("PQF_SUBJECT_SHA")
    if not subject or len(subject) != 40:
        fail("exact 40-character subject SHA is required")
    contract = load_json(CONTRACT)
    raw_paths = {
        "java_jacoco_xml": OUT / "java" / "jacoco.xml",
        "python_coverage_json": OUT / "python" / "coverage.json",
        "javascript_c8_json": OUT / "javascript" / "coverage-summary.json",
        "lizard_csv": OUT / "complexity" / "lizard.csv",
        "jscpd_json": OUT / "duplication" / "jscpd-report.json",
        "tool_versions": OUT / "tool-versions.json",
    }
    for path in raw_paths.values():
        if not path.is_file():
            fail(f"required raw report is absent: {path}")
    receipt = {
        "receipt_id": "PQF-001F-MULTI-LANGUAGE-QUALITY-BASELINE-RECEIPT-001",
        "subject_sha": subject,
        "baseline_parent_sha": contract["baseline_parent_sha"],
        "mode": "REPORT_ONLY_NO_QUALITY_THRESHOLDS",
        "thresholds_enforced": False,
        "production_source_mutation_authorized": False,
        "coverage": {
            "java": parse_jacoco(raw_paths["java_jacoco_xml"]),
            "python": parse_python_coverage(raw_paths["python_coverage_json"]),
            "javascript": parse_js_coverage(raw_paths["javascript_c8_json"]),
        },
        "complexity": parse_lizard(raw_paths["lizard_csv"]),
        "duplication": parse_jscpd(raw_paths["jscpd_json"]),
        "tool_versions": load_json(raw_paths["tool_versions"]),
        "raw_report_sha256": {name: sha256_file(path) for name, path in raw_paths.items()},
        "interpretation_law": [
            "Coverage is evidence of executed test reachability, not proof of correctness.",
            "Complexity and duplication values are baseline measurements, not automatic defects.",
            "No percentage, CCN, NLOC, parameter-count, or duplication threshold is authoritative in PQF-001F.",
            "Thresholds may be proposed only after baseline interpretation and risk classification.",
        ],
        "standing": "PQF_001F_REPORT_ONLY_BASELINE_MEASURED__NO_THRESHOLDS_ENFORCED",
    }
    destination = OUT / "PQF-001F-QUALITY-BASELINE.json"
    destination.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    print(f"PQF_001F_BASELINE_RECEIPT={destination}")
    print("PQF_001F_REPORT_ONLY=PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
