'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-lifecycle-current-parent-compatibility-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const paths = {
  adapterContract: 'qualification/book-system/lifecycle-transition-compatibility-001/BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-COMPATIBILITY-ADAPTER-001.json',
  finding: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-LIFECYCLE-PARENT-IDENTITY-COMPATIBILITY-FINDING-001.json',
  fixtures: 'qualification/book-system/lifecycle-transition-compatibility-001/BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-COMPATIBILITY-ADAPTER-001-FIXTURES.json',
  lifecycleContract: 'qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json',
  adapter: 'system-master/book-system/lifecycle-current-parent-compatibility-adapter.js',
  lifecycleCore: 'system-master/book-system/lifecycle-transition-engine.js',
  lifecycleRuntime: 'system-master/book-system/lifecycle-transition-engine-runtime.js',
  versionRuntime: 'system-master/book-system/version-and-rollback.js',
  versionCore: 'system-master/book-system/version-and-rollback-core.js',
  predecessorQualifier: '.github/scripts/book-system-lifecycle-transition-001-qualify.js',
};

function readJson(p) { return JSON.parse(fs.readFileSync(path.join(workspace, p), 'utf8')); }
const adapterContract = readJson(paths.adapterContract);
const finding = readJson(paths.finding);
const fixtures = readJson(paths.fixtures);
const lifecycleContract = readJson(paths.lifecycleContract);
const adapter = require(path.join(workspace, paths.adapter));
const vr = require(path.join(workspace, paths.versionRuntime));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stable(v) { return vr.stable(v); }
function assert(ok, code, detail = '') { if (!ok) { const e = new Error(detail ? `${code}:${detail}` : code); e.code = code; throw e; } }
function expectError(fn, code) {
  try { fn(); } catch (e) { assert(e && e.code === code, 'WRONG_ERROR_CODE', `expected=${code}:actual=${e && e.code}:detail=${e && e.message}`); return e; }
  assert(false, 'EXPECTED_ERROR_NOT_THROWN', code);
}
function git(args) { return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true }); }
function gitHead() { const r = git(['rev-parse','HEAD']); assert(r.status === 0, 'GIT_HEAD_FAILED', r.stderr || ''); return r.stdout.trim(); }
function gitBlobSha(repoPath) { const r = git(['rev-parse', `HEAD:${repoPath}`]); assert(r.status === 0, 'GIT_BLOB_SHA_FAILED', repoPath); return r.stdout.trim(); }
function fileSha256(repoPath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, repoPath))).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(evidenceDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }

function sealedParent(patch = null) {
  const p = clone(fixtures.base_parent_state);
  if (patch) patch(p);
  return vr.sealState(p);
}
function setup(patch = null) {
  const parent = sealedParent(patch);
  const ledger = adapter.createCompatibleLedger(lifecycleContract, parent, { unit_states: fixtures.base_unit_states, dependency_edges: [] });
  return { parent, ledger };
}
function req(s, overrides = {}) {
  return {
    transition_request_id:'LCA-TRANSITION-001',
    idempotency_key:'LCA-IDEM-001',
    actor_class:'PARENT_SYSTEM',
    scope:'PROJECT',
    target_ref:s.parent.book_project.book_project_id,
    target_status:'EXPORT_FROZEN',
    expected_parent_state_version:s.parent.state_version,
    expected_parent_state_digest:s.parent.state_digest,
    expected_ledger_version:s.ledger.ledger_version,
    expected_ledger_digest:adapter.digestCompatibleLedger(s.ledger),
    evidence_refs:['RELEASE-001'],
    author_decision_refs:[],
    integration_proposal_refs:[],
    cause_refs:[],
    ...overrides,
  };
}
function currentBindings(versionLedger) { return clone(versionLedger.state_snapshots[versionLedger.current_snapshot_id].active_version_bindings); }

const tests = {};
function test(id, fn) { tests[id] = fn; }

