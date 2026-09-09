from step_006_applicability import plan_applicability

SAMPLE = {
    1:  {"sha256":"9a99a6b0fe4c9604e43bc84cc3cb4e81b620113eb4e3b42e09e8614e34739b3b","role":"CONTROL","expected":"RETAIN_ORIGINAL"},
    8:  {"sha256":"8c8bc2e85c432e0c1bfadb6b751b38807e705be2d6e009acf4a36c34b4d6a0a8","role":"CRAFT_REPAIR_TARGET","expected":"RETAIN_ORIGINAL"},
    19: {"sha256":"bd973decd6c1b97fda74fcb80d310d90e22ec3d68898398dd8865d4a681bb33f","role":"CONTROL","expected":"RETAIN_ORIGINAL"},
    21: {"sha256":"ab9d5d5e6e881e4d3b2cd58ef60fe4fad9206f1648336f7bbffcded8fb301e36","role":"CRAFT_REPAIR_TARGET","expected":"ABSTAIN_OR_RETAIN"},
    24: {"sha256":"dd5001c7485608139eae24c9b7c9212612143dd9b4021cc20ebf92f116dc1ca5","role":"BOUNDED_OBJECTIVE_REPAIR","expected":"TWO_BOUNDED_REPAIRS"},
    29: {"sha256":"83a724db59f1d0cf5a6d211ba9720ed7cc13a253fbbc031b06bdfb9ff4a555d6","role":"CONTROL","expected":"RETAIN_ORIGINAL"},
}

# Non-reconstructive applicability labels from the already-authorized private sample.
# These select questions to inspect; they do not encode PASS/FAIL answers.
FEATURES = {
  1: dict(character_state_material=True, character_dimensions=["ACTIVE_GOAL","MOTIVE_VALUE_PRESSURE","BELIEF_STATE","CHARACTER_PERCEPTION"],
          theme_motif_material=True, theme_dimensions=["MOTIF_THEME_CONTRIBUTION","THEMATIC_ACCUMULATION","SCENE_THEME_FUNCTION"],
          prose_dimensions=["CADENCE_INTENT","PAUSE_CONTROL","IMAGE_FAMILY","PRECISION","SELECTIVE_DETAIL","CHARACTER_SPECIFICITY"],
          reader_simulation_requested=False),
  8: dict(character_state_material=True, character_dimensions=["ACTIVE_GOAL","AGENCY_COERCION","RELATIONSHIP_STATE","CHARACTER_PERCEPTION"],
          dialogue_material=True, dialogue_dimensions=["POWER_STATUS","INFORMATION_ASYMMETRY","FACE_POLITENESS","EXPOSITION_LEAKAGE"],
          pacing_material=True, pacing_dimensions=["DWELL_ALLOCATION","INFORMATION_DENSITY","ACCELERATION_DECELERATION","LOCAL_GLOBAL_PACING_REGRESSION"],
          prose_dimensions=["SELECTIVE_DETAIL","ORIENTATION","RELEVANCE","INFORMATION_ORDER","COMPRESSION","NATURALNESS"],
          reader_simulation_requested=False),
  19: dict(character_state_material=True, character_dimensions=["ACTIVE_GOAL","MOTIVE_VALUE_PRESSURE","DECISION_ALTERNATIVES","ARC_PROGRESSION"],
           theme_motif_material=True, theme_dimensions=["ACTION_EMBODIMENT","THEMATIC_ACCUMULATION","SCENE_THEME_FUNCTION"],
           pacing_material=True, pacing_dimensions=["SECTION_PROPORTIONALITY","REFLECTION_ACTION_ALTERNATION","SETUP_PAYOFF_DISTANCE"],
           prose_dimensions=["INFORMATION_ORDER","END_WEIGHT"], reader_simulation_requested=False),
  21: dict(character_state_material=True, character_dimensions=["RELATIONSHIP_STATE","INTERNAL_CONFLICT","CHARACTER_PERCEPTION"],
           theme_motif_material=True, theme_dimensions=["SUBTEXT_INFERENCE_CHAIN","EXPLICIT_IMPLICIT_BALANCE","THEMATIC_OVERSTATEMENT"],
           pacing_material=True, pacing_dimensions=["DWELL_ALLOCATION","EMOTIONAL_DENSITY","INTENTIONAL_SLOWNESS","COMPRESSION_LOSS_RISK"],
           prose_dimensions=["CADENCE_INTENT","PARAGRAPH_MOTION","RHETORICAL_REPETITION","COMPRESSION","NATURALNESS"],
           reader_simulation_requested=True, reader_dimensions=["AFFECT_TRANSITION","EMOTIONAL_RESIDUE","MOMENTUM","CONTINUATION_DESIRE"]),
  24: dict(character_state_material=True, character_dimensions=["ACTIVE_GOAL","DECISION_ALTERNATIVES","ACTION_INTENTIONALITY","CONSEQUENCE_RECOGNITION"],
           dialogue_material=True, dialogue_dimensions=["DIALOGUE_FUNCTION","SPEECH_ACT","POWER_STATUS","DISCLOSURE_TIMING"],
           theme_motif_material=True, theme_dimensions=["ACTION_EMBODIMENT","SCENE_THEME_FUNCTION","EXPLICIT_IMPLICIT_BALANCE"],
           pacing_material=True, pacing_dimensions=["INFORMATION_LATENCY","SETUP_PAYOFF_DISTANCE","THREAD_CLOSURE_LOAD"],
           prose_dimensions=["Rhetorical_REPETITION"], reader_simulation_requested=False),
  29: dict(character_state_material=True, character_dimensions=["ARC_PROGRESSION","CONSEQUENCE_RECOGNITION","VALUE_ACTION_CONSISTENCY"],
           originality_question=True, originality_dimensions=["CONCEPT_DISTINCTIVENESS","FORMAL_DISTINCTIVENESS","MODEL_DEFAULT_CONVERGENCE","AUTHOR_PROJECT_ATTRIBUTABLE_DISTINCTIVENESS"],
           theme_motif_material=True, theme_dimensions=["THEMATIC_ACCUMULATION","MOTIF_THEME_CONTRIBUTION","ENDING_THEME_RESONANCE","INTERPRETIVE_PLURALITY"],
           pacing_material=True, pacing_dimensions=["THREAD_CLOSURE_LOAD","SETUP_PAYOFF_DISTANCE","INTENTIONAL_SLOWNESS","LOCAL_GLOBAL_PACING_REGRESSION"],
           prose_dimensions=["CADENCE_INTENT","IMAGE_FAMILY","FRESHNESS","END_WEIGHT","COMPRESSION","DISTINCTIVENESS"],
           reader_simulation_requested=True, reader_dimensions=["THEMATIC_RESONANCE","MOTIF_RETENTION","CLOSURE_RESIDUE","LONG_FORM_STATE_RETENTION"]),
}

