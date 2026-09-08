import hashlib
import json

LEVEL_SCOPE = {
    "LEVEL_0_NO_CHANGE": "NONE",
    "LEVEL_1_SURGICAL": "SURGICAL",
    "LEVEL_2_LOCAL_RESTRUCTURE": "LOCAL_RESTRUCTURE",
    "LEVEL_3_SUBSTANTIAL_REWORK": "SUBSTANTIAL_REWORK",
    "LEVEL_4_APPROACH_CHALLENGE": "APPROACH_CHALLENGE",
}
SCOPE_RANK = {"NONE": 0, "SURGICAL": 1, "LOCAL_RESTRUCTURE": 2, "SUBSTANTIAL_REWORK": 3, "APPROACH_CHALLENGE": 4}
HARD_FLAGS = {
    "canon_conflict", "protected_language_conflict", "authorial_intent_conflict",
    "pov_knowledge_violation", "explicit_user_constraint_conflict",
    "required_ambiguity_conflict", "semantic_core_change", "named_author_target"
}


def _cid(passage_id, level, opportunity_ids, transform_ids, text):
    payload = json.dumps([passage_id, level, sorted(opportunity_ids), sorted(transform_ids), text], separators=(",", ":"))
    return "RC-" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16].upper()


def _control_candidate(state, original):
    pid = state["identity"]["passage_id"]
    return {
        "candidate_id": _cid(pid, "LEVEL_0_NO_CHANGE", [], [], original),
        "passage_state_id": pid,
        "ambition_level": "LEVEL_0_NO_CHANGE",
        "candidate_text": original,
        "opportunity_ids": [],
        "transform_ids": [],
        "target_dimensions": [],
        "expected_effects": [],
        "preservation_obligations": [],
        "change_footprint": {"changed": False, "scope": "NONE"},
        "pre_evaluation_preservation": {"status": "CONTROL"},
        "evaluation_status": "CONTROL_ONLY",
        "writer_quality_claim": None,
        "named_author_target": None,
    }


def _apply_fixture_operation(original, transform):
    op = transform.get("operation")
    params = transform.get("fixture_parameters", {})
    if op == "DELETE_MARKED_AFTERBEAT":
        start, end = params.get("start", "[AFTERBEAT]"), params.get("end", "[/AFTERBEAT]")
        if start in original and end in original:
            a = original.index(start)
            b = original.index(end, a) + len(end)
            return (original[:a] + original[b:]).strip()
    if op == "REPLACE_TOKEN":
        return original.replace(params.get("from", ""), params.get("to", ""), 1)
    if op == "SPLIT_AT_TOKEN":
        tok = params.get("token", " | ")
        return original.replace(tok, "\n\n", 1)
    if op == "COMPRESS_MARKED_EXPOSITION":
        marker = params.get("marker", "[EXPOSITION]")
        replacement = params.get("replacement", "")
        return original.replace(marker, replacement, 1)
    return transform.get("fixture_candidate_text", original)


def generate_candidate_set(state, original_text, opportunities, transforms, requests, max_nonzero=3):
    candidates = [_control_candidate(state, original_text)]
    readiness = state.get("readiness", {})
    if readiness.get("status") != "REVISION_STATE_READY" or readiness.get("revision_allowed") is not True:
        return {"status": "BLOCKED_NEEDS_CONTEXT", "candidates": candidates, "rejections": [{"reason": "PASSAGE_STATE_NOT_REVISION_READY"}]}

    opp_by_id = {o["opportunity_id"]: o for o in opportunities if o.get("status") == "ADMIT"}
    tr_by_id = {t["transform_id"]: t for t in transforms if t.get("qualified") is True}
    rejections = []
    max_scope = readiness.get("maximum_edit_scope", "NONE")
    challenge_auth = state.get("preservation_state", {}).get("explicit_challenge_authorization") is True

    for req in requests:
        if len(candidates) - 1 >= max_nonzero:
            rejections.append({"request_id": req.get("request_id"), "reason": "CANDIDATE_BUDGET_EXHAUSTED"})
            continue
        level = req.get("ambition_level")
        if level not in LEVEL_SCOPE or level == "LEVEL_0_NO_CHANGE":
            rejections.append({"request_id": req.get("request_id"), "reason": "INVALID_NONZERO_LEVEL"})
            continue
        scope = LEVEL_SCOPE[level]
        if SCOPE_RANK[scope] > SCOPE_RANK.get(max_scope, -1):
            rejections.append({"request_id": req.get("request_id"), "reason": "AMBITION_EXCEEDS_PASSAGE_AUTHORITY"})
            continue
        if level == "LEVEL_4_APPROACH_CHALLENGE" and not challenge_auth:
            rejections.append({"request_id": req.get("request_id"), "reason": "CHALLENGE_NOT_AUTHORIZED"})
            continue
        oid = req.get("opportunity_id")
        tid = req.get("transform_id")
        opp = opp_by_id.get(oid)
        tr = tr_by_id.get(tid)
        if not opp:
            rejections.append({"request_id": req.get("request_id"), "reason": "OPPORTUNITY_NOT_ADMITTED"})
            continue
        if not tr:
            rejections.append({"request_id": req.get("request_id"), "reason": "TRANSFORM_NOT_QUALIFIED"})
            continue
        if SCOPE_RANK.get(tr.get("scope_limit", "NONE"), -1) < SCOPE_RANK[scope]:
            rejections.append({"request_id": req.get("request_id"), "reason": "TRANSFORM_SCOPE_EXCEEDED"})
            continue
        if tr.get("countercondition_active") is True:
            rejections.append({"request_id": req.get("request_id"), "reason": "TRANSFORM_COUNTERCONDITION_ACTIVE"})
            continue
        flags = set(req.get("preservation_flags", []))
        if flags & HARD_FLAGS:
            rejections.append({"request_id": req.get("request_id"), "reason": "HARD_PRESERVATION_FAILURE", "flags": sorted(flags & HARD_FLAGS)})
            continue
        if req.get("named_author_target"):
            rejections.append({"request_id": req.get("request_id"), "reason": "NAMED_AUTHOR_TARGET_REJECTED"})
            continue
        text = _apply_fixture_operation(original_text, tr)
        if text == original_text:
            rejections.append({"request_id": req.get("request_id"), "reason": "NO_EFFECT_NONZERO_CANDIDATE"})
            continue
        pid = state["identity"]["passage_id"]
        candidates.append({
            "candidate_id": _cid(pid, level, [oid], [tid], text),
            "passage_state_id": pid,
            "ambition_level": level,
            "candidate_text": text,
            "opportunity_ids": [oid],
            "transform_ids": [tid],
            "target_dimensions": list(opp.get("target_dimensions", [])),
            "expected_effects": list(tr.get("expected_effects", [])),
            "preservation_obligations": list(tr.get("preservation_obligations", [])),
            "change_footprint": {"changed": True, "scope": scope},
            "pre_evaluation_preservation": {"status": "NO_HARD_FAILURE_DETECTED", "review_flags": req.get("review_flags", [])},
            "evaluation_status": "UNEVALUATED_PENDING_STEP_I",
            "writer_quality_claim": None,
            "named_author_target": None,
        })
    status = "CANDIDATES_GENERATED_PENDING_INDEPENDENT_EVALUATION" if len(candidates) > 1 else "NO_ACTION_ONLY"
    return {"status": status, "candidates": candidates, "rejections": rejections}
