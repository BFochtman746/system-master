#!/usr/bin/env python3
import argparse, hashlib, json, os, time, urllib.request
from pathlib import Path

VERSION = 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-v1'
MODEL = os.environ.get('BOOK_EVAL_MODEL','user.gpt-oss-120b-MXFP4')
ENDPOINT = os.environ.get('BOOK_EVAL_ENDPOINT','http://127.0.0.1:13305/v1/responses')
TEMP = float(os.environ.get('BOOK_EVAL_TEMPERATURE','0.6'))
MAX_OUTPUT = int(os.environ.get('BOOK_EVAL_MAX_OUTPUT_TOKENS','2200'))
MAX_ATTEMPTS = int(os.environ.get('BOOK_EVAL_MAX_ATTEMPTS','3'))
TIMEOUT = int(os.environ.get('BOOK_EVAL_TIMEOUT_SECONDS','240'))
PER_TOKEN = int(os.environ.get('BOOK_EVAL_TEACHER_EXAMPLES_PER_TOKEN','8'))
BATCH = int(os.environ.get('BOOK_EVAL_TEACHER_BATCH','4'))

TASK_GUIDE = {
'MANUSCRIPT_DIAGNOSIS': 'Create original literary-evaluation payloads. The target may be meta-evaluation, continuity/state, fact/source/evidence, structural/causal, surface-language, or clean control. Make the target distinction explicit in the facts but do not state the answer token inside the payload. Include realistic REFERENCE_LABELS at the end and optionally one DECOY label. Do not imitate any named author or quote existing books.',
'PAIRWISE_COMPARISON': 'Create original A-vs-B literary comparison payloads with a clear brief. Candidate positions must matter only through content. Distinguish equivalence, legitimate tradeoff, normal one-sided preference, and mandatory-objective invalidation. Do not state the answer token inside the payload. Include realistic REFERENCE_LABELS at the end.',
'REVISION_ASSESSMENT': 'Create original before/after revision payloads with explicit preservation constraints. Distinguish safe/no-material change from meaning, intent, voice, canon, protected-language, or unspecified preservation damage. Do not state the answer token inside the payload. Include realistic REFERENCE_LABELS at the end.'
}

