'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-version-rollback-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const files = {
  contract: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001.json',
  research: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-PREIMPLEMENTATION-RESEARCH-001.json',
  fixtures: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json',
  entrypoint: 'system-master/book-system/version-and-rollback.js',
  core: 'system-master/book-system/version-and-rollback-core.js',
  qualifier: '.github/scripts/book-system-version-and-rollback-001-qualify.js',
};

const contract = JSON.parse(fs.readFileSync(path.join(workspace, files.contract), 'utf8'));
const research = JSON.parse(fs.readFileSync(path.join(workspace, files.research), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(workspace, files.fixtures), 'utf8'));
const rt = require(path.join(workspace, files.entrypoint));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stable(v) { return rt.stableStringify(v); }
function assert(ok, code, detail = '') { if (!ok) throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code }); }
function expectError(fn, code) {
  try { fn(); } catch (e) { assert(e && e.code === code, 'WRONG_ERROR_CODE', `expected=${code}:actual=${e && e.code}`); return; }
  assert(false, 'EXPECTED_ERROR_NOT_THROWN', code);
}
function git(args) { return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true }); }
function gitHead() { const r = git(['rev-parse', 'HEAD']); return r.status === 0 ? r.stdout.trim() : 'UNAVAILABLE'; }
function fileSha256(repoPath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, repoPath))).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(evidenceDir, name), JSON.stringify(value, null, 2), 'utf8'); }

function setup(customState = null, options = {}) {
  const initial = rt.createVersionLedger(customState || fixtures.parent_state_template, options);
  return { parent: initial.parent_state, ledger: initial.version_ledger };
}
function bindingMap(state) {
  const out = {};
  for (const r of rt.objectRecords(state)) {
    const ref = state.active[r.meta.pointer];
    if (ref === r.object_id || ref === `${r.object_id}:${r.object_version}`) {
      if (out[r.meta.pointer]) throw Object.assign(new Error(`AMBIGUOUS:${r.meta.pointer}`), { code: 'TEST_BINDING_AMBIGUOUS' });
      out[r.meta.pointer] = r.node_id;
    }
  }
  return out;
}
function manuscriptV(state, version, hexChar) {
  const next = clone(state);
  delete next.state_digest;
  next.manuscripts.push({
    manuscript_id: 'MANUSCRIPT-001', version_id: version, artifact_digest: hexChar.repeat(64), authority_state: 'CANONICAL',
    parent_version_ref: next.active.canonical_manuscript_ref, change_set_ref: `CHANGE-${version}`, created_by: 'BOOK_SYSTEM_PARENT', created_at: `2026-09-09T00:0${String(version).replace(/\D/g, '') || '2'}:00Z`,
  });
  next.active.canonical_manuscript_ref = `MANUSCRIPT-001:${version}`;
  return next;
}
function briefV2(state) {
  const next = clone(state); delete next.state_digest;
  next.governing_briefs.push({ brief_id: 'BRIEF-001', version: 2, author_intent: 'Write the intended book with explicit revision lineage', form: 'NOVEL', genre: 'SPECULATIVE', audience: 'ADULT', voice_goals: ['DISTINCT'], hard_constraints: ['NO_SILENT_CANON_CHANGE'] });
  next.active.governing_brief_ref = 'BRIEF-001:2';
  next.book_project.governing_brief_ref = 'BRIEF-001:2';
  return next;
}
function successorRequest(parent, ledger, proposed, overrides = {}) {
  return {
    request_id: 'VR-REQ-001', idempotency_key: 'VR-IDEM-001', actor_class: 'PARENT_SYSTEM',
    expected_state_version: parent.state_version, expected_state_digest: parent.state_digest,
    expected_ledger_version: ledger.ledger_version, expected_ledger_digest: rt.digestLedger(ledger),
    proposed_parent_state: proposed, active_version_bindings: bindingMap(proposed), evidence_refs: ['EVIDENCE-001'], author_decision_refs: [], lifecycle_transition_receipt: null,
    ...overrides,
  };
}
function commitV2(extra = null) {
  const s = setup();
  const proposed = manuscriptV(s.parent, 'V2', 'b');
  if (extra) extra(proposed);
  const request = successorRequest(s.parent, s.ledger, proposed);
  const out = rt.commitSuccessor({ parentState: s.parent, versionLedger: s.ledger, request });
  return { initial: s, request, out };
}
function targetSnapshot(ledger, state) {
  return Object.values(ledger.state_snapshots).find(x => x.state_version === state.state_version && x.state_digest === state.state_digest);
}
function restoreRequest(parent, ledger, target, overrides = {}) {
  const current = ledger.state_snapshots[ledger.current_snapshot_id];
  const changedPointers = Object.keys(target.active_version_bindings).filter(p => current.active_version_bindings[p] !== target.active_version_bindings[p]);
  return {
    request_id: 'VR-RESTORE-001', idempotency_key: 'VR-RESTORE-IDEM-001', actor_class: 'PARENT_SYSTEM',
    expected_state_version: parent.state_version, expected_state_digest: parent.state_digest,
    expected_ledger_version: ledger.ledger_version, expected_ledger_digest: rt.digestLedger(ledger),
    target_state_version: target.state_version, target_state_digest: target.state_digest, mode: 'RESTORE_CONTENT',
    revalidation: {
      rights_privacy_current: true, critical_evidence_resolved: true, dependency_revalidation_refs: ['DEPENDENCY-REVALIDATED-001'],
      binding_checks: changedPointers.map(pointer => ({ pointer, target_node_id: target.active_version_bindings[pointer], evidence_refs: [`BINDING-EVIDENCE:${pointer}`] })),
      author_decision_required: false, author_decision_refs: [], lifecycle_transition_receipt: null,
    },
    ...overrides,
  };
}
function nodeFor(ledger, type, objectId, version) { return Object.values(ledger.object_version_nodes).find(n => n.object_type === type && n.object_id === objectId && String(n.object_version) === String(version)); }

