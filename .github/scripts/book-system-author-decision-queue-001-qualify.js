'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-author-decision-queue-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const files = {
  contract: 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001.json',
  clarification: 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001-STATUS-MAPPING-CLARIFICATION.json',
  research: 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-PREIMPLEMENTATION-RESEARCH-001.json',
  forensic: 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-FORENSIC-MAP-001.json',
  fixtures: 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001-FIXTURES.json',
  baseFixtures: 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json',
  runtime: 'system-master/book-system/author-decision-queue.js',
  core: 'system-master/book-system/author-decision-queue-core.js',
  versionRuntime: 'system-master/book-system/version-and-rollback.js',
  qualifier: '.github/scripts/book-system-author-decision-queue-001-qualify.js',
};

const contract = JSON.parse(fs.readFileSync(path.join(workspace, files.contract), 'utf8'));
const clarification = JSON.parse(fs.readFileSync(path.join(workspace, files.clarification), 'utf8'));
const research = JSON.parse(fs.readFileSync(path.join(workspace, files.research), 'utf8'));
const forensic = JSON.parse(fs.readFileSync(path.join(workspace, files.forensic), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(workspace, files.fixtures), 'utf8'));
const baseFixtures = JSON.parse(fs.readFileSync(path.join(workspace, files.baseFixtures), 'utf8'));
const adq = require(path.join(workspace, files.runtime));
const vr = require(path.join(workspace, files.versionRuntime));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stable(v) { return adq.stable(v); }
function assert(ok, code, detail = '') { if (!ok) throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code }); }
function expectError(fn, code) {
  try { fn(); } catch (e) { assert(e && e.code === code, 'WRONG_ERROR_CODE', `expected=${code}:actual=${e && e.code}:detail=${e && e.message}`); return; }
  assert(false, 'EXPECTED_ERROR_NOT_THROWN', code);
}
function git(args) { return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true }); }
function gitHead() { const r = git(['rev-parse','HEAD']); return r.status === 0 ? r.stdout.trim() : 'UNAVAILABLE'; }
function fileSha256(repoPath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, repoPath))).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(evidenceDir, name), JSON.stringify(value, null, 2), 'utf8'); }

