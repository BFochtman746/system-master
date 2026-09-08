import copy, os, tempfile, unittest

from learning_lab.domain_general import DomainGeneralLearningEngine, default_domain_registry
from learning_lab.external_standard import asq_cssgb_2022_standard, build_external_requirement_set
from learning_lab.models import MasteryStage
from learning_lab.repository import Repository, digest
from learning_lab.standard_aligned_module import (
    ASQ_CHARTER_REQ, ASQ_DEFINE_DOSSIER, ASQ_DEFINE_OUTCOME, ASQ_SIPOC_REQ,
    ASQDefineBehaviorOracle, StandardAlignedModuleCompiler, asq_define_domain_spec,
    build_asq_define_course, build_assessment_blueprint, execute_update_training_delta,
    validate_standard_aligned_module, _charter_answer, _sipoc_answer,
)


def future_requirement_set(req):
    n=copy.deepcopy(req)
    n['owner_version']='SYNTHETIC-FUTURE-FIXTURE'
    n['external_standard_id']='ASQ-CSSGB-BOK-SYNTHETIC-FUTURE'
    n['requirement_set_id']='REQSET-ASQ-CSSGB-BOK-SYNTHETIC-FUTURE'
    n['external_standard_digest']='SYNTHETIC-FUTURE-STANDARD-DIGEST'
    row=next(x for x in n['requirements'] if x['requirement_id']==ASQ_CHARTER_REQ)
    row['title']='Project charter with explicit baseline, goal, scope, and risk framing'
    row['highest_cognitive_level']='ANALYZE'
    n['requirement_set_digest']=digest({k:v for k,v in n.items() if k!='requirement_set_digest'})
    return n

