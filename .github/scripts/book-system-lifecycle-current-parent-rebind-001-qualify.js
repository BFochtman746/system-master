'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-lifecycle-rebind-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const rel = {
  contract: 'qualification/book-system/lifecycle-transition-compatibility-001/BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-REBIND-001.json',
  finding: 'qualification/book-system/end-to-end-authoring-001/BOOK-SYSTEM-E2E-LIFECYCLE-LEDGER-REBIND-GAP-001.json',
  lifecycleContract: 'qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json',
  vrFixtures: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json',
  runtimeFixtures: 'qualification/book-system/integration-proposal-002/INTEGRATION-PROPOSAL-RUNTIME-002-FIXTURES.json',
  registry: 'qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json',
  exportFixtures: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-001-RECONCILED-FIXTURES.json',
  rebind: 'system-master/book-system/lifecycle-current-parent-rebind-adapter.js',
  compatibility: 'system-master/book-system/lifecycle-current-parent-compatibility-adapter.js',
  lifecycle: 'system-master/book-system/lifecycle-transition-engine.js',
  runtime: 'system-master/book-system/integration-proposal-runtime-v2.js',
  adq: 'system-master/book-system/author-decision-queue.js',
  exportFreeze: 'system-master/book-system/export-freeze.js',
  version: 'system-master/book-system/version-and-rollback.js',
};

