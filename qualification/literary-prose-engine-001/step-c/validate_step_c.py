#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent; errors=[]
req=['VOICE-INTELLIGENCE-AND-TRAJECTORY-CONTRACT-v1.json','VOICE-TRAIT-EVIDENCE-SCHEMA-v1.json','USER-MANUSCRIPT-DERIVED-METRICS-v1.json','VOICE-BASELINE-AND-TRAJECTORY-v1.json','voice_intelligence.py','fixtures/step_c_cases.json','run_step_c_fixtures.py','STEP-C-QUALIFICATION-CONTRACT-v1.json']
for f in req:
    if not (ROOT/f).exists(): errors.append('missing '+f)
c=json.loads((ROOT/'VOICE-INTELLIGENCE-AND-TRAJECTORY-CONTRACT-v1.json').read_text())
if c['voice_hierarchy']!=['AUTHOR_FINGERPRINT','PROJECT_VOICE','BOOK_VOICE','POV_CHARACTER_VOICE','LOCAL_PASSAGE_STATE']: errors.append('voice hierarchy mismatch')
if set(c['trait_dispositions'])!={'PROTECT','RANGE','CHALLENGE','SUPPRESS'}: errors.append('trait dispositions mismatch')
for k in ['frequency_alone_can_protect','frequency_alone_can_suppress','later_version_is_automatically_better','maturity_label_is_quality_score','named_author_similarity_allowed']:
    if c['rules'].get(k) is not False: errors.append(k+' must be false')
if c['step_c_evolution_boundary']['final_voice_evolution_claim_available'] is not False: errors.append('STEP-C cannot self-certify evolution')
m=json.loads((ROOT/'USER-MANUSCRIPT-DERIVED-METRICS-v1.json').read_text())
if m.get('raw_text_persisted_in_artifact') is not False: errors.append('raw text persisted')
if len(m.get('records',[]))!=7: errors.append('must have seven manuscript records')
if any('content_sha256' not in x or len(x['content_sha256'])!=64 for x in m['records']): errors.append('missing source digests')
b=json.loads((ROOT/'VOICE-BASELINE-AND-TRAJECTORY-v1.json').read_text())
if b.get('raw_source_text_included') is not False: errors.append('baseline contains raw source text')
if b['unhindered_sequence']['quality_inference']!='NOT_ESTABLISHED_BY_CHRONOLOGY_OR_MATURITY_LABEL_ALONE': errors.append('maturity causality warning missing')
if b['unhindered_sequence']['status']!='DEVELOPMENT_TRAJECTORY_CANDIDATE': errors.append('trajectory overclaimed')
if b['suppression_policy']['baseline_suppress_traits']!=[]: errors.append('baseline should not suppress from recurrence alone')
q=json.loads((ROOT/'STEP-C-QUALIFICATION-CONTRACT-v1.json').read_text())
for gate in ['C-HIERARCHY-001','C-DISPOSITION-001','C-MATURITY-NONCAUSAL-001','C-EVOLUTION-BOUNDARY-001','C-NO-RAW-TEXT-001','C-IMITATION-001']:
    if gate not in q['gates']: errors.append('missing gate '+gate)
if errors:
 print('STEP-C VALIDATION: FAIL'); [print('- '+e) for e in errors]; raise SystemExit(1)
print('STEP-C VALIDATION: PASS')
print('Validated canonical contracts, seven derived manuscript records, and non-causal trajectory boundary.')
