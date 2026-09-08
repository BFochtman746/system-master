#!/usr/bin/env python3
import json
from pathlib import Path
from passage_intelligence import construct_passage_state
ROOT=Path(__file__).parent

def set_path(obj,path,value):
    parts=path.split('.')
    cur=obj
    for p in parts[:-1]: cur=cur.setdefault(p,{})
    cur[parts[-1]]=value

def base_state():
    return {
      "identity":{"passage_id":"SYNTH-E-001","project_id":"SYNTH-PROJECT","book_id":"SYNTH-BOOK","source_authority_status":"AUTHORIZED_FIXTURE"},
      "purpose_state":{"scene_or_chapter_function":"relationship-pressure confrontation","intended_movement":"move from certainty to costly uncertainty","target_reader_effect":"heightened moral tension without premature resolution","importance":"HIGH","edit_budget":"SURGICAL"},
      "reader_state":{"known_information":["A distrusts B"],"expected_information":["reason for refusal"],"uncertainty":["whether refusal is fear or wisdom"],"tension_questions":["will trust fracture"],"orientation_burden":"LOW"},
      "character_state":{"active_characters":["A","B"],"goals":{"A":"obtain commitment","B":"avoid false promise"},"knowledge_boundaries":{"A":["prior failure"],"B":["hidden risk"]},"emotion":{"A":"frustrated","B":"guarded"},"relationship_pressure":"mutual loyalty under disagreement","agency":{"A":"presses","B":"refuses"},"continuity_constraints":["B has not disclosed hidden risk"]},
      "narrative_state":{"pov":"third limited A","focalization":"A","narrative_distance":"close","chronology":"linear scene","pacing_target":"tight","information_release":"B's hidden risk intentionally withheld"},
      "voice_state":{"author_fingerprint_constraints":["moral dialectic"],"project_voice":["dialogue-borne argument"],"book_voice":["restrained scene narration"],"pov_character_voice":["A interprets quickly but imperfectly"],"local_cadence_register":"short pressured dialogue with sparse narration","active_trait_dispositions":["PROTECT:moral_dialectic","RANGE:aphoristic_antithesis"],"development_frontier_authorized":True},
      "preservation_state":{"canon_facts":["B has not disclosed hidden risk"],"authorial_intent":"keep both positions defensible","protected_language":["I will not promise what I cannot carry."],"historical_constraints":[],"theological_constraints":[],"factual_constraints":[],"required_ambiguity":["B's exact motive"]},
      "craft_state":{"current_strengths":["subtext","mutual moral legitimacy"],"current_weaknesses":["one explanatory afterbeat repeats dialogue"],"candidate_opportunities":[{"opportunity_id":"OP-DEFAULT","expected_impact":0.7,"diagnostic_confidence":0.9,"purpose_relevance":0.9,"edit_budget_fit":0.95,"preservation_risk":0.05,"voice_risk":0.08,"collateral_regression_risk":0.05,"hard_risks":[]}],"confidence":"HIGH","evidence_ids":["SYNTH-EVIDENCE-001"]}
    }

def opportunities(mode):
    if mode=="hard_canon": return [{"opportunity_id":"OP-CANON","expected_impact":1,"diagnostic_confidence":1,"purpose_relevance":1,"edit_budget_fit":1,"preservation_risk":0,"voice_risk":0,"collateral_regression_risk":0,"hard_risks":["canon_conflict"]}]
    if mode=="rank": return [
      {"opportunity_id":"OP-PRETTY","expected_impact":0.95,"diagnostic_confidence":0.45,"purpose_relevance":0.4,"edit_budget_fit":0.9,"preservation_risk":0.05,"voice_risk":0.05,"collateral_regression_risk":0.05,"hard_risks":[]},
      {"opportunity_id":"OP-HIGH-PURPOSE","expected_impact":0.8,"diagnostic_confidence":0.95,"purpose_relevance":1.0,"edit_budget_fit":0.95,"preservation_risk":0.05,"voice_risk":0.05,"collateral_regression_risk":0.05,"hard_risks":[]}
    ]
    if mode=="low": return [{"opportunity_id":"OP-LOW","expected_impact":0.1,"diagnostic_confidence":0.3,"purpose_relevance":0.2,"edit_budget_fit":0.5,"preservation_risk":0.1,"voice_risk":0.1,"collateral_regression_risk":0.1,"hard_risks":[]}]
    return None

cases=json.loads((ROOT/'fixtures/step_e_cases.json').read_text())['cases']
results=[]
for c in cases:
    s=base_state()
    for path,value in c.get('mutations',{}).items(): set_path(s,path,value)
    if c.get('opportunity_mode'):
        s['craft_state']['candidate_opportunities']=opportunities(c['opportunity_mode'])
    out=construct_passage_state({'state':s,'requested_scope':c.get('requested_scope','SURGICAL')})
    ok=True; detail={}
    if 'expected_status' in c: detail['status']=out['readiness']['status']; ok &= detail['status']==c['expected_status']
    if 'expected_selected' in c: detail['selected']=len(out['craft_state']['opportunity_priority']['selected']); ok &= detail['selected']==c['expected_selected']
    if 'expected_reject' in c: detail['reject']=out['craft_state']['opportunity_priority']['rejected'][0]['decision']; ok &= detail['reject']==c['expected_reject']
    if 'expected_top' in c: detail['top']=out['craft_state']['opportunity_priority']['selected'][0]['opportunity_id']; ok &= detail['top']==c['expected_top']
    if 'expected_warning' in c: detail['warning']=out['craft_state'].get('state_warning'); ok &= detail['warning']==c['expected_warning']
    if 'expected_max_scope' in c: detail['max_scope']=out['readiness']['maximum_edit_scope']; ok &= detail['max_scope']==c['expected_max_scope']
    results.append({'case_id':c['case_id'],'pass':bool(ok),**detail})
print(json.dumps({'standing':'PASS' if all(r['pass'] for r in results) else 'FAIL','fixture_count':len(results),'results':results},indent=2))
if not all(r['pass'] for r in results): raise SystemExit(1)
