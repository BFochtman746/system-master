from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from .domain_general import DomainGeneralLearningEngine
from .models import Attempt


class EvidenceSafeDomainGeneralLearningEngine(DomainGeneralLearningEngine):
    """Domain-general runtime successor that preserves literal learner evidence.

    DomainGeneralLearningEngine already delegates correctness to the owning
    domain behavior oracle. Its legacy adapter then converts the submitted
    response into the reference answer or a rejection sentinel before calling
    LearningEngine.submit_attempt. That preserves mastery projection semantics,
    but it does not preserve the literal learner response or the literal request
    payload used for idempotency evidence.

    This successor keeps the qualified domain/oracle/mastery behavior and owns
    the final persistence step so the exact learner response is retained while
    correctness still comes only from the owning behavior oracle.
    """

    EVIDENCE_CONTRACT_VERSION = 1

    def submit_attempt(
        self,
        *,
        operation_id: str,
        attempt_id: str,
        learner_id: str,
        course_id: str,
        item_id: str,
        response: str,
        submitted_at: int,
        assisted: bool = False,
        answer_revealed_before_commit: bool = False,
    ) -> Dict[str, Any]:
        payload = {
            "attempt_id": attempt_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "item_id": item_id,
            "response": response,
            "submitted_at": submitted_at,
            "assisted": assisted,
            "answer_revealed_before_commit": answer_revealed_before_commit,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        course = self.course(course_id)
        item = next((value for value in course["items"] if value["item_id"] == item_id), None)
        if item is None:
            raise KeyError(item_id)
        criterion = next(
            value for value in course["criteria"] if value["criterion_id"] == item["criterion_id"]
        )
        mode = item["mode"]
        if mode == "MASTERY_CHECK" and answer_revealed_before_commit:
            raise ValueError("IntegrityPolicyViolation")

        correct = bool(self._spec_for_course(course_id).behavior_oracle.score(item, response))
        attempt = Attempt(
            attempt_id=attempt_id,
            learner_id=learner_id,
            goal_id=course["goal_id"],
            course_id=course_id,
            skill_id=criterion["skill_id"],
            criterion_id=item["criterion_id"],
            item_id=item_id,
            item_family_id=item["family_id"],
            mode=mode,
            response=response,
            correct=correct,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
            submitted_at=submitted_at,
        )
        body = asdict(attempt)
        self.repo.put_attempt(attempt_id, operation_id, body)
        projection = self.reproject(learner_id, course_id, criterion["skill_id"], now=submitted_at)
        result = {
            "attempt": body,
            "projection": projection,
            "behavior_oracle_applied": True,
            "literal_response_preserved": body["response"] == response,
            "evidence_contract_version": self.EVIDENCE_CONTRACT_VERSION,
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit(
            "PracticeOrAssessmentEvidenceReceived",
            attempt_id,
            {
                "mode": mode,
                "correct": correct,
                "behavior_oracle_applied": True,
                "literal_response_preserved": True,
            },
        )
        return result
