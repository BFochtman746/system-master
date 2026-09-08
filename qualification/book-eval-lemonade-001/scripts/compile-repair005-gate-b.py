#!/usr/bin/env python3
import argparse, hashlib, json, pathlib, re
from collections import Counter, defaultdict
from jsonschema import Draft202012Validator

RIGHTS_CLASS = "USER_OWNED_OR_AUTHORIZED"
SWAP_TOKEN = {
    "CANDIDATE_A_BETTER":"CANDIDATE_B_BETTER",
    "CANDIDATE_B_BETTER":"CANDIDATE_A_BETTER",
    "OBJECTIVELY_SUPERIOR_A":"OBJECTIVELY_SUPERIOR_B",
    "OBJECTIVELY_SUPERIOR_B":"OBJECTIVELY_SUPERIOR_A",
    "TIE":"TIE",
    "LEGITIMATE_TRADEOFF":"LEGITIMATE_TRADEOFF",
}
FALLBACK_NEIGHBORS = {
    "NO_MATERIAL_PROBLEM": ["MINOR_STYLE_ISSUE"],
    "VOICE_PRESERVATION_DAMAGE": ["MEANING_PRESERVATION_DAMAGE", "INTENT_PRESERVATION_DAMAGE", "SAFE_EDIT"],
    "CANON_PRESERVATION_DAMAGE": ["MEANING_PRESERVATION_DAMAGE", "INTENT_PRESERVATION_DAMAGE", "SAFE_EDIT"],
    "PROTECTED_LANGUAGE_DAMAGE": ["MEANING_PRESERVATION_DAMAGE", "INTENT_PRESERVATION_DAMAGE", "SAFE_EDIT"],
    "PRESERVATION_DAMAGE": ["MEANING_PRESERVATION_DAMAGE", "INTENT_PRESERVATION_DAMAGE", "VOICE_PRESERVATION_DAMAGE"],
}

def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def sha256_text(s: str) -> str:
    return sha256_bytes(s.encode("utf-8"))

def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8-sig"))

def read_jsonl(path):
    return [json.loads(line) for line in pathlib.Path(path).read_text(encoding="utf-8-sig").splitlines() if line.strip()]

def stable_id(*parts):
    return "CTR-" + sha256_text("\x1f".join(parts))[:24].upper()

def swap_pairwise_text(text: str) -> str:
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

def build_token_maps(taxonomy):
    token_to_spec = {}
    mode_tokens = defaultdict(set)
    for mode, mode_obj in taxonomy["task_modes"].items():
        for spec, leaves in mode_obj["specialists"].items():
            for token in leaves:
                key = (mode, token)
                if key in token_to_spec:
                    raise ValueError(f"duplicate token assignment {key}")
                token_to_spec[key] = spec
                mode_tokens[mode].add(token)
    return token_to_spec, mode_tokens

def curriculum_index(curriculum):
    by_token = defaultdict(list)
    for boundary in curriculum["boundary_sets"]:
        for token in boundary["tokens"]:
            by_token[token].append(boundary)
    return by_token

def boundary_details(correct, neg, by_token, specialist_id):
    for boundary in by_token.get(correct, []):
        if neg in boundary["tokens"]:
            req = "; ".join(boundary["requirements"])
            return boundary["id"], f"Boundary {boundary['id']}: {req}. Select {correct} only when its defining condition is present rather than {neg}."
    return "SPECIALIST-NEIGHBOR", (
        f"Within specialist {specialist_id}, distinguish {correct} from {neg} by the decisive reference state and the narrowest supported condition; "
        f"do not choose {neg} merely because it is semantically adjacent."
    )

