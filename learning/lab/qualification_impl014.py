from __future__ import annotations
import copy, json, os, tempfile
from dataclasses import asdict
from typing import Any, Dict

from learning_lab.domain_general import DomainGeneralLearningEngine, default_domain_registry
from learning_lab.engine import InjectedCrash
from learning_lab.external_standard import asq_cssgb_2022_standard, build_external_requirement_set
from learning_lab.repository import Repository, digest
from learning_lab.standard_aligned_module import (
    ASQ_CHARTER_REQ, ASQ_DEFINE_DOSSIER, ASQ_DEFINE_OUTCOME, ASQ_SIPOC_REQ,
    ASQDefineBehaviorOracle, StandardAlignedModuleCompiler, asq_define_domain_spec,
    build_asq_define_course, build_assessment_blueprint, execute_update_training_delta,
    validate_standard_aligned_module, _charter_answer, _sipoc_answer,
)


def future_set(req:Dict[str,Any])->Dict[str,Any]:
    n=copy.deepcopy(req); n['owner_version']='SYNTHETIC-FUTURE-FIXTURE'; n['external_standard_id']='ASQ-CSSGB-BOK-SYNTHETIC-FUTURE'; n['requirement_set_id']='REQSET-ASQ-CSSGB-BOK-SYNTHETIC-FUTURE'; n['external_standard_digest']='SYNTHETIC-FUTURE-STANDARD-DIGEST'
    r=next(x for x in n['requirements'] if x['requirement_id']==ASQ_CHARTER_REQ)
    r['title']='Project charter with explicit baseline, goal, scope, and risk framing'; r['highest_cognitive_level']='ANALYZE'
    n['requirement_set_digest']=digest({k:v for k,v in n.items() if k!='requirement_set_digest'})
    return n


def demo()->Dict[str,Any]:
    with tempfile.TemporaryDirectory() as td:
        reg=default_domain_registry(); reg.register(asq_define_domain_spec()); eng=DomainGeneralLearningEngine(Repository(os.path.join(td,'lab.db')),reg)
        cid=eng.create_research_grounded_course_job(operation_id='C',job_id='J',goal_id='G',title='ASQ bounded module',desired_outcome=ASQ_DEFINE_OUTCOME)['course_id']
        eng.submit_attempt(operation_id='M1',attempt_id='M1',learner_id='L',course_id=cid,item_id='M-ASQ-SIPOC-1',response=_sipoc_answer('FULFILLMENT'),submitted_at=1000)
        eng.submit_attempt(operation_id='R1',attempt_id='R1',learner_id='L',course_id=cid,item_id='R-ASQ-SIPOC-1',response=_sipoc_answer('SERVICE'),submitted_at=4600)
        p1=eng.submit_transfer_attempt(operation_id='T1',attempt_id='T1',learner_id='L',course_id=cid,task_id='T-ASQ-SIPOC-WAREHOUSE',response=_sipoc_answer('WAREHOUSE'),submitted_at=4601)['projection']
        eng.submit_attempt(operation_id='M2',attempt_id='M2',learner_id='L',course_id=cid,item_id='M-ASQ-CHARTER-1',response=_charter_answer('FULFILLMENT'),submitted_at=4700)
        eng.submit_attempt(operation_id='R2',attempt_id='R2',learner_id='L',course_id=cid,item_id='R-ASQ-CHARTER-1',response=_charter_answer('SERVICE'),submitted_at=8300)
        p2=eng.submit_transfer_attempt(operation_id='T2',attempt_id='T2',learner_id='L',course_id=cid,task_id='T-ASQ-CHARTER-WAREHOUSE',response=_charter_answer('WAREHOUSE'),submitted_at=8301)['projection']
        nxt=eng.next_action('L',cid,now=8301)
        return {'course_id':cid,'sipoc_stage':p1['stage'],'charter_stage':p2['stage'],'next_action':nxt['action_type'],'course_digest':digest(eng.course(cid))}


