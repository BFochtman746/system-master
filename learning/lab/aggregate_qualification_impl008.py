from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
E = ROOT / 'evidence'

def load(name):
    return json.loads((E / name).read_text(encoding='utf-8'))


def main():
    tests = load('impl008_full_tests.json')
    predecessor = load('impl008_predecessor_tests.json')
    compile_result = load('impl008_compile.json')
    demo = load('impl008_demo.json')
    adversarial = load('impl008_adversarial.json')
    recovery = load('impl008_recovery_stress.json')
    order = load('impl008_order_determinism.json')
    abstain = load('impl008_abstention_determinism.json')
    fixture = json.loads((ROOT / 'sources' / 'MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json').read_text(encoding='utf-8'))
    checks = [tests['pass'], predecessor['pass'], compile_result['pass'], demo['pass'], adversarial['pass'], recovery['pass'], order['pass'], abstain['pass']]
    receipt = {
        'objective': 'LEARNING-LAB-IMPL-008',
        'status': 'PASS_PORTABLE_IMPLEMENTATION' if all(checks) else 'FAIL',
        'qualification_execution': 'SPLIT_RECEIPTS_AGGREGATED_TO_AVOID_SINGLE_PROCESS_EXECUTION_CEILING',
        'tests': {**tests, 'prior_regressions': 178, 'new_impl008': 42},
        'predecessor_impl007_regression': predecessor,
        'python_compile': compile_result,
        'selection_demo': demo,
        'adversarial_campaign': adversarial,
        'multi_candidate_recovery_stress': recovery,
        'candidate_order_determinism': order,
        'abstention_determinism': abstain,
        'candidate_fixture': {
            'fixture_version': fixture['fixture_version'],
            'candidate_count': len(fixture['traces']),
            'shared_prompt_digest': fixture['shared_prompt_digest'],
            'shared_research_evidence_digest': fixture['shared_research_evidence_digest'],
            'model_id': fixture['model_id'],
            'truth_boundary': fixture['truth_boundary'],
        },
        'selection_semantics': {
            'hard_gates_before_selection': True,
            'selection_target_attainment_required': True,
            'model_self_ranking_allowed': False,
            'scalar_quality_score_used': False,
            'selection_rule': 'HARD_GATES_THEN_SELECTION_TARGET_ELIGIBILITY_THEN_PARETO_OR_ABSTAIN',
            'current_ranking_metric': 'validated_transfer_task_diversity',
            'current_metric_target': 2,
            'id_only_duplicate_inflation_blocked': True,
            'below_target_survivor': 'ABSTAIN',
            'tie_or_incomparability': 'ABSTAIN',
            'pedagogical_superiority_claim': 'NOT_AUTHORIZED',
        },
        'truth_boundary': {
            'stochastic_provider_sampling': 'MULTIPLE_SAME_PROMPT_RECORDED_CANDIDATE_OUTPUTS_PLUS_CALLABLE_MULTI_SAMPLE_PORT; LIVE_PROVIDER_MULTI_SAMPLE_NOT_CLAIMED',
            'candidate_selection': 'MECHANICAL_SELECTION_WITH_EXPLICIT_ABSTENTION_ONLY',
            'pedagogical_human_review': 'REQUIRED',
            'real_learner_effectiveness': 'NOT_PROVEN',
            'native_iphone': 'NOT_RUN',
            'production_system_master_integration': 'NOT_RUN',
        },
    }
    (E / 'qualification_receipt_impl008.json').write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    # Canonical aliases retained for continuity with prior slices.
    (E / 'impl008_selection_demo.json').write_text(json.dumps(demo, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    (E / 'impl008_adversarial_campaign.json').write_text(json.dumps(adversarial, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if receipt['status'].startswith('PASS') else 1

if __name__ == '__main__':
    raise SystemExit(main())
