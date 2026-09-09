from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import fmean
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from .real_learner_pilot_review_intake import (
    RealLearnerPilotReviewIntakeError,
    build_review_intake,
)


REAL_LEARNER_PILOT_EFFECTIVENESS_REVIEW_VERSION = "REAL-LEARNER-PILOT-EFFECTIVENESS-REVIEW-V1"


class RealLearnerPilotEffectivenessReviewError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotEffectivenessReviewError(code)


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _fraction(value: Any, code: str) -> float:
    if not _is_finite_number(value):
        _fail(code + ":NOT_FINITE_NUMBER")
    rendered = float(value)
    if rendered < 0.0 or rendered > 1.0:
        _fail(code + ":OUT_OF_RANGE")
    return rendered


def _delta(value: Any, code: str) -> float:
    if not _is_finite_number(value):
        _fail(code + ":NOT_FINITE_NUMBER")
    rendered = float(value)
    if rendered < -1.0 or rendered > 1.0:
        _fail(code + ":OUT_OF_RANGE")
    return rendered


def _delay(value: Any, code: str) -> float:
    if not _is_finite_number(value):
        _fail(code + ":NOT_FINITE_NUMBER")
    rendered = float(value)
    if rendered < 0.0:
        _fail(code + ":NEGATIVE")
    return rendered


def _validate_truth_boundary(packet: Dict[str, Any]) -> None:
    privacy = packet.get("privacy_boundary")
    if not isinstance(privacy, dict) or not privacy or any(value is not False for value in privacy.values()):
        _fail("PILOT_EFFECTIVENESS_REVIEW_PRIVACY_BOUNDARY_INVALID")
    handling = packet.get("handling")
    if not isinstance(handling, dict):
        _fail("PILOT_EFFECTIVENESS_REVIEW_HANDLING_BOUNDARY_MISSING")
    if handling.get("local_handoff_verified") is not True:
        _fail("PILOT_EFFECTIVENESS_REVIEW_LOCAL_HANDOFF_NOT_VERIFIED")
    if handling.get("external_export_authorized_by_this_packet") is not False:
        _fail("PILOT_EFFECTIVENESS_REVIEW_EXPORT_AUTHORITY_INVALID")
    truth = packet.get("truth_boundary")
    if not isinstance(truth, dict):
        _fail("PILOT_EFFECTIVENESS_REVIEW_TRUTH_BOUNDARY_MISSING")
    if truth.get("packet_is_minimized_review_input") is not True:
        _fail("PILOT_EFFECTIVENESS_REVIEW_MINIMIZED_INPUT_REQUIRED")
    if truth.get("packet_is_not_raw_participant_evidence") is not True:
        _fail("PILOT_EFFECTIVENESS_REVIEW_RAW_EVIDENCE_BOUNDARY_INVALID")
    if truth.get("single_participant_proves_population_effectiveness") is not False:
        _fail("PILOT_EFFECTIVENESS_REVIEW_POPULATION_CLAIM_BOUNDARY_INVALID")
    if truth.get("psychometric_validity") != "NOT_PROVEN" or truth.get("population_validity") != "NOT_PROVEN":
        _fail("PILOT_EFFECTIVENESS_REVIEW_VALIDITY_BOUNDARY_INVALID")


def _eligible_metrics(packet: Dict[str, Any]) -> Dict[str, float]:
    metrics = packet.get("metrics")
    if not isinstance(metrics, dict):
        _fail("PILOT_EFFECTIVENESS_REVIEW_METRICS_REQUIRED")
    values = {
        "baseline_fraction": _fraction(metrics.get("baseline_fraction"), "PILOT_EFFECTIVENESS_BASELINE"),
        "independent_verification_fraction": _fraction(
            metrics.get("independent_verification_fraction"),
            "PILOT_EFFECTIVENESS_VERIFICATION",
        ),
        "retention_fraction": _fraction(metrics.get("retention_fraction"), "PILOT_EFFECTIVENESS_RETENTION"),
        "transfer_fraction": _fraction(metrics.get("transfer_fraction"), "PILOT_EFFECTIVENESS_TRANSFER"),
        "observed_verification_minus_baseline": _delta(
            metrics.get("observed_verification_minus_baseline"),
            "PILOT_EFFECTIVENESS_VERIFICATION_MINUS_BASELINE",
        ),
        "retention_delay_seconds": _delay(
            metrics.get("retention_delay_seconds"),
            "PILOT_EFFECTIVENESS_RETENTION_DELAY",
        ),
    }
    expected_delta = values["independent_verification_fraction"] - values["baseline_fraction"]
    if abs(values["observed_verification_minus_baseline"] - expected_delta) > 1e-9:
        _fail("PILOT_EFFECTIVENESS_VERIFICATION_DELTA_INCONSISTENT")
    if values["retention_delay_seconds"] < 3600.0:
        _fail("PILOT_EFFECTIVENESS_RETENTION_DELAY_BELOW_PROTOCOL_MINIMUM")
    return values


