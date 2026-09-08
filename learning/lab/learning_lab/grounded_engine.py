from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, Optional

from .engine import InjectedCrash, LearningEngine
from .real_course import (
    DeterministicModelAdapter,
    FrozenResearchPort,
    GitBehaviorOracle,
    REAL_GIT_OUTCOME,
    validate_grounding,
    validate_instructional_design,
)
from .repository import Repository, digest


class GroundedLearningEngine(LearningEngine):
    def __init__(self, repo: Repository, research_port=None, model_port=None, git_oracle=None):
        super().__init__(repo)
        self.research_port = research_port or FrozenResearchPort()
        self.model_port = model_port or DeterministicModelAdapter()
        self.git_oracle = git_oracle or GitBehaviorOracle()

    def create_research_grounded_course_job(
        self,
        *,
        operation_id: str,
        job_id: str,
        goal_id: str,
        title: str,
        desired_outcome: str,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {"job_id": job_id, "goal_id": goal_id, "title": title, "desired_outcome": desired_outcome, "kind": "RESEARCH_GROUNDED"}
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        job = self.repo.get_job(job_id)
        checkpoint = job["checkpoint"] if job else 0
        self.repo.save_job(job_id, "RUNNING", "GOAL_CONTRACT", max(checkpoint, 1), payload)
        self.repo.put_object("goal", goal_id, 1, {"goal_id": goal_id, "title": title, "desired_outcome": desired_outcome, "kind": "REAL_GOAL"})
        if crash_after_phase == "GOAL_CONTRACT" and checkpoint < 1:
            raise InjectedCrash("crash after goal contract")

        if checkpoint >= 2:
            dossier = self.repo.get_object("research_dossier", "RSCH-GIT-FEATURE-WORKFLOW-001", 1)
            if dossier is None:
                raise ValueError("CHECKPOINT_RESEARCH_DOSSIER_MISSING")
        else:
            dossier = self.research_port.research(desired_outcome)
            self.repo.put_object("research_dossier", dossier["dossier_id"], 1, dossier)
            self.repo.save_job(job_id, "RUNNING", "RESEARCH_FROZEN", 2, payload)
            if crash_after_phase == "RESEARCH_FROZEN":
                raise InjectedCrash("crash after research freeze")

        course_id = f"COURSE-{goal_id}"
        validation_id = f"VAL-{course_id}-V1"
        if checkpoint >= 3:
            body = self.repo.get_object("course", course_id, 1)
            validation = self.repo.get_object("course_validation", validation_id, 1)
            if body is None or validation is None:
                raise ValueError("CHECKPOINT_GENERATED_OUTPUT_MISSING")
            class _RestoredCourse:
                pass
            course = _RestoredCourse()
            course.course_id = course_id
            course.version = 1
        else:
            course = self.model_port.generate_course(goal_id=goal_id, title=title, desired_outcome=desired_outcome, dossier=dossier)
            body = asdict(course)
            self._validate_course(body)
            grounding = validate_grounding(body, dossier)
            if grounding["status"] != "PASS":
                raise ValueError("GROUNDING_VALIDATION_FAILED:" + ",".join(grounding["errors"]))
            instructional = validate_instructional_design(body)
            if instructional["status"] != "PASS":
                raise ValueError("INSTRUCTIONAL_VALIDATION_FAILED:" + ",".join(instructional["errors"]))
            oracle = self.git_oracle.validate_reference_items(body)
            if oracle["status"] != "PASS":
                raise ValueError("GIT_BEHAVIOR_ORACLE_FAILED")
            lesson_oracle = self.git_oracle.validate_lesson_examples(body)
            if lesson_oracle["status"] != "PASS":
                raise ValueError("LESSON_BEHAVIOR_ORACLE_FAILED")
            validation = {
                "validation_id": validation_id,
                "course_id": course.course_id,
                "course_digest": digest(body),
                "dossier_id": dossier["dossier_id"],
                "dossier_digest": digest(dossier),
                "grounding": grounding,
                "git_behavior_oracle": oracle,
                "lesson_behavior_oracle": lesson_oracle,
                "instructional_design": instructional,
                "status": "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED",
            }
            self.repo.put_object("course", course.course_id, course.version, body)
            self.repo.put_object("course_validation", validation["validation_id"], 1, validation)
            self.repo.save_job(job_id, "RUNNING", "COURSE_GENERATED_VALIDATED", 3, payload)
            if crash_after_phase == "COURSE_GENERATED_VALIDATED":
                raise InjectedCrash("crash after generation and validation")

        self.repo.save_job(job_id, "SUCCEEDED", "COMPLETE", 4, payload)
        result = {
            "job_id": job_id,
            "course_id": course.course_id,
            "version": course.version,
            "state": "READY_FOR_REVIEW",
            "course_digest": digest(body),
            "research_dossier_id": dossier["dossier_id"],
            "research_dossier_digest": digest(dossier),
            "validation_id": validation["validation_id"],
            "validation_status": validation["status"],
            "generation_adapter": self.model_port.adapter_id,
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("ResearchGroundedCurriculumGenerated", course.course_id, result)
        return result

    def submit_attempt(self, **kwargs):
        # Override only scoring; preserve the proven evidence/mastery machinery.
        operation_id = kwargs["operation_id"]
        attempt_id = kwargs["attempt_id"]
        learner_id = kwargs["learner_id"]
        course_id = kwargs["course_id"]
        item_id = kwargs["item_id"]
        response = kwargs["response"]
        submitted_at = kwargs["submitted_at"]
        assisted = kwargs.get("assisted", False)
        answer_revealed_before_commit = kwargs.get("answer_revealed_before_commit", False)

        payload = {
            "attempt_id": attempt_id, "learner_id": learner_id, "course_id": course_id, "item_id": item_id,
            "response": response, "submitted_at": submitted_at, "assisted": assisted,
            "answer_revealed_before_commit": answer_revealed_before_commit,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        course = self.course(course_id)
        item = next((i for i in course["items"] if i["item_id"] == item_id), None)
        if not item:
            raise KeyError(item_id)
        if item.get("mode") == "MASTERY_CHECK" and answer_revealed_before_commit:
            raise ValueError("IntegrityPolicyViolation")
        correct = self.git_oracle.score(item, response)

        # Reuse the base class by substituting a canonical answer only after the
        # independent oracle has evaluated the learner response. This avoids
        # duplicating mastery/evidence behavior while keeping richer scoring.
        base_response = item["answer"] if correct else "__ORACLE_REJECTED__"
        return super().submit_attempt(
            operation_id=operation_id,
            attempt_id=attempt_id,
            learner_id=learner_id,
            course_id=course_id,
            item_id=item_id,
            response=base_response,
            submitted_at=submitted_at,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
        )
