'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(),root='system-master/g-wp-002',runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp002-${runId}`);fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8',cwd=ws){const r=spawnSync('git',['-c',`safe.directory=${cwd}`,...args],{cwd,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args,cwd=ws,env=process.env){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',shell:false,windowsHide:true,env});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
try{
 const head=git(['rev-parse','HEAD']).trim();
 const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 const pred=base.qualified_predecessor.commit;
 if(pred!=='30f200a537878c2552ed1741e0022a6f30b58c5c')throw new Error('GWP001_BASELINE_MISMATCH');
 if(base.qualified_predecessor.workflow_run_id!==34235342895||base.qualified_predecessor.artifact_id!==10059588323||base.qualified_predecessor.evidence_sha256!=='5879b81520530e5a6a82dd61fb883363221e248ae7122f223dabfa5df826420f')throw new Error('GWP001_EVIDENCE_BINDING_MISMATCH');
 git(['merge-base','--is-ancestor',pred,'HEAD']);
 const pkg=JSON.parse(fs.readFileSync(path.join(ws,root,'control','PACKAGE-CONTRACT.json'),'utf8'));
 if(pkg.id!=='G-WP-002'||pkg.objective!=='Implement stable durable work identity and recovery registry persistence.')throw new Error('PACKAGE_CONTRACT_DRIFT');
 if(!same(pkg.prerequisites,['G-WP-001'])||!same(pkg.components,['DurableWorkIdentityRegistry','RecoveryRegistry'])||!same(pkg.data,['DurableWorkIdentity','RecoveryRecord','RecoveryEvent']))throw new Error('PACKAGE_SCOPE_DRIFT');
 if(!same(pkg.contracts,['RegisterDurableWorkIdentity','OpenRecovery','TransitionRecovery','GetRecoveryStatus'])||!same(pkg.tests,['UNIT','CONTRACT','PROPERTY','CONCURRENCY']))throw new Error('PACKAGE_API_OR_TEST_DRIFT');
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8'));
 const ids=req.requirements.map(x=>x.id).sort();
 const expectedIds=['G-RQ-001','G-RQ-002','G-RQ-004','G-RQ-012','G-RQ-013','G-RQ-032'];
 if(!same(ids,expectedIds))throw new Error(`REQUIREMENTS_DRIFT:${ids}`);
 for(const r of req.requirements)for(const k of ['id','component','api','invariant','test'])if(!r[k]||!String(r[k]).trim())throw new Error(`ORPHAN_REQUIREMENT_MAPPING:${r.id}:${k}`);
 const schema=JSON.parse(fs.readFileSync(path.join(ws,root,'control','CONTRACT-SCHEMA.json'),'utf8'));
 const idFields=['task_id','workflow_id','stage_id','work_unit_id','parent_work_unit_id','intent_digest','semantic_owner_ref','created_at','classification'];
 const recFields=['work_unit_id','expected_work_version','recovery_epoch','state','interruption_ref','classification_ref','recovery_plan_ref','current_claim_ref','checkpoint_ref','external_effect_uncertainty','blocked_reason','created_at','updated_at','version'];
 const eventFields=['event_type','event_time','recorded_at','actor_ref','causation_ref','correlation_ref','payload_digest','evidence_refs'];
 for(const f of idFields)if(!schema.DurableWorkIdentity.fields.includes(f))throw new Error(`IDENTITY_FIELD_MISSING:${f}`);
 for(const f of recFields)if(!schema.RecoveryRecord.fields.includes(f))throw new Error(`RECOVERY_FIELD_MISSING:${f}`);
 for(const f of eventFields)if(!schema.RecoveryEvent.fields.includes(f))throw new Error(`EVENT_FIELD_MISSING:${f}`);
 const requiredStates=['DETECTED','CLASSIFYING','PLAN_READY','CLAIMED','RECONCILING','RESTORING','RESUMING','VERIFYING','RECOVERED','WAITING_DEPENDENCY','BLOCKED','MANUAL_DECISION','QUARANTINED','TERMINAL_FAILED','CANCELLED_RECONCILED'];
 if(!same(schema.states,requiredStates))throw new Error('RECOVERY_STATE_MACHINE_DRIFT');
 const manifest=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 if(manifest.package!=='G-WP-002'||manifest.contract_version!=='021G-recovery-registry/v1'||manifest.expected_test_count!==50||manifest.requirement_count!==6)throw new Error('MANIFEST_METADATA');
 for(const e of manifest.files){const bytes=git(['show',`HEAD:${root}/${e.path}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}`);if(hash(bytes)!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}`);}
 // Re-prove G-WP-001, which itself re-proves canonical 021F, at the exact qualified predecessor subject.
 const depWorktree=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp001-dependency-${runId}`);
 try{
  if(fs.existsSync(depWorktree))git(['worktree','remove','--force',depWorktree]);
  git(['worktree','add','--detach',depWorktree,pred]);
  const prior=run('node',['.github/scripts/gwp001-qualify.js'],depWorktree,{...process.env,GITHUB_WORKSPACE:depWorktree,GITHUB_REF_NAME:'dependency-gwp001'});
  if(!prior.includes('PASS G-WP-001 tests=35 requirements=2 trace_requirements=76'))throw new Error(`GWP001_REGRESSION_NOT_PROVEN:${prior}`);
  write('dependency-gwp001.txt',prior);
 } finally { try{git(['worktree','remove','--force',depWorktree]);}catch(_){} }
 const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});
 const javaFiles=manifest.files.filter(x=>x.path.endsWith('.java')).map(x=>path.join(ws,root,...x.path.split('/')));
 write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...javaFiles])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.continuity.Gwp002QualificationTest']);write('qualification.txt',out);
 if(!out.includes('PASS G-WP-002 tests=50 requirements=6'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`predecessor_gwp001=${pred}`,`predecessor_run=${base.qualified_predecessor.workflow_run_id}`,`predecessor_artifact=${base.qualified_predecessor.artifact_id}`,`predecessor_evidence_sha256=${base.qualified_predecessor.evidence_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=50\nrequirements=6\ncontract_version=021G-recovery-registry/v1\ngwp001_regression=PASS\n021f_regression=PASS_TRANSITIVE\nproduction_authorized=false');
 console.log('PASS G-WP-002 tests=50 requirements=6');console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
