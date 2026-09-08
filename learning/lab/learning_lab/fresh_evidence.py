from __future__ import annotations

import copy
from typing import Any, Dict, Optional

from .domain_general import DomainGeneralLearningEngine, default_domain_registry
from .multi_candidate import StochasticMultiCandidateLearningEngine
from .repository import Repository, digest


FRESH_EVIDENCE_ADMISSION_VERSION = "FRESH-EVIDENCE-TASK-ADMISSION-V1"
FRESH_EVIDENCE_ADMISSION_KIND = "fresh_evidence_task_admission"
FRESH_EVIDENCE_INDEX_KIND = "fresh_evidence_task_index"
FRESH_EVIDENCE_STANDING = "INDEPENDENT_ORACLE_VALIDATED_FRESH_EVIDENCE_TASK"

_KIND_CONTRACT = {
    "maintenance": ("maintenance_task", "RETENTION_CHECK"),
    "transfer": ("transfer_task", "TRANSFER_CHECK"),
}
_REQUIRED_TASK_KEYS = {
    "item_id",
    "family_id",
    "criterion_id",
    "skill_id",
    "mode",
    "prompt",
    "answer",
    "scoring_type",
    "claim_refs",
}


class FreshEvidenceAdmissionError(ValueError):
    pass


def _index_id(course_id: str, kind: str, skill_id: str) -> str:
    return f"{course_id}:{kind}:{skill_id}"


def _course_scope(course: Dict[str, Any], task: Dict[str, Any]) -> None:
    skill = next((s for s in course.get("skills", []) if s.get("skill_id") == task["skill_id"]), None)
    if skill is None:
        raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_SKILL_UNKNOWN")
    if task["criterion_id"] not in set(skill.get("criterion_ids", [])):
        raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_CRITERION_SKILL_MISMATCH")


def _resolve_default_spec(course: Dict[str, Any]):
    registry = default_domain_registry()
    domain_key = course.get("domain_key")
    if isinstance(domain_key, str) and registry.has_key(domain_key):
        return registry.by_key(domain_key)
    desired_outcome = course.get("desired_outcome")
    if isinstance(desired_outcome, str) and desired_outcome.strip():
        try:
            return registry.by_outcome(desired_outcome)
        except ValueError:
            return None
    return None


def _known_families(repo: Repository, course: Dict[str, Any], skill_id: str) -> set[str]:
    criterion_ids = {
        c["criterion_id"] for c in course.get("criteria", []) if c.get("skill_id") == skill_id
    }
    families = {
        str(item["family_id"])
        for item in course.get("items", [])
        if item.get("family_id") and item.get("criterion_id") in criterion_ids
    }
    spec = _resolve_default_spec(course)
    if spec is not None:
        for task in list(spec.maintenance_tasks.values()) + list(spec.transfer_tasks.values()):
            if task.get("skill_id") == skill_id and task.get("family_id"):
                families.add(str(task["family_id"]))
    dossier = repo.get_object("research_dossier", course.get("research_dossier_id", ""), 1) or {}
    for key in ("maintenance_tasks", "transfer_tasks"):
        for task in dossier.get(key, []):
            if task.get("skill_id") == skill_id and task.get("family_id"):
                families.add(str(task["family_id"]))
    for kind in _KIND_CONTRACT:
        index = repo.get_latest_object(FRESH_EVIDENCE_INDEX_KIND, _index_id(course["course_id"], kind, skill_id))
        if index:
            for entry in index.get("entries", []):
                if entry.get("family_id"):
                    families.add(str(entry["family_id"]))
    return families


def _oracle_for_candidate(
    repo: Repository,
    course: Dict[str, Any],
    task: Dict[str, Any],
    oracle_spec: Optional[Dict[str, Any]],
):
    spec = _resolve_default_spec(course)
    if spec is not None:
        return spec.behavior_oracle

    dossier = repo.get_object("research_dossier", course.get("research_dossier_id", ""), 1)
    if dossier is None or not dossier.get("oracle_descriptor") or not dossier.get("course_blueprint"):
        raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ORACLE_NOT_RECONSTRUCTIBLE")
    if oracle_spec is None:
        raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ORACLE_SPEC_REQUIRED")

    patched = copy.deepcopy(dossier)
    descriptor = copy.deepcopy(patched["oracle_descriptor"])
    rows = list(descriptor.get("additional_task_oracles", []))
    rows = [row for row in rows if row.get("item_id") != task["item_id"]]
    rows.append({"item_id": task["item_id"], "oracle_spec": copy.deepcopy(oracle_spec)})
    descriptor["additional_task_oracles"] = rows
    patched["oracle_descriptor"] = descriptor

    from .open_goal import domain_spec_from_dossier

    rebuilt = domain_spec_from_dossier(patched, course["desired_outcome"])
    return rebuilt.behavior_oracle


