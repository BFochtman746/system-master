'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/g-wp-004', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp004-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8',cwd=ws){const r=spawnSync('git',['-c',`safe.directory=${cwd}`,...args],{cwd,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args,cwd=ws,env=process.env){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',shell:false,windowsHide:true,env});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim();
 const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 const pred=base.qualified_lineage_predecessor.qualified_commit;
 if(pred!=='8e13d92f738d1c0ff410202cf6e4f6daf3b62a1b')throw new Error('G_WP_003_BASELINE_MISMATCH');
 if(base.qualified_lineage_predecessor.workflow_run_id!==34243743143)throw new Error('G_WP_003_RUN_MISMATCH');
 if(base.qualified_lineage_predecessor.evidence_artifact_id!==10063110316)throw new Error('G_WP_003_ARTIFACT_MISMATCH');
 if(base.qualified_lineage_predecessor.evidence_artifact_sha256!=='c9ce1b92b0f240e414d067773e145dbe045a31c7ec856402f08b4fcda502a4aa')throw new Error('G_WP_003_EVIDENCE_SHA_MISMATCH');
 git(['merge-base','--is-ancestor',pred,'HEAD']);
 const pkg=JSON.parse(fs.readFileSync(path.join(ws,root,'control','PACKAGE-CONTRACT.json'),'utf8'));
 if(pkg.id!=='G-WP-004'||pkg.objective!=='Implement immutable checkpoint protocol, catalog, integrity checks and orphan cleanup.')throw new Error('PACKAGE_CONTRACT_DRIFT');
 seteq(pkg.components,['CheckpointCoordinator','CheckpointCatalog','RecoveryIntegrityValidator'],'PACKAGE_COMPONENTS');
 seteq(pkg.data,['CheckpointManifest','CheckpointPayloadRef','IntegrityFinding'],'PACKAGE_DATA');
 seteq(pkg.contracts,['RecordCheckpoint','ValidateCheckpoint','GetCheckpointLineage'],'PACKAGE_CONTRACTS');
 seteq(pkg.tests,['TRANSACTION','CRASH_INJECTION','CORRUPTION','PROPERTY'],'PACKAGE_TESTS');
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8'));
 seteq(req.requirements.map(x=>x.id),['G-RQ-017','G-RQ-018','G-RQ-019','G-RQ-020','G-RQ-022','G-RQ-025','G-RQ-026'],'G_WP_004_REQUIREMENTS');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 if(mf.expected_test_count!==50||mf.expected_requirement_count!==7||mf.production_authorized!==false)throw new Error('MANIFEST_METADATA_MISMATCH');
 for(const e of mf.files){const repoPath=`${root}/${e.path}`,bytes=git(['show',`HEAD:${repoPath}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}:${bytes.length}:${e.size}`);const h=hash(bytes);if(h!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}:${h}:${e.sha256}`);}
 const depWorktree=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp003-dependency-${runId}`);
 try{
   if(fs.existsSync(depWorktree))git(['worktree','remove','--force',depWorktree]);
   git(['worktree','add','--detach',depWorktree,pred]);
   const dep=spawnSync('node',['.github/scripts/gwp003-qualify.js'],{cwd:depWorktree,encoding:'utf8',shell:false,windowsHide:true,env:{...process.env,GITHUB_WORKSPACE:depWorktree,GITHUB_REF_NAME:'dependency-gwp003'}});
   const out=`${dep.stdout||''}${dep.stderr||''}`;
   if(dep.error||dep.status!==0||!out.includes('PASS G-WP-003 tests=50 requirements=6'))throw new Error(`G_WP_003_REGRESSION_NOT_PROVEN:${dep.error?dep.error.message:out}`);
   write('dependency-gwp003.txt',out);
 } finally { try{git(['worktree','remove','--force',depWorktree]);}catch(_){} }
 const classes=path.join(evidenceDir,'classes'); fs.mkdirSync(classes,{recursive:true});
 const dirs=['g-wp-002','g-wp-003','g-wp-004'].map(x=>path.join(ws,'system-master',x,'src','main','java','org','systemmaster','continuity'));
 let sources=[]; for(const d of dirs)sources.push(...fs.readdirSync(d).filter(x=>x.endsWith('.java')).sort().map(x=>path.join(d,x)));
 const test=path.join(ws,root,'src','test','java','org','systemmaster','continuity','Gwp004QualificationTest.java');
 write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...sources,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.continuity.Gwp004QualificationTest']); write('qualification.txt',out);
 if(!out.includes('PASS G-WP-004 tests=50 requirements=7'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${pred}`,`predecessor_run=${base.qualified_lineage_predecessor.workflow_run_id}`,`predecessor_artifact=${base.qualified_lineage_predecessor.evidence_artifact_id}`,`predecessor_evidence_sha256=${base.qualified_lineage_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=50\nrequirements=7\ngwp003_regression=PASS\ntransaction=PASS\ncrash_injection=PASS\ncorruption=PASS\nproperty=PASS\nmilestone_testing=true\nproduction_authorized=false');
 console.log('PASS G-WP-004 tests=50 requirements=7'); console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
