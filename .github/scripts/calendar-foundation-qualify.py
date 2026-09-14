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
from tools.calendar_action_plan import PLAN_NAME, CalendarActionPlanError, build, verify

CONTRACT_ID = "CALENDAR-FOUNDATION-1.0"
CORPUS = REPO_ROOT / "qualification" / "calendar" / "corpus" / "basic" / "calendar.json"
DEFAULT_EVIDENCE = REPO_ROOT / "qualification-output" / "calendar-foundation-1.0.json"


def qualify(source_identity: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="c03-qualification-") as td:
        root = Path(td)
        first = build(CORPUS, root / "plan-a", repo_root=REPO_ROOT)
        second = build(CORPUS, root / "plan-b", repo_root=REPO_ROOT)
        first_bytes = (root / "plan-a" / PLAN_NAME).read_bytes()
        second_bytes = (root / "plan-b" / PLAN_NAME).read_bytes()
        if first_bytes != second_bytes or first["plan_sha256"] != second["plan_sha256"]:
            raise CalendarActionPlanError("representative calendar intent did not compile deterministically")
        verify(root / "plan-a", repo_root=REPO_ROOT)
        verify(root / "plan-b", repo_root=REPO_ROOT)

        tampered = json.loads((root / "plan-b" / PLAN_NAME).read_text(encoding="utf-8"))
        tampered["calendar_ref"] = "tampered"
        (root / "plan-b" / PLAN_NAME).write_text(json.dumps(tampered), encoding="utf-8")
        tamper_detected = False
        try:
            verify(root / "plan-b", repo_root=REPO_ROOT)
        except CalendarActionPlanError:
            tamper_detected = True
        if not tamper_detected:
            raise CalendarActionPlanError("qualification failed to detect calendar-plan tampering")

        boundary = first["authority_boundary"]
        if boundary["calendar_execution_authority"] != "NOT_GRANTED":
            raise CalendarActionPlanError("C03 Foundation attempted to acquire calendar execution authority")
        if boundary["provider_api_access"] is not False or boundary["network_access"] is not False:
            raise CalendarActionPlanError("C03 Foundation attempted to acquire provider/network authority")
        denied = (
            "credentials_authority",
            "account_authority",
            "calendar_write_authority",
            "invitation_send_authority",
            "notification_authority",
        )
        if any(boundary[key] != "NOT_GRANTED" for key in denied):
            raise CalendarActionPlanError("C03 Foundation attempted to acquire prohibited calendar authority")
        if boundary["external_side_effects"] is not False:
            raise CalendarActionPlanError("C03 Foundation attempted to acquire external side-effect authority")
        if any(action["execution_permitted_by_foundation"] is not False for action in first["actions"]):
            raise CalendarActionPlanError("Foundation plan granted calendar action execution authority")
        if any(action["authority_requirement"] != "SEPARATE_CALENDAR_RUNTIME_AND_USER_AUTHORITY_REQUIRED" for action in first["actions"]):
            raise CalendarActionPlanError("calendar write intent is not separately runtime/user-authority gated")
        if {action["type"] for action in first["actions"]} != {"CREATE_EVENT", "UPDATE_EVENT", "DELETE_EVENT"}:
            raise CalendarActionPlanError("representative corpus does not cover all admitted Foundation 1.0 action types")

        return {
            "evidence_schema": "1.0",
            "contract_id": CONTRACT_ID,
            "capability_id": "C03",
            "owner": "SYSTEM_MASTER/CONNECTED_ACTIONS",
            "status": "PASS",
            "source_identity": source_identity,
            "corpus": "qualification/calendar/corpus/basic/calendar.json",
            "qualification_command": "python3 .github/scripts/calendar-foundation-qualify.py",
            "plan_sha256": first["plan_sha256"],
            "plan_file_sha256": hashlib.sha256(first_bytes).hexdigest(),
            "deterministic_repeat_compile": True,
            "tamper_detection": True,
            "current_authority_binding": True,
            "action_types_qualified": ["CREATE_EVENT", "DELETE_EVENT", "UPDATE_EVENT"],
            "calendar_execution": False,
            "provider_api_access": False,
            "network_access": False,
            "credentials_authority": "NOT_GRANTED",
            "account_authority": "NOT_GRANTED",
            "calendar_write_authority": "NOT_GRANTED",
            "invitation_send_authority": "NOT_GRANTED",
            "notification_authority": "NOT_GRANTED",
            "user_authority_gate": True,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify Calendar Foundation 1.0")
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--source-identity", default=os.environ.get("CALENDAR_SOURCE_ID", os.environ.get("GITHUB_SHA", "WORKTREE")))
    args = parser.parse_args()
    try:
        evidence = qualify(args.source_identity)
    except CalendarActionPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    path = Path(args.evidence)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
