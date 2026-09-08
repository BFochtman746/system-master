#!/usr/bin/env python3
import argparse, json
from pathlib import Path

VERSION='BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-VALIDATOR-v1'

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--rows',required=True)
    ap.add_argument('--taxonomy',required=True)
    ap.add_argument('--examples-per-token',type=int,required=True)
    args=ap.parse_args()
    rows=Path(args.rows)
    tax=Path(args.taxonomy)
    t=json.load(open(tax,encoding='utf-8'))
    tokens=[]
    for task in t['task_modes'].values():
        for leaves in task['specialists'].values():
            tokens.extend(leaves)
    items=[json.loads(x) for x in rows.read_text(encoding='utf-8').splitlines() if x.strip()]
    expected=len(tokens)*args.examples_per_token
    if len(items)!=expected:
        raise SystemExit(f'expected {expected} records, got {len(items)}')
    ids=set()
    for r in items:
        rid=r['teacher_record_id']
        if rid in ids:
            raise SystemExit('duplicate teacher_record_id '+rid)
        ids.add(rid)
        if r.get('hidden_holdout_gold_used') is not False or r.get('visible_regression_gold_used') is not False:
            raise SystemExit('gold-use flag violation '+rid)
        if r.get('source_lane')!='TEACHER_SYNTHETIC' or r.get('rights_class')!='SYNTHETIC_ORIGINAL':
            raise SystemExit('source/rights violation '+rid)
        text=r['input_text']
        leaked=[tok for tok in tokens if tok in text]
        if leaked:
            raise SystemExit(f'ontology token leaked into input_text {rid}: {leaked}')
        if 'REFERENCE_LABELS:' not in text:
            raise SystemExit('missing REFERENCE_LABELS '+rid)
        if r.get('target_token') not in tokens:
            raise SystemExit('unknown target token '+rid)
        if len(str(r.get('semantic_fingerprint','')).strip())<20:
            raise SystemExit('weak semantic fingerprint '+rid)
        if len(str(r.get('counterfactual_neighbor','')).strip())<20:
            raise SystemExit('weak counterfactual '+rid)
    print(f'{VERSION} PASS records={len(items)} canonical_tokens={len(tokens)} ontology_token_leaks=0 hidden_holdout_gold_used=false visible_regression_gold_used=false')

if __name__=='__main__':
    main()
