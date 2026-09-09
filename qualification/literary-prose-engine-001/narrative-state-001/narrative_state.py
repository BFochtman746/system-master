"""Fail-closed validator for BOOK-INTELLIGENCE-NARRATIVE-STATE-001.

The state is deliberately nonreconstructive: it stores anchors/digests and narrative
claims, never manuscript text. It validates representation integrity only; it does not
infer literary facts, repair chronology, or revise prose.
"""

import re

SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")
ENTITY_TYPES = {"CHARACTER", "PLACE", "OBJECT", "GROUP", "ABSTRACT", "OTHER"}
CLAIM_TYPES = {
    "STORY_TIME_BEFORE", "STORY_TIME_AFTER", "STORY_TIME_OVERLAPS", "SAME_STORY_EVENT",
    "CAUSES", "ENABLES", "PREVENTS", "GOAL_SUPPORTS", "KNOWS", "BELIEVES", "PERCEIVES",
    "FOCALIZES", "DISCOURSE_PRECEDES",
}
CLAIM_STATUSES = {"ASSERTED", "ALTERNATIVE", "UNRESOLVED", "INVALIDATED"}
FORBIDDEN_TEXT_KEYS = {"raw_text", "quoted_text", "manuscript_text", "source_text", "passage_text"}


def _is_sha256(value):
    return isinstance(value, str) and bool(SHA256.fullmatch(value))


def _scan_forbidden_text(value, path="$", errors=None):
    errors = errors if errors is not None else []
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in FORBIDDEN_TEXT_KEYS and child not in (None, ""):
                errors.append(f"FORBIDDEN_MANUSCRIPT_TEXT:{path}.{key}")
            _scan_forbidden_text(child, f"{path}.{key}", errors)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            _scan_forbidden_text(child, f"{path}[{i}]", errors)
    return errors


def _unique_index(items, id_key, label, errors):
    index = {}
    if not isinstance(items, list):
        errors.append(f"{label}_NOT_LIST")
        return index
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}_ITEM_NOT_OBJECT:{i}")
            continue
        item_id = item.get(id_key)
        if not isinstance(item_id, str) or not item_id:
            errors.append(f"{label}_MISSING_ID:{i}")
            continue
        if item_id in index:
            errors.append(f"{label}_DUPLICATE_ID:{item_id}")
            continue
        index[item_id] = item
    return index


