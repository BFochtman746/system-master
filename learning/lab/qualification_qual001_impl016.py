from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, List

OBJECTIVE = "LEARNING-LAB-QUAL-001 — IMPL-016 ORCHESTRATION BINDING"
EXPECTED_TESTS = 6
PER_TEST_TIMEOUT_SECONDS = 120

TEST_IDS = [
    "tests.test_adaptive_entry_journey.AdaptiveEntryJourneyTests.test_decision_replay_after_crash_is_stable_and_cannot_be_reordered",
    "tests.test_adaptive_entry_journey.AdaptiveEntryJourneyTests.test_entry_continues_through_transfer_to_course_complete",
    "tests.test_adaptive_entry_journey.AdaptiveEntryJourneyTests.test_gap_routes_to_tutor_then_returns_to_claimed_skill_across_sessions",
    "tests.test_adaptive_entry_journey.AdaptiveEntryJourneyTests.test_journey_start_recovers_after_durable_store_without_duplicate_diagnostic",
    "tests.test_adaptive_entry_journey.AdaptiveEntryJourneyTests.test_skip_ahead_stops_at_independent_verification_and_retention",
    "tests.test_adaptive_entry_journey.AdaptiveEntryJourneyTests.test_stale_prerequisite_overrides_downstream_diagnostic_skip",
]


def terminate_process_tree(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        proc.kill()


def run_test(test_id: str) -> Dict[str, Any]:
    started = time.monotonic()
    print(f"QUAL001_IMPL016_CASE_START {test_id}", flush=True)
    creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
    proc = subprocess.Popen(
        [sys.executable, "-m", "unittest", test_id, "-v"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creationflags,
    )
    timed_out = False
    output = ""
    try:
        output, _ = proc.communicate(timeout=PER_TEST_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        timed_out = True
        terminate_process_tree(proc)
        output, _ = proc.communicate()

    duration = round(time.monotonic() - started, 3)
    if output:
        print(output, end="" if output.endswith("\n") else "\n", flush=True)

    passed = (not timed_out) and proc.returncode == 0
    status = "PASS" if passed else ("TIMEOUT" if timed_out else "FAIL")
    print(
        f"QUAL001_IMPL016_CASE_END {test_id} status={status} duration_seconds={duration}",
        flush=True,
    )
    return {
        "test_id": test_id,
        "status": status,
        "return_code": proc.returncode,
        "timed_out": timed_out,
        "duration_seconds": duration,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    args = parser.parse_args()

    print(
        f"QUAL001_IMPL016_CAMPAIGN_START expected_tests={EXPECTED_TESTS} "
        f"per_test_timeout_seconds={PER_TEST_TIMEOUT_SECONDS}",
        flush=True,
    )

    cases: List[Dict[str, Any]] = []
    for test_id in TEST_IDS:
        cases.append(run_test(test_id))
        if cases[-1]["status"] != "PASS":
            break

    executed = len(cases)
    failures = sum(1 for case in cases if case["status"] == "FAIL")
    timeouts = sum(1 for case in cases if case["status"] == "TIMEOUT")
    skipped = EXPECTED_TESTS - executed
    expected_count_met = executed == EXPECTED_TESTS
    passed = expected_count_met and failures == 0 and timeouts == 0 and skipped == 0

    receipt = {
        "objective": OBJECTIVE,
        "status": "PASS" if passed else "FAIL",
        "source_commit": os.environ.get("GITHUB_SHA"),
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "expected_tests": EXPECTED_TESTS,
        "executed_tests": executed,
        "failures": failures,
        "timeouts": timeouts,
        "skipped": skipped,
        "expected_count_met": expected_count_met,
        "per_test_timeout_seconds": PER_TEST_TIMEOUT_SECONDS,
        "cases": cases,
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
    print(rendered, flush=True)
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