const tests = {};
function test(id, fn) { tests[id] = fn; }

test('VR001_INITIAL_LEDGER_CREATES_EXACT_SNAPSHOT', () => { const s = setup(); const snap = s.ledger.state_snapshots[s.ledger.current_snapshot_id]; assert(snap.state_digest === s.parent.state_digest && snap.state_version === s.parent.state_version, 'INITIAL_SNAPSHOT_IDENTITY'); assert(Object.keys(snap.active_version_bindings).length === 5, 'INITIAL_BINDING_COUNT'); });
test('VR002_MANUSCRIPT_SUCCESSOR_COMMIT', () => { const x = commitV2(); assert(x.out.disposition === 'COMMITTED' && x.out.parent_state.state_version === x.initial.parent.state_version + 1, 'SUCCESSOR_COMMIT_FAIL'); assert(x.out.parent_state.active.canonical_manuscript_ref === 'MANUSCRIPT-001:V2', 'SUCCESSOR_POINTER_FAIL'); });
test('VR003_STATE_PREDECESSOR_LINEAGE', () => { const x = commitV2(); const post = x.out.version_ledger.state_snapshots[x.out.version_ledger.current_snapshot_id]; assert(post.predecessor_snapshot_id === x.initial.ledger.current_snapshot_id && post.predecessor_state_digest === x.initial.parent.state_digest, 'STATE_PREDECESSOR_FAIL'); });
test('VR004_OBJECT_PREDECESSOR_LINEAGE', () => { const x = commitV2(); const v1 = nodeFor(x.out.version_ledger, 'MANUSCRIPT_MANIFEST', 'MANUSCRIPT-001', 'V1'); const v2 = nodeFor(x.out.version_ledger, 'MANUSCRIPT_MANIFEST', 'MANUSCRIPT-001', 'V2'); assert(v1 && v2 && v2.predecessor_node_id === v1.node_id, 'OBJECT_PREDECESSOR_FAIL'); });
test('VR005_STALE_PARENT_VERSION_REJECTED', () => { const s = setup(); const p = manuscriptV(s.parent, 'V2', 'b'); const r = successorRequest(s.parent, s.ledger, p, { expected_state_version: 999 }); expectError(() => rt.commitSuccessor({ parentState:s.parent, versionLedger:s.ledger, request:r }), 'STALE_PARENT_WRITE'); });
test('VR006_STALE_PARENT_DIGEST_REJECTED', () => { const s = setup(); const p = manuscriptV(s.parent, 'V2', 'b'); const r = successorRequest(s.parent, s.ledger, p, { expected_state_digest: '0'.repeat(64) }); expectError(() => rt.commitSuccessor({ parentState:s.parent, versionLedger:s.ledger, request:r }), 'STALE_PARENT_WRITE'); });
test('VR007_STALE_LEDGER_VERSION_REJECTED', () => { const s = setup(); const p = manuscriptV(s.parent, 'V2', 'b'); const r = successorRequest(s.parent, s.ledger, p, { expected_ledger_version: 999 }); expectError(() => rt.commitSuccessor({ parentState:s.parent, versionLedger:s.ledger, request:r }), 'STALE_LEDGER_WRITE'); });
test('VR008_STALE_LEDGER_DIGEST_REJECTED', () => { const s = setup(); const p = manuscriptV(s.parent, 'V2', 'b'); const r = successorRequest(s.parent, s.ledger, p, { expected_ledger_digest: '0'.repeat(64) }); expectError(() => rt.commitSuccessor({ parentState:s.parent, versionLedger:s.ledger, request:r }), 'STALE_LEDGER_WRITE'); });
test('VR009_PROVIDER_AUTHORITY_REJECTED', () => { const s = setup(); const p = manuscriptV(s.parent, 'V2', 'b'); const r = successorRequest(s.parent, s.ledger, p, { actor_class:'PROSE_SYSTEM' }); expectError(() => rt.commitSuccessor({ parentState:s.parent, versionLedger:s.ledger, request:r }), 'VERSION_AUTHORITY_DENIED'); });
test('VR010_IMMUTABLE_OBJECT_VERSION_CONFLICT', () => { const s=setup(); const p=clone(s.parent); delete p.state_digest; p.manuscripts[0].change_set_ref='CHANGED-SAME-VERSION'; const r=successorRequest(s.parent,s.ledger,p); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'IMMUTABLE_OBJECT_VERSION_CONFLICT'); });
test('VR011_ACTIVE_BINDING_MISMATCH_REJECTED', () => { const s=setup(); const p=manuscriptV(s.parent,'V2','b'); const r=successorRequest(s.parent,s.ledger,p); r.active_version_bindings.canonical_manuscript_ref=s.ledger.state_snapshots[s.ledger.current_snapshot_id].active_version_bindings.canonical_manuscript_ref; expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'ACTIVE_BINDING_TARGET_MISMATCH'); });
test('VR012_APPEND_ONLY_REMOVAL_REJECTED', () => { const s=setup(); const p=clone(s.parent); delete p.state_digest; p.research_evidence_links=[]; const r=successorRequest(s.parent,s.ledger,p); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN'); });
test('VR013_APPEND_ONLY_MUTATION_REJECTED', () => { const s=setup(); const p=clone(s.parent); delete p.state_digest; p.research_evidence_links[0].rights_class='CHANGED'; const r=successorRequest(s.parent,s.ledger,p); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN'); });
test('VR014_FROZEN_CONTENT_MUTATION_REJECTED', () => { const base=clone(fixtures.parent_state_template); base.book_project.status='EXPORT_FROZEN'; const s=setup(base); const p=manuscriptV(s.parent,'V2','b'); const r=successorRequest(s.parent,s.ledger,p); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'FROZEN_OR_PUBLISHED_CONTENT_MUTATION_FORBIDDEN'); });
test('VR015_STATUS_CHANGE_WITHOUT_LIFECYCLE_RECEIPT_REJECTED', () => { const s=setup(); const p=clone(s.parent); delete p.state_digest; p.book_project.status='STRUCTURAL_REVIEW'; const r=successorRequest(s.parent,s.ledger,p); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'LIFECYCLE_TRANSITION_RECEIPT_REQUIRED'); });
test('VR016_STATUS_CHANGE_WITH_LIFECYCLE_RECEIPT_ALLOWED', () => { const s=setup(); const p=clone(s.parent); delete p.state_digest; p.book_project.status='STRUCTURAL_REVIEW'; const life={transition_receipt_id:'LIFE-001',from_status:'DRAFTING',to_status:'STRUCTURAL_REVIEW',pre_parent_state_version:s.parent.state_version,pre_parent_state_digest:s.parent.state_digest}; const r=successorRequest(s.parent,s.ledger,p,{lifecycle_transition_receipt:life}); const out=rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}); assert(out.parent_state.book_project.status==='STRUCTURAL_REVIEW','LIFECYCLE_COMMIT_FAIL'); });
test('VR017_IDEMPOTENT_REPLAY_NO_SECOND_COMMIT', () => { const x=commitV2(); const replay=rt.commitSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:x.request}); assert(replay.disposition==='REPLAY' && replay.version_ledger.ledger_version===x.out.version_ledger.ledger_version,'REPLAY_FAIL'); });
test('VR018_IDEMPOTENCY_KEY_CONFLICT_REJECTED', () => { const x=commitV2(); const p=manuscriptV(x.out.parent_state,'V3','c'); const r=successorRequest(x.out.parent_state,x.out.version_ledger,p,{request_id:'VR-REQ-002',idempotency_key:x.request.idempotency_key}); expectError(()=>rt.commitSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'IDEMPOTENCY_KEY_CONFLICT'); });
test('VR019_REQUEST_ID_CONFLICT_REJECTED', () => { const x=commitV2(); const p=manuscriptV(x.out.parent_state,'V3','c'); const r=successorRequest(x.out.parent_state,x.out.version_ledger,p,{request_id:x.request.request_id,idempotency_key:'VR-IDEM-002'}); expectError(()=>rt.commitSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'REQUEST_ID_CONFLICT'); });
test('VR020_RESTORE_CONTENT_AS_NEW_SUCCESSOR', () => { const x=commitV2(); const target=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,target); const out=rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}); assert(out.parent_state.state_version===x.out.parent_state.state_version+1 && out.parent_state.active.canonical_manuscript_ref==='MANUSCRIPT-001:V1','RESTORE_SUCCESSOR_FAIL'); assert(out.receipt.restored_from_snapshot_id===target.snapshot_id,'RESTORE_RECEIPT_TARGET_FAIL'); });
test('VR021_RESTORE_TARGET_DIGEST_MISMATCH_REJECTED', () => { const x=commitV2(); const target=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,target,{target_state_digest:'0'.repeat(64)}); expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_TARGET_NOT_FOUND'); });
test('VR022_RESTORE_RIGHTS_NOT_CURRENT_REJECTED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.rights_privacy_current=false; expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_RIGHTS_PRIVACY_NOT_CURRENT'); });
test('VR023_RESTORE_CRITICAL_EVIDENCE_UNRESOLVED_REJECTED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.critical_evidence_resolved=false; expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_CRITICAL_EVIDENCE_UNRESOLVED'); });
test('VR024_RESTORE_DEPENDENCY_REVALIDATION_REQUIRED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.dependency_revalidation_refs=[]; expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_DEPENDENCY_REVALIDATION_REQUIRED'); });
test('VR025_RESTORE_BINDING_CHECK_REQUIRED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.binding_checks=[]; expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_BINDING_CHECK_REQUIRED'); });
test('VR026_RESTORE_AUTHOR_DECISION_REQUIRED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.author_decision_required=true; r.revalidation.author_decision_refs=[]; expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_AUTHOR_DECISION_REQUIRED'); });
test('VR027_RESTORE_PENDING_AUTHOR_DECISION_REJECTED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.author_decision_required=true; r.revalidation.author_decision_refs=['AUTHOR-PENDING-001']; expectError(()=>rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}),'RESTORE_AUTHOR_DECISION_NOT_APPROVED'); });
test('VR028_RESTORE_APPROVED_AUTHOR_DECISION_ALLOWED', () => { const x=commitV2(); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); r.revalidation.author_decision_required=true; r.revalidation.author_decision_refs=['AUTHOR-APPROVED-001']; const out=rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}); assert(out.disposition==='COMMITTED','APPROVED_RESTORE_FAIL'); });
test('VR029_FROZEN_RESTORE_REQUIRES_REOPEN', () => { const base=clone(fixtures.parent_state_template); base.book_project.status='EXPORT_FROZEN'; const s=setup(base); const snap=s.ledger.state_snapshots[s.ledger.current_snapshot_id]; const r=restoreRequest(s.parent,s.ledger,snap); expectError(()=>rt.restoreAsNewSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'FROZEN_OR_PUBLISHED_REOPEN_REQUIRED'); });
test('VR030_FULL_STATE_STATUS_CHANGE_REQUIRES_LIFECYCLE_FIRST', () => { const s=setup(); const p=clone(s.parent); delete p.state_digest; p.book_project.status='STRUCTURAL_REVIEW'; const life={transition_receipt_id:'LIFE-002',from_status:'DRAFTING',to_status:'STRUCTURAL_REVIEW',pre_parent_state_version:s.parent.state_version,pre_parent_state_digest:s.parent.state_digest}; const r1=successorRequest(s.parent,s.ledger,p,{lifecycle_transition_receipt:life}); const c=rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r1}); const target=targetSnapshot(c.version_ledger,s.parent); const rr=restoreRequest(c.parent_state,c.version_ledger,target,{mode:'RESTORE_FULL_STATE'}); expectError(()=>rt.restoreAsNewSuccessor({parentState:c.parent_state,versionLedger:c.version_ledger,request:rr}),'FULL_STATE_RESTORE_REQUIRES_PRIOR_LIFECYCLE_TRANSITION'); });
test('VR031_RESTORE_PRESERVES_CURRENT_APPEND_ONLY_HISTORY', () => { const x=commitV2(p=>p.research_evidence_links.push({link_id:'RESEARCH-NEW',claim_or_evidence_ref:'CLAIM-NEW',target_book_object_ref:'MANUSCRIPT-001:V2',freshness_state:'CURRENT',conflict_state:'NONE',provenance:'SOURCE-NEW',rights_class:'AUTHORIZED'})); const t=targetSnapshot(x.out.version_ledger,x.initial.parent); const r=restoreRequest(x.out.parent_state,x.out.version_ledger,t); const out=rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:r}); assert(out.parent_state.research_evidence_links.some(e=>e.link_id==='RESEARCH-NEW'),'RESTORE_ERASED_APPEND_ONLY_HISTORY'); });
test('VR032_REFORWARD_TO_LATER_HISTORICAL_SNAPSHOT', () => { const x=commitV2(); const v2snap=targetSnapshot(x.out.version_ledger,x.out.parent_state); const baseSnap=targetSnapshot(x.out.version_ledger,x.initial.parent); const back=rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:restoreRequest(x.out.parent_state,x.out.version_ledger,baseSnap)}); const fwdReq=restoreRequest(back.parent_state,back.version_ledger,v2snap,{request_id:'VR-RESTORE-002',idempotency_key:'VR-RESTORE-IDEM-002'}); const fwd=rt.restoreAsNewSuccessor({parentState:back.parent_state,versionLedger:back.version_ledger,request:fwdReq}); assert(fwd.parent_state.active.canonical_manuscript_ref==='MANUSCRIPT-001:V2','REFORWARD_FAIL'); });
test('VR033_BRANCH_DIVERGENCE_PREDECESSOR_USES_RESTORED_ACTIVE', () => { const x=commitV2(); const baseSnap=targetSnapshot(x.out.version_ledger,x.initial.parent); const back=rt.restoreAsNewSuccessor({parentState:x.out.parent_state,versionLedger:x.out.version_ledger,request:restoreRequest(x.out.parent_state,x.out.version_ledger,baseSnap)}); const p=manuscriptV(back.parent_state,'V3','c'); const r=successorRequest(back.parent_state,back.version_ledger,p,{request_id:'VR-REQ-003',idempotency_key:'VR-IDEM-003'}); const c=rt.commitSuccessor({parentState:back.parent_state,versionLedger:back.version_ledger,request:r}); const v1=nodeFor(c.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V1'); const v2=nodeFor(c.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V2'); const v3=nodeFor(c.version_ledger,'MANUSCRIPT_MANIFEST','MANUSCRIPT-001','V3'); assert(v3.predecessor_node_id===v1.node_id && v3.predecessor_node_id!==v2.node_id,'BRANCH_PREDECESSOR_FAIL'); });
test('VR034_FAILED_MUTATION_LEAVES_INPUTS_UNCHANGED', () => { const s=setup(); const beforeP=stable(s.parent), beforeL=stable(s.ledger); const p=manuscriptV(s.parent,'V2','b'); const r=successorRequest(s.parent,s.ledger,p,{expected_state_version:999}); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'STALE_PARENT_WRITE'); assert(stable(s.parent)===beforeP && stable(s.ledger)===beforeL,'FAILED_MUTATION_CHANGED_INPUTS'); });
test('VR035_STATE_DIGEST_TAMPER_REJECTED', () => { const s=setup(); const bad=clone(s.parent); bad.book_project.status='PLANNING'; expectError(()=>rt.validateParentState(bad),'PARENT_STATE_DIGEST_MISMATCH'); });
test('VR036_RECEIPT_OUTBOX_ATOMIC_IDENTITY', () => { const x=commitV2(); const receipt=x.out.receipt; assert(x.out.version_ledger.version_receipts[receipt.receipt_id] && receipt.post_parent_state_digest===x.out.parent_state.state_digest,'RECEIPT_IDENTITY_FAIL'); assert(x.out.version_ledger.outbox_entries.some(e=>e.payload_ref===receipt.receipt_id && e.state_version===x.out.parent_state.state_version),'OUTBOX_IDENTITY_FAIL'); assert(receipt.post_ledger_digest===rt.digestLedger(x.out.version_ledger),'POST_LEDGER_DIGEST_FAIL'); });
test('VR037_GOVERNED_OBJECT_SUCCESSOR_LINEAGE', () => { const s=setup(); const p=briefV2(s.parent); const r=successorRequest(s.parent,s.ledger,p); const out=rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}); const v1=nodeFor(out.version_ledger,'GOVERNING_BRIEF','BRIEF-001','1'); const v2=nodeFor(out.version_ledger,'GOVERNING_BRIEF','BRIEF-001','2'); assert(v1 && v2 && v2.predecessor_node_id===v1.node_id,'BRIEF_LINEAGE_FAIL'); });
test('VR038_MULTIPLE_NEW_VERSIONS_SAME_FAMILY_REJECTED', () => { const s=setup(); let p=manuscriptV(s.parent,'V2','b'); p=manuscriptV(rt.sealState({...p,state_version:s.parent.state_version}),'V3','c'); delete p.state_digest; const r=successorRequest(s.parent,s.ledger,p); expectError(()=>rt.commitSuccessor({parentState:s.parent,versionLedger:s.ledger,request:r}),'MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_COMMIT'); });
test('VR039_INITIAL_MULTI_VERSION_WITHOUT_LINEAGE_REJECTED', () => { let p=clone(fixtures.parent_state_template); p.manuscripts.push({manuscript_id:'MANUSCRIPT-001',version_id:'V2',artifact_digest:'b'.repeat(64),authority_state:'CANONICAL',parent_version_ref:'V1',change_set_ref:'CHANGE-V2',created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-09T00:02:00Z'}); p.active.canonical_manuscript_ref='MANUSCRIPT-001:V2'; expectError(()=>rt.createVersionLedger(p),'INITIAL_LINEAGE_REQUIRED'); });
test('VR040_ACTIVE_POINTER_AMBIGUITY_REJECTED', () => { const p=clone(fixtures.parent_state_template); p.governing_briefs.push({brief_id:'BRIEF-001',version:2,author_intent:'Second',form:'NOVEL',genre:'SPECULATIVE',audience:'ADULT',voice_goals:['DISTINCT'],hard_constraints:['NO_SILENT_CANON_CHANGE']}); expectError(()=>rt.createVersionLedger(p),'ACTIVE_POINTER_VERSION_AMBIGUOUS'); });

const expected = fixtures.cases.map(c => c.id);
assert(expected.length === 40, 'FIXTURE_CASE_COUNT_MISMATCH', String(expected.length));
assert(Object.keys(tests).length === expected.length && expected.every(id => tests[id]), 'QUALIFIER_CASE_COVERAGE_MISMATCH');

const results = [];
let failed = 0;
for (const id of expected) {
  try { tests[id](); results.push({ id, result: 'PASS' }); }
  catch (e) { failed += 1; results.push({ id, result: 'FAIL', code: e && e.code ? e.code : 'UNEXPECTED_ERROR', detail: String(e && e.message ? e.message : e) }); }
}

const summary = {
  qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
  result_class: failed === 0 ? 'PASS' : 'FAIL',
  subject_sha: gitHead(),
  case_count: expected.length,
  pass_count: expected.length - failed,
  fail_count: failed,
  contract_standing: contract.standing,
  research_standing: research.standing,
  authority: {
    parent_system_commit_only: true,
    history_rewrite_allowed: false,
    author_approval_synthesis_allowed: false,
    publication_authority_synthesis_allowed: false,
    child_or_provider_canonical_write_allowed: false,
    document_engine_authority_created: false,
  },
  file_sha256: Object.fromEntries(Object.entries(files).map(([k,v]) => [k, fileSha256(v)])),
  results,
};
write('qualification-summary.json', summary);
write('qualification-manifest.json', { qualification_id: summary.qualification_id, subject_sha: summary.subject_sha, evidence_files: ['qualification-summary.json'], case_count: summary.case_count, result_class: summary.result_class });
console.log(JSON.stringify(summary, null, 2));
if (failed) process.exit(1);
