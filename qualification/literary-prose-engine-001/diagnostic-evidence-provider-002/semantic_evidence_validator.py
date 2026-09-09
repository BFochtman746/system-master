#!/usr/bin/env python3
"""Validate nonreconstructive semantic evidence packets for Prose Project diagnostics.

This is an authority boundary, not a semantic model. It accepts claims produced by a
model/human provider and normalizes only what is adequately anchored. Model hypotheses
never become author intent, canon, protected-language authority, or revision authority.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAP_PATH = HERE.parent / "unification-001" / "STEP-005-DIMENSION-AUTHORITY-MAP-v1.json"
with MAP_PATH.open("r", encoding="utf-8") as f:
    AUTHORITY_MAP = json.load(f)
PRIMARY = {dim: owner for owner, dims in AUTHORITY_MAP["authorities"].items() for dim in dims}

ALLOWED_PROVIDER_KINDS = {"MODEL", "HUMAN", "DETERMINISTIC"}
PASSAGE_FIELDS = {
    "scene_or_chapter_function", "pov", "focalization", "reader_state", "pacing_target",
    "information_release", "relationship_pressure", "project_voice", "book_voice",
    "authorial_intent", "canon_facts", "protected_language", "continuity"
}
TEXT_SIDE_OWNERS = set(AUTHORITY_MAP["authorities"]) - {"PACKET_013_READER_EXPERIENCE"}
PROHIBITED_KEYS = {"raw_text", "passage_text", "source_excerpt", "quote", "rewrite_text", "candidate_text", "prompt_payload", "embedding_payload"}


def _finite01(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 1


def _anchor_ok(anchor):
    if not isinstance(anchor, dict):
        return False
    digest = anchor.get("sha256")
    return isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest.lower()) and isinstance(anchor.get("locator_id"), str) and bool(anchor.get("locator_id"))


def _contains_prohibited(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in PROHIBITED_KEYS and v not in (None, False, "", [], {}):
                return k
            found = _contains_prohibited(v)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _contains_prohibited(v)
            if found:
                return found
    return None


def validate(packet):
    errors = []
    warnings = []
    normalized = {}
    if not isinstance(packet, dict):
        return {"standing": "REJECT", "errors": ["PACKET_OBJECT_REQUIRED"], "warnings": [], "normalized": None}
    prohibited = _contains_prohibited(packet)
    if prohibited:
        errors.append(f"PROHIBITED_RECONSTRUCTIVE_FIELD:{prohibited}")
    if packet.get("provider_kind") not in ALLOWED_PROVIDER_KINDS:
        errors.append("INVALID_PROVIDER_KIND")
    if not packet.get("provider_id"):
        errors.append("PROVIDER_ID_REQUIRED")
    digest = packet.get("passage_digest")
    if not (isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest.lower())):
        errors.append("PASSAGE_DIGEST_REQUIRED")
    if packet.get("named_author_target"):
        errors.append("NAMED_AUTHOR_TARGET_FORBIDDEN")
    if packet.get("revision_authorized"):
        errors.append("PROVIDER_CANNOT_AUTHORIZE_REVISION")
    if packet.get("universal_prose_score") is not None:
        errors.append("UNIVERSAL_PROSE_SCORE_FORBIDDEN")

    pclaims = []
    for i, raw in enumerate(packet.get("passage_state_claims") or []):
        if not isinstance(raw, dict):
            errors.append(f"PASSAGE_CLAIM_{i}_OBJECT_REQUIRED")
            continue
        field = raw.get("field")
        conf = raw.get("confidence")
        status = raw.get("authority_status")
        anchors = raw.get("evidence_anchors") or []
        if field not in PASSAGE_FIELDS:
            errors.append(f"PASSAGE_CLAIM_{i}_UNKNOWN_FIELD")
            continue
        if not _finite01(conf):
            errors.append(f"PASSAGE_CLAIM_{i}_CONFIDENCE_INVALID")
            continue
        if not anchors or not all(_anchor_ok(a) for a in anchors):
            errors.append(f"PASSAGE_CLAIM_{i}_ANCHOR_REQUIRED")
            continue
        provider_kind = packet.get("provider_kind")
        if field in {"authorial_intent", "protected_language"}:
            if status not in {"EXPLICIT_AUTHOR_AUTHORITY", "UNRESOLVED"}:
                errors.append(f"PASSAGE_CLAIM_{i}_{field.upper()}_AUTHORITY_FORBIDDEN")
                continue
            if status == "EXPLICIT_AUTHOR_AUTHORITY" and not raw.get("authority_ref"):
                errors.append(f"PASSAGE_CLAIM_{i}_AUTHORITY_REF_REQUIRED")
                continue
        elif field == "canon_facts":
            if status not in {"CANON_BOUND", "UNRESOLVED"}:
                errors.append(f"PASSAGE_CLAIM_{i}_CANON_AUTHORITY_FORBIDDEN")
                continue
            if status == "CANON_BOUND" and not raw.get("authority_ref"):
                errors.append(f"PASSAGE_CLAIM_{i}_AUTHORITY_REF_REQUIRED")
                continue
        else:
            if provider_kind == "MODEL" and status not in {"MODEL_HYPOTHESIS", "UNRESOLVED"}:
                errors.append(f"PASSAGE_CLAIM_{i}_MODEL_AUTHORITY_ESCALATION")
                continue
            if provider_kind == "HUMAN" and status not in {"HUMAN_OBSERVATION", "EXPLICIT_AUTHOR_AUTHORITY", "UNRESOLVED"}:
                errors.append(f"PASSAGE_CLAIM_{i}_HUMAN_STATUS_INVALID")
                continue
        disposition = "UNRESOLVED" if conf < 0.60 or status == "UNRESOLVED" else "ADMIT_HYPOTHESIS"
        pclaims.append({
            "claim_id": raw.get("claim_id") or f"PASSAGE-{i + 1}",
            "field": field,
            "value_code": raw.get("value_code"),
            "confidence": round(conf, 3),
            "authority_status": status,
            "authority_ref": raw.get("authority_ref"),
            "evidence_anchors": anchors,
            "alternatives": raw.get("alternatives") or [],
            "disposition": disposition
        })

    signals = []
    for i, raw in enumerate(packet.get("diagnostic_signals") or []):
        if not isinstance(raw, dict):
            errors.append(f"SIGNAL_{i}_OBJECT_REQUIRED")
            continue
        dim = raw.get("dimension")
        specialist = raw.get("specialist_id")
        conf = raw.get("confidence")
        anchors = raw.get("evidence_anchors") or []
        if dim not in PRIMARY:
            errors.append(f"SIGNAL_{i}_UNKNOWN_DIMENSION")
            continue
        owner = PRIMARY[dim]
        if owner not in TEXT_SIDE_OWNERS:
            errors.append(f"SIGNAL_{i}_READER_DIMENSION_REQUIRES_READER_PROVIDER")
            continue
        if specialist != owner:
            errors.append(f"SIGNAL_{i}_OWNER_MISMATCH:{owner}")
            continue
        if not _finite01(conf):
            errors.append(f"SIGNAL_{i}_CONFIDENCE_INVALID")
            continue
        if not anchors or not all(_anchor_ok(a) for a in anchors):
            errors.append(f"SIGNAL_{i}_ANCHOR_REQUIRED")
            continue
        if raw.get("finding_type") not in {None, "OBSERVATION", "HYPOTHESIS"}:
            errors.append(f"SIGNAL_{i}_DEFECT_ASSERTION_FORBIDDEN")
            continue
        if any(raw.get(k) for k in ["functional_harm_evidence", "purpose_miss_evidence", "objective_defect_evidence", "bounded_gain_evidence"]):
            errors.append(f"SIGNAL_{i}_PROVIDER_CANNOT_SELF_CERTIFY_GAIN_OR_HARM")
            continue
        signals.append({
            "evidence_id": raw.get("evidence_id") or f"SIGNAL-{i + 1}",
            "specialist_id": specialist,
            "dimension": dim,
            "finding_type": "OBSERVATION",
            "claim_code": raw.get("claim_code"),
            "confidence": round(conf, 3),
            "evidence_class": "MODEL_SEMANTIC_HYPOTHESIS" if packet.get("provider_kind") == "MODEL" else "HUMAN_SEMANTIC_OBSERVATION",
            "evidence_anchors": anchors,
            "alternatives": raw.get("alternatives") or [],
            "disposition": "UNRESOLVED" if conf < 0.60 else "ADMIT_OBSERVATION",
            "opportunity_id": None,
            "rewrite_text_present": False,
            "named_author_target": False
        })

    if not errors:
        normalized = {
            "provider_id": packet.get("provider_id"),
            "provider_kind": packet.get("provider_kind"),
            "source_id": packet.get("source_id"),
            "passage_digest": packet.get("passage_digest"),
            "passage_state_claims": pclaims,
            "diagnostic_signals": signals,
            "revision_authorized": False,
            "raw_text_present": False,
            "candidate_text_present": False,
            "universal_prose_score": False
        }
        if not pclaims and not signals:
            warnings.append("EMPTY_SEMANTIC_PACKET")
    return {"standing": "PASS" if not errors else "REJECT", "errors": errors, "warnings": warnings, "normalized": normalized if not errors else None}
