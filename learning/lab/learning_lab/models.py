from __future__ import annotations

from dataclasses import dataclass, asdict, field
from enum import Enum
from typing import Any, Dict, List, Optional


class AssessmentMode(str, Enum):
    PRACTICE = "PRACTICE"
    FORMATIVE = "FORMATIVE"
    MASTERY_CHECK = "MASTERY_CHECK"
    RETENTION_CHECK = "RETENTION_CHECK"
    TRANSFER_CHECK = "TRANSFER_CHECK"


class GateState(str, Enum):
    UNKNOWN = "UNKNOWN"
    IN_PROGRESS = "IN_PROGRESS"
    SATISFIED = "SATISFIED"
    FAILED_CURRENTLY = "FAILED_CURRENTLY"
    STALE = "STALE"
    CONFLICTED = "CONFLICTED"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class MasteryStage(str, Enum):
    NOT_ASSESSED = "NOT_ASSESSED"
    BUILDING = "BUILDING"
    DEMONSTRATED = "DEMONSTRATED"
    RETENTION_DUE = "RETENTION_DUE"
    RETAINED = "RETAINED"
    TRANSFER_DEMONSTRATED = "TRANSFER_DEMONSTRATED"
    MASTERED = "MASTERED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    CONFLICTED_EVIDENCE = "CONFLICTED_EVIDENCE"
    REVALIDATION_DUE = "REVALIDATION_DUE"


@dataclass(frozen=True)
class Criterion:
    criterion_id: str
    skill_id: str
    outcome: str


@dataclass(frozen=True)
class Skill:
    skill_id: str
    title: str
    criterion_ids: List[str]
    hard_prerequisite_skill_ids: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class Lesson:
    lesson_id: str
    title: str
    skill_id: str
    criterion_ids: List[str]
    objective: str
    explanation: str
    worked_examples: List[str]
    practice_item_ids: List[str]
    claim_refs: List[str] = field(default_factory=list)
    grounding_spans: List[Dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class Item:
    item_id: str
    family_id: str
    criterion_id: str
    mode: str
    prompt: str
    answer: str
    rationale: str
    scoring_type: str = "EXACT"
    claim_refs: List[str] = field(default_factory=list)
    grounding_spans: List[Dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class Course:
    course_id: str
    version: int
    goal_id: str
    title: str
    desired_outcome: str
    skills: List[Skill]
    criteria: List[Criterion]
    lessons: List[Lesson]
    items: List[Item]
    state: str = "READY_FOR_REVIEW"
    source_ids: List[str] = field(default_factory=list)
    research_dossier_id: Optional[str] = None
    generation_adapter: Optional[str] = None


@dataclass(frozen=True)
class Attempt:
    attempt_id: str
    learner_id: str
    goal_id: str
    course_id: str
    skill_id: str
    criterion_id: str
    item_id: str
    item_family_id: str
    mode: str
    response: str
    correct: bool
    assisted: bool
    answer_revealed_before_commit: bool
    submitted_at: int


@dataclass(frozen=True)
class MasteryProjection:
    learner_id: str
    course_id: str
    skill_id: str
    stage: str
    gate_states: Dict[str, str]
    mastery_progress_percent: int
    evidence_coverage_percent: int
    counted_attempt_ids: List[str]
    excluded_attempts: Dict[str, str]
    reason_codes: List[str]


@dataclass(frozen=True)
class NextAction:
    action_type: str
    target_id: Optional[str]
    skill_id: Optional[str]
    reason_codes: List[str]


def to_dict(obj: Any) -> Dict[str, Any]:
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    if isinstance(obj, dict):
        return obj
    raise TypeError(type(obj))
