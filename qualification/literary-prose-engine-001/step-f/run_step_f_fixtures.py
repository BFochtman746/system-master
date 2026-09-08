#!/usr/bin/env python3
import json, pathlib, sys
from specialist_diagnostics import emit, adjudicate
root=pathlib.Path(__file__).parent
cases=json.loads((root/'fixtures/step_f_cases.json').read_text())['cases']
results=[]; errors=[]
for c in cases:
    findings=emit(c); decision=adjudicate(c,findings)
    e=c['expect']; ok=True
    if 'status' in e: ok &= decision['status']==e['status']
    if 'finding_type' in e: ok &= findings and findings[0]['finding_type']==e['finding_type']
    if 'top' in e: ok &= decision['opportunities'] and decision['opportunities'][0]['opportunity_id']==e['top']
    if 'top_status' in e: ok &= decision['opportunities'] and decision['opportunities'][0]['status']==e['top_status']
    if 'confidence' in e: ok &= decision['opportunities'] and abs(decision['opportunities'][0]['confidence']-e['confidence'])<1e-9
    if 'count' in e: ok &= len(decision['opportunities'])==e['count']
    results.append({'case_id':c['case_id'],'pass':bool(ok),'decision':decision['status'],'opportunity_count':len(decision['opportunities'])})
    if not ok: errors.append({'case_id':c['case_id'],'findings':findings,'decision':decision,'expect':e})
out={'qualification_id':'LITERARY-PROSE-ENGINE-001-STEP-F-FIXTURE-QUALIFICATION','standing':'PASS' if not errors else 'FAIL','fixture_count':len(cases),'results':results,'errors':errors,'specialist_rewrite_allowed':False,'named_author_target_allowed':False,'a01_required':False}
(root/'STEP-F-QUALIFICATION-EVIDENCE.json').write_text(json.dumps(out,indent=2)+'\n')
print(f"STEP-F FIXTURES: {out['standing']} — {len(cases)} cases")
if errors:
    print(json.dumps(errors,indent=2)); sys.exit(1)