test('LCA001_PROJECTION_ARRAYS_TO_KEYED_LOSSLESS', () => {
  const s=setup(); const p=adapter.projectParentForV1(s.parent);
  assert(!Array.isArray(p.export_releases) && p.export_releases['RELEASE-001'].release_id==='RELEASE-001','EXPORT_RELEASE_PROJECTION_FAIL');
  assert(!Array.isArray(p.author_decisions) && p.author_decisions['DECISION-FINALIZE'].decision_type==='FINALIZATION_APPROVAL','AUTHOR_PROJECTION_FAIL');
  assert(!Object.prototype.hasOwnProperty.call(p,'state_digest'),'PROJECTED_STATE_DIGEST_NOT_REMOVED');
});

test('LCA002_DUPLICATE_PROJECTED_ID_REJECTED', () => {
  const p=sealedParent(x=>x.export_releases.push({...x.export_releases[0]}));
  expectError(()=>adapter.projectParentForV1(p),'DUPLICATE_PROJECTED_ID');
});

test('LCA003_CREATE_LEDGER_BINDS_SEALED_PARENT', () => {
  const s=setup(); assert(s.ledger.bound_parent_state_digest===s.parent.state_digest && s.ledger.bound_parent_state_version===s.parent.state_version,'EXTERNAL_LEDGER_BINDING_FAIL');
  adapter.validateCompatibleLedger(lifecycleContract,s.parent,s.ledger);
});

test('LCA004_EXPORT_RELEASE_EVIDENCE_FINALIZATION_TO_FROZEN', () => {
  const s=setup(); const out=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s));
  assert(out.parent_state.book_project.status==='EXPORT_FROZEN','EXPORT_FREEZE_TRANSITION_FAIL');
  assert(out.parent_state.state_version===s.parent.state_version+1,'PROJECT_VERSION_DELTA_FAIL');
  assert(out.receipt.pre_parent_state_digest===s.parent.state_digest && out.receipt.post_parent_state_digest===out.parent_state.state_digest,'CANONICAL_RECEIPT_DIGEST_FAIL');
  const before=clone(s.parent); delete before.state_digest; before.state_version=out.parent_state.state_version; before.book_project.status='EXPORT_FROZEN';
  const after=clone(out.parent_state); delete after.state_digest;
  assert(stable(before)===stable(after),'PARENT_DELTA_BROADER_THAN_STATUS_VERSION');
});

test('LCA005_MISSING_EXPORT_FREEZE_READY_REJECTED', () => {
  const s=setup(); expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s,{evidence_refs:[]})),'REQUIRED_TRANSITION_EVIDENCE_MISSING');
});

test('LCA006_PROVIDER_DIRECT_TRANSITION_REJECTED', () => {
  const s=setup(); expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s,{actor_class:'PROSE_PROJECT'})),'TRANSITION_AUTHORITY_DENIED');
});

test('LCA007_STALE_PARENT_VERSION_REJECTED', () => {
  const s=setup(); expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s,{expected_parent_state_version:999})),'PARENT_STATE_VERSION_MISMATCH');
});

test('LCA008_STALE_PARENT_DIGEST_REJECTED', () => {
  const s=setup(); expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s,{expected_parent_state_digest:'0'.repeat(64)})),'PARENT_STATE_DIGEST_MISMATCH');
});

test('LCA009_STALE_LEDGER_VERSION_REJECTED', () => {
  const s=setup(); expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s,{expected_ledger_version:999})),'LEDGER_VERSION_MISMATCH');
});

test('LCA010_STALE_LEDGER_DIGEST_REJECTED', () => {
  const s=setup(); expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s,{expected_ledger_digest:'0'.repeat(64)})),'LEDGER_DIGEST_MISMATCH');
});

test('LCA011_UNIT_TRANSITION_PRESERVES_PARENT_BYTES', () => {
  const s=setup(); const r=req(s,{scope:'UNIT',target_ref:'CHAPTER-1',target_status:'READY_TO_DRAFT',evidence_refs:['EVIDENCE-UNIT-PLAN']});
  const before=stable(s.parent); const out=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r);
  assert(stable(out.parent_state)===before && out.parent_state.state_digest===s.parent.state_digest,'UNIT_PARENT_MUTATED');
  assert(out.lifecycle_ledger.unit_states['CHAPTER-1'].status==='READY_TO_DRAFT','UNIT_TRANSITION_FAIL');
});

