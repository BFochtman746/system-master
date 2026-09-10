from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from .engine import InjectedCrash
from .grounded_engine import GroundedLearningEngine
from .models import Attempt, GateState, MasteryProjection, MasteryStage, NextAction
from .repository import Repository, digest


TRANSFER_TASKS: Dict[str, Dict[str, Any]] = {
    "T-GIT-TRANSFER-RELEASE": {
        "item_id": "T-GIT-TRANSFER-RELEASE",
        "family_id": "F-GIT-TRANSFER-A",
        "criterion_id": "C-GIT-BRANCH-MERGE",
        "skill_id": "S-GIT-BRANCH-MERGE",
        "mode": "TRANSFER_CHECK",
        "prompt": (
            "You are already on a base branch named release. Create and switch to urgent, "
            "make the provided hotfix.txt change, stage it, commit with message Hotfix release, switch back to release, "
            "and merge urgent into release. Give only the Git commands, separated with ;"
        ),
        "answer": "git switch -c urgent; git add hotfix.txt; git commit -m \"Hotfix release\"; git switch release; git merge urgent",
        "scoring_type": "GIT_TRANSFER_WORKFLOW",
        "base_branch": "release",
        "feature_branch": "urgent",
        "file_name": "hotfix.txt",
        "commit_message": "Hotfix release",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006"],
        "novelty": {
            "base_branch_changed": True,
            "branch_names_unseen": True,
            "file_unseen": True,
            "preserved_construct": "create/switch, stage/commit, return to target branch, merge source into current branch",
        },
    },
    "T-GIT-TRANSFER-INTEGRATION": {
        "item_id": "T-GIT-TRANSFER-INTEGRATION",
        "family_id": "F-GIT-TRANSFER-B",
        "criterion_id": "C-GIT-BRANCH-MERGE",
        "skill_id": "S-GIT-BRANCH-MERGE",
        "mode": "TRANSFER_CHECK",
        "prompt": (
            "You are already on a base branch named integration. Create and switch to docs, "
            "make the provided guide.txt change, stage it, commit with message Update guide, switch back to integration, "
            "and merge docs into integration. Give only the Git commands, separated with ;"
        ),
        "answer": "git switch -c docs; git add guide.txt; git commit -m \"Update guide\"; git switch integration; git merge docs",
        "scoring_type": "GIT_TRANSFER_WORKFLOW",
        "base_branch": "integration",
        "feature_branch": "docs",
        "file_name": "guide.txt",
        "commit_message": "Update guide",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006"],
        "novelty": {
            "base_branch_changed": True,
            "branch_names_unseen": True,
            "file_unseen": True,
            "preserved_construct": "create/switch, stage/commit, return to target branch, merge source into current branch",
        },
    },
}

MAINTENANCE_TASKS: Dict[str, Dict[str, Any]] = {
    "MN-GIT-STAGE-2": {
        "item_id": "MN-GIT-STAGE-2", "family_id": "F-GIT-STAGE-R2",
        "criterion_id": "C-GIT-STAGE-COMMIT", "skill_id": "S-GIT-STAGE-COMMIT",
        "mode": "RETENTION_CHECK",
        "prompt": "After editing archive.txt, give the two commands that stage it and commit it with message Archive change. Separate commands with ;",
        "answer": "git add archive.txt; git commit -m \"Archive change\"",
        "scoring_type": "GIT_SEQUENCE",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003"],
        "fresh_family": True,
    },
    "MN-GIT-BRANCH-2": {
        "item_id": "MN-GIT-BRANCH-2", "family_id": "F-GIT-BRANCH-R2",
        "criterion_id": "C-GIT-BRANCH-MERGE", "skill_id": "S-GIT-BRANCH-MERGE",
        "mode": "RETENTION_CHECK",
        "prompt": "From main, give the branch/commit/merge command sequence using branch patch and file patch.txt with message Patch release. Separate commands with ;",
        "answer": "git switch -c patch; git add patch.txt; git commit -m \"Patch release\"; git switch main; git merge patch",
        "scoring_type": "GIT_FEATURE_WORKFLOW",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003", "CL-GIT-004", "CL-GIT-005", "CL-GIT-006"],
        "fresh_family": True,
    },
}

