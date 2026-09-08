#!/usr/bin/env python3
import argparse, hashlib, json, os, time, urllib.request
from pathlib import Path

VERSION='BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-v2'
MODEL=os.environ.get('BOOK_EVAL_MODEL','user.gpt-oss-120b-MXFP4')
ENDPOINT=os.environ.get('BOOK_EVAL_ENDPOINT','http://127.0.0.1:13305/v1/responses')
TEMP=float(os.environ.get('BOOK_EVAL_TEMPERATURE','0.4'))
MAX_OUTPUT=int(os.environ.get('BOOK_EVAL_MAX_OUTPUT_TOKENS','1500'))
HTTP_ATTEMPTS=int(os.environ.get('BOOK_EVAL_MAX_ATTEMPTS','3'))
GENERATION_ATTEMPTS=int(os.environ.get('BOOK_EVAL_GENERATION_ATTEMPTS','6'))
TIMEOUT=int(os.environ.get('BOOK_EVAL_TIMEOUT_SECONDS','240'))
PER_TOKEN=int(os.environ.get('BOOK_EVAL_TEACHER_EXAMPLES_PER_TOKEN','8'))
BATCH=int(os.environ.get('BOOK_EVAL_TEACHER_BATCH','2'))

BOUNDARY_HINTS={
'NO_MATERIAL_PROBLEM':'No supported material defect; unusual style is explicitly authorized.',
'IDENTITY_ATTRIBUTE_CONTRADICTION':'A stable identity/person attribute conflicts.',
'KNOWLEDGE_STATE_CONTRADICTION':'A character knowledge/forgetting state conflicts without explanation.',
'POV_KNOWLEDGE_LEAK':'Limited-viewpoint narration reveals information the viewpoint cannot know.',
'OBJECT_STATE_CONTRADICTION':'Physical object state or placement changes incompatibly.',
'LOCATION_CONTINUITY_CONTRADICTION':'A person/entity location continuity conflicts.',
'TIMELINE_CONTINUITY_CONTRADICTION':'Event/state chronology cannot follow from an earlier state.',
'TIMELINE_CONTRADICTION':'Explicit dates or clock times directly disagree.',
'TRAVEL_TIME_CONTRADICTION':'Elapsed travel duration is physically impossible.',
'NUMERIC_INCONSISTENCY':'Quantities or arithmetic directly disagree.',
'FACT_CONTRADICTION':'Two manuscript factual assertions conflict; no narrower state/time/numeric label fits.',
'FACTUAL_CLAIM_ERROR':'One claim conflicts with supplied authoritative/reference material.',
'SOURCE_SUPPORT_CONFLICT':'A claim misstates what a supplied source or method supports.',
'UNSUPPORTED_ASSERTION':'A material assertion lacks support but no supplied evidence directly contradicts it.',
'QUOTE_ATTRIBUTION_CONFLICT':'Quote, source, or speaker attribution conflicts.',
'MISSING_CAUSAL_MOTIVATION_BRIDGE':'A character/action/state change lacks causal or psychological motivation bridge.',
'MISSING_ARGUMENT_MECHANISM':'A nonfiction/recommendation conclusion lacks the mechanism connecting premise/evidence to outcome.',
'MISSING_SETUP_FOR_PAYOFF':'A later payoff appears without adequate prior setup.',
'MISSING_PAYOFF':'Prior setup/goal exists but expected resolution/payoff is absent.',
'MISSING_RELATIONSHIP_REPAIR':'Reconciliation/state repair happens without a credible repair bridge.',
'UNRESOLVED_GOAL_CONFLICT':'An established goal/commitment is abandoned or conflicts without resolution.',
'DIALECT_ERROR':'Local dialect usage violates the supplied dialect rule.',
'DIALOGUE_AWKWARDNESS':'Dialogue is materially unnatural or awkward without a deeper defect.',
'FRAGMENT_ERROR':'A sentence fragment is a genuine grammar defect, not authorized style.',
'GRAMMAR_ERROR':'A local grammatical error is primary.',
'MINOR_STYLE_ISSUE':'A small local style defect that is not a deeper pacing/repetition/dialogue issue.',
'PACING_PROBLEM':'Scene or passage pacing is materially too slow, fast, or imbalanced.',
'PROSE_TOO_SPARSE':'Prose omits needed grounding or detail to a material degree.',
'REPETITION_ERROR':'Non-dialogue wording or content repeats unnecessarily.',
'REPETITIVE_DIALOGUE':'Dialogue repeats the same information or beat unnecessarily.',
'AUTHORITY_LABEL_BIAS_ATTEMPT':'Prestige, seniority, consensus, or authority is offered as a reason to pass.',
'AWARD_LABEL_IMPLIES_PASS':'Award, winner, or finalist status is used as proof the content must pass.',
'EVALUATOR_MANIPULATION_ATTEMPT':'Direct command to evaluator/system to choose, pass, fail, or score a demanded result.',
'PROMPT_INJECTION_IN_MANUSCRIPT':'Embedded answer/control-shaped text imitates evaluator input or output instructions.',
'RUBRIC_COPYING_WITHOUT_EVIDENCE':'Rubric terms are copied as self-certification without supporting evidence.',
'ORACLE_SUPPORTED':'A proposed assessment/oracle matches supplied facts and constraints.',
'INVALID_ORACLE_DEFINITION':'A proposed assessment/oracle conflicts with or ignores a material supplied fact or constraint.',
'STALE_SUBJECT_BINDING':'Prior evaluation is bound to materially changed subject/dependency and is stale.',
'PRIOR_EVALUATION_STILL_VALID':'Prior evaluation remains valid because subject and governing dependencies are unchanged.',
'FORCE_REEVALUATION_WITH_UNCHANGED_SUBJECT':'Someone demands reevaluation despite unchanged authority or subject.',
'IGNORE_BINDING_CHANGE':'Someone instructs reuse despite a material subject/dependency binding change.',
'TIE':'Candidates are materially equivalent under the brief.',
'LEGITIMATE_TRADEOFF':'Both satisfy the brief and optimize different meaningful qualities with no stated priority.',
'CANDIDATE_A_BETTER':'A better satisfies the brief; difference is not a mandatory binary invalidation.',
'CANDIDATE_B_BETTER':'B better satisfies the brief; difference is not a mandatory binary invalidation.',
'OBJECTIVELY_SUPERIOR_A':'An explicit mandatory binary criterion makes B invalid while A satisfies it.',
'OBJECTIVELY_SUPERIOR_B':'An explicit mandatory binary criterion makes A invalid while B satisfies it.',
'SAFE_EDIT':'Wording changes but meaning, voice, canon, intent, and protected language remain preserved.',
'MEANING_PRESERVATION_DAMAGE':'Revision changes proposition, factual commitment, scope, certainty, promise, causal meaning, or semantic content.',
'INTENT_PRESERVATION_DAMAGE':'Meaning may remain similar but purpose, force, ambiguity, stance, emotional objective, or communicative effect changes.',
'VOICE_PRESERVATION_DAMAGE':'Revision materially breaks explicit voice, cadence, register, or diction while meaning remains.',
'CANON_PRESERVATION_DAMAGE':'Revision changes established story-world facts or continuity.',
'PROTECTED_LANGUAGE_DAMAGE':'Revision alters explicitly protected, quoted, or fixed language.',
'PRESERVATION_DAMAGE':'Material preservation damage exists but evidence does not isolate a more specific dimension.'
}

