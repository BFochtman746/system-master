from copy import deepcopy
from overoptimization_defense import assess

BASE = {
    "lexical_diversity": 0.70, "sentence_length_cv": 0.50, "rhetorical_top_share": 0.20,
    "metaphor_distinctiveness": 0.70, "dialogue_voice_separation": 0.80, "irregularity_retention": 0.70,
    "register_baseline_distance": 0.05, "cross_project_voice_similarity": 0.40, "generic_prestige_similarity": 0.30
}


def case():
    return {
        "project_id": "P1", "baseline_metrics": deepcopy(BASE), "candidate_metrics": deepcopy(BASE),
        "clean_control_metrics": deepcopy(BASE), "project_holdout_metrics": deepcopy(BASE),
        "edit_budget": {"used": 1, "allowed": 3}, "optimization_history": [], "protected_irregularity": False
    }


tests = []


def add(name, mut, disposition, reason):
    c = case(); mut(c); tests.append((name, c, disposition, reason))


add("clean", lambda c: None, "PASS_DEFENSE_GATE", "NO_MATERIAL_HOMOGENIZATION_RISK")
add("lexical", lambda c: c["candidate_metrics"].__setitem__("lexical_diversity", 0.50), "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")
add("cadence", lambda c: c["candidate_metrics"].__setitem__("sentence_length_cv", 0.30), "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")
add("rhetoric", lambda c: c["candidate_metrics"].__setitem__("rhetorical_top_share", 0.50), "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")
add("metaphor", lambda c: c["candidate_metrics"].__setitem__("metaphor_distinctiveness", 0.45), "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")
add("dialogue_hard", lambda c: c["candidate_metrics"].__setitem__("dialogue_voice_separation", 0.50), "REJECT_OVEROPTIMIZATION", "HARD_HOMOGENIZATION_RISK")

def irregular(c):
    c["protected_irregularity"] = True; c["candidate_metrics"]["irregularity_retention"] = 0.40
add("protected_irregularity_hard", irregular, "REJECT_OVEROPTIMIZATION", "HARD_HOMOGENIZATION_RISK")
add("register", lambda c: c["candidate_metrics"].__setitem__("register_baseline_distance", 0.30), "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")
add("cross_project_hard", lambda c: c["candidate_metrics"].__setitem__("cross_project_voice_similarity", 0.85), "REJECT_OVEROPTIMIZATION", "HARD_HOMOGENIZATION_RISK")
add("prestige", lambda c: c["candidate_metrics"].__setitem__("generic_prestige_similarity", 0.80), "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")

def two(c):
    c["candidate_metrics"]["lexical_diversity"] = 0.50; c["candidate_metrics"]["sentence_length_cv"] = 0.30
add("multiple_soft", two, "RETAIN_ORIGINAL", "MULTIPLE_HOMOGENIZATION_RISKS")

def hist(c):
    c["optimization_history"] = [{"target_dimension": "clarity"}] * 7 + [{"target_dimension": "subtext"}]
add("single_dimension_history", hist, "ABSTAIN_HUMAN_REVIEW", "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW")
add("edit_budget", lambda c: c.__setitem__("edit_budget", {"used": 4, "allowed": 3}), "RETAIN_ORIGINAL", "EDIT_BUDGET_EXCEEDED")
add("named_author", lambda c: c.__setitem__("named_author_target", "X"), "REJECT_OVEROPTIMIZATION", "NAMED_AUTHOR_TARGET_REJECTED")
add("universal_score", lambda c: c.__setitem__("universal_prose_score", 0.9), "REJECT_OVEROPTIMIZATION", "UNIVERSAL_PROSE_SCORE_FORBIDDEN")

def nonprotected(c):
    c["candidate_metrics"]["irregularity_retention"] = 0.10
add("unprotected_irregularity_not_automatic_risk", nonprotected, "PASS_DEFENSE_GATE", "NO_MATERIAL_HOMOGENIZATION_RISK")

def contextual_control(c):
    c["clean_control_metrics"]["register_baseline_distance"] = 0.20; c["candidate_metrics"]["register_baseline_distance"] = 0.30
add("control_context_prevents_false_register_alarm", contextual_control, "PASS_DEFENSE_GATE", "NO_MATERIAL_HOMOGENIZATION_RISK")

def holdout_context(c):
    c["project_holdout_metrics"]["cross_project_voice_similarity"] = 0.75; c["candidate_metrics"]["cross_project_voice_similarity"] = 0.82
add("holdout_context_prevents_false_convergence_alarm", holdout_context, "PASS_DEFENSE_GATE", "NO_MATERIAL_HOMOGENIZATION_RISK")

results = []
for name, c, disposition, reason in tests:
    r = assess(c)
    results.append({"case_id": name, "pass": r["disposition"] == disposition and r["reason"] == reason, "disposition": r["disposition"], "reason": r["reason"]})

r1 = assess(case()); r2 = assess(case())
results.append({"case_id": "deterministic", "pass": r1["assessment_id"] == r2["assessment_id"], "disposition": r1["disposition"], "reason": r1["reason"]})


def expect_error(name, mutate, prefix):
    bad = case(); mutate(bad)
    try:
        assess(bad); ok = False; detail = "NO_ERROR"
    except ValueError as exc:
        ok = str(exc).startswith(prefix); detail = str(exc)
    results.append({"case_id": name, "pass": ok, "disposition": "ERROR", "reason": detail})

expect_error("missing_holdout_metric", lambda c: c["project_holdout_metrics"].pop("lexical_diversity"), "PROJECT_HOLDOUT_METRICS_MISSING")
expect_error("missing_clean_control_metric", lambda c: c["clean_control_metrics"].pop("lexical_diversity"), "CLEAN_CONTROL_METRICS_MISSING")
expect_error("missing_baseline_metric", lambda c: c["baseline_metrics"].pop("lexical_diversity"), "BASELINE_METRICS_MISSING")
expect_error("missing_candidate_metric", lambda c: c["candidate_metrics"].pop("lexical_diversity"), "CANDIDATE_METRICS_MISSING")
expect_error("missing_edit_budget", lambda c: c.pop("edit_budget"), "EDIT_BUDGET_EVIDENCE_REQUIRED")
expect_error("missing_optimization_history", lambda c: c.pop("optimization_history"), "OPTIMIZATION_HISTORY_EVIDENCE_REQUIRED")
expect_error("invalid_candidate_metric", lambda c: c["candidate_metrics"].__setitem__("lexical_diversity", "bad"), "CANDIDATE_METRICS_INVALID")
expect_error("invalid_optimization_history", lambda c: c.__setitem__("optimization_history", ["bad"]), "OPTIMIZATION_HISTORY_EVIDENCE_INVALID")

all_pass = all(x["pass"] for x in results)
print(f"STEP-K FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
if not all_pass:
    print([x for x in results if not x["pass"]]); raise SystemExit(1)
