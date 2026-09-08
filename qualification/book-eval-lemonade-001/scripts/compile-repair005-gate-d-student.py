#!/usr/bin/env python3
import argparse, hashlib, json
from collections import Counter
from pathlib import Path

VERSION='BOOK-EVAL-REPAIR-005-GATE-D-STUDENT-COMPILER-v1'

def read_jsonl(p):
    return [json.loads(x) for x in Path(p).read_text(encoding='utf-8').splitlines() if x.strip()]

def sha_text(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def sha_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''):
            h.update(b)
    return h.hexdigest()

def ref_labels(text):
    if 'REFERENCE_LABELS:' not in text:
        return []
    tail=text.rsplit('REFERENCE_LABELS:',1)[1].strip()
    out=[]
    for raw in tail.split(','):
        q=raw.strip().strip('.')
        if q and not q.upper().startswith('DECOY'):
            out.append(q)
    return list(dict.fromkeys(out))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--base-training',required=True)
    ap.add_argument('--teacher',required=True)
    ap.add_argument('--taxonomy',required=True)
    ap.add_argument('--output',required=True)
    ap.add_argument('--manifest',required=True)
    args=ap.parse_args()

    tax=json.load(open(args.taxonomy,encoding='utf-8'))
    token_to_sp={}
    task_tokens={}
    specialist_tokens={}
    for task,tobj in tax['task_modes'].items():
        task_tokens[task]=[]
        for sp,leaves in tobj['specialists'].items():
            sid=f'{task}/{sp}'
            specialist_tokens[sid]=list(leaves)
            for tok in leaves:
                if tok in token_to_sp:
                    raise SystemExit('duplicate taxonomy token '+tok)
                token_to_sp[tok]=(task,sid)
                task_tokens[task].append(tok)
    all_tokens=set(token_to_sp)

    base=read_jsonl(args.base_training)
    if any(r.get('hidden_holdout_gold_used') is not False for r in base):
        raise SystemExit('base corpus hidden-holdout flag violation')
    teacher=read_jsonl(args.teacher)
    out=list(base)
    ids={r['record_id'] for r in base}
    teacher_counts=Counter()

    for t in teacher:
        rid='GATED-'+t['teacher_record_id']
        if rid in ids:
            raise SystemExit('duplicate compiled record '+rid)
        ids.add(rid)
        if t.get('source_lane')!='TEACHER_SYNTHETIC' or t.get('rights_class')!='SYNTHETIC_ORIGINAL':
            raise SystemExit('teacher source/rights violation '+rid)
        if t.get('hidden_holdout_gold_used') is not False or t.get('visible_regression_gold_used') is not False:
            raise SystemExit('teacher gold-use flag violation '+rid)
        token=t['target_token']
        if token not in token_to_sp:
            raise SystemExit('unknown teacher target '+token)
        task,sid=token_to_sp[token]
        if t.get('task_mode')!=task or t.get('specialist_id')!=sid:
            raise SystemExit('teacher taxonomy binding mismatch '+rid)
        text=t['input_text']
        leaked=[tok for tok in all_tokens if tok in text]
        if leaked:
            raise SystemExit(f'ontology token leak in {rid}: {sorted(leaked)}')
        if 'REFERENCE_LABELS:' not in text:
            raise SystemExit('teacher record missing REFERENCE_LABELS '+rid)
        siblings=[x for x in specialist_tokens[sid] if x!=token]
        if not siblings:
            siblings=[x for x in task_tokens[task] if x!=token][:1]
        if not siblings:
            raise SystemExit('cannot construct hard negative '+rid)
        fp=str(t.get('semantic_fingerprint','')).strip()
        cf=str(t.get('counterfactual_neighbor','')).strip()
        if len(fp)<20 or len(cf)<20:
            raise SystemExit('weak teacher semantic annotation '+rid)
        row={
            'record_id':rid,
            'task_mode':task,
            'specialist_id':sid,
            'source_lane':'SYNTHETIC',
            'input_text':text,
            'correct_token':token,
            'hard_negative_tokens':siblings,
            'decisive_reference_state':{'semantic_fingerprint':fp},
            'boundary_rule':fp,
            'counterfactual':cf,
            'evidence_labels':ref_labels(text),
            'position_swap_group':None,
            'rights_class':'USER_OWNED_OR_AUTHORIZED',
            'provenance':{
                'source_id':t['teacher_record_id'],
                'derivation':'120B teacher synthetic original; curriculum-targeted; no development/visible/hidden gold supplied to teacher',
                'content_digest':sha_text(text)
            },
            'hidden_holdout_gold_used':False,
            'notes':'Gate D offline semantic distillation teacher record.'
        }
        out.append(row)
        teacher_counts[sid]+=1

    sp_counts=Counter(r['specialist_id'] for r in out)
    missing=sorted(set(specialist_tokens)-set(sp_counts))
    if missing:
        raise SystemExit('specialists missing after merge: '+','.join(missing))

    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('w',encoding='utf-8',newline='\n') as f:
        for r in out:
            f.write(json.dumps(r,sort_keys=True,separators=(',',':'))+'\n')
    manifest={
        'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
        'compiler_version':VERSION,
        'base_records':len(base),
        'teacher_records':len(teacher),
        'combined_records':len(out),
        'specialists_total':len(specialist_tokens),
        'specialists_covered':len(sp_counts),
        'missing_specialists':missing,
        'teacher_records_by_specialist':dict(sorted(teacher_counts.items())),
        'combined_records_by_specialist':dict(sorted(sp_counts.items())),
        'ontology_token_leaks':0,
        'hidden_holdout_gold_used':False,
        'visible_regression_gold_used_by_teacher':False,
        'base_training_sha256':sha_file(args.base_training),
        'teacher_sha256':sha_file(args.teacher),
        'taxonomy_sha256':sha_file(args.taxonomy),
        'combined_training_sha256':sha_file(output)
    }
    Path(args.manifest).write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(manifest,indent=2,sort_keys=True))

if __name__=='__main__':
    main()
