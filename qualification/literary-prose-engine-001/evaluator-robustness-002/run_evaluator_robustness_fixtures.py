from evaluator_robustness import analyze_trials


def trial(tid, axis="BASE", value="base", winner="CAND", left="ORIG", right="CAND", comparison="CMP1", confidence=.9, guards=None, **extra):
    x={
        "trial_id":tid,"comparison_id":comparison,"condition_axis":axis,"condition_value":value,
        "left_candidate_id":left,"right_candidate_id":right,"winner_candidate_id":winner,"confidence":confidence,
    }
    if guards is not None: x["candidate_guards"]=guards
    x.update(extra); return x

checks=[]
def check(name,cond,detail=None): checks.append({"case":name,"pass":bool(cond),"detail":detail})

stable=[trial("B1"),trial("B2",axis="REPEAT",value="r2"),trial("B3",axis="REPEAT",value="r3")]
r=analyze_trials(stable)
check("stable_repeat",r["standing"]=="STABLE" and r["automatic_comparison_eligible"],r)
check("never_promotes",r["promotion_authorized"] is False,r)
check("no_quality_score",r["literary_quality_score_emitted"] is False,r)
check("no_prose_persisted",r["candidate_prose_persisted"] is False,r)

# Repeated-run instability.
unstable=[trial("R1",winner="CAND"),trial("R2",axis="REPEAT",value="r2",winner="ORIG"),trial("R3",axis="REPEAT",value="r3",winner="TIE"),trial("R4",axis="REPEAT",value="r4",winner="CAND")]
r=analyze_trials(unstable)
check("repeat_instability_abstains",r["standing"]=="ABSTAIN_UNSTABLE" and not r["automatic_comparison_eligible"],r)

# Too few repeats cannot claim stability but does not fabricate failure.
r=analyze_trials([trial("S1"),trial("S2",axis="REPEAT",value="r2")])
check("insufficient_repeats_warn",r["standing"]=="STABLE" and any("INSUFFICIENT_REPEAT_TRIALS" in w for w in r["warnings"]),r)

# Position swap: same candidate winner is stable; left-position winner flipping identity is bias.
position_stable=[
    trial("P1",axis="POSITION",value="original_left",left="ORIG",right="CAND",winner="CAND"),
    trial("P2",axis="POSITION",value="candidate_left",left="CAND",right="ORIG",winner="CAND"),
]
r=analyze_trials(position_stable)
check("position_identity_stable",r["standing"]=="STABLE",r)
position_bias=[
    trial("P3",axis="POSITION",value="original_left",left="ORIG",right="CAND",winner="ORIG"),
    trial("P4",axis="POSITION",value="candidate_left",left="CAND",right="ORIG",winner="CAND"),
]
r=analyze_trials(position_bias)
check("position_bias_detected",r["standing"]=="REVIEW_BIAS" and any(f["axis"]=="POSITION" for f in r["bias_findings"]),r)

# Rubric-order permutation: use opaque order IDs only. Balanced orders must preserve
# material winner identity and stay within the configured confidence-span ceiling.
rubric_stable=[
    trial("RO1",axis="RUBRIC_ORDER",value="order_a",winner="CAND",confidence=.88),
    trial("RO2",axis="RUBRIC_ORDER",value="order_b",winner="CAND",confidence=.86),
    trial("RO3",axis="RUBRIC_ORDER",value="order_a",winner="CAND",confidence=.89),
    trial("RO4",axis="RUBRIC_ORDER",value="order_b",winner="CAND",confidence=.87),
]
r=analyze_trials(rubric_stable)
ro=r["comparison_reports"][0]["axis_reports"]["RUBRIC_ORDER"]
check("rubric_order_balanced_stable",r["standing"]=="STABLE" and ro["balanced"] is True and ro["confidence_span"]==.03,r)

rubric_outcome_flip=[
    trial("RO5",axis="RUBRIC_ORDER",value="order_a",winner="CAND",confidence=.88),
    trial("RO6",axis="RUBRIC_ORDER",value="order_b",winner="ORIG",confidence=.87),
    trial("RO7",axis="RUBRIC_ORDER",value="order_a",winner="CAND",confidence=.89),
    trial("RO8",axis="RUBRIC_ORDER",value="order_b",winner="ORIG",confidence=.86),
]
r=analyze_trials(rubric_outcome_flip)
check("rubric_order_outcome_bias_detected",r["standing"]=="REVIEW_BIAS" and any(f["axis"]=="RUBRIC_ORDER" and f["outcome_sensitive"] for f in r["bias_findings"]),r)

