from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

import run_pilot001_real_participant as console
from learning_lab.real_learner_pilot_completion import (
    RealLearnerPilotCompletionError,
    closed_loop_status,
    finalize_closed_loop_if_ready,
)
from learning_lab.real_learner_pilot_handoff import (
    RealLearnerPilotHandoffError,
    verify_pilot_handoff,
    write_pilot_handoff,
)
from learning_lab.real_learner_pilot_preflight import (
    RealLearnerPilotPreflightError,
    run_real_learner_pilot_preflight,
)
from learning_lab.real_learner_pilot_withdrawal import withdraw_runtime_bound_pilot


CLOSED_LOOP_LAUNCHER_VERSION = "PILOT-001-REAL-PARTICIPANT-CLOSED-LOOP-V3"

# Preserve the qualified zero-evidence withdrawal boundary from the stage-one launcher.
console.mark_runtime_bound_pilot_withdrawn = withdraw_runtime_bound_pilot


class ClosedLoopLauncherError(ValueError):
    pass


def _fail(code: str) -> None:
    raise ClosedLoopLauncherError(code)


def resolve_state_root_without_creation(path_text: str | None) -> Path:
    return Path(path_text).expanduser().resolve() if path_text else console.DEFAULT_ROOT.resolve()


def participant_collection_preflight(root: Path) -> Dict[str, Any]:
    result = run_real_learner_pilot_preflight(state_root=root)
    print("\n=== PILOT-001-RUN-001 ENVIRONMENT PREFLIGHT ===")
    print(f"Standing: {result['standing']}")
    print(f"Protocol: {result['protocol_version']}")
    print(f"SQLite round-trip: {result['storage']['sqlite_roundtrip']}")
    print("State root is outside the repository and writable.")
    print("No participant consent, response, manifest, or participant database was created by preflight.\n")
    return result


def completion_package_path(root: Path, pilot_id: str) -> Path:
    return root / f"{pilot_id}.completion.json"


def write_completion_package(root: Path, manifest: Dict[str, Any], result: Dict[str, Any]) -> Path:
    adjudication = result.get("adjudication", {})
    package = {
        "launcher_version": CLOSED_LOOP_LAUNCHER_VERSION,
        "protocol_version": manifest.get("protocol_version"),
        "pilot_id": manifest["pilot_id"],
        "participant_key": manifest.get("participant_key"),
        "course_id": manifest.get("course_id"),
        "domain_key": manifest.get("domain_key"),
        "completed_at": manifest.get("completed_at"),
        "record_digest": result.get("record_digest"),
        "event_count": result.get("event_count"),
        "participant_outcome": adjudication.get("participant_outcome"),
        "eligible_for_effectiveness_review": adjudication.get("eligible_for_effectiveness_review"),
        "closed_loop_passed": adjudication.get("closed_loop_passed"),
        "baseline_fraction": adjudication.get("baseline_fraction"),
        "independent_verification_fraction": adjudication.get("independent_verification_fraction"),
        "retention_fraction": adjudication.get("retention_fraction"),
        "transfer_fraction": adjudication.get("transfer_fraction"),
        "observed_verification_minus_baseline": adjudication.get("observed_verification_minus_baseline"),
        "retention_delay_seconds": adjudication.get("retention_delay_seconds"),
        "raw_response_included": False,
        "direct_pii_included": False,
        "truth_boundary": result.get("truth_boundary"),
    }
    rendered = json.dumps(package, indent=2, sort_keys=True) + "\n"
    lowered = rendered.lower()
    for forbidden in ('"response"', '"raw_response"', '"answer_text"', '"free_text"'):
        if forbidden in lowered:
            _fail("COMPLETION_PACKAGE_RAW_RESPONSE_FIELD_FORBIDDEN")
    path = completion_package_path(root, manifest["pilot_id"])
    tmp = path.with_suffix(".tmp")
    tmp.write_text(rendered, encoding="utf-8")
    tmp.replace(path)
    return path


