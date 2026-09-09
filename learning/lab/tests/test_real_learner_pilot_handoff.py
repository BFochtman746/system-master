from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from learning_lab.real_learner_pilot_handoff import (
    RealLearnerPilotHandoffError,
    handoff_digest_path,
    handoff_path,
    verify_pilot_handoff,
    write_pilot_handoff,
)


class RealLearnerPilotHandoffTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name).resolve()
        self.pilot_id = "PILOT-HANDOFF-0001"
        self.state_key = "pilot_handoff_0001"
        self.manifest = {
            "console_version": "PILOT-001-REAL-PARTICIPANT-CONSOLE-V1",
            "protocol_version": "PILOT-001-v1",
            "pilot_id": self.pilot_id,
            "participant_key": "LRN-HANDOFF-0001",
            "state_key": self.state_key,
            "completed": True,
            "completed_at": 5000,
            "participant_outcome": "CLOSED_LOOP_PASS",
        }
        (self.root / f"{self.pilot_id}.manifest.json").write_text(
            json.dumps(self.manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        self.database_path = self.root / f"{self.state_key}.sqlite3"
        connection = sqlite3.connect(str(self.database_path))
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE evidence_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("INSERT INTO evidence_probe(value) VALUES (?)", ("digest-only",))
            connection.commit()
        finally:
            connection.close()
        self.completion_path = self.root / f"{self.pilot_id}.completion.json"
        self.completion = {
            "launcher_version": "PILOT-001-REAL-PARTICIPANT-CLOSED-LOOP-V3",
            "protocol_version": "PILOT-001-v1",
            "pilot_id": self.pilot_id,
            "completed_at": 5000,
            "record_digest": "a" * 64,
            "participant_outcome": "CLOSED_LOOP_PASS",
            "eligible_for_effectiveness_review": True,
            "raw_response_included": False,
            "direct_pii_included": False,
        }
        self.completion_path.write_text(
            json.dumps(self.completion, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.td.cleanup()

    def test_handoff_binds_completion_manifest_and_checkpointed_database(self):
        result = write_pilot_handoff(
            root=self.root,
            manifest=dict(self.manifest),
            completion_package_path=self.completion_path,
        )
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(handoff_path(self.root, self.pilot_id).is_file())
        self.assertTrue(handoff_digest_path(self.root, self.pilot_id).is_file())
        envelope = result["envelope"]
        self.assertEqual(envelope["record_digest"], "a" * 64)
        self.assertTrue(envelope["sqlite_checkpoint"]["wal_drained"])
        self.assertFalse(envelope["raw_response_included"])
        self.assertFalse(envelope["direct_pii_included"])
        self.assertNotIn(str(self.root), json.dumps(envelope, sort_keys=True))
        digest_text = handoff_digest_path(self.root, self.pilot_id).read_text(encoding="ascii").strip()
        actual = hashlib.sha256(handoff_path(self.root, self.pilot_id).read_bytes()).hexdigest()
        self.assertEqual(digest_text, actual)
        verified = verify_pilot_handoff(root=self.root, pilot_id=self.pilot_id, state_key=self.state_key)
        self.assertTrue(verified["bound_file_digests_verified"])

    def test_tampered_completion_package_is_detected(self):
        write_pilot_handoff(
            root=self.root,
            manifest=dict(self.manifest),
            completion_package_path=self.completion_path,
        )
        altered = dict(self.completion)
        altered["participant_outcome"] = "ALTERED"
        self.completion_path.write_text(json.dumps(altered, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(
            RealLearnerPilotHandoffError,
            "PILOT_HANDOFF_BOUND_FILE_DIGEST_MISMATCH:completion_package_sha256",
        ):
            verify_pilot_handoff(root=self.root, pilot_id=self.pilot_id, state_key=self.state_key)

    def test_handoff_rejects_completion_package_that_claims_raw_response(self):
        altered = dict(self.completion)
        altered["raw_response_included"] = True
        self.completion_path.write_text(json.dumps(altered, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(RealLearnerPilotHandoffError, "PILOT_HANDOFF_RAW_RESPONSE_BOUNDARY_INVALID"):
            write_pilot_handoff(
                root=self.root,
                manifest=dict(self.manifest),
                completion_package_path=self.completion_path,
            )

    def test_truth_boundary_does_not_overclaim_local_hashes(self):
        result = write_pilot_handoff(
            root=self.root,
            manifest=dict(self.manifest),
            completion_package_path=self.completion_path,
        )
        truth = result["envelope"]["truth_boundary"]
        self.assertFalse(truth["local_hash_files_alone_prevent_malicious_rewrite"])
        self.assertTrue(truth["tamper_detection_after_digest_is_anchored_externally"])
        self.assertEqual(truth["real_learner_effectiveness"], "NOT_PROVEN")


if __name__ == "__main__":
    unittest.main()
