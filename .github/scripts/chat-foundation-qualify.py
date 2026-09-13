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
from tools.chat_turn_plan import PLAN_NAME, ChatTurnPlanError, build, verify

CONTRACT_ID = "CHAT-FOUNDATION-1.0"
CORPUS = REPO_ROOT / "qualification" / "chat" / "corpus" / "basic" / "chat.json"
DEFAULT_EVIDENCE = REPO_ROOT / "qualification-output" / "chat-foundation-1.0.json"


def qualify(source_identity: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="c04-qualification-") as td:
        root = Path(td)
        first = build(CORPUS, root / "plan-a", repo_root=REPO_ROOT)
        second = build(CORPUS, root / "plan-b", repo_root=REPO_ROOT)
        first_bytes = (root / "plan-a" / PLAN_NAME).read_bytes()
        second_bytes = (root / "plan-b" / PLAN_NAME).read_bytes()
        if first_bytes != second_bytes or first["plan_sha256"] != second["plan_sha256"]:
            raise ChatTurnPlanError("representative chat turn did not compile deterministically")
        verify(root / "plan-a", repo_root=REPO_ROOT)
        verify(root / "plan-b", repo_root=REPO_ROOT)

        tampered = json.loads((root / "plan-b" / PLAN_NAME).read_text(encoding="utf-8"))
        tampered["conversation_ref"] = "tampered"
        (root / "plan-b" / PLAN_NAME).write_text(json.dumps(tampered), encoding="utf-8")
        tamper_detected = False
        try:
            verify(root / "plan-b", repo_root=REPO_ROOT)
        except ChatTurnPlanError:
            tamper_detected = True
        if not tamper_detected:
            raise ChatTurnPlanError("qualification failed to detect chat-plan tampering")

        boundary = first["authority_boundary"]
        required_not_granted = (
            "model_execution_authority",
            "credentials_authority",
            "tool_execution_authority",
            "connector_execution_authority",
            "memory_write_authority",
            "conversation_persistence_authority",
            "autonomous_send_authority",
        )
        if any(boundary[key] != "NOT_GRANTED" for key in required_not_granted):
            raise ChatTurnPlanError("C04 Foundation attempted to acquire prohibited runtime authority")
        if boundary["provider_api_access"] is not False or boundary["network_access"] is not False or boundary["external_side_effects"] is not False:
            raise ChatTurnPlanError("C04 Foundation attempted to acquire provider/network/side-effect authority")
        if first["messages"][-1]["role"] != "user":
            raise ChatTurnPlanError("representative plan does not terminate in the current user request")
        if [m["sequence"] for m in first["messages"]] != list(range(1, len(first["messages"]) + 1)):
            raise ChatTurnPlanError("representative plan did not preserve message order")

        return {
            "evidence_schema": "1.0",
            "contract_id": CONTRACT_ID,
            "capability_id": "C04",
            "owner": "SYSTEM_MASTER/CORE",
            "status": "PASS",
            "source_identity": source_identity,
            "corpus": "qualification/chat/corpus/basic/chat.json",
            "qualification_command": "python3 .github/scripts/chat-foundation-qualify.py",
            "plan_sha256": first["plan_sha256"],
            "plan_file_sha256": hashlib.sha256(first_bytes).hexdigest(),
            "deterministic_repeat_compile": True,
            "tamper_detection": True,
            "current_authority_binding": True,
            "ordered_message_preservation": True,
            "current_user_request_terminal": True,
            "model_execution_authority": "NOT_GRANTED",
            "provider_api_access": False,
            "network_access": False,
            "credentials_authority": "NOT_GRANTED",
            "tool_execution_authority": "NOT_GRANTED",
            "connector_execution_authority": "NOT_GRANTED",
            "memory_write_authority": "NOT_GRANTED",
            "conversation_persistence_authority": "NOT_GRANTED",
            "autonomous_send_authority": "NOT_GRANTED",
            "external_side_effects": False,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify Chat Foundation 1.0")
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--source-identity", default=os.environ.get("CHAT_SOURCE_ID", os.environ.get("GITHUB_SHA", "WORKTREE")))
    args = parser.parse_args()
    try:
        evidence = qualify(args.source_identity)
    except ChatTurnPlanError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    path = Path(args.evidence)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
