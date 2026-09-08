from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Mapping


OBJECTIVE = "LEARNING-LAB-PILOT-001 — REAL-LEARNER CLOSED-LOOP EVIDENCE READINESS"
PROTOCOL_VERSION = "PILOT-001-v1"
DEFAULT_RETENTION_DELAY_SECONDS = 3600

_ALLOWED_EVENTS = {
    "PILOT_STARTED",
    "PARTICIPATION_CONSENT_ATTESTED",
    "BASELINE_COMPLETED",
    "ROUTE_SELECTED",
    "INSTRUCTION_COMPLETED",
    "INDEPENDENT_VERIFICATION_COMPLETED",
    "RETENTION_CHECK_COMPLETED",
    "TRANSFER_CHECK_COMPLETED",
    "PILOT_COMPLETED",
    "PILOT_WITHDRAWN",
}
_ASSESSMENT_EVENTS = {
    "BASELINE_COMPLETED",
    "INDEPENDENT_VERIFICATION_COMPLETED",
    "RETENTION_CHECK_COMPLETED",
    "TRANSFER_CHECK_COMPLETED",
}
_PII_KEYS = {
    "name",
    "full_name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "phone_number",
    "address",
    "date_of_birth",
    "dob",
    "ssn",
}
_RAW_RESPONSE_KEYS = {
    "response",
    "raw_response",
    "answer_text",
    "free_text",
    "learner_text",
}
_PARTICIPANT_KEY = re.compile(r"^[A-Z0-9][A-Z0-9_-]{5,63}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class PilotEvidenceError(ValueError):
    pass


def _fail(code: str) -> None:
    raise PilotEvidenceError(code)


def _walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            yield str(key).lower()
            yield from _walk_keys(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk_keys(nested)


def _score(payload: Mapping[str, Any], event_type: str) -> float:
    try:
        score = float(payload["score"])
        maximum = float(payload["max_score"])
    except (KeyError, TypeError, ValueError):
        _fail(f"{event_type}_SCORE_INVALID")
    if maximum <= 0 or score < 0 or score > maximum:
        _fail(f"{event_type}_SCORE_OUT_OF_RANGE")
    return score / maximum


def _validate_assessment(event: Mapping[str, Any]) -> float:
    event_type = str(event["event_type"])
    payload = event["payload"]
    fraction = _score(payload, event_type)

    if payload.get("assistance_used") is not False:
        _fail(f"{event_type}_ASSISTANCE_BREAKS_INDEPENDENCE")
    if payload.get("answer_revealed") is not False:
        _fail(f"{event_type}_ANSWER_REVEAL_BREAKS_INTEGRITY")

    digest = payload.get("response_digest")
    if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
        _fail(f"{event_type}_RESPONSE_DIGEST_REQUIRED")

    if event_type != "BASELINE_COMPLETED":
        if not isinstance(payload.get("passed"), bool):
            _fail(f"{event_type}_PASSED_FLAG_REQUIRED")
        family = payload.get("item_family_id")
        if not isinstance(family, str) or not family.strip():
            _fail(f"{event_type}_ITEM_FAMILY_REQUIRED")

    return fraction


def validate_pilot_record(
    record: Mapping[str, Any],
    *,
    retention_delay_seconds: int = DEFAULT_RETENTION_DELAY_SECONDS,
) -> Dict[str, Any]:
    if not isinstance(record, Mapping):
        _fail("PILOT_RECORD_MUST_BE_OBJECT")
    if record.get("protocol_version") != PROTOCOL_VERSION:
        _fail("PILOT_PROTOCOL_VERSION_MISMATCH")

    pilot_id = record.get("pilot_id")
    participant_key = record.get("participant_key")
    course_id = record.get("course_id")
    if not isinstance(pilot_id, str) or not pilot_id.strip():
        _fail("PILOT_ID_REQUIRED")
    if not isinstance(participant_key, str) or not _PARTICIPANT_KEY.fullmatch(participant_key):
        _fail("PSEUDONYMOUS_PARTICIPANT_KEY_REQUIRED")
    if not isinstance(course_id, str) or not course_id.strip():
        _fail("COURSE_ID_REQUIRED")

    keys = set(_walk_keys(record))
    if keys & _PII_KEYS:
        _fail("DIRECT_PII_FIELD_FORBIDDEN")
    if keys & _RAW_RESPONSE_KEYS:
        _fail("RAW_LEARNER_RESPONSE_FORBIDDEN")

    events = record.get("events")
    if not isinstance(events, list) or not events:
        _fail("PILOT_EVENTS_REQUIRED")

    seen_ids = set()
    prior_time = None
    typed: Dict[str, List[Mapping[str, Any]]] = {}
    baseline_index = None
    first_instruction_index = None
    terminal_index = None

    for index, event in enumerate(events):
        if not isinstance(event, Mapping):
            _fail("PILOT_EVENT_MUST_BE_OBJECT")
        event_id = event.get("event_id")
        event_type = event.get("event_type")
        occurred_at = event.get("occurred_at")
        payload = event.get("payload")

        if not isinstance(event_id, str) or not event_id.strip():
            _fail("PILOT_EVENT_ID_REQUIRED")
        if event_id in seen_ids:
            _fail("PILOT_EVENT_ID_DUPLICATE")
        seen_ids.add(event_id)
        if event_type not in _ALLOWED_EVENTS:
            _fail("PILOT_EVENT_TYPE_UNKNOWN")
        if not isinstance(occurred_at, int) or occurred_at < 0:
            _fail("PILOT_EVENT_TIME_INVALID")
        if prior_time is not None and occurred_at < prior_time:
            _fail("PILOT_EVENT_TIME_REVERSED")
        prior_time = occurred_at
        if not isinstance(payload, Mapping):
            _fail("PILOT_EVENT_PAYLOAD_REQUIRED")

        typed.setdefault(str(event_type), []).append(event)
        if event_type == "BASELINE_COMPLETED":
            baseline_index = index if baseline_index is None else baseline_index
        if event_type == "INSTRUCTION_COMPLETED" and first_instruction_index is None:
            first_instruction_index = index
        if event_type in {"PILOT_COMPLETED", "PILOT_WITHDRAWN"}:
            if terminal_index is not None:
                _fail("PILOT_MULTIPLE_TERMINAL_EVENTS")
            terminal_index = index
        if event_type in _ASSESSMENT_EVENTS:
            _validate_assessment(event)

    if events[0]["event_type"] != "PILOT_STARTED":
        _fail("PILOT_STARTED_MUST_BE_FIRST")
    if len(typed.get("PILOT_STARTED", [])) != 1:
        _fail("PILOT_STARTED_COUNT_INVALID")
    if len(typed.get("PARTICIPATION_CONSENT_ATTESTED", [])) != 1:
        _fail("PARTICIPATION_CONSENT_REQUIRED")
    consent = typed["PARTICIPATION_CONSENT_ATTESTED"][0]
    if consent["payload"].get("consent_recorded") is not True:
        _fail("PARTICIPATION_CONSENT_NOT_ATTESTED")
    if consent["payload"].get("protocol_version") != PROTOCOL_VERSION:
        _fail("PARTICIPATION_CONSENT_PROTOCOL_MISMATCH")

    baselines = typed.get("BASELINE_COMPLETED", [])
    if len(baselines) != 1:
        _fail("BASELINE_COUNT_INVALID")
    consent_index = events.index(consent)
    baseline_index = events.index(baselines[0])
    if consent_index >= baseline_index:
        _fail("CONSENT_MUST_PRECEDE_BASELINE")
    if first_instruction_index is not None and baseline_index >= first_instruction_index:
        _fail("BASELINE_MUST_PRECEDE_INSTRUCTION")

    if terminal_index is not None and terminal_index != len(events) - 1:
        _fail("PILOT_TERMINAL_EVENT_MUST_BE_LAST")

    if typed.get("PILOT_WITHDRAWN"):
        return {
            "status": "VALID_WITHDRAWN",
            "pilot_id": pilot_id,
            "participant_key": participant_key,
            "course_id": course_id,
            "event_count": len(events),
            "eligible_for_effectiveness_review": False,
            "withdrawn": True,
        }

    verification = typed.get("INDEPENDENT_VERIFICATION_COMPLETED", [])
    retention = typed.get("RETENTION_CHECK_COMPLETED", [])
    transfer = typed.get("TRANSFER_CHECK_COMPLETED", [])

    if len(verification) > 1 or len(retention) > 1 or len(transfer) > 1:
        _fail("PILOT_ASSESSMENT_EVENT_COUNT_INVALID")

    if retention:
        if not verification or verification[0]["payload"].get("passed") is not True:
            _fail("RETENTION_REQUIRES_PASSED_VERIFICATION")
        elapsed = retention[0]["occurred_at"] - verification[0]["occurred_at"]
        if elapsed < retention_delay_seconds:
            _fail("RETENTION_DELAY_NOT_MET")
        if retention[0]["payload"]["item_family_id"] == verification[0]["payload"]["item_family_id"]:
            _fail("RETENTION_REQUIRES_FRESH_ITEM_FAMILY")

    if transfer:
        if not retention or retention[0]["payload"].get("passed") is not True:
            _fail("TRANSFER_REQUIRES_PASSED_RETENTION")
        if transfer[0]["occurred_at"] < retention[0]["occurred_at"]:
            _fail("TRANSFER_BEFORE_RETENTION")
        if transfer[0]["payload"].get("novel_context") is not True:
            _fail("TRANSFER_NOVEL_CONTEXT_REQUIRED")
        used_families = {
            e["payload"]["item_family_id"]
            for e in verification + retention
            if "item_family_id" in e["payload"]
        }
        if transfer[0]["payload"]["item_family_id"] in used_families:
            _fail("TRANSFER_REQUIRES_FRESH_ITEM_FAMILY")

    completed = bool(typed.get("PILOT_COMPLETED"))
    if completed and (not verification or not retention or not transfer):
        _fail("PILOT_COMPLETION_REQUIRES_CLOSED_LOOP_EVIDENCE")

    return {
        "status": "VALID_COMPLETE" if completed else "VALID_IN_PROGRESS",
        "pilot_id": pilot_id,
        "participant_key": participant_key,
        "course_id": course_id,
        "event_count": len(events),
        "eligible_for_effectiveness_review": completed,
        "withdrawn": False,
    }


def adjudicate_pilot_record(
    record: Mapping[str, Any],
    *,
    retention_delay_seconds: int = DEFAULT_RETENTION_DELAY_SECONDS,
) -> Dict[str, Any]:
    validation = validate_pilot_record(record, retention_delay_seconds=retention_delay_seconds)
    if validation["withdrawn"]:
        return {
            **validation,
            "participant_outcome": "WITHDRAWN",
            "truth_boundary": _truth_boundary("NOT_EVALUATED"),
        }

    events = record["events"]
    by_type = {event["event_type"]: event for event in events}
    baseline = _score(by_type["BASELINE_COMPLETED"]["payload"], "BASELINE_COMPLETED")

    if not validation["eligible_for_effectiveness_review"]:
        return {
            **validation,
            "participant_outcome": "INCOMPLETE",
            "baseline_fraction": baseline,
            "truth_boundary": _truth_boundary("NOT_EVALUATED"),
        }

    verification = by_type["INDEPENDENT_VERIFICATION_COMPLETED"]
    retention = by_type["RETENTION_CHECK_COMPLETED"]
    transfer = by_type["TRANSFER_CHECK_COMPLETED"]
    verification_fraction = _score(verification["payload"], verification["event_type"])
    retention_fraction = _score(retention["payload"], retention["event_type"])
    transfer_fraction = _score(transfer["payload"], transfer["event_type"])
    all_passed = all(
        event["payload"].get("passed") is True
        for event in (verification, retention, transfer)
    )

    return {
        **validation,
        "participant_outcome": "CLOSED_LOOP_PASS" if all_passed else "CLOSED_LOOP_NONPASS",
        "baseline_fraction": baseline,
        "independent_verification_fraction": verification_fraction,
        "retention_fraction": retention_fraction,
        "transfer_fraction": transfer_fraction,
        "observed_verification_minus_baseline": verification_fraction - baseline,
        "retention_delay_seconds": retention["occurred_at"] - verification["occurred_at"],
        "closed_loop_passed": all_passed,
        "truth_boundary": _truth_boundary("REAL_PARTICIPANT_RECORD_ADJUDICATED"),
    }


def _truth_boundary(pilot_record: str) -> Dict[str, str]:
    return {
        "pilot_record_integrity": pilot_record,
        "portable_closed_loop_behavior": "INHERITED_FROM_QUAL_001",
        "real_learner_effectiveness": "NOT_PROVEN",
        "psychometric_validity": "NOT_PROVEN",
        "population_validity": "NOT_PROVEN",
        "production_system_master_integration": "NOT_PROVEN",
        "target_native_iphone_behavior": "NOT_PROVEN",
    }
