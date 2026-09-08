from __future__ import annotations

import argparse
import getpass
import json
import os
import secrets
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    BaselineDiagnosticDirector,
    DomainGeneralLearningEngine,
    DomainGeneralTutorDirector,
    MultiSessionDirector,
    Repository,
    default_domain_registry,
)
from learning_lab.real_learner_pilot_human_session import (
    HUMAN_RESPONSE_SOURCE,
    RealLearnerPilotHumanSessionError,
    prepare_human_pilot_turn,
    stage_one_status,
    submit_human_pilot_turn,
)
from learning_lab.real_learner_pilot_runtime_binding import (
    mark_runtime_bound_pilot_withdrawn,
    start_runtime_bound_pilot,
)


CONSOLE_VERSION = "PILOT-001-REAL-PARTICIPANT-CONSOLE-V1"
CONSENT_TOKEN = "I CONSENT TO PILOT-001-RUN-001"
WITHDRAW_TOKEN = "WITHDRAW FROM PILOT-001-RUN-001"
PROTOCOL_VERSION = "PILOT-001-v1"
DEFAULT_ROOT = Path.home() / ".system-master" / "learning-pilot-001"


class ConsoleError(ValueError):
    pass


def fail(code: str) -> None:
    raise ConsoleError(code)


def now_seconds() -> int:
    return int(time.time())


def utc_text(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def yes_no(prompt: str) -> bool:
    while True:
        value = input(prompt).strip().lower()
        if value in {"y", "yes"}:
            return True
        if value in {"n", "no"}:
            return False
        print("Please answer yes or no.")


def safe_token(prefix: str, nbytes: int = 8) -> str:
    return f"{prefix}-{secrets.token_hex(nbytes).upper()}"


def state_root(path_text: str | None) -> Path:
    root = Path(path_text).expanduser().resolve() if path_text else DEFAULT_ROOT.resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def manifest_path(root: Path, pilot_id: str) -> Path:
    return root / f"{pilot_id}.manifest.json"


def save_manifest(root: Path, manifest: Dict[str, Any]) -> None:
    path = manifest_path(root, manifest["pilot_id"])
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_manifest(root: Path, pilot_id: str) -> Dict[str, Any]:
    path = manifest_path(root, pilot_id)
    if not path.is_file():
        fail("PILOT_MANIFEST_NOT_FOUND")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("console_version") != CONSOLE_VERSION:
        fail("PILOT_MANIFEST_CONSOLE_VERSION_MISMATCH")
    if manifest.get("pilot_id") != pilot_id:
        fail("PILOT_MANIFEST_ID_MISMATCH")
    return manifest


def repository(root: Path, state_key: str) -> Repository:
    if not state_key or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for ch in state_key):
        fail("PILOT_STATE_KEY_INVALID")
    return Repository(str(root / f"{state_key}.sqlite3"))


def print_consent() -> None:
    print("\n=== PILOT-001-RUN-001 PARTICIPANT CONSENT ===\n")
    print("Purpose: collect one real learner's closed-loop Learning System evidence without claiming that one record proves population effectiveness.")
    print("Participation is voluntary. You may withdraw at any time.")
    print("The pilot record uses a pseudonymous key and retains scored evidence, timestamps, integrity attestations, and SHA-256 response digests. It must not retain your raw free-text responses or direct PII.")
    print("For baseline, independent verification, retention, and transfer tasks, your answer must be your own work. Do not use AI, search, documentation, another person, answer keys, or a revealed reference answer.")
    print("If assistance or an answer reveal occurs, say so truthfully; that response cannot count as independent evidence.")
    print("Stage one ends after independent verification. Delayed retention occurs no earlier than 3600 seconds later; novel transfer follows only after valid retention.\n")
    print("Full repository consent text: learning/lab/PILOT_001_RUN_001_PARTICIPANT_CONSENT.md\n")


