from __future__ import annotations

import hashlib
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from .fixture import SUPPORTED_OUTCOME, build_synthetic_course
from .models import Attempt, GateState, MasteryProjection, MasteryStage, NextAction
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

        # Hard-cycle detection.
        visiting, visited = set(), set()
        def dfs(skill_id: str):
            if skill_id in visiting:
                raise ValueError("InvalidPrerequisiteGraph")
            if skill_id in visited:
                return
            visiting.add(skill_id)
            for p in skills[skill_id]["hard_prerequisite_skill_ids"]:
                if p not in skills:
                    raise ValueError("MissingPrerequisiteSkill")
                dfs(p)
            visiting.remove(skill_id)
            visited.add(skill_id)
        for sid in skills:
            dfs(sid)

        lesson_criteria = {cid for l in lessons for cid in l["criterion_ids"]}
        item_criteria = {i["criterion_id"] for i in items}
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
            for cid in lesson["criterion_ids"]:
                if cid not in criteria or criteria[cid]["skill_id"] != lesson["skill_id"]:
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

    def submit_attempt(self, *, operation_id: str, attempt_id: str, learner_id: str, course_id: str, item_id: str, response: str, submitted_at: int, assisted: bool = False, answer_revealed_before_commit: bool = False) -> Dict[str, Any]:
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
        criterion = next(c for c in course["criteria"] if c["criterion_id"] == item["criterion_id"])
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
        self.repo.put_attempt(attempt_id, operation_id, body)
        projection = self.reproject(learner_id, course_id, criterion["skill_id"], now=submitted_at)
        result = {"attempt": body, "projection": projection}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("PracticeOrAssessmentEvidenceReceived", attempt_id, {"mode": mode, "correct": correct})
        return result

    def reproject(self, learner_id: str, course_id: str, skill_id: str, *, now: int) -> Dict[str, Any]:
        attempts = self.repo.attempts_for_skill(learner_id, course_id, skill_id)
        counted: List[str] = []
        excluded: Dict[str, str] = {}

        practice_seen = any(a["mode"] == "PRACTICE" for a in attempts)
        mastery_success = None
        mastery_failure = False
        for a in attempts:
            if a["mode"] == "MASTERY_CHECK":
                if a["assisted"]:
                    excluded[a["attempt_id"]] = "ASSISTANCE_BREAKS_INDEPENDENCE"
                    continue
                if a["answer_revealed_before_commit"]:
                    excluded[a["attempt_id"]] = "ANSWER_REVEAL_BREAKS_INTEGRITY"
                    continue
                counted.append(a["attempt_id"])
                if a["correct"]:
                    mastery_success = a
                else:
                    mastery_failure = True

        retention_success = None
        if mastery_success:
            for a in attempts:
                if a["mode"] != "RETENTION_CHECK":
                    continue
                if a["assisted"]:
                    excluded[a["attempt_id"]] = "ASSISTANCE_BREAKS_INDEPENDENCE"
                    continue
                if a["item_family_id"] == mastery_success["item_family_id"]:
                    excluded[a["attempt_id"]] = "SAME_FAMILY_NOT_INDEPENDENT"
                    continue
                if a["submitted_at"] - mastery_success["submitted_at"] < self.RETENTION_DELAY_SECONDS:
                    excluded[a["attempt_id"]] = "RETENTION_DELAY_NOT_MET"
                    continue
                counted.append(a["attempt_id"])
                if a["correct"]:
                    retention_success = a

        criterion_gate = GateState.SATISFIED if mastery_success else (GateState.FAILED_CURRENTLY if mastery_failure else GateState.UNKNOWN)
        independence_gate = GateState.SATISFIED if mastery_success else GateState.UNKNOWN
        retention_gate = GateState.SATISFIED if retention_success else (GateState.IN_PROGRESS if mastery_success else GateState.UNKNOWN)

        gates = {
            "CRITERION_PERFORMANCE": criterion_gate.value,
            "INDEPENDENCE": independence_gate.value,
            "RETENTION": retention_gate.value,
            "TRANSFER": GateState.NOT_APPLICABLE.value,
        }
        satisfied = sum(1 for g in gates.values() if g in {GateState.SATISFIED.value, GateState.NOT_APPLICABLE.value})
        required_count = 3  # criterion, independence, retention
        satisfied_required = sum(1 for k in ("CRITERION_PERFORMANCE", "INDEPENDENCE", "RETENTION") if gates[k] == GateState.SATISFIED.value)
        progress = int(round(100 * satisfied_required / required_count))
        coverage = int(round(100 * min(len({a["item_family_id"] for a in attempts if a["attempt_id"] in counted}), 2) / 2))

        reasons: List[str] = []
        if not attempts:
            stage = MasteryStage.INSUFFICIENT_EVIDENCE
            reasons.append("NO_ADMISSIBLE_EVIDENCE")
        elif mastery_failure and not mastery_success:
            stage = MasteryStage.BUILDING
            reasons.append("MASTERY_CHECK_FAILED")
        elif mastery_success and not retention_success:
            stage = MasteryStage.RETENTION_DUE
            reasons.append("RETENTION_EVIDENCE_REQUIRED")
        elif retention_success:
            stage = MasteryStage.MASTERED
            reasons.append("ALL_REQUIRED_GATES_SATISFIED")
        else:
            stage = MasteryStage.BUILDING
            reasons.append("INDEPENDENT_MASTERY_EVIDENCE_REQUIRED")
        if practice_seen and not mastery_success:
            reasons.append("PRACTICE_NOT_MASTERY")

        projection = MasteryProjection(
            learner_id=learner_id,
            course_id=course_id,
            skill_id=skill_id,
            stage=stage.value,
            gate_states=gates,
            mastery_progress_percent=progress,
            evidence_coverage_percent=coverage,
            counted_attempt_ids=counted,
            excluded_attempts=excluded,
            reason_codes=reasons,
        )
        body = asdict(projection)
        self.repo.append_projection(learner_id, course_id, skill_id, body)
        self.repo.emit("MasteryChanged", f"{learner_id}:{course_id}:{skill_id}", body)
        return body

    def next_action(self, learner_id: str, course_id: str, *, now: int) -> Dict[str, Any]:
        course = self.course(course_id)
        for skill in course["skills"]:
            sid = skill["skill_id"]
            # Hard prerequisites must be mastered.
            missing = []
            for prereq in skill["hard_prerequisite_skill_ids"]:
                p = self.repo.latest_projection(learner_id, course_id, prereq)
                if not p or p["stage"] != MasteryStage.MASTERED.value:
                    missing.append(prereq)
            if missing:
                continue
            proj = self.repo.latest_projection(learner_id, course_id, sid)
            attempts = self.repo.attempts_for_skill(learner_id, course_id, sid)
            if not attempts:
                lesson = next(l for l in course["lessons"] if l["skill_id"] == sid)
                return asdict(NextAction("LESSON", lesson["lesson_id"], sid, ["CURRICULUM_NEXT"]))
            if proj and proj["stage"] == MasteryStage.BUILDING.value and "MASTERY_CHECK_FAILED" in proj.get("reason_codes", []):
                lesson = next(l for l in course["lessons"] if l["skill_id"] == sid)
                return asdict(NextAction("REMEDIATION", lesson["lesson_id"], sid, ["REMEDIATION", "FAILED_CURRENTLY"]))
            if proj and proj["stage"] == MasteryStage.RETENTION_DUE.value:
                retention = next(i for i in course["items"] if i["criterion_id"] in skill["criterion_ids"] and i["mode"] == "RETENTION_CHECK")
                return asdict(NextAction("RETENTION_CHECK", retention["item_id"], sid, ["RETENTION_DUE"]))
            if proj and proj["stage"] == MasteryStage.MASTERED.value:
                continue
            mastery = next(i for i in course["items"] if i["criterion_id"] in skill["criterion_ids"] and i["mode"] == "MASTERY_CHECK")
            return asdict(NextAction("MASTERY_CHECK", mastery["item_id"], sid, ["INDEPENDENT_EVIDENCE_REQUIRED"]))
        return asdict(NextAction("COURSE_COMPLETE", None, None, ["ALL_SKILLS_MASTERED"]))
