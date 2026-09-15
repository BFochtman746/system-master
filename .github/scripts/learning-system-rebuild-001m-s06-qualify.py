#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = "cf936d0798e4eef6ebd459dfeab4747b6f3cc3a9"
QUALIFIED_S05_SUBJECT = "46a3161f15d300c6c2741d2f3569b6e5db4c29ce"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S06-96CASE-QUALIFICATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
RUNTIME = ROOT / "learning/lab/learning_lab/learning_effectiveness.py"
TEST_A = ROOT / "learning/lab/tests/test_learning_effectiveness_s06.py"
TEST_B = ROOT / "learning/lab/tests/test_learning_effectiveness_s06_hardening.py"
LAB = ROOT / "learning/lab"
S05_QUALIFIER = ".github/scripts/learning-system-rebuild-001m-s05-qualify.py"


class QualifierError(RuntimeError):
    pass


def run(command, *, cwd=ROOT):
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        raise QualifierError(f"command failed: {' '.join(command)}\n{output}")
    return output


def require(condition, message):
    if not condition:
        raise QualifierError(message)


def unittest_count(output):
    match = re.search(r"Ran\s+(\d+)\s+tests?", output)
    if not match:
        raise QualifierError(f"unable to parse unittest count from output:\n{output[-4000:]}")
    return int(match.group(1))


def fresh_s05_qualification():
    temp_root = Path(tempfile.mkdtemp(prefix="learning-s06-s05-"))
    worktree = temp_root / "s05"
    try:
        run(["git", "worktree", "add", "--detach", str(worktree), QUALIFIED_S05_SUBJECT])
        output = run([sys.executable, S05_QUALIFIER], cwd=worktree)
        try:
            report = json.loads(output)
        except json.JSONDecodeError as exc:
            raise QualifierError(f"S05 qualifier did not emit JSON: {output[-4000:]}") from exc
        require(report.get("standing") == "PASS", "fresh S05 qualification failed")
        require(report.get("contract_obligations_passed") == "84/84", "fresh S05 denominator not 84/84")
        require(report.get("exact_head") == QUALIFIED_S05_SUBJECT, "fresh S05 qualifier did not run on frozen qualified subject")
        return report
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=ROOT, text=True, capture_output=True)
        shutil.rmtree(temp_root, ignore_errors=True)


def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE.read_text(encoding="utf-8"))

    require(contract["operation"] == "LEARNING-SYSTEM-REBUILD-001M-S06", "S06 contract operation changed")
    require(contract["capability"] == "LEARNING_EFFECTIVENESS_EVALUATION", "S06 capability changed")
    require(contract["status"] == "EXECUTABLE_QUALIFICATION_OBLIGATIONS_FROZEN", "S06 contract no longer frozen")
    require(contract["case_count"] == 96 and len(contract["cases"]) == 96, "S06 contract denominator changed")
    require([row["id"] for row in contract["cases"]] == [f"T{i:02d}" for i in range(1, 97)], "S06 contract IDs changed")
    require(contract["parent"]["closure_commit"] == PARENT, "S06 parent closure changed")
    require(contract["parent"]["qualified_subject"] == QUALIFIED_S05_SUBJECT, "S06 frozen S05 qualified subject changed")

    run(["git", "merge-base", "--is-ancestor", PARENT, "HEAD"])
    counts = active["active_constitution"]
    require((counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "active constitution count changed")
    changed = run(["git", "diff", "--name-only", PARENT, "HEAD"]).splitlines()
    allowed_prefixes = (
        "learning/lab/learning_lab/learning_effectiveness.py",
        "learning/lab/learning_lab/__init__.py",
        "learning/lab/tests/test_learning_effectiveness_s06.py",
        "learning/lab/tests/test_learning_effectiveness_s06_hardening.py",
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S06-96CASE-QUALIFICATION-CONTRACT.json",
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S06-CLOSURE.md",
        ".github/scripts/learning-system-rebuild-001m-s06-qualify.py",
        ".github/workflows/learning-system-rebuild-001m-s06-qualify.yml",
    )
    require(all(any(path.startswith(prefix) for prefix in allowed_prefixes) for path in changed), f"S06 changed unrelated path: {changed}")
    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT, "--", *frozen_paths])

    source = TEST_A.read_text(encoding="utf-8") + "\n" + TEST_B.read_text(encoding="utf-8")
    discovered_ids = sorted(set(re.findall(r"def test_t(\d{2})_", source)))
    require(discovered_ids == [f"{i:02d}" for i in range(1, 97)], f"S06 test method coverage changed: {discovered_ids}")

    isolated_output = run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_learning_effectiveness_s06*.py", "-v"],
        cwd=LAB,
    )
    isolated_count = unittest_count(isolated_output)
    require(isolated_count == 96, f"isolated S06 suite must be exactly 96 tests, observed {isolated_count}")

    runtime_text = RUNTIME.read_text(encoding="utf-8")
    required_runtime_markers = (
        'LEARNING_EFFECTIVENESS_VERSION = "001M-S06-v1"',
        '"owner": "LEARNING"',
        '"generic_statistics_owner": "SHARED_ASSURANCE_OR_ANALYTICS"',
        '"mastery_effect": "NONE"',
        '"educational_effectiveness_proven": False',
        '"universal_generalization_proven": False',
        '"software_qualification_equivalent": False',
        '"system_master_proven_effective": False',
        'SENSITIVE_TRAIT_INFERENCE_FORBIDDEN',
        'DOWNSTREAM_DECISION_FORBIDDEN',
    )
    for marker in required_runtime_markers:
        require(marker in runtime_text, f"S06 runtime marker missing: {marker}")

    s05 = fresh_s05_qualification()

    full_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], cwd=LAB)
    full_count = unittest_count(full_output)
    require(full_count >= 990, f"full Learning regression unexpectedly small: {full_count}")

    checks = {f"T{i:02d}": f"executable test passed: T{i:02d}" for i in range(1, 97)}
    require(len(checks) == 96, "unexpected S06 contract denominator")

    report = {
        "operation": "LEARNING-SYSTEM-REBUILD-001M-S06",
        "capability": "LEARNING_EFFECTIVENESS_EVALUATION",
        "standing": "PASS",
        "claim_class": "SOFTWARE_QUALIFICATION_ONLY",
        "isolated_runtime_tests": isolated_count,
        "full_learning_regression_tests": full_count,
        "contract_obligations_passed": "96/96",
        "parent_s05_qualification": "84/84 PASS FRESH ON FROZEN S05 SUBJECT",
        "parent_s05_exact_subject": QUALIFIED_S05_SUBJECT,
        "parent_s05_full_learning_regression_tests": s05.get("full_learning_regression_tests"),
        "exact_parent": PARENT,
        "exact_head": run(["git", "rev-parse", "HEAD"]).strip(),
        "educational_effectiveness_claim": "NOT_CLAIMED",
        "measurement_validity_claim": "NOT_CLAIMED",
        "system_master_effectiveness_claim": "NOT_CLAIMED",
        "limitations": [
            "Software qualification PASS establishes executable conformance only.",
            "It does not establish that any intervention is educationally effective.",
            "SUPPORTIVE evaluation standing is bounded to the exact evaluated protocol, versions, population/context, outcomes, and analysis.",
            "Actual educational-effectiveness evidence requires real evaluation data and governed interpretation outside this software qualification claim.",
        ],
        "checks": checks,
    }
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except QualifierError as exc:
        print(json.dumps({"operation": "LEARNING-SYSTEM-REBUILD-001M-S06", "standing": "FAIL", "error": str(exc)}))
        raise SystemExit(1)
