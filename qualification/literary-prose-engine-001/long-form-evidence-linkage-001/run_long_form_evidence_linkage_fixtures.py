from __future__ import annotations

import copy
import hashlib

from long_form_evidence_linkage import score_case, score_corpus


def digest(label):
    return hashlib.sha256(label.encode("utf-8")).hexdigest()


def anchor(anchor_id, chapter, events=(), facts=()):
    return {
        "anchor_id": anchor_id,
        "locator_id": f"SYNTH-WORK-001/chapter:{chapter}/anchor:{anchor_id}",
        "sha256": digest(anchor_id),
        "chapter_index": chapter,
        "event_ids": list(events),
        "fact_ids": list(facts),
    }


gold_case = {
    "case_id": "LFEL-SYNTH-001",
    "chapter_count": 9,
    "anchors": [
        anchor("A_SETUP", 2, events=("E_SETUP",)),
        anchor("A_MIDDLE", 5, events=("E_TURN",), facts=("F_MIDDLE_STATE",)),
        anchor("A_PAYOFF", 8, events=("E_PAYOFF",)),
    ],
    "claims": [
        {
            "claim_id": "C_ARC",
            "claim_code": "DELAYED_SETUP_PAYOFF",
            "status": "ASSERTED",
            "confidence": 1.0,
            "evidence_anchor_ids": ["A_SETUP", "A_PAYOFF"],
            "long_range": True,
        },
        {
            "claim_id": "C_MIDDLE_FACT",
            "claim_code": "MIDDLE_STATE_PERSISTS_TO_PAYOFF",
            "status": "ASSERTED",
            "confidence": 1.0,
            "evidence_anchor_ids": ["A_MIDDLE", "A_PAYOFF"],
            "long_range": True,
        },
    ],
    "temporal_relations": [
        {
            "relation_id": "T_SETUP_TO_TURN",
            "earlier_event_id": "E_SETUP",
            "later_event_id": "E_TURN",
            "evidence_anchor_ids": ["A_SETUP", "A_MIDDLE"],
        },
        {
            "relation_id": "T_TURN_TO_PAYOFF",
            "earlier_event_id": "E_TURN",
            "later_event_id": "E_PAYOFF",
            "evidence_anchor_ids": ["A_MIDDLE", "A_PAYOFF"],
        },
    ],
    "middle_book_slice": {
        "required": True,
        "fact_claim_ids": ["C_MIDDLE_FACT"],
        "temporal_relation_ids": ["T_TURN_TO_PAYOFF"],
    },
}


def prediction_from_gold():
    out = copy.deepcopy(gold_case)
    for claim in out["claims"]:
        claim["confidence"] = 0.91
    return out


checks = []


def check(name, condition, detail=None):
    checks.append({"case": name, "pass": bool(condition), "detail": detail})


pred = prediction_from_gold()
r = score_case(gold_case, pred)
check(
    "exact_macro_and_localized_evidence_pass",
    r["standing"] == "PASS_LINKED"
    and r["macro_claim_accuracy"] == 1.0
    and r["exact_evidence_linkage_rate"] == 1.0
    and r["temporal_linkage_rate"] == 1.0
    and r["middle_book_bounds"] == [4, 6]
    and r["middle_book_fact_pass"]
    and r["middle_book_temporal_pass"]
    and not r["whole_book_accuracy_claimed"]
    and not r["revision_authorized"],
    r,
)

pred = prediction_from_gold()
pred["claims"][0]["claim_code"] = "FLUENT_BUT_WRONG_MACRO_INTERPRETATION"
r = score_case(gold_case, pred)
check(
    "macro_interpretation_cannot_hide_behind_good_anchors",
    r["standing"] == "FAIL_UNLINKED"
    and r["macro_claim_accuracy"] == 0.5
    and r["exact_evidence_linkage_rate"] == 0.5,
    r,
)

pred = prediction_from_gold()
pred["anchors"][1]["locator_id"] = "SYNTH-WORK-001/chapter:5/anchor:WRONG"
r = score_case(gold_case, pred)
check(
    "wrong_exact_locator_breaks_linkage",
    r["standing"] == "FAIL_UNLINKED"
    and r["exact_evidence_linkage_rate"] < 1.0
    and not r["middle_book_fact_pass"],
    r,
)

pred = prediction_from_gold()
pred["anchors"][1]["sha256"] = digest("WRONG-MIDDLE-EVIDENCE")
r = score_case(gold_case, pred)
check(
    "wrong_digest_breaks_linkage",
    r["standing"] == "FAIL_UNLINKED"
    and r["exact_evidence_linkage_rate"] < 1.0
    and r["temporal_linkage_rate"] < 1.0,
    r,
)

