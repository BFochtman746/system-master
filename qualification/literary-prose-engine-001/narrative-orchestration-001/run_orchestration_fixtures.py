from orchestration_state import validate_orchestration, invalidation_candidates

H="a"*64
S="b"*64


def narrative_state():
    return {
        "state_version":1,"document_id":"DOC1","source_sha256":S,
        "anchors":[
            {"anchor_id":"A1","chapter_id":"CH01","ordinal":1,"span_sha256":H},
            {"anchor_id":"A2","chapter_id":"CH02","ordinal":2,"span_sha256":H},
            {"anchor_id":"A3","chapter_id":"CH03","ordinal":3,"span_sha256":H},
            {"anchor_id":"A4","chapter_id":"CH04","ordinal":4,"span_sha256":H},
        ],
        "entities":[
            {"entity_id":"C1","entity_type":"CHARACTER","anchor_ids":["A1","A2","A3"]},
            {"entity_id":"C2","entity_type":"CHARACTER","anchor_ids":["A2","A3","A4"]},
        ],
        "events":[
            {"event_id":"E1","anchor_ids":["A1"],"participant_entity_ids":["C1"]},
            {"event_id":"E2","anchor_ids":["A2"],"participant_entity_ids":["C1","C2"]},
            {"event_id":"E3","anchor_ids":["A3"],"participant_entity_ids":["C1","C2"]},
            {"event_id":"E4","anchor_ids":["A4"],"participant_entity_ids":["C2"]},
        ],
        "claims":[
            {"claim_id":"T1","claim_type":"STORY_TIME_BEFORE","subject_id":"E1","object_id":"E2","status":"ASSERTED","confidence":.95,"provenance_anchor_ids":["A1","A2"]},
            {"claim_id":"T2","claim_type":"STORY_TIME_BEFORE","subject_id":"E2","object_id":"E3","status":"ASSERTED","confidence":.95,"provenance_anchor_ids":["A2","A3"]},
            {"claim_id":"C1CAUSE","claim_type":"CAUSES","subject_id":"E1","object_id":"E3","status":"ASSERTED","confidence":.85,"provenance_anchor_ids":["A1","A3"]},
        ]
    }


def orchestration():
    return {
        "orchestration_version":1,
        "document_id":"DOC1",
        "narrative_state_source_sha256":S,
        "function_assignments":[
            {"assignment_id":"F1","event_id":"E1","function_type":"SETUP","status":"ASSERTED","confidence":.85,"provenance_claim_ids":["C1CAUSE"]},
            {"assignment_id":"F2","event_id":"E3","function_type":"PAYOFF","status":"ASSERTED","confidence":.85,"provenance_claim_ids":["C1CAUSE"]},
        ],
        "setup_payoff_links":[
            {"link_id":"SP1","setup_event_ids":["E1"],"payoff_event_ids":["E3"],"status":"PAID_OFF","confidence":.85,"provenance_claim_ids":["C1CAUSE"]}
        ],
        "open_questions":[
            {"question_id":"Q1","introduced_event_ids":["E1"],"resolution_event_ids":["E3"],"reopened_event_ids":[],"status":"CLOSED","confidence":.8,"provenance_claim_ids":["C1CAUSE"]}
        ],
        "arcs":[
            {"arc_id":"ARC-C1","arc_type":"CHARACTER","subject_ids":["C1"],"status":"CLOSED","beats":[
                {"beat_id":"B1","role":"INTRODUCE","event_ids":["E1"],"confidence":.9,"status":"ASSERTED","provenance_claim_ids":[]},
                {"beat_id":"B2","role":"COMPLICATE","event_ids":["E2"],"confidence":.8,"status":"ASSERTED","provenance_claim_ids":["T1"]},
                {"beat_id":"B3","role":"CLOSE","event_ids":["E3"],"confidence":.75,"status":"ASSERTED","provenance_claim_ids":["T2"]},
            ]}
        ]
    }

checks=[]
def check(name,cond,detail=None): checks.append({"case":name,"pass":bool(cond),"detail":detail})

ns=narrative_state(); o=orchestration(); r=validate_orchestration(ns,o)
check("basic_valid",r["valid"],r)
check("no_universal_template",not r["universal_plot_template_enforced"],r)
check("no_quality_score",not r["literary_quality_score_emitted"],r)
check("no_manuscript_text",not r["manuscript_text_persisted"],r)

