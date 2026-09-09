#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('provider', HERE/'text_observation_provider.py')
provider=importlib.util.module_from_spec(spec); spec.loader.exec_module(provider)

STEP7=Path.cwd()/'qualification/literary-prose-engine-001/step-f/step_007_finding_calibration.py'
spec2=importlib.util.spec_from_file_location('step7', STEP7)
step7=importlib.util.module_from_spec(spec2); spec2.loader.exec_module(step7)


def check(cond,msg):
    if not cond: raise AssertionError(msg)

# Direct whitespace-only duplicate is observed as an objective candidate but never auto-revision eligible.
a='The door opened opened into rain. She stopped. “No,” he said.'
r=provider.observe(a,'A','TEST')
check(r['metrics']['direct_duplicate_word_count']==1,'direct duplicate missed')
rep=[x for x in r['observations'] if x['dimension']=='REPETITION_RHYTHM'][0]
check(rep['objective_defect_evidence'] is True,'objective candidate missing')
check(rep['bounded_gain_evidence'] is False,'provider invented bounded gain')
cal=step7.calibrate_finding(rep)
check(cal['revision_eligible'] is False,'STEP-007 improperly admitted provider-only observation')

# Rhetorical/corrective repetition separated by punctuation is not a mechanical duplicate-word hit.
b='He did not, not at once. I will be what I will be. I will be what I will be.'
r2=provider.observe(b,'B','TEST')
check(r2['metrics']['direct_duplicate_word_count']==0,'punctuated rhetorical repetition false positive')
check(r2['metrics']['exact_repeated_sentence_excess']==1,'sentence repetition measurement missing')
rep2=[x for x in r2['observations'] if x['dimension']=='REPETITION_RHYTHM'][0]
cal2=step7.calibrate_finding(rep2)
check(cal2['classification']=='OBSERVATION','repetition became defect without harm evidence')
check(cal2['revision_eligible'] is False,'rhetorical repetition auto-admitted')

# Semantic states remain unresolved; provider cannot infer purpose/POV/canon/intent.
check(r['semantic_status']=='UNRESOLVED_REQUIRES_SEMANTIC_PROVIDER','semantic fail-closed status missing')
for key in ['scene_or_chapter_function','pov','focalization','authorial_intent','canon_facts']:
    check(key in r['semantic_dimensions_requiring_other_provider'],f'{key} not guarded')

# Privacy / authority boundary.
serialized=json.dumps(r,sort_keys=True)
check(a not in serialized,'raw text leaked into provider output')
check(r['raw_text_present_in_output'] is False,'raw text flag wrong')
check(r['candidate_text_present_in_output'] is False,'candidate text flag wrong')
check(r['revision_authorized'] is False,'provider granted revision authority')
check(r['manuscript_mutated'] is False,'provider claims mutation')
check(r['universal_prose_score'] is False,'universal score used')

# Determinism.
check(r==provider.observe(a,'A','TEST'),'provider output not deterministic')
print('PASS: 18/18 diagnostic evidence provider assertions')
