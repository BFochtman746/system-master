#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import os
import random
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from second_shift_supervisor_v2 import (  # noqa: E402
    Conflict,
    StaleWorker,
    SupervisorStore,
    in_shift,
)

UTC = dt.timezone.utc
NY = ZoneInfo("America/New_York")
T0 = dt.datetime(2026, 9, 11, 5, 0, 0, tzinfo=UTC)  # 01:00 ET
HEAD1 = "1" * 40
HEAD2 = "2" * 40


class SupervisorFixture:
    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.store.register_lane("CORE", "SYSTEM_MASTER/CORE", "system-master/control-v2", HEAD1, T0)
        self.store.bind_ready("CORE", "D1", "O1", HEAD1, "O1", {"kind": "test"}, T0)

    def close(self):
        self.store.close()
        self.tmp.cleanup()


class SupervisorV2Tests(unittest.TestCase):
    def setUp(self):
        self.fx = SupervisorFixture()

    def tearDown(self):
        self.fx.close()

    def claim(self, *, key="IDEM-1", now=T0, head=HEAD1, delegation="D1", objective="O1", lease_seconds=300):
        return self.fx.store.claim_ready(
            "CORE", delegation, objective, head, key, "LOCAL_AGENT",
            {"task": "test"}, lease_seconds=lease_seconds, now=now,
        )

    def test_sqlite_durability_pragmas(self):
        p = self.fx.store.pragma_state()
        self.assertEqual(p["journal_mode"].lower(), "wal")
        self.assertEqual(p["synchronous"], 2)  # FULL
        self.assertEqual(p["foreign_keys"], 1)

    def test_shift_window_normal_day(self):
        self.assertTrue(in_shift(dt.datetime(2026, 9, 11, 4, 0, tzinfo=UTC)))  # midnight ET
        self.assertTrue(in_shift(dt.datetime(2026, 9, 11, 10, 59, tzinfo=UTC)))  # 06:59 ET
        self.assertFalse(in_shift(dt.datetime(2026, 9, 11, 11, 0, tzinfo=UTC)))  # 07:00 ET

    def test_shift_window_fall_dst(self):
        # Both 01:30 occurrences on fall-back day are inside the local-time shift.
        first = dt.datetime(2026, 11, 1, 1, 30, tzinfo=NY, fold=0).astimezone(UTC)
        second = dt.datetime(2026, 11, 1, 1, 30, tzinfo=NY, fold=1).astimezone(UTC)
        self.assertNotEqual(first, second)
        self.assertTrue(in_shift(first))
        self.assertTrue(in_shift(second))

    def test_claim_creates_atomic_dispatch_intent(self):
        c = self.claim()
        snap = self.fx.store.snapshot()
        self.assertEqual(len([x for x in snap["claims"] if x["released_at"] is None]), 1)
        out = [x for x in snap["dispatch_outbox"] if x["dispatch_id"] == c.dispatch_id][0]
        self.assertEqual(out["state"], "PENDING")
        self.assertEqual(out["lease_id"], c.lease_id)
        self.assertEqual(out["fencing_token"], c.fencing_token)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_duplicate_claim_is_idempotent(self):
        a = self.claim()
        b = self.claim()
        self.assertEqual(a, b)
        self.assertEqual(len(self.fx.store.snapshot()["claims"]), 1)

    def test_idempotency_key_collision_fails(self):
        self.claim()
        self.fx.store.terminal(self.fx.store.snapshot()["claims"][0]["lease_id"], 1, "COMPLETED", now=T0 + dt.timedelta(seconds=30))
        self.fx.store.bind_ready("CORE", "D2", "O2", HEAD1, "O2", now=T0 + dt.timedelta(seconds=31))
        with self.assertRaises(Conflict):
            self.fx.store.claim_ready("CORE", "D2", "O2", HEAD1, "IDEM-1", "LOCAL_AGENT", now=T0 + dt.timedelta(seconds=32))

    def test_second_live_claim_fails(self):
        self.claim()
        self.fx.store.conn.execute(
            "INSERT INTO delegations(delegation_id,lane,objective_id,control_head,state,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("D2", "CORE", "O2", HEAD1, "READY", "{}", "2026-09-11T05:00:00Z"),
        )
        with self.assertRaises(Conflict):
            self.fx.store.claim_ready("CORE", "D2", "O2", HEAD1, "IDEM-2", "LOCAL_AGENT", now=T0)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_claim_outside_shift_fails(self):
        with self.assertRaises(Conflict):
            self.claim(now=dt.datetime(2026, 9, 11, 12, 0, tzinfo=UTC))

    def test_dispatch_ack_idempotent(self):
        c = self.claim()
        self.fx.store.mark_dispatched(c.dispatch_id, "run-1", T0 + dt.timedelta(seconds=1))
        self.fx.store.mark_dispatched(c.dispatch_id, "run-1", T0 + dt.timedelta(seconds=2))
        row = self.fx.store.snapshot()["dispatch_outbox"][0]
        self.assertEqual(row["external_run_id"], "run-1")
        self.assertEqual(row["attempt"], 1)

    def test_dispatch_conflicting_ack_fails(self):
        c = self.claim()
        self.fx.store.mark_dispatched(c.dispatch_id, "run-1", T0 + dt.timedelta(seconds=1))
        with self.assertRaises(Conflict):
            self.fx.store.mark_dispatched(c.dispatch_id, "run-2", T0 + dt.timedelta(seconds=2))

    def test_heartbeat_and_progress_keep_exact_fence(self):
        c = self.claim()
        self.fx.store.heartbeat(c.lease_id, c.fencing_token, "cp:2", T0 + dt.timedelta(seconds=10))
        self.fx.store.progress(c.lease_id, c.fencing_token, {"n": 1}, T0 + dt.timedelta(seconds=20))
        row = self.fx.store.snapshot()["claims"][0]
        self.assertEqual(row["checkpoint_pointer"], "cp:2")
        self.assertEqual(row["status"], "RUNNING")

    def test_wrong_fence_rejected(self):
        c = self.claim()
        with self.assertRaises(StaleWorker):
            self.fx.store.heartbeat(c.lease_id, c.fencing_token + 1, "cp", T0 + dt.timedelta(seconds=10))

    def test_head_change_fences_worker(self):
        c = self.claim()
        self.fx.store.invalidate_head("CORE", HEAD2, T0 + dt.timedelta(seconds=10))
        with self.assertRaises(StaleWorker):
            self.fx.store.heartbeat(c.lease_id, c.fencing_token, "late", T0 + dt.timedelta(seconds=11))
        with self.assertRaises(StaleWorker):
            self.fx.store.terminal(c.lease_id, c.fencing_token, "COMPLETED", now=T0 + dt.timedelta(seconds=12))
        snap = self.fx.store.snapshot()
        self.assertEqual(snap["claims"][0]["status"], "STALE")
        self.assertEqual(snap["lanes"][0]["control_head"], HEAD2)
        self.assertGreater(snap["lanes"][0]["fencing_counter"], c.fencing_token)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_expired_worker_cannot_complete(self):
        c = self.claim(lease_seconds=30)
        with self.assertRaises(StaleWorker):
            self.fx.store.terminal(c.lease_id, c.fencing_token, "COMPLETED", now=T0 + dt.timedelta(seconds=31))

    def test_recover_expires_abandoned_claim(self):
        c = self.claim(lease_seconds=30)
        r = self.fx.store.recover(T0 + dt.timedelta(seconds=31), heartbeat_sla_seconds=300)
        self.assertIn(c.lease_id, r["stale_leases"])
        self.assertEqual(self.fx.store.snapshot()["claims"][0]["status"], "STALE")
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_recover_stale_heartbeat(self):
        c = self.claim(lease_seconds=600)
        r = self.fx.store.recover(T0 + dt.timedelta(seconds=301), heartbeat_sla_seconds=300)
        self.assertIn(c.lease_id, r["stale_leases"])

    def test_terminal_releases_claim_and_allows_successor(self):
        c = self.claim()
        self.fx.store.terminal(c.lease_id, c.fencing_token, "COMPLETED", {"evidence": "ok"}, T0 + dt.timedelta(seconds=10))
        self.fx.store.bind_ready("CORE", "D2", "O2", HEAD1, "O2", now=T0 + dt.timedelta(seconds=11))
        c2 = self.fx.store.claim_ready("CORE", "D2", "O2", HEAD1, "IDEM-2", "LOCAL_AGENT", now=T0 + dt.timedelta(seconds=12))
        self.assertGreater(c2.fencing_token, c.fencing_token)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_dispatch_retry_then_circuit(self):
        c = self.claim()
        a = self.fx.store.dispatch_failed(c.dispatch_id, "network", retry_budget=3, now=T0 + dt.timedelta(seconds=1))
        b = self.fx.store.dispatch_failed(c.dispatch_id, "network", retry_budget=3, now=T0 + dt.timedelta(seconds=20))
        c3 = self.fx.store.dispatch_failed(c.dispatch_id, "network", retry_budget=3, now=T0 + dt.timedelta(seconds=40))
        self.assertEqual(a["state"], "RETRY_WAIT")
        self.assertEqual(b["state"], "RETRY_WAIT")
        self.assertEqual(c3["state"], "CIRCUIT_OPEN")
        self.assertEqual(self.fx.store.pending_dispatches(T0 + dt.timedelta(minutes=20)), [])
        self.assertEqual(self.fx.store.snapshot()["circuits"][0]["state"], "OPEN")

    def test_retry_budget_guard(self):
        c = self.claim()
        for bad in (0, 4, 99):
            with self.assertRaises(ValueError):
                self.fx.store.dispatch_failed(c.dispatch_id, "x", retry_budget=bad, now=T0)

    def test_pending_dispatch_survives_clean_restart(self):
        c = self.claim()
        db = self.fx.db
        self.fx.store.close()
        self.fx.store = SupervisorStore(db)
        p = self.fx.store.pending_dispatches(T0 + dt.timedelta(seconds=1))
        self.assertEqual(len(p), 1)
        self.assertEqual(p[0]["dispatch_id"], c.dispatch_id)
        self.assertEqual(p[0]["idempotency_key"], c.idempotency_key)

    def test_unknown_external_dispatch_outcome_remains_reconcilable(self):
        c = self.claim()
        # Simulate: external dispatch request may have left the machine, process dies before acknowledgement.
        db = self.fx.db
        self.fx.store.close()
        self.fx.store = SupervisorStore(db)
        p = self.fx.store.pending_dispatches(T0 + dt.timedelta(seconds=1))
        self.assertEqual(p[0]["dispatch_id"], c.dispatch_id)
        self.assertIsNone(p[0]["external_run_id"])
        # The persistent dispatch_id is the lookup/deduplication key; no new lease is created.
        again = self.fx.store.claim_ready("CORE", "D1", "O1", HEAD1, "IDEM-1", "LOCAL_AGENT", now=T0 + dt.timedelta(seconds=2))
        self.assertEqual(again.dispatch_id, c.dispatch_id)

    def test_uncommitted_sqlite_transaction_rolls_back_after_abrupt_exit(self):
        db = self.fx.db
        self.fx.store.close()
        code = f"""
import os, sys
sys.path.insert(0, {str(ROOT / 'tools')!r})
from second_shift_supervisor_v2 import SupervisorStore
s=SupervisorStore({str(db)!r})
s.conn.execute('BEGIN IMMEDIATE')
s.conn.execute("INSERT INTO supervisor_meta(key,value) VALUES('crash-uncommitted','x')")
os._exit(17)
"""
        p = subprocess.run([sys.executable, "-c", code], check=False)
        self.assertEqual(p.returncode, 17)
        self.fx.store = SupervisorStore(db)
        row = self.fx.store.conn.execute("SELECT value FROM supervisor_meta WHERE key='crash-uncommitted'").fetchone()
        self.assertIsNone(row)
        self.assertEqual(self.fx.store.conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_committed_sqlite_transaction_survives_abrupt_exit(self):
        db = self.fx.db
        self.fx.store.close()
        code = f"""
import os, sys
sys.path.insert(0, {str(ROOT / 'tools')!r})
from second_shift_supervisor_v2 import SupervisorStore
s=SupervisorStore({str(db)!r})
with s.tx() as c:
    c.execute("INSERT INTO supervisor_meta(key,value) VALUES('crash-committed','y')")
os._exit(19)
"""
        p = subprocess.run([sys.executable, "-c", code], check=False)
        self.assertEqual(p.returncode, 19)
        self.fx.store = SupervisorStore(db)
        row = self.fx.store.conn.execute("SELECT value FROM supervisor_meta WHERE key='crash-committed'").fetchone()
        self.assertEqual(row[0], "y")
        self.assertEqual(self.fx.store.conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_32_way_concurrent_claim_race_allows_exactly_one(self):
        self.fx.store.close()
        db = self.fx.db
        barrier = threading.Barrier(32)

        def worker(i):
            with SupervisorStore(db) as s:
                barrier.wait()
                try:
                    c = s.claim_ready("CORE", "D1", "O1", HEAD1, f"RACE-{i}", "LOCAL_AGENT", now=T0)
                    return ("OK", c.lease_id)
                except Conflict:
                    return ("CONFLICT", None)

        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as ex:
            results = list(ex.map(worker, range(32)))
        ok = [x for x in results if x[0] == "OK"]
        self.assertEqual(len(ok), 1, results)
        self.fx.store = SupervisorStore(db)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_32_way_same_idempotency_race_returns_one_claim_identity(self):
        self.fx.store.close()
        db = self.fx.db
        barrier = threading.Barrier(32)

        def worker(_):
            with SupervisorStore(db) as s:
                barrier.wait()
                c = s.claim_ready("CORE", "D1", "O1", HEAD1, "SAME-IDEM", "LOCAL_AGENT", now=T0)
                return (c.lease_id, c.dispatch_id, c.fencing_token)

        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as ex:
            results = list(ex.map(worker, range(32)))
        self.assertEqual(len(set(results)), 1, results)
        self.fx.store = SupervisorStore(db)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_four_lanes_are_independent(self):
        s = self.fx.store
        for lane, digit in [("LEARNING", "3"), ("BOOK", "4"), ("DOCUMENTS", "5")]:
            head = digit * 40
            s.register_lane(lane, f"SYSTEM_MASTER/{lane}", f"{lane.lower()}/control", head, T0)
            s.bind_ready(lane, f"D-{lane}", f"O-{lane}", head, f"O-{lane}", now=T0)
            s.claim_ready(lane, f"D-{lane}", f"O-{lane}", head, f"IDEM-{lane}", "LOCAL_AGENT", now=T0)
        self.claim()
        active = [x for x in s.snapshot()["claims"] if x["released_at"] is None]
        self.assertEqual({x["lane"] for x in active}, {"CORE", "LEARNING", "BOOK", "DOCUMENTS"})
        self.assertEqual(s.audit_invariants(), [])

    def test_audit_export_is_not_coordination_database(self):
        c = self.claim()
        out = Path(self.fx.tmp.name) / "audit.json"
        self.fx.store.export_audit_json(out)
        data = json.loads(out.read_text())
        self.assertEqual(data["claims"][0]["lease_id"], c.lease_id)
        # Deleting the export must not alter live DB state.
        out.unlink()
        self.assertEqual(len([x for x in self.fx.store.snapshot()["claims"] if x["released_at"] is None]), 1)

    def test_randomized_20000_transition_invariant_stress(self):
        rnd = random.Random(0x5EC0D5)
        s = self.fx.store
        heads = {"CORE": HEAD1}
        next_id = {"CORE": 2}
        now = T0
        for i in range(20000):
            now += dt.timedelta(milliseconds=100)
            snap = s.snapshot()
            lane_row = snap["lanes"][0]
            lane = "CORE"
            active = [x for x in snap["claims"] if x["lane"] == lane and x["released_at"] is None]
            choice = rnd.randrange(10)
            try:
                if active:
                    c = active[0]
                    token = c["fencing_token"]
                    if choice <= 3:
                        s.heartbeat(c["lease_id"], token, f"cp:{i}", now)
                    elif choice <= 5:
                        s.progress(c["lease_id"], token, {"i": i}, now)
                    elif choice == 6:
                        s.mark_dispatched(c["dispatch_id"], f"run-{c['dispatch_id']}", now)
                    elif choice == 7:
                        s.terminal(c["lease_id"], token, rnd.choice(["COMPLETED", "BLOCKED"]), {"i": i}, now)
                    elif choice == 8:
                        new_head = f"{(i % 15) + 1:x}" * 40
                        new_head = new_head[:40]
                        heads[lane] = new_head
                        s.invalidate_head(lane, new_head, now)
                    else:
                        s.recover(now, heartbeat_sla_seconds=600)
                else:
                    if lane_row["state"] in ("IDLE", "RECONCILE"):
                        n = next_id[lane]
                        did, oid = f"D{n}", f"O{n}"
                        try:
                            s.bind_ready(lane, did, oid, heads[lane], oid, {"i": i}, now)
                            next_id[lane] += 1
                        except Conflict:
                            pass
                    elif lane_row["state"] == "READY":
                        did = lane_row["current_delegation_id"]
                        row = next(x for x in s.snapshot()["delegations"] if x["delegation_id"] == did)
                        s.claim_ready(lane, did, row["objective_id"], heads[lane], f"FUZZ-{i}-{did}", "LOCAL_AGENT", now=now)
            except (Conflict, StaleWorker):
                # Rejected operations are acceptable; DB invariants must still hold.
                pass
            problems = s.audit_invariants()
            if problems:
                self.fail(f"invariant failure at step {i}: {problems}")
        self.assertEqual(s.conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SupervisorV2Tests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {
        "suite": "SECOND_SHIFT_SUPERVISOR_V2_CRASH_CONCURRENCY_STRESS",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "successful": result.wasSuccessful(),
    }
    Path(".second-shift-supervisor-v2-stress.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    raise SystemExit(0 if result.wasSuccessful() else 1)
