from __future__ import annotations

import argparse
import io
import json
import os
import unittest


OBJECTIVE = "LEARNING-LAB-PILOT-001-REFRESH-001 — CURRENT CANONICAL RUNTIME BINDING + HUMAN-READY EVIDENCE CAPTURE"
FROZEN_TEST_MODULE = "tests.test_real_learner_pilot"
RUNTIME_TEST_MODULE = "tests.test_real_learner_pilot_runtime_binding"
EXPECTED_FROZEN_TESTS = 14
EXPECTED_RUNTIME_TESTS = 6


def _run(module: str):
    suite = unittest.TestLoader().loadTestsFromName(module)
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    rendered = stream.getvalue()
    print(rendered, end="")
    return {
        "module": module,
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "successful": result.wasSuccessful(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    args = parser.parse_args()

    frozen = _run(FROZEN_TEST_MODULE)
    runtime = _run(RUNTIME_TEST_MODULE)
    frozen_count_ok = frozen["tests_run"] == EXPECTED_FROZEN_TESTS
    runtime_count_ok = runtime["tests_run"] == EXPECTED_RUNTIME_TESTS
    passed = (
        frozen["successful"]
        and runtime["successful"]
        and frozen_count_ok
        and runtime_count_ok
        and frozen["skipped"] == 0
        and runtime["skipped"] == 0
    )

    receipt = {
        "objective": OBJECTIVE,
        "status": "PASS" if passed else "FAIL",
        "source_commit": os.environ.get("GITHUB_SHA"),
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "frozen_protocol_version": "PILOT-001-v1",
        "current_runtime_binding_version": "PILOT-001-CURRENT-RUNTIME-BINDING-V1",
        "frozen_validator": {
            **frozen,
            "expected_tests": EXPECTED_FROZEN_TESTS,
            "expected_count_met": frozen_count_ok,
            "ported_blob_intent": "EXACT_PREVIOUSLY_QUALIFIED_PILOT_001_VALIDATOR_AND_TESTS",
        },
        "runtime_binding": {
            **runtime,
            "expected_tests": EXPECTED_RUNTIME_TESTS,
            "expected_count_met": runtime_count_ok,
            "caller_score_authority": False,
            "caller_response_digest_authority": False,
            "caller_item_family_authority": False,
            "durable_system_master_learning_receipts_required": True,
            "raw_learner_response_exported_to_pilot_record": False,
        },
        "human_boundary": {
            "a01_can_qualify_software_binding": True,
            "a01_can_manufacture_real_participant_evidence": False,
            "real_participant_execution_required_for_human_evidence": True,
        },
        "truth_boundary": {
            "pilot_protocol_integrity": "PROVEN" if passed else "NOT_PROVEN",
            "current_runtime_receipt_binding": "PROVEN" if passed else "NOT_PROVEN",
            "real_participant_record": "NOT_PROVEN",
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
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
