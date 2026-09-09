ALLOWED = {"OBSERVATION", "LIMITATION", "RISK", "OPPORTUNITY", "INTENTIONAL_FEATURE"}
REVISION_ELIGIBLE = {"LIMITATION", "OPPORTUNITY"}


def _clamp01(v, default=0.0):
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return default


def calibrate_finding(raw):
    """Convert an activated-dimension observation into a governed diagnostic finding.

    Activation or feature detection is never sufficient to establish defect. The caller
    must provide non-textual evidence flags describing what was actually established.
    """
    r = dict(raw)
    reasons = []

    if r.get("rewrite_text") or r.get("named_author_target"):
        return _result(r, "OBSERVATION", "BLOCKED_PROHIBITED_SPECIALIST_OUTPUT", False, 0.0, 0.0,
                       ["specialist output crossed diagnostic authority"])

    if r.get("activation_status", "ACTIVE") != "ACTIVE":
        return _result(r, "OBSERVATION", "ABSTAIN_INACTIVE_OR_MISSING_CONTEXT", False, 0.0, 0.0,
                       ["dimension was not validly active"])

    detected = bool(r.get("feature_detected", False))
    if not detected:
        return _result(r, "OBSERVATION", "NO_FINDING", False, 0.0, 0.0,
                       ["no relevant feature established"])

    confidence = _clamp01(r.get("confidence", 0.5), 0.5)
    severity = _clamp01(r.get("severity", 0.0), 0.0)
    preservation_risk = max(
        _clamp01(r.get("preservation_risk", 0.0)),
        _clamp01(r.get("voice_risk", 0.0)),
        _clamp01(r.get("collateral_regression_risk", 0.0)),
    )

    # Explicit author/canon/protected-purpose evidence outranks generic optimization.
    intentional = bool(r.get("intentional_evidence"))
    protected = bool(r.get("protected_evidence"))
    author_preference = bool(r.get("author_preference_support"))
    if intentional or protected or author_preference:
        reasons.append("feature has explicit intentional/protected/project-preference evidence")
        return _result(r, "INTENTIONAL_FEATURE", "RETAIN_ORIGINAL", False, confidence,
                       min(severity, 0.25), reasons)

    contradiction = bool(r.get("cross_authority_contradiction")) or bool(r.get("material_disagreement"))
    if contradiction:
        reasons.append("material evidence disagreement prevents defect claim")
        return _result(r, "OBSERVATION", "ABSTAIN_REVIEW", False, min(confidence, 0.5),
                       min(severity, 0.25), reasons)

    functional_harm = bool(r.get("functional_harm_evidence"))
    purpose_miss = bool(r.get("purpose_miss_evidence"))
    plausible_downside = bool(r.get("plausible_downside_evidence"))
    objective_defect = bool(r.get("objective_defect_evidence"))
    bounded_gain = bool(r.get("bounded_gain_evidence"))
    independent_support = bool(r.get("independent_support"))

    # Objective/bounded defects may become opportunities, but only with adequate confidence
    # and acceptable preservation risk.
    if objective_defect and bounded_gain and confidence >= 0.75 and preservation_risk <= 0.25:
        reasons.append("objective defect plus bounded low-risk gain established")
        if independent_support:
            reasons.append("independent support available")
        return _result(r, "OPPORTUNITY", "REVISION_CANDIDATE", True, confidence,
                       max(severity, 0.65), reasons)

    # Demonstrated failure against local purpose may be a limitation. It remains
    # revision-eligible only when confidence is adequate and preservation risk is bounded.
    if functional_harm and purpose_miss:
        reasons.append("functional harm against explicit local purpose established")
        eligible = confidence >= 0.7 and preservation_risk <= 0.35
        status = "REVISION_CANDIDATE" if eligible else "ABSTAIN_REVIEW"
        return _result(r, "LIMITATION", status, eligible, confidence,
                       max(severity, 0.5), reasons)

    # Plausible downside without demonstrated failure is a risk, not a defect and not
    # automatically revision-eligible.
    if plausible_downside:
        reasons.append("plausible downside exists but functional failure is not established")
        return _result(r, "RISK", "MONITOR_OR_REVIEW", False, min(confidence, 0.75),
                       min(max(severity, 0.25), 0.6), reasons)

    # Generic feature detection stays an observation regardless of salience.
    reasons.append("feature detected without sufficient evidence of harm or bounded gain")
    return _result(r, "OBSERVATION", "RETAIN_ORIGINAL", False, confidence,
                   min(severity, 0.25), reasons)


def _result(raw, classification, disposition, eligible, confidence, severity, reasons):
    assert classification in ALLOWED
    return {
        "evidence_id": raw.get("evidence_id"),
        "dimension": raw.get("dimension"),
        "specialist_id": raw.get("specialist_id"),
        "classification": classification,
        "disposition": disposition,
        "revision_eligible": bool(eligible and classification in REVISION_ELIGIBLE),
        "confidence": round(_clamp01(confidence), 3),
        "severity": round(_clamp01(severity), 3),
        "reasons": reasons,
        "opportunity_id": raw.get("opportunity_id") if eligible and classification in REVISION_ELIGIBLE else None,
    }


def calibrate_batch(findings):
    calibrated = [calibrate_finding(x) for x in findings]
    counts = {k: 0 for k in sorted(ALLOWED)}
    for f in calibrated:
        counts[f["classification"]] += 1
    eligible = [f for f in calibrated if f["revision_eligible"]]
    abstentions = [f for f in calibrated if f["disposition"].startswith("ABSTAIN")]
    return {
        "findings": calibrated,
        "counts": counts,
        "revision_eligible_count": len(eligible),
        "abstention_count": len(abstentions),
        "feature_detected_count": sum(1 for x in findings if x.get("feature_detected")),
    }
