"""Validator for BOOK-INTELLIGENCE-NARRATIVE-ORCHESTRATION-001.

This layer describes long-range narrative organization over canonical narrative-state IDs.
It validates representation/provenance only; it never decides that a plot structure is
literarily correct, complete, or preferable.
"""

from pathlib import Path
import sys

NARRATIVE_STATE_DIR = Path(__file__).resolve().parents[1] / "narrative-state-001"
if str(NARRATIVE_STATE_DIR) not in sys.path:
    sys.path.insert(0, str(NARRATIVE_STATE_DIR))

from narrative_state import validate_state  # noqa: E402

FUNCTION_TYPES = {
    "ORIENTATION", "SETUP", "INCITING_CHANGE", "COMPLICATION", "DECISION",
    "REVERSAL", "REVELATION", "ESCALATION", "CLIMAX", "PAYOFF", "RESOLUTION",
    "TRANSITION", "CALLBACK", "FORESHADOW", "OTHER",
}
FUNCTION_STATUSES = {"ASSERTED", "ALTERNATIVE", "UNRESOLVED", "INVALIDATED"}
LINK_STATUSES = {"OPEN", "PARTIAL", "PAID_OFF", "INTENTIONALLY_UNRESOLVED", "INVALIDATED"}
QUESTION_STATUSES = {"OPEN", "PARTIAL", "CLOSED", "INTENTIONALLY_UNRESOLVED", "INVALIDATED"}
ARC_TYPES = {"CHARACTER", "RELATIONSHIP", "PLOT", "MOTIF", "IDEA", "OTHER"}
ARC_STATUSES = {"ACTIVE", "CLOSED", "INTENTIONALLY_OPEN", "INVALIDATED"}
BEAT_ROLES = {"INTRODUCE", "DEVELOP", "COMPLICATE", "REVERSE", "TRANSFORM", "CALLBACK", "PAYOFF", "CLOSE", "REOPEN", "OTHER"}
FORBIDDEN_TEXT_KEYS = {"raw_text", "quoted_text", "manuscript_text", "source_text", "passage_text", "revision_text"}


def _confidence(value):
    if isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if 0.0 <= f <= 1.0 else None


def _forbidden(value, path="$", out=None):
    out = out if out is not None else []
    if isinstance(value, dict):
        for key, child in value.items():
            p = f"{path}.{key}"
            if str(key).lower() in FORBIDDEN_TEXT_KEYS and child not in (None, ""):
                out.append(p)
            _forbidden(child, p, out)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            _forbidden(child, f"{path}[{i}]", out)
    return out


def _index(items, id_key, label, errors):
    out = {}
    if not isinstance(items, list):
        errors.append(f"{label}_NOT_LIST")
        return out
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}_ITEM_NOT_OBJECT:{i}")
            continue
        item_id = item.get(id_key)
        if not isinstance(item_id, str) or not item_id:
            errors.append(f"{label}_ID_REQUIRED:{i}")
            continue
        if item_id in out:
            errors.append(f"{label}_DUPLICATE_ID:{item_id}")
            continue
        out[item_id] = item
    return out


def _refs(value, allowed, label, owner_id, errors, require_nonempty=False):
    if not isinstance(value, list) or any(not isinstance(x, str) or not x for x in value):
        errors.append(f"{label}_NOT_STRING_LIST:{owner_id}")
        return []
    if require_nonempty and not value:
        errors.append(f"{label}_REQUIRED:{owner_id}")
    for ref in value:
        if ref not in allowed:
            errors.append(f"{label}_DANGLING:{owner_id}:{ref}")
    return value


