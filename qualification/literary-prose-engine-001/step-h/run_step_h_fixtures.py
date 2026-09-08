import json
from pathlib import Path
from controlled_revision import generate_candidate_set

ROOT = Path(__file__).parent
cases = json.loads((ROOT / "fixtures" / "step_h_cases.json").read_text())["cases"]
ORIGINAL = "He answered. [AFTERBEAT]He knew the answer had hurt her.[/AFTERBEAT] She looked away."

def state(case):
    status = case.get("readiness", "REVISION_STATE_READY")
    return {
        "identity": {"passage_id": "P-SYN-001", "project_id": "SYN", "book_id": "SYN-BOOK", "source_authority_status": "AUTHORIZED_SYNTHETIC"},
        "preservation_state": {"explicit_challenge_authorization": case.get("challenge_auth", False)},
        "readiness": {"status": status, "revision_allowed": status == "REVISION_STATE_READY", "maximum_edit_scope": case.get("max_scope", "SURGICAL")}
    }

OPPS = [
    {"opportunity_id":"OP1","status":"ADMIT","target_dimensions":["dialogue_subtext"]},
    {"opportunity_id":"OP2","status":"ADMIT","target_dimensions":["paragraph_movement"]},
    {"opportunity_id":"OP3","status":"ADMIT","target_dimensions":["sentence_rhythm"]},
    {"opportunity_id":"OP_REVIEW","status":"REVIEW_CONFLICT","target_dimensions":["voice"]}
]
TRANSFORMS = [
    {"transform_id":"T1","qualified":True,"operation":"DELETE_MARKED_AFTERBEAT","scope_limit":"SURGICAL","expected_effects":["increase_subtext"],"preservation_obligations":["meaning","voice"]},
    {"transform_id":"T2","qualified":True,"operation":"SPLIT_AT_TOKEN","fixture_parameters":{"token":" | "},"fixture_candidate_text":"He answered.\n\nShe looked away.","scope_limit":"LOCAL_RESTRUCTURE","expected_effects":["alter_paragraph_movement"],"preservation_obligations":["meaning"]},
    {"transform_id":"T3","qualified":True,"operation":"REPLACE_TOKEN","fixture_parameters":{"from":"She looked away.","to":"She turned toward the window."},"scope_limit":"SURGICAL","expected_effects":["vary_local_action"],"preservation_obligations":["character_intent"]},
    {"transform_id":"T4","qualified":True,"operation":"REPLACE_TOKEN","fixture_parameters":{"from":"He answered.","to":"He waited before answering."},"scope_limit":"APPROACH_CHALLENGE","expected_effects":["challenge_scene_approach"],"preservation_obligations":["canon","voice","intent"]},
    {"transform_id":"T_BAD","qualified":False,"operation":"DELETE_MARKED_AFTERBEAT","scope_limit":"SURGICAL","expected_effects":[],"preservation_obligations":[]},
    {"transform_id":"T_COUNTER","qualified":True,"operation":"DELETE_MARKED_AFTERBEAT","scope_limit":"SURGICAL","countercondition_active":True,"expected_effects":[],"preservation_obligations":[]}
]

results, errors = [], []
for c in cases:
    out = generate_candidate_set(state(c), ORIGINAL, OPPS, TRANSFORMS, c.get("requests", []))
    ok = True
    if c.get("mode") == "deterministic":
        out2 = generate_candidate_set(state(c), ORIGINAL, OPPS, TRANSFORMS, c.get("requests", []))
        ok = out["candidates"] == out2["candidates"]
    if "expect_status" in c: ok = ok and out["status"] == c["expect_status"]
    if "expect_levels" in c: ok = ok and [x["ambition_level"] for x in out["candidates"]] == c["expect_levels"]
    if "expect_nonzero" in c: ok = ok and len(out["candidates"]) - 1 == c["expect_nonzero"]
    if "expect_reject" in c: ok = ok and c["expect_reject"] in [r["reason"] for r in out["rejections"]]
    if c.get("expect_writer_claim_null"):
        ok = ok and all(x["writer_quality_claim"] is None for x in out["candidates"])
    if "expect_eval_status" in c:
        nz = [x for x in out["candidates"] if x["ambition_level"] != "LEVEL_0_NO_CHANGE"]
        ok = ok and bool(nz) and all(x["evaluation_status"] == c["expect_eval_status"] for x in nz)
    if c.get("expect_control_exact"):
        ok = ok and out["candidates"][0]["candidate_text"] == ORIGINAL
    if "expect_review_flag" in c:
        nz = [x for x in out["candidates"] if x["ambition_level"] != "LEVEL_0_NO_CHANGE"]
        ok = ok and bool(nz) and c["expect_review_flag"] in nz[0]["pre_evaluation_preservation"].get("review_flags", [])
    results.append({"case_id": c["id"], "pass": bool(ok), "status": out["status"], "nonzero": len(out["candidates"]) - 1, "rejections": [r["reason"] for r in out["rejections"]]})
    if not ok: errors.append(c["id"])

evidence = {
    "qualification_id":"LITERARY-PROSE-ENGINE-001-STEP-H-FIXTURE-QUALIFICATION",
    "standing":"PASS" if not errors else "FAIL",
    "fixture_count":len(cases),
    "results":results,
    "errors":errors,
    "writer_self_adjudication_allowed":False,
    "named_author_target_allowed":False,
    "user_manuscript_text_committed":False,
    "a01_required":False
}
(ROOT / "STEP-H-QUALIFICATION-EVIDENCE.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(f"STEP-H FIXTURES: {'PASS' if not errors else 'FAIL'} ({len(cases)} cases)")
if errors: raise SystemExit(1)
