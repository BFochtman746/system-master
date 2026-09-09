"""STEP-002 provenance-bound materialization for canonical narrative state.

The materializer accepts already-extracted candidate observations from an authorized live
source boundary. It does not read or retain manuscript text and it does not perform LLM
inference itself. Confidence gates are admission safeguards, not literary quality scores.
"""

from collections import defaultdict

from narrative_state import (
    CLAIM_STATUSES,
    CLAIM_TYPES,
    ENTITY_TYPES,
    validate_state,
)

FORBIDDEN_TEXT_KEYS = {"raw_text", "quoted_text", "manuscript_text", "source_text", "passage_text"}
SUPPORT_STATUSES = {"VERIFIED", "OBSERVED", "INFERRED", "CONTESTED"}
ENTITY_MIN_CONFIDENCE = 0.50
EVENT_MIN_CONFIDENCE = 0.50
ASSERTED_MIN_CONFIDENCE = 0.80
INFERRED_ASSERTED_MIN_CONFIDENCE = 0.90
ALTERNATIVE_MIN_CONFIDENCE = 0.35


def _forbidden_paths(value, path="$", out=None):
    out = out if out is not None else []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if str(key).lower() in FORBIDDEN_TEXT_KEYS and child not in (None, ""):
                out.append(child_path)
            _forbidden_paths(child, child_path, out)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            _forbidden_paths(child, f"{path}[{i}]", out)
    return out


def _confidence(value):
    if isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if 0.0 <= f <= 1.0 else None


def _list_strings(value):
    return isinstance(value, list) and all(isinstance(x, str) and x for x in value)


def _source_matches(candidate, source_sha256):
    bound = candidate.get("source_sha256")
    return bound in (None, "", source_sha256)


def _candidate_base(candidate, source_sha256, valid_anchor_ids, minimum):
    reasons = []
    if not isinstance(candidate, dict):
        return ["CANDIDATE_NOT_OBJECT"]
    if not _source_matches(candidate, source_sha256):
        reasons.append("SOURCE_BINDING_MISMATCH")
    support = candidate.get("support_status")
    if support not in SUPPORT_STATUSES:
        reasons.append("SUPPORT_STATUS_INVALID")
    conf = _confidence(candidate.get("confidence"))
    if conf is None:
        reasons.append("CONFIDENCE_INVALID")
    elif conf < minimum:
        reasons.append("CONFIDENCE_BELOW_ADMISSION_FLOOR")
    refs = candidate.get("anchor_ids") or candidate.get("provenance_anchor_ids")
    if not _list_strings(refs) or not refs:
        reasons.append("PROVENANCE_ANCHOR_REQUIRED")
    elif any(ref not in valid_anchor_ids for ref in refs):
        reasons.append("DANGLING_PROVENANCE_ANCHOR")
    return reasons


def _reject(receipt, kind, candidate_id, reasons):
    receipt["rejected_counts"][kind] += 1
    receipt["rejections"].append({
        "kind": kind,
        "candidate_id": candidate_id,
        "reasons": sorted(set(reasons)),
    })


def _merge_entities(candidates, source_sha256, anchor_ids, receipt):
    groups = defaultdict(list)
    for i, candidate in enumerate(candidates):
        cid = candidate.get("entity_id") if isinstance(candidate, dict) else None
        groups[cid or f"__MISSING_ENTITY_{i}"].append(candidate)

    admitted = []
    for key, group in groups.items():
        reasons = []
        if key.startswith("__MISSING_ENTITY_"):
            reasons.append("ENTITY_ID_REQUIRED")
        for c in group:
            reasons.extend(_candidate_base(c, source_sha256, anchor_ids, ENTITY_MIN_CONFIDENCE))
            if isinstance(c, dict) and c.get("entity_type") not in ENTITY_TYPES:
                reasons.append("ENTITY_TYPE_INVALID")
        types = {c.get("entity_type") for c in group if isinstance(c, dict)}
        if len(types) > 1:
            reasons.append("ENTITY_IDENTITY_CONFLICT")
        if reasons:
            _reject(receipt, "entities", None if key.startswith("__MISSING_") else key, reasons)
            continue
        anchors = sorted({a for c in group for a in c.get("anchor_ids", [])})
        tags = sorted({str(t) for c in group for t in (c.get("tags") or []) if isinstance(t, str) and t})
        admitted.append({
            "entity_id": key,
            "entity_type": next(iter(types)),
            "anchor_ids": anchors,
            **({"tags": tags} if tags else {}),
        })
    return admitted


