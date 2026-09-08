'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/g-wp-003', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp003-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8',cwd=ws){const r=spawnSync('git',['-c',`safe.directory=${cwd}`,...args],{cwd,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args,cwd=ws,env=process.env){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',shell:false,windowsHide:true,env});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim();
 const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 const pred=base.qualified_predecessor.qualified_commit;
 if(pred!=='db8989b18844fdcd0d87a5d17a056b83143dbba0')throw new Error('G_WP_002_BASELINE_MISMATCH');
 if(base.qualified_predecessor.workflow_run_id!==34237280880)throw new Error('G_WP_002_RUN_MISMATCH');
 if(base.qualified_predecessor.evidence_artifact_id!==10060824218)throw new Error('G_WP_002_ARTIFACT_MISMATCH');
 if(base.qualified_predecessor.evidence_artifact_sha256!=='922999f97bb152e21046f51db5ec7c2b0a43077a7958f4055fdd1a76961afbd4')throw new Error('G_WP_002_EVIDENCE_SHA_MISMATCH');
 git(['merge-base','--is-ancestor',pred,'HEAD']);
 const pkg=JSON.parse(fs.readFileSync(path.join(ws,root,'control','PACKAGE-CONTRACT.json'),'utf8'));
 if(pkg.id!=='G-WP-003'||pkg.objective!=='Implement interruption observation, deduplication, classification and recovery-plan creation.')throw new Error('PACKAGE_CONTRACT_DRIFT');
 seteq(pkg.components,['InterruptionDetector','RecoveryClassifier','RecoveryPlanner'],'PACKAGE_COMPONENTS');
 seteq(pkg.data,['InterruptionObservation','RecoveryClassification','RecoveryPlan'],'PACKAGE_DATA');
 seteq(pkg.contracts,['ReportInterruption','ClassifyRecovery','PlanRecovery','GetRecoveryPlan'],'PACKAGE_CONTRACTS');
 seteq(pkg.tests,['STATE_MACHINE','PROPERTY','FAULT_INJECTION'],'PACKAGE_TESTS');
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8'));
 seteq(req.requirements.map(x=>x.id),['G-RQ-005','G-RQ-007','G-RQ-008','G-RQ-009','G-RQ-010','G-RQ-011'],'G_WP_003_REQUIREMENTS');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 if(mf.expected_test_count!==50||mf.expected_requirement_count!==6||mf.production_authorized!==false)throw new Error('MANIFEST_METADATA_MISMATCH');
 for(const e of mf.files){const repoPath=`${root}/${e.path}`,bytes=git(['show',`HEAD:${repoPath}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}:${bytes.length}:${e.size}`);const h=hash(bytes);if(h!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}:${h}:${e.sha256}`);}
 // Re-prove G-WP-002 on its exact qualified subject; do not run its qualifier at this descendant commit.
 const depWorktree=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp002-dependency-${runId}`);
 try{
   if(fs.existsSync(depWorktree))git(['worktree','remove','--force',depWorktree]);
   git(['worktree','add','--detach',depWorktree,pred]);
   const dep=spawnSync('node',['.github/scripts/gwp002-qualify.js'],{cwd:depWorktree,encoding:'utf8',shell:false,windowsHide:true,env:{...process.env,GITHUB_WORKSPACE:depWorktree,GITHUB_REF_NAME:'dependency-gwp002'}});
   const out=`${dep.stdout||''}${dep.stderr||''}`;
   if(dep.error||dep.status!==0||!out.includes('PASS G-WP-002 tests=50 requirements=6'))throw new Error(`G_WP_002_REGRESSION_NOT_PROVEN:${dep.error?dep.error.message:out}`);
   write('dependency-gwp002.txt',out);
 } finally { try{git(['worktree','remove','--force',depWorktree]);}catch(_){} }
 const classes=path.join(evidenceDir,'classes'); fs.mkdirSync(classes,{recursive:true});
 const g2dir=path.join(ws,'system-master','g-wp-002','src','main','java','org','systemmaster','continuity');
 const g3dir=path.join(ws,root,'src','main','java','org','systemmaster','continuity');
 const test=path.join(ws,root,'src','test','java','org','systemmaster','continuity','Gwp003QualificationTest.java');
 const g2=fs.readdirSync(g2dir).filter(x=>x.endsWith('.java')).sort().map(x=>path.join(g2dir,x));
 const g3=fs.readdirSync(g3dir).filter(x=>x.endsWith('.java')).sort().map(x=>path.join(g3dir,x));
 write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...g2,...g3,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.continuity.Gwp003QualificationTest']); write('qualification.txt',out);
 if(!out.includes('PASS G-WP-003 tests=50 requirements=6'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${pred}`,`predecessor_run=${base.qualified_predecessor.workflow_run_id}`,`predecessor_artifact=${base.qualified_predecessor.evidence_artifact_id}`,`predecessor_evidence_sha256=${base.qualified_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=50\nrequirements=6\ngwp002_regression=PASS\nstate_machine=PASS\nproperty=PASS\nfault_injection=PASS\nmilestone_testing=true\nproduction_authorized=false');
 console.log('PASS G-WP-003 tests=50 requirements=6'); console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
