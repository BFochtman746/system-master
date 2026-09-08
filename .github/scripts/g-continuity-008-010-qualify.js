'use strict';
const fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/g-continuity-008-010', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-continuity-008-010-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
function git(args,encoding='utf8',cwd=ws){const r=spawnSync('git',['-c',`safe.directory=${cwd}`,...args],{cwd,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args,cwd=ws,env=process.env){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',shell:false,windowsHide:true,env});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim();
 const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8')); const pred=base.qualified_predecessor.qualified_commit;
 if(pred!=='1e3354a0ceadb808fab54dcbb287a183d81d53d7')throw new Error('PREDECESSOR_COMMIT_MISMATCH');
 if(base.qualified_predecessor.workflow_run_id!==34277455798||base.qualified_predecessor.evidence_artifact_id!==10076486441||base.qualified_predecessor.evidence_artifact_sha256!=='fcf6aaf221b438eddb785684a9d729809de2eb9fcd7c9a38a78b463763fcf670')throw new Error('PREDECESSOR_EVIDENCE_MISMATCH');
 git(['merge-base','--is-ancestor',pred,'HEAD']);
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8'));
 seteq(req.requirements.map(x=>x.id),['G-RQ-045','G-RQ-046','G-RQ-047','G-RQ-048','G-RQ-043','G-RQ-021','G-RQ-035','G-RQ-051','G-RQ-052','G-RQ-053','G-RQ-054','G-RQ-055','G-RQ-056'],'CONTINUITY_REQUIREMENTS');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 if(mf.expected_assertion_count!==96||mf.expected_requirement_count!==13||mf.production_authorized!==false)throw new Error('MANIFEST_METADATA_MISMATCH');
 for(const e of mf.files){const actual=git(['rev-parse',`HEAD:${e.path}`]).trim();if(actual!==e.git_blob_sha)throw new Error(`SEALED_BLOB_MISMATCH:${e.path}:${actual}:${e.git_blob_sha}`);const size=Buffer.from(git(['show',`HEAD:${e.path}`],null)).length;if(size!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}:${size}:${e.size}`);}
 const depWorktree=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`continuity-gwp007-dependency-${runId}`);
 try{if(fs.existsSync(depWorktree))git(['worktree','remove','--force',depWorktree]);git(['worktree','add','--detach',depWorktree,pred]);const dep=run('node',['.github/scripts/gwp007-qualify.js'],depWorktree,{...process.env,GITHUB_WORKSPACE:depWorktree,GITHUB_REF_NAME:'dependency-gwp007'});if(!dep.includes('PASS G-WP-007 tests=50 requirements=6'))throw new Error(`G_WP_007_REGRESSION_NOT_PROVEN:${dep}`);write('dependency-gwp007.txt',dep);}finally{try{git(['worktree','remove','--force',depWorktree]);}catch(_){}}
 const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});
 const dirs=['g-wp-002','g-wp-003','g-wp-004','g-wp-005','g-wp-006','g-wp-007','g-wp-008','g-wp-009','g-wp-010'].map(x=>path.join(ws,'system-master',x,'src','main','java','org','systemmaster','continuity'));
 let sources=[];for(const d of dirs){if(fs.existsSync(d))sources.push(...fs.readdirSync(d).filter(x=>x.endsWith('.java')).sort().map(x=>path.join(d,x)));}
 const test=path.join(ws,root,'src','test','java','org','systemmaster','continuity','ContinuityRecoverySliceQualificationTest.java');
 write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...sources,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.continuity.ContinuityRecoverySliceQualificationTest']);write('qualification.txt',out);
 if(!out.includes('ASSERTIONS=96')||!out.includes('PASS CONTINUITY-REPLACEMENT-SIGNALS-COMPAT requirements=13'))throw new Error(`MILESTONE_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`system=System Master — Continuity & Recovery System`,`milestone=Replacement + Signals + Compatibility`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${pred}`,`predecessor_run=${base.qualified_predecessor.workflow_run_id}`].join('\n'));
 write('result.txt','result=PASS\nassertions=96\nrequirements=13\ncapabilities=3\ngwp007_regression=PASS\nproduction_authorized=false');
 console.log('PASS CONTINUITY-REPLACEMENT-SIGNALS-COMPAT assertions=96 requirements=13 capabilities=3');console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
