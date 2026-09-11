import hashlib
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from controller_v2 import (
    ControllerStore,
    IdempotencyConflict,
    MigrationChecksumMismatch,
    new_uuid7,
    verify_migrations,
)

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
POLICY = hashlib.sha256(b"policy-v1").hexdigest()


class HardeningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "controller.db"
        self.store = ControllerStore(self.db, SCHEMA)
        self.store.initialize()
        self.store.register_repository(
            "repo-1", "BFochtman746", "system-master",
            "https://github.com/BFochtman746/system-master"
        )
        self.base_a = self.store.register_subject("repo-1", "a" * 40)
        self.base_b = self.store.register_subject("repo-1", "b" * 40)

    def tearDown(self):
        self.tmp.cleanup()

    def submit(self, command_id, base_subject_id, *, controller_version="2.0.0-dev"):
        return self.store.submit_command(
            command_id=command_id,
            caller_type="CHAT",
            caller_id="chat:test",
            command_type="BUILD_CANDIDATE",
            payload={"objective": "same"},
            repository_id="repo-1",
            base_subject_id=base_subject_id,
            controller_version=controller_version,
            controller_commit_oid="d" * 40,
            policy_version="policy-v1",
            policy_digest_sha256=POLICY,
        )

    def test_all_migrations_are_recorded_and_verified(self):
        con = self.store.connect()
        try:
            versions = [row[0] for row in con.execute(
                "SELECT version FROM schema_migrations ORDER BY version"
            )]
            self.assertEqual(versions, [1, 2])
            self.assertEqual(con.execute("PRAGMA user_version").fetchone()[0], 2)
        finally:
            con.close()
        verify_migrations(self.db, ROOT / "schema")

    def test_applied_migration_source_is_immutable(self):
        schema_copy = Path(self.tmp.name) / "schema-copy"
        shutil.copytree(ROOT / "schema", schema_copy)
        verify_migrations(self.db, schema_copy)
        with (schema_copy / "002_hardening.sql").open("a", encoding="utf-8") as handle:
            handle.write("\n-- unauthorized historical edit\n")
        with self.assertRaises(MigrationChecksumMismatch):
            verify_migrations(self.db, schema_copy)

    def test_command_id_cannot_be_retargeted_to_another_base_subject(self):
        command_id = new_uuid7()
        self.submit(command_id, self.base_a)
        with self.assertRaises(IdempotencyConflict):
            self.submit(command_id, self.base_b)

    def test_retry_after_controller_upgrade_returns_original_transaction(self):
        command_id = new_uuid7()
        first = self.submit(command_id, self.base_a, controller_version="2.0.0-dev")
        second = self.submit(command_id, self.base_a, controller_version="2.0.1-dev")
        self.assertTrue(second.duplicate)
        self.assertEqual(first.transaction_id, second.transaction_id)
        self.assertEqual(
            self.store.get_transaction(first.transaction_id)["controller_version"],
            "2.0.0-dev",
        )

    def test_worker_kind_and_trust_class_must_match(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.register_worker(
                "bad-worker", "SECOND_SHIFT", "PROMOTION_AUTHORITY"
            )
        self.store.register_worker(
            "second-shift", "SECOND_SHIFT", "BOUNDED_MUTATOR"
        )
        self.store.register_worker(
            "qualifier", "QUALIFIER", "READ_ONLY_QUALIFIER"
        )
        self.store.register_worker(
            "promoter", "PROMOTER", "PROMOTION_AUTHORITY"
        )


if __name__ == "__main__":
    unittest.main()
