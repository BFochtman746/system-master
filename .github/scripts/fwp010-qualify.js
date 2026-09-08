'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/f-wp-010', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-fwp010-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${ws}`,...args],{cwd:ws,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ws,encoding:'utf8',shell:false,windowsHide:true});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim(); const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 if(base.lineage_predecessor.qualified_commit!=='22af3d7514094b401570b24d6587b28a12283ea9')throw new Error('F_WP_009_BASELINE_MISMATCH');
 for(const c of ['2bf878a012b5e0ad2bb3ba3602996d57104f8d34','eab69123ebda547fd5ae065289c253b4620f5d45','22af3d7514094b401570b24d6587b28a12283ea9'])git(['merge-base','--is-ancestor',c,'HEAD']);
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8')); seteq(req.requirements.map(x=>x.id),['F-RQ-033','F-RQ-034','F-RQ-035','F-RQ-043','F-RQ-044','F-RQ-046','F-RQ-047'],'F_WP_010_REQUIREMENTS');
 const gate=JSON.parse(fs.readFileSync(path.join(ws,root,'control','CONTRACT-GATE-021S-U-T-H-W-Y.json'),'utf8'));
 if(gate.status!=='SATISFIED_FOR_BOUNDED_ADAPTER_SCOPE_WITH_EXPLICIT_SPECIALIST_RESIDUALS')throw new Error('CONTRACT_GATE_STATUS');
 if(gate['021H'].architecture_build_spec_status!=='CLOSED_REQUALIFIED_DEPENDENCY_VALID'||gate['021W'].architecture_build_spec_status!=='CLOSED_CURRENT_PACKAGE_VERIFIED')throw new Error('CLOSED_GATE_STATUS_MISMATCH');
 if(gate['021T'].r1_build_spec_status!=='INCOMPLETE_IN_RECOVERED_REQUALIFICATION_SET'||gate['021Y'].parent_build_spec_status!=='INCOMPLETE_ADVANCEMENT_BLOCKED')throw new Error('SPECIALIST_RESIDUAL_HIDDEN');
 for(const k of ['021S','021U','021T'])if(gate[k].computer_implementation_claim!=='NONE')throw new Error(`FALSE_SPECIALIST_IMPLEMENTATION_CLAIM:${k}`);
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 for(const e of mf.files){const repoPath=`${root}/${e.path}`, bytes=git(['show',`HEAD:${repoPath}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}:${bytes.length}:${e.size}`);const h=hash(bytes);if(h!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}:${h}:${e.sha256}`);}
 const prior=run('node',['.github/scripts/fwp009-qualify.js']); if(!prior.includes('PASS F-WP-009 tests=40 requirements=4'))throw new Error(`F_WP_009_REGRESSION_NOT_PROVEN:${prior}`); write('dependency-fwp009.txt',prior);
 const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});const src=path.join(ws,root,'src','main','java','org','systemmaster','core');const test=path.join(ws,root,'src','test','java','org','systemmaster','core','Fwp010QualificationTest.java');
 const files=['CrossDomainContracts.java','ChangeCoordinatorAdapter.java','ChangeIncidentCorrelator.java','ChangeMetricsAdapter.java'].map(x=>path.join(src,x)); write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...files,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.core.Fwp010QualificationTest']); write('qualification.txt',out); if(!out.includes('PASS F-WP-010 tests=47 requirements=7'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=SYSTEM-MASTER-F-WP-010-CONTRACT-GATE-VERIFY-A01-IMPLEMENT-QUALIFY-001`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${base.lineage_predecessor.qualified_commit}`,`predecessor_run=${base.lineage_predecessor.workflow_run_id}`,`predecessor_evidence_sha256=${base.lineage_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('contract-gate.txt','gate=BOUNDED_PASS_WITH_EXPLICIT_SPECIALIST_RESIDUALS\n021H=CLOSED_REQUALIFIED\n021W=CLOSED_CURRENT_PACKAGE_VERIFIED\n021S=BOUNDARY_ONLY_NO_IMPLEMENTATION_CLAIM\n021U=BOUNDARY_ONLY_NO_IMPLEMENTATION_CLAIM\n021T=BOUNDARY_ONLY_R1_INCOMPLETE\n021Y=FROZEN_READ_OBSERVE_PARENT_INCOMPLETE\n021Z=OUTPUT_REFERENCE_ONLY');
 write('result.txt','result=PASS\ntests=47\nrequirements=7\nfwp009_regression=PASS\nproduction_authorized=false'); console.log('PASS F-WP-010 tests=47 requirements=7');console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
