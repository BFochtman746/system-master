from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any, Dict, List, Optional

from .engine import InjectedCrash, MasteryStage
from .repository import Repository, digest


class EpistemicStanding(str, Enum):
    LEARNER_DECLARED = "LEARNER_DECLARED"
    DIRECT_OBSERVATION = "DIRECT_OBSERVATION"
    EVIDENCE_SUPPORTED = "EVIDENCE_SUPPORTED"
    SYSTEM_INFERENCE = "SYSTEM_INFERENCE"
    TEACHING_HYPOTHESIS = "TEACHING_HYPOTHESIS"


class DiagnosisStatus(str, Enum):
    NO_DEFECT_OBSERVED = "NO_DEFECT_OBSERVED"
    DIAGNOSED = "DIAGNOSED"
    ABSTAINED = "ABSTAINED"


@dataclass(frozen=True)
class TutorProbe:
    probe_id: str
    skill_id: str
    family_id: str
    prompt: str
    expected_response: str
    claim_refs: List[str]
    error_signature: Optional[str]
    error_match: Optional[str]


PROBES: Dict[str, TutorProbe] = {
    "TP-STAGE-1": TutorProbe(
        "TP-STAGE-1", "S-GIT-STAGE-COMMIT", "TF-STAGE-A",
        "After editing demo.txt, what command stages its current content for the next commit?",
        "git add demo.txt", ["CL-GIT-002"], "STAGING_OMITTED", r"git\s+commit",
    ),
    "TP-STAGE-2": TutorProbe(
        "TP-STAGE-2", "S-GIT-STAGE-COMMIT", "TF-STAGE-B",
        "You changed report.txt after it had already been staged. What command updates the staged copy before commit?",
        "git add report.txt", ["CL-GIT-002", "CL-GIT-003"], "STAGING_OMITTED", r"git\s+commit",
    ),
    "TP-STAGE-RECHECK": TutorProbe(
        "TP-STAGE-RECHECK", "S-GIT-STAGE-COMMIT", "TF-STAGE-C",
        "After changing plan.txt, which command stages its current content?",
        "git add plan.txt", ["CL-GIT-002"], "STAGING_OMITTED", r"git\s+commit",
    ),
    "TP-BRANCH-1": TutorProbe(
        "TP-BRANCH-1", "S-GIT-BRANCH-MERGE", "TF-BRANCH-A",
        "While on main, what command creates and switches to a branch named hotfix?",
        "git switch -c hotfix", ["CL-GIT-004"], "BRANCH_NOT_SWITCHED", r"^\s*git\s+branch\s+hotfix\s*$",
    ),
    "TP-BRANCH-2": TutorProbe(
        "TP-BRANCH-2", "S-GIT-BRANCH-MERGE", "TF-BRANCH-B",
        "You are currently on main. What command merges branch hotfix into the current branch?",
        "git merge hotfix", ["CL-GIT-006"], "MERGE_DIRECTION_REVERSED", r"merge\s+main",
    ),
}


def _norm(value: str) -> str:
    return " ".join(value.strip().replace('"', "'").split()).lower()


def _contains_key(obj: Any, key: str) -> bool:
    if isinstance(obj, dict):
        if key in obj:
            return True
        return any(_contains_key(v, key) for v in obj.values())
    if isinstance(obj, list):
        return any(_contains_key(v, key) for v in obj)
    return False


