from __future__ import annotations

import copy
import hashlib
from typing import Any, Dict, Iterable, Mapping, Optional

from .domain_general import default_domain_registry
from .real_learner_pilot import PROTOCOL_VERSION, adjudicate_pilot_record, validate_pilot_record
from .repository import Repository, canonical_json, digest
from .unified_fresh_evidence_recovery import UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION
from .unified_turn_controller import (
    TURN_KIND,
    TURN_SUBMISSION_KIND,
    UNIFIED_TURN_CONTROLLER_VERSION,
)


PILOT_CURRENT_RUNTIME_BINDING_VERSION = "PILOT-001-CURRENT-RUNTIME-BINDING-V1"
PILOT_RUNTIME_BINDING_KIND = "real_learner_pilot_runtime_binding"


class PilotRuntimeBindingError(ValueError):
    pass


def _fail(code: str) -> None:
    raise PilotRuntimeBindingError(code)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _aggregate_response_digest(digests: Iterable[str]) -> str:
    rows = list(digests)
    if not rows:
        _fail("PILOT_BASELINE_RUNTIME_RECEIPTS_REQUIRED")
    return _sha256_text(canonical_json(rows))


def _latest_binding(repo: Repository, pilot_id: str) -> Optional[Dict[str, Any]]:
    return repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, pilot_id)


def _write_revision(repo: Repository, binding: Dict[str, Any]) -> Dict[str, Any]:
    revision = int(binding["revision"])
    repo.put_object(PILOT_RUNTIME_BINDING_KIND, binding["pilot_id"], revision, copy.deepcopy(binding))
    return copy.deepcopy(binding)


def _assert_scope(binding: Mapping[str, Any], turn: Mapping[str, Any]) -> None:
    expected = {
        "journey_id": binding["journey_id"],
        "session_id": binding["session_id"],
        "learner_id": binding["learner_id"],
        "course_id": binding["course_id"],
    }
    for key, value in expected.items():
        if turn.get(key) != value:
            _fail("PILOT_RUNTIME_SCOPE_MISMATCH:" + key)


def _task_from_default_registry(repo: Repository, course: Mapping[str, Any], target_id: str) -> Optional[Dict[str, Any]]:
    registry = default_domain_registry()
    spec = None
    domain_key = course.get("domain_key")
    if isinstance(domain_key, str) and registry.has_key(domain_key):
        spec = registry.by_key(domain_key)
    elif isinstance(course.get("desired_outcome"), str):
        try:
            spec = registry.by_outcome(course["desired_outcome"])
        except ValueError:
            spec = None
    if spec is None:
        return None
    for catalog in (getattr(spec, "maintenance_tasks", {}), getattr(spec, "transfer_tasks", {})):
        if isinstance(catalog, Mapping):
            task = catalog.get(target_id)
            if task is not None:
                return copy.deepcopy(task)
    return None


def _task_for_target(repo: Repository, course_id: str, target_id: str) -> Dict[str, Any]:
    course = repo.get_object("course", course_id, 1)
    if course is None:
        _fail("PILOT_RUNTIME_COURSE_NOT_FOUND")
    for item in course.get("items", []):
        if item.get("item_id") == target_id:
            return copy.deepcopy(item)
    for kind in ("maintenance_task", "transfer_task"):
        task = repo.get_object(kind, target_id, 1)
        if task is not None:
            return copy.deepcopy(task)
    dossier = repo.get_object("research_dossier", course.get("research_dossier_id", ""), 1) or {}
    for key in ("maintenance_tasks", "transfer_tasks"):
        for task in dossier.get(key, []):
            if task.get("item_id") == target_id:
                return copy.deepcopy(task)
    task = _task_from_default_registry(repo, course, target_id)
    if task is not None:
        return task
    _fail("PILOT_RUNTIME_TARGET_METADATA_NOT_FOUND:" + target_id)