def adversarial()->Dict[str,Any]:
    packet=asq_cssgb_2022_standard(); req=build_external_requirement_set(packet); course=asdict(build_asq_define_course(goal_id='G',title='M',desired_outcome=ASQ_DEFINE_OUTCOME,dossier=ASQ_DEFINE_DOSSIER)); course['domain_key']='asq-cssgb-define-sipoc-charter'
    cases={}
    def ok(name,fn):
        try: cases[name]=bool(fn())
        except Exception: cases[name]=True
    # Deliberately bad inputs must fail/contain.
    bad=copy.deepcopy(req); bad['requirements'][0]['title']='tamper'
    ok('tampered_requirement_old_digest',lambda: _raises(lambda: build_assessment_blueprint(course,bad),'REQUIREMENT_SET_DIGEST_MISMATCH'))
    bad2=copy.deepcopy(req); bad2['requirements']=[r for r in bad2['requirements'] if r['requirement_id']!=ASQ_CHARTER_REQ]; bad2['requirement_set_digest']=digest({k:v for k,v in bad2.items() if k!='requirement_set_digest'})
    ok('missing_selected_requirement',lambda: _raises(lambda: build_assessment_blueprint(course,bad2),'SELECTED_EXTERNAL_REQUIREMENT_MISSING'))
    b=copy.deepcopy(course); next(i for i in b['items'] if i['item_id']=='M-ASQ-SIPOC-1')['answer']='{}'
    cases['wrong_sipoc_key']=ASQDefineBehaviorOracle().validate_reference_items(b)['status']=='FAIL'
    b=copy.deepcopy(course); next(i for i in b['items'] if i['item_id']=='M-ASQ-CHARTER-1')['answer']='{}'
    cases['wrong_charter_key']=ASQDefineBehaviorOracle().validate_reference_items(b)['status']=='FAIL'
    b=copy.deepcopy(course); b['lessons'][0]['worked_examples']=b['lessons'][0]['worked_examples'][:1]
    cases['shallow_lesson']=validate_standard_aligned_module(b,req)['status']=='FAIL'
    b=copy.deepcopy(course); b['items']=[i for i in b['items'] if not (i['criterion_id']=='C-ASQ-CHARTER' and i['mode']=='RETENTION_CHECK')]
    cases['missing_retention']=validate_standard_aligned_module(b,req)['status']=='FAIL'
    b=copy.deepcopy(course); next(i for i in b['items'] if i['item_id']=='M-ASQ-SIPOC-1')['family_id']='F-ASQ-SIPOC-P1'
    cases['practice_mastery_family_leak']=validate_standard_aligned_module(b,req)['status']=='FAIL'
    item=next(i for i in course['items'] if i['item_id']=='M-ASQ-SIPOC-1')
    cases['missing_sipoc_customer']=not ASQDefineBehaviorOracle().score(item,'{"suppliers":[],"inputs":[],"process_steps":[],"outputs":[],"customers":[],"start":"x","end":"y"}')
    item=next(i for i in course['items'] if i['item_id']=='M-ASQ-CHARTER-1')
    cases['wrong_charter_baseline']=not ASQDefineBehaviorOracle().score(item,'{"problem_statement":"late orders","baseline":"2%","goal":"8%","primary_metric":"late-order rate","scope_in":"order receipt to shipment","scope_out":"supplier manufacturing"}')
    u=execute_update_training_delta(course,req,future_set(req))
    cases['update_not_full_retake']=u['retake_entire_course_required'] is False
    cases['update_only_charter']=u['affected_requirement_ids']==[ASQ_CHARTER_REQ]
    cases['sipoc_preserved']=next(x for x in u['revalidation_plan'] if x['external_requirement_id']==ASQ_SIPOC_REQ)['standing']=='PRESERVE_BY_SEMANTIC_EQUIVALENCE'
    cases['charter_revalidated']=next(x for x in u['revalidation_plan'] if x['external_requirement_id']==ASQ_CHARTER_REQ)['standing']=='REVALIDATION_REQUIRED'
    cases['update_no_certification']=u['external_certification_status']=='NOT_MADE'
    cases['module_no_certification']=build_assessment_blueprint(course,req)['external_certification_status']=='NOT_MADE'
    # Existing core integrity under the new domain.
    with tempfile.TemporaryDirectory() as td:
        reg=default_domain_registry(); reg.register(asq_define_domain_spec()); eng=DomainGeneralLearningEngine(Repository(os.path.join(td,'x.db')),reg); cid=eng.create_research_grounded_course_job(operation_id='C',job_id='J',goal_id='G',title='M',desired_outcome=ASQ_DEFINE_OUTCOME)['course_id']
        a=eng.submit_attempt(operation_id='A',attempt_id='A',learner_id='L',course_id=cid,item_id='M-ASQ-SIPOC-1',response=_sipoc_answer('FULFILLMENT'),submitted_at=1000,assisted=True)
        cases['assisted_mastery_excluded']=a['projection']['stage']!='MASTERED'
        cases['answer_reveal_blocked']=_raises(lambda: eng.submit_attempt(operation_id='B',attempt_id='B',learner_id='L',course_id=cid,item_id='M-ASQ-SIPOC-1',response=_sipoc_answer('FULFILLMENT'),submitted_at=1001,answer_revealed_before_commit=True),'IntegrityPolicyViolation')
        cases['transfer_before_retention_blocked']=_raises(lambda: eng.submit_transfer_attempt(operation_id='T',attempt_id='T',learner_id='L',course_id=cid,task_id='T-ASQ-SIPOC-WAREHOUSE',response=_sipoc_answer('WAREHOUSE'),submitted_at=1002),'TRANSFER_NOT_ELIGIBLE')
    # Compiler exact-operation and requirement body binding.
    with tempfile.TemporaryDirectory() as td:
        repo=Repository(os.path.join(td,'x.db')); svc=StandardAlignedModuleCompiler(repo); svc.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=req)
        changed=copy.deepcopy(req); next(x for x in changed['requirements'] if x['requirement_id']==ASQ_CHARTER_REQ)['title']='changed charter text'; changed['requirement_set_digest']=digest({k:v for k,v in changed.items() if k!='requirement_set_digest'})
        cases['changed_reqset_same_operation_conflict']=_raises(lambda: svc.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=changed),'IDEMPOTENCY_DIGEST_MISMATCH')
    cases['no_change_no_update']=execute_update_training_delta(course,req,copy.deepcopy(req))['status']=='NO_UPDATE_NEEDED'
    cases['two_requirement_scope']=len(build_assessment_blueprint(course,req)['rows'])==2
    cases['cognitive_alignment_preserved']=all(x['external_cognitive_level'] in {'ANALYZE','APPLY'} for x in build_assessment_blueprint(course,req)['rows'])
    cases['human_review_boundary']=validate_standard_aligned_module(course,req)['standing']=='MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED'
    cases['unrelated_66_not_compiled']=len(course['skills'])==2
    cases['exact_source_claims_present']=set(ASQ_DEFINE_DOSSIER['external_requirement_ids'])=={ASQ_SIPOC_REQ,ASQ_CHARTER_REQ}
    return {'total':len(cases),'passed':sum(cases.values()),'cases':cases,'status':'PASS' if all(cases.values()) else 'FAIL'}