function setup() {
  const initial = vr.createVersionLedger(baseFixtures.parent_state_template);
  const parent = initial.parent_state;
  const versionLedger = initial.version_ledger;
  const queueLedger = adq.createQueueLedger(parent);
  return { parent, versionLedger, queueLedger };
}
function manuscriptIdentity(parent) {
  const rec = vr.objectRecords(parent).find(r => r.type === 'MANUSCRIPT_MANIFEST' && (parent.active.canonical_manuscript_ref === r.object_id || parent.active.canonical_manuscript_ref === `${r.object_id}:${r.object_version}`));
  assert(rec, 'ACTIVE_MANUSCRIPT_IDENTITY_NOT_FOUND');
  return { object_id:rec.object_id, object_version:String(rec.object_version), object_digest:rec.object_digest };
}
function basicOptions() {
  return [
    { option_id:'APPROVE', label:'Approve', effect:'Use the proposed direction', consequence_class:'ROUTINE_REVERSIBLE', canonical_decision_status:'APPROVED' },
    { option_id:'REJECT', label:'Reject', effect:'Do not use the proposed direction', consequence_class:'ROUTINE_REVERSIBLE', canonical_decision_status:'REJECTED' },
  ];
}
function materialOptions(consequence = 'MATERIAL_REVISION') {
  return [
    { option_id:'APPROVE', label:'Approve', effect:'Use the proposed direction', consequence_class:consequence, canonical_decision_status:'APPROVED' },
    { option_id:'REJECT', label:'Reject', effect:'Retain the current direction', consequence_class:'ROUTINE_REVERSIBLE', canonical_decision_status:'REJECTED' },
  ];
}
function enqueueRequest(s, overrides = {}) {
  return {
    enqueue_request_id:'ADQ-ENQ-001', idempotency_key:'ADQ-IDEM-ENQ-001', actor_class:'PARENT_SYSTEM',
    expected_parent_state_version:s.parent.state_version, expected_parent_state_digest:s.parent.state_digest,
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:adq.digestQueueLedger(s.queueLedger),
    source_authority_kind:'PARENT_DIRECT_AUTHOR_QUERY', source_handoff_refs:['PARENT-QUERY-001'], decision_type:'REVISION_DIRECTION',
    subject_ref:s.parent.active.canonical_manuscript_ref, subject_identity_refs:[manuscriptIdentity(s.parent)], options:basicOptions(),
    custom_option_allowed:false, evidence_refs:['EVIDENCE-001'], disagreement_refs:[], consequence_summary:'Choose the author-approved revision direction.',
    confirmation_policy:'NONE', created_at:'2026-09-09T23:30:00Z', ...overrides,
  };
}
function enqueue(s, overrides = {}) {
  const request = enqueueRequest(s, overrides);
  const out = adq.enqueueDecision({ parentState:s.parent, queueLedger:s.queueLedger, request });
  return { ...s, enqueueRequest:request, queueLedger:out.queue_ledger, decisionRequest:out.decision_request, enqueueOut:out };
}
function actionRequest(s, snapshot, overrides = {}) {
  return {
    queue_action_request_id:'ADQ-ACTION-001', idempotency_key:'ADQ-IDEM-ACTION-001', actor_class:'PARENT_SYSTEM',
    expected_parent_state_version:s.parent.state_version, expected_parent_state_digest:s.parent.state_digest,
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:adq.digestQueueLedger(s.queueLedger),
    decision_request_id:snapshot.decision_request_id, created_at:'2026-09-09T23:31:00Z', ...overrides,
  };
}
function confirmation(snapshot, choice, consequence = false) {
  return { confirmed:true, decision_request_digest:adq.digestDecisionRequest(snapshot), selected_option_identity:choice, consequence_reviewed:consequence, confirmation_evidence_ref:'CONFIRM-001' };
}
function resolutionRequest(s, snapshot, overrides = {}) {
  const option = snapshot.options[0];
  const choice = `OPTION:${option.option_id}`;
  const needs = snapshot.confirmation_policy !== 'NONE';
  return {
    resolution_request_id:'ADQ-RESOLVE-001', idempotency_key:'ADQ-IDEM-RESOLVE-001', author_actor_ref:'AUTHOR-SESSION-001', author_authority_proof_ref:'AUTHOR-PROOF-001',
    expected_parent_state_version:s.parent.state_version, expected_parent_state_digest:s.parent.state_digest,
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:adq.digestQueueLedger(s.queueLedger),
    decision_request_id:snapshot.decision_request_id, expected_decision_request_version:snapshot.decision_request_version, expected_decision_request_digest:adq.digestDecisionRequest(snapshot),
    selected_option_id:option.option_id, custom_author_choice:null, confirmation_evidence:needs ? confirmation(snapshot, choice, snapshot.confirmation_policy === 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE') : null,
    rationale_optional:null, resolved_at:'2026-09-09T23:32:00Z', ...overrides,
  };
}
function resolve(s, snapshot, overrides = {}) {
  const request = resolutionRequest(s, snapshot, overrides);
  const out = adq.resolveDecision({ parentState:s.parent, versionLedger:s.versionLedger, queueLedger:s.queueLedger, request });
  return { ...s, resolutionRequest:request, parent:out.parent_state, versionLedger:out.version_ledger, queueLedger:out.queue_ledger, resolutionOut:out };
}
function successorParent(parent, { changeManuscript = false } = {}) {
  const next = clone(parent); delete next.state_digest; next.state_version = parent.state_version + 1;
  if (changeManuscript) {
    next.manuscripts = next.manuscripts.filter(m => m.manuscript_id !== 'MANUSCRIPT-001' || m.version_id !== 'V1');
    next.manuscripts.push({ manuscript_id:'MANUSCRIPT-001',version_id:'V2',artifact_digest:'b'.repeat(64),authority_state:'CANONICAL',parent_version_ref:'MANUSCRIPT-001:V1',change_set_ref:'CHANGE-V2',created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-09T23:33:00Z' });
    next.active.canonical_manuscript_ref = 'MANUSCRIPT-001:V2';
  } else {
    next.research_evidence_links.push({link_id:`RESEARCH-${next.state_version}`,claim_or_evidence_ref:'CLAIM-NEW',target_book_object_ref:next.active.canonical_manuscript_ref,freshness_state:'CURRENT',conflict_state:'NONE',provenance:'SOURCE-NEW',rights_class:'AUTHORIZED'});
  }
  return vr.sealState(next);
}
function revalidationRequest(s, overrides = {}) {
  return { revalidation_request_id:'ADQ-REVAL-001', idempotency_key:'ADQ-IDEM-REVAL-001', actor_class:'PARENT_SYSTEM', expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:adq.digestQueueLedger(s.queueLedger), revalidation_evidence_refs:['REVALIDATED-001'], revalidated_at:'2026-09-09T23:34:00Z', ...overrides };
}

const tests = {};
function test(id, fn) { tests[id] = fn; }

test('ADQ001_CREATE_LEDGER_BINDS_EXACT_PARENT', () => { const s=setup(); assert(s.queueLedger.bound_parent_state_version===s.parent.state_version && s.queueLedger.bound_parent_state_digest===s.parent.state_digest,'QUEUE_BINDING_FAIL'); });
test('ADQ002_ENQUEUE_AUTHOR_ONLY_REQUEST', () => { const s=enqueue(setup()); assert(s.decisionRequest.queue_state==='PENDING' && s.decisionRequest.authority_class==='AUTHOR_ONLY','ENQUEUE_FAIL'); });
test('ADQ003_NON_PARENT_ENQUEUE_REJECTED', () => { const s=setup(), r=enqueueRequest(s,{actor_class:'PROSE_SYSTEM'}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'QUEUE_AUTHORITY_DENIED'); });
test('ADQ004_PRESELECTED_OPTION_REJECTED', () => { const s=setup(), opts=basicOptions(); opts[0].selected=true; const r=enqueueRequest(s,{options:opts}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'PRESELECTED_AUTHOR_CHOICE_FORBIDDEN'); });
test('ADQ005_MISSING_CANONICAL_STATUS_REJECTED', () => { const s=setup(), opts=basicOptions(); delete opts[0].canonical_decision_status; const r=enqueueRequest(s,{options:opts}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'REQUIRED_FIELD_MISSING'); });
test('ADQ006_WEAK_CONFIRMATION_POLICY_REJECTED', () => { const s=setup(), r=enqueueRequest(s,{options:materialOptions(),confirmation_policy:'NONE'}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'CONFIRMATION_POLICY_TOO_WEAK'); });
test('ADQ007_PRESENTATION_HAS_NO_DEFAULT_CHOICE', () => { let s=enqueue(setup()); const r=actionRequest(s,s.decisionRequest); const p=adq.presentDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}); const projection=adq.presentationProjection(p.decision_request); assert(projection.selected_option_id===null && projection.options.every(o=>!Object.prototype.hasOwnProperty.call(o,'canonical_decision_status')),'PRESENTATION_DEFAULT_OR_AUTHORITY_LEAK'); });
test('ADQ008_DEFER_CREATES_NO_CANONICAL_DECISION', () => { let s=enqueue(setup()); const before=s.parent.author_decisions.length, out=adq.deferDecision({parentState:s.parent,queueLedger:s.queueLedger,request:actionRequest(s,s.decisionRequest)}); assert(out.decision_request.queue_state==='DEFERRED' && s.parent.author_decisions.length===before,'DEFER_DECISION_CREATED'); });
test('ADQ009_REOPEN_DEFERRED_REQUEST', () => { let s=enqueue(setup()); let d=adq.deferDecision({parentState:s.parent,queueLedger:s.queueLedger,request:actionRequest(s,s.decisionRequest)}); s.queueLedger=d.queue_ledger; const r=actionRequest(s,d.decision_request,{queue_action_request_id:'ADQ-ACTION-002',idempotency_key:'ADQ-IDEM-ACTION-002'}); const out=adq.reopenDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}); assert(out.decision_request.queue_state==='PENDING','REOPEN_FAIL'); });
test('ADQ010_WITHDRAWN_REQUEST_CANNOT_RESOLVE', () => { let s=enqueue(setup()); const w=adq.withdrawDecision({parentState:s.parent,queueLedger:s.queueLedger,request:actionRequest(s,s.decisionRequest)}); s.queueLedger=w.queue_ledger; expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:resolutionRequest(s,w.decision_request)}),'DECISION_REQUEST_NOT_CURRENT'); });
test('ADQ011_STALE_PARENT_RESOLUTION_REJECTED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{expected_parent_state_version:999}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'STALE_PARENT_WRITE'); });
test('ADQ012_STALE_QUEUE_RESOLUTION_REJECTED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{expected_queue_ledger_version:999}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'STALE_QUEUE_WRITE'); });
test('ADQ013_STALE_REQUEST_VERSION_REJECTED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{expected_decision_request_version:999}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'STALE_DECISION_REQUEST'); });
test('ADQ014_STALE_REQUEST_DIGEST_REJECTED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{expected_decision_request_digest:'0'.repeat(64)}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'STALE_DECISION_REQUEST'); });
test('ADQ015_AUTHOR_AUTHORITY_PROOF_REQUIRED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{author_authority_proof_ref:''}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'AUTHOR_AUTHORITY_PROOF_REQUIRED'); });
test('ADQ016_EXACTLY_ONE_CHOICE_REQUIRED', () => { let s=enqueue(setup(),{custom_option_allowed:true}); const r=resolutionRequest(s,s.decisionRequest,{custom_author_choice:'My direction'}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'EXACTLY_ONE_AUTHOR_CHOICE_REQUIRED'); });
test('ADQ017_UNKNOWN_PREDEFINED_OPTION_REJECTED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{selected_option_id:'UNKNOWN'}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'EXACTLY_ONE_AUTHOR_CHOICE_REQUIRED'); });
test('ADQ018_CUSTOM_CHOICE_FORBIDDEN_WHEN_DISABLED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest,{selected_option_id:null,custom_author_choice:'Custom'}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'CUSTOM_AUTHOR_CHOICE_FORBIDDEN'); });
test('ADQ019_CUSTOM_CHOICE_ALLOWED_AND_APPROVED', () => { let s=enqueue(setup(),{custom_option_allowed:true}); s=resolve(s,s.decisionRequest,{selected_option_id:null,custom_author_choice:'Preserve the opening but shorten the transition.'}); assert(s.resolutionOut.author_decision.status==='APPROVED' && s.resolutionOut.author_decision.author_choice==='Preserve the opening but shorten the transition.','CUSTOM_CHOICE_FAIL'); });
test('ADQ020_CONFIRMATION_REQUIRED_FOR_MATERIAL_CHOICE', () => { let s=enqueue(setup(),{options:materialOptions(),confirmation_policy:'REVIEW_SELECTED_CHOICE'}); const r=resolutionRequest(s,s.decisionRequest,{confirmation_evidence:null}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'AUTHOR_CONFIRMATION_REQUIRED'); });
test('ADQ021_PUBLICATION_CONSEQUENCE_CONFIRMATION_REQUIRED', () => { let s=enqueue(setup(),{decision_type:'PUBLICATION_AUTHORIZATION',options:materialOptions('PUBLICATION_OR_RELEASE'),confirmation_policy:'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE'}); const r=resolutionRequest(s,s.decisionRequest,{confirmation_evidence:confirmation(s.decisionRequest,'OPTION:APPROVE',false)}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'AUTHOR_CONSEQUENCE_CONFIRMATION_REQUIRED'); });
test('ADQ022_APPROVE_OPTION_MAPS_TO_APPROVED', () => { let s=enqueue(setup()); s=resolve(s,s.decisionRequest); assert(s.resolutionOut.author_decision.status==='APPROVED','APPROVE_STATUS_FAIL'); });
test('ADQ023_REJECT_OPTION_MAPS_TO_REJECTED', () => { let s=enqueue(setup()); s=resolve(s,s.decisionRequest,{selected_option_id:'REJECT'}); assert(s.resolutionOut.author_decision.status==='REJECTED','REJECT_STATUS_FAIL'); });
test('ADQ024_RESOLUTION_APPENDS_EXACTLY_ONE_DECISION', () => { let s=enqueue(setup()); const before=s.parent.author_decisions.length; s=resolve(s,s.decisionRequest); assert(s.parent.author_decisions.length===before+1 && s.parent.state_version===11,'DECISION_APPEND_COUNT_FAIL'); });
test('ADQ025_RESOLUTION_DOES_NOT_MUTATE_OTHER_AUTHORITIES', () => { let s=enqueue(setup()); const pre=clone({status:s.parent.book_project.status,active:s.parent.active,proposals:s.parent.integration_proposals,releases:s.parent.export_releases,manuscripts:s.parent.manuscripts}); s=resolve(s,s.decisionRequest); const post={status:s.parent.book_project.status,active:s.parent.active,proposals:s.parent.integration_proposals,releases:s.parent.export_releases,manuscripts:s.parent.manuscripts}; assert(stable(pre)===stable(post),'OTHER_AUTHORITY_MUTATED'); });
test('ADQ026_VERSION_ROLLBACK_HANDOFF_IS_AUTHOR_DECISION', () => { let s=enqueue(setup()); s=resolve(s,s.decisionRequest); assert(s.resolutionOut.version_receipt.authority_kind==='AUTHOR_DECISION','VERSION_AUTHORITY_KIND_FAIL'); });
test('ADQ027_IDEMPOTENT_RESOLUTION_REPLAY_NO_SECOND_DECISION', () => { let s=enqueue(setup()); const preReq=resolutionRequest(s,s.decisionRequest); const first=adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:preReq}); const replay=adq.resolveDecision({parentState:first.parent_state,versionLedger:first.version_ledger,queueLedger:first.queue_ledger,request:preReq}); assert(replay.disposition==='REPLAY' && replay.parent_state.author_decisions.length===first.parent_state.author_decisions.length,'RESOLUTION_REPLAY_FAIL'); });
test('ADQ028_CONCURRENT_SECOND_CHOICE_REJECTED', () => { let s=enqueue(setup()); const old=resolutionRequest(s,s.decisionRequest); const first=adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:old}); const second={...old,resolution_request_id:'ADQ-RESOLVE-002',idempotency_key:'ADQ-IDEM-RESOLVE-002',selected_option_id:'REJECT'}; expectError(()=>adq.resolveDecision({parentState:first.parent_state,versionLedger:first.version_ledger,queueLedger:first.queue_ledger,request:second}),'STALE_PARENT_WRITE'); });
test('ADQ029_RESOLUTION_IDEMPOTENCY_CONFLICT_REJECTED', () => { let s=enqueue(setup()); const r=resolutionRequest(s,s.decisionRequest); const first=adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}); const conflict={...r,selected_option_id:'REJECT'}; expectError(()=>adq.resolveDecision({parentState:first.parent_state,versionLedger:first.version_ledger,queueLedger:first.queue_ledger,request:conflict}),'IDEMPOTENCY_KEY_CONFLICT'); });
test('ADQ030_CHANGED_SUBJECT_REVALIDATION_MARKS_STALE', () => { let s=enqueue(setup()); const current=successorParent(s.parent,{changeManuscript:true}); const out=adq.revalidateAgainstParent({previousParentState:s.parent,currentParentState:current,queueLedger:s.queueLedger,request:revalidationRequest(s)}); const latest=out.queue_ledger.decision_request_snapshots[out.queue_ledger.current_request_index[s.decisionRequest.decision_family_id]]; assert(latest.queue_state==='STALE','CHANGED_SUBJECT_NOT_STALE'); });
test('ADQ031_UNCHANGED_SUBJECT_REVALIDATION_REBINDS_CURRENT', () => { let s=enqueue(setup()); const current=successorParent(s.parent); const out=adq.revalidateAgainstParent({previousParentState:s.parent,currentParentState:current,queueLedger:s.queueLedger,request:revalidationRequest(s)}); const latest=out.queue_ledger.decision_request_snapshots[out.queue_ledger.current_request_index[s.decisionRequest.decision_family_id]]; assert(latest.queue_state==='PENDING' && latest.bound_parent_state_digest===current.state_digest,'UNCHANGED_REVALIDATION_FAIL'); });
test('ADQ032_DUPLICATE_HANDOFF_MERGES_SOURCE_LINEAGE', () => { let s=enqueue(setup()); const r=enqueueRequest(s,{enqueue_request_id:'ADQ-ENQ-002',idempotency_key:'ADQ-IDEM-ENQ-002',source_handoff_refs:['PARENT-QUERY-001','PARENT-QUERY-002']}); const out=adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}); assert(out.decision_request.source_handoff_refs.includes('PARENT-QUERY-002'),'HANDOFF_LINEAGE_NOT_MERGED'); });
test('ADQ033_MATERIAL_OPTION_CHANGE_SUPERSEDES_OLD_REQUEST', () => { let s=enqueue(setup()); const opts=basicOptions(); opts.push({option_id:'THIRD',label:'Third path',effect:'Use a third path',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'APPROVED'}); const r=enqueueRequest(s,{enqueue_request_id:'ADQ-ENQ-003',idempotency_key:'ADQ-IDEM-ENQ-003',options:opts,source_handoff_refs:['PARENT-QUERY-003']}); const out=adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}); assert(out.decision_request.supersedes_request_id===s.decisionRequest.decision_request_id && out.decision_request.decision_request_id!==s.decisionRequest.decision_request_id,'MATERIAL_SUPERSESSION_FAIL'); });
test('ADQ034_NO_TIMEOUT_AUTO_RESOLUTION_SURFACE', () => { const source=fs.readFileSync(path.join(workspace,files.runtime),'utf8'); assert(!/timeout.*approve|auto.?approve|automatic.*resolution/i.test(source),'AUTO_RESOLUTION_SURFACE_FOUND'); assert(typeof adq.resolveOnTimeout==='undefined','TIMEOUT_RESOLVER_EXPOSED'); });
test('ADQ035_REJECT_STATUS_CANNOT_APPEAR_APPROVED', () => { let s=enqueue(setup()); s=resolve(s,s.decisionRequest,{selected_option_id:'REJECT'}); assert(s.resolutionOut.resolution_receipt.canonical_decision_status==='REJECTED' && s.resolutionOut.author_decision.status!=='APPROVED','REJECT_MISREAD_AS_APPROVED'); });
test('ADQ036_EXISTING_AUTHOR_DECISIONS_PRESERVED_APPEND_ONLY', () => { let s=enqueue(setup()); const before=clone(s.parent.author_decisions); s=resolve(s,s.decisionRequest); for (const d of before) assert(s.parent.author_decisions.some(x=>x.decision_id===d.decision_id && stable(x)===stable(d)),'EXISTING_DECISION_MUTATED'); });
test('ADQ037_CUSTOM_CHOICE_PRESERVED_NOT_NORMALIZED', () => { let s=enqueue(setup(),{custom_option_allowed:true}); const text='Keep Moses’ unusual cadence; only repair the factual transition.'; s=resolve(s,s.decisionRequest,{selected_option_id:null,custom_author_choice:text}); assert(s.resolutionOut.author_decision.author_choice===text,'CUSTOM_CHOICE_NORMALIZED'); });
test('ADQ038_PRESENTATION_PRESERVES_EVIDENCE_AND_DEFER', () => { let s=enqueue(setup(),{evidence_refs:['E1','E2'],disagreement_refs:['D1']}); const p=adq.presentationProjection(s.decisionRequest); assert(p.can_defer===true && p.evidence_summary_refs.length===2 && p.disagreement_summary_refs[0]==='D1','PRESENTATION_EVIDENCE_FAIL'); });
test('ADQ039_FAILED_RESOLUTION_LEAVES_INPUTS_UNCHANGED', () => { let s=enqueue(setup()); const p=stable(s.parent),v=stable(s.versionLedger),q=stable(s.queueLedger),r=resolutionRequest(s,s.decisionRequest,{author_authority_proof_ref:''}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'AUTHOR_AUTHORITY_PROOF_REQUIRED'); assert(stable(s.parent)===p&&stable(s.versionLedger)===v&&stable(s.queueLedger)===q,'FAILED_RESOLUTION_MUTATED_INPUT'); });
test('ADQ040_SUBJECT_DIGEST_MISMATCH_REJECTED_AT_ENQUEUE', () => { const s=setup(), ref=manuscriptIdentity(s.parent); ref.object_digest='0'.repeat(64); const r=enqueueRequest(s,{subject_identity_refs:[ref]}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'SUBJECT_IDENTITY_NOT_CURRENT'); });
test('ADQ041_CONFIRMATION_CHOICE_MISMATCH_REJECTED', () => { let s=enqueue(setup(),{options:materialOptions(),confirmation_policy:'REVIEW_SELECTED_CHOICE'}); const r=resolutionRequest(s,s.decisionRequest,{confirmation_evidence:confirmation(s.decisionRequest,'OPTION:REJECT')}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'AUTHOR_CONFIRMATION_CHOICE_MISMATCH'); });
test('ADQ042_CONFIRMATION_REQUEST_MISMATCH_REJECTED', () => { let s=enqueue(setup(),{options:materialOptions(),confirmation_policy:'REVIEW_SELECTED_CHOICE'}); const e=confirmation(s.decisionRequest,'OPTION:APPROVE'); e.decision_request_digest='0'.repeat(64); const r=resolutionRequest(s,s.decisionRequest,{confirmation_evidence:e}); expectError(()=>adq.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:r}),'AUTHOR_CONFIRMATION_REQUEST_MISMATCH'); });
test('ADQ043_QUEUE_ACTION_REPLAY_NO_SECOND_SNAPSHOT', () => { let s=enqueue(setup()); const r=actionRequest(s,s.decisionRequest); const first=adq.presentDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}); const count=Object.keys(first.queue_ledger.decision_request_snapshots).length; const replay=adq.presentDecision({parentState:s.parent,queueLedger:first.queue_ledger,request:r}); assert(replay.disposition==='REPLAY' && Object.keys(replay.queue_ledger.decision_request_snapshots).length===count,'ACTION_REPLAY_FAIL'); });
test('ADQ044_NON_PARENT_QUEUE_ACTION_REJECTED', () => { let s=enqueue(setup()); const r=actionRequest(s,s.decisionRequest,{actor_class:'BOOK_EVALUATOR'}); expectError(()=>adq.presentDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'QUEUE_AUTHORITY_DENIED'); });
test('ADQ045_DUPLICATE_OPTION_ID_REJECTED', () => { const s=setup(), opts=basicOptions(); opts[1].option_id='APPROVE'; const r=enqueueRequest(s,{options:opts}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'DUPLICATE_OPTION_ID'); });
test('ADQ046_PUBLICATION_OPTION_REQUIRES_STRONG_CONFIRM_POLICY', () => { const s=setup(), r=enqueueRequest(s,{decision_type:'PUBLICATION_AUTHORIZATION',options:materialOptions('PUBLICATION_OR_RELEASE'),confirmation_policy:'REVIEW_SELECTED_CHOICE'}); expectError(()=>adq.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:r}),'CONFIRMATION_POLICY_TOO_WEAK'); });
test('ADQ047_RESOLVED_REQUEST_CANNOT_RESOLVE_AGAIN', () => { let s=enqueue(setup()); const first=resolve(s,s.decisionRequest); const currentId=first.queueLedger.current_request_index[s.decisionRequest.decision_family_id]; const current=first.queueLedger.decision_request_snapshots[currentId]; const r=resolutionRequest(first,current,{resolution_request_id:'ADQ-RESOLVE-047',idempotency_key:'ADQ-IDEM-RESOLVE-047'}); expectError(()=>adq.resolveDecision({parentState:first.parent,versionLedger:first.versionLedger,queueLedger:first.queueLedger,request:r}),'DECISION_REQUEST_NOT_RESOLVABLE'); });
test('ADQ048_QUEUE_CONTRACT_HAS_NO_LIFECYCLE_OR_PUBLICATION_MUTATOR', () => { const publicKeys=Object.keys(adq); for (const forbidden of ['advanceProjectStatus','setActiveCanonicalManuscript','admitIntegrationProposal','setExportFrozen','setPublicationAuthorized','autoApprove']) assert(!publicKeys.includes(forbidden),'FORBIDDEN_MUTATOR_EXPOSED',forbidden); assert(contract.resolution_transaction.forbidden_same_transaction_effects.length===5,'CONTRACT_FORBIDDEN_MUTATION_SET_CHANGED'); });