def _merge_events(candidates, source_sha256, anchor_ids, admitted_entity_ids, receipt):
    groups = defaultdict(list)
    for i, candidate in enumerate(candidates):
        cid = candidate.get("event_id") if isinstance(candidate, dict) else None
        groups[cid or f"__MISSING_EVENT_{i}"].append(candidate)

    admitted = []
    for key, group in groups.items():
        reasons = []
        if key.startswith("__MISSING_EVENT_"):
            reasons.append("EVENT_ID_REQUIRED")
        for c in group:
            reasons.extend(_candidate_base(c, source_sha256, anchor_ids, EVENT_MIN_CONFIDENCE))
            if isinstance(c, dict):
                participants = c.get("participant_entity_ids")
                if not isinstance(participants, list):
                    reasons.append("EVENT_PARTICIPANTS_NOT_LIST")
                elif any(p not in admitted_entity_ids for p in participants):
                    reasons.append("EVENT_DANGLING_ENTITY")
        participant_sets = {
            tuple(sorted(c.get("participant_entity_ids") or []))
            for c in group if isinstance(c, dict)
        }
        families = {c.get("event_family_id") for c in group if isinstance(c, dict) and c.get("event_family_id")}
        if len(participant_sets) > 1 or len(families) > 1:
            reasons.append("EVENT_IDENTITY_CONFLICT")
        if reasons:
            _reject(receipt, "events", None if key.startswith("__MISSING_") else key, reasons)
            continue
        anchors = sorted({a for c in group for a in c.get("anchor_ids", [])})
        tags = sorted({str(t) for c in group for t in (c.get("state_change_tags") or []) if isinstance(t, str) and t})
        goals = sorted({str(t) for c in group for t in (c.get("goal_tags") or []) if isinstance(t, str) and t})
        out = {
            "event_id": key,
            "anchor_ids": anchors,
            "participant_entity_ids": list(next(iter(participant_sets))) if participant_sets else [],
        }
        if families:
            out["event_family_id"] = next(iter(families))
        if tags:
            out["state_change_tags"] = tags
        if goals:
            out["goal_tags"] = goals
        admitted.append(out)
    return admitted


