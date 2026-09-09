import json
from pathlib import Path
from unified_granular_diagnostics import (
    PRIMARY, AUTHORITY_MAP, map_integrity, validate_signal, activation_status,
    normalize_signals, route_contradictions, build_step_f_case, canonical_specialist
)
from specialist_diagnostics import emit, adjudicate

results = []

def check(name, cond, detail=None):
    results.append({"case": name, "pass": bool(cond), "detail": detail})

# 1-8: map integrity and recovered packet counts.
mi = map_integrity()
check("map_counts_exact", mi["counts_match"], mi)
check("map_no_duplicate_primary_owner", not mi["duplicate_dimension_owner"], mi)
check("map_total_214", mi["total_dimensions"] == 214, mi["total_dimensions"])
check("packet012_exact_56", mi["counts"]["PACKET_012_PROSE_CRAFT"] == 56)
check("packet013_exact_64", mi["counts"]["PACKET_013_READER_EXPERIENCE"] == 64)
check("character_exact_16", mi["counts"]["CHARACTER_STATE_ARC_v2"] == 16)
check("dialogue_exact_20", mi["counts"]["DIALOGUE_PRAGMATICS_CHARACTER_v2"] == 20)
check("pacing_exact_25", mi["counts"]["PACING_NARRATIVE_TIME_v2"] == 25)

# 9-16: legacy aliases migrate to current owners.
check("alias_character", canonical_specialist("CHARACTER_GOAL_AGENCY_CONTINUITY") == "CHARACTER_STATE_ARC_v2")
check("alias_dialogue", canonical_specialist("DIALOGUE_SUBTEXT_DISTINCTIVENESS") == "DIALOGUE_PRAGMATICS_CHARACTER_v2")
check("alias_pacing", canonical_specialist("PACING_COMPRESSION_EXPANSION") == "PACING_NARRATIVE_TIME_v2")
check("alias_sentence_prose", canonical_specialist("SENTENCE_RHYTHM_SYNTAX") == "PACKET_012_PROSE_CRAFT")
check("alias_paragraph_prose", canonical_specialist("PARAGRAPH_MOVEMENT") == "PACKET_012_PROSE_CRAFT")
check("alias_diction_prose", canonical_specialist("DICTION_REGISTER") == "PACKET_012_PROSE_CRAFT")
check("alias_imagery_prose", canonical_specialist("DESCRIPTION_SENSORY_IMAGERY_METAPHOR_MOTIF") == "PACKET_012_PROSE_CRAFT")
check("alias_reader", canonical_specialist("INFORMATION_RELEASE_ORIENTATION") == "PACKET_013_READER_EXPERIENCE")

# 17-23: owner enforcement.
def sig(eid, sid, dim, **kw):
    d = {"evidence_id": eid, "specialist_id": sid, "dimension": dim, "finding_type": "LIMITATION", "evidence_class": "TEXT_DIAGNOSTIC", "opportunity_id": "O1"}
    d.update(kw)
    return d

ok, why = validate_signal(sig("e1", "CHARACTER_STATE_ARC_v2", "ACTIVE_GOAL"))
check("valid_character_owner", ok, why)
ok, why = validate_signal(sig("e2", "DIALOGUE_PRAGMATICS_CHARACTER_v2", "ACTIVE_GOAL"))
check("reject_wrong_owner", not ok and "DIMENSION_OWNER_MISMATCH" in why, why)
ok, why = validate_signal(sig("e3", "PACKET_012_PROSE_CRAFT", "COMPRESSION"))
check("valid_packet012_owner", ok, why)
ok, why = validate_signal(sig("e4", "PACING_NARRATIVE_TIME_v2", "COMPRESSION"))
check("pacing_cannot_steal_prose_compression", not ok, why)
ok, why = validate_signal(sig("e5", "PACKET_013_READER_EXPERIENCE", "MOMENTUM", evidence_class="READER_PREDICTION"))
check("valid_reader_owner", ok, why)
ok, why = validate_signal(sig("e6", "PACKET_013_READER_EXPERIENCE", "MOMENTUM"))
check("reader_evidence_class_required", not ok and why == "READER_EVIDENCE_CLASS_REQUIRED", why)
ok, why = validate_signal(sig("e7", "ORIGINALITY_DISTINCTIVENESS_v1", "NOT_A_DIMENSION"))
check("unknown_dimension_rejected", not ok and why == "UNKNOWN_DIMENSION", why)

