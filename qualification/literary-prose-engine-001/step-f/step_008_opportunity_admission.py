"""STEP-008 calibrated-finding -> revision-opportunity admission.

This module is intentionally non-generative. It ranks and gates diagnostic opportunities;
it never rewrites manuscript text or decides that a candidate is superior.
"""

from collections import defaultdict

ELIGIBLE_CLASSES = {"LIMITATION", "OPPORTUNITY"}
HARD_REJECTS = {
    "canon_conflict",
    "protected_language_conflict",
    "authorial_intent_conflict",
    "pov_knowledge_violation",
    "explicit_user_constraint_conflict",
    "named_author_target",
    "rewrite_payload_from_specialist",
}


def _clamp01(value, default=0.0):
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


def _unwrap(record):
    """Return a calibrated finding plus separate opportunity context.

    Callers may pass {"finding": {...}, "context": {...}} or a flat record. Keeping
    context separate lets STEP-007 remain a narrow diagnostic classifier while STEP-008
    consumes purpose/risk/edit-budget evidence from the passage and project state.
    """
    if isinstance(record, dict) and isinstance(record.get("finding"), dict):
        finding = dict(record["finding"])
        context = dict(record.get("context") or {})
    else:
        finding = dict(record or {})
        context = dict(record or {})
    return finding, context


def _opportunity_id(finding, context):
    return context.get("opportunity_id") or finding.get("opportunity_id")


def _family(finding, context):
    return (
        context.get("evidence_family")
        or context.get("specialist_correlation_group")
        or finding.get("specialist_id")
        or finding.get("evidence_id")
        or "UNSPECIFIED"
    )


def _hard_conflicts(context):
    conflicts = set(context.get("hard_conflicts") or [])
    for name in HARD_REJECTS:
        if context.get(name) is True:
            conflicts.add(name)
    if context.get("rewrite_text"):
        conflicts.add("rewrite_payload_from_specialist")
    if context.get("named_author_target"):
        conflicts.add("named_author_target")
    return sorted(conflicts & HARD_REJECTS)


def _risk(context):
    return max(
        _clamp01(context.get("preservation_risk", 0.0)),
        _clamp01(context.get("voice_risk", 0.0)),
        _clamp01(context.get("collateral_regression_risk", 0.0)),
    )


def _is_conflict(finding, context):
    disposition = str(finding.get("disposition") or "")
    return bool(
        disposition.startswith("ABSTAIN")
        or context.get("material_disagreement")
        or context.get("cross_authority_contradiction")
        or context.get("review_conflict")
    )


def _is_support(finding):
    return bool(
        finding.get("revision_eligible")
        and finding.get("classification") in ELIGIBLE_CLASSES
    )


def _priority_score(group):
    # Correlated findings never multiply confidence: take the strongest calibrated
    # support from each evidence family, then use the strongest family value as the
    # confidence term. Independent-family count is retained as provenance/tie-break only.
    family_confidence = {}
    severity = 0.0
    purpose = 0.0
    budget = 0.0
    risk = 0.0
    for finding, context in group:
        family = _family(finding, context)
        family_confidence[family] = max(
            family_confidence.get(family, 0.0), _clamp01(finding.get("confidence", 0.0))
        )
        severity = max(severity, _clamp01(finding.get("severity", 0.0)))
        purpose = max(purpose, _clamp01(context.get("purpose_relevance", 0.0)))
        budget = max(budget, _clamp01(context.get("edit_budget_fit", 0.0)))
        risk = max(risk, _risk(context))
    confidence = max(family_confidence.values()) if family_confidence else 0.0
    score = (
        0.30 * severity
        + 0.30 * confidence
        + 0.25 * purpose
        + 0.15 * budget
        - 0.50 * risk
    )
    return {
        "internal_priority": round(score, 4),
        "confidence": round(confidence, 3),
        "severity": round(severity, 3),
        "purpose_relevance": round(purpose, 3),
        "edit_budget_fit": round(budget, 3),
        "max_preservation_voice_collateral_risk": round(risk, 3),
        "evidence_family_count": len(family_confidence),
        "evidence_families": sorted(family_confidence),
    }


