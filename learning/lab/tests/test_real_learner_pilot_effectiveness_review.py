from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from learning_lab.real_learner_pilot_effectiveness_review import (
    RealLearnerPilotEffectivenessReviewError,
    build_effectiveness_review,
)
from learning_lab.real_learner_pilot_handoff import write_pilot_handoff


class RealLearnerPilotEffectivenessReviewTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name).resolve()

    def tearDown(self):
        self.td.cleanup()

    def _make_pilot(
        self,
        index: int,
        *,
        domain_key: str = "git",
        eligible: bool = True,
        baseline: float = 0.0,
        verification: float = 1.0,
        retention: float = 1.0,
        transfer: float = 1.0,
        delay: float = 3600.0,
        delta: float | None = None,
        record_digest: str | None = None,
        outcome: str | None = None,
    ) -> str:
        pilot_id = f"PILOT-EFFECT-{index:04d}"
        state_key = f"pilot_effect_{index:04d}"
        participant_key = f"LRN-SECRET-{index:04d}"
        learner_id = f"LEARNER-SECRET-{index:04d}"
        manifest = {
            "console_version": "PILOT-001-REAL-PARTICIPANT-CONSOLE-V1",
            "protocol_version": "PILOT-001-v1",
            "pilot_id": pilot_id,
            "participant_key": participant_key,
            "learner_id": learner_id,
            "state_key": state_key,
            "domain_key": domain_key,
            "completed": True,
            "completed_at": 5000 + index,
            "participant_outcome": outcome or ("CLOSED_LOOP_PASS" if eligible else "WITHDRAWN"),
        }
        (self.root / f"{pilot_id}.manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        database_path = self.root / f"{state_key}.sqlite3"
        connection = sqlite3.connect(str(database_path))
        try:
            connection.execute("CREATE TABLE evidence_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("INSERT INTO evidence_probe(value) VALUES (?)", (f"review-{index}",))
            connection.commit()
        finally:
            connection.close()

        completion = {
            "launcher_version": "PILOT-001-REAL-PARTICIPANT-CLOSED-LOOP-V3",
            "protocol_version": "PILOT-001-v1",
            "pilot_id": pilot_id,
            "participant_key": participant_key,
            "course_id": f"COURSE-EFFECT-{index:04d}",
            "domain_key": domain_key,
            "completed_at": 5000 + index,
            "record_digest": record_digest or hashlib.sha256(f"record-{index}".encode("utf-8")).hexdigest(),
            "event_count": 9,
            "participant_outcome": manifest["participant_outcome"],
            "eligible_for_effectiveness_review": eligible,
            "closed_loop_passed": eligible,
            "baseline_fraction": baseline,
            "independent_verification_fraction": verification,
            "retention_fraction": retention,
            "transfer_fraction": transfer,
            "observed_verification_minus_baseline": verification - baseline if delta is None else delta,
            "retention_delay_seconds": delay,
            "raw_response_included": False,
            "direct_pii_included": False,
        }
        completion_path = self.root / f"{pilot_id}.completion.json"
        completion_path.write_text(
            json.dumps(completion, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        write_pilot_handoff(root=self.root, manifest=dict(manifest), completion_package_path=completion_path)
        return pilot_id

    def test_empty_review_is_explicitly_no_evidence(self):
        review = build_effectiveness_review(root=self.root, pilot_ids=[])
        self.assertEqual(review["descriptive_standing"], "NO_ELIGIBLE_HUMAN_EVIDENCE")
        self.assertEqual(review["eligible_record_count"], 0)
        self.assertFalse(review["claims"]["descriptive_summary_allowed"])
        self.assertFalse(review["claims"]["learning_effectiveness_proven"])

    def test_one_eligible_record_is_single_case_descriptive_only(self):
        pilot_id = self._make_pilot(1, baseline=0.25, verification=0.75, retention=0.75, transfer=1.0)
        review = build_effectiveness_review(root=self.root, pilot_ids=[pilot_id])
        self.assertEqual(review["descriptive_standing"], "SINGLE_RECORD_DESCRIPTIVE_ONLY")
        self.assertEqual(review["eligible_record_count"], 1)
        self.assertTrue(review["claims"]["descriptive_summary_allowed"])
        self.assertFalse(review["claims"]["learning_effectiveness_proven"])
        self.assertFalse(review["claims"]["unique_human_participants_verified"])
        cohort = review["cohorts"][0]
        self.assertEqual(cohort["descriptive_metrics"]["observed_verification_minus_baseline"]["mean"], 0.5)

    def test_multiple_records_remain_descriptive_and_compute_same_domain_summary(self):
        first = self._make_pilot(1, baseline=0.0, verification=1.0, retention=1.0, transfer=1.0)
        second = self._make_pilot(2, baseline=0.5, verification=1.0, retention=0.5, transfer=1.0)
        review = build_effectiveness_review(root=self.root, pilot_ids=[first, second])
        self.assertEqual(review["descriptive_standing"], "MULTI_RECORD_DESCRIPTIVE_ONLY")
        self.assertEqual(review["eligible_record_count"], 2)
        self.assertEqual(len(review["cohorts"]), 1)
        metrics = review["cohorts"][0]["descriptive_metrics"]
        self.assertEqual(metrics["baseline_fraction"]["mean"], 0.25)
        self.assertEqual(metrics["retention_fraction"]["mean"], 0.75)
        self.assertFalse(review["claims"]["causal_effect_proven"])
        self.assertFalse(review["claims"]["population_generalization_proven"])

    def test_different_domains_are_not_pooled_into_one_cohort(self):
        first = self._make_pilot(1, domain_key="git")
        second = self._make_pilot(2, domain_key="python")
        review = build_effectiveness_review(root=self.root, pilot_ids=[first, second])
        self.assertEqual(len(review["cohorts"]), 2)
        self.assertEqual({cohort["domain_key"] for cohort in review["cohorts"]}, {"git", "python"})

    def test_ineligible_record_is_preserved_as_excluded_not_silently_dropped(self):
        passed = self._make_pilot(1)
        withdrawn = self._make_pilot(2, eligible=False, outcome="WITHDRAWN")
        review = build_effectiveness_review(root=self.root, pilot_ids=[passed, withdrawn])
        self.assertEqual(review["verified_record_count"], 2)
        self.assertEqual(review["eligible_record_count"], 1)
        self.assertEqual(review["excluded_record_count"], 1)
        self.assertEqual(review["excluded_outcomes"], {"WITHDRAWN": 1})

    def test_duplicate_record_digest_is_rejected(self):
        duplicate = hashlib.sha256(b"duplicate-record").hexdigest()
        first = self._make_pilot(1, record_digest=duplicate)
        second = self._make_pilot(2, record_digest=duplicate)
        with self.assertRaisesRegex(
            RealLearnerPilotEffectivenessReviewError,
            "PILOT_EFFECTIVENESS_REVIEW_DUPLICATE_RECORD_DIGEST",
        ):
            build_effectiveness_review(root=self.root, pilot_ids=[first, second])

    def test_tampered_source_is_rejected_before_aggregation(self):
        pilot_id = self._make_pilot(1)
        completion_path = self.root / f"{pilot_id}.completion.json"
        completion = json.loads(completion_path.read_text(encoding="utf-8"))
        completion["retention_fraction"] = 0.0
        completion_path.write_text(json.dumps(completion, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(
            RealLearnerPilotEffectivenessReviewError,
            "PILOT_EFFECTIVENESS_REVIEW_SOURCE_INVALID",
        ):
            build_effectiveness_review(root=self.root, pilot_ids=[pilot_id])

    def test_eligible_record_below_retention_minimum_is_rejected(self):
        pilot_id = self._make_pilot(1, delay=3599.0)
        with self.assertRaisesRegex(
            RealLearnerPilotEffectivenessReviewError,
            "PILOT_EFFECTIVENESS_RETENTION_DELAY_BELOW_PROTOCOL_MINIMUM",
        ):
            build_effectiveness_review(root=self.root, pilot_ids=[pilot_id])

    def test_inconsistent_reported_gain_is_rejected(self):
        pilot_id = self._make_pilot(1, baseline=0.25, verification=1.0, delta=0.5)
        with self.assertRaisesRegex(
            RealLearnerPilotEffectivenessReviewError,
            "PILOT_EFFECTIVENESS_VERIFICATION_DELTA_INCONSISTENT",
        ):
            build_effectiveness_review(root=self.root, pilot_ids=[pilot_id])

    def test_output_excludes_direct_identity_and_preserves_claim_boundary(self):
        pilot_id = self._make_pilot(1)
        review = build_effectiveness_review(root=self.root, pilot_ids=[pilot_id])
        rendered = json.dumps(review, sort_keys=True)
        self.assertNotIn("LRN-SECRET", rendered)
        self.assertNotIn("LEARNER-SECRET", rendered)
        self.assertNotIn(str(self.root), rendered)
        self.assertTrue(review["truth_boundary"]["eligible_record_count_is_not_verified_unique_human_count"])
        self.assertTrue(review["truth_boundary"]["effectiveness_claim_requires_separate_study_design"])
        self.assertFalse(review["claims"]["psychometric_validity_proven"])


if __name__ == "__main__":
    unittest.main()
