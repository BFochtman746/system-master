from __future__ import annotations

"""A-01 service wrapper for P12 GitHub ingress.

Production ownership:
- GitHub is read-only authority/transport input.
- A01NightScheduler is the only queue writer and claim authority.
- This service owns the SupervisorStore lifetime and binds the real scheduler.

Windows registration example (operator-owned, not performed by this module):
  schtasks /Create /TN "SystemMaster-A01-Ingress" /SC ONSTART /RL LIMITED /F \
    /TR "python -m a01_ingress_service --daemon --db C:\\SystemMaster\\a01-supervisor.db --state-dir C:\\SystemMaster\\a01-ingress"

After registration/reboot, verify the task Last Result and run `--check` before relying on
automatic polling. The service never writes to GitHub.
"""

import argparse
import datetime as dt
import json
import os
import time
from pathlib import Path
from typing import Optional

from a01_github_ingress import GitHubSource, Ingress
from a01_night_scheduler import A01NightScheduler
from tools.second_shift_supervisor_v2 import SupervisorStore


def build_scheduler(db_path: os.PathLike[str] | str) -> tuple[SupervisorStore, A01NightScheduler]:
    store = SupervisorStore(Path(db_path))
    try:
        scheduler = A01NightScheduler(store)
    except Exception:
        store.close()
        raise
    return store, scheduler


def _emit(kind: str, **payload) -> None:
    value = {"kind": kind, **payload}
    print(json.dumps(value, sort_keys=True), flush=True)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 GitHub ingress service")
    parser.add_argument("--db", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--owner", default=os.environ.get("A01_INGRESS_OWNER", "BFochtman746"))
    parser.add_argument("--repo", default=os.environ.get("A01_INGRESS_REPO", "system-master"))
    parser.add_argument("--ref", default=os.environ.get("A01_INGRESS_REF", "main"))
    parser.add_argument("--poll-seconds", type=int, default=60)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--once", action="store_true")
    group.add_argument("--daemon", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    if not 5 <= args.poll_seconds <= 3600:
        parser.error("--poll-seconds must be 5..3600")

    source = GitHubSource(
        args.owner,
        args.repo,
        ref=args.ref,
        token=os.environ.get("A01_INGRESS_TOKEN"),
    )
    store, scheduler = build_scheduler(args.db)
    try:
        ingress = Ingress(source, scheduler=scheduler, state_dir=args.state_dir)
        if args.check:
            _emit(
                "WIRING_OK",
                scheduler=type(scheduler).__name__,
                source=type(source).__name__,
                github_write_capable=hasattr(source, "write") or hasattr(source, "write_json"),
                db=str(Path(args.db)),
            )
            return 0

        def one_pass() -> int:
            result = ingress.run_once(now=dt.datetime.now(dt.timezone.utc), dry_run=False)
            _emit(result.status, **result.to_dict())
            return 0 if result.status in {"PASS", "PASS_WITH_ERRORS", "HALTED"} and not result.errors else 1

        if args.once:
            return one_pass()

        while True:
            code = one_pass()
            if code:
                _emit("BACKOFF", seconds=args.poll_seconds)
            time.sleep(args.poll_seconds)
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
