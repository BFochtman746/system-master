from __future__ import annotations

import copy
import ipaddress
import os
import re
import urllib.parse
from typing import Any, Dict, Mapping, Optional, Sequence

from .http_research_provider import acquire_bind_and_start_full_http_adaptive_entry
from .repository import Repository, digest


PRODUCTION_PROVIDER_CONFIG_VERSION = "LEARNING-PRODUCTION-PROVIDER-CONFIG-V1"
PRODUCTION_PROVIDER_BINDING_VERSION = "LEARNING-PRODUCTION-PROVIDER-BINDING-V1"
PRODUCTION_PROVIDER_BINDING_KIND = "learning_production_provider_binding"
PRODUCTION_MODE = "PRODUCTION"
QUALIFICATION_LOCAL_MODE = "QUALIFICATION_LOCAL"
ALLOWED_MODES = frozenset({PRODUCTION_MODE, QUALIFICATION_LOCAL_MODE})
RESEARCH_TOKEN_ENV = "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN"
MODEL_TOKEN_ENV = "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN"

_ENV_MODE = "SYSTEM_MASTER_LEARNING_PROVIDER_MODE"
_ENV_RESEARCH_ENDPOINT = "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT"
_ENV_MODEL_ENDPOINT = "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT"
_ENV_RESEARCH_PROVIDER_ID = "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID"
_ENV_MODEL_PROVIDER_ID = "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID"
_ENV_MODEL_ID = "SYSTEM_MASTER_LEARNING_MODEL_ID"
_ENV_SAMPLE_COUNT = "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT"
_ENV_ALLOWED_AUTHORITIES = "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES"

_SAFE_PROVIDER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
_SAFE_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$")
_SAFE_AUTHORITY = re.compile(r"^[A-Z0-9][A-Z0-9_.:-]{0,127}$")


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError("PROVIDER_CONFIG_REQUIRED:" + name)
    value = value.strip()
    if "\x00" in value or len(value) > 4096:
        raise ValueError("PROVIDER_CONFIG_INVALID:" + name)
    return value


def _endpoint_identity(endpoint: str, *, mode: str, label: str) -> Dict[str, Any]:
    if len(endpoint) > 2048 or any(ord(ch) < 32 for ch in endpoint):
        raise ValueError("PROVIDER_CONFIG_ENDPOINT_INVALID:" + label)
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("PROVIDER_CONFIG_ENDPOINT_INVALID:" + label)
    if parsed.username or parsed.password:
        raise ValueError("PROVIDER_CONFIG_ENDPOINT_USERINFO_FORBIDDEN:" + label)
    if parsed.query or parsed.fragment:
        raise ValueError("PROVIDER_CONFIG_ENDPOINT_QUERY_OR_FRAGMENT_FORBIDDEN:" + label)
    if any(part == ".." for part in (parsed.path or "/").split("/")):
        raise ValueError("PROVIDER_CONFIG_ENDPOINT_PATH_TRAVERSAL_FORBIDDEN:" + label)

    host = parsed.hostname.lower().rstrip(".")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if mode == QUALIFICATION_LOCAL_MODE:
        local = host == "localhost" or (ip is not None and ip.is_loopback)
        if not local:
            raise ValueError("PROVIDER_CONFIG_QUALIFICATION_ENDPOINT_NOT_LOOPBACK:" + label)
    elif mode == PRODUCTION_MODE:
        if parsed.scheme != "https":
            raise ValueError("PROVIDER_CONFIG_PRODUCTION_HTTPS_REQUIRED:" + label)
        if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
            raise ValueError("PROVIDER_CONFIG_PRODUCTION_LOCAL_HOST_FORBIDDEN:" + label)
        if ip is not None and (
            ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_multicast or
            ip.is_reserved or ip.is_unspecified
        ):
            raise ValueError("PROVIDER_CONFIG_PRODUCTION_NONPUBLIC_IP_FORBIDDEN:" + label)
    else:
        raise ValueError("PROVIDER_CONFIG_MODE_UNSUPPORTED")

    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("PROVIDER_CONFIG_ENDPOINT_PORT_INVALID:" + label) from exc
    return {
        "scheme": parsed.scheme,
        "host": host,
        "port": port,
        "path": parsed.path or "/",
    }


