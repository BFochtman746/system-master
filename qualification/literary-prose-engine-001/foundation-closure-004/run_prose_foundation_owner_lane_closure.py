#!/usr/bin/env python3
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def load(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    closure = load(HERE / "PROSE-FOUNDATION-OWNER-LANE-CLOSURE-004.json")
    census = load(ROOT / "PROSE-FOUNDATION-CLOSURE-CENSUS-CHECKPOINT-001.json")
    route = load(ROOT / "foundation-closure-002" / "PROSE-FOUNDATION-ROUTE-CONTRACT-CLOSURE-002-RECEIPT.json")
    failure = load(ROOT / "foundation-closure-003" / "PROSE-FOUNDATION-FAILURE-SEMANTICS-AND-FIXTURE-PACKET-003-RECEIPT.json")
    parent = load(ROOT / "PROSE-SYSTEM-PRODUCT-PARENT-BINDING-003.json")
    state15 = load(ROOT / "LITERARY-PROSE-CONSOLIDATED-WORKSTREAM-STATE-015.json")

    checks = []
    def ok(name, condition):
        assert condition, name
        checks.append(name)
        print(f"PASS {name}")

    summary = census["summary"]
    ok("census_has_seven_rows", summary["rows"] == 7 and len(census["rows"]) == 7)
    ok("five_rows_complete", summary["complete_with_evidence"] == 5)
    ok("zero_active_gaps", summary["active_gap"] == 0)
    ok("one_durable_blocker", summary["durably_blocked"] == 1)
    ok("one_explicit_out_of_scope_owner", summary["explicitly_out_of_scope"] == 1)
    ok("owner_lane_complete_not_global", summary["prose_owner_lane_census_complete"] is True and summary["global_foundation_closed"] is False)

    states = {row["requirement_or_capability_id"]: row["current_state"] for row in census["rows"]}
    ok("book_evaluator_blocker_preserved", states["PROSE-BOOK-EVALUATOR"] == "DURABLY_BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE")
    ok("book_write_boundary_out_of_scope", states["PROSE-PARENT-CANONICAL-WRITE-BOUNDARY"] == "EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY")
    ok("all_five_prose_rows_complete", all(states[key] == "COMPLETE_WITH_EVIDENCE" for key in closure["completed_foundation_capabilities"]))

    ok("route_002_hosted_pass", route["standing"] == "HOSTED_PASS__FOUNDATION_ROUTE_AND_PARENT_BOUNDARY_CLOSED" and route["result"]["checks_passed"] == 6)
    ok("failure_003_hosted_pass", failure["standing"] == "HOSTED_PASS__PRESERVATION_FAILURE_RETRY_IDEMPOTENCY_ROLLBACK_SEMANTICS_CLOSED" and failure["result"]["checks_passed"] == 14)
    ok("no_authority_escalation_002", route["authority_results"]["book_canonical_mutation"] is False and route["authority_results"]["revision_authority_granted"] is False)
    ok("no_authority_escalation_003", failure["authority_results"]["book_canonical_mutation"] is False and failure["authority_results"]["revision_authority_granted"] is False)

    boundary = parent["parent_boundary"]
    ok("parent_write_boundary_preserved", boundary["may_self_admit_into_book_canonical_state"] is False and boundary["qualified_outputs_require_book_admission_for_parent_canonical_effect"] is True)
    ok("blind_successor_identity_preserved", state15["remaining_gate"]["objective"] == "PROSE-REAL-LIMITATION-BLIND-MODEL-SCORING-001")
    ok("blind_branch_preserved", state15["remaining_gate"]["execution_branch"] == "literary-prose-blind-eval-001")
    ok("revision_authority_zero_preserved", state15["authority_boundaries"]["candidate_generation_authorized"] is False and state15["authority_boundaries"]["manuscript_mutation_authorized"] is False)

    ok("closure_counts_match_census", closure["counts"]["rows"] == 7 and closure["counts"]["complete_with_evidence"] == 5 and closure["counts"]["active_gap"] == 0)
    ok("global_foundation_nonclaim_explicit", "No global System Master Foundation 1.0 closure is claimed." in closure["preserved_nonclaims"])
    ok("no_more_current_context_packet", "Do not create another current-context Prose foundation packet." in closure["next_dependency_valid_action"])

    print(json.dumps({
        "objective": "PROSE-FOUNDATION-OWNER-LANE-CLOSURE-004",
        "status": "PASS",
        "checks_passed": len(checks),
        "checks_total": 20,
        "active_safe_foundation_gaps": 0,
        "durable_fresh_context_blockers": 1,
        "global_foundation_closed": False,
        "blind_labels_accessed": False,
        "private_material_accessed": False,
        "book_canonical_mutation": False,
        "passed": checks
    }, sort_keys=True))


if __name__ == "__main__":
    main()
