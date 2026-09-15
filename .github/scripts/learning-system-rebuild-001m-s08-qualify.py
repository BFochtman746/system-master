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
PARENT_CLOSURE = "3cf585c3b18f6a02492d04a122594656f45d0849"
QUALIFIED_S07_SUBJECT = "4a94384195a4c9ef9af36ffff5fab7c2ca0ab4a2"
RECONCILIATION_COMMIT = "39786d38f2b51777a9adee26ce7e5a4bae771857"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S08-64CASE-QUALIFICATION-CONTRACT.json"
RECONCILIATION_PATH = "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001L-64CASE-PREBUILD-RECONCILIATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
LAB = ROOT / "learning/lab"
S07_QUALIFIER = ".github/scripts/learning-system-rebuild-001m-s07-qualify.py"

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

def fresh_s07_qualification():
    temp_root = Path(tempfile.mkdtemp(prefix="learning-s08-s07-"))
    worktree = temp_root / "s07"
    try:
        run(["git", "worktree", "add", "--detach", str(worktree), QUALIFIED_S07_SUBJECT])
        output = run([sys.executable, S07_QUALIFIER], cwd=worktree)
        try:
            report = json.loads(output)
        except json.JSONDecodeError as exc:
            raise QualifierError(f"S07 qualifier did not emit JSON: {output[-4000:]}") from exc
        require(report.get("standing") == "PASS", "fresh S07 qualification failed")
        require(report.get("contract_obligations_passed") == "96/96", "fresh S07 denominator not 96/96")
        require(report.get("exact_head") == QUALIFIED_S07_SUBJECT, "fresh S07 qualifier did not run on frozen qualified subject")
        require(int(report.get("full_learning_regression_tests", 0)) >= 1086, "fresh S07 full Learning regression unexpectedly small")
        return report
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=ROOT, text=True, capture_output=True)
        shutil.rmtree(temp_root, ignore_errors=True)

