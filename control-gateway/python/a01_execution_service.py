from __future__ import annotations

"""Production service wrapper for the A-01 execution worker.

This wrapper does not create a second scheduler or repository writer. It binds the
existing A01ExecutionWorker to the already-qualified repository-repair adapter and
keeps repository repair on RECONCILIATION_REQUIRED retry semantics because an
external writer outcome may be ambiguous after interruption.

Windows registration example (operator-owned, not performed by this module):
  schtasks /Create /TN "SystemMaster-A01-Execution" /SC ONSTART /RL LIMITED /F \
    /TR "python -m a01_execution_service --daemon --db C:\\SystemMaster\\a01-supervisor.db"

The repair adapter still requires its separately provisioned least-privilege
A01_REPAIR_DISPATCH_TOKEN at execution time. This service never grants that token.
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Optional

from a01_execution_worker import A01ExecutionWorker, RECONCILIATION_REQUIRED, ROOT
from a01_repository_repair_executor import REPAIR_EXECUTOR_KIND, execute_repository_repair
from tools.second_shift_supervisor_v2 import SupervisorStore

SERVICE_PROTOCOL = "control-gateway.a01-execution-service.v1"


def build_worker(
    store: SupervisorStore,
    *,
    root: Path = ROOT,
    lease_seconds: int = 300,
    renew_seconds: int = 30,
    heartbeat_sla_seconds: int = 300,
    evidence_root: Optional[Path] = None,
) -> A01ExecutionWorker:
    return A01ExecutionWorker(
        store,
        root=root,
        lease_seconds=lease_seconds,
        renew_seconds=renew_seconds,
        heartbeat_sla_seconds=heartbeat_sla_seconds,
        evidence_root=evidence_root,
        executors={REPAIR_EXECUTOR_KIND: execute_repository_repair},
        executor_retry_safety={REPAIR_EXECUTOR_KIND: RECONCILIATION_REQUIRED},
    )


def wiring_report(worker: A01ExecutionWorker) -> dict[str, object]:
    return {
        "protocol_version": SERVICE_PROTOCOL,
        "registered_executors": sorted(worker.executors),
        "repository_repair_registered": REPAIR_EXECUTOR_KIND in worker.executors,
        "repository_repair_retry_safety": worker.executor_retry_safety.get(REPAIR_EXECUTOR_KIND),
        "repair_dispatch_token_present": bool(os.environ.get("A01_REPAIR_DISPATCH_TOKEN")),
        "repository_contents_write_authority": False,
        "scheduling_owner": "A01_SUPERVISOR",
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 production execution service")
    parser.add_argument("--db", required=True)
    parser.add_argument("--poll-seconds", type=int, default=5)
    parser.add_argument("--lease-seconds", type=int, default=300)
    parser.add_argument("--renew-seconds", type=int, default=30)
    parser.add_argument("--heartbeat-sla-seconds", type=int, default=300)
    parser.add_argument("--root", default=str(ROOT))
    parser.add_argument("--evidence-root", default="")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--once", action="store_true")
    group.add_argument("--daemon", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    if not 1 <= args.poll_seconds <= 3600:
        parser.error("--poll-seconds must be 1..3600")

    with SupervisorStore(Path(args.db)) as store:
        worker = build_worker(
            store,
            root=Path(args.root),
            lease_seconds=args.lease_seconds,
            renew_seconds=args.renew_seconds,
            heartbeat_sla_seconds=args.heartbeat_sla_seconds,
            evidence_root=Path(args.evidence_root) if args.evidence_root else None,
        )
        if args.check:
            print(json.dumps(wiring_report(worker), sort_keys=True))
            return 0
        if args.once:
            print(json.dumps(worker.run_once(), sort_keys=True))
            return 0
        while True:
            print(json.dumps(worker.run_once(), sort_keys=True), flush=True)
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
