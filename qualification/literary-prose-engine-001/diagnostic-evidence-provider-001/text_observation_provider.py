#!/usr/bin/env python3
"""Fail-closed raw-text -> nonreconstructive prose observation provider.

This provider deliberately does NOT infer literary quality, author intent, canon,
POV knowledge, character state, theme, reader response, or revision superiority.
It converts directly measurable text features into evidence records compatible
with the Prose Project's STEP-007 calibration boundary.
"""
from __future__ import annotations

import hashlib
import re
import statistics
from collections import Counter

WORD_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?")
SENT_BOUNDARY_RE = re.compile(r'(?<=[.!?])(?:[\"”’\)]*)\s+(?=[A-Z“\"‘\'])')
DIRECT_DUP_RE = re.compile(r"\b([A-Za-z]+(?:['’][A-Za-z]+)?)\s+\1\b", re.IGNORECASE)

PROVIDER_ID = "PROSE_TEXT_OBSERVATION_PROVIDER_v1"
SPECIALIST_ID = "PACKET_012_PROSE_CRAFT"

SEMANTIC_DIMENSIONS_REQUIRING_OTHER_PROVIDER = [
    "scene_or_chapter_function", "pov", "focalization", "authorial_intent",
    "canon_facts", "character_state", "dialogue_subtext", "theme_subtext_motif",
    "reader_state", "revision_superiority"
]


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _words(text: str):
    return WORD_RE.findall(text)


def _sentences(text: str):
    flat = re.sub(r"\s+", " ", text).strip()
    if not flat:
        return []
    return [s.strip() for s in SENT_BOUNDARY_RE.split(flat) if s.strip()]


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _cv(values):
    if not values:
        return 0.0
    mean = statistics.mean(values)
    return statistics.pstdev(values) / mean if mean else 0.0


