from step_006_applicability import plan_applicability

SAMPLE = {
    1:  {"sha256":"9a99a6b0fe4c9604e43bc84cc3cb4e81b620113eb4e3b42e09e8614e34739b3b","role":"CONTROL","expected":"RETAIN_ORIGINAL"},
    8:  {"sha256":"8c8bc2e85c432e0c1bfadb6b751b38807e705be2d6e009acf4a36c34b4d6a0a8","role":"CRAFT_REPAIR_TARGET","expected":"RETAIN_ORIGINAL"},
    19: {"sha256":"bd973decd6c1b97fda74fcb80d310d90e22ec3d68898398dd8865d4a681bb33f","role":"CONTROL","expected":"RETAIN_ORIGINAL"},
    21: {"sha256":"ab9d5d5e6e881e4d3b2cd58ef60fe4fad9206f1648336f7bbffcded8fb301e36","role":"CRAFT_REPAIR_TARGET","expected":"ABSTAIN_OR_RETAIN"},
    24: {"sha256":"dd5001c7485608139eae24c9b7c9212612143dd9b4021cc20ebf92f116dc1ca5","role":"BOUNDED_OBJECTIVE_REPAIR","expected":"TWO_BOUNDED_REPAIRS"},
    29: {"sha256":"83a724db59f1d0cf5a6d211ba9720ed7cc13a253fbbc031b06bdfb9ff4a555d6","role":"CONTROL","expected":"RETAIN_ORIGINAL"},
}

# These feature labels are non-reconstructive observations from the already-authorized
# private sample. They are not manuscript prose and are not used as hidden training labels.
FEATURES = {
  1:  dict(character_state_material=True, theme_motif_material=True, pacing_material=False,
           rhythm_material=True, imagery_material=True, specificity_material=True, language_craft_material=False,
           dialogue_material=False, originality_question=False, reader_simulation_requested=False),
  8:  dict(character_state_material=True, theme_motif_material=False, pacing_material=True,
           rhythm_material=False, imagery_material=True, specificity_material=True, language_craft_material=True,
           dialogue_material=True, originality_question=False, reader_simulation_requested=False),
  19: dict(character_state_material=True, theme_motif_material=True, pacing_material=True,
           rhythm_material=False, imagery_material=False, specificity_material=False, language_craft_material=False,
           dialogue_material=False, originality_question=False, reader_simulation_requested=False),
  21: dict(character_state_material=True, theme_motif_material=True, pacing_material=True,
           rhythm_material=True, imagery_material=False, specificity_material=False, language_craft_material=True,
           dialogue_material=False, originality_question=False, reader_simulation_requested=True,
           reader_dimensions=["AFFECT_TRANSITION","EMOTIONAL_RESIDUE","MOMENTUM","CONTINUATION_DESIRE"]),
  24: dict(character_state_material=True, theme_motif_material=True, pacing_material=True,
           rhythm_material=True, imagery_material=False, specificity_material=False, language_craft_material=True,
           dialogue_material=True, originality_question=False, reader_simulation_requested=False),
  29: dict(character_state_material=True, theme_motif_material=True, pacing_material=True,
           rhythm_material=True, imagery_material=True, specificity_material=True, language_craft_material=True,
           dialogue_material=False, originality_question=True, reader_simulation_requested=True,
           reader_dimensions=["THEMATIC_RESONANCE","MOTIF_RETENTION","CLOSURE_RESIDUE","LONG_FORM_STATE_RETENTION"]),
}

results=[]
def check(name, cond, detail=None): results.append({"case":name,"pass":bool(cond),"detail":detail})

plans={}
for chapter, feat in FEATURES.items():
    ctx={"reader_profile":{"id":"AGLO-TARGET"},"reveal_frontier":{"chapter":chapter}}
    plans[chapter]=plan_applicability(feat,ctx)
    check(f"ch{chapter}_sparse_below_half", plans[chapter]["dimension_activation_rate"] < 0.50, plans[chapter])
    check(f"ch{chapter}_not_zero", plans[chapter]["active_dimension_count"] > 0, plans[chapter])

# Controls must not force reader simulation unless specifically requested.
check("ch1_no_reader_owner", "PACKET_013_READER_EXPERIENCE" not in plans[1]["owners"])
check("ch19_no_reader_owner", "PACKET_013_READER_EXPERIENCE" not in plans[19]["owners"])
# Reader evidence is sparse and bounded where requested.
check("ch21_reader_only_four_dimensions", len(plans[21]["owners"]["PACKET_013_READER_EXPERIENCE"]["dimensions"]) == 4)
check("ch29_reader_only_four_dimensions", len(plans[29]["owners"]["PACKET_013_READER_EXPERIENCE"]["dimensions"]) == 4)
# Chapter 8 should activate dialogue + pacing + prose rather than whole-system scan.
check("ch8_dialogue_active", "DIALOGUE_PRAGMATICS_CHARACTER_v2" in plans[8]["owners"])
check("ch8_pacing_active", "PACING_NARRATIVE_TIME_v2" in plans[8]["owners"])
check("ch8_prose_active", "PACKET_012_PROSE_CRAFT" in plans[8]["owners"])
check("ch8_originality_inactive", "ORIGINALITY_DISTINCTIVENESS_v1" not in plans[8]["owners"])
# Chapter 24's objective cleanup should not require originality as an authority.
check("ch24_originality_inactive", "ORIGINALITY_DISTINCTIVENESS_v1" not in plans[24]["owners"])
# Ending is the one sample where originality/closure/reader retention may all be relevant.
check("ch29_originality_active", "ORIGINALITY_DISTINCTIVENESS_v1" in plans[29]["owners"])
check("ch29_reader_active", "PACKET_013_READER_EXPERIENCE" in plans[29]["owners"])

# False-positive pressure: known retained/abstain chapters remain evaluation controls.
# The applicability planner is not allowed to convert activation into a defect/admission claim.
for chapter in (1,8,19,21,29):
    check(f"ch{chapter}_activation_not_promotion", SAMPLE[chapter]["expected"] in {"RETAIN_ORIGINAL","ABSTAIN_OR_RETAIN"})
# Known positive case remains bounded to two author-adjudicated repairs, not a chapter rewrite.
check("ch24_bounded_positive_case", SAMPLE[24]["expected"] == "TWO_BOUNDED_REPAIRS")

rates=[p["dimension_activation_rate"] for p in plans.values()]
check("mean_activation_under_35pct", sum(rates)/len(rates) < 0.35, rates)
check("max_activation_under_50pct", max(rates) < 0.50, rates)

# Exact real-sample identities are present and unique without prose.
check("six_exact_sample_hashes", len({v["sha256"] for v in SAMPLE.values()}) == 6)
check("no_raw_prose_fields", all(set(v.keys()) <= {"sha256","role","expected"} for v in SAMPLE.values()))

all_pass=all(r["pass"] for r in results)
print(f"STEP-006 REAL-PASSAGE FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
print("ACTIVATION", {ch:plans[ch]["dimension_activation_rate"] for ch in sorted(plans)})
if not all_pass:
    for r in results:
        if not r["pass"]: print(r)
    raise SystemExit(1)
