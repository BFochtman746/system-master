#!/usr/bin/env python3
import json
from pathlib import Path
R=Path(__file__).resolve().parent
errors=[]
def j(n): return json.loads((R/n).read_text(encoding='utf-8'))
schema=j('LITERARY-CRAFT-SOURCE-REGISTRY-SCHEMA-v1.json')
dist=j('CRAFT-KNOWLEDGE-DISTILLATION-CONTRACT-v1.json')
academy=j('LITERARY-CRAFT-ACADEMY-MAP-v1.json')
reg=j('STEP-D-SOURCE-REGISTRY-v1.json')
pri=j('STEP-D-DISTILLED-PRINCIPLES-v1.json')
q=j('STEP-D-QUALIFICATION-CONTRACT-v1.json')
ev=j('STEP-D-QUALIFICATION-EVIDENCE.json')
if reg.get('single_scalar_source_score') is not False: errors.append('source registry must not use a single scalar source score')
if reg.get('bulk_text_acquired') is not False: errors.append('bulk external text acquisition must be false')
if len(reg.get('entries',[])) != 17: errors.append('expected 17 seed registry entries')
for e in reg.get('entries',[]):
    if e.get('named_author_target_allowed') is not False: errors.append('named-author target enabled: '+e.get('source_id','?'))
    if e['rights']['status']=='LICENSE_UNRESOLVED_QUARANTINE' and e['admission_state']!='QUARANTINE': errors.append('unresolved license not quarantined')
    if e['rights']['status']=='MIXED_COMPONENT_RIGHTS' and not e['rights']['component_level_review_required']: errors.append('mixed rights lacks component review')
    if e['source_id']=='SRC-PERSUADE' and e['authority_facets']['task_match']!='LOW': errors.append('PERSUADE task mismatch not preserved')
if 'protected_canon_and_intent' not in dist.get('precedence',[]): errors.append('precedence missing protected canon/intent')
if 'named_author_imitation' not in dist.get('forbidden',[]): errors.append('named-author imitation not forbidden')
if academy.get('named_author_curriculum_nodes_allowed') is not False: errors.append('named-author curriculum nodes must be disabled')
if len(academy.get('schools',[])) != 12: errors.append('expected 12 Academy schools')
if pri.get('raw_source_passages_included') is not False: errors.append('raw source passages must not be included')
if pri.get('universal_great_prose_score') is not False: errors.append('universal prose score must be false')
if len(pri.get('principles',[])) != 15: errors.append('expected 15 distilled principles')
for p in pri.get('principles',[]):
    for k in ['conditions','failure_modes','counterconditions','scope_limit','source_ids']:
        if not p.get(k): errors.append(f"{p.get('principle_id')} missing {k}")
    if p.get('named_author_target') is not False: errors.append('named-author target leaked into principle')
if q.get('bulk_external_full_text_acquisition_allowed') is not False: errors.append('bulk external full text must be prohibited')
if q.get('overnight_artifact_required_for_closure') is not False: errors.append('overnight artifact must not block STEP-D closure')
gates={g['gate_id'] for g in q.get('gates',[])}
for needed in ['D-RIGHTS-001','D-RIGHTS-002','D-RIGHTS-003','D-REGISTRY-001','D-TASK-001','D-DISTILL-001','D-IMITATION-001','D-VOICE-001','D-EVAL-001','D-QUARANTINE-001','D-BULK-001','D-OVERNIGHT-001']:
    if needed not in gates: errors.append('missing gate '+needed)
if ev.get('standing')!='PASS' or ev.get('fixture_count')!=12: errors.append('fixture evidence not PASS/12')
if errors:
    print('STEP-D VALIDATION: FAIL')
    for e in errors: print('- '+e)
    raise SystemExit(1)
print('STEP-D VALIDATION: PASS')
print('Validated 17 registry entries, 15 distilled principles, 12 Academy schools, and 12 adversarial fixtures.')
