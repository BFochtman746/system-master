"""Deterministic robustness analyzer for literary judge evidence.

The analyzer stores only comparison metadata, candidate IDs and outcomes. It does not
store candidate prose and it never turns judge reliability into literary-quality score.
"""

from collections import Counter, defaultdict

AXES = {"BASE", "REPEAT", "POSITION", "RUBRIC_ORDER", "RUBRIC_COUNTERFACTUAL", "GENERATOR_IDENTITY", "SCORE_RANGE", "UNCERTAINTY_MARKER", "BELIEF_CONTRAST", "STYLE_VS_STORY"}
NON_DECISIVE = {"TIE", "ABSTAIN"}
FORBIDDEN_TEXT_KEYS = {"raw_text", "quoted_text", "manuscript_text", "source_text", "passage_text", "candidate_text", "revision_text"}
BIAS_AXES = {"POSITION", "RUBRIC_ORDER", "RUBRIC_COUNTERFACTUAL", "GENERATOR_IDENTITY", "SCORE_RANGE", "UNCERTAINTY_MARKER", "BELIEF_CONTRAST"}
STYLE_PRESERVATION_DIMENSIONS = {
    "event_preserved": "STYLE_WINNER_FAILS_EVENT_PRESERVATION",
    "character_preserved": "STYLE_WINNER_FAILS_CHARACTER_PRESERVATION",
    "narrative_function_preserved": "STYLE_WINNER_FAILS_NARRATIVE_FUNCTION_PRESERVATION",
}


def _forbidden(value, path="$", out=None):
    out = out if out is not None else []
    if isinstance(value, dict):
        for key, child in value.items():
            p = f"{path}.{key}"
            if str(key).lower() in FORBIDDEN_TEXT_KEYS and child not in (None, ""):
                out.append(p)
            _forbidden(child, p, out)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            _forbidden(child, f"{path}[{i}]", out)
    return out