def validate_orchestration(narrative_state, orchestration):
    errors = []
    warnings = []
    narrative_validation = validate_state(narrative_state)
    if not narrative_validation["valid"]:
        errors.append("NARRATIVE_STATE_INVALID")
        errors.extend(f"UPSTREAM:{e}" for e in narrative_validation["errors"])

    if not isinstance(orchestration, dict):
        return {"valid": False, "errors": sorted(set(errors + ["ORCHESTRATION_NOT_OBJECT"])), "warnings": warnings}

    forbidden = _forbidden(orchestration)
    errors.extend(f"FORBIDDEN_MANUSCRIPT_TEXT:{p}" for p in forbidden)

    required = ["orchestration_version", "document_id", "narrative_state_source_sha256", "function_assignments", "setup_payoff_links", "open_questions", "arcs"]
    for key in required:
        if key not in orchestration:
            errors.append(f"MISSING_TOP_LEVEL:{key}")
    if orchestration.get("orchestration_version") != 1:
        errors.append("ORCHESTRATION_VERSION_MUST_BE_1")
    if orchestration.get("document_id") != narrative_state.get("document_id"):
        errors.append("DOCUMENT_BINDING_MISMATCH")
    if orchestration.get("narrative_state_source_sha256") != narrative_state.get("source_sha256"):
        errors.append("SOURCE_BINDING_MISMATCH")

    entity_ids = {x.get("entity_id") for x in narrative_state.get("entities", []) if isinstance(x, dict)}
    event_ids = {x.get("event_id") for x in narrative_state.get("events", []) if isinstance(x, dict)}
    claim_ids = {x.get("claim_id") for x in narrative_state.get("claims", []) if isinstance(x, dict)}
    node_ids = entity_ids | event_ids

    functions = _index(orchestration.get("function_assignments", []), "assignment_id", "FUNCTION", errors)
    links = _index(orchestration.get("setup_payoff_links", []), "link_id", "SETUP_PAYOFF", errors)
    questions = _index(orchestration.get("open_questions", []), "question_id", "QUESTION", errors)
    arcs = _index(orchestration.get("arcs", []), "arc_id", "ARC", errors)

    for assignment_id, item in functions.items():
        if item.get("event_id") not in event_ids:
            errors.append(f"FUNCTION_DANGLING_EVENT:{assignment_id}:{item.get('event_id')}")
        if item.get("function_type") not in FUNCTION_TYPES:
            errors.append(f"FUNCTION_TYPE_INVALID:{assignment_id}")
        if item.get("status") not in FUNCTION_STATUSES:
            errors.append(f"FUNCTION_STATUS_INVALID:{assignment_id}")
        if _confidence(item.get("confidence")) is None:
            errors.append(f"FUNCTION_CONFIDENCE_INVALID:{assignment_id}")
        _refs(item.get("provenance_claim_ids"), claim_ids, "FUNCTION_PROVENANCE", assignment_id, errors)

    for link_id, item in links.items():
        setup = _refs(item.get("setup_event_ids"), event_ids, "SETUP_EVENTS", link_id, errors, require_nonempty=True)
        payoff = _refs(item.get("payoff_event_ids"), event_ids, "PAYOFF_EVENTS", link_id, errors)
        status = item.get("status")
        if status not in LINK_STATUSES:
            errors.append(f"SETUP_PAYOFF_STATUS_INVALID:{link_id}")
        if _confidence(item.get("confidence")) is None:
            errors.append(f"SETUP_PAYOFF_CONFIDENCE_INVALID:{link_id}")
        _refs(item.get("provenance_claim_ids"), claim_ids, "SETUP_PAYOFF_PROVENANCE", link_id, errors)
        if set(setup).intersection(payoff):
            errors.append(f"SETUP_PAYOFF_SELF_LINK:{link_id}")
        if status == "PAID_OFF" and not payoff:
            errors.append(f"PAID_OFF_REQUIRES_PAYOFF_EVENT:{link_id}")
        if status == "OPEN" and payoff:
            warnings.append(f"OPEN_LINK_HAS_PROSPECTIVE_PAYOFF_REFERENCE:{link_id}")

    for question_id, item in questions.items():
        introduced = _refs(item.get("introduced_event_ids"), event_ids, "QUESTION_INTRO_EVENTS", question_id, errors, require_nonempty=True)
        resolved = _refs(item.get("resolution_event_ids", []), event_ids, "QUESTION_RESOLUTION_EVENTS", question_id, errors)
        _refs(item.get("reopened_event_ids", []), event_ids, "QUESTION_REOPENED_EVENTS", question_id, errors)
        status = item.get("status")
        if status not in QUESTION_STATUSES:
            errors.append(f"QUESTION_STATUS_INVALID:{question_id}")
        if _confidence(item.get("confidence")) is None:
            errors.append(f"QUESTION_CONFIDENCE_INVALID:{question_id}")
        _refs(item.get("provenance_claim_ids"), claim_ids, "QUESTION_PROVENANCE", question_id, errors)
        if status == "CLOSED" and not resolved:
            errors.append(f"CLOSED_QUESTION_REQUIRES_RESOLUTION_EVENT:{question_id}")
        if set(introduced).intersection(resolved):
            warnings.append(f"QUESTION_INTRO_AND_RESOLUTION_SHARE_EVENT:{question_id}")

    seen_beat_ids = set()
    for arc_id, item in arcs.items():
        if item.get("arc_type") not in ARC_TYPES:
            errors.append(f"ARC_TYPE_INVALID:{arc_id}")
        if item.get("status") not in ARC_STATUSES:
            errors.append(f"ARC_STATUS_INVALID:{arc_id}")
        _refs(item.get("subject_ids"), node_ids, "ARC_SUBJECTS", arc_id, errors, require_nonempty=True)
        beats = item.get("beats")
        if not isinstance(beats, list):
            errors.append(f"ARC_BEATS_NOT_LIST:{arc_id}")
            continue
        for i, beat in enumerate(beats):
            if not isinstance(beat, dict):
                errors.append(f"ARC_BEAT_NOT_OBJECT:{arc_id}:{i}")
                continue
            beat_id = beat.get("beat_id")
            if not isinstance(beat_id, str) or not beat_id:
                errors.append(f"ARC_BEAT_ID_REQUIRED:{arc_id}:{i}")
            elif beat_id in seen_beat_ids:
                errors.append(f"ARC_BEAT_DUPLICATE_ID:{beat_id}")
            else:
                seen_beat_ids.add(beat_id)
            if beat.get("role") not in BEAT_ROLES:
                errors.append(f"ARC_BEAT_ROLE_INVALID:{arc_id}:{beat_id or i}")
            _refs(beat.get("event_ids"), event_ids, "ARC_BEAT_EVENTS", beat_id or f"{arc_id}:{i}", errors, require_nonempty=True)
            if _confidence(beat.get("confidence")) is None:
                errors.append(f"ARC_BEAT_CONFIDENCE_INVALID:{arc_id}:{beat_id or i}")
            status = beat.get("status", "ASSERTED")
            if status not in FUNCTION_STATUSES:
                errors.append(f"ARC_BEAT_STATUS_INVALID:{arc_id}:{beat_id or i}")
            _refs(beat.get("provenance_claim_ids", []), claim_ids, "ARC_BEAT_PROVENANCE", beat_id or f"{arc_id}:{i}", errors)

    if not functions:
        warnings.append("NO_FUNCTION_ASSIGNMENTS")
    if not links:
        warnings.append("NO_SETUP_PAYOFF_LINKS")
    if not questions:
        warnings.append("NO_OPEN_QUESTIONS")
    if not arcs:
        warnings.append("NO_ARCS")

    return {
        "valid": not errors,
        "errors": sorted(set(errors)),
        "warnings": sorted(set(warnings)),
        "counts": {
            "function_assignments": len(functions),
            "setup_payoff_links": len(links),
            "open_questions": len(questions),
            "arcs": len(arcs),
            "arc_beats": len(seen_beat_ids),
        },
        "universal_plot_template_enforced": False,
        "literary_quality_score_emitted": False,
        "manuscript_text_persisted": bool(forbidden),
    }


