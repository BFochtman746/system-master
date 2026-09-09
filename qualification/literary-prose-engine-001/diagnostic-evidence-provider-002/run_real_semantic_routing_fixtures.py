#!/usr/bin/env python3
"""Execute nine real-derived nonreconstructive semantic cases through the qualified route.

This is a routing/authority qualification, not a semantic-accuracy evaluation. The
fixture contains coded hypotheses and digests only. Every case must validate, reach
Passage Intelligence and Step-F diagnostics, preserve model hypotheses as hypotheses,
and retain zero revision authority without trusted author/canon/protected-language
inputs.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURE_PATH = HERE / "fixtures" / "REAL-SEMANTIC-ROUTING-FIXTURES-v1.json"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


VALIDATOR = _load("semantic_evidence_validator", HERE / "semantic_evidence_validator.py")
ADAPTER = _load("semantic_to_diagnostic_adapter", HERE / "semantic_to_diagnostic_adapter.py")


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def _packet(case):
    source_id = case["source_id"]
    digest = case["passage_digest"]
    anchor = [{"locator_id": f"{source_id}:PASSAGE", "sha256": digest}]
    claims = []
    for i, row in enumerate(case.get("claims") or [], start=1):
        field, value_code, confidence = row
        claims.append({
            "claim_id": f"{source_id}:CLAIM:{i}",
            "field": field,
            "value_code": value_code,
            "confidence": confidence,
            "authority_status": "MODEL_HYPOTHESIS",
            "evidence_anchors": anchor,
        })
    cadence_code, cadence_confidence = case["cadence"]
    signals = [{
        "evidence_id": f"{source_id}:CADENCE",
        "specialist_id": "PACKET_012_PROSE_CRAFT",
        "dimension": "CADENCE_INTENT",
        "finding_type": "OBSERVATION",
        "claim_code": cadence_code,
        "confidence": cadence_confidence,
        "evidence_anchors": anchor,
    }]
    return {
        "provider_id": "CHATGPT_PROSE_PRIVATE_PILOT_ROUTING_FIXTURE_v1",
        "provider_kind": "MODEL",
        "source_id": source_id,
        "passage_digest": digest,
        "passage_state_claims": claims,
        "diagnostic_signals": signals,
        "revision_authorized": False,
        "named_author_target": False,
    }


def main():
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    check(fixture.get("raw_prose_present") is False, "fixture raw prose boundary violated")
    check(fixture.get("candidate_prose_present") is False, "fixture candidate prose boundary violated")
    cases = fixture.get("cases") or []
    check(len(cases) == 9, f"expected 9 cases, got {len(cases)}")

    results = []
    unresolved_claims = 0
    for case in cases:
        packet = _packet(case)
        validated = VALIDATOR.validate(packet)
        source_id = case["source_id"]
        check(validated["standing"] == "PASS", f"{source_id}: semantic validation failed: {validated['errors']}")
        normalized = validated["normalized"]
        unresolved_claims += sum(1 for c in normalized["passage_state_claims"] if c["disposition"] == "UNRESOLVED")

        routed = ADAPTER.run_governed_diagnostics(normalized, requested_scope="SURGICAL")
        check(routed["diagnosis_allowed"] is True, f"{source_id}: diagnosis unexpectedly blocked")
        check(routed["revision_allowed"] is False, f"{source_id}: revision authority leaked")
        check(routed["model_hypotheses_promoted_to_authority"] is False, f"{source_id}: model authority escalation")
        check(routed["revision_text_generated"] is False, f"{source_id}: revision text generated")
        check(routed["manuscript_mutated"] is False, f"{source_id}: manuscript mutation")
        check(routed["adjudication"]["status"] == "NO_ACTION", f"{source_id}: observation created revision opportunity")
        check(len(routed["findings"]) == 1, f"{source_id}: cadence diagnostic did not route")
        finding = routed["findings"][0]
        check(finding["finding_type"] == "OBSERVATION", f"{source_id}: semantic observation escalated to defect")
        missing = set(routed["passage_state"]["readiness"].get("missing_authorities") or [])
        check("protected_language" in missing, f"{source_id}: protected-language authority unexpectedly satisfied")
        check("canon_facts" in missing, f"{source_id}: canon authority unexpectedly satisfied")

        if source_id == "MOSES_I_CH17":
            check(routed["passage_state"]["voice_state"].get("book_voice") is None, "low-confidence Moses voice claim was promoted")

        results.append({
            "source_id": source_id,
            "validation": validated["standing"],
            "diagnosis_allowed": routed["diagnosis_allowed"],
            "revision_allowed": routed["revision_allowed"],
            "finding_type": finding["finding_type"],
            "adjudication": routed["adjudication"]["status"],
            "missing_authorities": sorted(missing),
        })

    check(unresolved_claims == 1, f"expected exactly one low-confidence abstention, got {unresolved_claims}")
    summary = {
        "objective": "PROSE-REAL-SEMANTIC-DIAGNOSTIC-ROUTING-001",
        "fixture_id": fixture["fixture_id"],
        "case_count": len(results),
        "semantic_validation_pass": sum(r["validation"] == "PASS" for r in results),
        "diagnosis_allowed_count": sum(r["diagnosis_allowed"] for r in results),
        "revision_allowed_count": sum(r["revision_allowed"] for r in results),
        "observation_finding_count": sum(r["finding_type"] == "OBSERVATION" for r in results),
        "no_action_count": sum(r["adjudication"] == "NO_ACTION" for r in results),
        "unresolved_low_confidence_claims": unresolved_claims,
        "raw_prose_present": False,
        "candidate_prose_present": False,
        "revision_text_generated": False,
        "manuscript_mutated": False,
        "semantic_accuracy_claimed": False,
        "revision_superiority_claimed": False,
        "standing": "PASS__NINE_REAL_DERIVED_CASES_ROUTE_TO_DIAGNOSIS__ZERO_REVISION_AUTHORITY",
    }
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