# 24-30: activation/applicability.
char_ctx = {"passage_state": {"id":"P"}, "canon_constraints": {"ok":True}, "pov_knowledge_boundary": {"ok":True}, "project_intent": {"ok":True}}
check("character_activation_green", activation_status("CHARACTER_STATE_ARC_v2", char_ctx)["status"] == "ACTIVE")
check("character_missing_canon_blocks", activation_status("CHARACTER_STATE_ARC_v2", {k:v for k,v in char_ctx.items() if k!="canon_constraints"})["status"] == "BLOCKED_MISSING_CONTEXT")
dia_ctx = {"passage_state": {"id":"P"}, "speaker_ids":["A","B"], "dialogue_intent":{"ok":True}}
check("dialogue_activation_green", activation_status("DIALOGUE_PRAGMATICS_CHARACTER_v2", dia_ctx)["status"] == "ACTIVE")
orig_ctx = {"project_north_star":{"ok":True}, "genre_form_context":{"ok":True}, "author_project_voice":{"ok":True}, "comparison_context_when_claiming_originality":{"ok":True}}
check("originality_activation_green", activation_status("ORIGINALITY_DISTINCTIVENESS_v1", orig_ctx)["status"] == "ACTIVE")
theme_ctx = {"author_intent_if_declared":{"ok":True}, "book_or_arc_context_when_available":{"ok":True}, "motif_evidence":{"ok":True}, "character_and_event_evidence":{"ok":True}}
check("theme_activation_green", activation_status("THEME_SUBTEXT_MOTIF_v1", theme_ctx)["status"] == "ACTIVE")
pace_ctx = {"passage_state":{"id":"P"}, "temporal_context_if_available":{"ok":True}, "section_or_arc_context_when_material":{"ok":True}}
check("pacing_activation_green", activation_status("PACING_NARRATIVE_TIME_v2", pace_ctx)["status"] == "ACTIVE")
check("reader_missing_reveal_blocks", activation_status("PACKET_013_READER_EXPERIENCE", {"reader_profile":{"id":"R"}})["status"] == "BLOCKED_MISSING_CONTEXT")

# 31-36: normalization, fail-closed blocking, and no opportunity on inactive specialist.
case = {"context": char_ctx, "signals": [sig("e8", "CHARACTER_GOAL_AGENCY_CONTINUITY", "ACTIVE_GOAL")]}
norm, rej = normalize_signals(case)
check("legacy_signal_normalized", len(norm)==1 and norm[0]["specialist_id"]=="CHARACTER_STATE_ARC_v2" and not rej)
case = {"context": {}, "signals": [sig("e9", "CHARACTER_STATE_ARC_v2", "ACTIVE_GOAL")]}
norm, rej = normalize_signals(case)
check("inactive_becomes_blocked", norm[0]["finding_type"]=="BLOCKED" and norm[0]["confidence"]=="UNRESOLVED")
check("inactive_loses_opportunity", norm[0].get("opportunity_id") is None)
case = {"context": char_ctx, "signals": [sig("e10", "DIALOGUE_PRAGMATICS_CHARACTER_v2", "ACTIVE_GOAL")]}
norm, rej = normalize_signals(case)
check("wrong_owner_removed", not norm and len(rej)==1)
case = {"context": {"reader_profile":{"id":"R"}, "reveal_frontier":{"unit":2}}, "signals": [sig("e11", "PACKET_013_READER_EXPERIENCE", "MOMENTUM", evidence_class="READER_PREDICTION")]}
norm, rej = normalize_signals(case)
check("reader_prediction_survives_as_reader_evidence", len(norm)==1 and norm[0]["primary_authority"]=="PACKET_013_READER_EXPERIENCE")
check("reader_prediction_not_text_owner", PRIMARY["MOMENTUM"]=="PACKET_013_READER_EXPERIENCE" and PRIMARY["ACCELERATION_DECELERATION"]=="PACING_NARRATIVE_TIME_v2")

# 37-43: cross-authority correlation and contradiction routing.
shared = "PACE-LOCAL-1"
s1 = sig("p1","PACING_NARRATIVE_TIME_v2","ACCELERATION_DECELERATION", concept_id=shared, stance="SLOWING", claim="textual slowing", correlation_group=shared)
s2 = sig("r1","PACKET_013_READER_EXPERIENCE","MOMENTUM", evidence_class="READER_PREDICTION", text_side_concept_id=shared, stance="DRAG", claim="predicted drag", correlation_group=shared)
s1["primary_authority"]="PACING_NARRATIVE_TIME_v2"; s2["primary_authority"]="PACKET_013_READER_EXPERIENCE"
routes = route_contradictions([s1,s2])
check("cross_authority_correlated", routes[0]["status"]=="CROSS_AUTHORITY_REVIEW")
# Same stance is correlated evidence, not a conflict.
s2["stance"]="SLOWING"
routes = route_contradictions([s1,s2])
check("same_stance_correlated_not_conflict", routes[0]["status"]=="CORRELATED_CROSS_AUTHORITY_EVIDENCE")
# Theme vs reader resonance remains separate.
t1 = sig("t1","THEME_SUBTEXT_MOTIF_v1","THEMATIC_ACCUMULATION", concept_id="THEME-X", stance="ACCUMULATING"); t1["primary_authority"]="THEME_SUBTEXT_MOTIF_v1"; t1["correlation_group"]="THEME-X"
r2 = sig("rr1","PACKET_013_READER_EXPERIENCE","THEMATIC_RESONANCE", evidence_class="READER_PREDICTION", text_side_concept_id="THEME-X", stance="WEAK"); r2["primary_authority"]="PACKET_013_READER_EXPERIENCE"; r2["correlation_group"]="THEME-X"
check("theme_reader_disagreement_routed", route_contradictions([t1,r2])[0]["status"]=="CROSS_AUTHORITY_REVIEW")
check("reader_resonance_not_theme_truth", PRIMARY["THEMATIC_RESONANCE"]=="PACKET_013_READER_EXPERIENCE" and PRIMARY["THEMATIC_ACCUMULATION"]=="THEME_SUBTEXT_MOTIF_v1")
check("prose_freshness_not_originality_truth", PRIMARY["FRESHNESS"]=="PACKET_012_PROSE_CRAFT" and PRIMARY["CONCEPT_DISTINCTIVENESS"]=="ORIGINALITY_DISTINCTIVENESS_v1")
check("prose_dialogue_handoff_not_dialogue_truth", PRIMARY["DIALOGUE_NARRATION_HANDOFF"]=="PACKET_012_PROSE_CRAFT" and PRIMARY["SPEECH_ACT"]=="DIALOGUE_PRAGMATICS_CHARACTER_v2")
check("reader_goal_tracking_not_character_truth", PRIMARY["GOAL_INTENTION"]=="PACKET_013_READER_EXPERIENCE" and PRIMARY["ACTIVE_GOAL"]=="CHARACTER_STATE_ARC_v2")

