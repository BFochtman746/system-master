import json
from independent_evaluator import evaluate


def base(labels=None, orientation_one_confidence="HIGH", orientation_two_confidence="HIGH"):
    return {
        "original_id": "O",
        "challenger_id": "C",
        "blind_labels": {"O": "A", "C": "B"} if labels is None else labels,
        "orientation_one": {
            "left_id": "O", "right_id": "C", "preferred": "RIGHT",
            "confidence": orientation_one_confidence
        },
        "orientation_two": {
            "left_id": "C", "right_id": "O", "preferred": "LEFT",
            "confidence": orientation_two_confidence
        },
        "regressions": [],
        "dimension_results": {"target_improvement": "CHALLENGER_BETTER"},
        "purpose_relevant_dimensions": ["target_improvement"],
        "critical_comparative_dimensions": [],
        "confidence": "HIGH"
    }


cases = [
    ("I-HARD-VALID-SINGLE", base(), "ACCEPT_CANDIDATE", "CONSISTENT_TARGET_IMPROVEMENT"),
    ("I-HARD-VALID-DOUBLE", base({"O": "AA", "C": "BZ"}), "ACCEPT_CANDIDATE", "CONSISTENT_TARGET_IMPROVEMENT"),
    ("I-HARD-MISSING-LABELS", base({}), "ABSTAIN_HUMAN_REVIEW", "BLINDING_BROKEN"),
    ("I-HARD-DUPLICATE-LABELS", base({"O": "A", "C": "A"}), "ABSTAIN_HUMAN_REVIEW", "BLINDING_BROKEN"),
    ("I-HARD-LONG-LABEL", base({"O": "AAA", "C": "B"}), "ABSTAIN_HUMAN_REVIEW", "BLINDING_BROKEN"),
    ("I-HARD-NUMERIC-LABEL", base({"O": "1", "C": "2"}), "ABSTAIN_HUMAN_REVIEW", "BLINDING_BROKEN"),
    ("I-HARD-LOWERCASE-LABEL", base({"O": "a", "C": "b"}), "ABSTAIN_HUMAN_REVIEW", "BLINDING_BROKEN"),
    ("I-HARD-LOW-FORWARD-CONFIDENCE", base(orientation_one_confidence="LOW"), "RETAIN_ORIGINAL", "INSUFFICIENT_CONFIDENCE"),
    ("I-HARD-LOW-SWAP-CONFIDENCE", base(orientation_two_confidence="LOW"), "RETAIN_ORIGINAL", "INSUFFICIENT_CONFIDENCE")
]

results = []
errors = []
for case_id, case, expected_disposition, expected_reason in cases:
    got = evaluate(case)
    passed = got.get("disposition") == expected_disposition and got.get("reason") == expected_reason
    results.append({
        "case_id": case_id,
        "pass": passed,
        "disposition": got.get("disposition"),
        "reason": got.get("reason")
    })
    if not passed:
        errors.append({
            "case_id": case_id,
            "expected_disposition": expected_disposition,
            "expected_reason": expected_reason,
            "got": got
        })

print(json.dumps({"standing": "PASS" if not errors else "FAIL", "results": results, "errors": errors}, indent=2))
if errors:
    raise SystemExit(1)