pred = prediction_from_gold()
pred["anchors"][1]["chapter_index"] = 7
r = score_case(gold_case, pred)
check(
    "middle_book_support_cannot_be_skipped",
    r["standing"] == "FAIL_UNLINKED"
    and not r["middle_book_fact_pass"]
    and not r["middle_book_temporal_pass"],
    r,
)

pred = prediction_from_gold()
pred["temporal_relations"][1]["earlier_event_id"] = "E_PAYOFF"
pred["temporal_relations"][1]["later_event_id"] = "E_TURN"
r = score_case(gold_case, pred)
check(
    "temporal_reversal_detected",
    r["standing"] == "FAIL_UNLINKED"
    and r["temporal_linkage_rate"] == 0.5
    and not r["middle_book_temporal_pass"],
    r,
)

pred = prediction_from_gold()
pred["claims"].append({
    "claim_id": "C_UNSUPPORTED",
    "claim_code": "UNSUPPORTED_GLOBAL_CLAIM",
    "status": "ASSERTED",
    "confidence": 0.95,
    "evidence_anchor_ids": ["A_SETUP"],
    "long_range": False,
})
r = score_case(gold_case, pred)
check(
    "unsupported_asserted_macro_claim_fails_closed",
    r["standing"] == "INVALID"
    and "UNSUPPORTED_ASSERTED_CLAIM:C_UNSUPPORTED" in r["errors"],
    r,
)

pred = prediction_from_gold()
pred["claims"][0]["evidence_anchor_ids"] = ["A_UNKNOWN"]
r = score_case(gold_case, pred)
check(
    "unknown_anchor_reference_fails_closed",
    r["standing"] == "INVALID"
    and "PRED_CLAIM_UNKNOWN_ANCHOR:C_ARC:A_UNKNOWN" in r["errors"],
    r,
)

pred = prediction_from_gold()
for claim in pred["claims"]:
    claim["status"] = "ABSTAIN"
r = score_case(gold_case, pred)
check(
    "abstention_is_preserved_not_manufactured_support",
    r["standing"] == "ABSTAIN_UNRESOLVED"
    and not r["automatic_support_eligible"],
    r,
)

pred = prediction_from_gold()
pred["raw_text"] = "forbidden synthetic prose payload"
r = score_case(gold_case, pred)
check(
    "raw_text_payload_forbidden",
    r["standing"] == "INVALID"
    and r["raw_text_persisted"]
    and any(e.startswith("FORBIDDEN_TEXT_PAYLOAD:") for e in r["errors"]),
    r,
)

pred = prediction_from_gold()
pred["anchors"][0]["sha256"] = "not-a-digest"
r = score_case(gold_case, pred)
check(
    "malformed_anchor_digest_fails_closed",
    r["standing"] == "INVALID"
    and "PRED_SHA256_INVALID:A_SETUP" in r["errors"],
    r,
)

bad_gold = copy.deepcopy(gold_case)
bad_gold["claims"][0]["evidence_anchor_ids"] = ["A_SETUP"]
pred = prediction_from_gold()
pred["claims"][0]["evidence_anchor_ids"] = ["A_SETUP"]
r = score_case(bad_gold, pred)
check(
    "long_range_gold_requires_multichapter_support",
    r["standing"] == "INVALID"
    and "GOLD_LONG_RANGE_SUPPORT_NOT_MULTICHAPTER:C_ARC" in r["errors"],
    r,
)

corpus = score_corpus({"cases": [gold_case]}, {"cases": [prediction_from_gold()]})
check(
    "independent_support_corpus_qualifies",
    corpus["standing"] == "PASS_LINKED"
    and corpus["case_count"] == 1
    and not corpus["whole_book_accuracy_claimed"]
    and not corpus["canonical_state_write_authorized"],
    corpus,
)

bad_corpus = score_corpus({"cases": [gold_case]}, {"cases": []})
check(
    "case_set_mismatch_fails_closed",
    bad_corpus["standing"] == "INVALID" and not bad_corpus["automatic_support_eligible"],
    bad_corpus,
)

all_pass = all(x["pass"] for x in checks)
print(f"LONG FORM EVIDENCE LINKAGE FIXTURES: {'PASS' if all_pass else 'FAIL'} ({len(checks)} cases)")
if not all_pass:
    for item in checks:
        if not item["pass"]:
            print(item)
    raise SystemExit(1)
