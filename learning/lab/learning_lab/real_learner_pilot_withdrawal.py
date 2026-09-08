from __future__ import annotations

import copy
from typing import Any, Dict

from .real_learner_pilot_runtime_binding import (
    PILOT_CURRENT_RUNTIME_BINDING_VERSION,
    PILOT_RUNTIME_BINDING_KIND,
    mark_runtime_bound_pilot_withdrawn,
)
from .repository import Repository, digest


REAL_LEARNER_PILOT_WITHDRAWAL_VERSION = "REAL-LEARNER-PILOT-WITHDRAWAL-V1"


class RealLearnerPilotWithdrawalError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotWithdrawalError(code)


def withdraw_runtime_bound_pilot(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    withdrawn_at: int,
) -> Dict[str, Any]:
    """Withdraw a consented runtime-bound pilot at any stage.

    Once baseline evidence exists, the already-qualified PILOT-001-v1 withdrawal
    path remains authoritative and is delegated to unchanged. Before any submitted
    turn exists, there is intentionally no v1 evidence record to validate; this
    function records a terminal pre-baseline withdrawal receipt instead of inventing
    baseline evidence merely to satisfy the frozen validator.
    """

    if not isinstance(operation_id, str) or not operation_id:
        _fail("PILOT_WITHDRAWAL_OPERATION_ID_REQUIRED")
    if not isinstance(pilot_id, str) or not pilot_id:
        _fail("PILOT_WITHDRAWAL_PILOT_ID_REQUIRED")
    if not isinstance(withdrawn_at, int) or isinstance(withdrawn_at, bool) or withdrawn_at < 0:
        _fail("PILOT_WITHDRAWAL_TIME_INVALID")

    payload = {
        "pilot_id": pilot_id,
        "withdrawn_at": withdrawn_at,
        "terminal": "WITHDRAWN",
        "withdrawal_version": REAL_LEARNER_PILOT_WITHDRAWAL_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior

    binding = repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, pilot_id)
    if binding is None:
        _fail("PILOT_WITHDRAWAL_BINDING_NOT_FOUND")

    terminal = binding.get("terminal")
    if terminal is not None:
        if terminal.get("kind") == "WITHDRAWN" and int(terminal.get("occurred_at", -1)) == withdrawn_at:
            _fail("PILOT_WITHDRAWAL_ALREADY_RECORDED_UNDER_DIFFERENT_OPERATION")
        _fail("PILOT_WITHDRAWAL_BINDING_ALREADY_TERMINAL")

    rows = list(binding.get("turn_receipts", []))
    latest = int(rows[-1]["submitted_at"]) if rows else int(binding["consented_at"])
    if withdrawn_at < latest:
        _fail("PILOT_WITHDRAWAL_TIME_REVERSED")

    if rows:
        delegated = mark_runtime_bound_pilot_withdrawn(
            repo=repo,
            operation_id=f"{operation_id}:pilot001-v1",
            pilot_id=pilot_id,
            withdrawn_at=withdrawn_at,
        )
        result = {
            **copy.deepcopy(delegated),
            "withdrawal_version": REAL_LEARNER_PILOT_WITHDRAWAL_VERSION,
            "withdrawal_stage": "POST_BASELINE_EVIDENCE",
            "record_materialized": True,
            "frozen_v1_validator_used": True,
        }
        repo.record_operation(operation_id, payload, result)
        repo.emit("RealLearnerPilotWithdrawalCompleted", pilot_id, {
            "withdrawal_stage": "POST_BASELINE_EVIDENCE",
            "record_materialized": True,
            "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
        })
        return result

    updated = copy.deepcopy(binding)
    updated["terminal"] = {
        "kind": "WITHDRAWN",
        "occurred_at": withdrawn_at,
        "stage": "PRE_BASELINE",
        "withdrawal_version": REAL_LEARNER_PILOT_WITHDRAWAL_VERSION,
    }
    updated["revision"] = int(updated["revision"]) + 1
    repo.put_object(PILOT_RUNTIME_BINDING_KIND, pilot_id, int(updated["revision"]), updated)

    result = {
        "status": "PASS",
        "pilot_id": pilot_id,
        "participant_key": binding["participant_key"],
        "course_id": binding["course_id"],
        "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
        "withdrawal_version": REAL_LEARNER_PILOT_WITHDRAWAL_VERSION,
        "withdrawal_stage": "PRE_BASELINE",
        "withdrawn_at": withdrawn_at,
        "participant_outcome": "WITHDRAWN",
        "eligible_for_effectiveness_review": False,
        "record_materialized": False,
        "frozen_v1_validator_used": False,
        "revision": updated["revision"],
        "binding_digest": digest(updated),
        "truth_boundary": {
            "consent_binding_existed": True,
            "baseline_evidence_existed": False,
            "pilot001_v1_evidence_record_materialized": False,
            "withdrawal_terminal_state_recorded": True,
            "effectiveness_evidence_created": False,
        },
    }
    repo.record_operation(operation_id, payload, result)
    repo.emit("RealLearnerPilotPreBaselineWithdrawn", pilot_id, {
        "withdrawn_at": withdrawn_at,
        "revision": updated["revision"],
        "record_materialized": False,
        "eligible_for_effectiveness_review": False,
    })
    return result


def withdrawal_status(*, repo: Repository, pilot_id: str) -> Dict[str, Any]:
    binding = repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, pilot_id)
    if binding is None:
        _fail("PILOT_WITHDRAWAL_BINDING_NOT_FOUND")
    terminal = binding.get("terminal")
    if not isinstance(terminal, dict) or terminal.get("kind") != "WITHDRAWN":
        return {
            "status": "PASS",
            "pilot_id": pilot_id,
            "withdrawn": False,
            "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
        }
    rows = list(binding.get("turn_receipts", []))
    return {
        "status": "PASS",
        "pilot_id": pilot_id,
        "withdrawn": True,
        "withdrawn_at": terminal.get("occurred_at"),
        "withdrawal_stage": terminal.get("stage") or ("POST_BASELINE_EVIDENCE" if rows else "PRE_BASELINE"),
        "captured_turn_count": len(rows),
        "eligible_for_effectiveness_review": False,
        "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
        "withdrawal_version": terminal.get("withdrawal_version", REAL_LEARNER_PILOT_WITHDRAWAL_VERSION),
    }
