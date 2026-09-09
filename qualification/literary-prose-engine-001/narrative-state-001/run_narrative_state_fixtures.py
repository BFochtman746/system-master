from narrative_state import validate_state, invalidation_candidates

H = "a" * 64


def anchor(anchor_id, chapter, ordinal, **extra):
    x = {"anchor_id": anchor_id, "chapter_id": chapter, "ordinal": ordinal, "span_sha256": H}
    x.update(extra)
    return x


def entity(entity_id, entity_type="CHARACTER", anchors=None):
    return {"entity_id": entity_id, "entity_type": entity_type, "anchor_ids": anchors or ["A1"]}


def event(event_id, anchors=None, participants=None, **extra):
    x = {"event_id": event_id, "anchor_ids": anchors or ["A1"], "participant_entity_ids": participants or ["C1"]}
    x.update(extra)
    return x


def claim(claim_id, claim_type, subject, obj, anchors=None, status="ASSERTED", confidence=0.9, **extra):
    x = {
        "claim_id": claim_id,
        "claim_type": claim_type,
        "subject_id": subject,
        "object_id": obj,
        "status": status,
        "confidence": confidence,
        "provenance_anchor_ids": anchors or ["A1"],
    }
    x.update(extra)
    return x


def base_state():
    return {
        "state_version": 1,
        "document_id": "DOC-1",
        "source_sha256": "b" * 64,
        "anchors": [anchor("A1", "CH01", 1), anchor("A2", "CH02", 2), anchor("A3", "CH03", 3)],
        "entities": [entity("C1", anchors=["A1", "A2"]), entity("C2", anchors=["A2", "A3"])],
        "events": [event("E1", anchors=["A1"], participants=["C1"]), event("E2", anchors=["A2"], participants=["C1", "C2"])],
        "claims": [claim("T1", "STORY_TIME_BEFORE", "E1", "E2", anchors=["A1", "A2"])],
    }


checks = []
def check(name, condition, detail=None):
    checks.append({"case": name, "pass": bool(condition), "detail": detail})


s = base_state()
r = validate_state(s)
check("minimal_valid", r["valid"], r)
check("counts", r["counts"] == {"anchors": 3, "entities": 2, "events": 2, "claims": 1}, r)
check("nonreconstructive", not r["raw_manuscript_text_present"], r)

# Flashback: discourse can present E2 before E1 while story time remains E1 before E2.
s = base_state()
s["claims"].append(claim("D1", "DISCOURSE_PRECEDES", "E2", "E1", anchors=["A1", "A2"]))
r = validate_state(s)
check("flashback_story_discourse_separate", r["valid"], r)

# Repeated narration of one story event is representable without collapsing discourse anchors.
s = base_state()
s["events"].append(event("E1_RETELL", anchors=["A3"], participants=["C1"]))
s["claims"].append(claim("SAME1", "SAME_STORY_EVENT", "E1", "E1_RETELL", anchors=["A1", "A3"]))
r = validate_state(s)
check("same_event_retelling_valid", r["valid"], r)

# Ambiguous chronology remains explicit alternatives, not invented certainty.
s = base_state()
s["claims"] = [
    claim("ALT1", "STORY_TIME_BEFORE", "E1", "E2", status="ALTERNATIVE", confidence=0.55),
    claim("ALT2", "STORY_TIME_BEFORE", "E2", "E1", status="ALTERNATIVE", confidence=0.45),
]
r = validate_state(s)
check("alternative_chronology_valid", r["valid"], r)

# Contradictory asserted chronology fails closed.
s = base_state()
s["claims"].append(claim("T2", "STORY_TIME_BEFORE", "E2", "E1", anchors=["A2", "A1"]))
r = validate_state(s)
check("contradictory_asserted_time_rejected", not r["valid"] and any("CONTRADICTORY_ASSERTED_STORY_TIME" in e for e in r["errors"]), r)

