from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from qualification_impl015 import adversarial, demo, deterministic_campaign, recovery_campaign


def run(cmd):
    p = subprocess.run(cmd, text=True, capture_output=True)
    return {"returncode": p.returncode, "stdout": p.stdout, "stderr": p.stderr}


def count_tests(text):
    m = re.search(r"Ran (\d+) tests", text)
    return int(m.group(1)) if m else None


root = Path(__file__).resolve().parent
(root / "evidence").mkdir(exist_ok=True)
full = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"])
new = run([sys.executable, "-m", "unittest", "tests.test_baseline_diagnostic"])
compile_files = sorted(str(p) for p in root.rglob("*.py") if "__pycache__" not in p.parts)
comp = run([sys.executable, "-m", "py_compile", *compile_files])
adv = adversarial()
rec_smoke = recovery_campaign(20)
det_smoke = deterministic_campaign(20)
d = demo()

full_count = count_tests(full["stderr"] + full["stdout"])
new_count = count_tests(new["stderr"] + new["stdout"])

def load_extended(name):
    path = root / "evidence" / name
    return json.loads(path.read_text()) if path.exists() else {"status": "MISSING"}

rec_ext = load_extended("impl015_recovery_campaign.json")
det_ext = load_extended("impl015_determinism_campaign.json")

receipt = {
    "objective": "LEARNING-LAB-IMPL-015 — LEARNER BASELINE DIAGNOSTIC + ADAPTIVE ENTRY / PREREQUISITE-GAP ROUTING SLICE",
    "status": "PASS_PORTABLE_IMPLEMENTATION" if all([
        full["returncode"] == 0,
        new["returncode"] == 0,
        comp["returncode"] == 0,
        adv["status"] == "PASS",
        rec_smoke["status"] == "PASS",
        det_smoke["status"] == "PASS",
        rec_ext.get("status") == "PASS" and rec_ext.get("runs") == 100,
        det_ext.get("status") == "PASS" and det_ext.get("runs") == 100,
        d["after_probe_action"]["action_type"] == "INDEPENDENT_VERIFICATION",
        d["mastery_attempt_count"] == 0,
        d["mastery_projection_count"] == 0,
    ]) else "FAIL",
    "combined_tests": full_count,
    "impl015_tests": new_count,
    "predecessor_tests_preserved": full_count - new_count if full_count is not None and new_count is not None else None,
    "python_files_compiled": len(compile_files),
    "adversarial": adv,
    "recovery_smoke": rec_smoke,
    "determinism_smoke": det_smoke,
    "extended_recovery": rec_ext,
    "extended_determinism": det_ext,
    "demo": d,
    "authority_boundary": {
        "learner_declaration_is_mastery": False,
        "diagnostic_observation_is_mastery": False,
        "diagnostic_can_write_mastery_attempts": False,
        "diagnostic_can_write_mastery_projections": False,
        "independent_verification_remains_existing_learning_authority": True,
    },
    "truth_boundary": {
        "portable_deterministic_behavior": "PROVEN_FOR_BOUNDED_SLICE",
        "real_learner_effectiveness": "NOT_PROVEN",
        "psychometric_validity": "NOT_PROVEN",
        "native_iphone_behavior": "NOT_PROVEN",
        "windows_specific_behavior": "NOT_REQUIRED_FOR_THIS_SLICE",
        "production_system_master_integration": "NOT_PROVEN",
    },
}

(root / "evidence" / "qualification_receipt_impl015.json").write_text(json.dumps(receipt, indent=2, sort_keys=True))
(root / "evidence" / "impl015_adversarial_campaign.json").write_text(json.dumps(adv, indent=2, sort_keys=True))
(root / "evidence" / "impl015_diagnostic_demo.json").write_text(json.dumps(d, indent=2, sort_keys=True))
(root / "evidence" / "impl015_full_tests.txt").write_text(full["stdout"] + full["stderr"])
(root / "evidence" / "impl015_new_tests.txt").write_text(new["stdout"] + new["stderr"])
print(json.dumps(receipt, indent=2, sort_keys=True))
raise SystemExit(0 if receipt["status"].startswith("PASS") else 1)