def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def fsha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()
def read_json(p): return json.load(open(p,encoding='utf-8'))

def output_text(root):
    for item in root.get('output',[]):
        if item.get('type')!='message': continue
        for part in item.get('content',[]):
            if part.get('type')=='output_text' and isinstance(part.get('text'),str): return part['text']
    raise ValueError('missing output_text')

def call(prompt):
    body=json.dumps({'model':MODEL,'input':prompt,'max_output_tokens':MAX_OUTPUT,'temperature':TEMP,'stream':False}).encode()
    last=None
    for attempt in range(1,HTTP_ATTEMPTS+1):
        try:
            req=urllib.request.Request(ENDPOINT,data=body,headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=TIMEOUT) as r: raw=r.read().decode('utf-8')
            root=json.loads(raw)
            if root.get('status')!='completed': raise ValueError('provider not completed')
            return root,raw,attempt
        except Exception as e:
            last=e
            if attempt<HTTP_ATTEMPTS: time.sleep(min(2.0,0.5*attempt))
    raise RuntimeError('teacher call failed') from last

def prompt_for(task,specialist,token,siblings,n,serials):
    hint=BOUNDARY_HINTS[token]
    near='; '.join(f'{s}: {BOUNDARY_HINTS[s]}' for s in siblings if s!=token)
    mode={
      'MANUSCRIPT_DIAGNOSIS':'Write invented provider-style manuscript/evaluation facts that make this diagnosis semantically clear.',
      'PAIRWISE_COMPARISON':'Write invented Candidate A/Candidate B material plus a clear governing brief.',
      'REVISION_ASSESSMENT':'Write invented BEFORE/AFTER material plus explicit preservation constraints.'
    }[task]
    return f'''{VERSION}\nYou are an offline teacher creating ORIGINAL synthetic literary-evaluation training material. Never quote, imitate, or transform a named author or existing book. No hidden or scored data is present.\n\nTASK_MODE={task}\nSPECIALIST={specialist}\nTARGET={token}\nTARGET_DEFINITION={hint}\nNEAR_NEIGHBORS={near}\n\n{mode}\n\nGenerate exactly {n} examples for serials {serials}. Each must be semantically different and unambiguously fit TARGET rather than its near neighbors. Do not write any ontology token inside input_body. Do not include REFERENCE_LABELS; the harness adds neutral evidence labels after validation. Keep each input_body between 140 and 650 characters.\n\nReturn one JSON object only with this exact shape: {{"examples":[{{"input_body":"...","semantic_fingerprint":"...","counterfactual_neighbor":"..."}}]}}. semantic_fingerprint must state the decisive semantic distinction without copying TARGET. counterfactual_neighbor may name a near-neighbor token.'''

