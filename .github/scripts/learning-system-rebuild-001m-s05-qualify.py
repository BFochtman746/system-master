#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PARENT = "62e12e5309d389907dc064a83c7937b6c9ed2b42"
QUALIFIED_S04_SUBJECT = "d53e6f97bc1f4718c69e02faa605c50e79cac54e"
CONTRACT = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S05-84CASE-QUALIFICATION-CONTRACT.json"
ACTIVE = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
RUNTIME = ROOT / "learning/lab/learning_lab/assessment_governance.py"
READER = ROOT / "learning/lab/learning_lab/mastery_evidence_reader.py"
TEST_A = ROOT / "learning/lab/tests/test_assessment_model_governance_s05.py"
TEST_B = ROOT / "learning/lab/tests/test_assessment_model_governance_s05_hardening.py"
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
    require(f"def {name}(" in source, f"{case_id} missing executable test: {name}")


def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE.read_text(encoding="utf-8"))
    require(contract["case_count"] == 84, "S05 contract denominator changed")
    require(len(contract["cases"]) == 84, "S05 contract case list changed")
    require([row["id"] for row in contract["cases"]] == [f"T{i:02d}" for i in range(1, 85)], "S05 contract IDs changed")
    require(contract["parent"]["closure_commit"] == PARENT, "S05 parent is not frozen S04 closure head")
    require(contract["parent"]["qualified_subject"] == QUALIFIED_S04_SUBJECT, "S04 qualified runtime subject changed")

    run(["git", "merge-base", "--is-ancestor", PARENT, "HEAD"])
    counts = active["active_constitution"]
    require((counts["requirements"], counts["interfaces"], counts["semantic_objects"]) == (124, 116, 31), "active constitution count changed")
    changed = run(["git", "diff", "--name-only", PARENT, "HEAD"]).splitlines()
    require("qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json" not in changed, "canonical constitution changed")
    frozen_paths = [row["path"] for row in active["foundation_artifact_integrity"]]
    run(["git", "diff", "--exit-code", PARENT, "--", *frozen_paths])

    allowed_prefixes = (
        "learning/lab/learning_lab/assessment_governance.py",
        "learning/lab/learning_lab/mastery_evidence_reader.py",
        "learning/lab/tests/test_assessment_model_governance_s05",
        "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S05",
        ".github/scripts/learning-system-rebuild-001m-s05-qualify.py",
        ".github/workflows/learning-system-rebuild-001m-s05-qualify.yml",
    )
    require(all(any(path.startswith(prefix) for prefix in allowed_prefixes) for path in changed), f"S05 changed unrelated path: {changed}")

    isolated_output = run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_assessment_model_governance_s05*.py", "-v"],
        cwd=LAB,
    )
    isolated_count = unittest_count(isolated_output)
    require(isolated_count >= 45, f"isolated S05 suite unexpectedly small: {isolated_count}")

    # Fresh cumulative predecessor qualification is run on this exact S05 checkout.
    # The S04 qualifier itself reruns fresh S03 cumulative qualification and the full
    # Learning regression, so this is a recursive exact-subject predecessor gate.
    s04_output = run([sys.executable, ".github/scripts/learning-system-rebuild-001m-s04-qualify.py"])
    try:
        s04_report = json.loads(s04_output)
    except json.JSONDecodeError as exc:
        raise QualifierError(f"S04 qualifier did not emit JSON: {s04_output}") from exc
    require(s04_report.get("standing") == "PASS", "fresh S04 cumulative qualifier failed")
    require(s04_report.get("contract_obligations_passed") == "72/72", "fresh S04 denominator not green")
    require(s04_report.get("parent_s03_qualification") == "64/64 PASS FRESH ON S04 HEAD", "fresh S03 cumulative standing missing through S04")
    full_count = int(s04_report.get("full_learning_regression_tests", 0))
    require(full_count >= 849 + isolated_count, f"full Learning regression unexpectedly small: {full_count}")

    runtime_text = RUNTIME.read_text(encoding="utf-8")
    reader_text = READER.read_text(encoding="utf-8")
    source = TEST_A.read_text(encoding="utf-8") + "\n" + TEST_B.read_text(encoding="utf-8")

    mapping = {
        "T01": "test_version_is_exact_and_definition_remains_curriculum_owned",
        "T02": "test_version_is_exact_and_definition_remains_curriculum_owned",
        "T03": "test_begin_pins_definition_skill_criterion_rubric_and_policy_versions",
        "T04": "test_attempt_and_submission_do_not_create_mastery_evidence",
        "T05": "test_human_score_is_observation_until_finalized",
        "T06": "test_owner_valid_finalization_creates_evidence_not_peer_mastery_truth",
        "T07": "test_valid_assured_ai_observation_is_finalization_eligible",
        "T08": "test_fairness_failure_blocks_direct_finalization_even_with_calibration",
        "T09": "test_external_delivery_is_pending_and_cannot_become_canonical_score",
        "T10": "test_owner_valid_finalization_creates_evidence_not_peer_mastery_truth",
        "T11": "test_owner_valid_finalization_creates_evidence_not_peer_mastery_truth",
        "T12": "test_version_is_exact_and_definition_remains_curriculum_owned",
        "T13": "test_begin_pins_definition_skill_criterion_rubric_and_policy_versions",
        "T14": "test_begin_pins_definition_skill_criterion_rubric_and_policy_versions",
        "T15": "test_begin_pins_definition_skill_criterion_rubric_and_policy_versions",
        "T16": "test_attempt_records_mode_assistance_and_accommodation_contract",
        "T17": "test_attempt_records_mode_assistance_and_accommodation_contract",
        "T18": "test_submission_identity_is_distinct_and_pins_response_digest",
        "T19": "test_begin_pins_definition_skill_criterion_rubric_and_policy_versions",
        "T20": "test_regrade_requires_governed_successor_authorization",
        "T21": "test_begin_is_idempotent_and_changed_payload_conflicts",
        "T22": "test_begin_is_idempotent_and_changed_payload_conflicts",
        "T23": "test_concurrent_or_late_second_submission_cannot_overwrite_owner_valid_attempt_state",
        "T24": "test_attempt_state_reconstructs_after_repository_restart",
        "T25": "test_human_score_is_observation_until_finalized",
        "T26": "test_finalization_binds_attempt_submission_rubric_policy_and_scorer",
        "T27": "test_finalization_binds_attempt_submission_rubric_policy_and_scorer",
        "T28": "test_ai_finalized_result_preserves_model_and_assurance_context",
        "T29": "test_stale_assurance_blocks_direct_finalization",
        "T30": "test_high_consequence_policy_requires_human_review",
        "T31": "test_model_confidence_alone_never_authorizes_finalization",
        "T32": "test_regrade_preserves_old_result_but_successor_becomes_active_mastery_evidence",
        "T33": "test_regrade_preserves_old_result_but_successor_becomes_active_mastery_evidence",
        "T34": "test_challenge_preserves_historical_result_and_only_opens_review",
        "T35": "test_regrade_requires_governed_successor_authorization",
        "T36": "test_regrade_preserves_old_result_but_successor_becomes_active_mastery_evidence",
        "T37": "test_ai_scoring_disallowed_policy_blocks_observation",
        "T38": "test_ai_advisory_output_cannot_masquerade_as_finalizable_score",
        "T39": "test_finalized_ai_result_preserves_model_config_prompt_and_submission_digest",
        "T40": "test_finalized_ai_result_preserves_model_config_prompt_and_submission_digest",
        "T41": "test_finalized_ai_result_preserves_model_config_prompt_and_submission_digest",
        "T42": "test_ai_advisory_output_cannot_masquerade_as_finalizable_score",
        "T43": "test_out_of_scope_language_or_domain_requires_review",
        "T44": "test_out_of_scope_language_or_domain_requires_review",
        "T45": "test_ai_finalization_requires_shared_assurance_not_provider_metadata",
        "T46": "test_ai_advisory_output_cannot_masquerade_as_finalizable_score",
        "T47": "test_material_scorer_disagreement_requires_review_not_averaging",
        "T48": "test_model_confidence_alone_never_authorizes_finalization",
        "T49": "test_assurance_scope_is_use_specific_and_model_specific",
        "T50": "test_assurance_for_different_rubric_does_not_transfer",
        "T51": "test_fairness_failure_blocks_direct_finalization_even_with_calibration",
        "T52": "test_fairness_failure_blocks_direct_finalization_even_with_calibration",
        "T53": "test_valid_assured_ai_observation_is_finalization_eligible",
        "T54": "test_assurance_scope_is_use_specific_and_model_specific",
        "T55": "test_assurance_for_different_rubric_does_not_transfer",
        "T56": "test_drift_failure_blocks_direct_finalization",
        "T57": "test_high_consequence_policy_requires_human_review",
        "T58": "test_out_of_scope_language_or_domain_requires_review",
        "T59": "test_human_review_preserves_reason_codes_and_exact_observation_version_lineage",
        "T60": "test_human_review_preserves_original_observation_lineage",
        "T61": "test_attempt_records_mode_assistance_and_accommodation_contract",
        "T62": "test_permitted_ai_assistance_is_not_automatically_misconduct",
        "T63": "test_permitted_ai_assistance_is_not_automatically_misconduct",
        "T64": "test_integrity_signal_is_preserved_for_review_not_auto_invalidated",
        "T65": "test_integrity_signal_is_preserved_for_review_not_auto_invalidated",
        "T66": "test_integrity_signal_is_preserved_for_review_not_auto_invalidated",
        "T67": "test_authorized_accommodation_can_remain_independence_eligible_after_finalization",
        "T68": "test_authorized_accommodation_remains_distinct_from_scaffold",
        "T69": "test_tool_permitted_as_part_of_construct_can_remain_independence_eligible",
        "T70": "test_human_review_preserves_reason_codes_and_exact_observation_version_lineage",
        "T71": "test_external_delivery_is_pending_and_cannot_become_canonical_score",
        "T72": "test_external_delivery_is_pending_and_cannot_become_canonical_score",
        "T73": "test_external_delivery_is_pending_and_cannot_become_canonical_score",
        "T74": "test_external_delivery_is_pending_and_cannot_become_canonical_score",
        "T75": "test_duplicate_external_delivery_does_not_create_duplicate_semantic_score",
        "T76": "test_ai_finalization_requires_shared_assurance_not_provider_metadata",
        "T77": "test_finalization_is_exact_replay_and_does_not_duplicate_evidence",
        "T78": "test_owner_valid_finalization_creates_evidence_not_peer_mastery_truth",
        "T79": "test_attempt_and_submission_do_not_create_mastery_evidence",
        "T80": "test_ai_advisory_output_cannot_masquerade_as_finalizable_score",
        "T81": "test_result_explanation_is_bounded_and_has_no_hidden_reasoning_dependency",
        "T82": "test_finalized_score_remains_evidence_input_and_not_psychometric_or_effectiveness_claim",
        "T83": "test_finalized_score_remains_evidence_input_and_not_psychometric_or_effectiveness_claim",
    }

    checks = {}
    for case_id, method in mapping.items():
        require_test(source, method, case_id)
        checks[case_id] = f"executable case passed: {method}"

    require("curriculum_owner\": \"CURRICULUM" in runtime_text, "Curriculum definition owner marker missing")
    require("\"owner\": \"LEARNING\"" in runtime_text, "Learning attempt/result owner marker missing")
    require("SHARED_ASSURANCE" in runtime_text, "Shared Assurance consumption marker missing")
    require("EVIDENCE_INPUT_ONLY" in runtime_text and "LEARNING_ENGINE_S03" in runtime_text, "S03 mastery-authority boundary missing")
    require("supersedes_attempt_id" in runtime_text and "supersedes_attempt_id" in reader_text, "successor regrade evidence filter missing")
    require(all(token not in runtime_text.lower() for token in ("race", "ethnicity", "gender", "religion")), "sensitive fairness attributes copied into Learning runtime")
    require("external_score_callback" not in runtime_text.lower(), "authoritative external score callback invented")
    require("standing\": \"PENDING_REVIEW"" in runtime_text and "canonical_score_created\": False" in runtime_text, "external score ingress is not fail-closed")
    require("INSERT INTO objects" in runtime_text and "INSERT INTO attempts" in runtime_text and "INSERT INTO events" in runtime_text and "INSERT INTO operations" in runtime_text and "with self.repo.connect() as con" in runtime_text, "atomic finalization commit markers missing")
    require("model_confidence_can_finalize\": False" in runtime_text, "model confidence authority guard missing")
    require("ai_detector_can_invalidate\": False" in runtime_text, "AI detector authority guard missing")

    gaps = {row["id"]: row["standing"] for row in active["deferred_authority_gaps"]}
    require(gaps.get("LRN-069 / LRN-EXT-002") == "UNRESOLVED_DENY_BY_DEFAULT", "competency equivalence gap no longer deny-by-default")

    require(len(checks) == 83, f"unexpected pre-final S05 denominator: {len(checks)}")
    checks["T84"] = (
        f"exact S05 subject freshly qualified; S04 72/72 cumulative PASS; "
        f"S03 64/64 transitively fresh; full Learning regression {full_count} PASS"
    )
    require(len(checks) == 84, f"unexpected S05 denominator: {len(checks)}")

    print(json.dumps({
        "operation": "LEARNING-SYSTEM-REBUILD-001M-S05",
        "standing": "PASS",
        "isolated_runtime_tests": isolated_count,
        "full_learning_regression_tests": full_count,
        "contract_obligations_passed": "84/84",
        "parent_s04_qualification": "72/72 PASS FRESH ON S05 HEAD",
        "parent_s03_qualification": "64/64 PASS FRESH THROUGH S04 ON S05 HEAD",
        "exact_parent": PARENT,
        "exact_head": run(["git", "rev-parse", "HEAD"]).strip(),
        "hardening": [
            "Curriculum-owned assessment definitions are snapshotted, never rewritten by Learning attempts",
            "AI/model outputs remain governed scoring observations until owner-valid Learning finalization",
            "regrades are append-only successors and historical evidence remains preserved",
            "external score delivery remains pending/review-only and cannot become canonical score truth",
            "only finalized owner-valid result evidence is admitted to frozen S03 mastery projection"
        ],
        "limitations": [
            "software qualification only",
            "no psychometric-validity claim",
            "no educational-effectiveness claim",
            "no production or native iPhone execution claim"
        ],
        "checks": checks,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"QUALIFICATION_FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
