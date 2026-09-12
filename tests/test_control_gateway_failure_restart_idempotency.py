from __future__ import annotations

import concurrent.futures
import datetime as dt
import importlib.util
import json
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_night_scheduler import A01NightScheduler, NightSchedulerError  # noqa: E402
from tools.second_shift_supervisor_v2 import Conflict, StaleWorker, SupervisorStore  # noqa: E402

HELPERS_PATH = ROOT / "tests" / "test_control_gateway_a01_supervisor_coordination.py"
spec = importlib.util.spec_from_file_location("cg009_helpers", HELPERS_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-009 helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

UTC = dt.timezone.utc
IN_SHIFT = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)
OUT_SHIFT = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)


def overnight(name: str, lane: str, *, order=1, priority=100, not_before=None, not_after=None):
    h = helpers.make_handoff(name, lane, execution_class="OVERNIGHT")
    for target in (h["admission_receipt"], h):
        target["execution_order"] = order
        target["priority"] = priority
        target["not_before"] = not_before
        target["not_after"] = not_after
    receipt = h["admission_receipt"]
    receipt_body = dict(receipt)
    receipt_body.pop("admission_digest")
    receipt["admission_digest"] = helpers.digest(receipt_body)
    body = dict(h)
    body.pop("handoff_digest")
    h["handoff_digest"] = helpers.digest(body)
    return h


def set_idempotency_key(handoff, value: str):
    handoff["admission_receipt"]["idempotency_key"] = value
    receipt_body = dict(handoff["admission_receipt"])
    receipt_body.pop("admission_digest")
    handoff["admission_receipt"]["admission_digest"] = helpers.digest(receipt_body)
    handoff["idempotency_key"] = value
    body = dict(handoff)
    body.pop("handoff_digest")
    handoff["handoff_digest"] = helpers.digest(body)


class FailureRestartIdempotencyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def restart(self):
        self.store.close()
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)

    def enqueue(self, name, lane, *, order=1, priority=100, deps=None, resource=None, limit=1,
                not_before=None, not_after=None, graph="CG011"):
        h = overnight(name, lane, order=order, priority=priority,
                      not_before=not_before, not_after=not_after)
        c = helpers.make_coord(
            h, deps=deps or [], resource=resource or f"RESOURCE-{lane}", limit=limit, graph=graph,
        )
        self.scheduler.enqueue(h, c, now=IN_SHIFT)
        return h, c

    def test_crash_before_durable_enqueue_leaves_no_phantom_and_retry_is_safe(self):
        self.restart()
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM night_scheduler_queue").fetchone())
        h, c = self.enqueue("A", "LANE-A")
        row = self.store.conn.execute(
            "SELECT state FROM night_scheduler_queue WHERE delegation_id=?", (h["delegation_id"],)
        ).fetchone()
        self.assertEqual(row["state"], "QUEUED")
        again = self.scheduler.enqueue(h, c, now=IN_SHIFT)
        self.assertEqual(again["state"], "QUEUED")

    def test_restart_from_binding_finishes_exact_binding_without_bypass(self):
        h = overnight("A", "LANE-A")
        c = helpers.make_coord(h, resource="RESOURCE-LANE-A", graph="CG011")
        stamp = IN_SHIFT.isoformat().replace("+00:00", "Z")
        self.store.conn.execute(
            "INSERT INTO night_scheduler_queue(delegation_id,handoff_json,contract_json,scheduler_digest,state,enqueued_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (h["delegation_id"], helpers.canonical(h), helpers.canonical(c),
             self.scheduler._scheduler_digest(h, c), "BINDING", stamp, stamp),
        )
        self.restart()
        with self.assertRaisesRegex(Conflict, "unknown lane"):
            self.store.claim_ready(
                lane=h["lane"], delegation_id=h["delegation_id"], objective_id=h["objective_id"],
                control_head=h["control_head"], idempotency_key=h["idempotency_key"],
                executor_kind=h["executor_kind"], now=IN_SHIFT,
            )
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM claims").fetchone()["n"], 0)
        self.assertEqual(self.scheduler.enqueue(h, c, now=IN_SHIFT)["state"], "QUEUED")

    def test_restart_from_queued_claimed_and_reconcile_states_is_reconstructable(self):
        self.enqueue("A", "LANE-A")
        self.restart()
        claim = self.scheduler.tick(now=IN_SHIFT, max_claims=1, lease_seconds=30)["claims"][0]
        self.restart()
        self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=1))
        state = self.store.conn.execute(
            "SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'"
        ).fetchone()["state"]
        self.assertEqual(state, "CLAIMED")
        self.assertEqual(self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=2))["claims"], [])
        self.store.recover(now=IN_SHIFT + dt.timedelta(seconds=31), heartbeat_sla_seconds=300)
        self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=31))
        state = self.store.conn.execute(
            "SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'"
        ).fetchone()["state"]
        self.assertEqual(state, "RECONCILE")
        self.restart()
        self.assertEqual(self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=32))[0]["state"], "RECONCILE")
        self.assertEqual(claim["delegation_id"], "D-A")

    def test_claim_and_dispatch_intent_commit_atomically_and_survive_restart(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.restart()
        claims = self.store.conn.execute("SELECT * FROM claims WHERE delegation_id='D-A'").fetchall()
        outbox = self.store.conn.execute("SELECT * FROM dispatch_outbox WHERE lease_id=?", (claim["lease_id"],)).fetchall()
        self.assertEqual(len(claims), 1)
        self.assertEqual(len(outbox), 1)
        self.assertEqual(outbox[0]["state"], "PENDING")
        self.assertEqual(self.scheduler.snapshot()["authorization_leaks"], 0)

    def test_ambiguous_dispatch_ack_replay_is_idempotent_but_conflicting_external_identity_fails(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.store.mark_dispatched(claim["dispatch_id"], "RUN-1", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.restart()
        self.store.mark_dispatched(claim["dispatch_id"], "RUN-1", now=IN_SHIFT + dt.timedelta(seconds=2))
        with self.assertRaisesRegex(Conflict, "conflicts"):
            self.store.mark_dispatched(claim["dispatch_id"], "RUN-2", now=IN_SHIFT + dt.timedelta(seconds=3))
        count = self.store.conn.execute(
            "SELECT COUNT(*) n FROM events WHERE dispatch_id=? AND event_type='DISPATCHED'", (claim["dispatch_id"],)
        ).fetchone()["n"]
        self.assertEqual(count, 1)

    def test_duplicate_enqueue_tick_and_claim_delivery_do_not_double_claim(self):
        h, c = self.enqueue("A", "LANE-A")
        self.scheduler.enqueue(h, c, now=IN_SHIFT)
        first = self.scheduler.tick(now=IN_SHIFT)
        second = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=1))
        self.assertEqual(len(first["claims"]), 1)
        self.assertEqual(second["claims"], [])
        self.assertEqual(
            self.store.conn.execute("SELECT COUNT(*) n FROM claims WHERE delegation_id='D-A'").fetchone()["n"], 1,
        )

    def test_idempotency_key_collision_across_different_identities_fails_closed(self):
        a = overnight("A", "LANE-A", priority=200)
        ca = helpers.make_coord(a, resource="A", graph="CG011")
        b = overnight("B", "LANE-B", priority=100)
        set_idempotency_key(b, a["idempotency_key"])
        cb = helpers.make_coord(b, resource="B", graph="CG011")
        self.scheduler.enqueue(a, ca, now=IN_SHIFT)
        self.scheduler.enqueue(b, cb, now=IN_SHIFT)
        result = self.scheduler.tick(now=IN_SHIFT, max_claims=2)
        self.assertEqual([x["delegation_id"] for x in result["claims"]], ["D-A"])
        self.assertTrue(any("idempotency key collision" in x["reason"] for x in result["blocked"]))
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM claims").fetchone()["n"], 1)

    def test_parallel_scheduler_ticks_cannot_double_schedule_or_double_dispatch(self):
        self.enqueue("A", "LANE-A")
        self.store.close()
        barrier = threading.Barrier(2)

        def worker(_):
            with SupervisorStore(self.db) as store:
                scheduler = A01NightScheduler(store)
                barrier.wait()
                return scheduler.tick(now=IN_SHIFT, max_claims=1)

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(worker, range(2)))
        claimed = [c for result in results for c in result["claims"]]
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)
        self.assertEqual(len(claimed), 1, results)
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM claims").fetchone()["n"], 1)
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM dispatch_outbox").fetchone()["n"], 1)

    def test_stale_lease_fence_blocks_late_worker_completion_after_restart(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT, lease_seconds=30)["claims"][0]
        self.restart()
        recovered = self.store.recover(now=IN_SHIFT + dt.timedelta(seconds=31), heartbeat_sla_seconds=300)
        self.assertEqual(recovered["stale_leases"], [claim["lease_id"]])
        with self.assertRaises(StaleWorker):
            self.store.terminal(
                claim["lease_id"], claim["fencing_token"], "COMPLETED",
                now=IN_SHIFT + dt.timedelta(seconds=32),
            )

    def test_cancel_before_claim_survives_restart_and_never_dispatches(self):
        self.enqueue("A", "LANE-A")
        self.scheduler.request_cancel("D-A", "operator cancel", now=IN_SHIFT)
        self.restart()
        self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=1))
        self.assertEqual(self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=2))["claims"], [])
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM dispatch_outbox").fetchone()["n"], 0)
        state = self.store.conn.execute("SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'").fetchone()["state"]
        self.assertEqual(state, "CANCELLED")

    def test_cancel_after_dispatch_waits_for_external_ack_across_restart(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.store.mark_dispatched(claim["dispatch_id"], "RUN-1", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.scheduler.request_cancel("D-A", "operator cancel", now=IN_SHIFT + dt.timedelta(seconds=2))
        row = self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim["dispatch_id"],)).fetchone()
        self.assertEqual(row["state"], "CANCEL_REQUESTED")
        self.restart()
        self.scheduler.coordination.acknowledge_cancel(
            claim["dispatch_id"], "RUN-1", now=IN_SHIFT + dt.timedelta(seconds=3)
        )
        row = self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim["dispatch_id"],)).fetchone()
        self.assertEqual(row["state"], "CANCELLED")
        self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=4))
        self.assertEqual(self.store.conn.execute("SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'").fetchone()["state"], "CANCELLED")

    def test_dependency_success_and_failure_remain_authoritative_across_restart(self):
        self.enqueue("A", "LANE-A", order=0, graph="DEPS")
        self.enqueue("B", "LANE-B", order=1, deps=["D-A"], graph="DEPS")
        parent = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.store.terminal(parent["lease_id"], parent["fencing_token"], "COMPLETED", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.restart()
        child = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=2))["claims"]
        self.assertEqual([x["delegation_id"] for x in child], ["D-B"])

        self.store.close()
        other = Path(self.tmp.name) / "failure.db"
        self.store = SupervisorStore(other)
        self.scheduler = A01NightScheduler(self.store)
        self.enqueue("X", "LANE-X", order=0, graph="FAIL-DEPS")
        self.enqueue("Y", "LANE-Y", order=1, deps=["D-X"], graph="FAIL-DEPS")
        root = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.store.terminal(root["lease_id"], root["fencing_token"], "BLOCKED", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.store.close()
        self.store = SupervisorStore(other)
        self.scheduler = A01NightScheduler(self.store)
        result = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=2))
        self.assertEqual(result["claims"], [])

    def test_resource_capacity_survives_restart(self):
        self.enqueue("A", "LANE-A", resource="GPU", limit=1, priority=200)
        self.enqueue("B", "LANE-B", resource="GPU", limit=1, priority=100)
        first = self.scheduler.tick(now=IN_SHIFT, max_claims=1)
        self.assertEqual([x["delegation_id"] for x in first["claims"]], ["D-A"])
        self.restart()
        second = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=1), max_claims=1)
        self.assertEqual(second["claims"], [])
        self.assertTrue(any("concurrency limit" in x["reason"] for x in second["blocked"]))

    def test_a01_downtime_accumulates_durable_queue_and_resumes_without_loss(self):
        for name in ("A", "B", "C"):
            self.enqueue(name, f"LANE-{name}", resource=f"R-{name}")
        self.restart()
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM night_scheduler_queue WHERE state='QUEUED'").fetchone()["n"], 3)
        result = self.scheduler.tick(now=IN_SHIFT, max_claims=3)
        self.assertEqual(len(result["claims"]), 3)
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM dispatch_outbox").fetchone()["n"], 3)

    def test_not_before_not_after_and_second_shift_boundary_survive_downtime(self):
        future = (IN_SHIFT + dt.timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
        expiry = (IN_SHIFT + dt.timedelta(minutes=45)).isoformat().replace("+00:00", "Z")
        self.enqueue("A", "LANE-A", not_before=future, not_after=expiry)
        self.assertEqual(self.scheduler.tick(now=IN_SHIFT)["claims"], [])
        self.restart()
        at_future = IN_SHIFT + dt.timedelta(minutes=30)
        self.assertEqual([x["delegation_id"] for x in self.scheduler.tick(now=at_future)["claims"]], ["D-A"])

        self.store.close()
        other = Path(self.tmp.name) / "expired.db"
        self.db = other
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)
        self.enqueue("X", "LANE-X", not_before=future, not_after=expiry)
        self.restart()
        self.assertEqual(self.scheduler.tick(now=IN_SHIFT + dt.timedelta(hours=1))["claims"], [])
        self.assertFalse(self.scheduler.tick(now=OUT_SHIFT)["shift_open"])

    def test_dispatch_outbox_pending_intent_is_recovered_exactly_once_after_restart(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.restart()
        pending = self.store.pending_dispatches(now=IN_SHIFT + dt.timedelta(seconds=1))
        self.assertEqual([x["dispatch_id"] for x in pending], [claim["dispatch_id"]])
        self.store.mark_dispatched(claim["dispatch_id"], "RUN-1", now=IN_SHIFT + dt.timedelta(seconds=2))
        self.restart()
        self.assertEqual(self.store.pending_dispatches(now=IN_SHIFT + dt.timedelta(seconds=3)), [])

    def test_exact_terminal_result_replay_is_idempotent_and_does_not_duplicate_terminal_event(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        payload = {"receipt": "R-1", "evidence": "E-1"}
        self.store.terminal(
            claim["lease_id"], claim["fencing_token"], "COMPLETED", payload=payload,
            now=IN_SHIFT + dt.timedelta(seconds=1),
        )
        self.restart()
        self.store.terminal(
            claim["lease_id"], claim["fencing_token"], "COMPLETED", payload=payload,
            now=IN_SHIFT + dt.timedelta(seconds=2),
        )
        count = self.store.conn.execute(
            "SELECT COUNT(*) n FROM events WHERE lease_id=? AND event_type='COMPLETED'", (claim["lease_id"],)
        ).fetchone()["n"]
        self.assertEqual(count, 1)
        with self.assertRaises(Conflict):
            self.store.terminal(
                claim["lease_id"], claim["fencing_token"], "BLOCKED", payload={"receipt": "R-2"},
                now=IN_SHIFT + dt.timedelta(seconds=3),
            )
        with self.assertRaises(StaleWorker):
            self.store.terminal(
                claim["lease_id"], claim["fencing_token"] + 1, "COMPLETED", payload=payload,
                now=IN_SHIFT + dt.timedelta(seconds=4),
            )

    def test_local_running_work_needs_no_github_roundtrip_and_claim_guard_survives_restart(self):
        h, _c = self.enqueue("A", "LANE-A")
        self.restart()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CG010_NIGHT_SCHEDULER_AUTH_REQUIRED"):
            self.store.claim_ready(
                lane=h["lane"], delegation_id=h["delegation_id"], objective_id=h["objective_id"],
                control_head=h["control_head"], idempotency_key=h["idempotency_key"],
                executor_kind=h["executor_kind"], now=IN_SHIFT,
            )
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.store.heartbeat(claim["lease_id"], claim["fencing_token"], "checkpoint-1", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.store.terminal(claim["lease_id"], claim["fencing_token"], "COMPLETED", now=IN_SHIFT + dt.timedelta(seconds=2))
        self.assertEqual(self.store.audit_invariants(), [])
        self.assertEqual(self.scheduler.snapshot()["authorization_leaks"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
