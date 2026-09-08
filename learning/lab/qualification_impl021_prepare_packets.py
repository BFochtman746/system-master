from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

from learning_lab.provider_acquisition import OpenGoalInputPacketService
from learning_lab.repository import Repository


GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-root", required=True)
    parser.add_argument("--state-key", required=True)
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    capture = json.loads(
        (root / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8")
    )
    fixture = json.loads(
        (root / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json").read_text(encoding="utf-8")
    )
    traces = {x["generation_trace_id"]: x for x in fixture["traces"]}

    state_root = Path(args.state_root).resolve()
    state_root.mkdir(parents=True, exist_ok=True)
    repo = Repository(str(state_root / f"{args.state_key}.sqlite3"))
    service = OpenGoalInputPacketService(repo)

    packet_map = {
        "A": ("PACKET-JAVA-IMPL021-A", A),
        "B": ("PACKET-JAVA-IMPL021-B", B),
        "C": ("PACKET-JAVA-IMPL021-C", C),
        "D": ("PACKET-JAVA-IMPL021-D", D),
    }
    results = {}
    for label, (packet_id, trace_id) in packet_map.items():
        output = copy.deepcopy(traces[trace_id]["output"])
        result = service.capture_and_admit(
            operation_id=f"IMPL021:ADMIT:{label}",
            packet_id=packet_id,
            desired_outcome=GOAL,
            research_capture_provider=lambda goal, cap=copy.deepcopy(capture): copy.deepcopy(cap),
            model_id="A01-PROVIDER-MODEL-IMPL021",
            model_candidate_provider=lambda prompt, out=output: copy.deepcopy(out),
        )
        results[label] = result

    print("IMPL021_PACKET_PREP_STATUS=PASS")
    print("IMPL021_PACKET_COUNT=4")
    print("IMPL021_PACKET_STANDING=" + results["A"]["standing"])
    print("IMPL021_RESEARCH_EVIDENCE=" + results["A"]["research_evidence_digest"])
    for label in ("A", "B", "C", "D"):
        print(f"IMPL021_PACKET_{label}=" + packet_map[label][0])
        print(f"IMPL021_OUTPUT_{label}=" + results[label]["model_output_digest"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
