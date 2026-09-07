from __future__ import annotations

import copy
import json
import os
import py_compile
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from qualification_impl009 import build_seed
from learning_lab import (
    InjectedCrash, WorkplacePerformanceService, RoleCompetencyCoverageService,
    evaluate_requirement_coverage, build_gap_plan, build_role_portfolio_handoff,
    verify_role_portfolio_handoff,
)
from learning_lab.repository import Repository
from tests.test_role_competency_coverage import SC1, SC2, REQ, CATALOG, SYN, submission1, submission2

ROOT=Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence'; EVIDENCE.mkdir(exist_ok=True)


def write(name,obj):
    (EVIDENCE/name).write_text(json.dumps(obj,indent=2,sort_keys=True),encoding='utf-8')
    return obj


def run(args):
    return subprocess.run(args,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)


def tests():
    p=run([sys.executable,'-m','unittest','discover','-s','tests','-v'])
    (EVIDENCE/'impl012_full_tests.txt').write_text(p.stdout,encoding='utf-8')
    passed=p.stdout.count(' ... ok')
    new_pass=sum(1 for line in p.stdout.splitlines() if 'test_role_competency_coverage.RoleCompetencyCoverageTests.' in line and line.endswith(' ... ok'))
    full=write('impl012_full_tests.json',{'pass':p.returncode==0 and passed==363,'passed':passed,'expected':363,'returncode':p.returncode})
    new=write('impl012_new_tests.json',{'pass':p.returncode==0 and new_pass==40,'passed':new_pass,'expected':40,'derivation':'PARSED_FROM_FULL_SUITE'})
    pred={'pass':bool(full['pass'] and new['pass'] and full['passed']-new['passed']==323),'passed':323 if full['pass'] and new['pass'] else None,'expected':323,'derivation':'FULL_SUITE_MINUS_IMPL012_SLICE'}
    write('impl012_predecessor_tests.json',pred)
    return full,new,pred


def compile_all():
    files=sorted(p for p in ROOT.rglob('*.py') if '__pycache__' not in p.parts)
    errors=[]
    for p in files:
        try: py_compile.compile(str(p),doraise=True)
        except Exception as exc: errors.append(f'{p.relative_to(ROOT)}:{exc}')
    return write('impl012_compile.json',{'pass':not errors,'files':len(files),'errors':errors})


def build_base(path):
    repo,eng,out=build_seed(path,learner=True)
    course=repo.get_object('course',out['course_id'],1)
    out1=WorkplacePerformanceService(repo,SC1).execute(operation_id='WP12-A',job_id='WP12-JA',course=course,learner_id='L',submission=submission1('ROLE-SUB-1',1000),defense_reviews=[SYN])
    out2=WorkplacePerformanceService(repo,SC2).execute(operation_id='WP12-B',job_id='WP12-JB',course=course,learner_id='L',submission=submission2('ROLE-SUB-2',1100),defense_reviews=[SYN])
    d1=repo.get_object('capability_evidence_dossier',out1['capability_dossier_id'],1)
    d2=repo.get_object('capability_evidence_dossier',out2['capability_dossier_id'],1)
    return repo,course,d1,d2


