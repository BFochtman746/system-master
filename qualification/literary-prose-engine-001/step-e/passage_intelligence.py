#!/usr/bin/env python3
from copy import deepcopy

CRITICAL = {"scene_or_chapter_function","pov","focalization","authorial_intent","protected_language","canon_facts"}
RISK_HARD = {"protected_language_conflict","canon_conflict","authorial_intent_conflict","pov_knowledge_violation"}

REQUIRED_BY_SCOPE = {
    "SURGICAL": {"scene_or_chapter_function","pov","protected_language","canon_facts"},
    "LOCAL_RESTRUCTURE": {"scene_or_chapter_function","pov","focalization","protected_language","canon_facts","reader_state","pacing_target","information_release","character_pressure"},
    "SUBSTANTIAL_REWORK": {"scene_or_chapter_function","pov","focalization","protected_language","canon_facts","reader_state","pacing_target","information_release","character_pressure","project_voice","book_voice","authorial_intent","continuity"},
    "APPROACH_CHALLENGE": {"scene_or_chapter_function","pov","focalization","protected_language","canon_facts","reader_state","pacing_target","information_release","character_pressure","project_voice","book_voice","authorial_intent","continuity","development_frontier_authorized"}
}

def known(value):
    if value is None: return False
    if isinstance(value, bool): return value
    if isinstance(value, str): return bool(value.strip()) and value.upper() not in {"UNKNOWN","UNRESOLVED","UNSPECIFIED"}
    if isinstance(value, (list, dict, set, tuple)): return len(value) > 0
    return True

def authority_map(state):
    return {
        "scene_or_chapter_function": state.get("purpose_state",{}).get("scene_or_chapter_function"),
        "pov": state.get("narrative_state",{}).get("pov"),
        "focalization": state.get("narrative_state",{}).get("focalization"),
        "authorial_intent": state.get("preservation_state",{}).get("authorial_intent"),
        "protected_language": state.get("preservation_state",{}).get("protected_language"),
        "canon_facts": state.get("preservation_state",{}).get("canon_facts"),
        "reader_state": state.get("reader_state"),
        "pacing_target": state.get("narrative_state",{}).get("pacing_target"),
        "information_release": state.get("narrative_state",{}).get("information_release"),
        "character_pressure": state.get("character_state",{}).get("relationship_pressure"),
        "project_voice": state.get("voice_state",{}).get("project_voice"),
        "book_voice": state.get("voice_state",{}).get("book_voice"),
        "continuity": state.get("character_state",{}).get("continuity_constraints"),
        "development_frontier_authorized": state.get("voice_state",{}).get("development_frontier_authorized")
    }

def assess_readiness(state, requested_scope):
    amap=authority_map(state)
    required=REQUIRED_BY_SCOPE.get(requested_scope,set())
    missing=sorted(k for k in required if not known(amap.get(k)))
    critical_missing=sorted(k for k in CRITICAL if k in required and not known(amap.get(k)))
    if requested_scope == "NONE":
        return {"diagnosis_allowed": True, "revision_allowed": False, "status":"NO_ACTION", "missing_authorities":[], "maximum_edit_scope":"NONE"}
    if critical_missing:
        status="BLOCKED_NEEDS_CONTEXT"
    elif missing:
        status="DIAGNOSIS_ONLY"
    else:
        status="REVISION_STATE_READY"
    maximum="NONE"
    for scope in ["SURGICAL","LOCAL_RESTRUCTURE","SUBSTANTIAL_REWORK","APPROACH_CHALLENGE"]:
        req=REQUIRED_BY_SCOPE[scope]
        if all(known(amap.get(k)) for k in req): maximum=scope
        else: break
    return {"diagnosis_allowed": True, "revision_allowed": status=="REVISION_STATE_READY", "status":status, "missing_authorities":missing, "maximum_edit_scope":maximum}

def prioritize_opportunities(opportunities, max_count=3):
    ranked=[]
    for op in opportunities:
        hard=set(op.get("hard_risks",[])) & RISK_HARD
        if hard:
            row=deepcopy(op); row["decision"]="REJECT_PRESERVATION_RISK"; row["priority"]=-1; ranked.append(row); continue
        impact=float(op.get("expected_impact",0)); conf=float(op.get("diagnostic_confidence",0)); rel=float(op.get("purpose_relevance",0)); fit=float(op.get("edit_budget_fit",0))
        risk=float(op.get("preservation_risk",0))+float(op.get("voice_risk",0))+float(op.get("collateral_regression_risk",0))
        score=(impact*conf*rel*fit)/(1.0+risk)
        row=deepcopy(op); row["priority"]=round(score,6); row["decision"]="CANDIDATE" if score>=0.12 else "NO_ACTION_LOW_EXPECTED_VALUE"; ranked.append(row)
    candidates=sorted([r for r in ranked if r["decision"]=="CANDIDATE"], key=lambda r:(-r["priority"], r.get("opportunity_id","")))[:max_count]
    rejects=[r for r in ranked if r["decision"]!="CANDIDATE"]
    return {"selected":candidates,"rejected":rejects,"no_action":len(candidates)==0}

def construct_passage_state(payload):
    state=deepcopy(payload["state"])
    strengths=state.get("craft_state",{}).get("current_strengths",[])
    if not strengths:
        state.setdefault("craft_state",{})["state_warning"]="STRENGTHS_NOT_ESTABLISHED"
    requested_scope=payload.get("requested_scope","SURGICAL")
    state["readiness"]=assess_readiness(state, requested_scope)
    state["craft_state"]["opportunity_priority"]=prioritize_opportunities(state["craft_state"].get("candidate_opportunities",[]), payload.get("max_opportunities",3))
    if state["craft_state"]["opportunity_priority"]["no_action"] and state["readiness"]["revision_allowed"]:
        state["readiness"]["status"]="NO_ACTION"
        state["readiness"]["revision_allowed"]=False
        state["readiness"]["maximum_edit_scope"]="NONE"
    return state