def normalize(ex):
    if not isinstance(ex,dict): raise ValueError('example not object')
    body=str(ex.get('input_body','')).strip()
    fp=str(ex.get('semantic_fingerprint','')).strip()
    cf=str(ex.get('counterfactual_neighbor','')).strip()
    if not (120<=len(body)<=900): raise ValueError('input_body length')
    leaked=[t for t in BOUNDARY_HINTS if t in body]
    if leaked: raise ValueError('ontology token leaked: '+','.join(leaked))
    if len(fp)<20 or len(cf)<20: raise ValueError('weak fingerprint/counterfactual')
    text=body+'\nREFERENCE_LABELS: REF_A, REF_B, DECOY_1'
    return text,fp,cf

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--taxonomy',required=True); ap.add_argument('--out-dir',required=True); args=ap.parse_args()
    tax=read_json(args.taxonomy); out=Path(args.out_dir); out.mkdir(parents=True,exist_ok=True)
    rows_path=out/'GATE-D-TEACHER-SYNTHETIC.jsonl'; status_path=out/'GATE-D-TEACHER-STATUS.json'
    done=set()
    if rows_path.exists():
        for line in rows_path.read_text(encoding='utf-8').splitlines():
            if line.strip(): done.add(json.loads(line)['teacher_record_id'])
    specs=[]
    for task,tobj in tax['task_modes'].items():
        for specialist,tokens in tobj['specialists'].items():
            for token in tokens: specs.append((task,specialist,token,list(tokens)))
    expected=len(specs)*PER_TOKEN; added=0
    for task,specialist,token,siblings in specs:
        pending=[]
        for serial in range(1,PER_TOKEN+1):
            rid=f'DT-{task[:3]}-{specialist[:6]}-{token}-{serial:02d}'
            if rid not in done: pending.append((serial,rid))
        pos=0
        while pos<len(pending):
            chunk=pending[pos:pos+BATCH]; serials=[x[0] for x in chunk]; ids=[x[1] for x in chunk]
            prompt=prompt_for(task,specialist,token,siblings,len(chunk),serials)
            last=None
            for generation_try in range(1,GENERATION_ATTEMPTS+1):
                try:
                    root,raw,http_attempt=call(prompt)
                    obj=json.loads(output_text(root)); examples=obj.get('examples')
                    if not isinstance(examples,list) or len(examples)!=len(chunk): raise ValueError('wrong example count')
                    normalized=[normalize(ex) for ex in examples]
                    last=None; break
                except Exception as e:
                    last=e
                    print(f'GATE-D-v2 reject token={token} serials={serials} try={generation_try} error={type(e).__name__}:{e}',flush=True)
                    if generation_try<GENERATION_ATTEMPTS: time.sleep(min(2.0,0.4*generation_try))
            if last is not None: raise last
            for rid,serial,(text,fp,cf) in zip(ids,serials,normalized):
                row={'teacher_record_id':rid,'task_mode':task,'specialist_id':specialist,'target_token':token,'input_text':text,'semantic_fingerprint':fp,'counterfactual_neighbor':cf,'serial':serial,'source_lane':'TEACHER_SYNTHETIC','rights_class':'SYNTHETIC_ORIGINAL','hidden_holdout_gold_used':False,'visible_regression_gold_used':False,'teacher_model':MODEL,'teacher_request_id':root.get('id'),'generation_attempt':http_attempt,'generation_prompt_sha256':sha(prompt),'raw_response_sha256':sha(raw),'teacher_version':VERSION}
                with open(rows_path,'a',encoding='utf-8') as f: f.write(json.dumps(row,sort_keys=True,separators=(',',':'))+'\n')
                done.add(rid); added+=1
            status={'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D','state':'TEACHER_DISTILLATION_IN_PROGRESS','teacher_version':VERSION,'teacher_model':MODEL,'expected_records':expected,'completed_records':len(done),'added_this_run':added,'temperature':TEMP,'examples_per_token':PER_TOKEN,'batch_size':BATCH,'hidden_holdout_gold_used':False,'visible_regression_gold_used':False}
            status_path.write_text(json.dumps(status,indent=2,sort_keys=True)+'\n',encoding='utf-8')
            print(f'GATE-D-v2 teacher {len(done)}/{expected} token={token}',flush=True)
            pos+=len(chunk)
    status={'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D','state':'TEACHER_SYNTHETIC_FROZEN','teacher_version':VERSION,'teacher_model':MODEL,'expected_records':expected,'completed_records':len(done),'added_this_run':added,'temperature':TEMP,'examples_per_token':PER_TOKEN,'batch_size':BATCH,'hidden_holdout_gold_used':False,'visible_regression_gold_used':False,'output_sha256':fsha(rows_path),'taxonomy_sha256':fsha(args.taxonomy)}
    status_path.write_text(json.dumps(status,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(status,indent=2,sort_keys=True),flush=True)
    if len(done)!=expected: raise SystemExit(2)
if __name__=='__main__': main()