function readJson(p) { return JSON.parse(fs.readFileSync(path.join(workspace, p), 'utf8')); }
const contract = readJson(rel.contract);
const finding = readJson(rel.finding);
const lifecycleContract = readJson(rel.lifecycleContract);
const vrFixtures = readJson(rel.vrFixtures);
const runtimeFixtures = readJson(rel.runtimeFixtures);
const registry = readJson(rel.registry);
const exportFixtures = readJson(rel.exportFixtures);
const rebind = require(path.join(workspace, rel.rebind));
const adapter = require(path.join(workspace, rel.compatibility));
const rt = require(path.join(workspace, rel.runtime));
const adq = require(path.join(workspace, rel.adq));
const ef = require(path.join(workspace, rel.exportFreeze));
const vr = require(path.join(workspace, rel.version));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function assert(ok, code, detail = '') { if (!ok) throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code }); }
function expectError(fn, code) {
  try { fn(); } catch (e) { assert(e && e.code === code, 'WRONG_ERROR_CODE', `expected=${code}:actual=${e && e.code}:detail=${e && e.message}`); return e; }
  assert(false, 'EXPECTED_ERROR_NOT_THROWN', code);
}
function git(args, encoding = 'utf8') { return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding, windowsHide: true, shell: false }); }
function gitHead() { const r=git(['rev-parse','HEAD']); assert(r.status===0,'GIT_HEAD_FAILED'); return r.stdout.trim(); }
function sameHistoricalBytes(subjectSha, repoPath) {
  const a=git(['show',`${subjectSha}:${repoPath}`],null); const b=git(['show',`HEAD:${repoPath}`],null);
  assert(a.status===0&&b.status===0,'GIT_SHOW_FAILED',repoPath);
  return Buffer.compare(a.stdout||Buffer.alloc(0),b.stdout||Buffer.alloc(0))===0;
}
function write(name, value) { fs.writeFileSync(path.join(evidenceDir,name), typeof value==='string'?value:JSON.stringify(value,null,2), 'utf8'); }
function currentBindings(ledger) { return clone(ledger.state_snapshots[ledger.current_snapshot_id].active_version_bindings); }
function stageEvidence(id,type) { return {link_id:id,claim_or_evidence_ref:`CLAIM-${id}`,target_book_object_ref:'MANUSCRIPT-001:V1',freshness_state:'CURRENT',conflict_state:'NONE',provenance:'SYNTHETIC-QUALIFICATION-FIXTURE',rights_class:'AUTHORIZED',evidence_type:type,synthetic_fixture:true}; }
function sealedBase(status='DRAFTING') {
  const p=clone(vrFixtures.parent_state_template); p.book_project.status=status;
  p.research_evidence_links.push(stageEvidence('EVIDENCE-STRUCTURAL-READY','DRAFT_SCOPE_READY_FOR_STRUCTURAL_REVIEW'));
  p.research_evidence_links.push(stageEvidence('EVIDENCE-STRUCTURAL-COMPLETE','STRUCTURAL_REVIEW_COMPLETE'));
  return vr.sealState(p);
}
function transition(parent, ledger, targetStatus, evidenceRefs, id='LIFE-001') {
  return adapter.applyTransition(lifecycleContract,parent,ledger,{
    transition_request_id:id,idempotency_key:`${id}-IDEM`,actor_class:'PARENT_SYSTEM',scope:'PROJECT',
    target_ref:parent.book_project.book_project_id,target_status:targetStatus,
    expected_parent_state_version:parent.state_version,expected_parent_state_digest:parent.state_digest,
    expected_ledger_version:ledger.ledger_version,expected_ledger_digest:adapter.digestCompatibleLedger(ledger),
    evidence_refs:evidenceRefs,author_decision_refs:[],integration_proposal_refs:[],cause_refs:[]
  });
}
function historyContext() {
  const p=sealedBase('DRAFTING'); const l=adapter.createCompatibleLedger(lifecycleContract,p,{unit_states:{},dependency_edges:[]});
  const t=transition(p,l,'STRUCTURAL_REVIEW',['EVIDENCE-STRUCTURAL-READY'],'LIFE-HISTORY-001');
  return {preParent:t.parent_state,ledger:t.lifecycle_ledger,historyReceiptId:t.receipt.transition_receipt_id};
}
function successor(pre, mutate) { const p=clone(pre); delete p.state_digest; p.state_version=pre.state_version+1; mutate(p); return vr.sealState(p); }
function genericReceipt(pre,post,id='AUTH-001') { return {receipt_id:id,pre_parent_state_version:pre.state_version,pre_parent_state_digest:pre.state_digest,post_parent_state_version:post.state_version,post_parent_state_digest:post.state_digest}; }
function rebindRequest(pre,post,ledger,kind,receipt,id='REBIND-001') { return {
  rebind_request_id:id,idempotency_key:`${id}-IDEM`,actor_class:'PARENT_SYSTEM',authority_kind:kind,
  expected_pre_parent_state_version:pre.state_version,expected_pre_parent_state_digest:pre.state_digest,
  expected_post_parent_state_version:post.state_version,expected_post_parent_state_digest:post.state_digest,
  expected_lifecycle_ledger_version:ledger.ledger_version,expected_lifecycle_ledger_digest:adapter.digestCompatibleLedger(ledger),authority_receipt:clone(receipt)
}; }
function perform(pre,post,ledger,kind,receipt,id='REBIND-001',patch={}) {
  const req={...rebindRequest(pre,post,ledger,kind,receipt,id),...clone(patch)};
  return {req,out:rebind.rebindAfterAuthorizedParentSuccessor({contract:lifecycleContract,preParentState:pre,postParentState:post,lifecycleLedger:ledger,request:req})};
}
function genericContext(kind='INTEGRATION_RUNTIME') {
  const h=historyContext(); const post=successor(h.preParent,p=>p.integration_proposals.push({proposal_id:'PROPOSAL-REBIND-001',source_project_or_lane:'SYSTEM_MASTER/BOOK/PROSE',source_subject_sha:'1'.repeat(40),capability_id:'TEST',admission_state:'ADMITTED'}));
  const receipt=genericReceipt(h.preParent,post,'AUTH-GENERIC-001'); return {...h,post,receipt,kind};
}
function runtimePair(parent) {
  const source={object_id:'MANUSCRIPT-001',object_version:'V1',object_digest:'a'.repeat(64)};
  const request=clone(runtimeFixtures.prose_request_template); request.parent_state_version=parent.state_version; request.parent_state_digest=parent.state_digest; request.source_identity_refs=[clone(source)]; request.target_refs=['MANUSCRIPT-001:V1']; request.projection.exact_manuscript_identity='MANUSCRIPT-001:V1';
  const response=clone(runtimeFixtures.prose_response_template); response.parent_projection_identity={parent_state_version:parent.state_version,parent_state_digest:parent.state_digest}; response.source_identity_refs=[clone(source)];
  return {source,request,response};
}
function manuscriptIdentity(parent) { const r=vr.objectRecords(parent).find(x=>x.type==='MANUSCRIPT_MANIFEST'&&(parent.active.canonical_manuscript_ref===x.object_id||parent.active.canonical_manuscript_ref===`${x.object_id}:${x.object_version}`)); assert(r,'MANUSCRIPT_IDENTITY_NOT_FOUND'); return {object_id:r.object_id,object_version:String(r.object_version),object_digest:r.object_digest}; }
function adqOptions() { return [{option_id:'APPROVE',label:'Approve',effect:'Approve synthetic qualification choice',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'APPROVED'},{option_id:'REJECT',label:'Reject',effect:'Reject synthetic qualification choice',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'REJECTED'}]; }
function actualAdqSuccessor() {
  const initial=vr.createVersionLedger(vrFixtures.parent_state_template); const pre=initial.parent_state; const life=adapter.createCompatibleLedger(lifecycleContract,pre,{unit_states:{},dependency_edges:[]}); let q=adq.createQueueLedger(pre);
  const enq={enqueue_request_id:'REBIND-ADQ-ENQ',idempotency_key:'REBIND-ADQ-ENQ-IDEM',actor_class:'PARENT_SYSTEM',expected_parent_state_version:pre.state_version,expected_parent_state_digest:pre.state_digest,expected_queue_ledger_version:q.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(q),source_authority_kind:'PARENT_DIRECT_AUTHOR_QUERY',source_handoff_refs:['SYNTHETIC-REBIND-TEST'],decision_type:'FINALIZATION_APPROVAL',subject_ref:pre.active.canonical_manuscript_ref,subject_identity_refs:[manuscriptIdentity(pre)],options:adqOptions(),custom_option_allowed:false,evidence_refs:['SYNTHETIC-EVIDENCE'],disagreement_refs:[],consequence_summary:'Synthetic qualification only.',confirmation_policy:'NONE',created_at:'2026-09-09T22:00:00Z'};
  const e=adq.enqueueDecision({parentState:pre,queueLedger:q,request:enq}); q=e.queue_ledger; const snap=e.decision_request;
  const rr={resolution_request_id:'REBIND-ADQ-RESOLVE',idempotency_key:'REBIND-ADQ-RESOLVE-IDEM',author_actor_ref:'SYNTHETIC-AUTHOR-FIXTURE',author_authority_proof_ref:'SYNTHETIC-PROOF-FIXTURE',expected_parent_state_version:pre.state_version,expected_parent_state_digest:pre.state_digest,expected_queue_ledger_version:q.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(q),decision_request_id:snap.decision_request_id,expected_decision_request_version:snap.decision_request_version,expected_decision_request_digest:adq.digestDecisionRequest(snap),selected_option_id:'APPROVE',custom_author_choice:null,confirmation_evidence:null,rationale_optional:'SYNTHETIC_FIXTURE_NOT_REAL_AUTHOR_AUTHORITY',resolved_at:'2026-09-09T22:01:00Z'};
  const resolved=adq.resolveDecision({parentState:pre,versionLedger:initial.version_ledger,queueLedger:q,request:rr});
  return {pre,post:resolved.parent_state,life,receipt:resolved.resolution_receipt};
}
function actualRuntimeSuccessor() {
  const pre=vr.sealState(clone(vrFixtures.parent_state_template)); const life=adapter.createCompatibleLedger(lifecycleContract,pre,{unit_states:{},dependency_edges:[]}); const pair=runtimePair(pre); const ledger=rt.createLedger(pre,{source_identity_refs:[pair.source]});
  const out=rt.intakeServiceResponse({registry,parentState:pre,ledger,request:pair.request,response:pair.response}); assert(out.parentState.state_version===pre.state_version+1,'RUNTIME_DID_NOT_CREATE_SUCCESSOR'); return {pre,post:out.parentState,life,receipt:out.receipt};
}
function actualExportSuccessor() {
  const pre=vr.sealState(clone(exportFixtures.base_parent_state)); const life=adapter.createCompatibleLedger(lifecycleContract,pre,{unit_states:{},dependency_edges:[]}); const fl=ef.createFreezeLedger(pre); const req=clone(exportFixtures.base_request); req.expected_parent_state_version=pre.state_version; req.expected_parent_state_digest=pre.state_digest; req.expected_freeze_ledger_version=fl.ledger_version; req.expected_freeze_ledger_digest=ef.digestFreezeLedger(fl);
  const out=ef.freezeExport({parentState:pre,freezeLedger:fl,request:req}); return {pre,post:out.parent_state,life,receipt:out.release_receipt,release:out.release};
}
function actualVersionSuccessor() {
  const initial=vr.createVersionLedger(vrFixtures.parent_state_template); const pre=initial.parent_state; const life=adapter.createCompatibleLedger(lifecycleContract,pre,{unit_states:{},dependency_edges:[]}); const proposed=clone(pre); proposed.research_evidence_links.push(stageEvidence('REBIND-VR-EVIDENCE','SYNTHETIC_VERSION_SUCCESSOR'));
  const out=vr.commitSuccessor({parentState:pre,versionLedger:initial.version_ledger,request:{request_id:'REBIND-VR-001',idempotency_key:'REBIND-VR-001-IDEM',actor_class:'PARENT_SYSTEM',expected_state_version:pre.state_version,expected_state_digest:pre.state_digest,expected_ledger_version:initial.version_ledger.ledger_version,expected_ledger_digest:vr.digestLedger(initial.version_ledger),proposed_parent_state:proposed,active_version_bindings:currentBindings(initial.version_ledger),evidence_refs:['REBIND-VR-EVIDENCE'],author_decision_refs:[],lifecycle_transition_receipt:null}});
  return {pre,post:out.parent_state,life,receipt:out.receipt};
}

