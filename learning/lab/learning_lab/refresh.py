from __future__ import annotations

import copy
from dataclasses import asdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .engine import InjectedCrash, LearningEngine
from .live_open_goal import NormalizedLiveResearchPort, RecordedModelGenerationPort, _validate_model_package
from .multi_candidate import StochasticMultiCandidateLearningEngine
from .open_goal import compile_course_from_dossier, domain_spec_from_dossier
from .professional_quality import (
    PROFESSIONAL_QUALITY_PROFILE,
    PROFESSIONAL_QUALITY_PROFILE_VERSION,
    evaluate_professional_quality,
)
from .real_course import validate_grounding, validate_instructional_design
from .repository import Repository, digest


REFRESH_VERSION = "COURSE-REFRESH-V1"
REFRESH_POLICY_VERSION = "SOURCE-FRESHNESS-IMMUTABLE-SUCCESSOR-V1"
SEMANTIC_DIFF_VERSION = "LEARNING-SEMANTIC-DIFF-V1"
MASTERY_REVALIDATION_POLICY_VERSION = "MASTERY-REVALIDATION-ON-MEANING-CHANGE-V1"
LAB_SOURCE_MAX_AGE_SECONDS = 3600


MATERIAL_ITEM_MODES = {"MASTERY_CHECK", "RETENTION_CHECK"}


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def _map_by(rows: Iterable[Dict[str, Any]], key: str) -> Dict[str, Dict[str, Any]]:
    return {str(x[key]): copy.deepcopy(x) for x in rows}


def _changed_ids(old: Dict[str, Dict[str, Any]], new: Dict[str, Dict[str, Any]], *, ignored: Set[str] | None = None) -> Dict[str, List[str]]:
    ignored = ignored or set()
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    modified: List[str] = []
    for k in sorted(set(old) & set(new)):
        a = {x: y for x, y in old[k].items() if x not in ignored}
        b = {x: y for x, y in new[k].items() if x not in ignored}
        if digest(a) != digest(b):
            modified.append(k)
    return {"added": added, "removed": removed, "modified": modified}


def _source_semantic_view(source: Dict[str, Any]) -> Dict[str, Any]:
    # Retrieval timestamps and byte-capture metadata can change without changing
    # the instructional meaning of the source.
    return {
        k: v for k, v in source.items()
        if k not in {"retrieved_at", "body_sha256", "body_length"}
    }


def source_freshness_diff(old_dossier: Dict[str, Any], new_dossier: Dict[str, Any]) -> Dict[str, Any]:
    old_sources = _map_by(old_dossier.get("sources", []), "source_id")
    new_sources = _map_by(new_dossier.get("sources", []), "source_id")
    old_claims = _map_by(old_dossier.get("claims", []), "claim_id")
    new_claims = _map_by(new_dossier.get("claims", []), "claim_id")

    source_semantic = _changed_ids(
        {k: _source_semantic_view(v) for k, v in old_sources.items()},
        {k: _source_semantic_view(v) for k, v in new_sources.items()},
    )
    claim_changes = _changed_ids(old_claims, new_claims)
    retrieval_changed = sorted(
        sid for sid in set(old_sources) & set(new_sources)
        if old_sources[sid].get("retrieved_at") != new_sources[sid].get("retrieved_at")
    )
    evidence_digest_changed = digest({"sources": old_dossier.get("sources", []), "claims": old_dossier.get("claims", [])}) != digest(
        {"sources": new_dossier.get("sources", []), "claims": new_dossier.get("claims", [])}
    )
    material = any(source_semantic.values()) or any(claim_changes.values())
    return {
        "status": "MATERIAL_SOURCE_CHANGE" if material else "FRESHNESS_ONLY_REFRESH",
        "evidence_digest_changed": evidence_digest_changed,
        "source_semantic_changes": source_semantic,
        "claim_changes": claim_changes,
        "retrieval_metadata_changed_source_ids": retrieval_changed,
        "material_source_meaning_changed": material,
    }


