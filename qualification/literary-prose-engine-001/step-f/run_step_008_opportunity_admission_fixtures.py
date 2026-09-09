from step_008_opportunity_admission import admit_opportunities


def finding(evidence_id="E1", opportunity_id="OP1", **overrides):
    x = {
        "evidence_id": evidence_id,
        "dimension": "COMPRESSION",
        "specialist_id": "PACKET_012_PROSE_CRAFT",
        "classification": "OPPORTUNITY",
        "disposition": "REVISION_CANDIDATE",
        "revision_eligible": True,
        "confidence": 0.90,
        "severity": 0.80,
        "opportunity_id": opportunity_id,
    }
    x.update(overrides)
    return x


def context(opportunity_id="OP1", **overrides):
    x = {
        "opportunity_id": opportunity_id,
        "purpose_relevance": 0.90,
        "preservation_risk": 0.10,
        "voice_risk": 0.10,
        "collateral_regression_risk": 0.10,
        "edit_budget_fit": 0.90,
        "scope_allowed": True,
        "evidence_family": "PCE012_COMPRESSION",
    }
    x.update(overrides)
    return x


def record(f=None, c=None):
    return {"finding": f or finding(), "context": c or context()}


checks = []
def check(name, condition, detail=None):
    checks.append({"case": name, "pass": bool(condition), "detail": detail})


# Basic admission.
r = admit_opportunities([record()])
check("basic_admit", r["standing"] == "ADMIT" and r["admitted_opportunity_ids"] == ["OP1"], r)
check("basic_non_generative", not r["revision_text_generated"] and not r["manuscript_mutated"], r)
check("no_universal_score", not r["universal_prose_score"], r)

# Feature observations and risks cannot self-promote to revision.
for cls, disp in [("OBSERVATION", "RETAIN_ORIGINAL"), ("RISK", "MONITOR_OR_REVIEW"), ("INTENTIONAL_FEATURE", "RETAIN_ORIGINAL")]:
    f = finding(classification=cls, disposition=disp, revision_eligible=False, opportunity_id=None)
    rr = admit_opportunities([record(f=f, c=context(opportunity_id="OP-NO"))])
    check(f"{cls.lower()}_no_admit", rr["admitted_count"] == 0, rr)

# Hard preservation and authority conflicts always veto.
for conflict in [
    "canon_conflict", "protected_language_conflict", "authorial_intent_conflict",
    "pov_knowledge_violation", "explicit_user_constraint_conflict", "named_author_target",
    "rewrite_payload_from_specialist",
]:
    rr = admit_opportunities([record(c=context(hard_conflicts=[conflict]))])
    item = rr["opportunities"][0]
    check(f"hard_{conflict}", item["status"] == "REJECT_PRESERVATION_RISK", item)

# Scope and edit budget are real gates.
rr = admit_opportunities([record(c=context(scope_allowed=False))])
check("scope_reject", rr["opportunities"][0]["status"] == "REJECT_SCOPE", rr)
rr = admit_opportunities([record(c=context(edit_budget_fit=0.20))])
check("budget_reject", rr["opportunities"][0]["status"] == "REJECT_SCOPE", rr)

# Preservation/voice/collateral risk cannot be averaged away.
for risk_field in ["preservation_risk", "voice_risk", "collateral_regression_risk"]:
    rr = admit_opportunities([record(c=context(**{risk_field: 0.80}))])
    check(f"high_{risk_field}_reject", rr["opportunities"][0]["status"] == "REJECT_PRESERVATION_RISK", rr)

# Low purpose relevance means no action even for an attractive stylistic signal.
rr = admit_opportunities([record(c=context(purpose_relevance=0.20))])
check("low_purpose_no_action", rr["opportunities"][0]["status"] == "NO_ACTION", rr)

# Missing opportunity identity fails closed into review.
f = finding(opportunity_id=None)
c = context(opportunity_id=None)
rr = admit_opportunities([record(f=f, c=c)])
check("missing_identity_review", rr["standing"] == "REVIEW_CONFLICT" and rr["opportunities"][0]["status"] == "REVIEW_CONFLICT", rr)