def make_record(cid, input_text, task_mode, specialist_id, correct, neg, gold, source_lane, by_token, swap_group=None):
    boundary_id, rule = boundary_details(correct, neg, by_token, specialist_id)
    counter = (
        f"If the decisive facts changed so that {neg}'s defining condition held and the defining condition for {correct} no longer held, "
        f"the classification should switch from {correct} to {neg}."
    )
    ref_state = {
        "family": gold.get("family"),
        "capability": gold.get("capability"),
        "scenario_archetype": gold.get("scenario_archetype"),
        "oracle_type": gold.get("oracle_type"),
        "oracle_validation_status": gold.get("oracle_validation_status"),
        "clean_control": gold.get("clean_control"),
        "ambiguity": gold.get("ambiguity"),
        "required_evidence": gold.get("required_evidence", []),
        "prohibited_findings": gold.get("prohibited_findings", []),
        "severity": gold.get("severity"),
        "boundary_id": boundary_id,
    }
    derivation = (
        f"{source_lane.lower()} contrast {correct} vs {neg} derived from constructed System Master BOOK-EVAL v2 DEVELOPMENT case; "
        f"no VISIBLE_REGRESSION or HIDDEN_HOLDOUT gold used."
    )
    return {
        "record_id": stable_id(cid, correct, neg, source_lane, sha256_text(input_text)),
        "task_mode": task_mode,
        "specialist_id": specialist_id,
        "source_lane": source_lane,
        "input_text": input_text,
        "correct_token": correct,
        "hard_negative_tokens": [neg],
        "decisive_reference_state": ref_state,
        "boundary_rule": rule,
        "counterfactual": counter,
        "evidence_labels": gold.get("required_evidence", []),
        "position_swap_group": swap_group,
        "rights_class": RIGHTS_CLASS,
        "provenance": {
            "source_id": cid,
            "derivation": derivation,
            "content_digest": sha256_text(input_text),
        },
        "hidden_holdout_gold_used": False,
        "notes": "DEVELOPMENT-only contrastive training record; scoring-private source remains external to repository/provider.",
    }