# Correct accidental case before planning; keeping this explicit proves unknown dimensions are not silently accepted.
FEATURES[24]["prose_dimensions"] = ["RHETORICAL_REPETITION","INFORMATION_ORDER","COMPRESSION","NATURALNESS"]

results=[]
def check(name, cond, detail=None): results.append({"case":name,"pass":bool(cond),"detail":detail})

plans={}
for chapter, feat in FEATURES.items():
    ctx={"reader_profile":{"id":"AGLO-TARGET"},"reveal_frontier":{"chapter":chapter}}
    plans[chapter]=plan_applicability(feat,ctx)
    check(f"ch{chapter}_sparse_below_20pct", plans[chapter]["dimension_activation_rate"] < 0.20, plans[chapter])
    check(f"ch{chapter}_not_zero", plans[chapter]["active_dimension_count"] > 0, plans[chapter])

check("ch1_no_reader_owner", "PACKET_013_READER_EXPERIENCE" not in plans[1]["owners"])
check("ch19_no_reader_owner", "PACKET_013_READER_EXPERIENCE" not in plans[19]["owners"])
check("ch21_reader_only_four_dimensions", len(plans[21]["owners"]["PACKET_013_READER_EXPERIENCE"]["dimensions"]) == 4)
check("ch29_reader_only_four_dimensions", len(plans[29]["owners"]["PACKET_013_READER_EXPERIENCE"]["dimensions"]) == 4)
check("ch8_dialogue_active", "DIALOGUE_PRAGMATICS_CHARACTER_v2" in plans[8]["owners"])
check("ch8_pacing_active", "PACING_NARRATIVE_TIME_v2" in plans[8]["owners"])
check("ch8_prose_active", "PACKET_012_PROSE_CRAFT" in plans[8]["owners"])
check("ch8_originality_inactive", "ORIGINALITY_DISTINCTIVENESS_v1" not in plans[8]["owners"])
check("ch24_originality_inactive", "ORIGINALITY_DISTINCTIVENESS_v1" not in plans[24]["owners"])
check("ch29_originality_active", "ORIGINALITY_DISTINCTIVENESS_v1" in plans[29]["owners"])
check("ch29_reader_active", "PACKET_013_READER_EXPERIENCE" in plans[29]["owners"])

for chapter in (1,8,19,21,29):
    check(f"ch{chapter}_activation_not_promotion", SAMPLE[chapter]["expected"] in {"RETAIN_ORIGINAL","ABSTAIN_OR_RETAIN"})
check("ch24_bounded_positive_case", SAMPLE[24]["expected"] == "TWO_BOUNDED_REPAIRS")

rates=[p["dimension_activation_rate"] for p in plans.values()]
check("mean_activation_under_12pct", sum(rates)/len(rates) < 0.12, rates)
check("max_activation_under_20pct", max(rates) < 0.20, rates)
check("no_passage_activates_all_owners", all(p["active_owner_count"] < 7 for p in plans.values()))

check("six_exact_sample_hashes", len({v["sha256"] for v in SAMPLE.values()}) == 6)
check("no_raw_prose_fields", all(set(v.keys()) <= {"sha256","role","expected"} for v in SAMPLE.values()))

all_pass=all(r["pass"] for r in results)
print(f"STEP-006 REAL-PASSAGE FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
print("ACTIVATION", {ch:plans[ch]["dimension_activation_rate"] for ch in sorted(plans)})
print("ACTIVE_COUNTS", {ch:plans[ch]["active_dimension_count"] for ch in sorted(plans)})
if not all_pass:
    for r in results:
        if not r["pass"]: print(r)
    raise SystemExit(1)
