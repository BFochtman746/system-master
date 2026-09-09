import json, os, subprocess, sys
ROOT=os.path.dirname(__file__)
required=['INDEPENDENT-LITERARY-EVALUATOR-CONTRACT-v1.json','PAIRWISE-EVALUATION-SCHEMA-v1.json','PRESERVATION-REGRESSION-GATE-v1.json','POSITION-SWAP-AND-BLINDING-CONTRACT-v1.json','MULTIDIMENSIONAL-DECISION-CONTRACT-v1.json','STEP-I-QUALIFICATION-CONTRACT-v1.json']
for name in required:
    json.load(open(os.path.join(ROOT,name),encoding='utf8'))
r=subprocess.run([sys.executable,os.path.join(ROOT,'run_step_i_fixtures.py')],cwd=ROOT,text=True,capture_output=True)
if r.returncode:
    print(r.stdout); print(r.stderr); raise SystemExit(r.returncode)
e=json.load(open(os.path.join(ROOT,'STEP-I-QUALIFICATION-EVIDENCE.json'),encoding='utf8'))
assert e['standing']=='PASS' and e['fixture_count']==18
assert e['writer_rationale_authority'] is False and e['universal_prose_score'] is False
print('STEP-I VALIDATION: PASS — blind pairwise, position swap, preservation veto, abstention/retain-original, 18 fixtures')
