#!/usr/bin/env python3
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("adapter", HERE / "semantic_to_diagnostic_adapter.py")
adapter = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(adapter)


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


A = [{"locator_id": "P1-Q1", "sha256": "b" * 64}]
packet = {
    "provider_id": "MODEL-X",
    "provider_kind": "MODEL",
    "source_id": "S1",
    "passage_digest": "a" * 64,
    "raw_text_present": False,
    "candidate_text_present": False,
    "passage_state_claims": [
        {"claim_id": "C1", "field": "scene_or_chapter_function", "value_code": "CONFLICT_ESCALATION", "confidence": 0.91, "authority_status": "MODEL_HYPOTHESIS", "evidence_anchors": A, "disposition": "ADMIT_HYPOTHESIS"},
        {"claim_id": "C2", "field": "pov", "value_code": "THIRD_PERSON_CLOSE", "confidence": 0.88, "authority_status": "MODEL_HYPOTHESIS", "evidence_anchors": A, "disposition": "ADMIT_HYPOTHESIS"},
        {"claim_id": "C3", "field": "focalization", "value_code": "CHARACTER_A_INTERNAL", "confidence": 0.87, "authority_status": "MODEL_HYPOTHESIS", "evidence_anchors": A, "disposition": "ADMIT_HYPOTHESIS"},
        {"claim_id": "C4", "field": "pacing_target", "value_code": "ESCALATING", "confidence": 0.84, "authority_status": "MODEL_HYPOTHESIS", "evidence_anchors": A, "disposition": "ADMIT_HYPOTHESIS"},
        {"claim_id": "C5", "field": "book_voice", "value_code": "BOOK_LOCAL_VOICE", "confidence": 0.59, "authority_status": "MODEL_HYPOTHESIS", "evidence_anchors": A, "disposition": "UNRESOLVED"}
    ],
    "diagnostic_signals": [
        {"evidence_id": "E1", "specialist_id": "PACKET_012_PROSE_CRAFT", "dimension": "CADENCE_INTENT", "finding_type": "OBSERVATION", "claim_code": "MEASURED_PATTERN", "confidence": 0.88, "evidence_class": "MODEL_SEMANTIC_HYPOTHESIS", "evidence_anchors": A, "disposition": "ADMIT_OBSERVATION", "opportunity_id": None},
        {"evidence_id": "E2", "specialist_id": "THEME_SUBTEXT_MOTIF_v1", "dimension": "THEME_HYPOTHESIS", "finding_type": "OBSERVATION", "claim_code": "POSSIBLE_THEME_CLUSTER", "confidence": 0.72, "evidence_class": "MODEL_SEMANTIC_HYPOTHESIS", "evidence_anchors": A, "disposition": "ADMIT_OBSERVATION", "opportunity_id": None}
    ]
}

# Model hypotheses enable diagnosis but cannot satisfy canon/protected-language authority.
r = adapter.run_governed_diagnostics(packet, requested_scope="SURGICAL")
check(r["diagnosis_allowed"] is True, "diagnosis should remain allowed")
check(r["revision_allowed"] is False, "revision must remain blocked without protected/canon authority")
missing = set(r["passage_state"]["readiness"]["missing_authorities"])
check("protected_language" in missing and "canon_facts" in missing, "missing trusted authorities not preserved")
check(r["passage_state"]["voice_state"]["book_voice"] is None, "unresolved model claim was promoted")
check(r["model_hypotheses_promoted_to_authority"] is False, "model authority escalation")

# Semantic signals remain observations and do not create revision opportunities.
check(len(r["findings"]) == 2, "diagnostic observations not routed")
check(all(x["finding_type"] == "OBSERVATION" for x in r["findings"]), "semantic observation became defect")
check(r["adjudication"]["status"] == "NO_ACTION", "provider observation created revision opportunity")
check(r["revision_text_generated"] is False and r["manuscript_mutated"] is False, "adapter crossed mutation boundary")

# Trusted external authority can satisfy SURGICAL preservation prerequisites, but absence of a proven opportunity still means NO_ACTION.
r2 = adapter.run_governed_diagnostics(packet, trusted_authority={"protected_language": ["PROTECTED"], "canon_facts": ["CANON_BOUND"]}, requested_scope="SURGICAL")
check(r2["passage_state"]["readiness"]["status"] == "NO_ACTION", "trusted authority should permit state readiness then retain original when no opportunity exists")
check(r2["revision_allowed"] is False, "NO_ACTION should not authorize revision")
check(r2["adjudication"]["status"] == "NO_ACTION", "no opportunity should remain no-action")

# NONE scope is explicitly diagnosis-only.
r3 = adapter.run_governed_diagnostics(packet, requested_scope="NONE")
check(r3["passage_state"]["readiness"]["status"] == "NO_ACTION", "NONE scope should remain no-action")
check(r3["diagnosis_allowed"] is True and r3["revision_allowed"] is False, "NONE scope authority wrong")

print("PASS: 15/15 semantic-to-diagnostic bridge assertions")
