import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAP_PATH = HERE.parent / "unification-001" / "STEP-005-DIMENSION-AUTHORITY-MAP-v1.json"
CONTRACT_PATH = HERE.parent / "unification-001" / "GRANULAR-SPECIALIST-CONTRACTS-v1.json"

with MAP_PATH.open("r", encoding="utf-8") as f:
    AUTHORITY_MAP = json.load(f)
with CONTRACT_PATH.open("r", encoding="utf-8") as f:
    CONTRACTS = json.load(f)

PRIMARY = {}
for authority, dims in AUTHORITY_MAP["authorities"].items():
    for dim in dims:
        if dim in PRIMARY:
            raise RuntimeError(f"duplicate primary dimension owner: {dim}: {PRIMARY[dim]} vs {authority}")
        PRIMARY[dim] = authority

GRANULAR = {s["specialist_id"]: s for s in CONTRACTS["specialists"]}

ALIASES = {
    "CHARACTER_GOAL_AGENCY_CONTINUITY": "CHARACTER_STATE_ARC_v2",
    "DIALOGUE_SUBTEXT_DISTINCTIVENESS": "DIALOGUE_PRAGMATICS_CHARACTER_v2",
    "PACING_COMPRESSION_EXPANSION": "PACING_NARRATIVE_TIME_v2",
    "SENTENCE_RHYTHM_SYNTAX": "PACKET_012_PROSE_CRAFT",
    "PARAGRAPH_MOVEMENT": "PACKET_012_PROSE_CRAFT",
    "DICTION_REGISTER": "PACKET_012_PROSE_CRAFT",
    "DESCRIPTION_SENSORY_IMAGERY_METAPHOR_MOTIF": "PACKET_012_PROSE_CRAFT",
    "INFORMATION_RELEASE_ORIENTATION": "PACKET_013_READER_EXPERIENCE"
}

RECEPTION_OWNER = "PACKET_013_READER_EXPERIENCE"
TEXT_SIDE_OWNERS = {
    "CHARACTER_STATE_ARC_v2", "DIALOGUE_PRAGMATICS_CHARACTER_v2",
    "ORIGINALITY_DISTINCTIVENESS_v1", "THEME_SUBTEXT_MOTIF_v1",
    "PACING_NARRATIVE_TIME_v2", "PACKET_012_PROSE_CRAFT"
}


def canonical_specialist(specialist_id):
    return ALIASES.get(specialist_id, specialist_id)


def validate_signal(signal):
    dim = signal.get("dimension")
    specialist = canonical_specialist(signal.get("specialist_id"))
    if not dim or dim not in PRIMARY:
        return False, "UNKNOWN_DIMENSION"
    owner = PRIMARY[dim]
    if specialist != owner:
        return False, f"DIMENSION_OWNER_MISMATCH:{owner}"
    if owner == RECEPTION_OWNER and signal.get("evidence_class") not in {"READER_PREDICTION", "HUMAN_READER_OBSERVATION"}:
        return False, "READER_EVIDENCE_CLASS_REQUIRED"
    if owner != RECEPTION_OWNER and signal.get("evidence_class") == "READER_PREDICTION" and signal.get("finding_type") in {"ERROR", "DEFECT"}:
        return False, "READER_PREDICTION_CANNOT_ASSERT_TEXT_DEFECT"
    return True, "OK"


def activation_status(specialist_id, context):
    specialist_id = canonical_specialist(specialist_id)
    if specialist_id in GRANULAR:
        spec = GRANULAR[specialist_id]
        missing = []
        for req in spec.get("required_context", []):
            # Optional requirements are marked in their names.
            if req.endswith("_if_available") or req.endswith("_when_available") or "only_as_separate_input" in req:
                continue
            if not context.get(req):
                missing.append(req)
        if missing:
            return {"status": "BLOCKED_MISSING_CONTEXT", "missing": missing}
    if specialist_id == RECEPTION_OWNER:
        if not context.get("reader_profile") or not context.get("reveal_frontier"):
            return {"status": "BLOCKED_MISSING_CONTEXT", "missing": [k for k in ("reader_profile", "reveal_frontier") if not context.get(k)]}
    return {"status": "ACTIVE", "missing": []}


def normalize_signals(case):
    context = case.get("context", {})
    normalized = []
    rejected = []
    for raw in case.get("signals", []):
        s = dict(raw)
        s["specialist_id"] = canonical_specialist(s.get("specialist_id"))
        ok, reason = validate_signal(s)
        if not ok:
            rejected.append({"evidence_id": s.get("evidence_id"), "reason": reason})
            continue
        act = activation_status(s["specialist_id"], context)
        if act["status"] != "ACTIVE":
            s["finding_type"] = "BLOCKED"
            s["confidence"] = "UNRESOLVED"
            s["claim"] = "specialist inactive: required context unavailable"
            s["opportunity_id"] = None
            s["activation"] = act
        s["primary_authority"] = PRIMARY[s["dimension"]]
        s.setdefault("correlation_group", correlation_group(s))
        normalized.append(s)
    return normalized, rejected


def correlation_group(signal):
    owner = PRIMARY.get(signal.get("dimension"), "UNKNOWN")
    concept = signal.get("concept_id") or signal.get("opportunity_id") or signal.get("dimension")
    # Reader evidence that refers to a text-side construct must share the text-side concept group.
    if owner == RECEPTION_OWNER and signal.get("text_side_concept_id"):
        concept = signal["text_side_concept_id"]
    return f"{concept}"


def route_contradictions(signals):
    by_concept = defaultdict(list)
    for s in signals:
        by_concept[s.get("correlation_group")].append(s)
    routes = []
    for group, members in by_concept.items():
        owners = sorted({m.get("primary_authority") for m in members})
        claims = {m.get("stance") for m in members if m.get("stance")}
        if len(owners) > 1:
            status = "CROSS_AUTHORITY_REVIEW" if len(claims) > 1 else "CORRELATED_CROSS_AUTHORITY_EVIDENCE"
            routes.append({
                "correlation_group": group,
                "owners": owners,
                "status": status,
                "evidence_ids": [m.get("evidence_id") for m in members]
            })
    return routes


def build_step_f_case(case):
    normalized, rejected = normalize_signals(case)
    routes = route_contradictions(normalized)
    routed_ids = {eid for r in routes if r["status"] == "CROSS_AUTHORITY_REVIEW" for eid in r["evidence_ids"]}
    for s in normalized:
        if s.get("evidence_id") in routed_ids:
            s.setdefault("contradictions", []).append("CROSS_AUTHORITY_CONTRADICTION")
    return {
        "passage_state": case.get("passage_state", {}),
        "signals": normalized,
        "rejected_signals": rejected,
        "contradiction_routes": routes
    }


def map_integrity():
    counts = {k: len(v) for k, v in AUTHORITY_MAP["authorities"].items()}
    expected = AUTHORITY_MAP["expected_counts"]
    duplicates = len(PRIMARY) != sum(counts.values())
    return {
        "counts": counts,
        "expected_counts": expected,
        "counts_match": counts == expected,
        "duplicate_dimension_owner": duplicates,
        "total_dimensions": sum(counts.values())
    }
