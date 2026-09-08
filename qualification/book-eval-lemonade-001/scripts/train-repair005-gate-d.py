#!/usr/bin/env python3
import argparse, hashlib, json, platform, shutil
from collections import defaultdict
from pathlib import Path
import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC
from sklearn.model_selection import KFold

VERSION='BOOK-EVAL-REPAIR-005-GATE-D-STUDENT-v2'
RANDOM_STATE=29
ROUTER_GATE=0.85
ORACLE_LEAF_GATE=0.80
END_TO_END_GATE=0.70
CLEAN_GATE=0.95
EVIDENCE_PRECISION_GATE=0.95
MAX_ESCALATION_RATE=0.35
MIN_AUTO_COVERAGE=0.65
MIN_AUTO_ACCURACY=0.90
TARGET_HYBRID_ACCURACY=0.85

def sha256_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()

def read_jsonl(p):
    return [json.loads(x) for x in open(p,encoding='utf-8') if x.strip()]

def text(r):
    return r['input_text']

def ref_labels(s):
    if 'REFERENCE_LABELS:' not in s: return []
    tail=s.rsplit('REFERENCE_LABELS:',1)[1].strip()
    return [x.strip().strip('.') for x in tail.split(',') if x.strip() and not x.strip().upper().startswith('DECOY')]

def vectorizer():
    return FeatureUnion([
        ('word',TfidfVectorizer(analyzer='word',ngram_range=(1,2),min_df=1,sublinear_tf=True,max_features=60000,strip_accents='unicode')),
        ('char',TfidfVectorizer(analyzer='char_wb',ngram_range=(3,5),min_df=1,sublinear_tf=True,max_features=90000))
    ])

def svc(): return LinearSVC(C=3.0,class_weight='balanced',random_state=RANDOM_STATE)

def margin(model,q):
    d=np.atleast_1d(model.decision_function(q)).ravel()
    if len(d)==1: return float(abs(d[0]))
    s=np.sort(d)
    return float(s[-1]-s[-2])

def taxonomy_maps(tax):
    token_to_sp={}; sp_to_tokens={}; all_tokens=set(); specialist_task={}
    for task,tobj in tax['task_modes'].items():
        for sp,tokens in tobj['specialists'].items():
            if sp in specialist_task and specialist_task[sp]!=task:
                raise ValueError('specialist ID collision across task modes '+sp)
            specialist_task[sp]=task
            sp_to_tokens[(task,sp)]=list(tokens)
            for token in tokens:
                key=(task,token)
                if key in token_to_sp: raise ValueError('duplicate token within task '+task+'/'+token)
                token_to_sp[key]=sp; all_tokens.add(token)
    return token_to_sp,sp_to_tokens,all_tokens,specialist_task

def teacher_to_training(rows,token_to_sp,all_tokens):
    out=[]; ids=set()
    for r in rows:
        rid=r['teacher_record_id']
        if rid in ids: raise ValueError('duplicate teacher record '+rid)
        ids.add(rid)
        token=r['target_token']; sp=r['specialist_id']; task=r['task_mode']; key=(task,token)
        if key not in token_to_sp: raise ValueError('teacher token outside taxonomy '+task+'/'+token)
        if token_to_sp[key]!=sp: raise ValueError('teacher taxonomy drift '+rid)
        if r.get('hidden_holdout_gold_used') or r.get('visible_regression_gold_used'): raise ValueError('teacher forbidden gold flag')
        if r.get('source_lane')!='TEACHER_SYNTHETIC' or r.get('rights_class')!='SYNTHETIC_ORIGINAL': raise ValueError('teacher source/rights drift')
        if any(tok in r['input_text'] for tok in all_tokens): raise ValueError('ontology token leak in teacher input '+rid)
        out.append({'record_id':rid,'task_mode':task,'specialist_id':sp,'source_lane':'SYNTHETIC','input_text':r['input_text'],'correct_token':token,'provenance':{'source_id':rid},'hidden_holdout_gold_used':False})
    return out

