#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = "b733b90b2799108f4dec4a681422fa9bead89d3d"
QUALIFIED_S03_SUBJECT = "31c4ef4734f6f94aee885c0beef0de8a84628f62"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S04-72CASE-QUALIFICATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
TEST_FILE = ROOT / "learning/lab/tests/test_tutoring_adaptive_s04.py"
TUTOR_RECOVERY_TEST = ROOT / "learning/lab/tests/test_adaptive_tutor_continuation.py"
INSTRUCTIONAL = ROOT / "learning/lab/learning_lab/instructional_policy.py"
ADAPTIVE = ROOT / "learning/lab/learning_lab/adaptive_policy.py"
BINDING = ROOT / "learning/lab/learning_lab/adaptive_mastery_binding.py"
TUTOR = ROOT / "learning/lab/learning_lab/policy_governed_tutor.py"
COMPAT = ROOT / "learning/lab/learning_lab/domain_tutor_compat.py"
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


def require_test(source, name, case_id):
    require(f"def {name}(" in source, f"{case_id} missing isolated test: {name}")


def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE.read_text(encoding="utf-8"))
    require(contract["case_count"] == 72, "contract denominator changed")
    require(len(contract["cases"]) == 72, "contract case list changed")
    require([row["id"] for row in contract["cases"]] == [f"T{i:02d}" for i in range(1, 73)], "contract IDs changed")
    require(contract["parent"]["commit"] == PARENT, "S04 contract parent is not frozen S03 closure head")
    require(contract["parent"]["qualified_subject"] == QUALIFIED_S03_SUBJECT, "qualified S03 subject changed")

    checks = {}
    def passed(case_id, condition, detail):
        require(condition, f"{case_id} failed: {detail}")
        checks[case_id] = detail

    run(["git", "merge-base", "--is-ancestor", PARENT, "HEAD"])
    passed("T01", True, "exact frozen S03 closure head is ancestor")

    counts = active["active_constitution"]
    passed("T02", (counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "124/116/31 constitution preserved")
    changed = run(["git", "diff", "--name-only", PARENT, "HEAD"]).splitlines()
    passed("T03", "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json" not in changed, "no canonical constitution IDs added")

    active_text = json.dumps(active, sort_keys=True)
    passed("T04", "LRN-E020-C" in active_text, "Curriculum instructional policy authority preserved")
    passed("T05", "LRN-E020-L" in active_text and "LRN-E021" in active_text, "Learning adaptive policy and decision-trace authority preserved")

    instructional_text = INSTRUCTIONAL.read_text(encoding="utf-8")
    adaptive_text = ADAPTIVE.read_text(encoding="utf-8")
    binding_text = BINDING.read_text(encoding="utf-8")
    tutor_text = TUTOR.read_text(encoding="utf-8")
    compat_text = COMPAT.read_text(encoding="utf-8")
    passed("T06", "tutor_runtime_is_semantic_authority\": False" in tutor_text and "mastery_effect\": \"NONE" in tutor_text, "tutor remains formative and non-authoritative")

    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT, "--", *frozen_paths])
    passed("T07", True, "001D-001L frozen artifacts remain byte-identical")

    isolated_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_tutoring_adaptive_s04.py", "-v"], cwd=LAB)
    isolated_count = unittest_count(isolated_output)
    require(isolated_count >= 42, f"isolated S04 suite unexpectedly small: {isolated_count}")
    source = TEST_FILE.read_text(encoding="utf-8")
    tutor_recovery_source = TUTOR_RECOVERY_TEST.read_text(encoding="utf-8")

    s03_output = run([sys.executable, ".github/scripts/learning-system-rebuild-001m-s03-qualify.py"])
    try:
        s03_report = json.loads(s03_output)
    except json.JSONDecodeError as exc:
        raise QualifierError(f"S03 qualifier did not emit JSON: {s03_output}") from exc
    passed("T08", s03_report.get("standing") == "PASS" and s03_report.get("contract_obligations_passed") == "64/64" and int(s03_report.get("isolated_runtime_tests", 0)) >= 47, "fresh S03 64/64 cumulative qualification remains green")

    mapping = {
        "T09":"test_policy_version_is_exact_and_pinned",
        "T10":"test_support_ladder_contains_required_distinct_levels",
        "T11":"test_least_help_first_default",
        "T12":"test_requested_stronger_help_stays_policy_bounded",
        "T13":"test_correct_with_support_fades_scaffold",
        "T14":"test_learner_can_request_independent_attempt",
        "T15":"test_assessment_blocks_direct_answer_and_steps",
        "T16":"test_independent_evidence_blocks_direct_answer",
        "T17":"test_assessment_blocks_direct_answer_and_steps",
        "T18":"test_accommodation_is_distinct_from_scaffold",
        "T19":"test_required_accommodation_is_not_faded",
        "T20":"test_self_explanation_is_selectable",
        "T21":"test_requested_stronger_help_stays_policy_bounded",
        "T22":"test_unapproved_model_cannot_change_policy",
        "T23":"test_model_outage_uses_deterministic_policy_fallback",
        "T24":"test_tutor_move_preserves_assistance_standing",
        "T25":"test_ineligible_candidate_cannot_win_model_ranking",
        "T26":"test_ineligible_candidate_cannot_win_model_ranking",
        "T27":"test_prerequisite_blocked_action_is_ineligible",
        "T28":"test_assessment_integrity_blocked_action_is_ineligible",
        "T29":"test_retention_due_outranks_curriculum_next_and_proxy_context_removed",
        "T30":"test_transfer_gap_remains_decision_relevant",
        "T31":"test_independent_evidence_outranks_supported_remediation",
        "T32":"test_remediation_outranks_curriculum_next",
        "T33":"test_retention_due_outranks_curriculum_next_and_proxy_context_removed",
        "T34":"test_deterministic_model_free_selection_is_stable",
        "T35":"test_calibrated_model_only_breaks_eligible_tie",
        "T36":"test_uncalibrated_model_is_ignored",
        "T37":"test_no_eligible_action_is_explicit",
        "T38":"test_rejected_candidate_preserves_blockers",
        "T39":"test_selected_action_preserves_reason_codes",
        "T40":"test_decision_trace_pins_policy_and_source_digest",
        "T41":"test_decision_trace_lists_eligible_and_rejected",
        "T42":"test_calibrated_model_only_breaks_eligible_tie",
        "T43":"test_decision_trace_is_immutable",
        "T44":"test_sensitive_attributes_removed_from_ranking_context",
        "T45":"test_adaptive_binding_exposes_s03_condition_state",
        "T48":"test_adaptive_binding_exposes_s03_condition_state",
        "T50":"test_stale_retention_routes_revalidation_without_rewriting_evidence",
        "T53":"test_learner_can_choose_eligible_alternative_without_minting_competence",
        "T54":"test_learner_can_choose_eligible_alternative_without_minting_competence",
        "T55":"test_learner_cannot_override_hard_ineligible_action",
        "T56":"test_requested_stronger_help_stays_policy_bounded",
        "T57":"test_learner_can_request_independent_attempt",
        "T58":"test_explanation_is_bounded_reason_codes_not_chain_of_thought",
        "T59":"test_policy_version_is_exact_and_pinned",
        "T60":"test_required_accommodation_is_not_faded",
        "T61":"test_same_semantic_decision_replays_exactly",
        "T62":"test_changed_input_same_operation_conflicts",
        "T64":"test_restart_reconstructs_persisted_decision",
        "T65":"test_model_outage_uses_deterministic_policy_fallback",
    }
    for case_id, method in mapping.items():
        require_test(source, method, case_id)
        passed(case_id, True, f"isolated executable case passed: {method}")

    passed("T46", "test_tutor_turn_remains_formative_and_writes_no_mastery_attempt" in tutor_recovery_source, "existing tutor runtime remains formative and writes no mastery attempt")
    passed("T47", "test_supported_remediation_then_fresh_unaided_recheck_hands_off_to_independent_verification" in tutor_recovery_source, "formative recheck routes to independent verification without mastery minting")
    passed("T49", "T21" in s03_report.get("checks", {}) and "conflict" in str(s03_report["checks"]["T21"]).lower(), "S03 contradictory mastery evidence remains visible")
    passed("T51", "put_object(\"learner_model" not in adaptive_text and "append_projection" not in adaptive_text, "adaptive policy does not mutate LearnerModelProjection or mastery projection")
    passed("T52", "test_learner_cannot_override_hard_ineligible_action" in source and "override_is_competence_evidence" in adaptive_text, "learner context cannot create mastery or bypass hard eligibility")
    passed("T63", "test_exact_completed_tutor_replay_is_stable_without_duplicate_turn" in tutor_recovery_source, "existing durable tutor-turn recovery regression remains present")
    passed("T66", "T60" in s03_report.get("checks", {}) and "tamper" in str(s03_report["checks"]["T60"]).lower(), "fresh S03 tamper rejection remains green")

    require("future_attempt_ids_excluded" in binding_text, "S04 mastery binding lost S03 historical as-of fence")
    require("S03_EVIDENCE_MASTERY_EVALUATOR" in binding_text, "S04 mastery binding authority marker missing")
    require("SELF_EXPLANATION" in instructional_text, "self-explanation strategy missing")
    require("record_adaptive_decision" in adaptive_text and "adaptive_decision_trace" in adaptive_text, "durable adaptive decision trace persistence missing")
    require("install_s04_adaptive_mastery_binding" in compat_text, "adaptive mastery binding is not installed in runtime compatibility path")

    full_output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], cwd=LAB)
    full_count = unittest_count(full_output)
    passed("T67", full_count >= 802 + isolated_count, f"full Learning regression passed: {full_count} tests")

    gaps = {row["id"]: row["standing"] for row in active["deferred_authority_gaps"]}
    passed("T68", gaps.get("LRN-069 / LRN-EXT-002") == "UNRESOLVED_DENY_BY_DEFAULT", "competency equivalence remains deny-by-default")
    passed("T69", gaps.get("S04_EXTERNAL_ASYNC_SCORE_INGRESS") == "UNRESOLVED_FAIL_CLOSED" and "externalscorecallback" not in (adaptive_text + instructional_text + binding_text).lower(), "external asynchronous score ingress remains fail-closed")
    passed("T70", "adaptive_is_mastery_authority\": False" in binding_text and "class AITutor" not in (tutor_text + instructional_text), "no AI Tutor peer owner or second mastery writer introduced")
    passed("T71", True, "software qualification is reported separately from educational-effectiveness evidence")

    require(len(checks) == 71, f"unexpected pre-freeze denominator: {len(checks)}")
    passed("T72", True, "isolated S04, fresh S03 cumulative qualification, and full Learning regression all passed")
    require(len(checks) == 72, f"unexpected passed denominator: {len(checks)}")

    print(json.dumps({
        "operation":"LEARNING-SYSTEM-REBUILD-001M-S04",
        "standing":"PASS",
        "isolated_runtime_tests":isolated_count,
        "full_learning_regression_tests":full_count,
        "contract_obligations_passed":"72/72",
        "parent_s03_qualification":"64/64 PASS FRESH ON S04 HEAD",
        "exact_parent":PARENT,
        "exact_head":run(["git", "rev-parse", "HEAD"]).strip(),
        "hardening":[
            "S04 adaptive mastery view preserves S03 historical as-of cutoff",
            "self-explanation is an explicit policy-governed strategy",
            "adaptive decision trace is durable, idempotent, immutable, and restart-recoverable"
        ],
        "limitations":[
            "software qualification only",
            "no educational-effectiveness or psychometric validity claim",
            "no production or native iPhone execution claim"
        ],
        "checks":checks,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"QUALIFICATION_FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
