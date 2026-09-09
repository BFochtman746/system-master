import json
from copy import deepcopy
from pathlib import Path
from closed_loop import run_closed_loop, apply_user_learning_event, validate_dependency_closures

ROOT = Path(__file__).parent
RAW_FIELDS = {"raw_text", "passage_text", "candidate_text", "original_text", "manuscript_text", "writer_rationale"}

BASE_METRICS = {
    "lexical_diversity": 0.70,
    "sentence_length_cv": 0.50,
    "rhetorical_top_share": 0.20,
    "metaphor_distinctiveness": 0.70,
    "dialogue_voice_separation": 0.80,
    "irregularity_retention": 0.70,
    "register_baseline_distance": 0.05,
    "cross_project_voice_similarity": 0.40,
    "generic_prestige_similarity": 0.30,
}


def base_spec():
    original = "He answered. [AFTERBEAT]He knew the answer had hurt her.[/AFTERBEAT] She looked away."
    state = {
        "identity": {"passage_id": "P-SYN-001", "project_id": "SYN-PROJECT", "book_id": "SYN-BOOK", "source_authority_status": "AUTHORIZED_SYNTHETIC"},
        "purpose_state": {"scene_or_chapter_function": "relationship-pressure beat"},
        "narrative_state": {"pov": "THIRD_LIMITED", "focalization": "HE", "pacing_target": "TIGHTEN", "information_release": "CONTROLLED"},
        "preservation_state": {"authorial_intent": "preserve restraint", "protected_language": ["He answered."], "canon_facts": ["answer hurt her"], "explicit_challenge_authorization": False},
        "reader_state": "reader should infer the hurt",
        "character_state": {"relationship_pressure": "strained", "continuity_constraints": ["she looks away"]},
        "voice_state": {"project_voice": "restrained", "book_voice": "close-third restraint", "development_frontier_authorized": False},
        "craft_state": {
            "current_strengths": ["restraint"],
            "candidate_opportunities": [{
                "opportunity_id": "OP1", "expected_impact": 0.9, "diagnostic_confidence": 0.9,
                "purpose_relevance": 1.0, "edit_budget_fit": 1.0, "preservation_risk": 0.05,
                "voice_risk": 0.05, "collateral_regression_risk": 0.05, "hard_risks": []
            }]
        }
    }
    signal = {
        "evidence_id": "F-E1", "specialist_id": "DIALOGUE_SUBTEXT", "finding_type": "LIMITATION",
        "opportunity_id": "OP1", "dimension": "dialogue_subtext", "claim": "afterbeat overexplains",
        "evidence_signals": ["explicit interpretation after dialogue"], "purpose_relevance": 1.0,
        "confidence": "HIGH", "severity": 0.7, "preservation_risk": 0.05, "voice_risk": 0.05,
        "collateral_regression_risk": 0.05, "scope_limit": "SURGICAL", "expected_impact": 0.9
    }
    pair = {
        "base_reference_state_id": "RS-SYN-1", "variant_reference_state_id": "RS-SYN-1",
        "source_class": "SYNTHETIC", "primary_technique": "DELETE_REDUNDANT_AFTERBEAT",
        "changed_dimensions": ["dialogue_subtext"], "base_id": "B1", "variant_id": "V1",
        "preservation_checks": {"meaning": True, "voice": True, "pov": True}, "effect_state": "SUPPORTED"
    }
    transform = {
        "transform_id": "T1", "applicable_opportunity_ids": ["OP1"], "operation": "DELETE_MARKED_AFTERBEAT",
        "scope_limit": "SURGICAL", "expected_effects": ["increase_subtext"],
        "preservation_obligations": ["meaning", "voice", "pov"], "foundry_pair": pair
    }
    defense = {
        "baseline_metrics": deepcopy(BASE_METRICS), "candidate_metrics": deepcopy(BASE_METRICS),
        "clean_control_metrics": deepcopy(BASE_METRICS), "project_holdout_metrics": deepcopy(BASE_METRICS),
        "edit_budget": {"used": 1, "allowed": 3}, "optimization_history": [], "protected_irregularity": False
    }
    return {
        "original_text": original,
        "passage_payload": {"state": state, "requested_scope": "SURGICAL", "max_opportunities": 3},
        "diagnostic_signals": [signal],
        "transform_catalog": [transform],
        "revision_requests": [{"request_id": "R1", "ambition_level": "LEVEL_1_SURGICAL", "opportunity_id": "OP1", "transform_id": "T1"}],
        "evaluation": {"preference": "CHALLENGER", "confidence": "HIGH"},
        "defense_case": defense,
        "learning_dimension": "dialogue_subtext",
        "learning_context": {"scene_function": "relationship-pressure beat", "pov": "THIRD_LIMITED"},
        "learning_timestamp": "2026-01-01T00:00:00+00:00",
        "ledger": []
    }