def fit_models(records):
    v=vectorizer(); x=v.fit_transform([text(r) for r in records])
    bytask=defaultdict(list); bysp=defaultdict(list)
    for i,r in enumerate(records):
        bytask[r['task_mode']].append(i); bysp[(r['task_mode'],r['specialist_id'])].append(i)
    routers={}
    for task,idx in bytask.items():
        ys=[records[i]['specialist_id'] for i in idx]; uniq=sorted(set(ys))
        if len(uniq)==1: routers[task]={'constant':uniq[0]}
        else:
            m=svc(); m.fit(x[idx],ys); routers[task]={'model':m}
    leaves={}
    for key,idx in bysp.items():
        ys=[records[i]['correct_token'] for i in idx]; uniq=sorted(set(ys))
        if len(uniq)==1: leaves[key]={'constant':uniq[0]}
        else:
            m=svc(); m.fit(x[idx],ys); leaves[key]={'model':m}
    return v,routers,leaves

def predict(v,routers,leaves,row,forced_sp=None):
    q=v.transform([text(row)]); task=row['task_mode']
    if forced_sp is None:
        router=routers.get(task)
        if router is None: return 'REVIEW_REQUIRED','REVIEW_REQUIRED',0.0,0.0,0.0
        if 'constant' in router: sp=router['constant']; rm=999.0
        else: sp=router['model'].predict(q)[0]; rm=margin(router['model'],q)
    else:
        sp=forced_sp; rm=999.0
    leaf=leaves.get((task,sp))
    if leaf is None: return sp,'REVIEW_REQUIRED',rm,0.0,0.0
    if 'constant' in leaf: return sp,leaf['constant'],rm,999.0,min(rm,999.0)
    pred=leaf['model'].predict(q)[0]; lm=margin(leaf['model'],q)
    return sp,pred,rm,lm,min(rm,lm)

def fallback_map(rows):
    out={}
    for r in rows:
        agg=r.get('aggregate') or {}; pred=agg.get('primary_finding')
        if pred: out[r['case_id']]={'prediction':pred,'confidence':agg.get('confidence')}
    return out

