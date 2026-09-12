from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, Optional

from .fixture import SUPPORTED_OUTCOME, build_synthetic_course
from .mastery_conditions import (
    ASSISTANCE_INDEPENDENT,
    ASSISTANCE_ORDINARY_SCAFFOLD,
    MASTERY_CONDITION_POLICY_VERSION,
    evaluate_mastery_conditions,
)
from .mastery_evidence_reader import validated_attempts_for_skill
from .models import Attempt, MasteryProjection, MasteryStage, NextAction
from .repository import Repository, digest


class InjectedCrash(RuntimeError):
    pass


class LearningEngine:
    RETENTION_DELAY_SECONDS = 3600

    def __init__(self, repo: Repository):
        self.repo = repo

    def create_course_job(self, *, operation_id: str, job_id: str, goal_id: str, title: str, desired_outcome: str, crash_after_phase: Optional[str] = None) -> Dict[str, Any]:
        payload = {"job_id": job_id, "goal_id": goal_id, "title": title, "desired_outcome": desired_outcome}
        if desired_outcome.strip() != SUPPORTED_OUTCOME:
            raise ValueError("UNSUPPORTED_GOAL_FOR_SLICE")
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        job = self.repo.get_job(job_id)
        checkpoint = job["checkpoint"] if job else 0
        self.repo.save_job(job_id, "RUNNING", "GOAL_CONTRACT", max(checkpoint, 1), payload)
        self.repo.put_object("goal", goal_id, 1, {"goal_id": goal_id, "title": title, "desired_outcome": desired_outcome})
        if crash_after_phase == "GOAL_CONTRACT" and checkpoint < 1:
            raise InjectedCrash("crash after goal contract")

        course = build_synthetic_course(goal_id, title, desired_outcome)
        self._validate_course(asdict(course))
        self.repo.put_object("course", course.course_id, course.version, asdict(course))
        self.repo.save_job(job_id, "RUNNING", "COURSE_COMPILED", 2, payload)
        if crash_after_phase == "COURSE_COMPILED" and checkpoint < 2:
            raise InjectedCrash("crash after course compile")

        self.repo.save_job(job_id, "SUCCEEDED", "COMPLETE", 3, payload)
        result = {"job_id": job_id, "course_id": course.course_id, "version": course.version, "state": "READY_FOR_REVIEW", "course_digest": digest(asdict(course))}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("CurriculumGenerated", course.course_id, result)
        return result

    def _validate_course(self, course: Dict[str, Any]) -> None:
        skills = {s["skill_id"]: s for s in course["skills"]}
        criteria = {c["criterion_id"]: c for c in course["criteria"]}
        lessons = course["lessons"]
        items = course["items"]

        visiting, visited = set(), set()

        def dfs(skill_id: str):
            if skill_id in visiting:
                raise ValueError("InvalidPrerequisiteGraph")
            if skill_id in visited:
                return
            visiting.add(skill_id)
            for prerequisite in skills[skill_id]["hard_prerequisite_skill_ids"]:
                if prerequisite not in skills:
                    raise ValueError("MissingPrerequisiteSkill")
                dfs(prerequisite)
            visiting.remove(skill_id)
            visited.add(skill_id)

        for skill_id in skills:
            dfs(skill_id)

        lesson_criteria = {criterion_id for lesson in lessons for criterion_id in lesson["criterion_ids"]}
        item_criteria = {item["criterion_id"] for item in items}
        required = set(criteria)
        if not required.issubset(lesson_criteria):
            raise ValueError("CoverageGap:lesson")
        if not required.issubset(item_criteria):
            raise ValueError("CoverageGap:evidence")
        for lesson in lessons:
            if lesson["skill_id"] not in skills:
                raise ValueError("OrphanLesson")
            if not lesson["objective"].strip() or not lesson["explanation"].strip() or not lesson["worked_examples"]:
                raise ValueError("LessonDefinitionIncomplete")
            for criterion_id in lesson["criterion_ids"]:
                if criterion_id not in criteria or criteria[criterion_id]["skill_id"] != lesson["skill_id"]:
                    raise ValueError("LessonCriterionMisalignment")
        for item in items:
            if item["criterion_id"] not in criteria:
                raise ValueError("ItemCriterionUnknown")
            if item["mode"] == "MASTERY_CHECK" and not item["answer"].strip():
                raise ValueError("AssessmentKeyMissing")

    def course(self, course_id: str) -> Dict[str, Any]:
        value = self.repo.get_object("course", course_id, 1)
        if not value:
            raise KeyError(course_id)
        return value

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
        assistance_condition: Optional[str] = None,
        accommodation_authorized: bool = False,
        tool_part_of_construct: bool = False,
        evidence_standing: str = "CURRENT",
        transfer_novelty: Optional[str] = None,
        transfer_context_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_assistance = (
            str(assistance_condition).upper()
            if assistance_condition is not None
            else (ASSISTANCE_ORDINARY_SCAFFOLD if assisted else ASSISTANCE_INDEPENDENT)
        )
        payload = {
            "attempt_id": attempt_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "item_id": item_id,
            "response": response,
            "submitted_at": submitted_at,
            "assisted": assisted,
            "answer_revealed_before_commit": answer_revealed_before_commit,
            "assistance_condition": normalized_assistance,
            "accommodation_authorized": bool(accommodation_authorized),
            "tool_part_of_construct": bool(tool_part_of_construct),
            "evidence_standing": str(evidence_standing).upper(),
            "transfer_novelty": transfer_novelty,
            "transfer_context_id": transfer_context_id,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        course = self.course(course_id)
        item = next((item for item in course["items"] if item["item_id"] == item_id), None)
        if not item:
            raise KeyError(item_id)
        criterion = next(criterion for criterion in course["criteria"] if criterion["criterion_id"] == item["criterion_id"])
        mode = item["mode"]
        if mode == "MASTERY_CHECK" and answer_revealed_before_commit:
            raise ValueError("IntegrityPolicyViolation")
        correct = response.strip().upper() == item["answer"].strip().upper()
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
        body.update(
            {
                "assistance_condition": normalized_assistance,
                "accommodation_authorized": bool(accommodation_authorized),
                "tool_part_of_construct": bool(tool_part_of_construct),
                "evidence_standing": str(evidence_standing).upper(),
                "transfer_novelty": str(transfer_novelty).upper() if transfer_novelty is not None else None,
                "transfer_context_id": transfer_context_id,
            }
        )
        self.repo.put_attempt(attempt_id, operation_id, body)
        projection = self.reproject(learner_id, course_id, criterion["skill_id"], now=submitted_at)
        result = {"attempt": body, "projection": projection}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit(
            "PracticeOrAssessmentEvidenceReceived",
            attempt_id,
            {
                "mode": mode,
                "correct": correct,
                "assistance_condition": normalized_assistance,
                "evidence_standing": str(evidence_standing).upper(),
            },
        )
        return result

    def reproject(
        self,
        learner_id: str,
        course_id: str,
        skill_id: str,
        *,
        now: int,
        retention_required: bool = True,
        transfer_required: bool = False,
        independence_required: bool = True,
        retention_delay_seconds: Optional[int] = None,
        policy_version: str = MASTERY_CONDITION_POLICY_VERSION,
    ) -> Dict[str, Any]:
        all_attempts = validated_attempts_for_skill(self.repo, learner_id, course_id, skill_id)
        as_of = int(now)
        attempts = [attempt for attempt in all_attempts if int(attempt.get("submitted_at", 0)) <= as_of]
        future_attempt_ids = sorted(
            str(attempt.get("attempt_id"))
            for attempt in all_attempts
            if int(attempt.get("submitted_at", 0)) > as_of
        )
        evaluated = evaluate_mastery_conditions(
            attempts,
            retention_delay_seconds=self.RETENTION_DELAY_SECONDS if retention_delay_seconds is None else int(retention_delay_seconds),
            retention_required=retention_required,
            transfer_required=transfer_required,
            independence_required=independence_required,
            policy_version=policy_version,
        )
        projection = MasteryProjection(
            learner_id=learner_id,
            course_id=course_id,
            skill_id=skill_id,
            stage=evaluated["stage"],
            gate_states=evaluated["gate_states"],
            mastery_progress_percent=evaluated["mastery_progress_percent"],
            evidence_coverage_percent=evaluated["evidence_coverage_percent"],
            counted_attempt_ids=evaluated["counted_attempt_ids"],
            excluded_attempts=evaluated["excluded_attempts"],
            reason_codes=evaluated["reason_codes"],
        )
        body = asdict(projection)
        body.update(
            {
                "evidence_coverage": evaluated["evidence_coverage"],
                "uncertainty": evaluated["uncertainty"],
                "assistance_conditions": evaluated["assistance_conditions"],
                "retention": evaluated["retention"],
                "transfer": evaluated["transfer"],
                "independence": evaluated["independence"],
                "stale_attempt_ids": evaluated["stale_attempt_ids"],
                "integrity_rejected_attempt_ids": evaluated["integrity_rejected_attempt_ids"],
                "mastery_condition_policy_version": evaluated["policy_version"],
                "universal_mastery_threshold": None,
                "projection_as_of": as_of,
                "future_attempt_ids_excluded": future_attempt_ids,
            }
        )
        self.repo.append_projection(learner_id, course_id, skill_id, body)
        self.repo.emit("MasteryChanged", f"{learner_id}:{course_id}:{skill_id}", body)
        return body

    def next_action(self, learner_id: str, course_id: str, *, now: int) -> Dict[str, Any]:
        course = self.course(course_id)
        for skill in course["skills"]:
            skill_id = skill["skill_id"]
            missing = []
            for prerequisite in skill["hard_prerequisite_skill_ids"]:
                projection = self.repo.latest_projection(learner_id, course_id, prerequisite)
                if not projection or projection["stage"] != MasteryStage.MASTERED.value:
                    missing.append(prerequisite)
            if missing:
                continue
            projection = self.repo.latest_projection(learner_id, course_id, skill_id)
            attempts = [
                attempt
                for attempt in validated_attempts_for_skill(self.repo, learner_id, course_id, skill_id)
                if int(attempt.get("submitted_at", 0)) <= int(now)
            ]
            if not attempts:
                lesson = next(lesson for lesson in course["lessons"] if lesson["skill_id"] == skill_id)
                return asdict(NextAction("LESSON", lesson["lesson_id"], skill_id, ["CURRICULUM_NEXT"]))
            if projection and projection["stage"] == MasteryStage.BUILDING.value and "MASTERY_CHECK_FAILED" in projection.get("reason_codes", []):
                lesson = next(lesson for lesson in course["lessons"] if lesson["skill_id"] == skill_id)
                return asdict(NextAction("REMEDIATION", lesson["lesson_id"], skill_id, ["REMEDIATION", "FAILED_CURRENTLY"]))
            if projection and projection["stage"] == MasteryStage.RETENTION_DUE.value:
                retention = next(item for item in course["items"] if item["criterion_id"] in skill["criterion_ids"] and item["mode"] == "RETENTION_CHECK")
                return asdict(NextAction("RETENTION_CHECK", retention["item_id"], skill_id, ["RETENTION_DUE"]))
            if projection and projection["stage"] == MasteryStage.MASTERED.value:
                continue
            mastery = next(item for item in course["items"] if item["criterion_id"] in skill["criterion_ids"] and item["mode"] == "MASTERY_CHECK")
            return asdict(NextAction("MASTERY_CHECK", mastery["item_id"], skill_id, ["INDEPENDENT_EVIDENCE_REQUIRED"]))
        return asdict(NextAction("COURSE_COMPLETE", None, None, ["ALL_SKILLS_MASTERED"]))