class AdaptiveLearningEngine(GroundedLearningEngine):
    """IMPL-004 successor runtime.

    Adds time-aware retention/revalidation and explicit transfer evidence without
    changing the already-qualified IMPL-001/002/003 classes. The constants are
    Lab policy fixtures, not scientific universal schedules.
    """

    RETENTION_FRESHNESS_SECONDS = 24 * 3600
    TRANSFER_FRESHNESS_SECONDS = 24 * 3600
    TRANSFER_REQUIRED_SKILLS = {"S-GIT-BRANCH-MERGE"}

    def create_research_grounded_course_job(self, **kwargs):
        result = super().create_research_grounded_course_job(**kwargs)
        course = self.course(result["course_id"])
        dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1)
        admitted = {c["claim_id"] for c in (dossier or {}).get("claims", [])}
        for task in TRANSFER_TASKS.values():
            if not set(task["claim_refs"]).issubset(admitted):
                raise ValueError("TRANSFER_TASK_GROUNDING_REF_NOT_ADMITTED")
            self.repo.put_object("transfer_task", task["item_id"], 1, task)
        for task in MAINTENANCE_TASKS.values():
            if not set(task["claim_refs"]).issubset(admitted):
                raise ValueError("MAINTENANCE_TASK_GROUNDING_REF_NOT_ADMITTED")
            self.repo.put_object("maintenance_task", task["item_id"], 1, task)
        return result

    def transfer_task(self, task_id: str) -> Dict[str, Any]:
        task = self.repo.get_object("transfer_task", task_id, 1)
        if not task:
            raise KeyError(task_id)
        return task

    def maintenance_task(self, task_id: str) -> Dict[str, Any]:
        task = self.repo.get_object("maintenance_task", task_id, 1)
        if not task:
            raise KeyError(task_id)
        return task

    def _transfer_required(self, skill_id: str) -> bool:
        return skill_id in self.TRANSFER_REQUIRED_SKILLS

    def _compute_projection(self, learner_id: str, course_id: str, skill_id: str, *, now: int, persist: bool) -> Dict[str, Any]:
        attempts = self.repo.attempts_for_skill(learner_id, course_id, skill_id)
        counted: List[str] = []
        excluded: Dict[str, str] = {}
        practice_seen = any(a["mode"] == "PRACTICE" for a in attempts)

        mastery_success = None
        mastery_failure = False
        for a in attempts:
            if a["mode"] != "MASTERY_CHECK":
                continue
            if a.get("assisted"):
                excluded[a["attempt_id"]] = "ASSISTANCE_BREAKS_INDEPENDENCE"
                continue
            if a.get("answer_revealed_before_commit"):
                excluded[a["attempt_id"]] = "ANSWER_REVEAL_BREAKS_INTEGRITY"
                continue
            counted.append(a["attempt_id"])
            if a["correct"]:
                mastery_success = a
            else:
                mastery_failure = True

        retention_success = None
        retention_stale = False
        seen_correct_retention_families = set()
        if mastery_success:
            for a in attempts:
                if a["mode"] != "RETENTION_CHECK":
                    continue
                if a.get("assisted"):
                    excluded[a["attempt_id"]] = "ASSISTANCE_BREAKS_INDEPENDENCE"
                    continue
                if a["item_family_id"] == mastery_success["item_family_id"]:
                    excluded[a["attempt_id"]] = "SAME_FAMILY_NOT_INDEPENDENT"
                    continue
                if a["submitted_at"] - mastery_success["submitted_at"] < self.RETENTION_DELAY_SECONDS:
                    excluded[a["attempt_id"]] = "RETENTION_DELAY_NOT_MET"
                    continue
                if a["correct"]:
                    if a["item_family_id"] in seen_correct_retention_families:
                        excluded[a["attempt_id"]] = "REPEATED_RETENTION_FAMILY_NOT_FRESH"
                        continue
                    seen_correct_retention_families.add(a["item_family_id"])
                    retention_success = a
            if retention_success:
                counted.append(retention_success["attempt_id"])
                retention_stale = now - retention_success["submitted_at"] > self.RETENTION_FRESHNESS_SECONDS

        transfer_required = self._transfer_required(skill_id)
        transfer_success = None
        transfer_stale = False
        compromised_transfer_families = {
            a["item_family_id"] for a in attempts
            if a["mode"] == "TRANSFER_CHECK" and (not a["correct"] or a.get("assisted") or a.get("answer_revealed_before_commit"))
        }
        if transfer_required and retention_success and not retention_stale:
            for a in attempts:
                if a["mode"] != "TRANSFER_CHECK":
                    continue
                if a.get("assisted"):
                    excluded[a["attempt_id"]] = "ASSISTANCE_BREAKS_TRANSFER_INDEPENDENCE"
                    continue
                if a.get("answer_revealed_before_commit"):
                    excluded[a["attempt_id"]] = "ANSWER_REVEAL_BREAKS_TRANSFER_INTEGRITY"
                    continue
                if a["submitted_at"] < retention_success["submitted_at"]:
                    excluded[a["attempt_id"]] = "TRANSFER_BEFORE_CURRENT_RETENTION"
                    continue
                if a["correct"] and a["item_family_id"] in compromised_transfer_families:
                    excluded[a["attempt_id"]] = "EXPOSED_TRANSFER_FAMILY_CANNOT_QUALIFY_AFTER_FAILURE"
                    continue
                if a["correct"]:
                    transfer_success = a
            if transfer_success:
                counted.append(transfer_success["attempt_id"])
                transfer_stale = now - transfer_success["submitted_at"] > self.TRANSFER_FRESHNESS_SECONDS

        criterion = GateState.SATISFIED if mastery_success else (GateState.FAILED_CURRENTLY if mastery_failure else GateState.UNKNOWN)
        independence = GateState.SATISFIED if mastery_success else GateState.UNKNOWN
        if retention_success is None:
            retention = GateState.IN_PROGRESS if mastery_success else GateState.UNKNOWN
        elif retention_stale:
            retention = GateState.STALE
        else:
            retention = GateState.SATISFIED

        if not transfer_required:
            transfer = GateState.NOT_APPLICABLE
        elif retention_success is None or retention_stale:
            transfer = GateState.UNKNOWN
        elif transfer_success is None:
            transfer = GateState.IN_PROGRESS
        elif transfer_stale:
            transfer = GateState.STALE
        else:
            transfer = GateState.SATISFIED

        gates = {
            "CRITERION_PERFORMANCE": criterion.value,
            "INDEPENDENCE": independence.value,
            "RETENTION": retention.value,
            "TRANSFER": transfer.value,
        }
        required = ["CRITERION_PERFORMANCE", "INDEPENDENCE", "RETENTION"] + (["TRANSFER"] if transfer_required else [])
        progress = int(round(100 * sum(gates[g] == GateState.SATISFIED.value for g in required) / len(required)))
        counted_families = {a["item_family_id"] for a in attempts if a["attempt_id"] in counted}
        required_families = 3 if transfer_required else 2
        coverage = int(round(100 * min(len(counted_families), required_families) / required_families))

        reasons: List[str] = []
        if not attempts:
            stage = MasteryStage.INSUFFICIENT_EVIDENCE
            reasons.append("NO_ADMISSIBLE_EVIDENCE")
        elif mastery_failure and not mastery_success:
            stage = MasteryStage.BUILDING
            reasons.append("MASTERY_CHECK_FAILED")
        elif not mastery_success:
            stage = MasteryStage.BUILDING
            reasons.append("INDEPENDENT_MASTERY_EVIDENCE_REQUIRED")
        elif mastery_success and retention_success is None:
            stage = MasteryStage.RETENTION_DUE
            reasons.append("RETENTION_EVIDENCE_REQUIRED")
        elif retention_stale:
            stage = MasteryStage.REVALIDATION_DUE
            reasons.extend(["RETENTION_EVIDENCE_STALE", "MAINTENANCE_RECHECK_REQUIRED"])
        elif transfer_required and transfer_success is None:
            stage = MasteryStage.RETAINED
            reasons.append("TRANSFER_EVIDENCE_REQUIRED")
        elif transfer_required and transfer_stale:
            stage = MasteryStage.RETAINED
            reasons.append("TRANSFER_RECHECK_REQUIRED")
        else:
            stage = MasteryStage.MASTERED
            reasons.append("ALL_REQUIRED_GATES_SATISFIED")
            if transfer_required:
                reasons.append("TRANSFER_DEMONSTRATED")
        if practice_seen and not mastery_success:
            reasons.append("PRACTICE_NOT_MASTERY")

        body = asdict(MasteryProjection(
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
        ))
        if persist:
            self.repo.append_projection(learner_id, course_id, skill_id, body)
            self.repo.emit("MasteryChanged", f"{learner_id}:{course_id}:{skill_id}", body)
        return body

    def reproject(self, learner_id: str, course_id: str, skill_id: str, *, now: int) -> Dict[str, Any]:
        return self._compute_projection(learner_id, course_id, skill_id, now=now, persist=True)

    def current_projection(self, learner_id: str, course_id: str, skill_id: str, *, now: int) -> Dict[str, Any]:
        return self._compute_projection(learner_id, course_id, skill_id, now=now, persist=False)

    def submit_maintenance_attempt(
        self, *, operation_id: str, attempt_id: str, learner_id: str, course_id: str,
        task_id: str, response: str, submitted_at: int, assisted: bool = False,
        answer_revealed_before_commit: bool = False,
    ) -> Dict[str, Any]:
        payload = {
            "attempt_id": attempt_id, "learner_id": learner_id, "course_id": course_id,
            "task_id": task_id, "response": response, "submitted_at": submitted_at,
            "assisted": assisted, "answer_revealed_before_commit": answer_revealed_before_commit,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        task = self.maintenance_task(task_id)
        pre = self.current_projection(learner_id, course_id, task["skill_id"], now=submitted_at)
        if pre["stage"] != MasteryStage.REVALIDATION_DUE.value:
            raise ValueError("MAINTENANCE_NOT_ELIGIBLE_UNLESS_REVALIDATION_DUE")
        if answer_revealed_before_commit:
            raise ValueError("IntegrityPolicyViolation")
        correct = self.git_oracle.score(task, response)
        attempt = Attempt(
            attempt_id=attempt_id, learner_id=learner_id, goal_id=self.course(course_id)["goal_id"],
            course_id=course_id, skill_id=task["skill_id"], criterion_id=task["criterion_id"],
            item_id=task["item_id"], item_family_id=task["family_id"], mode="RETENTION_CHECK",
            response=response, correct=correct, assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit, submitted_at=submitted_at,
        )
        body = asdict(attempt)
        self.repo.put_attempt(attempt_id, operation_id, body)
        projection = self.reproject(learner_id, course_id, task["skill_id"], now=submitted_at)
        result = {"attempt": body, "projection": projection, "fresh_family": task["fresh_family"]}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("MaintenanceEvidenceReceived", attempt_id, {"correct": correct, "family_id": task["family_id"]})
        return result

    def submit_transfer_attempt(
        self, *, operation_id: str, attempt_id: str, learner_id: str, course_id: str,
        task_id: str, response: str, submitted_at: int, assisted: bool = False,
        answer_revealed_before_commit: bool = False,
    ) -> Dict[str, Any]:
        payload = {
            "attempt_id": attempt_id, "learner_id": learner_id, "course_id": course_id,
            "task_id": task_id, "response": response, "submitted_at": submitted_at,
            "assisted": assisted, "answer_revealed_before_commit": answer_revealed_before_commit,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        task = self.transfer_task(task_id)
        pre = self.current_projection(learner_id, course_id, task["skill_id"], now=submitted_at)
        if pre["gate_states"]["RETENTION"] != GateState.SATISFIED.value:
            raise ValueError("TRANSFER_NOT_ELIGIBLE_WITHOUT_CURRENT_RETENTION")
        if answer_revealed_before_commit:
            raise ValueError("IntegrityPolicyViolation")
        correct = self.git_oracle.score(task, response)
        attempt = Attempt(
            attempt_id=attempt_id,
            learner_id=learner_id,
            goal_id=self.course(course_id)["goal_id"],
            course_id=course_id,
            skill_id=task["skill_id"],
            criterion_id=task["criterion_id"],
            item_id=task["item_id"],
            item_family_id=task["family_id"],
            mode="TRANSFER_CHECK",
            response=response,
            correct=correct,
            assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit,
            submitted_at=submitted_at,
        )
        body = asdict(attempt)
        self.repo.put_attempt(attempt_id, operation_id, body)
        projection = self.reproject(learner_id, course_id, task["skill_id"], now=submitted_at)
        result = {"attempt": body, "projection": projection, "task_novelty": task["novelty"]}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("TransferEvidenceReceived", attempt_id, {"correct": correct, "assisted": assisted, "family_id": task["family_id"]})
        return result

    def _next_unused_transfer_task(self, learner_id: str, course_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        used = {a["item_family_id"] for a in self.repo.attempts_for_skill(learner_id, course_id, skill_id) if a["mode"] == "TRANSFER_CHECK"}
        for task_id in ("T-GIT-TRANSFER-RELEASE", "T-GIT-TRANSFER-INTEGRATION"):
            task = self.transfer_task(task_id)
            if task["family_id"] not in used:
                return task
        return None

    def next_action(self, learner_id: str, course_id: str, *, now: int) -> Dict[str, Any]:
        course = self.course(course_id)
        for skill in course["skills"]:
            sid = skill["skill_id"]
            missing = []
            for prereq in skill["hard_prerequisite_skill_ids"]:
                p = self.current_projection(learner_id, course_id, prereq, now=now)
                if p["stage"] != MasteryStage.MASTERED.value:
                    missing.append(prereq)
            if missing:
                continue
            attempts = self.repo.attempts_for_skill(learner_id, course_id, sid)
            if not attempts:
                lesson = next(l for l in course["lessons"] if l["skill_id"] == sid)
                return asdict(NextAction("LESSON", lesson["lesson_id"], sid, ["CURRICULUM_NEXT"]))
            proj = self.current_projection(learner_id, course_id, sid, now=now)
            if proj["stage"] == MasteryStage.BUILDING.value and "MASTERY_CHECK_FAILED" in proj["reason_codes"]:
                lesson = next(l for l in course["lessons"] if l["skill_id"] == sid)
                return asdict(NextAction("REMEDIATION", lesson["lesson_id"], sid, ["REMEDIATION", "FAILED_CURRENTLY"]))
            if proj["stage"] == MasteryStage.RETENTION_DUE.value:
                mastery = max((a for a in attempts if a["mode"] == "MASTERY_CHECK" and a["correct"] and not a.get("assisted")), key=lambda a: a["submitted_at"], default=None)
                retention = next(i for i in course["items"] if i["criterion_id"] in skill["criterion_ids"] and i["mode"] == "RETENTION_CHECK")
                earliest = mastery["submitted_at"] + self.RETENTION_DELAY_SECONDS if mastery else now
                if now < earliest:
                    return {"action_type": "RETENTION_WAIT", "target_id": retention["item_id"], "skill_id": sid, "reason_codes": ["RETENTION_DELAY_NOT_YET_MET"], "earliest_due_at": earliest}
                return asdict(NextAction("RETENTION_CHECK", retention["item_id"], sid, ["RETENTION_DUE"]))
            if proj["stage"] == MasteryStage.REVALIDATION_DUE.value:
                task_id = "MN-GIT-STAGE-2" if sid == "S-GIT-STAGE-COMMIT" else "MN-GIT-BRANCH-2"
                used = {a["item_family_id"] for a in attempts if a["mode"] == "RETENTION_CHECK" and a["correct"]}
                task = self.maintenance_task(task_id)
                if task["family_id"] in used:
                    return asdict(NextAction("MAINTENANCE_RESEARCH_REQUIRED", None, sid, ["RETENTION_STALE", "FRESH_RETENTION_FAMILY_REQUIRED"]))
                return asdict(NextAction("MAINTENANCE_RECHECK", task["item_id"], sid, ["RETENTION_STALE", "REVALIDATION_REQUIRED", "FRESH_FAMILY_REQUIRED"]))
            if proj["stage"] == MasteryStage.RETAINED.value and self._transfer_required(sid):
                task = self._next_unused_transfer_task(learner_id, course_id, sid)
                if task:
                    return asdict(NextAction("TRANSFER_CHECK", task["item_id"], sid, ["TRANSFER_GAP", "NOVEL_CONTEXT_REQUIRED"]))
                lesson = next(l for l in course["lessons"] if l["skill_id"] == sid)
                return asdict(NextAction("TRANSFER_REMEDIATION", lesson["lesson_id"], sid, ["TRANSFER_FAMILIES_EXPOSED", "FRESH_TRANSFER_TASK_REQUIRED"]))
            if proj["stage"] == MasteryStage.MASTERED.value:
                continue
            mastery_item = next(i for i in course["items"] if i["criterion_id"] in skill["criterion_ids"] and i["mode"] == "MASTERY_CHECK")
            return asdict(NextAction("MASTERY_CHECK", mastery_item["item_id"], sid, ["INDEPENDENT_EVIDENCE_REQUIRED"]))
        return asdict(NextAction("COURSE_COMPLETE", None, None, ["ALL_SKILLS_MASTERED_CURRENT"]))


class MultiSessionDirector:
    POLICY_VERSION = "MULTI-SESSION-DIRECTOR-V1"

    def __init__(self, repo: Repository, engine: AdaptiveLearningEngine):
        self.repo = repo
        self.engine = engine

    def start_session(self, *, operation_id: str, session_id: str, learner_id: str, course_id: str, started_at: int) -> Dict[str, Any]:
        payload = {"session_id": session_id, "learner_id": learner_id, "course_id": course_id, "started_at": started_at}
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        if not self.repo.get_object("course", course_id, 1):
            raise KeyError(course_id)
        body = {"session_id": session_id, "learner_id": learner_id, "course_id": course_id, "started_at": started_at, "state": "ACTIVE", "policy_version": self.POLICY_VERSION}
        self.repo.save_learning_session(session_id=session_id, learner_id=learner_id, course_id=course_id, started_at=started_at, state="ACTIVE", body=body)
        self.repo.record_operation(operation_id, payload, body)
        self.repo.emit("LearningSessionStarted", session_id, body)
        return body

    def complete_session(self, *, operation_id: str, session_id: str, ended_at: int) -> Dict[str, Any]:
        current = self.repo.get_learning_session(session_id)
        if not current:
            raise KeyError(session_id)
        payload = {"session_id": session_id, "ended_at": ended_at}
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        if ended_at < current["started_at"]:
            raise ValueError("SESSION_END_BEFORE_START")
        body = dict(current["body"])
        body.update({"ended_at": ended_at, "state": "COMPLETE"})
        self.repo.save_learning_session(session_id=session_id, learner_id=current["learner_id"], course_id=current["course_id"], started_at=current["started_at"], ended_at=ended_at, state="COMPLETE", body=body)
        self.repo.record_operation(operation_id, payload, body)
        self.repo.emit("LearningSessionCompleted", session_id, body)
        return body

    def plan_next(
        self, *, operation_id: str, decision_id: str, session_id: str, learner_id: str,
        course_id: str, now: int, crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {"decision_id": decision_id, "session_id": session_id, "learner_id": learner_id, "course_id": course_id, "now": now}
        prior = self.repo.get_director_decision(operation_id, payload)
        if prior and prior["state"] == "COMPLETE":
            return prior["body"]["result"]
        checkpoint = prior["checkpoint"] if prior else 0
        body = dict(prior["body"]) if prior else {}

        if checkpoint < 1:
            session = self.repo.get_learning_session(session_id)
            if not session:
                raise ValueError("LEARNING_SESSION_REQUIRED")
            if session["state"] != "ACTIVE":
                raise ValueError("LEARNING_SESSION_NOT_ACTIVE")
            if (session["learner_id"], session["course_id"]) != (learner_id, course_id):
                raise ValueError("LEARNING_SESSION_SCOPE_MISMATCH")
            body["session_snapshot"] = {k: session[k] for k in ("session_id", "learner_id", "course_id", "started_at", "state")}
            self.repo.save_director_decision(operation_id=operation_id, decision_id=decision_id, session_id=session_id, learner_id=learner_id, course_id=course_id, payload=payload, checkpoint=1, state="RUNNING", body=body)
            if crash_after_phase == "SESSION_BOUND":
                raise InjectedCrash("crash after session bound")

        if checkpoint < 2:
            course = self.engine.course(course_id)
            body["projection_snapshot"] = {s["skill_id"]: self.engine.current_projection(learner_id, course_id, s["skill_id"], now=now) for s in course["skills"]}
            self.repo.save_director_decision(operation_id=operation_id, decision_id=decision_id, session_id=session_id, learner_id=learner_id, course_id=course_id, payload=payload, checkpoint=2, state="RUNNING", body=body)
            if crash_after_phase == "PROJECTION_SNAPSHOTTED":
                raise InjectedCrash("crash after projection snapshot")

        if checkpoint < 3:
            body["action"] = self.engine.next_action(learner_id, course_id, now=now)
            self.repo.save_director_decision(operation_id=operation_id, decision_id=decision_id, session_id=session_id, learner_id=learner_id, course_id=course_id, payload=payload, checkpoint=3, state="RUNNING", body=body)
            if crash_after_phase == "ACTION_SELECTED":
                raise InjectedCrash("crash after action selection")

        result = {
            "decision_id": decision_id,
            "session_id": session_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "as_of": now,
            "projection_snapshot": body["projection_snapshot"],
            "next_action": body["action"],
            "policy_version": self.POLICY_VERSION,
            "session_count": len(self.repo.sessions_for_learner(learner_id, course_id)),
        }
        body["result"] = result
        self.repo.save_director_decision(operation_id=operation_id, decision_id=decision_id, session_id=session_id, learner_id=learner_id, course_id=course_id, payload=payload, checkpoint=4, state="COMPLETE", body=body)
        if crash_after_phase == "DECISION_COMPLETED_BEFORE_RETURN":
            raise InjectedCrash("crash after durable director decision")
        self.repo.emit("AdaptiveNextActionSelected", decision_id, {"session_id": session_id, "action": result["next_action"]})
        return result
