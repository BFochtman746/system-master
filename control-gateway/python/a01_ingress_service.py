"""A-01 ingress service entry point.

`a01_github_ingress.main()` deliberately constructs the ingress with
`scheduler=None`, so the CLI can only build and report. This module owns the
SupervisorStore lifetime and wires the real scheduler in. It is the only place a
write path into the night queue is opened, which is why the wiring lives here
rather than behind a CLI default.

Run it:
    python -m a01_ingress_service --dry-run      # prove wiring, enqueue nothing
    python -m a01_ingress_service --once
    python -m a01_ingress_service --daemon --interval 300

Survive a reboot (Windows 11). A console process dies to the first Windows Update,
which ends the night silently — the failure mode with no error and no evidence.
Register it as a scheduled task instead:

    schtasks /Create /TN "A01 Ingress" /SC ONSTART /RL HIGHEST /RU SYSTEM ^
      /TR "\"C:\\Python312\\python.exe\" -m a01_ingress_service --daemon" ^
      /F

Then confirm it actually restarts:

    shutdown /r /t 0
    schtasks /Query /TN "A01 Ingress" /V /FO LIST | findstr "Status Last"

If "Last Result" is not 0 after a reboot, the night did not start and nothing
will tell you. Check it the first morning after you install this, not later.

Environment (all optional, defaults shown):
    A01_SUPERVISOR_DB        control-gateway/state/supervisor.sqlite
    A01_INGRESS_REPO         BFochtman746/system-master
    A01_INGRESS_REF          main
    A01_INGRESS_TOKEN        (unset; only needed for a private repo)
    A01_INGRESS_STATE_DIR    control-gateway/state
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Optional

from a01_github_ingress import (
    DEFAULT_REPO,
    GitHubSource,
    Ingress,
    IngressError,
    KillSwitch,
    NightBudget,
    _state_dir,
)

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_WIRING = 2


def _default_db() -> str:
    return os.environ.get("A01_SUPERVISOR_DB") or os.path.join(_state_dir(), "supervisor.sqlite")


def build_scheduler(db_path: str) -> tuple[Any, Any]:
    """Open the supervisor store and return (scheduler, store).

    Imported lazily so `--dry-run` and `--check` work on a machine that has no
    database yet. A wiring failure must be a clear message, not a traceback at
    import time in a scheduled task nobody is watching.
    """
    try:
        from tools.second_shift_supervisor_v2 import SupervisorStore
        from a01_night_scheduler import A01NightScheduler
    except ImportError as error:
        raise IngressError(
            f"scheduler imports unavailable ({error}). Set PYTHONPATH to include "
            "control-gateway/python and the repository root."
        ) from error

    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    store = SupervisorStore(db_path)
    return A01NightScheduler(store), store


def build_ingress(args: argparse.Namespace, scheduler: Any) -> Ingress:
    source = GitHubSource(
        repo=os.environ.get("A01_INGRESS_REPO", DEFAULT_REPO),
        ref=os.environ.get("A01_INGRESS_REF", "main"),
        token=os.environ.get("A01_INGRESS_TOKEN"),
    )
    budget = NightBudget(max_delegations=args.max_delegations, max_minutes=args.max_minutes)
    return Ingress(source, KillSwitch(_state_dir()), budget, scheduler=scheduler)


def emit(payload: dict[str, Any]) -> None:
    """One JSON object per line. Scheduled tasks are read from log files, not terminals."""
    sys.stdout.write(f"{json.dumps(payload)}\n")
    sys.stdout.flush()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 ingress service")
    parser.add_argument("--once", action="store_true", help="one pass, then exit")
    parser.add_argument("--daemon", action="store_true", help="poll until the budget is spent")
    parser.add_argument("--dry-run", action="store_true", help="build and report, enqueue nothing")
    parser.add_argument("--check", action="store_true", help="verify wiring and exit without polling")
    parser.add_argument("--interval", type=int, default=300)
    parser.add_argument("--max-delegations", type=int, default=8)
    parser.add_argument("--max-minutes", type=int, default=420)
    parser.add_argument("--db", default=None, help="supervisor SQLite path")
    args = parser.parse_args(argv)

    db_path = args.db or _default_db()
    kill_switch = KillSwitch(_state_dir())

    # A dry run must not open a write path, so it never constructs a scheduler.
    scheduler = None
    store = None
    if not args.dry_run:
        try:
            scheduler, store = build_scheduler(db_path)
        except IngressError as error:
            emit({"event": "WIRING_FAILED", "error": str(error), "db": db_path})
            return EXIT_WIRING

    try:
        if args.check:
            emit({
                "event": "WIRING_OK",
                "db": db_path,
                "scheduler": scheduler.__class__.__name__ if scheduler else "NONE (dry-run)",
                "halted": kill_switch.engaged(),
                "halt_path": kill_switch.path,
                "repo": os.environ.get("A01_INGRESS_REPO", DEFAULT_REPO),
                "token_present": bool(os.environ.get("A01_INGRESS_TOKEN")),
            })
            return EXIT_OK

        ingress = build_ingress(args, scheduler)

        if args.daemon:
            while ingress.budget.remaining_delegations() > 0 and not kill_switch.engaged():
                result = ingress.run_once(dry_run=args.dry_run)
                emit({"event": "PASS", **result.summary()})
                if result.halted:
                    emit({"event": "HALTED", "reason": result.halt_reason})
                    break
                if result.errors:
                    # A transient GitHub failure must not end the night. Back off
                    # and try again; the budget still bounds the total.
                    emit({"event": "BACKOFF", "seconds": args.interval})
                time.sleep(max(1, args.interval))
            emit({"event": "WINDOW_CLOSED", "budget": ingress.budget.snapshot()})
            return EXIT_OK

        result = ingress.run_once(dry_run=args.dry_run or not args.once)
        emit({"event": "PASS", **result.summary()})
        return EXIT_ERROR if result.errors else EXIT_OK

    except KeyboardInterrupt:
        emit({"event": "INTERRUPTED"})
        return EXIT_OK
    finally:
        if store is not None:
            try:
                store.close()
            except Exception:  # noqa: BLE001 - close failure must not mask the real result
                pass


if __name__ == "__main__":
    sys.exit(main())
