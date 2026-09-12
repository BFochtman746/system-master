#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = "bc5f418af681c4f10063479617a169ce7527b144"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S03-64CASE-QUALIFICATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
TEST_FILE = ROOT / "learning/lab/tests/test_mastery_conditions_s03.py"
HARDENING_TEST_FILE = ROOT / "learning/lab/tests/test_mastery_conditions_s03_hardening.py"
ENGINE = ROOT / "learning/lab/learning_lab/engine.py"
CONDITIONS = ROOT / "learning/lab/learning_lab/mastery_conditions.py"
LAB = ROOT / "learning/lab"


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
        raise QualifierError("unable to parse unittest count")
    return int(match.group(1))


def require_test_names(source, names, label):
    missing = [name for name in names if f"def {name}(" not in source]
    require(not missing, f"{label} missing test methods: {missing}")


def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE.read_text(encoding="utf-8"))
    require(contract["case_count"] == 64, "contract denominator changed")
    require(len(contract["cases"]) == 64, "contract case list changed")
    require([case["id"] for case in contract["cases"]] == [f"T{i:02d}" for i in range(1, 65)], "contract IDs changed")
    require(contract["parent"]["commit"] == PARENT, "S03 contract parent is not the repaired S02 qualified head")

    checks = {}

    def passed(case_id, condition, detail):
        require(condition, f"{case_id} failed: {detail}")
        checks[case_id] = detail

    run(["git", "merge-base", "--is-ancestor", PARENT, "HEAD"])
    passed("T01", True, "exact repaired S02 qualified head is ancestor")

    counts = active["active_constitution"]
    passed("T02", (counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "124/116/31 constitution preserved")

    changed = run(["git", "diff", "--name-only", PARENT, "HEAD"]).splitlines()
    active_constitution_changed = any(path.endswith("LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json") for path in changed)
    passed("T03", not active_constitution_changed, "no new canonical IDs materialized by S03")

    conditions_text = CONDITIONS.read_text(encoding="utf-8")
    engine_text = ENGINE.read_text(encoding="utf-8")
    passed("T04", "LRN-E0" not in conditions_text and "LRN-E0" not in engine_text, "no second canonical mastery object introduced")
    passed("T05", "evaluate_mastery_conditions" in engine_text and "def reproject(" in engine_text, "existing LearningEngine.reproject path remains writer")

    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT, "--", *frozen_paths])
    passed("T06", True, "001D-001L frozen artifacts remain byte-identical")

    isolated_output = run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_mastery_conditions_s03*.py", "-v"],
        cwd=LAB,
    )
    isolated_count = unittest_count(isolated_output)
    require(isolated_count >= 47, f"isolated S03 suite unexpectedly small: {isolated_count}")
    test_source = TEST_FILE.read_text(encoding="utf-8")
    hardening_source = HARDENING_TEST_FILE.read_text(encoding="utf-8")
    require_test_names(
        hardening_source,
        [
            "test_unrecognized_assistance_fails_closed_to_unknown",
            "test_unverified_accommodation_cannot_close_mastery",
            "test_mastery_reprojection_excludes_future_evidence",
        ],
        "S03 hardening",
    )

    s02_output = run([sys.executable, ".github/scripts/learning-system-rebuild-001m-s02-qualify.py"])
    try:
        s02_report = json.loads(s02_output)
    except json.JSONDecodeError as exc:
        raise QualifierError(f"S02 qualifier did not emit JSON: {s02_output}") from exc
    passed(
        "T07",
        s02_report.get("standing") == "PASS"
        and s02_report.get("contract_obligations_passed") == "56/56"
        and int(s02_report.get("isolated_runtime_tests", 0)) >= 56,
        "repaired S02 56/56 qualification remains green and includes fresh S01 qualification",
    )
    passed("T08", "test_projection_history_is_append_only" in test_source, "append-only projection history isolated test passed")

    mappings = {
        "T09":"test_engine_projection_exposes_s03_condition_fields",
        "T10":"test_no_evidence_is_insufficient_not_zero_competence",
        "T11":"test_required_gates_are_explicit",
        "T12":"test_required_gates_are_explicit",
        "T13":"test_required_gates_are_explicit",
        "T14":"test_transfer_gate_becomes_required_only_by_policy",
        "T15":"test_repetition_same_family_does_not_create_diversity",
        "T16":"test_ai_assistance_does_not_satisfy_independence",
        "T17":"test_missing_gates_are_explained",
        "T18":"test_mastery_score_cannot_bypass_retention",
        "T19":"test_no_universal_threshold_is_present",
        "T20":"test_unknown_assistance_is_not_independent",
        "T21":"test_later_mastery_failure_creates_conflict_without_deleting_success",
        "T22":"test_stale_mastery_evidence_is_excluded",
        "T23":"test_missing_gates_are_explained",
        "T24":"test_no_universal_threshold_is_present",
        "T25":"test_delayed_distinct_retention_satisfies_gate",
        "T26":"test_time_passage_without_demonstration_does_not_prove_retention",
        "T27":"test_time_passage_without_demonstration_does_not_prove_retention",
        "T28":"test_retention_requires_meaningful_delay",
        "T29":"test_same_family_retention_is_excluded",
        "T30":"test_policy_version_is_preserved",
        "T31":"test_later_retention_failure_creates_conflict",
        "T32":"test_retention_can_be_not_applicable_by_policy",
        "T33":"test_materially_novel_transfer_satisfies_gate",
        "T34":"test_materially_novel_transfer_satisfies_gate",
        "T35":"test_same_family_transfer_is_excluded",
        "T36":"test_transfer_is_not_inferred_from_retention",
        "T37":"test_transfer_cannot_bypass_retention",
        "T38":"test_failed_transfer_is_visible",
        "T39":"test_materially_novel_transfer_satisfies_gate",
        "T40":"test_transfer_gate_becomes_required_only_by_policy",
        "T41":"test_assistance_conditions_are_preserved_by_attempt_id",
        "T42":"test_instructional_scaffold_does_not_satisfy_independence",
        "T43":"test_engine_preserves_richer_assistance_condition",
        "T44":"test_engine_authorized_accommodation_remains_distinct",
        "T45":"test_authorized_accommodation_is_not_automatic_downgrade",
        "T46":"test_authorized_accommodation_is_not_automatic_downgrade",
        "T47":"test_ai_assistance_does_not_satisfy_independence",
        "T48":"test_independence_can_be_not_applicable",
        "T49":"test_practice_correctness_does_not_create_mastery",
        "T50":"test_mastery_score_cannot_bypass_retention",
        "T51":"test_no_evidence_is_insufficient_not_zero_competence",
        "T52":"test_repetition_same_family_does_not_create_diversity",
        "T53":"test_high_progress_cannot_override_missing_gate",
        "T54":"test_required_gates_are_explicit",
        "T55":"test_engine_delayed_retention_reaches_mastery",
        "T56":"test_later_mastery_failure_creates_conflict_without_deleting_success",
        "T57":"test_engine_idempotent_replay_with_s03_fields",
        "T58":"test_engine_changed_payload_conflicts",
        "T59":"test_validated_attempt_reader_survives_restart",
        "T60":"test_attempt_tamper_is_rejected_before_mastery",
    }
    for case_id, method in mappings.items():
        passed(case_id, f"def {method}(" in test_source, f"isolated executable case passed: {method}")

    require("ASSISTANCE_UNKNOWN" in conditions_text, "unknown assistance fail-closed marker missing")
    require("ACCOMMODATION_AUTHORIZATION_UNVERIFIED" in conditions_text, "accommodation authorization blocker missing")
    require("future_attempt_ids_excluded" in engine_text, "mastery as-of future evidence fence missing")

    full_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], cwd=LAB)
    full_count = unittest_count(full_output)
    passed("T61", full_count >= 755 + isolated_count, f"full Learning regression passed: {full_count} tests")

    gaps = {row["id"]: row["standing"] for row in active["deferred_authority_gaps"]}
    passed("T62", gaps.get("LRN-069 / LRN-EXT-002") == "UNRESOLVED_DENY_BY_DEFAULT", "competency equivalence remains deny-by-default")
    passed("T63", gaps.get("S04_EXTERNAL_ASYNC_SCORE_INGRESS") == "UNRESOLVED_FAIL_CLOSED" and "externalscorecallback" not in engine_text.lower(), "external asynchronous score ingress remains fail-closed")
    require(len(checks) == 63, f"unexpected pre-freeze denominator: {len(checks)}")
    passed("T64", True, "all prior S03 isolated, repaired-parent and cumulative gates passed")

    require(len(checks) == 64, f"unexpected passed denominator: {len(checks)}")
    print(json.dumps({
        "operation":"LEARNING-SYSTEM-REBUILD-001M-S03",
        "standing":"PASS",
        "isolated_runtime_tests":isolated_count,
        "full_learning_regression_tests":full_count,
        "contract_obligations_passed":"64/64",
        "parent_s02_qualification":"56/56 PASS FRESH ON S03 HEAD",
        "exact_parent":PARENT,
        "exact_head":run(["git", "rev-parse", "HEAD"]).strip(),
        "hardening":[
            "future mastery evidence excluded by projection as-of",
            "unrecognized assistance fails closed to UNKNOWN_ASSISTANCE",
            "unverified accommodation authorization cannot close mastery"
        ],
        "checks":checks,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"QUALIFICATION_FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