function staticChecks() {
  assert(contract.standing==='CANONICAL_PARENT_AUTHOR_AUTHORITY_CAPTURE_CONTRACT__EXECUTABLE_IMPLEMENTATION_PENDING_QUALIFICATION','CONTRACT_STANDING_MISMATCH');
  assert(clarification.standing==='CANONICAL_ADDITIVE_CLARIFICATION__OPTION_TO_CANONICAL_STATUS_EXPLICIT','STATUS_CLARIFICATION_MISSING');
  assert(research.research_gate_result==='PASS' && research.unresolved.length===0,'RESEARCH_GATE_NOT_CLOSED');
  assert(forensic.standing==='CLOSED__REUSE_MAP_COMPLETE__QUEUE_RUNTIME_GAP_IS_BOUNDED','FORENSIC_MAP_NOT_CLOSED');
  const source=(fs.readFileSync(path.join(workspace,files.runtime),'utf8')+fs.readFileSync(path.join(workspace,files.core),'utf8')).toLowerCase();
  for (const token of ['pdf-lib','libreoffice','pandoc','epub-gen','c2pa-node']) assert(!source.includes(token),'DOCUMENT_ENGINE_DEPENDENCY_FORBIDDEN',token);
  assert(!source.includes('setpublicationauthorized') && !source.includes('setexportfrozen'),'PUBLICATION_MUTATOR_FORBIDDEN');
}

