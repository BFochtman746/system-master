from __future__ import annotations

import copy
import hashlib
from typing import Any, Dict, Mapping, Optional

from .real_learner_pilot import adjudicate_pilot_record
from .real_learner_pilot_runtime_binding import (
    PILOT_RUNTIME_BINDING_KIND,
    capture_runtime_turn,
    materialize_runtime_bound_pilot_record,
)
from .repository import Repository, canonical_json, digest
from .unified_turn_controller import TURN_KIND, prepare_learning_turn, submit_learning_turn


REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION = "REAL-LEARNER-PILOT-HUMAN-SESSION-V1"
HUMAN_TURN_ATTESTATION_KIND = "real_learner_pilot_human_turn_attestation"
HUMAN_RESPONSE_SOURCE = "HUMAN_PARTICIPANT"
RETENTION_MINIMUM_DELAY_SECONDS = 3600

_INDEPENDENT_ACTIONS = frozenset({
    "DIAGNOSTIC_PROBE",
    "INDEPENDENT_VERIFICATION",
    "MASTERY_CHECK",
    "RETENTION_CHECK",
    "MAINTENANCE_RECHECK",
    "TRANSFER_CHECK",
})


class RealLearnerPilotHumanSessionError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotHumanSessionError(code)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _latest_binding(repo: Repository, pilot_id: str) -> Dict[str, Any]:
    binding = repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, pilot_id)
    if binding is None:
        _fail("HUMAN_PILOT_BINDING_NOT_FOUND")
    if binding.get("terminal") is not None:
        _fail("HUMAN_PILOT_ALREADY_TERMINAL")
    return binding


def _turn(repo: Repository, turn_id: str) -> Dict[str, Any]:
    turn = repo.get_object(TURN_KIND, turn_id, 1)
    if turn is None:
        _fail("HUMAN_PILOT_TURN_NOT_FOUND")
    return turn


def _assert_scope(binding: Mapping[str, Any], turn: Mapping[str, Any]) -> None:
    expected = {
        "journey_id": binding["journey_id"],
        "session_id": binding["session_id"],
        "learner_id": binding["learner_id"],
        "course_id": binding["course_id"],
    }
    for key, value in expected.items():
        if turn.get(key) != value:
            _fail("HUMAN_PILOT_SCOPE_MISMATCH:" + key)


def _assert_human_attestation(
    *,
    response_source: str,
    participant_present: bool,
    response_was_actually_provided_by_participant: bool,
    assistance_used: bool,
    answer_revealed_before_commit: bool,
    action_type: str,
) -> None:
    if response_source != HUMAN_RESPONSE_SOURCE:
        _fail("HUMAN_PILOT_RESPONSE_SOURCE_REQUIRED")
    if participant_present is not True:
        _fail("HUMAN_PILOT_PARTICIPANT_PRESENCE_REQUIRED")
    if response_was_actually_provided_by_participant is not True:
        _fail("HUMAN_PILOT_ACTUAL_PARTICIPANT_RESPONSE_REQUIRED")
    if not isinstance(assistance_used, bool):
        _fail("HUMAN_PILOT_ASSISTANCE_ATTESTATION_REQUIRED")
    if not isinstance(answer_revealed_before_commit, bool):
        _fail("HUMAN_PILOT_REVEAL_ATTESTATION_REQUIRED")
    if action_type in _INDEPENDENT_ACTIONS and assistance_used:
        _fail("HUMAN_PILOT_INDEPENDENT_ASSISTANCE_FORBIDDEN")
    if action_type in _INDEPENDENT_ACTIONS and answer_revealed_before_commit:
        _fail("HUMAN_PILOT_INDEPENDENT_ANSWER_REVEAL_FORBIDDEN")


