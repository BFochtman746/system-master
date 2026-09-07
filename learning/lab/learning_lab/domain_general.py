from __future__ import annotations

import copy
import json
from dataclasses import asdict, dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set

from .adaptive import AdaptiveLearningEngine, MAINTENANCE_TASKS as GIT_MAINTENANCE_TASKS, TRANSFER_TASKS as GIT_TRANSFER_TASKS
from .engine import InjectedCrash, LearningEngine
from .fraction_domain import (
    FRACTION_DOMAIN_KEY,
    FRACTION_MAINTENANCE_TASKS,
    FRACTION_SOURCE_DOSSIER,
    FRACTION_TRANSFER_TASKS,
    FRACTION_TUTOR_PROBES,
    FractionBehaviorOracle,
    REAL_FRACTION_OUTCOME,
    build_fraction_course,
    fraction_tutor_diagnose,
    fraction_tutor_move,
)
from .grounded_engine import GroundedLearningEngine
from .models import Attempt, MasteryStage, NextAction
from .real_course import (
    DeterministicModelAdapter,
    GitBehaviorOracle,
    REAL_GIT_OUTCOME,
    SOURCE_DOSSIER as GIT_SOURCE_DOSSIER,
    validate_grounding,
    validate_instructional_design,
)
from .repository import Repository, digest
from .tutor import DiagnosisStatus, EpistemicStanding


GIT_DOMAIN_KEY = "git-feature-branch-workflow"


@dataclass(frozen=True)
class DomainSpec:
    domain_key: str
    desired_outcome: str
    dossier: Dict[str, Any]
    course_factory: Callable[..., Any]
    behavior_oracle: Any
    generation_adapter_id: str
    maintenance_tasks: Dict[str, Dict[str, Any]]
    transfer_tasks: Dict[str, Dict[str, Any]]
    transfer_required_skills: Set[str]
    tutor_probes: Dict[str, Dict[str, Any]]
    tutor_observer: Callable[[Dict[str, Any], str], tuple[bool, Optional[str]]]
    tutor_move: Callable[[Optional[str], bool, bool], Dict[str, Any]]


class DomainRegistry:
    def __init__(self, specs: Sequence[DomainSpec]):
        self._by_key = {s.domain_key: s for s in specs}
        self._by_outcome = {s.desired_outcome: s for s in specs}
        if len(self._by_key) != len(specs) or len(self._by_outcome) != len(specs):
            raise ValueError("DUPLICATE_DOMAIN_REGISTRATION")

    def has_key(self, domain_key: str) -> bool:
        return domain_key in self._by_key

    def has_outcome(self, desired_outcome: str) -> bool:
        return desired_outcome.strip() in self._by_outcome

    def register(self, spec: DomainSpec) -> None:
        existing = self._by_key.get(spec.domain_key)
        if existing is not None:
            mapped = self._by_outcome.get(spec.desired_outcome)
            if mapped is not None and mapped.domain_key != spec.domain_key:
                raise ValueError("DOMAIN_OUTCOME_COLLISION")
            # A dynamic/open domain may be reached by more than one bounded goal
            # phrasing. Keep one semantic domain owner and add an outcome alias.
            self._by_outcome[spec.desired_outcome] = existing
            return
        if spec.desired_outcome in self._by_outcome:
            raise ValueError("DOMAIN_OUTCOME_COLLISION")
        self._by_key[spec.domain_key] = spec
        self._by_outcome[spec.desired_outcome] = spec

    def by_key(self, domain_key: str) -> DomainSpec:
        if domain_key not in self._by_key:
            raise ValueError("UNSUPPORTED_DOMAIN")
        return self._by_key[domain_key]

    def by_outcome(self, desired_outcome: str) -> DomainSpec:
        key = desired_outcome.strip()
        if key not in self._by_outcome:
            raise ValueError("UNSUPPORTED_REAL_GOAL")
        return self._by_outcome[key]

    @property
    def domain_keys(self) -> List[str]:
        return sorted(self._by_key)


def _git_course_factory(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]):
    return DeterministicModelAdapter().generate_course(
        goal_id=goal_id, title=title, desired_outcome=desired_outcome, dossier=dossier
    )


def _git_tutor_observer(probe: Dict[str, Any], response: str) -> tuple[bool, Optional[str]]:
    norm = " ".join(response.strip().replace('"', "'").split()).lower()
    expected = " ".join(probe["answer"].strip().replace('"', "'").split()).lower()
    correct = norm == expected
    if correct:
        return True, None
    signature = probe.get("error_signature")
    if signature == "STAGING_OMITTED":
        import re
        if re.search(r"git\s+commit", response, flags=re.I) and not re.search(r"git\s+add", response, flags=re.I):
            return False, signature
    return False, None


