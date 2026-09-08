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
from learning_lab.fresh_evidence import FreshEvidenceDomainGeneralLearningEngine, FreshEvidenceTaskAdmissionService
from learning_lab.repository import Repository
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


class FreshEvidenceTurnIntegrationTests(unittest.TestCase):
    def test_unified_prepare_turn_surfaces_admitted_fresh_maintenance_prompt_answer_withheld(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Repository(os.path.join(td, "learning.sqlite3"))
            engine = FreshEvidenceDomainGeneralLearningEngine(repo)
            created = engine.create_research_grounded_course_job(
                operation_id="OP-CREATE",
                job_id="JOB-CREATE",
                goal_id="G-FRAC-TURN",
                title="Fractions unlike denominators",
                desired_outcome=REAL_FRACTION_OUTCOME,
            )
            course_id = created["course_id"]
            learner_id = "L-TURN"

            engine.submit_attempt(
                operation_id="OP-M",
                attempt_id="ATT-M",
                learner_id=learner_id,
                course_id=course_id,
                item_id="M-FRAC-LCD-1",
                response="LCD=24; 5/8=15/24; 7/12=14/24",
                submitted_at=0,
            )
            engine.submit_attempt(
                operation_id="OP-R",
                attempt_id="ATT-R",
                learner_id=learner_id,
                course_id=course_id,
                item_id="R-FRAC-LCD-1",
                response="LCD=60; 3/10=18/60; 5/12=25/60",
                submitted_at=3600,
            )
            stale_at = 3600 + engine.RETENTION_FRESHNESS_SECONDS + 1
            engine.submit_maintenance_attempt(
                operation_id="OP-MN2",
                attempt_id="ATT-MN2",
                learner_id=learner_id,
                course_id=course_id,
                task_id="MN-FRAC-LCD-2",
                response="LCD=90; 7/15=42/90; 5/18=25/90",
                submitted_at=stale_at,
            )
            exhausted_at = stale_at + engine.RETENTION_FRESHNESS_SECONDS + 1
            self.assertEqual(
                engine.next_action(learner_id, course_id, now=exhausted_at)["action_type"],
                "MAINTENANCE_RESEARCH_REQUIRED",
            )

            FreshEvidenceTaskAdmissionService(repo).admit(
                operation_id="OP-ADMIT",
                admission_id="ADM-TURN",
                course_id=course_id,
                kind="maintenance",
                candidate=copy.deepcopy(FRESH_LCD),
                admitted_at=exhausted_at,
            )

            scorer = engine._spec_for_course(course_id).behavior_oracle.score
            diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
            tutor = DomainGeneralTutorDirector(repo, engine)
            sessions = MultiSessionDirector(repo, engine)
            journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)
            journey.start_journey(
                operation_id="OP-JOURNEY",
                journey_id="J-TURN",
                diagnostic_id="D-TURN",
                learner_id=learner_id,
                course_id=course_id,
                claimed_skill_ids=[],
                started_at=exhausted_at,
            )
            sessions.start_session(
                operation_id="OP-SESSION",
                session_id="S-TURN",
                learner_id=learner_id,
                course_id=course_id,
                started_at=exhausted_at,
            )

            prepared = prepare_learning_turn(
                repo=repo,
                operation_id="OP-PREPARE",
                turn_id="TURN-FRESH-MAINTENANCE",
                journey_id="J-TURN",
                session_id="S-TURN",
                learner_id=learner_id,
                course_id=course_id,
                now=exhausted_at,
            )
            self.assertEqual(prepared["status"], "PASS")
            self.assertEqual(prepared["mode"], "EVIDENCE")
            self.assertEqual(prepared["action"]["action_type"], "MAINTENANCE_RECHECK")
            self.assertEqual(prepared["action"]["target_id"], "MN-FRAC-LCD-3")
            self.assertEqual(prepared["prompt"], FRESH_LCD["prompt"])
            self.assertTrue(prepared["answer_withheld"])
            self.assertNotIn(FRESH_LCD["answer"], str(prepared))


if __name__ == "__main__":
    unittest.main()
