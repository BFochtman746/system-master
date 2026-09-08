from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

from learning_lab.provider_acquisition import OpenGoalInputPacketService
from learning_lab.repository import Repository


GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
ROOT = Path(__file__).resolve().parent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-root", required=True)
    parser.add_argument("--state-key", required=True)
    parser.add_argument("--packet-id", required=True)
    args = parser.parse_args()

    state_root = Path(args.state_root).resolve()
    state_root.mkdir(parents=True, exist_ok=True)
    db = state_root / f"{args.state_key}.sqlite3"
    repo = Repository(str(db))

    base_capture = json.loads(
        (ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
    )
    base_trace = json.loads(
        (ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
    )

    def research_provider(goal: str):
        capture = copy.deepcopy(base_capture)
        capture["capture_id"] = "PROVIDER-CAPTURE-A01-IMPL020"
        capture["captured_at"] = "2026-09-08T04:30:00Z"
        capture["capture_mode"] = "A01_PROVIDER_GATEWAY_QUALIFICATION"
        return capture

    def model_provider(prompt):
        return copy.deepcopy(base_trace["output"])

    result = OpenGoalInputPacketService(repo).capture_and_admit(
        operation_id="OP-A01-IMPL020-PACKET",
        packet_id=args.packet_id,
        desired_outcome=GOAL,
        research_capture_provider=research_provider,
        model_id="A01-PROVIDER-MODEL-IMPL020",
        model_candidate_provider=model_provider,
    )
    print("IMPL020_PACKET_PREP_STATUS=PASS")
    print("IMPL020_PACKET_ID=" + result["packet_id"])
    print("IMPL020_PACKET_DIGEST=" + result["packet_digest"])
    print("IMPL020_PACKET_STANDING=" + result["standing"])
    print("IMPL020_RESEARCH_CAPTURE_DIGEST=" + result["research_capture_digest"])
    print("IMPL020_RESEARCH_EVIDENCE_DIGEST=" + result["research_evidence_digest"])
    print("IMPL020_MODEL_TRACE_DIGEST=" + result["model_trace_digest"])
    print("IMPL020_MODEL_OUTPUT_DIGEST=" + result["model_output_digest"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
