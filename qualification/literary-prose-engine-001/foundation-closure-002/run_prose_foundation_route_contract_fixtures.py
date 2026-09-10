#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROSE_ROOT = HERE.parent
CONTRACT_PATH = HERE / "PROSE-FOUNDATION-ROUTE-CONTRACT-CLOSURE-002.json"
PARENT_BINDING_PATH = PROSE_ROOT / "PROSE-SYSTEM-PRODUCT-PARENT-BINDING-003.json"
CRAFT_CONTRACT_PATH = PROSE_ROOT / "step-d" / "CRAFT-KNOWLEDGE-DISTILLATION-CONTRACT-v1.json"
REVISION_CONTRACT_PATH = PROSE_ROOT / "step-h" / "CONTROLLED-REVISION-ENGINE-CONTRACT-v1.json"
REVISION_IMPL_PATH = PROSE_ROOT / "step-h" / "controlled_revision.py"


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_revision_module():
    spec = importlib.util.spec_from_file_location("prose_controlled_revision", REVISION_IMPL_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("unable to load controlled_revision.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assert_contract_shape(contract, parent, craft, revision):
    assert contract["artifact_id"] == "PROSE-FOUNDATION-ROUTE-CONTRACT-CLOSURE-002"
    rows = {row["requirement_or_capability_id"]: row for row in contract["route_rows"]}
    assert set(rows) == {"PROSE-PROSE-CRAFT-TRAINING", "PROSE-REVISION-INTELLIGENCE"}

    boundary = parent["parent_boundary"]
    assert boundary["may_self_admit_into_book_canonical_state"] is False
    assert boundary["qualified_outputs_require_book_admission_for_parent_canonical_effect"] is True

    craft_row = rows["PROSE-PROSE-CRAFT-TRAINING"]
    assert craft_row["self_admission_allowed"] is False
    assert craft_row["parent_admission_required_for_book_effect"] is True
    assert craft_row["api_surface"]["public_or_cross_system_api_claimed"] is False
    assert craft_row["event_surface"]["disposition"] == "NO_EVENT_BUS_CONTRACT_CLAIMED"

    revision_row = rows["PROSE-REVISION-INTELLIGENCE"]
    assert revision_row["self_admission_allowed"] is False
    assert revision_row["parent_admission_required_for_book_effect"] is True
    assert revision_row["publication_allowed"] is False
    assert revision_row["writer_self_adjudication_allowed"] is False
    assert revision_row["original_mutation_allowed"] is False
    assert revision_row["api_surface"]["public_or_cross_system_api_claimed"] is False

    assert craft["precedence"][0] == "protected_canon_and_intent"
    assert "named_author_imitation" in craft["forbidden"]
    assert "raw_text_reconstruction_from_derived_artifacts" in craft["forbidden"]
    assert revision["writer_self_adjudication_allowed"] is False
    assert revision["named_author_target_allowed"] is False
    assert revision["retain_original_default"] is True


def assert_no_direct_effect_primitives():
    source = REVISION_IMPL_PATH.read_text(encoding="utf-8")
    forbidden_tokens = [
        "open(",
        ".write_text(",
        ".write_bytes(",
        "subprocess",
        "requests.",
        "urllib.",
        "socket.",
        "os.remove(",
        "os.replace(",
        "shutil.",
    ]
    found = [token for token in forbidden_tokens if token in source]
    assert not found, f"direct effect primitive found in controlled_revision.py: {found}"


def base_state(revision_allowed=True):
    return {
        "identity": {"passage_id": "PFRC-TEST-001"},
        "readiness": {
            "status": "REVISION_STATE_READY" if revision_allowed else "DIAGNOSIS_ONLY",
            "revision_allowed": revision_allowed,
            "maximum_edit_scope": "SURGICAL" if revision_allowed else "NONE",
        },
        "preservation_state": {"explicit_challenge_authorization": False},
    }


def admitted_opportunity():
    return {
        "opportunity_id": "OP-001",
        "status": "ADMIT",
        "target_dimensions": ["precision"],
    }


def qualified_transform():
    return {
        "transform_id": "TR-001",
        "qualified": True,
        "scope_limit": "SURGICAL",
        "countercondition_active": False,
        "operation": "REPLACE_TOKEN",
        "fixture_parameters": {"from": "stood", "to": "remained"},
        "expected_effects": ["precision"],
        "preservation_obligations": ["canon", "intent", "voice"],
    }


def request(**extra):
    item = {
        "request_id": "REQ-001",
        "ambition_level": "LEVEL_1_SURGICAL",
        "opportunity_id": "OP-001",
        "transform_id": "TR-001",
        "preservation_flags": [],
        "review_flags": [],
    }
    item.update(extra)
    return item


def assert_blocked_state_preserves_original(module):
    original = "The gate stood open."
    result = module.generate_candidate_set(
        base_state(revision_allowed=False),
        original,
        [admitted_opportunity()],
        [qualified_transform()],
        [request()],
    )
    assert result["status"] == "BLOCKED_NEEDS_CONTEXT"
    assert len(result["candidates"]) == 1
    control = result["candidates"][0]
    assert control["candidate_text"] == original
    assert control["ambition_level"] == "LEVEL_0_NO_CHANGE"
    assert control["writer_quality_claim"] is None


def assert_success_has_zero_parent_authority(module):
    original = "The gate stood open."
    result = module.generate_candidate_set(
        base_state(revision_allowed=True),
        original,
        [admitted_opportunity()],
        [qualified_transform()],
        [request(self_admit=True, book_canonical_write=True, publish=True)],
    )
    assert result["status"] == "CANDIDATES_GENERATED_PENDING_INDEPENDENT_EVALUATION"
    assert len(result["candidates"]) == 2
    control, candidate = result["candidates"]
    assert original == "The gate stood open."
    assert control["candidate_text"] == original
    assert candidate["candidate_text"] == "The gate remained open."
    assert candidate["writer_quality_claim"] is None
    assert candidate["evaluation_status"] == "UNEVALUATED_PENDING_STEP_I"
    assert candidate["named_author_target"] is None
    forbidden_output_keys = {"self_admit", "book_canonical_write", "publish", "canonical_write", "promotion_authority"}
    assert forbidden_output_keys.isdisjoint(candidate.keys())
    assert forbidden_output_keys.isdisjoint(result.keys())


def assert_canon_conflict_rejects(module):
    original = "The gate stood open."
    result = module.generate_candidate_set(
        base_state(revision_allowed=True),
        original,
        [admitted_opportunity()],
        [qualified_transform()],
        [request(preservation_flags=["canon_conflict"])],
    )
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["candidate_text"] == original
    reasons = [item["reason"] for item in result["rejections"]]
    assert "HARD_PRESERVATION_FAILURE" in reasons


def assert_named_author_target_rejects(module):
    original = "The gate stood open."
    result = module.generate_candidate_set(
        base_state(revision_allowed=True),
        original,
        [admitted_opportunity()],
        [qualified_transform()],
        [request(named_author_target="Synthetic Named Author")],
    )
    assert len(result["candidates"]) == 1
    reasons = [item["reason"] for item in result["rejections"]]
    assert "NAMED_AUTHOR_TARGET_REJECTED" in reasons


def main():
    contract = load_json(CONTRACT_PATH)
    parent = load_json(PARENT_BINDING_PATH)
    craft = load_json(CRAFT_CONTRACT_PATH)
    revision = load_json(REVISION_CONTRACT_PATH)
    module = load_revision_module()

    checks = [
        ("contract_shape_and_parent_boundary", lambda: assert_contract_shape(contract, parent, craft, revision)),
        ("no_direct_effect_primitives", assert_no_direct_effect_primitives),
        ("blocked_state_preserves_original", lambda: assert_blocked_state_preserves_original(module)),
        ("successful_candidate_has_zero_parent_authority", lambda: assert_success_has_zero_parent_authority(module)),
        ("canon_conflict_rejects", lambda: assert_canon_conflict_rejects(module)),
        ("named_author_target_rejects", lambda: assert_named_author_target_rejects(module)),
    ]

    passed = []
    for name, check in checks:
        check()
        passed.append(name)
        print(f"PASS {name}")

    print(json.dumps({
        "objective_id": "PROSE-FOUNDATION-ROUTE-CONTRACT-CLOSURE-002",
        "status": "PASS",
        "checks_passed": len(passed),
        "checks_total": len(checks),
        "blind_labels_accessed": False,
        "private_material_accessed": False,
        "book_canonical_mutation": False,
        "revision_authority_granted": False,
        "passed": passed,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
