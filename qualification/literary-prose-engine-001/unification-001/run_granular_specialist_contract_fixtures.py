import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTRACT = json.loads((ROOT / "GRANULAR-SPECIALIST-CONTRACTS-v1.json").read_text(encoding="utf-8"))

specialists = {s["specialist_id"]: s for s in CONTRACT["specialists"]}
results = []

def case(name, cond):
    results.append((name, bool(cond)))

case("five_specialists", len(specialists) == 5)
case("historical_reconstruction_false", CONTRACT["historical_reconstruction_claimed"] is False)
case("author_authority_non_bypassable", CONTRACT["authority_model"]["author_canon_intent"] == "NON_BYPASSABLE")
case("reader_authority_separate", "SEPARATE" in CONTRACT["authority_model"]["packet_013_reader_experience"])
case("step_k_non_bypassable", CONTRACT["authority_model"]["step_k_homogenization_defense"] == "NON_BYPASSABLE_DOWNSTREAM_GATE")

c = specialists["CHARACTER_STATE_ARC_v2"]
case("character_goal_belief_knowledge_intention", all(x in c["dimensions"] for x in ["ACTIVE_GOAL","BELIEF_STATE","KNOWLEDGE_STATE","INTENTION_COMMITMENT"]))
case("character_contradiction_not_auto_error", "contradiction_auto_error" in c["forbidden_shortcuts"])
case("character_requires_pov_boundary", "pov_knowledge_boundary" in c["required_context"])
case("character_abstention", len(c["must_abstain_when"]) >= 3)

d = specialists["DIALOGUE_PRAGMATICS_CHARACTER_v2"]
case("dialogue_pragmatics", all(x in d["dimensions"] for x in ["SPEECH_ACT","IMPLICATURE","POWER_STATUS","FACE_POLITENESS","EVASION","INTERRUPTION","SILENCE_AS_ACTION"]))
case("dialogue_info_asymmetry", "INFORMATION_ASYMMETRY" in d["dimensions"])
case("dialogue_no_generic_naturalness", "generic_naturalness_norm" in d["forbidden_shortcuts"])
case("dialogue_dialect_protection", "dialect_normalization" in d["forbidden_shortcuts"])

o = specialists["ORIGINALITY_DISTINCTIVENESS_v1"]
case("originality_has_context", "comparison_context_when_claiming_originality" in o["required_context"])
case("originality_not_rarity", "rarity_equals_originality" in o["forbidden_shortcuts"])
case("originality_not_randomness", "random_eccentricity_reward" in o["forbidden_shortcuts"])
case("originality_balances_effectiveness", "NOVELTY_EFFECTIVENESS_BALANCE" in o["dimensions"])
case("originality_model_default_defense", "MODEL_DEFAULT_CONVERGENCE" in o["dimensions"])

t = specialists["THEME_SUBTEXT_MOTIF_v1"]
case("theme_is_hypothesis", "THEME_HYPOTHESIS" in t["dimensions"] and "theme_as_authorial_fact" in t["forbidden_shortcuts"])
case("theme_subtext_chain", "SUBTEXT_INFERENCE_CHAIN" in t["dimensions"])
case("theme_plurality", "INTERPRETIVE_PLURALITY" in t["dimensions"])
case("theme_domain_truth_separate", "DOMAIN_TRUTH_SEPARATION" in t["dimensions"])
case("theme_abstention", len(t["must_abstain_when"]) >= 3)

p = specialists["PACING_NARRATIVE_TIME_v2"]
case("pacing_genette_axes", all(x in p["dimensions"] for x in ["TEMPORAL_ORDER","SCENE_DURATION","SUMMARY_DURATION","PAUSE_DURATION","ELLIPSIS_DURATION","EVENT_FREQUENCY"]))
case("pacing_information_latency", "INFORMATION_LATENCY" in p["dimensions"])
case("pacing_closure", "THREAD_CLOSURE_LOAD" in p["dimensions"])
case("pacing_reader_separate", "reader_state_evidence_only_as_separate_input" in p["required_context"])
case("pacing_not_faster", "faster_equals_better" in p["forbidden_shortcuts"])
case("pacing_not_tension", "tension_equals_pacing" in p["forbidden_shortcuts"])
case("pacing_local_global", "LOCAL_GLOBAL_PACING_REGRESSION" in p["dimensions"])

rules = CONTRACT["cross_specialist_rules"]
case("correlated_not_votes", any("not independent votes" in x for x in rules))
case("originality_cannot_override", any(x.startswith("Originality cannot override") for x in rules))
case("theme_cannot_override", any(x.startswith("Theme interpretation cannot override") for x in rules))
case("reader_response_not_text_truth", any("Reader-experience predictions" in x for x in rules))
case("level_zero_preserved", any("LEVEL_0_NO_CHANGE" in x for x in rules))

failed = [name for name, ok in results if not ok]
print(f"GRANULAR SPECIALIST CONTRACT FIXTURES: {'PASS' if not failed else 'FAIL'} ({len(results)} cases)")
if failed:
    print("FAILED:")
    for name in failed:
        print(name)
    raise SystemExit(1)
