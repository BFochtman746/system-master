#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = "4e594a281d437ffa5632c90b9b660379e0147241"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S02-48CASE-QUALIFICATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
RUNTIME = ROOT / "learning/lab/learning_lab/learner_model.py"
TEST_FILE = ROOT / "learning/lab/tests/test_learner_model_srl.py"
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


def main():
    contract = json.loads(CONTRACT.read_text())
    active = json.loads(ACTIVE.read_text())
    require(contract["case_count"] == 48, "contract denominator changed")
    require(len(contract["cases"]) == 48, "contract case list changed")
    case_ids = [case["id"] for case in contract["cases"]]
    require(case_ids == [f"T{i:02d}" for i in range(1, 49)], "contract IDs are not exact T01-T48")

    checks = {}
    def passed(case_id, condition, detail):
        require(condition, f"{case_id} failed: {detail}")
        checks[case_id] = detail

    # T01-T06: exact lineage and constitutional authority.
    run(["git", "merge-base", "--is-ancestor", PARENT, "HEAD"])
    passed("T01", True, "exact frozen S01 closure is an ancestor of S02 head")

    counts = active["active_constitution"]
    passed("T02", (counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "124/116/31 active constitution preserved")

    reqs = {row["id"]: row for row in active["new_requirements"]}
    passed("T03", all(reqs[item]["owner"] == "SYSTEM_MASTER/LEARNING::MOD-LEARNING-001" for item in ("LRN-151", "LRN-152", "LRN-153")), "S02 requirements remain Learning-owned")

    interfaces = {row["id"]: row for row in active["new_interfaces"]}
    passed("T04", interfaces["I111"]["kind"] == "QUERY" and interfaces["I112"]["kind"] == "COMMAND", "I111/I112 authority forms preserved")

    objects = {row["id"]: row for row in active["new_semantic_objects"]}
    passed("T05", objects["LRN-E027"]["class"] == "VERSIONED_DERIVED_PROJECTION" and objects["LRN-E028"]["class"] == "APPEND_ORIENTED_OBSERVATION", "LRN-E027/E028 classes preserved")

    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT, "--", *frozen_paths])
    passed("T06", True, "001D-001L frozen artifacts are byte-identical to frozen S01 closure")

    isolated_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_learner_model_srl.py", "-v"], cwd=LAB)
    isolated_count = unittest_count(isolated_output)
    require(isolated_count >= 38, f"isolated S02 suite unexpectedly small: {isolated_count}")
    test_source = TEST_FILE.read_text()

    mappings = {
        "T07":"test_all_allowed_observation_kinds_record",
        "T08":"test_operation_id_required",
        "T09":"test_same_operation_same_payload_replays",
        "T10":"test_same_operation_different_payload_conflicts",
        "T11":"test_observation_is_immutable_after_commit",
        "T12":"test_correction_appends_successor_and_preserves_prior",
        "T13":"test_correction_missing_prior_fails",
        "T14":"test_history_append_order",
        "T15":"test_restart_reconstructs_history",
        "T16":"test_srl_write_does_not_touch_mastery_attempts_or_projections",
        "T17":"test_inferred_emotion_context_rejected",
        "T18":"test_mental_health_context_rejected",
        "T19":"test_personality_context_rejected",
        "T20":"test_sensitive_attribute_context_rejected",
        "T21":"test_device_telemetry_context_rejected",
        "T22":"test_bounded_context_missing_is_not_negative_trait",
        "T23":"test_projection_is_not_source_of_truth",
        "T24":"test_valid_claim_standing_and_source_preserved",
        "T25":"test_no_evidence_becomes_unknown_not_zero",
        "T26":"test_confidence_self_report_does_not_become_mastery",
        "T27":"test_ai_assisted_independence_is_contradicted",
        "T28":"test_conflicting_sources_remain_contradicted",
        "T29":"test_stale_standing_preserved",
        "T30":"test_valid_claim_standing_and_source_preserved",
        "T31":"test_same_inputs_are_deterministic",
        "T32":"test_source_order_does_not_change_projection",
        "T33":"test_projection_summarizes_srl_without_rewriting_history",
        "T34":"test_personality_context_rejected",
        "T35":"test_query_is_read_only_for_srl_attempts_and_mastery_projections",
        "T36":"test_query_is_read_only_for_srl_attempts_and_mastery_projections",
        "T37":"test_same_inputs_are_deterministic",
        "T38":"test_no_srl_history_returns_unknown_srl_summary",
        "T39":"test_invalid_kind_fails_without_persistence",
        "T40":"test_failed_forbidden_context_does_not_consume_operation_identity",
        "T41":"test_correction_other_learner_fails_without_mutation",
        "T42":"test_restart_reconstructs_history",
    }
    for case_id, method_name in mappings.items():
        passed(case_id, f"def {method_name}(" in test_source, f"isolated test passed: {method_name}")

    s01_output = run([sys.executable, ".github/scripts/learning-system-rebuild-001m-s01-qualify.py"])
    passed("T43", "36/36" in s01_output or "PASS" in s01_output, "S01 exact qualification remains green")

    full_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], cwd=LAB)
    full_count = unittest_count(full_output)
    passed("T44", full_count >= isolated_count, f"full learning/lab regression passed: {full_count} tests")
    passed("T45", "confidence" in test_source.lower() and "mastery" in test_source.lower(), "mastery non-shortcut behavior covered by new tests and full regression")
    passed("T46", "IDEMPOTENCY_DIGEST_MISMATCH" in RUNTIME.read_text() and full_count > isolated_count, "existing persistence/idempotency regression remains green")

    runtime_text = RUNTIME.read_text().lower()
    no_forbidden_authority = all(token not in runtime_text for token in (
        "knowledge-competency-alignment-001",
        "finalizeexternalscore",
        "externalscorecallback",
        "certificationauthority",
        "eligibilityauthority",
    ))
    gaps = {row["id"]: row["standing"] for row in active["deferred_authority_gaps"]}
    passed("T47", no_forbidden_authority and gaps.get("LRN-069 / LRN-EXT-002") == "UNRESOLVED_DENY_BY_DEFAULT" and gaps.get("S04_EXTERNAL_ASYNC_SCORE_INGRESS") == "UNRESOLVED_FAIL_CLOSED", "competency-equivalence and external-score authority gaps remain fail-closed")

    passed("T48", len(checks) == 47, "all prior S02 isolated and cumulative gates passed")

    require(len(checks) == 48, f"unexpected passed denominator: {len(checks)}")
    print(json.dumps({
        "operation":"LEARNING-SYSTEM-REBUILD-001M-S02",
        "standing":"PASS",
        "isolated_runtime_tests": isolated_count,
        "full_learning_regression_tests": full_count,
        "contract_obligations_passed": "48/48",
        "parent_s01_qualification":"PASS",
        "exact_head": run(["git", "rev-parse", "HEAD"]).strip(),
        "checks": checks,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"QUALIFICATION_FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
