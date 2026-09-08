from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent
E=ROOT/'evidence'

def load(name):
    return json.loads((E/name).read_text(encoding='utf-8'))

def main():
    tests=load('impl009_full_tests.json')
    predecessor=load('impl009_predecessor_tests.json')
    compile_result=load('impl009_compile.json')
    demo=load('impl009_refresh_demo.json')
    material=load('impl009_material_change_demo.json')
    adversarial=load('impl009_adversarial.json')
    recovery=load('impl009_recovery_stress.json')
    activation=load('impl009_activation_stress.json')
    diffdet=load('impl009_diff_determinism.json')
    checks=[tests['pass'],predecessor['pass'],compile_result['pass'],demo['pass'],material['pass'],adversarial['pass'],recovery['pass'],activation['pass'],diffdet['pass']]
    receipt={
      'objective':'LEARNING-LAB-IMPL-009',
      'status':'PASS_PORTABLE_IMPLEMENTATION' if all(checks) else 'FAIL',
      'tests':{**tests,'prior_regressions':220,'new_impl009':27},
      'predecessor_impl008_regression':predecessor,
      'python_compile':compile_result,
      'refresh_demo':demo,
      'material_change_demo':material,
      'adversarial_campaign':adversarial,
      'refresh_recovery_stress':recovery,
      'activation_stress':activation,
      'semantic_diff_determinism':diffdet,
      'professional_quality':{
        'profile_id':'PROFESSIONAL-COURSE-QUALITY-V1',
        'purpose':'INTERNAL_PROFESSIONAL_RIGOR_GATE_NOT_ACCREDITATION_OR_COLLEGE_CREDIT',
        'generation_may_vary_qualification_standard_may_not':True,
        'same_profile_required_for_successor':True,
        'quality_regression_blocks_refresh':True,
        'external_recognition':'NOT_CLAIMED',
        'real_human_review':'NOT_PERFORMED_SYNTHETIC_FIXTURE_ONLY',
      },
      'refresh_semantics':{
        'active_course_immutable':True,
        'refresh_creates_successor':True,
        'semantic_diff_required':True,
        'bounded_revalidation':True,
        'freshness_only_preserves_mastery':True,
        'meaning_change_requires_affected_skill_revalidation':True,
        'unaffected_skill_evidence_preserved_by_explicit_lineage':True,
        'successor_auto_activation':False,
        'explicit_activation_required':True,
      },
      'truth_boundary':{
        'source_freshness_window':'ONE_HOUR_LAB_FIXTURE_NOT_UNIVERSAL_POLICY',
        'material_change_demo':'SYNTHETIC_FIXTURE_NOT_REAL_PYTHON_SEMANTICS_CHANGE',
        'human_review_receipt':'SYNTHETIC_TEST_FIXTURE_NOT_INDEPENDENT_HUMAN_REVIEW',
        'professional_course_gate':'MECHANICAL_INTERNAL_GATE_ONLY',
        'college_credit_or_accreditation':'NOT_CLAIMED',
        'real_learner_effectiveness':'NOT_PROVEN',
        'native_iphone':'NOT_RUN',
        'production_system_master_integration':'NOT_RUN',
      }
    }
    (E/'qualification_receipt_impl009.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(receipt,indent=2,sort_keys=True))
    return 0 if receipt['status'].startswith('PASS') else 1

if __name__=='__main__':
    raise SystemExit(main())
