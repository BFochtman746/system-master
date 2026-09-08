#!/usr/bin/env python3
import argparse
import importlib.util
import json
import math
import re
from pathlib import Path

from sklearn.model_selection import KFold

VERSION = "BOOK-EVAL-REPAIR-005-GATE-D-SELECTIVE-AUDIT-v1"
SWAP_TOKEN = {
    "CANDIDATE_A_BETTER": "CANDIDATE_B_BETTER",
    "CANDIDATE_B_BETTER": "CANDIDATE_A_BETTER",
    "OBJECTIVELY_SUPERIOR_A": "OBJECTIVELY_SUPERIOR_B",
    "OBJECTIVELY_SUPERIOR_B": "OBJECTIVELY_SUPERIOR_A",
    "TIE": "TIE",
    "LEGITIMATE_TRADEOFF": "LEGITIMATE_TRADEOFF",
}

HERE = Path(__file__).resolve().parent
TRAINER = HERE / "train-repair005-gate-d.py"
spec = importlib.util.spec_from_file_location("gate_d_student_v2", TRAINER)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))

def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8-sig").splitlines() if line.strip()]

def swap_pairwise_text(text):
    replacements = [
        (r"\bCandidate A\b", "__SM_CAND_A__"),
        (r"\bCandidate B\b", "__SM_CAND_B__"),
        (r"\bCANDIDATE_A\b", "__SM_CAND_A_UP__"),
        (r"\bCANDIDATE_B\b", "__SM_CAND_B_UP__"),
    ]
    out = text
    for pat, tmp in replacements:
        out = re.sub(pat, tmp, out)
    out = out.replace("__SM_CAND_A__", "Candidate B").replace("__SM_CAND_B__", "Candidate A")
    out = out.replace("__SM_CAND_A_UP__", "CANDIDATE_B").replace("__SM_CAND_B_UP__", "CANDIDATE_A")
    if out == text:
        raise ValueError("pairwise text did not contain swappable candidate labels")
    return out

