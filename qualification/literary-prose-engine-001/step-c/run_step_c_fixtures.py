#!/usr/bin/env python3
import json, importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location("vi",ROOT/"voice_intelligence.py"); vi=importlib.util.module_from_spec(sp); sp.loader.exec_module(vi)
cases=json.loads((ROOT/"fixtures/step_c_cases.json").read_text())['cases']; results=[]; errors=[]
for c in cases:
    got=vi.classify_trait(c['input']) if c['kind']=='trait' else vi.classify_change(c['input'])
    ok=got==c['expected']; results.append({'case_id':c['id'],'got':got,'expected':c['expected'],'pass':ok})
    if not ok: errors.append(c['id'])
evidence={'qualification_id':'LITERARY-PROSE-ENGINE-001-STEP-C-FIXTURE-QUALIFICATION','standing':'PASS' if not errors else 'FAIL','fixture_count':len(cases),'results':results,'errors':errors,'real_manuscript_full_text_committed':False,'named_author_target_allowed':False,'a01_required':False}
(ROOT/'STEP-C-QUALIFICATION-EVIDENCE.json').write_text(json.dumps(evidence,indent=2))
print(f"STEP-C FIXTURES: {evidence['standing']} ({len(cases)} cases)")
raise SystemExit(1 if errors else 0)
