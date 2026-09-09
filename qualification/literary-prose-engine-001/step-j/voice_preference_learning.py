import hashlib
import json
from datetime import datetime

EVENT_AUTHORITIES = {
    "USER_EXPLICIT_PREFERENCE": "USER_EXPLICIT",
    "USER_IDENTITY_INVARIANT": "USER_EXPLICIT",
    "USER_REVOKE_EVENT": "USER_EXPLICIT",
    "USER_ACCEPT_CANDIDATE": "USER_ACTION",
    "USER_REJECT_CANDIDATE": "USER_ACTION",
    "USER_RETAIN_ORIGINAL": "USER_ACTION",
    "USER_MODIFIED_CANDIDATE": "USER_ACTION",
    "STEP_I_ACCEPT_CANDIDATE": "STEP_I_QUALIFIED",
    "STEP_I_RETAIN_ORIGINAL": "STEP_I_QUALIFIED",
}

PREFERENCE_RANK = {
    "STEP_I_ACCEPT_CANDIDATE": 1,
    "STEP_I_RETAIN_ORIGINAL": 1,
    "USER_ACCEPT_CANDIDATE": 2,
    "USER_REJECT_CANDIDATE": 2,
    "USER_RETAIN_ORIGINAL": 2,
    "USER_MODIFIED_CANDIDATE": 2,
    "USER_EXPLICIT_PREFERENCE": 3,
}

FORBIDDEN_RAW_FIELDS = {
    "raw_text", "passage_text", "candidate_text", "original_text",
    "manuscript_text", "writer_rationale"
}
CONTEXT_KEYS = (
    "genre", "form", "audience", "scene_function", "pov",
    "character_or_speaker", "chapter_role", "pacing_target"
)


def _parse_time(value):
    if not isinstance(value, str):
        raise ValueError("INVALID_OCCURRED_AT")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("INVALID_OCCURRED_AT") from exc


def _context_signature(context):
    context = context or {}
    payload = {k: context[k] for k in CONTEXT_KEYS if k in context and context[k] is not None}
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _state_key(event):
    return f"{event['dimension']}|{_context_signature(event.get('context', {}))}"