class StandardAlignedBoundedModuleTests(unittest.TestCase):
    def setUp(self):
        self.packet=asq_cssgb_2022_standard()
        self.req=build_external_requirement_set(self.packet)
        self.course=build_asq_define_course(goal_id='G-ASQ-014',title='ASQ Define bounded module',desired_outcome=ASQ_DEFINE_OUTCOME,dossier=ASQ_DEFINE_DOSSIER)
        self.body=copy.deepcopy(self.course.__dict__)
        # dataclass nested members need asdict in production; use compiler helper path for validation tests.
        from dataclasses import asdict
        self.body=asdict(self.course); self.body['domain_key']='asq-cssgb-define-sipoc-charter'

    def test_scope_is_exactly_two_external_requirements(self):
        bp=build_assessment_blueprint(self.body,self.req); self.assertEqual({r['external_requirement_id'] for r in bp['rows']},{ASQ_SIPOC_REQ,ASQ_CHARTER_REQ})
    def test_does_not_compile_all_66_requirements(self):
        self.assertEqual(len(build_assessment_blueprint(self.body,self.req)['rows']),2)
    def test_sipoc_requirement_is_analyze(self):
        r=next(x for x in build_assessment_blueprint(self.body,self.req)['rows'] if x['external_requirement_id']==ASQ_SIPOC_REQ); self.assertEqual(r['external_cognitive_level'],'ANALYZE')
    def test_charter_requirement_is_apply(self):
        r=next(x for x in build_assessment_blueprint(self.body,self.req)['rows'] if x['external_requirement_id']==ASQ_CHARTER_REQ); self.assertEqual(r['external_cognitive_level'],'APPLY')
    def test_sipoc_blueprint_requires_scenario_analysis(self):
        r=next(x for x in build_assessment_blueprint(self.body,self.req)['rows'] if x['external_requirement_id']==ASQ_SIPOC_REQ); self.assertEqual(r['required_performance'],'INDEPENDENT_SCENARIO_ANALYSIS')
    def test_charter_blueprint_requires_application(self):
        r=next(x for x in build_assessment_blueprint(self.body,self.req)['rows'] if x['external_requirement_id']==ASQ_CHARTER_REQ); self.assertEqual(r['required_performance'],'INDEPENDENT_APPLICATION_TASK')
    def test_blueprint_requires_mastery_retention_transfer_for_both(self):
        self.assertTrue(all(set(r['assessment_modes'])=={'MASTERY_CHECK','RETENTION_CHECK','TRANSFER_CHECK'} for r in build_assessment_blueprint(self.body,self.req)['rows']))
    def test_project_charter_hard_prerequisite_is_sipoc(self):
        s=next(x for x in self.body['skills'] if x['skill_id']=='S-ASQ-CHARTER'); self.assertEqual(s['hard_prerequisite_skill_ids'],['S-ASQ-SIPOC'])
    def test_two_lessons_only(self): self.assertEqual(len(self.body['lessons']),2)
    def test_each_lesson_has_two_worked_examples(self): self.assertTrue(all(len(x['worked_examples'])>=2 for x in self.body['lessons']))
    def test_each_lesson_has_two_practice_items(self): self.assertTrue(all(len(x['practice_item_ids'])>=2 for x in self.body['lessons']))
    def test_grounding_uses_only_admitted_asq_claims(self): self.assertEqual(validate_standard_aligned_module(self.body,self.req)['grounding']['status'],'PASS')
    def test_instructional_validation_passes(self): self.assertEqual(validate_standard_aligned_module(self.body,self.req)['instructional']['status'],'PASS')
    def test_reference_answers_independently_validate(self): self.assertEqual(ASQDefineBehaviorOracle().validate_reference_items(self.body)['status'],'PASS')
    def test_wrong_sipoc_answer_key_is_caught(self):
        b=copy.deepcopy(self.body); i=next(x for x in b['items'] if x['item_id']=='M-ASQ-SIPOC-1'); i['answer']='{}'; self.assertEqual(ASQDefineBehaviorOracle().validate_reference_items(b)['status'],'FAIL')
    def test_wrong_charter_answer_key_is_caught(self):
        b=copy.deepcopy(self.body); i=next(x for x in b['items'] if x['item_id']=='M-ASQ-CHARTER-1'); i['answer']='{}'; self.assertEqual(ASQDefineBehaviorOracle().validate_reference_items(b)['status'],'FAIL')
    def test_sipoc_oracle_rejects_missing_customer(self):
        import json
        x=json.loads(_sipoc_answer('FULFILLMENT')); x['customers']=[]; item=next(i for i in self.body['items'] if i['item_id']=='M-ASQ-SIPOC-1'); self.assertFalse(ASQDefineBehaviorOracle().score(item,json.dumps(x)))
    def test_sipoc_oracle_accepts_equivalent_list_order(self):
        import json
        x=json.loads(_sipoc_answer('FULFILLMENT')); x['suppliers']=list(reversed(x['suppliers'])); item=next(i for i in self.body['items'] if i['item_id']=='M-ASQ-SIPOC-1'); self.assertTrue(ASQDefineBehaviorOracle().score(item,json.dumps(x)))
    def test_charter_oracle_rejects_wrong_baseline(self):
        import json
        x=json.loads(_charter_answer('FULFILLMENT')); x['baseline']='2%'; item=next(i for i in self.body['items'] if i['item_id']=='M-ASQ-CHARTER-1'); self.assertFalse(ASQDefineBehaviorOracle().score(item,json.dumps(x)))
    def test_charter_oracle_rejects_scope_omission(self):
        import json
        x=json.loads(_charter_answer('FULFILLMENT')); x['scope_in']='order receipt'; item=next(i for i in self.body['items'] if i['item_id']=='M-ASQ-CHARTER-1'); self.assertFalse(ASQDefineBehaviorOracle().score(item,json.dumps(x)))
    def test_full_module_validation_passes(self): self.assertEqual(validate_standard_aligned_module(self.body,self.req)['status'],'PASS')
    def test_module_standing_requires_human_review(self): self.assertEqual(validate_standard_aligned_module(self.body,self.req)['standing'],'MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED')
    def test_blueprint_never_claims_external_certification(self): self.assertEqual(build_assessment_blueprint(self.body,self.req)['external_certification_status'],'NOT_MADE')
    def test_compiler_persists_course_blueprint_alignment(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); out=StandardAlignedModuleCompiler(repo).execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=self.req)
            self.assertIsNotNone(repo.get_object('course',out['course_id'],1)); self.assertIsNotNone(repo.get_object('standard_aligned_assessment_blueprint',out['course_id'],1)); self.assertIsNotNone(repo.get_object('standard_module_alignment',out['course_id'],1))
    def test_compiler_replay_is_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); s=StandardAlignedModuleCompiler(repo); a=s.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=self.req); b=s.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=copy.deepcopy(self.req)); self.assertEqual(a,b)
    def test_tampered_requirement_set_with_old_digest_fails_closed(self):
        bad=copy.deepcopy(self.req); bad['requirements'][0]['title']='tampered'
        with self.assertRaisesRegex(ValueError,'REQUIREMENT_SET_DIGEST_MISMATCH'): build_assessment_blueprint(self.body,bad)
    def test_compiler_rejects_tampered_requirement_set_with_old_digest(self):
        bad=copy.deepcopy(self.req); bad['requirements'][0]['highest_cognitive_level']='CREATE'
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaisesRegex(ValueError,'REQUIREMENT_SET_DIGEST_MISMATCH'): StandardAlignedModuleCompiler(Repository(os.path.join(td,'x.db'))).execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=bad)
    def test_compiler_changed_requirement_set_same_operation_conflicts(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); s=StandardAlignedModuleCompiler(repo); s.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=self.req)
            changed=copy.deepcopy(self.req); next(x for x in changed['requirements'] if x['requirement_id']==ASQ_CHARTER_REQ)['title']='changed charter text'; changed['requirement_set_digest']=digest({k:v for k,v in changed.items() if k!='requirement_set_digest'})
            with self.assertRaisesRegex(ValueError,'IDEMPOTENCY_DIGEST_MISMATCH'): s.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=changed)
    def test_compiler_recovers_every_checkpoint(self):
        for phase in StandardAlignedModuleCompiler.PHASES:
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as td:
                repo=Repository(os.path.join(td,'x.db')); s=StandardAlignedModuleCompiler(repo)
                with self.assertRaises(Exception): s.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=self.req,crash_after_phase=phase)
                out=s.execute(operation_id='OP',job_id='J',goal_id='G',requirement_set=self.req); self.assertEqual(out['status'],'COMPLETE')
    def test_domain_registry_can_add_asq_without_replacing_existing_domains(self):
        r=default_domain_registry(); before=set(r.domain_keys); r.register(asq_define_domain_spec()); self.assertTrue(before.issubset(set(r.domain_keys))); self.assertIn('asq-cssgb-define-sipoc-charter',r.domain_keys)
    def test_domain_general_engine_builds_asq_module(self):
        with tempfile.TemporaryDirectory() as td:
            r=default_domain_registry(); r.register(asq_define_domain_spec()); e=DomainGeneralLearningEngine(Repository(os.path.join(td,'x.db')),r); out=e.create_research_grounded_course_job(operation_id='OP',job_id='J',goal_id='G',title='ASQ module',desired_outcome=ASQ_DEFINE_OUTCOME); self.assertEqual(out['domain_key'],'asq-cssgb-define-sipoc-charter')
    def test_domain_general_engine_oracle_scores_semantic_json(self):
        with tempfile.TemporaryDirectory() as td:
            r=default_domain_registry(); r.register(asq_define_domain_spec()); e=DomainGeneralLearningEngine(Repository(os.path.join(td,'x.db')),r); out=e.create_research_grounded_course_job(operation_id='OP',job_id='J',goal_id='G',title='ASQ module',desired_outcome=ASQ_DEFINE_OUTCOME)
            a=e.submit_attempt(operation_id='A',attempt_id='A',learner_id='L',course_id=out['course_id'],item_id='M-ASQ-SIPOC-1',response=_sipoc_answer('FULFILLMENT'),submitted_at=1000); self.assertTrue(a['attempt']['correct'])
    def test_sipoc_mastery_retention_transfer_reaches_mastered(self):
        with tempfile.TemporaryDirectory() as td:
            r=default_domain_registry(); r.register(asq_define_domain_spec()); e=DomainGeneralLearningEngine(Repository(os.path.join(td,'x.db')),r); out=e.create_research_grounded_course_job(operation_id='OP',job_id='J',goal_id='G',title='ASQ module',desired_outcome=ASQ_DEFINE_OUTCOME)
            cid=out['course_id']; e.submit_attempt(operation_id='M',attempt_id='M',learner_id='L',course_id=cid,item_id='M-ASQ-SIPOC-1',response=_sipoc_answer('FULFILLMENT'),submitted_at=1000)
            e.submit_attempt(operation_id='R',attempt_id='R',learner_id='L',course_id=cid,item_id='R-ASQ-SIPOC-1',response=_sipoc_answer('SERVICE'),submitted_at=4600)
            z=e.submit_transfer_attempt(operation_id='T',attempt_id='T',learner_id='L',course_id=cid,task_id='T-ASQ-SIPOC-WAREHOUSE',response=_sipoc_answer('WAREHOUSE'),submitted_at=4601); self.assertEqual(z['projection']['stage'],MasteryStage.MASTERED.value)
    def test_charter_blocked_until_sipoc_mastered(self):
        with tempfile.TemporaryDirectory() as td:
            r=default_domain_registry(); r.register(asq_define_domain_spec()); e=DomainGeneralLearningEngine(Repository(os.path.join(td,'x.db')),r); out=e.create_research_grounded_course_job(operation_id='OP',job_id='J',goal_id='G',title='ASQ module',desired_outcome=ASQ_DEFINE_OUTCOME); self.assertNotEqual(e.next_action('L',out['course_id'],now=1000)['skill_id'],'S-ASQ-CHARTER')
    def test_full_two_skill_journey_completes(self):
        with tempfile.TemporaryDirectory() as td:
            r=default_domain_registry(); r.register(asq_define_domain_spec()); e=DomainGeneralLearningEngine(Repository(os.path.join(td,'x.db')),r); cid=e.create_research_grounded_course_job(operation_id='OP',job_id='J',goal_id='G',title='ASQ module',desired_outcome=ASQ_DEFINE_OUTCOME)['course_id']
            e.submit_attempt(operation_id='M1',attempt_id='M1',learner_id='L',course_id=cid,item_id='M-ASQ-SIPOC-1',response=_sipoc_answer('FULFILLMENT'),submitted_at=1000); e.submit_attempt(operation_id='R1',attempt_id='R1',learner_id='L',course_id=cid,item_id='R-ASQ-SIPOC-1',response=_sipoc_answer('SERVICE'),submitted_at=4600); e.submit_transfer_attempt(operation_id='T1',attempt_id='T1',learner_id='L',course_id=cid,task_id='T-ASQ-SIPOC-WAREHOUSE',response=_sipoc_answer('WAREHOUSE'),submitted_at=4601)
            e.submit_attempt(operation_id='M2',attempt_id='M2',learner_id='L',course_id=cid,item_id='M-ASQ-CHARTER-1',response=_charter_answer('FULFILLMENT'),submitted_at=4700); e.submit_attempt(operation_id='R2',attempt_id='R2',learner_id='L',course_id=cid,item_id='R-ASQ-CHARTER-1',response=_charter_answer('SERVICE'),submitted_at=8300); e.submit_transfer_attempt(operation_id='T2',attempt_id='T2',learner_id='L',course_id=cid,task_id='T-ASQ-CHARTER-WAREHOUSE',response=_charter_answer('WAREHOUSE'),submitted_at=8301)
            self.assertEqual(e.next_action('L',cid,now=8301)['action_type'],'COURSE_COMPLETE')
    def test_update_accepts_validated_successor_standard_identity(self):
        u=execute_update_training_delta(self.body,self.req,future_requirement_set(self.req)); self.assertEqual(u['status'],'TARGETED_UPDATE_TRAINING_READY')
    def test_update_rejects_unrelated_standard_family(self):
        n=future_requirement_set(self.req); n['external_standard_id']='OTHER-AUTHORITY-STANDARD-1'; n['requirement_set_digest']=digest({k:v for k,v in n.items() if k!='requirement_set_digest'})
        with self.assertRaisesRegex(ValueError,'UNEXPECTED_EXTERNAL_STANDARD_FAMILY'): execute_update_training_delta(self.body,self.req,n)
    def test_future_change_generates_only_one_update_lesson(self):
        u=execute_update_training_delta(self.body,self.req,future_requirement_set(self.req)); self.assertEqual(u['affected_requirement_ids'],[ASQ_CHARTER_REQ]); self.assertEqual(len(u['update_lessons']),1)
    def test_future_change_preserves_unaffected_sipoc(self):
        u=execute_update_training_delta(self.body,self.req,future_requirement_set(self.req)); x=next(r for r in u['revalidation_plan'] if r['external_requirement_id']==ASQ_SIPOC_REQ); self.assertEqual(x['standing'],'PRESERVE_BY_SEMANTIC_EQUIVALENCE')
    def test_future_change_revalidates_charter_only(self):
        u=execute_update_training_delta(self.body,self.req,future_requirement_set(self.req)); x=next(r for r in u['revalidation_plan'] if r['external_requirement_id']==ASQ_CHARTER_REQ); self.assertEqual(x['standing'],'REVALIDATION_REQUIRED')
    def test_future_cognitive_change_updates_assessment_performance(self):
        u=execute_update_training_delta(self.body,self.req,future_requirement_set(self.req)); self.assertEqual(u['update_assessments'][0]['new_cognitive_level'],'ANALYZE'); self.assertEqual(u['update_assessments'][0]['required_performance'],'INDEPENDENT_SCENARIO_ANALYSIS')
    def test_targeted_update_never_defaults_full_retake(self): self.assertFalse(execute_update_training_delta(self.body,self.req,future_requirement_set(self.req))['retake_entire_course_required'])
    def test_no_change_generates_no_update_training(self):
        u=execute_update_training_delta(self.body,self.req,copy.deepcopy(self.req)); self.assertEqual(u['status'],'NO_UPDATE_NEEDED'); self.assertEqual(u['update_lessons'],[])
    def test_update_output_never_claims_certification(self): self.assertEqual(execute_update_training_delta(self.body,self.req,future_requirement_set(self.req))['external_certification_status'],'NOT_MADE')

if __name__=='__main__': unittest.main()