def _git_tutor_move(signature: Optional[str], confirmed: bool, abstained: bool) -> Dict[str, Any]:
    if abstained:
        return {
            "content": "The response is not correct, but the cause is not established. Identify which repository state you intend to change before choosing a command.",
            "claim_refs": [],
        }
    if signature == "STAGING_OMITTED" and confirmed:
        return {
            "content": "The working tree and index are different states. Update the index with `git add <file>` before committing the staged content.",
            "claim_refs": ["CL-GIT-002", "CL-GIT-003"],
        }
    return {
        "content": "Ask which step selects the current file content for the next commit before choosing the commit command.",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003"],
    }


GIT_GENERAL_TUTOR_PROBES: Dict[str, Dict[str, Any]] = {
    "DG-TP-GIT-STAGE-1": {
        "probe_id": "DG-TP-GIT-STAGE-1", "skill_id": "S-GIT-STAGE-COMMIT", "family_id": "DG-TF-GIT-A",
        "prompt": "After editing demo.txt, what command stages it?", "answer": "git add demo.txt",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003"], "error_signature": "STAGING_OMITTED", "next_probe_id": "DG-TP-GIT-STAGE-2",
    },
    "DG-TP-GIT-STAGE-2": {
        "probe_id": "DG-TP-GIT-STAGE-2", "skill_id": "S-GIT-STAGE-COMMIT", "family_id": "DG-TF-GIT-B",
        "prompt": "After changing report.txt, what command stages its current content?", "answer": "git add report.txt",
        "claim_refs": ["CL-GIT-002", "CL-GIT-003"], "error_signature": "STAGING_OMITTED", "next_probe_id": None,
    },
}


def default_domain_registry() -> DomainRegistry:
    git_dossier = copy.deepcopy(GIT_SOURCE_DOSSIER)
    git_dossier["domain_key"] = GIT_DOMAIN_KEY
    return DomainRegistry([
        DomainSpec(
            domain_key=GIT_DOMAIN_KEY,
            desired_outcome=REAL_GIT_OUTCOME,
            dossier=git_dossier,
            course_factory=_git_course_factory,
            behavior_oracle=GitBehaviorOracle(),
            generation_adapter_id="MODEL-STUB-GROUNDED-V1",
            maintenance_tasks=copy.deepcopy(GIT_MAINTENANCE_TASKS),
            transfer_tasks=copy.deepcopy(GIT_TRANSFER_TASKS),
            transfer_required_skills={"S-GIT-BRANCH-MERGE"},
            tutor_probes=copy.deepcopy(GIT_GENERAL_TUTOR_PROBES),
            tutor_observer=_git_tutor_observer,
            tutor_move=_git_tutor_move,
        ),
        DomainSpec(
            domain_key=FRACTION_DOMAIN_KEY,
            desired_outcome=REAL_FRACTION_OUTCOME,
            dossier=copy.deepcopy(FRACTION_SOURCE_DOSSIER),
            course_factory=build_fraction_course,
            behavior_oracle=FractionBehaviorOracle(),
            generation_adapter_id="MODEL-STUB-FRACTIONS-V1",
            maintenance_tasks=copy.deepcopy(FRACTION_MAINTENANCE_TASKS),
            transfer_tasks=copy.deepcopy(FRACTION_TRANSFER_TASKS),
            transfer_required_skills={"S-FRAC-ADD-SUB"},
            tutor_probes=copy.deepcopy(FRACTION_TUTOR_PROBES),
            tutor_observer=fraction_tutor_diagnose,
            tutor_move=fraction_tutor_move,
        ),
    ])


class RegistryResearchPort:
    def __init__(self, registry: DomainRegistry):
        self.registry = registry

    def research(self, desired_outcome: str) -> Dict[str, Any]:
        return copy.deepcopy(self.registry.by_outcome(desired_outcome).dossier)


class RegistryModelPort:
    adapter_id = "DOMAIN-REGISTRY-MODEL-PORT-V1"

    def __init__(self, registry: DomainRegistry):
        self.registry = registry

    def generate_course(self, *, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]):
        spec = self.registry.by_key(dossier["domain_key"])
        return spec.course_factory(goal_id=goal_id, title=title, desired_outcome=desired_outcome, dossier=dossier)


