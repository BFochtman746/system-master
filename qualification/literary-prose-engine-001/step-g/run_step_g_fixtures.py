import json, pathlib, sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from contrastive_foundry import build_pair, technique_record
root=pathlib.Path(__file__).resolve().parent
cases=json.loads((root/'fixtures'/'step_g_cases.json').read_text())
results=[]; pairs=[]
for c in cases:
    p=build_pair(c['pair']); pairs.append(p)
    got=p['qualification']['outcome']; results.append({'case_id':c['case_id'],'got':got,'expected':c['expected'],'pass':got==c['expected']})
summary={'qualification_id':'LITERARY-PROSE-ENGINE-001-STEP-G-FIXTURE-QUALIFICATION','standing':'PASS' if all(r['pass'] for r in results) else 'FAIL','fixture_count':len(results),'results':results,'technique_probe':technique_record('SUBTEXT-REDUCE-EXPLICIT-AFTERBEAT',pairs),'errors':[] if all(r['pass'] for r in results) else [r for r in results if not r['pass']],'user_manuscript_text_committed':False,'named_author_target_allowed':False,'a01_required':False}
(root/'STEP-G-QUALIFICATION-EVIDENCE.json').write_text(json.dumps(summary,indent=2)+'\n')
print(f"STEP-G FIXTURES: {summary['standing']} — {len(results)} cases")
raise SystemExit(0 if summary['standing']=='PASS' else 1)
