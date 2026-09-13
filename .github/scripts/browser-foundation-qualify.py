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
from tools.browser_action_plan import PLAN_NAME, BrowserActionPlanError, build, verify

CONTRACT_ID = "BROWSER-FOUNDATION-1.0"
CORPUS = REPO_ROOT / "qualification" / "browser" / "corpus" / "basic" / "browser.json"
DEFAULT_EVIDENCE = REPO_ROOT / "qualification-output" / "browser-foundation-1.0.json"


def qualify(source_identity: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="c02-qualification-") as td:
        root = Path(td)
        first = build(CORPUS, root / "plan-a", repo_root=REPO_ROOT)
        second = build(CORPUS, root / "plan-b", repo_root=REPO_ROOT)
        first_bytes = (root / "plan-a" / PLAN_NAME).read_bytes()
        second_bytes = (root / "plan-b" / PLAN_NAME).read_bytes()
        if first_bytes != second_bytes or first["plan_sha256"] != second["plan_sha256"]:
            raise BrowserActionPlanError("representative browser intent did not compile deterministically")
        verify(root / "plan-a", repo_root=REPO_ROOT)
        verify(root / "plan-b", repo_root=REPO_ROOT)

        tampered = json.loads((root / "plan-b" / PLAN_NAME).read_text(encoding="utf-8"))
        tampered["target_url"] = "https://example.com/tampered"
        (root / "plan-b" / PLAN_NAME).write_text(json.dumps(tampered), encoding="utf-8")
        tamper_detected = False
        try:
            verify(root / "plan-b", repo_root=REPO_ROOT)
        except BrowserActionPlanError:
            tamper_detected = True
        if not tamper_detected:
            raise BrowserActionPlanError("qualification failed to detect browser-plan tampering")

        boundary = first["authority_boundary"]
        if boundary["browser_execution_authority"] != "NOT_GRANTED" or boundary["network_access"] is not False:
            raise BrowserActionPlanError("C02 Foundation attempted to acquire browser/network execution authority")
        denied = ("credentials_authority", "cookies_or_session_authority", "javascript_execution_authority", "download_authority", "upload_authority", "form_submission_authority")
        if any(boundary[key] != "NOT_GRANTED" for key in denied):
            raise BrowserActionPlanError("C02 Foundation attempted to acquire prohibited browser authority")
        if any(action["execution_permitted_by_foundation"] is not False for action in first["actions"]):
            raise BrowserActionPlanError("Foundation plan granted browser action execution authority")
        clicks = [action for action in first["actions"] if action["type"] == "CLICK"]
        if not clicks or any(action["authority_requirement"] != "SEPARATE_BROWSER_RUNTIME_AND_USER_AUTHORITY_REQUIRED" for action in clicks):
            raise BrowserActionPlanError("CLICK intent is not separately user-authority gated")

        return {
            "evidence_schema": "1.0",
            "contract_id": CONTRACT_ID,
            "capability_id": "C02",
            "owner": "SYSTEM_MASTER/CONNECTED_ACTIONS",
            "status": "PASS",
            "source_identity": source_identity,
            "corpus": "qualification/browser/corpus/basic/browser.json",
            "qualification_command": "python3 .github/scripts/browser-foundation-qualify.py",
            "plan_sha256": first["plan_sha256"],
            "plan_file_sha256": hashlib.sha256(first_bytes).hexdigest(),
            "deterministic_repeat_compile": True,
            "tamper_detection": True,
            "current_authority_binding": True,
            "browser_execution": False,
            "network_access": False,
            "credentials_authority": "NOT_GRANTED",
            "cookies_or_session_authority": "NOT_GRANTED",
            "javascript_execution_authority": "NOT_GRANTED",
            "form_submission_authority": "NOT_GRANTED",
            "click_user_authority_gate": True
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify Browser Foundation 1.0")
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--source-identity", default=os.environ.get("BROWSER_SOURCE_ID", os.environ.get("GITHUB_SHA", "WORKTREE")))
    args = parser.parse_args()
    try:
        evidence = qualify(args.source_identity)
    except BrowserActionPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    path = Path(args.evidence)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
