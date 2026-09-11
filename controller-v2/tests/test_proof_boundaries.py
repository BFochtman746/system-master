import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from controller_v2 import ControllerStore, InvalidState, new_uuid7

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
POLICY = hashlib.sha256(b"policy-v1").hexdigest()


class ProofBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "controller.db"
        self.store = ControllerStore(self.db, SCHEMA)
        self.store.initialize()
        self.store.register_repository(
            "repo-1", "BFochtman746", "system-master",
            "https://github.com/BFochtman746/system-master"
        )
        self.base = self.store.register_subject("repo-1", "a" * 40)
        self.store.register_worker("worker", "SECOND_SHIFT", "BOUNDED_MUTATOR")
        self.store.register_worker("qualifier", "QUALIFIER", "READ_ONLY_QUALIFIER")
        self.store.register_worker("promoter", "PROMOTER", "PROMOTION_AUTHORITY")
        self.resource = "github:BFochtman746/system-master:refs/heads/candidate"
        self.store.ensure_resource(self.resource)

    def tearDown(self):
        self.tmp.cleanup()

    def new_tx(self):
        tx = self.store.submit_command(
            command_id=new_uuid7(),
            caller_type="CHAT",
            caller_id="test",
            command_type="BUILD_CANDIDATE",
            payload={"objective": "proof-boundary"},
            repository_id="repo-1",
            base_subject_id=self.base,
            controller_version="2.0.0-dev",
            controller_commit_oid="d" * 40,
            policy_version="policy-v1",
            policy_digest_sha256=POLICY,
        ).transaction_id
        self.store.set_execution_state(tx, "PLANNED")
        self.store.set_execution_state(tx, "CLAIMABLE")
        return tx

    def proven_success(self):
        tx = self.new_tx()
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker"
        )
        self.store.set_execution_state(tx, "RUNNING")
        attempt = self.store.start_execution_attempt(
            transaction_id=tx,
            worker_id="worker",
            lease_id=lease.lease_id,
            fencing_token=lease.fencing_token,
        )
        candidate = self.store.bind_candidate(tx, "b" * 40)
        _, digest = self.store.record_worker_result(
            transaction_id=tx,
            attempt_id=attempt,
            lease_id=lease.lease_id,
            fencing_token=lease.fencing_token,
            result_type="CANDIDATE_READY",
            payload={"candidate_subject_id": candidate},
        )
        self.store.finish_execution_attempt(attempt, "SUCCEEDED", result_digest_sha256=digest)
        self.store.set_execution_state(tx, "VERIFYING")
        self.store.set_execution_state(tx, "SUCCEEDED")
        self.store.release_lease(lease.lease_id, lease.fencing_token)
        return tx

    def test_transaction_cannot_claim_success_without_successful_attempt_proof(self):
        tx = self.new_tx()
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker"
        )
        self.store.set_execution_state(tx, "RUNNING")
        self.store.bind_candidate(tx, "b" * 40)
        self.store.set_execution_state(tx, "VERIFYING")
        with self.assertRaises(InvalidState):
            self.store.set_execution_state(tx, "SUCCEEDED")
        self.store.release_lease(lease.lease_id, lease.fencing_token)

    def test_execution_attempt_cannot_be_inserted_as_already_succeeded(self):
        tx = self.new_tx()
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker"
        )
        now = self.store._clock_ms()
        con = self.store.connect()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute(
                    "INSERT INTO execution_attempts(attempt_id,transaction_id,attempt_number,worker_id,lease_id,fencing_token,state,started_at_ms,finished_at_ms,result_digest_sha256,error_code) "
                    "VALUES('fake',?,?,?,?,?,'SUCCEEDED',?,?,?,NULL)",
                    (tx, 1, "worker", lease.lease_id, lease.fencing_token, now, now, "e" * 64),
                )
        finally:
            con.close()

    def test_direct_qualification_verdict_without_attempt_and_receipt_is_rejected(self):
        tx = self.proven_success()
        self.store.set_qualification_state(tx, "PENDING")
        self.store.set_qualification_state(tx, "RUNNING")
        with self.assertRaises(InvalidState):
            self.store.set_qualification_state(tx, "QUALIFIED")

    def test_qualification_api_binds_exact_candidate_policy_and_receipt(self):
        tx = self.proven_success()
        qid = self.store.start_qualification(tx, "qualifier")
        receipt = self.store.complete_qualification(
            qid,
            "QUALIFIED",
            storage_uri="memory://qualification/test",
            manifest={"checks": ["unit", "integrity"], "result": "PASS"},
        )
        row = self.store.get_transaction(tx)
        self.assertEqual(row["qualification_state"], "QUALIFIED")
        con = self.store.connect()
        try:
            evidence = con.execute(
                "SELECT receipt_kind,subject_id FROM evidence_receipts WHERE receipt_id=?",
                (receipt,),
            ).fetchone()
            self.assertEqual(evidence["receipt_kind"], "QUALIFICATION")
            self.assertEqual(evidence["subject_id"], row["candidate_subject_id"])
        finally:
            con.close()

    def test_expired_lease_cannot_be_renewed_or_revived(self):
        tx = self.new_tx()
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker", ttl_ms=1000
        )
        con = self.store.connect()
        try:
            expires_at = int(con.execute(
                "SELECT expires_at_ms FROM leases WHERE lease_id=?", (lease.lease_id,)
            ).fetchone()[0])
        finally:
            con.close()
        self.store._clock_ms = lambda: expires_at
        with self.assertRaises(InvalidState):
            self.store.renew_lease(lease.lease_id, lease.fencing_token, ttl_ms=1000)

    def test_worker_result_after_lease_release_is_rejected(self):
        tx = self.new_tx()
        lease = self.store.acquire_lease(
            transaction_id=tx, resource_key=self.resource, worker_id="worker"
        )
        self.store.set_execution_state(tx, "RUNNING")
        attempt = self.store.start_execution_attempt(
            transaction_id=tx, worker_id="worker", lease_id=lease.lease_id,
            fencing_token=lease.fencing_token
        )
        self.store.release_lease(lease.lease_id, lease.fencing_token)
        with self.assertRaises(InvalidState):
            self.store.record_worker_result(
                transaction_id=tx, attempt_id=attempt, lease_id=lease.lease_id,
                fencing_token=lease.fencing_token, result_type="PROGRESS", payload={"x": 1}
            )

    def test_transaction_cannot_claim_promoted_without_promotion_attempt(self):
        tx = self.proven_success()
        qid = self.store.start_qualification(tx, "qualifier")
        self.store.complete_qualification(
            qid, "QUALIFIED", storage_uri="memory://qualification/promotion",
            manifest={"result": "PASS"}
        )
        self.store.set_promotion_state(tx, "ELIGIBLE")
        self.store.set_promotion_state(tx, "PROMOTING")
        with self.assertRaises(InvalidState):
            self.store.set_promotion_state(tx, "PROMOTED")


if __name__ == "__main__":
    unittest.main()
