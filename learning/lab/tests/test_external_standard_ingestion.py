from __future__ import annotations

import copy, os, tempfile, unittest

from learning_lab import (
    ExternalStandardIngestionService, asq_cssgb_2022_standard, validate_external_standard,
    build_external_requirement_set, build_certification_readiness_blueprint,
    build_standard_freshness_contract, assess_standard_update, build_update_training_delta,
    build_requirement_mapping_plan, apply_competency_mapping_snapshot,
)
from learning_lab.engine import InjectedCrash
from learning_lab.repository import Repository, digest


def redigest(packet):
    p=copy.deepcopy(packet); p.pop('standard_digest',None); p['standard_digest']=digest(p); return p

def future_packet():
    p=copy.deepcopy(asq_cssgb_2022_standard())
    p['standard_id']='ASQ-CSSGB-BOK-FUTURE'
    p['published_version_label']='FUTURE CSSGB BoK TEST FIXTURE'
    p['requirements'][0]['highest_cognitive_level']='APPLY'
    p['requirements'].append({
        'requirement_id':'ASQ-CSSGB-FUTURE-VII.A.1','source_code':'VII.A.1','section_id':'VI',
        'title':'Synthetic newly added quality-system topic','highest_cognitive_level':'ANALYZE',
        'source_page':99,'source_locator':'SYNTHETIC FUTURE FIXTURE','mapping_standing':'UNMAPPED'
    })
    return redigest(p)