def _record(opportunity_id, group):
    hard = sorted({c for _, ctx in group for c in _hard_conflicts(ctx)})
    support = [(f, c) for f, c in group if _is_support(f)]
    conflicts = [(f, c) for f, c in group if _is_conflict(f, c)]
    evidence_ids = sorted({str(f.get("evidence_id")) for f, _ in group if f.get("evidence_id")})
    specialists = sorted({str(f.get("specialist_id")) for f, _ in group if f.get("specialist_id")})
    metrics = _priority_score(support or group)
    reasons = []

    if hard:
        status = "REJECT_PRESERVATION_RISK"
        reasons.append("hard preservation/authority conflict: " + ", ".join(hard))
    elif any(ctx.get("scope_allowed") is False for _, ctx in group):
        status = "REJECT_SCOPE"
        reasons.append("opportunity falls outside authorized edit scope")
    elif conflicts and support:
        status = "REVIEW_CONFLICT"
        reasons.append("material disagreement or abstention coexists with revision-eligible support")
    elif conflicts and not support:
        status = "REVIEW_CONFLICT"
        reasons.append("evidence is unresolved; no revision may be admitted")
    elif not support:
        status = "NO_ACTION"
        reasons.append("no calibrated revision-eligible LIMITATION/OPPORTUNITY support")
    elif not opportunity_id:
        status = "REVIEW_CONFLICT"
        reasons.append("revision-eligible evidence lacks a stable opportunity identity")
    elif metrics["confidence"] < 0.70:
        status = "REVIEW_CONFLICT"
        reasons.append("diagnostic confidence below STEP-008 admission floor")
    elif metrics["purpose_relevance"] < 0.50:
        status = "NO_ACTION"
        reasons.append("insufficient relevance to the passage's stated purpose")
    elif metrics["edit_budget_fit"] < 0.50:
        status = "REJECT_SCOPE"
        reasons.append("opportunity does not fit the authorized edit budget")
    elif metrics["max_preservation_voice_collateral_risk"] > 0.35:
        status = "REJECT_PRESERVATION_RISK"
        reasons.append("bounded revision evidence is outweighed by preservation/voice/collateral risk")
    elif metrics["internal_priority"] < 0.50:
        status = "NO_ACTION"
        reasons.append("expected value does not clear the bounded admission threshold")
    else:
        status = "ADMIT"
        reasons.append("bounded, purpose-relevant, sufficiently confident, preservation-safe opportunity")

    return {
        "opportunity_id": opportunity_id,
        "status": status,
        "evidence_ids": evidence_ids,
        "specialist_ids": specialists,
        **metrics,
        "reasons": reasons,
    }


def admit_opportunities(records, max_opportunities=3):
    if not isinstance(max_opportunities, int) or max_opportunities < 1 or max_opportunities > 10:
        raise ValueError("max_opportunities must be an integer from 1 to 10")

    grouped = defaultdict(list)
    anonymous = 0
    for raw in records or []:
        finding, context = _unwrap(raw)
        oid = _opportunity_id(finding, context)
        if not oid:
            anonymous += 1
            oid = f"__MISSING_OPPORTUNITY_ID_{anonymous}"
        grouped[oid].append((finding, context))

    adjudicated = [_record(None if key.startswith("__MISSING_") else key, group) for key, group in grouped.items()]

    # Rank only already-admissible opportunities. Evidence-family count is a tie-breaker,
    # never a multiplier, so duplicated/correlated specialists cannot vote an item upward.
    candidates = [x for x in adjudicated if x["status"] == "ADMIT"]
    candidates.sort(
        key=lambda x: (
            -x["internal_priority"],
            -x["confidence"],
            -x["purpose_relevance"],
            -x["evidence_family_count"],
            str(x.get("opportunity_id") or ""),
        )
    )
    keep = {x["opportunity_id"] for x in candidates[:max_opportunities]}
    for item in adjudicated:
        if item["status"] == "ADMIT" and item["opportunity_id"] not in keep:
            item["status"] = "REJECT_SCOPE"
            item["reasons"].append("bounded opportunity cap reached; lower-priority overflow not admitted")

    adjudicated.sort(
        key=lambda x: (
            0 if x["status"] == "ADMIT" else 1,
            -x["internal_priority"],
            str(x.get("opportunity_id") or ""),
        )
    )
    admitted = [x for x in adjudicated if x["status"] == "ADMIT"]
    review = [x for x in adjudicated if x["status"] == "REVIEW_CONFLICT"]
    rejected = [x for x in adjudicated if x["status"].startswith("REJECT_")]

    standing = "ADMIT" if admitted else ("REVIEW_CONFLICT" if review else "NO_ACTION")
    return {
        "step": "BOOK-INTELLIGENCE-UNIFICATION-001-STEP-008",
        "standing": standing,
        "max_opportunities": max_opportunities,
        "admitted_count": len(admitted),
        "review_conflict_count": len(review),
        "rejected_count": len(rejected),
        "opportunities": adjudicated,
        "admitted_opportunity_ids": [x["opportunity_id"] for x in admitted],
        "revision_text_generated": False,
        "manuscript_mutated": False,
        "universal_prose_score": False,
    }
