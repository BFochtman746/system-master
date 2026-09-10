#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PACKET = HERE / "PROSE-FOUNDATION-FAILURE-SEMANTICS-AND-FIXTURE-PACKET-003.json"
STEP_H = ROOT / "step-h" / "controlled_revision.py"
STEP_K = ROOT / "step-k" / "overoptimization_defense.py"
STEP_J = ROOT / "step-j" / "voice_preference_learning.py"
PASSAGE_CONTRACT = ROOT / "step-e" / "PASSAGE-INTELLIGENCE-CONTRACT-v1.json"
PRESERVATION_CONTRACT = ROOT / "step-h" / "PRESERVATION-AUDIT-CONTRACT-v1.json"
PARENT_BINDING = ROOT / "PROSE-SYSTEM-PRODUCT-PARENT-BINDING-003.json"


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def state(allowed=True):
    return {
        "identity": {"passage_id": "PF003-PASSAGE-001"},
        "readiness": {
            "status": "REVISION_STATE_READY" if allowed else "BLOCKED_UNRESOLVED_CRITICAL_AUTHORITY",
            "revision_allowed": allowed,
            "maximum_edit_scope": "SURGICAL" if allowed else "NONE",
        },
        "preservation_state": {"explicit_challenge_authorization": False},
    }


def opportunity():
    return {"opportunity_id": "PF003-OP-001", "status": "ADMIT", "target_dimensions": ["precision"]}


def transform(to="remained"):
    return {
        "transform_id": f"PF003-TR-{to.upper()}",
        "qualified": True,
        "scope_limit": "SURGICAL",
        "countercondition_active": False,
        "operation": "REPLACE_TOKEN",
        "fixture_parameters": {"from": "stood", "to": to},
        "expected_effects": ["precision"],
        "preservation_obligations": ["canon", "protected_language", "authorial_intent", "voice_identity"],
    }


def request(flags=None, review=None, transform_id=None):
    return {
        "request_id": "PF003-REQ-001",
        "ambition_level": "LEVEL_1_SURGICAL",
        "opportunity_id": "PF003-OP-001",
        "transform_id": transform_id or "PF003-TR-REMAINED",
        "preservation_flags": list(flags or []),
        "review_flags": list(review or []),
    }


def base_metrics():
    return {
        "lexical_diversity": 0.72,
        "sentence_length_cv": 0.55,
        "rhetorical_top_share": 0.22,
        "metaphor_distinctiveness": 0.70,
        "dialogue_voice_separation": 0.80,
        "irregularity_retention": 0.85,
        "register_baseline_distance": 0.08,
        "cross_project_voice_similarity": 0.35,
        "generic_prestige_similarity": 0.30,
    }


def defense_case(candidate=None):
    baseline = base_metrics()
    control = dict(baseline)
    holdout = dict(baseline)
    candidate_metrics = dict(baseline if candidate is None else candidate)
    return {
        "project_id": "PF003-PROJECT",
        "baseline_metrics": baseline,
        "candidate_metrics": candidate_metrics,
        "clean_control_metrics": control,
        "project_holdout_metrics": holdout,
        "edit_budget": {"used": 1, "allowed": 3},
        "optimization_history": [],
        "protected_irregularity": True,
    }


def accept_event():
    return {
        "event_id": "PF003-EVT-001",
        "project_id": "PF003-PROJECT",
        "sequence": 1,
        "occurred_at": "2026-09-10T12:00:00+00:00",
        "event_type": "USER_ACCEPT_CANDIDATE",
        "authority": "USER_ACTION",
        "dimension": "cadence",
        "direction": "retain_varied_cadence",
        "context": {"genre": "synthetic_fixture"},
        "subject_digest": "0123456789abcdef",
        "evidence_refs": ["synthetic:PF003"],
    }