def fallback_map(rows):
    out = {}
    for r in rows:
        agg = r.get("aggregate") or {}
        pred = agg.get("primary_finding")
        if not pred:
            continue
        rec = {"prediction": pred, "confidence": agg.get("confidence")}
        swap = r.get("swap_aggregate") or {}
        if swap.get("primary_finding"):
            rec["swap_prediction"] = swap["primary_finding"]
        out[r["case_id"]] = rec
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--training", required=True)
    ap.add_argument("--teacher", required=True)
    ap.add_argument("--provider", required=True)
    ap.add_argument("--gold", required=True)
    ap.add_argument("--taxonomy", required=True)
    ap.add_argument("--phase1-metrics", required=True)
    ap.add_argument("--phase1-predictions", required=True)
    ap.add_argument("--fallback120b", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    phase1 = read_json(args.phase1_metrics)
    if not phase1.get("gate_d_student_advancement_pass"):
        raise SystemExit("student advancement gate did not pass; selective audit is forbidden")
    if int(phase1.get("base_training_records", -1)) != 612:
        raise SystemExit("phase1 base training count drift")
    if int(phase1.get("teacher_synthetic_records", -1)) != 440:
        raise SystemExit("phase1 teacher count drift")
    if int(phase1.get("combined_training_records", -1)) != 1052:
        raise SystemExit("phase1 combined training count drift")

    predictions = read_jsonl(args.phase1_predictions)
    if len(predictions) != 80:
        raise SystemExit("expected 80 phase1 source-held-out predictions")
    by_pred = {r["case_id"]: r for r in predictions}
    if len(by_pred) != 80:
        raise SystemExit("duplicate phase1 prediction case ID")

    fallback_rows = read_jsonl(args.fallback120b)
    fallback = fallback_map(fallback_rows)
    ordered = sorted(predictions, key=lambda r: (float(r["student_confidence"]), r["case_id"]))
    maxk = int(math.floor(mod.MAX_ESCALATION_RATE * len(ordered) + 1e-9))
    eligible_ids = [r["case_id"] for r in ordered[:maxk]]
    if len(fallback) != maxk or set(fallback) != set(eligible_ids):
        raise SystemExit("fallback must contain exactly the bottom-35% eligible source-held-out cases")

    base = read_jsonl(args.training)
    teacher_raw = read_jsonl(args.teacher)
    provider_rows = read_jsonl(args.provider)
    provider = {r["case_id"]: r for r in provider_rows}
    gold = read_jsonl(args.gold)
    dev = sorted([g for g in gold if g["split"] == "DEVELOPMENT"], key=lambda r: r["case_id"])
    tax = read_json(args.taxonomy)
    token_to_sp, _, all_tokens, specialist_task = mod.taxonomy_maps(tax)
    teacher = mod.teacher_to_training(teacher_raw, token_to_sp, all_tokens)

    if len(base) != 612 or len(teacher) != 440 or len(dev) != 80 or len(provider) != 80:
        raise SystemExit("Gate D input cardinality drift")
    dev_ids = [g["case_id"] for g in dev]
    if set(dev_ids) != set(provider) or set(dev_ids) != set(by_pred):
        raise SystemExit("Gate D case ID drift")

    swapped_prediction = {}
    cv = KFold(n_splits=5, shuffle=True, random_state=mod.RANDOM_STATE)
    for _, test_idx in cv.split(dev_ids):
        test = {dev_ids[i] for i in test_idx}
        fold_base = [
            r for r in base
            if r["source_lane"] == "SYNTHETIC" or r["provenance"]["source_id"] not in test
        ]
        fv, fr, fl = mod.fit_models(fold_base + teacher)
        for cid in sorted(test):
            p = provider[cid]
            if p["task_mode"] != "PAIRWISE_COMPARISON":
                continue
            swapped = dict(p)
            swapped["input_text"] = swap_pairwise_text(p["input_text"])
            _, pred, _, _, _ = mod.predict(fv, fr, fl, swapped)
            swapped_prediction[cid] = pred

    pairwise_ids = sorted(cid for cid, p in provider.items() if p["task_mode"] == "PAIRWISE_COMPARISON")
    if set(swapped_prediction) != set(pairwise_ids):
        raise SystemExit("failed to reconstruct all pairwise swap predictions")

    best = None
    first_passing = None
    for k in range(maxk + 1):
        esc = set(eligible_ids[:k])
        combined = {}
        correct = 0
        auto_correct = 0
        auto_n = 0
        clean_correct = 0
        clean_n = 0
        hard = 0

        for r in predictions:
            cid = r["case_id"]
            use_fallback = cid in esc
            pred = fallback[cid]["prediction"] if use_fallback else r["predicted_leaf"]
            combined[cid] = pred
            is_correct = pred == r["true_leaf"]
            correct += int(is_correct)
            if not use_fallback:
                auto_n += 1
                auto_correct += int(is_correct)
            if r["clean_control"]:
                clean_n += 1
                clean_correct += int(is_correct)
            if pred in r.get("prohibited_findings", []):
                hard += 1

        symmetric = 0
        missing_swap_fallback = []
        for cid in pairwise_ids:
            expected = SWAP_TOKEN.get(combined[cid])
            if cid in esc:
                swap_pred = fallback[cid].get("swap_prediction")
                if swap_pred is None:
                    missing_swap_fallback.append(cid)
                    continue
            else:
                swap_pred = swapped_prediction[cid]
            symmetric += int(expected is not None and swap_pred == expected)

        accuracy = correct / len(predictions)
        auto_coverage = auto_n / len(predictions)
        auto_accuracy = auto_correct / auto_n if auto_n else 1.0
        clean_accuracy = clean_correct / clean_n if clean_n else 1.0
        symmetry_rate = symmetric / len(pairwise_ids) if pairwise_ids else 1.0
        symmetry_pass = symmetry_rate == 1.0 and not missing_swap_fallback
        target = (
            accuracy >= mod.TARGET_HYBRID_ACCURACY
            and k / len(predictions) <= mod.MAX_ESCALATION_RATE
            and auto_coverage >= mod.MIN_AUTO_COVERAGE
            and auto_accuracy >= mod.MIN_AUTO_ACCURACY
            and clean_accuracy >= mod.CLEAN_GATE
            and hard == 0
            and symmetry_pass
        )
        rec = {
            "accuracy": accuracy,
            "count": k,
            "rate": k / len(predictions),
            "automatic_accuracy": auto_accuracy,
            "automatic_coverage": auto_coverage,
            "clean_control_accuracy": clean_accuracy,
            "hard_gate_violations": hard,
            "pairwise_swap_cases": len(pairwise_ids),
            "pairwise_swap_symmetric_cases": symmetric,
            "pairwise_swap_symmetry_rate": symmetry_rate,
            "pairwise_swap_symmetry_pass": symmetry_pass,
            "pairwise_swap_missing_fallback_case_ids": missing_swap_fallback,
            "target_met": target,
        }
        score = (target, symmetry_pass, accuracy, auto_accuracy, -k)
        if best is None or score > best[0]:
            best = (score, rec)
        if target and first_passing is None:
            first_passing = rec

    hybrid = dict(best[1])
    hybrid["eligible_cases"] = maxk
    hybrid["available_cases"] = len(fallback)
    hybrid["first_passing_policy"] = first_passing

    final = dict(phase1)
    final.update({
        "selective_audit_version": VERSION,
        "selective_hybrid": hybrid,
        "gate_d_selective_target_pass": bool(hybrid["target_met"]),
        "gate_d_pass": bool(phase1["gate_d_student_advancement_pass"] and hybrid["target_met"]),
        "visible_regression_allowed": bool(phase1["gate_d_student_advancement_pass"] and hybrid["target_met"]),
        "visible_regression_used": False,
        "hidden_holdout_used": False,
        "fallback120b_sha256": mod.sha256_file(args.fallback120b),
        "pairwise_swap_source_heldout_reconstructed": True,
    })
    Path(args.output).write_text(json.dumps(final, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(final, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
