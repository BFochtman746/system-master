#!/usr/bin/env python3
"""Bridge validated semantic evidence into Passage Intelligence and Step-F diagnostics.

The adapter preserves the authority distinction between model/human hypotheses and
trusted author/canon/protected-language state. It can enable diagnosis, but it must not
make revision-ready state by laundering untrusted semantic hypotheses into authority.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


STEP_E = _load("passage_intelligence", ROOT / "step-e" / "passage_intelligence.py")
STEP_F = _load("unified_granular_diagnostics", ROOT / "step-f" / "unified_granular_diagnostics.py")
SPECIALISTS = _load("specialist_diagnostics", ROOT / "step-f" / "specialist_diagnostics.py")

MODEL_FIELDS = {
    "scene_or_chapter_function", "pov", "focalization", "reader_state", "pacing_target",
    "information_release", "relationship_pressure", "project_voice", "book_voice", "continuity"
}
TRUSTED_AUTHOR_FIELDS = {"authorial_intent", "protected_language"}
TRUSTED_CANON_FIELDS = {"canon_facts"}


def _best_claim(normalized_packet, field):
    claims = [
        c for c in normalized_packet.get("passage_state_claims", [])
        if c.get("field") == field and c.get("disposition") != "UNRESOLVED"
    ]
    if not claims:
        return None
    claims.sort(key=lambda c: (-float(c.get("confidence", 0.0)), str(c.get("claim_id") or "")))
    return claims[0]


def _trusted_claim_value(normalized_packet, field):
    claim = _best_claim(normalized_packet, field)
    if not claim:
        return None
    status = claim.get("authority_status")
    if field in TRUSTED_AUTHOR_FIELDS and status != "EXPLICIT_AUTHOR_AUTHORITY":
        return None
    if field in TRUSTED_CANON_FIELDS and status != "CANON_BOUND":
        return None
    return claim.get("value_code")


def _model_value(normalized_packet, field):
    claim = _best_claim(normalized_packet, field)
    if not claim or field not in MODEL_FIELDS:
        return None
    return claim.get("value_code")


def build_passage_state(normalized_packet, trusted_authority=None, requested_scope="SURGICAL"):
    if not isinstance(normalized_packet, dict):
        raise TypeError("normalized_packet must be dict")
    if normalized_packet.get("raw_text_present") or normalized_packet.get("candidate_text_present"):
        raise ValueError("RECONSTRUCTIVE_TEXT_NOT_ALLOWED")
    trusted_authority = dict(trusted_authority or {})

    authorial_intent = trusted_authority.get("authorial_intent") or _trusted_claim_value(normalized_packet, "authorial_intent")
    protected_language = trusted_authority.get("protected_language") or _trusted_claim_value(normalized_packet, "protected_language")
    canon_facts = trusted_authority.get("canon_facts") or _trusted_claim_value(normalized_packet, "canon_facts")

    state = {
        "source_id": normalized_packet.get("source_id"),
        "passage_digest": normalized_packet.get("passage_digest"),
        "purpose_state": {"scene_or_chapter_function": _model_value(normalized_packet, "scene_or_chapter_function")},
        "narrative_state": {
            "pov": _model_value(normalized_packet, "pov"),
            "focalization": _model_value(normalized_packet, "focalization"),
            "pacing_target": _model_value(normalized_packet, "pacing_target"),
            "information_release": _model_value(normalized_packet, "information_release")
        },
        "reader_state": _model_value(normalized_packet, "reader_state"),
        "character_state": {
            "relationship_pressure": _model_value(normalized_packet, "relationship_pressure"),
            "continuity_constraints": _model_value(normalized_packet, "continuity")
        },
        "voice_state": {
            "project_voice": _model_value(normalized_packet, "project_voice"),
            "book_voice": _model_value(normalized_packet, "book_voice"),
            "development_frontier_authorized": False
        },
        "preservation_state": {
            "authorial_intent": authorial_intent,
            "protected_language": protected_language,
            "canon_facts": canon_facts
        },
        "craft_state": {"current_strengths": [], "candidate_opportunities": []},
        "semantic_provider_authority": {
            "provider_id": normalized_packet.get("provider_id"),
            "provider_kind": normalized_packet.get("provider_kind"),
            "hypotheses_are_authority": False,
            "revision_authorized": False
        }
    }
    return STEP_E.construct_passage_state({"state": state, "requested_scope": requested_scope, "max_opportunities": 3})


def _specialist_context(passage_state):
    preservation = passage_state.get("preservation_state") or {}
    narrative = passage_state.get("narrative_state") or {}
    purpose = passage_state.get("purpose_state") or {}
    return {
        "passage_state": passage_state,
        "character_state_if_available": passage_state.get("character_state"),
        "canon_constraints": preservation.get("canon_facts"),
        "pov_knowledge_boundary": narrative.get("pov"),
        "project_intent": preservation.get("authorial_intent"),
        "author_intent_if_declared": preservation.get("authorial_intent"),
        "book_or_arc_context_when_available": purpose.get("scene_or_chapter_function"),
        "temporal_context_if_available": narrative.get("pacing_target"),
        "section_or_arc_context_when_material": purpose.get("scene_or_chapter_function"),
        "reader_state_evidence_only_as_separate_input": passage_state.get("reader_state")
    }


def build_step_f_case(normalized_packet, passage_state):
    signals = []
    for raw in normalized_packet.get("diagnostic_signals", []):
        signals.append({
            "evidence_id": raw.get("evidence_id"),
            "specialist_id": raw.get("specialist_id"),
            "dimension": raw.get("dimension"),
            "evidence_class": raw.get("evidence_class"),
            "finding_type": "OBSERVATION",
            "claim": raw.get("claim_code") or "semantic observation",
            "confidence": "HIGH" if float(raw.get("confidence", 0.0)) >= 0.85 else "MEDIUM",
            "relevant": raw.get("disposition") != "UNRESOLVED",
            "opportunity_id": None,
            "rewrite_text": False,
            "named_author_target": False,
            "evidence_anchors": raw.get("evidence_anchors", []),
            "purpose_relevance": 0.5,
            "severity": 0.0,
            "preservation_risk": 0.0,
            "voice_risk": 0.0,
            "collateral_regression_risk": 0.0,
            "expected_impact": 0.0
        })
    return STEP_F.build_step_f_case({"passage_state": passage_state, "context": _specialist_context(passage_state), "signals": signals})


def run_governed_diagnostics(normalized_packet, trusted_authority=None, requested_scope="SURGICAL"):
    state = build_passage_state(normalized_packet, trusted_authority=trusted_authority, requested_scope=requested_scope)
    step_f_case = build_step_f_case(normalized_packet, state)
    findings = SPECIALISTS.emit(step_f_case)
    adjudication = SPECIALISTS.adjudicate(step_f_case, findings)
    return {
        "passage_state": state,
        "step_f": step_f_case,
        "findings": findings,
        "adjudication": adjudication,
        "diagnosis_allowed": bool(state.get("readiness", {}).get("diagnosis_allowed")),
        "revision_allowed": bool(state.get("readiness", {}).get("revision_allowed")),
        "model_hypotheses_promoted_to_authority": False,
        "revision_text_generated": False,
        "manuscript_mutated": False
    }
