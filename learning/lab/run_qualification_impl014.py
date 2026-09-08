from __future__ import annotations
import json, os, subprocess, sys
from pathlib import Path
from qualification_impl014 import adversarial, demo, deterministic_campaign, recovery_campaign

def run(cmd):
    p=subprocess.run(cmd,text=True,capture_output=True)
    return {'returncode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}

def count_tests(text):
    import re
    m=re.search(r'Ran (\d+) tests',text); return int(m.group(1)) if m else None

root=Path(__file__).resolve().parent
full=run([sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py'])
new=run([sys.executable,'-m','unittest','tests.test_standard_aligned_bounded_module'])
compile_files=sorted(str(p) for p in root.rglob('*.py') if '__pycache__' not in p.parts)
comp=run([sys.executable,'-m','py_compile',*compile_files])
adv=adversarial(); rec=recovery_campaign(20); det=deterministic_campaign(20); d=demo()
full_count=count_tests(full['stderr']+full['stdout']); new_count=count_tests(new['stderr']+new['stdout'])
receipt={
 'objective':'LEARNING-LAB-IMPL-014 — EXTERNAL-STANDARD-ALIGNED BOUNDED MODULE COMPILER + ASSESSMENT BLUEPRINT / UPDATE-TRAINING DELTA EXECUTION SLICE',
 'status':'PASS_PORTABLE_IMPLEMENTATION' if all([full['returncode']==0,new['returncode']==0,comp['returncode']==0,adv['status']=='PASS',rec['status']=='PASS',det['status']=='PASS',d['next_action']=='COURSE_COMPLETE']) else 'FAIL',
 'combined_tests':full_count,'impl014_tests':new_count,'predecessor_tests_preserved':(full_count-new_count if full_count is not None and new_count is not None else None),
 'python_files_compiled':len(compile_files),'adversarial':adv,'recovery_smoke':rec,'determinism_smoke':det,'demo':d,'extended_campaign_evidence':{'recovery_runs':100,'determinism_runs':100,'source':'evidence/qualification_receipt_impl014.json'},
 'scope':{'external_requirements':['ASQ-CSSGB-2022-II.A.4','ASQ-CSSGB-2022-II.C.2'],'full_cssgb_course_built':False,'external_certification_claimed':False},
}
(root/'evidence').mkdir(exist_ok=True)
(root/'evidence'/'qualification_receipt_impl014_smoke.json').write_text(json.dumps(receipt,indent=2,sort_keys=True))
print(json.dumps(receipt,indent=2,sort_keys=True))
raise SystemExit(0 if receipt['status'].startswith('PASS') else 1)
