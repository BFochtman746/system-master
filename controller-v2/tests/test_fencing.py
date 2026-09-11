import hashlib
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path

from controller_v2 import ControllerStore, new_uuid7

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
POLICY = hashlib.sha256(b"policy-v1").hexdigest()


class FencingTests(unittest.TestCase):
    def test_retired_worker_cannot_write_after_new_fence(self):
        with tempfile.TemporaryDirectory() as temp:
            store = ControllerStore(Path(temp) / "controller.db", SCHEMA)
            store.initialize()
            store.register_repository(
                "repo-1", "BFochtman746", "system-master",
                "https://github.com/BFochtman746/system-master"
            )
            base = store.register_subject("repo-1", "a" * 40)
            store.register_worker("worker-1", "SECOND_SHIFT", "BOUNDED_MUTATOR")
            store.register_worker("worker-2", "SECOND_SHIFT", "BOUNDED_MUTATOR")
            resource = "github:BFochtman746/system-master:refs/heads/controller-candidate"
            store.ensure_resource(resource)

            command = store.submit_command(
                command_id=new_uuid7(), caller_type="CHAT", caller_id="chat:test",
                command_type="BUILD_CANDIDATE", payload={"objective": "fence-test"},
                repository_id="repo-1", base_subject_id=base,
                controller_version="2.0.0-dev", controller_commit_oid="d" * 40,
                policy_version="policy-v1", policy_digest_sha256=POLICY,
            )
            tx = command.transaction_id
            store.set_execution_state(tx, "PLANNED")
            store.set_execution_state(tx, "CLAIMABLE")
            first = store.acquire_lease(
                transaction_id=tx, resource_key=resource, worker_id="worker-1"
            )

            con = store.connect()
            try:
                con.execute(
                    "INSERT INTO execution_attempts(attempt_id,transaction_id,attempt_number,worker_id,lease_id,fencing_token,state,started_at_ms,finished_at_ms,result_digest_sha256,error_code) "
                    "VALUES('attempt-1',?,?,?,?,?,'STARTED',?,NULL,NULL,NULL)",
                    (tx, 1, "worker-1", first.lease_id, first.fencing_token, int(time.time() * 1000)),
                )
            finally:
                con.close()

            # Deterministically retire the first worker's authority before
            # recovering the transaction and issuing the next fencing token.
            store.release_lease(first.lease_id, first.fencing_token, "TEST_REPLACEMENT")
            store.set_execution_state(tx, "RECOVERING")
            store.set_execution_state(tx, "CLAIMABLE")
            second = store.acquire_lease(
                transaction_id=tx, resource_key=resource, worker_id="worker-2"
            )
            self.assertGreater(second.fencing_token, first.fencing_token)

            con = store.connect()
            try:
                with self.assertRaises(sqlite3.IntegrityError):
                    con.execute(
                        "INSERT INTO worker_results(result_id,transaction_id,attempt_id,lease_id,fencing_token,result_type,payload_json,payload_digest_sha256,accepted_at_ms) "
                        "VALUES('zombie-result',?,?,?,?,?,'{}',?,?)",
                        (
                            tx, "attempt-1", first.lease_id, first.fencing_token,
                            "PROGRESS", hashlib.sha256(b"{}").hexdigest(), int(time.time() * 1000),
                        ),
                    )
            finally:
                con.close()


if __name__ == "__main__":
    unittest.main()
