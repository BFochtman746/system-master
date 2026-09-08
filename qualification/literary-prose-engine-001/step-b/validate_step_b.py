#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
required = [
    "STEP-B-ADMISSION-AND-CUSTODY-CONTRACT-v1.json",
    "MANUSCRIPT-VERSION-MATURITY-SCHEMA-v1.json",
    "fixtures/step_b_cases.json",
    "STEP-B-QUALIFICATION-CONTRACT-v1.json",
]
errors = []
data = {}
for name in required:
    path = ROOT / name
    if not path.exists():
        errors.append(f"missing {name}")
        continue
    try:
        data[name] = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"invalid JSON {name}: {exc}")

for name in ["admission_controller.py", "run_step_b_fixtures.py", "STEP-B-CLOSURE.md"]:
    if not (ROOT / name).exists():
        errors.append(f"missing {name}")

if not errors:
    contract = data[required[0]]
    expected_rights = {
        "PUBLIC_DOMAIN_FULL_TEXT", "LICENSED_FULL_TEXT",
        "USER_OWNED_OR_AUTHORIZED", "ANALYSIS_ONLY_NO_FULL_TEXT",
    }
    if set(contract.get("rights_classes", [])) != expected_rights:
        errors.append("rights classes diverged from STEP-A")
    if contract.get("unknown_rights_policy") != "REJECT":
        errors.append("unknown rights must reject")
    if contract.get("bulk_acquisition_allowed") is not False:
        errors.append("bulk acquisition must remain disabled")
    if contract.get("analysis_only_requirements", {}).get("derived_output_must_be_nonreconstructive") is not True:
        errors.append("analysis-only nonreconstructive requirement missing")
    if contract.get("derivation_rules", {}).get("named_author_target") is not False:
        errors.append("named-author target must be false")
    if contract.get("derivation_rules", {}).get("author_identity_feature_allowed") is not False:
        errors.append("author identity feature must be false")

    ms = data[required[1]]
    inv = ms.get("invariants", {})
    if inv.get("later_version_is_not_automatically_better") is not True:
        errors.append("manuscript maturity incorrectly implies quality")
    if inv.get("chronology_must_be_preserved") is not True:
        errors.append("manuscript chronology invariant missing")

    qual = data[required[3]]
    if qual.get("bulk_download_allowed_in_step_b") is not False:
        errors.append("STEP-B bulk download gate missing")
    if qual.get("a01_required_for_step_b_static_fixture_qualification") is not False:
        errors.append("STEP-B fixture qualification should not require A-01")
    gate_ids = {g["gate_id"] for g in qual.get("gates", [])}
    expected_gates = {
        "B-RIGHTS-001", "B-RIGHTS-002", "B-RIGHTS-003", "B-CUSTODY-001", "B-CUSTODY-002",
        "B-DERIVED-001", "B-ID-001", "B-DEDUP-001", "B-OVERLAP-001",
        "B-MANUSCRIPT-001", "B-VOICE-BRIDGE-001", "B-IMITATION-001", "B-BULK-001",
    }
    missing = sorted(expected_gates - gate_ids)
    if missing:
        errors.append(f"missing qualification gates: {missing}")
    if "STEP-B-QUALIFICATION-CONTRACT-v1.json" not in qual.get("required_artifacts", []):
        errors.append("qualification contract must require itself")

if not errors:
    run = subprocess.run([sys.executable, str(ROOT / "run_step_b_fixtures.py")], cwd=ROOT, text=True, capture_output=True)
    if run.returncode != 0:
        errors.append("fixture qualification failed: " + (run.stdout + run.stderr).strip())
    evidence_path = ROOT / "STEP-B-QUALIFICATION-EVIDENCE.json"
    if not evidence_path.exists():
        errors.append("missing STEP-B-QUALIFICATION-EVIDENCE.json")
    else:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        if evidence.get("standing") != "PASS":
            errors.append("qualification evidence standing is not PASS")
        if evidence.get("bulk_acquisition_performed") is not False:
            errors.append("qualification evidence reports bulk acquisition")
        if evidence.get("external_book_text_used") is not False:
            errors.append("qualification fixtures unexpectedly used external book text")
        if evidence.get("user_uploaded_book_text_persisted") is not False:
            errors.append("qualification fixtures unexpectedly persisted uploaded user book text")

if errors:
    print("STEP-B VALIDATION: FAIL")
    for err in errors:
        print(f"- {err}")
    raise SystemExit(1)

print("STEP-B VALIDATION: PASS")
print("Static contracts and executable fixture qualification passed.")
