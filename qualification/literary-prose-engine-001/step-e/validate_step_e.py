#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).parent

def load(name): return json.loads((ROOT/name).read_text())
errors=[]
schema=load('PASSAGE-STATE-SCHEMA-v1.json')
contract=load('PASSAGE-INTELLIGENCE-CONTRACT-v1.json')
opp=load('OPPORTUNITY-PRIORITIZATION-CONTRACT-v1.json')
qual=load('STEP-E-QUALIFICATION-CONTRACT-v1.json')
ev=load('STEP-E-QUALIFICATION-EVIDENCE.json')
required={'identity','purpose_state','reader_state','character_state','narrative_state','voice_state','preservation_state','craft_state','readiness'}
if set(schema['required_sections']) != required: errors.append('required passage-state sections drift')
for key in ['scene_or_chapter_function','pov','focalization','authorial_intent','protected_language','canon_facts']:
    if key not in contract['critical_authorities']: errors.append(f'missing critical authority {key}')
if contract['rules']['revision_without_passage_state'] is not False: errors.append('revision without state must be false')
if contract['rules']['revision_with_unresolved_critical_authority'] is not False: errors.append('critical unresolved authority must block revision')
if contract['rules']['external_craft_can_override_project_authority'] is not False: errors.append('external override forbidden')
if contract['rules']['named_author_target_allowed'] is not False: errors.append('named-author target forbidden')
if contract['rules']['universal_prose_score_allowed'] is not False: errors.append('universal prose score forbidden')
if contract['rules']['no_action_is_valid'] is not True: errors.append('NO_ACTION must be valid')
if opp['universal_prose_score'] is not False: errors.append('priority score must not be universal quality')
for hard in ['protected_language_conflict','canon_conflict','authorial_intent_conflict','pov_knowledge_violation']:
    if hard not in opp['hard_reject_conditions']: errors.append(f'missing hard reject {hard}')
if ev['standing']!='PASS' or ev['fixture_count']<qual['required_fixture_cases']: errors.append('fixture qualification failed')
if ev['raw_user_manuscript_text_committed'] is not False: errors.append('raw manuscript text boundary violated')
if qual['a01_required'] is not False: errors.append('STEP-E should not require A-01')
print('STEP-E VALIDATION: '+('PASS' if not errors else 'FAIL'))
print('Validated passage state, readiness gates, opportunity prioritization, preservation hard stops, and fixture evidence.')
if errors:
    for e in errors: print('ERROR:',e)
    raise SystemExit(1)
