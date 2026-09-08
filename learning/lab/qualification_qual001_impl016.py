from __future__ import annotations

import argparse
import io
import json
import os
import unittest

OBJECTIVE = "LEARNING-LAB-QUAL-001 — IMPL-016 ORCHESTRATION BINDING"
TEST_MODULE = "tests.test_adaptive_entry_journey"
EXPECTED_TESTS = 6


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    args = parser.parse_args()

    loader = unittest.TestLoader()
    suite = loader.loadTestsFromName(TEST_MODULE)
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    rendered_tests = stream.getvalue()
    print(rendered_tests, end="")

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
            "adaptive_entry_journey_start_and_recovery",
            "diagnostic_skip_stops_at_independent_verification",
            "targeted_gap_routes_through_tutor_and_returns_across_sessions",
            "current_retention_state_overrides_stale_diagnostic_skip",
            "entry_continues_through_transfer_to_course_complete",
            "decision_crash_replay_is_stable_and_idempotent",
        ],
        "authority_boundary": {
            "diagnostic_routing_only": True,
            "tutor_formative_only": True,
            "mastery_authority": "LEARNING_ENGINE",
            "session_authority": "MULTI_SESSION_DIRECTOR",
        },
        "truth_boundary": {
            "impl016_orchestration_closed_loop": "PROVEN" if passed else "NOT_PROVEN",
            "production_system_master_integration": "NOT_PROVEN",
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "target_native_iphone_behavior": "NOT_PROVEN",
        },
    }

    rendered = json.dumps(receipt, indent=2, sort_keys=True)
    print(rendered)
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