def prepare_human_pilot_turn(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    turn_id: str,
    now: int,
) -> Dict[str, Any]:
    if not all(isinstance(value, str) and value for value in (operation_id, pilot_id, turn_id)):
        _fail("HUMAN_PILOT_IDENTITY_REQUIRED")
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        _fail("HUMAN_PILOT_TIME_INVALID")
    binding = _latest_binding(repo, pilot_id)
    payload = {
        "pilot_id": pilot_id,
        "turn_id": turn_id,
        "now": now,
        "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior
    turn = prepare_learning_turn(
        repo=repo,
        operation_id=f"{operation_id}:learning-turn",
        turn_id=turn_id,
        journey_id=binding["journey_id"],
        session_id=binding["session_id"],
        learner_id=binding["learner_id"],
        course_id=binding["course_id"],
        now=now,
    )
    _assert_scope(binding, turn)
    if turn.get("answer_withheld") is not True:
        _fail("HUMAN_PILOT_ANSWER_WITHHOLDING_REQUIRED")
    result = {
        **turn,
        "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
        "pilot_id": pilot_id,
        "response_source_required": HUMAN_RESPONSE_SOURCE,
        "human_attestation_required": True,
        "raw_response_persistence_allowed": False,
        "truth_boundary": {
            "software_can_require_human_attestation": True,
            "software_can_independently_prove_human_identity": False,
            "participant_must_actually_supply_response": True,
        },
    }
    repo.record_operation(operation_id, payload, result)
    repo.emit("RealLearnerPilotHumanTurnPrepared", turn_id, {
        "pilot_id": pilot_id,
        "action_type": turn.get("action", {}).get("action_type"),
        "turn_binding_digest": turn.get("turn_binding_digest"),
    })
    return result


def submit_human_pilot_turn(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    turn_id: str,
    turn_binding_digest: str,
    response: str,
    submitted_at: int,
    response_source: str,
    participant_present: bool,
    response_was_actually_provided_by_participant: bool,
    assistance_used: bool,
    answer_revealed_before_commit: bool,
) -> Dict[str, Any]:
    if not all(isinstance(value, str) and value for value in (
        operation_id, pilot_id, turn_id, turn_binding_digest, response
    )):
        _fail("HUMAN_PILOT_SUBMISSION_FIELDS_REQUIRED")
    if not isinstance(submitted_at, int) or isinstance(submitted_at, bool) or submitted_at < 0:
        _fail("HUMAN_PILOT_SUBMISSION_TIME_INVALID")

    binding = _latest_binding(repo, pilot_id)
    turn = _turn(repo, turn_id)
    _assert_scope(binding, turn)
    if turn.get("turn_binding_digest") != turn_binding_digest:
        _fail("HUMAN_PILOT_TURN_BINDING_MISMATCH")
    action_type = turn.get("action", {}).get("action_type")
    if not isinstance(action_type, str) or not action_type:
        _fail("HUMAN_PILOT_ACTION_TYPE_REQUIRED")
    _assert_human_attestation(
        response_source=response_source,
        participant_present=participant_present,
        response_was_actually_provided_by_participant=response_was_actually_provided_by_participant,
        assistance_used=assistance_used,
        answer_revealed_before_commit=answer_revealed_before_commit,
        action_type=action_type,
    )

    response_digest = _sha256_text(response)
    payload = {
        "pilot_id": pilot_id,
        "turn_id": turn_id,
        "turn_binding_digest": turn_binding_digest,
        "response_digest": response_digest,
        "submitted_at": submitted_at,
        "response_source": response_source,
        "participant_present": participant_present,
        "response_was_actually_provided_by_participant": response_was_actually_provided_by_participant,
        "assistance_used": assistance_used,
        "answer_revealed_before_commit": answer_revealed_before_commit,
        "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior

    existing = repo.get_object(HUMAN_TURN_ATTESTATION_KIND, turn_id, 1)
    if existing is not None:
        if existing.get("payload_digest") != digest(payload):
            _fail("HUMAN_PILOT_TURN_ATTESTATION_REUSE")
    else:
        attestation = {
            "payload_digest": digest(payload),
            "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
            "pilot_id": pilot_id,
            "participant_key": binding["participant_key"],
            "journey_id": binding["journey_id"],
            "session_id": binding["session_id"],
            "learner_id": binding["learner_id"],
            "course_id": binding["course_id"],
            "turn_id": turn_id,
            "turn_binding_digest": turn_binding_digest,
            "action_type": action_type,
            "response_digest": response_digest,
            "submitted_at": submitted_at,
            "response_source": response_source,
            "participant_present": True,
            "response_was_actually_provided_by_participant": True,
            "assistance_used": assistance_used,
            "answer_revealed_before_commit": answer_revealed_before_commit,
            "raw_response_stored": False,
            "truth_boundary": {
                "attestation_supplied": True,
                "human_identity_independently_proven_by_software": False,
            },
        }
        if response in canonical_json(attestation):
            _fail("HUMAN_PILOT_RAW_RESPONSE_ATTESTATION_LEAK")
        repo.put_object(HUMAN_TURN_ATTESTATION_KIND, turn_id, 1, attestation)
        repo.emit("RealLearnerPilotHumanTurnAttested", turn_id, {
            "pilot_id": pilot_id,
            "action_type": action_type,
            "response_digest": response_digest,
            "raw_response_stored": False,
        })

    submission = submit_learning_turn(
        repo=repo,
        operation_id=f"{operation_id}:learning-submit",
        turn_id=turn_id,
        turn_binding_digest=turn_binding_digest,
        response=response,
        submitted_at=submitted_at,
    )
    if submission.get("response_echoed") is not False:
        _fail("HUMAN_PILOT_RUNTIME_RESPONSE_ECHO_FORBIDDEN")
    if submission.get("response_digest") != response_digest:
        _fail("HUMAN_PILOT_RUNTIME_RESPONSE_DIGEST_MISMATCH")

    captured = capture_runtime_turn(
        repo=repo,
        operation_id=f"{operation_id}:pilot-capture",
        pilot_id=pilot_id,
        turn_id=turn_id,
    )
    if captured.get("response_digest") != response_digest:
        _fail("HUMAN_PILOT_CAPTURE_RESPONSE_DIGEST_MISMATCH")

    result = {
        "status": "PASS",
        "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
        "pilot_id": pilot_id,
        "turn_id": turn_id,
        "action_type": action_type,
        "response_digest": response_digest,
        "response_echoed": False,
        "raw_response_stored_in_human_attestation": False,
        "human_source_attested": True,
        "assistance_used": assistance_used,
        "answer_revealed_before_commit": answer_revealed_before_commit,
        "learning_submission": copy.deepcopy(submission),
        "pilot_capture": copy.deepcopy(captured),
    }
    if response in canonical_json(result):
        _fail("HUMAN_PILOT_RAW_RESPONSE_RESULT_LEAK")
    repo.record_operation(operation_id, payload, result)
    return result


def stage_one_status(*, repo: Repository, pilot_id: str) -> Dict[str, Any]:
    binding = _latest_binding(repo, pilot_id)
    record = materialize_runtime_bound_pilot_record(repo=repo, pilot_id=pilot_id)
    adjudication = adjudicate_pilot_record(record)
    by_type = {row["event_type"]: row for row in record.get("events", [])}
    baseline = by_type.get("BASELINE_COMPLETED")
    route = by_type.get("ROUTE_SELECTED")
    verification = by_type.get("INDEPENDENT_VERIFICATION_COMPLETED")

    if baseline is None:
        standing = "BASELINE_PENDING"
        retention_not_before = None
    elif route is None:
        standing = "ADAPTIVE_ROUTE_PENDING"
        retention_not_before = None
    elif verification is None:
        standing = "INDEPENDENT_VERIFICATION_PENDING"
        retention_not_before = None
    else:
        retention_not_before = int(verification["occurred_at"]) + RETENTION_MINIMUM_DELAY_SECONDS
        standing = "STAGE_1_COMPLETE_RETENTION_PENDING"

    captured_turns = list(binding.get("turn_receipts", []))
    missing_attestations = [
        row["turn_id"]
        for row in captured_turns
        if repo.get_object(HUMAN_TURN_ATTESTATION_KIND, row["turn_id"], 1) is None
    ]
    if missing_attestations:
        _fail("HUMAN_PILOT_CAPTURE_WITHOUT_ATTESTATION:" + ",".join(missing_attestations))

    return {
        "status": "PASS",
        "human_session_version": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
        "pilot_id": pilot_id,
        "standing": standing,
        "retention_not_before": retention_not_before,
        "retention_minimum_delay_seconds": RETENTION_MINIMUM_DELAY_SECONDS,
        "captured_turn_count": len(captured_turns),
        "all_captured_turns_human_attested": True,
        "participant_outcome": adjudication.get("participant_outcome"),
        "eligible_for_effectiveness_review": adjudication.get("eligible_for_effectiveness_review"),
        "truth_boundary": {
            "durable_human_source_attestations_present": True,
            "software_independently_proves_human_identity": False,
            "real_participant_execution_still_requires_genuine_human_behavior": True,
            "real_learner_effectiveness": "NOT_PROVEN",
        },
    }
