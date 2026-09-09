import json
from voice_preference_learning import append_event, derive_state


def event(seq, typ, direction, **extra):
    authority = {
        "USER_REJECT_CANDIDATE": "USER_ACTION",
        "USER_REVOKE_EVENT": "USER_EXPLICIT",
    }[typ]
    out = {
        "event_id": f"E{seq:03d}",
        "project_id": "P1",
        "sequence": seq,
        "occurred_at": f"2026-09-09T00:{seq:02d}:00+00:00",
        "event_type": typ,
        "authority": authority,
        "dimension": "sentence_rhythm",
        "direction": direction,
        "context": {"scene_function": "DIALOGUE"},
        "subject_digest": f"sha256:{seq:064d}",
        "evidence_refs": [f"HARD-{seq}"],
    }
    out.update(extra)
    return out


def add_all(events):
    ledger = []
    for item in events:
        ledger = append_event(ledger, item)
    return ledger


results = []
state = derive_state(add_all([event(1, "USER_REJECT_CANDIDATE", "ORNATE")]))
results.append({
    "case_id": "J-HARD-REJECT-NOT-CURRENT-PREFERENCE",
    "pass": state["current_preference"] == {} and len(state["rejected_direction"]) == 1,
})

state = derive_state(add_all([
    event(1, "USER_REJECT_CANDIDATE", "ORNATE"),
    event(2, "USER_REVOKE_EVENT", "REVOKE", revoked_event_id="E001"),
]))
results.append({
    "case_id": "J-HARD-REVOKED-REJECTION-HISTORY-PRESERVED",
    "pass": state["rejected_direction"] == {}
        and len(state["rejection_history"]) == 1
        and state["rejection_history"][0].get("revoked") is True,
})

errors = [result for result in results if not result["pass"]]
print(json.dumps({"standing": "PASS" if not errors else "FAIL", "results": results, "errors": errors}, indent=2))
if errors:
    raise SystemExit(1)
