from __future__ import annotations

import math

FORBIDDEN_TEXT_KEYS = {
    "raw_text", "quoted_text", "manuscript_text", "source_text", "passage_text",
    "candidate_text", "revision_text", "source_excerpt", "quote",
}
ALLOWED_STATUSES = {"ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"}


def _finite01(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0.0 <= value <= 1.0


def _digest_ok(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value.lower())


def _forbidden(value, path="$", out=None):
    out = out if out is not None else []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if str(key).lower() in FORBIDDEN_TEXT_KEYS and child not in (None, "", [], {}):
                out.append(child_path)
            _forbidden(child, child_path, out)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            _forbidden(child, f"{path}[{i}]", out)
    return out


def _middle_bounds(chapter_count):
    if not isinstance(chapter_count, int) or isinstance(chapter_count, bool) or chapter_count < 3:
        raise ValueError("chapter_count must be integer >= 3")
    return chapter_count // 3 + 1, (2 * chapter_count + 2) // 3


def _validate_anchor_map(records, chapter_count, prefix, errors):
    out = {}
    for i, raw in enumerate(records or []):
        if not isinstance(raw, dict):
            errors.append(f"{prefix}_ANCHOR_OBJECT_REQUIRED:{i}")
            continue
        anchor_id = raw.get("anchor_id")
        locator_id = raw.get("locator_id")
        digest = raw.get("sha256")
        chapter = raw.get("chapter_index")
        if not isinstance(anchor_id, str) or not anchor_id:
            errors.append(f"{prefix}_ANCHOR_ID_REQUIRED:{i}")
            continue
        if anchor_id in out:
            errors.append(f"{prefix}_ANCHOR_ID_DUPLICATE:{anchor_id}")
            continue
        if not isinstance(locator_id, str) or not locator_id:
            errors.append(f"{prefix}_LOCATOR_REQUIRED:{anchor_id}")
        if not _digest_ok(digest):
            errors.append(f"{prefix}_SHA256_INVALID:{anchor_id}")
        if not isinstance(chapter, int) or isinstance(chapter, bool) or not 1 <= chapter <= chapter_count:
            errors.append(f"{prefix}_CHAPTER_INDEX_INVALID:{anchor_id}")
        for field in ("event_ids", "fact_ids"):
            values = raw.get(field, [])
            if not isinstance(values, list) or any(not isinstance(x, str) or not x for x in values):
                errors.append(f"{prefix}_{field.upper()}_INVALID:{anchor_id}")
        out[anchor_id] = raw
    return out


def _validate_claim_map(records, prefix, errors):
    out = {}
    for i, raw in enumerate(records or []):
        if not isinstance(raw, dict):
            errors.append(f"{prefix}_CLAIM_OBJECT_REQUIRED:{i}")
            continue
        claim_id = raw.get("claim_id")
        if not isinstance(claim_id, str) or not claim_id:
            errors.append(f"{prefix}_CLAIM_ID_REQUIRED:{i}")
            continue
        if claim_id in out:
            errors.append(f"{prefix}_CLAIM_ID_DUPLICATE:{claim_id}")
            continue
        if not isinstance(raw.get("claim_code"), str) or not raw.get("claim_code"):
            errors.append(f"{prefix}_CLAIM_CODE_REQUIRED:{claim_id}")
        status = raw.get("status", "ASSERTED")
        if status not in ALLOWED_STATUSES:
            errors.append(f"{prefix}_CLAIM_STATUS_INVALID:{claim_id}")
        if not _finite01(raw.get("confidence", 1.0)):
            errors.append(f"{prefix}_CLAIM_CONFIDENCE_INVALID:{claim_id}")
        refs = raw.get("evidence_anchor_ids", [])
        if not isinstance(refs, list) or any(not isinstance(x, str) or not x for x in refs):
            errors.append(f"{prefix}_CLAIM_ANCHORS_INVALID:{claim_id}")
        if not isinstance(raw.get("long_range", False), bool):
            errors.append(f"{prefix}_CLAIM_LONG_RANGE_INVALID:{claim_id}")
        out[claim_id] = raw
    return out


def _validate_temporal_map(records, prefix, errors):
    out = {}
    for i, raw in enumerate(records or []):
        if not isinstance(raw, dict):
            errors.append(f"{prefix}_TEMPORAL_OBJECT_REQUIRED:{i}")
            continue
        relation_id = raw.get("relation_id")
        if not isinstance(relation_id, str) or not relation_id:
            errors.append(f"{prefix}_TEMPORAL_ID_REQUIRED:{i}")
            continue
        if relation_id in out:
            errors.append(f"{prefix}_TEMPORAL_ID_DUPLICATE:{relation_id}")
            continue
        earlier = raw.get("earlier_event_id")
        later = raw.get("later_event_id")
        if not isinstance(earlier, str) or not earlier or not isinstance(later, str) or not later or earlier == later:
            errors.append(f"{prefix}_TEMPORAL_EVENTS_INVALID:{relation_id}")
        refs = raw.get("evidence_anchor_ids", [])
        if not isinstance(refs, list) or any(not isinstance(x, str) or not x for x in refs):
            errors.append(f"{prefix}_TEMPORAL_ANCHORS_INVALID:{relation_id}")
        out[relation_id] = raw
    return out


def _anchor_exact(gold_anchor, pred_anchor):
    return (
        pred_anchor is not None
        and pred_anchor.get("locator_id") == gold_anchor.get("locator_id")
        and pred_anchor.get("sha256") == gold_anchor.get("sha256")
        and pred_anchor.get("chapter_index") == gold_anchor.get("chapter_index")
    )


def score_case(gold_case, prediction_case):
    errors = []
    forbidden = _forbidden({"gold": gold_case, "prediction": prediction_case})
    errors.extend(f"FORBIDDEN_TEXT_PAYLOAD:{p}" for p in forbidden)
    if not isinstance(gold_case, dict) or not isinstance(prediction_case, dict):
        return {"standing": "INVALID", "errors": ["CASE_OBJECT_REQUIRED"], "automatic_support_eligible": False}
    if gold_case.get("case_id") != prediction_case.get("case_id"):
        errors.append("CASE_ID_MISMATCH")
    chapter_count = gold_case.get("chapter_count")
    if prediction_case.get("chapter_count") != chapter_count:
        errors.append("CHAPTER_COUNT_MISMATCH")
    try:
        middle_start, middle_end = _middle_bounds(chapter_count)
    except ValueError:
        errors.append("CHAPTER_COUNT_INVALID")
        middle_start, middle_end = None, None
        chapter_count = 3

    gold_anchors = _validate_anchor_map(gold_case.get("anchors"), chapter_count, "GOLD", errors)
    pred_anchors = _validate_anchor_map(prediction_case.get("anchors"), chapter_count, "PRED", errors)
    gold_claims = _validate_claim_map(gold_case.get("claims"), "GOLD", errors)
    pred_claims = _validate_claim_map(prediction_case.get("claims"), "PRED", errors)
    gold_temporal = _validate_temporal_map(gold_case.get("temporal_relations"), "GOLD", errors)
    pred_temporal = _validate_temporal_map(prediction_case.get("temporal_relations"), "PRED", errors)

    for prefix, claims, anchors in (("GOLD", gold_claims, gold_anchors), ("PRED", pred_claims, pred_anchors)):
        for claim_id, claim in claims.items():
            for ref in claim.get("evidence_anchor_ids", []):
                if ref not in anchors:
                    errors.append(f"{prefix}_CLAIM_UNKNOWN_ANCHOR:{claim_id}:{ref}")
    for prefix, relations, anchors in (("GOLD", gold_temporal, gold_anchors), ("PRED", pred_temporal, pred_anchors)):
        for relation_id, relation in relations.items():
            for ref in relation.get("evidence_anchor_ids", []):
                if ref not in anchors:
                    errors.append(f"{prefix}_TEMPORAL_UNKNOWN_ANCHOR:{relation_id}:{ref}")

    pred_asserted_ids = {cid for cid, c in pred_claims.items() if c.get("status", "ASSERTED") == "ASSERTED"}
    false_support_ids = sorted(pred_asserted_ids - set(gold_claims))
    if false_support_ids:
        errors.extend(f"UNSUPPORTED_ASSERTED_CLAIM:{cid}" for cid in false_support_ids)

    claim_reports = []
    correct_claims = 0
    exact_linked_claims = 0
    for claim_id, gold in gold_claims.items():
        pred = pred_claims.get(claim_id)
        macro_correct = bool(
            pred
            and pred.get("status", "ASSERTED") == "ASSERTED"
            and pred.get("claim_code") == gold.get("claim_code")
        )
        if macro_correct:
            correct_claims += 1
        gold_refs = list(gold.get("evidence_anchor_ids", []))
        pred_refs = list(pred.get("evidence_anchor_ids", [])) if pred else []
        refs_exact = set(pred_refs) == set(gold_refs) and len(pred_refs) == len(set(pred_refs))
        anchors_exact = bool(gold_refs) and all(
            ref in gold_anchors and _anchor_exact(gold_anchors[ref], pred_anchors.get(ref))
            for ref in gold_refs
        )
        long_range_ok = True
        if gold.get("long_range", False):
            chapters = {gold_anchors[r].get("chapter_index") for r in gold_refs if r in gold_anchors}
            long_range_ok = len(chapters) >= 2
            if not long_range_ok:
                errors.append(f"GOLD_LONG_RANGE_SUPPORT_NOT_MULTICHAPTER:{claim_id}")
        exact_linked = macro_correct and refs_exact and anchors_exact and long_range_ok
        if exact_linked:
            exact_linked_claims += 1
        claim_reports.append({
            "claim_id": claim_id,
            "macro_correct": macro_correct,
            "anchor_refs_exact": refs_exact,
            "anchor_bindings_exact": anchors_exact,
            "long_range_support_ok": long_range_ok,
            "exact_linked": exact_linked,
        })

    temporal_reports = []
    exact_temporal = 0
    for relation_id, gold in gold_temporal.items():
        pred = pred_temporal.get(relation_id)
        refs = list(gold.get("evidence_anchor_ids", []))
        pred_refs = list(pred.get("evidence_anchor_ids", [])) if pred else []
        relation_exact = bool(
            pred
            and pred.get("earlier_event_id") == gold.get("earlier_event_id")
            and pred.get("later_event_id") == gold.get("later_event_id")
            and set(pred_refs) == set(refs)
            and len(pred_refs) == len(set(pred_refs))
        )
        anchors_exact = bool(refs) and all(
            r in gold_anchors and _anchor_exact(gold_anchors[r], pred_anchors.get(r))
            for r in refs
        )
        grounded_events = set()
        for ref in refs:
            if ref in gold_anchors:
                grounded_events.update(gold_anchors[ref].get("event_ids", []))
        event_grounded = gold.get("earlier_event_id") in grounded_events and gold.get("later_event_id") in grounded_events
        exact = relation_exact and anchors_exact and event_grounded
        if exact:
            exact_temporal += 1
        temporal_reports.append({
            "relation_id": relation_id,
            "relation_exact": relation_exact,
            "anchor_bindings_exact": anchors_exact,
            "event_grounded": event_grounded,
            "exact_linked": exact,
        })

    middle = gold_case.get("middle_book_slice") or {}
    middle_required = bool(middle.get("required"))
    middle_fact_pass = True
    middle_temporal_pass = True
    if middle_required and middle_start is not None:
        fact_claim_ids = middle.get("fact_claim_ids") or []
        temporal_ids = middle.get("temporal_relation_ids") or []
        if not fact_claim_ids:
            errors.append("MIDDLE_BOOK_FACT_CLAIM_REQUIRED")
            middle_fact_pass = False
        if not temporal_ids:
            errors.append("MIDDLE_BOOK_TEMPORAL_RELATION_REQUIRED")
            middle_temporal_pass = False

        middle_anchor_ids = {
            aid for aid, a in gold_anchors.items()
            if middle_start <= a.get("chapter_index", -1) <= middle_end
        }
        for claim_id in fact_claim_ids:
            gold = gold_claims.get(claim_id)
            report = next((r for r in claim_reports if r["claim_id"] == claim_id), None)
            refs = set(gold.get("evidence_anchor_ids", [])) if gold else set()
            fact_ids = set()
            for ref in refs & middle_anchor_ids:
                fact_ids.update(gold_anchors[ref].get("fact_ids", []))
            if not gold or not report or not report["exact_linked"] or not (refs & middle_anchor_ids) or not fact_ids:
                middle_fact_pass = False
        for relation_id in temporal_ids:
            gold = gold_temporal.get(relation_id)
            report = next((r for r in temporal_reports if r["relation_id"] == relation_id), None)
            refs = set(gold.get("evidence_anchor_ids", [])) if gold else set()
            if not gold or not report or not report["exact_linked"] or not (refs & middle_anchor_ids):
                middle_temporal_pass = False

    claim_count = len(gold_claims)
    temporal_count = len(gold_temporal)
    macro_claim_accuracy = 1.0 if claim_count == 0 else correct_claims / claim_count
    exact_evidence_linkage_rate = 1.0 if claim_count == 0 else exact_linked_claims / claim_count
    temporal_linkage_rate = 1.0 if temporal_count == 0 else exact_temporal / temporal_count

    all_pred_nonassertive = bool(pred_claims) and not any(
        c.get("status", "ASSERTED") == "ASSERTED" for c in pred_claims.values()
    )
    passes = (
        not errors
        and macro_claim_accuracy == 1.0
        and exact_evidence_linkage_rate == 1.0
        and temporal_linkage_rate == 1.0
        and middle_fact_pass
        and middle_temporal_pass
    )
    if errors:
        standing = "INVALID"
    elif passes:
        standing = "PASS_LINKED"
    elif all_pred_nonassertive:
        standing = "ABSTAIN_UNRESOLVED"
    else:
        standing = "FAIL_UNLINKED"

    return {
        "case_id": gold_case.get("case_id"),
        "standing": standing,
        "errors": sorted(set(errors)),
        "macro_claim_accuracy": round(macro_claim_accuracy, 6),
        "exact_evidence_linkage_rate": round(exact_evidence_linkage_rate, 6),
        "temporal_linkage_rate": round(temporal_linkage_rate, 6),
        "middle_book_bounds": None if middle_start is None else [middle_start, middle_end],
        "middle_book_fact_pass": middle_fact_pass,
        "middle_book_temporal_pass": middle_temporal_pass,
        "claim_reports": claim_reports,
        "temporal_reports": temporal_reports,
        "false_support_claim_ids": false_support_ids,
        "automatic_support_eligible": standing == "PASS_LINKED",
        "whole_book_accuracy_claimed": False,
        "revision_authorized": False,
        "canonical_state_write_authorized": False,
        "raw_text_persisted": bool(forbidden),
    }


def score_corpus(gold_payload, prediction_payload):
    gold_cases = {c.get("case_id"): c for c in gold_payload.get("cases", [])}
    pred_cases = {c.get("case_id"): c for c in prediction_payload.get("cases", [])}
    if None in gold_cases or None in pred_cases:
        return {"standing": "INVALID", "errors": ["CASE_ID_REQUIRED"], "automatic_support_eligible": False}
    if set(gold_cases) != set(pred_cases):
        return {
            "standing": "INVALID",
            "errors": [
                f"CASE_SET_MISMATCH:missing={sorted(set(gold_cases)-set(pred_cases))}:extra={sorted(set(pred_cases)-set(gold_cases))}"
            ],
            "automatic_support_eligible": False,
        }
    reports = [score_case(gold_cases[cid], pred_cases[cid]) for cid in sorted(gold_cases)]
    standing = "PASS_LINKED" if reports and all(r["standing"] == "PASS_LINKED" for r in reports) else "NOT_QUALIFIED"
    return {
        "contract_id": "PROSE-LONG-FORM-EVIDENCE-LINKAGE-001-v1",
        "standing": standing,
        "case_count": len(reports),
        "cases": reports,
        "automatic_support_eligible": standing == "PASS_LINKED",
        "whole_book_accuracy_claimed": False,
        "revision_authorized": False,
        "canonical_state_write_authorized": False,
    }
