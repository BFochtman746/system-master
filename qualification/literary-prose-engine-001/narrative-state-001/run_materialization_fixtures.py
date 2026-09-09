from materialize_narrative_state import materialize

H = "a" * 64
S = "b" * 64


def anchors():
    return [
        {"anchor_id": "A1", "chapter_id": "CH01", "ordinal": 1, "span_sha256": H},
        {"anchor_id": "A2", "chapter_id": "CH02", "ordinal": 2, "span_sha256": H},
        {"anchor_id": "A3", "chapter_id": "CH03", "ordinal": 3, "span_sha256": H},
    ]


def entity(entity_id="C1", **kw):
    x = {"entity_id": entity_id, "entity_type": "CHARACTER", "anchor_ids": ["A1"], "confidence": .9, "support_status": "OBSERVED", "source_sha256": S}
    x.update(kw); return x


def event(event_id="E1", **kw):
    x = {"event_id": event_id, "anchor_ids": ["A1"], "participant_entity_ids": ["C1"], "confidence": .9, "support_status": "OBSERVED", "source_sha256": S}
    x.update(kw); return x


def claim(claim_id="T1", **kw):
    x = {"claim_id": claim_id, "claim_type": "STORY_TIME_BEFORE", "subject_id": "E1", "object_id": "E2", "status": "ASSERTED", "confidence": .9, "support_status": "OBSERVED", "evidence_families": ["TEMPORAL_SURFACE"], "provenance_anchor_ids": ["A1", "A2"], "source_sha256": S}
    x.update(kw); return x


def request(**kw):
    x = {
        "document_id": "DOC1", "source_sha256": S, "anchors": anchors(),
        "entity_candidates": [entity("C1"), entity("C2", anchor_ids=["A2"])],
        "event_candidates": [event("E1"), event("E2", anchor_ids=["A2"], participant_entity_ids=["C2"])],
        "claim_candidates": [claim()],
    }
    x.update(kw); return x


checks=[]
def check(name, cond, detail=None): checks.append({"case":name,"pass":bool(cond),"detail":detail})

r=materialize(request())
check("basic_pass", r["standing"]=="PASS", r)
check("basic_counts", r["receipt"]["admitted_counts"]=={"entities":2,"events":2,"claims":1}, r)
check("no_raw_text_persisted", not r["receipt"]["raw_manuscript_text_persisted"], r)

# Exact source binding.
r=materialize(request(entity_candidates=[entity(source_sha256="c"*64)]))
check("source_mismatch_entity_rejected", r["standing"]=="PASS" and r["receipt"]["rejected_counts"]["entities"]==1, r)
r=materialize(request(claim_candidates=[claim(source_sha256="c"*64)]))
check("source_mismatch_claim_rejected", r["standing"]=="PASS" and r["receipt"]["rejected_counts"]["claims"]==1, r)

# Raw manuscript text anywhere in input fails the entire request before persistence.
for key in ["raw_text","quoted_text","manuscript_text","source_text","passage_text"]:
    q=request(); q["entity_candidates"][0][key]="secret source words"
    r=materialize(q)
    check(f"forbidden_{key}_fails", r["standing"]=="FAIL" and r["state"] is None, r)

# Candidate confidence/support gates.
r=materialize(request(entity_candidates=[entity(confidence=.2)]))
check("low_conf_entity_reject", r["receipt"]["rejected_counts"]["entities"]==1, r)
r=materialize(request(event_candidates=[event(confidence=.2)]))
check("low_conf_event_reject", r["receipt"]["rejected_counts"]["events"]==1, r)
r=materialize(request(claim_candidates=[claim(confidence=.7)]))
check("asserted_claim_floor", r["receipt"]["rejected_counts"]["claims"]==1, r)
r=materialize(request(claim_candidates=[claim(support_status="CONTESTED")]))
check("contested_cannot_assert", r["receipt"]["rejected_counts"]["claims"]==1, r)

# Inferred asserted claims need high confidence + two distinct evidence families.
r=materialize(request(claim_candidates=[claim(support_status="INFERRED", confidence=.95, evidence_families=["F1"]) ]))
check("inferred_asserted_one_family_reject", r["receipt"]["rejected_counts"]["claims"]==1, r)
r=materialize(request(claim_candidates=[claim(support_status="INFERRED", confidence=.89, evidence_families=["F1","F2"]) ]))
check("inferred_asserted_low_conf_reject", r["receipt"]["rejected_counts"]["claims"]==1, r)
r=materialize(request(claim_candidates=[claim(support_status="INFERRED", confidence=.95, evidence_families=["F1","F2"]) ]))
check("inferred_asserted_two_family_admit", r["receipt"]["admitted_counts"]["claims"]==1, r)