def no_raw_fields(ledger):
    return all(not (set(event) & RAW_FIELDS) for event in ledger)


def run(name, mutate=None, expected=None, stop_stage=None, check=None):
    spec = base_spec()
    if mutate:
        mutate(spec)
    try:
        result = run_closed_loop(spec)
        ok = True
        if expected is not None:
            ok = ok and result.get("disposition") == expected
        if stop_stage is not None:
            ok = ok and result.get("stop_stage") == stop_stage
        if check:
            ok = ok and bool(check(result, spec))
        return {"case_id": name, "pass": bool(ok), "disposition": result.get("disposition"), "stop_stage": result.get("stop_stage")}
    except Exception as exc:
        return {"case_id": name, "pass": False, "error": str(exc)}


results = []
results.append(run("happy_path_accept_and_learn", expected="ACCEPT_CANDIDATE", check=lambda r, s: len(r["ledger"]) == 1 and r["ledger"][0]["event_type"] == "STEP_I_ACCEPT_CANDIDATE"))
results.append(run("original_immutable", expected="ACCEPT_CANDIDATE", check=lambda r, s: r["original_unchanged"] is True))
results.append(run("learning_ledger_has_no_raw_text", expected="ACCEPT_CANDIDATE", check=lambda r, s: no_raw_fields(r["ledger"])))
results.append(run("dependency_closures_required", expected="ACCEPT_CANDIDATE", check=lambda r, s: all(validate_dependency_closures().values())))


def missing_context(s):
    s["passage_payload"]["state"]["preservation_state"]["canon_facts"] = []
results.append(run("missing_context_blocks_at_analysis", missing_context, "NO_ACTION", "ANALYZE", lambda r, s: len(r["ledger"]) == 0))


def no_opportunity(s):
    s["passage_payload"]["state"]["craft_state"]["candidate_opportunities"] = []
results.append(run("no_opportunity_no_action", no_opportunity, "NO_ACTION", "ANALYZE"))


def unselected_specialist(s):
    s["diagnostic_signals"][0]["opportunity_id"] = "OP2"
results.append(run("specialist_cannot_bypass_step_e_selection", unselected_specialist, "NO_ACTION", "DIAGNOSE", lambda r, s: "OP2" in r["trace"][-1].get("upstream_unselected_rejected", [])))


def specialist_rewrite(s):
    s["diagnostic_signals"][0]["rewrite_text"] = "rewrite"
results.append(run("specialist_rewrite_prohibited", specialist_rewrite, "NO_ACTION", "DIAGNOSE"))


def no_pair(s):
    s["transform_catalog"][0].pop("foundry_pair")
results.append(run("transform_requires_step_g_evidence", no_pair, "NO_ACTION", "RETRIEVE"))


def hard_negative_pair(s):
    s["transform_catalog"][0]["foundry_pair"]["changed_dimensions"] = ["canon"]
results.append(run("step_g_hard_negative_blocks_retrieval", hard_negative_pair, "NO_ACTION", "RETRIEVE"))


def wrong_opportunity_binding(s):
    s["transform_catalog"][0]["applicable_opportunity_ids"] = ["OP2"]