# Nonlinear/alternative function hypotheses are allowed and never forced to one label.
o=orchestration(); o["function_assignments"] += [
    {"assignment_id":"FALT1","event_id":"E2","function_type":"REVERSAL","status":"ALTERNATIVE","confidence":.55,"provenance_claim_ids":[]},
    {"assignment_id":"FALT2","event_id":"E2","function_type":"REVELATION","status":"ALTERNATIVE","confidence":.45,"provenance_claim_ids":[]},
]
r=validate_orchestration(ns,o)
check("alternative_functions_coexist",r["valid"],r)

# No mandatory three-act/beat template: sparse orchestration is valid with warnings.
o={"orchestration_version":1,"document_id":"DOC1","narrative_state_source_sha256":S,"function_assignments":[],"setup_payoff_links":[],"open_questions":[],"arcs":[]}
r=validate_orchestration(ns,o)
check("sparse_orchestration_valid",r["valid"],r)
check("sparse_orchestration_warns",all(x in r["warnings"] for x in ["NO_FUNCTION_ASSIGNMENTS","NO_SETUP_PAYOFF_LINKS","NO_OPEN_QUESTIONS","NO_ARCS"]),r)

# Intentional unresolved setup/question/arc states are first-class, not defects.
o=orchestration(); o["setup_payoff_links"]=[{"link_id":"SPX","setup_event_ids":["E1"],"payoff_event_ids":[],"status":"INTENTIONALLY_UNRESOLVED","confidence":.9,"provenance_claim_ids":[]}]
o["open_questions"]=[{"question_id":"QX","introduced_event_ids":["E2"],"resolution_event_ids":[],"status":"INTENTIONALLY_UNRESOLVED","confidence":.9,"provenance_claim_ids":[]}]
o["arcs"][0]["status"]="INTENTIONALLY_OPEN"; o["arcs"][0]["beats"]=o["arcs"][0]["beats"][:2]
r=validate_orchestration(ns,o)
check("intentional_unresolved_valid",r["valid"],r)

# Open link may have no payoff; paid-off link must have one.
o=orchestration(); o["setup_payoff_links"]=[{"link_id":"OPEN1","setup_event_ids":["E1"],"payoff_event_ids":[],"status":"OPEN","confidence":.8,"provenance_claim_ids":[]}]
check("open_setup_no_payoff_valid",validate_orchestration(ns,o)["valid"],validate_orchestration(ns,o))
o=orchestration(); o["setup_payoff_links"][0]["payoff_event_ids"]=[]
r=validate_orchestration(ns,o)
check("paid_off_requires_payoff",not r["valid"] and any("PAID_OFF_REQUIRES_PAYOFF_EVENT" in e for e in r["errors"]),r)

# Closed question requires resolution; intentional unresolved does not.
o=orchestration(); o["open_questions"][0]["resolution_event_ids"]=[]
r=validate_orchestration(ns,o)
check("closed_question_requires_resolution",not r["valid"] and any("CLOSED_QUESTION_REQUIRES_RESOLUTION_EVENT" in e for e in r["errors"]),r)

# Referential integrity.
for collection,key,bad in [
    ("function_assignments","event_id","NO_EVENT"),
]:
    o=orchestration(); o[collection][0][key]=bad; r=validate_orchestration(ns,o)
    check("dangling_function_event",not r["valid"],r)
o=orchestration(); o["setup_payoff_links"][0]["setup_event_ids"]=["NO_EVENT"]; r=validate_orchestration(ns,o)
check("dangling_setup_event",not r["valid"],r)
o=orchestration(); o["open_questions"][0]["introduced_event_ids"]=["NO_EVENT"]; r=validate_orchestration(ns,o)
check("dangling_question_event",not r["valid"],r)
o=orchestration(); o["arcs"][0]["subject_ids"]=["NO_NODE"]; r=validate_orchestration(ns,o)
check("dangling_arc_subject",not r["valid"],r)
o=orchestration(); o["arcs"][0]["beats"][0]["event_ids"]=["NO_EVENT"]; r=validate_orchestration(ns,o)
check("dangling_arc_beat_event",not r["valid"],r)
o=orchestration(); o["function_assignments"][0]["provenance_claim_ids"]=["NO_CLAIM"]; r=validate_orchestration(ns,o)
check("dangling_provenance_claim",not r["valid"],r)