def validate_state(state):
    errors = []
    warnings = []
    if not isinstance(state, dict):
        return {"valid": False, "errors": ["STATE_NOT_OBJECT"], "warnings": []}

    errors.extend(_scan_forbidden_text(state))
    required = ["state_version", "document_id", "source_sha256", "anchors", "entities", "events", "claims"]
    for key in required:
        if key not in state:
            errors.append(f"MISSING_TOP_LEVEL:{key}")

    if state.get("state_version") != 1:
        errors.append("STATE_VERSION_MUST_BE_1")
    if not isinstance(state.get("document_id"), str) or not state.get("document_id"):
        errors.append("DOCUMENT_ID_INVALID")
    if not _is_sha256(state.get("source_sha256")):
        errors.append("SOURCE_SHA256_INVALID")

    anchors = _unique_index(state.get("anchors", []), "anchor_id", "ANCHOR", errors)
    entities = _unique_index(state.get("entities", []), "entity_id", "ENTITY", errors)
    events = _unique_index(state.get("events", []), "event_id", "EVENT", errors)
    claims = _unique_index(state.get("claims", []), "claim_id", "CLAIM", errors)

    for anchor_id, anchor in anchors.items():
        if not isinstance(anchor.get("chapter_id"), str) or not anchor.get("chapter_id"):
            errors.append(f"ANCHOR_CHAPTER_INVALID:{anchor_id}")
        if not isinstance(anchor.get("ordinal"), int) or anchor.get("ordinal") < 0:
            errors.append(f"ANCHOR_ORDINAL_INVALID:{anchor_id}")
        if not _is_sha256(anchor.get("span_sha256")):
            errors.append(f"ANCHOR_SPAN_SHA256_INVALID:{anchor_id}")
        start = anchor.get("token_start")
        end = anchor.get("token_end")
        if start is not None or end is not None:
            if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start:
                errors.append(f"ANCHOR_TOKEN_RANGE_INVALID:{anchor_id}")

    for entity_id, entity in entities.items():
        if entity.get("entity_type") not in ENTITY_TYPES:
            errors.append(f"ENTITY_TYPE_INVALID:{entity_id}")
        refs = entity.get("anchor_ids")
        if not isinstance(refs, list) or not refs:
            errors.append(f"ENTITY_ANCHORS_REQUIRED:{entity_id}")
        else:
            for ref in refs:
                if ref not in anchors:
                    errors.append(f"ENTITY_DANGLING_ANCHOR:{entity_id}:{ref}")

    for event_id, event in events.items():
        refs = event.get("anchor_ids")
        if not isinstance(refs, list) or not refs:
            errors.append(f"EVENT_ANCHORS_REQUIRED:{event_id}")
        else:
            for ref in refs:
                if ref not in anchors:
                    errors.append(f"EVENT_DANGLING_ANCHOR:{event_id}:{ref}")
        participants = event.get("participant_entity_ids")
        if not isinstance(participants, list):
            errors.append(f"EVENT_PARTICIPANTS_NOT_LIST:{event_id}")
        else:
            for ref in participants:
                if ref not in entities:
                    errors.append(f"EVENT_DANGLING_ENTITY:{event_id}:{ref}")

    node_ids = set(entities) | set(events)
    asserted_before = set()
    for claim_id, claim in claims.items():
        ctype = claim.get("claim_type")
        status = claim.get("status")
        if ctype not in CLAIM_TYPES:
            errors.append(f"CLAIM_TYPE_INVALID:{claim_id}")
        if status not in CLAIM_STATUSES:
            errors.append(f"CLAIM_STATUS_INVALID:{claim_id}")
        confidence = claim.get("confidence")
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0.0 <= float(confidence) <= 1.0:
            errors.append(f"CLAIM_CONFIDENCE_INVALID:{claim_id}")
        subject = claim.get("subject_id")
        obj = claim.get("object_id")
        if subject not in node_ids:
            errors.append(f"CLAIM_DANGLING_SUBJECT:{claim_id}:{subject}")
        if obj not in node_ids:
            errors.append(f"CLAIM_DANGLING_OBJECT:{claim_id}:{obj}")
        provenance = claim.get("provenance_anchor_ids")
        if not isinstance(provenance, list) or not provenance:
            errors.append(f"CLAIM_PROVENANCE_REQUIRED:{claim_id}")
        else:
            for ref in provenance:
                if ref not in anchors:
                    errors.append(f"CLAIM_DANGLING_PROVENANCE:{claim_id}:{ref}")

        # Normalize asserted BEFORE/AFTER into a single directed relation. Alternative,
        # unresolved and invalidated chronology is intentionally not forced into one order.
        if status == "ASSERTED" and subject in events and obj in events:
            if ctype == "STORY_TIME_BEFORE":
                asserted_before.add((subject, obj, claim_id))
            elif ctype == "STORY_TIME_AFTER":
                asserted_before.add((obj, subject, claim_id))

    directions = {}
    for before, after, claim_id in asserted_before:
        key = (before, after)
        directions.setdefault(key, []).append(claim_id)
    seen_pairs = set()
    for (before, after), ids in directions.items():
        if before == after:
            errors.append(f"TEMPORAL_SELF_ORDER:{before}:{','.join(ids)}")
            continue
        unordered = tuple(sorted((before, after)))
        if unordered in seen_pairs:
            continue
        seen_pairs.add(unordered)
        reverse = directions.get((after, before), [])
        if reverse:
            errors.append(
                f"CONTRADICTORY_ASSERTED_STORY_TIME:{before}:{after}:"
                f"{','.join(sorted(ids + reverse))}"
            )

    if not events:
        warnings.append("NO_EVENTS_MATERIALIZED")
    if not claims:
        warnings.append("NO_CLAIMS_MATERIALIZED")

    return {
        "valid": not errors,
        "errors": sorted(set(errors)),
        "warnings": sorted(set(warnings)),
        "counts": {
            "anchors": len(anchors),
            "entities": len(entities),
            "events": len(events),
            "claims": len(claims),
        },
        "raw_manuscript_text_present": any(e.startswith("FORBIDDEN_MANUSCRIPT_TEXT:") for e in errors),
    }


def invalidation_candidates(state, changed_anchor_ids):
    """Return only graph records directly dependent on changed anchors.

    This is deliberately conservative and local. Recursive downstream invalidation belongs
    to the later derived-artifact dependency layer, not this representation validator.
    """
    changed = set(changed_anchor_ids or [])
    entity_ids = []
    event_ids = []
    claim_ids = []
    for entity in state.get("entities", []) if isinstance(state, dict) else []:
        if changed.intersection(entity.get("anchor_ids") or []):
            entity_ids.append(entity.get("entity_id"))
    for event in state.get("events", []) if isinstance(state, dict) else []:
        if changed.intersection(event.get("anchor_ids") or []):
            event_ids.append(event.get("event_id"))
    for claim in state.get("claims", []) if isinstance(state, dict) else []:
        if changed.intersection(claim.get("provenance_anchor_ids") or []):
            claim_ids.append(claim.get("claim_id"))
    return {
        "changed_anchor_ids": sorted(changed),
        "entity_ids": sorted(x for x in entity_ids if x),
        "event_ids": sorted(x for x in event_ids if x),
        "claim_ids": sorted(x for x in claim_ids if x),
    }
