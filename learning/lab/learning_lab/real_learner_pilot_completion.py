from __future__ import annotations

import copy
from typing import Any, Dict, Mapping

from .real_learner_pilot import adjudicate_pilot_record
from .real_learner_pilot_human_session import HUMAN_TURN_ATTESTATION_KIND
from .real_learner_pilot_runtime_binding import (
    PILOT_RUNTIME_BINDING_KIND,
    mark_runtime_bound_pilot_complete,
    materialize_runtime_bound_pilot_record,
)
from .repository import Repository, digest


REAL_LEARNER_PILOT_COMPLETION_VERSION = "REAL-LEARNER-PILOT-COMPLETION-V1"
RETENTION_MINIMUM_DELAY_SECONDS = 3600


class RealLearnerPilotCompletionError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotCompletionError(code)


def _binding(repo: Repository, pilot_id: str) -> Dict[str, Any]:
    binding = repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, pilot_id)
    if binding is None:
        _fail("PILOT_COMPLETION_BINDING_NOT_FOUND")
    return binding


def _assert_human_attestations(repo: Repository, rows: list[Mapping[str, Any]]) -> None:
    missing = [
        str(row.get("turn_id"))
        for row in rows
        if repo.get_object(HUMAN_TURN_ATTESTATION_KIND, str(row.get("turn_id")), 1) is None
    ]
    if missing:
        _fail("PILOT_COMPLETION_CAPTURE_WITHOUT_HUMAN_ATTESTATION:" + ",".join(missing))


def _base_result(
    *,
    pilot_id: str,
    standing: str,
    now: int,
    captured_turn_count: int,
    participant_outcome: str = "INCOMPLETE",
    eligible_for_effectiveness_review: bool = False,
) -> Dict[str, Any]:
    return {
        "status": "PASS",
        "completion_version": REAL_LEARNER_PILOT_COMPLETION_VERSION,
        "pilot_id": pilot_id,
        "standing": standing,
        "as_of": now,
        "captured_turn_count": captured_turn_count,
        "participant_outcome": participant_outcome,
        "eligible_for_effectiveness_review": eligible_for_effectiveness_review,
        "truth_boundary": {
            "human_participant_responses_must_be_genuine": True,
            "software_independently_proves_human_identity": False,
            "a01_may_manufacture_human_evidence": False,
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
        },
    }


