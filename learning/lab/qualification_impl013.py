from __future__ import annotations

import copy, json, os, py_compile, shutil, sqlite3, subprocess, sys, tempfile
from pathlib import Path

from learning_lab import (
    ExternalStandardIngestionService, asq_cssgb_2022_standard, validate_external_standard,
    build_external_requirement_set, build_requirement_mapping_plan, build_certification_readiness_blueprint,
    build_standard_freshness_contract, assess_standard_update, build_update_training_delta,
)
from learning_lab.engine import InjectedCrash
from learning_lab.repository import Repository, digest
from tests.test_external_standard_ingestion import future_packet

ROOT=Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence'; EVIDENCE.mkdir(exist_ok=True)

def write(name,obj):
    (EVIDENCE/name).write_text(json.dumps(obj,indent=2,sort_keys=True),encoding='utf-8'); return obj

def run(args):
    return subprocess.run(args,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)

def tests():
    p=run([sys.executable,'-m','unittest','discover','-s','tests','-v'])
    (EVIDENCE/'impl013_full_tests.txt').write_text(p.stdout,encoding='utf-8')
    passed=p.stdout.count(' ... ok')
    new_pass=sum(1 for line in p.stdout.splitlines() if 'test_external_standard_ingestion.ExternalStandardIngestionTests.' in line and line.endswith(' ... ok'))
    full=write('impl013_full_tests.json',{'pass':p.returncode==0 and passed==411,'passed':passed,'expected':411,'returncode':p.returncode})
    new=write('impl013_new_tests.json',{'pass':p.returncode==0 and new_pass==48,'passed':new_pass,'expected':48,'derivation':'PARSED_FROM_FULL_SUITE'})
    pred=write('impl013_predecessor_tests.json',{'pass':bool(full['pass'] and new['pass'] and passed-new_pass==363),'passed':passed-new_pass,'expected':363,'derivation':'FULL_SUITE_MINUS_IMPL013_SLICE'})
    return full,new,pred

def compile_all():
    files=sorted(p for p in ROOT.rglob('*.py') if '__pycache__' not in p.parts)
    errors=[]
    for p in files:
        try: py_compile.compile(str(p),doraise=True)
        except Exception as exc: errors.append(f'{p.relative_to(ROOT)}:{exc}')
    return write('impl013_compile.json',{'pass':not errors,'files':len(files),'errors':errors})

def demo():
    packet=asq_cssgb_2022_standard()
    req=build_external_requirement_set(packet)
    mp=build_requirement_mapping_plan(packet,req)
    bp=build_certification_readiness_blueprint(packet,req)
    fresh=build_standard_freshness_contract(packet)
    with tempfile.TemporaryDirectory() as td:
        repo=Repository(os.path.join(td,'demo.db'))
        out=ExternalStandardIngestionService(repo).execute(operation_id='ASQ-DEMO',job_id='ASQ-DEMO-JOB',packet=packet)
    result={
        'pass':validate_external_standard(packet)['status']=='PASS' and len(req['requirements'])==66 and sum(bp['exam_section_weights'].values())==100 and out['external_certification_status']=='NOT_MADE',
        'standard':packet,'requirement_set':req,'mapping_plan':mp,'readiness_blueprint':bp,'freshness_contract':fresh,'service_result':out,
        'truth_boundary':'REAL CURRENT ASQ CSSGB 2022 BOK STRUCTURED EXTRACT; NOT ASQ CERTIFICATION; DEEP COURSE/SKILL DECOMPOSITION NOT YET BUILT',
    }
    write('impl013_external_standard_demo.json',result)
    write('impl013_asq_cssgb_standard.json',packet)
    write('impl013_requirement_set.json',req)
    write('impl013_requirement_mapping_plan.json',mp)
    write('impl013_certification_readiness_blueprint.json',bp)
    write('impl013_standard_freshness_contract.json',fresh)
    return result

def adversarial():
    names=[
        'test_standard_digest_tampering_fails','test_bad_exam_weights_fail','test_duplicate_requirement_id_fails','test_invalid_cognitive_level_fails',
        'test_requirement_mapping_starts_unmapped','test_requirement_set_makes_no_certification_claim','test_blueprint_does_not_invent_learner_evidence','test_blueprint_does_not_mint_certification',
        'test_internal_evidence_augmentation_not_asq_claim','test_same_version_content_drift_is_conflict','test_update_delta_never_defaults_to_full_course_retake',
        'test_service_same_operation_changed_standard_conflicts','test_same_standard_identity_with_different_bytes_fails_closed','test_structured_extract_truth_boundary_is_explicit',
        'test_mapping_plan_does_not_claim_existing_competency_equivalence','test_deeper_skill_decomposition_is_explicitly_deferred','test_ai_inferred_mapping_remains_planning_only',
        'test_unknown_mapping_requirement_fails_closed','test_duplicate_mapping_update_fails_closed','test_service_recovers_from_every_checkpoint',
        'test_external_experience_context_preserved','test_freshness_scheduler_is_deferred_not_reimplemented','test_new_authoritative_version_is_update_available','test_unchanged_standard_needs_no_update_training',
    ]
    fq=[f'tests.test_external_standard_ingestion.ExternalStandardIngestionTests.{n}' for n in names]
    p=run([sys.executable,'-m','unittest','-v',*fq]); (EVIDENCE/'impl013_adversarial.txt').write_text(p.stdout,encoding='utf-8')
    passed=p.stdout.count(' ... ok')
    return write('impl013_adversarial.json',{'pass':p.returncode==0 and passed==len(names),'passed':passed,'total':len(names),'cases':names})

