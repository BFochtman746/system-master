from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .real_learner_pilot_handoff import (
    RealLearnerPilotHandoffError,
    handoff_path,
    verify_pilot_handoff,
)


REAL_LEARNER_PILOT_REVIEW_INTAKE_VERSION = "REAL-LEARNER-PILOT-REVIEW-INTAKE-V1"


class RealLearnerPilotReviewIntakeError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotReviewIntakeError(code)


def review_intake_path(root: Path, pilot_id: str) -> Path:
    return root / f"{pilot_id}.review-intake.json"


def _load_json(path: Path, missing_code: str) -> Dict[str, Any]:
    if not path.is_file():
        _fail(missing_code)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail(missing_code + ":" + type(exc).__name__)
    if not isinstance(value, dict):
        _fail(missing_code + ":NOT_OBJECT")
    return value


def build_review_intake(*, root: Path, pilot_id: str) -> Dict[str, Any]:
    if not isinstance(pilot_id, str) or not pilot_id:
        _fail("PILOT_REVIEW_INTAKE_ID_REQUIRED")
    manifest = _load_json(root / f"{pilot_id}.manifest.json", "PILOT_REVIEW_INTAKE_MANIFEST_NOT_FOUND")
    if manifest.get("pilot_id") != pilot_id:
        _fail("PILOT_REVIEW_INTAKE_MANIFEST_ID_MISMATCH")
    if manifest.get("completed") is not True:
        _fail("PILOT_REVIEW_INTAKE_COMPLETED_PILOT_REQUIRED")
    state_key = manifest.get("state_key")
    if not isinstance(state_key, str) or not state_key:
        _fail("PILOT_REVIEW_INTAKE_STATE_KEY_REQUIRED")

    try:
        handoff_verification = verify_pilot_handoff(root=root, pilot_id=pilot_id, state_key=state_key)
    except RealLearnerPilotHandoffError as exc:
        _fail("PILOT_REVIEW_INTAKE_HANDOFF_INVALID:" + str(exc))

    completion = _load_json(root / f"{pilot_id}.completion.json", "PILOT_REVIEW_INTAKE_COMPLETION_NOT_FOUND")
    envelope = _load_json(handoff_path(root, pilot_id), "PILOT_REVIEW_INTAKE_HANDOFF_NOT_FOUND")
    if completion.get("pilot_id") != pilot_id or envelope.get("pilot_id") != pilot_id:
        _fail("PILOT_REVIEW_INTAKE_ID_MISMATCH")
    if completion.get("raw_response_included") is not False or completion.get("direct_pii_included") is not False:
        _fail("PILOT_REVIEW_INTAKE_PRIVACY_BOUNDARY_INVALID")
    if envelope.get("record_digest") != completion.get("record_digest"):
        _fail("PILOT_REVIEW_INTAKE_RECORD_DIGEST_MISMATCH")

    packet = {
        "review_intake_version": REAL_LEARNER_PILOT_REVIEW_INTAKE_VERSION,
        "protocol_version": completion.get("protocol_version"),
        "pilot_id": pilot_id,
        "domain_key": completion.get("domain_key"),
        "participant_outcome": completion.get("participant_outcome"),
        "eligible_for_effectiveness_review": completion.get("eligible_for_effectiveness_review") is True,
        "metrics": {
            "baseline_fraction": completion.get("baseline_fraction"),
            "independent_verification_fraction": completion.get("independent_verification_fraction"),
            "retention_fraction": completion.get("retention_fraction"),
            "transfer_fraction": completion.get("transfer_fraction"),
            "observed_verification_minus_baseline": completion.get("observed_verification_minus_baseline"),
            "retention_delay_seconds": completion.get("retention_delay_seconds"),
        },
        "record_digest": completion.get("record_digest"),
        "handoff_digest": handoff_verification.get("handoff_digest"),
        "privacy_boundary": {
            "participant_key_included": False,
            "learner_id_included": False,
            "state_key_included": False,
            "filesystem_path_included": False,
            "raw_response_included": False,
            "direct_pii_included": False,
            "manifest_body_included": False,
            "state_database_body_included": False,
        },
        "handling": {
            "local_handoff_verified": True,
            "external_upload_performed": False,
            "external_anchor_created": False,
            "external_export_authorized_by_this_packet": False,
        },
        "truth_boundary": {
            "packet_is_minimized_review_input": True,
            "packet_is_not_raw_participant_evidence": True,
            "packet_is_not_external_anchor": True,
            "software_independently_proves_human_identity": False,
            "single_participant_proves_population_effectiveness": False,
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
        },
    }
    rendered = json.dumps(packet, sort_keys=True)
    lowered = rendered.lower()
    for forbidden in ('"participant_key"', '"learner_id"', '"state_key"', '"response"', '"raw_response"', '"free_text"', "resolved_state_root"):
        if forbidden in lowered:
            _fail("PILOT_REVIEW_INTAKE_FORBIDDEN_FIELD")
    return packet


def write_review_intake(*, root: Path, pilot_id: str) -> Dict[str, Any]:
    packet = build_review_intake(root=root, pilot_id=pilot_id)
    target = review_intake_path(root, pilot_id)
    tmp = target.with_suffix(".tmp")
    tmp.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(target)
    return packet