results.append(run("transform_cannot_bypass_opportunity_binding", wrong_opportunity_binding, "NO_ACTION", "RETRIEVE"))


def h_preservation(s):
    s["revision_requests"][0]["preservation_flags"] = ["canon_conflict"]
results.append(run("step_h_preservation_veto", h_preservation, "NO_ACTION", "REVISE"))


def position_bias(s):
    s["evaluation"]["preference"] = "POSITION_BIAS"
results.append(run("position_bias_retains_original_and_learns", position_bias, "RETAIN_ORIGINAL", "INDEPENDENT_EVALUATE", lambda r, s: len(r["ledger"]) == 1 and r["ledger"][0]["event_type"] == "STEP_I_RETAIN_ORIGINAL"))


def broken_blinding(s):
    s["evaluation"]["break_blinding"] = True
results.append(run("broken_blinding_abstains_without_learning", broken_blinding, "ABSTAIN_HUMAN_REVIEW", "INDEPENDENT_EVALUATE", lambda r, s: len(r["ledger"]) == 0))


def low_confidence(s):
    s["evaluation"]["orientation_confidence"] = "LOW"
results.append(run("low_confidence_retains_original", low_confidence, "RETAIN_ORIGINAL", "INDEPENDENT_EVALUATE"))


def writer_rationale(s):
    s["evaluation"]["inject_writer_rationale"] = True
results.append(run("writer_self_adjudication_abstains", writer_rationale, "ABSTAIN_HUMAN_REVIEW", "INDEPENDENT_EVALUATE"))


def eval_preservation(s):
    s["evaluation"]["regressions"] = [{"dimension": "canon", "status": "REGRESSION"}]
results.append(run("step_i_preservation_regression_rejects", eval_preservation, "REJECT_PRESERVATION_REGRESSION", "INDEPENDENT_EVALUATE"))


def no_swap(s):
    s["evaluation"]["omit_swap"] = True
results.append(run("missing_swap_abstains", no_swap, "ABSTAIN_HUMAN_REVIEW", "INDEPENDENT_EVALUATE"))


def k_hard(s):
    s["defense_case"]["candidate_metrics"]["dialogue_voice_separation"] = 0.50
results.append(run("step_k_hard_risk_overrides_step_i_accept", k_hard, "RETAIN_ORIGINAL", "HOMOGENIZATION_DEFENSE", lambda r, s: len(r["ledger"]) == 0))


def k_soft(s):
    s["defense_case"]["candidate_metrics"]["lexical_diversity"] = 0.50
results.append(run("step_k_soft_risk_abstains", k_soft, "ABSTAIN_HUMAN_REVIEW", "HOMOGENIZATION_DEFENSE", lambda r, s: len(r["ledger"]) == 0))


def k_missing(s):
    s["defense_case"].pop("project_holdout_metrics")
results.append(run("step_k_missing_evidence_fails_closed", k_missing, "RETAIN_ORIGINAL", "HOMOGENIZATION_DEFENSE", lambda r, s: len(r["ledger"]) == 0))


def user_retain(s):
    s["user_learning_event"] = {"event_type": "USER_RETAIN_ORIGINAL", "dimension": "dialogue_subtext", "direction": "RETAIN_ORIGINAL", "context": s["learning_context"], "subject_digest": "12345678"}
results.append(run("user_retain_original_overrides_machine_accept", user_retain, "RETAIN_ORIGINAL", None, lambda r, s: len(r["ledger"]) == 2 and next(iter(r["learning_state"]["current_preference"].values()))["source_event_type"] == "USER_RETAIN_ORIGINAL"))


def user_explicit(s):
    s["user_learning_event"] = {"event_type": "USER_EXPLICIT_PREFERENCE", "dimension": "dialogue_subtext", "direction": "PREFER_MORE_AMBIGUITY", "context": s["learning_context"], "subject_digest": "12345678"}
results.append(run("user_explicit_preference_outranks_machine", user_explicit, "ACCEPT_CANDIDATE", None, lambda r, s: next(iter(r["learning_state"]["current_preference"].values()))["authority"] == "USER_EXPLICIT"))

