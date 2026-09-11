import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from controller_v2 import ControllerStore, IdempotencyConflict, InvalidState, new_uuid7
from controller_v2.reliability import ReliabilityManager, create_verified_backup

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
POLICY = hashlib.sha256(b"policy-v1").hexdigest()


class ReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "controller.db"
        self.store = ControllerStore(self.db, SCHEMA)
        self.store.initialize()
        self.store.register_repository(
            "repo-1", "BFochtman746", "system-master",
            "https://github.com/BFochtman746/system-master"
        )
        self.base = self.store.register_subject("repo-1", "a" * 40)
        self.store.register_worker("worker", "SECOND_SHIFT", "BOUNDED_MUTATOR")
        self.resource = "github:BFochtman746/system-master:refs/heads/f003-candidate"
        self.store.ensure_resource(self.resource)

    def tearDown(self):
        self.tmp.cleanup()

    def new_tx(self):
        return self.store.submit_command(
            command_id=new_uuid7(), caller_type="CHAT", caller_id="reliability:test",
            command_type="BUILD_CANDIDATE", payload={"objective": "f003"},
            repository_id="repo-1", base_subject_id=self.base,
            controller_version="2.0.0-dev", controller_commit_oid="d" * 40,
            policy_version="policy-v1", policy_digest_sha256=POLICY,
        ).transaction_id

    def make_running(self, ttl_ms=60_000):
        tx = self.new_tx()
        self.store.set_execution_state(tx, "PLANNED")
        self.store.set_execution_state(tx, "CLAIMABLE")
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker", ttl_ms=ttl_ms
        )
        self.store.set_execution_state(tx, "RUNNING")
        attempt = self.store.start_execution_attempt(
            transaction_id=tx, worker_id="worker", lease_id=lease.lease_id,
            fencing_token=lease.fencing_token
        )
        return tx, lease, attempt

    def test_online_backup_is_integrity_checked_and_restorable(self):
        tx = self.new_tx()
        backup_path = self.root / "backup" / "controller.sqlite3"
        result = create_verified_backup(self.db, backup_path)
        self.assertEqual(result.path, backup_path)
        self.assertEqual(len(result.sha256), 64)
        self.assertGreater(result.size_bytes, 0)
        con = sqlite3.connect(backup_path)
        try:
            self.assertEqual(con.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(con.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(
                con.execute("SELECT count(*) FROM transactions WHERE transaction_id=?", (tx,)).fetchone()[0],
                1,
            )
        finally:
            con.close()

    def test_effect_prepare_is_idempotent_but_semantic_reuse_conflicts(self):
        tx = self.new_tx()
        manager = ReliabilityManager(self.store)
        first = manager.prepare_effect(
            transaction_id=tx, provider="github", effect_type="UPDATE_REF",
            target_key="refs/heads/candidate", idempotency_key="effect-key-1",
            request_payload={"sha": "b" * 40, "force": False}, expected_remote_version="a" * 40,
        )
        second = manager.prepare_effect(
            transaction_id=tx, provider="github", effect_type="UPDATE_REF",
            target_key="refs/heads/candidate", idempotency_key="effect-key-1",
            request_payload={"sha": "b" * 40, "force": False}, expected_remote_version="a" * 40,
        )
        self.assertEqual(first.effect_id, second.effect_id)
        self.assertFalse(first.duplicate)
        self.assertTrue(second.duplicate)
        with self.assertRaises(IdempotencyConflict):
            manager.prepare_effect(
                transaction_id=tx, provider="github", effect_type="UPDATE_REF",
                target_key="refs/heads/candidate", idempotency_key="effect-key-1",
                request_payload={"sha": "c" * 40, "force": False}, expected_remote_version="a" * 40,
            )

    def test_unknown_effect_must_reconcile_before_resolution(self):
        tx = self.new_tx()
        manager = ReliabilityManager(self.store)
        effect = manager.prepare_effect(
            transaction_id=tx, provider="github", effect_type="UPDATE_REF",
            target_key="refs/heads/candidate", idempotency_key="effect-key-2",
            request_payload={"sha": "b" * 40, "force": False},
        )
        manager.mark_effect_inflight(effect.effect_id)
        manager.record_effect_outcome(effect.effect_id, "UNKNOWN", error_code="TIMEOUT")
        with self.assertRaises(InvalidState):
            manager.resolve_reconciliation(effect.effect_id, "SUCCEEDED", remote_result_ref="github:ref:b")
        manager.begin_reconciliation(effect.effect_id)
        manager.resolve_reconciliation(effect.effect_id, "SUCCEEDED", remote_result_ref="github:ref:b")
        self.assertEqual(manager.get_effect(effect.effect_id)["state"], "SUCCEEDED")

    def test_restart_converts_ambiguous_and_abandoned_work_to_recovery(self):
        tx, lease, attempt = self.make_running(ttl_ms=1_000)
        con = self.store.connect()
        try:
            expiry = int(con.execute(
                "SELECT expires_at_ms FROM leases WHERE lease_id=?", (lease.lease_id,)
            ).fetchone()[0])
        finally:
            con.close()
        manager = ReliabilityManager(self.store, clock_ms=lambda: expiry + 1)
        effect = manager.prepare_effect(
            transaction_id=tx, provider="github", effect_type="UPDATE_REF",
            target_key="refs/heads/candidate", idempotency_key="effect-key-restart",
            request_payload={"sha": "b" * 40, "force": False},
        )
        manager.mark_effect_inflight(effect.effect_id)

        con = self.store.connect()
        try:
            event_id = con.execute(
                "SELECT event_id FROM outbox_deliveries WHERE state='PENDING' ORDER BY rowid LIMIT 1"
            ).fetchone()[0]
            con.execute(
                "UPDATE outbox_deliveries SET state='INFLIGHT',attempt_count=1,last_attempt_at_ms=? WHERE event_id=?",
                (expiry, event_id),
            )
        finally:
            con.close()

        report = manager.recover_after_restart()
        self.assertGreaterEqual(report.expired_leases, 1)
        self.assertGreaterEqual(report.interrupted_attempts, 1)
        self.assertGreaterEqual(report.recovering_transactions, 1)
        self.assertGreaterEqual(report.ambiguous_effects, 1)
        self.assertGreaterEqual(report.requeued_outbox, 1)
        self.assertEqual(self.store.get_transaction(tx)["execution_state"], "RECOVERING")
        con = self.store.connect()
        try:
            self.assertEqual(con.execute(
                "SELECT state FROM execution_attempts WHERE attempt_id=?", (attempt,)
            ).fetchone()[0], "INTERRUPTED")
            self.assertEqual(con.execute(
                "SELECT state FROM leases WHERE lease_id=?", (lease.lease_id,)
            ).fetchone()[0], "EXPIRED")
            self.assertEqual(con.execute(
                "SELECT state FROM external_effects WHERE effect_id=?", (effect.effect_id,)
            ).fetchone()[0], "UNKNOWN")
            self.assertEqual(con.execute(
                "SELECT state FROM outbox_deliveries WHERE event_id=?", (event_id,)
            ).fetchone()[0], "RETRY")
        finally:
            con.close()

    def test_projection_cursor_requires_real_event_and_does_not_self_generate_event(self):
        tx = self.new_tx()
        manager = ReliabilityManager(self.store)
        con = self.store.connect()
        try:
            row = con.execute(
                "SELECT event_seq,event_id FROM controller_events WHERE transaction_id=? ORDER BY event_seq DESC LIMIT 1",
                (tx,),
            ).fetchone()
            before_events = con.execute("SELECT count(*) FROM controller_events").fetchone()[0]
        finally:
            con.close()
        manager.advance_projection(
            "chat-bootstrap", "github:control-state", int(row["event_seq"]), str(row["event_id"])
        )
        con = self.store.connect()
        try:
            self.assertEqual(con.execute("SELECT count(*) FROM controller_events").fetchone()[0], before_events)
        finally:
            con.close()
        with self.assertRaises(InvalidState):
            manager.advance_projection("chat-bootstrap", "github:control-state", 999999, "missing")
        manager.mark_projection_stale("chat-bootstrap", "PUBLISH_LAG")
        self.assertEqual(manager.get_projection("chat-bootstrap")["status"], "STALE")


if __name__ == "__main__":
    unittest.main()