def synthetic_text(boundary_id: str, correct: str, neg: str, i: int) -> str:
    name = ["Mara", "Jonah", "Elise", "Tomas", "Nia", "Cal", "Iris", "Devon"][i % 8]
    place = ["harbor", "archive", "station", "orchard", "clinic", "library"][i % 6]
    if correct == "KNOWLEDGE_STATE_CONTRADICTION":
        return f"SCENE_A: {name} personally reads the sealed access code and repeats it aloud. SCENE_B: hours later, with no memory loss, deception, or intervening event, {name} insists they have never seen or heard the code. REFERENCE_LABELS: SCENE_A, SCENE_B."
    if correct == "POV_KNOWLEDGE_LEAK":
        return f"POV_RULE: Close third-person is restricted to {name}. In the {place}, {name} watches a courier leave without opening the courier's envelope. The narration then states the exact confession written inside that unopened envelope as fact. REFERENCE_LABELS: POV_RULE, ENVELOPE."
    if correct == "TIMELINE_CONTRADICTION":
        return f"CH1 states the hearing occurs on March {10+i%10}. CH4 says the same hearing already concluded on March {5+i%3}, while both passages explicitly identify the same year and event. REFERENCE_LABELS: CH1, CH4."
    if correct == "TIMELINE_CONTINUITY_CONTRADICTION":
        return f"SCENE_A ends with the only bridge destroyed before {name} can cross. The immediately following scene opens with {name} already on the far bank, with no alternate route, time jump, rescue, or explanation. REFERENCE_LABELS: SCENE_A, SCENE_B."
    if correct == "TRAVEL_TIME_CONTRADICTION":
        return f"REFERENCE: The route from the {place} to Northport takes at least six hours by the fastest available transport. The manuscript has {name} depart at 8:00 and arrive at 8:35 the same morning without teleportation or another transport method. REFERENCE_LABELS: ROUTE_REFERENCE, TRAVEL_SCENE."
    if correct == "OBJECT_STATE_CONTRADICTION":
        return f"SCENE_A: {name} shatters the only blue vial and sweeps every fragment into a disposal chute. SCENE_B, minutes later with no replacement introduced, describes that same unique vial intact on the desk. REFERENCE_LABELS: SCENE_A, SCENE_B."
    if correct == "LOCATION_CONTINUITY_CONTRADICTION":
        return f"SCENE_A places {name} locked inside the {place} when the alarm begins. The simultaneous SCENE_B places {name} across town giving a speech, with no double, time shift, or escape described. REFERENCE_LABELS: SCENE_A, SCENE_B."
    if correct == "IDENTITY_ATTRIBUTE_CONTRADICTION":
        return f"CHARACTER_SHEET: {name} is the protagonist's older sister and has green eyes. CH7 calls {name} the protagonist's younger brother with brown eyes, with no disguise, alias, or identity twist. REFERENCE_LABELS: CHARACTER_SHEET, CH7."
    if correct == "FACT_CONTRADICTION":
        return f"PARA_A states the {place} closed permanently in 2018. PARA_B later states the same {place} remained continuously open through 2022. No reopening or change of entity is mentioned. REFERENCE_LABELS: PARA_A, PARA_B."
    if correct == "FACTUAL_CLAIM_ERROR":
        return "REFERENCE states the trial enrolled 240 participants. The manuscript contains only one enrollment claim and says the same trial enrolled 420 participants. REFERENCE_LABELS: REFERENCE, CLAIM."
    if correct == "SOURCE_SUPPORT_CONFLICT":
        return "SOURCE concludes that the intervention produced no statistically reliable improvement. The manuscript says the SOURCE proves a large reliable improvement and cites that source for the claim. REFERENCE_LABELS: SOURCE, CLAIM."
    if correct == "UNSUPPORTED_ASSERTION":
        return "The manuscript claims the intervention doubles long-term retention. The supplied materials contain no study, measurement, citation, or other evidence about long-term retention, and nothing directly contradicts the claim either. REFERENCE_LABELS: CLAIM, MATERIALS."
    if correct == "QUOTE_ATTRIBUTION_CONFLICT":
        return f"TRANSCRIPT attributes the sentence 'We leave at dawn' to {name}. The manuscript reproduces the same sentence as a direct quotation but attributes it to another speaker. REFERENCE_LABELS: TRANSCRIPT, MANUSCRIPT_QUOTE."
    if correct == "MISSING_CAUSAL_MOTIVATION_BRIDGE":
        return f"SCENE_A establishes that {name} refuses the mission because it would endanger their child. In the next scene {name} accepts the identical mission immediately, with no new information, coercion, changed risk, obligation, or emotional turning point. REFERENCE_LABELS: SCENE_A, SCENE_B."
    if correct == "MISSING_ARGUMENT_MECHANISM":
        return f"The essay notes that the {place} added more windows, then concludes this change will cut employee turnover in half. It provides no mechanism connecting window count to retention, no intermediate evidence, and no causal explanation. REFERENCE_LABELS: PREMISE, CONCLUSION."
    if correct == "UNRESOLVED_GOAL_CONFLICT":
        return f"For six chapters {name}'s explicit overriding goal is to keep the witness hidden. Without a replacement goal, new constraint, sacrifice, or resolution, {name} suddenly publishes the witness's location and the story never addresses the contradiction. REFERENCE_LABELS: GOAL, ACTION."
    if correct == "MISSING_SETUP_FOR_PAYOFF":
        return f"The climax treats a childhood promise as the decisive reason {name} abandons the mission, but the promise has never been introduced, referenced, foreshadowed, or implied before that moment. REFERENCE_LABELS: CLIMAX, PRIOR_TEXT."
    if correct == "MISSING_PAYOFF":
        return "Early chapters repeatedly establish a locked ledger as the central mystery and promise that opening it will reveal who betrayed the crew. The book ends after the ledger is opened but never reveals or resolves the promised answer. REFERENCE_LABELS: SETUP, ENDING."
    if correct == "MISSING_RELATIONSHIP_REPAIR":
        return f"After {name} publicly betrays their partner and the partner ends the relationship, the next scene presents them fully reconciled and affectionate. No apology, disclosure, changed circumstance, negotiation, or repair occurs between scenes. REFERENCE_LABELS: BETRAYAL, RECONCILIATION."
    if correct == "SAFE_EDIT":
        return f"ORIGINAL: '{name} agreed to deliver the report by Friday.' REVISION: '{name} committed to delivering the report no later than Friday.' The deadline, commitment, speaker, certainty, and purpose are unchanged. REFERENCE_LABELS: ORIGINAL, REVISION."
    if correct == "MEANING_PRESERVATION_DAMAGE":
        return f"ORIGINAL: '{name} may cancel the order after inspection.' REVISION: '{name} must cancel the order after inspection.' The revision changes permission into obligation. REFERENCE_LABELS: ORIGINAL, REVISION."
    if correct == "INTENT_PRESERVATION_DAMAGE":
        return "BRIEF: Preserve a deliberately tentative invitation that leaves the recipient free to decline. ORIGINAL: 'If you'd like, we could talk tomorrow.' REVISION: 'We need to talk tomorrow.' The topic remains similar but the communicative force and intended freedom to decline change. REFERENCE_LABELS: BRIEF, ORIGINAL, REVISION."
    if correct in {"CANDIDATE_A_BETTER", "CANDIDATE_B_BETTER"}:
        better = "A" if correct.endswith("A_BETTER") else "B"
        worse = "B" if better == "A" else "A"
        return f"AUTHOR_BRIEF: Keep the explanation accurate, concise, and understandable to a general reader; technical jargon is allowed but not required. Candidate {better} is accurate, concise, and clear. Candidate {worse} is accurate but needlessly dense and less clear, while still satisfying all mandatory constraints. REFERENCE_LABELS: AUTHOR_BRIEF, CANDIDATE_A, CANDIDATE_B."
    if correct in {"OBJECTIVELY_SUPERIOR_A", "OBJECTIVELY_SUPERIOR_B"}:
        better = "A" if correct.endswith("_A") else "B"
        worse = "B" if better == "A" else "A"
        return f"MANDATORY_RULE: The answer must preserve the exact numeric limit of 30 days. Candidate {better} states the limit as 30 days. Candidate {worse} states the limit as 90 days, violating the explicit mandatory rule. REFERENCE_LABELS: MANDATORY_RULE, CANDIDATE_A, CANDIDATE_B."
    raise ValueError(f"no synthetic template for {boundary_id} / {correct}")

