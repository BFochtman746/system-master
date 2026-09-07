from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Set

from .repository import Repository, digest
from .engine import InjectedCrash

BASELINE_DIAGNOSTIC_VERSION = "LEARNING-BASELINE-DIAGNOSTIC-V1"
ADAPTIVE_ENTRY_POLICY_VERSION = "LEARNING-ADAPTIVE-ENTRY-POLICY-V1"

CURRENT_MASTERY_STAGES = {"MASTERED", "TRANSFER_DEMONSTRATED", "RETAINED"}


class DiagnosticPolicyError(ValueError):
    pass


class BaselineDiagnosticDirector:
    """Placement-only diagnostic director.

    Diagnostic observations may change *routing*, but never write mastery attempts or
    mastery projections. Any bypass of instruction ends at an independent Learning
    verification action owned by the established mastery engine.
    """

    def __init__(
        self,
        repo: Repository,
        scorer: Optional[Callable[[Dict[str, Any], str], bool]] = None,
    ):
        self.repo = repo
        self.scorer = scorer

    def create_diagnostic(
        self,
        *,
        operation_id: str,
        diagnostic_id: str,
        learner_id: str,
        course_id: str,
        claimed_skill_ids: List[str],
        created_at: int,
        course_version: int = 1,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "diagnostic_id": diagnostic_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "claimed_skill_ids": sorted(set(claimed_skill_ids)),
            "created_at": created_at,
            "course_version": course_version,
            "version": BASELINE_DIAGNOSTIC_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        course = self._course(course_id, course_version)
        skills = {s["skill_id"]: s for s in course["skills"]}
        unknown = sorted(set(claimed_skill_ids) - set(skills))
        if unknown:
            raise DiagnosticPolicyError("UNKNOWN_CLAIMED_SKILL:" + ",".join(unknown))
        self._assert_acyclic(skills)

        claimed = sorted(set(claimed_skill_ids))
        probe_relevant: Set[str] = set(claimed)
        for skill_id in claimed:
            probe_relevant.update(self._ancestors(skill_id, skills))

        body = {
            "diagnostic_id": diagnostic_id,
            "version": BASELINE_DIAGNOSTIC_VERSION,
            "entry_policy_version": ADAPTIVE_ENTRY_POLICY_VERSION,
            "learner_id": learner_id,
            "course_id": course_id,
            "course_version": course_version,
            "course_digest": digest(course),
            "created_at": created_at,
            "learner_declarations": [
                {
                    "skill_id": sid,
                    "epistemic_standing": "LEARNER_DECLARED",
                    "qualifies_mastery": False,
                }
                for sid in claimed
            ],
            "probe_relevant_skill_ids": sorted(probe_relevant),
            "authority_boundary": {
                "diagnostic_can_change_routing": True,
                "diagnostic_can_write_mastery_attempts": False,
                "diagnostic_can_write_mastery_projections": False,
                "diagnostic_can_mint_mastery": False,
            },
        }
        self.repo.put_object("baseline_diagnostic", diagnostic_id, 1, body)
        if crash_after_phase == "DIAGNOSTIC_PINNED":
            raise InjectedCrash("crash after diagnostic pinned")
        result = {
            "diagnostic_id": diagnostic_id,
            "standing": "CREATED",
            "claimed_skill_ids": claimed,
            "probe_relevant_skill_ids": sorted(probe_relevant),
            "next_action": self.next_action(diagnostic_id),
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("BaselineDiagnosticCreated", diagnostic_id, {
            "learner_id": learner_id,
            "course_id": course_id,
            "claimed_skill_ids": claimed,
        })
        return result

    def next_action(self, diagnostic_id: str) -> Dict[str, Any]:
        diag = self._diagnostic(diagnostic_id)
        course = self._course(diag["course_id"], diag["course_version"])
        if digest(course) != diag["course_digest"]:
            raise DiagnosticPolicyError("DIAGNOSTIC_COURSE_VERSION_DRIFT")

        skills = {s["skill_id"]: s for s in course["skills"]}
        ordered = self._topological_order(course["skills"])
        relevant = set(diag["probe_relevant_skill_ids"])

        for skill_id in ordered:
            skill = skills[skill_id]
            if any(not self._prerequisite_current(diag, prereq) for prereq in skill.get("hard_prerequisite_skill_ids", [])):
                continue

            projection = self.repo.latest_projection(diag["learner_id"], diag["course_id"], skill_id)
            stage = projection.get("stage") if projection else None
            if stage in CURRENT_MASTERY_STAGES:
                continue
            if stage == "RETENTION_DUE":
                target = self._item_for(course, skill_id, "RETENTION_CHECK")
                return self._action("RETENTION_CHECK", target and target["item_id"], skill_id,
                                    ["EXISTING_EVIDENCE_REQUIRES_RETENTION"])
            if stage == "REVALIDATION_DUE":
                return self._action("ADAPTIVE_REVALIDATION", None, skill_id,
                                    ["EXISTING_EVIDENCE_IS_STALE"])

            probe = self._latest_probe(diagnostic_id, skill_id)
            if probe:
                standing = probe["standing"]
                if standing == "OBSERVED_CORRECT_INDEPENDENT":
                    target = self._item_for(course, skill_id, "MASTERY_CHECK")
                    if not target:
                        raise DiagnosticPolicyError("NO_INDEPENDENT_VERIFICATION_ITEM")
                    return self._action(
                        "INDEPENDENT_VERIFICATION", target["item_id"], skill_id,
                        ["DIAGNOSTIC_SUPPORTS_BYPASS_OF_INSTRUCTION", "DIAGNOSTIC_IS_NOT_MASTERY"],
                    )
                if standing == "OBSERVED_INCORRECT_INDEPENDENT":
                    lesson = self._lesson_for(course, skill_id)
                    return self._action("TARGETED_REMEDIATION", lesson and lesson["lesson_id"], skill_id,
                                        ["DIAGNOSTIC_PREREQUISITE_GAP_OBSERVED"])
                if standing in {"INSUFFICIENT_EVIDENCE", "ASSISTED_NOT_INDEPENDENT"}:
                    fresh = self._safe_probe_item(course, skill_id, exclude_family_ids={probe.get("item_family_id")})
                    if fresh:
                        return self._action("DIAGNOSTIC_PROBE", fresh["item_id"], skill_id,
                                            ["FRESH_DIAGNOSTIC_EVIDENCE_REQUIRED"])
                    lesson = self._lesson_for(course, skill_id)
                    return self._action("LESSON", lesson and lesson["lesson_id"], skill_id,
                                        ["NO_FRESH_SAFE_DIAGNOSTIC_PROBE", "DEFAULT_TO_INSTRUCTION"])

            if skill_id in relevant:
                item = self._safe_probe_item(course, skill_id)
                if not item:
                    lesson = self._lesson_for(course, skill_id)
                    return self._action("LESSON", lesson and lesson["lesson_id"], skill_id,
                                        ["NO_SAFE_DIAGNOSTIC_PROBE", "DEFAULT_TO_INSTRUCTION"])
                reasons = ["LEARNER_DECLARED_SKILL_REQUIRES_OBSERVATION"]
                if skill_id not in {d["skill_id"] for d in diag["learner_declarations"]}:
                    reasons = ["ADVANCED_CLAIM_REQUIRES_PREREQUISITE_CHECK"]
                return self._action("DIAGNOSTIC_PROBE", item["item_id"], skill_id, reasons)

            lesson = self._lesson_for(course, skill_id)
            return self._action("LESSON", lesson and lesson["lesson_id"], skill_id,
                                ["NO_PRIOR_EVIDENCE_OR_DECLARATION"])

        return self._action("COURSE_ENTRY_COMPLETE", None, None, ["ALL_SKILLS_CURRENTLY_SATISFIED"])

    def record_probe(
        self,
        *,
        operation_id: str,
        probe_id: str,
        diagnostic_id: str,
        item_id: str,
        response: str,
        submitted_at: int,
        assisted: bool = False,
        answer_revealed_before_commit: bool = False,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "probe_id": probe_id,
            "diagnostic_id": diagnostic_id,
            "item_id": item_id,
            "response": response,
            "submitted_at": submitted_at,
            "assisted": assisted,
            "answer_revealed_before_commit": answer_revealed_before_commit,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        diag = self._diagnostic(diagnostic_id)
        course = self._course(diag["course_id"], diag["course_version"])
        if digest(course) != diag["course_digest"]:
            raise DiagnosticPolicyError("DIAGNOSTIC_COURSE_VERSION_DRIFT")
        item = next((i for i in course["items"] if i["item_id"] == item_id), None)
        if not item:
            raise DiagnosticPolicyError("DIAGNOSTIC_ITEM_UNKNOWN")
        criterion = next((c for c in course["criteria"] if c["criterion_id"] == item["criterion_id"]), None)
        if not criterion:
            raise DiagnosticPolicyError("DIAGNOSTIC_CRITERION_UNKNOWN")
        skill_id = criterion["skill_id"]
        existing_probe = self.repo.get_object("diagnostic_probe", probe_id, 1)
        if existing_probe and existing_probe.get("operation_id") != operation_id:
            raise DiagnosticPolicyError("PROBE_ID_REUSE_ACROSS_OPERATION")
        if not existing_probe:
            expected = self.next_action(diagnostic_id)
            if expected["action_type"] != "DIAGNOSTIC_PROBE" or expected["target_id"] != item_id:
                raise DiagnosticPolicyError("UNAUTHORIZED_DIAGNOSTIC_PROBE")

        if answer_revealed_before_commit or assisted:
            standing = "ASSISTED_NOT_INDEPENDENT"
            correct: Optional[bool] = None
        elif not response.strip():
            standing = "INSUFFICIENT_EVIDENCE"
            correct = None
        else:
            correct = self._score(item, response)
            standing = "OBSERVED_CORRECT_INDEPENDENT" if correct else "OBSERVED_INCORRECT_INDEPENDENT"

        body = {
            "operation_id": operation_id,
            "probe_id": probe_id,
            "diagnostic_id": diagnostic_id,
            "learner_id": diag["learner_id"],
            "course_id": diag["course_id"],
            "skill_id": skill_id,
            "criterion_id": item["criterion_id"],
            "item_id": item_id,
            "item_family_id": item["family_id"],
            "response": response,
            "correct": correct,
            "assisted": assisted,
            "answer_revealed_before_commit": answer_revealed_before_commit,
            "submitted_at": submitted_at,
            "standing": standing,
            "epistemic_standing": "DIRECT_OBSERVATION" if not assisted and response.strip() else "LEARNER_DECLARED",
            "routing_only": True,
            "qualifies_mastery": False,
            "mastery_attempt_written": False,
            "mastery_projection_written": False,
        }
        self.repo.put_object("diagnostic_probe", probe_id, 1, body)
        if crash_after_phase == "PROBE_STORED":
            raise InjectedCrash("crash after probe stored")
        index_id = f"{diagnostic_id}:{skill_id}"
        index_version = 1
        latest_index = None
        while True:
            idx = self.repo.get_object("diagnostic_probe_index", index_id, index_version)
            if not idx:
                break
            latest_index = idx
            index_version += 1
        if not latest_index or latest_index.get("probe_id") != probe_id:
            self.repo.put_object("diagnostic_probe_index", index_id, index_version, {"probe_id": probe_id, "operation_id": operation_id})
        if crash_after_phase == "PROBE_INDEXED":
            raise InjectedCrash("crash after probe indexed")
        result = {
            "probe": body,
            "next_action": self.next_action(diagnostic_id),
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("BaselineDiagnosticProbeObserved", probe_id, {
            "diagnostic_id": diagnostic_id,
            "skill_id": skill_id,
            "standing": standing,
            "routing_only": True,
        })
        return result

    def _course(self, course_id: str, version: int = 1) -> Dict[str, Any]:
        course = self.repo.get_object("course", course_id, version)
        if not course:
            raise KeyError(course_id)
        return course

    def _diagnostic(self, diagnostic_id: str) -> Dict[str, Any]:
        body = self.repo.get_object("baseline_diagnostic", diagnostic_id, 1)
        if not body:
            raise KeyError(diagnostic_id)
        return body

    def _latest_probe(self, diagnostic_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        index_id = f"{diagnostic_id}:{skill_id}"
        version = 1
        latest = None
        while True:
            idx = self.repo.get_object("diagnostic_probe_index", index_id, version)
            if not idx:
                break
            latest = idx
            version += 1
        if not latest:
            return None
        return self.repo.get_object("diagnostic_probe", latest["probe_id"], 1)

    @staticmethod
    def _ancestors(skill_id: str, skills: Dict[str, Dict[str, Any]]) -> Set[str]:
        result: Set[str] = set()
        stack = list(skills[skill_id].get("hard_prerequisite_skill_ids", []))
        while stack:
            sid = stack.pop()
            if sid in result:
                continue
            result.add(sid)
            stack.extend(skills[sid].get("hard_prerequisite_skill_ids", []))
        return result

    @staticmethod
    def _assert_acyclic(skills: Dict[str, Dict[str, Any]]) -> None:
        visiting: Set[str] = set()
        visited: Set[str] = set()

        def dfs(sid: str) -> None:
            if sid in visiting:
                raise DiagnosticPolicyError("INVALID_PREREQUISITE_GRAPH")
            if sid in visited:
                return
            visiting.add(sid)
            for p in skills[sid].get("hard_prerequisite_skill_ids", []):
                if p not in skills:
                    raise DiagnosticPolicyError("MISSING_PREREQUISITE_SKILL")
                dfs(p)
            visiting.remove(sid)
            visited.add(sid)

        for sid in skills:
            dfs(sid)

    @staticmethod
    def _topological_order(skills: List[Dict[str, Any]]) -> List[str]:
        by_id = {s["skill_id"]: s for s in skills}
        ordered: List[str] = []
        visited: Set[str] = set()

        def visit(sid: str) -> None:
            if sid in visited:
                return
            for p in by_id[sid].get("hard_prerequisite_skill_ids", []):
                visit(p)
            visited.add(sid)
            ordered.append(sid)

        for s in skills:
            visit(s["skill_id"])
        return ordered

    def _prerequisite_current(self, diag: Dict[str, Any], skill_id: str) -> bool:
        projection = self.repo.latest_projection(diag["learner_id"], diag["course_id"], skill_id)
        return bool(projection and projection.get("stage") in CURRENT_MASTERY_STAGES)

    @staticmethod
    def _lesson_for(course: Dict[str, Any], skill_id: str) -> Optional[Dict[str, Any]]:
        return next((l for l in course["lessons"] if l["skill_id"] == skill_id), None)

    @staticmethod
    def _item_for(course: Dict[str, Any], skill_id: str, mode: str) -> Optional[Dict[str, Any]]:
        criterion_ids = {c["criterion_id"] for c in course["criteria"] if c["skill_id"] == skill_id}
        return next((i for i in course["items"] if i["criterion_id"] in criterion_ids and i["mode"] == mode), None)

    @staticmethod
    def _safe_probe_item(
        course: Dict[str, Any], skill_id: str, exclude_family_ids: Optional[Set[Optional[str]]] = None
    ) -> Optional[Dict[str, Any]]:
        exclude = {x for x in (exclude_family_ids or set()) if x}
        criterion_ids = {c["criterion_id"] for c in course["criteria"] if c["skill_id"] == skill_id}
        candidates = [
            i for i in course["items"]
            if i["criterion_id"] in criterion_ids and i["mode"] == "PRACTICE" and i["family_id"] not in exclude
        ]
        return candidates[0] if candidates else None

    def _score(self, item: Dict[str, Any], response: str) -> bool:
        if self.scorer is not None:
            return bool(self.scorer(item, response))
        if item.get("scoring_type", "EXACT") != "EXACT":
            raise DiagnosticPolicyError("DIAGNOSTIC_SCORER_REQUIRED")
        return response.strip().upper() == str(item["answer"]).strip().upper()

    @staticmethod
    def _action(action_type: str, target_id: Optional[str], skill_id: Optional[str], reason_codes: List[str]) -> Dict[str, Any]:
        return {
            "action_type": action_type,
            "target_id": target_id,
            "skill_id": skill_id,
            "reason_codes": reason_codes,
            "authority": "ROUTING_ONLY" if action_type == "DIAGNOSTIC_PROBE" else "LEARNING_RUNTIME",
        }