def invalidation_candidates(orchestration, changed_event_ids=None, changed_entity_ids=None, changed_claim_ids=None):
    changed_events = set(changed_event_ids or [])
    changed_entities = set(changed_entity_ids or [])
    changed_claims = set(changed_claim_ids or [])
    functions, links, questions, arcs = [], [], [], []

    for item in orchestration.get("function_assignments", []) if isinstance(orchestration, dict) else []:
        if item.get("event_id") in changed_events or changed_claims.intersection(item.get("provenance_claim_ids") or []):
            functions.append(item.get("assignment_id"))
    for item in orchestration.get("setup_payoff_links", []) if isinstance(orchestration, dict) else []:
        if changed_events.intersection((item.get("setup_event_ids") or []) + (item.get("payoff_event_ids") or [])) or changed_claims.intersection(item.get("provenance_claim_ids") or []):
            links.append(item.get("link_id"))
    for item in orchestration.get("open_questions", []) if isinstance(orchestration, dict) else []:
        event_refs = (item.get("introduced_event_ids") or []) + (item.get("resolution_event_ids") or []) + (item.get("reopened_event_ids") or [])
        if changed_events.intersection(event_refs) or changed_claims.intersection(item.get("provenance_claim_ids") or []):
            questions.append(item.get("question_id"))
    for item in orchestration.get("arcs", []) if isinstance(orchestration, dict) else []:
        beat_events = {e for beat in (item.get("beats") or []) if isinstance(beat, dict) for e in (beat.get("event_ids") or [])}
        beat_claims = {c for beat in (item.get("beats") or []) if isinstance(beat, dict) for c in (beat.get("provenance_claim_ids") or [])}
        if changed_entities.intersection(item.get("subject_ids") or []) or changed_events.intersection(set(item.get("subject_ids") or []) | beat_events) or changed_claims.intersection(beat_claims):
            arcs.append(item.get("arc_id"))

    return {
        "function_assignment_ids": sorted(x for x in functions if x),
        "setup_payoff_link_ids": sorted(x for x in links if x),
        "open_question_ids": sorted(x for x in questions if x),
        "arc_ids": sorted(x for x in arcs if x),
    }
