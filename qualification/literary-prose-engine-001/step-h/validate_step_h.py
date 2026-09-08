import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
required = [
    "CONTROLLED-REVISION-ENGINE-CONTRACT-v1.json",
    "REVISION-CANDIDATE-SCHEMA-v1.json",
    "EDIT-AMBITION-CONTRACT-v1.json",
    "PRESERVATION-AUDIT-CONTRACT-v1.json",
    "STEP-H-QUALIFICATION-CONTRACT-v1.json",
    "controlled_revision.py",
    "fixtures/step_h_cases.json",
    "run_step_h_fixtures.py"
]
for name in required:
    if not (ROOT / name).exists(): raise SystemExit(f"MISSING:{name}")
contract = json.loads((ROOT / "CONTROLLED-REVISION-ENGINE-CONTRACT-v1.json").read_text())
assert contract["ambition_levels"][0] == "LEVEL_0_NO_CHANGE"
assert contract["writer_self_adjudication_allowed"] is False
assert contract["named_author_target_allowed"] is False
subprocess.run([sys.executable, str(ROOT / "run_step_h_fixtures.py")], cwd=ROOT, check=True)
evidence = json.loads((ROOT / "STEP-H-QUALIFICATION-EVIDENCE.json").read_text())
assert evidence["standing"] == "PASS" and evidence["fixture_count"] == 18
print("STEP-H VALIDATION: PASS — bounded candidate generation, preservation gate, 18 fixtures")