def add_synthetic_to_minimum(records, curriculum, taxonomy, token_to_spec, mode_tokens, by_token):
    coverage = {b["id"]: 0 for b in curriculum["boundary_sets"]}
    for record in records:
        correct = record["correct_token"]
        neg = record["hard_negative_tokens"][0]
        for boundary in curriculum["boundary_sets"]:
            if correct in boundary["tokens"] and neg in boundary["tokens"]:
                coverage[boundary["id"]] += 1
    synthetic_counts = Counter()
    for boundary in curriculum["boundary_sets"]:
        deficit = max(0, boundary["minimum_records"] - coverage[boundary["id"]])
        if deficit == 0:
            continue
        tokens = boundary["tokens"]
        i = 0
        while deficit > 0:
            correct = tokens[i % len(tokens)]
            neg = tokens[(i + 1) % len(tokens)]
            if neg == correct:
                neg = tokens[(i + 2) % len(tokens)]
            matches = [mode for mode in taxonomy["task_modes"] if (mode, correct) in token_to_spec]
            if len(matches) != 1:
                raise ValueError(f"cannot infer synthetic mode for {correct}")
            mode = matches[0]
            specialist = token_to_spec[(mode, correct)]
            text = synthetic_text(boundary["id"], correct, neg, i)
            sid = f"SYN-{boundary['id']}-{i:04d}-{correct}"
            group = f"SYN-SWAP-{boundary['id']}-{i:04d}" if mode == "PAIRWISE_COMPARISON" else None
            fake_gold = {
                "family": "SYNTHETIC_BOUNDARY",
                "capability": "CONTRASTIVE_TRAINING",
                "scenario_archetype": boundary["id"],
                "oracle_type": "SYNTHETIC_RULE_ORACLE",
                "oracle_validation_status": "TRAINING_PRIVATE_SYNTHETIC",
                "clean_control": False,
                "ambiguity": False,
                "required_evidence": ["REFERENCE_LABELS"],
                "prohibited_findings": [neg],
                "severity": "MATERIAL",
            }
            rec = make_record(sid, text, mode, specialist, correct, neg, fake_gold, "SYNTHETIC", by_token, group)
            rec["provenance"] = {
                "source_id": sid,
                "derivation": "Original deterministic Gate B synthetic boundary example; no external literary text and no scoring-private case text used.",
                "content_digest": sha256_text(text),
            }
            rec["decisive_reference_state"]["synthetic"] = True
            rec["notes"] = "Original synthetic contrast created to close measured curriculum coverage gap."
            records.append(rec)
            coverage[boundary["id"]] += 1
            deficit -= 1
            synthetic_counts[boundary["id"]] += 1
            if mode == "PAIRWISE_COMPARISON" and deficit > 0:
                sw_text = swap_pairwise_text(text)
                sw_correct = SWAP_TOKEN.get(correct, correct)
                sw_neg = SWAP_TOKEN.get(neg, neg)
                sw_specialist = token_to_spec[(mode, sw_correct)]
                sw = make_record(sid, sw_text, mode, sw_specialist, sw_correct, sw_neg, fake_gold, "SYNTHETIC", by_token, group)
                sw["record_id"] = stable_id(sid, sw_correct, sw_neg, "SYNTHETIC_SWAP", sha256_text(sw_text))
                sw["provenance"] = {
                    "source_id": sid,
                    "derivation": "Position-swapped twin of an original deterministic Gate B synthetic boundary example; no external literary text used.",
                    "content_digest": sha256_text(sw_text),
                }
                sw["decisive_reference_state"]["synthetic"] = True
                sw["notes"] = "Synthetic position-swapped contrast; label polarity swapped where applicable."
                records.append(sw)
                coverage[boundary["id"]] += 1
                deficit -= 1
                synthetic_counts[boundary["id"]] += 1
            i += 1
    return synthetic_counts