# Ambiguity stays explicit.
alts=[
    claim("ALT1", status="ALTERNATIVE", confidence=.55, support_status="CONTESTED", conflict_group_id="CG1"),
    claim("ALT2", claim_type="STORY_TIME_BEFORE", subject_id="E2", object_id="E1", status="ALTERNATIVE", confidence=.45, support_status="CONTESTED", conflict_group_id="CG1", provenance_anchor_ids=["A1","A2"]),
]
r=materialize(request(claim_candidates=alts))
check("conflicting_alternatives_preserved", r["standing"]=="PASS" and r["receipt"]["admitted_counts"]["claims"]==2, r)
r=materialize(request(claim_candidates=[claim(status="UNRESOLVED", confidence=0.0, support_status="CONTESTED")]))
check("unresolved_zero_conf_allowed", r["receipt"]["admitted_counts"]["claims"]==1, r)

# Asserted temporal contradiction is caught by final state validator.
contradict=[claim("T1"), claim("T2", subject_id="E2", object_id="E1", provenance_anchor_ids=["A1","A2"])]
r=materialize(request(claim_candidates=contradict))
check("asserted_temporal_conflict_fails_state", r["standing"]=="FAIL" and r["state"] is None and any("CONTRADICTORY_ASSERTED_STORY_TIME" in x for x in r["receipt"]["state_validation_errors"]), r)

# Duplicate IDs merge only compatible evidence, never confidence sums.
ents=[entity("C1", anchor_ids=["A1"], confidence=.7), entity("C1", anchor_ids=["A2"], confidence=.9)]
r=materialize(request(entity_candidates=ents, event_candidates=[], claim_candidates=[]))
check("entity_duplicate_merges_anchors", r["standing"]=="PASS" and r["state"]["entities"][0]["anchor_ids"]==["A1","A2"], r)
ents=[entity("C1", entity_type="CHARACTER"), entity("C1", entity_type="PLACE")]
r=materialize(request(entity_candidates=ents, event_candidates=[], claim_candidates=[]))
check("entity_identity_conflict_rejected", r["receipt"]["rejected_counts"]["entities"]==1, r)

claims=[claim("T1", confidence=.82, evidence_families=["F1"]), claim("T1", confidence=.91, evidence_families=["F2"], provenance_anchor_ids=["A2"])]
r=materialize(request(claim_candidates=claims))
item=r["state"]["claims"][0]
check("claim_duplicate_max_not_sum", item["confidence"]==.91, item)
check("claim_duplicate_merges_provenance", item["provenance_anchor_ids"]==["A1","A2"], item)
check("claim_duplicate_merges_families", item["evidence_families"]==["F1","F2"], item)

# Identity mismatch with same claim ID fails closed.
claims=[claim("T1"), claim("T1", claim_type="CAUSES")]
r=materialize(request(claim_candidates=claims))
check("claim_identity_conflict_rejected", r["receipt"]["rejected_counts"]["claims"]==1, r)

# Dangling provenance/entities do not enter state.
r=materialize(request(entity_candidates=[entity(anchor_ids=["NOPE"])], event_candidates=[], claim_candidates=[]))
check("dangling_entity_anchor_reject", r["receipt"]["rejected_counts"]["entities"]==1, r)
r=materialize(request(event_candidates=[event(participant_entity_ids=["NOPE"])], claim_candidates=[]))
check("dangling_event_participant_reject", r["receipt"]["rejected_counts"]["events"]==1, r)
r=materialize(request(claim_candidates=[claim(subject_id="NOPE")]))
check("dangling_claim_subject_reject", r["receipt"]["rejected_counts"]["claims"]==1, r)

# Sparse evidence is valid; materializer never fills missing facts.
r=materialize({"document_id":"DOC1","source_sha256":S,"anchors":anchors(),"entity_candidates":[],"event_candidates":[],"claim_candidates":[]})
check("sparse_state_passes", r["standing"]=="PASS" and r["state"]["events"]==[] and r["state"]["claims"]==[], r)
check("sparse_state_warns", "NO_EVENTS_MATERIALIZED" in r["receipt"]["state_validation_warnings"], r)

# Structural source/anchor failures fail whole materialization rather than producing partial false authority.
q=request(); q["source_sha256"]="bad"
r=materialize(q)
check("bad_source_digest_fails", r["standing"]=="FAIL" and r["state"] is None, r)
q=request(); q["anchors"][0]["span_sha256"]="bad"
r=materialize(q)
check("bad_anchor_digest_fails", r["standing"]=="FAIL" and r["state"] is None, r)
q=request(); q["anchors"].append(dict(q["anchors"][0]))
r=materialize(q)
check("duplicate_anchor_fails", r["standing"]=="FAIL" and r["state"] is None, r)

all_pass=all(x["pass"] for x in checks)
print(f"NARRATIVE STATE MATERIALIZATION FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(checks)} cases)")
if not all_pass:
    for x in checks:
        if not x["pass"]: print(x)
    raise SystemExit(1)