def demo():
    with tempfile.TemporaryDirectory() as td:
        repo,course,d1,d2=build_base(os.path.join(td,'demo.db'))
        out=RoleCompetencyCoverageService(repo,REQ,CATALOG).execute(operation_id='ROLE-DEMO',job_id='ROLE-DEMO-J',learner_id='L',dossiers=[d1,d2],as_of=1200)
        coverage=repo.get_object('role_requirement_coverage',out['coverage_id'],1)
        gap=repo.get_object('role_gap_plan',out['gap_plan_id'],1)
        hand=repo.get_object('role_portfolio_handoff',out['portfolio_handoff_id'],1)
        verify=verify_role_portfolio_handoff(coverage=coverage,gap_plan=gap,handoff=hand)
        states={x['requirement_id']:x['status'] for x in coverage['requirement_coverage']}
        result={
            'pass': states=={
                'REQ-PY-OPS-01':'SUPPORTED','REQ-PY-OPS-02':'SUPPORTED','REQ-PY-OPS-03':'SUPPORTED','REQ-PY-OPS-04':'PARTIALLY_SUPPORTED'
            } and coverage['coverage_standing']=='DECLARED_REQUIREMENT_SET_PARTIALLY_SUPPORTED' and coverage['external_eligibility_decision']=='NOT_MADE' and verify['status']=='PASS',
            'requirement_states':states,'coverage':coverage,'gap_plan':gap,'portfolio_handoff':hand,'handoff_verification':verify,
            'truth_boundary':'SYNTHETIC LEARNER/REVIEW FIXTURE; BOUNDED SUPPLIED REQUIREMENT SET; REQUIREMENT COVERAGE IS NOT JOB READY OR ROLE QUALIFICATION',
        }
        write('impl012_role_coverage_demo.json',result)
        write('impl012_requirement_coverage.json',coverage)
        write('impl012_gap_plan.json',gap)
        write('impl012_role_portfolio_handoff.json',hand)
        return result


def adversarial():
    names=[
      'test_one_scenario_is_not_enough_for_diversity',
      'test_duplicate_same_family_does_not_create_diversity',
      'test_distinct_family_but_same_independence_group_does_not_count_as_independent',
      'test_stale_evidence_is_not_current_support',
      'test_wrong_learner_has_no_support',
      'test_unverified_mapping_cannot_be_used_consequentially',
      'test_corrupt_dossier_is_inadmissible_if_only_evidence',
      'test_failed_workplace_dossier_does_not_support_requirement',
      'test_assisted_workplace_dossier_does_not_support_requirement',
      'test_human_judgment_requirement_remains_partial_with_synthetic_reviews',
      'test_portfolio_cannot_change_coverage_standing',
      'test_portfolio_cannot_make_external_eligibility_decision',
      'test_coverage_tampering_is_detected',
      'test_gap_plan_tampering_is_detected',
      'test_same_operation_changed_evidence_conflicts',
      'test_requirement_set_identity_collision_fails_closed',
      'test_scenario_catalog_drift_after_crash_fails_closed',
      'test_evidence_set_drift_after_crash_fails_closed',
      'test_as_of_drift_after_crash_fails_closed',
      'test_coverage_does_not_mutate_learning_attempts_or_projections',
      'test_scenario_digest_mismatch_makes_evidence_inadmissible',
      'test_unbound_scenario_cannot_count_for_requirement',
      'test_requirement_set_duplicate_ids_fail_closed',
      'test_requirement_set_owner_and_version_are_required',
      'test_requirement_set_does_not_contain_learner_identity',
      'test_dossier_order_is_semantically_canonicalized_across_recovery',
    ]
    fq=[f'tests.test_role_competency_coverage.RoleCompetencyCoverageTests.{n}' for n in names]
    p=run([sys.executable,'-m','unittest','-v',*fq])
    (EVIDENCE/'impl012_adversarial.txt').write_text(p.stdout,encoding='utf-8')
    passed=p.stdout.count(' ... ok')
    return write('impl012_adversarial.json',{'pass':p.returncode==0 and passed==len(names),'passed':passed,'total':len(names),'cases':names})


def backup(src,dst):
    with sqlite3.connect(src) as s, sqlite3.connect(dst) as d: s.backup(d)


def load_base(path):
    repo=Repository(path)
    course=repo.get_object('course','COURSE-G-PY-REFRESH',1)
    d1=repo.get_object('capability_evidence_dossier','CAPDOS-ROLE-SUB-1',1)
    d2=repo.get_object('capability_evidence_dossier','CAPDOS-ROLE-SUB-2',1)
    if not all([course,d1,d2]): raise RuntimeError('base evidence missing')
    return repo,course,d1,d2


