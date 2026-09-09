from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from learning_lab.real_learner_pilot_handoff import write_pilot_handoff
from learning_lab.real_learner_pilot_review_intake import (
    RealLearnerPilotReviewIntakeError,
    build_review_intake,
    review_intake_path,
    write_review_intake,
)


class RealLearnerPilotReviewIntakeTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name).resolve()
        self.pilot_id = "PILOT-REVIEW-0001"
        self.state_key = "pilot_review_0001"
        self.manifest = {
            "console_version": "PILOT-001-REAL-PARTICIPANT-CONSOLE-V1",
            "protocol_version": "PILOT-001-v1",
            "pilot_id": self.pilot_id,
            "participant_key": "LRN-SECRET-0001",
            "learner_id": "LEARNER-SECRET-0001",
            "state_key": self.state_key,
            "domain_key": "git",
            "completed": True,
            "completed_at": 5000,
            "participant_outcome": "CLOSED_LOOP_PASS",
        }
        (self.root / f"{self.pilot_id}.manifest.json").write_text(
            json.dumps(self.manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        database_path = self.root / f"{self.state_key}.sqlite3"
        connection = sqlite3.connect(str(database_path))
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE evidence_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("INSERT INTO evidence_probe(value) VALUES (?)", ("review-ready",))
            connection.commit()
        finally:
            connection.close()
        self.completion_path = self.root / f"{self.pilot_id}.completion.json"
        self.completion = {
            "launcher_version": "PILOT-001-REAL-PARTICIPANT-CLOSED-LOOP-V3",
            "protocol_version": "PILOT-001-v1",
            "pilot_id": self.pilot_id,
            "participant_key": "LRN-SECRET-0001",
            "course_id": "COURSE-REVIEW-0001",
            "domain_key": "git",
            "completed_at": 5000,
            "record_digest": "a" * 64,
            "event_count": 9,
            "participant_outcome": "CLOSED_LOOP_PASS",
            "eligible_for_effectiveness_review": True,
            "closed_loop_passed": True,
            "baseline_fraction": 0.0,
            "independent_verification_fraction": 1.0,
            "retention_fraction": 1.0,
            "transfer_fraction": 1.0,
            "observed_verification_minus_baseline": 1.0,
            "retention_delay_seconds": 3600,
            "raw_response_included": False,
            "direct_pii_included": False,
        }
        self.completion_path.write_text(
            json.dumps(self.completion, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        write_pilot_handoff(
            root=self.root,
            manifest=dict(self.manifest),
            completion_package_path=self.completion_path,
        )

    def tearDown(self):
        self.td.cleanup()

    def test_valid_handoff_builds_minimized_review_packet(self):
        packet = build_review_intake(root=self.root, pilot_id=self.pilot_id)
        self.assertEqual(packet["pilot_id"], self.pilot_id)
        self.assertEqual(packet["domain_key"], "git")
        self.assertTrue(packet["eligible_for_effectiveness_review"])
        self.assertEqual(packet["metrics"]["retention_delay_seconds"], 3600)
        self.assertEqual(packet["record_digest"], "a" * 64)
        self.assertEqual(len(packet["handoff_digest"]), 64)
        rendered = json.dumps(packet, sort_keys=True)
        self.assertNotIn("LRN-SECRET-0001", rendered)
        self.assertNotIn("LEARNER-SECRET-0001", rendered)
        self.assertNotIn(self.state_key, rendered)
        self.assertNotIn(str(self.root), rendered)

    def test_tampered_completion_is_rejected_before_review_intake(self):
        altered = dict(self.completion)
        altered["participant_outcome"] = "ALTERED"
        self.completion_path.write_text(json.dumps(altered, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(
            RealLearnerPilotReviewIntakeError,
            "PILOT_REVIEW_INTAKE_HANDOFF_INVALID",
        ):
            build_review_intake(root=self.root, pilot_id=self.pilot_id)

    def test_write_review_intake_stays_local_and_matches_minimized_packet(self):
        packet = write_review_intake(root=self.root, pilot_id=self.pilot_id)
        target = review_intake_path(self.root, self.pilot_id)
        self.assertTrue(target.is_file())
        persisted = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(persisted, packet)
        self.assertFalse(packet["handling"]["external_upload_performed"])
        self.assertFalse(packet["handling"]["external_anchor_created"])
        self.assertFalse(packet["handling"]["external_export_authorized_by_this_packet"])

    def test_truth_and_privacy_boundaries_do_not_overclaim(self):
        packet = build_review_intake(root=self.root, pilot_id=self.pilot_id)
        privacy = packet["privacy_boundary"]
        self.assertTrue(all(value is False for value in privacy.values()))
        truth = packet["truth_boundary"]
        self.assertTrue(truth["packet_is_minimized_review_input"])
        self.assertTrue(truth["packet_is_not_raw_participant_evidence"])
        self.assertTrue(truth["packet_is_not_external_anchor"])
        self.assertFalse(truth["software_independently_proves_human_identity"])
        self.assertFalse(truth["single_participant_proves_population_effectiveness"])
        self.assertEqual(truth["psychometric_validity"], "NOT_PROVEN")
        self.assertEqual(truth["population_validity"], "NOT_PROVEN")


if __name__ == "__main__":
    unittest.main()
