import hashlib
import sqlite3
import tempfile
import threading
import time
import unittest
from pathlib import Path

from controller_v2 import ControllerStore, IdempotencyConflict, InvalidState, LeaseHeld, canonical_json, new_uuid7

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
SHA_A = "a" * 40
SHA_B = "b" * 40
SHA_C = "c" * 40
POLICY = hashlib.sha256(b"policy-v1").hexdigest()


class FoundationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "controller.db"
        self.store = ControllerStore(self.db, SCHEMA)
        self.store.initialize()
        self.store.register_repository(
            "repo-1", "BFochtman746", "system-master",
            "https://github.com/BFochtman746/system-master"
        )
        self.base = self.store.register_subject("repo-1", SHA_A)
        self.store.register_worker("worker-1", "SECOND_SHIFT", "BOUNDED_MUTATOR")
        self.store.register_worker("worker-2", "SECOND_SHIFT", "BOUNDED_MUTATOR")
        self.resource = "github:BFochtman746/system-master:refs/heads/controller-candidate"
        self.store.ensure_resource(self.resource)

    def tearDown(self):
        self.tmp.cleanup()

    def command(self, command_id=None, payload=None):
        return self.store.submit_command(
            command_id=command_id or new_uuid7(),
            caller_type="CHAT",
            caller_id="chat:test",
            command_type="BUILD_CANDIDATE",
            payload=payload or {"objective": "x"},
            repository_id="repo-1",
            base_subject_id=self.base,
            controller_version="2.0.0-dev",
            controller_commit_oid="d" * 40,
            policy_version="policy-v1",
            policy_digest_sha256=POLICY,
        )

    def make_claimable(self):
        tx = self.command().transaction_id
        self.store.set_execution_state(tx, "PLANNED")
        self.store.set_execution_state(tx, "CLAIMABLE")
        return tx

    def make_succeeded_candidate(self):
        tx = self.make_claimable()
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker-1"
        )
        self.store.set_execution_state(tx, "RUNNING")
        self.store.bind_candidate(tx, SHA_B)
        self.store.set_execution_state(tx, "VERIFYING")
        self.store.set_execution_state(tx, "SUCCEEDED")
        self.store.release_lease(lease.lease_id, lease.fencing_token)
        return tx

    def test_command_retry_is_idempotent(self):
        command_id = new_uuid7()
        first = self.command(command_id, {"objective": "same"})
        second = self.command(command_id, {"objective": "same"})
        self.assertEqual(first.transaction_id, second.transaction_id)
        self.assertFalse(first.duplicate)
        self.assertTrue(second.duplicate)
        self.assertEqual(self.store.counts()["transactions"], 1)

    def test_same_command_id_with_changed_semantics_is_rejected(self):
        command_id = new_uuid7()
        self.command(command_id, {"objective": "one"})
        with self.assertRaises(IdempotencyConflict):
            self.command(command_id, {"objective": "two"})

    def test_illegal_execution_transition_is_rejected(self):
        tx = self.command().transaction_id
        with self.assertRaises(InvalidState):
            self.store.set_execution_state(tx, "RUNNING")
        self.assertEqual(self.store.get_transaction(tx)["execution_state"], "ADMITTED")

    def test_claimed_state_requires_real_lease(self):
        tx = self.make_claimable()
        with self.assertRaises(InvalidState):
            self.store.set_execution_state(tx, "CLAIMED")

    def test_candidate_binding_is_write_once(self):
        tx = self.command().transaction_id
        subject_id = self.store.bind_candidate(tx, SHA_B)
        self.assertEqual(self.store.bind_candidate(tx, SHA_B), subject_id)
        with self.assertRaises(InvalidState):
            self.store.bind_candidate(tx, SHA_C)

    def test_qualification_requires_successful_candidate(self):
        tx = self.command().transaction_id
        with self.assertRaises(InvalidState):
            self.store.set_qualification_state(tx, "PENDING")
        tx = self.make_succeeded_candidate()
        self.store.set_qualification_state(tx, "PENDING")
        self.assertEqual(self.store.get_transaction(tx)["qualification_state"], "PENDING")

    def test_promotion_requires_qualification(self):
        tx = self.make_succeeded_candidate()
        with self.assertRaises(InvalidState):
            self.store.set_promotion_state(tx, "ELIGIBLE")
        for state in ("PENDING", "RUNNING", "QUALIFIED"):
            self.store.set_qualification_state(tx, state)
        self.store.set_promotion_state(tx, "ELIGIBLE")
        self.assertEqual(self.store.get_transaction(tx)["promotion_state"], "ELIGIBLE")

    def test_concurrent_lease_contention_yields_one_winner(self):
        tx = self.make_claimable()
        barrier = threading.Barrier(2)
        winners = []
        errors = []

        def contender(worker_id):
            try:
                barrier.wait(timeout=2)
                winners.append(self.store.acquire_lease(
                    transaction_id=tx, resource_key=self.resource, worker_id=worker_id
                ))
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=contender, args=("worker-1",)),
            threading.Thread(target=contender, args=("worker-2",)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(len(winners), 1)
        self.assertEqual(len(errors), 1)
        self.assertTrue(isinstance(errors[0], (LeaseHeld, InvalidState)))

    def test_many_concurrent_duplicate_commands_collapse_to_one_transaction(self):
        command_id = new_uuid7()
        barrier = threading.Barrier(12)
        transaction_ids = []
        errors = []

        def submitter():
            try:
                barrier.wait(timeout=3)
                transaction_ids.append(
                    self.command(command_id, {"objective": "concurrent-same"}).transaction_id
                )
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=submitter) for _ in range(12)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(set(transaction_ids)), 1)
        self.assertEqual(self.store.counts()["transactions"], 1)

    def test_state_change_creates_event_and_outbox_atomically(self):
        tx = self.command().transaction_id
        before = self.store.counts()
        self.store.set_execution_state(tx, "PLANNED")
        after = self.store.counts()
        self.assertEqual(after["events"], before["events"] + 1)
        self.assertEqual(after["pending_outbox"], before["pending_outbox"] + 1)

    def test_rollback_leaves_no_half_state(self):
        tx = self.command().transaction_id
        con = self.store.connect()
        try:
            con.execute("BEGIN IMMEDIATE")
            con.execute(
                "UPDATE transactions SET execution_state='PLANNED', row_version=row_version+1, updated_at_ms=? WHERE transaction_id=?",
                (int(time.time() * 1000), tx),
            )
            con.execute("ROLLBACK")
        finally:
            con.close()
        self.assertEqual(self.store.get_transaction(tx)["execution_state"], "ADMITTED")

    def test_subject_is_immutable(self):
        con = self.store.connect()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE subjects SET object_oid=? WHERE subject_id=?", (SHA_B, self.base))
        finally:
            con.close()

    def test_event_is_append_only(self):
        tx = self.command().transaction_id
        con = self.store.connect()
        try:
            event_id = con.execute(
                "SELECT event_id FROM controller_events WHERE transaction_id=? LIMIT 1", (tx,)
            ).fetchone()[0]
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("DELETE FROM controller_events WHERE event_id=?", (event_id,))
        finally:
            con.close()

    def test_published_outbox_cannot_reopen(self):
        tx = self.command().transaction_id
        con = self.store.connect()
        try:
            event_id = con.execute(
                "SELECT event_id FROM controller_events WHERE transaction_id=? LIMIT 1", (tx,)
            ).fetchone()[0]
            timestamp = int(time.time() * 1000)
            con.execute(
                "UPDATE outbox_deliveries SET state='INFLIGHT',attempt_count=1,last_attempt_at_ms=? WHERE event_id=?",
                (timestamp, event_id),
            )
            con.execute(
                "UPDATE outbox_deliveries SET state='PUBLISHED',published_at_ms=? WHERE event_id=?",
                (timestamp, event_id),
            )
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE outbox_deliveries SET state='RETRY' WHERE event_id=?", (event_id,))
        finally:
            con.close()

    def test_committed_state_survives_reopen(self):
        tx = self.command().transaction_id
        self.store.set_execution_state(tx, "PLANNED")
        reopened = ControllerStore(self.db, SCHEMA)
        self.assertEqual(reopened.get_transaction(tx)["execution_state"], "PLANNED")

    def test_canonical_profile_rejects_float(self):
        with self.assertRaises(Exception):
            canonical_json({"value": 1.5})


if __name__ == "__main__":
    unittest.main()