rubric_confidence_shift=[
    trial("RO9",axis="RUBRIC_ORDER",value="order_a",winner="CAND",confidence=.92),
    trial("RO10",axis="RUBRIC_ORDER",value="order_b",winner="CAND",confidence=.70),
    trial("RO11",axis="RUBRIC_ORDER",value="order_a",winner="CAND",confidence=.90),
    trial("RO12",axis="RUBRIC_ORDER",value="order_b",winner="CAND",confidence=.68),
]
r=analyze_trials(rubric_confidence_shift)
check("rubric_order_confidence_bias_detected",r["standing"]=="REVIEW_BIAS" and any(f["axis"]=="RUBRIC_ORDER" and f["confidence_sensitive"] and f["confidence_span"]==.24 for f in r["bias_findings"]),r)

rubric_unbalanced=[
    trial("RO13",axis="RUBRIC_ORDER",value="order_a",winner="CAND"),
    trial("RO14",axis="RUBRIC_ORDER",value="order_a",winner="CAND"),
    trial("RO15",axis="RUBRIC_ORDER",value="order_b",winner="CAND"),
]
r=analyze_trials(rubric_unbalanced)
check("rubric_order_unbalanced_fails_closed",r["standing"]=="INVALID" and any("RUBRIC_ORDER_UNBALANCED" in e for e in r["errors"]),r)

rubric_single_order=[
    trial("RO16",axis="RUBRIC_ORDER",value="order_a",winner="CAND"),
    trial("RO17",axis="RUBRIC_ORDER",value="order_a",winner="CAND"),
]
r=analyze_trials(rubric_single_order)
check("rubric_order_single_order_fails_closed",r["standing"]=="INVALID" and any("RUBRIC_ORDER_REQUIRES_MULTIPLE_ORDERS" in e for e in r["errors"]),r)

