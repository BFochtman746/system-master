'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-007';
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(process.env.RUNNER_TEMP || path.join(workspace,'.tmp'), `system-master-fwp007-${runId}`);
fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${workspace}`,...args],{cwd:workspace,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:workspace,encoding:'utf8',shell:false,windowsHide:true});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function exactSet(actual,expected,label){const a=[...actual].sort(),e=[...expected].sort();if(JSON.stringify(a)!==JSON.stringify(e))throw new Error(`${label}_MISMATCH actual=${a} expected=${e}`);}

try {
  const head=git(['rev-parse','HEAD']).trim();
  const baseline=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','BASELINE-BINDING.json'),'utf8'));
  if(baseline.primary_predecessor.qualified_commit!=='b285d292baa66651672e21324f841d0d9422d0ca') throw new Error('F_WP_006_BASELINE_BINDING_MISMATCH');
  git(['merge-base','--is-ancestor',baseline.primary_predecessor.qualified_commit,'HEAD']);

  const req=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','REQUIREMENTS.json'),'utf8'));
  exactSet(req.requirements.map(x=>x.id),['F-RQ-015','F-RQ-016','F-RQ-017','F-RQ-022','F-RQ-026','F-RQ-028','F-RQ-029','F-RQ-030','F-RQ-053'],'F_WP_007_REQUIREMENTS');

  const gate=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','CONTRACT-GATE-021G-J-K-I.json'),'utf8'));
  if(gate.status!=='SATISFIED_FOR_BOUNDED_F_WP_007_SCOPE') throw new Error('CONTRACT_GATE_NOT_SATISFIED');
  for(const key of ['021G','021J','021K','021I']){
    if(gate[key].architecture_build_spec_status!=='CLOSED_REQUALIFIED_DEPENDENCY_VALID') throw new Error(`${key}_CONTRACT_NOT_CLOSED`);
    if(gate[key].computer_implementation_status!=='NOT_STARTED') throw new Error(`${key}_FALSE_IMPLEMENTATION_CLAIM`);
  }
  write('contract-gates.txt',`gate=${gate.status}\n021G=${gate['021G'].architecture_build_spec_status}\n021J=${gate['021J'].architecture_build_spec_status}\n021K=${gate['021K'].architecture_build_spec_status}\n021I=${gate['021I'].architecture_build_spec_status}\nimplementation_claim=F_WP_007_ADAPTER_SLICE_ONLY`);

  const manifest=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
  for(const entry of manifest.files){
    const repoPath=`${packageRoot}/${entry.path}`;
    const bytes=git(['show',`HEAD:${repoPath}`],null);
    if(bytes.length!==entry.size) throw new Error(`SEALED_SIZE_MISMATCH:${entry.path}:${bytes.length}:${entry.size}`);
    const digest=sha256(bytes);
    if(digest!==entry.sha256) throw new Error(`SEALED_HASH_MISMATCH:${entry.path}:${digest}:${entry.sha256}`);
  }

  const predecessor=run('node',['.github/scripts/fwp006-qualify.js']);
  if(!predecessor.includes('PASS F-WP-006 tests=33 requirements=3')) throw new Error(`F_WP_006_REGRESSION_NOT_PROVEN:${predecessor}`);
  write('dependency-fwp006.txt',predecessor);

  const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});
  const srcBase=path.join(workspace,packageRoot,'src','main','java','org','systemmaster','core');
  const testSource=path.join(workspace,packageRoot,'src','test','java','org','systemmaster','core','Fwp007QualificationTest.java');
  const sources=['CoordinationContracts.java','ExecutionLeaseManager.java','ConflictDetector.java','ChangeCoordinator.java'].map(x=>path.join(srcBase,x));
  const compileOut=run('javac',['-encoding','UTF-8','-d',classes,...sources,testSource]);write('compile.txt',compileOut||'javac=PASS');
  const testOut=run('java',['-cp',classes,'org.systemmaster.core.Fwp007QualificationTest']);write('qualification.txt',testOut);
  if(!testOut.includes('PASS F-WP-007 tests=46 requirements=9')) throw new Error(`QUALIFICATION_SENTINEL_MISSING:${testOut}`);

  write('subject.txt',[`objective=SYSTEM-MASTER-F-WP-007-CONTRACT-GATE-VERIFY-A01-IMPLEMENT-QUALIFY-001`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${baseline.primary_predecessor.qualified_commit}`,`predecessor_run=${baseline.primary_predecessor.workflow_run_id}`,`predecessor_evidence_sha256=${baseline.primary_predecessor.evidence_artifact_sha256}`].join('\n'));
  write('result.txt','result=PASS\ntests=46\nrequirements=9\nfwp006_regression=PASS\ncontract_gate_021G_J_K_I=PASS');
  console.log('PASS F-WP-007 tests=46 requirements=9');console.log(`evidence_dir=${evidenceDir}`);
} catch(error){const detail=error&&error.stack?error.stack:String(error);write('failure.txt',detail);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(detail);process.exit(1);}