def closed_loop_status(*, repo: Repository, pilot_id: str, now: int) -> Dict[str, Any]:
    if not isinstance(pilot_id, str) or not pilot_id:
        _fail("PILOT_COMPLETION_ID_REQUIRED")
    if not isinstance(now, int) or isinstance(now, bool) or now < 0:
        _fail("PILOT_COMPLETION_TIME_INVALID")

    binding = _binding(repo, pilot_id)
    rows = list(binding.get("turn_receipts", []))
    terminal = binding.get("terminal")

    if isinstance(terminal, Mapping) and terminal.get("kind") == "WITHDRAWN" and not rows:
        result = _base_result(
            pilot_id=pilot_id,
            standing="WITHDRAWN",
            now=now,
            captured_turn_count=0,
            participant_outcome="WITHDRAWN",
            eligible_for_effectiveness_review=False,
        )
        result["record_materialized"] = False
        result["withdrawn_stage"] = "PRE_BASELINE"
        return result

    if not rows:
        return _base_result(
            pilot_id=pilot_id,
            standing="BASELINE_PENDING",
            now=now,
            captured_turn_count=0,
        )

    _assert_human_attestations(repo, rows)
    record = materialize_runtime_bound_pilot_record(repo=repo, pilot_id=pilot_id)
    adjudication = adjudicate_pilot_record(record)

    if isinstance(terminal, Mapping):
        if terminal.get("kind") == "WITHDRAWN":
            standing = "WITHDRAWN"
        elif terminal.get("kind") == "COMPLETE":
            standing = "CLOSED_LOOP_COMPLETE"
        else:
            _fail("PILOT_COMPLETION_TERMINAL_INVALID")
        result = _base_result(
            pilot_id=pilot_id,
            standing=standing,
            now=now,
            captured_turn_count=len(rows),
            participant_outcome=str(adjudication.get("participant_outcome")),
            eligible_for_effectiveness_review=bool(adjudication.get("eligible_for_effectiveness_review")),
        )
        result["record_materialized"] = True
        result["record_digest"] = digest(record)
        result["adjudication"] = copy.deepcopy(adjudication)
        return result

    by_type = {row["event_type"]: row for row in record.get("events", [])}
    verification = by_type.get("INDEPENDENT_VERIFICATION_COMPLETED")
    retention = by_type.get("RETENTION_CHECK_COMPLETED")
    transfer = by_type.get("TRANSFER_CHECK_COMPLETED")

    if verification is None:
        result = _base_result(
            pilot_id=pilot_id,
            standing="STAGE_1_IN_PROGRESS",
            now=now,
            captured_turn_count=len(rows),
        )
    elif verification.get("payload", {}).get("passed") is not True:
        result = _base_result(
            pilot_id=pilot_id,
            standing="VERIFICATION_NONPASS_REMEDIATION_PENDING",
            now=now,
            captured_turn_count=len(rows),
        )
    elif retention is None:
        due = int(verification["occurred_at"]) + RETENTION_MINIMUM_DELAY_SECONDS
        standing = "RETENTION_DUE" if now >= due else "RETENTION_WAIT"
        result = _base_result(
            pilot_id=pilot_id,
            standing=standing,
            now=now,
            captured_turn_count=len(rows),
        )
        result["retention_not_before"] = due
        result["retention_due"] = now >= due
        result["retention_seconds_remaining"] = max(0, due - now)
    elif retention.get("payload", {}).get("passed") is not True:
        result = _base_result(
            pilot_id=pilot_id,
            standing="RETENTION_NONPASS_REMEDIATION_PENDING",
            now=now,
            captured_turn_count=len(rows),
        )
    elif transfer is None:
        result = _base_result(
            pilot_id=pilot_id,
            standing="TRANSFER_PENDING",
            now=now,
            captured_turn_count=len(rows),
        )
    else:
        last = rows[-1]
        next_action_type = last.get("next_action", {}).get("action_type")
        standing = "COMPLETION_READY" if (
            last.get("action_type") == "TRANSFER_CHECK" and next_action_type == "COURSE_COMPLETE"
        ) else "TRANSFER_NONPASS_REMEDIATION_PENDING"
        result = _base_result(
            pilot_id=pilot_id,
            standing=standing,
            now=now,
            captured_turn_count=len(rows),
        )
        result["last_action_type"] = last.get("action_type")
        result["next_action_type"] = next_action_type

    result["record_materialized"] = True
    result["record_digest"] = digest(record)
    result["adjudication"] = copy.deepcopy(adjudication)
    return result


def finalize_closed_loop_if_ready(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    completed_at: int,
) -> Dict[str, Any]:
    if not isinstance(operation_id, str) or not operation_id:
        _fail("PILOT_COMPLETION_OPERATION_ID_REQUIRED")
    status = closed_loop_status(repo=repo, pilot_id=pilot_id, now=completed_at)
    if status["standing"] == "CLOSED_LOOP_COMPLETE":
        return {
            "status": "PASS",
            "completion_version": REAL_LEARNER_PILOT_COMPLETION_VERSION,
            "pilot_id": pilot_id,
            "standing": "CLOSED_LOOP_COMPLETE",
            "already_complete": True,
            "record_digest": status["record_digest"],
            "adjudication": copy.deepcopy(status["adjudication"]),
            "truth_boundary": copy.deepcopy(status["truth_boundary"]),
        }
    if status["standing"] != "COMPLETION_READY":
        _fail("PILOT_COMPLETION_NOT_READY:" + str(status["standing"]))

    terminal = mark_runtime_bound_pilot_complete(
        repo=repo,
        operation_id=operation_id,
        pilot_id=pilot_id,
        completed_at=completed_at,
    )
    record = terminal["record"]
    adjudication = terminal["adjudication"]
    return {
        "status": "PASS",
        "completion_version": REAL_LEARNER_PILOT_COMPLETION_VERSION,
        "pilot_id": pilot_id,
        "standing": "CLOSED_LOOP_COMPLETE",
        "already_complete": False,
        "record_digest": digest(record),
        "event_count": len(record.get("events", [])),
        "adjudication": copy.deepcopy(adjudication),
        "truth_boundary": {
            "participant_record_integrity": adjudication.get("truth_boundary", {}).get("pilot_record_integrity"),
            "human_participant_responses_must_be_genuine": True,
            "software_independently_proves_human_identity": False,
            "a01_may_manufacture_human_evidence": False,
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
        },
    }
