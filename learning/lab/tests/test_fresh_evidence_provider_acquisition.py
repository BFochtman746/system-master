from __future__ import annotations

import copy
import os
import tempfile
import unittest

from learning_lab.adaptive import MultiSessionDirector
from learning_lab.adaptive_entry import AdaptiveEntryJourneyDirector
from learning_lab.baseline_diagnostic import BaselineDiagnosticDirector
from learning_lab.domain_general import DomainGeneralTutorDirector
from learning_lab.fraction_domain import REAL_FRACTION_OUTCOME
from learning_lab.fresh_evidence import FreshEvidenceAdmissionError, FreshEvidenceDomainGeneralLearningEngine
from learning_lab.fresh_evidence_provider import (
    FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND,
    FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING,
    FRESH_EVIDENCE_PROVIDER_INTENT_KIND,
    FreshEvidenceProviderAcquisitionError,
    FreshEvidenceProviderAcquisitionService,
)
from learning_lab.repository import Repository, digest
from learning_lab.unified_turn_controller import prepare_learning_turn


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


class FreshEvidenceProviderAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = FreshEvidenceDomainGeneralLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-FRAC",
            job_id="JOB-CREATE-FRAC",
            goal_id="G-FRAC-IMPL032",
            title="Fractions unlike denominators",
            desired_outcome=REAL_FRACTION_OUTCOME,
        )
        self.course_id = created["course_id"]
        course = self.repo.get_object("course", self.course_id, 1)
        self.dossier_id = course["research_dossier_id"]
        self.course_digest = digest(course)
        self.dossier_digest = digest(self.repo.get_object("research_dossier", self.dossier_id, 1))
        self.service = FreshEvidenceProviderAcquisitionService(self.repo)
        self.provider_calls = 0

    def tearDown(self):
        self.td.cleanup()

    def provider(self, candidate):
        def call(request):
            self.provider_calls += 1
            self.assertEqual(request["course_id"], self.course_id)
            self.assertTrue(request["constraints"]["provider_must_not_assert_admission_or_mastery"])
            return {"candidate": copy.deepcopy(candidate)}
        return call

    def acquire_lcd(self, *, operation="OP-FEP-1", request="REQ-FEP-1", provider=None, crash=None):
        return self.service.acquire_and_admit(
            operation_id=operation,
            request_id=request,
            course_id=self.course_id,
            kind="maintenance",
            skill_id="S-FRAC-EQUIV-LCD",
            criterion_id="C-FRAC-EQUIV-LCD",
            provider_id="provider-test",
            model_id="model-test-v1",
            candidate_provider=provider or self.provider(FRESH_LCD),
            requested_at=100,
            admitted_at=200000,
            crash_after_phase=crash,
        )

    def test_valid_provider_candidate_is_sealed_unverified_then_impl031_admitted(self):
        out = self.acquire_lcd()
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["capture_standing"], FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING)
        self.assertEqual(out["admission"]["standing"], "INDEPENDENT_ORACLE_VALIDATED_FRESH_EVIDENCE_TASK")
        self.assertEqual(self.provider_calls, 1)
        capture = self.service.load_capture("REQ-FEP-1")
        self.assertEqual(capture["candidate_digest"], digest(FRESH_LCD))
        self.assertFalse(capture["authority_boundary"]["provider_is_admission_authority"])
        self.assertFalse(capture["authority_boundary"]["provider_is_mastery_authority"])
        self.assertEqual(digest(self.repo.get_object("course", self.course_id, 1)), self.course_digest)
        self.assertEqual(digest(self.repo.get_object("research_dossier", self.dossier_id, 1)), self.dossier_digest)

    def test_request_is_frozen_before_provider_call(self):
        with self.assertRaisesRegex(RuntimeError, "REQUEST_FROZEN"):
            self.acquire_lcd(crash="REQUEST_FROZEN")
        self.assertEqual(self.provider_calls, 0)
        intent = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_INTENT_KIND, "REQ-FEP-1", 1)
        self.assertIsNotNone(intent)
        self.assertEqual(intent["course_digest"], self.course_digest)
        self.assertIn("F-FRAC-LCD-R2", intent["known_family_ids"])
        out = self.acquire_lcd()
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(self.provider_calls, 1)

    def test_capture_crash_replay_reuses_provider_bytes_without_resampling(self):
        with self.assertRaisesRegex(RuntimeError, "CAPTURE_STORED"):
            self.acquire_lcd(crash="CAPTURE_STORED")
        self.assertEqual(self.provider_calls, 1)
        capture_before = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, "REQ-FEP-1", 1)
        self.assertIsNotNone(capture_before)

        def forbidden_provider(_request):
            self.fail("provider must not be called after durable capture")

        out = self.acquire_lcd(provider=forbidden_provider)
        capture_after = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, "REQ-FEP-1", 1)
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(digest(capture_before), digest(capture_after))
        self.assertEqual(self.provider_calls, 1)

    def test_admission_completion_crash_replay_uses_frozen_family_snapshot(self):
        with self.assertRaisesRegex(RuntimeError, "ADMISSION_COMPLETED"):
            self.acquire_lcd(crash="ADMISSION_COMPLETED")
        self.assertEqual(self.provider_calls, 1)
        self.assertEqual(self.repo.count_objects("fresh_evidence_task_admission"), 1)

        def forbidden_provider(_request):
            self.fail("provider must not be called after admission completed")

        out = self.acquire_lcd(provider=forbidden_provider)
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["admission"]["family_id"], FRESH_LCD["family_id"])
        self.assertEqual(self.provider_calls, 1)

    def test_provider_self_approval_is_rejected_before_capture(self):
        def bad_provider(_request):
            self.provider_calls += 1
            return {"candidate": copy.deepcopy(FRESH_LCD), "verified": True}

        with self.assertRaisesRegex(FreshEvidenceProviderAcquisitionError, "SELF_APPROVAL_FORBIDDEN"):
            self.acquire_lcd(provider=bad_provider)
        self.assertEqual(self.provider_calls, 1)
        self.assertIsNone(self.repo.get_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, "REQ-FEP-1", 1))
        self.assertEqual(self.repo.count_objects("fresh_evidence_task_admission"), 0)

    def test_wrong_reference_answer_is_durably_sealed_but_independent_oracle_rejects_it(self):
        wrong = copy.deepcopy(FRESH_LCD)
        wrong["answer"] = "LCD=30; 5/12=25/30; 7/15=28/30"
        with self.assertRaisesRegex(FreshEvidenceAdmissionError, "ORACLE_REJECTED_REFERENCE_ANSWER"):
            self.acquire_lcd(provider=self.provider(wrong))
        self.assertEqual(self.provider_calls, 1)
        capture = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, "REQ-FEP-1", 1)
        self.assertEqual(capture["standing"], FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING)
        self.assertEqual(self.repo.count_objects("fresh_evidence_task_admission"), 0)

        def corrected_provider(_request):
            self.fail("durably captured wrong candidate must not be silently replaced")

        with self.assertRaisesRegex(FreshEvidenceAdmissionError, "ORACLE_REJECTED_REFERENCE_ANSWER"):
            self.acquire_lcd(provider=corrected_provider)
        self.assertEqual(self.provider_calls, 1)

    def test_known_family_and_scope_drift_fail_before_impl031_admission(self):
        reused = copy.deepcopy(FRESH_LCD)
        reused["item_id"] = "MN-FRAC-LCD-PROVIDER-REUSED"
        reused["family_id"] = "F-FRAC-LCD-R2"
        with self.assertRaisesRegex(FreshEvidenceProviderAcquisitionError, "FAMILY_ALREADY_KNOWN_AT_REQUEST"):
            self.acquire_lcd(provider=self.provider(reused))
        self.assertEqual(self.repo.count_objects("fresh_evidence_task_admission"), 0)

        with tempfile.TemporaryDirectory() as td:
            repo = Repository(os.path.join(td, "other.sqlite3"))
            engine = FreshEvidenceDomainGeneralLearningEngine(repo)
            created = engine.create_research_grounded_course_job(
                operation_id="OP-CREATE",
                job_id="JOB-CREATE",
                goal_id="G2",
                title="Fractions",
                desired_outcome=REAL_FRACTION_OUTCOME,
            )
            service = FreshEvidenceProviderAcquisitionService(repo)
            drift = copy.deepcopy(FRESH_LCD)
            drift["skill_id"] = "S-FRAC-ADD-SUB"
            with self.assertRaisesRegex(FreshEvidenceProviderAcquisitionError, "SKILL_SCOPE_DRIFT"):
                service.acquire_and_admit(
                    operation_id="OP-X",
                    request_id="REQ-X",
                    course_id=created["course_id"],
                    kind="maintenance",
                    skill_id="S-FRAC-EQUIV-LCD",
                    criterion_id="C-FRAC-EQUIV-LCD",
                    provider_id="provider-test",
                    model_id="model-test-v1",
                    candidate_provider=lambda _request: {"candidate": drift},
                    requested_at=1,
                    admitted_at=2,
                )

    def test_request_identity_reuse_with_different_model_fails_without_provider_call(self):
        self.acquire_lcd()
        first_calls = self.provider_calls
        with self.assertRaisesRegex(FreshEvidenceProviderAcquisitionError, "REQUEST_ID_REUSE_WITH_DIFFERENT_INTENT"):
            self.service.acquire_and_admit(
                operation_id="OP-FEP-2",
                request_id="REQ-FEP-1",
                course_id=self.course_id,
                kind="maintenance",
                skill_id="S-FRAC-EQUIV-LCD",
                criterion_id="C-FRAC-EQUIV-LCD",
                provider_id="provider-test",
                model_id="model-test-v2",
                candidate_provider=self.provider(FRESH_LCD),
                requested_at=100,
                admitted_at=200000,
            )
        self.assertEqual(self.provider_calls, first_calls)

    def test_valid_provider_transfer_candidate_is_independently_admitted(self):
        out = self.service.acquire_and_admit(
            operation_id="OP-FEP-T",
            request_id="REQ-FEP-T",
            course_id=self.course_id,
            kind="transfer",
            skill_id="S-FRAC-ADD-SUB",
            criterion_id="C-FRAC-ADD-SUB",
            provider_id="provider-test",
            model_id="model-test-v1",
            candidate_provider=self.provider(FRESH_TRANSFER),
            requested_at=100,
            admitted_at=8000,
        )
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["admission"]["kind"], "transfer")
        self.assertEqual(out["admission"]["task_id"], FRESH_TRANSFER["item_id"])

    def test_provider_admission_recovers_real_blocker_and_unified_turn_withholds_answer(self):
        learner_id = "L-BLOCKER"
        self.engine.submit_attempt(
            operation_id="OP-M",
            attempt_id="ATT-M",
            learner_id=learner_id,
            course_id=self.course_id,
            item_id="M-FRAC-LCD-1",
            response="LCD=24; 5/8=15/24; 7/12=14/24",
            submitted_at=0,
        )
        self.engine.submit_attempt(
            operation_id="OP-R",
            attempt_id="ATT-R",
            learner_id=learner_id,
            course_id=self.course_id,
            item_id="R-FRAC-LCD-1",
            response="LCD=60; 3/10=18/60; 5/12=25/60",
            submitted_at=3600,
        )
        stale_at = 3600 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        self.engine.submit_maintenance_attempt(
            operation_id="OP-MN2",
            attempt_id="ATT-MN2",
            learner_id=learner_id,
            course_id=self.course_id,
            task_id="MN-FRAC-LCD-2",
            response="LCD=90; 7/15=42/90; 5/18=25/90",
            submitted_at=stale_at,
        )
        exhausted_at = stale_at + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        blocked = self.engine.next_action(learner_id, self.course_id, now=exhausted_at)
        self.assertEqual(blocked["action_type"], "MAINTENANCE_RESEARCH_REQUIRED")

        provider_requests = []
        def generating_provider(request):
            self.provider_calls += 1
            provider_requests.append(copy.deepcopy(request))
            self.assertIn("F-FRAC-LCD-R2", request["banned_family_ids"])
            self.assertNotIn(FRESH_LCD["family_id"], request["banned_family_ids"])
            return {"candidate": copy.deepcopy(FRESH_LCD)}

        out = self.service.acquire_and_admit(
            operation_id="OP-FEP-BLOCKER",
            request_id="REQ-FEP-BLOCKER",
            course_id=self.course_id,
            kind="maintenance",
            skill_id="S-FRAC-EQUIV-LCD",
            criterion_id="C-FRAC-EQUIV-LCD",
            provider_id="provider-test",
            model_id="model-test-v1",
            candidate_provider=generating_provider,
            requested_at=exhausted_at,
            admitted_at=exhausted_at,
        )
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(len(provider_requests), 1)
        resumed = self.engine.next_action(learner_id, self.course_id, now=exhausted_at)
        self.assertEqual(resumed["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(resumed["target_id"], FRESH_LCD["item_id"])

        scorer = self.engine._spec_for_course(self.course_id).behavior_oracle.score
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=scorer)
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        sessions = MultiSessionDirector(self.repo, self.engine)
        journey = AdaptiveEntryJourneyDirector(self.repo, self.engine, diagnostic, tutor, sessions)
        journey.start_journey(
            operation_id="OP-JOURNEY",
            journey_id="J-BLOCKER",
            diagnostic_id="D-BLOCKER",
            learner_id=learner_id,
            course_id=self.course_id,
            claimed_skill_ids=[],
            started_at=exhausted_at,
        )
        sessions.start_session(
            operation_id="OP-SESSION",
            session_id="S-BLOCKER",
            learner_id=learner_id,
            course_id=self.course_id,
            started_at=exhausted_at,
        )
        prepared = prepare_learning_turn(
            repo=self.repo,
            operation_id="OP-PREPARE",
            turn_id="TURN-FEP-BLOCKER",
            journey_id="J-BLOCKER",
            session_id="S-BLOCKER",
            learner_id=learner_id,
            course_id=self.course_id,
            now=exhausted_at,
        )
        self.assertEqual(prepared["status"], "PASS")
        self.assertEqual(prepared["action"]["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(prepared["action"]["target_id"], FRESH_LCD["item_id"])
        self.assertEqual(prepared["prompt"], FRESH_LCD["prompt"])
        self.assertTrue(prepared["answer_withheld"])
        self.assertNotIn(FRESH_LCD["answer"], str(prepared))


if __name__ == "__main__":
    unittest.main()