def selective_hybrid(cv_rows,fallback):
    available=[r for r in cv_rows if r['case_id'] in fallback]
    if len(available)!=len(cv_rows):
        return {'available_cases':len(available),'best_accuracy':None,'best_rate':None,'best_count':None,'automatic_accuracy':None,'automatic_coverage':None,'clean_control_accuracy':None,'hard_gate_violations':None,'target_met':False}
    ordered=sorted(cv_rows,key=lambda r:(r['student_confidence'],r['case_id']))
    n=len(ordered); maxk=min(int(np.floor(MAX_ESCALATION_RATE*n+1e-9)),n)
    best=None; first_pass=None
    for k in range(maxk+1):
        esc={r['case_id'] for r in ordered[:k]}
        combined_correct=0; auto_correct=0; auto_n=0; clean_correct=0; clean_n=0; hard=0
        for r in cv_rows:
            use_fallback=r['case_id'] in esc
            pred=fallback[r['case_id']]['prediction'] if use_fallback else r['predicted_leaf']
            correct=pred==r['true_leaf']; combined_correct+=correct
            if not use_fallback:
                auto_n+=1; auto_correct+=correct
            if r['clean_control']:
                clean_n+=1; clean_correct+=correct
            if pred in r['prohibited_findings']: hard+=1
        acc=combined_correct/n; auto_cov=auto_n/n; auto_acc=auto_correct/auto_n if auto_n else 1.0; clean_acc=clean_correct/clean_n if clean_n else 1.0
        target=(acc>=TARGET_HYBRID_ACCURACY and k/n<=MAX_ESCALATION_RATE and auto_cov>=MIN_AUTO_COVERAGE and auto_acc>=MIN_AUTO_ACCURACY and clean_acc>=CLEAN_GATE and hard==0)
        rec={'accuracy':acc,'count':k,'rate':k/n,'automatic_accuracy':auto_acc,'automatic_coverage':auto_cov,'clean_control_accuracy':clean_acc,'hard_gate_violations':hard,'target_met':target}
        score=(target,acc,auto_acc,-k)
        if best is None or score>best[0]: best=(score,rec)
        if target and first_pass is None: first_pass=rec
    result=dict(best[1]); result['available_cases']=len(available); result['first_passing_policy']=first_pass
    return result

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--training',required=True)
    ap.add_argument('--teacher',required=True)
    ap.add_argument('--provider',required=True)
    ap.add_argument('--gold',required=True)
    ap.add_argument('--taxonomy',required=True)
    ap.add_argument('--fallback120b')
    ap.add_argument('--output-dir',required=True)
    args=ap.parse_args(); out=Path(args.output_dir); shutil.rmtree(out,ignore_errors=True); out.mkdir(parents=True)

    base=read_jsonl(args.training); teacher_raw=read_jsonl(args.teacher); provider={r['case_id']:r for r in read_jsonl(args.provider)}
    gold=read_jsonl(args.gold); dev=sorted([g for g in gold if g['split']=='DEVELOPMENT'],key=lambda z:z['case_id'])
    tax=json.load(open(args.taxonomy,encoding='utf-8')); token_to_sp,sp_to_tokens,all_tokens,specialist_task=taxonomy_maps(tax)
    teacher=teacher_to_training(teacher_raw,token_to_sp,all_tokens)
    if len(teacher)!=440: raise SystemExit('expected 440 teacher records')
    if len(dev)!=80: raise SystemExit('expected 80 DEVELOPMENT cases')
    if any(r.get('hidden_holdout_gold_used') for r in base): raise SystemExit('base corpus claims hidden holdout gold')
    dev_ids={g['case_id'] for g in dev}
    if any(r['source_lane']!='SYNTHETIC' and r['provenance']['source_id'] not in dev_ids for r in base): raise SystemExit('base corpus non-development source')
    for r in base:
        if specialist_task.get(r['specialist_id'])!=r['task_mode']: raise SystemExit('base specialist/task drift '+r['record_id'])
        if token_to_sp.get((r['task_mode'],r['correct_token']))!=r['specialist_id']: raise SystemExit('base token/specialist drift '+r['record_id'])
    combined=base+teacher

    v,routers,leaves=fit_models(combined)
    joblib.dump(v,out/'vectorizer.joblib',compress=3); joblib.dump(routers,out/'routers.joblib',compress=3); joblib.dump(leaves,out/'leaf-models.joblib',compress=3)
    full_router=full_leaf=0
    for g in dev:
        p=provider[g['case_id']]; sp,pred,_,_,_=predict(v,routers,leaves,p)
        full_router += sp==token_to_sp[(p['task_mode'],g['primary_finding'])]; full_leaf += pred==g['primary_finding']

    ids=[g['case_id'] for g in dev]; byid={g['case_id']:g for g in dev}; cv=KFold(n_splits=5,shuffle=True,random_state=RANDOM_STATE)
    cv_rows=[]; router_ok=oracle_leaf_ok=end_ok=missing=hard_viol=clean_ok=clean_n=0
    for fold,(_,test_idx) in enumerate(cv.split(ids),start=1):
        test={ids[i] for i in test_idx}; fold_base=[r for r in base if r['source_lane']=='SYNTHETIC' or r['provenance']['source_id'] not in test]; fold_records=fold_base+teacher
        fv,fr,fl=fit_models(fold_records)
        for cid in sorted(test):
            g=byid[cid]; p=provider[cid]; true_leaf=g['primary_finding']; true_sp=token_to_sp[(p['task_mode'],true_leaf)]
            pred_sp,pred_leaf,rm,lm,conf=predict(fv,fr,fl,p)
            if (p['task_mode'],true_sp) not in fl: missing+=1
            _,oracle_leaf,_,olm,_=predict(fv,fr,fl,p,forced_sp=true_sp)
            ro=pred_sp==true_sp; lo=oracle_leaf==true_leaf; eo=(pred_sp==true_sp and pred_leaf==true_leaf)
            router_ok+=ro; oracle_leaf_ok+=lo; end_ok+=eo
            prohibited=sorted(set(g.get('prohibited_findings',[])))
            if pred_leaf in prohibited: hard_viol+=1
            if g['clean_control']:
                clean_n+=1; clean_ok+=eo
            cv_rows.append({'fold':fold,'case_id':cid,'task_mode':p['task_mode'],'true_specialist':true_sp,'predicted_specialist':pred_sp,'true_leaf':true_leaf,'predicted_leaf':pred_leaf,'router_margin':rm,'leaf_margin':lm,'student_confidence':conf,'router_correct':ro,'oracle_leaf_correct':lo,'end_to_end_correct':eo,'oracle_leaf_prediction':oracle_leaf,'oracle_leaf_margin':olm,'clean_control':bool(g['clean_control']),'prohibited_findings':prohibited})

    tp=fp=0
    for g in dev:
        refs=ref_labels(provider[g['case_id']]['input_text']); acceptable=set(g.get('acceptable_evidence') or g.get('required_evidence') or [])
        tp+=len(set(refs)&acceptable); fp+=len(set(refs)-acceptable)
    ep=tp/(tp+fp) if tp+fp else 1.0; clean_acc=clean_ok/clean_n if clean_n else 1.0
    base_pass=(router_ok/len(dev)>=ROUTER_GATE and oracle_leaf_ok/len(dev)>=ORACLE_LEAF_GATE and end_ok/len(dev)>=END_TO_END_GATE and missing==0 and clean_acc>=CLEAN_GATE and ep>=EVIDENCE_PRECISION_GATE and hard_viol==0)

    fallback={}
    if args.fallback120b: fallback=fallback_map(read_jsonl(args.fallback120b))
    hybrid=selective_hybrid(cv_rows,fallback) if fallback else {'available_cases':0,'best_accuracy':None,'best_rate':None,'best_count':None,'automatic_accuracy':None,'automatic_coverage':None,'clean_control_accuracy':None,'hard_gate_violations':None,'target_met':False}
    selective_pass=bool(hybrid.get('target_met'))

    metrics={
      'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D','student_version':VERSION,'base_training_records':len(base),'teacher_synthetic_records':len(teacher),'combined_training_records':len(combined),'development_cases':len(dev),
      'development_full_fit_router_accuracy':full_router/len(dev),'development_full_fit_leaf_accuracy':full_leaf/len(dev),
      'source_heldout_router_accuracy':router_ok/len(dev),'source_heldout_leaf_accuracy_with_oracle_specialist':oracle_leaf_ok/len(dev),'source_heldout_end_to_end_accuracy':end_ok/len(dev),'source_heldout_missing_specialist_cases':missing,'source_heldout_clean_control_accuracy':clean_acc,'source_heldout_prohibited_hard_gate_violations':hard_viol,
      'evidence_precision':ep,'evidence_tp':tp,'evidence_fp':fp,'selective_hybrid':hybrid,
      'gate_d_student_advancement_pass':base_pass,'gate_d_selective_target_pass':selective_pass,'gate_d_pass':base_pass and selective_pass,'visible_regression_allowed':base_pass and selective_pass,
      'visible_regression_used':False,'hidden_holdout_used':False,
      'training_sha256':sha256_file(args.training),'teacher_sha256':sha256_file(args.teacher),'provider_sha256':sha256_file(args.provider),'gold_sha256':sha256_file(args.gold),'taxonomy_sha256':sha256_file(args.taxonomy),
      'python':platform.python_version(),'sklearn':sklearn.__version__,'numpy':np.__version__
    }
    with open(out/'GATE-D-SOURCE-HELDOUT-PREDICTIONS.jsonl','w',encoding='utf-8') as f:
        for r in sorted(cv_rows,key=lambda z:z['case_id']): f.write(json.dumps(r,sort_keys=True,separators=(',',':'))+'\n')
    with open(out/'GATE-D-METRICS.json','w',encoding='utf-8') as f: json.dump(metrics,f,indent=2,sort_keys=True); f.write('\n')
    manifest={'state':'GATE_D_STUDENT_TRAINED_PRIVATE','model_files':{n:sha256_file(out/n) for n in ['vectorizer.joblib','routers.joblib','leaf-models.joblib']},'metrics_sha256':sha256_file(out/'GATE-D-METRICS.json'),'predictions_sha256':sha256_file(out/'GATE-D-SOURCE-HELDOUT-PREDICTIONS.jsonl'),'raw_training_packaged':False,'raw_gold_packaged':False,'raw_provider_packaged':False,'teacher_synthetic_packaged':False}
    with open(out/'MODEL-MANIFEST.json','w') as f: json.dump(manifest,f,indent=2,sort_keys=True); f.write('\n')
    print(json.dumps(metrics,indent=2,sort_keys=True))

if __name__=='__main__': main()
