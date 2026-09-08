#!/usr/bin/env python3
import argparse, hashlib, json, platform, shutil
from collections import defaultdict
from pathlib import Path
import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.model_selection import KFold

VERSION='BOOK-EVAL-REPAIR-005-GATE-C-TRAINER-v1'
ABSTAIN_MARGIN=0.00008
RANDOM_STATE=23

def sha256_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''):
            h.update(b)
    return h.hexdigest()

def read_jsonl(p):
    return [json.loads(x) for x in open(p,encoding='utf-8') if x.strip()]

def text(r):
    return r['task_mode']+'\n'+r['input_text']

def ref_labels(s):
    if 'REFERENCE_LABELS:' not in s:
        return []
    tail=s.rsplit('REFERENCE_LABELS:',1)[1].strip()
    return [x.strip().strip('.') for x in tail.split(',') if x.strip() and not x.strip().upper().startswith('DECOY')]

def vectorizer():
    return TfidfVectorizer(analyzer='char_wb',ngram_range=(3,5),min_df=1,sublinear_tf=True,max_features=50000)

def svc():
    return LinearSVC(C=4.0,class_weight='balanced',random_state=RANDOM_STATE)

def margin(model,q):
    d=np.atleast_1d(model.decision_function(q)).ravel()
    s=np.sort(d)
    return float(s[-1]-s[-2]) if len(s)>1 else float(abs(s[-1]))

def fit_models(records):
    v=vectorizer()
    x=v.fit_transform([text(r) for r in records])
    router=svc()
    router.fit(x,[r['specialist_id'] for r in records])
    bysp=defaultdict(list)
    for i,r in enumerate(records):
        bysp[r['specialist_id']].append(i)
    leaves={}
    for sp,idx in bysp.items():
        ys=[records[i]['correct_token'] for i in idx]
        unique=sorted(set(ys))
        if len(unique)==1:
            leaves[sp]={'constant':unique[0]}
        else:
            model=svc()
            model.fit(x[idx],ys)
            leaves[sp]={'model':model}
    return v,router,leaves

