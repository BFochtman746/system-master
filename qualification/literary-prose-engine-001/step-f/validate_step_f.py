#!/usr/bin/env python3
import json, pathlib, subprocess, sys
root=pathlib.Path(__file__).parent
required=['SPECIALIST-REGISTRY-v1.json','DIAGNOSTIC-EVIDENCE-SCHEMA-v1.json','SPECIALIST-DIAGNOSTIC-CONTRACT-v1.json','OPPORTUNITY-ADJUDICATION-CONTRACT-v1.json','STEP-F-QUALIFICATION-CONTRACT-v1.json','fixtures/step_f_cases.json']
for f in required: json.loads((root/f).read_text())
reg=json.loads((root/'SPECIALIST-REGISTRY-v1.json').read_text())
assert len(reg['specialists'])>=18
assert all(x['may_rewrite'] is False for x in reg['specialists'])
q=json.loads((root/'STEP-F-QUALIFICATION-CONTRACT-v1.json').read_text())
assert q['requirements']['specialists_may_rewrite'] is False
assert q['requirements']['named_author_target_allowed'] is False
p=subprocess.run([sys.executable,str(root/'run_step_f_fixtures.py')],cwd=root,text=True,capture_output=True)
print(p.stdout,end='')
if p.returncode: print(p.stderr); raise SystemExit(p.returncode)
ev=json.loads((root/'STEP-F-QUALIFICATION-EVIDENCE.json').read_text())
assert ev['standing']=='PASS' and ev['fixture_count']>=16
print(f"STEP-F VALIDATION: PASS — {len(reg['specialists'])} specialists, {ev['fixture_count']} fixtures")
