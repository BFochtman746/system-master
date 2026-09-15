#!/usr/bin/env python3
"""Runnable qualification tests for tools/research_knowledge_source_query.py.

Run directly from the repository root:
  python3 tools/tests/test_research_knowledge_source_query.py
"""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "tools" / "research_knowledge_source_query.py"
SPEC = importlib.util.spec_from_file_location("research_knowledge_source_query", MODULE_PATH)
assert SPEC and SPEC.loader
rq = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rq)


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def request(**overrides):
    query = "source-backed evidence for chapter claim"
    value = {
        "caller_system": "BOOK",
        "caller_owner_path": "SYSTEM_MASTER/BOOK",
        "provider_system": "RESEARCH_KNOWLEDGE",
        "provider_owner_path": "SYSTEM_MASTER/RESEARCH_KNOWLEDGE",
        "domain": "RESEARCH",
        "kind": "QUERY",
        "semantic_role": "SEARCH_SOURCES_WITH_PROVENANCE",
        "operation_id": rq.OPERATION_ID,
        "canonical_effect_allowed": False,
        "direct_cross_peer_database_access": False,
        "request_id": "book-research-001",
        "work_id": "book-001",
        "query_text": query,
        "query_sha256": digest(query),
        "semantic_tags": ["chapter-3", "claim-a"],
        "max_results": 10,
        "freshness_requirement": "CURRENT",
        "include_local": True,
        "include_external": True,
        "data_classification": "core-classification-ref-public",
        "purpose": "BOOK_RESEARCH_EVIDENCE",
        "book_authorization_ref": "BOOK-AUTH-001",
        "breadth_profile": "BALANCED",
        "source_classes": ["PRIMARY", "SECONDARY"],
        "query_variants": [query],
        "preferred_domains": ["example.org"],
        "excluded_domains": [],
        "minimum_distinct_domains": 1,
        "max_provider_queries": 4,
    }
    value.update(overrides)
    return value


def source(source_id="src-1", snapshot_id="snap-1", **overrides):
    value = {
        "source_id": source_id,
        "snapshot_id": snapshot_id,
        "canonical_uri": f"https://example.org/{source_id}",
        "title": "Primary source",
        "media_type": "text/html",
        "language": "en",
        "published_at": "2026-09-01T00:00:00Z",
        "retrieved_at": "2026-09-15T00:00:00Z",
        "trust_class": "PRIMARY",
        "freshness_state": "CURRENT",
        "content_sha256": digest(f"raw:{source_id}:{snapshot_id}"),
        "byte_count": 123,
        "raw_artifact_ref": f"core-artifact:{source_id}:{snapshot_id}",
        "text_artifact_ref": f"core-text:{source_id}:{snapshot_id}",
        "text_sha256": digest(f"text:{source_id}:{snapshot_id}"),
        "extracted_text": "bounded untrusted source text",
        "etag": "etag-1",
        "last_modified": "2026-09-01T00:00:00Z",
        "cache_control": "max-age=300",
        "evidence_ref": f"research-evidence:{source_id}:{snapshot_id}",
        "provider_id": "connected-actions-browser-provider",
        "provider_request_ref": "provider-request-001",
        "attributes": {"publisher": "Example"},
    }
    value.update(overrides)
    return value


def admitted_classification(_token):
    return {
        "schema_ref": "CORE-DATA-CLASSIFICATION-001",
        "canonical_token": "PUBLIC",
        "external_research_eligible": True,
    }


def backend_with(*sources):
    return lambda _request: {"sources": list(sources)}