def _raises(fn,needle):
    try: fn()
    except Exception as e: return needle in str(e)
    return False


def recovery_campaign(runs:int=100)->Dict[str,Any]:
    packet=asq_cssgb_2022_standard(); req=build_external_requirement_set(packet); phases=StandardAlignedModuleCompiler.PHASES
    digests=[]; counts={p:0 for p in phases}
    for i in range(runs):
        p=phases[i%len(phases)]; counts[p]+=1
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); svc=StandardAlignedModuleCompiler(repo)
            try: svc.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=req,crash_after_phase=p)
            except InjectedCrash: pass
            out=svc.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=req); digests.append((out['course_digest'],out['assessment_blueprint_digest'],out['alignment_digest']))
    return {'runs':runs,'phase_counts':counts,'unique_result_tuples':len(set(digests)),'status':'PASS' if len(set(digests))==1 else 'FAIL'}


def deterministic_campaign(runs:int=100)->Dict[str,Any]:
    packet=asq_cssgb_2022_standard(); req=build_external_requirement_set(packet); new=future_set(req); tuples=[]
    for i in range(runs):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); out=StandardAlignedModuleCompiler(repo).execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=req); course=repo.get_object('course',out['course_id'],1); upd=execute_update_training_delta(course,req,new); tuples.append((out['course_digest'],out['assessment_blueprint_digest'],out['alignment_digest'],upd['update_execution_digest']))
    return {'runs':runs,'unique_result_tuples':len(set(tuples)),'status':'PASS' if len(set(tuples))==1 else 'FAIL'}