def choose_domain(registry, requested: str | None) -> str:
    keys = registry.domain_keys
    if requested:
        if requested not in keys:
            fail("UNSUPPORTED_DOMAIN")
        return requested
    print("Available pilot domains:")
    for index, key in enumerate(keys, start=1):
        spec = registry.by_key(key)
        print(f"  {index}. {key} — {spec.desired_outcome}")
    while True:
        raw = input("Operator: choose domain number before consent: ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(keys):
            return keys[int(raw) - 1]
        print("Choose one listed number.")


def deterministic_baseline_skill(course: Dict[str, Any]) -> str:
    skills = list(course.get("skills", []))
    if not skills:
        fail("PILOT_COURSE_HAS_NO_SKILLS")
    skill_id = skills[0].get("skill_id")
    if not isinstance(skill_id, str) or not skill_id:
        fail("PILOT_FIRST_SKILL_ID_INVALID")
    return skill_id


def initialize(root: Path, domain_key: str | None) -> Dict[str, Any]:
    registry = default_domain_registry()
    selected_domain = choose_domain(registry, domain_key)
    spec = registry.by_key(selected_domain)

    print(f"\nSelected domain (frozen before consent): {selected_domain}")
    print(f"Desired outcome: {spec.desired_outcome}")
    print("Operator: verify that the participant is present. Do not type consent for them.")
    if input("Operator: type PARTICIPANT PRESENT to continue: ").strip() != "PARTICIPANT PRESENT":
        fail("PARTICIPANT_PRESENCE_NOT_CONFIRMED")

    print_consent()
    consent = input(f"Participant: type exactly '{CONSENT_TOKEN}' to consent: ").strip()
    if consent != CONSENT_TOKEN:
        fail("EXPLICIT_PARTICIPANT_CONSENT_NOT_PROVIDED")
    consented_at = now_seconds()

    participant_key = safe_token("LRN")
    pilot_id = safe_token("PILOT-001-RUN-001")
    state_key = safe_token("pilot001", 6).lower()
    learner_id = safe_token("LEARNER")
    goal_id = safe_token("GOAL")
    course_job_id = safe_token("COURSE-JOB")
    journey_id = safe_token("JOURNEY")
    diagnostic_id = safe_token("DIAG")
    session_id = safe_token("SESSION")
    started_at = consented_at

    repo = repository(root, state_key)
    engine = DomainGeneralLearningEngine(repo, registry=registry)
    created = engine.create_research_grounded_course_job(
        operation_id=safe_token("OP-CREATE"),
        job_id=course_job_id,
        goal_id=goal_id,
        title=spec.desired_outcome,
        desired_outcome=spec.desired_outcome,
    )
    course_id = created["course_id"]
    course = repo.get_object("course", course_id, 1)
    if course is None:
        fail("PILOT_COURSE_NOT_CREATED")
    baseline_skill_id = deterministic_baseline_skill(course)

    scorer = engine._spec_for_course(course_id).behavior_oracle.score
    diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
    tutor = DomainGeneralTutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)
    journey.start_journey(
        operation_id=safe_token("OP-JOURNEY"),
        journey_id=journey_id,
        diagnostic_id=diagnostic_id,
        learner_id=learner_id,
        course_id=course_id,
        claimed_skill_ids=[baseline_skill_id],
        started_at=started_at,
    )
    sessions.start_session(
        operation_id=safe_token("OP-SESSION"),
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=started_at,
    )
    start_runtime_bound_pilot(
        repo=repo,
        operation_id=safe_token("OP-PILOT-START"),
        pilot_id=pilot_id,
        participant_key=participant_key,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=started_at,
        consented_at=consented_at,
        consent_recorded=True,
    )

    manifest = {
        "console_version": CONSOLE_VERSION,
        "protocol_version": PROTOCOL_VERSION,
        "pilot_id": pilot_id,
        "participant_key": participant_key,
        "state_key": state_key,
        "domain_key": selected_domain,
        "baseline_selection_policy": "FIRST_FROZEN_COURSE_SKILL",
        "baseline_skill_id": baseline_skill_id,
        "learner_id": learner_id,
        "goal_id": goal_id,
        "course_id": course_id,
        "journey_id": journey_id,
        "diagnostic_id": diagnostic_id,
        "session_id": session_id,
        "started_at": started_at,
        "consented_at": consented_at,
        "consent_recorded": True,
        "next_turn_number": 1,
        "raw_response_persisted_by_console": False,
        "halted_reason": None,
        "withdrawn": False,
    }
    save_manifest(root, manifest)
    print("\nConsent recorded. A pseudonymous pilot record now exists.")
    print(f"Pilot ID: {pilot_id}")
    print(f"Participant key: {participant_key}")
    print(f"Baseline skill selected deterministically: {baseline_skill_id}")
    print(f"Local state directory: {root}")
    print("No raw learner response has been collected yet.\n")
    return manifest