def _mattr(words, window=100):
    tokens = [w.lower() for w in words]
    if not tokens:
        return 0.0
    if len(tokens) <= window:
        return len(set(tokens)) / len(tokens)
    step = max(1, window // 2)
    vals = [len(set(tokens[i:i + window])) / window for i in range(0, len(tokens) - window + 1, step)]
    return statistics.mean(vals) if vals else 0.0


def _base_evidence(evidence_id, dimension, feature_detected, confidence, severity=0.0):
    return {
        "evidence_id": evidence_id,
        "provider_id": PROVIDER_ID,
        "specialist_id": SPECIALIST_ID,
        "dimension": dimension,
        "activation_status": "ACTIVE",
        "feature_detected": bool(feature_detected),
        "confidence": round(_clamp01(confidence), 3),
        "severity": round(_clamp01(severity), 3),
        "preservation_risk": 0.0,
        "voice_risk": 0.0,
        "collateral_regression_risk": 0.0,
        "intentional_evidence": False,
        "protected_evidence": False,
        "author_preference_support": False,
        "functional_harm_evidence": False,
        "purpose_miss_evidence": False,
        "plausible_downside_evidence": False,
        "objective_defect_evidence": False,
        "bounded_gain_evidence": False,
        "independent_support": False,
        "rewrite_text": False,
        "named_author_target": False,
        "opportunity_id": None
    }


def observe(text: str, source_id: str, authority_role: str = "UNSPECIFIED") -> dict:
    if not isinstance(text, str):
        raise TypeError("text must be str")
    if not source_id or not isinstance(source_id, str):
        raise ValueError("source_id required")

    words = _words(text)
    sentences = _sentences(text)
    paragraphs = [p.strip() for p in text.splitlines() if p.strip()]
    sentence_lengths = [len(_words(s)) for s in sentences if _words(s)]
    paragraph_lengths = [len(_words(p)) for p in paragraphs if _words(p)]
    word_count = len(words)
    sentence_count = len(sentence_lengths)
    paragraph_count = len(paragraph_lengths)

    normalized_sentences = []
    for sentence in sentences:
        tokens = [w.lower() for w in _words(sentence)]
        if len(tokens) >= 5:
            normalized_sentences.append(" ".join(tokens))
    repeated_sentence_excess = sum(v - 1 for v in Counter(normalized_sentences).values() if v > 1)
    direct_duplicate_count = len(DIRECT_DUP_RE.findall(text))
    quote_paragraphs = sum(1 for p in paragraphs if any(q in p for q in ('“', '”', '"')))

    metrics = {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "paragraph_count": paragraph_count,
        "sentence_mean_words": round(statistics.mean(sentence_lengths), 3) if sentence_lengths else 0.0,
        "sentence_length_cv": round(_cv(sentence_lengths), 4),
        "short_sentence_rate_le5": round(sum(x <= 5 for x in sentence_lengths) / max(1, sentence_count), 4),
        "long_sentence_rate_gt40": round(sum(x > 40 for x in sentence_lengths) / max(1, sentence_count), 4),
        "paragraph_mean_words": round(statistics.mean(paragraph_lengths), 3) if paragraph_lengths else 0.0,
        "paragraph_length_cv": round(_cv(paragraph_lengths), 4),
        "dialogue_paragraph_rate": round(quote_paragraphs / max(1, len(paragraphs)), 4),
        "mattr100": round(_mattr(words), 4),
        "direct_duplicate_word_count": direct_duplicate_count,
        "exact_repeated_sentence_excess": repeated_sentence_excess,
        "emdash_per_1k": round(text.count('—') * 1000 / max(1, word_count), 3),
        "semicolon_per_1k": round(text.count(';') * 1000 / max(1, word_count), 3),
        "question_per_1k": round(text.count('?') * 1000 / max(1, word_count), 3)
    }

    observations = []
    obs = _base_evidence(f"{source_id}:LENGTH_CONTOUR", "LENGTH_CONTOUR", sentence_count > 0, 1.0)
    obs["measurement"] = {"mean_words": metrics["sentence_mean_words"], "cv": metrics["sentence_length_cv"], "short_rate": metrics["short_sentence_rate_le5"], "long_rate": metrics["long_sentence_rate_gt40"]}
    observations.append(obs)

    obs = _base_evidence(f"{source_id}:PARAGRAPH_MOTION", "PARAGRAPH_MOTION", paragraph_count > 0, 1.0)
    obs["measurement"] = {"mean_words": metrics["paragraph_mean_words"], "cv": metrics["paragraph_length_cv"]}
    observations.append(obs)

    obs = _base_evidence(f"{source_id}:DIALOGUE_HANDOFF", "DIALOGUE_NARRATION_HANDOFF", paragraph_count > 0, 1.0)
    obs["measurement"] = {"dialogue_paragraph_rate": metrics["dialogue_paragraph_rate"]}
    observations.append(obs)

    obs = _base_evidence(f"{source_id}:CADENCE_DISTINCTIVENESS", "CADENCE_DISTINCTIVENESS", sentence_count > 0, 0.95)
    obs["measurement"] = {"mattr100": metrics["mattr100"], "emdash_per_1k": metrics["emdash_per_1k"], "semicolon_per_1k": metrics["semicolon_per_1k"], "question_per_1k": metrics["question_per_1k"]}
    observations.append(obs)

    obs = _base_evidence(f"{source_id}:REPETITION_RHYTHM", "REPETITION_RHYTHM", direct_duplicate_count > 0 or repeated_sentence_excess > 0, 1.0 if direct_duplicate_count > 0 else 0.95, 0.25 if direct_duplicate_count > 0 else 0.1)
    obs["measurement"] = {"direct_duplicate_word_count": direct_duplicate_count, "exact_repeated_sentence_excess": repeated_sentence_excess}
    obs["objective_defect_evidence"] = direct_duplicate_count > 0
    obs["bounded_gain_evidence"] = False
    obs["candidate_kind"] = "MECHANICAL_DUPLICATE_WORD_CANDIDATE" if direct_duplicate_count > 0 else None
    observations.append(obs)

    return {
        "provider_id": PROVIDER_ID,
        "source_id": source_id,
        "authority_role": authority_role,
        "input_sha256": _sha256(text),
        "metrics": metrics,
        "observations": observations,
        "semantic_status": "UNRESOLVED_REQUIRES_SEMANTIC_PROVIDER",
        "semantic_dimensions_requiring_other_provider": list(SEMANTIC_DIMENSIONS_REQUIRING_OTHER_PROVIDER),
        "raw_text_present_in_output": False,
        "candidate_text_present_in_output": False,
        "revision_authorized": False,
        "manuscript_mutated": False,
        "universal_prose_score": False
    }
