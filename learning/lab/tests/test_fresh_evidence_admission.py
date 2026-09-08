from __future__ import annotations

import copy
import os
import tempfile
import unittest

from learning_lab.fraction_domain import REAL_FRACTION_OUTCOME
from learning_lab.fresh_evidence import (
    FRESH_EVIDENCE_STANDING,
    FreshEvidenceAdmissionError,
    FreshEvidenceDomainGeneralLearningEngine,
    FreshEvidenceTaskAdmissionService,
)
from learning_lab.repository import Repository, digest


FRESH_LCD = {
    "item_id": "MN-FRAC-LCD-3",
    "family_id": "F-FRAC-LCD-R3",
    "criterion_id": "C-FRAC-EQUIV-LCD",
    "skill_id": "S-FRAC-EQUIV-LCD",
    "mode": "RETENTION_CHECK",
    "prompt": "For 5/12 and 7/15, give the LCD and rewrite both fractions using it. Format: LCD=...; 5/12=...; 7/15=...",
    "answer": "LCD=60; 5/12=25/60; 7/15=28/60",
    "scoring_type": "LCD_EQUIV",
    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
    "fresh_family": True,
}

FRESH_TRANSFER = {
    "item_id": "T-FRAC-TRANSFER-RUNNER",
    "family_id": "F-FRAC-TRANSFER-C",
    "criterion_id": "C-FRAC-ADD-SUB",
    "skill_id": "S-FRAC-ADD-SUB",
    "mode": "TRANSFER_CHECK",
    "prompt": "A runner completes 3/7 mile in one segment and 5/9 mile in another. What total distance did the runner complete? Give a simplified fraction of a mile.",
    "answer": "62/63",
    "scoring_type": "FRACTION",
    "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
    "novelty": {
        "surface_context_changed": True,
        "numbers_unseen": True,
        "preserved_construct": "add unlike-denominator fractions and simplify",
    },
}


class FreshEvidenceAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = FreshEvidenceDomainGeneralLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-FRAC",
            job_id="JOB-CREATE-FRAC",
            goal_id="G-FRAC-IMPL031",
            title="Fractions unlike denominators",
            desired_outcome=REAL_FRACTION_OUTCOME,
        )
        self.course_id = created["course_id"]
        self.course_before = digest(self.repo.get_object("course", self.course_id, 1))
        course = self.repo.get_object("course", self.course_id, 1)
        self.dossier_id = course["research_dossier_id"]
        self.dossier_before = digest(self.repo.get_object("research_dossier", self.dossier_id, 1))
        self.service = FreshEvidenceTaskAdmissionService(self.repo)

    def tearDown(self):
        self.td.cleanup()

    def admit_lcd(self, *, op="OP-ADMIT-LCD", admission="ADM-LCD", crash=None):
        return self.service.admit(
            operation_id=op,
            admission_id=admission,
            course_id=self.course_id,
            kind="maintenance",
            candidate=copy.deepcopy(FRESH_LCD),
            admitted_at=200000,
            crash_after_phase=crash,
        )

    def admit_transfer(self):
        return self.service.admit(
            operation_id="OP-ADMIT-TRANSFER",
            admission_id="ADM-TRANSFER",
            course_id=self.course_id,
            kind="transfer",
            candidate=copy.deepcopy(FRESH_TRANSFER),
            admitted_at=8000,
        )

    def master_lcd_and_retain(self):
        self.engine.submit_attempt(
            operation_id="OP-M-LCD",
            attempt_id="ATT-M-LCD",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-FRAC-LCD-1",
            response="LCD=24; 5/8=15/24; 7/12=14/24",
            submitted_at=0,
        )
        self.engine.submit_attempt(
            operation_id="OP-R-LCD",
            attempt_id="ATT-R-LCD",
            learner_id="L1",
            course_id=self.course_id,
            item_id="R-FRAC-LCD-1",
            response="LCD=60; 3/10=18/60; 5/12=25/60",
            submitted_at=3600,
        )

    def master_add_and_retain(self):
        self.master_lcd_and_retain()
        self.engine.submit_attempt(
            operation_id="OP-M-ADD",
            attempt_id="ATT-M-ADD",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-FRAC-ADD-1",
            response="19/12",
            submitted_at=4000,
        )
        self.engine.submit_attempt(
            operation_id="OP-R-ADD",
            attempt_id="ATT-R-ADD",
            learner_id="L1",
            course_id=self.course_id,
            item_id="R-FRAC-SUB-1",
            response="9/20",
            submitted_at=7600,
        )

    def test_valid_fresh_fraction_maintenance_is_oracle_validated_and_overlayed(self):
        out = self.admit_lcd()
        self.assertEqual(out["standing"], FRESH_EVIDENCE_STANDING)
        self.assertTrue(out["oracle_reference_answer_passed"])
        self.assertTrue(out["oracle_negative_control_rejected"])
        tasks = self.engine._tasks_for_skill(self.course_id, "maintenance", "S-FRAC-EQUIV-LCD")
        self.assertIn("MN-FRAC-LCD-3", {t["item_id"] for t in tasks})
        self.assertEqual(digest(self.repo.get_object("course", self.course_id, 1)), self.course_before)
        self.assertEqual(digest(self.repo.get_object("research_dossier", self.dossier_id, 1)), self.dossier_before)

    def test_wrong_reference_answer_is_rejected_by_independent_fraction_oracle(self):
        bad = copy.deepcopy(FRESH_LCD)
        bad["answer"] = "LCD=30; 5/12=25/30; 7/15=28/30"
        with self.assertRaisesRegex(FreshEvidenceAdmissionError, "ORACLE_REJECTED_REFERENCE_ANSWER"):
            self.service.admit(
                operation_id="OP-BAD-KEY",
                admission_id="ADM-BAD-KEY",
                course_id=self.course_id,
                kind="maintenance",
                candidate=bad,
                admitted_at=1,
            )

    def test_reused_family_and_unadmitted_claim_fail_closed(self):
        self.admit_lcd()
        reused = copy.deepcopy(FRESH_LCD)
        reused["item_id"] = "MN-FRAC-LCD-4"
        reused["prompt"] = "For 4/9 and 5/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 4/9=...; 5/12=..."
        reused["answer"] = "LCD=36; 4/9=16/36; 5/12=15/36"
        with self.assertRaisesRegex(FreshEvidenceAdmissionError, "FAMILY_NOT_FRESH"):
            self.service.admit(
                operation_id="OP-REUSED-FAMILY",
                admission_id="ADM-REUSED-FAMILY",
                course_id=self.course_id,
                kind="maintenance",
                candidate=reused,
                admitted_at=2,
            )

        ungrounded = copy.deepcopy(FRESH_TRANSFER)
        ungrounded["claim_refs"] = ["CL-NOT-ADMITTED"]
        with self.assertRaisesRegex(FreshEvidenceAdmissionError, "GROUNDING_NOT_ADMITTED"):
            self.service.admit(
                operation_id="OP-UNGROUNDED",
                admission_id="ADM-UNGROUNDED",
                course_id=self.course_id,
                kind="transfer",
                candidate=ungrounded,
                admitted_at=3,
            )

    def test_exact_replay_recovers_after_task_store_crash(self):
        with self.assertRaisesRegex(RuntimeError, "INJECTED_CRASH_AFTER_FRESH_TASK_STORED"):
            self.admit_lcd(crash="TASK_STORED")
        out = self.admit_lcd()
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["task_id"], "MN-FRAC-LCD-3")
        tasks = self.engine._tasks_for_skill(self.course_id, "maintenance", "S-FRAC-EQUIV-LCD")
        self.assertEqual(sum(t["item_id"] == "MN-FRAC-LCD-3" for t in tasks), 1)

    def test_exact_replay_recovers_after_index_update_without_self_family_rejection(self):
        with self.assertRaisesRegex(RuntimeError, "INJECTED_CRASH_AFTER_FRESH_INDEX_UPDATED"):
            self.admit_lcd(crash="INDEX_UPDATED")
        out = self.admit_lcd()
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["family_id"], "F-FRAC-LCD-R3")
        index = self.repo.get_latest_object(
            "fresh_evidence_task_index",
            f"{self.course_id}:maintenance:S-FRAC-EQUIV-LCD",
        )
        self.assertEqual(len([e for e in index["entries"] if e["task_id"] == "MN-FRAC-LCD-3"]), 1)

    def test_real_maintenance_family_exhaustion_recovers_after_fresh_admission(self):
        self.master_lcd_and_retain()
        stale_at = 3600 + 86401
        before = self.engine.next_action("L1", self.course_id, now=stale_at)
        self.assertEqual(before["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(before["target_id"], "MN-FRAC-LCD-2")
        self.engine.submit_maintenance_attempt(
            operation_id="OP-MN-LCD-2",
            attempt_id="ATT-MN-LCD-2",
            learner_id="L1",
            course_id=self.course_id,
            task_id="MN-FRAC-LCD-2",
            response="LCD=90; 7/15=42/90; 5/18=25/90",
            submitted_at=stale_at,
        )
        exhausted_at = stale_at + 86401
        blocked = self.engine.next_action("L1", self.course_id, now=exhausted_at)
        self.assertEqual(blocked["action_type"], "MAINTENANCE_RESEARCH_REQUIRED")
        self.assertIsNone(blocked["target_id"])

        self.admit_lcd()
        resumed = self.engine.next_action("L1", self.course_id, now=exhausted_at)
        self.assertEqual(resumed["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(resumed["target_id"], "MN-FRAC-LCD-3")
        accepted = self.engine.submit_maintenance_attempt(
            operation_id="OP-MN-LCD-3",
            attempt_id="ATT-MN-LCD-3",
            learner_id="L1",
            course_id=self.course_id,
            task_id="MN-FRAC-LCD-3",
            response=FRESH_LCD["answer"],
            submitted_at=exhausted_at,
        )
        self.assertTrue(accepted["attempt"]["correct"])
        self.assertEqual(accepted["projection"]["gate_states"]["RETENTION"], "SATISFIED")

    def test_real_transfer_family_exhaustion_recovers_after_fresh_admission(self):
        self.master_add_and_retain()
        first = self.engine.next_action("L1", self.course_id, now=7600)
        self.assertEqual(first["action_type"], "TRANSFER_CHECK")
        self.assertEqual(first["target_id"], "T-FRAC-TRANSFER-DISTANCE")
        self.engine.submit_transfer_attempt(
            operation_id="OP-TRANSFER-A",
            attempt_id="ATT-TRANSFER-A",
            learner_id="L1",
            course_id=self.course_id,
            task_id="T-FRAC-TRANSFER-DISTANCE",
            response="1/2",
            submitted_at=7601,
        )
        second = self.engine.next_action("L1", self.course_id, now=7601)
        self.assertEqual(second["action_type"], "TRANSFER_CHECK")
        self.assertEqual(second["target_id"], "T-FRAC-TRANSFER-TANK")
        self.engine.submit_transfer_attempt(
            operation_id="OP-TRANSFER-B",
            attempt_id="ATT-TRANSFER-B",
            learner_id="L1",
            course_id=self.course_id,
            task_id="T-FRAC-TRANSFER-TANK",
            response="1/2",
            submitted_at=7602,
        )
        blocked = self.engine.next_action("L1", self.course_id, now=7602)
        self.assertEqual(blocked["action_type"], "TRANSFER_REMEDIATION")

        self.admit_transfer()
        resumed = self.engine.next_action("L1", self.course_id, now=7603)
        self.assertEqual(resumed["action_type"], "TRANSFER_CHECK")
        self.assertEqual(resumed["target_id"], "T-FRAC-TRANSFER-RUNNER")
        accepted = self.engine.submit_transfer_attempt(
            operation_id="OP-TRANSFER-C",
            attempt_id="ATT-TRANSFER-C",
            learner_id="L1",
            course_id=self.course_id,
            task_id="T-FRAC-TRANSFER-RUNNER",
            response=FRESH_TRANSFER["answer"],
            submitted_at=7604,
        )
        self.assertTrue(accepted["attempt"]["correct"])
        self.assertEqual(accepted["projection"]["gate_states"]["TRANSFER"], "SATISFIED")

    def test_exact_scoring_self_key_is_not_accepted_as_fresh_evidence_authority(self):
        weak = copy.deepcopy(FRESH_TRANSFER)
        weak["item_id"] = "T-FRAC-WEAK-EXACT"
        weak["family_id"] = "F-FRAC-TRANSFER-WEAK"
        weak["scoring_type"] = "EXACT"
        with self.assertRaisesRegex(FreshEvidenceAdmissionError, "EXACT_SELF_KEY_FORBIDDEN"):
            self.service.admit(
                operation_id="OP-WEAK-EXACT",
                admission_id="ADM-WEAK-EXACT",
                course_id=self.course_id,
                kind="transfer",
                candidate=weak,
                admitted_at=4,
            )


if __name__ == "__main__":
    unittest.main()