# Source/document binding cannot drift from canonical state.
o=orchestration(); o["document_id"]="OTHER"; r=validate_orchestration(ns,o)
check("document_binding",not r["valid"],r)
o=orchestration(); o["narrative_state_source_sha256"]="c"*64; r=validate_orchestration(ns,o)
check("source_binding",not r["valid"],r)

# Upstream state must itself be valid.
bad_ns=narrative_state(); bad_ns["source_sha256"]="bad"; r=validate_orchestration(bad_ns,orchestration())
check("invalid_upstream_fails",not r["valid"] and "NARRATIVE_STATE_INVALID" in r["errors"],r)

# Raw/revision text is forbidden anywhere.
for key in ["raw_text","quoted_text","manuscript_text","source_text","passage_text","revision_text"]:
    o=orchestration(); o["function_assignments"][0][key]="copied prose"; r=validate_orchestration(ns,o)
    check(f"forbid_{key}",not r["valid"] and r["manuscript_text_persisted"],r)

# Invalid controlled vocabulary/confidence fails closed.
o=orchestration(); o["function_assignments"][0]["function_type"]="MUST_HAVE_MIDPOINT"; r=validate_orchestration(ns,o)
check("no_template_function_type",not r["valid"],r)
o=orchestration(); o["function_assignments"][0]["confidence"]=1.2; r=validate_orchestration(ns,o)
check("function_confidence_bound",not r["valid"],r)
o=orchestration(); o["arcs"][0]["arc_type"]="HERO_JOURNEY_REQUIRED"; r=validate_orchestration(ns,o)
check("no_template_arc_type",not r["valid"],r)
o=orchestration(); o["arcs"][0]["beats"][0]["role"]="DEFECT"; r=validate_orchestration(ns,o)
check("no_defect_beat_role",not r["valid"],r)

# Self setup-payoff link fails; a prospective OPEN reference warns but is not a defect.
o=orchestration(); o["setup_payoff_links"][0]["payoff_event_ids"]=["E1"]; r=validate_orchestration(ns,o)
check("self_setup_payoff_reject",not r["valid"] and any("SETUP_PAYOFF_SELF_LINK" in e for e in r["errors"]),r)
o=orchestration(); o["setup_payoff_links"][0]["status"]="OPEN"; r=validate_orchestration(ns,o)
check("prospective_open_reference_valid",r["valid"] and any("OPEN_LINK_HAS_PROSPECTIVE_PAYOFF_REFERENCE" in w for w in r["warnings"]),r)

# Duplicate IDs fail closed.
o=orchestration(); o["function_assignments"].append(dict(o["function_assignments"][0])); r=validate_orchestration(ns,o)
check("duplicate_function_id",not r["valid"],r)
o=orchestration(); o["arcs"].append({"arc_id":"ARC2","arc_type":"PLOT","subject_ids":["E1"],"status":"ACTIVE","beats":[dict(o["arcs"][0]["beats"][0])]}); r=validate_orchestration(ns,o)
check("duplicate_beat_id_global",not r["valid"],r)

# Precise invalidation: changed event/claim/entity only invalidates dependent orchestration objects.
o=orchestration(); impact=invalidation_candidates(o,changed_event_ids=["E1"])
check("event_invalidation_function",impact["function_assignment_ids"]==["F1"],impact)
check("event_invalidation_link",impact["setup_payoff_link_ids"]==["SP1"],impact)
check("event_invalidation_question",impact["open_question_ids"]==["Q1"],impact)
check("event_invalidation_arc",impact["arc_ids"]==["ARC-C1"],impact)
impact=invalidation_candidates(o,changed_claim_ids=["C1CAUSE"])
check("claim_invalidation_function_and_link",impact["function_assignment_ids"]==["F1","F2"] and impact["setup_payoff_link_ids"]==["SP1"],impact)
impact=invalidation_candidates(o,changed_entity_ids=["C2"])
check("unrelated_entity_does_not_invalidate_c1_arc",impact["arc_ids"]==[],impact)
impact=invalidation_candidates(o,changed_entity_ids=["C1"])
check("subject_entity_invalidates_arc",impact["arc_ids"]==["ARC-C1"],impact)

all_pass=all(x["pass"] for x in checks)
print(f"NARRATIVE ORCHESTRATION FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(checks)} cases)")
if not all_pass:
    for x in checks:
        if not x["pass"]: print(x)
    raise SystemExit(1)
