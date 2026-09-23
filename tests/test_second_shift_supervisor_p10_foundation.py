#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from second_shift_supervisor_v2 import Conflict, StaleWorker, SupervisorStore, iso  # noqa: E402

UTC = dt.timezone.utc
T0 = dt.datetime(2026, 9, 11, 5, 0, 0, tzinfo=UTC)
HEAD = "1" * 40


class Fixture:
    def __init__(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "p10.db"
        self.store = SupervisorStore(self.db)
        self.store.register_lane("CORE", "SYSTEM_MASTER/CORE", "system-master/control-v2", HEAD, T0)
        self.store.bind_ready("CORE", "D1", "O1", HEAD, "O1", {"kind": "p10"}, T0)

    def claim(self, *, lease_seconds: int = 600, key: str = "P10-IDEM-1"):
        return self.store.claim_ready(
            "CORE", "D1", "O1", HEAD, key, "LOCAL_AGENT",
            {"task": "p10"}, lease_seconds=lease_seconds, now=T0,
        )

    def close(self) -> None:
        self.store.close()
        self.tmp.cleanup()


def stale_reason(store: SupervisorStore, lease_id: str) -> str:
    row = store.conn.execute(
        "SELECT payload_json FROM events WHERE lease_id=? AND event_type='STALE' ORDER BY seq DESC LIMIT 1",
        (lease_id,),
    ).fetchone()
    if row is None:
        raise AssertionError("STALE event missing")
    return json.loads(row[0])["reason"]


class P10FoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fx = Fixture()

    def tearDown(self) -> None:
        self.fx.close()

    def test_32_way_claim_race_has_exactly_one_winner(self) -> None:
        self.fx.store.close()
        barrier = threading.Barrier(32)

        def worker(i: int):
            with SupervisorStore(self.fx.db) as store:
                barrier.wait()
                try:
                    claim = store.claim_ready(
                        "CORE", "D1", "O1", HEAD, f"P10-RACE-{i}", "LOCAL_AGENT", now=T0
                    )
                    return ("WIN", claim.lease_id, claim.fencing_token)
                except Conflict:
                    return ("CONFLICT", None, None)

        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
            results = list(pool.map(worker, range(32)))
        winners = [item for item in results if item[0] == "WIN"]
        self.assertEqual(len(winners), 1, results)
        self.fx.store = SupervisorStore(self.fx.db)
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_recovery_fences_old_worker_and_rejects_followup_writes(self) -> None:
        claim = self.fx.claim(lease_seconds=600)
        recovered = self.fx.store.recover(T0 + dt.timedelta(seconds=301), heartbeat_sla_seconds=300)
        self.assertEqual(recovered["stale_leases"], [claim.lease_id])
        lane = self.fx.store.conn.execute("SELECT fencing_counter,state FROM lanes WHERE lane='CORE'").fetchone()
        self.assertGreater(int(lane["fencing_counter"]), claim.fencing_token)
        self.assertEqual(lane["state"], "RECONCILE")
        with self.assertRaises(StaleWorker):
            self.fx.store.heartbeat(claim.lease_id, claim.fencing_token, "late", T0 + dt.timedelta(seconds=302))
        with self.assertRaises(StaleWorker):
            self.fx.store.progress(claim.lease_id, claim.fencing_token, {"late": True}, T0 + dt.timedelta(seconds=302))
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_recover_boundary_and_reason_semantics(self) -> None:
        claim = self.fx.claim(lease_seconds=600)
        at_boundary = self.fx.store.recover(T0 + dt.timedelta(seconds=300), heartbeat_sla_seconds=300)
        self.assertEqual(at_boundary["stale_leases"], [])
        after_boundary = self.fx.store.recover(T0 + dt.timedelta(seconds=301), heartbeat_sla_seconds=300)
        self.assertEqual(after_boundary["stale_leases"], [claim.lease_id])
        self.assertEqual(stale_reason(self.fx.store, claim.lease_id), "HEARTBEAT_STALE")

        self.fx.close()
        self.fx = Fixture()
        expiring = self.fx.claim(lease_seconds=300)
        at_expiry = self.fx.store.recover(T0 + dt.timedelta(seconds=300), heartbeat_sla_seconds=300)
        self.assertEqual(at_expiry["stale_leases"], [expiring.lease_id])
        self.assertEqual(stale_reason(self.fx.store, expiring.lease_id), "LEASE_EXPIRED")

    def test_dispatch_budget_opens_circuit_with_exact_next_probe(self) -> None:
        claim = self.fx.claim()
        self.fx.store.dispatch_failed(
            claim.dispatch_id, "network", retry_budget=3,
            now=T0 + dt.timedelta(seconds=1), failure_id="P10-F1",
        )
        self.fx.store.dispatch_failed(
            claim.dispatch_id, "network", retry_budget=3,
            now=T0 + dt.timedelta(seconds=20), failure_id="P10-F2",
        )
        final = self.fx.store.dispatch_failed(
            claim.dispatch_id, "network", retry_budget=3,
            now=T0 + dt.timedelta(seconds=40), failure_id="P10-F3",
        )
        expected = iso(T0 + dt.timedelta(seconds=340))
        self.assertEqual(final["state"], "CIRCUIT_OPEN")
        self.assertEqual(final["attempt"], 3)
        self.assertEqual(final["next_attempt_at"], expected)
        circuit = self.fx.store.conn.execute(
            "SELECT state,failure_count,retry_budget,next_probe_at FROM circuits WHERE dependency_key=?",
            (f"dispatch:{claim.dispatch_id}",),
        ).fetchone()
        self.assertEqual(circuit["state"], "OPEN")
        self.assertEqual(int(circuit["failure_count"]), 3)
        self.assertEqual(int(circuit["retry_budget"]), 3)
        self.assertEqual(circuit["next_probe_at"], expected)

    def _evaluation_claim(self, *, timeout_seconds: int = 60):
        self.fx.store.conn.execute(
            "UPDATE delegations SET payload_json=? WHERE delegation_id='D1'",
            (json.dumps({"kind": "p10", "independent_evaluation_required": True}, sort_keys=True),),
        )
        claim = self.fx.claim()
        self.fx.store.mark_dispatched(claim.dispatch_id, "worker-run-1", T0 + dt.timedelta(seconds=1))
        return claim, timeout_seconds

    def test_independent_evaluation_blocks_direct_completion_and_successor_until_verdict(self) -> None:
        claim, timeout_seconds = self._evaluation_claim()
        with self.assertRaises(Conflict):
            self.fx.store.terminal(claim.lease_id, claim.fencing_token, "COMPLETED", now=T0 + dt.timedelta(seconds=2))
        digest = "a" * 64
        self.fx.store.await_evaluation(
            claim.lease_id, claim.fencing_token, digest, {"candidate": "one"},
            evaluation_timeout_seconds=timeout_seconds, now=T0 + dt.timedelta(seconds=3),
        )
        with self.assertRaises(Conflict):
            self.fx.store.bind_ready("CORE", "D2", "O2", HEAD, "O2", now=T0 + dt.timedelta(seconds=4))
        result = self.fx.store.evaluator_verdict(
            claim.lease_id, claim.fencing_token, "VERDICT-1", "PASS", digest,
            "evaluator-run-1", {"checks": "pass"}, now=T0 + dt.timedelta(seconds=5),
        )
        self.assertEqual(result, "COMPLETED")
        self.fx.store.bind_ready("CORE", "D2", "O2", HEAD, "O2", now=T0 + dt.timedelta(seconds=6))
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_validation_handoff_requires_ack_and_exact_replay_is_idempotent(self) -> None:
        self.fx.store.conn.execute(
            "UPDATE delegations SET payload_json=? WHERE delegation_id='D1'",
            (json.dumps({"kind": "p10", "independent_evaluation_required": True}, sort_keys=True),),
        )
        claim = self.fx.claim()
        digest = "b" * 64
        with self.assertRaises(Conflict):
            self.fx.store.await_evaluation(
                claim.lease_id, claim.fencing_token, digest, {"candidate": "two"},
                evaluation_timeout_seconds=60, now=T0 + dt.timedelta(seconds=1),
            )
        self.fx.store.mark_dispatched(claim.dispatch_id, "worker-run-2", T0 + dt.timedelta(seconds=2))
        self.fx.store.await_evaluation(
            claim.lease_id, claim.fencing_token, digest, {"candidate": "two"},
            evaluation_timeout_seconds=60, now=T0 + dt.timedelta(seconds=3),
        )
        self.fx.store.await_evaluation(
            claim.lease_id, claim.fencing_token, digest, {"candidate": "two"},
            evaluation_timeout_seconds=60, now=T0 + dt.timedelta(seconds=4),
        )
        count = self.fx.store.conn.execute(
            "SELECT COUNT(*) FROM events WHERE lease_id=? AND event_type='VALIDATING'",
            (claim.lease_id,),
        ).fetchone()[0]
        self.assertEqual(count, 1)

    def test_evaluator_identity_digest_and_verdict_replay_are_enforced(self) -> None:
        claim, timeout_seconds = self._evaluation_claim()
        digest = "c" * 64
        self.fx.store.await_evaluation(
            claim.lease_id, claim.fencing_token, digest, {"candidate": "three"},
            evaluation_timeout_seconds=timeout_seconds, now=T0 + dt.timedelta(seconds=2),
        )
        with self.assertRaises(Conflict):
            self.fx.store.evaluator_verdict(
                claim.lease_id, claim.fencing_token, "VERDICT-3A", "PASS", digest,
                "worker-run-1", {"checks": "pass"}, now=T0 + dt.timedelta(seconds=3),
            )
        with self.assertRaises(Conflict):
            self.fx.store.evaluator_verdict(
                claim.lease_id, claim.fencing_token, "VERDICT-3B", "PASS", "d" * 64,
                "evaluator-run-3", {"checks": "pass"}, now=T0 + dt.timedelta(seconds=3),
            )
        first = self.fx.store.evaluator_verdict(
            claim.lease_id, claim.fencing_token, "VERDICT-3C", "PASS", digest,
            "evaluator-run-3", {"checks": "pass"}, now=T0 + dt.timedelta(seconds=4),
        )
        replay = self.fx.store.evaluator_verdict(
            claim.lease_id, claim.fencing_token, "VERDICT-3C", "PASS", digest,
            "evaluator-run-3", {"checks": "pass"}, now=T0 + dt.timedelta(seconds=5),
        )
        self.assertEqual((first, replay), ("COMPLETED", "COMPLETED"))

    def test_validating_candidate_is_staled_by_owner_head_change(self) -> None:
        claim, timeout_seconds = self._evaluation_claim()
        digest = "e" * 64
        self.fx.store.await_evaluation(
            claim.lease_id, claim.fencing_token, digest, {"candidate": "four"},
            evaluation_timeout_seconds=timeout_seconds, now=T0 + dt.timedelta(seconds=2),
        )
        self.fx.store.invalidate_head("CORE", "2" * 40, T0 + dt.timedelta(seconds=3))
        row = self.fx.store.conn.execute("SELECT status FROM claims WHERE lease_id=?", (claim.lease_id,)).fetchone()
        dispatch = self.fx.store.conn.execute("SELECT state FROM dispatch_outbox WHERE lease_id=?", (claim.lease_id,)).fetchone()
        self.assertEqual(row["status"], "STALE")
        self.assertEqual(dispatch["state"], "CANCELLED")
        with self.assertRaises(StaleWorker):
            self.fx.store.evaluator_verdict(
                claim.lease_id, claim.fencing_token, "VERDICT-4", "PASS", digest,
                "evaluator-run-4", {"checks": "pass"}, now=T0 + dt.timedelta(seconds=4),
            )

    def test_evaluation_timeout_fences_candidate_and_allows_successor(self) -> None:
        claim, _ = self._evaluation_claim(timeout_seconds=30)
        digest = "f" * 64
        self.fx.store.await_evaluation(
            claim.lease_id, claim.fencing_token, digest, {"candidate": "five"},
            evaluation_timeout_seconds=30, now=T0 + dt.timedelta(seconds=2),
        )
        recovered = self.fx.store.recover(T0 + dt.timedelta(seconds=33), heartbeat_sla_seconds=300)
        self.assertIn(claim.lease_id, recovered["stale_leases"])
        self.assertEqual(stale_reason(self.fx.store, claim.lease_id), "EVALUATOR_TIMEOUT")
        lane = self.fx.store.conn.execute("SELECT fencing_counter,state FROM lanes WHERE lane='CORE'").fetchone()
        self.assertGreater(int(lane["fencing_counter"]), claim.fencing_token)
        self.assertEqual(lane["state"], "RECONCILE")
        self.fx.store.bind_ready("CORE", "D2", "O2", HEAD, "O2", now=T0 + dt.timedelta(seconds=34))
        self.assertEqual(self.fx.store.audit_invariants(), [])

    def test_audit_invariants_detects_each_claimed_logical_violation(self) -> None:
        # 1. MULTIPLE_ACTIVE_CLAIMS: deliberately remove the storage guard, then seed corruption.
        claim = self.fx.claim()
        self.fx.store.conn.execute("DROP INDEX uq_active_claim_per_lane")
        self.fx.store.conn.execute(
            "INSERT INTO delegations(delegation_id,lane,objective_id,control_head,state,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("D2", "CORE", "O2", HEAD, "CLAIMED", "{}", iso(T0)),
        )
        self.fx.store.conn.execute(
            "INSERT INTO claims(lease_id,lane,delegation_id,objective_id,control_head,idempotency_key,fencing_token,claimed_at,expires_at,heartbeat_at,status,dispatch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            ("P10-SECOND", "CORE", "D2", "O2", HEAD, "P10-IDEM-2", claim.fencing_token,
             iso(T0), iso(T0 + dt.timedelta(seconds=600)), iso(T0), "CLAIMED", "P10-DISPATCH-2"),
        )
        self.assertIn("MULTIPLE_ACTIVE_CLAIMS", self.fx.store.audit_invariants(deep=False))

        # Fresh databases isolate each remaining corruption class so detections are unambiguous.
        self.fx.close(); self.fx = Fixture(); claim = self.fx.claim()
        self.fx.store.conn.execute("UPDATE claims SET released_at=? WHERE lease_id=?", (iso(T0 + dt.timedelta(seconds=1)), claim.lease_id))
        self.assertIn("CLAIMED_LANE_WITHOUT_CLAIM:CORE", self.fx.store.audit_invariants(deep=False))

        self.fx.close(); self.fx = Fixture(); self.fx.claim()
        self.fx.store.conn.execute("UPDATE lanes SET state='READY' WHERE lane='CORE'")
        self.assertIn("LIVE_CLAIM_WITH_NONCLAIMED_LANE:CORE", self.fx.store.audit_invariants(deep=False))

        self.fx.close(); self.fx = Fixture(); self.fx.claim()
        self.fx.store.conn.execute("UPDATE lanes SET fencing_counter=fencing_counter+1 WHERE lane='CORE'")
        self.assertIn("LIVE_CLAIM_FENCE_MISMATCH:CORE", self.fx.store.audit_invariants(deep=False))

        self.fx.close(); self.fx = Fixture()
        self.fx.store.conn.execute("PRAGMA foreign_keys=OFF")
        self.fx.store.conn.execute(
            "INSERT INTO dispatch_outbox(dispatch_id,lane,lease_id,idempotency_key,fencing_token,executor_kind,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            ("P10-ORPHAN", "CORE", "MISSING-LEASE", "P10-ORPHAN-IDEM", 1, "LOCAL_AGENT", "{}", "PENDING", iso(T0), iso(T0)),
        )
        self.assertIn("ORPHAN_DISPATCH_OUTBOX", self.fx.store.audit_invariants(deep=False))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(P10FoundationTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
