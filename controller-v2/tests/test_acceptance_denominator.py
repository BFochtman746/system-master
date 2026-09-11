import hashlib
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path

from controller_v2 import ControllerStore, InvalidState, new_uuid7

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
POLICY = hashlib.sha256(b"policy-v1").hexdigest()


class AcceptanceDenominatorTests(unittest.TestCase):
    """Executable coverage for Foundation-002 guarantees under the current schema."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "controller.db"
        self.store = ControllerStore(self.db, SCHEMA)
        self.store.initialize()
        self.store.register_repository(
            "repo-1",
            "BFochtman746",
            "system-master",
            "https://github.com/BFochtman746/system-master",
        )
        self.base = self.store.register_subject("repo-1", "a" * 40)
        self.store.register_worker("worker-1", "SECOND_SHIFT", "BOUNDED_MUTATOR")
        self.store.register_worker("worker-2", "SECOND_SHIFT", "BOUNDED_MUTATOR")
        self.resource = "github:BFochtman746/system-master:refs/heads/acceptance-candidate"
        self.store.ensure_resource(self.resource)

    def tearDown(self):
        self.tmp.cleanup()

    def new_tx(self, *, parent=None, relation=None):
        command_id = new_uuid7()
        result = self.store.submit_command(
            command_id=command_id,
            caller_type="CHAT",
            caller_id="acceptance:test",
            command_type="BUILD_CANDIDATE",
            payload={"objective": "denominator"},
            repository_id="repo-1",
            base_subject_id=self.base,
            controller_version="2.0.0-dev",
            controller_commit_oid="d" * 40,
            policy_version="policy-v1",
            policy_digest_sha256=POLICY,
            parent_transaction_id=parent,
            relation_to_parent=relation,
        )
        return command_id, result.transaction_id

    def make_claimable(self):
        _, tx = self.new_tx()
        self.store.set_execution_state(tx, "PLANNED")
        self.store.set_execution_state(tx, "CLAIMABLE")
        return tx

    def test_runtime_sqlite_durability_pragmas_are_active(self):
        con = self.store.connect()
        try:
            self.assertEqual(con.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            self.assertEqual(str(con.execute("PRAGMA journal_mode").fetchone()[0]).lower(), "wal")
            self.assertEqual(con.execute("PRAGMA synchronous").fetchone()[0], 2)
            self.assertEqual(con.execute("PRAGMA trusted_schema").fetchone()[0], 0)
        finally:
            con.close()

    def test_repair_lineage_is_explicit_and_bound_to_parent_transaction(self):
        _, parent = self.new_tx()
        _, child = self.new_tx(parent=parent, relation="REPAIR")
        row = self.store.get_transaction(child)
        self.assertEqual(row["parent_transaction_id"], parent)
        self.assertEqual(row["relation_to_parent"], "REPAIR")

    def test_command_and_evidence_records_are_immutable(self):
        command_id, tx = self.new_tx()
        now = int(time.time() * 1000)
        con = self.store.connect()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE commands SET command_type='DIFFERENT' WHERE command_id=?", (command_id,))
            con.execute(
                "INSERT INTO evidence_receipts(receipt_id,transaction_id,subject_id,receipt_kind,digest_algorithm,digest,storage_uri,manifest_json,created_at_ms) "
                "VALUES(?,?,?,'AUDIT','sha256',?,?,?,?)",
                (new_uuid7(), tx, self.base, "f" * 64, "memory://audit/original", "{}", now),
            )
            receipt = con.execute(
                "SELECT receipt_id FROM evidence_receipts WHERE transaction_id=? AND receipt_kind='AUDIT'", (tx,)
            ).fetchone()[0]
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE evidence_receipts SET storage_uri='memory://audit/changed' WHERE receipt_id=?", (receipt,))
        finally:
            con.close()

    def test_transaction_row_version_cannot_skip_or_regress(self):
        _, tx = self.new_tx()
        con = self.store.connect()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE transactions SET row_version=row_version+2 WHERE transaction_id=?", (tx,))
        finally:
            con.close()
        self.store.set_execution_state(tx, "PLANNED")
        self.assertEqual(self.store.get_transaction(tx)["row_version"], 1)

    def test_projection_sequence_cannot_regress_and_stale_is_explicit(self):
        _, tx = self.new_tx()
        con = self.store.connect()
        try:
            event = con.execute(
                "SELECT event_seq,event_id FROM controller_events WHERE transaction_id=? ORDER BY event_seq DESC LIMIT 1",
                (tx,),
            ).fetchone()
            con.execute(
                "INSERT INTO projection_state(projection_name,destination,last_event_seq,last_event_id,published_at_ms,status,last_error_code) "
                "VALUES('chat-bootstrap','github:control-state',?,?,?, 'CURRENT', NULL)",
                (event["event_seq"], event["event_id"], int(time.time() * 1000)),
            )
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute(
                    "UPDATE projection_state SET last_event_seq=last_event_seq-1 WHERE projection_name='chat-bootstrap'"
                )
            con.execute(
                "UPDATE projection_state SET status='STALE', last_error_code='PUBLISH_LAG' WHERE projection_name='chat-bootstrap'"
            )
            row = con.execute(
                "SELECT last_event_seq,status,last_error_code FROM projection_state WHERE projection_name='chat-bootstrap'"
            ).fetchone()
            self.assertEqual(row["last_event_seq"], event["event_seq"])
            self.assertEqual(row["status"], "STALE")
            self.assertEqual(row["last_error_code"], "PUBLISH_LAG")
        finally:
            con.close()

    def test_external_effects_fail_closed_and_require_reconciliation_after_unknown(self):
        _, tx = self.new_tx()
        now = int(time.time() * 1000)
        con = self.store.connect()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute(
                    "INSERT INTO external_effects(effect_id,transaction_id,provider,effect_type,target_key,idempotency_key,request_digest_sha256,expected_remote_version,state,attempt_count,remote_result_ref,last_error_code,created_at_ms,updated_at_ms) "
                    "VALUES(?,?, 'github','UPDATE_REF','refs/heads/test','bad-initial',?,NULL,'SUCCEEDED',0,NULL,NULL,?,?)",
                    (new_uuid7(), tx, "e" * 64, now, now),
                )
            effect_id = new_uuid7()
            con.execute(
                "INSERT INTO external_effects(effect_id,transaction_id,provider,effect_type,target_key,idempotency_key,request_digest_sha256,expected_remote_version,state,attempt_count,remote_result_ref,last_error_code,created_at_ms,updated_at_ms) "
                "VALUES(?,?, 'github','UPDATE_REF','refs/heads/test','effect-1',?,NULL,'PREPARED',0,NULL,NULL,?,?)",
                (effect_id, tx, "e" * 64, now, now),
            )
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE external_effects SET state='SUCCEEDED',updated_at_ms=? WHERE effect_id=?", (now + 1, effect_id))
            con.execute(
                "UPDATE external_effects SET state='INFLIGHT',attempt_count=1,updated_at_ms=? WHERE effect_id=?",
                (now + 1, effect_id),
            )
            con.execute(
                "UPDATE external_effects SET state='UNKNOWN',last_error_code='TIMEOUT',updated_at_ms=? WHERE effect_id=?",
                (now + 2, effect_id),
            )
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("UPDATE external_effects SET state='PREPARED',updated_at_ms=? WHERE effect_id=?", (now + 3, effect_id))
            con.execute("UPDATE external_effects SET state='RECONCILING',updated_at_ms=? WHERE effect_id=?", (now + 3, effect_id))
            con.execute(
                "UPDATE external_effects SET state='SUCCEEDED',remote_result_ref='remote-1',updated_at_ms=? WHERE effect_id=?",
                (now + 4, effect_id),
            )
            self.assertEqual(con.execute("SELECT state FROM external_effects WHERE effect_id=?", (effect_id,)).fetchone()[0], "SUCCEEDED")
        finally:
            con.close()

    def test_expired_worker_result_is_rejected_without_replacement_worker(self):
        tx = self.make_claimable()
        lease = self.store.acquire_lease(transaction_id=tx, resource_key=self.resource, worker_id="worker-1", ttl_ms=1_000)
        self.store.set_execution_state(tx, "RUNNING")
        attempt = self.store.start_execution_attempt(
            transaction_id=tx, worker_id="worker-1", lease_id=lease.lease_id, fencing_token=lease.fencing_token
        )
        con = self.store.connect()
        try:
            expiry = int(con.execute("SELECT expires_at_ms FROM leases WHERE lease_id=?", (lease.lease_id,)).fetchone()[0])
        finally:
            con.close()
        self.store._clock_ms = lambda: expiry
        with self.assertRaises(InvalidState):
            self.store.record_worker_result(
                transaction_id=tx, attempt_id=attempt, lease_id=lease.lease_id,
                fencing_token=lease.fencing_token, result_type="PROGRESS", payload={"progress": 1}
            )

    def test_kernel_has_no_legacy_controller_or_scheduler_runtime_dependency(self):
        forbidden = (
            "CURRENT-AUTHORITY", "SECOND-SHIFT-REGISTRY", "WORK-OBLIGATION-REGISTRY",
            "github.event", "workflow_dispatch",
        )
        package_dir = ROOT / "controller_v2"
        for source in package_dir.glob("*.py"):
            text = source.read_text(encoding="utf-8")
            for token in forbidden:
                self.assertNotIn(token, text, f"{source.name} depends on legacy/scheduler token {token}")


if __name__ == "__main__":
    unittest.main()