def action_is_independent(action_type: str) -> bool:
    return action_type in {
        "DIAGNOSTIC_PROBE",
        "INDEPENDENT_VERIFICATION",
        "MASTERY_CHECK",
        "RETENTION_CHECK",
        "MAINTENANCE_RECHECK",
        "TRANSFER_CHECK",
    }


def present_turn(turn: Dict[str, Any]) -> None:
    action = turn.get("action", {})
    action_type = action.get("action_type", "UNKNOWN")
    print("\n" + "=" * 72)
    print(f"Mode: {turn.get('mode')} | Action: {action_type}")
    if action_is_independent(str(action_type)):
        print("INDEPENDENT TASK: answer from your own knowledge. No AI, search, documentation, another person, or reference answer.")
    else:
        print("INSTRUCTION/ROUTED TURN: follow only the Learning System instructions shown here; disclose any additional external help.")
    print("-" * 72)
    print(turn.get("prompt", ""))
    print("-" * 72)


def collect_and_submit(repo: Repository, manifest: Dict[str, Any], turn: Dict[str, Any]) -> Dict[str, Any]:
    action_type = str(turn.get("action", {}).get("action_type", ""))
    response = getpass.getpass("Participant answer (input hidden; not stored as raw pilot text): ")
    if not response:
        fail("EMPTY_PARTICIPANT_RESPONSE")

    print("\nIntegrity attestation for this response:")
    actually_participant = yes_no("Did you personally provide the answer just entered? [yes/no]: ")
    external_help = yes_no("Did you use AI, search, documentation, another person, or any other external assistance? [yes/no]: ")
    revealed = yes_no("Did you see or receive the reference answer before committing your response? [yes/no]: ")

    if not actually_participant:
        print("This response cannot be submitted as human participant evidence. No Learning submission will be written.")
        raise ConsoleError("ACTUAL_PARTICIPANT_RESPONSE_NOT_ATTESTED")
    if action_is_independent(action_type) and (external_help or revealed):
        print("This independent item is contaminated and cannot be submitted as valid pilot evidence. No Learning submission will be written.")
        print("Stop this session for investigator adjudication; do not re-answer the same item after seeing assistance or a reference answer.")
        raise ConsoleError("INDEPENDENT_ITEM_CONTAMINATED")

    result = submit_human_pilot_turn(
        repo=repo,
        operation_id=safe_token("OP-HUMAN-SUBMIT"),
        pilot_id=manifest["pilot_id"],
        turn_id=turn["turn_id"],
        turn_binding_digest=turn["turn_binding_digest"],
        response=response,
        submitted_at=now_seconds(),
        response_source=HUMAN_RESPONSE_SOURCE,
        participant_present=True,
        response_was_actually_provided_by_participant=True,
        assistance_used=external_help,
        answer_revealed_before_commit=revealed,
    )
    response = ""  # drop the transient plaintext reference immediately after the qualified boundary returns.
    return result