def _claim_admission_reasons(candidate, source_sha256, anchor_ids, node_ids):
    reasons = []
    if not isinstance(candidate, dict):
        return ["CANDIDATE_NOT_OBJECT"]
    if not _source_matches(candidate, source_sha256):
        reasons.append("SOURCE_BINDING_MISMATCH")
    ctype = candidate.get("claim_type")
    status = candidate.get("status")
    support = candidate.get("support_status")
    conf = _confidence(candidate.get("confidence"))
    families = candidate.get("evidence_families") or []
    provenance = candidate.get("provenance_anchor_ids")

    if ctype not in CLAIM_TYPES:
        reasons.append("CLAIM_TYPE_INVALID")
    if status not in CLAIM_STATUSES:
        reasons.append("CLAIM_STATUS_INVALID")
    if support not in SUPPORT_STATUSES:
        reasons.append("SUPPORT_STATUS_INVALID")
    if conf is None:
        reasons.append("CONFIDENCE_INVALID")
    if not _list_strings(provenance) or not provenance:
        reasons.append("PROVENANCE_ANCHOR_REQUIRED")
    elif any(ref not in anchor_ids for ref in provenance):
        reasons.append("DANGLING_PROVENANCE_ANCHOR")
    if candidate.get("subject_id") not in node_ids:
        reasons.append("DANGLING_SUBJECT")
    if candidate.get("object_id") not in node_ids:
        reasons.append("DANGLING_OBJECT")
    if not isinstance(families, list) or any(not isinstance(x, str) or not x for x in families):
        reasons.append("EVIDENCE_FAMILIES_INVALID")
        families = []

    if conf is not None and status == "ASSERTED":
        if support == "CONTESTED":
            reasons.append("CONTESTED_CANNOT_ASSERT")
        elif support in {"VERIFIED", "OBSERVED"} and conf < ASSERTED_MIN_CONFIDENCE:
            reasons.append("ASSERTED_CONFIDENCE_BELOW_FLOOR")
        elif support == "INFERRED":
            if conf < INFERRED_ASSERTED_MIN_CONFIDENCE:
                reasons.append("INFERRED_ASSERTED_CONFIDENCE_BELOW_FLOOR")
            if len(set(families)) < 2:
                reasons.append("INFERRED_ASSERTED_REQUIRES_TWO_EVIDENCE_FAMILIES")
    elif conf is not None and status == "ALTERNATIVE" and conf < ALTERNATIVE_MIN_CONFIDENCE:
        reasons.append("ALTERNATIVE_CONFIDENCE_BELOW_FLOOR")
    # UNRESOLVED and INVALIDATED intentionally have no minimum confidence floor.
    return reasons


def _merge_claims(candidates, source_sha256, anchor_ids, node_ids, receipt):
    groups = defaultdict(list)
    for i, candidate in enumerate(candidates):
        cid = candidate.get("claim_id") if isinstance(candidate, dict) else None
        groups[cid or f"__MISSING_CLAIM_{i}"].append(candidate)

    admitted = []
    for key, group in groups.items():
        reasons = []
        if key.startswith("__MISSING_CLAIM_"):
            reasons.append("CLAIM_ID_REQUIRED")
        for c in group:
            reasons.extend(_claim_admission_reasons(c, source_sha256, anchor_ids, node_ids))
        cores = {
            (c.get("claim_type"), c.get("subject_id"), c.get("object_id"), c.get("status"))
            for c in group if isinstance(c, dict)
        }
        if len(cores) > 1:
            reasons.append("CLAIM_IDENTITY_CONFLICT")
        if reasons:
            _reject(receipt, "claims", None if key.startswith("__MISSING_") else key, reasons)
            continue
        core = next(iter(cores))
        confidences = [_confidence(c.get("confidence")) for c in group]
        provenance = sorted({a for c in group for a in c.get("provenance_anchor_ids", [])})
        families = sorted({f for c in group for f in (c.get("evidence_families") or [])})
        conflict_groups = {c.get("conflict_group_id") for c in group if c.get("conflict_group_id")}
        if len(conflict_groups) > 1:
            _reject(receipt, "claims", key, ["CLAIM_CONFLICT_GROUP_MISMATCH"])
            continue
        out = {
            "claim_id": key,
            "claim_type": core[0],
            "subject_id": core[1],
            "object_id": core[2],
            "status": core[3],
            "confidence": max(c for c in confidences if c is not None),
            "provenance_anchor_ids": provenance,
        }
        if families:
            out["evidence_families"] = families
        if conflict_groups:
            out["conflict_group_id"] = next(iter(conflict_groups))
        admitted.append(out)
    return admitted