def _diagnostic_probe(repo: Repository, turn_id: str) -> Dict[str, Any]:
    probe = repo.get_object("diagnostic_probe", f"PROBE-TURN-EVIDENCE-{turn_id}", 1)
    if probe is None:
        _fail("PILOT_RUNTIME_DIAGNOSTIC_PROBE_NOT_FOUND:" + turn_id)
    return probe


def _receipt(repo: Repository, binding: Mapping[str, Any], turn_id: str) -> Dict[str, Any]:
    turn = repo.get_object(TURN_KIND, turn_id, 1)
    submission = repo.get_object(TURN_SUBMISSION_KIND, turn_id, 1)
    if turn is None or submission is None:
        _fail("PILOT_RUNTIME_SUBMITTED_TURN_REQUIRED:" + turn_id)
    _assert_scope(binding, turn)
    result = submission.get("result")
    if not isinstance(result, Mapping) or result.get("status") != "PASS":
        _fail("PILOT_RUNTIME_SUBMISSION_PASS_REQUIRED:" + turn_id)
    if result.get("response_echoed") is not False:
        _fail("PILOT_RUNTIME_RESPONSE_ECHO_FORBIDDEN:" + turn_id)
    response_digest = result.get("response_digest")
    if not isinstance(response_digest, str) or len(response_digest) != 64:
        _fail("PILOT_RUNTIME_RESPONSE_DIGEST_REQUIRED:" + turn_id)
    action = turn.get("action")
    if not isinstance(action, Mapping):
        _fail("PILOT_RUNTIME_ACTION_REQUIRED:" + turn_id)
    action_type = action.get("action_type")
    target_id = action.get("target_id")
    evidence = result.get("evidence") if isinstance(result.get("evidence"), Mapping) else {}
    next_action = result.get("next_action") if isinstance(result.get("next_action"), Mapping) else {}

    receipt = {
        "turn_id": turn_id,
        "turn_binding_digest": turn.get("turn_binding_digest"),
        "prepared_at": turn.get("prepared_at"),
        "submitted_at": result.get("submitted_at"),
        "mode": turn.get("mode"),
        "action_type": action_type,
        "target_id": target_id,
        "skill_id": action.get("skill_id"),
        "selected_authority": turn.get("selected_authority"),
        "response_digest": response_digest,
        "evidence": {
            key: copy.deepcopy(evidence.get(key))
            for key in (
                "evidence_kind",
                "item_id",
                "skill_id",
                "correct",
                "assisted",
                "answer_revealed_before_commit",
                "standing",
                "routing_only",
                "qualifies_mastery",
                "projection_stage",
                "reason_codes",
            )
            if key in evidence
        },
        "next_action": {
            key: copy.deepcopy(next_action.get(key))
            for key in ("action_type", "target_id", "skill_id", "reason_codes")
            if key in next_action
        },
        "next_authority": result.get("next_authority"),
    }
    if action_type == "DIAGNOSTIC_PROBE":
        probe = _diagnostic_probe(repo, turn_id)
        receipt["diagnostic_integrity"] = {
            "correct": probe.get("correct"),
            "assisted": probe.get("assisted"),
            "answer_revealed_before_commit": probe.get("answer_revealed_before_commit"),
            "item_family_id": probe.get("item_family_id"),
            "standing": probe.get("standing"),
        }
    elif isinstance(target_id, str) and target_id:
        task = _task_for_target(repo, binding["course_id"], target_id)
        receipt["task_metadata"] = {
            "item_id": task.get("item_id"),
            "family_id": task.get("family_id"),
            "mode": task.get("mode"),
            "skill_id": task.get("skill_id"),
            "criterion_id": task.get("criterion_id"),
            "novelty": copy.deepcopy(task.get("novelty")),
        }
    if "response" in canonical_json(receipt).lower().replace("response_digest", ""):
        _fail("PILOT_RUNTIME_RAW_RESPONSE_LEAK")
    return receipt