# AFTER normalizes correctly and can reveal the same contradiction.
s = base_state()
s["claims"].append(claim("T2", "STORY_TIME_AFTER", "E1", "E2", anchors=["A1", "A2"]))
r = validate_state(s)
check("after_normalization_contradiction", not r["valid"] and any("CONTRADICTORY_ASSERTED_STORY_TIME" in e for e in r["errors"]), r)

# Self-order is invalid.
s = base_state()
s["claims"] = [claim("SELF", "STORY_TIME_BEFORE", "E1", "E1")]
r = validate_state(s)
check("self_time_rejected", not r["valid"] and any("TEMPORAL_SELF_ORDER" in e for e in r["errors"]), r)

# Manuscript text is forbidden anywhere in the state.
for key in ["raw_text", "quoted_text", "manuscript_text", "source_text", "passage_text"]:
    s = base_state()
    s["anchors"][0][key] = "Once upon a time"
    r = validate_state(s)
    check(f"forbid_{key}", not r["valid"] and r["raw_manuscript_text_present"], r)

# Digests and token ranges must be structurally valid.
s = base_state(); s["source_sha256"] = "bad"
check("bad_source_digest", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["anchors"][0]["span_sha256"] = "bad"
check("bad_anchor_digest", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["anchors"][0].update({"token_start": 10, "token_end": 5})
check("bad_token_range", not validate_state(s)["valid"], validate_state(s))

# Duplicate and dangling identities fail closed.
s = base_state(); s["anchors"].append(anchor("A1", "CH99", 99))
check("duplicate_anchor", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["events"][0]["anchor_ids"] = ["MISSING"]
check("dangling_event_anchor", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["events"][0]["participant_entity_ids"] = ["MISSING"]
check("dangling_event_entity", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["claims"][0]["subject_id"] = "MISSING"
check("dangling_claim_subject", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["claims"][0]["provenance_anchor_ids"] = ["MISSING"]
check("dangling_claim_provenance", not validate_state(s)["valid"], validate_state(s))

# Perspective/epistemic relations remain distinct and descriptive.
s = base_state()
s["claims"] += [
    claim("K1", "KNOWS", "C1", "E2", anchors=["A2"]),
    claim("B1", "BELIEVES", "C2", "E1", anchors=["A3"], confidence=0.7),
    claim("P1", "PERCEIVES", "C2", "E2", anchors=["A2"]),
    claim("F1", "FOCALIZES", "C1", "E1", anchors=["A1"]),
]
r = validate_state(s)
check("epistemic_claim_types_distinct_valid", r["valid"], r)

# Invalid confidence and claim type fail closed.
s = base_state(); s["claims"][0]["confidence"] = 1.2
check("confidence_bound", not validate_state(s)["valid"], validate_state(s))
s = base_state(); s["claims"][0]["claim_type"] = "IS_GOOD_PROSE"
check("no_quality_claim_type", not validate_state(s)["valid"], validate_state(s))

# Direct invalidation is precise: changed anchor affects only dependent records.
s = base_state()
s["claims"].append(claim("C1", "CAUSES", "E1", "E2", anchors=["A1"]))
impact = invalidation_candidates(s, ["A1"])
check("invalidation_entity", impact["entity_ids"] == ["C1"], impact)
check("invalidation_event", impact["event_ids"] == ["E1"], impact)
check("invalidation_claims", impact["claim_ids"] == ["C1", "T1"], impact)
check("invalidation_unrelated_preserved", "E2" not in impact["event_ids"] and "C2" not in impact["entity_ids"], impact)

# Empty materialization can be structurally valid but warns instead of inventing facts.
s = base_state(); s["events"] = []; s["claims"] = []
r = validate_state(s)
check("empty_materialization_valid", r["valid"], r)
check("empty_materialization_warns", "NO_EVENTS_MATERIALIZED" in r["warnings"] and "NO_CLAIMS_MATERIALIZED" in r["warnings"], r)

all_pass = all(x["pass"] for x in checks)
print(f"NARRATIVE STATE FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(checks)} cases)")
if not all_pass:
    for x in checks:
        if not x["pass"]:
            print(x)
    raise SystemExit(1)