BOUNDARY_HINTS = {
'NO_MATERIAL_PROBLEM':'No supported material defect; any unusual style is explicitly authorized.',
'IDENTITY_ATTRIBUTE_CONTRADICTION':'A stable identity or person attribute conflicts.',
'KNOWLEDGE_STATE_CONTRADICTION':'A character knowledge/forgetting state conflicts without explanation.',
'POV_KNOWLEDGE_LEAK':'Limited viewpoint narration reveals information the viewpoint cannot know.',
'OBJECT_STATE_CONTRADICTION':'Physical object state or placement changes incompatibly.',
'LOCATION_CONTINUITY_CONTRADICTION':'A person/entity location continuity conflicts.',
'TIMELINE_CONTINUITY_CONTRADICTION':'Event/state chronology cannot follow from earlier state.',
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
'ORACLE_SUPPORTED':'A proposed assessment or oracle matches supplied facts and constraints.',
'INVALID_ORACLE_DEFINITION':'A proposed assessment or oracle conflicts with or ignores a material supplied fact or constraint.',
'STALE_SUBJECT_BINDING':'Prior evaluation is bound to materially changed subject or dependency and is stale.',
'PRIOR_EVALUATION_STILL_VALID':'Prior evaluation remains valid because subject and governing dependencies are unchanged.',
'FORCE_REEVALUATION_WITH_UNCHANGED_SUBJECT':'Someone demands reevaluation despite unchanged authority or subject.',
'IGNORE_BINDING_CHANGE':'Someone instructs reuse despite a material subject or dependency binding change.',
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
    for attempt in range(1,MAX_ATTEMPTS+1):
        try:
            req=urllib.request.Request(ENDPOINT,data=body,headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=TIMEOUT) as r: raw=r.read().decode('utf-8')
            root=json.loads(raw)
            if root.get('status')!='completed': raise ValueError('provider not completed')
            return root, raw, attempt
        except Exception as e:
            last=e
            if attempt<MAX_ATTEMPTS: time.sleep(min(1.5,0.5*attempt))
    raise RuntimeError('teacher call failed') from last

def normalize_example(ex, task, specialist, token, serial):
    if not isinstance(ex,dict): raise ValueError('example not object')
    text=str(ex.get('input_text','')).strip()
    fp=str(ex.get('semantic_fingerprint','')).strip()
    cf=str(ex.get('counterfactual_neighbor','')).strip()
    if len(text)<120: raise ValueError('input_text too short')
    if token in text: raise ValueError('answer token leaked into input_text')
    if 'REFERENCE_LABELS:' not in text: raise ValueError('missing REFERENCE_LABELS')
    if len(fp)<20 or len(cf)<20: raise ValueError('weak fingerprint/counterfactual')
    return {'task_mode':task,'specialist_id':specialist,'target_token':token,'input_text':text,'semantic_fingerprint':fp,'counterfactual_neighbor':cf,'serial':serial}

def prompt_for(task,specialist,token,siblings,n,round_no):
    hint=BOUNDARY_HINTS.get(token, token.replace('_',' ').title())
    sib='; '.join(f'{s}: {BOUNDARY_HINTS.get(s,s.replace("_"," ").title())}' for s in siblings if s!=token)
    return f'''{VERSION}\nYou are an offline teacher generating ORIGINAL synthetic training cases for a literary evaluator. This is NOT evaluation of hidden data. Never quote, imitate, or transform any named copyrighted book or author.\n\nTASK_MODE={task}\nSPECIALIST={specialist}\nTARGET_TOKEN={token}\nTARGET_DEFINITION={hint}\nNEAR_NEIGHBORS={sib}\n\n{TASK_GUIDE[task]}\n\nGenerate exactly {n} semantically diverse examples that unambiguously belong to TARGET_TOKEN and specifically resist confusion with the near-neighbor labels. Vary genre, names, setting, sentence structure, and surface vocabulary. Use invented content only.\n\nFor each example return:\n- input_text: a complete provider-style payload ending with REFERENCE_LABELS. Do NOT include TARGET_TOKEN or any ontology token in input_text.\n- semantic_fingerprint: concise explanation of the decisive semantic features that make TARGET_TOKEN correct.\n- counterfactual_neighbor: one minimal change that would make a named near-neighbor category more appropriate; you may name the neighbor here.\n\nRound={round_no}. Return ONE JSON object only: {{"examples":[{{"input_text":"...","semantic_fingerprint":"...","counterfactual_neighbor":"..."}}]}}'''

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--taxonomy',required=True)
    ap.add_argument('--out-dir',required=True)
    args=ap.parse_args()
    tax=read_json(args.taxonomy)
    out=Path(args.out_dir); out.mkdir(parents=True,exist_ok=True)
    rows_path=out/'GATE-D-TEACHER-SYNTHETIC.jsonl'
    status_path=out/'GATE-D-TEACHER-STATUS.json'
    done=set()
    if rows_path.exists():
        for line in rows_path.read_text(encoding='utf-8').splitlines():
            if line.strip(): done.add(json.loads(line)['teacher_record_id'])
    target_specs=[]
    for task,tobj in tax['task_modes'].items():
        for specialist,tokens in tobj['specialists'].items():
            for token in tokens: target_specs.append((task,specialist,token,list(tokens)))
    expected=len(target_specs)*PER_TOKEN
    generated=0
    for task,specialist,token,siblings in target_specs:
        rounds=(PER_TOKEN+BATCH-1)//BATCH
        for round_no in range(rounds):
            start=round_no*BATCH
            n=min(BATCH,PER_TOKEN-start)
            ids=[f'DT-{task[:3]}-{specialist[:6]}-{token}-{start+i+1:02d}' for i in range(n)]
            if all(i in done for i in ids): continue
            prompt=prompt_for(task,specialist,token,siblings,n,round_no+1)
            root,raw,attempt=call(prompt)
            obj=json.loads(output_text(root))
            examples=obj.get('examples')
            if not isinstance(examples,list) or len(examples)!=n: raise ValueError(f'expected {n} examples for {token}')
            normalized=[normalize_example(ex,task,specialist,token,start+i+1) for i,ex in enumerate(examples)]
            for rid,norm in zip(ids,normalized):
                row={'teacher_record_id':rid,**norm,'source_lane':'TEACHER_SYNTHETIC','rights_class':'SYNTHETIC_ORIGINAL','hidden_holdout_gold_used':False,'visible_regression_gold_used':False,'teacher_model':MODEL,'teacher_request_id':root.get('id'),'generation_attempt':attempt,'generation_prompt_sha256':sha(prompt),'raw_response_sha256':sha(raw),'teacher_version':VERSION}
                with open(rows_path,'a',encoding='utf-8') as f: f.write(json.dumps(row,sort_keys=True,separators=(',',':'))+'\n')
                done.add(rid); generated+=1
            status={'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D','state':'TEACHER_DISTILLATION_IN_PROGRESS','teacher_version':VERSION,'teacher_model':MODEL,'expected_records':expected,'completed_records':len(done),'added_this_run':generated,'temperature':TEMP,'examples_per_token':PER_TOKEN,'batch_size':BATCH,'hidden_holdout_gold_used':False,'visible_regression_gold_used':False}
            status_path.write_text(json.dumps(status,indent=2,sort_keys=True)+'\n',encoding='utf-8')
            print(f'GATE-D teacher {len(done)}/{expected} token={token}',flush=True)
    status={'objective':'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D','state':'TEACHER_SYNTHETIC_FROZEN','teacher_version':VERSION,'teacher_model':MODEL,'expected_records':expected,'completed_records':len(done),'added_this_run':generated,'temperature':TEMP,'examples_per_token':PER_TOKEN,'batch_size':BATCH,'hidden_holdout_gold_used':False,'visible_regression_gold_used':False,'output_sha256':fsha(rows_path),'taxonomy_sha256':fsha(args.taxonomy)}
    status_path.write_text(json.dumps(status,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(status,indent=2,sort_keys=True))
    if len(done)!=expected: raise SystemExit(2)
if __name__=='__main__': main()