test('LCA012_ARRAY_AUTHOR_DECISION_SATISFIES_GATE', () => {
  const s=setup(p=>p.book_project.status='AUTHOR_REVIEW');
  const r=req(s,{target_status:'FINALIZATION',evidence_refs:['EVIDENCE-AUTHOR-REVIEW'],author_decision_refs:['DECISION-FINALIZE']});
  const out=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r);
  assert(out.parent_state.book_project.status==='FINALIZATION','AUTHOR_GATE_TRANSITION_FAIL');
});

test('LCA013_MISSING_AUTHOR_DECISION_REJECTED', () => {
  const s=setup(p=>p.book_project.status='AUTHOR_REVIEW');
  const r=req(s,{target_status:'FINALIZATION',evidence_refs:['EVIDENCE-AUTHOR-REVIEW'],author_decision_refs:[]});
  expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r),'REQUIRED_AUTHOR_DECISION_MISSING');
});

test('LCA014_INTEGRATION_PROPOSAL_REF_RESOLVES', () => {
  const s=setup(p=>p.book_project.status='PLANNING');
  const r=req(s,{target_status:'DRAFTING',evidence_refs:['EVIDENCE-BOOK-PLAN'],integration_proposal_refs:['PROPOSAL-001']});
  const out=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r);
  assert(out.parent_state.book_project.status==='DRAFTING','PROPOSAL_REF_RESOLUTION_FAIL');
});

test('LCA015_STALE_SERVICE_EVIDENCE_REMAINS_STALE', () => {
  const s=setup(p=>p.book_project.status='PLANNING');
  const r=req(s,{target_status:'DRAFTING',evidence_refs:['EVIDENCE-STALE']});
  expectError(()=>adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r),'STALE_SERVICE_EVIDENCE');
});

test('LCA016_IDEMPOTENT_REPLAY_NO_DOUBLE_COMMIT', () => {
  const s=setup(); const r=req(s); const first=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r);
  const second=adapter.applyTransition(lifecycleContract,first.parent_state,first.lifecycle_ledger,r);
  assert(second.disposition==='REPLAY','REPLAY_DISPOSITION_FAIL');
  assert(second.receipt.transition_receipt_id===first.receipt.transition_receipt_id,'REPLAY_RECEIPT_CHANGED');
  assert(stable(second.parent_state)===stable(first.parent_state) && stable(second.lifecycle_ledger)===stable(first.lifecycle_ledger),'REPLAY_DOUBLE_COMMIT');
});

test('LCA017_IDEMPOTENCY_CONFLICT_REJECTED', () => {
  const s=setup(); const r=req(s); const first=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r);
  expectError(()=>adapter.applyTransition(lifecycleContract,first.parent_state,first.lifecycle_ledger,{...r,target_status:'PUBLISHED_OR_DELIVERED'}),'IDEMPOTENCY_KEY_CONFLICT');
});

test('LCA018_REQUEST_ID_CONFLICT_REJECTED', () => {
  const s=setup(); const r=req(s); const first=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,r);
  const second=req({parent:first.parent_state,ledger:first.lifecycle_ledger},{transition_request_id:r.transition_request_id,idempotency_key:'LCA-IDEM-002',target_status:'FINALIZATION',evidence_refs:[]});
  expectError(()=>adapter.applyTransition(lifecycleContract,first.parent_state,first.lifecycle_ledger,second),'REQUEST_ID_CONFLICT');
});

