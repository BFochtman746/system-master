'use strict';
const fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/g-wp-005', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp005-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
function git(args,encoding='utf8',cwd=ws){const r=spawnSync('git',['-c',`safe.directory=${cwd}`,...args],{cwd,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args,cwd=ws,env=process.env){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',shell:false,windowsHide:true,env});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim();
 const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 const pred=base.qualified_lineage_predecessor.qualified_commit;
 if(pred!=='6cedfce799db37994617e98f1f727141f809ef3f')throw new Error('G_WP_004_BASELINE_MISMATCH');
 if(base.qualified_lineage_predecessor.workflow_run_id!==34253264507)throw new Error('G_WP_004_RUN_MISMATCH');
 if(base.qualified_lineage_predecessor.evidence_artifact_id!==10066833064)throw new Error('G_WP_004_ARTIFACT_MISMATCH');
 if(base.qualified_lineage_predecessor.evidence_artifact_sha256!=='e81772bd8bcc07f9c239648efe0cd0354832c77a52d047e6f8ac7c97d1a7b1a1')throw new Error('G_WP_004_EVIDENCE_SHA_MISMATCH');
 git(['merge-base','--is-ancestor',pred,'HEAD']);
 const pkg=JSON.parse(fs.readFileSync(path.join(ws,root,'control','PACKAGE-CONTRACT.json'),'utf8'));
 if(pkg.id!=='G-WP-005'||pkg.objective!=='Implement recovery claim/lease/fence integration and stale-owner rejection.')throw new Error('PACKAGE_CONTRACT_DRIFT');
 seteq(pkg.components,['RecoveryClaimCoordinator'],'PACKAGE_COMPONENTS');
 seteq(pkg.data,['RecoveryClaim','ExecutionAttemptRef'],'PACKAGE_DATA');
 seteq(pkg.contracts,['ClaimRecovery','RenewRecoveryClaim','ReleaseRecoveryClaim'],'PACKAGE_CONTRACTS');
 seteq(pkg.tests,['CONCURRENCY','PROPERTY','PROCESS_KILL','DATABASE_CONTENTION'],'PACKAGE_TESTS');
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8'));
 seteq(req.requirements.map(x=>x.id),['G-RQ-027','G-RQ-028','G-RQ-029','G-RQ-030'],'G_WP_005_REQUIREMENTS');
 const boundary=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BOUNDARY-CONTRACT.json'),'utf8'));
 if(boundary.production_authorized!==false||!String(boundary.authority_boundaries.queue_selection||'').includes('Non-authoritative'))throw new Error('BOUNDARY_CONTRACT_DRIFT');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 if(mf.expected_test_count!==50||mf.expected_requirement_count!==4||mf.production_authorized!==false)throw new Error('MANIFEST_METADATA_MISMATCH');
 for(const e of mf.files){const repoPath=`${root}/${e.path}`;const actual=git(['rev-parse',`HEAD:${repoPath}`]).trim();if(actual!==e.git_blob_sha)throw new Error(`SEALED_BLOB_MISMATCH:${e.path}:${actual}:${e.git_blob_sha}`);}
 const depWorktree=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp004-dependency-${runId}`);
 try{
   if(fs.existsSync(depWorktree))git(['worktree','remove','--force',depWorktree]);
   git(['worktree','add','--detach',depWorktree,pred]);
   const dep=spawnSync('node',['.github/scripts/gwp004-qualify.js'],{cwd:depWorktree,encoding:'utf8',shell:false,windowsHide:true,env:{...process.env,GITHUB_WORKSPACE:depWorktree,GITHUB_REF_NAME:'dependency-gwp004'}});
   const out=`${dep.stdout||''}${dep.stderr||''}`;
   if(dep.error||dep.status!==0||!out.includes('PASS G-WP-004 tests=50 requirements=7'))throw new Error(`G_WP_004_REGRESSION_NOT_PROVEN:${dep.error?dep.error.message:out}`);
   write('dependency-gwp004.txt',out);
 } finally { try{git(['worktree','remove','--force',depWorktree]);}catch(_){} }
 const classes=path.join(evidenceDir,'classes'); fs.mkdirSync(classes,{recursive:true});
 const dirs=['g-wp-002','g-wp-003','g-wp-004','g-wp-005'].map(x=>path.join(ws,'system-master',x,'src','main','java','org','systemmaster','continuity'));
 let sources=[]; for(const d of dirs)sources.push(...fs.readdirSync(d).filter(x=>x.endsWith('.java')).sort().map(x=>path.join(d,x)));
 const test=path.join(ws,root,'src','test','java','org','systemmaster','continuity','Gwp005QualificationTest.java');
 write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...sources,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.continuity.Gwp005QualificationTest']); write('qualification.txt',out);
 if(!out.includes('PASS G-WP-005 tests=50 requirements=4'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${pred}`,`predecessor_run=${base.qualified_lineage_predecessor.workflow_run_id}`,`predecessor_artifact=${base.qualified_lineage_predecessor.evidence_artifact_id}`,`predecessor_evidence_sha256=${base.qualified_lineage_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=50\nrequirements=4\ngwp004_regression=PASS\nconcurrency=PASS\nproperty=PASS\nprocess_kill=PASS\ndatabase_contention=PASS\nmilestone_testing=true\nproduction_authorized=false');
 console.log('PASS G-WP-005 tests=50 requirements=4'); console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
