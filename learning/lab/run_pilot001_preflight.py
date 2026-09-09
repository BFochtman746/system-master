from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import run_pilot001_real_participant as console
from learning_lab.real_learner_pilot_preflight import (
    RealLearnerPilotPreflightError,
    run_real_learner_pilot_preflight,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Non-participant preflight for PILOT-001-RUN-001. Creates no consent, participant manifest, participant database, or learner evidence."
    )
    parser.add_argument(
        "--state-root",
        help="Local directory intended for pseudonymous pilot state. Defaults outside the repository in the user's home directory.",
    )
    args = parser.parse_args()

    root = Path(args.state_root).expanduser() if args.state_root else Path(
        os.environ.get("SYSTEM_MASTER_LEARNING_PILOT_STATE_ROOT", str(console.DEFAULT_ROOT))
    ).expanduser()
    try:
        result = run_real_learner_pilot_preflight(state_root=root)
    except (RealLearnerPilotPreflightError, OSError, ValueError) as exc:
        print(f"PILOT-001 PREFLIGHT FAILED: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, sort_keys=True))
    print("\nPreflight passed. No participant consent or learner evidence was created.")
    print("A real participant must still be present and explicitly consent before PILOT-001-RUN-001 can begin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