def _course_component_maps(course: Dict[str, Any]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    return {
        "criteria": _map_by(course.get("criteria", []), "criterion_id"),
        "skills": _map_by(course.get("skills", []), "skill_id"),
        "lessons": _map_by(course.get("lessons", []), "lesson_id"),
        "items": _map_by(course.get("items", []), "item_id"),
    }


def _package_task_maps(dossier: Dict[str, Any]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    return {
        "maintenance_tasks": _map_by(dossier.get("maintenance_tasks", []), "item_id"),
        "transfer_tasks": _map_by(dossier.get("transfer_tasks", []), "item_id"),
    }


def semantic_course_diff(
    *,
    old_course: Dict[str, Any],
    new_course: Dict[str, Any],
    old_dossier: Dict[str, Any],
    new_dossier: Dict[str, Any],
    old_quality: Dict[str, Any],
    new_quality: Dict[str, Any],
) -> Dict[str, Any]:
    src = source_freshness_diff(old_dossier, new_dossier)
    old_maps = _course_component_maps(old_course)
    new_maps = _course_component_maps(new_course)
    components: Dict[str, Dict[str, List[str]]] = {}
    for kind in ("criteria", "skills", "lessons", "items"):
        ignored = set()
        if kind == "lessons":
            # explanation text can change solely because retrieval/source wording was refreshed.
            # claim refs/objective still capture instructional meaning changes.
            ignored = {"explanation", "grounding_spans"}
        if kind == "items":
            ignored = {"grounding_spans"}
        components[kind] = _changed_ids(old_maps[kind], new_maps[kind], ignored=ignored)

    old_tasks = _package_task_maps(old_dossier)
    new_tasks = _package_task_maps(new_dossier)
    task_changes = {
        k: _changed_ids(old_tasks[k], new_tasks[k]) for k in old_tasks
    }

    affected_skills: Set[str] = set()
    reasons: Dict[str, List[str]] = {}

    def affect(skill_id: Optional[str], reason: str):
        if not skill_id:
            return
        affected_skills.add(skill_id)
        reasons.setdefault(skill_id, []).append(reason)

    old_criteria = old_maps["criteria"]
    new_criteria = new_maps["criteria"]
    for cid in components["criteria"]["modified"] + components["criteria"]["removed"] + components["criteria"]["added"]:
        row = new_criteria.get(cid) or old_criteria.get(cid)
        affect(row.get("skill_id") if row else None, "CRITERION_SEMANTICS_CHANGED:" + cid)

    old_skills = old_maps["skills"]
    new_skills = new_maps["skills"]
    for sid in components["skills"]["modified"] + components["skills"]["removed"] + components["skills"]["added"]:
        affect(sid, "SKILL_OR_PREREQUISITE_CHANGED:" + sid)

    criterion_to_skill = {c["criterion_id"]: c["skill_id"] for c in new_course.get("criteria", [])}
    criterion_to_skill.update({c["criterion_id"]: c["skill_id"] for c in old_course.get("criteria", [])})
    old_items = old_maps["items"]
    new_items = new_maps["items"]
    for iid in components["items"]["modified"] + components["items"]["removed"] + components["items"]["added"]:
        item = new_items.get(iid) or old_items.get(iid)
        if item and item.get("mode") in MATERIAL_ITEM_MODES:
            affect(criterion_to_skill.get(item.get("criterion_id")), "ASSESSMENT_MEANING_CHANGED:" + iid)

    changed_claim_ids = set(src["claim_changes"]["modified"] + src["claim_changes"]["removed"])
    if changed_claim_ids:
        for item in old_course.get("items", []):
            if item.get("mode") in MATERIAL_ITEM_MODES and changed_claim_ids.intersection(item.get("claim_refs", [])):
                affect(criterion_to_skill.get(item.get("criterion_id")), "ASSESSMENT_SOURCE_BASIS_CHANGED:" + item["item_id"])

    old_transfer = old_tasks["transfer_tasks"]
    new_transfer = new_tasks["transfer_tasks"]
    for iid in task_changes["transfer_tasks"]["modified"] + task_changes["transfer_tasks"]["removed"] + task_changes["transfer_tasks"]["added"]:
        task = new_transfer.get(iid) or old_transfer.get(iid)
        if task:
            affect(task.get("skill_id"), "TRANSFER_CONSTRUCT_CHANGED:" + iid)

    quality_regressed = old_quality.get("status") == "PASS" and new_quality.get("status") != "PASS"
    semantic_change = bool(affected_skills)
    if quality_regressed:
        semantic_class = "QUALITY_REGRESSION_BLOCKED"
    elif semantic_change:
        semantic_class = "MATERIAL_LEARNING_MEANING_CHANGE"
    elif src["material_source_meaning_changed"] or any(any(v.values()) for v in components.values()) or any(any(v.values()) for v in task_changes.values()):
        semantic_class = "NON_MASTERY_AFFECTING_INSTRUCTIONAL_CHANGE"
    else:
        semantic_class = "NON_MATERIAL_SOURCE_REFRESH"

    return {
        "diff_version": SEMANTIC_DIFF_VERSION,
        "old_course_digest": digest(old_course),
        "new_course_digest": digest(new_course),
        "source_diff": src,
        "course_component_changes": components,
        "task_changes": task_changes,
        "affected_skill_ids": sorted(affected_skills),
        "affected_skill_reason_codes": {k: sorted(set(v)) for k, v in sorted(reasons.items())},
        "quality_profile_id": new_quality.get("profile_id"),
        "quality_regressed": quality_regressed,
        "semantic_class": semantic_class,
        "mastery_revalidation_required": bool(affected_skills),
    }


class CourseRefreshLearningEngine(StochasticMultiCandidateLearningEngine):
    """IMPL-009 successor: source freshness -> immutable successor -> semantic diff.

    Existing course objects and historical learner evidence are never rewritten.
    Refresh produces a new runtime course object and an explicit activation record.
    """

    def __init__(
        self,
        repo: Repository,
        *,
        research_port: NormalizedLiveResearchPort,
        candidate_model_port: Any,
        refresh_research_port: NormalizedLiveResearchPort,
        refresh_model_port: RecordedModelGenerationPort,
        registry=None,
        oracle_registry=None,
    ):
        super().__init__(
            repo,
            research_port=research_port,
            candidate_model_port=candidate_model_port,
            registry=registry,
            oracle_registry=oracle_registry,
        )
        self.refresh_research_port = refresh_research_port
        self.refresh_model_port = refresh_model_port

    def _quality_for_course(self, course: Dict[str, Any], dossier: Dict[str, Any]) -> Dict[str, Any]:
        return evaluate_professional_quality(course=course, dossier=dossier, package=dossier, profile=PROFESSIONAL_QUALITY_PROFILE)

    def assess_source_freshness(
        self, *, series_id: str, as_of: str, max_age_seconds: int = LAB_SOURCE_MAX_AGE_SECONDS
    ) -> Dict[str, Any]:
        active = self.active_course(series_id)
        course = active["course"]
        dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1)
        if dossier is None:
            raise ValueError("ACTIVE_COURSE_DOSSIER_MISSING")
        capture = dossier.get("research_capture", {})
        captured = _parse_iso(capture.get("captured_at"))
        now = _parse_iso(as_of)
        if captured is None or now is None:
            return {
                "series_id": series_id, "status": "UNKNOWN", "trigger_required": True,
                "reason_codes": ["SOURCE_FRESHNESS_TIMESTAMP_UNKNOWN"],
                "max_age_seconds": max_age_seconds,
            }
        age = max(0, int((now - captured).total_seconds()))
        stale = age > int(max_age_seconds)
        return {
            "series_id": series_id,
            "course_id": course["course_id"],
            "source_capture_id": capture.get("capture_id"),
            "captured_at": capture.get("captured_at"),
            "as_of": as_of,
            "age_seconds": age,
            "max_age_seconds": int(max_age_seconds),
            "status": "STALE" if stale else "FRESH",
            "trigger_required": stale,
            "reason_codes": ["SOURCE_AGE_EXCEEDED_POLICY"] if stale else ["SOURCE_WITHIN_FRESHNESS_WINDOW"],
        }

    def register_initial_active_course(
        self,
        *,
        operation_id: str,
        series_id: str,
        course_id: str,
        activated_at: str,
        review_receipt: Dict[str, Any],
    ) -> Dict[str, Any]:
        payload = {
            "series_id": series_id,
            "course_id": course_id,
            "activated_at": activated_at,
            "review_receipt_digest": digest(review_receipt),
            "kind": "INITIAL_ACTIVE_COURSE_REGISTRATION",
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        if self.repo.latest_object_version("course_activation", series_id) is not None:
            raise ValueError("ACTIVE_COURSE_ALREADY_REGISTERED")
        course = self.repo.get_object("course", course_id, 1)
        if course is None:
            raise KeyError(course_id)
        dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1)
        if dossier is None:
            raise ValueError("ACTIVE_COURSE_DOSSIER_MISSING")
        quality = self._quality_for_course(course, dossier)
        if quality["status"] != "PASS":
            raise ValueError("ACTIVE_COURSE_PROFESSIONAL_QUALITY_GATE_FAILED")
        if review_receipt.get("standing") != "LAB_HUMAN_REVIEW_FIXTURE_APPROVED":
            raise ValueError("INITIAL_ACTIVE_COURSE_HUMAN_REVIEW_REQUIRED")
        self.repo.put_object("professional_quality_report", f"QUALITY-{course_id}-V1", 1, quality)
        activation = {
            "series_id": series_id,
            "activation_revision": 1,
            "course_id": course_id,
            "course_version": int(course.get("version", 1)),
            "course_digest": digest(course),
            "activated_at": activated_at,
            "review_receipt": copy.deepcopy(review_receipt),
            "quality_profile_id": PROFESSIONAL_QUALITY_PROFILE_VERSION,
            "quality_report_digest": digest(quality),
            "state": "ACTIVE",
        }
        version = self.repo.append_object_version_checked("course_activation", series_id, activation, None)
        if version != 1:
            raise ValueError("INITIAL_ACTIVATION_REVISION_INVALID")
        self.repo.record_operation(operation_id, payload, activation)
        self.repo.emit("CourseVersionActivated", series_id, activation)
        return activation

    def active_course(self, series_id: str) -> Dict[str, Any]:
        activation = self.repo.get_latest_object("course_activation", series_id)
        if not activation:
            raise KeyError(series_id)
        course = self.repo.get_object("course", activation["course_id"], 1)
        if course is None or digest(course) != activation["course_digest"]:
            raise ValueError("ACTIVE_COURSE_POINTER_DRIFT")
        return {"activation": activation, "course": course}

    @staticmethod
    def _assemble_refresh_dossier(
        *,
        research_dossier: Dict[str, Any],
        package: Dict[str, Any],
        receipt: Dict[str, Any],
        predecessor_dossier_id: str,
    ) -> Dict[str, Any]:
        assembled = copy.deepcopy(research_dossier)
        for key in (
            "course_blueprint", "oracle_descriptor", "maintenance_tasks", "transfer_tasks",
            "transfer_required_skills", "tutor_probes", "tutor_remediation",
        ):
            assembled[key] = copy.deepcopy(package[key])
        assembled["generation_adapter_id"] = f"REFRESH-MODEL:{receipt['model_id']}"
        assembled["model_generation"] = copy.deepcopy(receipt)
        assembled["pedagogy_review"] = copy.deepcopy(package["pedagogy_review"])
        assembled["predecessor_dossier_id"] = predecessor_dossier_id
        assembled["refresh_version"] = REFRESH_VERSION
        assembled["dossier_id"] = "REFRESH-DOSSIER-" + digest({
            "research": research_dossier["dossier_id"],
            "output": receipt["output_digest"],
            "predecessor": predecessor_dossier_id,
        })[:16].upper()
        return assembled

    def _learners_migration_plan(
        self,
        *,
        series_id: str,
        old_course_id: str,
        new_course_id: str,
        diff: Dict[str, Any],
    ) -> Dict[str, Any]:
        affected = set(diff["affected_skill_ids"])
        learners = self.repo.learners_for_course(old_course_id)
        rows = []
        for learner_id in learners:
            per_skill = []
            old_course = self.repo.get_object("course", old_course_id, 1) or {}
            for skill in old_course.get("skills", []):
                sid = skill["skill_id"]
                old_projection = self.repo.latest_projection(learner_id, old_course_id, sid)
                if old_projection is None:
                    continue
                if sid in affected:
                    decision = "REVALIDATION_REQUIRED"
                    successor_stage = "REVALIDATION_DUE"
                else:
                    decision = "PRESERVE_BY_SEMANTIC_EQUIVALENCE"
                    successor_stage = old_projection.get("stage")
                per_skill.append({
                    "skill_id": sid,
                    "decision": decision,
                    "successor_stage": successor_stage,
                    "source_projection_digest": digest(old_projection),
                    "source_counted_attempt_ids": list(old_projection.get("counted_attempt_ids", [])),
                    "reason_codes": diff["affected_skill_reason_codes"].get(sid, ["SEMANTIC_EQUIVALENCE_PRESERVED"]),
                })
            rows.append({"learner_id": learner_id, "skill_decisions": per_skill})
        return {
            "policy_version": MASTERY_REVALIDATION_POLICY_VERSION,
            "series_id": series_id,
            "old_course_id": old_course_id,
            "new_course_id": new_course_id,
            "learners": rows,
            "historical_attempts_mutated": False,
            "historical_projections_mutated": False,
        }

    def refresh_course_job(
        self,
        *,
        operation_id: str,
        job_id: str,
        series_id: str,
        title: str,
        desired_outcome: str,
        requested_at: str,
        refresh_reason: str,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "job_id": job_id,
            "series_id": series_id,
            "title": title,
            "desired_outcome": desired_outcome,
            "requested_at": requested_at,
            "refresh_reason": refresh_reason,
            "kind": "COURSE_REFRESH",
            "refresh_version": REFRESH_VERSION,
            "policy_version": REFRESH_POLICY_VERSION,
            "quality_profile_id": PROFESSIONAL_QUALITY_PROFILE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        job = self.repo.get_job(job_id)
        checkpoint = int(job["checkpoint"]) if job else 0

        active = self.active_course(series_id)
        old_activation = active["activation"]
        old_course = active["course"]
        old_dossier = self.repo.get_object("research_dossier", old_course["research_dossier_id"], 1)
        if old_dossier is None:
            raise ValueError("REFRESH_PREDECESSOR_DOSSIER_MISSING")

        if checkpoint >= 1:
            trigger = self.repo.get_object("refresh_trigger", f"REFRESH-TRIGGER-{job_id}", 1)
            if trigger is None:
                raise ValueError("CHECKPOINT_REFRESH_TRIGGER_MISSING")
        else:
            interpretation = self.refresh_research_port.interpret(desired_outcome)
            plan = self.refresh_research_port.plan(interpretation)
            freshness = self.assess_source_freshness(series_id=series_id, as_of=requested_at)
            trigger = {
                "trigger_id": f"REFRESH-TRIGGER-{job_id}",
                "series_id": series_id,
                "active_course_id": old_course["course_id"],
                "active_course_digest": digest(old_course),
                "active_activation_revision": old_activation["activation_revision"],
                "refresh_reason": refresh_reason,
                "requested_at": requested_at,
                "source_freshness_before_refresh": freshness,
                "new_capture_id": interpretation["capture_id"],
                "new_capture_digest": interpretation["capture_digest"],
                "new_evidence_digest": interpretation["normalized_evidence_digest"],
                "research_plan": plan,
            }
            self.repo.put_object("refresh_trigger", trigger["trigger_id"], 1, trigger)
            self.repo.save_job(job_id, "RUNNING", "REFRESH_TRIGGERED", 1, payload)
            if crash_after_phase == "REFRESH_TRIGGERED":
                raise InjectedCrash("crash after refresh trigger")

        if checkpoint >= 2:
            ref = self.repo.get_object("refresh_dossier_ref", f"REFRESH-DOSSIER-REF-{job_id}", 1)
            if ref is None:
                raise ValueError("CHECKPOINT_REFRESH_DOSSIER_REF_MISSING")
            research_dossier = self.repo.get_object("research_dossier", ref["dossier_id"], 1)
            if research_dossier is None or digest(research_dossier) != ref["dossier_digest"]:
                raise ValueError("CHECKPOINT_REFRESH_DOSSIER_DRIFT")
        else:
            plan = trigger["research_plan"]
            research_dossier = self.refresh_research_port.acquire(desired_outcome, plan)
            if research_dossier.get("domain_key") != old_dossier.get("domain_key"):
                raise ValueError("REFRESH_DOMAIN_CHANGE_REQUIRES_NEW_COURSE_SERIES")
            self.repo.put_object("research_dossier", research_dossier["dossier_id"], 1, research_dossier)
            self.repo.put_object("refresh_dossier_ref", f"REFRESH-DOSSIER-REF-{job_id}", 1, {
                "dossier_id": research_dossier["dossier_id"], "dossier_digest": digest(research_dossier)
            })
            self.repo.save_job(job_id, "RUNNING", "REFRESH_SOURCES_ACQUIRED", 2, payload)
            if crash_after_phase == "REFRESH_SOURCES_ACQUIRED":
                raise InjectedCrash("crash after refresh source acquisition")

        if checkpoint >= 3:
            model_pin = self.repo.get_object("refresh_model_pin", f"REFRESH-MODEL-PIN-{job_id}", 1)
            if model_pin is None:
                raise ValueError("CHECKPOINT_REFRESH_MODEL_PIN_MISSING")
        else:
            model_pin = self.refresh_model_port.pin(desired_outcome=desired_outcome, dossier=research_dossier)
            self.repo.put_object("refresh_model_pin", f"REFRESH-MODEL-PIN-{job_id}", 1, model_pin)
            self.repo.save_job(job_id, "RUNNING", "REFRESH_MODEL_PINNED", 3, payload)
            if crash_after_phase == "REFRESH_MODEL_PINNED":
                raise InjectedCrash("crash after refresh model pin")

        if checkpoint >= 4:
            ref = self.repo.get_object("refresh_candidate_ref", f"REFRESH-CANDIDATE-REF-{job_id}", 1)
            if ref is None:
                raise ValueError("CHECKPOINT_REFRESH_CANDIDATE_REF_MISSING")
            package = self.repo.get_object("refresh_generated_candidate", ref["candidate_id"], 1)
            receipt = self.repo.get_object("refresh_model_receipt", ref["receipt_id"], 1)
            if package is None or receipt is None:
                raise ValueError("CHECKPOINT_REFRESH_CANDIDATE_MISSING")
            if digest(package) != ref["candidate_digest"] or digest(receipt) != ref["receipt_digest"]:
                raise ValueError("CHECKPOINT_REFRESH_CANDIDATE_DRIFT")
        else:
            package, receipt = self.refresh_model_port.generate(
                goal_id=old_course["goal_id"], title=title, desired_outcome=desired_outcome,
                dossier=research_dossier, pin=model_pin,
            )
            _validate_model_package(package, research_dossier, self.live_oracle_registry)
            cid = "REFRESH-CANDIDATE-" + receipt["output_digest"][:16].upper()
            self.repo.put_object("refresh_generated_candidate", cid, 1, package)
            self.repo.put_object("refresh_model_receipt", receipt["generation_trace_id"], 1, receipt)
            self.repo.put_object("refresh_candidate_ref", f"REFRESH-CANDIDATE-REF-{job_id}", 1, {
                "candidate_id": cid, "candidate_digest": digest(package),
                "receipt_id": receipt["generation_trace_id"], "receipt_digest": digest(receipt),
            })
            self.repo.save_job(job_id, "RUNNING", "REFRESH_CANDIDATE_GENERATED", 4, payload)
            if crash_after_phase == "REFRESH_CANDIDATE_GENERATED":
                raise InjectedCrash("crash after refresh candidate generation")

        if checkpoint >= 5:
            ref = self.repo.get_object("successor_course_ref", f"SUCCESSOR-REF-{job_id}", 1)
            if ref is None:
                raise ValueError("CHECKPOINT_SUCCESSOR_REF_MISSING")
            successor = self.repo.get_object("course", ref["course_id"], 1)
            successor_dossier = self.repo.get_object("research_dossier", ref["dossier_id"], 1)
            validation = self.repo.get_object("successor_validation", ref["validation_id"], 1)
            if successor is None or successor_dossier is None or validation is None:
                raise ValueError("CHECKPOINT_SUCCESSOR_OUTPUT_MISSING")
        else:
            successor_dossier = self._assemble_refresh_dossier(
                research_dossier=research_dossier,
                package=package,
                receipt=receipt,
                predecessor_dossier_id=old_dossier["dossier_id"],
            )
            self.repo.put_object("research_dossier", successor_dossier["dossier_id"], 1, successor_dossier)
            successor_goal_id = old_course["goal_id"] + "-REFRESH-V2"
            successor_obj = compile_course_from_dossier(
                goal_id=successor_goal_id,
                title=title,
                desired_outcome=desired_outcome,
                dossier=successor_dossier,
            )
            successor = asdict(successor_obj)
            successor["version"] = int(old_course.get("version", 1)) + 1
            successor["curriculum_series_id"] = series_id
            successor["predecessor_course_id"] = old_course["course_id"]
            successor["predecessor_course_digest"] = digest(old_course)
            successor["domain_key"] = successor_dossier["domain_key"]
            successor["generation_adapter"] = successor_dossier["generation_adapter_id"]
            LearningEngine._validate_course(None, successor)
            grounding = validate_grounding(successor, successor_dossier)
            instructional = validate_instructional_design(successor)
            oracle = self.live_oracle_registry.build(package["oracle_descriptor"], package["course_blueprint"])
            reference = oracle.validate_reference_items(successor)
            lessons = oracle.validate_lesson_examples(successor)
            if grounding["status"] != "PASS":
                raise ValueError("REFRESH_GROUNDING_FAILED:" + ",".join(grounding["errors"]))
            if instructional["status"] != "PASS":
                raise ValueError("REFRESH_INSTRUCTIONAL_FAILED:" + ",".join(instructional["errors"]))
            if reference["status"] != "PASS" or lessons["status"] != "PASS":
                raise ValueError("REFRESH_BEHAVIOR_ORACLE_FAILED")
            quality = self._quality_for_course(successor, successor_dossier)
            if quality["status"] != "PASS":
                raise ValueError("REFRESH_PROFESSIONAL_QUALITY_GATE_FAILED:" + ",".join(quality["failures"]))
            validation_id = f"REFRESH-VAL-{successor['course_id']}"
            validation = {
                "validation_id": validation_id,
                "course_id": successor["course_id"],
                "course_digest": digest(successor),
                "grounding": grounding,
                "instructional_design": instructional,
                "reference_item_oracle": reference,
                "lesson_example_oracle": lessons,
                "professional_quality": quality,
                "human_review_required": True,
                "status": "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED",
            }
            self.repo.put_object("course", successor["course_id"], 1, successor)
            self.repo.put_object("successor_validation", validation_id, 1, validation)
            self.repo.put_object("successor_course_ref", f"SUCCESSOR-REF-{job_id}", 1, {
                "course_id": successor["course_id"], "course_digest": digest(successor),
                "dossier_id": successor_dossier["dossier_id"], "dossier_digest": digest(successor_dossier),
                "validation_id": validation_id, "validation_digest": digest(validation),
            })
            self.repo.save_job(job_id, "RUNNING", "SUCCESSOR_GENERATED_VALIDATED", 5, payload)
            if crash_after_phase == "SUCCESSOR_GENERATED_VALIDATED":
                raise InjectedCrash("crash after successor generation")

        if checkpoint >= 6:
            diff = self.repo.get_object("course_semantic_diff", f"DIFF-{job_id}", 1)
            migration = self.repo.get_object("learner_state_migration_plan", f"MIGRATION-{job_id}", 1)
            if diff is None or migration is None:
                raise ValueError("CHECKPOINT_REFRESH_DIFF_OR_MIGRATION_MISSING")
        else:
            old_quality = self.repo.get_object("professional_quality_report", f"QUALITY-{old_course['course_id']}-V1", 1)
            if old_quality is None:
                old_quality = self._quality_for_course(old_course, old_dossier)
            new_quality = validation["professional_quality"]
            diff = semantic_course_diff(
                old_course=old_course, new_course=successor,
                old_dossier=old_dossier, new_dossier=successor_dossier,
                old_quality=old_quality, new_quality=new_quality,
            )
            diff.update({
                "diff_id": f"DIFF-{job_id}",
                "series_id": series_id,
                "old_course_id": old_course["course_id"],
                "new_course_id": successor["course_id"],
            })
            if diff["quality_regressed"]:
                raise ValueError("REFRESH_QUALITY_REGRESSION_BLOCKED")
            migration = self._learners_migration_plan(
                series_id=series_id,
                old_course_id=old_course["course_id"],
                new_course_id=successor["course_id"],
                diff=diff,
            )
            self.repo.put_object("course_semantic_diff", diff["diff_id"], 1, diff)
            self.repo.put_object("learner_state_migration_plan", f"MIGRATION-{job_id}", 1, migration)
            self.repo.save_job(job_id, "RUNNING", "SEMANTIC_DIFF_COMPUTED", 6, payload)
            if crash_after_phase == "SEMANTIC_DIFF_COMPUTED":
                raise InjectedCrash("crash after semantic diff")

        readiness = {
            "series_id": series_id,
            "successor_course_id": successor["course_id"],
            "successor_course_digest": digest(successor),
            "predecessor_course_id": old_course["course_id"],
            "predecessor_activation_revision": old_activation["activation_revision"],
            "semantic_diff_id": diff["diff_id"],
            "semantic_class": diff["semantic_class"],
            "affected_skill_ids": diff["affected_skill_ids"],
            "quality_status": validation["professional_quality"]["status"],
            "quality_profile_id": validation["professional_quality"]["profile_id"],
            "mechanical_validation_status": validation["status"],
            "human_review_required": True,
            "activation_state": "READY_FOR_REVIEW",
        }
        self.repo.put_object("successor_readiness", f"READINESS-{job_id}", 1, readiness)
        result = {
            "job_id": job_id,
            "state": "READY_FOR_REVIEW",
            "series_id": series_id,
            "active_course_id_unchanged": old_course["course_id"],
            "active_activation_revision_unchanged": old_activation["activation_revision"],
            "successor_course_id": successor["course_id"],
            "successor_course_version": successor["version"],
            "successor_course_digest": digest(successor),
            "semantic_diff_id": diff["diff_id"],
            "semantic_class": diff["semantic_class"],
            "affected_skill_ids": diff["affected_skill_ids"],
            "mastery_revalidation_required": diff["mastery_revalidation_required"],
            "quality_profile_id": validation["professional_quality"]["profile_id"],
            "quality_standing": validation["professional_quality"]["standing"],
            "external_recognition": "NOT_CLAIMED",
        }
        self.repo.save_job(job_id, "SUCCEEDED", "READY_FOR_REVIEW", 7, payload)
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("CourseRefreshSuccessorReadyForReview", series_id, result)
        return result

    def activate_successor(
        self,
        *,
        operation_id: str,
        series_id: str,
        successor_course_id: str,
        expected_active_revision: int,
        activated_at: str,
        review_receipt: Dict[str, Any],
    ) -> Dict[str, Any]:
        payload = {
            "series_id": series_id,
            "successor_course_id": successor_course_id,
            "expected_active_revision": expected_active_revision,
            "activated_at": activated_at,
            "review_receipt_digest": digest(review_receipt),
            "kind": "EXPLICIT_SUCCESSOR_ACTIVATION",
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        if review_receipt.get("standing") != "LAB_HUMAN_REVIEW_FIXTURE_APPROVED":
            raise ValueError("SUCCESSOR_HUMAN_REVIEW_REQUIRED")
        current_version = self.repo.latest_object_version("course_activation", series_id)
        if current_version != expected_active_revision:
            raise ValueError("SUCCESSOR_ACTIVATION_STALE_BASE")
        current = self.repo.get_object("course_activation", series_id, current_version)
        if current is None:
            raise KeyError(series_id)
        successor = self.repo.get_object("course", successor_course_id, 1)
        if successor is None:
            raise KeyError(successor_course_id)
        validation = self.repo.get_object("successor_validation", f"REFRESH-VAL-{successor_course_id}", 1)
        if validation is None or validation.get("status") != "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED":
            raise ValueError("SUCCESSOR_MECHANICAL_VALIDATION_MISSING")
        if validation.get("professional_quality", {}).get("status") != "PASS":
            raise ValueError("SUCCESSOR_PROFESSIONAL_QUALITY_GATE_FAILED")
        # Find the semantic diff that points to this successor.
        diff = None
        with self.repo.connect() as con:
            rows = con.execute(
                "SELECT body FROM objects WHERE kind='course_semantic_diff' ORDER BY rowid DESC"
            ).fetchall()
        import json
        for row in rows:
            body = json.loads(row[0])
            if body.get("series_id") == series_id and body.get("new_course_id") == successor_course_id:
                diff = body
                break
        if diff is None:
            raise ValueError("SUCCESSOR_SEMANTIC_DIFF_MISSING")
        activation = {
            "series_id": series_id,
            "activation_revision": expected_active_revision + 1,
            "course_id": successor_course_id,
            "course_version": successor["version"],
            "course_digest": digest(successor),
            "activated_at": activated_at,
            "predecessor_course_id": current["course_id"],
            "predecessor_activation_revision": current["activation_revision"],
            "semantic_diff_id": diff["diff_id"],
            "semantic_class": diff["semantic_class"],
            "review_receipt": copy.deepcopy(review_receipt),
            "quality_profile_id": validation["professional_quality"]["profile_id"],
            "state": "ACTIVE",
        }
        actual = self.repo.append_object_version_checked(
            "course_activation", series_id, activation, expected_active_revision
        )
        if actual != expected_active_revision + 1:
            raise ValueError("SUCCESSOR_ACTIVATION_REVISION_MISMATCH")
        self.repo.record_operation(operation_id, payload, activation)
        self.repo.emit("CourseVersionActivated", series_id, activation)
        return activation

    def successor_learner_state(self, *, learner_id: str, migration_id: str, skill_id: str) -> Dict[str, Any]:
        plan = self.repo.get_object("learner_state_migration_plan", migration_id, 1)
        if plan is None:
            raise KeyError(migration_id)
        row = next((x for x in plan["learners"] if x["learner_id"] == learner_id), None)
        if row is None:
            return {"learner_id": learner_id, "skill_id": skill_id, "decision": "NO_PRIOR_EVIDENCE", "stage": "NOT_ASSESSED"}
        decision = next((x for x in row["skill_decisions"] if x["skill_id"] == skill_id), None)
        if decision is None:
            return {"learner_id": learner_id, "skill_id": skill_id, "decision": "NO_PRIOR_EVIDENCE", "stage": "NOT_ASSESSED"}
        return {
            "learner_id": learner_id,
            "skill_id": skill_id,
            "decision": decision["decision"],
            "stage": decision["successor_stage"],
            "source_projection_digest": decision["source_projection_digest"],
            "reason_codes": decision["reason_codes"],
        }
