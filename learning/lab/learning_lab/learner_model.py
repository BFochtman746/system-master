from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .repository import Repository, canonical_json, digest


LEARNER_MODEL_POLICY_VERSION = "001M-S02-v2"
LEARNER_MODEL_OBJECT_KIND = "LRN-E027"
SELF_REGULATION_OBJECT_KIND = "LRN-E028"
IDENTITY_AUTHORITY = "EXTERNAL_REFERENCE_ONLY"

CLAIM_STANDINGS = {
    "OBSERVED",
    "DERIVED",
    "INFERRED",
    "UNKNOWN",
    "STALE",
    "CONTRADICTED",
    "NOT_APPLICABLE",
}

SRL_OBSERVATION_KINDS = {
    "PLAN",
    "MONITOR",
    "EVALUATE",
    "STRATEGY_USE",
    "HELP_REQUEST",
    "BOUNDED_DECLARED_CONTEXT",
}

BOUNDED_DECLARED_CONTEXT_KEYS = {
    "MOTIVATION",
    "EFFORT",
    "TASK_VALUE",
    "CONFUSION",
    "HELP_PREFERENCE",
    "READINESS_TO_TRY_INDEPENDENTLY",
    "STRATEGY_PREFERENCE",
}

ALLOWED_SOURCE_TYPES = {
    "LEARNER_DECLARED",
    "LEARNER_CONFIRMED",
    "LEARNING_INTERACTION",
}

DECLARED_CONTEXT_SOURCE_TYPES = {
    "LEARNER_DECLARED",
    "LEARNER_CONFIRMED",
}

OWNER_VALID_SOURCE_OWNERS = {
    "SYSTEM_MASTER/LEARNING::MOD-LEARNING-001",
    "SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001",
}

ALLOWED_CLAIM_TYPES = {
    "goal_state",
    "mastery",
    "retention",
    "transfer",
    "independence",
    "evidence_coverage",
    "remediation_need",
    "maintenance_need",
    "confidence",
    "self_regulation_support_need",
    "adaptation_readiness",
}

FORBIDDEN_CONTEXT_KEY_TOKENS = {
    "MENTAL_HEALTH",
    "DIAGNOSIS",
    "PERSONALITY",
    "INFERRED_EMOTION",
    "EMOTION_INFERENCE",
    "PROTECTED_ATTRIBUTE",
    "SENSITIVE_ATTRIBUTE",
    "CAMERA_TELEMETRY",
    "VOICE_TELEMETRY",
    "PHYSIOLOGICAL_TELEMETRY",
    "BROWSING_TELEMETRY",
    "DEVICE_TELEMETRY",
}

DEFAULT_EXPECTED_CLAIMS = (
    "mastery",
    "retention",
    "transfer",
    "independence",
)

NON_INDEPENDENT_ASSISTANCE = {
    "AI_ASSISTED",
    "SUBSTANTIAL_HINTS",
    "WORKED_EXAMPLE",
    "DIRECT_ANSWER",
    "HUMAN_ASSISTED",
    "UNKNOWN_ASSISTANCE",
}


class LearnerModelPolicyError(ValueError):
    pass


def _require_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise LearnerModelPolicyError(f"{name.upper()}_REQUIRED")
    return value.strip()


def _json_safe_copy(value: Any) -> Any:
    try:
        return json.loads(canonical_json(value))
    except (TypeError, ValueError) as exc:
        raise LearnerModelPolicyError("VALUE_NOT_JSON_SERIALIZABLE") from exc


