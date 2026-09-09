from __future__ import annotations

import re

TASKS = {
    "ANCHOR_LOCALIZATION",
    "ENTITY_IDENTITY_COREFERENCE",
    "EVENT_IDENTITY",
    "STORY_VS_DISCOURSE_TIME",
    "CAUSAL_GOAL_RELATIONS",
    "EPISTEMIC_FOCALIZATION",
    "NARRATIVE_FUNCTION",
    "SETUP_PAYOFF_OPEN_QUESTION",
    "ARC_ORCHESTRATION",
}

SPAN = r"(?:A|C|EV|G|Q|M|P)(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
A = r"A(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
C = r"C(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
EV = r"EV(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
G = r"G(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
Q = r"Q(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
M = r"M(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
P = r"P(?:0|[1-9][0-9]*)-(?:[1-9][0-9]*)"
TEMP_REL = r"(?:BEFORE|AFTER|OVERLAPS|SIMULTANEOUS|UNRESOLVED)"
FUNCTION = r"(?:SETUP|PAYOFF|CHARACTER_REVEAL|TURN|ESCALATION|REVERSAL|FRAME_SHIFT|EXPOSITION|MOTIF_INTRODUCTION|MOTIF_TRANSFORMATION|OTHER|UNRESOLVED)"
ARC_BEAT = r"(?:INTRODUCTION|ESCALATION|TURN|REVERSAL|RESOLUTION)"
ARC_STATUS = r"(?:OPEN|PARTIAL|CLOSED|UNRESOLVED)"

PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "ANCHOR_LOCALIZATION": (re.compile(rf"anchor:{A}$"),),
    "ENTITY_IDENTITY_COREFERENCE": (
        re.compile(rf"entity:{C}$"),
        re.compile(rf"coref:{C}->{C}$"),
        re.compile(rf"distinct_entity:{C}!={C}$"),
    ),
    "EVENT_IDENTITY": (
        re.compile(rf"event:{EV}$"),
        re.compile(rf"same_event:{EV}={EV}$"),
        re.compile(rf"distinct_event:{EV}!={EV}$"),
    ),
    "STORY_VS_DISCOURSE_TIME": (
        re.compile(rf"story:{EV}_{TEMP_REL}_{EV}$"),
        re.compile(rf"discourse:{EV}_{TEMP_REL}_{EV}$"),
    ),
    "CAUSAL_GOAL_RELATIONS": (
        re.compile(rf"causes:{EV}->{EV}$"),
        re.compile(rf"enables:{EV}->{EV}$"),
        re.compile(rf"prevents:{EV}->{EV}$"),
        re.compile(rf"goal:{EV}_SUPPORTS_{G}$"),
        re.compile(rf"goal:{EV}_OPPOSES_{G}$"),
        re.compile(rf"causal:{EV}_REL_{EV}_UNRESOLVED$"),
    ),
    "EPISTEMIC_FOCALIZATION": (
        re.compile(rf"perceives:{C}_{EV}$"),
        re.compile(rf"believes:{C}_{P}$"),
        re.compile(rf"knows:{C}_{P}$"),
        re.compile(rf"focalizes:{C}_{A}$"),
        re.compile(rf"epistemic:{C}_{P}_UNRESOLVED$"),
    ),
    "NARRATIVE_FUNCTION": (re.compile(rf"function:{A}={FUNCTION}$"),),
    "SETUP_PAYOFF_OPEN_QUESTION": (
        re.compile(rf"setup:{A}->{Q}$"),
        re.compile(rf"payoff:{A}->{Q}$"),
        re.compile(rf"status:{Q}={ARC_STATUS}$"),
    ),
    "ARC_ORCHESTRATION": (
        re.compile(rf"arc:{C}_BEAT_{A}={ARC_BEAT}$"),
        re.compile(rf"arc:{C}_STATUS={ARC_STATUS}$"),
        re.compile(rf"motif:{M}_{A}=INTRODUCTION$"),
        re.compile(rf"motif:{M}_{A}=TRANSFORMATION$"),
    ),
}

SPAN_FINDER = re.compile(SPAN)


def _validate_span(span_id: str, passage_char_length: int | None) -> None:
    match = re.fullmatch(r"(?:A|C|EV|G|Q|M|P)([0-9]+)-([0-9]+)", span_id)
    if match is None:
        raise ValueError(f"source-bound span id invalid: {span_id}")
    start = int(match.group(1))
    end = int(match.group(2))
    if start >= end:
        raise ValueError(f"source-bound span must have start < end: {span_id}")
    if passage_char_length is not None and end > passage_char_length:
        raise ValueError(f"source-bound span exceeds passage length: {span_id}")


def validate_task_label(task: str, label: str, passage_char_length: int | None = None) -> str:
    if task not in TASKS:
        raise ValueError(f"unsupported extraction task: {task}")
    label = label.strip()
    if label == f"abstain:{task}":
        return label
    if not label:
        raise ValueError("label required")
    if not any(pattern.fullmatch(label) for pattern in PATTERNS[task]):
        raise ValueError(f"label invalid for task {task}: {label}")
    spans = SPAN_FINDER.findall(label)
    if not spans:
        raise ValueError(f"source-bound label has no span identity: {label}")
    for span_id in spans:
        _validate_span(span_id, passage_char_length)
    return label


def validate_task_labels(task: str, labels: list[str], passage_char_length: int | None = None) -> list[str]:
    normalized = [validate_task_label(task, label, passage_char_length) for label in labels]
    if len(normalized) != len(set(normalized)):
        raise ValueError("duplicate canonical labels")
    return normalized