def _conf(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if 0.0 <= value <= 1.0 else None


def _winner_valid(trial):
    winner = trial.get("winner_candidate_id")
    return winner in {trial.get("left_candidate_id"), trial.get("right_candidate_id"), "TIE", "ABSTAIN"}


def _guard(trial, candidate_id):
    guards = trial.get("candidate_guards") or {}
    item = guards.get(candidate_id) if isinstance(guards, dict) else None
    return item if isinstance(item, dict) else {}


def analyze_trials(
    trials,
    repeat_identity_agreement_floor=0.8,
    minimum_repeat_trials=3,
    rubric_order_confidence_span_ceiling=0.15,
    rubric_counterfactual_confidence_span_ceiling=0.15,
):
    errors, warnings, bias_findings, veto_findings = [], [], [], []
    if not isinstance(trials, list):
        return {"standing": "INVALID", "errors": ["TRIALS_NOT_LIST"], "promotion_authorized": False}
    forbidden = _forbidden(trials)
    if forbidden:
        errors.extend(f"FORBIDDEN_PROSE_PAYLOAD:{p}" for p in forbidden)
    if not isinstance(minimum_repeat_trials, int) or minimum_repeat_trials < 2:
        errors.append("MINIMUM_REPEAT_TRIALS_INVALID")
    try:
        floor = float(repeat_identity_agreement_floor)
    except (TypeError, ValueError):
        floor = -1
    if not 0.5 <= floor <= 1.0:
        errors.append("REPEAT_AGREEMENT_FLOOR_INVALID")
    try:
        rubric_confidence_ceiling = float(rubric_order_confidence_span_ceiling)
    except (TypeError, ValueError):
        rubric_confidence_ceiling = -1
    if not 0.0 <= rubric_confidence_ceiling <= 1.0:
        errors.append("RUBRIC_ORDER_CONFIDENCE_SPAN_CEILING_INVALID")
    try:
        counterfactual_confidence_ceiling = float(rubric_counterfactual_confidence_span_ceiling)
    except (TypeError, ValueError):
        counterfactual_confidence_ceiling = -1
    if not 0.0 <= counterfactual_confidence_ceiling <= 1.0:
        errors.append("RUBRIC_COUNTERFACTUAL_CONFIDENCE_SPAN_CEILING_INVALID")

    seen_ids = set()
    normalized = []
    for i, trial in enumerate(trials):
        if not isinstance(trial, dict):
            errors.append(f"TRIAL_NOT_OBJECT:{i}")
            continue
        tid = trial.get("trial_id")
        cid = trial.get("comparison_id")
        axis = trial.get("condition_axis")
        left, right = trial.get("left_candidate_id"), trial.get("right_candidate_id")
        if not isinstance(tid, str) or not tid:
            errors.append(f"TRIAL_ID_REQUIRED:{i}")
        elif tid in seen_ids:
            errors.append(f"TRIAL_ID_DUPLICATE:{tid}")
        else:
            seen_ids.add(tid)
        if not isinstance(cid, str) or not cid:
            errors.append(f"COMPARISON_ID_REQUIRED:{tid or i}")
        if axis not in AXES:
            errors.append(f"CONDITION_AXIS_INVALID:{tid or i}")
        if not isinstance(trial.get("condition_value"), str) or not trial.get("condition_value"):
            errors.append(f"CONDITION_VALUE_REQUIRED:{tid or i}")
        if not isinstance(left, str) or not left or not isinstance(right, str) or not right or left == right:
            errors.append(f"CANDIDATE_PAIR_INVALID:{tid or i}")
        if not _winner_valid(trial):
            errors.append(f"WINNER_INVALID:{tid or i}")
        if _conf(trial.get("confidence")) is None:
            errors.append(f"CONFIDENCE_INVALID:{tid or i}")
        if axis == "RUBRIC_COUNTERFACTUAL":
            basis = trial.get("evidence_basis_id")
            if not isinstance(basis, str) or not basis:
                errors.append(f"RUBRIC_COUNTERFACTUAL_EVIDENCE_BASIS_REQUIRED:{tid or i}")
        if axis == "STYLE_VS_STORY" and _winner_valid(trial) and trial.get("winner_candidate_id") not in NON_DECISIVE:
            for candidate_id in (left, right):
                guard = _guard(trial, candidate_id)
                for field in STYLE_PRESERVATION_DIMENSIONS:
                    if not isinstance(guard.get(field), bool):
                        errors.append(f"STYLE_PRESERVATION_GUARD_REQUIRED:{tid or i}:{candidate_id}:{field}")
        normalized.append(trial)

    by_comparison = defaultdict(list)
    for trial in normalized:
        if trial.get("comparison_id"):
            by_comparison[trial["comparison_id"]].append(trial)

    comparison_reports = []
    unstable = False
    for comparison_id, group in sorted(by_comparison.items()):
        pair_sets = {tuple(sorted((t.get("left_candidate_id"), t.get("right_candidate_id")))) for t in group if t.get("left_candidate_id") and t.get("right_candidate_id")}
        if len(pair_sets) > 1:
            errors.append(f"COMPARISON_CANDIDATE_IDENTITY_DRIFT:{comparison_id}")

        repeat_trials = [t for t in group if t.get("condition_axis") in {"BASE", "REPEAT"}]
        repeat_outcomes = [t.get("winner_candidate_id") for t in repeat_trials]
        repeat_agreement = None
        if repeat_outcomes:
            repeat_agreement = max(Counter(repeat_outcomes).values()) / len(repeat_outcomes)
        repeat_stable = None
        if len(repeat_trials) >= minimum_repeat_trials:
            repeat_stable = repeat_agreement >= floor
            if not repeat_stable:
                unstable = True
        elif repeat_trials:
            warnings.append(f"INSUFFICIENT_REPEAT_TRIALS:{comparison_id}:{len(repeat_trials)}")

        axis_reports = {}
        for axis in sorted(BIAS_AXES):
            axis_trials = [t for t in group if t.get("condition_axis") == axis]
            outcomes = [t.get("winner_candidate_id") for t in axis_trials]
            condition_counts = Counter(t.get("condition_value") for t in axis_trials)
            condition_values = set(condition_counts)
            valid_confidences = [_conf(t.get("confidence")) for t in axis_trials]
            valid_confidences = [c for c in valid_confidences if c is not None]
            confidence_span = None
            if valid_confidences:
                confidence_span = max(valid_confidences) - min(valid_confidences)

            balanced = None
            evidence_basis_invariant = None
            if axis == "RUBRIC_ORDER" and axis_trials:
                balanced = len(condition_values) >= 2 and len(set(condition_counts.values())) == 1
                if len(condition_values) < 2:
                    errors.append(f"RUBRIC_ORDER_REQUIRES_MULTIPLE_ORDERS:{comparison_id}")
                elif not balanced:
                    errors.append(f"RUBRIC_ORDER_UNBALANCED:{comparison_id}")
            elif axis == "RUBRIC_COUNTERFACTUAL" and axis_trials:
                balanced = len(condition_values) >= 2 and len(set(condition_counts.values())) == 1
                if len(condition_values) < 2:
                    errors.append(f"RUBRIC_COUNTERFACTUAL_REQUIRES_MULTIPLE_VARIANTS:{comparison_id}")
                elif not balanced:
                    errors.append(f"RUBRIC_COUNTERFACTUAL_UNBALANCED:{comparison_id}")
                basis_ids = [t.get("evidence_basis_id") for t in axis_trials]
                basis_valid = all(isinstance(x, str) and x for x in basis_ids)
                evidence_basis_invariant = basis_valid and len(set(basis_ids)) == 1
                if basis_valid and not evidence_basis_invariant:
                    errors.append(f"RUBRIC_COUNTERFACTUAL_EVIDENCE_BASIS_DRIFT:{comparison_id}")

            evaluable = len(axis_trials) >= 2 and len(condition_values) >= 2
            if axis == "RUBRIC_ORDER":
                evaluable = evaluable and balanced is True
            elif axis == "RUBRIC_COUNTERFACTUAL":
                evaluable = evaluable and balanced is True and evidence_basis_invariant is True
            outcome_sensitive = evaluable and len(set(outcomes)) > 1
            confidence_ceiling = None
            if axis == "RUBRIC_ORDER":
                confidence_ceiling = rubric_confidence_ceiling
            elif axis == "RUBRIC_COUNTERFACTUAL":
                confidence_ceiling = counterfactual_confidence_ceiling
            confidence_sensitive = (
                confidence_ceiling is not None
                and evaluable
                and confidence_span is not None
                and confidence_span > confidence_ceiling
            )
            sensitive = outcome_sensitive or confidence_sensitive
            axis_reports[axis] = {
                "trial_count": len(axis_trials),
                "condition_count": len(condition_values),
                "condition_counts": dict(sorted(condition_counts.items())),
                "evaluable": evaluable,
                "outcomes": outcomes,
                "sensitive": sensitive,
                "outcome_sensitive": outcome_sensitive,
                "confidence_span": None if confidence_span is None else round(confidence_span, 4),
                "confidence_sensitive": confidence_sensitive,
                "balanced": balanced,
                "evidence_basis_invariant": evidence_basis_invariant,
            }
            if sensitive:
                finding = {"comparison_id": comparison_id, "axis": axis, "finding": f"{axis}_SENSITIVITY"}
                if confidence_ceiling is not None:
                    finding.update({
                        "outcome_sensitive": outcome_sensitive,
                        "confidence_sensitive": confidence_sensitive,
                        "confidence_span": None if confidence_span is None else round(confidence_span, 4),
                        "confidence_span_ceiling": confidence_ceiling,
                    })
                if axis == "RUBRIC_COUNTERFACTUAL":
                    finding["evidence_basis_invariant"] = evidence_basis_invariant
                bias_findings.append(finding)

        for t in group:
            winner = t.get("winner_candidate_id")
            if winner in NON_DECISIVE or winner not in {t.get("left_candidate_id"), t.get("right_candidate_id")}:
                continue
            loser = t.get("right_candidate_id") if winner == t.get("left_candidate_id") else t.get("left_candidate_id")
            wg, lg = _guard(t, winner), _guard(t, loser)
            winner_preservation = wg.get("preservation_pass")
            loser_preservation = lg.get("preservation_pass")
            winner_story = wg.get("story_function_preserved")
            loser_story = lg.get("story_function_preserved")
            if winner_preservation is False and loser_preservation is True:
                veto_findings.append({"trial_id": t.get("trial_id"), "comparison_id": comparison_id, "reason": "WINNER_FAILS_PRESERVATION"})
            if t.get("condition_axis") == "STYLE_VS_STORY":
                if winner_story is False and loser_story is True:
                    veto_findings.append({"trial_id": t.get("trial_id"), "comparison_id": comparison_id, "reason": "STYLE_WINNER_FAILS_STORY_FUNCTION"})
                for field, reason in STYLE_PRESERVATION_DIMENSIONS.items():
                    if wg.get(field) is False:
                        veto_findings.append({"trial_id": t.get("trial_id"), "comparison_id": comparison_id, "reason": reason, "dimension": field})

        comparison_reports.append({
            "comparison_id": comparison_id,
            "trial_count": len(group),
            "repeat_trial_count": len(repeat_trials),
            "repeat_identity_agreement": None if repeat_agreement is None else round(repeat_agreement, 4),
            "repeat_stable": repeat_stable,
            "tie_count": sum(t.get("winner_candidate_id") == "TIE" for t in group),
            "abstain_count": sum(t.get("winner_candidate_id") == "ABSTAIN" for t in group),
            "axis_reports": axis_reports,
        })

    if errors:
        standing = "INVALID"
    elif veto_findings:
        standing = "PRESERVATION_VETO"
    elif unstable:
        standing = "ABSTAIN_UNSTABLE"
    elif bias_findings:
        standing = "REVIEW_BIAS"
    else:
        standing = "STABLE"

    return {
        "standing": standing,
        "errors": sorted(set(errors)),
        "warnings": sorted(set(warnings)),
        "comparison_reports": comparison_reports,
        "bias_findings": bias_findings,
        "preservation_veto_findings": veto_findings,
        "trial_count": len(normalized),
        "automatic_comparison_eligible": standing == "STABLE",
        "promotion_authorized": False,
        "literary_quality_score_emitted": False,
        "candidate_prose_persisted": bool(forbidden),
        "style_preservation_dimensions": sorted(STYLE_PRESERVATION_DIMENSIONS),
        "rubric_order_confidence_span_ceiling": rubric_confidence_ceiling,
        "rubric_counterfactual_confidence_span_ceiling": counterfactual_confidence_ceiling,
    }