def _walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, nested in value.items():
            yield str(key).upper()
            yield from _walk_keys(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk_keys(nested)


def _normalize_as_of(value: Optional[Any], name: str = "as_of") -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise LearnerModelPolicyError(f"{name.upper()}_MUST_BE_NONNEGATIVE_INTEGER")
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise LearnerModelPolicyError(f"{name.upper()}_MUST_BE_NONNEGATIVE_INTEGER") from exc
    if normalized < 0:
        raise LearnerModelPolicyError(f"{name.upper()}_MUST_BE_NONNEGATIVE_INTEGER")
    return normalized


def _validate_privacy_boundary(observation_kind: str, context: Dict[str, Any], source_type: str) -> None:
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise LearnerModelPolicyError("UNAUTHORIZED_OR_INFERRED_CONTEXT_SOURCE")

    for key in _walk_keys(context):
        normalized = key.replace("-", "_").replace(" ", "_")
        if any(token in normalized for token in FORBIDDEN_CONTEXT_KEY_TOKENS):
            raise LearnerModelPolicyError("FORBIDDEN_PSYCHOLOGICAL_OR_TELEMETRY_CONTEXT")

    if observation_kind == "BOUNDED_DECLARED_CONTEXT":
        context_key = str(context.get("context_key", "")).upper()
        if context_key not in BOUNDED_DECLARED_CONTEXT_KEYS:
            raise LearnerModelPolicyError("DECLARED_CONTEXT_OUT_OF_SCOPE")
        if source_type not in DECLARED_CONTEXT_SOURCE_TYPES:
            raise LearnerModelPolicyError("DECLARED_CONTEXT_MUST_BE_LEARNER_DECLARED_OR_CONFIRMED")


def _observation_id(operation_id: str) -> str:
    suffix = hashlib.sha256(operation_id.encode("utf-8")).hexdigest()[:24]
    return f"srl-{suffix}"


def record_self_regulation_observation(
    repo: Repository,
    *,
    learner_id: str,
    observation_kind: str,
    value: Any,
    operation_id: str,
    context_ref: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    supersedes_observation_id: Optional[str] = None,
    observed_at: Optional[int] = None,
    source_type: str = "LEARNER_DECLARED",
) -> Dict[str, Any]:
    """I112 RecordSelfRegulationObservation.

    The write is append-oriented, semantically idempotent, and bounded to SRL
    context. It never updates mastery, assessment, retention, transfer, Curriculum,
    identity, or another source-of-truth family.
    """

    learner_id = _require_text(learner_id, "learner_id")
    operation_id = _require_text(operation_id, "operation_id")
    observation_kind = _require_text(observation_kind, "observation_kind").upper()
    source_type = _require_text(source_type, "source_type").upper()
    if observation_kind not in SRL_OBSERVATION_KINDS:
        raise LearnerModelPolicyError("SRL_OBSERVATION_KIND_NOT_ALLOWED")

    normalized_context = _json_safe_copy(context or {})
    normalized_value = _json_safe_copy(value)
    _validate_privacy_boundary(observation_kind, normalized_context, source_type)
    normalized_observed_at = _normalize_as_of(observed_at, "observed_at")

    if supersedes_observation_id is not None:
        supersedes_observation_id = _require_text(
            supersedes_observation_id, "supersedes_observation_id"
        )

    semantic_payload = {
        "learner_id": learner_id,
        "observation_kind": observation_kind,
        "value": normalized_value,
        "context_ref": context_ref,
        "context": normalized_context,
        "supersedes_observation_id": supersedes_observation_id,
        "observed_at": normalized_observed_at,
        "source_type": source_type,
    }
    payload_digest = digest(semantic_payload)
    observation_id = _observation_id(operation_id)

    with repo.connect() as con:
        existing = con.execute(
            "SELECT payload_digest,result FROM operations WHERE operation_id=?",
            (operation_id,),
        ).fetchone()
        if existing is not None:
            if existing[0] != payload_digest:
                raise ValueError("IDEMPOTENCY_DIGEST_MISMATCH")
            return json.loads(existing[1])

        if supersedes_observation_id is not None:
            prior = con.execute(
                "SELECT body,body_digest FROM objects "
                "WHERE kind=? AND object_id=? AND version=1",
                (SELF_REGULATION_OBJECT_KIND, supersedes_observation_id),
            ).fetchone()
            if prior is None:
                raise LearnerModelPolicyError("SUPERSEDED_OBSERVATION_NOT_FOUND")
            prior_body = json.loads(prior[0])
            if digest(prior_body) != prior[1]:
                raise ValueError("OBJECT_DIGEST_MISMATCH")
            if prior_body.get("learner_id") != learner_id:
                raise LearnerModelPolicyError("SUPERSEDED_OBSERVATION_LEARNER_MISMATCH")

        effective_observed_at = int(time.time()) if normalized_observed_at is None else normalized_observed_at
        declaration_standing = None
        if observation_kind == "BOUNDED_DECLARED_CONTEXT":
            declaration_standing = "DIRECT" if source_type == "LEARNER_DECLARED" else "LEARNER_CONFIRMED"

        body = {
            "object_type": SELF_REGULATION_OBJECT_KIND,
            "observation_id": observation_id,
            "learner_id": learner_id,
            "identity_authority": IDENTITY_AUTHORITY,
            "observation_kind": observation_kind,
            "value": normalized_value,
            "context_ref": context_ref,
            "context": normalized_context,
            "supersedes_observation_id": supersedes_observation_id,
            "observed_at": effective_observed_at,
            "source_type": source_type,
            "declaration_standing": declaration_standing,
            "competence_effect": "NONE",
            "mastery_effect": "NONE",
        }
        body_serialized = canonical_json(body)
        con.execute(
            "INSERT INTO objects(kind,object_id,version,body,body_digest) VALUES(?,?,?,?,?)",
            (
                SELF_REGULATION_OBJECT_KIND,
                observation_id,
                1,
                body_serialized,
                digest(body),
            ),
        )
        result = {
            "observation_id": observation_id,
            "learner_id": learner_id,
            "identity_authority": IDENTITY_AUTHORITY,
            "observation_kind": observation_kind,
            "observed_at": effective_observed_at,
            "standing": "OBSERVED",
        }
        con.execute(
            "INSERT INTO operations(operation_id,payload_digest,result) VALUES(?,?,?)",
            (operation_id, payload_digest, canonical_json(result)),
        )
        con.execute(
            "INSERT INTO events(event_type,subject_id,body) VALUES(?,?,?)",
            (
                "SelfRegulationObservationRecorded",
                learner_id,
                canonical_json(
                    {
                        "observation_id": observation_id,
                        "observation_kind": observation_kind,
                        "supersedes_observation_id": supersedes_observation_id,
                    }
                ),
            ),
        )
    return result


def self_regulation_history(repo: Repository, learner_id: str) -> List[Dict[str, Any]]:
    learner_id = _require_text(learner_id, "learner_id")
    with repo.connect() as con:
        rows = con.execute(
            "SELECT object_id,body,body_digest FROM objects "
            "WHERE kind=? ORDER BY rowid",
            (SELF_REGULATION_OBJECT_KIND,),
        ).fetchall()
    history: List[Dict[str, Any]] = []
    for row in rows:
        body = json.loads(row[1])
        if digest(body) != row[2]:
            raise ValueError("OBJECT_DIGEST_MISMATCH")
        if body.get("learner_id") == learner_id:
            history.append(body)
    return history


def _active_srl_observations(history: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    superseded = {
        str(item["supersedes_observation_id"])
        for item in history
        if item.get("supersedes_observation_id")
    }
    return [item for item in history if item.get("observation_id") not in superseded]


def _meaningful_standing(standing: str) -> bool:
    return standing not in {"UNKNOWN", "NOT_APPLICABLE"}


def _normalize_source_versions(source_refs: Sequence[str], raw_versions: Any) -> Dict[str, str]:
    if not isinstance(raw_versions, dict):
        raise LearnerModelPolicyError("SOURCE_VERSIONS_REQUIRED")
    normalized = {str(key): str(value) for key, value in raw_versions.items() if str(key) and str(value)}
    missing = [ref for ref in source_refs if ref not in normalized]
    if missing:
        raise LearnerModelPolicyError("SOURCE_VERSION_MISSING")
    return {key: normalized[key] for key in sorted(normalized) if key in source_refs}


def _normalize_source_claim(raw: Dict[str, Any], projection_as_of: Optional[int]) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        raise LearnerModelPolicyError("SOURCE_CLAIM_MUST_BE_OBJECT")

    claim_type = _require_text(raw.get("claim_type"), "claim_type").lower()
    if claim_type not in ALLOWED_CLAIM_TYPES:
        raise LearnerModelPolicyError("CLAIM_TYPE_OUT_OF_LEARNING_SCOPE")

    standing = _require_text(raw.get("standing"), "standing").upper()
    if standing not in CLAIM_STANDINGS:
        raise LearnerModelPolicyError("CLAIM_STANDING_NOT_ALLOWED")

    value = _json_safe_copy(raw.get("value"))
    source_refs = sorted({str(ref).strip() for ref in raw.get("source_refs", []) if str(ref).strip()})
    source_owner = raw.get("source_owner")
    source_versions: Dict[str, str] = {}
    claim_as_of = _normalize_as_of(raw.get("as_of"), "claim_as_of")

    if _meaningful_standing(standing):
        source_owner = _require_text(source_owner, "source_owner")
        if source_owner not in OWNER_VALID_SOURCE_OWNERS:
            raise LearnerModelPolicyError("SOURCE_OWNER_NOT_OWNER_VALID")
        if not source_refs:
            raise LearnerModelPolicyError("SOURCE_REFS_REQUIRED")
        source_versions = _normalize_source_versions(source_refs, raw.get("source_versions"))
        if claim_as_of is None:
            raise LearnerModelPolicyError("CLAIM_AS_OF_REQUIRED")
    elif source_owner is not None:
        source_owner = _require_text(source_owner, "source_owner")
        if source_owner not in OWNER_VALID_SOURCE_OWNERS:
            raise LearnerModelPolicyError("SOURCE_OWNER_NOT_OWNER_VALID")
        if source_refs:
            source_versions = _normalize_source_versions(source_refs, raw.get("source_versions"))

    if projection_as_of is not None and claim_as_of is not None and claim_as_of > projection_as_of:
        return None

    assistance_condition = raw.get("assistance_condition")
    if assistance_condition is not None:
        assistance_condition = str(assistance_condition).upper()

    reason_codes = sorted({str(code) for code in raw.get("reason_codes", []) if str(code)})
    uncertainty = _json_safe_copy(raw.get("uncertainty"))
    policy_version = raw.get("policy_version")
    model_version = raw.get("model_version")

    if standing == "DERIVED":
        policy_version = _require_text(policy_version, "policy_version")
    elif policy_version is not None:
        policy_version = _require_text(policy_version, "policy_version")

    if standing == "INFERRED":
        model_version = _require_text(model_version, "model_version")
        if uncertainty is None:
            raise LearnerModelPolicyError("INFERRED_CLAIM_UNCERTAINTY_REQUIRED")
    elif model_version is not None:
        model_version = _require_text(model_version, "model_version")

    if claim_type == "independence" and value is True and assistance_condition in NON_INDEPENDENT_ASSISTANCE:
        standing = "CONTRADICTED"
        reason_codes = sorted(set(reason_codes + ["ASSISTANCE_INCOMPATIBLE_WITH_INDEPENDENCE"]))

    limitations = raw.get("limitations", [])
    if limitations is None:
        limitations = []
    if not isinstance(limitations, list):
        raise LearnerModelPolicyError("LIMITATIONS_MUST_BE_LIST")

    return {
        "claim_type": claim_type,
        "standing": standing,
        "value": value,
        "source_owner": source_owner,
        "source_refs": source_refs,
        "source_versions": source_versions,
        "as_of": claim_as_of,
        "evidence_cutoff": _json_safe_copy(raw.get("evidence_cutoff")),
        "policy_version": policy_version,
        "model_version": model_version,
        "uncertainty": uncertainty,
        "evidence_coverage": _json_safe_copy(raw.get("evidence_coverage")),
        "freshness": _json_safe_copy(raw.get("freshness")),
        "assistance_condition": assistance_condition,
        "limitations": sorted({str(item) for item in limitations if str(item)}),
        "reason_codes": reason_codes,
    }


def _unknown_claim(claim_type: str) -> Dict[str, Any]:
    return {
        "claim_type": claim_type,
        "standing": "UNKNOWN",
        "value": None,
        "source_owner": None,
        "source_refs": [],
        "source_versions": {},
        "as_of": None,
        "evidence_cutoff": None,
        "policy_version": None,
        "model_version": None,
        "uncertainty": {"standing": "NO_OWNER_VALID_EVIDENCE"},
        "evidence_coverage": None,
        "freshness": None,
        "assistance_condition": None,
        "limitations": ["NO_OWNER_VALID_SOURCE"],
        "reason_codes": ["NO_OWNER_VALID_SOURCE"],
    }


def _merge_claim_group(claim_type: str, claims: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    if len(claims) == 1:
        return dict(claims[0])

    material = [claim for claim in claims if _meaningful_standing(claim["standing"])]
    distinct_values = {canonical_json(claim["value"]) for claim in material}

    version_by_ref: Dict[str, str] = {}
    source_version_conflict = False
    for claim in material:
        for ref, version in claim["source_versions"].items():
            if ref in version_by_ref and version_by_ref[ref] != version:
                source_version_conflict = True
            version_by_ref[ref] = version

    if len(distinct_values) <= 1 and not source_version_conflict:
        standings = {claim["standing"] for claim in claims}
        if "CONTRADICTED" in standings:
            standing = "CONTRADICTED"
        elif standings == {"STALE"}:
            standing = "STALE"
        elif "OBSERVED" in standings:
            standing = "OBSERVED"
        elif "DERIVED" in standings:
            standing = "DERIVED"
        elif "INFERRED" in standings:
            standing = "INFERRED"
        elif "UNKNOWN" in standings:
            standing = "UNKNOWN"
        else:
            standing = sorted(standings)[0]

        exemplar = dict(claims[0])
        exemplar.update(
            {
                "standing": standing,
                "source_refs": sorted({ref for claim in claims for ref in claim["source_refs"]}),
                "source_versions": {key: version_by_ref[key] for key in sorted(version_by_ref)},
                "reason_codes": sorted({code for claim in claims for code in claim["reason_codes"]}),
                "limitations": sorted({item for claim in claims for item in claim["limitations"]}),
                "as_of": max((claim["as_of"] for claim in claims if claim["as_of"] is not None), default=None),
                "policy_versions": sorted({claim["policy_version"] for claim in claims if claim["policy_version"]}),
                "model_versions": sorted({claim["model_version"] for claim in claims if claim["model_version"]}),
            }
        )
        return exemplar

    reason_codes = ["CONFLICTING_OWNER_VALID_SOURCES"]
    if source_version_conflict:
        reason_codes.append("SOURCE_VERSION_CONFLICT")
    return {
        "claim_type": claim_type,
        "standing": "CONTRADICTED",
        "value": None,
        "source_owner": None,
        "source_refs": sorted({ref for claim in claims for ref in claim["source_refs"]}),
        "source_versions": {key: version_by_ref[key] for key in sorted(version_by_ref)},
        "as_of": max((claim["as_of"] for claim in claims if claim["as_of"] is not None), default=None),
        "evidence_cutoff": None,
        "policy_version": None,
        "model_version": None,
        "uncertainty": {"standing": "MATERIAL_CONTRADICTION"},
        "evidence_coverage": None,
        "freshness": None,
        "assistance_condition": None,
        "limitations": sorted({item for claim in claims for item in claim["limitations"]}),
        "reason_codes": reason_codes,
        "variants": sorted([dict(claim) for claim in claims], key=canonical_json),
    }


def _project_claims(
    source_claims: Sequence[Dict[str, Any]],
    expected_claim_types: Sequence[str],
    projection_as_of: Optional[int],
) -> List[Dict[str, Any]]:
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for raw in source_claims:
        claim = _normalize_source_claim(raw, projection_as_of)
        if claim is not None:
            groups[claim["claim_type"]].append(claim)

    for expected in expected_claim_types:
        expected = _require_text(expected, "expected_claim_type").lower()
        if expected not in ALLOWED_CLAIM_TYPES:
            raise LearnerModelPolicyError("EXPECTED_CLAIM_TYPE_OUT_OF_LEARNING_SCOPE")
        if expected not in groups:
            groups[expected].append(_unknown_claim(expected))

    projected = [_merge_claim_group(claim_type, claims) for claim_type, claims in groups.items()]
    return sorted(projected, key=lambda item: (str(item["claim_type"]), canonical_json(item)))


def get_learner_model_projection(
    repo: Repository,
    *,
    learner_id: str,
    source_claims: Optional[Sequence[Dict[str, Any]]] = None,
    expected_claim_types: Sequence[str] = DEFAULT_EXPECTED_CLAIMS,
    as_of: Optional[Any] = None,
    policy_version: str = LEARNER_MODEL_POLICY_VERSION,
) -> Dict[str, Any]:
    """I111 GetLearnerModelProjection.

    I111 is read-only. It synthesizes a deterministic, content-addressed projection
    from owner-valid source claims plus committed SRL observations. It never writes
    the projection or any desired answer back into source state.
    """

    learner_id = _require_text(learner_id, "learner_id")
    policy_version = _require_text(policy_version, "policy_version")
    projection_as_of = _normalize_as_of(as_of)
    claims = _project_claims(list(source_claims or []), tuple(expected_claim_types), projection_as_of)

    complete_history = self_regulation_history(repo, learner_id)
    history = [
        item for item in complete_history
        if projection_as_of is None or int(item["observed_at"]) <= projection_as_of
    ]
    active = _active_srl_observations(history)

    latest_by_kind: Dict[str, Dict[str, Any]] = {}
    for item in active:
        kind = str(item["observation_kind"])
        current = latest_by_kind.get(kind)
        if current is None or (int(item["observed_at"]), item["observation_id"]) >= (
            int(current["observed_at"]), current["observation_id"]
        ):
            latest_by_kind[kind] = item

    srl_summary = {
        "standing": "OBSERVED" if active else "UNKNOWN",
        "history_count": len(history),
        "active_observation_count": len(active),
        "observed_kinds": sorted(latest_by_kind),
        "latest_by_kind": {
            kind: {
                "observation_id": item["observation_id"],
                "observed_at": item["observed_at"],
                "value": item["value"],
                "context_ref": item.get("context_ref"),
                "source_type": item["source_type"],
                "declaration_standing": item.get("declaration_standing"),
            }
            for kind, item in sorted(latest_by_kind.items())
        },
        "competence_effect": "NONE",
        "mastery_effect": "NONE",
    }

    semantic_subject = {
        "object_type": LEARNER_MODEL_OBJECT_KIND,
        "learner_id": learner_id,
        "identity_authority": IDENTITY_AUTHORITY,
        "as_of": projection_as_of,
        "policy_version": policy_version,
        "claims": claims,
        "self_regulation": srl_summary,
    }
    semantic_digest = digest(semantic_subject)
    return {
        **semantic_subject,
        "projection_id": f"learner-model:{learner_id}",
        "projection_version": semantic_digest[:16],
        "projection_digest": semantic_digest,
        "source_of_truth": False,
        "write_authority": "NONE",
        "projection_lifecycle": "CONTENT_ADDRESSED_READ_ONLY",
    }


class LearnerModelService:
    """Owner-local service surface for the reconciled I111/I112 contracts."""

    def __init__(self, repository: Repository):
        self.repository = repository

    def record_self_regulation_observation(self, **kwargs: Any) -> Dict[str, Any]:
        return record_self_regulation_observation(self.repository, **kwargs)

    def get_self_regulation_history(self, learner_id: str) -> List[Dict[str, Any]]:
        return self_regulation_history(self.repository, learner_id)

    def get_learner_model_projection(self, **kwargs: Any) -> Dict[str, Any]:
        return get_learner_model_projection(self.repository, **kwargs)