const tests={}; function test(id,fn){tests[id]=fn;}
test('RB001_CONTRACT_AND_FINDING_BOUND',()=>{assert(contract.contract_id==='BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-REBIND-001','CONTRACT_ID');assert(finding.repair_boundary.id===contract.contract_id,'FINDING_CONTRACT_MISMATCH');});
test('RB002_ALLOWED_AUTHORITY_SET_EXACT',()=>{assert([...rebind.ALLOWED_AUTHORITY_KINDS].sort().join('|')===contract.allowed_authority_kinds.slice().sort().join('|'),'AUTHORITY_SET_MISMATCH');});
test('RB003_EXISTING_LEDGER_HAS_REAL_HISTORY',()=>{const h=historyContext();assert(Object.keys(h.ledger.transition_receipts).length===1&&h.ledger.transition_receipts[h.historyReceiptId],'HISTORY_SETUP_FAIL');});
test('RB004_GENERIC_REBIND_COMMITS',()=>{const c=genericContext();assert(perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out.disposition==='COMMITTED','REBIND_NOT_COMMITTED');});
test('RB005_LEDGER_VERSION_ADVANCES_ONCE',()=>{const c=genericContext();const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;assert(o.lifecycle_ledger.ledger_version===c.ledger.ledger_version+1,'LEDGER_VERSION_DELTA');});
test('RB006_BOUND_PARENT_BECOMES_EXACT_POST',()=>{const c=genericContext();const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;assert(o.lifecycle_ledger.bound_parent_state_version===c.post.state_version&&o.lifecycle_ledger.bound_parent_state_digest===c.post.state_digest,'POST_BINDING_FAIL');});
test('RB007_HISTORY_DIGEST_PRESERVED',()=>{const c=genericContext();const before=rebind.lifecycleHistoryDigest(c.ledger);const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;assert(rebind.lifecycleHistoryDigest(o.lifecycle_ledger)===before,'HISTORY_CHANGED');});
test('RB008_PRIOR_TRANSITION_RECEIPT_PRESERVED',()=>{const c=genericContext();const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;assert(o.lifecycle_ledger.transition_receipts[c.historyReceiptId],'PRIOR_RECEIPT_LOST');});
test('RB009_REBIND_RECEIPT_APPEND_ONLY_PRESENT',()=>{const c=genericContext();const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;assert(o.lifecycle_ledger.compatibility_rebind_receipts[o.receipt.rebind_receipt_id],'REBIND_RECEIPT_NOT_STORED');});
test('RB010_NEXT_LIFECYCLE_TRANSITION_USES_SAME_LEDGER',()=>{const c=genericContext();const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;const t=transition(c.post,o.lifecycle_ledger,'PROSE_REFINEMENT',['EVIDENCE-STRUCTURAL-COMPLETE'],'LIFE-AFTER-REBIND');assert(t.parent_state.book_project.status==='PROSE_REFINEMENT'&&t.lifecycle_ledger.transition_receipts[c.historyReceiptId],'POST_REBIND_TRANSITION_FAIL');});
test('RB011_REBIND_METADATA_SURVIVES_NEXT_TRANSITION',()=>{const c=genericContext();const o=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt).out;const t=transition(c.post,o.lifecycle_ledger,'PROSE_REFINEMENT',['EVIDENCE-STRUCTURAL-COMPLETE'],'LIFE-AFTER-REBIND-2');assert(t.lifecycle_ledger.compatibility_rebind_receipts[o.receipt.rebind_receipt_id],'REBIND_METADATA_LOST');});
test('RB012_IDEMPOTENT_REPLAY_NO_SECOND_INCREMENT',()=>{const c=genericContext();const first=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-REPLAY');const second=rebind.rebindAfterAuthorizedParentSuccessor({contract:lifecycleContract,preParentState:c.preParent,postParentState:c.post,lifecycleLedger:first.out.lifecycle_ledger,request:first.req});assert(second.disposition==='REPLAY'&&second.lifecycle_ledger.ledger_version===first.out.lifecycle_ledger.ledger_version&&second.receipt.rebind_receipt_id===first.out.receipt.rebind_receipt_id,'REPLAY_FAIL');});
test('RB013_IDEMPOTENCY_CONFLICT_REJECTED',()=>{const c=genericContext();const first=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-IDEM');const bad=clone(first.req);bad.expected_post_parent_state_digest='0'.repeat(64);expectError(()=>rebind.rebindAfterAuthorizedParentSuccessor({contract:lifecycleContract,preParentState:c.preParent,postParentState:c.post,lifecycleLedger:first.out.lifecycle_ledger,request:bad}),'IDEMPOTENCY_KEY_CONFLICT');});
test('RB014_REQUEST_ID_CONFLICT_REJECTED',()=>{const c=genericContext();const first=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-REQ');const bad=clone(first.req);bad.idempotency_key='DIFFERENT-IDEM';expectError(()=>rebind.rebindAfterAuthorizedParentSuccessor({contract:lifecycleContract,preParentState:c.preParent,postParentState:c.post,lifecycleLedger:first.out.lifecycle_ledger,request:bad}),'REQUEST_ID_CONFLICT');});
test('RB015_NON_PARENT_ACTOR_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-NONPARENT',{actor_class:'PROSE_SYSTEM'}),'REBIND_AUTHORITY_DENIED');});
test('RB016_PROVIDER_KIND_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,'PROVIDER',c.receipt,'REBIND-PROVIDER'),'REBIND_AUTHORITY_KIND_DENIED');});
test('RB017_LIFECYCLE_KIND_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,'LIFECYCLE_TRANSITION',c.receipt,'REBIND-LIFECYCLE'),'REBIND_AUTHORITY_KIND_DENIED');});
test('RB018_STATUS_CHANGE_REJECTED',()=>{const h=historyContext();const post=successor(h.preParent,p=>p.book_project.status='PROSE_REFINEMENT');const r=genericReceipt(h.preParent,post);expectError(()=>perform(h.preParent,post,h.ledger,'CANONICAL_STATE_MUTATION',r,'REBIND-STATUS'),'LIFECYCLE_STATUS_CHANGE_FORBIDDEN_IN_REBIND');});
test('RB019_POST_VERSION_SKIP_REJECTED',()=>{const h=historyContext();const p=clone(h.preParent);delete p.state_digest;p.state_version+=2;p.research_evidence_links.push(stageEvidence('SKIP','SKIP'));const post=vr.sealState(p),r=genericReceipt(h.preParent,post);expectError(()=>perform(h.preParent,post,h.ledger,'CANONICAL_STATE_MUTATION',r,'REBIND-SKIP'),'POST_PARENT_VERSION_NOT_NEXT');});
test('RB020_PROJECT_ID_CHANGE_REJECTED',()=>{const h=historyContext();const post=successor(h.preParent,p=>p.book_project.book_project_id='OTHER');const r=genericReceipt(h.preParent,post);expectError(()=>perform(h.preParent,post,h.ledger,'CANONICAL_STATE_MUTATION',r,'REBIND-PROJECT'),'BOOK_PROJECT_IDENTITY_IMMUTABLE');});
test('RB021_RECEIPT_PRE_VERSION_MISMATCH_REJECTED',()=>{const c=genericContext();const r=clone(c.receipt);r.pre_parent_state_version--;expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,r,'REBIND-RPREV'),'AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH');});
test('RB022_RECEIPT_PRE_DIGEST_MISMATCH_REJECTED',()=>{const c=genericContext();const r=clone(c.receipt);r.pre_parent_state_digest='0'.repeat(64);expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,r,'REBIND-RPRED'),'AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH');});
test('RB023_RECEIPT_POST_VERSION_MISMATCH_REJECTED',()=>{const c=genericContext();const r=clone(c.receipt);r.post_parent_state_version++;expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,r,'REBIND-RPOSTV'),'AUTHORITY_RECEIPT_POST_IDENTITY_MISMATCH');});
test('RB024_RECEIPT_POST_DIGEST_MISMATCH_REJECTED',()=>{const c=genericContext();const r=clone(c.receipt);r.post_parent_state_digest='0'.repeat(64);expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,r,'REBIND-RPOSTD'),'AUTHORITY_RECEIPT_POST_IDENTITY_MISMATCH');});
test('RB025_STALE_EXPECTED_PRE_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-STPRE',{expected_pre_parent_state_version:999}),'STALE_PRE_PARENT_IDENTITY');});
test('RB026_STALE_EXPECTED_POST_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-STPOST',{expected_post_parent_state_digest:'0'.repeat(64)}),'STALE_POST_PARENT_IDENTITY');});
test('RB027_STALE_LEDGER_VERSION_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-STLV',{expected_lifecycle_ledger_version:999}),'STALE_LIFECYCLE_LEDGER_IDENTITY');});
test('RB028_STALE_LEDGER_DIGEST_REJECTED',()=>{const c=genericContext();expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-STLD',{expected_lifecycle_ledger_digest:'0'.repeat(64)}),'STALE_LIFECYCLE_LEDGER_IDENTITY');});
test('RB029_LIFECYCLE_MUTATING_RECEIPT_REJECTED',()=>{const c=genericContext();const r=clone(c.receipt);r.lifecycle_mutated=true;expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,r,'REBIND-LM'),'LIFECYCLE_MUTATING_AUTHORITY_RECEIPT_FORBIDDEN');});
test('RB030_PUBLICATION_AUTHORITY_RECEIPT_REJECTED',()=>{const c=genericContext();const r=clone(c.receipt);r.publication_authorized=true;expectError(()=>perform(c.preParent,c.post,c.ledger,c.kind,r,'REBIND-PUB'),'PUBLICATION_AUTHORITY_RECEIPT_FORBIDDEN');});
test('RB031_FAILURE_LEAVES_INPUT_LEDGER_UNCHANGED',()=>{const c=genericContext();const before=adapter.digestCompatibleLedger(c.ledger);expectError(()=>perform(c.preParent,c.post,c.ledger,'PROVIDER',c.receipt,'REBIND-IMMUT'),'REBIND_AUTHORITY_KIND_DENIED');assert(adapter.digestCompatibleLedger(c.ledger)===before,'INPUT_LEDGER_MUTATED');});
test('RB032_REAL_RUNTIME_V2_RECEIPT_REBINDS',()=>{const x=actualRuntimeSuccessor();const o=perform(x.pre,x.post,x.life,'INTEGRATION_RUNTIME',x.receipt,'REBIND-REAL-RUNTIME').out;assert(o.lifecycle_ledger.bound_parent_state_digest===x.post.state_digest,'REAL_RUNTIME_REBIND_FAIL');});
test('RB033_REAL_AUTHOR_DECISION_RECEIPT_REBINDS',()=>{const x=actualAdqSuccessor();const o=perform(x.pre,x.post,x.life,'AUTHOR_DECISION',x.receipt,'REBIND-REAL-ADQ').out;assert(o.lifecycle_ledger.bound_parent_state_digest===x.post.state_digest,'REAL_ADQ_REBIND_FAIL');});
test('RB034_REAL_EXPORT_FREEZE_RECEIPT_REBINDS',()=>{const x=actualExportSuccessor();const o=perform(x.pre,x.post,x.life,'EXPORT_RELEASE',x.receipt,'REBIND-REAL-EXPORT').out;assert(o.lifecycle_ledger.bound_parent_state_digest===x.post.state_digest,'REAL_EXPORT_REBIND_FAIL');});
test('RB035_REAL_EXPORT_REBIND_THEN_FREEZE_TRANSITION_SAME_LEDGER',()=>{const x=actualExportSuccessor();const o=perform(x.pre,x.post,x.life,'EXPORT_RELEASE',x.receipt,'REBIND-REAL-EXPORT-LIFE').out;const t=transition(x.post,o.lifecycle_ledger,'EXPORT_FROZEN',[x.release.release_id],'LIFE-REAL-EXPORT-FROZEN');assert(t.parent_state.book_project.status==='EXPORT_FROZEN'&&Object.keys(t.lifecycle_ledger.compatibility_rebind_receipts).length===1,'REAL_EXPORT_CHAIN_FAIL');});
test('RB036_REAL_VERSION_ROLLBACK_RECEIPT_REBINDS',()=>{const x=actualVersionSuccessor();const o=perform(x.pre,x.post,x.life,'VERSION_ROLLBACK',x.receipt,'REBIND-REAL-VR').out;assert(o.lifecycle_ledger.bound_parent_state_digest===x.post.state_digest,'REAL_VERSION_REBIND_FAIL');});
test('RB037_REBIND_RECEIPT_HAS_ZERO_LIFECYCLE_OR_PUBLICATION_AUTHORITY',()=>{const c=genericContext();const r=perform(c.preParent,c.post,c.ledger,c.kind,c.receipt,'REBIND-ZERO').out.receipt;assert(r.lifecycle_transition_performed===false&&r.publication_authorized===false,'AUTHORITY_WIDENED');});
test('RB038_LIFECYCLE_V1_BYTES_UNCHANGED_FROM_QUALIFIED_SUBJECT',()=>{assert(sameHistoricalBytes('4a6e3459d6ba94b7ce191e426ca64bef00d23582',rel.lifecycle),'LIFECYCLE_V1_BYTES_CHANGED');});
test('RB039_EXISTING_COMPATIBILITY_ADAPTER_BYTES_UNCHANGED_FROM_QUALIFIED_SUBJECT',()=>{assert(sameHistoricalBytes('fc5adf8fd130d7b5324cff0058ab3804d75ec54e',rel.compatibility),'COMPATIBILITY_ADAPTER_BYTES_CHANGED');});

