#!/usr/bin/env python3
import json
from pathlib import Path
from source_registry import decide
R=Path(__file__).resolve().parent
cases=json.loads((R/'fixtures/step_d_cases.json').read_text())['cases']
results=[]; errors=[]
for c in cases:
    got=decide(c); ok=got==c['expected']; results.append({'case_id':c['case_id'],'got':got,'expected':c['expected'],'pass':ok})
    if not ok: errors.append(f"{c['case_id']}: expected {c['expected']} got {got}")
out={'qualification_id':'LITERARY-PROSE-ENGINE-001-STEP-D-FIXTURE-QUALIFICATION','standing':'PASS' if not errors else 'FAIL','fixture_count':len(cases),'results':results,'errors':errors,'bulk_external_full_text_acquired':False,'named_author_target_allowed':False,'overnight_artifact_required':False}
(R/'STEP-D-QUALIFICATION-EVIDENCE.json').write_text(json.dumps(out,indent=2)+'\n')
print(f"STEP-D FIXTURES: {out['standing']} ({len(cases)} cases)")
if errors: raise SystemExit(1)
