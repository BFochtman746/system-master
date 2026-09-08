'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-006';
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(process.env.RUNNER_TEMP || path.join(workspace,'.tmp'), `system-master-fwp006-${runId}`);
fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8') { const r=spawnSync('git',['-c',`safe.directory=${workspace}`,...args],{cwd:workspace,encoding,shell:false,windowsHide:true}); if(r.error||r.status!==0) throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`); return r.stdout; }
function run(cmd,args) { const r=spawnSync(cmd,args,{cwd:workspace,encoding:'utf8',shell:false,windowsHide:true}); const out=`${r.stdout||''}${r.stderr||''}`; if(r.error||r.status!==0) throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`); return out; }
function exactSet(actual,expected,label){const a=[...actual].sort(),e=[...expected].sort();if(JSON.stringify(a)!==JSON.stringify(e))throw new Error(`${label}_MISMATCH actual=${a} expected=${e}`);}

try {
 const head=git(['rev-parse','HEAD']).trim();
 const baseline=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','BASELINE-BINDING.json'),'utf8'));
 if(baseline.primary_predecessor.qualified_commit!=='9d5773603ee7469e4fb0203e9c5b9bfe3a6d7080') throw new Error('F_WP_005_BASELINE_BINDING_MISMATCH');
 if(baseline.primary_predecessor.workflow_run_id!==34179282695) throw new Error('F_WP_005_RUN_BINDING_MISMATCH');
 if(baseline.primary_predecessor.evidence_artifact_sha256!=='52b65f167db0bcd666cd5cc6a290e48d09eb781836e2390dcf892a2b0e70ea98') throw new Error('F_WP_005_EVIDENCE_BINDING_MISMATCH');
 git(['merge-base','--is-ancestor',baseline.primary_predecessor.qualified_commit,'HEAD']);

 const req=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','REQUIREMENTS.json'),'utf8'));
 exactSet(req.requirements.map(x=>x.id),['F-RQ-013','F-RQ-014','F-RQ-050'],'F_WP_006_REQUIREMENTS');

 const manifest=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 for(const entry of manifest.files){
   const repoPath=`${packageRoot}/${entry.path}`;
   const bytes=git(['show',`HEAD:${repoPath}`],null);
   if(bytes.length!==entry.size) throw new Error(`SEALED_SIZE_MISMATCH:${entry.path}:${bytes.length}:${entry.size}`);
   const digest=sha256(bytes);
   if(digest!==entry.sha256) throw new Error(`SEALED_HASH_MISMATCH:${entry.path}:${digest}:${entry.sha256}`);
 }

 const predecessor=run('node',['.github/scripts/fwp005-qualify.js']);
 if(!predecessor.includes('PASS F-WP-005 tests=44 requirements=6')) throw new Error(`F_WP_005_REGRESSION_NOT_PROVEN:${predecessor}`);
 write('dependency-fwp005.txt',predecessor);

 const classes=path.join(evidenceDir,'classes'); fs.mkdirSync(classes,{recursive:true});
 const srcBase=path.join(workspace,packageRoot,'src','main','java','org','systemmaster','core');
 const testSource=path.join(workspace,packageRoot,'src','test','java','org','systemmaster','core','Fwp006QualificationTest.java');
 const sources=['ExecutionGrantContracts.java','ExecutionGrantIssuer.java'].map(x=>path.join(srcBase,x));
 const compileOut=run('javac',['-encoding','UTF-8','-d',classes,...sources,testSource]); write('compile.txt',compileOut||'javac=PASS');
 const testOut=run('java',['-cp',classes,'org.systemmaster.core.Fwp006QualificationTest']); write('qualification.txt',testOut);
 if(!testOut.includes('PASS F-WP-006 tests=33 requirements=3')) throw new Error(`QUALIFICATION_SENTINEL_MISSING:${testOut}`);

 write('subject.txt',[`objective=SYSTEM-MASTER-F-WP-006-A01-IMPLEMENT-QUALIFY-001`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${baseline.primary_predecessor.qualified_commit}`,`predecessor_run=${baseline.primary_predecessor.workflow_run_id}`,`predecessor_evidence_sha256=${baseline.primary_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=33\nrequirements=3\nfwp005_regression=PASS\nexecution_grant_gate=PASS');
 console.log('PASS F-WP-006 tests=33 requirements=3'); console.log(`evidence_dir=${evidenceDir}`);
} catch(error) {
 const detail=error&&error.stack?error.stack:String(error);
 write('failure.txt',detail); write('result.txt','result=FAIL_OR_INCOMPLETE'); console.error(detail); process.exit(1);
}