# Rubric-only counterfactuals: candidate pair and opaque evidence basis remain fixed while
# only the rubric-artifact variant changes. Balanced variants must preserve winner identity
# and stay within the configured confidence-span ceiling.
rubric_cf_stable=[
    trial("RC1",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",confidence=.88,evidence_basis_id="basis_v1"),
    trial("RC2",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND",confidence=.86,evidence_basis_id="basis_v1"),
    trial("RC3",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",confidence=.89,evidence_basis_id="basis_v1"),
    trial("RC4",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND",confidence=.87,evidence_basis_id="basis_v1"),
]
r=analyze_trials(rubric_cf_stable)
rc=r["comparison_reports"][0]["axis_reports"]["RUBRIC_COUNTERFACTUAL"]
check("rubric_counterfactual_balanced_stable",r["standing"]=="STABLE" and rc["balanced"] is True and rc["evidence_basis_invariant"] is True and rc["confidence_span"]==.03,r)

rubric_cf_outcome_flip=[
    trial("RC5",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",confidence=.88,evidence_basis_id="basis_v1"),
    trial("RC6",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="ORIG",confidence=.87,evidence_basis_id="basis_v1"),
    trial("RC7",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",confidence=.89,evidence_basis_id="basis_v1"),
    trial("RC8",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="ORIG",confidence=.86,evidence_basis_id="basis_v1"),
]
r=analyze_trials(rubric_cf_outcome_flip)
check("rubric_counterfactual_outcome_bias_detected",r["standing"]=="REVIEW_BIAS" and any(f["axis"]=="RUBRIC_COUNTERFACTUAL" and f["outcome_sensitive"] for f in r["bias_findings"]),r)

rubric_cf_confidence_shift=[
    trial("RC9",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",confidence=.92,evidence_basis_id="basis_v1"),
    trial("RC10",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND",confidence=.70,evidence_basis_id="basis_v1"),
    trial("RC11",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",confidence=.90,evidence_basis_id="basis_v1"),
    trial("RC12",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND",confidence=.68,evidence_basis_id="basis_v1"),
]
r=analyze_trials(rubric_cf_confidence_shift)
check("rubric_counterfactual_confidence_bias_detected",r["standing"]=="REVIEW_BIAS" and any(f["axis"]=="RUBRIC_COUNTERFACTUAL" and f["confidence_sensitive"] and f["confidence_span"]==.24 for f in r["bias_findings"]),r)

rubric_cf_unbalanced=[
    trial("RC13",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",evidence_basis_id="basis_v1"),
    trial("RC14",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",evidence_basis_id="basis_v1"),
    trial("RC15",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND",evidence_basis_id="basis_v1"),
]
r=analyze_trials(rubric_cf_unbalanced)
check("rubric_counterfactual_unbalanced_fails_closed",r["standing"]=="INVALID" and any("RUBRIC_COUNTERFACTUAL_UNBALANCED" in e for e in r["errors"]),r)

rubric_cf_single=[
    trial("RC16",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",evidence_basis_id="basis_v1"),
    trial("RC17",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",evidence_basis_id="basis_v1"),
]
r=analyze_trials(rubric_cf_single)
check("rubric_counterfactual_single_variant_fails_closed",r["standing"]=="INVALID" and any("RUBRIC_COUNTERFACTUAL_REQUIRES_MULTIPLE_VARIANTS" in e for e in r["errors"]),r)

rubric_cf_missing_basis=[
    trial("RC18",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND"),
    trial("RC19",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND"),
]
r=analyze_trials(rubric_cf_missing_basis)
check("rubric_counterfactual_missing_basis_fails_closed",r["standing"]=="INVALID" and any("RUBRIC_COUNTERFACTUAL_EVIDENCE_BASIS_REQUIRED" in e for e in r["errors"]),r)

rubric_cf_basis_drift=[
    trial("RC20",axis="RUBRIC_COUNTERFACTUAL",value="variant_a",winner="CAND",evidence_basis_id="basis_v1"),
    trial("RC21",axis="RUBRIC_COUNTERFACTUAL",value="variant_b",winner="CAND",evidence_basis_id="basis_v2"),
]
r=analyze_trials(rubric_cf_basis_drift)
check("rubric_counterfactual_basis_drift_fails_closed",r["standing"]=="INVALID" and any("RUBRIC_COUNTERFACTUAL_EVIDENCE_BASIS_DRIFT" in e for e in r["errors"]),r)

# Identity reveal, score range, uncertainty markers and belief-contrast sensitivity.
for axis,values in [
    ("GENERATOR_IDENTITY",("hidden","revealed")),
    ("SCORE_RANGE",("1-5","1-100")),
    ("UNCERTAINTY_MARKER",("marker_absent","marker_present")),
    ("BELIEF_CONTRAST",("stance_a","stance_b")),
]:
    records=[trial(f"{axis}1",axis=axis,value=values[0],winner="ORIG"),trial(f"{axis}2",axis=axis,value=values[1],winner="CAND")]
    rr=analyze_trials(records)
    check(f"{axis.lower()}_sensitivity",rr["standing"]=="REVIEW_BIAS" and any(f["axis"]==axis for f in rr["bias_findings"]),rr)
    records=[trial(f"{axis}3",axis=axis,value=values[0],winner="CAND"),trial(f"{axis}4",axis=axis,value=values[1],winner="CAND")]
    rr=analyze_trials(records)
    check(f"{axis.lower()}_stable_identity",rr["standing"]=="STABLE",rr)

# Preservation/story-function veto overrides surface judge preference.
all_story={"preservation_pass":True,"story_function_preserved":True,"event_preserved":True,"character_preserved":True,"narrative_function_preserved":True}
guards={"ORIG":dict(all_story),"CAND":{**all_story,"preservation_pass":False}}
r=analyze_trials([trial("V1",axis="STYLE_VS_STORY",value="surface_preference",winner="CAND",guards=guards)])
check("preservation_veto",r["standing"]=="PRESERVATION_VETO" and any(x["reason"]=="WINNER_FAILS_PRESERVATION" for x in r["preservation_veto_findings"]),r)

guards={"ORIG":dict(all_story),"CAND":{**all_story,"story_function_preserved":False,"narrative_function_preserved":False}}
r=analyze_trials([trial("V2",axis="STYLE_VS_STORY",value="style_boost",winner="CAND",guards=guards)])
check("style_over_story_veto",r["standing"]=="PRESERVATION_VETO" and any(x["reason"]=="STYLE_WINNER_FAILS_STORY_FUNCTION" for x in r["preservation_veto_findings"]) and any(x["reason"]=="STYLE_WINNER_FAILS_NARRATIVE_FUNCTION_PRESERVATION" for x in r["preservation_veto_findings"]),r)

# If preferred candidate preserves story and all explicit story dimensions, style improvement is not automatically rejected.
guards={"ORIG":dict(all_story),"CAND":dict(all_story)}
r=analyze_trials([trial("V3",axis="STYLE_VS_STORY",value="style_and_story",winner="CAND",guards=guards)])
check("style_without_story_loss_allowed",r["standing"]=="STABLE" and r["style_preservation_dimensions"]==["character_preserved","event_preserved","narrative_function_preserved"],r)

# Surface preference must not hide event or character damage.
guards={"ORIG":dict(all_story),"CAND":{**all_story,"event_preserved":False}}
r=analyze_trials([trial("V4",axis="STYLE_VS_STORY",value="style_event_loss",winner="CAND",guards=guards)])
check("style_event_loss_veto",r["standing"]=="PRESERVATION_VETO" and any(x["reason"]=="STYLE_WINNER_FAILS_EVENT_PRESERVATION" for x in r["preservation_veto_findings"]),r)

guards={"ORIG":dict(all_story),"CAND":{**all_story,"character_preserved":False}}
r=analyze_trials([trial("V5",axis="STYLE_VS_STORY",value="style_character_loss",winner="CAND",guards=guards)])
check("style_character_loss_veto",r["standing"]=="PRESERVATION_VETO" and any(x["reason"]=="STYLE_WINNER_FAILS_CHARACTER_PRESERVATION" for x in r["preservation_veto_findings"]),r)

# Missing explicit dimension evidence fails closed rather than silently treating surface preference as safe.
incomplete={"ORIG":dict(all_story),"CAND":dict(all_story)}
del incomplete["CAND"]["character_preserved"]
r=analyze_trials([trial("V6",axis="STYLE_VS_STORY",value="missing_guard",winner="CAND",guards=incomplete)])
check("style_missing_dimension_fails_closed",r["standing"]=="INVALID" and any("STYLE_PRESERVATION_GUARD_REQUIRED:V6:CAND:character_preserved"==e for e in r["errors"]),r)

# Tie and abstain are valid outcomes, not invalid data.
r=analyze_trials([trial("TIE1",winner="TIE")])
check("tie_valid",r["standing"]=="STABLE" and r["comparison_reports"][0]["tie_count"]==1,r)
r=analyze_trials([trial("ABS1",winner="ABSTAIN")])
check("abstain_valid",r["standing"]=="STABLE" and r["comparison_reports"][0]["abstain_count"]==1,r)

# Invalid trial metadata fails closed.
bad=trial("BAD1"); bad["winner_candidate_id"]="OTHER"
r=analyze_trials([bad]); check("invalid_winner",r["standing"]=="INVALID",r)
bad=trial("BAD2"); bad["confidence"]=1.2
r=analyze_trials([bad]); check("invalid_confidence",r["standing"]=="INVALID",r)
bad=trial("BAD3"); bad["condition_axis"]="PROSE_QUALITY_SCORE"
r=analyze_trials([bad]); check("invalid_axis",r["standing"]=="INVALID",r)
bad=trial("BAD4"); bad["left_candidate_id"]="CAND"; bad["right_candidate_id"]="CAND"
r=analyze_trials([bad]); check("same_candidate_pair_invalid",r["standing"]=="INVALID",r)
r=analyze_trials([trial("DUP"),trial("DUP",axis="REPEAT",value="r2")]); check("duplicate_trial_id",r["standing"]=="INVALID",r)

# Comparison identity may not drift to different candidates under the same experiment ID.
r=analyze_trials([trial("ID1"),trial("ID2",axis="REPEAT",value="r2",right="OTHER",winner="OTHER")])
check("comparison_identity_drift",r["standing"]=="INVALID" and any("COMPARISON_CANDIDATE_IDENTITY_DRIFT" in e for e in r["errors"]),r)

# Prose payload is forbidden even if analyzer could ignore it.
for key in ["raw_text","quoted_text","manuscript_text","source_text","passage_text","candidate_text","revision_text"]:
    x=trial(f"TXT-{key}"); x[key]="private candidate prose"
    r=analyze_trials([x])
    check(f"forbid_{key}",r["standing"]=="INVALID" and r["candidate_prose_persisted"],r)

# Threshold config itself is fail-closed.
r=analyze_trials(stable,repeat_identity_agreement_floor=.4); check("bad_repeat_floor",r["standing"]=="INVALID",r)
r=analyze_trials(stable,minimum_repeat_trials=1); check("bad_min_repeat",r["standing"]=="INVALID",r)
r=analyze_trials(stable,rubric_order_confidence_span_ceiling=1.1); check("bad_rubric_confidence_ceiling",r["standing"]=="INVALID",r)
r=analyze_trials(stable,rubric_counterfactual_confidence_span_ceiling=1.1); check("bad_rubric_counterfactual_confidence_ceiling",r["standing"]=="INVALID",r)

# Multiple comparisons remain separate; one unstable comparison removes auto eligibility globally.
records=[
    trial("M1",comparison="A",winner="CAND"),trial("M2",comparison="A",axis="REPEAT",value="r2",winner="CAND"),trial("M3",comparison="A",axis="REPEAT",value="r3",winner="CAND"),
    trial("M4",comparison="B",winner="ORIG"),trial("M5",comparison="B",axis="REPEAT",value="r2",winner="CAND"),trial("M6",comparison="B",axis="REPEAT",value="r3",winner="TIE"),
]
r=analyze_trials(records)
check("one_unstable_blocks_global_auto",r["standing"]=="ABSTAIN_UNSTABLE" and not r["automatic_comparison_eligible"],r)

all_pass=all(x["pass"] for x in checks)
print(f"EVALUATOR ROBUSTNESS FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(checks)} cases)")
if not all_pass:
    for x in checks:
        if not x["pass"]: print(x)
    raise SystemExit(1)