def start_runtime_bound_pilot(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    participant_key: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    started_at: int,
    consented_at: int,
    consent_recorded: bool,
) -> Dict[str, Any]:
    payload = {
        "pilot_id": pilot_id,
        "participant_key": participant_key,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "started_at": started_at,
        "consented_at": consented_at,
        "consent_recorded": consent_recorded,
        "protocol_version": PROTOCOL_VERSION,
        "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior
    if _latest_binding(repo, pilot_id) is not None:
        _fail("PILOT_RUNTIME_ID_REUSE")
    if consent_recorded is not True:
        _fail("PILOT_RUNTIME_EXPLICIT_CONSENT_REQUIRED")
    if not isinstance(started_at, int) or not isinstance(consented_at, int) or started_at < 0 or consented_at < started_at:
        _fail("PILOT_RUNTIME_CONSENT_TIME_INVALID")
    # Reuse the frozen v1 validator's participant-key and PII rules immediately.
    validate_pilot_record({
        "pilot_id": pilot_id,
        "participant_key": participant_key,
        "course_id": course_id,
        "protocol_version": PROTOCOL_VERSION,
        "events": [
            {"event_id": "E-START", "event_type": "PILOT_STARTED", "occurred_at": started_at, "payload": {}},
            {"event_id": "E-CONSENT", "event_type": "PARTICIPATION_CONSENT_ATTESTED", "occurred_at": consented_at,
             "payload": {"consent_recorded": True, "protocol_version": PROTOCOL_VERSION}},
            {"event_id": "E-BASELINE-STUB", "event_type": "BASELINE_COMPLETED", "occurred_at": consented_at,
             "payload": {"score": 0, "max_score": 1, "assistance_used": False, "answer_revealed": False,
                         "response_digest": "0" * 64}},
        ],
    })
    binding = {
        **payload,
        "revision": 1,
        "turn_receipts": [],
        "terminal": None,
        "authority_boundary": {
            "pilot_scores_supplied_by_caller": False,
            "pilot_response_digests_supplied_by_caller": False,
            "pilot_item_families_supplied_by_caller": False,
            "runtime_receipts_are_pilot_evidence_source": True,
            "human_participant_evidence_required": True,
            "a01_may_manufacture_human_evidence": False,
        },
        "runtime_versions": {
            "unified_turn_controller": UNIFIED_TURN_CONTROLLER_VERSION,
            "unified_fresh_evidence_recovery": UNIFIED_FRESH_EVIDENCE_RECOVERY_VERSION,
        },
    }
    _write_revision(repo, binding)
    result = {
        "status": "PASS",
        "pilot_id": pilot_id,
        "participant_key": participant_key,
        "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
        "standing": "CONSENTED_RUNTIME_BINDING_READY",
        "revision": 1,
    }
    repo.record_operation(operation_id, payload, result)
    repo.emit("RealLearnerPilotRuntimeBindingStarted", pilot_id, {
        "participant_key": participant_key,
        "course_id": course_id,
        "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
    })
    return result


def capture_runtime_turn(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    turn_id: str,
) -> Dict[str, Any]:
    binding = _latest_binding(repo, pilot_id)
    if binding is None:
        _fail("PILOT_RUNTIME_BINDING_NOT_FOUND")
    payload = {"pilot_id": pilot_id, "turn_id": turn_id, "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION}
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior
    if binding.get("terminal") is not None:
        _fail("PILOT_RUNTIME_TERMINAL")
    if any(row.get("turn_id") == turn_id for row in binding.get("turn_receipts", [])):
        _fail("PILOT_RUNTIME_TURN_ALREADY_CAPTURED")
    receipt = _receipt(repo, binding, turn_id)
    rows = list(binding.get("turn_receipts", []))
    if rows and int(receipt["submitted_at"]) < int(rows[-1]["submitted_at"]):
        _fail("PILOT_RUNTIME_TURN_TIME_REVERSED")
    binding = copy.deepcopy(binding)
    binding["turn_receipts"] = rows + [receipt]
    binding["revision"] = int(binding["revision"]) + 1
    _write_revision(repo, binding)
    result = {
        "status": "PASS",
        "pilot_id": pilot_id,
        "turn_id": turn_id,
        "receipt_digest": digest(receipt),
        "captured_action_type": receipt["action_type"],
        "response_digest": receipt["response_digest"],
        "response_echoed": False,
        "revision": binding["revision"],
    }
    repo.record_operation(operation_id, payload, result)
    repo.emit("RealLearnerPilotRuntimeTurnCaptured", pilot_id, {
        "turn_id": turn_id,
        "action_type": receipt["action_type"],
        "receipt_digest": digest(receipt),
    })
    return result


def mark_runtime_bound_pilot_complete(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    completed_at: int,
) -> Dict[str, Any]:
    binding = _latest_binding(repo, pilot_id)
    if binding is None:
        _fail("PILOT_RUNTIME_BINDING_NOT_FOUND")
    payload = {"pilot_id": pilot_id, "completed_at": completed_at, "terminal": "COMPLETE"}
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior
    rows = binding.get("turn_receipts", [])
    if not rows or rows[-1].get("action_type") != "TRANSFER_CHECK":
        _fail("PILOT_RUNTIME_COMPLETION_REQUIRES_TRANSFER_RECEIPT")
    next_type = rows[-1].get("next_action", {}).get("action_type")
    if next_type != "COURSE_COMPLETE":
        _fail("PILOT_RUNTIME_COMPLETION_REQUIRES_COURSE_COMPLETE")
    if completed_at < int(rows[-1]["submitted_at"]):
        _fail("PILOT_RUNTIME_COMPLETION_TIME_INVALID")
    binding = copy.deepcopy(binding)
    binding["terminal"] = {"kind": "COMPLETE", "occurred_at": completed_at}
    binding["revision"] = int(binding["revision"]) + 1
    _write_revision(repo, binding)
    record = materialize_runtime_bound_pilot_record(repo=repo, pilot_id=pilot_id)
    result = {"status": "PASS", "pilot_id": pilot_id, "record": record,
              "adjudication": adjudicate_pilot_record(record), "revision": binding["revision"]}
    repo.record_operation(operation_id, payload, result)
    return result


def mark_runtime_bound_pilot_withdrawn(
    *,
    repo: Repository,
    operation_id: str,
    pilot_id: str,
    withdrawn_at: int,
) -> Dict[str, Any]:
    binding = _latest_binding(repo, pilot_id)
    if binding is None:
        _fail("PILOT_RUNTIME_BINDING_NOT_FOUND")
    payload = {"pilot_id": pilot_id, "withdrawn_at": withdrawn_at, "terminal": "WITHDRAWN"}
    prior = repo.operation_result(operation_id, payload)
    if prior is not None:
        return prior
    rows = binding.get("turn_receipts", [])
    latest = int(rows[-1]["submitted_at"]) if rows else int(binding["consented_at"])
    if withdrawn_at < latest:
        _fail("PILOT_RUNTIME_WITHDRAWAL_TIME_INVALID")
    binding = copy.deepcopy(binding)
    binding["terminal"] = {"kind": "WITHDRAWN", "occurred_at": withdrawn_at}
    binding["revision"] = int(binding["revision"]) + 1
    _write_revision(repo, binding)
    record = materialize_runtime_bound_pilot_record(repo=repo, pilot_id=pilot_id)
    result = {"status": "PASS", "pilot_id": pilot_id, "record": record,
              "adjudication": adjudicate_pilot_record(record), "revision": binding["revision"]}
    repo.record_operation(operation_id, payload, result)
    return result


def _assessment_payload(receipt: Mapping[str, Any], *, baseline: bool = False) -> Dict[str, Any]:
    evidence = receipt.get("evidence", {})
    if baseline:
        integrity = receipt.get("diagnostic_integrity", {})
        correct = integrity.get("correct")
        return {
            "score": 1 if correct is True else 0,
            "max_score": 1,
            "assistance_used": integrity.get("assisted") is True,
            "answer_revealed": integrity.get("answer_revealed_before_commit") is True,
            "response_digest": receipt["response_digest"],
        }
    correct = evidence.get("correct")
    metadata = receipt.get("task_metadata", {})
    family = metadata.get("family_id")
    if not isinstance(family, str) or not family:
        _fail("PILOT_RUNTIME_ITEM_FAMILY_NOT_PROVEN:" + str(receipt.get("turn_id")))
    return {
        "score": 1 if correct is True else 0,
        "max_score": 1,
        "passed": correct is True,
        "assistance_used": evidence.get("assisted") is True,
        "answer_revealed": evidence.get("answer_revealed_before_commit") is True,
        "response_digest": receipt["response_digest"],
        "item_family_id": family,
    }


def materialize_runtime_bound_pilot_record(*, repo: Repository, pilot_id: str) -> Dict[str, Any]:
    binding = _latest_binding(repo, pilot_id)
    if binding is None:
        _fail("PILOT_RUNTIME_BINDING_NOT_FOUND")
    rows = list(binding.get("turn_receipts", []))
    events = [
        {"event_id": "E-START", "event_type": "PILOT_STARTED", "occurred_at": binding["started_at"], "payload": {}},
        {"event_id": "E-CONSENT", "event_type": "PARTICIPATION_CONSENT_ATTESTED", "occurred_at": binding["consented_at"],
         "payload": {"consent_recorded": True, "protocol_version": PROTOCOL_VERSION}},
    ]

    baseline_rows = []
    cursor = 0
    while cursor < len(rows) and rows[cursor].get("action_type") == "DIAGNOSTIC_PROBE":
        baseline_rows.append(rows[cursor])
        cursor += 1
    if not baseline_rows:
        _fail("PILOT_RUNTIME_BASELINE_RECEIPTS_REQUIRED")
    if any(row.get("diagnostic_integrity", {}).get("assisted") is True or
           row.get("diagnostic_integrity", {}).get("answer_revealed_before_commit") is True
           for row in baseline_rows):
        _fail("PILOT_RUNTIME_BASELINE_INDEPENDENCE_REQUIRED")
    baseline_payload = {
        "score": sum(1 for row in baseline_rows if row.get("diagnostic_integrity", {}).get("correct") is True),
        "max_score": len(baseline_rows),
        "assistance_used": False,
        "answer_revealed": False,
        "response_digest": _aggregate_response_digest(row["response_digest"] for row in baseline_rows),
    }
    last_baseline = baseline_rows[-1]
    events.append({"event_id": "E-BASELINE", "event_type": "BASELINE_COMPLETED",
                   "occurred_at": last_baseline["submitted_at"], "payload": baseline_payload})
    route = last_baseline.get("next_action", {})
    route_type = route.get("action_type")
    route_skill = route.get("skill_id")
    if not route_type:
        _fail("PILOT_RUNTIME_ROUTE_NOT_PROVEN")
    events.append({
        "event_id": "E-ROUTE",
        "event_type": "ROUTE_SELECTED",
        "occurred_at": last_baseline["submitted_at"],
        "payload": {
            "action_type": route_type,
            "skill_id": route_skill,
            "selected_authority": last_baseline.get("next_authority"),
        },
    })

    instruction_emitted = False
    verification_emitted = False
    retention_emitted = False
    transfer_emitted = False
    for row in rows[cursor:]:
        action_type = row.get("action_type")
        if row.get("mode") == "TUTOR":
            next_type = row.get("next_action", {}).get("action_type")
            if not instruction_emitted and next_type in {"INDEPENDENT_VERIFICATION", "MASTERY_CHECK"}:
                events.append({
                    "event_id": "E-INSTRUCTION",
                    "event_type": "INSTRUCTION_COMPLETED",
                    "occurred_at": row["submitted_at"],
                    "payload": {"skill_id": row.get("skill_id") or row.get("next_action", {}).get("skill_id")},
                })
                instruction_emitted = True
            continue
        if action_type in {"INDEPENDENT_VERIFICATION", "MASTERY_CHECK"} and not verification_emitted:
            events.append({
                "event_id": "E-VERIFICATION",
                "event_type": "INDEPENDENT_VERIFICATION_COMPLETED",
                "occurred_at": row["submitted_at"],
                "payload": _assessment_payload(row),
            })
            verification_emitted = True
            continue
        if action_type in {"RETENTION_CHECK", "MAINTENANCE_RECHECK"} and not retention_emitted:
            events.append({
                "event_id": "E-RETENTION",
                "event_type": "RETENTION_CHECK_COMPLETED",
                "occurred_at": row["submitted_at"],
                "payload": _assessment_payload(row),
            })
            retention_emitted = True
            continue
        if action_type == "TRANSFER_CHECK" and not transfer_emitted:
            payload = _assessment_payload(row)
            novelty = row.get("task_metadata", {}).get("novelty")
            if not isinstance(novelty, Mapping) or not any(value is True for value in novelty.values()):
                _fail("PILOT_RUNTIME_TRANSFER_NOVELTY_NOT_PROVEN")
            payload["novel_context"] = True
            events.append({
                "event_id": "E-TRANSFER",
                "event_type": "TRANSFER_CHECK_COMPLETED",
                "occurred_at": row["submitted_at"],
                "payload": payload,
            })
            transfer_emitted = True
            continue

    terminal = binding.get("terminal")
    if isinstance(terminal, Mapping):
        if terminal.get("kind") == "COMPLETE":
            events.append({"event_id": "E-COMPLETE", "event_type": "PILOT_COMPLETED",
                           "occurred_at": terminal["occurred_at"], "payload": {}})
        elif terminal.get("kind") == "WITHDRAWN":
            events.append({"event_id": "E-WITHDRAWN", "event_type": "PILOT_WITHDRAWN",
                           "occurred_at": terminal["occurred_at"], "payload": {}})
        else:
            _fail("PILOT_RUNTIME_TERMINAL_INVALID")

    record = {
        "pilot_id": binding["pilot_id"],
        "participant_key": binding["participant_key"],
        "course_id": binding["course_id"],
        "protocol_version": PROTOCOL_VERSION,
        "events": events,
    }
    validate_pilot_record(record)
    return record


def current_runtime_binding_summary(*, repo: Repository, pilot_id: str) -> Dict[str, Any]:
    binding = _latest_binding(repo, pilot_id)
    if binding is None:
        _fail("PILOT_RUNTIME_BINDING_NOT_FOUND")
    record = materialize_runtime_bound_pilot_record(repo=repo, pilot_id=pilot_id)
    adjudication = adjudicate_pilot_record(record)
    return {
        "status": "PASS",
        "binding_version": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
        "protocol_version": PROTOCOL_VERSION,
        "pilot_id": pilot_id,
        "revision": binding["revision"],
        "captured_turn_count": len(binding.get("turn_receipts", [])),
        "record": record,
        "adjudication": adjudication,
        "authority_boundary": copy.deepcopy(binding["authority_boundary"]),
        "runtime_versions": copy.deepcopy(binding["runtime_versions"]),
        "truth_boundary": {
            "pilot_runtime_receipt_binding": "PROVEN_BY_THIS_SOFTWARE_PATH",
            "human_participant_record": "NOT_PROVEN_UNTIL_REAL_PARTICIPANT_EXECUTION",
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
            "target_native_iphone_behavior": "NOT_PROVEN",
        },
    }
