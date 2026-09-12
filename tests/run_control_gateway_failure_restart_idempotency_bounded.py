from __future__ import annotations

import concurrent.futures
import importlib.util
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "tests" / "test_control_gateway_failure_restart_idempotency.py"

spec = importlib.util.spec_from_file_location("cg011_failure_bounded_target", TARGET)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-011 failure/restart/idempotency suite")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def concurrent_store_reopen_is_nonblocking(self):
    """Two restarted scheduler processes can reopen one initialized durable store."""
    self.enqueue("OPEN", "LANE-OPEN")
    self.store.close()
    barrier = threading.Barrier(2)

    def worker(_):
        barrier.wait(timeout=10)
        with module.SupervisorStore(self.db) as store:
            return store.pragma_state(), store.audit_invariants()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, i) for i in range(2)]
        results = [future.result(timeout=20) for future in futures]

    self.store = module.SupervisorStore(self.db)
    self.scheduler = module.A01NightScheduler(self.store)
    self.assertEqual(len(results), 2)
    for pragma, problems in results:
        self.assertEqual(str(pragma["journal_mode"]).lower(), "wal")
        self.assertEqual(problems, [])


def bounded_parallel_scheduler_ticks(self):
    """Run the original parallel-tick invariant with bounded synchronization.

    Both workers still open independent stores and reach the scheduler tick together.
    If either worker cannot initialize or reach the race point, the test fails instead
    of leaving the qualification job waiting forever.
    """
    self.enqueue("A", "LANE-A")
    self.store.close()
    open_barrier = threading.Barrier(2)
    tick_barrier = threading.Barrier(2)

    def worker(_):
        open_barrier.wait(timeout=10)
        with module.SupervisorStore(self.db) as store:
            scheduler = module.A01NightScheduler(store)
            tick_barrier.wait(timeout=10)
            return scheduler.tick(now=module.IN_SHIFT, max_claims=1)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, i) for i in range(2)]
        results = [future.result(timeout=45) for future in futures]

    claimed = [claim for result in results for claim in result["claims"]]
    self.store = module.SupervisorStore(self.db)
    self.scheduler = module.A01NightScheduler(self.store)
    self.assertEqual(len(claimed), 1, results)
    self.assertEqual(
        self.store.conn.execute("SELECT COUNT(*) n FROM claims").fetchone()["n"], 1
    )
    self.assertEqual(
        self.store.conn.execute("SELECT COUNT(*) n FROM dispatch_outbox").fetchone()["n"], 1
    )


module.FailureRestartIdempotencyTests.test_concurrent_store_reopen_is_nonblocking = concurrent_store_reopen_is_nonblocking
module.FailureRestartIdempotencyTests.test_parallel_scheduler_ticks_cannot_double_schedule_or_double_dispatch = bounded_parallel_scheduler_ticks

suite = unittest.defaultTestLoader.loadTestsFromTestCase(module.FailureRestartIdempotencyTests)
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
