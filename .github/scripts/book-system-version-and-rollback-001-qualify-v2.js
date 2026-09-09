'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-system-version-rollback-v2');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(runnerTemp, `book-system-version-rollback-v2-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const paths = {
  contract: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001.json',
  research: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-PREIMPLEMENTATION-RESEARCH-001.json',
  forensic: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-FORENSIC-MAP-001.json',
  lifecycleClarification: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-LIFECYCLE-CLARIFICATION.json',
  authorityClarification: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-AUTHORITY-INGEST-CLARIFICATION.json',
  fixturesBase: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json',
  fixtures: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES-v2.json',
  entrypoint: 'system-master/book-system/version-and-rollback.js',
  core: 'system-master/book-system/version-and-rollback-core.js',
  qualifier: '.github/scripts/book-system-version-and-rollback-001-qualify-v2.js',
};

class TestFailure extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new TestFailure(code, detail); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stable(v) { return JSON.stringify(stableNormalize(v)); }
function sha256Bytes(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function assert(condition, code, detail = '') { if (!condition) fail(code, detail); }
function expectError(fn, code) {
  try { fn(); } catch (error) {
    if (error && error.code === code) return error;
    fail('WRONG_ERROR_CODE', `expected=${code}:actual=${error && error.code ? error.code : error}`);
  }
  fail('EXPECTED_ERROR_NOT_THROWN', code);
}
function readJson(repoPath) { return JSON.parse(fs.readFileSync(path.join(workspace, ...repoPath.split('/')), 'utf8')); }
function writeEvidence(name, value) { fs.writeFileSync(path.join(evidenceDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function run(command, args) { return spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, shell: false }); }
function gitHead() {
  const r = run('git', ['-c', `safe.directory=${workspace}`, 'rev-parse', 'HEAD']);
  if (r.error || r.status !== 0) fail('GIT_HEAD_FAILED', r.stderr || '');
  return r.stdout.trim();
}
function gitBlobSha256(repoPath) {
  const r = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'show', `HEAD:${repoPath}`], { cwd: workspace, encoding: null, windowsHide: true, shell: false });
  if (r.error || r.status !== 0) fail('GIT_BLOB_READ_FAILED', repoPath);
  return sha256Bytes(r.stdout || Buffer.alloc(0));
}

const contract = readJson(paths.contract);
const research = readJson(paths.research);
const forensic = readJson(paths.forensic);
const lifecycleClarification = readJson(paths.lifecycleClarification);
const authorityClarification = readJson(paths.authorityClarification);
const fixturesBase = readJson(paths.fixturesBase);
const fixtures = readJson(paths.fixtures);
const rt = require(path.join(workspace, ...paths.entrypoint.split('/')));

function base(overrides = null) {
  let state = clone(fixturesBase.parent_state_template);
  if (overrides) overrides(state);
  state = rt.sealState(state);
  return rt.createVersionLedger(state);
}
function currentBindings(ledger) { return clone(ledger.state_snapshots[ledger.current_snapshot_id].active_version_bindings); }
function findNode(ledger, type, objectId, objectVersion) {
  return Object.values(ledger.object_version_nodes).find(n => n.object_type === type && n.object_id === objectId && String(n.object_version) === String(objectVersion)) || null;
}
function manuscriptPayload(version = 'V2', digestChar = 'b') {
  return {
    manuscript_id: 'MANUSCRIPT-001', version_id: version, artifact_digest: digestChar.repeat(64), authority_state: 'CANONICAL',
    parent_version_ref: 'MANUSCRIPT-001:V1', change_set_ref: `CHANGE-${version}`, created_by: 'BOOK_SYSTEM_PARENT',
    created_at: `2026-09-09T00:0${String(version).replace(/\D/g, '') || '2'}:00Z`,
  };
}
function nodeForPayload(type, payload) {
  const meta = rt.GOVERNED[type];
  return rt.nodeId(type, String(payload[meta.id]), String(payload[meta.version]), rt.digest(payload));
}
function successorRequest(state, ledger, proposed, bindings, id = 'REQ-SUCCESSOR-001', idem = 'IDEM-SUCCESSOR-001', actor = 'PARENT_SYSTEM', lifecycleReceipt = null) {
  return {
    request_id: id, idempotency_key: idem, actor_class: actor,
    expected_state_version: state.state_version, expected_state_digest: state.state_digest,
    expected_ledger_version: ledger.ledger_version, expected_ledger_digest: rt.digestLedger(ledger),
    proposed_parent_state: clone(proposed), active_version_bindings: clone(bindings), evidence_refs: ['EVIDENCE:CURRENT-001'], author_decision_refs: [], lifecycle_transition_receipt: lifecycleReceipt,
  };
}
function prepareV2(state, ledger, id = 'REQ-V2-001', idem = 'IDEM-V2-001') {
  const payload = manuscriptPayload('V2', 'b');
  const proposed = clone(state);
  proposed.manuscripts.push(payload);
  proposed.active.canonical_manuscript_ref = 'MANUSCRIPT-001:V2';
  const bindings = currentBindings(ledger);
  bindings.canonical_manuscript_ref = nodeForPayload('MANUSCRIPT_MANIFEST', payload);
  return { payload, proposed, bindings, request: successorRequest(state, ledger, proposed, bindings, id, idem) };
}
function withV2() {
  const initial = base();
  const initialSnapshot = initial.version_ledger.current_snapshot_id;
  const prepared = prepareV2(initial.parent_state, initial.version_ledger);
  const result = rt.commitSuccessor({ parentState: initial.parent_state, versionLedger: initial.version_ledger, request: prepared.request });
  return { initial, initialSnapshot, prepared, result };
}
function restoreRequest(state, ledger, target, patch = {}) {
  const current = currentBindings(ledger);
  const changed = Object.keys(target.active_version_bindings).filter(p => current[p] !== target.active_version_bindings[p]);
  const revalidation = {
    rights_privacy_current: true,
    critical_evidence_resolved: true,
    dependency_revalidation_refs: changed.length ? ['REVALIDATION:CURRENT-001'] : [],
    binding_checks: changed.map(pointer => ({ pointer, target_node_id: target.active_version_bindings[pointer], evidence_refs: [`REVALIDATE:${pointer}`] })),
    author_decision_required: false,
    author_decision_refs: [],
    lifecycle_transition_receipt: null,
    ...(patch.revalidation || {}),
  };
  return {
    request_id: patch.request_id || 'REQ-RESTORE-001', idempotency_key: patch.idempotency_key || 'IDEM-RESTORE-001', actor_class: patch.actor_class || 'PARENT_SYSTEM',
    expected_state_version: patch.expected_state_version ?? state.state_version, expected_state_digest: patch.expected_state_digest || state.state_digest,
    expected_ledger_version: patch.expected_ledger_version ?? ledger.ledger_version, expected_ledger_digest: patch.expected_ledger_digest || rt.digestLedger(ledger),
    target_state_version: patch.target_state_version ?? target.state_version, target_state_digest: patch.target_state_digest || target.state_digest,
    mode: patch.mode || 'RESTORE_CONTENT', revalidation,
  };
}
function authorizedSuccessor(state, ledger, kind, mutate, id = 'REQ-AUTH-001', idem = 'IDEM-AUTH-001') {
  let post = clone(state); delete post.state_digest; post.state_version = state.state_version + 1; mutate(post); post = rt.sealState(post);
  const receipt = { receipt_id: `AUTHORITY-RECEIPT-${id}`, pre_parent_state_version: state.state_version, pre_parent_state_digest: state.state_digest, post_parent_state_version: post.state_version, post_parent_state_digest: post.state_digest };
  return { post, receipt, request: { request_id:id, idempotency_key:idem, actor_class:'PARENT_SYSTEM', expected_state_version:state.state_version, expected_state_digest:state.state_digest, expected_ledger_version:ledger.ledger_version, expected_ledger_digest:rt.digestLedger(ledger), authority_kind:kind, authority_receipt:receipt, committed_parent_state:post, active_version_bindings:currentBindings(ledger) } };
}
function recordAuthorized(ctx, prepared) { return rt.recordAuthorizedParentSuccessor({ parentState:ctx.parent_state, versionLedger:ctx.version_ledger, request:prepared.request }); }

const tests = {};
function test(id, fn) { tests[id] = fn; }

test('VR001_INITIAL_LEDGER_CREATES_EXACT_SNAPSHOT',()=>{const x=base();const s=x.version_ledger.state_snapshots[x.version_ledger.current_snapshot_id];assert(s.state_digest===x.parent_state.state_digest&&s.state_version===x.parent_state.state_version,'INITIAL_SNAPSHOT_IDENTITY_MISMATCH');});
test('VR002_MANUSCRIPT_SUCCESSOR_COMMIT',()=>{const x=withV2();assert(x.result.parent_state.active.canonical_manuscript_ref==='MANUSCRIPT-001:V2'&&x.result.parent_state.state_version===x.initial.parent_state.state_version+1,'V2_COMMIT_FAILED');});
test('VR003_STATE_PREDECESSOR_LINEAGE',()=>{const x=withV2();const s=x.result.version_ledger.state_snapshots[x.result.version_ledger.current_snapshot_id];assert(s.predecessor_snapshot_id===x.initialSnapshot&&s.predecessor_state_digest===x.initial.parent_state.state_digest,'STATE_PREDECESSOR_MISMATCH');});
test('VR004_OBJECT_PREDECESSOR_LINEAGE',()=>{const x=withV2();const v1=findNode(x.result.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V1');const v2=findNode(x.result.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V2');assert(v1&&v2&&v2.predecessor_node_id===v1.node_id,'OBJECT_PREDECESSOR_MISMATCH');});
test('VR005_STALE_PARENT_VERSION_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);p.request.expected_state_version-=1;expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'STALE_PARENT_WRITE');});
test('VR006_STALE_PARENT_DIGEST_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);p.request.expected_state_digest='c'.repeat(64);expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'STALE_PARENT_WRITE');});
test('VR007_STALE_LEDGER_VERSION_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);p.request.expected_ledger_version-=1;expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'STALE_LEDGER_WRITE');});
test('VR008_STALE_LEDGER_DIGEST_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);p.request.expected_ledger_digest='d'.repeat(64);expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'STALE_LEDGER_WRITE');});
test('VR009_PROVIDER_AUTHORITY_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);p.request.actor_class='PROSE_SYSTEM';expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'VERSION_AUTHORITY_DENIED');});
test('VR010_IMMUTABLE_OBJECT_VERSION_CONFLICT',()=>{const x=base();const proposed=clone(x.parent_state);proposed.manuscripts[0].artifact_digest='c'.repeat(64);const bindings=currentBindings(x.version_ledger);bindings.canonical_manuscript_ref=nodeForPayload('MANUSCRIPT_MANIFEST',proposed.manuscripts[0]);const r=successorRequest(x.parent_state,x.version_ledger,proposed,bindings,'REQ-CONFLICT-001','IDEM-CONFLICT-001');expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:r}),'IMMUTABLE_OBJECT_VERSION_CONFLICT');});
test('VR011_ACTIVE_BINDING_MISMATCH_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);p.request.active_version_bindings.canonical_manuscript_ref=currentBindings(x.version_ledger).canonical_manuscript_ref;expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'ACTIVE_BINDING_TARGET_MISMATCH');});
test('VR012_APPEND_ONLY_REMOVAL_REJECTED',()=>{const x=base();const p=clone(x.parent_state);p.research_evidence_links=[];const r=successorRequest(x.parent_state,x.version_ledger,p,currentBindings(x.version_ledger),'REQ-REMOVE-001','IDEM-REMOVE-001');expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:r}),'APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN');});
test('VR013_APPEND_ONLY_MUTATION_REJECTED',()=>{const x=base();const p=clone(x.parent_state);p.research_evidence_links[0].provenance='MUTATED';const r=successorRequest(x.parent_state,x.version_ledger,p,currentBindings(x.version_ledger),'REQ-MUTATE-001','IDEM-MUTATE-001');expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:r}),'APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN');});
test('VR014_FROZEN_CONTENT_MUTATION_REJECTED',()=>{const x=base(s=>{s.book_project.status='EXPORT_FROZEN';});const p=prepareV2(x.parent_state,x.version_ledger);expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request}),'FROZEN_OR_PUBLISHED_CONTENT_MUTATION_FORBIDDEN');});
test('VR015_STATUS_CHANGE_WITHOUT_LIFECYCLE_AUTHORITY_REJECTED',()=>{const x=base();const p=clone(x.parent_state);p.book_project.status='STRUCTURAL_REVIEW';const r=successorRequest(x.parent_state,x.version_ledger,p,currentBindings(x.version_ledger),'REQ-STATUS-001','IDEM-STATUS-001');expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:r}),'LIFECYCLE_STATUS_CHANGE_REQUIRES_QUALIFIED_ENGINE_FIRST');});
test('VR016_DIRECT_STATUS_CHANGE_REJECTED_EVEN_WITH_RECEIPT',()=>{const x=base();const p=clone(x.parent_state);p.book_project.status='STRUCTURAL_REVIEW';const fake={transition_receipt_id:'FAKE',pre_parent_state_version:x.parent_state.state_version,pre_parent_state_digest:x.parent_state.state_digest,from_status:'DRAFTING',to_status:'STRUCTURAL_REVIEW'};const r=successorRequest(x.parent_state,x.version_ledger,p,currentBindings(x.version_ledger),'REQ-STATUS-002','IDEM-STATUS-002','PARENT_SYSTEM',fake);expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:r}),'LIFECYCLE_STATUS_CHANGE_REQUIRES_QUALIFIED_ENGINE_FIRST');});
test('VR017_IDEMPOTENT_REPLAY_NO_SECOND_COMMIT',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);const first=rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request});const replay=rt.commitSuccessor({parentState:first.parent_state,versionLedger:first.version_ledger,request:p.request});assert(replay.disposition==='REPLAY'&&Object.keys(replay.version_ledger.state_snapshots).length===Object.keys(first.version_ledger.state_snapshots).length,'REPLAY_CREATED_SECOND_COMMIT');});
test('VR018_IDEMPOTENCY_KEY_CONFLICT_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);const first=rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request});const changed=clone(p.request);changed.evidence_refs=['EVIDENCE:DIFFERENT'];expectError(()=>rt.commitSuccessor({parentState:first.parent_state,versionLedger:first.version_ledger,request:changed}),'IDEMPOTENCY_KEY_CONFLICT');});
test('VR019_REQUEST_ID_CONFLICT_REJECTED',()=>{const x=base();const p=prepareV2(x.parent_state,x.version_ledger);const first=rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:p.request});const proposed=clone(first.parent_state);const r=successorRequest(first.parent_state,first.version_ledger,proposed,currentBindings(first.version_ledger),p.request.request_id,'IDEM-DIFFERENT-001');expectError(()=>rt.commitSuccessor({parentState:first.parent_state,versionLedger:first.version_ledger,request:r}),'REQUEST_ID_CONFLICT');});
test('VR020_RESTORE_CONTENT_AS_NEW_SUCCESSOR',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const out=rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:restoreRequest(x.result.parent_state,x.result.version_ledger,t)});assert(out.parent_state.state_version===x.result.parent_state.state_version+1&&out.parent_state.active.canonical_manuscript_ref==='MANUSCRIPT-001:V1'&&out.receipt.restored_from_snapshot_id===t.snapshot_id,'RESTORE_NOT_NEW_SUCCESSOR');});
test('VR021_RESTORE_TARGET_DIGEST_MISMATCH_REJECTED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{target_state_digest:'f'.repeat(64)});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_TARGET_NOT_FOUND');});
test('VR022_RESTORE_RIGHTS_NOT_CURRENT_REJECTED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{rights_privacy_current:false}});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_RIGHTS_PRIVACY_NOT_CURRENT');});
test('VR023_RESTORE_CRITICAL_EVIDENCE_UNRESOLVED_REJECTED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{critical_evidence_resolved:false}});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_CRITICAL_EVIDENCE_UNRESOLVED');});
test('VR024_RESTORE_DEPENDENCY_REVALIDATION_REQUIRED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{dependency_revalidation_refs:[]}});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_DEPENDENCY_REVALIDATION_REQUIRED');});
test('VR025_RESTORE_BINDING_CHECK_REQUIRED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{binding_checks:[]}});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_BINDING_CHECK_REQUIRED');});
test('VR026_RESTORE_AUTHOR_DECISION_REQUIRED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{author_decision_required:true,author_decision_refs:[]}});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_AUTHOR_DECISION_REQUIRED');});
test('VR027_RESTORE_PENDING_AUTHOR_DECISION_REJECTED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{author_decision_required:true,author_decision_refs:['AUTHOR-PENDING-001']}});expectError(()=>rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r}),'RESTORE_AUTHOR_DECISION_NOT_APPROVED');});
test('VR028_RESTORE_APPROVED_AUTHOR_DECISION_ALLOWED',()=>{const x=withV2();const t=x.result.version_ledger.state_snapshots[x.initialSnapshot];const r=restoreRequest(x.result.parent_state,x.result.version_ledger,t,{revalidation:{author_decision_required:true,author_decision_refs:['AUTHOR-APPROVED-001']}});const out=rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:r});assert(out.disposition==='COMMITTED','APPROVED_AUTHOR_RESTORE_NOT_COMMITTED');});
test('VR029_FROZEN_RESTORE_REQUIRES_REOPEN',()=>{const x=withV2();const p=authorizedSuccessor(x.result.parent_state,x.result.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='EXPORT_FROZEN';},'REQ-FREEZE-001','IDEM-FREEZE-001');const frozen=recordAuthorized({parent_state:x.result.parent_state,version_ledger:x.result.version_ledger},p);const t=frozen.version_ledger.state_snapshots[x.initialSnapshot];expectError(()=>rt.restoreAsNewSuccessor({parentState:frozen.parent_state,versionLedger:frozen.version_ledger,request:restoreRequest(frozen.parent_state,frozen.version_ledger,t)}),'FROZEN_OR_PUBLISHED_REOPEN_REQUIRED');});
test('VR030_FULL_STATE_STATUS_CHANGE_REQUIRES_LIFECYCLE_FIRST',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-LIFE-030','IDEM-LIFE-030');const moved=recordAuthorized(x,p);const t=moved.version_ledger.state_snapshots[x.version_ledger.current_snapshot_id];const r=restoreRequest(moved.parent_state,moved.version_ledger,t,{mode:'RESTORE_FULL_STATE'});expectError(()=>rt.restoreAsNewSuccessor({parentState:moved.parent_state,versionLedger:moved.version_ledger,request:r}),'FULL_STATE_RESTORE_REQUIRES_PRIOR_LIFECYCLE_TRANSITION');});
test('VR031_RESTORE_PRESERVES_CURRENT_APPEND_ONLY_HISTORY',()=>{const x=withV2();const proposed=clone(x.result.parent_state);proposed.research_evidence_links.push({link_id:'RESEARCH-002',claim_or_evidence_ref:'CLAIM-002',target_book_object_ref:'MANUSCRIPT-001:V2',freshness_state:'CURRENT',conflict_state:'NONE',provenance:'SOURCE-002',rights_class:'AUTHORIZED'});const req=successorRequest(x.result.parent_state,x.result.version_ledger,proposed,currentBindings(x.result.version_ledger),'REQ-HISTORY-001','IDEM-HISTORY-001');const withHistory=rt.commitSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:req});const t=withHistory.version_ledger.state_snapshots[x.initialSnapshot];const out=rt.restoreAsNewSuccessor({parentState:withHistory.parent_state,versionLedger:withHistory.version_ledger,request:restoreRequest(withHistory.parent_state,withHistory.version_ledger,t)});assert(out.parent_state.research_evidence_links.some(e=>e.link_id==='RESEARCH-002'),'CURRENT_HISTORY_LOST_ON_RESTORE');});
test('VR032_REFORWARD_TO_LATER_HISTORICAL_SNAPSHOT',()=>{const x=withV2();const v2id=x.result.version_ledger.current_snapshot_id;const t0=x.result.version_ledger.state_snapshots[x.initialSnapshot];const back=rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:restoreRequest(x.result.parent_state,x.result.version_ledger,t0)});const t2=back.version_ledger.state_snapshots[v2id];const out=rt.restoreAsNewSuccessor({parentState:back.parent_state,versionLedger:back.version_ledger,request:restoreRequest(back.parent_state,back.version_ledger,t2,{request_id:'REQ-REFWD-001',idempotency_key:'IDEM-REFWD-001'})});assert(out.parent_state.active.canonical_manuscript_ref==='MANUSCRIPT-001:V2','REFORWARD_FAILED');});
test('VR033_BRANCH_DIVERGENCE_PREDECESSOR_USES_RESTORED_ACTIVE',()=>{const x=withV2();const t0=x.result.version_ledger.state_snapshots[x.initialSnapshot];const back=rt.restoreAsNewSuccessor({parentState:x.result.parent_state,versionLedger:x.result.version_ledger,request:restoreRequest(x.result.parent_state,x.result.version_ledger,t0)});const payload=manuscriptPayload('V3','c');const proposed=clone(back.parent_state);proposed.manuscripts.push(payload);proposed.active.canonical_manuscript_ref='MANUSCRIPT-001:V3';const bindings=currentBindings(back.version_ledger);bindings.canonical_manuscript_ref=nodeForPayload('MANUSCRIPT_MANIFEST',payload);const req=successorRequest(back.parent_state,back.version_ledger,proposed,bindings,'REQ-BRANCH-001','IDEM-BRANCH-001');const out=rt.commitSuccessor({parentState:back.parent_state,versionLedger:back.version_ledger,request:req});const v1=findNode(out.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V1');const v3=findNode(out.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V3');assert(v3.predecessor_node_id===v1.node_id,'BRANCH_PREDECESSOR_NOT_RESTORED_ACTIVE');});
test('VR034_FAILED_MUTATION_LEAVES_INPUTS_UNCHANGED',()=>{const x=base();const bs=stable(x.parent_state),bl=stable(x.version_ledger);const p=clone(x.parent_state);p.research_evidence_links=[];const r=successorRequest(x.parent_state,x.version_ledger,p,currentBindings(x.version_ledger),'REQ-ATOMIC-001','IDEM-ATOMIC-001');expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:r}),'APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN');assert(stable(x.parent_state)===bs&&stable(x.version_ledger)===bl,'FAILED_MUTATION_CHANGED_INPUTS');});
test('VR035_STATE_DIGEST_TAMPER_REJECTED',()=>{const x=base();const bad=clone(x.parent_state);bad.book_project.status='FINALIZATION';expectError(()=>rt.validateParentState(bad),'PARENT_STATE_DIGEST_MISMATCH');});
test('VR036_RECEIPT_OUTBOX_ATOMIC_IDENTITY',()=>{const x=withV2();const rs=Object.values(x.result.version_ledger.version_receipts);assert(rs.length===1&&x.result.version_ledger.outbox_entries.length===1&&rs[0].post_ledger_digest===rt.digestLedger(x.result.version_ledger)&&x.result.version_ledger.outbox_entries[0].payload_ref===rs[0].receipt_id,'RECEIPT_OUTBOX_IDENTITY_MISMATCH');});
test('VR037_GOVERNED_OBJECT_SUCCESSOR_LINEAGE',()=>{const x=base();const proposed=clone(x.parent_state);const bindings=currentBindings(x.version_ledger);const specs=[['GOVERNING_BRIEF','governing_briefs'],['CANON_MANIFEST','canon_manifests'],['STORY_BIBLE','story_bibles'],['BOOK_PLAN','book_plans']];for(const [type,collection] of specs){const p=clone(proposed[collection][0]);p.version=2;if(type==='GOVERNING_BRIEF')p.voice_goals=['DISTINCT','PRECISE'];if(type==='CANON_MANIFEST')p.facts=[...p.facts,'FACT-2'];if(type==='STORY_BIBLE')p.open_questions=['QUESTION-2'];if(type==='BOOK_PLAN')p.chapter_refs=[...p.chapter_refs,'CHAPTER-2'];proposed[collection].push(p);bindings[rt.GOVERNED[type].pointer]=nodeForPayload(type,p);}const req=successorRequest(x.parent_state,x.version_ledger,proposed,bindings,'REQ-OBJECTS-001','IDEM-OBJECTS-001');const out=rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:req});for(const [type] of specs){const meta=rt.GOVERNED[type],id=proposed[meta.collection][0][meta.id],v1=findNode(out.version_ledger,type,String(id),'1'),v2=findNode(out.version_ledger,type,String(id),'2');assert(v1&&v2&&v2.predecessor_node_id===v1.node_id,'GOVERNED_OBJECT_LINEAGE_FAILED',type);}});
test('VR038_MULTIPLE_NEW_VERSIONS_SAME_FAMILY_REJECTED',()=>{const x=base(),p2=manuscriptPayload('V2','b'),p3=manuscriptPayload('V3','c'),proposed=clone(x.parent_state);proposed.manuscripts.push(p2,p3);proposed.active.canonical_manuscript_ref='MANUSCRIPT-001:V3';const bindings=currentBindings(x.version_ledger);bindings.canonical_manuscript_ref=nodeForPayload('MANUSCRIPT_MANIFEST',p3);const req=successorRequest(x.parent_state,x.version_ledger,proposed,bindings,'REQ-MULTI-001','IDEM-MULTI-001');expectError(()=>rt.commitSuccessor({parentState:x.parent_state,versionLedger:x.version_ledger,request:req}),'MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_COMMIT');});
test('VR039_INITIAL_MULTI_VERSION_WITHOUT_LINEAGE_REJECTED',()=>{let s=clone(fixturesBase.parent_state_template);const p2=manuscriptPayload('V2','b');s.manuscripts.push(p2);s.active.canonical_manuscript_ref='MANUSCRIPT-001:V2';s=rt.sealState(s);const bindings={};for(const [type,meta] of Object.entries(rt.GOVERNED)){const item=s[meta.collection].find(v=>type!=='MANUSCRIPT_MANIFEST'||v.version_id==='V2')||s[meta.collection][0];bindings[meta.pointer]=nodeForPayload(type,item);}expectError(()=>rt.createVersionLedger(s,{active_version_bindings:bindings}),'INITIAL_LINEAGE_REQUIRED');});
test('VR040_ACTIVE_POINTER_AMBIGUITY_REJECTED',()=>{let s=clone(fixturesBase.parent_state_template);s.manuscripts.push(manuscriptPayload('V2','b'));s.active.canonical_manuscript_ref='MANUSCRIPT-001';s=rt.sealState(s);expectError(()=>rt.createVersionLedger(s),'ACTIVE_POINTER_VERSION_AMBIGUOUS');});
test('VR041_AUTHORIZED_LIFECYCLE_SUCCESSOR_RECORDED_WITHOUT_REEXECUTION',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-AUTH-LIFE-001','IDEM-AUTH-LIFE-001');const r=recordAuthorized(x,p);assert(r.parent_state.state_digest===p.post.state_digest&&r.parent_state.book_project.status==='STRUCTURAL_REVIEW'&&r.receipt.authority_kind==='LIFECYCLE_TRANSITION','AUTHORIZED_LIFECYCLE_RECORD_FAILED');});
test('VR042_AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH_REJECTED',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-AUTH-PRE-001','IDEM-AUTH-PRE-001');p.request.authority_receipt.pre_parent_state_digest='a'.repeat(64);expectError(()=>recordAuthorized(x,p),'PARENT_AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH');});
test('VR043_AUTHORITY_RECEIPT_POST_IDENTITY_MISMATCH_REJECTED',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-AUTH-POST-001','IDEM-AUTH-POST-001');p.request.authority_receipt.post_parent_state_digest='a'.repeat(64);expectError(()=>recordAuthorized(x,p),'PARENT_AUTHORITY_RECEIPT_POST_IDENTITY_MISMATCH');});
test('VR044_UNKNOWN_AUTHORITY_KIND_REJECTED',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-AUTH-KIND-001','IDEM-AUTH-KIND-001');p.request.authority_kind='UNKNOWN_AUTHORITY';expectError(()=>recordAuthorized(x,p),'UNKNOWN_PARENT_AUTHORITY_KIND');});
test('VR045_AUTHORIZED_SUCCESSOR_REPLAY_NO_SECOND_SNAPSHOT',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-AUTH-REPLAY-001','IDEM-AUTH-REPLAY-001');const first=recordAuthorized(x,p);const count=Object.keys(first.version_ledger.state_snapshots).length;const replay=rt.recordAuthorizedParentSuccessor({parentState:first.parent_state,versionLedger:first.version_ledger,request:p.request});assert(replay.disposition==='REPLAY'&&Object.keys(replay.version_ledger.state_snapshots).length===count,'AUTHORIZED_REPLAY_CREATED_SNAPSHOT');});
test('VR046_AUTHORIZED_SUCCESSOR_APPEND_ONLY_MUTATION_REJECTED',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'AUTHOR_DECISION',s=>{s.research_evidence_links[0].provenance='MUTATED';},'REQ-AUTH-HISTORY-001','IDEM-AUTH-HISTORY-001');expectError(()=>recordAuthorized(x,p),'APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN');});
test('VR047_INTEGRATION_RUNTIME_SUCCESSOR_RECORDED_WITH_ACTIVE_BINDINGS_UNCHANGED',()=>{const x=base();const before=currentBindings(x.version_ledger);const p=authorizedSuccessor(x.parent_state,x.version_ledger,'INTEGRATION_RUNTIME',s=>{s.integration_proposals.push({proposal_id:'PROPOSAL-002',source_project_or_lane:'RESEARCH_SERVICE',source_subject_sha:'2222222222222222222222222222222222222222',capability_id:'RESEARCH_AND_EVIDENCE.ACQUIRE_BOUNDED_EVIDENCE',admission_state:'PROPOSED'});},'REQ-AUTH-RUNTIME-001','IDEM-AUTH-RUNTIME-001');const r=recordAuthorized(x,p);assert(stable(r.receipt.active_version_bindings)===stable(before)&&r.parent_state.integration_proposals.length===x.parent_state.integration_proposals.length+1,'RUNTIME_SUCCESSOR_RECORD_FAILED');});
test('VR048_AUTHORIZED_SUCCESSOR_POST_STATE_BYTES_PRESERVED_EXACTLY',()=>{const x=base();const p=authorizedSuccessor(x.parent_state,x.version_ledger,'LIFECYCLE_TRANSITION',s=>{s.book_project.status='STRUCTURAL_REVIEW';},'REQ-AUTH-BYTES-001','IDEM-AUTH-BYTES-001');const r=recordAuthorized(x,p);assert(stable(r.parent_state)===stable(p.post)&&r.parent_state.state_digest===p.post.state_digest,'AUTHORIZED_POST_STATE_CHANGED');});

function verifyArchitecture(){
  assert(contract.boundary_id==='BOOK-SYSTEM-VERSION-AND-ROLLBACK-001','CONTRACT_ID_MISMATCH');
  assert(contract.standing.includes('EXECUTABLE_IMPLEMENTATION_PENDING_QUALIFICATION'),'CONTRACT_STANDING_MISMATCH');
  assert(research.standing.includes('RESEARCH_COMPLETE'),'RESEARCH_NOT_CLOSED');
  assert(forensic.standing.includes('NO_DUPLICATE_ENGINE_REQUIRED'),'FORENSIC_MAP_NOT_CLOSED');
  assert(lifecycleClarification.standing.includes('NO_SECOND_LIFECYCLE_AUTHORITY'),'LIFECYCLE_CLARIFICATION_MISSING');
  assert(authorityClarification.standing.includes('AUTHORIZED_PARENT_SUCCESSOR_INGEST_BOUND'),'AUTHORITY_INGEST_CLARIFICATION_MISSING');
  assert(fixtures.fixture_version===2&&fixtures.cases.length===48,'FIXTURE_MATRIX_NOT_48');
  assert(typeof rt.recordAuthorizedParentSuccessor==='function','AUTHORIZED_SUCCESSOR_RUNTIME_MISSING');
}

function main(){
  const head=gitHead();verifyArchitecture();const results=[];
  for(const spec of fixtures.cases){const fn=tests[spec.id];if(typeof fn!=='function')fail('TEST_IMPLEMENTATION_MISSING',spec.id);try{fn();results.push({id:spec.id,result:'PASS'});}catch(error){results.push({id:spec.id,result:'FAIL',code:error&&error.code?error.code:'UNCAUGHT',detail:String(error&&error.message?error.message:error)});}}
  const failed=results.filter(r=>r.result!=='PASS');
  const evidence={qualification_id:'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',subject_sha:head,checkout_sha:head,exact_sha_match:true,result_class:failed.length?'FAIL':'PASS',fixture_version:fixtures.fixture_version,total_cases:results.length,passed_cases:results.length-failed.length,failed_cases:failed.length,public_entrypoint:paths.entrypoint,authority_boundary:{canonical_commit_actor:'PARENT_SYSTEM',direct_lifecycle_status_change:false,authorized_parent_successor_ingest:true,restore_as_new_successor:true,historical_mutation:false,author_approval_synthesis:false,publication_authority_synthesis:false,document_engine_authority:false,prose_authority_absorbed:false},file_digests:Object.fromEntries(Object.entries(paths).map(([name,repoPath])=>[name,gitBlobSha256(repoPath)])),results};
  writeEvidence('BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-qualification.json',evidence);writeEvidence('BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-results.txt',results.map(r=>`${r.result}\t${r.id}${r.code?`\t${r.code}`:''}`).join('\n')+'\n');
  console.log(JSON.stringify({qualification_id:evidence.qualification_id,subject_sha:head,result_class:evidence.result_class,passed:evidence.passed_cases,total:evidence.total_cases,evidence_dir:evidenceDir},null,2));
  if(failed.length){for(const item of failed)console.error(`${item.id}: ${item.code}: ${item.detail}`);process.exit(1);}
}
main();