def recovery(runs=100):
    phases=list(RoleCompetencyCoverageService.PHASES)
    phase_pass={x:0 for x in phases}; crash_seed={x:False for x in phases}
    cov=set(); gaps=set(); hands=set(); standings=set()
    with tempfile.TemporaryDirectory() as td:
        base=os.path.join(td,'base.db'); build_base(base)
        snapshots={}
        for phase in phases:
            p=os.path.join(td,'crash-'+phase+'.db'); backup(base,p)
            repo,course,d1,d2=load_base(p)
            try:
                RoleCompetencyCoverageService(repo,REQ,CATALOG).execute(operation_id='R12-OP',job_id='R12-JOB',learner_id='L',dossiers=[d1,d2],as_of=1200,crash_after_phase=phase)
            except InjectedCrash:
                crash_seed[phase]=True
                sp=os.path.join(td,'snap-'+phase+'.db'); backup(p,sp); snapshots[phase]=sp
        passes=0
        for i in range(runs):
            phase=phases[i%len(phases)]; p=os.path.join(td,f'run-{i}.db'); shutil.copy2(snapshots[phase],p)
            repo,course,d1,d2=load_base(p)
            ds=[d2,d1] if i%2 else [d1,d2]
            svc=RoleCompetencyCoverageService(repo,REQ,CATALOG)
            out=svc.execute(operation_id='R12-OP',job_id='R12-JOB',learner_id='L',dossiers=ds,as_of=1200)
            replay=svc.execute(operation_id='R12-OP',job_id='R12-JOB',learner_id='L',dossiers=[d1,d2],as_of=1200)
            if out==replay:
                passes+=1; phase_pass[phase]+=1; cov.add(out['coverage_digest']); gaps.add(out['gap_plan_digest']); hands.add(out['portfolio_handoff_digest']); standings.add(out['coverage_standing'])
        result={'pass':all(crash_seed.values()) and passes==runs and len(cov)==len(gaps)==len(hands)==len(standings)==1,'runs':runs,'passes':passes,'crash_seeds':crash_seed,'phase_passes':phase_pass,'unique_coverage_digests':len(cov),'unique_gap_plan_digests':len(gaps),'unique_handoff_digests':len(hands),'unique_coverage_standings':len(standings)}
        return write('impl012_recovery_stress.json',result)


def determinism(runs=100):
    with tempfile.TemporaryDirectory() as td:
        repo,course,d1,d2=build_base(os.path.join(td,'d.db'))
        cov=set(); gaps=set(); hands=set()
        for i in range(runs):
            ds=[copy.deepcopy(d1),copy.deepcopy(d2)] if i%2==0 else [copy.deepcopy(d2),copy.deepcopy(d1)]
            c=evaluate_requirement_coverage(requirement_set=copy.deepcopy(REQ),learner_id='L',dossiers=ds,scenario_catalog=copy.deepcopy(CATALOG),as_of=1200)
            g=build_gap_plan(coverage=c); h=build_role_portfolio_handoff(coverage=c,gap_plan=g)
            cov.add(c['coverage_digest']); gaps.add(g['gap_plan_digest']); hands.add(h['handoff_digest'])
        return write('impl012_determinism.json',{'pass':len(cov)==len(gaps)==len(hands)==1,'runs':runs,'unique_coverage_digests':len(cov),'unique_gap_plan_digests':len(gaps),'unique_handoff_digests':len(hands)})


def main():
    full,new,pred=tests()
    result={'predecessor':pred,'full':full,'new_slice':new,'compile':compile_all(),'demo':demo(),'adversarial':adversarial(),'recovery':recovery(100),'determinism':determinism(100)}
    result['status']='PASS_PORTABLE_IMPLEMENTATION' if all(v.get('pass') for v in result.values() if isinstance(v,dict) and 'pass' in v) else 'FAIL'
    write('qualification_receipt_impl012.json',result)
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0 if result['status'].startswith('PASS') else 1

if __name__=='__main__': raise SystemExit(main())