def materialize(request):
    receipt = {
        "materializer_version": 1,
        "source_sha256": request.get("source_sha256") if isinstance(request, dict) else None,
        "input_counts": {"anchors": 0, "entities": 0, "events": 0, "claims": 0},
        "admitted_counts": {"entities": 0, "events": 0, "claims": 0},
        "rejected_counts": {"entities": 0, "events": 0, "claims": 0},
        "rejections": [],
        "state_valid": False,
        "raw_manuscript_text_persisted": False,
    }
    if not isinstance(request, dict):
        receipt["rejections"].append({"kind": "request", "candidate_id": None, "reasons": ["REQUEST_NOT_OBJECT"]})
        return {"standing": "FAIL", "state": None, "receipt": receipt}

    forbidden = _forbidden_paths(request)
    if forbidden:
        receipt["rejections"].append({"kind": "request", "candidate_id": None, "reasons": ["FORBIDDEN_MANUSCRIPT_TEXT_INPUT"]})
        receipt["forbidden_input_paths"] = forbidden
        return {"standing": "FAIL", "state": None, "receipt": receipt}

    document_id = request.get("document_id")
    source_sha256 = request.get("source_sha256")
    anchors = request.get("anchors") or []
    entity_candidates = request.get("entity_candidates") or []
    event_candidates = request.get("event_candidates") or []
    claim_candidates = request.get("claim_candidates") or []
    receipt["input_counts"] = {
        "anchors": len(anchors) if isinstance(anchors, list) else 0,
        "entities": len(entity_candidates) if isinstance(entity_candidates, list) else 0,
        "events": len(event_candidates) if isinstance(event_candidates, list) else 0,
        "claims": len(claim_candidates) if isinstance(claim_candidates, list) else 0,
    }

    if not all(isinstance(x, list) for x in [anchors, entity_candidates, event_candidates, claim_candidates]):
        receipt["rejections"].append({"kind": "request", "candidate_id": None, "reasons": ["CANDIDATE_COLLECTION_NOT_LIST"]})
        return {"standing": "FAIL", "state": None, "receipt": receipt}

    # Validate anchor/source structure before using any candidate evidence. A sparse state
    # is allowed so this check cannot invent events just to make the state look complete.
    anchor_probe = {
        "state_version": 1,
        "document_id": document_id,
        "source_sha256": source_sha256,
        "anchors": anchors,
        "entities": [],
        "events": [],
        "claims": [],
    }
    anchor_validation = validate_state(anchor_probe)
    anchor_errors = [e for e in anchor_validation["errors"] if e.startswith("ANCHOR_") or e.startswith("SOURCE_") or e.startswith("DOCUMENT_") or e.startswith("MISSING_TOP_LEVEL") or e.startswith("FORBIDDEN_")]
    if anchor_errors:
        receipt["rejections"].append({"kind": "request", "candidate_id": None, "reasons": anchor_errors})
        return {"standing": "FAIL", "state": None, "receipt": receipt}

    anchor_ids = {a["anchor_id"] for a in anchors}
    entities = _merge_entities(entity_candidates, source_sha256, anchor_ids, receipt)
    entity_ids = {x["entity_id"] for x in entities}
    events = _merge_events(event_candidates, source_sha256, anchor_ids, entity_ids, receipt)
    event_ids = {x["event_id"] for x in events}
    claims = _merge_claims(claim_candidates, source_sha256, anchor_ids, entity_ids | event_ids, receipt)

    state = {
        "state_version": 1,
        "document_id": document_id,
        "source_sha256": source_sha256,
        "anchors": anchors,
        "entities": entities,
        "events": events,
        "claims": claims,
    }
    validation = validate_state(state)
    receipt["admitted_counts"] = {
        "entities": len(entities),
        "events": len(events),
        "claims": len(claims),
    }
    receipt["state_valid"] = validation["valid"]
    receipt["state_validation_errors"] = validation["errors"]
    receipt["state_validation_warnings"] = validation["warnings"]
    receipt["raw_manuscript_text_persisted"] = bool(validation.get("raw_manuscript_text_present"))

    standing = "PASS" if validation["valid"] and not receipt["raw_manuscript_text_persisted"] else "FAIL"
    return {"standing": standing, "state": state if standing == "PASS" else None, "receipt": receipt}
