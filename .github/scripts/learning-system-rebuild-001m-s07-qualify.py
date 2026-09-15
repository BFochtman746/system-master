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
PARENT = "3a31d49c91feac4a0827b4d49d433e436f347534"
QUALIFIED_S06_SUBJECT = "017355508412f3e84c2ede20040234c875bc830e"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S07-96CASE-QUALIFICATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
RUNTIME = ROOT / "learning/lab/learning_lab/standards_interoperability.py"
TEST_A = ROOT / "learning/lab/tests/test_standards_interoperability_s07.py"
TEST_B = ROOT / "learning/lab/tests/test_standards_interoperability_s07_hardening.py"
LAB = ROOT / "learning/lab"
S06_QUALIFIER = ".github/scripts/learning-system-rebuild-001m-s06-qualify.py"


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


def fresh_s06_qualification():
    temp_root = Path(tempfile.mkdtemp(prefix="learning-s07-s06-"))
    worktree = temp_root / "s06"
    try:
        run(["git", "worktree", "add", "--detach", str(worktree), QUALIFIED_S06_SUBJECT])
        output = run([sys.executable, S06_QUALIFIER], cwd=worktree)
        try:
            report = json.loads(output)
        except json.JSONDecodeError as exc:
            raise QualifierError(f"S06 qualifier did not emit JSON: {output[-4000:]}") from exc
        require(report.get("standing") == "PASS", "fresh S06 qualification failed")
        require(report.get("contract_obligations_passed") == "96/96", "fresh S06 denominator not 96/96")
        require(report.get("exact_head") == QUALIFIED_S06_SUBJECT, "fresh S06 qualifier did not run on frozen qualified subject")
        return report
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=ROOT, text=True, capture_output=True)
        shutil.rmtree(temp_root, ignore_errors=True)


def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE.read_text(encoding="utf-8"))

    require(contract["operation"] == "LEARNING-SYSTEM-REBUILD-001M-S07", "S07 contract operation changed")
    require(contract["capability"] == "STANDARDS_INTEROPERABILITY_ADAPTERS", "S07 capability changed")
    require(contract["status"] == "EXECUTABLE_QUALIFICATION_OBLIGATIONS_FROZEN", "S07 contract no longer frozen")
    require(contract["case_count"] == 96 and len(contract["cases"]) == 96, "S07 contract denominator changed")
    require([row["id"] for row in contract["cases"]] == [f"T{i:02d}" for i in range(1, 97)], "S07 contract IDs changed")
    require(contract["parent"]["closure_commit"] == PARENT, "S07 parent closure changed")
    require(contract["parent"]["qualified_subject"] == QUALIFIED_S06_SUBJECT, "S07 frozen S06 qualified subject changed")

    run(["git", "merge-base", "--is-ancestor", PARENT, "HEAD"])
    counts = active["active_constitution"]
    require((counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "active constitution count changed")
    changed = run(["git", "diff", "--name-only", PARENT, "HEAD"]).splitlines()
    allowed_prefixes = (
        "learning/lab/learning_lab/standards_interoperability.py",
        "learning/lab/learning_lab/__init__.py",
        "learning/lab/tests/test_standards_interoperability_s07.py",
        "learning/lab/tests/test_standards_interoperability_s07_hardening.py",
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S07-96CASE-QUALIFICATION-CONTRACT.json",
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S07-CLOSURE.md",
        ".github/scripts/learning-system-rebuild-001m-s07-qualify.py",
        ".github/workflows/learning-system-rebuild-001m-s07-qualify.yml",
    )
    require(all(any(path.startswith(prefix) for prefix in allowed_prefixes) for path in changed), f"S07 changed unrelated path: {changed}")

    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT, "--", *frozen_paths])

    source = TEST_A.read_text(encoding="utf-8") + "\n" + TEST_B.read_text(encoding="utf-8")
    discovered_ids = sorted(set(re.findall(r"def test_t(\d{2})_", source)))
    require(discovered_ids == [f"{i:02d}" for i in range(1, 97)], f"S07 test method coverage changed: {discovered_ids}")

    isolated_output = run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_standards_interoperability_s07*.py", "-v"],
        cwd=LAB,
    )
    isolated_count = unittest_count(isolated_output)
    require(isolated_count == 96, f"isolated S07 suite must be exactly 96 tests, observed {isolated_count}")

    runtime_text = RUNTIME.read_text(encoding="utf-8")
    required_runtime_markers = (
        'STANDARDS_INTEROPERABILITY_VERSION="001M-S07-v1"',
        'INTEROPERABILITY_OWNER="LEARNING_ADAPTER_TRANSLATION_ONLY"',
        '"canonical_learning_effect":"NONE"',
        '"canonical_curriculum_effect":"NONE"',
        '"canonical_identity_effect":"NONE"',
        '"mastery_effect"',
        '"credential_acceptance_effect"',
        'SENSITIVE_TRAIT_INFERENCE_FORBIDDEN',
        'DOWNSTREAM_CLAIM_FORBIDDEN',
        'fresh_software_qualification_required',
        'runtime_pass_is_external_authority_proof',
    )
    for marker in required_runtime_markers:
        require(marker in runtime_text, f"S07 runtime marker missing: {marker}")

    s06 = fresh_s06_qualification()

    full_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], cwd=LAB)
    full_count = unittest_count(full_output)
    require(full_count >= 1086, f"full Learning regression unexpectedly small: {full_count}")

    checks = {f"T{i:02d}": f"executable test passed: T{i:02d}" for i in range(1, 97)}
    require(len(checks) == 96, "unexpected S07 contract denominator")

    report = {
        "operation": "LEARNING-SYSTEM-REBUILD-001M-S07",
        "capability": "STANDARDS_INTEROPERABILITY_ADAPTERS",
        "standing": "PASS",
        "claim_class": "SOFTWARE_QUALIFICATION_ONLY",
        "isolated_runtime_tests": isolated_count,
        "full_learning_regression_tests": full_count,
        "contract_obligations_passed": "96/96",
        "parent_s06_qualification": "96/96 PASS FRESH ON FROZEN S06 SUBJECT",
        "parent_s06_exact_subject": QUALIFIED_S06_SUBJECT,
        "parent_s06_full_learning_regression_tests": s06.get("full_learning_regression_tests"),
        "exact_parent": PARENT,
        "exact_head": run(["git", "rev-parse", "HEAD"]).strip(),
        "standards_conformance_certification_claim": "NOT_CLAIMED",
        "competency_equivalence_claim": "NOT_CLAIMED",
        "credential_acceptance_claim": "NOT_CLAIMED",
        "assessment_validity_claim": "NOT_CLAIMED",
        "mastery_validity_claim": "NOT_CLAIMED",
        "educational_effectiveness_claim": "NOT_CLAIMED",
        "certification_licensing_eligibility_claim": "NOT_CLAIMED",
        "limitations": [
            "Software qualification PASS establishes executable conformance to the frozen 96-case S07 contract only.",
            "It does not certify CASE, QTI, Caliper, or CLR conformance on behalf of any standards body.",
            "It does not establish competency equivalence, credential acceptance, assessment validity, mastery validity, or educational effectiveness.",
            "External semantic admission and consequential decisions remain with their canonical owners.",
        ],
        "checks": checks,
    }
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except QualifierError as exc:
        print(json.dumps({"operation": "LEARNING-SYSTEM-REBUILD-001M-S07", "standing": "FAIL", "error": str(exc)}))
        raise SystemExit(1)
