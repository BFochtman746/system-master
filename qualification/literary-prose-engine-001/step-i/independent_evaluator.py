import hashlib, json, re

HARD = {
    "meaning", "canon", "authorial_intent", "protected_language",
    "pov_and_focalization", "character_knowledge_and_integrity",
    "explicit_user_constraints", "required_ambiguity", "factual_constraints"
}
CONDITIONAL = {"historical_constraints", "theological_constraints"}
BLIND_LABEL_RE = re.compile(r"^[A-Z]{1,2}$")
VALID_CONFIDENCE = {"MEDIUM", "HIGH"}


def stable_id(payload):
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return "EVAL-" + hashlib.sha256(raw).hexdigest()[:20]


def _substantive_winner(orientation):
    pref = orientation.get("preferred")
    if pref in ("TIE", "ABSTAIN"):
        return pref
    if pref == "LEFT":
        return orientation.get("left_id")
    if pref == "RIGHT":
        return orientation.get("right_id")
    return "ABSTAIN"


def position_consistency(o1, o2, original_id, challenger_id):
    if not o2:
        return "INSUFFICIENT_SWAP_EVIDENCE"
    if o1.get("left_id") != o2.get("right_id") or o1.get("right_id") != o2.get("left_id"):
        return "POSITION_BIAS_SUSPECTED"
    w1, w2 = _substantive_winner(o1), _substantive_winner(o2)
    if w1 == w2 == original_id:
        return "CONSISTENT_ORIGINAL"
    if w1 == w2 == challenger_id:
        return "CONSISTENT_CHALLENGER"
    if w1 == w2 == "TIE":
        return "CONSISTENT_TIE"
    return "POSITION_BIAS_SUSPECTED"


def preservation_gate(regressions, applicable_constraints=None):
    applicable_constraints = set(applicable_constraints or [])
    hard = set(HARD) | (CONDITIONAL & applicable_constraints)
    established = [r for r in regressions if r.get("dimension") in hard and r.get("status") == "REGRESSION"]
    unresolved = [r for r in regressions if r.get("dimension") in hard and r.get("status") == "UNRESOLVED"]
    if established:
        return {"status": "HARD_FAIL", "dimensions": sorted({r["dimension"] for r in established})}
    if unresolved:
        return {"status": "UNRESOLVED_CRITICAL", "dimensions": sorted({r["dimension"] for r in unresolved})}
    return {"status": "PASS", "dimensions": []}


def _blinding_valid(labels, original_id, challenger_id):
    if not isinstance(labels, dict) or set(labels.keys()) != {original_id, challenger_id}:
        return False
    values = list(labels.values())
    if len(values) != 2 or len(set(values)) != 2:
        return False
    if not all(isinstance(v, str) and BLIND_LABEL_RE.fullmatch(v) for v in values):
        return False
    forbidden = ("ORIGINAL", "REVISION", "CANDIDATE", "LEVEL_", "WRITER_PICK")
    return not any(any(tok in v for tok in forbidden) for v in values)


def evaluate(case):
    if case.get("writer_rationale") is not None or case.get("writer_quality_claim") is not None:
        return {"disposition": "ABSTAIN_HUMAN_REVIEW", "reason": "FORBIDDEN_WRITER_AUTHORITY_INPUT"}
    if case.get("named_author_target"):
        return {"disposition": "RETAIN_ORIGINAL", "reason": "NAMED_AUTHOR_TARGET_REJECTED"}

    original_id = case["original_id"]
    challenger_id = case["challenger_id"]
    labels = case.get("blind_labels", {})
    if not _blinding_valid(labels, original_id, challenger_id):
        return {"disposition": "ABSTAIN_HUMAN_REVIEW", "reason": "BLINDING_BROKEN"}

    pgate = preservation_gate(case.get("regressions", []), case.get("applicable_constraints", []))
    if pgate["status"] == "HARD_FAIL":
        return {"disposition": "REJECT_PRESERVATION_REGRESSION", "reason": "HARD_PRESERVATION_REGRESSION", "preservation_gate": pgate}
    if pgate["status"] == "UNRESOLVED_CRITICAL":
        return {"disposition": "RETAIN_ORIGINAL", "reason": "UNRESOLVED_CRITICAL_PRESERVATION", "preservation_gate": pgate}

    orientation_one = case["orientation_one"]
    orientation_two = case.get("orientation_two")
    pc = position_consistency(orientation_one, orientation_two, original_id, challenger_id)
    dims = case.get("dimension_results", {})
    relevant = case.get("purpose_relevant_dimensions", [])
    challenger_gains = [d for d in relevant if dims.get(d) == "CHALLENGER_BETTER"]
    original_gains = [d for d in relevant if dims.get(d) == "ORIGINAL_BETTER"]
    unresolved_critical = [d for d in case.get("critical_comparative_dimensions", []) if dims.get(d) == "UNRESOLVED"]
    confidence = case.get("confidence", "LOW")
    orientation_confidences = [orientation_one.get("confidence", "LOW")]
    if orientation_two:
        orientation_confidences.append(orientation_two.get("confidence", "LOW"))

    base = {
        "evaluation_id": stable_id({"o": original_id, "c": challenger_id, "o1": orientation_one, "o2": orientation_two, "dims": dims}),
        "position_consistency": pc,
        "preservation_gate": pgate,
        "tradeoffs": {"challenger_gains": challenger_gains, "original_gains": original_gains, "unresolved_critical": unresolved_critical}
    }

    if pc == "POSITION_BIAS_SUSPECTED":
        return {**base, "disposition": "RETAIN_ORIGINAL", "reason": "POSITION_BIAS_SUSPECTED"}
    if unresolved_critical:
        return {**base, "disposition": "RETAIN_ORIGINAL", "reason": "UNRESOLVED_CRITICAL_COMPARISON"}
    if confidence not in VALID_CONFIDENCE or any(c not in VALID_CONFIDENCE for c in orientation_confidences):
        return {**base, "disposition": "RETAIN_ORIGINAL", "reason": "INSUFFICIENT_CONFIDENCE"}
    if pc == "CONSISTENT_CHALLENGER" and challenger_gains and not original_gains:
        return {**base, "disposition": "ACCEPT_CANDIDATE", "reason": "CONSISTENT_TARGET_IMPROVEMENT"}
    if pc == "INSUFFICIENT_SWAP_EVIDENCE" and challenger_gains and not original_gains:
        return {**base, "disposition": "ABSTAIN_HUMAN_REVIEW", "reason": "SWAP_EVIDENCE_UNAVAILABLE"}
    if pc == "CONSISTENT_ORIGINAL":
        return {**base, "disposition": "RETAIN_ORIGINAL", "reason": "CONSISTENT_ORIGINAL_PREFERENCE"}
    return {**base, "disposition": "RETAIN_ORIGINAL", "reason": "TIED_OR_TRADEOFF_UNRESOLVED"}
