import hashlib
import json

REQUIRED_METRICS = {
    "lexical_diversity", "sentence_length_cv", "rhetorical_top_share",
    "metaphor_distinctiveness", "dialogue_voice_separation", "irregularity_retention",
    "register_baseline_distance", "cross_project_voice_similarity",
    "generic_prestige_similarity"
}
HARD_RISKS = {
    "DIALOGUE_VOICE_COLLAPSE", "PROTECTED_IRREGULARITY_LOSS",
    "PROJECT_TO_PROJECT_VOICE_CONVERGENCE"
}


def _stable_id(payload):
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "HDEF-" + hashlib.sha256(raw).hexdigest()[:20]


def _require_metrics(name, obj):
    if not isinstance(obj, dict):
        raise ValueError(f"{name}_METRICS_REQUIRED")
    missing = sorted(REQUIRED_METRICS - set(obj))
    if missing:
        raise ValueError(f"{name}_METRICS_MISSING:" + ",".join(missing))


def assess(defense_case):
    baseline = defense_case.get("baseline_metrics")
    candidate = defense_case.get("candidate_metrics")
    control = defense_case.get("clean_control_metrics")
    holdout = defense_case.get("project_holdout_metrics")
    _require_metrics("BASELINE", baseline)
    _require_metrics("CANDIDATE", candidate)
    _require_metrics("CLEAN_CONTROL", control)
    _require_metrics("PROJECT_HOLDOUT", holdout)

    if defense_case.get("named_author_target"):
        return {"disposition": "REJECT_OVEROPTIMIZATION", "reason": "NAMED_AUTHOR_TARGET_REJECTED", "risks": ["NAMED_AUTHOR_TARGET"]}
    if defense_case.get("universal_prose_score") is not None:
        return {"disposition": "REJECT_OVEROPTIMIZATION", "reason": "UNIVERSAL_PROSE_SCORE_FORBIDDEN", "risks": ["UNIVERSAL_SCORE"]}

    edit = defense_case.get("edit_budget", {})
    if edit.get("used", 0) > edit.get("allowed", 0):
        return {"disposition": "RETAIN_ORIGINAL", "reason": "EDIT_BUDGET_EXCEEDED", "risks": ["EDIT_BUDGET_EXCEEDED"]}

    risks = []
    evidence = []

    def risk(code, observed, threshold, severity="SOFT"):
        risks.append(code)
        evidence.append({"risk": code, "observed": observed, "threshold": threshold, "severity": severity})

    if baseline["lexical_diversity"] > 0 and candidate["lexical_diversity"] < baseline["lexical_diversity"] * 0.80:
        risk("LEXICAL_DIVERSITY_COLLAPSE", candidate["lexical_diversity"], baseline["lexical_diversity"] * 0.80)
    if baseline["sentence_length_cv"] > 0 and candidate["sentence_length_cv"] < baseline["sentence_length_cv"] * 0.75:
        risk("CADENCE_CONVERGENCE", candidate["sentence_length_cv"], baseline["sentence_length_cv"] * 0.75)
    if candidate["rhetorical_top_share"] > max(0.45, baseline["rhetorical_top_share"] + 0.15):
        risk("RHETORICAL_CONSTRUCTION_SATURATION", candidate["rhetorical_top_share"], max(0.45, baseline["rhetorical_top_share"] + 0.15))
    if baseline["metaphor_distinctiveness"] > 0 and candidate["metaphor_distinctiveness"] < baseline["metaphor_distinctiveness"] * 0.70:
        risk("METAPHOR_NORMALIZATION", candidate["metaphor_distinctiveness"], baseline["metaphor_distinctiveness"] * 0.70)
    if baseline["dialogue_voice_separation"] > 0 and candidate["dialogue_voice_separation"] < baseline["dialogue_voice_separation"] * 0.70:
        risk("DIALOGUE_VOICE_COLLAPSE", candidate["dialogue_voice_separation"], baseline["dialogue_voice_separation"] * 0.70, "HARD")

    protected_irregularity = defense_case.get("protected_irregularity", False)
    if protected_irregularity and baseline["irregularity_retention"] > 0 and candidate["irregularity_retention"] < baseline["irregularity_retention"] * 0.65:
        risk("PROTECTED_IRREGULARITY_LOSS", candidate["irregularity_retention"], baseline["irregularity_retention"] * 0.65, "HARD")
    if candidate["register_baseline_distance"] > max(0.25, control["register_baseline_distance"] + 0.15):
        risk("REGISTER_DRIFT", candidate["register_baseline_distance"], max(0.25, control["register_baseline_distance"] + 0.15))
    if candidate["cross_project_voice_similarity"] > max(0.80, holdout["cross_project_voice_similarity"] + 0.12):
        risk("PROJECT_TO_PROJECT_VOICE_CONVERGENCE", candidate["cross_project_voice_similarity"], max(0.80, holdout["cross_project_voice_similarity"] + 0.12), "HARD")
    if candidate["generic_prestige_similarity"] > max(0.78, baseline["generic_prestige_similarity"] + 0.15):
        risk("GENERIC_PRESTIGE_PROSE_DRIFT", candidate["generic_prestige_similarity"], max(0.78, baseline["generic_prestige_similarity"] + 0.15))

    history = defense_case.get("optimization_history", [])
    if history:
        counts = {}
        for row in history:
            dimension = row.get("target_dimension")
            if dimension:
                counts[dimension] = counts.get(dimension, 0) + 1
        total = sum(counts.values())
        if total:
            dimension, count = max(counts.items(), key=lambda x: x[1])
            share = count / total
            if total >= 5 and share >= 0.70:
                risk("SINGLE_DIMENSION_OVEROPTIMIZATION", {"dimension": dimension, "share": round(share, 4)}, 0.70)

    hard = sorted(set(risks) & HARD_RISKS)
    soft = sorted(set(risks) - HARD_RISKS)
    base = {
        "assessment_id": _stable_id({
            "project_id": defense_case.get("project_id"), "baseline": baseline,
            "candidate": candidate, "control": control, "holdout": holdout,
            "history": history, "protected_irregularity": protected_irregularity
        }),
        "risks": risks,
        "risk_evidence": evidence,
        "hard_risks": hard,
        "soft_risks": soft,
        "universal_score_used": False,
        "baseline_relative": True
    }
    if hard:
        return {**base, "disposition": "REJECT_OVEROPTIMIZATION", "reason": "HARD_HOMOGENIZATION_RISK"}
    if len(soft) >= 2:
        return {**base, "disposition": "RETAIN_ORIGINAL", "reason": "MULTIPLE_HOMOGENIZATION_RISKS"}
    if len(soft) == 1:
        return {**base, "disposition": "ABSTAIN_HUMAN_REVIEW", "reason": "SINGLE_HOMOGENIZATION_RISK_REQUIRES_REVIEW"}
    return {**base, "disposition": "PASS_DEFENSE_GATE", "reason": "NO_MATERIAL_HOMOGENIZATION_RISK"}
