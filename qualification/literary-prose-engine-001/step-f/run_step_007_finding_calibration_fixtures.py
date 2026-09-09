from step_007_finding_calibration import calibrate_finding, calibrate_batch


def base(**overrides):
    x = {
        "evidence_id": "E1",
        "dimension": "COMPRESSION",
        "specialist_id": "PACKET_012_PROSE_CRAFT",
        "activation_status": "ACTIVE",
        "feature_detected": True,
        "confidence": 0.8,
        "severity": 0.8,
        "preservation_risk": 0.1,
        "voice_risk": 0.1,
        "collateral_regression_risk": 0.1,
        "opportunity_id": "OP1",
    }
    x.update(overrides)
    return x

results=[]
def check(name, cond, detail=None):
    results.append({"case":name,"pass":bool(cond),"detail":detail})

# Core taxonomy: feature detection alone is never a defect.
r=calibrate_finding(base())
check("feature_only_observation", r["classification"]=="OBSERVATION", r)
check("feature_only_retain", r["disposition"]=="RETAIN_ORIGINAL", r)
check("feature_only_not_revision_eligible", not r["revision_eligible"], r)
check("feature_only_severity_capped", r["severity"]<=0.25, r)

r=calibrate_finding(base(feature_detected=False))
check("no_feature_no_finding", r["disposition"]=="NO_FINDING", r)

r=calibrate_finding(base(activation_status="BLOCKED_MISSING_CONTEXT"))
check("inactive_abstains", r["disposition"]=="ABSTAIN_INACTIVE_OR_MISSING_CONTEXT", r)

# Intentional/protected feature outranks generic optimization pressure.
for key in ("intentional_evidence","protected_evidence","author_preference_support"):
    r=calibrate_finding(base(**{key:True}, functional_harm_evidence=True, purpose_miss_evidence=True))
    check(f"{key}_intentional_feature", r["classification"]=="INTENTIONAL_FEATURE", r)
    check(f"{key}_not_revision_eligible", not r["revision_eligible"], r)

# Contradiction/disagreement forces review, not defect inflation.
for key in ("cross_authority_contradiction","material_disagreement"):
    r=calibrate_finding(base(**{key:True}, functional_harm_evidence=True, purpose_miss_evidence=True))
    check(f"{key}_observation", r["classification"]=="OBSERVATION", r)
    check(f"{key}_abstain", r["disposition"]=="ABSTAIN_REVIEW", r)

# Objective bounded repairs are the strongest opportunity class.
r=calibrate_finding(base(objective_defect_evidence=True,bounded_gain_evidence=True,independent_support=True,confidence=.95,preservation_risk=.05))
check("objective_bounded_opportunity", r["classification"]=="OPPORTUNITY", r)
check("objective_bounded_revision_eligible", r["revision_eligible"], r)
check("objective_bounded_opportunity_id_preserved", r["opportunity_id"]=="OP1", r)

r=calibrate_finding(base(objective_defect_evidence=True,bounded_gain_evidence=True,confidence=.6,preservation_risk=.05))
check("objective_low_confidence_not_opportunity", r["classification"]!="OPPORTUNITY", r)
check("objective_low_confidence_not_eligible", not r["revision_eligible"], r)

r=calibrate_finding(base(objective_defect_evidence=True,bounded_gain_evidence=True,confidence=.95,preservation_risk=.5))
check("objective_high_preservation_risk_not_opportunity", r["classification"]!="OPPORTUNITY", r)

# Limitation requires both demonstrated functional harm and purpose miss.
r=calibrate_finding(base(functional_harm_evidence=True,purpose_miss_evidence=True,confidence=.85,preservation_risk=.15))
check("demonstrated_limitation", r["classification"]=="LIMITATION", r)
check("demonstrated_limitation_eligible", r["revision_eligible"], r)

r=calibrate_finding(base(functional_harm_evidence=True,purpose_miss_evidence=False))
check("harm_without_purpose_miss_stays_observation", r["classification"]=="OBSERVATION", r)

r=calibrate_finding(base(functional_harm_evidence=False,purpose_miss_evidence=True))
check("purpose_miss_without_harm_stays_observation", r["classification"]=="OBSERVATION", r)

r=calibrate_finding(base(functional_harm_evidence=True,purpose_miss_evidence=True,confidence=.5,preservation_risk=.1))
check("low_confidence_limitation_abstains", r["classification"]=="LIMITATION" and not r["revision_eligible"], r)

r=calibrate_finding(base(functional_harm_evidence=True,purpose_miss_evidence=True,confidence=.9,preservation_risk=.6))
check("high_risk_limitation_abstains", r["classification"]=="LIMITATION" and not r["revision_eligible"], r)

# Risk is explicitly non-revision-eligible without demonstrated failure.
r=calibrate_finding(base(plausible_downside_evidence=True))
check("plausible_downside_risk", r["classification"]=="RISK", r)
check("risk_not_revision_eligible", not r["revision_eligible"], r)
check("risk_monitor_only", r["disposition"]=="MONITOR_OR_REVIEW", r)