# 44-50: actual STEP-F emission/adjudication integration.
ctx = dict(char_ctx)
case = {
  "context": ctx,
  "passage_state": {"readiness":{"status":"READY","missing_authorities":[]}},
  "signals": [sig("a1","CHARACTER_STATE_ARC_v2","ACTIVE_GOAL", opportunity_id="OP-A", confidence="HIGH", expected_impact=0.8, purpose_relevance=0.9)]
}
built = build_step_f_case(case)
findings = emit(built)
adj = adjudicate(built, findings)
check("step_f_admits_valid_granular_opportunity", adj["status"]=="ADMIT" and adj["opportunities"][0]["opportunity_id"]=="OP-A", adj)

# Hard preservation conflict still blocks opportunity.
case["signals"][0]["hard_flags"]=["canon_conflict"]
built = build_step_f_case(case); findings=emit(built); adj=adjudicate(built, findings)
check("step_f_canon_flag_blocks", adj["status"]=="NO_ACTION", adj)

# Prohibited rewrite remains rejected by STEP-F.
case["signals"][0]["hard_flags"]=[]; case["signals"][0]["rewrite_text"]="rewrite"
built=build_step_f_case(case); findings=emit(built); adj=adjudicate(built, findings)
check("step_f_specialist_rewrite_prohibited", adj["status"]=="REJECT_PRESERVATION_RISK", adj)

# Named-author targeting remains rejected.
case["signals"][0].pop("rewrite_text",None); case["signals"][0]["named_author_target"]=True
built=build_step_f_case(case); findings=emit(built); adj=adjudicate(built, findings)
check("step_f_named_author_target_prohibited", adj["status"]=="REJECT_PRESERVATION_RISK", adj)

# Cross-authority contradictory signals are review conflicts, not consensus votes.
case2 = {
 "context": {**pace_ctx, "reader_profile":{"id":"R"}, "reveal_frontier":{"unit":3}},
 "passage_state":{"readiness":{"status":"READY","missing_authorities":[]}},
 "signals":[
   sig("pp1","PACING_NARRATIVE_TIME_v2","ACCELERATION_DECELERATION", opportunity_id="OP-P", concept_id="P", stance="SLOWING", confidence="HIGH", expected_impact=0.7),
   sig("pr1","PACKET_013_READER_EXPERIENCE","MOMENTUM", evidence_class="READER_PREDICTION", opportunity_id="OP-P", text_side_concept_id="P", stance="FAST", confidence="HIGH", expected_impact=0.7)
 ]
}
built=build_step_f_case(case2); findings=emit(built); adj=adjudicate(built, findings)
check("cross_authority_conflict_forces_review", adj["opportunities"] and adj["opportunities"][0]["status"]=="REVIEW_CONFLICT", adj)
# They share one correlation group, so confidence cannot be inflated by vote count.
check("cross_authority_same_concept_one_correlation_group", len({f["correlation_group"] for f in findings})==1, [f["correlation_group"] for f in findings])
# Passage readiness still wins globally.
case2["passage_state"]["readiness"]["status"]="BLOCKED_NEEDS_CONTEXT"
built=build_step_f_case(case2); findings=emit(built); adj=adjudicate(built, findings)
check("passage_block_still_global", adj["status"]=="NO_ACTION" and adj["reason"]=="passage_state_blocked", adj)

all_pass = all(r["pass"] for r in results)
print(f"STEP-005 UNIFIED DIAGNOSTIC FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
if not all_pass:
    for r in results:
        if not r["pass"]:
            print(json.dumps(r, sort_keys=True))
    raise SystemExit(1)
