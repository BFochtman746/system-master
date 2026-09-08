#!/usr/bin/env python3

def decide(case):
    if case.get("named_author_target") or case.get("universal_great_prose_score"):
        return "REJECT"
    if case.get("external_principle_conflicts_project_voice"):
        return "PROJECT_VOICE_WINS"
    if case.get("conforms_registry_schema") and not case.get("redefines_contract", False):
        return "ADMIT_AS_NEW_BATCH"
    rights=case.get("rights")
    if rights=="LICENSE_UNRESOLVED_QUARANTINE": return "QUARANTINE"
    if rights=="MIXED_COMPONENT_RIGHTS" and case.get("component_review"): return "COMPONENT_REVIEW_REQUIRED"
    if case.get("source_class")=="PUBLIC_DOMAIN_CANDIDATE_CATALOG": return "CANDIDATE_ONLY"
    if case.get("requested_role")=="GENERAL_FICTION_QUALITY_AUTHORITY" and case.get("task_match")=="LOW": return "REJECT_ROLE"
    if case.get("empirical_support") and case.get("scope_limit_present"): return "ADMIT_CONDITIONED_PRINCIPLE"
    if rights=="COPYRIGHTED_DERIVED_ONLY": return "ADMIT_DERIVED_KNOWLEDGE"
    if rights in {"CC_BY_4_0","CC_BY_NC","CC_BY_NC_SA"}: return "ADMIT_LICENSED_DATA"
    return "REJECT"
