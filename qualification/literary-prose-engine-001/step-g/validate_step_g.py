import json, pathlib, subprocess, sys
root=pathlib.Path(__file__).resolve().parent
required=['CONTRASTIVE-CRAFT-FOUNDRY-CONTRACT-v1.json','CONTRASTIVE-PAIR-SCHEMA-v1.json','REVISION-TRANSFORM-SCHEMA-v1.json','TECHNIQUE-EFFECT-RECORD-SCHEMA-v1.json','HARD-NEGATIVE-SCHEMA-v1.json','contrastive_foundry.py','fixtures/step_g_cases.json','run_step_g_fixtures.py','STEP-G-QUALIFICATION-CONTRACT-v1.json','STEP-G-QUALIFICATION-EVIDENCE.json','STEP-G-CLOSURE.md']
for p in required:
    if not (root/p).exists(): raise SystemExit(f'MISSING:{p}')
r=subprocess.run([sys.executable,str(root/'run_step_g_fixtures.py')],capture_output=True,text=True)
if r.returncode: print(r.stdout,r.stderr); raise SystemExit(r.returncode)
ev=json.loads((root/'STEP-G-QUALIFICATION-EVIDENCE.json').read_text())
assert ev['standing']=='PASS' and ev['fixture_count']==16
assert ev['named_author_target_allowed'] is False and ev['a01_required'] is False
contract=json.loads((root/'CONTRASTIVE-CRAFT-FOUNDRY-CONTRACT-v1.json').read_text())
assert contract['named_author_imitation_allowed'] is False
print('STEP-G VALIDATION: PASS — 16 controlled/adversarial fixtures')