def revoke_event():
    return {
        "event_id": "PF003-EVT-002",
        "project_id": "PF003-PROJECT",
        "sequence": 2,
        "occurred_at": "2026-09-10T12:01:00+00:00",
        "event_type": "USER_REVOKE_EVENT",
        "authority": "USER_EXPLICIT",
        "dimension": "cadence",
        "direction": "revoke_prior_preference",
        "context": {"genre": "synthetic_fixture"},
        "subject_digest": "fedcba9876543210",
        "evidence_refs": ["synthetic:PF003:revocation"],
        "revoked_event_id": "PF003-EVT-001",
    }


def main():
    packet = load_json(PACKET)
    passage = load_json(PASSAGE_CONTRACT)
    preservation = load_json(PRESERVATION_CONTRACT)
    parent = load_json(PARENT_BINDING)
    h = load_module("pf003_h", STEP_H)
    k = load_module("pf003_k", STEP_K)
    j = load_module("pf003_j", STEP_J)

    results = []

    def check(name, fn):
        fn()
        results.append(name)
        print(f"PASS {name}")

    def contract_alignment():
        assert packet["subject_row"] == "PROSE-VOICE-CANON-INTENT-PROTECTED-LANGUAGE-PRESERVATION"
        assert passage["rules"]["revision_with_unresolved_critical_authority"] is False
        assert passage["rules"]["diagnosis_may_proceed_with_partial_context"] is True
        assert "canon" in preservation["hard_reject_dimensions"]
        assert "protected_language" in preservation["hard_reject_dimensions"]
        assert "authorial_intent" in preservation["hard_reject_dimensions"]
        assert "voice_identity" in preservation["review_dimensions"]
        assert parent["parent_boundary"]["may_self_admit_into_book_canonical_state"] is False

    def unresolved_authority_retains_original():
        original = "The gate stood open."
        out = h.generate_candidate_set(state(False), original, [opportunity()], [transform()], [request()])
        assert out["status"] == "BLOCKED_NEEDS_CONTEXT"
        assert len(out["candidates"]) == 1
        assert out["candidates"][0]["candidate_text"] == original

    def hard_conflict_replay(flag):
        original = "The gate stood open."
        args = (state(True), original, [opportunity()], [transform()], [request(flags=[flag])])
        first = h.generate_candidate_set(*args)
        second = h.generate_candidate_set(*args)
        assert first == second
        assert len(first["candidates"]) == 1
        assert first["candidates"][0]["candidate_text"] == original
        assert any(r["reason"] == "HARD_PRESERVATION_FAILURE" for r in first["rejections"])

    def review_flag_no_self_pass():
        original = "The gate stood open."
        out = h.generate_candidate_set(state(True), original, [opportunity()], [transform()], [request(review=["voice_identity"])])
        candidate = out["candidates"][1]
        assert candidate["pre_evaluation_preservation"]["status"] == "NO_HARD_FAILURE_DETECTED"
        assert candidate["pre_evaluation_preservation"]["review_flags"] == ["voice_identity"]
        assert candidate["writer_quality_claim"] is None
        assert candidate["evaluation_status"] == "UNEVALUATED_PENDING_STEP_I"

    def exact_replay_is_deterministic():
        original = "The gate stood open."
        args = (state(True), original, [opportunity()], [transform()], [request()])
        first = h.generate_candidate_set(*args)
        second = h.generate_candidate_set(*args)
        assert first == second
        assert first["candidates"][1]["candidate_id"] == second["candidates"][1]["candidate_id"]

    def changed_subject_changes_identity():
        first = h.generate_candidate_set(state(True), "The gate stood open.", [opportunity()], [transform()], [request()])
        tr2 = transform("waited")
        second = h.generate_candidate_set(state(True), "The gate stood open.", [opportunity()], [tr2], [request(transform_id=tr2["transform_id"])])
        assert first["candidates"][1]["candidate_id"] != second["candidates"][1]["candidate_id"]
        assert first["candidates"][1]["candidate_text"] != second["candidates"][1]["candidate_text"]

    def step_k_missing_evidence_fails_closed():
        case = defense_case()
        del case["project_holdout_metrics"]
        try:
            k.assess(case)
        except ValueError as exc:
            assert str(exc).startswith("PROJECT_HOLDOUT_METRICS_REQUIRED")
        else:
            raise AssertionError("missing holdout evidence did not fail closed")

    def step_k_hard_risk_rejects():
        candidate = base_metrics()
        candidate["dialogue_voice_separation"] = 0.20
        out = k.assess(defense_case(candidate))
        assert out["disposition"] == "REJECT_OVEROPTIMIZATION"
        assert "DIALOGUE_VOICE_COLLAPSE" in out["hard_risks"]

    def step_k_replay_is_deterministic():
        case = defense_case()
        first = k.assess(case)
        second = k.assess(case)
        assert first == second
        assert first["assessment_id"] == second["assessment_id"]

    def duplicate_preference_rejected_without_mutation():
        event = accept_event()
        base = []
        ledger = j.append_event(base, event)
        snapshot = json.loads(json.dumps(ledger))
        try:
            j.append_event(ledger, event)
        except ValueError as exc:
            assert str(exc) == "DUPLICATE_EVENT_ID"
        else:
            raise AssertionError("duplicate event was accepted")
        assert ledger == snapshot
        assert base == []

    def append_only_revocation_preserves_history():
        ledger1 = j.append_event([], accept_event())
        state1 = j.derive_state(ledger1)
        assert state1["current_preference"]
        ledger1_snapshot = json.loads(json.dumps(ledger1))
        ledger2 = j.append_event(ledger1, revoke_event())
        state2 = j.derive_state(ledger2)
        assert ledger1 == ledger1_snapshot
        assert len(ledger2) == 2
        assert state2["current_preference"] == {}
        assert state2["revoked_event_ids"] == ["PF003-EVT-001"]
        assert state2["history_digest"] != state1["history_digest"]
        assert state2["event_count"] == 2

    def no_direct_effect_primitives():
        forbidden = ["subprocess", "requests.", "urllib.", "socket.", "os.remove(", "os.replace(", "shutil.", ".write_text(", ".write_bytes("]
        for path in (STEP_H, STEP_K, STEP_J):
            source = path.read_text(encoding="utf-8")
            found = [token for token in forbidden if token in source]
            assert not found, f"direct effect primitive in {path.name}: {found}"

    check("contract_alignment", contract_alignment)
    check("unresolved_authority_retains_original", unresolved_authority_retains_original)
    check("canon_conflict_replay_fails_closed", lambda: hard_conflict_replay("canon_conflict"))
    check("protected_language_conflict_replay_fails_closed", lambda: hard_conflict_replay("protected_language_conflict"))
    check("authorial_intent_conflict_replay_fails_closed", lambda: hard_conflict_replay("authorial_intent_conflict"))
    check("review_flag_no_self_pass", review_flag_no_self_pass)
    check("exact_replay_is_deterministic", exact_replay_is_deterministic)
    check("changed_subject_changes_identity", changed_subject_changes_identity)
    check("step_k_missing_evidence_fails_closed", step_k_missing_evidence_fails_closed)
    check("step_k_hard_risk_rejects", step_k_hard_risk_rejects)
    check("step_k_replay_is_deterministic", step_k_replay_is_deterministic)
    check("duplicate_preference_rejected_without_mutation", duplicate_preference_rejected_without_mutation)
    check("append_only_revocation_preserves_history", append_only_revocation_preserves_history)
    check("no_direct_effect_primitives", no_direct_effect_primitives)

    print(json.dumps({
        "objective_id": packet["objective_id"],
        "status": "PASS",
        "checks_passed": len(results),
        "checks_total": 14,
        "blind_labels_accessed": False,
        "private_material_accessed": False,
        "book_canonical_mutation": False,
        "publication_action": False,
        "revision_authority_granted": False,
        "unchanged_input_replay_deterministic": True,
        "rollback_append_only": True,
        "passed": results,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