def _parse_authorities(raw: str) -> list[str]:
    values = [value.strip() for value in raw.split(",") if value.strip()]
    if not values or len(values) > 32:
        raise ValueError("PROVIDER_CONFIG_RESEARCH_AUTHORITIES_REQUIRED")
    if len(set(values)) != len(values):
        raise ValueError("PROVIDER_CONFIG_RESEARCH_AUTHORITY_DUPLICATE")
    if any(not _SAFE_AUTHORITY.fullmatch(value) for value in values):
        raise ValueError("PROVIDER_CONFIG_RESEARCH_AUTHORITY_INVALID")
    return sorted(values)


def load_production_provider_config(env: Optional[Mapping[str, str]] = None) -> Dict[str, Any]:
    source = os.environ if env is None else env
    mode = _required(source, _ENV_MODE).upper()
    if mode not in ALLOWED_MODES:
        raise ValueError("PROVIDER_CONFIG_MODE_UNSUPPORTED")

    research_endpoint = _required(source, _ENV_RESEARCH_ENDPOINT)
    model_endpoint = _required(source, _ENV_MODEL_ENDPOINT)
    research_provider_id = _required(source, _ENV_RESEARCH_PROVIDER_ID)
    model_provider_id = _required(source, _ENV_MODEL_PROVIDER_ID)
    model_id = _required(source, _ENV_MODEL_ID)
    sample_raw = _required(source, _ENV_SAMPLE_COUNT)
    authorities = _parse_authorities(_required(source, _ENV_ALLOWED_AUTHORITIES))
    research_token = _required(source, RESEARCH_TOKEN_ENV)
    model_token = _required(source, MODEL_TOKEN_ENV)

    if not _SAFE_PROVIDER_ID.fullmatch(research_provider_id):
        raise ValueError("PROVIDER_CONFIG_RESEARCH_PROVIDER_ID_INVALID")
    if not _SAFE_PROVIDER_ID.fullmatch(model_provider_id):
        raise ValueError("PROVIDER_CONFIG_MODEL_PROVIDER_ID_INVALID")
    if not _SAFE_MODEL_ID.fullmatch(model_id):
        raise ValueError("PROVIDER_CONFIG_MODEL_ID_INVALID")
    try:
        sample_count = int(sample_raw)
    except ValueError as exc:
        raise ValueError("PROVIDER_CONFIG_SAMPLE_COUNT_INVALID") from exc
    if str(sample_count) != sample_raw.strip() or not (2 <= sample_count <= 4):
        raise ValueError("PROVIDER_CONFIG_SAMPLE_COUNT_OUT_OF_BOUNDS")
    if len(research_token) > 4096 or len(model_token) > 4096:
        raise ValueError("PROVIDER_CONFIG_CREDENTIAL_INVALID")

    research_identity = _endpoint_identity(research_endpoint, mode=mode, label="RESEARCH")
    model_identity = _endpoint_identity(model_endpoint, mode=mode, label="MODEL")
    config = {
        "config_version": PRODUCTION_PROVIDER_CONFIG_VERSION,
        "mode": mode,
        "research_provider_id": research_provider_id,
        "model_provider_id": model_provider_id,
        "model_id": model_id,
        "sample_count": sample_count,
        "research_endpoint": research_endpoint,
        "research_endpoint_identity": research_identity,
        "model_endpoint": model_endpoint,
        "model_endpoint_identity": model_identity,
        "allowed_source_policies": ["OFFICIAL_PRIMARY_CURRENT"],
        "allowed_authorities": authorities,
        "timeout_seconds": 10.0,
        "max_attempts": 2,
    }
    config["config_fingerprint"] = digest(config)
    # Secrets are intentionally returned separately by fixed environment lookup at call time.
    if research_token in str(config) or model_token in str(config):
        raise ValueError("PROVIDER_CONFIG_SECRET_PERSISTENCE_FORBIDDEN")
    return config


