#!/usr/bin/env python3
"""RESEARCH_KNOWLEDGE / RESEARCH source-query semantic provider.

This module implements the bounded public QUERY required by BOOK to request
source/provenance projections without taking ownership of browser execution,
physical artifact custody, shared data-classification semantics, or Book
canonical state.

Public operation:
  RESEARCH_KNOWLEDGE.RESEARCH.QUERY.SEARCH_SOURCES_WITH_PROVENANCE

Owner boundaries:
- RESEARCH_KNOWLEDGE owns query/result/provenance semantics.
- CONNECTED_ACTIONS owns external browser/connector side effects and is injected
  as a backend adapter; this module never performs a browser action directly.
- CORE owns shared data-classification validation and physical artifact storage;
  this module consumes a classification validator and returns artifact refs.
- BOOK retains Book authorization, evidence admission, locator construction,
  canon decisions and canonical writes.
"""

from __future__ import annotations

import copy
import hashlib
from typing import Any, Callable, Mapping

OPERATION_ID = "RESEARCH_KNOWLEDGE.RESEARCH.QUERY.SEARCH_SOURCES_WITH_PROVENANCE"
SEMANTIC_ROLE = "SEARCH_SOURCES_WITH_PROVENANCE"
PROVIDER_SYSTEM = "RESEARCH_KNOWLEDGE"
OWNER_PATH = "SYSTEM_MASTER/RESEARCH_KNOWLEDGE"
DOMAIN = "RESEARCH"
KIND = "QUERY"
CALLER_SYSTEM = "BOOK"
CALLER_OWNER_PATH = "SYSTEM_MASTER/BOOK"
SHA256_CHARS = frozenset("0123456789abcdef")
MAX_RESULTS_LIMIT = 100
MAX_PROVIDER_QUERIES_LIMIT = 64


class ResearchQueryError(RuntimeError):
    """Typed provider-owned error retaining the RESEARCH_KNOWLEDGE origin."""

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail
        self.provider_system = PROVIDER_SYSTEM
        self.operation_id = OPERATION_ID
        super().__init__(f"{code}:{detail}" if detail else code)


def _fail(code: str, detail: str = "") -> None:
    raise ResearchQueryError(code, detail)


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("INVALID_REQUEST", f"{label}:NONEMPTY_TEXT_REQUIRED")
    return value


def _optional_text(value: Any, label: str) -> str | None:
    if value is None:
        return None
    return _require_text(value, label)


