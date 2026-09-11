from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from learning_lab.cssgb_full_standard_i_c_1 import (
    DOMAIN_KEY,
    OUTCOME,
    CSSGBDFSSRoadmapRoleOracle,
    build_course,
    dossier,
)
from learning_lab.domain_general import DomainRegistry, DomainSpec
from learning_lab.domain_general_evidence_safe import EvidenceSafeDomainGeneralLearningEngine
from learning_lab.repository import Repository


class DomainGeneralLiteralResponseEvidenceTests(unittest.TestCase):
    def _engine(self):
        d = dossier()
        oracle = CSSGBDFSSRoadmapRoleOracle()

        def observer(probe, response_text):
            return False, None

        def move(signature, confirmed, abstained):
            return {"content": "bounded", "claim_refs": []}

        spec = DomainSpec(
            domain_key=DOMAIN_KEY,
            desired_outcome=OUTCOME,
            dossier=d,
            course_factory=build_course,
            behavior_oracle=oracle,
            generation_adapter_id="CSSGB-001E-I-C-1-GROUNDED-CONTENT-V1",
            maintenance_tasks={},
            transfer_tasks={},
            transfer_required_skills=set(),
            tutor_probes={},
            tutor_observer=observer,
            tutor_move=move,
        )
        td = tempfile.TemporaryDirectory()
        repo = Repository(str(Path(td.name) / "learning.sqlite"))
        engine = EvidenceSafeDomainGeneralLearningEngine(repo, registry=DomainRegistry([spec]))
        created = engine.create_research_grounded_course_job(
            operation_id="OP-LITERAL-CREATE",
            job_id="JOB-LITERAL-CREATE",
            goal_id="GOAL-LITERAL-EVIDENCE",
            title="Literal response evidence regression",
            desired_outcome=OUTCOME,
        )
        return td, repo, engine, created["course_id"]

    def test_semantically_correct_noncanonical_json_is_scored_by_oracle_and_preserved(self):
        td, repo, engine, course_id = self._engine()
        try:
            course = engine.course(course_id)
            mastery = next(item for item in course["items"] if item["mode"] == "MASTERY_CHECK")
            literal_response = json.dumps(json.loads(mastery["answer"]), indent=2)
            self.assertNotEqual(literal_response, mastery["answer"])

            result = engine.submit_attempt(
                operation_id="OP-LITERAL-MASTERY",
                attempt_id="ATT-LITERAL-MASTERY",
                learner_id="L-LITERAL",
                course_id=course_id,
                item_id=mastery["item_id"],
                response=literal_response,
                submitted_at=1000,
            )

            self.assertTrue(result["attempt"]["correct"])
            self.assertEqual(result["projection"]["stage"], "RETENTION_DUE")
            self.assertTrue(result["behavior_oracle_applied"])
            self.assertTrue(result["literal_response_preserved"])
            self.assertEqual(result["attempt"]["response"], literal_response)
            self.assertNotEqual(result["attempt"]["response"], mastery["answer"])
            self.assertEqual(repo.count_attempts(), 1)

            replay = engine.submit_attempt(
                operation_id="OP-LITERAL-MASTERY",
                attempt_id="ATT-LITERAL-MASTERY",
                learner_id="L-LITERAL",
                course_id=course_id,
                item_id=mastery["item_id"],
                response=literal_response,
                submitted_at=1000,
            )
            self.assertEqual(replay, result)
            self.assertEqual(repo.count_attempts(), 1)

            with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
                engine.submit_attempt(
                    operation_id="OP-LITERAL-MASTERY",
                    attempt_id="ATT-LITERAL-MASTERY",
                    learner_id="L-LITERAL",
                    course_id=course_id,
                    item_id=mastery["item_id"],
                    response="different learner response",
                    submitted_at=1000,
                )
        finally:
            td.cleanup()


if __name__ == "__main__":
    unittest.main()