def run_stage_one(root: Path, manifest: Dict[str, Any]) -> None:
    if manifest.get("withdrawn") is True:
        fail("PILOT_ALREADY_WITHDRAWN")
    if manifest.get("halted_reason"):
        fail("PILOT_REQUIRES_INVESTIGATOR_ADJUDICATION:" + str(manifest["halted_reason"]))

    repo = repository(root, manifest["state_key"])
    while True:
        turn_number = int(manifest["next_turn_number"])
        if turn_number > 1:
            status = stage_one_status(repo=repo, pilot_id=manifest["pilot_id"])
            if status["standing"] == "STAGE_1_COMPLETE_RETENTION_PENDING":
                due = int(status["retention_not_before"])
                print("\n=== STAGE ONE COMPLETE ===")
                print("Standing: STAGE_1_COMPLETE_RETENTION_PENDING")
                print(f"Retention must not be attempted before epoch {due} ({utc_text(due)}).")
                print("The participant record remains INCOMPLETE until delayed retention and novel transfer are completed.")
                return

        turn_id = f"{manifest['pilot_id']}-TURN-{turn_number:04d}"
        turn = prepare_human_pilot_turn(
            repo=repo,
            operation_id=safe_token("OP-HUMAN-PREPARE"),
            pilot_id=manifest["pilot_id"],
            turn_id=turn_id,
            now=now_seconds(),
        )
        present_turn(turn)
        try:
            collect_and_submit(repo, manifest, turn)
        except ConsoleError as exc:
            if str(exc) in {"INDEPENDENT_ITEM_CONTAMINATED", "ACTUAL_PARTICIPANT_RESPONSE_NOT_ATTESTED"}:
                manifest["halted_reason"] = str(exc)
                save_manifest(root, manifest)
            raise
        manifest["next_turn_number"] = turn_number + 1
        save_manifest(root, manifest)


def withdraw(root: Path, pilot_id: str) -> None:
    manifest = load_manifest(root, pilot_id)
    if manifest.get("withdrawn") is True:
        print("Pilot is already withdrawn.")
        return
    print("\nWithdrawal is voluntary and terminal for this pilot record.")
    token = input(f"Participant: type exactly '{WITHDRAW_TOKEN}' to withdraw: ").strip()
    if token != WITHDRAW_TOKEN:
        fail("EXPLICIT_PARTICIPANT_WITHDRAWAL_NOT_PROVIDED")
    repo = repository(root, manifest["state_key"])
    result = mark_runtime_bound_pilot_withdrawn(
        repo=repo,
        operation_id=safe_token("OP-PILOT-WITHDRAW"),
        pilot_id=pilot_id,
        withdrawn_at=now_seconds(),
    )
    manifest["withdrawn"] = True
    manifest["withdrawn_at"] = now_seconds()
    save_manifest(root, manifest)
    print(f"Pilot {pilot_id} withdrawn. Participant outcome: {result['adjudication']['participant_outcome']}")
    print("This record is excluded from effectiveness review.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Local interactive console for PILOT-001-RUN-001 real participant stage one.")
    parser.add_argument("--state-root", help="Local directory for pseudonymous pilot state. Defaults outside the repository in the user's home directory.")
    parser.add_argument("--domain-key", help="Registered Learning domain key for a new pilot. Domain is frozen before consent.")
    parser.add_argument("--resume-pilot-id", help="Resume an already initialized local pilot by pseudonymous pilot ID.")
    parser.add_argument("--withdraw-pilot-id", help="Withdraw an existing pilot after an explicit participant withdrawal statement.")
    args = parser.parse_args()

    if args.resume_pilot_id and args.withdraw_pilot_id:
        print("Choose either --resume-pilot-id or --withdraw-pilot-id, not both.", file=sys.stderr)
        return 2

    root = state_root(args.state_root or os.environ.get("SYSTEM_MASTER_LEARNING_PILOT_STATE_ROOT"))
    try:
        if args.withdraw_pilot_id:
            withdraw(root, args.withdraw_pilot_id)
            return 0
        if args.resume_pilot_id:
            manifest = load_manifest(root, args.resume_pilot_id)
        else:
            manifest = initialize(root, args.domain_key)
        run_stage_one(root, manifest)
        return 0
    except KeyboardInterrupt:
        print("\nSESSION INTERRUPTED. No consent or response should be inferred from interruption. Use --resume-pilot-id to continue an intact record or --withdraw-pilot-id if the participant chooses to withdraw.", file=sys.stderr)
        return 130
    except (ConsoleError, RealLearnerPilotHumanSessionError, ValueError) as exc:
        print(f"\nSESSION STOPPED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
