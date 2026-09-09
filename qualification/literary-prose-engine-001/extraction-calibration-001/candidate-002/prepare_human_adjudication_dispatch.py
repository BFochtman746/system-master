from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

from prepare_prehuman_custody import CASES, fetch_bytes, paragraph_bounds, sha256

HERE = Path(__file__).resolve().parent
HIGH_RISK_TASKS = {
    "EVENT_IDENTITY",
    "STORY_VS_DISCOURSE_TIME",
    "CAUSAL_GOAL_RELATIONS",
    "EPISTEMIC_FOCALIZATION",
    "SETUP_PAYOFF_OPEN_QUESTION",
    "ARC_ORCHESTRATION",
}
ALLOWED_STATUSES = ["ASSERTED", "ALTERNATIVE", "UNRESOLVED", "ABSTAIN"]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def case_lookup() -> dict[str, dict]:
    return {case["selection_case_id"]: case for case in CASES}


def build_span_helper(passages: dict[str, str], output_path: Path) -> None:
    passage_json = json.dumps(passages, ensure_ascii=False).replace("</", "<\\/")
    page = f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>Candidate-002 Source-Bound Span Helper</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:960px;margin:0 auto;padding:20px;line-height:1.45}}
pre{{white-space:pre-wrap;border:1px solid #bbb;border-radius:10px;padding:16px;max-height:60vh;overflow:auto}}
.controls{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}} select,button,input{{font:inherit;padding:8px}} #result{{font-family:ui-monospace,SFMono-Regular,monospace;font-weight:600}}
.note{{font-size:.92rem}}
</style>
</head>
<body>
<h1>Candidate-002 Source-Bound Span Helper</h1>
<p class=\"note\">Use only for locating source spans. This tool contains no model predictions and no gold. Offsets are Unicode code-point indices in the exact UTF-8 decoded passage, end-exclusive.</p>
<div class=\"controls\"><label>Case <select id=\"case\"></select></label><label>Kind <select id=\"kind\"><option>A</option><option>C</option><option>EV</option><option>G</option><option>Q</option><option>M</option><option>P</option></select></label><button id=\"capture\">Capture selected text</button></div>
<div>Span ID: <span id=\"result\">Select text in the passage.</span></div>
<pre id=\"passage\"></pre>
<script>
const passages={passage_json};
const caseSelect=document.getElementById('case');
const passage=document.getElementById('passage');
const result=document.getElementById('result');
for(const id of Object.keys(passages)){{const o=document.createElement('option');o.value=id;o.textContent=id;caseSelect.appendChild(o);}}
function loadCase(){{passage.textContent=passages[caseSelect.value];result.textContent='Select text in the passage.';}}
caseSelect.addEventListener('change',loadCase);loadCase();
function codepoints(s){{return Array.from(s).length;}}
document.getElementById('capture').addEventListener('click',()=>{{
  const sel=window.getSelection();
  if(!sel || sel.rangeCount===0){{result.textContent='No selection.';return;}}
  const range=sel.getRangeAt(0);
  if(!passage.contains(range.startContainer) || !passage.contains(range.endContainer)){{result.textContent='Selection must be inside the passage.';return;}}
  const before=document.createRange();before.selectNodeContents(passage);before.setEnd(range.startContainer,range.startOffset);
  const start=codepoints(before.toString());const end=start+codepoints(range.toString());
  if(start>=end){{result.textContent='Selection must contain text.';return;}}
  result.textContent=document.getElementById('kind').value+start+'-'+end;
}});
</script>
</body></html>"""
    output_path.write_text(page, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    output = Path(args.output_dir)
    passages_dir = output / "passages"
    reviewer_a = output / "reviewer-A"
    reviewer_b = output / "reviewer-B"
    blank_packets = output / "blank-completed-packets"
    for path in (passages_dir, reviewer_a, reviewer_b, blank_packets):
        path.mkdir(parents=True, exist_ok=True)

    closure = load_json(HERE / "SOURCE-HELDOUT-002A-HOSTED-CLOSURE-v1.json")
    ontology = load_json(HERE / "SOURCE-HELDOUT-002-LABEL-ONTOLOGY-v1.json")
    manifest = load_json(HERE / "PUBLIC-DOMAIN-SOURCE-HELDOUT-MANIFEST-v1.json")
    cases = case_lookup()
    source_urls = {work["work_id"]: work["source_url"] for work in manifest["works"]}
    closure_cases = {case["selection_case_id"]: case for case in closure["cases"]}

    source_cache: dict[str, bytes] = {}
    passages: dict[str, str] = {}
    assignment_manifest: list[dict] = []
    reviewer_a_count = 0
    reviewer_b_count = 0

    for case_id, frozen in closure_cases.items():
        case = cases[case_id]
        data = source_cache.setdefault(case["text_url"], fetch_bytes(case["text_url"]))
        start, end = paragraph_bounds(
            data,
            case["start_anchor"].encode("utf-8"),
            case["end_anchor"].encode("utf-8"),
        )
        passage_bytes = data[start:end]
        if sha256(data) != frozen["source_file_sha256"]:
            raise RuntimeError(f"source file digest drift for {case_id}")
        if sha256(passage_bytes) != frozen["passage_sha256"]:
            raise RuntimeError(f"passage digest drift for {case_id}")
        if start != frozen["byte_start"] or end != frozen["byte_end_exclusive"]:
            raise RuntimeError(f"passage byte locator drift for {case_id}")
        passage_text = passage_bytes.decode("utf-8", errors="strict")
        passages[case_id] = passage_text
        (passages_dir / f"{case_id}.txt").write_text(passage_text, encoding="utf-8", newline="")

        for task in frozen["tasks"]:
            packet_id = f"{case_id}--{task}"
            packet = {
                "packet_id": packet_id,
                "selection_case_id": case_id,
                "work_id": frozen["work_id"],
                "source_url": source_urls[frozen["work_id"]],
                "source_sha256": frozen["passage_sha256"],
                "passage_char_length": len(passage_text),
                "passage_locator": {
                    "selection_case_id": case_id,
                    "source_file_byte_start": frozen["byte_start"],
                    "source_file_byte_end_exclusive": frozen["byte_end_exclusive"],
                    "source_file_sha256": frozen["source_file_sha256"],
                },
                "task": task,
                "adjudicators": [],
                "gold_labels": [],
                "forbidden_labels": [],
                "intentionally_ambiguous": None,
                "allowed_statuses": ALLOWED_STATUSES,
                "adjudication_notes_digest": None,
                "model_input_contains_gold": False,
                "standing": "BLANK__HUMAN_COMPLETION_REQUIRED",
            }
            write_json(blank_packets / f"{packet_id}.json", packet)

            grammars = ontology["task_grammars"][task]
            common = (
                f"# {packet_id}\n\n"
                f"**Work:** {frozen['work_id']}  \n"
                f"**Task:** `{task}`  \n"
                f"**Passage SHA-256:** `{frozen['passage_sha256']}`  \n"
                f"**Passage file:** `../passages/{case_id}.txt`  \n"
                f"**Stress slice:** {case['stress_slice']}\n\n"
                "## Blind-review rules\n\n"
                "- Do not view Candidate-002/model predictions or confidence.\n"
                "- Do not view another adjudicator's labels until your independent review is frozen.\n"
                "- Preserve uncertainty with `ALTERNATIVE`, `UNRESOLVED`, or `ABSTAIN`; do not invent consensus.\n"
                "- Use `SPAN-HELPER.html` to obtain Unicode code-point source spans.\n"
                "- Return canonical labels only; no free-form semantic labels.\n\n"
                "## Allowed label grammars\n\n" + "\n".join(f"- `{grammar}`" for grammar in grammars) + "\n\n"
                "## Human output\n\n"
                "Record your independent labels/statuses, any contradicted/forbidden labels, ambiguity state, and evaluator-only notes. "
                "Freeze your review before sharing it with the other reviewer or the human resolver.\n"
            )
            (reviewer_a / f"{packet_id}.md").write_text(common, encoding="utf-8")
            reviewer_a_count += 1
            assignment_manifest.append({"reviewer": "A", "packet_id": packet_id, "task": task, "high_risk": task in HIGH_RISK_TASKS})
            if task in HIGH_RISK_TASKS:
                (reviewer_b / f"{packet_id}.md").write_text(common, encoding="utf-8")
                reviewer_b_count += 1
                assignment_manifest.append({"reviewer": "B", "packet_id": packet_id, "task": task, "high_risk": True})

    build_span_helper(passages, output / "SPAN-HELPER.html")
    instructions = """# Candidate-002 Human Adjudication Dispatch

This package contains **public-domain heldout source passages and blank review materials only**. It contains no Candidate-002 predictions and no human gold.

## Reviewer separation

- Reviewer A completes all 18 task assignments.
- Reviewer B is a **different human** and completes the 12 high-risk task assignments in `reviewer-B/`.
- Neither reviewer may see model predictions, model confidence, or the other reviewer's labels before freezing their own review.
- Do not use the model/system under test to author or resolve the labels.

## Source-bound labels

Open `SPAN-HELPER.html`, choose the case, select the shortest source phrase sufficient to identify an item, choose its span kind, and capture the code-point range. Compose labels only from the task grammars shown in the assignment file.

## After independent reviews

A human resolver/adjudicator compares the frozen independent reviews using source evidence. Disagreement that cannot be resolved remains explicit `UNRESOLVED` or multiple `ALTERNATIVE` labels. The resolver fills the matching file in `blank-completed-packets/`, including distinct reviewer IDs and review digests, then computes the evaluator-only adjudication-notes SHA-256 digest.

Do not score Candidate-002 until all completed packets pass the repository validator and a real model prediction set has been frozen with gold hidden.
"""
    (output / "INSTRUCTIONS.md").write_text(instructions, encoding="utf-8")

    dispatch = {
        "dispatch_id": "LITERARY-EXTRACTION-SOURCE-HELD-OUT-002B-HUMAN-DISPATCH-v1",
        "standing": "READY_FOR_INDEPENDENT_HUMAN_REVIEW__NO_GOLD__NO_MODEL_PREDICTIONS",
        "case_count": len(passages),
        "completed_packet_template_count": len(list(blank_packets.glob("*.json"))),
        "reviewer_a_assignment_count": reviewer_a_count,
        "reviewer_b_assignment_count": reviewer_b_count,
        "total_independent_review_assignments": len(assignment_manifest),
        "expected_completed_packet_count": 18,
        "high_risk_second_reviews": reviewer_b_count,
        "model_predictions_in_package": False,
        "human_gold_in_package": False,
        "raw_passages_are_public_domain_dispatch_material_not_repository_evidence": True,
        "assignments": assignment_manifest,
    }
    write_json(output / "DISPATCH-MANIFEST.json", dispatch)
    print(json.dumps({
        "result": "PASS",
        "case_count": dispatch["case_count"],
        "blank_packet_count": dispatch["completed_packet_template_count"],
        "reviewer_a": reviewer_a_count,
        "reviewer_b": reviewer_b_count,
        "total_review_assignments": dispatch["total_independent_review_assignments"],
        "gold_included": False,
        "model_predictions_included": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