def _summary(values: Iterable[float]) -> Dict[str, float]:
    materialized = [float(value) for value in values]
    if not materialized:
        _fail("PILOT_EFFECTIVENESS_EMPTY_SUMMARY")
    return {
        "mean": fmean(materialized),
        "minimum": min(materialized),
        "maximum": max(materialized),
    }


def _cohort_summary(records: List[Tuple[Dict[str, Any], Dict[str, float]]]) -> Dict[str, Any]:
    packets = [record[0] for record in records]
    metrics = [record[1] for record in records]
    return {
        "protocol_version": packets[0]["protocol_version"],
        "domain_key": packets[0]["domain_key"],
        "eligible_record_count": len(records),
        "descriptive_metrics": {
            key: _summary(metric[key] for metric in metrics)
            for key in (
                "baseline_fraction",
                "independent_verification_fraction",
                "retention_fraction",
                "transfer_fraction",
                "observed_verification_minus_baseline",
                "retention_delay_seconds",
            )
        },
    }


def build_effectiveness_review(*, root: Path, pilot_ids: Sequence[str]) -> Dict[str, Any]:
    if isinstance(pilot_ids, (str, bytes)):
        _fail("PILOT_EFFECTIVENESS_REVIEW_PILOT_IDS_SEQUENCE_REQUIRED")

    normalized: List[str] = []
    seen_pilot_ids = set()
    for pilot_id in pilot_ids:
        if not isinstance(pilot_id, str) or not pilot_id:
            _fail("PILOT_EFFECTIVENESS_REVIEW_PILOT_ID_REQUIRED")
        if pilot_id in seen_pilot_ids:
            _fail("PILOT_EFFECTIVENESS_REVIEW_DUPLICATE_PILOT_ID")
        seen_pilot_ids.add(pilot_id)
        normalized.append(pilot_id)

    verified_packets: List[Dict[str, Any]] = []
    record_digests = set()
    handoff_digests = set()
    for pilot_id in normalized:
        try:
            packet = build_review_intake(root=root, pilot_id=pilot_id)
        except RealLearnerPilotReviewIntakeError as exc:
            _fail("PILOT_EFFECTIVENESS_REVIEW_SOURCE_INVALID:" + str(exc))
        _validate_truth_boundary(packet)
        if packet.get("pilot_id") != pilot_id:
            _fail("PILOT_EFFECTIVENESS_REVIEW_PILOT_ID_MISMATCH")
        protocol_version = packet.get("protocol_version")
        domain_key = packet.get("domain_key")
        participant_outcome = packet.get("participant_outcome")
        if not isinstance(protocol_version, str) or not protocol_version:
            _fail("PILOT_EFFECTIVENESS_REVIEW_PROTOCOL_REQUIRED")
        if not isinstance(domain_key, str) or not domain_key:
            _fail("PILOT_EFFECTIVENESS_REVIEW_DOMAIN_REQUIRED")
        if not isinstance(participant_outcome, str) or not participant_outcome:
            _fail("PILOT_EFFECTIVENESS_REVIEW_OUTCOME_REQUIRED")
        record_digest = packet.get("record_digest")
        handoff_digest = packet.get("handoff_digest")
        if not isinstance(record_digest, str) or len(record_digest) != 64:
            _fail("PILOT_EFFECTIVENESS_REVIEW_RECORD_DIGEST_INVALID")
        if not isinstance(handoff_digest, str) or len(handoff_digest) != 64:
            _fail("PILOT_EFFECTIVENESS_REVIEW_HANDOFF_DIGEST_INVALID")
        if record_digest in record_digests:
            _fail("PILOT_EFFECTIVENESS_REVIEW_DUPLICATE_RECORD_DIGEST")
        if handoff_digest in handoff_digests:
            _fail("PILOT_EFFECTIVENESS_REVIEW_DUPLICATE_HANDOFF_DIGEST")
        record_digests.add(record_digest)
        handoff_digests.add(handoff_digest)
        verified_packets.append(packet)

    eligible: List[Tuple[Dict[str, Any], Dict[str, float]]] = []
    excluded_outcomes: Counter[str] = Counter()
    cohorts: Dict[Tuple[str, str], List[Tuple[Dict[str, Any], Dict[str, float]]]] = defaultdict(list)
    source_digests: List[Dict[str, str]] = []

    for packet in verified_packets:
        source_digests.append(
            {
                "pilot_id": packet["pilot_id"],
                "record_digest": packet["record_digest"],
                "handoff_digest": packet["handoff_digest"],
            }
        )
        if packet.get("eligible_for_effectiveness_review") is not True:
            excluded_outcomes[packet["participant_outcome"]] += 1
            continue
        metrics = _eligible_metrics(packet)
        record = (packet, metrics)
        eligible.append(record)
        cohorts[(packet["protocol_version"], packet["domain_key"])].append(record)

    eligible_count = len(eligible)
    if eligible_count == 0:
        standing = "NO_ELIGIBLE_HUMAN_EVIDENCE"
    elif eligible_count == 1:
        standing = "SINGLE_RECORD_DESCRIPTIVE_ONLY"
    else:
        standing = "MULTI_RECORD_DESCRIPTIVE_ONLY"

    cohort_summaries = [
        _cohort_summary(cohorts[key])
        for key in sorted(cohorts)
    ]

    result = {
        "effectiveness_review_version": REAL_LEARNER_PILOT_EFFECTIVENESS_REVIEW_VERSION,
        "evidence_source": "LOCAL_VERIFIED_HANDOFF_REBUILT_AT_ANALYSIS_TIME",
        "requested_record_count": len(normalized),
        "verified_record_count": len(verified_packets),
        "eligible_record_count": eligible_count,
        "excluded_record_count": len(verified_packets) - eligible_count,
        "excluded_outcomes": dict(sorted(excluded_outcomes.items())),
        "descriptive_standing": standing,
        "cohorts": cohort_summaries,
        "source_digests": source_digests,
        "claims": {
            "descriptive_summary_allowed": eligible_count > 0,
            "learning_effectiveness_proven": False,
            "causal_effect_proven": False,
            "population_generalization_proven": False,
            "psychometric_validity_proven": False,
            "unique_human_participants_verified": False,
            "control_or_comparison_group_present": False,
            "preregistered_inferential_plan_present": False,
        },
        "privacy_boundary": {
            "participant_key_included": False,
            "learner_id_included": False,
            "state_key_included": False,
            "filesystem_path_included": False,
            "raw_response_included": False,
            "direct_pii_included": False,
        },
        "truth_boundary": {
            "eligible_record_count_is_not_verified_unique_human_count": True,
            "multiple_records_do_not_prove_population_effectiveness": True,
            "descriptive_statistics_are_not_causal_estimates": True,
            "local_digest_verification_is_not_an_external_anchor": True,
            "software_independently_proves_human_identity": False,
            "effectiveness_claim_requires_separate_study_design": True,
        },
    }

    rendered = json.dumps(result, sort_keys=True).lower()
    for forbidden in (
        '"participant_key":',
        '"learner_id":',
        '"state_key":',
        '"raw_response":',
        '"free_text":',
        '"resolved_state_root":',
    ):
        if forbidden in rendered:
            _fail("PILOT_EFFECTIVENESS_REVIEW_FORBIDDEN_FIELD")
    return result