class ResearchKnowledgeSourceQueryTests(unittest.TestCase):
    def assert_code(self, expected, callable_):
        with self.assertRaises(rq.ResearchQueryError) as ctx:
            callable_()
        self.assertEqual(expected, ctx.exception.code)
        self.assertEqual("RESEARCH_KNOWLEDGE", ctx.exception.provider_system)
        self.assertEqual(rq.OPERATION_ID, ctx.exception.operation_id)

    def test_external_success_returns_provenance_projection_without_canonical_effect(self):
        result = rq.search_sources_with_provenance(
            request(),
            classification_validator=admitted_classification,
            backend=backend_with(source(), source("src-2", "snap-2")),
        )
        self.assertEqual("OK", result["status"])
        self.assertEqual(2, result["result_count"])
        self.assertFalse(result["canonical_effect_allowed"])
        self.assertFalse(result["direct_cross_peer_database_access"])
        self.assertEqual(rq.OPERATION_ID, result["operation_id"])

    def test_query_digest_mismatch_fails_closed(self):
        bad = request(query_sha256="0" * 64)
        self.assert_code(
            "INVALID_REQUEST",
            lambda: rq.search_sources_with_provenance(
                bad, classification_validator=admitted_classification, backend=backend_with()
            ),
        )

    def test_external_search_requires_book_authorization(self):
        bad = request(book_authorization_ref=None)
        self.assert_code(
            "INVALID_REQUEST",
            lambda: rq.search_sources_with_provenance(
                bad, classification_validator=admitted_classification, backend=backend_with()
            ),
        )

    def test_external_search_requires_core_classification_admission(self):
        def denied(_token):
            return {
                "schema_ref": "CORE-DATA-CLASSIFICATION-001",
                "canonical_token": "PRIVATE",
                "external_research_eligible": False,
            }

        self.assert_code(
            "CLASSIFICATION_NOT_ADMITTED",
            lambda: rq.search_sources_with_provenance(
                request(), classification_validator=denied, backend=backend_with()
            ),
        )

    def test_request_must_select_local_or_external_mode(self):
        bad = request(include_local=False, include_external=False)
        self.assert_code(
            "INVALID_REQUEST",
            lambda: rq.search_sources_with_provenance(
                bad, classification_validator=admitted_classification, backend=backend_with()
            ),
        )

    def test_missing_provider_provenance_fails_closed(self):
        bad_source = source()
        bad_source.pop("evidence_ref")
        self.assert_code(
            "SOURCE_PROVENANCE_INCOMPLETE",
            lambda: rq.search_sources_with_provenance(
                request(),
                classification_validator=admitted_classification,
                backend=backend_with(bad_source),
            ),
        )

    def test_text_artifact_requires_text_digest(self):
        bad_source = source(text_sha256=None)
        self.assert_code(
            "SOURCE_PROVENANCE_INCOMPLETE",
            lambda: rq.search_sources_with_provenance(
                request(),
                classification_validator=admitted_classification,
                backend=backend_with(bad_source),
            ),
        )

    def test_duplicate_source_snapshot_fails_closed(self):
        duplicate = source()
        self.assert_code(
            "SOURCE_PROVENANCE_INCOMPLETE",
            lambda: rq.search_sources_with_provenance(
                request(),
                classification_validator=admitted_classification,
                backend=backend_with(source(), duplicate),
            ),
        )

    def test_backend_failure_maps_to_provider_unavailable(self):
        def broken(_request):
            raise OSError("network unavailable")

        self.assert_code(
            "PROVIDER_UNAVAILABLE",
            lambda: rq.search_sources_with_provenance(
                request(), classification_validator=admitted_classification, backend=broken
            ),
        )

    def test_local_only_query_does_not_require_external_authorization_or_classification_call(self):
        calls = []

        def should_not_run(_token):
            calls.append(True)
            raise AssertionError("classification validator must not run for local-only query")

        result = rq.search_sources_with_provenance(
            request(include_external=False, include_local=True, book_authorization_ref=None),
            classification_validator=should_not_run,
            backend=backend_with(source()),
        )
        self.assertEqual(1, result["result_count"])
        self.assertEqual([], calls)

    def test_result_count_cannot_exceed_request_maximum(self):
        self.assert_code(
            "QUERY_BUDGET_EXHAUSTED",
            lambda: rq.search_sources_with_provenance(
                request(max_results=1, minimum_distinct_domains=1),
                classification_validator=admitted_classification,
                backend=backend_with(source(), source("src-2", "snap-2")),
            ),
        )

    def test_operation_identity_and_owner_boundary_are_exact(self):
        bad = request(operation_id="BOOK.RESEARCH.QUERY.SEARCH_SOURCES_WITH_PROVENANCE")
        self.assert_code(
            "INVALID_REQUEST",
            lambda: rq.search_sources_with_provenance(
                bad, classification_validator=admitted_classification, backend=backend_with()
            ),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