def write_and_verify_completion_handoff(root: Path, manifest: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    package_path = write_completion_package(root, manifest, result)
    handoff = write_pilot_handoff(root=root, manifest=manifest, completion_package_path=package_path)
    verification = verify_pilot_handoff(
        root=root,
        pilot_id=manifest["pilot_id"],
        state_key=manifest["state_key"],
    )
    if verification.get("handoff_digest") != handoff.get("handoff_digest"):
        _fail("PILOT_HANDOFF_VERIFICATION_DIGEST_MISMATCH")
    return {
        "completion_package_path": package_path,
        "handoff_path": handoff["handoff_path"],
        "handoff_digest_path": handoff["handoff_digest_path"],
        "handoff_digest": handoff["handoff_digest"],
    }


def print_status(status: Dict[str, Any]) -> None:
    print(f"Standing: {status['standing']}")
    print(f"Captured participant turns: {status.get('captured_turn_count', 0)}")
    due = status.get("retention_not_before")
    if due is not None:
        print(f"Retention not before: {due} ({console.utc_text(int(due))})")
        print(f"Retention seconds remaining: {status.get('retention_seconds_remaining', 0)}")
    print(f"Participant outcome: {status.get('participant_outcome', 'INCOMPLETE')}")
    print(f"Eligible for effectiveness review: {status.get('eligible_for_effectiveness_review', False)}")


def run_closed_loop(root: Path, manifest: Dict[str, Any]) -> Dict[str, Any]:
    if manifest.get("withdrawn") is True:
        _fail("PILOT_ALREADY_WITHDRAWN")
    if manifest.get("halted_reason"):
        _fail("PILOT_REQUIRES_INVESTIGATOR_ADJUDICATION:" + str(manifest["halted_reason"]))

    repo = console.repository(root, manifest["state_key"])
    while True:
        now = console.now_seconds()
        status = closed_loop_status(repo=repo, pilot_id=manifest["pilot_id"], now=now)
        standing = status["standing"]

        if standing == "RETENTION_WAIT":
            print("\n=== DELAYED RETENTION NOT YET DUE ===")
            print_status(status)
            print("No retention prompt has been exposed. Resume this same pilot after the due time.")
            return status

        if standing == "COMPLETION_READY":
            completed_at = console.now_seconds()
            result = finalize_closed_loop_if_ready(
                repo=repo,
                operation_id=console.safe_token("OP-PILOT-COMPLETE"),
                pilot_id=manifest["pilot_id"],
                completed_at=completed_at,
            )
            manifest["completed"] = True
            manifest["completed_at"] = completed_at
            manifest["participant_outcome"] = result["adjudication"].get("participant_outcome")
            console.save_manifest(root, manifest)
            artifacts = write_and_verify_completion_handoff(root, manifest, result)
            print("\n=== PILOT CLOSED LOOP COMPLETE ===")
            print(f"Participant outcome: {manifest['participant_outcome']}")
            print(f"Completion package: {artifacts['completion_package_path']}")
            print(f"Integrity handoff: {artifacts['handoff_path']}")
            print(f"Handoff SHA-256: {artifacts['handoff_digest']}")
            print("The completion package and handoff contain adjudicated metrics, identifiers, and cryptographic digests only; they contain no raw participant answer text.")
            print("The local hashes become tamper-evident evidence only after their digest is anchored in an external evidence store or qualification record.")
            print("One participant record does not prove real-learner effectiveness, psychometric validity, population validity, or job readiness.")
            return result

        if standing == "CLOSED_LOOP_COMPLETE":
            terminal_at = status.get("terminal_occurred_at")
            if not isinstance(terminal_at, int) or isinstance(terminal_at, bool):
                _fail("PILOT_COMPLETION_TERMINAL_TIME_REQUIRED_FOR_RECOVERY")
            manifest["completed"] = True
            manifest["completed_at"] = terminal_at
            manifest["participant_outcome"] = status.get("participant_outcome")
            console.save_manifest(root, manifest)
            result = finalize_closed_loop_if_ready(
                repo=repo,
                operation_id=console.safe_token("OP-PILOT-COMPLETE-REPLAY"),
                pilot_id=manifest["pilot_id"],
                completed_at=terminal_at,
            )
            artifacts = write_and_verify_completion_handoff(root, manifest, result)
            print("\nPilot is already closed-loop complete. Completion artifacts are present and integrity-verified.")
            print_status(status)
            print(f"Integrity handoff: {artifacts['handoff_path']}")
            print(f"Handoff SHA-256: {artifacts['handoff_digest']}")
            return status

        if standing == "WITHDRAWN":
            manifest["withdrawn"] = True
            console.save_manifest(root, manifest)
            print("Pilot is withdrawn and excluded from effectiveness review.")
            return status

        # BASELINE_PENDING, STAGE_1_IN_PROGRESS, RETENTION_DUE, TRANSFER_PENDING,
        # and nonpass-remediation states all defer the next action to the Learning runtime.
        turn_number = int(manifest.get("next_turn_number", 1))
        turn_id = f"{manifest['pilot_id']}-TURN-{turn_number:04d}"
        turn = console.prepare_human_pilot_turn(
            repo=repo,
            operation_id=console.safe_token("OP-HUMAN-PREPARE"),
            pilot_id=manifest["pilot_id"],
            turn_id=turn_id,
            now=now,
        )

        if turn.get("mode") == "WAIT":
            due = turn.get("earliest_due_at")
            print("\n=== DELAYED RETENTION NOT YET DUE ===")
            if due is not None:
                print(f"Retention not before: {due} ({console.utc_text(int(due))})")
            print("No retention response was requested or recorded.")
            return closed_loop_status(repo=repo, pilot_id=manifest["pilot_id"], now=now)

        if turn.get("mode") == "COMPLETE":
            status = closed_loop_status(repo=repo, pilot_id=manifest["pilot_id"], now=now)
            if status["standing"] != "COMPLETION_READY":
                _fail("COURSE_COMPLETE_SURFACE_WITHOUT_PILOT_COMPLETION_AUTHORITY")
            continue

        if turn.get("response_required") is not True:
            _fail("PILOT_NONRESPONSE_ACTION_REQUIRES_SYSTEM_ADJUDICATION:" + str(turn.get("mode")))

        console.present_turn(turn)
        try:
            console.collect_and_submit(repo, manifest, turn)
        except console.ConsoleError as exc:
            if str(exc) in {"INDEPENDENT_ITEM_CONTAMINATED", "ACTUAL_PARTICIPANT_RESPONSE_NOT_ATTESTED"}:
                manifest["halted_reason"] = str(exc)
                console.save_manifest(root, manifest)
            raise
        manifest["next_turn_number"] = turn_number + 1
        console.save_manifest(root, manifest)


def status_only(root: Path, pilot_id: str) -> Dict[str, Any]:
    manifest = console.load_manifest(root, pilot_id)
    repo = console.repository(root, manifest["state_key"])
    status = closed_loop_status(repo=repo, pilot_id=pilot_id, now=console.now_seconds())
    print_status(status)
    return status


def main() -> int:
    parser = argparse.ArgumentParser(description="Local interactive closed-loop console for PILOT-001-RUN-001 real participant execution.")
    parser.add_argument("--state-root", help="Local directory for pseudonymous pilot state. Defaults outside the repository in the user's home directory.")
    parser.add_argument("--domain-key", help="Registered Learning domain key for a new pilot. Domain is frozen before consent.")
    parser.add_argument("--resume-pilot-id", help="Resume an already initialized local pilot by pseudonymous pilot ID.")
    parser.add_argument("--status-pilot-id", help="Show closed-loop standing without exposing or collecting a participant response.")
    parser.add_argument("--withdraw-pilot-id", help="Withdraw an existing pilot after an explicit participant withdrawal statement.")
    parser.add_argument("--preflight-only", action="store_true", help="Verify the local execution environment without requesting participant presence, consent, or a response.")
    args = parser.parse_args()

    selected = [bool(args.resume_pilot_id), bool(args.status_pilot_id), bool(args.withdraw_pilot_id), bool(args.preflight_only)]
    if sum(selected) > 1:
        print("Choose only one of --resume-pilot-id, --status-pilot-id, --withdraw-pilot-id, or --preflight-only.", file=sys.stderr)
        return 2

    root = resolve_state_root_without_creation(args.state_root or os.environ.get("SYSTEM_MASTER_LEARNING_PILOT_STATE_ROOT"))
    try:
        if args.withdraw_pilot_id:
            console.withdraw(root, args.withdraw_pilot_id)
            return 0
        if args.status_pilot_id:
            status_only(root, args.status_pilot_id)
            return 0

        participant_collection_preflight(root)
        if args.preflight_only:
            return 0

        if args.resume_pilot_id:
            manifest = console.load_manifest(root, args.resume_pilot_id)
        else:
            manifest = console.initialize(root, args.domain_key)
        run_closed_loop(root, manifest)
        return 0
    except KeyboardInterrupt:
        print("\nSESSION INTERRUPTED. No consent or response is inferred from interruption. Resume the same pseudonymous pilot or withdraw explicitly.", file=sys.stderr)
        return 130
    except (
        ClosedLoopLauncherError,
        RealLearnerPilotCompletionError,
        RealLearnerPilotHandoffError,
        RealLearnerPilotPreflightError,
        console.ConsoleError,
        console.RealLearnerPilotHumanSessionError,
        ValueError,
    ) as exc:
        print(f"\nSESSION STOPPED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
