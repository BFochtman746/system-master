#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import time
from pathlib import Path

VERSION = "BOOK-EVAL-REPAIR-005-GATE-D-SELECTIVE-120B-v1"
MAX_ESCALATION_RATE = 0.35

HERE = Path(__file__).resolve().parent
V2 = HERE / "generate-repair005-gate-d-teacher-v2.py"
spec = importlib.util.spec_from_file_location("gate_d_teacher_v2", V2)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

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

def extract_json(text):
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.I)
        s = re.sub(r"\s*```$", "", s)
    try:
        return json.loads(s)
    except Exception:
        m = re.search(r"\{.*\}", s, flags=re.S)
        if not m:
            raise
        return json.loads(m.group(0))

def prompt(task_mode, allowed_tokens, input_text):
    tokens = ", ".join(allowed_tokens)
    return f"""{VERSION}
You are the selective fallback judge for a literary-evaluation classifier.
This request contains provider-visible DEVELOPMENT text only. No scoring-private gold answer is supplied.
Classify only the material below. Do not infer from token names alone.

TASK_MODE={task_mode}
ALLOWED_PRIMARY_FINDINGS=[{tokens}]

INPUT:
{input_text}

Return exactly one JSON object:
{{"primary_finding":"ONE_ALLOWED_TOKEN","confidence":0.0}}
No commentary. Confidence must be between 0 and 1."""

def judge(task_mode, allowed_tokens, input_text):
    p = prompt(task_mode, allowed_tokens, input_text)
    last = None
    max_generation_attempts = int(os.environ.get("BOOK_EVAL_SELECTIVE_ATTEMPTS", "4"))
    for generation_try in range(1, max_generation_attempts + 1):
        try:
            root, raw, http_attempt = mod.call(p)
            obj = extract_json(mod.output_text(root))
            pred = str(obj.get("primary_finding", "")).strip()
            if pred not in allowed_tokens:
                raise ValueError("primary_finding outside allowed task taxonomy")
            conf = float(obj.get("confidence", 0.0))
            if not (0.0 <= conf <= 1.0):
                raise ValueError("confidence outside [0,1]")
            return {
                "prediction": pred,
                "confidence": conf,
                "teacher_request_id": root.get("id"),
                "http_attempt": http_attempt,
                "prompt_sha256": mod.sha(p),
                "raw_response_sha256": mod.sha(raw),
                "generation_try": generation_try,
            }
        except Exception as exc:
            last = exc
            if generation_try < max_generation_attempts:
                time.sleep(min(2.0, 0.4 * generation_try))
    raise last

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--predictions", required=True)
    ap.add_argument("--provider", required=True)
    ap.add_argument("--taxonomy", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--manifest", required=True)
    args = ap.parse_args()

    predictions = read_jsonl(args.predictions)
    provider_rows = read_jsonl(args.provider)
    provider = {r["case_id"]: r for r in provider_rows}
    taxonomy = json.loads(Path(args.taxonomy).read_text(encoding="utf-8-sig"))

    if len(predictions) != 80 or len(provider) != 80:
        raise SystemExit("expected exactly 80 source-held-out predictions and 80 provider DEVELOPMENT cases")
    if set(r["case_id"] for r in predictions) != set(provider):
        raise SystemExit("prediction/provider case-id mismatch")

    task_tokens = {}
    for task, task_obj in taxonomy["task_modes"].items():
        toks = []
        for leaves in task_obj["specialists"].values():
            toks.extend(leaves)
        task_tokens[task] = sorted(set(toks))

    ordered = sorted(predictions, key=lambda r: (float(r["student_confidence"]), r["case_id"]))
    max_escalations = min(int(math.floor(MAX_ESCALATION_RATE * len(ordered) + 1e-9)), len(ordered))
    selected = ordered[:max_escalations]

    output_rows = []
    original_calls = 0
    swap_calls = 0
    for rank, r in enumerate(selected, start=1):
        cid = r["case_id"]
        p = provider[cid]
        task = p["task_mode"]
        allowed = task_tokens[task]
        original = judge(task, allowed, p["input_text"])
        original_calls += 1
        row = {
            "case_id": cid,
            "task_mode": task,
            "selection_rank": rank,
            "student_confidence": r["student_confidence"],
            "selection_policy": "bottom_35pct_source_heldout_student_confidence",
            "aggregate": {
                "primary_finding": original["prediction"],
                "confidence": original["confidence"],
            },
            "request_evidence": {
                k: v for k, v in original.items()
                if k not in {"prediction", "confidence"}
            },
            "hidden_holdout_gold_used": False,
            "visible_regression_gold_used": False,
            "development_gold_supplied_to_120b": False,
        }
        if task == "PAIRWISE_COMPARISON":
            swapped_text = swap_pairwise_text(p["input_text"])
            swapped = judge(task, allowed, swapped_text)
            swap_calls += 1
            row["swap_aggregate"] = {
                "primary_finding": swapped["prediction"],
                "confidence": swapped["confidence"],
            }
            row["swap_request_evidence"] = {
                k: v for k, v in swapped.items()
                if k not in {"prediction", "confidence"}
            }
        output_rows.append(row)
        print(f"SELECTIVE-120B {rank}/{max_escalations} case={cid} task={task}", flush=True)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        for row in output_rows:
            f.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")

    manifest = {
        "objective": "BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D",
        "version": VERSION,
        "selection_policy": "bottom_35pct_source_heldout_student_confidence",
        "development_cases": len(ordered),
        "max_escalation_rate": MAX_ESCALATION_RATE,
        "selected_original_cases": len(selected),
        "selected_original_rate": len(selected) / len(ordered),
        "original_120b_calls": original_calls,
        "pairwise_swap_invariance_calls": swap_calls,
        "pairwise_swap_calls_count_toward_escalation_rate": False,
        "fallback_output_sha256": sha256_file(out_path),
        "predictions_sha256": sha256_file(args.predictions),
        "provider_sha256": sha256_file(args.provider),
        "taxonomy_sha256": sha256_file(args.taxonomy),
        "hidden_holdout_gold_used": False,
        "visible_regression_gold_used": False,
        "development_gold_supplied_to_120b": False,
        "raw_provider_packaged": False,
        "raw_gold_packaged": False,
    }
    Path(args.manifest).write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
