#!/usr/bin/env python3
import copy
import json
from pathlib import Path

from admission_controller import CorpusIndex, admit_source, assign_overlap_group, contains_prohibited_raw_field, contains_reconstructive_substring, passage_identity

ROOT = Path(__file__).resolve().parent
fixtures = json.loads((ROOT / "fixtures" / "step_b_cases.json").read_text(encoding="utf-8"))
index = CorpusIndex.empty()
errors = []
results = []

for case in fixtures["cases"]:
    result = admit_source(case["request"], case["content"], index)
    results.append({"case_id": case["case_id"], "decision": result["decision"], "reasons": result["decision_reasons"]})
    if result["decision"] != case["expect"]:
        errors.append(f"{case['case_id']}: expected {case['expect']} got {result['decision']}")
    if case["request"].get("rights_class") == "ANALYSIS_ONLY_NO_FULL_TEXT" and result["decision"] == "ADMIT_DERIVED_ONLY":
        if result["persistence"].get("raw_text_persisted"):
            errors.append(f"{case['case_id']}: analysis-only raw text persisted")
        if contains_prohibited_raw_field(result["persistence"]):
            errors.append(f"{case['case_id']}: prohibited raw field persisted")
        if contains_reconstructive_substring(case["content"], result["persistence"]):
            errors.append(f"{case['case_id']}: reconstructive source substring persisted")
        artifact = result["persistence"].get("derived_artifact", {})
        if artifact.get("rights_projection") != "DERIVED_ONLY_NONRECONSTRUCTIVE":
            errors.append(f"{case['case_id']}: wrong rights projection")
        if artifact.get("named_author_target") is not False:
            errors.append(f"{case['case_id']}: named-author target not disabled")
        if artifact.get("author_identity_feature_allowed") is not False:
            errors.append(f"{case['case_id']}: author identity feature not disabled")

# Exact duplicate: change locator, keep exact content. Payload identity must remain shared,
# while source identity/provenance may differ and retrieval weight must not multiply.
base = next(c for c in fixtures["cases"] if c["case_id"] == fixtures["duplicate_case"]["base_case_id"])
first_index = CorpusIndex.empty()
first = admit_source(base["request"], base["content"], first_index)
dup_request = copy.deepcopy(base["request"])
dup_request["ledger_id"] = "LRL-USERFIXTURE-002"
dup_request["identity_metadata"]["locator"] = fixtures["duplicate_case"]["second_locator"]
second = admit_source(dup_request, base["content"], first_index)
if first["dedup"]["payload_id"] != second["dedup"]["payload_id"]:
    errors.append("duplicate: exact bytes did not share payload")
if first["identity"]["source_id"] == second["identity"]["source_id"]:
    errors.append("duplicate: distinct provenance locator did not produce distinct source id")
if second["dedup"]["retrieval_weight_multiplier"] != 0:
    errors.append("duplicate: text-equivalent duplicate multiplied retrieval weight")
results.append({
    "case_id": "B-FIX-DEDUP-001",
    "decision": "PASS" if not any(e.startswith("duplicate:") for e in errors) else "FAIL",
    "shared_payload": first["dedup"]["payload_id"],
    "distinct_source_ids": first["identity"]["source_id"] != second["identity"]["source_id"],
    "second_weight_multiplier": second["dedup"]["retrieval_weight_multiplier"],
})

# Passage identity is deterministic and structural-locator-sensitive.
pid1 = passage_identity(first["identity"]["source_id"], "chapter-1:p1", base["content"][:60])
pid2 = passage_identity(first["identity"]["source_id"], "chapter-1:p1", base["content"][:60])
pid3 = passage_identity(first["identity"]["source_id"], "chapter-1:p2", base["content"][:60])
if pid1 != pid2:
    errors.append("passage-id: identical input was not deterministic")
if pid1["passage_id"] == pid3["passage_id"]:
    errors.append("passage-id: structural locator failed to differentiate identity")
results.append({"case_id": "B-FIX-PASSAGE-ID-001", "deterministic": pid1 == pid2, "locator_sensitive": pid1["passage_id"] != pid3["passage_id"]})

# Overlap grouping.
overlap_cfg = fixtures["overlap_case"]
grouped = assign_overlap_group(overlap_cfg["source_id_seed"], overlap_cfg["passages"])
by_id = {p["passage_id"]: p["overlap_group_id"] for p in grouped}
for a, b in overlap_cfg["expect_same_group"]:
    if by_id[a] != by_id[b]:
        errors.append(f"overlap: {a}/{b} expected same group")
for a, b in overlap_cfg["expect_different_group"]:
    if by_id[a] == by_id[b]:
        errors.append(f"overlap: {a}/{b} expected different groups")
results.append({"case_id": "B-FIX-OVERLAP-001", "groups": by_id})

standing = "PASS" if not errors else "FAIL"
evidence = {
    "qualification_id": "LITERARY-PROSE-ENGINE-001-STEP-B-FIXTURE-QUALIFICATION",
    "standing": standing,
    "fixture_count": len(fixtures["cases"]) + 3,
    "results": results,
    "errors": errors,
    "bulk_acquisition_performed": False,
    "external_book_text_used": False,
    "user_uploaded_book_text_persisted": False,
    "a01_required": False
}
(ROOT / "STEP-B-QUALIFICATION-EVIDENCE.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")

if errors:
    print("STEP-B FIXTURE QUALIFICATION: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("STEP-B FIXTURE QUALIFICATION: PASS")
print(f"Qualified {len(fixtures['cases']) + 3} cases: rights admission, custody, manuscript metadata, dedup, overlap, and derived-only boundaries.")