class TutorContextCompiler:
    """Builds operation-minimal tutor context and strips assessment keys.

    The compiler deliberately excludes all item answers/rationales. It includes only
    the target lesson, admitted research claims required by that lesson/probe, and
    prior completed tutor observations for the same session/skill.
    """

    def __init__(self, repo: Repository):
        self.repo = repo

    def compile(
        self, *, session_id: str, learner_id: str, course_id: str, skill_id: str,
        probe: Optional[TutorProbe], active_assessment_item_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        course = self.repo.get_object("course", course_id, 1)
        if not course:
            raise KeyError(course_id)
        skill = next((s for s in course["skills"] if s["skill_id"] == skill_id), None)
        if not skill:
            raise KeyError(skill_id)
        lesson = next((l for l in course["lessons"] if l["skill_id"] == skill_id), None)
        if not lesson:
            raise ValueError("TUTOR_LESSON_MISSING")

        claim_refs = set(lesson.get("claim_refs", []))
        if probe:
            claim_refs.update(probe.claim_refs)
        dossier = self.repo.get_object("research_dossier", course.get("research_dossier_id"), 1)
        claims = []
        if dossier:
            claims = [
                {"claim_id": c["claim_id"], "statement": c.get("statement", c.get("text", "")), "source_ids": c.get("source_ids", [c.get("source_id")] if c.get("source_id") else [])}
                for c in dossier.get("claims", []) if c["claim_id"] in claim_refs
            ]
        prior = self.repo.completed_tutor_turns(session_id, course_id, skill_id)
        prior_summary = []
        for t in prior[-6:]:
            r = t.get("result", {})
            prior_summary.append({
                "turn_id": r.get("turn_id"),
                "probe_id": r.get("probe_id"),
                "probe_family_id": r.get("probe_family_id"),
                "observation": r.get("observation"),
                "diagnosis": r.get("diagnosis"),
                "support_level_after": r.get("teaching_move", {}).get("support_level_after", 0),
            })
        assessment_meta = None
        if active_assessment_item_id:
            item = next((i for i in course["items"] if i["item_id"] == active_assessment_item_id), None)
            if not item:
                item = self.repo.get_object("transfer_task", active_assessment_item_id, 1) or self.repo.get_object("maintenance_task", active_assessment_item_id, 1)
            if not item:
                raise KeyError(active_assessment_item_id)
            assessment_meta = {
                "item_id": item["item_id"],
                "mode": item["mode"],
                "criterion_id": item["criterion_id"],
                "prompt": item["prompt"],
                "answer_withheld": True,
            }
        context = {
            "operation": "TUTOR_TURN",
            "learner_id": learner_id,
            "course_id": course_id,
            "course_version": course["version"],
            "skill": skill,
            "lesson": {
                "lesson_id": lesson["lesson_id"],
                "objective": lesson["objective"],
                "explanation": lesson["explanation"],
                "claim_refs": lesson.get("claim_refs", []),
            },
            "probe": asdict(probe) if probe else None,
            "admitted_claims": claims,
            "prior_tutor_observations": prior_summary,
            "active_assessment": assessment_meta,
            "integrity_policy": {
                "mastery_or_retention_help": "PROHIBITED",
                "tutor_turns_create_mastery_evidence": False,
            },
        }
        if _contains_key(context, "answer") or _contains_key(context, "rationale"):
            raise AssertionError("TUTOR_CONTEXT_ASSESSMENT_KEY_LEAK")
        return context


class TutorDirector:
    POLICY_VERSION = "TUTOR-DIRECTOR-V1"
    MAX_SUPPORT_LEVEL = 3

    def __init__(self, repo: Repository, learning_engine):
        self.repo = repo
        self.learning_engine = learning_engine
        self.context_compiler = TutorContextCompiler(repo)

    def _course(self, course_id: str) -> Dict[str, Any]:
        return self.learning_engine.course(course_id)

    def _missing_prerequisites(self, *, learner_id: str, course: Dict[str, Any], course_id: str, skill_id: str, now: Optional[int] = None) -> List[str]:
        skill = next((s for s in course["skills"] if s["skill_id"] == skill_id), None)
        if not skill:
            raise KeyError(skill_id)
        missing = []
        for prereq in skill.get("hard_prerequisite_skill_ids", []):
            if now is not None and hasattr(self.learning_engine, "current_projection"):
                projection = self.learning_engine.current_projection(learner_id, course_id, prereq, now=now)
            else:
                projection = self.repo.latest_projection(learner_id, course_id, prereq)
            if not projection or projection.get("stage") != MasteryStage.MASTERED.value:
                missing.append(prereq)
        return missing

    def _assessment_boundary(self, course: Dict[str, Any], active_item_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not active_item_id:
            return None
        item = next((i for i in course["items"] if i["item_id"] == active_item_id), None)
        if not item:
            item = self.repo.get_object("transfer_task", active_item_id, 1) or self.repo.get_object("maintenance_task", active_item_id, 1)
        if not item:
            raise KeyError(active_item_id)
        if item["mode"] not in {"MASTERY_CHECK", "RETENTION_CHECK", "TRANSFER_CHECK"}:
            return None
        return item

    def _observe(self, probe: TutorProbe, response: str, requested_help_level: int) -> Dict[str, Any]:
        correct = _norm(response) == _norm(probe.expected_response)
        signature = None
        lowered = response.lower()
        if not correct and probe.error_signature == "STAGING_OMITTED":
            if re.search(r"git\s+commit", response, flags=re.I) and not re.search(r"git\s+add", response, flags=re.I):
                signature = "STAGING_OMITTED"
        elif not correct and probe.error_signature == "BRANCH_NOT_SWITCHED":
            if re.search(r"^\s*git\s+branch\s+hotfix\s*$", response, flags=re.I) and "switch" not in lowered and "checkout" not in lowered:
                signature = "BRANCH_NOT_SWITCHED"
        elif not correct and probe.error_signature == "MERGE_DIRECTION_REVERSED":
            if re.search(r"git\s+merge\s+main", response, flags=re.I):
                signature = "MERGE_DIRECTION_REVERSED"
        return {
            "correct": correct,
            "response_digest": digest({"response": response}),
            "error_signature_observed": signature,
            "requested_help_level": requested_help_level,
            "epistemic_standing": EpistemicStanding.DIRECT_OBSERVATION.value,
        }

    def _diagnose(self, *, prior: List[Dict[str, Any]], probe: TutorProbe, observation: Dict[str, Any]) -> Dict[str, Any]:
        if observation["correct"]:
            assisted_prior = [
                t for t in prior
                if t.get("result", {}).get("observation", {}).get("correct")
                and t.get("result", {}).get("observation", {}).get("requested_help_level", 0) > 0
            ]
            if observation["requested_help_level"] > 0:
                distinct = {t.get("result", {}).get("probe_family_id") for t in assisted_prior}
                distinct.add(probe.family_id)
                if len(distinct) >= 2:
                    return {
                        "status": DiagnosisStatus.DIAGNOSED.value,
                        "primary_cause": "INDEPENDENCE_NOT_YET_DEMONSTRATED",
                        "standing": EpistemicStanding.EVIDENCE_SUPPORTED.value,
                        "evidence_refs": sorted(x for x in distinct if x),
                        "reason_codes": ["REPEATED_SUPPORTED_SUCCESS", "ASSISTANCE_DEPENDENCE_OBSERVED"],
                    }
                return {
                    "status": DiagnosisStatus.ABSTAINED.value,
                    "primary_cause": None,
                    "standing": EpistemicStanding.DIRECT_OBSERVATION.value,
                    "evidence_refs": [probe.family_id],
                    "reason_codes": ["SUPPORTED_SUCCESS_ONLY", "CAUSE_NOT_CONFIRMED"],
                }
            return {
                "status": DiagnosisStatus.NO_DEFECT_OBSERVED.value,
                "primary_cause": None,
                "standing": EpistemicStanding.DIRECT_OBSERVATION.value,
                "evidence_refs": [probe.family_id],
                "reason_codes": ["UNAIDED_CORRECT_RESPONSE"],
            }

        signature = observation.get("error_signature_observed")
        if not signature:
            return {
                "status": DiagnosisStatus.ABSTAINED.value,
                "primary_cause": None,
                "standing": EpistemicStanding.DIRECT_OBSERVATION.value,
                "evidence_refs": [probe.family_id],
                "reason_codes": ["INCORRECT_RESPONSE", "CAUSE_UNKNOWN", "ABSTENTION_REQUIRED"],
            }
        matching_families = set()
        for t in prior:
            result = t.get("result", {})
            obs = result.get("observation", {})
            if obs.get("error_signature_observed") == signature:
                family = result.get("probe_family_id")
                if family:
                    matching_families.add(family)
        if matching_families and probe.family_id not in matching_families:
            matching_families.add(probe.family_id)
            return {
                "status": DiagnosisStatus.DIAGNOSED.value,
                "primary_cause": signature,
                "standing": EpistemicStanding.EVIDENCE_SUPPORTED.value,
                "evidence_refs": sorted(matching_families),
                "reason_codes": ["REPEATED_DISTINCT_FAMILY_PATTERN", "CAUSE_EVIDENCE_SUPPORTED"],
            }
        return {
            "status": DiagnosisStatus.DIAGNOSED.value,
            "primary_cause": signature,
            "standing": EpistemicStanding.TEACHING_HYPOTHESIS.value,
            "evidence_refs": [probe.family_id],
            "reason_codes": ["SINGLE_PATTERN", "HYPOTHESIS_NOT_CONFIRMED"],
        }

    @staticmethod
    def _prior_support(prior: List[Dict[str, Any]]) -> int:
        if not prior:
            return 0
        return int(prior[-1].get("result", {}).get("teaching_move", {}).get("support_level_after", 0) or 0)

    def _choose_move(
        self, *, prior: List[Dict[str, Any]], probe: TutorProbe, observation: Dict[str, Any],
        diagnosis: Dict[str, Any], requested_help_level: int,
    ) -> Dict[str, Any]:
        prior_support = self._prior_support(prior)
        requested = max(0, min(int(requested_help_level), self.MAX_SUPPORT_LEVEL))
        overhelping_prevented = False

        if observation["correct"]:
            if requested > 0:
                return {
                    "move": "FADE_SUPPORT",
                    "support_level_before": prior_support,
                    "support_level_after": 0,
                    "content": "Now try a fresh parallel task without hints so we can check independent performance.",
                    "next_probe_id": "TP-STAGE-RECHECK" if probe.skill_id == "S-GIT-STAGE-COMMIT" else "TP-BRANCH-2",
                    "overhelping_prevented": True,
                    "reason_codes": ["SUPPORTED_OR_SCAFFOLDED_SUCCESS", "FADE_BEFORE_INDEPENDENT_CHECK"],
                    "claim_refs": [],
                }
            had_prior_support = any(
                t.get("result", {}).get("teaching_move", {}).get("support_level_after", 0) > 0
                or t.get("result", {}).get("observation", {}).get("requested_help_level", 0) > 0
                for t in prior
            )
            prior_unaided_correct_families = {
                t.get("result", {}).get("probe_family_id")
                for t in prior
                if t.get("result", {}).get("observation", {}).get("correct")
                and t.get("result", {}).get("observation", {}).get("requested_help_level", 0) == 0
            }
            if had_prior_support or any(f and f != probe.family_id for f in prior_unaided_correct_families):
                return {
                    "move": "INDEPENDENT_RECHECK_PASSED",
                    "support_level_before": prior_support,
                    "support_level_after": 0,
                    "content": "That fresh response was correct without help. The next evidence step can be an independent mastery check.",
                    "next_probe_id": None,
                    "overhelping_prevented": False,
                    "reason_codes": ["FRESH_UNAIDED_RECHECK", "READY_FOR_INDEPENDENT_EVIDENCE"],
                    "claim_refs": [],
                }
            return {
                "move": "FRESH_RECHECK",
                "support_level_before": prior_support,
                "support_level_after": 0,
                "content": "Correct. Try one fresh parallel example without help before moving to independent assessment.",
                "next_probe_id": "TP-STAGE-RECHECK" if probe.skill_id == "S-GIT-STAGE-COMMIT" else "TP-BRANCH-2",
                "overhelping_prevented": False,
                "reason_codes": ["CORRECT_FORMATIVE_RESPONSE", "FRESH_RECHECK_REQUIRED"],
                "claim_refs": [],
            }

        if diagnosis["status"] == DiagnosisStatus.ABSTAINED.value:
            allowed = 1
            overhelping_prevented = requested > allowed
            return {
                "move": "CLARIFYING_PROBE",
                "support_level_before": prior_support,
                "support_level_after": allowed,
                "content": "I can see the response is not correct, but the cause is not clear yet. Identify which Git state you are trying to change before choosing a command.",
                "next_probe_id": "TP-STAGE-2" if probe.skill_id == "S-GIT-STAGE-COMMIT" else "TP-BRANCH-2",
                "overhelping_prevented": overhelping_prevented,
                "reason_codes": ["CAUSE_UNKNOWN", "DO_NOT_INVENT_MISCONCEPTION", "MINIMAL_HINT"],
                "claim_refs": [],
            }

        confirmed = diagnosis["standing"] == EpistemicStanding.EVIDENCE_SUPPORTED.value
        if confirmed:
            allowed = 2 if prior_support < 2 else 3
            support = min(max(2, requested), allowed)
            overhelping_prevented = requested > allowed
            if diagnosis["primary_cause"] == "STAGING_OMITTED":
                content = "The working tree and the index are different states. Before committing a changed file, update the index with `git add <file>`, then commit. Use a different file on the next try."
                move_claim_refs = ["CL-GIT-002", "CL-GIT-003"]
            elif diagnosis["primary_cause"] == "BRANCH_NOT_SWITCHED":
                content = "Creating a branch name and moving HEAD to it are separate effects. Use the create-and-switch form for a new working branch, then verify which branch is current."
                move_claim_refs = ["CL-GIT-004"]
            else:
                content = "A merge changes the branch you are currently on by integrating the named branch. First identify the current branch and the source branch before choosing the merge command."
                move_claim_refs = ["CL-GIT-006"]
            return {
                "move": "TARGETED_REMEDIATION",
                "support_level_before": prior_support,
                "support_level_after": support,
                "content": content,
                "next_probe_id": "TP-STAGE-RECHECK" if probe.skill_id == "S-GIT-STAGE-COMMIT" else "TP-BRANCH-2",
                "overhelping_prevented": overhelping_prevented,
                "reason_codes": ["EVIDENCE_SUPPORTED_CAUSE", "ALTERNATE_EXPLANATION", "FRESH_RECHECK_AFTER_SUPPORT"],
                "claim_refs": move_claim_refs,
            }

        allowed = 1
        overhelping_prevented = requested > allowed
        if diagnosis["primary_cause"] == "STAGING_OMITTED":
            content = "Before a commit can record your latest file content, ask yourself which Git step selects that current content for the next commit."
            move_claim_refs = ["CL-GIT-002", "CL-GIT-003"]
        elif diagnosis["primary_cause"] == "BRANCH_NOT_SWITCHED":
            content = "Check whether your command only creates a branch name or also makes that branch current."
            move_claim_refs = ["CL-GIT-004"]
        else:
            content = "Before merging, identify which branch is current and which branch's history should be integrated into it."
            move_claim_refs = ["CL-GIT-006"]
        return {
            "move": "TARGETED_HINT",
            "support_level_before": prior_support,
            "support_level_after": allowed,
            "content": content,
            "next_probe_id": "TP-STAGE-2" if probe.skill_id == "S-GIT-STAGE-COMMIT" else "TP-BRANCH-2",
            "overhelping_prevented": overhelping_prevented,
            "reason_codes": ["TEACHING_HYPOTHESIS_ONLY", "HINT_WITHOUT_CONFIRMING_CAUSE"],
            "claim_refs": move_claim_refs,
        }

    @staticmethod
    def _validate_move_grounding(move: Dict[str, Any], context: Dict[str, Any]) -> None:
        admitted = {c["claim_id"] for c in context.get("admitted_claims", [])}
        refs = set(move.get("claim_refs", []))
        if not refs.issubset(admitted):
            raise ValueError("TUTOR_MOVE_GROUNDING_REF_NOT_ADMITTED")
        content = move.get("content", "")
        has_git_instruction = bool(re.search(r"`?git\s+(add|commit|switch|merge|status|branch)\b", content, flags=re.I))
        if has_git_instruction and not refs:
            raise ValueError("TUTOR_MOVE_MATERIAL_CLAIM_UNGROUNDED")

    def process_turn(
        self, *, operation_id: str, turn_id: str, session_id: str, learner_id: str,
        course_id: str, skill_id: str, probe_id: Optional[str], response: str,
        requested_help_level: int, now: int, active_assessment_item_id: Optional[str] = None,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "turn_id": turn_id, "session_id": session_id, "learner_id": learner_id,
            "course_id": course_id, "skill_id": skill_id, "probe_id": probe_id,
            "response": response, "requested_help_level": requested_help_level, "now": now,
            "active_assessment_item_id": active_assessment_item_id,
        }
        prior_turn = self.repo.get_tutor_turn(operation_id, payload)
        if prior_turn and prior_turn["state"] == "COMPLETE":
            return prior_turn["body"]["result"]
        checkpoint = prior_turn["checkpoint"] if prior_turn else 0
        body = dict(prior_turn["body"]) if prior_turn else {}

        course = self._course(course_id)
        boundary_item = self._assessment_boundary(course, active_assessment_item_id)
        if boundary_item:
            context = self.context_compiler.compile(
                session_id=session_id, learner_id=learner_id, course_id=course_id,
                skill_id=skill_id, probe=None, active_assessment_item_id=active_assessment_item_id,
            )
            result = {
                "turn_id": turn_id,
                "session_id": session_id,
                "probe_id": None,
                "probe_family_id": None,
                "observation": {"correct": None, "requested_help_level": requested_help_level, "epistemic_standing": EpistemicStanding.DIRECT_OBSERVATION.value},
                "diagnosis": {
                    "status": DiagnosisStatus.ABSTAINED.value,
                    "primary_cause": None,
                    "standing": EpistemicStanding.DIRECT_OBSERVATION.value,
                    "evidence_refs": [],
                    "reason_codes": ["ASSESSMENT_INTEGRITY_BOUNDARY"],
                },
                "teaching_move": {
                    "move": "ASSESSMENT_INTEGRITY_BOUNDARY",
                    "support_level_before": 0,
                    "support_level_after": 0,
                    "content": "This is an independent assessment. I can’t provide hints, steps, or the answer before you commit your response.",
                    "next_probe_id": None,
                    "overhelping_prevented": requested_help_level > 0,
                    "reason_codes": ["NO_ANSWER_REVEAL", "NO_HINTS_DURING_INDEPENDENT_CHECK"],
                    "claim_refs": [],
                },
                "context_digest": digest(context),
                "next_action": {"action_type": boundary_item["mode"], "target_id": boundary_item["item_id"], "skill_id": skill_id, "reason_codes": ["ASSESSMENT_ACTIVE"]},
                "policy_version": self.POLICY_VERSION,
            }
            answer = boundary_item["answer"]
            if _norm(answer) in _norm(result["teaching_move"]["content"]):
                raise AssertionError("ASSESSMENT_ANSWER_LEAK")
            body = {"result": result}
            self.repo.save_tutor_turn(
                operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id,
                course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=4, state="COMPLETE", body=body,
            )
            return result

        missing_prereqs = self._missing_prerequisites(learner_id=learner_id, course=course, course_id=course_id, skill_id=skill_id, now=now)
        if missing_prereqs:
            result = {
                "turn_id": turn_id,
                "session_id": session_id,
                "probe_id": probe_id,
                "probe_family_id": PROBES[probe_id].family_id if probe_id in PROBES else None,
                "observation": {"correct": None, "requested_help_level": requested_help_level, "epistemic_standing": EpistemicStanding.DIRECT_OBSERVATION.value},
                "diagnosis": {
                    "status": DiagnosisStatus.ABSTAINED.value,
                    "primary_cause": None,
                    "standing": EpistemicStanding.DIRECT_OBSERVATION.value,
                    "evidence_refs": [],
                    "reason_codes": ["PREREQUISITE_GAP", "DIAGNOSIS_NOT_RUN"],
                },
                "teaching_move": {
                    "move": "PREREQUISITE_BLOCKED",
                    "support_level_before": 0,
                    "support_level_after": 0,
                    "content": "This skill is not eligible yet because a required prerequisite has not been mastered. Continue with the prerequisite learning path first.",
                    "next_probe_id": None,
                    "overhelping_prevented": requested_help_level > 0,
                    "reason_codes": ["PREREQUISITE_GAP", "NO_DOWNSTREAM_TUTOR_BYPASS"],
                    "claim_refs": [],
                },
                "context_digest": None,
                "next_action": self.learning_engine.next_action(learner_id, course_id, now=now),
                "policy_version": self.POLICY_VERSION,
                "missing_prerequisite_skill_ids": missing_prereqs,
            }
            body = {"result": result}
            self.repo.save_tutor_turn(
                operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id,
                course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=4, state="COMPLETE", body=body,
            )
            return result

        if not probe_id or probe_id not in PROBES:
            raise ValueError("UNKNOWN_TUTOR_PROBE")
        probe = PROBES[probe_id]
        if probe.skill_id != skill_id:
            raise ValueError("TUTOR_PROBE_SKILL_MISMATCH")
        prior_completed = self.repo.completed_tutor_turns(session_id, course_id, skill_id)

        if checkpoint < 1:
            body["observation"] = self._observe(probe, response, requested_help_level)
            self.repo.save_tutor_turn(
                operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id,
                course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=1, state="RUNNING", body=body,
            )
            if crash_after_phase == "OBSERVATION_RECORDED":
                raise InjectedCrash("crash after tutor observation")

        if checkpoint < 2:
            body["diagnosis"] = self._diagnose(prior=prior_completed, probe=probe, observation=body["observation"])
            self.repo.save_tutor_turn(
                operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id,
                course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=2, state="RUNNING", body=body,
            )
            if crash_after_phase == "DIAGNOSIS_RECORDED":
                raise InjectedCrash("crash after tutor diagnosis")

        if checkpoint < 3:
            context = self.context_compiler.compile(
                session_id=session_id, learner_id=learner_id, course_id=course_id,
                skill_id=skill_id, probe=probe,
            )
            body["context_digest"] = digest(context)
            body["teaching_move"] = self._choose_move(
                prior=prior_completed, probe=probe, observation=body["observation"],
                diagnosis=body["diagnosis"], requested_help_level=requested_help_level,
            )
            self._validate_move_grounding(body["teaching_move"], context)
            self.repo.save_tutor_turn(
                operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id,
                course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=3, state="RUNNING", body=body,
            )
            if crash_after_phase == "MOVE_SELECTED":
                raise InjectedCrash("crash after tutor move selection")

        if checkpoint < 4:
            move = body["teaching_move"]
            if move["move"] == "INDEPENDENT_RECHECK_PASSED":
                next_action = self.learning_engine.next_action(learner_id, course_id, now=now)
                # A tutor recheck is formative only. It cannot create mastery evidence;
                # if no Learning attempt exists yet, point explicitly to the mastery item.
                if next_action["action_type"] == "LESSON":
                    mastery = next(
                        i for i in course["items"]
                        if i["mode"] == "MASTERY_CHECK"
                        and any(c["criterion_id"] == i["criterion_id"] and c["skill_id"] == skill_id for c in course["criteria"])
                    )
                    next_action = {"action_type": "MASTERY_CHECK", "target_id": mastery["item_id"], "skill_id": skill_id, "reason_codes": ["TUTOR_RECHECK_PASSED", "INDEPENDENT_EVIDENCE_STILL_REQUIRED"]}
            else:
                next_action = {
                    "action_type": "TUTOR_PROBE" if move.get("next_probe_id") else "TUTOR_CONTINUE",
                    "target_id": move.get("next_probe_id"),
                    "skill_id": skill_id,
                    "reason_codes": list(move.get("reason_codes", [])),
                }
            result = {
                "turn_id": turn_id,
                "session_id": session_id,
                "probe_id": probe.probe_id,
                "probe_family_id": probe.family_id,
                "observation": body["observation"],
                "diagnosis": body["diagnosis"],
                "teaching_move": body["teaching_move"],
                "context_digest": body["context_digest"],
                "next_action": next_action,
                "policy_version": self.POLICY_VERSION,
            }
            body["result"] = result
            self.repo.save_tutor_turn(
                operation_id=operation_id, turn_id=turn_id, session_id=session_id, learner_id=learner_id,
                course_id=course_id, skill_id=skill_id, payload=payload, checkpoint=4, state="COMPLETE", body=body,
            )
            if crash_after_phase == "TURN_COMPLETED_BEFORE_RETURN":
                raise InjectedCrash("crash after durable tutor completion")
            self.repo.emit("TutorTurnCompleted", turn_id, {
                "session_id": session_id,
                "diagnosis_status": result["diagnosis"]["status"],
                "teaching_move": result["teaching_move"]["move"],
            })
            return result

        return body["result"]