staticChecks();
const expected=fixtures.cases.map(c=>c.id);
assert(expected.length===48,'FIXTURE_CASE_COUNT_MISMATCH',String(expected.length));
assert(Object.keys(tests).length===48 && expected.every(id=>tests[id]),'QUALIFIER_CASE_COVERAGE_MISMATCH');
const results=[];
for (const id of expected) {
  try { tests[id](); results.push({id,result:'PASS'}); }
  catch (e) { results.push({id,result:'FAIL',code:e&&e.code?e.code:'UNEXPECTED_ERROR',detail:e&&e.message?e.message:String(e)}); }
}
const failed=results.filter(r=>r.result!=='PASS');
const summary={
  qualification_id:'BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001',
  result_class:failed.length?'FAIL':'PASS', subject_sha:gitHead(), case_count:results.length, pass_count:results.length-failed.length, fail_count:failed.length,
  authority:{ author_choice_synthesis_allowed:false, provider_resolution_allowed:false, lifecycle_mutation_allowed:false, manuscript_promotion_allowed:false, proposal_admission_allowed:false, export_freeze_allowed:false, publication_authority_allowed:false, document_engine_authority_created:false },
  file_sha256:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,fileSha256(v)])), results,
};
write('qualification-summary.json',summary);
write('qualification-manifest.json',{qualification_id:summary.qualification_id,subject_sha:summary.subject_sha,evidence_files:['qualification-summary.json'],case_count:summary.case_count,result_class:summary.result_class});
console.log(JSON.stringify(summary,null,2));
if(failed.length) process.exit(1);