def _require_bool(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        _fail("INVALID_REQUEST", f"{label}:BOOLEAN_REQUIRED")
    return value


def _require_int(value: Any, label: str, *, minimum: int = 0, maximum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        _fail("INVALID_REQUEST", f"{label}:INTEGER_OUT_OF_RANGE")
    if maximum is not None and value > maximum:
        _fail("INVALID_REQUEST", f"{label}:INTEGER_OUT_OF_RANGE")
    return value


def _require_digest(value: Any, label: str) -> str:
    text = _require_text(value, label)
    if len(text) != 64 or any(ch not in SHA256_CHARS for ch in text):
        _fail("INVALID_REQUEST", f"{label}:LOWERCASE_SHA256_REQUIRED")
    return text


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _require_string_list(value: Any, label: str, *, maximum: int = 64) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > maximum:
        _fail("INVALID_REQUEST", f"{label}:BOUNDED_LIST_REQUIRED")
    result: list[str] = []
    for index, item in enumerate(value):
        result.append(_require_text(item, f"{label}[{index}]"))
    return result


def _validate_request(request: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(request, Mapping):
        _fail("INVALID_REQUEST", "REQUEST_OBJECT_REQUIRED")
    value = dict(request)

    if value.get("caller_system") != CALLER_SYSTEM:
        _fail("INVALID_REQUEST", "CALLER_SYSTEM_MISMATCH")
    if value.get("caller_owner_path") != CALLER_OWNER_PATH:
        _fail("INVALID_REQUEST", "CALLER_OWNER_MISMATCH")
    if value.get("provider_system") != PROVIDER_SYSTEM:
        _fail("INVALID_REQUEST", "PROVIDER_SYSTEM_MISMATCH")
    if value.get("provider_owner_path") != OWNER_PATH:
        _fail("INVALID_REQUEST", "PROVIDER_OWNER_MISMATCH")
    if value.get("domain") != DOMAIN or value.get("kind") != KIND:
        _fail("INVALID_REQUEST", "PROVIDER_DOMAIN_OR_KIND_MISMATCH")
    if value.get("semantic_role") != SEMANTIC_ROLE:
        _fail("INVALID_REQUEST", "SEMANTIC_ROLE_MISMATCH")
    if value.get("operation_id") != OPERATION_ID:
        _fail("INVALID_REQUEST", "OPERATION_ID_MISMATCH")
    if value.get("canonical_effect_allowed") is not False:
        _fail("INVALID_REQUEST", "CANONICAL_EFFECT_FORBIDDEN")
    if value.get("direct_cross_peer_database_access") is not False:
        _fail("INVALID_REQUEST", "DIRECT_CROSS_PEER_DATABASE_ACCESS_FORBIDDEN")

    _require_text(value.get("request_id"), "request_id")
    _require_text(value.get("work_id"), "work_id")
    query_text = _require_text(value.get("query_text"), "query_text")
    query_sha256 = _require_digest(value.get("query_sha256"), "query_sha256")
    if _sha256_text(query_text) != query_sha256:
        _fail("INVALID_REQUEST", "QUERY_DIGEST_MISMATCH")

    _require_text(value.get("purpose"), "purpose")
    _require_text(value.get("freshness_requirement"), "freshness_requirement")
    _require_text(value.get("breadth_profile"), "breadth_profile")
    _require_text(value.get("data_classification"), "data_classification")

    max_results = _require_int(value.get("max_results"), "max_results", minimum=1, maximum=MAX_RESULTS_LIMIT)
    max_provider_queries = _require_int(
        value.get("max_provider_queries"),
        "max_provider_queries",
        minimum=1,
        maximum=MAX_PROVIDER_QUERIES_LIMIT,
    )
    minimum_distinct_domains = _require_int(
        value.get("minimum_distinct_domains"),
        "minimum_distinct_domains",
        minimum=1,
        maximum=max_results,
    )
    include_local = _require_bool(value.get("include_local"), "include_local")
    include_external = _require_bool(value.get("include_external"), "include_external")
    if not include_local and not include_external:
        _fail("INVALID_REQUEST", "AT_LEAST_ONE_SOURCE_MODE_REQUIRED")

    query_variants = _require_string_list(value.get("query_variants"), "query_variants", maximum=max_provider_queries)
    _require_string_list(value.get("semantic_tags"), "semantic_tags")
    _require_string_list(value.get("source_classes"), "source_classes")
    _require_string_list(value.get("preferred_domains"), "preferred_domains")
    _require_string_list(value.get("excluded_domains"), "excluded_domains")

    if len(query_variants) > max_provider_queries:
        _fail("QUERY_BUDGET_EXHAUSTED", "QUERY_VARIANTS_EXCEED_PROVIDER_BUDGET")
    if include_external:
        _require_text(value.get("book_authorization_ref"), "book_authorization_ref")

    return value


def _validate_classification(
    request: Mapping[str, Any],
    classification_validator: Callable[[str], Mapping[str, Any]],
) -> dict[str, Any] | None:
    if not request["include_external"]:
        return None
    try:
        result = classification_validator(str(request["data_classification"]))
    except ResearchQueryError:
        raise
    except Exception as error:  # provider boundary must fail closed
        _fail("CLASSIFICATION_NOT_ADMITTED", type(error).__name__)
    if not isinstance(result, Mapping):
        _fail("CLASSIFICATION_NOT_ADMITTED", "CORE_CLASSIFICATION_RESULT_REQUIRED")
    result = dict(result)
    _require_text(result.get("schema_ref"), "classification.schema_ref")
    _require_text(result.get("canonical_token"), "classification.canonical_token")
    if not isinstance(result.get("external_research_eligible"), bool):
        _fail("CLASSIFICATION_NOT_ADMITTED", "CORE_ELIGIBILITY_DECISION_REQUIRED")
    if result["external_research_eligible"] is not True:
        _fail("CLASSIFICATION_NOT_ADMITTED", "EXTERNAL_RESEARCH_NOT_ELIGIBLE")
    return result


def _validate_source(source: Any, index: int) -> dict[str, Any]:
    if not isinstance(source, Mapping):
        _fail("SOURCE_PROVENANCE_INCOMPLETE", f"source[{index}]:OBJECT_REQUIRED")
    value = copy.deepcopy(dict(source))
    required_text = (
        "source_id",
        "snapshot_id",
        "canonical_uri",
        "title",
        "media_type",
        "retrieved_at",
        "trust_class",
        "freshness_state",
        "raw_artifact_ref",
        "evidence_ref",
        "provider_id",
        "provider_request_ref",
    )
    for field in required_text:
        try:
            _require_text(value.get(field), f"source[{index}].{field}")
        except ResearchQueryError:
            _fail("SOURCE_PROVENANCE_INCOMPLETE", f"source[{index}].{field}")

    try:
        _require_digest(value.get("content_sha256"), f"source[{index}].content_sha256")
        _require_int(value.get("byte_count"), f"source[{index}].byte_count", minimum=0)
    except ResearchQueryError as error:
        _fail("SOURCE_PROVENANCE_INCOMPLETE", error.detail)

    text_artifact_ref = _optional_text(value.get("text_artifact_ref"), f"source[{index}].text_artifact_ref")
    extracted_text = value.get("extracted_text")
    if extracted_text is not None and not isinstance(extracted_text, str):
        _fail("SOURCE_PROVENANCE_INCOMPLETE", f"source[{index}].extracted_text")
    if text_artifact_ref is not None:
        try:
            _require_digest(value.get("text_sha256"), f"source[{index}].text_sha256")
        except ResearchQueryError:
            _fail("SOURCE_PROVENANCE_INCOMPLETE", f"source[{index}].text_sha256")
    elif value.get("text_sha256") is not None:
        _fail("SOURCE_PROVENANCE_INCOMPLETE", f"source[{index}].text_artifact_ref")

    attributes = value.get("attributes", {})
    if not isinstance(attributes, Mapping):
        _fail("SOURCE_PROVENANCE_INCOMPLETE", f"source[{index}].attributes")
    value["attributes"] = copy.deepcopy(dict(attributes))
    return value


def search_sources_with_provenance(
    request: Mapping[str, Any],
    *,
    classification_validator: Callable[[str], Mapping[str, Any]],
    backend: Callable[[Mapping[str, Any]], Mapping[str, Any]],
) -> dict[str, Any]:
    """Execute the RESEARCH semantic query against injected owner-valid providers.

    The backend may use CONNECTED_ACTIONS and CORE infrastructure, but this function
    neither receives their private stores nor performs their side effects directly.
    Returned source projections remain untrusted evidence until BOOK verifies the
    referenced bytes through the separately registered CORE artifact-read query.
    """

    validated = _validate_request(request)
    classification = _validate_classification(validated, classification_validator)

    provider_request = copy.deepcopy(validated)
    if classification is not None:
        provider_request["validated_classification"] = {
            "schema_ref": classification["schema_ref"],
            "canonical_token": classification["canonical_token"],
            "external_research_eligible": True,
        }

    try:
        raw_result = backend(provider_request)
    except ResearchQueryError:
        raise
    except Exception as error:
        _fail("PROVIDER_UNAVAILABLE", type(error).__name__)

    if not isinstance(raw_result, Mapping):
        _fail("PROVIDER_UNAVAILABLE", "PROVIDER_RESULT_OBJECT_REQUIRED")
    sources = raw_result.get("sources")
    if not isinstance(sources, list):
        _fail("SOURCE_PROVENANCE_INCOMPLETE", "SOURCES_LIST_REQUIRED")
    if len(sources) > validated["max_results"]:
        _fail("QUERY_BUDGET_EXHAUSTED", "RESULT_COUNT_EXCEEDS_MAX_RESULTS")

    normalized: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for index, source in enumerate(sources):
        item = _validate_source(source, index)
        identity = (item["source_id"], item["snapshot_id"])
        if identity in seen:
            _fail("SOURCE_PROVENANCE_INCOMPLETE", f"DUPLICATE_SOURCE_SNAPSHOT:{identity[0]}:{identity[1]}")
        seen.add(identity)
        normalized.append(item)

    return {
        "status": "OK",
        "provider_system": PROVIDER_SYSTEM,
        "owner_path": OWNER_PATH,
        "domain": DOMAIN,
        "kind": KIND,
        "semantic_role": SEMANTIC_ROLE,
        "operation_id": OPERATION_ID,
        "request_id": validated["request_id"],
        "work_id": validated["work_id"],
        "query_sha256": validated["query_sha256"],
        "result_count": len(normalized),
        "sources": normalized,
        "canonical_effect_allowed": False,
        "direct_cross_peer_database_access": False,
    }
