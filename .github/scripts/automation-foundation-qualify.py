#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from tools.automation_plan import PLAN_NAME, AutomationPlanError, build, verify

CONTRACT_ID = "AUTOMATION-FOUNDATION-1.0"
CORPUS = REPO_ROOT / "qualification" / "automation" / "corpus" / "basic" / "automation.json"
DEFAULT_EVIDENCE = REPO_ROOT / "qualification-output" / "automation-foundation-1.0.json"


def qualify(source_identity: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="c01-qualification-") as td:
        root = Path(td)
        first = build(CORPUS, root / "plan-a", repo_root=REPO_ROOT)
        second = build(CORPUS, root / "plan-b", repo_root=REPO_ROOT)
        first_bytes = (root / "plan-a" / PLAN_NAME).read_bytes()
        second_bytes = (root / "plan-b" / PLAN_NAME).read_bytes()
        if first_bytes != second_bytes or first["plan_sha256"] != second["plan_sha256"]:
            raise AutomationPlanError("representative automation did not compile deterministically")
        verify(root / "plan-a", repo_root=REPO_ROOT)
        verify(root / "plan-b", repo_root=REPO_ROOT)

        tampered = json.loads((root / "plan-b" / PLAN_NAME).read_text(encoding="utf-8"))
        tampered["name"] = "tampered"
        (root / "plan-b" / PLAN_NAME).write_text(json.dumps(tampered), encoding="utf-8")
        tamper_detected = False
        try:
            verify(root / "plan-b", repo_root=REPO_ROOT)
        except AutomationPlanError:
            tamper_detected = True
        if not tamper_detected:
            raise AutomationPlanError("qualification failed to detect plan tampering")

        boundary = first["authority_boundary"]
        if boundary["clock_authority"] != "NOT_GRANTED" or boundary["claim_authority"] != "NOT_GRANTED":
            raise AutomationPlanError("C01 attempted to acquire CORE scheduling/claim authority")
        if boundary["shell_execution_authority"] != "NOT_GRANTED" or boundary["network_access"] is not False:
            raise AutomationPlanError("C01 attempted to acquire shell or network execution authority")
        if boundary["connector_action_authority"] != "NOT_GRANTED" or boundary["browser_action_authority"] != "NOT_GRANTED":
            raise AutomationPlanError("C01 attempted to acquire CONNECTED_ACTIONS authority")
        if boundary["scheduling_requirement"] != "SYSTEM_MASTER/CORE/P11_REQUIRED":
            raise AutomationPlanError("OVERNIGHT automation did not preserve P11 scheduling authority")
        if any(step["execution_permitted_by_foundation"] is not False for step in first["steps"]):
            raise AutomationPlanError("Foundation plan granted step execution authority")
        external = [step for step in first["steps"] if step["effect_class"] == "EXTERNAL_SIDE_EFFECT_INTENT"]
        if not external or any(step["authority_requirement"] != "SEPARATE_CONNECTED_ACTIONS_AND_USER_AUTHORITY_REQUIRED" for step in external):
            raise AutomationPlanError("external side-effect intent is not separately authority gated")

        return {
            "evidence_schema": "1.0",
            "contract_id": CONTRACT_ID,
            "capability_id": "C01",
            "owner": "SYSTEM_MASTER/PROGRAMMING",
            "status": "PASS",
            "source_identity": source_identity,
            "corpus": "qualification/automation/corpus/basic/automation.json",
            "qualification_command": "python3 .github/scripts/automation-foundation-qualify.py",
            "plan_sha256": first["plan_sha256"],
            "plan_file_sha256": hashlib.sha256(first_bytes).hexdigest(),
            "deterministic_repeat_compile": True,
            "tamper_detection": True,
            "current_authority_binding": True,
            "dependency_graph_validation": True,
            "step_execution": False,
            "clock_authority": "NOT_GRANTED",
            "claim_authority": "NOT_GRANTED",
            "shell_execution_authority": "NOT_GRANTED",
            "network_access": False,
            "connector_action_authority": "NOT_GRANTED",
            "browser_action_authority": "NOT_GRANTED",
            "overnight_scheduling_owner": "SYSTEM_MASTER/CORE/P11_REQUIRED"
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify Automation Foundation 1.0")
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--source-identity", default=os.environ.get("AUTOMATION_SOURCE_ID", os.environ.get("GITHUB_SHA", "WORKTREE")))
    args = parser.parse_args()
    try:
        evidence = qualify(args.source_identity)
    except AutomationPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    path = Path(args.evidence)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
