import json
from voice_preference_learning import append_event, derive_state

BASE_TIME = "2026-09-09T00:{:02d}:00+00:00"


def event(seq, typ, dimension="sentence_rhythm", direction="MORE_VARIATION", context=None, authority=None, **extra):
    authorities = {
        "USER_EXPLICIT_PREFERENCE": "USER_EXPLICIT", "USER_IDENTITY_INVARIANT": "USER_EXPLICIT", "USER_REVOKE_EVENT": "USER_EXPLICIT",
        "USER_ACCEPT_CANDIDATE": "USER_ACTION", "USER_REJECT_CANDIDATE": "USER_ACTION", "USER_RETAIN_ORIGINAL": "USER_ACTION", "USER_MODIFIED_CANDIDATE": "USER_ACTION",
        "STEP_I_ACCEPT_CANDIDATE": "STEP_I_QUALIFIED", "STEP_I_RETAIN_ORIGINAL": "STEP_I_QUALIFIED"
    }
    out = {
        "event_id": f"E{seq:03d}", "project_id": "P1", "sequence": seq, "occurred_at": BASE_TIME.format(seq),
        "event_type": typ, "authority": authority or authorities[typ], "dimension": dimension, "direction": direction,
        "context": context or {"scene_function": "DIALOGUE"}, "subject_digest": f"sha256:{seq:064d}", "evidence_refs": [f"EV-{seq}"]
    }
    out.update(extra)
    return out


def add_all(events):
    ledger = []
    for e in events:
        ledger = append_event(ledger, e)
    return ledger


def expect_error(name, events, error):
    try:
        add_all(events)
        return {"case_id": name, "pass": False, "detail": "NO_ERROR"}
    except ValueError as exc:
        return {"case_id": name, "pass": str(exc).startswith(error), "detail": str(exc)}


results = []


def check(name, cond, detail):
    results.append({"case_id": name, "pass": bool(cond), "detail": detail})


ledger = add_all([event(1, "USER_EXPLICIT_PREFERENCE")]); state = derive_state(ledger)
key = next(iter(state["current_preference"]))
check("explicit_preference_current", state["current_preference"][key]["direction"] == "MORE_VARIATION", state["current_preference"][key])
check("single_preference_not_stable_identity", state["stable_identity"] == {}, state["stable_identity"])