happy = run_closed_loop(base_spec())
ledger = happy["ledger"]
ledger2, state2, user_event = apply_user_learning_event(ledger, {"event_type": "USER_RETAIN_ORIGINAL", "dimension": "dialogue_subtext", "direction": "RETAIN_ORIGINAL", "context": {"scene_function": "relationship-pressure beat", "pov": "THIRD_LIMITED"}, "subject_digest": "12345678"})
ledger3, state3, revoke_event = apply_user_learning_event(ledger2, {"event_type": "USER_REVOKE_EVENT", "dimension": "dialogue_subtext", "direction": "REVOKE", "context": {"scene_function": "relationship-pressure beat", "pov": "THIRD_LIMITED"}, "subject_digest": "12345678", "revoked_event_id": user_event["event_id"]})
results.append({"case_id": "rollback_reveals_prior_machine_evidence", "pass": len(ledger3) == 3 and user_event["event_id"] in state3["revoked_event_ids"] and next(iter(state3["current_preference"].values()))["source_event_type"] == "STEP_I_ACCEPT_CANDIDATE", "disposition": "ROLLBACK_RECONSTRUCTED", "stop_stage": None})

try:
    apply_user_learning_event(ledger, {"event_type": "USER_RETAIN_ORIGINAL", "project_id": "OTHER-PROJECT", "dimension": "dialogue_subtext", "direction": "RETAIN_ORIGINAL", "subject_digest": "12345678"})
    project_boundary_ok = False
except ValueError as exc:
    project_boundary_ok = str(exc) == "PROJECT_BOUNDARY_MISMATCH"
results.append({"case_id": "learning_project_boundary_enforced", "pass": project_boundary_ok, "disposition": "ERROR_EXPECTED", "stop_stage": "LEARN"})

try:
    apply_user_learning_event(ledger, {"event_type": "USER_EXPLICIT_PREFERENCE", "dimension": "dialogue_subtext", "direction": "IMITATE", "subject_digest": "12345678", "named_author_target": "Named Author"})
    named_author_ok = False
except ValueError as exc:
    named_author_ok = str(exc) == "NAMED_AUTHOR_TARGET_REJECTED"
results.append({"case_id": "learning_named_author_target_rejected", "pass": named_author_ok, "disposition": "ERROR_EXPECTED", "stop_stage": "LEARN"})

same1 = run_closed_loop(base_spec())
same2 = run_closed_loop(base_spec())
results.append({"case_id": "deterministic_closed_loop_identity", "pass": same1.get("accepted_candidate_digest") == same2.get("accepted_candidate_digest") and same1["ledger"][0]["event_id"] == same2["ledger"][0]["event_id"] and same1["learning_state"]["history_digest"] == same2["learning_state"]["history_digest"], "disposition": "DETERMINISTIC", "stop_stage": None})

errors = [row for row in results if not row["pass"]]
evidence = {
    "qualification_id": "LITERARY-PROSE-ENGINE-001-STEP-L-CLOSED-LOOP-QUALIFICATION",
    "standing": "PASS" if not errors else "FAIL",
    "fixture_count": len(results),
    "results": results,
    "errors": errors,
    "dependency_closures_required": sorted(validate_dependency_closures()),
    "cross_stage_authority_enforced": True,
    "writer_evaluator_separation": True,
    "homogenization_defense_cannot_be_bypassed": True,
    "user_authority_precedence_preserved": True,
    "rollback_reconstructible": True,
    "raw_manuscript_text_persisted_to_learning_evidence": False,
    "named_author_target_allowed": False,
    "universal_prose_score": False,
    "synthetic_only": True,
    "a01_required": False
}
(ROOT / "STEP-L-QUALIFICATION-EVIDENCE.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
print(f"STEP-L FIXTURES: {'PASS' if not errors else 'FAIL'} ({len(results)} cases)")
if errors:
    print(json.dumps(errors, indent=2))
    raise SystemExit(1)
