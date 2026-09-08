from __future__ import annotations

import argparse
import io
import json
import os
import unittest


OBJECTIVE = "LEARNING-LAB-PILOT-001 — REAL-LEARNER CLOSED-LOOP EVIDENCE READINESS"
TEST_MODULE = "tests.test_real_learner_pilot"
EXPECTED_TESTS = 14


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    args = parser.parse_args()

    loader = unittest.TestLoader()
    suite = loader.loadTestsFromName(TEST_MODULE)
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    rendered = stream.getvalue()
    print(rendered, end="")

    executed = result.testsRun
    failures = len(result.failures)
    errors = len(result.errors)
    skipped = len(result.skipped)
    expected_count_met = executed == EXPECTED_TESTS
    passed = result.wasSuccessful() and expected_count_met and skipped == 0

    receipt = {
        "objective": OBJECTIVE,
        "status": "PASS" if passed else "FAIL",
        "source_commit": os.environ.get("GITHUB_SHA"),
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "test_module": TEST_MODULE,
        "expected_tests": EXPECTED_TESTS,
        "executed_tests": executed,
        "failures": failures,
        "errors": errors,
        "skipped": skipped,
        "expected_count_met": expected_count_met,
        "qualified_boundaries": [
            "pseudonymous_participant_evidence_only",
            "direct_and_nested_pii_rejected",
            "raw_learner_response_rejected_in_favor_of_digest",
            "consent_precedes_baseline",
            "baseline_precedes_instruction",
            "independent_verification_rejects_assistance_and_answer_reveal",
            "retention_requires_delay_and_fresh_item_family",
            "transfer_requires_passed_retention_novel_context_and_fresh_family",
            "withdrawal_excluded_from_effectiveness_review",
            "nonpass_outcomes_preserved_without_success_rewrite",
            "single_record_outcome_cannot_promote_effectiveness_or_psychometric_claims",
        ],
        "truth_boundary": {
            "pilot_instrumentation_integrity": "PROVEN" if passed else "NOT_PROVEN",
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
            "production_system_master_integration": "NOT_PROVEN",
            "target_native_iphone_behavior": "NOT_PROVEN",
        },
    }

    payload = json.dumps(receipt, indent=2, sort_keys=True)
    print(payload)
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(payload + "\n")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