def _binding_from_config(batch_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    binding = {
        "binding_version": PRODUCTION_PROVIDER_BINDING_VERSION,
        "config_version": config["config_version"],
        "batch_id": batch_id,
        "config_fingerprint": config["config_fingerprint"],
        "mode": config["mode"],
        "research_provider_id": config["research_provider_id"],
        "model_provider_id": config["model_provider_id"],
        "model_id": config["model_id"],
        "sample_count": config["sample_count"],
        "research_endpoint_identity": copy.deepcopy(config["research_endpoint_identity"]),
        "model_endpoint_identity": copy.deepcopy(config["model_endpoint_identity"]),
        "allowed_source_policies": list(config["allowed_source_policies"]),
        "allowed_authorities": list(config["allowed_authorities"]),
        "timeout_seconds": config["timeout_seconds"],
        "max_attempts": config["max_attempts"],
        "credential_storage": "ENVIRONMENT_ONLY_NOT_PERSISTED",
        "standing": "CONFIGURATION_PINNED_BEFORE_PROVIDER_EXECUTION",
    }
    binding["binding_digest"] = digest(binding)
    return binding


def prepare_provider_configuration_binding(repo: Repository, *, batch_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    if not batch_id:
        raise ValueError("PROVIDER_CONFIG_BATCH_ID_REQUIRED")
    binding = _binding_from_config(batch_id, config)
    prior = repo.get_object(PRODUCTION_PROVIDER_BINDING_KIND, batch_id, 1)
    if prior is not None:
        unsigned = {key: value for key, value in prior.items() if key != "binding_digest"}
        if digest(unsigned) != prior.get("binding_digest"):
            raise ValueError("PROVIDER_CONFIG_BINDING_DIGEST_MISMATCH")
        if prior.get("binding_version") != PRODUCTION_PROVIDER_BINDING_VERSION:
            raise ValueError("PROVIDER_CONFIG_BINDING_VERSION_UNSUPPORTED")
        if prior.get("binding_digest") != binding["binding_digest"]:
            raise ValueError("PROVIDER_CONFIGURATION_DRIFT")
        return copy.deepcopy(prior)
    repo.put_object(PRODUCTION_PROVIDER_BINDING_KIND, batch_id, 1, binding)
    return copy.deepcopy(binding)


def acquire_configured_and_start_full_http_adaptive_entry(
    *,
    repo: Repository,
    operation_id: str,
    batch_id: str,
    request_id: str,
    learner_id: str,
    desired_outcome: str,
    claimed_skill_ids: Sequence[str],
    now: int,
    env: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    source = os.environ if env is None else env
    config = load_production_provider_config(source)
    binding = prepare_provider_configuration_binding(repo, batch_id=batch_id, config=config)
    research_token = _required(source, RESEARCH_TOKEN_ENV)
    model_token = _required(source, MODEL_TOKEN_ENV)
    result = acquire_bind_and_start_full_http_adaptive_entry(
        repo=repo,
        operation_id=operation_id,
        batch_id=batch_id,
        request_id=request_id,
        learner_id=learner_id,
        desired_outcome=desired_outcome,
        sample_count=config["sample_count"],
        research_endpoint=config["research_endpoint"],
        model_endpoint=config["model_endpoint"],
        model_id=config["model_id"],
        claimed_skill_ids=claimed_skill_ids,
        now=now,
        research_credential_provider=lambda: research_token,
        model_credential_provider=lambda: model_token,
        allowed_source_policies=config["allowed_source_policies"],
        allowed_authorities=config["allowed_authorities"],
        timeout_seconds=config["timeout_seconds"],
        max_attempts=config["max_attempts"],
    )
    out = dict(result)
    out.update({
        "production_provider_config_version": PRODUCTION_PROVIDER_CONFIG_VERSION,
        "production_provider_binding_version": PRODUCTION_PROVIDER_BINDING_VERSION,
        "production_provider_binding_digest": binding["binding_digest"],
        "provider_config_fingerprint": config["config_fingerprint"],
        "provider_mode": config["mode"],
        "configured_research_provider_id": config["research_provider_id"],
        "configured_model_provider_id": config["model_provider_id"],
        "configured_model_id": config["model_id"],
        "configured_sample_count": config["sample_count"],
    })
    return out