test('LCA019_ADAPTED_RECEIPT_ACCEPTED_BY_VERSION_ROLLBACK', () => {
  const s=setup(); const v=vr.createVersionLedger(s.parent); const out=adapter.applyTransition(lifecycleContract,s.parent,s.ledger,req(s));
  const request={
    request_id:'VR-LCA-001',idempotency_key:'VR-LCA-IDEM-001',actor_class:'PARENT_SYSTEM',
    expected_state_version:s.parent.state_version,expected_state_digest:s.parent.state_digest,
    expected_ledger_version:v.version_ledger.ledger_version,expected_ledger_digest:vr.digestLedger(v.version_ledger),
    authority_kind:'LIFECYCLE_TRANSITION',authority_receipt:out.receipt,committed_parent_state:out.parent_state,
    active_version_bindings:currentBindings(v.version_ledger),
  };
  const recorded=vr.recordAuthorizedParentSuccessor({parentState:s.parent,versionLedger:v.version_ledger,request});
  assert(recorded.parent_state.state_digest===out.parent_state.state_digest && recorded.receipt.authority_kind==='LIFECYCLE_TRANSITION','VERSION_ROLLBACK_ADAPTER_RECEIPT_REJECTED');
});

test('LCA020_DELEGATED_V1_FILES_UNCHANGED_BY_ADAPTER', () => {
  assert(gitBlobSha(paths.lifecycleCore)==='26d36d2186c6e88fcab1acb3c9626b2d2d9e11db','LIFECYCLE_V1_CORE_BYTES_CHANGED');
  assert(gitBlobSha(paths.lifecycleRuntime)==='dbaaf79479f400f7097cb5328cd5edae5e59696d','LIFECYCLE_V1_RUNTIME_BYTES_CHANGED');
});

test('LCA021_ORIGINAL_LIFECYCLE_18_CASE_REGRESSION_PASS', () => {
  const temp=path.join(evidenceDir,'predecessor-regression'); fs.mkdirSync(temp,{recursive:true});
  const r=spawnSync(process.execPath,[path.join(workspace,paths.predecessorQualifier)],{cwd:workspace,encoding:'utf8',shell:false,windowsHide:true,env:{...process.env,RUNNER_TEMP:temp,A01_EVIDENCE_DIR:''}});
  assert(r.status===0,'LIFECYCLE_V1_PREDECESSOR_REGRESSION_FAIL',`${r.stdout||''}${r.stderr||''}`.slice(-2000));
  assert((r.stdout||'').includes('PASS cases=18'),'LIFECYCLE_V1_PREDECESSOR_COUNT_NOT_PROVEN');
});

assert(adapterContract.standing.includes('EXECUTABLE_IMPLEMENTATION_PENDING_QUALIFICATION'),'ADAPTER_CONTRACT_STANDING_MISMATCH');
assert(finding.standing.includes('BLOCKING_COMPATIBILITY_FINDING'),'COMPATIBILITY_FINDING_MISSING');
assert(fixtures.cases.length===21,'FIXTURE_CASE_COUNT_MISMATCH');
assert(Object.keys(tests).length===21 && fixtures.cases.every(id=>tests[id]),'QUALIFIER_CASE_COVERAGE_MISMATCH');

const results=[];
for (const id of fixtures.cases) {
  try { tests[id](); results.push({id,result:'PASS'}); }
  catch (e) { results.push({id,result:'FAIL',code:e&&e.code?e.code:'UNEXPECTED_ERROR',detail:e&&e.message?e.message:String(e)}); }
}
const failed=results.filter(x=>x.result!=='PASS');
const summary={
  qualification_id:'BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-COMPATIBILITY-ADAPTER-001',
  result_class:failed.length?'FAIL':'PASS',subject_sha:gitHead(),case_count:results.length,pass_count:results.length-failed.length,fail_count:failed.length,
  predecessor_regression_cases:18,
  authority:{new_lifecycle_policy:false,new_transition_types:false,provider_transition_authority:false,author_choice_reinterpretation:false,document_or_export_authority:false},
  file_sha256:Object.fromEntries(Object.entries(paths).map(([k,v])=>[k,fileSha256(v)])),
  results,
};
write('qualification-summary.json',summary);
write('qualification-manifest.json',{qualification_id:summary.qualification_id,subject_sha:summary.subject_sha,evidence_files:['qualification-summary.json'],case_count:summary.case_count,predecessor_regression_cases:18,result_class:summary.result_class});
console.log(JSON.stringify(summary,null,2));
if(failed.length) process.exit(1);