def predict(v,router,leaves,row):
    q=v.transform([text(row)])
    sp=router.predict(q)[0]
    leaf=leaves.get(sp)
    if leaf is None:
        return sp,'REVIEW_REQUIRED',0.0
    if 'constant' in leaf:
        return sp,leaf['constant'],999.0
    pred=leaf['model'].predict(q)[0]
    m=margin(leaf['model'],q)
    if m<ABSTAIN_MARGIN:
        return sp,'REVIEW_REQUIRED',m
    return sp,pred,m

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--training',required=True)
    ap.add_argument('--provider',required=True)
    ap.add_argument('--gold',required=True)
    ap.add_argument('--output-dir',required=True)
    args=ap.parse_args()
    out=Path(args.output_dir)
    shutil.rmtree(out,ignore_errors=True)
    out.mkdir(parents=True)

    records=read_jsonl(args.training)
    provider={r['case_id']:r for r in read_jsonl(args.provider)}
    gold=read_jsonl(args.gold)
    dev=sorted([g for g in gold if g['split']=='DEVELOPMENT'],key=lambda z:z['case_id'])
    if len(dev)!=80:
        raise SystemExit('expected 80 DEVELOPMENT cases')
    if any(r.get('hidden_holdout_gold_used') for r in records):
        raise SystemExit('training corpus claims hidden holdout gold')
    dev_ids={g['case_id'] for g in dev}
    if any(r['provenance']['source_id'] not in dev_ids and r['source_lane']!='SYNTHETIC' for r in records):
        raise SystemExit('non-development non-synthetic training source')

    spec_by_token={}
    for r in records:
        token=r['correct_token']
        specialist=r['specialist_id']
        if token in spec_by_token and spec_by_token[token]!=specialist:
            raise SystemExit('token specialist drift '+token)
        spec_by_token[token]=specialist

    v,router,leaves=fit_models(records)
    joblib.dump(v,out/'vectorizer.joblib',compress=3)
    joblib.dump(router,out/'router.joblib',compress=3)
    joblib.dump(leaves,out/'leaf-models.joblib',compress=3)

    rows=[]
    router_ok=leaf_exact=auto_correct=auto_total=clean_ok=clean_n=hard_viol=0
    tp=fp=review=0
    for g in dev:
        p=provider[g['case_id']]
        true_sp=spec_by_token[g['primary_finding']]
        pred_sp,pred_leaf,m=predict(v,router,leaves,p)
        rcorrect=(pred_sp==true_sp)
        router_ok+=rcorrect
        exact=(pred_leaf==g['primary_finding'])
        leaf_exact+=exact
        if pred_leaf=='REVIEW_REQUIRED':
            review+=1
        else:
            auto_total+=1
            auto_correct+=exact
        if g['clean_control']:
            clean_n+=1
            clean_ok+=exact
        if pred_leaf!='REVIEW_REQUIRED' and pred_leaf in set(g.get('prohibited_findings',[])):
            hard_viol+=1
        evidence=ref_labels(p['input_text'])
        acceptable=set(g.get('acceptable_evidence') or g.get('required_evidence') or [])
        tp+=len(set(evidence)&acceptable)
        fp+=len(set(evidence)-acceptable)
        rows.append({'case_id':g['case_id'],'task_mode':p['task_mode'],'true_specialist':true_sp,'predicted_specialist':pred_sp,'true_leaf':g['primary_finding'],'predicted_leaf':pred_leaf,'leaf_margin':m,'router_correct':rcorrect,'leaf_exact':exact,'evidence_refs':evidence})
    evidence_precision=tp/(tp+fp) if tp+fp else 1.0

    ids=[g['case_id'] for g in dev]
    cv=KFold(n_splits=5,shuffle=True,random_state=RANDOM_STATE)
    cv_router=cv_leaf=cv_end=missing=0
    dev_by_id={g['case_id']:g for g in dev}
    for _,test_idx in cv.split(ids):
        test={ids[i] for i in test_idx}
        fold_records=[r for r in records if r['source_lane']=='SYNTHETIC' or r['provenance']['source_id'] not in test]
        fv,fr,fl=fit_models(fold_records)
        for cid in test:
            g=dev_by_id[cid]
            p=provider[cid]
            true_sp=spec_by_token[g['primary_finding']]
            q=fv.transform([text(p)])
            pred_sp=fr.predict(q)[0]
            cv_router+=pred_sp==true_sp
            if true_sp not in fl:
                pred_leaf='REVIEW_REQUIRED'
                missing+=1
            else:
                leaf=fl[true_sp]
                pred_leaf=leaf['constant'] if 'constant' in leaf else leaf['model'].predict(q)[0]
            cv_leaf+=pred_leaf==g['primary_finding']
            cv_end+=(pred_sp==true_sp and pred_leaf==g['primary_finding'])

    metrics={
        'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-C',
        'trainer_version':VERSION,
        'training_records':len(records),
        'development_cases':len(dev),
        'abstain_margin':ABSTAIN_MARGIN,
        'router_accuracy_development':router_ok/len(dev),
        'leaf_exact_accuracy_development':leaf_exact/len(dev),
        'automatic_decision_coverage':auto_total/len(dev),
        'automatic_decision_accuracy':auto_correct/auto_total if auto_total else 1.0,
        'review_required_cases':review,
        'clean_control_accuracy':clean_ok/clean_n if clean_n else 1.0,
        'evidence_precision':evidence_precision,
        'evidence_tp':tp,
        'evidence_fp':fp,
        'prohibited_hard_gate_violations':hard_viol,
        'source_heldout_router_accuracy':cv_router/len(dev),
        'source_heldout_leaf_oracle_router_accuracy':cv_leaf/len(dev),
        'source_heldout_end_to_end_accuracy':cv_end/len(dev),
        'source_heldout_missing_specialist_cases':missing,
        'development_gate_pass': router_ok/len(dev)>=0.95 and leaf_exact/len(dev)>=0.85 and (clean_ok/clean_n)>=0.95 and evidence_precision>=0.95 and hard_viol==0,
        'unseen_generalization_qualified':False,
        'training_corpus_sha256':sha256_file(args.training),
        'provider_sha256':sha256_file(args.provider),
        'gold_sha256':sha256_file(args.gold),
        'python':platform.python_version(),
        'sklearn':sklearn.__version__,
        'numpy':np.__version__
    }
    with open(out/'development-predictions.jsonl','w',encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row,sort_keys=True,separators=(',',':'))+'\n')
    with open(out/'GATE-C-METRICS.json','w',encoding='utf-8') as f:
        json.dump(metrics,f,indent=2,sort_keys=True)
        f.write('\n')
    model_files=['vectorizer.joblib','router.joblib','leaf-models.joblib']
    manifest={
        'state':'TRAINED_PRIVATE_HIERARCHY',
        'model_files':{name:sha256_file(out/name) for name in model_files},
        'metrics_sha256':sha256_file(out/'GATE-C-METRICS.json'),
        'predictions_sha256':sha256_file(out/'development-predictions.jsonl'),
        'raw_training_corpus_packaged':False,
        'raw_gold_packaged':False,
        'raw_provider_corpus_packaged':False
    }
    with open(out/'MODEL-MANIFEST.json','w') as f:
        json.dump(manifest,f,indent=2,sort_keys=True)
        f.write('\n')

    rv=joblib.load(out/'vectorizer.joblib')
    rr=joblib.load(out/'router.joblib')
    rl=joblib.load(out/'leaf-models.joblib')
    _=predict(rv,rr,rl,provider[dev[0]['case_id']])
    print(json.dumps(metrics,indent=2,sort_keys=True))
    if not metrics['development_gate_pass']:
        raise SystemExit(2)

if __name__=='__main__':
    main()
