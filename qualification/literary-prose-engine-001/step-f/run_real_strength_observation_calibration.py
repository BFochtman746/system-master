#!/usr/bin/env python3
"""Qualify purpose-relative STRENGTH versus OBSERVATION/ABSTENTION on real-derived evidence.

The real-derived fixture is nonreconstructive and model-calibrated. This test proves
classification behavior only. It does not establish human/editor semantic ground truth,
real limitation accuracy, or revision superiority.
"""
from __future__ import annotations

import json
from pathlib import Path

from step_007_finding_calibration import calibrate_finding, calibrate_batch

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "REAL-MOSES-UNHINDERED-STRENGTH-OBSERVATION-CALIBRATION-v1.json"


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def base(**overrides):
    record = {
        "evidence_id": "SYNTH-STRENGTH",
        "dimension": "CADENCE_INTENT",
        "specialist_id": "PACKET_012_PROSE_CRAFT",
        "activation_status": "ACTIVE",
        "feature_detected": True,
        "confidence": 0.85,
        "severity": 0.0,
        "preservation_risk": 0.0,
        "voice_risk": 0.0,
        "collateral_regression_risk": 0.0,
        "opportunity_id": "SHOULD_NOT_SURVIVE",
    }
    record.update(overrides)
    return record


# Core STRENGTH boundary: paired support + purpose fit, confidence floor, never revision eligible.
r = calibrate_finding(base(functional_support_evidence=True, purpose_fit_evidence=True))
check(r["classification"] == "STRENGTH", "paired support+fit did not become STRENGTH")
check(r["disposition"] == "PRESERVE_STRENGTH", "strength disposition wrong")
check(r["revision_eligible"] is False and r["opportunity_id"] is None, "strength leaked revision authority")

# One-sided evidence remains descriptive rather than flattering by default.
r = calibrate_finding(base(functional_support_evidence=True))
check(r["classification"] == "OBSERVATION" and r["disposition"] == "RETAIN_ORIGINAL", "support alone should remain observation")
r = calibrate_finding(base(purpose_fit_evidence=True))
check(r["classification"] == "OBSERVATION" and r["disposition"] == "RETAIN_ORIGINAL", "purpose fit alone should remain observation")

# Low confidence and unresolved upstream semantics must abstain.
r = calibrate_finding(base(functional_support_evidence=True, purpose_fit_evidence=True, confidence=0.55))
check(r["classification"] == "OBSERVATION" and r["disposition"] == "ABSTAIN_REVIEW", "low-confidence strength should abstain")
r = calibrate_finding(base(semantic_unresolved=True, provider_disposition="UNRESOLVED", confidence=0.57))
check(r["classification"] == "OBSERVATION" and r["disposition"] == "ABSTAIN_REVIEW", "upstream unresolved evidence was upgraded")

# Conflicting positive/negative evidence cannot be silently resolved into either praise or criticism.
r = calibrate_finding(base(functional_support_evidence=True, purpose_fit_evidence=True, functional_harm_evidence=True))
check(r["classification"] == "OBSERVATION" and r["disposition"] == "ABSTAIN_REVIEW", "support/harm conflict should abstain")
r = calibrate_finding(base(functional_support_evidence=True, purpose_fit_evidence=True, purpose_miss_evidence=True))
check(r["classification"] == "OBSERVATION" and r["disposition"] == "ABSTAIN_REVIEW", "fit/miss conflict should abstain")

# Explicit protected/intentional evidence remains the stronger preservation authority.
r = calibrate_finding(base(functional_support_evidence=True, purpose_fit_evidence=True, protected_evidence=True))
check(r["classification"] == "INTENTIONAL_FEATURE" and r["revision_eligible"] is False, "protected evidence lost precedence")

fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
check(fixture.get("raw_prose_present") is False, "real fixture contains raw prose")
check(fixture.get("candidate_prose_present") is False, "real fixture contains candidate prose")
check(fixture.get("human_editor_ground_truth") is False, "fixture overclaims human/editor ground truth")
check(fixture.get("author_label_ground_truth") is False, "fixture overclaims author ground truth")

raw_findings = []
results = []
for case in fixture.get("cases") or []:
    finding = dict(case["finding"])
    finding.setdefault("activation_status", "ACTIVE")
    finding.setdefault("severity", 0.0)
    finding.setdefault("preservation_risk", 0.0)
    finding.setdefault("voice_risk", 0.0)
    finding.setdefault("collateral_regression_risk", 0.0)
    raw_findings.append(finding)
    calibrated = calibrate_finding(finding)
    expected = case["expected"]
    if expected == "ABSTAIN_REVIEW":
        check(calibrated["disposition"] == "ABSTAIN_REVIEW", f"{case['source_id']}: expected abstention, got {calibrated}")
    else:
        check(calibrated["classification"] == expected, f"{case['source_id']}: expected {expected}, got {calibrated}")
        if expected == "OBSERVATION":
            check(calibrated["disposition"] == "RETAIN_ORIGINAL", f"{case['source_id']}: observation should retain original")
    check(calibrated["revision_eligible"] is False, f"{case['source_id']}: real model-calibration finding gained revision eligibility")
    results.append(calibrated)

batch = calibrate_batch(raw_findings)
expected = fixture["expected_counts"]
check(batch["counts"]["STRENGTH"] == expected["STRENGTH"], f"strength count mismatch: {batch}")
check(sum(1 for r in results if r["classification"] == "OBSERVATION" and r["disposition"] == "RETAIN_ORIGINAL") == expected["OBSERVATION_RETAIN"], "observation-retain count mismatch")
check(sum(1 for r in results if r["disposition"] == "ABSTAIN_REVIEW") == expected["ABSTAIN_REVIEW"], "abstention count mismatch")
check(batch["counts"]["LIMITATION"] == expected["LIMITATION"], "a real limitation was invented")
check(batch["revision_eligible_count"] == expected["REVISION_ELIGIBLE"], "real calibration leaked revision eligibility")

summary = {
    "objective": fixture["objective"],
    "fixture_id": fixture["fixture_id"],
    "real_derived_finding_count": len(results),
    "strength_count": batch["counts"]["STRENGTH"],
    "observation_retain_count": sum(1 for r in results if r["classification"] == "OBSERVATION" and r["disposition"] == "RETAIN_ORIGINAL"),
    "abstain_review_count": sum(1 for r in results if r["disposition"] == "ABSTAIN_REVIEW"),
    "limitation_count": batch["counts"]["LIMITATION"],
    "revision_eligible_count": batch["revision_eligible_count"],
    "human_editor_ground_truth": False,
    "author_label_ground_truth": False,
    "limitation_accuracy_claimed": False,
    "revision_superiority_claimed": False,
    "raw_prose_present": False,
    "candidate_prose_present": False,
    "standing": "PASS__REAL_STRENGTH_VS_OBSERVATION_CALIBRATION__NO_REAL_LIMITATION_GROUND_TRUTH_YET",
}
print(json.dumps(summary, sort_keys=True))