def _history_digest(events):
    raw = json.dumps(events, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _validate_common(event):
    required = {
        "event_id", "project_id", "sequence", "occurred_at", "event_type",
        "authority", "dimension", "direction", "context", "subject_digest",
        "evidence_refs"
    }
    missing = sorted(required - set(event))
    if missing:
        raise ValueError("MISSING_REQUIRED_FIELDS:" + ",".join(missing))
    if any(field in event for field in FORBIDDEN_RAW_FIELDS):
        raise ValueError("RAW_TEXT_FIELD_FORBIDDEN")
    if event["event_type"] not in EVENT_AUTHORITIES:
        raise ValueError("UNKNOWN_EVENT_TYPE")
    if event["authority"] != EVENT_AUTHORITIES[event["event_type"]]:
        raise ValueError("AUTHORITY_EVENT_TYPE_MISMATCH")
    if not isinstance(event["event_id"], str) or not event["event_id"]:
        raise ValueError("INVALID_EVENT_ID")
    if not isinstance(event["project_id"], str) or not event["project_id"]:
        raise ValueError("INVALID_PROJECT_ID")
    if not isinstance(event["sequence"], int) or event["sequence"] <= 0:
        raise ValueError("INVALID_SEQUENCE")
    _parse_time(event["occurred_at"])
    if not isinstance(event["dimension"], str) or not event["dimension"]:
        raise ValueError("INVALID_DIMENSION")
    if not isinstance(event["direction"], str) or not event["direction"]:
        raise ValueError("INVALID_DIRECTION")
    if not isinstance(event["context"], dict):
        raise ValueError("INVALID_CONTEXT")
    if not isinstance(event["subject_digest"], str) or len(event["subject_digest"]) < 8:
        raise ValueError("INVALID_SUBJECT_DIGEST")
    if not isinstance(event["evidence_refs"], list):
        raise ValueError("INVALID_EVIDENCE_REFS")
    if event.get("named_author_target") not in (None, False):
        raise ValueError("NAMED_AUTHOR_TARGET_REJECTED")


def append_event(ledger, event):
    """Validate and append without mutating the caller's ledger."""
    _validate_common(event)
    existing = list(ledger)
    if any(e["event_id"] == event["event_id"] for e in existing):
        raise ValueError("DUPLICATE_EVENT_ID")
    if existing:
        if event["project_id"] != existing[0]["project_id"]:
            raise ValueError("PROJECT_BOUNDARY_MISMATCH")
        if event["sequence"] <= existing[-1]["sequence"]:
            raise ValueError("NON_MONOTONIC_SEQUENCE")
        if _parse_time(event["occurred_at"]) < _parse_time(existing[-1]["occurred_at"]):
            raise ValueError("NON_MONOTONIC_TIME")

    by_id = {e["event_id"]: e for e in existing}
    if event["event_type"] == "USER_REVOKE_EVENT":
        target = event.get("revoked_event_id")
        if not target or target not in by_id or by_id[target]["event_type"] == "USER_REVOKE_EVENT":
            raise ValueError("INVALID_REVOKE_TARGET")

    if event["event_type"] == "USER_IDENTITY_INVARIANT":
        active = derive_state(existing) if existing else {"stable_identity": {}}
        key = _state_key(event)
        prior = active["stable_identity"].get(key)
        if prior and prior["direction"] != event["direction"]:
            if event.get("supersedes_event_id") != prior["source_event_id"]:
                raise ValueError("IDENTITY_REDEFINITION_REQUIRES_EXPLICIT_SUPERSESSION")

    return existing + [dict(event)]


def derive_state(ledger):
    events = list(ledger)
    if not events:
        return {
            "project_id": None,
            "event_count": 0,
            "stable_identity": {},
            "current_preference": {},
            "development_frontier": {},
            "rejected_direction": {},
            "rejection_history": [],
            "revoked_event_ids": [],
            "frequency_used_as_quality": False,
            "history_digest": _history_digest([]),
        }

    seen = set()
    project_id = events[0]["project_id"]
    prev_seq = 0
    prev_time = None
    for event in events:
        _validate_common(event)
        if event["event_id"] in seen:
            raise ValueError("DUPLICATE_EVENT_ID")
        seen.add(event["event_id"])
        if event["project_id"] != project_id:
            raise ValueError("PROJECT_BOUNDARY_MISMATCH")
        if event["sequence"] <= prev_seq:
            raise ValueError("NON_MONOTONIC_SEQUENCE")
        current_time = _parse_time(event["occurred_at"])
        if prev_time is not None and current_time < prev_time:
            raise ValueError("NON_MONOTONIC_TIME")
        prev_seq = event["sequence"]
        prev_time = current_time

    by_id = {e["event_id"]: e for e in events}
    revoked = set()
    for event in events:
        if event["event_type"] == "USER_REVOKE_EVENT":
            target = event.get("revoked_event_id")
            if not target or target not in by_id or by_id[target]["event_type"] == "USER_REVOKE_EVENT":
                raise ValueError("INVALID_REVOKE_TARGET")
            revoked.add(target)

    active = [e for e in events if e["event_type"] != "USER_REVOKE_EVENT" and e["event_id"] not in revoked]

    stable_identity = {}
    for event in active:
        if event["event_type"] != "USER_IDENTITY_INVARIANT":
            continue
        key = _state_key(event)
        prior = stable_identity.get(key)
        if prior and prior["direction"] != event["direction"] and event.get("supersedes_event_id") != prior["source_event_id"]:
            raise ValueError("IDENTITY_REDEFINITION_REQUIRES_EXPLICIT_SUPERSESSION")
        stable_identity[key] = {
            "dimension": event["dimension"],
            "context": event["context"],
            "direction": event["direction"],
            "source_event_id": event["event_id"],
            "sequence": event["sequence"],
        }

    grouped = {}
    for event in active:
        if event["event_type"] in PREFERENCE_RANK:
            grouped.setdefault(_state_key(event), []).append(event)

    current_preference = {}
    development_frontier = {}
    for key, group in grouped.items():
        governing = max(group, key=lambda e: (PREFERENCE_RANK[e["event_type"]], e["sequence"]))
        current_preference[key] = {
            "dimension": governing["dimension"],
            "context": governing["context"],
            "direction": governing["direction"],
            "source_event_id": governing["event_id"],
            "source_event_type": governing["event_type"],
            "authority": governing["authority"],
            "sequence": governing["sequence"],
        }
        alternatives = []
        for event in group:
            if event["event_id"] == governing["event_id"]:
                continue
            if event["direction"] != governing["direction"] and event["event_type"] != "USER_REJECT_CANDIDATE":
                alternatives.append({
                    "direction": event["direction"],
                    "source_event_id": event["event_id"],
                    "authority": event["authority"],
                    "sequence": event["sequence"],
                })
        if alternatives:
            development_frontier[key] = sorted(alternatives, key=lambda x: x["sequence"])

    rejection_history = []
    rejected_direction = {}
    for event in active:
        if event["event_type"] == "USER_REJECT_CANDIDATE":
            rejection_history.append({
                "event_id": event["event_id"], "dimension": event["dimension"],
                "context": event["context"], "direction": event["direction"],
                "sequence": event["sequence"]
            })
            key = _state_key(event) + "|" + event["direction"]
            rejected_direction[key] = dict(rejection_history[-1])
        elif event["event_type"] in {
            "USER_ACCEPT_CANDIDATE", "USER_MODIFIED_CANDIDATE", "USER_EXPLICIT_PREFERENCE"
        }:
            key = _state_key(event) + "|" + event["direction"]
            if key in rejected_direction and event["sequence"] > rejected_direction[key]["sequence"]:
                del rejected_direction[key]

    counts = {}
    for event in active:
        counts[event["event_type"]] = counts.get(event["event_type"], 0) + 1

    return {
        "project_id": project_id,
        "event_count": len(events),
        "active_event_count": len(active),
        "event_type_counts": counts,
        "stable_identity": stable_identity,
        "current_preference": current_preference,
        "development_frontier": development_frontier,
        "rejected_direction": rejected_direction,
        "rejection_history": rejection_history,
        "revoked_event_ids": sorted(revoked),
        "frequency_used_as_quality": False,
        "named_author_target_used": False,
        "history_digest": _history_digest(events),
    }