# Explicit disagreement/abstention blocks voting through ambiguity.
eligible = record()
abstain = record(
    f=finding(evidence_id="E2", opportunity_id=None, classification="OBSERVATION", disposition="ABSTAIN_REVIEW", revision_eligible=False, confidence=0.5),
    c=context(opportunity_id="OP1", evidence_family="PCE013_READER", material_disagreement=True),
)
rr = admit_opportunities([eligible, abstain])
check("no_consensus_review", rr["opportunities"][0]["status"] == "REVIEW_CONFLICT", rr)
check("no_consensus_not_admitted", rr["admitted_count"] == 0, rr)

# Correlated specialist repetitions do not multiply confidence or priority.
base_one = record()
repeated = [
    record(
        f=finding(evidence_id=f"E{i}", confidence=0.90),
        c=context(evidence_family="CORRELATED_FAMILY"),
    )
    for i in range(1, 8)
]
rr_one = admit_opportunities([base_one])
rr_many = admit_opportunities(repeated)
check("correlated_family_count_one", rr_many["opportunities"][0]["evidence_family_count"] == 1, rr_many)
check("correlated_no_confidence_inflation", rr_many["opportunities"][0]["confidence"] == 0.9, rr_many)
check("correlated_no_priority_inflation", rr_many["opportunities"][0]["internal_priority"] == rr_one["opportunities"][0]["internal_priority"], {"one":rr_one,"many":rr_many})

# Independent evidence is retained as provenance/tie-break information, not a score multiplier.
independent = [
    record(f=finding(evidence_id="EA"), c=context(evidence_family="FAMILY_A")),
    record(f=finding(evidence_id="EB"), c=context(evidence_family="FAMILY_B")),
]
rr = admit_opportunities(independent)
check("independent_family_provenance", rr["opportunities"][0]["evidence_family_count"] == 2, rr)
check("independent_not_score_multiplier", rr["opportunities"][0]["internal_priority"] == rr_one["opportunities"][0]["internal_priority"], rr)

# Bounded set: at most three admitted, deterministic overflow rejection.
records = []
for i, severity in enumerate([0.95, 0.90, 0.85, 0.80, 0.75], start=1):
    oid = f"OP{i}"
    records.append(record(
        f=finding(evidence_id=f"E{i}", opportunity_id=oid, severity=severity),
        c=context(opportunity_id=oid, evidence_family=f"F{i}"),
    ))
rr = admit_opportunities(records, max_opportunities=3)
check("bounded_three", rr["admitted_count"] == 3, rr)
check("top_three_selected", rr["admitted_opportunity_ids"] == ["OP1", "OP2", "OP3"], rr)
check("overflow_scope_reject", all(x["status"] == "REJECT_SCOPE" for x in rr["opportunities"] if x["opportunity_id"] in {"OP4", "OP5"}), rr)

# A lower-risk, more purpose-relevant opportunity can outrank a superficially severe one.
records = [
    record(f=finding(evidence_id="HIGH", opportunity_id="HIGH", severity=1.0, confidence=0.80), c=context(opportunity_id="HIGH", purpose_relevance=0.55, preservation_risk=0.30, voice_risk=0.30, collateral_regression_risk=0.30, edit_budget_fit=0.60, evidence_family="HIGH")),
    record(f=finding(evidence_id="FIT", opportunity_id="FIT", severity=0.75, confidence=0.92), c=context(opportunity_id="FIT", purpose_relevance=0.95, preservation_risk=0.05, voice_risk=0.05, collateral_regression_risk=0.05, edit_budget_fit=0.95, evidence_family="FIT")),
]
rr = admit_opportunities(records, max_opportunities=1)
check("purpose_and_risk_beat_surface_severity", rr["admitted_opportunity_ids"] == ["FIT"], rr)

# Invalid caps are rejected rather than silently expanding edit scope.
for bad in [0, -1, 11, 2.5, "3"]:
    try:
        admit_opportunities([record()], max_opportunities=bad)
        raised = False
    except ValueError:
        raised = True
    check(f"bad_cap_{bad}_rejected", raised)

all_pass = all(x["pass"] for x in checks)
print(f"STEP-008 OPPORTUNITY ADMISSION FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(checks)} cases)")
if not all_pass:
    for x in checks:
        if not x["pass"]:
            print(x)
    raise SystemExit(1)