const results=[]; let failed=0;
for (const [id,fn] of Object.entries(tests)) { try { const detail=fn()||null; results.push({id,result:'PASS',detail}); } catch(e) { failed++; results.push({id,result:'FAIL',code:e&&e.code||'ERROR',detail:e&&e.message||String(e)}); } }
const subjectSha=gitHead();
const summary={qualification_id:'BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-REBIND-001',subject_sha:subjectSha,case_count:results.length,pass_count:results.length-failed,fail_count:failed,result_class:failed?'FAIL':'PASS',authority:{new_lifecycle_policy:false,new_transition_types:false,parent_successor_created:false,author_choice_reinterpreted:false,document_or_provider_authority:false,export_freeze_authority:false,publication_authorized:false},predecessor_subjects:{lifecycle_v1:'4a6e3459d6ba94b7ce191e426ca64bef00d23582',compatibility_adapter:'fc5adf8fd130d7b5324cff0058ab3804d75ec54e',runtime_v2:'837e479415afb2d9724e4b913d456ef1d3a62df5',author_decision_queue:'9601ae5df8348c1daac8805eaefa1718c431dd49',version_rollback:'402ab84a14e9d345530d60394ebc36176541dd21',export_freeze:'0bc1f96ed0b8effd22c432a7d727fd13d613b825'},results};
write('qualification-summary.json',summary); write('result.txt',`result=${summary.result_class}\ncase_count=${summary.case_count}\npass_count=${summary.pass_count}\nfail_count=${summary.fail_count}\nsubject_sha=${subjectSha}\n`);
console.log(JSON.stringify(summary,null,2));
if (failed) process.exit(1);