class FreshEvidenceTaskOverlayMixin:
    """Adds only durably admitted fresh evidence tasks to an existing engine catalog."""

    def _tasks_for_skill(self, course_id: str, kind: str, skill_id: str):
        base = list(super()._tasks_for_skill(course_id, kind, skill_id))
        if kind not in _KIND_CONTRACT:
            return base
        task_object_kind, expected_mode = _KIND_CONTRACT[kind]
        index = self.repo.get_latest_object(FRESH_EVIDENCE_INDEX_KIND, _index_id(course_id, kind, skill_id))
        if not index:
            return base
        extras = []
        for entry in index.get("entries", []):
            task = self.repo.get_object(task_object_kind, entry["task_id"], 1)
            if task is None:
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_INDEX_TASK_MISSING")
            if digest(task) != entry.get("task_digest"):
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_INDEX_TASK_DIGEST_MISMATCH")
            if task.get("skill_id") != skill_id or task.get("mode") != expected_mode:
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_INDEX_SCOPE_MISMATCH")
            extras.append(copy.deepcopy(task))
        extras.sort(key=lambda row: row["item_id"])
        return base + extras


class FreshEvidenceDomainGeneralLearningEngine(FreshEvidenceTaskOverlayMixin, DomainGeneralLearningEngine):
    pass


class FreshEvidenceStochasticMultiCandidateLearningEngine(
    FreshEvidenceTaskOverlayMixin, StochasticMultiCandidateLearningEngine
):
    pass