# Prohibited specialist output fails closed before literary classification.
r=calibrate_finding(base(rewrite_text="rewrite"))
check("rewrite_blocked", r["disposition"]=="BLOCKED_PROHIBITED_SPECIALIST_OUTPUT", r)
r=calibrate_finding(base(named_author_target=True))
check("named_author_blocked", r["disposition"]=="BLOCKED_PROHIBITED_SPECIALIST_OUTPUT", r)

# Real-sample calibration roles: use only nonreconstructive findings/adjudication evidence.
real_cases = {
    "CH01_CONTROL_CADENCE": base(evidence_id="CH01-CAD", dimension="CADENCE_DISTINCTIVENESS", intentional_evidence=True, author_preference_support=True),
    "CH08_CLASSIFICATION_PRESSURE": base(evidence_id="CH08-PACE", dimension="INFORMATION_DENSITY", specialist_id="PACING_NARRATIVE_TIME_v2", plausible_downside_evidence=True, confidence=.65),
    "CH19_RETURN_ARC": base(evidence_id="CH19-ARC", dimension="ARC_PROGRESSION", specialist_id="CHARACTER_STATE_ARC_v2", intentional_evidence=True),
    "CH21_COMPRESSION": base(evidence_id="CH21-COMP", dimension="COMPRESSION", material_disagreement=True, plausible_downside_evidence=True, confidence=.7),
    "CH24_DUPLICATE": base(evidence_id="CH24-DUP", dimension="RHETORICAL_REPETITION", objective_defect_evidence=True, bounded_gain_evidence=True, independent_support=True, confidence=.98, preservation_risk=.02),
    "CH24_VARIANT": base(evidence_id="CH24-VAR", dimension="DISTINCTIVENESS", objective_defect_evidence=True, bounded_gain_evidence=True, independent_support=True, confidence=.9, preservation_risk=.08),
    "CH29_ENDING": base(evidence_id="CH29-END", dimension="ENDING_THEME_RESONANCE", specialist_id="THEME_SUBTEXT_MOTIF_v1", intentional_evidence=True, protected_evidence=True),
}
cal = {k:calibrate_finding(v) for k,v in real_cases.items()}
check("ch1_control_intentional", cal["CH01_CONTROL_CADENCE"]["classification"]=="INTENTIONAL_FEATURE", cal["CH01_CONTROL_CADENCE"])
check("ch8_risk_not_defect", cal["CH08_CLASSIFICATION_PRESSURE"]["classification"]=="RISK" and not cal["CH08_CLASSIFICATION_PRESSURE"]["revision_eligible"], cal["CH08_CLASSIFICATION_PRESSURE"])
check("ch19_control_intentional", cal["CH19_RETURN_ARC"]["classification"]=="INTENTIONAL_FEATURE", cal["CH19_RETURN_ARC"])
check("ch21_disagreement_abstains", cal["CH21_COMPRESSION"]["disposition"]=="ABSTAIN_REVIEW" and not cal["CH21_COMPRESSION"]["revision_eligible"], cal["CH21_COMPRESSION"])
check("ch24_duplicate_opportunity", cal["CH24_DUPLICATE"]["classification"]=="OPPORTUNITY" and cal["CH24_DUPLICATE"]["revision_eligible"], cal["CH24_DUPLICATE"])
check("ch24_variant_opportunity", cal["CH24_VARIANT"]["classification"]=="OPPORTUNITY" and cal["CH24_VARIANT"]["revision_eligible"], cal["CH24_VARIANT"])
check("ch29_ending_intentional", cal["CH29_ENDING"]["classification"]=="INTENTIONAL_FEATURE", cal["CH29_ENDING"])

batch=calibrate_batch(list(real_cases.values()))
check("real_sample_two_revision_eligible", batch["revision_eligible_count"]==2, batch)
check("real_sample_one_abstention", batch["abstention_count"]==1, batch)
check("real_sample_feature_detection_not_equal_revision", batch["feature_detected_count"]==7 and batch["revision_eligible_count"]==2, batch)
check("real_sample_intentional_features_preserved", batch["counts"]["INTENTIONAL_FEATURE"]==3, batch)

# Adversarial score/label injection cannot self-promote because requested label is ignored.
for requested in ("DEFECT","ERROR","LIMITATION","OPPORTUNITY","CRITICAL"):
    r=calibrate_finding(base(requested_classification=requested))
    check(f"requested_{requested.lower()}_ignored", r["classification"]=="OBSERVATION" and not r["revision_eligible"], r)

# Confidence/severity are bounded.
r=calibrate_finding(base(confidence=99,severity=99,plausible_downside_evidence=True))
check("confidence_clamped", r["confidence"]<=1.0, r)
check("severity_clamped", r["severity"]<=1.0, r)

all_pass=all(x["pass"] for x in results)
print(f"STEP-007 FINDING CALIBRATION FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
print("REAL_SAMPLE_COUNTS", batch["counts"], "ELIGIBLE", batch["revision_eligible_count"], "ABSTAIN", batch["abstention_count"])
if not all_pass:
    for x in results:
        if not x["pass"]: print(x)
    raise SystemExit(1)
