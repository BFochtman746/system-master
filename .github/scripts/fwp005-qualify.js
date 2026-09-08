'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-005';
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(process.env.RUNNER_TEMP || path.join(workspace,'.tmp'), `system-master-fwp005-${runId}`);
fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8') { const r=spawnSync('git',['-c',`safe.directory=${workspace}`,...args],{cwd:workspace,encoding,shell:false,windowsHide:true}); if(r.error||r.status!==0) throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`); return r.stdout; }
function run(cmd,args) { const r=spawnSync(cmd,args,{cwd:workspace,encoding:'utf8',shell:false,windowsHide:true}); const out=`${r.stdout||''}${r.stderr||''}`; if(r.error||r.status!==0) throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`); return out; }
function exactSet(actual,expected,label){const a=[...actual].sort(),e=[...expected].sort();if(JSON.stringify(a)!==JSON.stringify(e))throw new Error(`${label}_MISMATCH actual=${a} expected=${e}`);}

try {
 const head=git(['rev-parse','HEAD']).trim();
 const baseline=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','BASELINE-BINDING.json'),'utf8'));
 if(baseline.primary_predecessor.qualified_commit!=='b1f00e624dbd9a8c779dc2c4c210ec6a7e1dd94e') throw new Error('F_WP_004_BASELINE_BINDING_MISMATCH');
 if(baseline.supporting_predecessor.qualified_commit!=='d8e7feb803d9c213671db0484598b72852f005de') throw new Error('F_WP_003_BASELINE_BINDING_MISMATCH');
 git(['merge-base','--is-ancestor',baseline.primary_predecessor.qualified_commit,'HEAD']);
 git(['merge-base','--is-ancestor',baseline.supporting_predecessor.qualified_commit,'HEAD']);

 const req=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','REQUIREMENTS.json'),'utf8'));
 exactSet(req.requirements.map(x=>x.id),['F-RQ-010','F-RQ-011','F-RQ-012','F-RQ-039','F-RQ-041','F-RQ-049'],'F_WP_005_REQUIREMENTS');

 const gate=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','CONTRACT-GATE-021O-P.json'),'utf8'));
 if(gate.status!=='SATISFIED_FOR_BOUNDED_F_WP_005_SCOPE') throw new Error('CONTRACT_GATE_NOT_SATISFIED');
 if(gate['021O'].architecture_build_spec_status!=='CLOSED_REQUALIFIED_DEPENDENCY_VALID'||gate['021O'].material_architecture_residual_count!==0) throw new Error('021O_CONTRACT_NOT_CLOSED');
 if(gate['021P'].architecture_build_spec_status!=='CLOSED_REQUALIFIED_DEPENDENCY_VALID'||gate['021P'].material_architecture_residual_count!==0) throw new Error('021P_CONTRACT_NOT_CLOSED');
 if(gate['021O'].computer_implementation_status!=='NOT_STARTED'||gate['021P'].computer_implementation_status!=='NOT_STARTED') throw new Error('CONTRACT_GATE_FALSE_IMPLEMENTATION_CLAIM');
 write('contract-gates.txt',`gate=${gate.status}\n021O=${gate['021O'].architecture_build_spec_status}\n021P=${gate['021P'].architecture_build_spec_status}\nimplementation_claim=NONE`);

 const manifest=JSON.parse(fs.readFileSync(path.join(workspace,packageRoot,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 for(const entry of manifest.files){const repoPath=`${packageRoot}/${entry.path}`; const bytes=git(['show',`HEAD:${repoPath}`],null); if(bytes.length!==entry.size) throw new Error(`SEALED_SIZE_MISMATCH:${entry.path}:${bytes.length}:${entry.size}`); const digest=sha256(bytes); if(digest!==entry.sha256) throw new Error(`SEALED_HASH_MISMATCH:${entry.path}:${digest}:${entry.sha256}`);}

 const predecessor=run('node',['.github/scripts/fwp004-qualify.js']);
 if(!predecessor.includes('PASS F-WP-004 tests=41 requirements=6')) throw new Error(`F_WP_004_REGRESSION_NOT_PROVEN:${predecessor}`);
 write('dependency-fwp004.txt',predecessor);

 const classes=path.join(evidenceDir,'classes'); fs.mkdirSync(classes,{recursive:true});
 const srcBase=path.join(workspace,packageRoot,'src','main','java','org','systemmaster','core');
 const testSource=path.join(workspace,packageRoot,'src','test','java','org','systemmaster','core','Fwp005QualificationTest.java');
 const sources=['GovernanceAuthorizationContracts.java','AuthorizationAdapter.java','SecretReferenceValidator.java','ApprovalOrchestrator.java','EmergencyChangeAuthority.java'].map(x=>path.join(srcBase,x));
 const compileOut=run('javac',['-encoding','UTF-8','-d',classes,...sources,testSource]); write('compile.txt',compileOut||'javac=PASS');
 const testOut=run('java',['-cp',classes,'org.systemmaster.core.Fwp005QualificationTest']); write('qualification.txt',testOut);
 if(!testOut.includes('PASS F-WP-005 tests=44 requirements=6')) throw new Error(`QUALIFICATION_SENTINEL_MISSING:${testOut}`);

 write('subject.txt',[`objective=SYSTEM-MASTER-F-WP-005-CONTRACT-GATE-VERIFY-A01-IMPLEMENT-QUALIFY-001`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`primary_predecessor_commit=${baseline.primary_predecessor.qualified_commit}`,`primary_predecessor_run=${baseline.primary_predecessor.workflow_run_id}`,`primary_predecessor_evidence_sha256=${baseline.primary_predecessor.evidence_artifact_sha256}`,`supporting_predecessor_commit=${baseline.supporting_predecessor.qualified_commit}`,`supporting_predecessor_run=${baseline.supporting_predecessor.workflow_run_id}`,`supporting_predecessor_evidence_sha256=${baseline.supporting_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=44\nrequirements=6\nfwp004_regression=PASS\ncontract_gate_021O_P=PASS');
 console.log('PASS F-WP-005 tests=44 requirements=6'); console.log(`evidence_dir=${evidenceDir}`);
} catch(error) { const detail=error&&error.stack?error.stack:String(error); write('failure.txt',detail); write('result.txt','result=FAIL_OR_INCOMPLETE'); console.error(detail); process.exit(1); }
