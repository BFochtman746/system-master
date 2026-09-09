from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from learning_lab.real_learner_pilot_review_intake import (
    RealLearnerPilotReviewIntakeError,
    build_review_intake,
    write_review_intake,
)


DEFAULT_ROOT = Path.home() / ".system-master" / "learning-pilot-001"


def resolve_state_root(path_text: str | None) -> Path:
    return Path(path_text).expanduser().resolve() if path_text else DEFAULT_ROOT.resolve()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify a completed local PILOT-001-RUN-001 handoff and emit a minimized local review-intake packet. No network upload is performed."
    )
    parser.add_argument("--pilot-id", required=True, help="Pseudonymous completed pilot ID.")
    parser.add_argument(
        "--state-root",
        help="Local pilot state directory. Defaults to ~/.system-master/learning-pilot-001.",
    )
    parser.add_argument(
        "--write-local-packet",
        action="store_true",
        help="Also write <pilot_id>.review-intake.json in the same local state root. This does not upload or export it.",
    )
    args = parser.parse_args()

    root = resolve_state_root(args.state_root or os.environ.get("SYSTEM_MASTER_LEARNING_PILOT_STATE_ROOT"))
    try:
        packet = (
            write_review_intake(root=root, pilot_id=args.pilot_id)
            if args.write_local_packet
            else build_review_intake(root=root, pilot_id=args.pilot_id)
        )
        print(json.dumps(packet, indent=2, sort_keys=True))
        return 0
    except RealLearnerPilotReviewIntakeError as exc:
        print(f"REVIEW INTAKE STOPPED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