class ExternalStandardIngestionTests(unittest.TestCase):
    def setUp(self):
        self.packet=asq_cssgb_2022_standard(observed_at=1788757200)
        self.req=build_external_requirement_set(self.packet)
        self.bp=build_certification_readiness_blueprint(self.packet,self.req)

    def test_real_standard_has_66_leaf_requirements(self): self.assertEqual(len(self.packet['requirements']),66)
    def test_exam_section_weights_total_100(self): self.assertEqual(sum(x['exam_question_weight'] for x in self.packet['sections']),100)
    def test_six_dmaic_bok_sections_preserved(self): self.assertEqual([x['section_id'] for x in self.packet['sections']],['I','II','III','IV','V','VI'])
    def test_current_published_version_is_2022_bok(self): self.assertEqual(self.packet['published_version_label'],'2022 CSSGB BoK')
    def test_exam_structure_is_preserved(self): self.assertEqual(self.packet['exam']['computer_delivered_total_questions'],110); self.assertEqual(self.packet['exam']['computer_delivered_scored_questions'],100)
    def test_external_experience_context_preserved(self): self.assertEqual(self.packet['eligibility_context']['experience_years'],3); self.assertTrue(self.packet['eligibility_context']['external_authority_controls_eligibility'])
    def test_cognitive_levels_include_create(self): self.assertEqual(self.packet['cognitive_levels'][-1],'CREATE')
    def test_standard_validation_passes(self): self.assertEqual(validate_external_standard(self.packet)['status'],'PASS')
    def test_standard_digest_tampering_fails(self):
        p=copy.deepcopy(self.packet); p['title']='tampered'; self.assertIn('STANDARD_DIGEST_MISMATCH',validate_external_standard(p)['failures'])
    def test_bad_exam_weights_fail(self):
        p=copy.deepcopy(self.packet); p['sections'][0]['exam_question_weight']=12; p=redigest(p); self.assertIn('EXAM_SECTION_WEIGHTS_NOT_100',validate_external_standard(p)['failures'])
    def test_duplicate_requirement_id_fails(self):
        p=copy.deepcopy(self.packet); p['requirements'][1]['requirement_id']=p['requirements'][0]['requirement_id']; p=redigest(p); self.assertIn('REQUIREMENT_ID_DUPLICATE_OR_MISSING',validate_external_standard(p)['failures'])
    def test_invalid_cognitive_level_fails(self):
        p=copy.deepcopy(self.packet); p['requirements'][0]['highest_cognitive_level']='MAGIC'; p=redigest(p); self.assertIn('INVALID_COGNITIVE_LEVEL',validate_external_standard(p)['failures'])
    def test_requirement_set_preserves_all_66(self): self.assertEqual(len(self.req['requirements']),66)
    def test_requirement_mapping_starts_unmapped(self): self.assertTrue(all(x['mapping']['standing']=='UNMAPPED' for x in self.req['requirements']))
    def test_requirement_set_makes_no_certification_claim(self): self.assertEqual(self.req['external_certification_status'],'NOT_MADE')
    def test_blueprint_preserves_exam_weights(self): self.assertEqual(sum(self.bp['exam_section_weights'].values()),100)
    def test_blueprint_reports_content_gaps(self): self.assertEqual(self.bp['content_coverage_standing'],'GAPS_REMAIN')
    def test_blueprint_does_not_invent_learner_evidence(self): self.assertEqual(self.bp['learner_evidence_standing'],'NOT_EVALUATED')
    def test_blueprint_does_not_mint_certification(self): self.assertEqual(self.bp['external_certification_status'],'NOT_MADE')
    def test_remember_level_evidence_profile_is_bounded(self):
        r=next(x for x in self.bp['requirements'] if x['external_cognitive_level']=='REMEMBER'); self.assertIn('INDEPENDENT_KNOWLEDGE_ASSESSMENT',r['required_learning_evidence_profile'])
    def test_apply_level_requires_application_and_transfer(self):
        r=next(x for x in self.bp['requirements'] if x['external_cognitive_level']=='APPLY'); self.assertIn('INDEPENDENT_APPLICATION_TASK',r['required_learning_evidence_profile']); self.assertIn('NOVEL_TRANSFER',r['required_learning_evidence_profile'])
    def test_analyze_level_requires_scenario_analysis(self):
        r=next(x for x in self.bp['requirements'] if x['external_cognitive_level']=='ANALYZE'); self.assertIn('INDEPENDENT_SCENARIO_ANALYSIS',r['required_learning_evidence_profile'])
    def test_evaluate_level_requires_judgment_defense(self):
        r=next(x for x in self.bp['requirements'] if x['external_cognitive_level']=='EVALUATE'); self.assertIn('RATIONALE_OR_DEFENSE',r['required_learning_evidence_profile'])
    def test_create_level_requires_authentic_artifact(self):
        r=next(x for x in self.bp['requirements'] if x['external_cognitive_level']=='CREATE'); self.assertIn('AUTHENTIC_CONSTRUCTED_ARTIFACT',r['required_learning_evidence_profile'])
    def test_internal_evidence_augmentation_not_asq_claim(self): self.assertTrue(all(x['profile_authority'].startswith('SYSTEM_MASTER_INTERNAL') for x in self.bp['requirements']))
    def test_freshness_contract_has_recheck_interval(self): self.assertEqual(build_standard_freshness_contract(self.packet)['recheck_interval_seconds'],2592000)
    def test_freshness_scheduler_is_deferred_not_reimplemented(self): self.assertEqual(build_standard_freshness_contract(self.packet)['scheduler_execution'],'DEFERRED_TO_SHARED_SCHEDULER_INTEGRATION')
    def test_same_standard_is_current_no_change(self): self.assertEqual(assess_standard_update(self.packet,copy.deepcopy(self.packet))['status'],'CURRENT_NO_CHANGE')
    def test_same_version_content_drift_is_conflict(self):
        p=copy.deepcopy(self.packet); p['requirements'][0]['title']='changed under same version'; p=redigest(p); self.assertEqual(assess_standard_update(self.packet,p)['status'],'SAME_VERSION_CONTENT_CONFLICT')
    def test_new_authoritative_version_is_update_available(self): self.assertEqual(assess_standard_update(self.packet,future_packet())['status'],'NEW_VERSION_UPDATE_AVAILABLE')
    def test_update_delta_targets_added_requirement(self):
        new=build_external_requirement_set(future_packet()); d=build_update_training_delta(self.req,new); self.assertIn('ASQ-CSSGB-FUTURE-VII.A.1',d['added_requirement_ids'])
    def test_update_delta_targets_changed_cognitive_level(self):
        new=build_external_requirement_set(future_packet()); d=build_update_training_delta(self.req,new); self.assertIn(self.req['requirements'][0]['requirement_id'],d['changed_requirement_ids'])
    def test_unchanged_standard_needs_no_update_training(self):
        d=build_update_training_delta(self.req,copy.deepcopy(self.req)); self.assertFalse(d['update_training_required'])
    def test_update_delta_never_defaults_to_full_course_retake(self):
        new=build_external_requirement_set(future_packet()); self.assertFalse(build_update_training_delta(self.req,new)['retake_entire_course_required'])
    def test_service_end_to_end_persists_all_outputs(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); out=ExternalStandardIngestionService(repo).execute(operation_id='OP',job_id='JOB',packet=self.packet)
            self.assertEqual(out['requirement_count'],66); self.assertIsNotNone(repo.get_object('external_requirement_set',out['requirement_set_id'],1)); self.assertIsNotNone(repo.get_object('certification_readiness_blueprint',out['blueprint_id'],1))
    def test_service_exact_replay_is_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); s=ExternalStandardIngestionService(repo); a=s.execute(operation_id='OP',job_id='JOB',packet=self.packet); b=s.execute(operation_id='OP',job_id='JOB',packet=copy.deepcopy(self.packet)); self.assertEqual(a,b)
    def test_service_same_operation_changed_standard_conflicts(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); s=ExternalStandardIngestionService(repo); s.execute(operation_id='OP',job_id='JOB',packet=self.packet)
            with self.assertRaisesRegex(ValueError,'IDEMPOTENCY_DIGEST_MISMATCH'): s.execute(operation_id='OP',job_id='JOB',packet=future_packet())
    def test_service_recovers_from_every_checkpoint(self):
        for phase in ExternalStandardIngestionService.PHASES:
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as td:
                repo=Repository(os.path.join(td,'x.db')); s=ExternalStandardIngestionService(repo)
                with self.assertRaises(InjectedCrash): s.execute(operation_id='OP',job_id='JOB',packet=self.packet,crash_after_phase=phase)
                out=s.execute(operation_id='OP',job_id='JOB',packet=self.packet); self.assertEqual(out['status'],'COMPLETE')
    def test_same_standard_identity_with_different_bytes_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); s=ExternalStandardIngestionService(repo); s.execute(operation_id='OP1',job_id='JOB1',packet=self.packet)
            p=copy.deepcopy(self.packet); p['requirements'][0]['title']='drift'; p=redigest(p)
            with self.assertRaisesRegex(ValueError,'OBJECT_IDENTITY_COLLISION'): s.execute(operation_id='OP2',job_id='JOB2',packet=p)
    def test_structured_extract_truth_boundary_is_explicit(self): self.assertFalse(self.packet['source_bytes_archived']); self.assertIn('STRUCTURED_EXTRACT_DOES_NOT_REPLACE_OFFICIAL_ASQ_SOURCE',self.packet['limitations'])

    def test_mapping_plan_has_one_exact_learning_target_per_leaf(self):
        mp=build_requirement_mapping_plan(self.packet,self.req); self.assertEqual(len(mp['mappings']),66); self.assertTrue(all(x['derived_learning_target_id'].startswith('LT-ASQ-CSSGB-2022-') for x in mp['mappings']))
    def test_mapping_plan_does_not_claim_existing_competency_equivalence(self):
        mp=build_requirement_mapping_plan(self.packet,self.req); self.assertTrue(all(not x['consequential_equivalence_established'] for x in mp['mappings']))
    def test_deeper_skill_decomposition_is_explicitly_deferred(self):
        mp=build_requirement_mapping_plan(self.packet,self.req); self.assertTrue(all(x['deeper_skill_decomposition_standing']=='DEFERRED_TO_COURSE_COMPILER_AND_REVIEW' for x in mp['mappings']))
    def test_exact_shared_mapping_can_be_consequential(self):
        mp=build_requirement_mapping_plan(self.packet,self.req); rid=mp['mappings'][0]['external_requirement_id']; snap=apply_competency_mapping_snapshot(mp,[{'external_requirement_id':rid,'standing':'EXACT_SHARED_REF','local_competency_ref':'COMP-001'}]); self.assertEqual(snap['consequentially_mapped_count'],1)
    def test_ai_inferred_mapping_remains_planning_only(self):
        mp=build_requirement_mapping_plan(self.packet,self.req); rid=mp['mappings'][0]['external_requirement_id']; snap=apply_competency_mapping_snapshot(mp,[{'external_requirement_id':rid,'standing':'AI_INFERRED_SIMILARITY','local_competency_ref':'COMP-MAYBE'}]); self.assertEqual(snap['consequentially_mapped_count'],0); self.assertEqual(snap['planning_only_mapping_count'],1)
    def test_unknown_mapping_requirement_fails_closed(self):
        mp=build_requirement_mapping_plan(self.packet,self.req)
        with self.assertRaisesRegex(ValueError,'UNKNOWN_EXTERNAL_REQUIREMENT_MAPPING'): apply_competency_mapping_snapshot(mp,[{'external_requirement_id':'NOPE','standing':'EXACT_SHARED_REF','local_competency_ref':'X'}])
    def test_duplicate_mapping_update_fails_closed(self):
        mp=build_requirement_mapping_plan(self.packet,self.req); rid=mp['mappings'][0]['external_requirement_id']; u={'external_requirement_id':rid,'standing':'EXACT_SHARED_REF','local_competency_ref':'X'}
        with self.assertRaisesRegex(ValueError,'DUPLICATE_MAPPING_UPDATE'): apply_competency_mapping_snapshot(mp,[u,u])
    def test_service_persists_mapping_plan(self):
        with tempfile.TemporaryDirectory() as td:
            repo=Repository(os.path.join(td,'x.db')); out=ExternalStandardIngestionService(repo).execute(operation_id='OP',job_id='JOB',packet=self.packet); self.assertIsNotNone(repo.get_object('external_requirement_mapping_plan',self.packet['standard_id'],1)); self.assertTrue(out.get('mapping_plan_digest'))

if __name__=='__main__': unittest.main()