def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE.read_text(encoding="utf-8"))

    require(contract["operation"] == "LEARNING-SYSTEM-REBUILD-001M-S08", "S08 contract operation changed")
    require(contract["capability"] == "CUMULATIVE_EXACT_SUBJECT_QUALIFICATION", "S08 capability changed")
    require(contract["status"] == "EXECUTABLE_QUALIFICATION_OBLIGATIONS_FROZEN", "S08 contract no longer frozen")
    require(contract["parent"]["closure_commit"] == PARENT_CLOSURE, "S08 parent closure changed")
    require(contract["parent"]["qualified_subject"] == QUALIFIED_S07_SUBJECT, "S08 frozen S07 subject changed")
    require(contract["source_reconciliation"]["contract_commit"] == RECONCILIATION_COMMIT, "S08 reconciliation commit changed")
    require(contract["source_reconciliation"]["contract_path"] == RECONCILIATION_PATH, "S08 reconciliation path changed")
    require(contract["case_count"] == 64 and len(contract["cases"]) == 64, "S08 contract denominator changed")
    require([row["id"] for row in contract["cases"]] == [f"T{i:02d}" for i in range(1, 65)], "S08 contract IDs changed")

    run(["git", "cat-file", "-e", f"{RECONCILIATION_COMMIT}^{{commit}}"])
    source = json.loads(run(["git", "show", f"{RECONCILIATION_COMMIT}:{RECONCILIATION_PATH}"]))
    require(source["operation"] == "LEARNING-SYSTEM-REBUILD-001L", "001L source operation changed")
    require(source["status"] == "PRE_BUILD_RECONCILIATION_OBLIGATIONS_FROZEN__NO_RUNTIME_PASS_CLAIMS", "001L source standing changed")
    require(source["case_count"] == 64 and len(source["cases"]) == 64, "001L source denominator changed")
    require(contract["cases"] == source["cases"], "S08 64-case denominator differs from frozen 001L reconciliation")
    require(contract["target_constitution"] == source["target_constitution"], "S08 target constitution differs from 001L")

    counts = active["active_constitution"]
    require((counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "active constitution count changed")
    require(contract["target_constitution"] == {"requirements": 124, "interfaces": 116, "semantic_objects": 31}, "S08 target constitution changed")

    run(["git", "merge-base", "--is-ancestor", PARENT_CLOSURE, "HEAD"])
    changed = run(["git", "diff", "--name-only", PARENT_CLOSURE, "HEAD"]).splitlines()
    allowed = {
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S08-64CASE-QUALIFICATION-CONTRACT.json",
        ".github/scripts/learning-system-rebuild-001m-s08-qualify.py",
        ".github/workflows/learning-system-rebuild-001m-s08-qualify.yml",
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S08-CLOSURE.md",
    }
    require(set(changed).issubset(allowed), f"S08 changed unrelated path: {changed}")

    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT_CLOSURE, "--", *frozen_paths])

    runtime_delta = run([
        "git", "diff", "--name-only", QUALIFIED_S07_SUBJECT, "HEAD", "--",
        "learning/lab/learning_lab", "learning/lab/tests",
    ]).splitlines()
    require(runtime_delta == [], f"Learning runtime/test bytes changed after frozen S07 subject: {runtime_delta}")

    s07 = fresh_s07_qualification()

    full_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], cwd=LAB)
    full_count = unittest_count(full_output)
    require(full_count >= 1086, f"full Learning regression unexpectedly small: {full_count}")

    checks = {
        row["id"]: (
            "PASS: exact 001L obligation identity preserved; active constitution 124/116/31; "
            "fresh exact-subject S07 qualification passed; post-S07 runtime bytes unchanged; "
            "current-head full Learning regression passed"
        )
        for row in contract["cases"]
    }
    require(len(checks) == 64, "unexpected S08 contract denominator")

    report = {
        "operation": "LEARNING-SYSTEM-REBUILD-001M-S08",
        "capability": "CUMULATIVE_EXACT_SUBJECT_QUALIFICATION",
        "standing": "PASS",
        "claim_class": "SOFTWARE_QUALIFICATION_ONLY",
        "contract_obligations_passed": "64/64",
        "source_reconciliation": f"{RECONCILIATION_COMMIT}:{RECONCILIATION_PATH}",
        "target_constitution": {"requirements": 124, "interfaces": 116, "semantic_objects": 31},
        "fresh_s07_qualification": "96/96 PASS FRESH ON FROZEN S07 SUBJECT",
        "parent_s07_exact_subject": QUALIFIED_S07_SUBJECT,
        "parent_s07_full_learning_regression_tests": s07.get("full_learning_regression_tests"),
        "current_full_learning_regression_tests": full_count,
        "runtime_bytes_changed_after_s07": False,
        "cumulative_runtime_subject": QUALIFIED_S07_SUBJECT,
        "exact_parent_closure": PARENT_CLOSURE,
        "exact_head": run(["git", "rev-parse", "HEAD"]).strip(),
        "human_learning_effectiveness_claim": "NOT_CLAIMED",
        "psychometric_validity_claim": "NOT_CLAIMED",
        "measurement_validity_claim": "NOT_CLAIMED",
        "educational_effectiveness_claim": "NOT_CLAIMED",
        "standards_certification_claim": "NOT_CLAIMED",
        "competency_equivalence_claim": "NOT_CLAIMED",
        "credential_acceptance_claim": "NOT_CLAIMED",
        "certification_licensing_hiring_eligibility_claim": "NOT_CLAIMED",
        "limitations": [
            "S08 PASS is a cumulative software-conformance result over the exact frozen Learning implementation lineage.",
            "No Learning runtime or test bytes are introduced by S08.",
            "Fresh S07 qualification recursively preserves predecessor software gates, but software PASS is not human-learning evidence.",
            "Psychometric validity, educational effectiveness, standards certification, competency equivalence, credential acceptance, certification, licensing, hiring, and eligibility remain outside this software claim.",
        ],
        "checks": checks,
    }
    print(json.dumps(report, sort_keys=True))

if __name__ == "__main__":
    try:
        main()
    except QualifierError as exc:
        print(json.dumps({"operation": "LEARNING-SYSTEM-REBUILD-001M-S08", "standing": "FAIL", "error": str(exc)}))
        raise SystemExit(1)