ledger = add_all([event(1, "STEP_I_ACCEPT_CANDIDATE", direction="LEANER"), event(2, "USER_ACCEPT_CANDIDATE", direction="RICHER")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("user_action_outranks_step_i", state["current_preference"][key]["direction"] == "RICHER", state["current_preference"][key])

ledger = add_all([event(1, "USER_EXPLICIT_PREFERENCE", direction="SPARE"), event(2, "USER_ACCEPT_CANDIDATE", direction="ORNATE"), event(3, "STEP_I_ACCEPT_CANDIDATE", direction="ORNATE"), event(4, "STEP_I_ACCEPT_CANDIDATE", direction="ORNATE")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("frequency_does_not_override_explicit_user", state["current_preference"][key]["direction"] == "SPARE" and state["frequency_used_as_quality"] is False, state["current_preference"][key])

ledger = add_all([event(1, "USER_EXPLICIT_PREFERENCE", direction="SPARE"), event(2, "USER_EXPLICIT_PREFERENCE", direction="RICHER")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("later_explicit_preference_updates_current", state["current_preference"][key]["direction"] == "RICHER", state["current_preference"][key])

ledger = add_all([event(1, "USER_IDENTITY_INVARIANT", direction="CLOSE_POV")]); state = derive_state(ledger); key = next(iter(state["stable_identity"]))
check("explicit_identity_creates_stable_identity", state["stable_identity"][key]["direction"] == "CLOSE_POV", state["stable_identity"][key])

results.append(expect_error("identity_change_requires_supersession", [event(1, "USER_IDENTITY_INVARIANT", direction="CLOSE_POV"), event(2, "USER_IDENTITY_INVARIANT", direction="DISTANT_POV")], "IDENTITY_REDEFINITION_REQUIRES_EXPLICIT_SUPERSESSION"))
ledger = add_all([event(1, "USER_IDENTITY_INVARIANT", direction="CLOSE_POV"), event(2, "USER_IDENTITY_INVARIANT", direction="DISTANT_POV", supersedes_event_id="E001")]); state = derive_state(ledger); key = next(iter(state["stable_identity"]))
check("explicit_identity_supersession_preserves_history", state["stable_identity"][key]["direction"] == "DISTANT_POV" and state["event_count"] == 2, state["stable_identity"][key])

ledger = add_all([event(1, "USER_REJECT_CANDIDATE", direction="ORNATE")]); state = derive_state(ledger)
check("reject_populates_rejected_direction", len(state["rejected_direction"]) == 1, state["rejected_direction"])
ledger = append_event(ledger, event(2, "USER_ACCEPT_CANDIDATE", direction="ORNATE")); state = derive_state(ledger)
check("later_user_accept_clears_active_reject_but_keeps_history", len(state["rejected_direction"]) == 0 and len(state["rejection_history"]) == 1, state["rejection_history"])

ledger = add_all([event(1, "USER_EXPLICIT_PREFERENCE", direction="SPARE", context={"scene_function": "DIALOGUE"}), event(2, "USER_EXPLICIT_PREFERENCE", direction="LUSH", context={"scene_function": "DESCRIPTION"})]); state = derive_state(ledger)
check("context_specific_preferences_do_not_globalize", len(state["current_preference"]) == 2, [x["direction"] for x in state["current_preference"].values()])

ledger = add_all([event(1, "STEP_I_ACCEPT_CANDIDATE", direction="SPARE"), event(2, "USER_MODIFIED_CANDIDATE", direction="SPARE_BUT_WARMER")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("user_modified_result_governs_over_step_i", state["current_preference"][key]["direction"] == "SPARE_BUT_WARMER", state["current_preference"][key])

ledger = add_all([event(1, "USER_RETAIN_ORIGINAL", direction="RETAIN_ORIGINAL")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("retain_original_is_learning_evidence", state["current_preference"][key]["direction"] == "RETAIN_ORIGINAL", state["current_preference"][key])

results.append(expect_error("duplicate_event_id_rejected", [event(1, "USER_ACCEPT_CANDIDATE"), {**event(2, "USER_ACCEPT_CANDIDATE"), "event_id": "E001"}], "DUPLICATE_EVENT_ID"))
results.append(expect_error("non_monotonic_sequence_rejected", [event(2, "USER_ACCEPT_CANDIDATE"), event(1, "USER_ACCEPT_CANDIDATE")], "NON_MONOTONIC_SEQUENCE"))
e1 = event(1, "USER_ACCEPT_CANDIDATE"); e2 = event(2, "USER_ACCEPT_CANDIDATE"); e2["occurred_at"] = "2026-09-08T23:59:00+00:00"
results.append(expect_error("non_monotonic_time_rejected", [e1, e2], "NON_MONOTONIC_TIME"))
raw = event(1, "USER_ACCEPT_CANDIDATE"); raw["candidate_text"] = "DO NOT STORE"
results.append(expect_error("raw_text_field_rejected", [raw], "RAW_TEXT_FIELD_FORBIDDEN"))
named = event(1, "USER_EXPLICIT_PREFERENCE"); named["named_author_target"] = "Named Author"
results.append(expect_error("named_author_target_rejected", [named], "NAMED_AUTHOR_TARGET_REJECTED"))
results.append(expect_error("wrong_authority_rejected", [event(1, "USER_ACCEPT_CANDIDATE", authority="STEP_I_QUALIFIED")], "AUTHORITY_EVENT_TYPE_MISMATCH"))
other = event(2, "USER_ACCEPT_CANDIDATE"); other["project_id"] = "P2"
results.append(expect_error("project_boundary_rejected", [event(1, "USER_ACCEPT_CANDIDATE"), other], "PROJECT_BOUNDARY_MISMATCH"))

bad_revoke = event(1, "USER_REVOKE_EVENT", direction="REVOKE", revoked_event_id="NOPE")
results.append(expect_error("invalid_revoke_target_rejected", [bad_revoke], "INVALID_REVOKE_TARGET"))
ledger = add_all([event(1, "STEP_I_ACCEPT_CANDIDATE", direction="LEAN"), event(2, "USER_EXPLICIT_PREFERENCE", direction="LUSH"), event(3, "USER_REVOKE_EVENT", dimension="sentence_rhythm", direction="REVOKE", revoked_event_id="E002")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("revocation_preserves_history_and_restores_fallback", state["current_preference"][key]["direction"] == "LEAN" and state["event_count"] == 3 and state["revoked_event_ids"] == ["E002"], state)

state2 = derive_state(ledger)
check("deterministic_replay", state == state2, state["history_digest"])

ledger = add_all([event(1, "USER_EXPLICIT_PREFERENCE", direction="SPARE")] + [event(i, "STEP_I_ACCEPT_CANDIDATE", direction="ORNATE") for i in range(2, 10)]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("many_system_wins_do_not_become_quality_vote", state["current_preference"][key]["direction"] == "SPARE" and state["event_type_counts"]["STEP_I_ACCEPT_CANDIDATE"] == 8, state["current_preference"][key])

ledger = add_all([event(1, "USER_ACCEPT_CANDIDATE", direction="MORE_SUBTEXT"), event(2, "STEP_I_ACCEPT_CANDIDATE", direction="MORE_EXPLICIT")]); state = derive_state(ledger); key = next(iter(state["current_preference"]))
check("conflicting_lower_signal_exposed_as_frontier", key in state["development_frontier"] and state["development_frontier"][key][0]["direction"] == "MORE_EXPLICIT", state["development_frontier"])

all_pass = all(r["pass"] for r in results)
evidence = {
  "qualification_id": "LITERARY-PROSE-ENGINE-001-STEP-J-FIXTURE-QUALIFICATION",
  "standing": "PASS" if all_pass else "FAIL",
  "fixture_count": len(results),
  "results": results,
  "chronology_preserved": True,
  "user_decision_highest_project_preference_authority": True,
  "frequency_used_as_quality": False,
  "history_overwritten": False,
  "named_author_target_allowed": False,
  "raw_manuscript_text_committed": False,
  "a01_required": False
}
open("STEP-J-QUALIFICATION-EVIDENCE.json", "w", encoding="utf-8").write(json.dumps(evidence, indent=2, default=str) + "\n")
print(f"STEP-J FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(results)} cases)")
if not all_pass:
    print(json.dumps([r for r in results if not r["pass"]], indent=2, default=str))
    raise SystemExit(1)