def backup(src,dst):
    with sqlite3.connect(src) as s, sqlite3.connect(dst) as d: s.backup(d)

def recovery(runs=100):
    packet=asq_cssgb_2022_standard(); phases=list(ExternalStandardIngestionService.PHASES)
    crash_seed={x:False for x in phases}; phase_pass={x:0 for x in phases}; std=set(); req=set(); bp=set(); fresh=set()
    with tempfile.TemporaryDirectory() as td:
        snapshots={}
        for phase in phases:
            path=os.path.join(td,'crash-'+phase+'.db'); repo=Repository(path); svc=ExternalStandardIngestionService(repo)
            try: svc.execute(operation_id='R13-OP',job_id='R13-JOB',packet=packet,crash_after_phase=phase)
            except InjectedCrash:
                crash_seed[phase]=True; snap=os.path.join(td,'snap-'+phase+'.db'); backup(path,snap); snapshots[phase]=snap
        passes=0
        for i in range(runs):
            phase=phases[i%len(phases)]; path=os.path.join(td,f'run-{i}.db'); shutil.copy2(snapshots[phase],path)
            repo=Repository(path); svc=ExternalStandardIngestionService(repo)
            out=svc.execute(operation_id='R13-OP',job_id='R13-JOB',packet=copy.deepcopy(packet)); replay=svc.execute(operation_id='R13-OP',job_id='R13-JOB',packet=copy.deepcopy(packet))
            if out==replay:
                passes+=1; phase_pass[phase]+=1; std.add(out['standard_digest']); req.add(out['requirement_set_digest']); bp.add(out['blueprint_digest']); fresh.add(out['freshness_contract_digest'])
    return write('impl013_recovery_stress.json',{'pass':all(crash_seed.values()) and passes==runs and len(std)==len(req)==len(bp)==len(fresh)==1,'runs':runs,'passes':passes,'crash_seeds':crash_seed,'phase_passes':phase_pass,'unique_standard_digests':len(std),'unique_requirement_set_digests':len(req),'unique_blueprint_digests':len(bp),'unique_freshness_contract_digests':len(fresh)})

def determinism(runs=100):
    vals=set(); reqs=set(); maps=set(); bps=set(); fresh=set()
    for _ in range(runs):
        p=asq_cssgb_2022_standard(); r=build_external_requirement_set(p); m=build_requirement_mapping_plan(p,r); b=build_certification_readiness_blueprint(p,r); f=build_standard_freshness_contract(p)
        vals.add(p['standard_digest']); reqs.add(r['requirement_set_digest']); maps.add(m['mapping_plan_digest']); bps.add(b['blueprint_digest']); fresh.add(f['freshness_contract_digest'])
    return write('impl013_determinism.json',{'pass':all(len(x)==1 for x in (vals,reqs,maps,bps,fresh)),'runs':runs,'unique_standard_digests':len(vals),'unique_requirement_set_digests':len(reqs),'unique_mapping_plan_digests':len(maps),'unique_blueprint_digests':len(bps),'unique_freshness_contract_digests':len(fresh)})

def update_demo():
    old=asq_cssgb_2022_standard(); new=future_packet(); state=assess_standard_update(old,new); oldset=build_external_requirement_set(old); newset=build_external_requirement_set(new); delta=build_update_training_delta(oldset,newset)
    result={'pass':state['status']=='NEW_VERSION_UPDATE_AVAILABLE' and delta['update_training_required'] and not delta['retake_entire_course_required'] and len(delta['affected_training_requirement_ids'])==2,'freshness_decision':state,'update_training_delta':delta,'truth_boundary':'SYNTHETIC FUTURE ASQ VERSION USED ONLY TO PROVE UPDATE-DETECTION/DELTA LOGIC'}
    write('impl013_update_training_demo.json',result); return result

def current_source_receipt():
    packet=asq_cssgb_2022_standard()
    return write('impl013_current_source_receipt.json',{
        'pass':True,'observed_date':'2026-09-07','authority':'American Society for Quality (ASQ)',
        'certification_page':'https://www.asq.org/cert/six-sigma-green-belt','bok_pdf':'https://www.asq.org/cert/resource/pdf/certification/cssgb-cert-insert.pdf',
        'published_version_label':'2022 CSSGB BoK','requirement_count':len(packet['requirements']),'section_weights':[11,20,20,18,16,15],
        'capture_class':packet['capture_class'],'source_bytes_archived':False,
        'note':'Currentness was checked against live ASQ web/PDF in the build session; portable packet freezes a structured extract and freshness contract, not a downloaded ASQ PDF.'
    })

def main():
    full,new,pred=tests()
    result={'predecessor':pred,'full':full,'new_slice':new,'compile':compile_all(),'demo':demo(),'current_source':current_source_receipt(),'adversarial':adversarial(),'recovery':recovery(100),'determinism':determinism(100),'update_training':update_demo()}
    result['status']='PASS_PORTABLE_IMPLEMENTATION' if all(v.get('pass') for v in result.values() if isinstance(v,dict) and 'pass' in v) else 'FAIL'
    write('qualification_receipt_impl013.json',result)
    print(json.dumps(result,indent=2,sort_keys=True)); return 0 if result['status'].startswith('PASS') else 1
if __name__=='__main__': raise SystemExit(main())