class FreshEvidenceTaskAdmissionService:
    """Fail-closed admission boundary for fresh retention/transfer evidence tasks.

    The service does not generate content and does not grant mastery. It only admits
    a candidate task after scope, grounding, family freshness, and independent-oracle
    checks succeed. Frozen course and dossier objects remain unchanged.
    """

    def __init__(self, repo: Repository):
        self.repo = repo

    def admit(
        self,
        *,
        operation_id: str,
        admission_id: str,
        course_id: str,
        kind: str,
        candidate: Dict[str, Any],
        admitted_at: int,
        oracle_spec: Optional[Dict[str, Any]] = None,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        if kind not in _KIND_CONTRACT:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_KIND_INVALID")
        if not isinstance(admitted_at, int) or isinstance(admitted_at, bool) or admitted_at < 0:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ADMITTED_AT_INVALID")
        task = copy.deepcopy(candidate)
        missing = sorted(_REQUIRED_TASK_KEYS - set(task))
        if missing:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_TASK_INCOMPLETE:" + ",".join(missing))
        task_object_kind, expected_mode = _KIND_CONTRACT[kind]
        payload = {
            "admission_id": admission_id,
            "course_id": course_id,
            "kind": kind,
            "candidate_digest": digest(task),
            "oracle_spec_digest": None if oracle_spec is None else digest(oracle_spec),
            "admitted_at": admitted_at,
            "version": FRESH_EVIDENCE_ADMISSION_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior

        existing_admission = self.repo.get_object(FRESH_EVIDENCE_ADMISSION_KIND, admission_id, 1)
        if existing_admission is not None:
            if existing_admission.get("payload_digest") != digest(payload):
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ADMISSION_ID_REUSE")
            result = copy.deepcopy(existing_admission["result"])
            self.repo.record_operation(operation_id, payload, result)
            return result

        course = self.repo.get_object("course", course_id, 1)
        if course is None:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_COURSE_NOT_FOUND")
        if task["mode"] != expected_mode:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_MODE_MISMATCH")
        if not isinstance(task["prompt"], str) or not task["prompt"].strip():
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_PROMPT_INVALID")
        if not isinstance(task["answer"], str) or not task["answer"].strip():
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_REFERENCE_ANSWER_INVALID")
        if task["answer"].strip().lower() in task["prompt"].lower():
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ANSWER_EXPOSED_IN_PROMPT")
        if str(task.get("scoring_type", "EXACT")).upper() == "EXACT":
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_EXACT_SELF_KEY_FORBIDDEN")
        _course_scope(course, task)

        dossier = self.repo.get_object("research_dossier", course.get("research_dossier_id", ""), 1) or {}
        admitted_claims = {
            claim["claim_id"]
            for claim in dossier.get("claims", [])
            if any(
                source.get("source_id") == claim.get("source_id") and source.get("standing") == "ADMITTED"
                for source in dossier.get("sources", [])
            )
        }
        refs = set(task.get("claim_refs", []))
        if not refs or not refs.issubset(admitted_claims):
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_GROUNDING_NOT_ADMITTED")

        index_id = _index_id(course_id, kind, task["skill_id"])
        latest_for_kind = self.repo.get_latest_object(FRESH_EVIDENCE_INDEX_KIND, index_id)
        indexed_entry = None
        if latest_for_kind:
            indexed_entry = next(
                (entry for entry in latest_for_kind.get("entries", []) if entry.get("task_id") == task["item_id"]),
                None,
            )
        task_digest = digest(task)
        exact_index_replay = bool(
            indexed_entry
            and indexed_entry.get("task_digest") == task_digest
            and indexed_entry.get("family_id") == task["family_id"]
            and indexed_entry.get("admission_id") == admission_id
        )
        if task["family_id"] in _known_families(self.repo, course, task["skill_id"]) and not exact_index_replay:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_FAMILY_NOT_FRESH")
        if kind == "maintenance" and task.get("fresh_family") is not True:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_MAINTENANCE_FRESH_FLAG_REQUIRED")
        if kind == "transfer":
            novelty = task.get("novelty")
            if not isinstance(novelty, dict) or not any(value is True for value in novelty.values()):
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_TRANSFER_NOVELTY_REQUIRED")
            if not isinstance(novelty.get("preserved_construct"), str) or not novelty["preserved_construct"].strip():
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_TRANSFER_CONSTRUCT_REQUIRED")

        if any(item.get("item_id") == task["item_id"] for item in course.get("items", [])):
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_TASK_ID_NOT_FRESH")
        for object_kind in ("maintenance_task", "transfer_task"):
            existing_task = self.repo.get_object(object_kind, task["item_id"], 1)
            if existing_task is not None and digest(existing_task) != task_digest:
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_TASK_ID_COLLISION")
            if existing_task is not None and object_kind != task_object_kind:
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_TASK_KIND_COLLISION")

        oracle = _oracle_for_candidate(self.repo, course, task, oracle_spec)
        try:
            canonical_pass = bool(oracle.score(task, task["answer"]))
            negative_control_pass = bool(oracle.score(task, "__SYSTEM_MASTER_INVALID_RESPONSE__"))
        except Exception as exc:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ORACLE_EXECUTION_FAILED:" + type(exc).__name__) from exc
        if not canonical_pass:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ORACLE_REJECTED_REFERENCE_ANSWER")
        if negative_control_pass:
            raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_ORACLE_NEGATIVE_CONTROL_FAILED")

        self.repo.put_object(task_object_kind, task["item_id"], 1, task)
        if crash_after_phase == "TASK_STORED":
            raise RuntimeError("INJECTED_CRASH_AFTER_FRESH_TASK_STORED")

        latest = self.repo.get_latest_object(FRESH_EVIDENCE_INDEX_KIND, index_id)
        entries = [] if latest is None else copy.deepcopy(latest.get("entries", []))
        existing_entry = next((entry for entry in entries if entry.get("task_id") == task["item_id"]), None)
        if existing_entry is not None:
            if (
                existing_entry.get("task_digest") != task_digest
                or existing_entry.get("family_id") != task["family_id"]
                or existing_entry.get("admission_id") != admission_id
            ):
                raise FreshEvidenceAdmissionError("FRESH_EVIDENCE_INDEX_ENTRY_COLLISION")
            index_version = int(latest["_object_version"])
        else:
            entries.append({
                "task_id": task["item_id"],
                "task_digest": task_digest,
                "family_id": task["family_id"],
                "admission_id": admission_id,
            })
            entries.sort(key=lambda row: row["task_id"])
            index_body = {
                "admission_version": FRESH_EVIDENCE_ADMISSION_VERSION,
                "course_id": course_id,
                "kind": kind,
                "skill_id": task["skill_id"],
                "entries": entries,
            }
            expected = None if latest is None else int(latest["_object_version"])
            index_version = self.repo.append_object_version_checked(
                FRESH_EVIDENCE_INDEX_KIND, index_id, index_body, expected
            )
        if crash_after_phase == "INDEX_UPDATED":
            raise RuntimeError("INJECTED_CRASH_AFTER_FRESH_INDEX_UPDATED")

        result = {
            "status": "PASS",
            "admission_version": FRESH_EVIDENCE_ADMISSION_VERSION,
            "admission_id": admission_id,
            "course_id": course_id,
            "kind": kind,
            "task_id": task["item_id"],
            "family_id": task["family_id"],
            "skill_id": task["skill_id"],
            "criterion_id": task["criterion_id"],
            "task_digest": task_digest,
            "index_version": index_version,
            "standing": FRESH_EVIDENCE_STANDING,
            "grounding_claim_refs": sorted(refs),
            "oracle_reference_answer_passed": True,
            "oracle_negative_control_rejected": True,
            "frozen_course_mutated": False,
            "frozen_dossier_mutated": False,
        }
        self.repo.put_object(FRESH_EVIDENCE_ADMISSION_KIND, admission_id, 1, {
            "payload_digest": digest(payload),
            "candidate_digest": task_digest,
            "oracle_spec_digest": None if oracle_spec is None else digest(oracle_spec),
            "result": result,
        })
        if crash_after_phase == "ADMISSION_STORED":
            raise RuntimeError("INJECTED_CRASH_AFTER_FRESH_ADMISSION_STORED")
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("FreshEvidenceTaskAdmitted", admission_id, {
            "course_id": course_id,
            "kind": kind,
            "task_id": task["item_id"],
            "family_id": task["family_id"],
            "skill_id": task["skill_id"],
            "standing": FRESH_EVIDENCE_STANDING,
        })
        return result
