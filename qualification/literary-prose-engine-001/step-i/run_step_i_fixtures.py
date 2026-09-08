import json, os
from independent_evaluator import evaluate
ROOT=os.path.dirname(__file__)
cases=json.load(open(os.path.join(ROOT,'fixtures','step_i_cases.json'),encoding='utf8'))
results=[]
errors=[]
for case in cases:
    got=evaluate(case)
    ok=got.get('disposition')==case['expected']
    if case.get('reason'):
        ok=ok and got.get('reason')==case['reason']
    if case.get('check_deterministic'):
        got2=evaluate(case)
        ok=ok and got.get('evaluation_id')==got2.get('evaluation_id')
    row={'case_id':case['case_id'],'pass':ok,'disposition':got.get('disposition'),'reason':got.get('reason')}
    results.append(row)
    if not ok:
        errors.append({'case_id':case['case_id'],'got':got,'expected':case['expected'],'reason_expected':case.get('reason')})
evidence={
  'qualification_id':'LITERARY-PROSE-ENGINE-001-STEP-I-FIXTURE-QUALIFICATION',
  'standing':'PASS' if not errors else 'FAIL',
  'fixture_count':len(cases),
  'results':results,
  'errors':errors,
  'writer_rationale_authority':False,
  'named_author_target_allowed':False,
  'universal_prose_score':False,
  'retain_original_default':True,
  'user_manuscript_text_committed':False,
  'a01_required':False
}
json.dump(evidence,open(os.path.join(ROOT,'STEP-I-QUALIFICATION-EVIDENCE.json'),'w',encoding='utf8'),indent=2);open(os.path.join(ROOT,'STEP-I-QUALIFICATION-EVIDENCE.json'),'a').write('\n')
if errors:
    print(json.dumps(errors,indent=2)); raise SystemExit(1)
print(f'STEP-I FIXTURES: PASS ({len(cases)} cases)')