class RegistryBehaviorOracle:
    """Dispatches only scoring/behavior verification; it does not own Learning truth."""

    def __init__(self, registry: DomainRegistry):
        self.registry = registry

    def _oracle_for_scoring_type(self, scoring_type: str):
        if scoring_type.startswith("GIT_"):
            return self.registry.by_key(GIT_DOMAIN_KEY).behavior_oracle
        if scoring_type in {"FRACTION", "INTEGER", "LCD_EQUIV", "EQUIVALENT_WITH_DENOMINATOR"}:
            return self.registry.by_key(FRACTION_DOMAIN_KEY).behavior_oracle
        return None

    def score(self, item: Dict[str, Any], response: str) -> bool:
        oracle = self._oracle_for_scoring_type(item.get("scoring_type", "EXACT"))
        if oracle is None:
            return response.strip().lower() == item["answer"].strip().lower()
        return bool(oracle.score(item, response))

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        oracle = self.registry.by_key(course["domain_key"]).behavior_oracle
        return oracle.validate_reference_items(course)

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        oracle = self.registry.by_key(course["domain_key"]).behavior_oracle
        return oracle.validate_lesson_examples(course)


class DomainGeneralLearningEngine(AdaptiveLearningEngine):
    """IMPL-005 domain-general successor.

    The evidence/mastery algorithm remains the already-qualified adaptive core.
    Domain variability is pushed into registry-backed research, generation,
    behavior scoring, maintenance/transfer task catalogs and tutor policy.
    """

    def __init__(self, repo: Repository, registry: Optional[DomainRegistry] = None):
        self.registry = registry or default_domain_registry()
        super().__init__(
            repo,
            research_port=RegistryResearchPort(self.registry),
            model_port=RegistryModelPort(self.registry),
            git_oracle=RegistryBehaviorOracle(self.registry),
        )

    def _spec_for_course(self, course_id: str) -> DomainSpec:
        course = self.course(course_id)
        domain_key = course.get("domain_key")
        if not domain_key:
            # Backward-compatible recovery of IMPL-002/004 Git courses.
            if course.get("research_dossier_id") == "RSCH-GIT-FEATURE-WORKFLOW-001":
                domain_key = GIT_DOMAIN_KEY
            else:
                raise ValueError("COURSE_DOMAIN_KEY_MISSING")
        return self.registry.by_key(domain_key)

    def create_research_grounded_course_job(
        self,
        *, operation_id: str, job_id: str, goal_id: str, title: str,
        desired_outcome: str, crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        spec = self.registry.by_outcome(desired_outcome)
        payload = {
            "job_id": job_id, "goal_id": goal_id, "title": title,
            "desired_outcome": desired_outcome, "kind": "DOMAIN_GENERAL_RESEARCH_GROUNDED",
            "domain_key": spec.domain_key,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        job = self.repo.get_job(job_id)
        checkpoint = job["checkpoint"] if job else 0
        self.repo.save_job(job_id, "RUNNING", "GOAL_CONTRACT", max(checkpoint, 1), payload)
        self.repo.put_object("goal", goal_id, 1, {
            "goal_id": goal_id, "title": title, "desired_outcome": desired_outcome,
            "kind": "REAL_GOAL", "domain_key": spec.domain_key,
        })
        if crash_after_phase == "GOAL_CONTRACT" and checkpoint < 1:
            raise InjectedCrash("crash after goal contract")

        dossier_id = spec.dossier["dossier_id"]
        if checkpoint >= 2:
            dossier = self.repo.get_object("research_dossier", dossier_id, 1)
            if dossier is None:
                raise ValueError("CHECKPOINT_RESEARCH_DOSSIER_MISSING")
        else:
            dossier = self.research_port.research(desired_outcome)
            if dossier.get("domain_key") != spec.domain_key:
                raise ValueError("RESEARCH_DOMAIN_MISMATCH")
            self.repo.put_object("research_dossier", dossier_id, 1, dossier)
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
        else:
            course = self.model_port.generate_course(
                goal_id=goal_id, title=title, desired_outcome=desired_outcome, dossier=dossier
            )
            body = asdict(course)
            body["domain_key"] = spec.domain_key
            body["generation_adapter"] = spec.generation_adapter_id
            self._validate_course(body)
            grounding = validate_grounding(body, dossier)
            if grounding["status"] != "PASS":
                raise ValueError("GROUNDING_VALIDATION_FAILED:" + ",".join(grounding["errors"]))
            instructional = validate_instructional_design(body)
            if instructional["status"] != "PASS":
                raise ValueError("INSTRUCTIONAL_VALIDATION_FAILED:" + ",".join(instructional["errors"]))
            behavior = self.git_oracle.validate_reference_items(body)
            if behavior["status"] != "PASS":
                raise ValueError("DOMAIN_BEHAVIOR_ORACLE_FAILED")
            lesson_behavior = self.git_oracle.validate_lesson_examples(body)
            if lesson_behavior["status"] != "PASS":
                raise ValueError("LESSON_BEHAVIOR_ORACLE_FAILED")
            validation = {
                "validation_id": validation_id,
                "course_id": course_id,
                "domain_key": spec.domain_key,
                "course_digest": digest(body),
                "dossier_id": dossier_id,
                "dossier_digest": digest(dossier),
                "grounding": grounding,
                "domain_behavior_oracle": behavior,
                "lesson_behavior_oracle": lesson_behavior,
                "instructional_design": instructional,
                "status": "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED",
            }
            self.repo.put_object("course", course_id, 1, body)
            self.repo.put_object("course_validation", validation_id, 1, validation)
            self.repo.save_job(job_id, "RUNNING", "COURSE_GENERATED_VALIDATED", 3, payload)
            if crash_after_phase == "COURSE_GENERATED_VALIDATED":
                raise InjectedCrash("crash after generation and validation")

        admitted = {c["claim_id"] for c in dossier.get("claims", [])}
        for task in spec.transfer_tasks.values():
            if not set(task.get("claim_refs", [])).issubset(admitted):
                raise ValueError("TRANSFER_TASK_GROUNDING_REF_NOT_ADMITTED")
            existing = self.repo.get_object("transfer_task", task["item_id"], 1)
            if existing is not None and digest(existing) != digest(task):
                raise ValueError("DOMAIN_TASK_ID_COLLISION")
            self.repo.put_object("transfer_task", task["item_id"], 1, task)
        for task in spec.maintenance_tasks.values():
            if not set(task.get("claim_refs", [])).issubset(admitted):
                raise ValueError("MAINTENANCE_TASK_GROUNDING_REF_NOT_ADMITTED")
            existing = self.repo.get_object("maintenance_task", task["item_id"], 1)
            if existing is not None and digest(existing) != digest(task):
                raise ValueError("DOMAIN_TASK_ID_COLLISION")
            self.repo.put_object("maintenance_task", task["item_id"], 1, task)

        self.repo.save_job(job_id, "SUCCEEDED", "COMPLETE", 4, payload)
        result = {
            "job_id": job_id,
            "course_id": course_id,
            "version": 1,
            "domain_key": spec.domain_key,
            "state": "READY_FOR_REVIEW",
            "course_digest": digest(body),
            "research_dossier_id": dossier_id,
            "research_dossier_digest": digest(dossier),
            "validation_id": validation_id,
            "validation_status": validation["status"],
            "generation_adapter": spec.generation_adapter_id,
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("DomainGeneralCurriculumGenerated", course_id, result)
        return result

    def submit_attempt(self, **kwargs):
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
        correct = self._spec_for_course(course_id).behavior_oracle.score(item, response)
        base_response = item["answer"] if correct else "__ORACLE_REJECTED__"
        return LearningEngine.submit_attempt(
            self, operation_id=operation_id, attempt_id=attempt_id, learner_id=learner_id,
            course_id=course_id, item_id=item_id, response=base_response, submitted_at=submitted_at,
            assisted=assisted, answer_revealed_before_commit=answer_revealed_before_commit,
        )

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
        correct = self._spec_for_course(course_id).behavior_oracle.score(task, response)
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
        result = {"attempt": body, "projection": projection, "fresh_family": task.get("fresh_family", False)}
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
        if pre["gate_states"]["RETENTION"] != "SATISFIED":
            raise ValueError("TRANSFER_NOT_ELIGIBLE_WITHOUT_CURRENT_RETENTION")
        if answer_revealed_before_commit:
            raise ValueError("IntegrityPolicyViolation")
        correct = self._spec_for_course(course_id).behavior_oracle.score(task, response)
        attempt = Attempt(
            attempt_id=attempt_id, learner_id=learner_id, goal_id=self.course(course_id)["goal_id"],
            course_id=course_id, skill_id=task["skill_id"], criterion_id=task["criterion_id"],
            item_id=task["item_id"], item_family_id=task["family_id"], mode="TRANSFER_CHECK",
            response=response, correct=correct, assisted=assisted,
            answer_revealed_before_commit=answer_revealed_before_commit, submitted_at=submitted_at,
        )
        body = asdict(attempt)
        self.repo.put_attempt(attempt_id, operation_id, body)
        projection = self.reproject(learner_id, course_id, task["skill_id"], now=submitted_at)
        result = {"attempt": body, "projection": projection, "task_novelty": task.get("novelty", {})}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("TransferEvidenceReceived", attempt_id, {"correct": correct, "assisted": assisted, "family_id": task["family_id"]})
        return result

    def _transfer_required(self, skill_id: str) -> bool:
        # Skill IDs are stable within a course; infer owning course through registry.
        return any(skill_id in spec.transfer_required_skills for spec in (self.registry.by_key(k) for k in self.registry.domain_keys))

    def _tasks_for_skill(self, course_id: str, kind: str, skill_id: str) -> List[Dict[str, Any]]:
        spec = self._spec_for_course(course_id)
        catalog = spec.transfer_tasks if kind == "transfer" else spec.maintenance_tasks
        return [copy.deepcopy(t) for t in catalog.values() if t["skill_id"] == skill_id]

    def _next_unused_transfer_task(self, learner_id: str, course_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        used = {
            a["item_family_id"] for a in self.repo.attempts_for_skill(learner_id, course_id, skill_id)
            if a["mode"] == "TRANSFER_CHECK"
        }
        for task in self._tasks_for_skill(course_id, "transfer", skill_id):
            if task["family_id"] not in used:
                return self.transfer_task(task["item_id"])
        return None

    def _next_unused_maintenance_task(self, learner_id: str, course_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        used = {
            a["item_family_id"] for a in self.repo.attempts_for_skill(learner_id, course_id, skill_id)
            if a["mode"] == "RETENTION_CHECK" and a["correct"]
        }
        for task in self._tasks_for_skill(course_id, "maintenance", skill_id):
            if task["family_id"] not in used:
                return self.maintenance_task(task["item_id"])
        return None

    def next_action(self, learner_id: str, course_id: str, *, now: int) -> Dict[str, Any]:
        course = self.course(course_id)
        for skill in course["skills"]:
            sid = skill["skill_id"]
            missing = []
            for prereq in skill.get("hard_prerequisite_skill_ids", []):
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
                mastery = max(
                    (a for a in attempts if a["mode"] == "MASTERY_CHECK" and a["correct"] and not a.get("assisted")),
                    key=lambda a: a["submitted_at"], default=None,
                )
                retention = next(
                    i for i in course["items"]
                    if i["criterion_id"] in skill["criterion_ids"] and i["mode"] == "RETENTION_CHECK"
                )
                earliest = mastery["submitted_at"] + self.RETENTION_DELAY_SECONDS if mastery else now
                if now < earliest:
                    return {
                        "action_type": "RETENTION_WAIT", "target_id": retention["item_id"],
                        "skill_id": sid, "reason_codes": ["RETENTION_DELAY_NOT_YET_MET"],
                        "earliest_due_at": earliest,
                    }
                return asdict(NextAction("RETENTION_CHECK", retention["item_id"], sid, ["RETENTION_DUE"]))

            if proj["stage"] == MasteryStage.REVALIDATION_DUE.value:
                task = self._next_unused_maintenance_task(learner_id, course_id, sid)
                if task is None:
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
            mastery_item = next(
                i for i in course["items"]
                if i["criterion_id"] in skill["criterion_ids"] and i["mode"] == "MASTERY_CHECK"
            )
            return asdict(NextAction("MASTERY_CHECK", mastery_item["item_id"], sid, ["INDEPENDENT_EVIDENCE_REQUIRED"]))
        return asdict(NextAction("COURSE_COMPLETE", None, None, ["ALL_SKILLS_MASTERED_CURRENT"]))


def _contains_key(obj: Any, key: str) -> bool:
    if isinstance(obj, dict):
        if key in obj:
            return True
        return any(_contains_key(v, key) for v in obj.values())
    if isinstance(obj, list):
        return any(_contains_key(v, key) for v in obj)
    return False


class DomainGeneralTutorDirector:
    POLICY_VERSION = "DOMAIN-GENERAL-TUTOR-DIRECTOR-V1"
    MAX_SUPPORT_LEVEL = 3

    def __init__(self, repo: Repository, learning_engine: DomainGeneralLearningEngine):
        self.repo = repo
        self.learning_engine = learning_engine

    def _spec(self, course_id: str) -> DomainSpec:
        return self.learning_engine._spec_for_course(course_id)

    def _course(self, course_id: str) -> Dict[str, Any]:
        return self.learning_engine.course(course_id)

    def _assessment_item(self, course: Dict[str, Any], item_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not item_id:
            return None
        item = next((x for x in course["items"] if x["item_id"] == item_id), None)
        if item is None:
            item = self.repo.get_object("transfer_task", item_id, 1) or self.repo.get_object("maintenance_task", item_id, 1)
        if item is None:
            raise KeyError(item_id)
        if item["mode"] in {"MASTERY_CHECK", "RETENTION_CHECK", "TRANSFER_CHECK"}:
            return item
        return None

    def _missing_prereqs(self, learner_id: str, course_id: str, skill_id: str, now: int) -> List[str]:
        course = self._course(course_id)
        skill = next((s for s in course["skills"] if s["skill_id"] == skill_id), None)
        if not skill:
            raise KeyError(skill_id)
        missing = []
        for prereq in skill.get("hard_prerequisite_skill_ids", []):
            p = self.learning_engine.current_projection(learner_id, course_id, prereq, now=now)
            if p["stage"] != MasteryStage.MASTERED.value:
                missing.append(prereq)
        return missing

    def _context(self, *, session_id: str, learner_id: str, course_id: str, skill_id: str, probe: Optional[Dict[str, Any]], active_item: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        course = self._course(course_id)
        lesson = next(l for l in course["lessons"] if l["skill_id"] == skill_id)
        refs = set(lesson.get("claim_refs", [])) | set((probe or {}).get("claim_refs", []))
        dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1) or {}
        claims = [
            {"claim_id": c["claim_id"], "text": c.get("text", ""), "source_id": c.get("source_id")}
            for c in dossier.get("claims", []) if c["claim_id"] in refs
        ]
        prior = self.repo.completed_tutor_turns(session_id, course_id, skill_id)[-6:]
        context = {
            "operation": "DOMAIN_GENERAL_TUTOR_TURN",
            "domain_key": course["domain_key"],
            "learner_id": learner_id,
            "course_id": course_id,
            "skill_id": skill_id,
            "lesson": {"lesson_id": lesson["lesson_id"], "objective": lesson["objective"], "claim_refs": lesson.get("claim_refs", [])},
            "probe": None if not probe else {
                "probe_id": probe["probe_id"],
                "skill_id": probe["skill_id"],
                "family_id": probe["family_id"],
                "prompt": probe["prompt"],
                "claim_refs": list(probe.get("claim_refs", [])),
            },
            "admitted_claims": claims,
            "prior_tutor_observations": [t.get("result", {}) for t in prior],
            "active_assessment": None if not active_item else {
                "item_id": active_item["item_id"], "mode": active_item["mode"],
                "criterion_id": active_item["criterion_id"], "prompt": active_item["prompt"],
                "answer_withheld": True,
            },
        }
        if _contains_key(context, "answer") or _contains_key(context, "rationale"):
            raise AssertionError("TUTOR_CONTEXT_ASSESSMENT_KEY_LEAK")
        return context

    @staticmethod
    def _prior_support(prior: List[Dict[str, Any]]) -> int:
        if not prior:
            return 0
        return int(prior[-1].get("result", {}).get("teaching_move", {}).get("support_level_after", 0) or 0)

    def process_turn(
        self, *, operation_id: str, turn_id: str, session_id: str, learner_id: str,
        course_id: str, skill_id: str, probe_id: Optional[str], response: str,
        requested_help_level: int, now: int, active_assessment_item_id: Optional[str] = None,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "turn_id": turn_id, "session_id": session_id, "learner_id": learner_id,
            "course_id": course_id, "skill_id": skill_id, "probe_id": probe_id,
            "response": response, "requested_help_level": requested_help_level,
            "now": now, "active_assessment_item_id": active_assessment_item_id,
            "policy": self.POLICY_VERSION,
        }
        prior_turn = self.repo.get_tutor_turn(operation_id, payload)
        if prior_turn and prior_turn["state"] == "COMPLETE":
            return prior_turn["body"]["result"]
        checkpoint = prior_turn["checkpoint"] if prior_turn else 0
        body = dict(prior_turn["body"]) if prior_turn else {}
        course = self._course(course_id)
        spec = self._spec(course_id)

        active = self._assessment_item(course, active_assessment_item_id)
        if active:
            context = self._context(session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, probe=None, active_item=active)
            result = {
                "turn_id": turn_id, "probe_id": None, "probe_family_id": None,
                "observation": {"correct": None, "epistemic_standing": EpistemicStanding.DIRECT_OBSERVATION.value},
                "diagnosis": {"status": DiagnosisStatus.ABSTAINED.value, "primary_cause": None, "standing": EpistemicStanding.DIRECT_OBSERVATION.value, "reason_codes": ["ASSESSMENT_INTEGRITY_BOUNDARY"]},
                "teaching_move": {"move": "ASSESSMENT_INTEGRITY_BOUNDARY", "support_level_before": 0, "support_level_after": 0, "content": "This is an independent assessment. Hints, steps, and answers are withheld until the response is committed.", "claim_refs": [], "reason_codes": ["NO_ANSWER_REVEAL", "NO_HINTS_DURING_INDEPENDENT_CHECK"]},
                "context_digest": digest(context),
                "next_action": {"action_type": active["mode"], "target_id": active["item_id"], "skill_id": skill_id, "reason_codes": ["ASSESSMENT_ACTIVE"]},
                "policy_version": self.POLICY_VERSION,
            }
            if active["answer"].strip().lower() in result["teaching_move"]["content"].lower():
                raise AssertionError("ASSESSMENT_ANSWER_LEAK")
            self.repo.save_tutor_turn(operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=4, state="COMPLETE", body={"result": result})
            return result

        missing = self._missing_prereqs(learner_id, course_id, skill_id, now)
        if missing:
            result = {
                "turn_id": turn_id, "probe_id": probe_id, "probe_family_id": None,
                "observation": {"correct": None, "epistemic_standing": EpistemicStanding.DIRECT_OBSERVATION.value},
                "diagnosis": {"status": DiagnosisStatus.ABSTAINED.value, "primary_cause": None, "standing": EpistemicStanding.DIRECT_OBSERVATION.value, "reason_codes": ["PREREQUISITE_GAP", "DIAGNOSIS_NOT_RUN"]},
                "teaching_move": {"move": "PREREQUISITE_BLOCKED", "support_level_before": 0, "support_level_after": 0, "content": "A required prerequisite is not currently mastered; continue the prerequisite path first.", "claim_refs": [], "reason_codes": ["NO_DOWNSTREAM_TUTOR_BYPASS"]},
                "next_action": self.learning_engine.next_action(learner_id, course_id, now=now),
                "missing_prerequisite_skill_ids": missing,
                "policy_version": self.POLICY_VERSION,
            }
            self.repo.save_tutor_turn(operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=4, state="COMPLETE", body={"result": result})
            return result

        if probe_id not in spec.tutor_probes:
            raise KeyError(probe_id)
        probe = spec.tutor_probes[probe_id]
        if probe["skill_id"] != skill_id:
            raise ValueError("TUTOR_PROBE_SKILL_MISMATCH")

        prior = self.repo.completed_tutor_turns(session_id, course_id, skill_id)
        if checkpoint < 1:
            correct, signature = spec.tutor_observer(probe, response)
            observation = {
                "correct": correct,
                "response_digest": digest({"response": response}),
                "error_signature_observed": signature,
                "requested_help_level": requested_help_level,
                "epistemic_standing": EpistemicStanding.DIRECT_OBSERVATION.value,
            }
            body["observation"] = observation
            self.repo.save_tutor_turn(operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=1, state="RUNNING", body=body)
            if crash_after_phase == "OBSERVED":
                raise InjectedCrash("crash after tutor observation")
        else:
            observation = body["observation"]

        if checkpoint < 2:
            if observation["correct"]:
                diagnosis = {"status": DiagnosisStatus.NO_DEFECT_OBSERVED.value, "primary_cause": None, "standing": EpistemicStanding.DIRECT_OBSERVATION.value, "evidence_refs": [probe["family_id"]], "reason_codes": ["CORRECT_FORMATIVE_RESPONSE"]}
            elif not observation.get("error_signature_observed"):
                diagnosis = {"status": DiagnosisStatus.ABSTAINED.value, "primary_cause": None, "standing": EpistemicStanding.DIRECT_OBSERVATION.value, "evidence_refs": [probe["family_id"]], "reason_codes": ["CAUSE_UNKNOWN", "ABSTENTION_REQUIRED"]}
            else:
                sig = observation["error_signature_observed"]
                matching = {
                    t.get("result", {}).get("probe_family_id") for t in prior
                    if t.get("result", {}).get("observation", {}).get("error_signature_observed") == sig
                }
                matching.discard(None)
                confirmed = bool(matching and probe["family_id"] not in matching)
                evidence_refs = sorted(matching | {probe["family_id"]})
                diagnosis = {
                    "status": DiagnosisStatus.DIAGNOSED.value,
                    "primary_cause": sig,
                    "standing": EpistemicStanding.EVIDENCE_SUPPORTED.value if confirmed else EpistemicStanding.TEACHING_HYPOTHESIS.value,
                    "evidence_refs": evidence_refs,
                    "reason_codes": ["REPEATED_DISTINCT_FAMILY_PATTERN", "CAUSE_EVIDENCE_SUPPORTED"] if confirmed else ["SINGLE_PATTERN", "HYPOTHESIS_NOT_CONFIRMED"],
                }
            body["diagnosis"] = diagnosis
            self.repo.save_tutor_turn(operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=2, state="RUNNING", body=body)
            if crash_after_phase == "DIAGNOSED":
                raise InjectedCrash("crash after tutor diagnosis")
        else:
            diagnosis = body["diagnosis"]

        if checkpoint < 3:
            before = self._prior_support(prior)
            requested = max(0, min(int(requested_help_level), self.MAX_SUPPORT_LEVEL))
            if observation["correct"]:
                had_support = before > 0 or any(t.get("result", {}).get("observation", {}).get("requested_help_level", 0) > 0 for t in prior)
                move = {
                    "move": "FADE_SUPPORT" if requested > 0 else ("INDEPENDENT_RECHECK_PASSED" if had_support else "FRESH_RECHECK"),
                    "support_level_before": before, "support_level_after": 0,
                    "content": "Use a fresh parallel task without help before independent assessment.",
                    "claim_refs": [],
                    "reason_codes": ["FADE_BEFORE_INDEPENDENT_CHECK"] if requested > 0 else ["FRESH_UNAIDED_RECHECK" if had_support else "FRESH_RECHECK_REQUIRED"],
                    "next_probe_id": probe.get("next_probe_id"),
                    "overhelping_prevented": requested > 0,
                }
            else:
                abstained = diagnosis["status"] == DiagnosisStatus.ABSTAINED.value
                confirmed = diagnosis.get("standing") == EpistemicStanding.EVIDENCE_SUPPORTED.value
                policy_move = spec.tutor_move(diagnosis.get("primary_cause"), confirmed, abstained)
                support_cap = 2 if confirmed else 1
                move = {
                    "move": "TARGETED_REMEDIATION" if confirmed else ("CLARIFYING_PROBE" if abstained else "TARGETED_HINT"),
                    "support_level_before": before,
                    "support_level_after": min(max(1, requested), support_cap),
                    "content": policy_move["content"],
                    "claim_refs": policy_move.get("claim_refs", []),
                    "reason_codes": ["EVIDENCE_SUPPORTED_CAUSE", "FRESH_RECHECK_AFTER_SUPPORT"] if confirmed else (["CAUSE_UNKNOWN", "DO_NOT_INVENT_MISCONCEPTION"] if abstained else ["TEACHING_HYPOTHESIS_ONLY"]),
                    "next_probe_id": probe.get("next_probe_id"),
                    "overhelping_prevented": requested > support_cap,
                }
            context = self._context(session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, probe=probe, active_item=None)
            admitted = {c["claim_id"] for c in context["admitted_claims"]}
            if not set(move["claim_refs"]).issubset(admitted):
                raise ValueError("TUTOR_MOVE_GROUNDING_REF_NOT_ADMITTED")
            body["teaching_move"] = move
            body["context_digest"] = digest(context)
            self.repo.save_tutor_turn(operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=3, state="RUNNING", body=body)
            if crash_after_phase == "MOVE_SELECTED":
                raise InjectedCrash("crash after tutor move")
        else:
            move = body["teaching_move"]

        next_action = self.learning_engine.next_action(learner_id, course_id, now=now)
        if observation["correct"] and move["move"] == "INDEPENDENT_RECHECK_PASSED":
            mastery = next((i for i in course["items"] if i["criterion_id"] in next(s["criterion_ids"] for s in course["skills"] if s["skill_id"] == skill_id) and i["mode"] == "MASTERY_CHECK"), None)
            if mastery:
                next_action = {"action_type": "MASTERY_CHECK", "target_id": mastery["item_id"], "skill_id": skill_id, "reason_codes": ["INDEPENDENT_EVIDENCE_REQUIRED"]}
        result = {
            "turn_id": turn_id, "session_id": session_id,
            "probe_id": probe_id, "probe_family_id": probe["family_id"],
            "observation": observation, "diagnosis": diagnosis, "teaching_move": move,
            "context_digest": body.get("context_digest"), "next_action": next_action,
            "policy_version": self.POLICY_VERSION, "domain_key": spec.domain_key,
        }
        self.repo.save_tutor_turn(operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id, course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=4, state="COMPLETE", body={"result": result})
        return result