def main():
    ap = argparse.ArgumentParser()
    for name in ["gold", "provider_input", "repaired_output", "taxonomy", "curriculum", "schema", "rights_manifest", "out_dir"]:
        ap.add_argument("--" + name.replace("_", "-"), required=True)
    args = ap.parse_args()
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    gold_all = read_jsonl(args.gold)
    inputs_all = read_jsonl(args.provider_input)
    outputs = read_jsonl(args.repaired_output)
    taxonomy = read_json(args.taxonomy)
    curriculum = read_json(args.curriculum)
    schema = read_json(args.schema)
    rights = read_json(args.rights_manifest)

    if rights["rights_class"] != RIGHTS_CLASS or rights["source_id"] != "BOOK-EVAL-CORPUS-INPUT-v2":
        raise ValueError("rights manifest does not authorize canonical corpus")
    provider_sha = sha256_bytes(pathlib.Path(args.provider_input).read_bytes())
    if rights["content_sha256"] != provider_sha:
        raise ValueError("rights manifest digest does not match provider corpus")

    split_counts = Counter(row["split"] for row in gold_all)
    dev_gold = {row["case_id"]: row for row in gold_all if row["split"] == "DEVELOPMENT"}
    visible_ids = {row["case_id"] for row in gold_all if row["split"] == "VISIBLE_REGRESSION"}
    hidden_ids = {row["case_id"] for row in gold_all if row["split"] == "HIDDEN_HOLDOUT"}
    if len(dev_gold) != 80 or len(visible_ids) != 48 or len(hidden_ids) != 32:
        raise ValueError(f"unexpected split counts {split_counts}")

    inputs = {row["case_id"]: row for row in inputs_all if row["case_id"] in dev_gold}
    out_by = {row["case_id"]: row for row in outputs}
    if set(inputs) != set(dev_gold) or set(out_by) != set(dev_gold):
        raise ValueError("DEVELOPMENT input/output IDs do not exactly bind to DEVELOPMENT gold")
    if (set(inputs) | set(out_by)) & (visible_ids | hidden_ids):
        raise ValueError("non-development ID entered selected source set")

    token_to_spec, mode_tokens = build_token_maps(taxonomy)
    by_token = curriculum_index(curriculum)
    records = []
    seen_keys = set()
    for cid in sorted(dev_gold):
        gold = dev_gold[cid]
        inp = inputs[cid]
        model = out_by[cid]
        mode = inp["task_mode"]
        correct = gold["primary_finding"]
        specialist = token_to_spec.get((mode, correct))
        if not specialist:
            raise ValueError(f"correct token lacks specialist {cid} {mode} {correct}")
        negatives = []
        prediction = model["aggregate"]["primary_finding"]
        if prediction != correct and prediction in mode_tokens[mode]:
            negatives.append(prediction)
        for token in taxonomy["task_modes"][mode]["specialists"][specialist]:
            if token != correct:
                negatives.append(token)
        for boundary in by_token.get(correct, []):
            negatives.extend(token for token in boundary["tokens"] if token != correct and token in mode_tokens[mode])
        negatives.extend(token for token in FALLBACK_NEIGHBORS.get(correct, []) if token in mode_tokens[mode] and token != correct)
        if not negatives:
            negatives = [next(token for token in sorted(mode_tokens[mode]) if token != correct)]
        unique_negatives = []
        for neg in negatives:
            if neg not in unique_negatives:
                unique_negatives.append(neg)
        for neg in unique_negatives:
            key = (cid, correct, neg, "orig")
            if key in seen_keys:
                continue
            seen_keys.add(key)
            group = f"SWAP-{cid}-{correct}-{neg}" if mode == "PAIRWISE_COMPARISON" else None
            records.append(make_record(cid, inp["input_text"], mode, specialist, correct, neg, gold, "DEVELOPMENT_ORIGINAL", by_token, group))
            if mode == "PAIRWISE_COMPARISON":
                sw_text = swap_pairwise_text(inp["input_text"])
                sw_correct = SWAP_TOKEN.get(correct, correct)
                sw_neg = SWAP_TOKEN.get(neg, neg)
                sw_specialist = token_to_spec.get((mode, sw_correct), specialist)
                sw = make_record(cid, sw_text, mode, sw_specialist, sw_correct, sw_neg, gold, "DEVELOPMENT_DERIVED", by_token, group)
                sw["record_id"] = stable_id(cid, sw_correct, sw_neg, "DEVELOPMENT_DERIVED", sha256_text(sw_text))
                sw["notes"] = "Position-swapped DEVELOPMENT-derived contrast; label polarity swapped where applicable."
                records.append(sw)

    synthetic_counts = add_synthetic_to_minimum(records, curriculum, taxonomy, token_to_spec, mode_tokens, by_token)

    validator = Draft202012Validator(schema)
    errors = []
    ids = set()
    for i, record in enumerate(records):
        if record["record_id"] in ids:
            errors.append(f"duplicate record id {record['record_id']}")
        ids.add(record["record_id"])
        for error in validator.iter_errors(record):
            errors.append(f"record {i} {record['record_id']}: {error.message}")
        src = record["provenance"]["source_id"]
        if record["source_lane"].startswith("DEVELOPMENT_") and src not in dev_gold:
            errors.append(f"non-development provenance {record['record_id']}")
        if record["source_lane"] == "SYNTHETIC" and not src.startswith("SYN-"):
            errors.append(f"invalid synthetic provenance {record['record_id']}")
        if src in hidden_ids or src in visible_ids:
            errors.append(f"forbidden provenance {record['record_id']}")
    if errors:
        raise ValueError("schema/provenance errors:\n" + "\n".join(errors[:50]))

    text_blob = "\n".join(json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False) for record in records) + "\n"
    forbidden_hits = [case_id for case_id in sorted(hidden_ids | visible_ids) if case_id in text_blob]
    if forbidden_hits:
        raise ValueError(f"forbidden case ids leaked: {forbidden_hits[:5]}")

    coverage = {boundary["id"]: 0 for boundary in curriculum["boundary_sets"]}
    for record in records:
        correct = record["correct_token"]
        neg = record["hard_negative_tokens"][0]
        for boundary in curriculum["boundary_sets"]:
            if correct in boundary["tokens"] and neg in boundary["tokens"]:
                coverage[boundary["id"]] += 1
    minimum_failures = {
        boundary["id"]: (coverage[boundary["id"]], boundary["minimum_records"])
        for boundary in curriculum["boundary_sets"]
        if coverage[boundary["id"]] < boundary["minimum_records"]
    }

    pair_records = [record for record in records if record["task_mode"] == "PAIRWISE_COMPARISON"]
    group_counts = Counter(record["position_swap_group"] for record in pair_records)
    swap_covered = sum(count for group, count in group_counts.items() if group and count >= 2)
    swap_coverage = (swap_covered / len(pair_records)) if pair_records else 1.0

    corpus_path = out_dir / "BOOK-EVAL-REPAIR-005-TRAINING-PRIVATE-v1.jsonl"
    corpus_path.write_text(text_blob, encoding="utf-8")
    manifest = {
        "objective": "BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-B",
        "state": "PRIVATE_TRAINING_CORPUS_COMPILED",
        "source_policy": "DEVELOPMENT_ONLY",
        "source_split_counts": dict(split_counts),
        "development_source_cases": len(dev_gold),
        "training_records": len(records),
        "synthetic_boundary_counts": dict(synthetic_counts),
        "source_lane_counts": dict(Counter(record["source_lane"] for record in records)),
        "task_mode_counts": dict(Counter(record["task_mode"] for record in records)),
        "rights_class_counts": dict(Counter(record["rights_class"] for record in records)),
        "schema_valid_records": len(records),
        "schema_invalid_records": 0,
        "hidden_holdout_ids_present": 0,
        "visible_regression_ids_present": 0,
        "hidden_holdout_gold_used": False,
        "scoring_private_raw_rows_persisted": False,
        "provider_facing": False,
        "pairwise_position_swap_coverage": swap_coverage,
        "curriculum_coverage": coverage,
        "curriculum_minimum_failures": minimum_failures,
        "minimum_total_records_required": curriculum["minimum_total_records"],
        "minimum_total_records_pass": len(records) >= curriculum["minimum_total_records"],
        "rights_provenance_present_percent": 100.0,
        "hard_negative_present_percent": 100.0,
        "counterfactual_present_percent": 100.0,
        "corpus_sha256": sha256_bytes(corpus_path.read_bytes()),
        "source_gold_sha256": sha256_bytes(pathlib.Path(args.gold).read_bytes()),
        "source_provider_corpus_sha256": provider_sha,
        "source_repaired_output_sha256": sha256_bytes(pathlib.Path(args.repaired_output).read_bytes()),
        "taxonomy_semantic_sha256": sha256_text(json.dumps(taxonomy, sort_keys=True, separators=(",", ":"), ensure_ascii=False)),
        "curriculum_semantic_sha256": sha256_text(json.dumps(curriculum, sort_keys=True, separators=(",", ":"), ensure_ascii=False)),
        "schema_semantic_sha256": sha256_text(json.dumps(schema, sort_keys=True, separators=(",", ":"), ensure_ascii=False)),
        "rights_manifest_semantic_sha256": sha256_text(json.dumps(rights, sort_keys=True, separators=(",", ":"), ensure_ascii=False)),
    }
    manifest["gate_b_pass"] = manifest["minimum_total_records_pass"] and not minimum_failures and swap_coverage >= 0.95
    (out_dir / "BOOK-EVAL-REPAIR-005-GATE-B-MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    if not manifest["gate_b_pass"]:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
