from __future__ import annotations

import copy
import os
from typing import Any, Dict, Mapping, Optional

from .fresh_evidence_provider import FreshEvidenceProviderAcquisitionService
from .http_model_provider import HTTPJSONModelProvider
from .production_provider_config import (
    MODEL_TOKEN_ENV,
    load_production_provider_config,
    prepare_provider_configuration_binding,
)
from .repository import Repository, digest


CONFIGURED_FRESH_EVIDENCE_PROVIDER_VERSION = "CONFIGURED-FRESH-EVIDENCE-PROVIDER-V1"
CONFIGURED_FRESH_EVIDENCE_BINDING_KIND = "configured_fresh_evidence_provider_binding"
CONFIGURED_FRESH_EVIDENCE_STANDING = "CONFIGURED_HTTP_CAPTURE_BOUND_TO_IMPL032_AND_IMPL031"


def acquire_configured_fresh_evidence(
    *,
    repo: Repository,
    operation_id: str,
    request_id: str,
    course_id: str,
    kind: str,
    skill_id: str,
    criterion_id: str,
    requested_at: int,
    admitted_at: int,
    oracle_spec: Optional[Dict[str, Any]] = None,
    env: Optional[Mapping[str, str]] = None,
    crash_after_phase: Optional[str] = None,
) -> Dict[str, Any]:
    """Acquire one fresh task through the configured HTTP model provider.

    Provider configuration and credentials remain outside the runtime command. The
    existing production-provider config gate validates endpoint policy and pins the
    non-secret configuration before any HTTP call. HTTPJSONModelProvider then durably
    receipts an accepted response before IMPL-032 sees it. IMPL-032 seals that output
    as unverified and delegates admission to IMPL-031.
    """

    source = os.environ if env is None else env
    config = load_production_provider_config(source)
    config_binding_id = f"FRESH-EVIDENCE:{request_id}"
    config_binding = prepare_provider_configuration_binding(
        repo,
        batch_id=config_binding_id,
        config=config,
    )
    token = source.get(MODEL_TOKEN_ENV)
    if not isinstance(token, str) or not token:
        raise ValueError("FRESH_PROVIDER_MODEL_CREDENTIAL_REQUIRED")

    transport = HTTPJSONModelProvider(
        repo=repo,
        batch_id=config_binding_id,
        endpoint=config["model_endpoint"],
        model_id=config["model_id"],
        credential_provider=lambda: token,
        timeout_seconds=config["timeout_seconds"],
        max_attempts=config["max_attempts"],
    )

    service = FreshEvidenceProviderAcquisitionService(repo)
    result = service.acquire_and_admit(
        operation_id=operation_id,
        request_id=request_id,
        course_id=course_id,
        kind=kind,
        skill_id=skill_id,
        criterion_id=criterion_id,
        provider_id=config["model_provider_id"],
        model_id=config["model_id"],
        candidate_provider=lambda request: transport.generate(request, 0),
        requested_at=requested_at,
        admitted_at=admitted_at,
        oracle_spec=copy.deepcopy(oracle_spec),
        crash_after_phase=crash_after_phase,
    )

    capture = service.load_capture(request_id)
    binding = {
        "binding_version": CONFIGURED_FRESH_EVIDENCE_PROVIDER_VERSION,
        "request_id": request_id,
        "course_id": course_id,
        "kind": kind,
        "skill_id": skill_id,
        "criterion_id": criterion_id,
        "config_binding_id": config_binding_id,
        "config_binding_digest": config_binding["binding_digest"],
        "config_fingerprint": config_binding["config_fingerprint"],
        "provider_id": config["model_provider_id"],
        "model_id": config["model_id"],
        "model_endpoint_identity": copy.deepcopy(config["model_endpoint_identity"]),
        "capture_standing": capture["standing"],
        "capture_digest": digest(capture),
        "candidate_digest": capture["candidate_digest"],
        "admission_id": result["admission"]["admission_id"],
        "admission_standing": result["admission"]["standing"],
        "credential_storage": "ENVIRONMENT_ONLY_NOT_PERSISTED",
        "standing": CONFIGURED_FRESH_EVIDENCE_STANDING,
        "authority_boundary": {
            "http_provider_is_candidate_generation_authority_only": True,
            "http_receipt_is_admission_authority": False,
            "impl032_capture_is_admission_authority": False,
            "impl031_is_admission_authority": True,
            "learning_engine_remains_mastery_authority": True,
        },
    }
    binding["binding_digest"] = digest(binding)
    prior = repo.get_object(CONFIGURED_FRESH_EVIDENCE_BINDING_KIND, request_id, 1)
    if prior is not None:
        unsigned = {key: value for key, value in prior.items() if key != "binding_digest"}
        if digest(unsigned) != prior.get("binding_digest"):
            raise ValueError("CONFIGURED_FRESH_EVIDENCE_BINDING_DIGEST_MISMATCH")
        if prior["binding_digest"] != binding["binding_digest"]:
            raise ValueError("CONFIGURED_FRESH_EVIDENCE_BINDING_DRIFT")
        binding = copy.deepcopy(prior)
    else:
        repo.put_object(CONFIGURED_FRESH_EVIDENCE_BINDING_KIND, request_id, 1, binding)

    return {
        **result,
        "configured_fresh_evidence_provider_version": CONFIGURED_FRESH_EVIDENCE_PROVIDER_VERSION,
        "configured_binding_digest": binding["binding_digest"],
        "configured_standing": binding["standing"],
        "credential_storage": binding["credential_storage"],
    }
