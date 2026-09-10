'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-system-e2e-authoring-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const rel = {
  map: 'qualification/book-system/end-to-end-authoring-001/BOOK-SYSTEM-END-TO-END-AUTHORING-QUALIFICATION-001-FORENSIC-MAP.json',
  state020: 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-020.json',
  lifecycleContract: 'qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json',
  registry: 'qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json',
  runtimeFixtures: 'qualification/book-system/integration-proposal-002/INTEGRATION-PROPOSAL-RUNTIME-002-FIXTURES.json',
  exportFixtures: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-001-RECONCILED-FIXTURES.json',
  lifecycle: 'system-master/book-system/lifecycle-transition-engine.js',
  adapter: 'system-master/book-system/lifecycle-current-parent-compatibility-adapter.js',
  rebind: 'system-master/book-system/lifecycle-current-parent-rebind-adapter.js',
  runtime: 'system-master/book-system/integration-proposal-runtime-v2.js',
  version: 'system-master/book-system/version-and-rollback.js',
  author: 'system-master/book-system/author-decision-queue.js',
  exportFreeze: 'system-master/book-system/export-freeze.js',
  qualifier: '.github/scripts/book-system-end-to-end-authoring-001-qualify.js',
};

function readJson(p) { return JSON.parse(fs.readFileSync(path.join(workspace, p), 'utf8')); }
const map = readJson(rel.map);
const state020 = readJson(rel.state020);
const lifecycleContract = readJson(rel.lifecycleContract);
const registry = readJson(rel.registry);
const runtimeFixtures = readJson(rel.runtimeFixtures);
const exportFixtures = readJson(rel.exportFixtures);
const adapter = require(path.join(workspace, rel.adapter));
const rebind = require(path.join(workspace, rel.rebind));
const rt = require(path.join(workspace, rel.runtime));
const vr = require(path.join(workspace, rel.version));
const adq = require(path.join(workspace, rel.author));
const ef = require(path.join(workspace, rel.exportFreeze));

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stable(v) { return JSON.stringify(v, Object.keys(v || {}).sort()); }
function assert(ok, code, detail = '') { if (!ok) throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code }); }
function expectError(fn, expected) {
  try { fn(); } catch (e) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(e && allowed.includes(e.code), 'WRONG_ERROR_CODE', `expected=${allowed.join('|')}:actual=${e && e.code}:detail=${e && e.message}`);
    return e;
  }
  assert(false, 'EXPECTED_ERROR_NOT_THROWN', Array.isArray(expected) ? expected.join('|') : expected);
}
function git(args, encoding = 'utf8') { return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding, windowsHide: true, shell: false }); }
function gitHead() { const r = git(['rev-parse', 'HEAD']); assert(r.status === 0, 'GIT_HEAD_FAILED', r.stderr || ''); return r.stdout.trim(); }
function sameHistoricalBytes(subjectSha, repoPath) {
  const a = git(['show', `${subjectSha}:${repoPath}`], null);
  const b = git(['show', `HEAD:${repoPath}`], null);
  assert(a.status === 0 && b.status === 0, 'GIT_SHOW_FAILED', repoPath);
  return Buffer.compare(a.stdout || Buffer.alloc(0), b.stdout || Buffer.alloc(0)) === 0;
}
function shaFile(repoPath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, repoPath))).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(evidenceDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function currentBindings(ledger) { return clone(ledger.state_snapshots[ledger.current_snapshot_id].active_version_bindings); }
function manuscriptRecord(parent) {
  const r = vr.objectRecords(parent).find(x => x.type === 'MANUSCRIPT_MANIFEST' && (parent.active.canonical_manuscript_ref === x.object_id || parent.active.canonical_manuscript_ref === `${x.object_id}:${x.object_version}`));
  assert(r, 'ACTIVE_MANUSCRIPT_IDENTITY_NOT_FOUND');
  return r;
}
function manuscriptIdentity(parent) { const r = manuscriptRecord(parent); return { object_id:r.object_id, object_version:String(r.object_version), object_digest:r.object_digest }; }
function syntheticEvidence(id, type) {
  return { link_id:id, claim_or_evidence_ref:`SYNTHETIC:${id}`, target_book_object_ref:'MANUSCRIPT-001:V1', freshness_state:'CURRENT', conflict_state:'NONE', provenance:'SYNTHETIC_QUALIFICATION_FIXTURE', rights_class:'AUTHORIZED', evidence_type:type, synthetic_fixture:true };
}
function baseParent(status = 'PROSE_REFINEMENT') {
  const p = clone(exportFixtures.base_parent_state);
  delete p.state_digest;
  p.state_version = 1;
  p.book_project.status = status;
  p.author_decisions = [];
  p.integration_proposals = [{
    proposal_id:'SYNTHETIC-DOCUMENT-ADMISSION-001', source_project_or_lane:'HEADLESS_ARTIFACT_SERVICE', source_subject_sha:'9'.repeat(40), capability_id:'DOCUMENT_ARTIFACT_AND_EXPORT', admission_state:'ADMITTED', synthetic_fixture:true,
  }];
  p.export_releases = [];
  p.research_evidence_links = [
    syntheticEvidence('E2E-EV-STRUCT-READY','DRAFT_SCOPE_READY_FOR_STRUCTURAL_REVIEW'),
    syntheticEvidence('E2E-EV-STRUCT-COMPLETE','STRUCTURAL_REVIEW_COMPLETE'),
    syntheticEvidence('E2E-EV-PROSE-COMPLETE','PROSE_REFINEMENT_SCOPE_COMPLETE'),
    syntheticEvidence('E2E-EV-BOOK-EVAL-COMPLETE','BOOK_EVALUATION_COMPLETE'),
    syntheticEvidence('E2E-EV-AUTHOR-REVIEW-COMPLETE','AUTHOR_REVIEW_COMPLETE'),
    syntheticEvidence('E2E-EV-SYN-PUBLICATION','AUTHOR_APPROVED_EXPORT_PRESENT'),
  ];
  return vr.sealState(p);
}
function setup(status = 'PROSE_REFINEMENT') {
  const init = vr.createVersionLedger(baseParent(status));
  return {
    parent:init.parent_state,
    versionLedger:init.version_ledger,
    lifecycleLedger:adapter.createCompatibleLedger(lifecycleContract, init.parent_state, { unit_states:{}, dependency_edges:[] }),
  };
}
function lifecycleRequest(ctx, target, evidenceRefs, authorRefs, proposalRefs, id, patch = {}) {
  return {
    transition_request_id:id,
    idempotency_key:`${id}-IDEM`,
    actor_class:'PARENT_SYSTEM', scope:'PROJECT', target_ref:ctx.parent.book_project.book_project_id, target_status:target,
    expected_parent_state_version:ctx.parent.state_version, expected_parent_state_digest:ctx.parent.state_digest,
    expected_ledger_version:ctx.lifecycleLedger.ledger_version, expected_ledger_digest:adapter.digestCompatibleLedger(ctx.lifecycleLedger),
    evidence_refs:clone(evidenceRefs || []), author_decision_refs:clone(authorRefs || []), integration_proposal_refs:clone(proposalRefs || []), cause_refs:[],
    ...clone(patch),
  };
}
function recordLifecycleSuccessor(ctx, out, id) {
  const pre = ctx.parent;
  const v = vr.recordAuthorizedParentSuccessor({ parentState:pre, versionLedger:ctx.versionLedger, request:{
    request_id:`VR-${id}`, idempotency_key:`VR-${id}-IDEM`, actor_class:'PARENT_SYSTEM',
    expected_state_version:pre.state_version, expected_state_digest:pre.state_digest,
    expected_ledger_version:ctx.versionLedger.ledger_version, expected_ledger_digest:vr.digestLedger(ctx.versionLedger),
    authority_kind:'LIFECYCLE_TRANSITION', authority_receipt:out.receipt, committed_parent_state:out.parent_state, active_version_bindings:currentBindings(ctx.versionLedger),
  }});
  return { ...ctx, parent:out.parent_state, versionLedger:v.version_ledger, lifecycleLedger:out.lifecycle_ledger, lastLifecycleReceipt:out.receipt, lastVersionReceipt:v.receipt };
}
function applyLifecycle(ctx, target, evidenceRefs = [], authorRefs = [], proposalRefs = [], id = 'E2E-LIFE') {
  const out = adapter.applyTransition(lifecycleContract, ctx.parent, ctx.lifecycleLedger, lifecycleRequest(ctx,target,evidenceRefs,authorRefs,proposalRefs,id));
  return recordLifecycleSuccessor(ctx,out,id);
}
function rebindOnly(ctx, pre, post, kind, receipt, id) {
  const out = rebind.rebindAfterAuthorizedParentSuccessor({ contract:lifecycleContract, preParentState:pre, postParentState:post, lifecycleLedger:ctx.lifecycleLedger, request:{
    rebind_request_id:id, idempotency_key:`${id}-IDEM`, actor_class:'PARENT_SYSTEM', authority_kind:kind,
    expected_pre_parent_state_version:pre.state_version, expected_pre_parent_state_digest:pre.state_digest,
    expected_post_parent_state_version:post.state_version, expected_post_parent_state_digest:post.state_digest,
    expected_lifecycle_ledger_version:ctx.lifecycleLedger.ledger_version, expected_lifecycle_ledger_digest:adapter.digestCompatibleLedger(ctx.lifecycleLedger),
    authority_receipt:clone(receipt),
  }});
  return { ...ctx, lifecycleLedger:out.lifecycle_ledger, lastRebindReceipt:out.receipt };
}
function recordExternalSuccessor(ctx, post, kind, receipt, id) {
  const pre = ctx.parent;
  const v = vr.recordAuthorizedParentSuccessor({ parentState:pre, versionLedger:ctx.versionLedger, request:{
    request_id:`VR-${id}`, idempotency_key:`VR-${id}-IDEM`, actor_class:'PARENT_SYSTEM',
    expected_state_version:pre.state_version, expected_state_digest:pre.state_digest,
    expected_ledger_version:ctx.versionLedger.ledger_version, expected_ledger_digest:vr.digestLedger(ctx.versionLedger),
    authority_kind:kind, authority_receipt:clone(receipt), committed_parent_state:post, active_version_bindings:currentBindings(ctx.versionLedger),
  }});
  let next = { ...ctx, parent:post, versionLedger:v.version_ledger, lastVersionReceipt:v.receipt };
  next = rebindOnly(next, pre, post, kind, receipt, `REBIND-${id}`);
  return next;
}
function prosePair(parent, suffix = 'A') {
  const source = manuscriptIdentity(parent);
  const req = clone(runtimeFixtures.prose_request_template);
  req.request_id = `REQ-E2E-PROSE-${suffix}`; req.correlation_id=`CORR-E2E-PROSE-${suffix}`; req.idempotency_key=`IDEM-E2E-PROSE-${suffix}`;
  req.parent_state_version=parent.state_version; req.parent_state_digest=parent.state_digest; req.source_identity_refs=[clone(source)]; req.target_refs=[parent.active.canonical_manuscript_ref]; req.projection.exact_manuscript_identity=parent.active.canonical_manuscript_ref;
  const res = clone(runtimeFixtures.prose_response_template);
  res.response_id=`RESP-E2E-PROSE-${suffix}`; res.request_id=req.request_id; res.correlation_id=req.correlation_id; res.idempotency_key=req.idempotency_key; res.parent_projection_identity={parent_state_version:parent.state_version,parent_state_digest:parent.state_digest}; res.source_identity_refs=[clone(source)];
  return { source, request:req, response:res };
}
function documentPair(parent, suffix = 'A') {
  const source = manuscriptIdentity(parent);
  const req = clone(runtimeFixtures.document_request_template);
  req.request_id=`REQ-E2E-DOC-${suffix}`; req.correlation_id=`CORR-E2E-DOC-${suffix}`; req.idempotency_key=`IDEM-E2E-DOC-${suffix}`;
  req.parent_state_version=parent.state_version; req.parent_state_digest=parent.state_digest; req.source_identity_refs=[clone(source)]; req.projection.exact_source_identity=parent.active.canonical_manuscript_ref;
  const res = clone(runtimeFixtures.document_response_template);
  res.response_id=`RESP-E2E-DOC-${suffix}`; res.request_id=req.request_id; res.correlation_id=req.correlation_id; res.idempotency_key=req.idempotency_key; res.parent_projection_identity={parent_state_version:parent.state_version,parent_state_digest:parent.state_digest}; res.source_identity_refs=[clone(source)];
  return { source, request:req, response:res };
}
function runtimeIntake(ctx, pair, options = {}) {
  const ledger = rt.createLedger(ctx.parent,{source_identity_refs:[pair.source]});
  const request = clone(pair.request); const response=clone(pair.response);
  Object.assign(response, clone(options.responsePatch || {}));
  if (options.requestPatch) Object.assign(request, clone(options.requestPatch));
  const out=rt.intakeServiceResponse({registry,parentState:ctx.parent,ledger,request,response});
  return {out,ledger:out.ledger,request,response};
}
function admittedProseContext(status='PROSE_REFINEMENT', suffix='ADMIT') {
  let ctx=setup(status); const pair=prosePair(ctx.parent,suffix); let rledger=rt.createLedger(ctx.parent,{source_identity_refs:[pair.source]});
  let out=rt.intakeServiceResponse({registry,parentState:ctx.parent,ledger:rledger,request:pair.request,response:pair.response});
  ctx=recordExternalSuccessor(ctx,out.parentState,'INTEGRATION_RUNTIME',out.receipt,`${suffix}-INTAKE`); rledger=out.ledger; let proposalId=out.proposal_snapshot.proposal_id;
  for (const target of ['EVIDENCE_REVIEWED','PARENT_PREQUALIFIED','ADMITTED']) {
    out=rt.transitionProposal({parentState:ctx.parent,ledger:rledger,proposalId,targetState:target,authorDecisions:[]});
    rledger=out.ledger; proposalId=out.proposal_snapshot.proposal_id;
    ctx=recordExternalSuccessor(ctx,out.parentState,'INTEGRATION_RUNTIME',out.receipt,`${suffix}-${target}`);
  }
  return {ctx,rledger,proposalId,proposal:out.proposal_snapshot,pair};
}
function decisionOptions(consequence) { return [
  {option_id:'APPROVE',label:'Approve',effect:'Approve this synthetic qualification choice',consequence_class:consequence,canonical_decision_status:'APPROVED'},
  {option_id:'REJECT',label:'Reject',effect:'Reject this synthetic qualification choice',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'REJECTED'},
]; }
function addSyntheticAuthorDecision(ctx, decisionType, id, consequence='FINALIZATION') {
  const pre=ctx.parent; let q=adq.createQueueLedger(pre); const policy=consequence==='PUBLICATION_OR_RELEASE'?'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE':consequence==='ROUTINE_REVERSIBLE'?'NONE':'REVIEW_SELECTED_CHOICE';
  const enq={enqueue_request_id:`${id}-ENQ`,idempotency_key:`${id}-ENQ-IDEM`,actor_class:'PARENT_SYSTEM',expected_parent_state_version:pre.state_version,expected_parent_state_digest:pre.state_digest,expected_queue_ledger_version:q.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(q),source_authority_kind:'PARENT_DIRECT_AUTHOR_QUERY',source_handoff_refs:[`SYNTHETIC:${id}:PARENT_QUERY`],decision_type:decisionType,subject_ref:pre.active.canonical_manuscript_ref,subject_identity_refs:[manuscriptIdentity(pre)],options:decisionOptions(consequence),custom_option_allowed:false,evidence_refs:[`SYNTHETIC:${id}:EVIDENCE`],disagreement_refs:[],consequence_summary:'SYNTHETIC QUALIFICATION FIXTURE ONLY; not real author consent or production authorization.',confirmation_policy:policy,created_at:'2026-09-09T23:40:00Z',synthetic_fixture:true};
  const e=adq.enqueueDecision({parentState:pre,queueLedger:q,request:enq}); q=e.queue_ledger; const snap=e.decision_request; const selected='OPTION:APPROVE';
  const confirmation=policy==='NONE'?null:{confirmed:true,decision_request_digest:adq.digestDecisionRequest(snap),selected_option_identity:selected,consequence_reviewed:policy==='REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE',confirmation_evidence_ref:`SYNTHETIC:${id}:CONFIRM`};
  const rr={resolution_request_id:`${id}-RESOLVE`,idempotency_key:`${id}-RESOLVE-IDEM`,author_actor_ref:'SYNTHETIC-AUTHOR-FIXTURE',author_authority_proof_ref:'SYNTHETIC-AUTHORITY-PROOF-FIXTURE',expected_parent_state_version:pre.state_version,expected_parent_state_digest:pre.state_digest,expected_queue_ledger_version:q.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(q),decision_request_id:snap.decision_request_id,expected_decision_request_version:snap.decision_request_version,expected_decision_request_digest:adq.digestDecisionRequest(snap),selected_option_id:'APPROVE',custom_author_choice:null,confirmation_evidence:confirmation,rationale_optional:'SYNTHETIC_FIXTURE_NOT_REAL_AUTHOR_AUTHORITY',resolved_at:'2026-09-09T23:41:00Z',synthetic_fixture:true};
  const out=adq.resolveDecision({parentState:pre,versionLedger:ctx.versionLedger,queueLedger:q,request:rr});
  let next={...ctx,parent:out.parent_state,versionLedger:out.version_ledger}; next=rebindOnly(next,pre,out.parent_state,'AUTHOR_DECISION',out.resolution_receipt,`REBIND-${id}`);
  return {ctx:next,out,enqueue:e,enqueueRequest:enq,resolutionRequest:rr,decision:out.author_decision};
}
function enqueueSyntheticDecision(ctx, id='E2E-PENDING', decisionType='FINALIZATION_APPROVAL') {
  let q=adq.createQueueLedger(ctx.parent); const req={enqueue_request_id:`${id}-ENQ`,idempotency_key:`${id}-ENQ-IDEM`,actor_class:'PARENT_SYSTEM',expected_parent_state_version:ctx.parent.state_version,expected_parent_state_digest:ctx.parent.state_digest,expected_queue_ledger_version:q.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(q),source_authority_kind:'PARENT_DIRECT_AUTHOR_QUERY',source_handoff_refs:[`SYNTHETIC:${id}`],decision_type:decisionType,subject_ref:ctx.parent.active.canonical_manuscript_ref,subject_identity_refs:[manuscriptIdentity(ctx.parent)],options:decisionOptions('FINALIZATION'),custom_option_allowed:false,evidence_refs:[`SYNTHETIC:${id}:EVIDENCE`],disagreement_refs:[],consequence_summary:'Synthetic pending decision.',confirmation_policy:'REVIEW_SELECTED_CHOICE',created_at:'2026-09-09T23:42:00Z'}; const out=adq.enqueueDecision({parentState:ctx.parent,queueLedger:q,request:req}); return {queueLedger:out.queue_ledger,decisionRequest:out.decision_request,request:req};
}
function commitChangedManuscript(ctx, id='E2E-CHANGE') {
  const pre=ctx.parent; const proposed=clone(pre); const old=manuscriptRecord(pre); proposed.manuscripts.push({manuscript_id:old.object_id,version_id:'V2',artifact_digest:'b'.repeat(64),authority_state:'CANONICAL',parent_version_ref:`${old.object_id}:${old.object_version}`,change_set_ref:`${id}-CHANGESET`,created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-09T23:43:00Z'}); proposed.active.canonical_manuscript_ref=`${old.object_id}:V2`;
  const sealed=vr.sealState({...proposed,state_version:pre.state_version+1}); const newRec=vr.objectRecords(sealed).find(x=>x.type==='MANUSCRIPT_MANIFEST'&&x.object_version==='V2'); const bindings=currentBindings(ctx.versionLedger); bindings.canonical_manuscript_ref=newRec.node_id;
  const out=vr.commitSuccessor({parentState:pre,versionLedger:ctx.versionLedger,request:{request_id:id,idempotency_key:`${id}-IDEM`,actor_class:'PARENT_SYSTEM',expected_state_version:pre.state_version,expected_state_digest:pre.state_digest,expected_ledger_version:ctx.versionLedger.ledger_version,expected_ledger_digest:vr.digestLedger(ctx.versionLedger),proposed_parent_state:proposed,active_version_bindings:bindings,evidence_refs:[`SYNTHETIC:${id}`],author_decision_refs:[],lifecycle_transition_receipt:null}});
  let next={...ctx,parent:out.parent_state,versionLedger:out.version_ledger}; next=rebindOnly(next,pre,out.parent_state,'VERSION_ROLLBACK',out.receipt,`REBIND-${id}`); return {ctx:next,out,pre};
}
function freezeRequest(parent, ledger, authorDecisionRefs=[], patch={}) {
  const m=manuscriptRecord(parent); const req=clone(exportFixtures.base_request); req.freeze_request_id=`FREEZE-E2E-${parent.state_version}`; req.idempotency_key=`FREEZE-E2E-${parent.state_version}-IDEM`; req.release_id=`RELEASE-E2E-${parent.state_version}`; req.expected_parent_state_version=parent.state_version; req.expected_parent_state_digest=parent.state_digest; req.expected_freeze_ledger_version=ledger.ledger_version; req.expected_freeze_ledger_digest=ef.digestFreezeLedger(ledger); req.canonical_manuscript_identity={manuscript_id:m.object_id,version_id:m.object_version,artifact_digest:m.payload.artifact_digest}; req.artifact_evidence.source_manuscript_id=m.object_id; req.artifact_evidence.source_version_id=m.object_version; req.artifact_evidence.source_digest=m.payload.artifact_digest; req.parent_admission_refs=['SYNTHETIC-DOCUMENT-ADMISSION-001']; req.author_decision_refs=clone(authorDecisionRefs); req.created_at='2026-09-09T23:45:00Z'; return Object.assign(req,clone(patch));
}
function happyFreeze({toFrozen=true}={}) {
  let ctx=setup('FINALIZATION'); const a=addSyntheticAuthorDecision(ctx,'EXPORT_FREEZE_APPROVAL','E2E-FREEZE-AUTH','FINALIZATION'); ctx=a.ctx; const fl=ef.createFreezeLedger(ctx.parent); const req=freezeRequest(ctx.parent,fl,[a.decision.decision_id]); const pre=ctx.parent; const out=ef.freezeExport({parentState:pre,freezeLedger:fl,request:req}); ctx=recordExternalSuccessor(ctx,out.parent_state,'EXPORT_RELEASE',out.release_receipt,'E2E-FREEZE-RELEASE'); const afterRelease=ctx; if(toFrozen) ctx=applyLifecycle(ctx,'EXPORT_FROZEN',[out.release.release_id],[],[],'E2E-LIFE-EXPORT-FROZEN'); return {ctx,afterRelease,author:a,freeze:out,freezeLedger:out.freeze_ledger,request:req};
}
function lifecycleAttempt(ctx,target,evidence=[],authors=[],proposals=[],id='E2E-LIFE-TRY',patch={}) { return adapter.applyTransition(lifecycleContract,ctx.parent,ctx.lifecycleLedger,lifecycleRequest(ctx,target,evidence,authors,proposals,id,patch)); }

const subjects={
  canonical:'b6938fcfc5c2c24ac23b558de6dfc7f75c382312', registry:'77db6b550e9aeb1dfb956627376becbb591498f8', lifecycle:'4a6e3459d6ba94b7ce191e426ca64bef00d23582', runtime:'837e479415afb2d9724e4b913d456ef1d3a62df5', version:'402ab84a14e9d345530d60394ebc36176541dd21', author:'9601ae5df8348c1daac8805eaefa1718c431dd49', adapter:'fc5adf8fd130d7b5324cff0058ab3804d75ec54e', exportFreeze:'0bc1f96ed0b8effd22c432a7d727fd13d613b825', rebind:'ffbcc2ab36a41afb580224681642105deb62e741'
};

const tests={}; function test(id,fn){tests[id]=fn;}

test('E2E001_PREDECESSOR_CLOSURES_ALL_EXACT_SHA_BOUND',()=>{ assert(map.qualified_predecessors.length===8,'PREDECESSOR_COUNT'); const got=new Set(map.qualified_predecessors.map(x=>x.subject_sha)); for(const k of ['canonical','registry','lifecycle','runtime','version','author','adapter','exportFreeze']) assert(got.has(subjects[k]),'PREDECESSOR_SHA_MISSING',k); assert(state020.closed_since_state_019.qualified_subject_sha===subjects.rebind,'REBIND_SHA_NOT_BOUND'); assert(sameHistoricalBytes(subjects.registry,rel.registry),'REGISTRY_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.lifecycle,rel.lifecycle),'LIFECYCLE_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.runtime,'system-master/book-system/integration-proposal-runtime-v2-core.js'),'RUNTIME_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.version,rel.version),'VERSION_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.author,rel.author),'AUTHOR_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.adapter,rel.adapter),'ADAPTER_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.exportFreeze,rel.exportFreeze),'EXPORT_BYTES_DRIFT'); assert(sameHistoricalBytes(subjects.rebind,rel.rebind),'REBIND_BYTES_DRIFT'); });
test('E2E002_CURRENT_PARENT_VALID_AND_SEALED',()=>{const c=setup(); assert(vr.validateParentState(c.parent)===true,'PARENT_INVALID'); assert(vr.computeStateDigest(c.parent)===c.parent.state_digest,'PARENT_NOT_SEALED');});
test('E2E003_VERSION_LEDGER_BINDS_INITIAL_PARENT',()=>{const c=setup(); assert(c.versionLedger.bound_parent_state_version===c.parent.state_version&&c.versionLedger.bound_parent_state_digest===c.parent.state_digest,'VERSION_BINDING_FAIL');});
test('E2E004_PROVIDER_SUCCESS_HAS_ZERO_CANONICAL_AUTHORITY',()=>{const c=setup(); const pair=prosePair(c.parent,'004'); const before=rt.protectedParentFingerprint(c.parent); const x=runtimeIntake(c,pair); assert(x.out.parentState.state_version===c.parent.state_version+1,'PARENT_PROPOSAL_SUCCESSOR_EXPECTED'); assert(rt.protectedParentFingerprint(x.out.parentState)===before,'PROTECTED_PARENT_MUTATED'); assert(pair.request.authority_context.canonical_write_allowed===false&&pair.response.publication_authorized!==true,'PROVIDER_AUTHORITY_WIDENED');});
test('E2E005_PROVIDER_PARTIAL_PRESERVED_NO_ADVANCE',()=>{const c=setup(); const pair=prosePair(c.parent,'005'); pair.response.result_class='PARTIAL';pair.response.requested_parent_action='NONE'; const x=runtimeIntake(c,pair); assert(x.out.parentState.state_digest===c.parent.state_digest&&x.out.intake_record.result_class==='PARTIAL','PARTIAL_ADVANCED');});
test('E2E006_PROVIDER_ABSTAIN_PRESERVED_NO_ADVANCE',()=>{const c=setup(); const pair=prosePair(c.parent,'006');pair.response.result_class='ABSTAIN';pair.response.abstentions=['SYNTHETIC:INSUFFICIENT_EVIDENCE'];pair.response.requested_parent_action='NONE';const x=runtimeIntake(c,pair);assert(x.out.parentState.state_digest===c.parent.state_digest&&x.out.intake_record.intake_disposition==='ABSTENTION_PRESERVED','ABSTAIN_ADVANCED');});
test('E2E007_PROVIDER_ERROR_PRESERVED_NO_ADVANCE',()=>{const c=setup();const pair=prosePair(c.parent,'007');pair.response.result_class='ERROR';pair.response.warnings=['SYNTHETIC_ERROR'];pair.response.requested_parent_action='NONE';const x=runtimeIntake(c,pair);assert(x.out.parentState.state_digest===c.parent.state_digest&&x.out.intake_record.intake_disposition==='ERROR_PRESERVED','ERROR_ADVANCED');});
test('E2E008_PROVIDER_DISAGREEMENT_PRESERVED',()=>{const c=setup();const pair=prosePair(c.parent,'008');pair.response.requested_parent_action='NONE';pair.response.disagreement_state={state:'MATERIAL',minority_evidence_refs:['SYNTHETIC:MINORITY']};const x=runtimeIntake(c,pair);assert(x.out.intake_record.disagreement_state.state==='MATERIAL','DISAGREEMENT_LOST');});
test('E2E009_STALE_PROVIDER_SOURCE_BLOCKS_ADMISSION_OR_ADVANCE',()=>{const c=setup();const pair=prosePair(c.parent,'009');let l=rt.createLedger(c.parent,{source_identity_refs:[pair.source]});l=rt.updateSourceIdentity(l,{object_id:pair.source.object_id,object_version:'V999',object_digest:'f'.repeat(64)});const out=rt.intakeServiceResponse({registry,parentState:c.parent,ledger:l,request:pair.request,response:pair.response});assert(out.parentState.state_digest===c.parent.state_digest&&out.proposal_snapshot===null&&out.disposition==='SUPERSEDED_SOURCE_PRESERVED','STALE_SOURCE_ADVANCED');});
test('E2E010_PROVIDER_DIRECT_LIFECYCLE_TRANSITION_DENIED',()=>{const c=setup('DRAFTING');const r=lifecycleRequest(c,'STRUCTURAL_REVIEW',['E2E-EV-STRUCT-READY'],[],[],'E2E010',{actor_class:'PROSE_SYSTEM'});expectError(()=>adapter.applyTransition(lifecycleContract,c.parent,c.lifecycleLedger,r),'TRANSITION_AUTHORITY_DENIED');});
test('E2E011_PROVIDER_EXPORT_FROZEN_CLAIM_DENIED',()=>{const c=setup();const pair=prosePair(c.parent,'011');pair.response.export_freeze_allowed=true;const l=rt.createLedger(c.parent,{source_identity_refs:[pair.source]});expectError(()=>rt.intakeServiceResponse({registry,parentState:c.parent,ledger:l,request:pair.request,response:pair.response}),'PROVIDER_AUTHORITY_CLAIM_FORBIDDEN');});
test('E2E012_PROVIDER_PUBLICATION_CLAIM_DENIED',()=>{const c=setup();const pair=prosePair(c.parent,'012');pair.response.publication_authorized=true;const l=rt.createLedger(c.parent,{source_identity_refs:[pair.source]});expectError(()=>rt.intakeServiceResponse({registry,parentState:c.parent,ledger:l,request:pair.request,response:pair.response}),'PROVIDER_AUTHORITY_CLAIM_FORBIDDEN');});
test('E2E013_PARENT_PROPOSAL_IDENTITY_SURVIVES_HANDOFF',()=>{const x=admittedProseContext('PROSE_REFINEMENT','013');assert(x.proposal.admission_state==='ADMITTED','NOT_ADMITTED');assert(x.proposal.source_request_id===x.pair.request.request_id&&x.proposal.source_response_id===x.pair.response.response_id,'HANDOFF_IDENTITY_LOST');assert(x.ctx.parent.integration_proposals.some(p=>p.proposal_id===x.proposalId),'PARENT_PROPOSAL_MISSING');});
test('E2E014_VERSION_ROLLBACK_RECORDS_PARENT_SUCCESSOR_ONLY_WITH_EXACT_RECEIPT',()=>{const c=setup();const pair=prosePair(c.parent,'014');const x=runtimeIntake(c,pair);const good=vr.recordAuthorizedParentSuccessor({parentState:c.parent,versionLedger:c.versionLedger,request:{request_id:'E2E014-GOOD',idempotency_key:'E2E014-GOOD-IDEM',actor_class:'PARENT_SYSTEM',expected_state_version:c.parent.state_version,expected_state_digest:c.parent.state_digest,expected_ledger_version:c.versionLedger.ledger_version,expected_ledger_digest:vr.digestLedger(c.versionLedger),authority_kind:'INTEGRATION_RUNTIME',authority_receipt:x.out.receipt,committed_parent_state:x.out.parentState,active_version_bindings:currentBindings(c.versionLedger)}});assert(good.parent_state.state_digest===x.out.parentState.state_digest,'GOOD_RECEIPT_NOT_RECORDED');const bad=clone(x.out.receipt);bad.pre_parent_state_digest='0'.repeat(64);expectError(()=>vr.recordAuthorizedParentSuccessor({parentState:c.parent,versionLedger:c.versionLedger,request:{request_id:'E2E014-BAD',idempotency_key:'E2E014-BAD-IDEM',actor_class:'PARENT_SYSTEM',expected_state_version:c.parent.state_version,expected_state_digest:c.parent.state_digest,expected_ledger_version:c.versionLedger.ledger_version,expected_ledger_digest:vr.digestLedger(c.versionLedger),authority_kind:'INTEGRATION_RUNTIME',authority_receipt:bad,committed_parent_state:x.out.parentState,active_version_bindings:currentBindings(c.versionLedger)}}),'PARENT_AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH');});
test('E2E015_UNRESOLVED_AUTHOR_REQUIRED_GATE_BLOCKS',()=>{const c=setup('AUTHOR_REVIEW');expectError(()=>lifecycleAttempt(c,'FINALIZATION',['E2E-EV-AUTHOR-REVIEW-COMPLETE'],[],[],'E2E015'),'REQUIRED_AUTHOR_DECISION_MISSING');});
test('E2E016_MODEL_OR_PROVIDER_CANNOT_SYNTHESIZE_AUTHOR_CHOICE',()=>{const c=setup('AUTHOR_REVIEW');const p=enqueueSyntheticDecision(c,'E2E016');const snap=p.decisionRequest;const rr={resolution_request_id:'E2E016-RESOLVE',idempotency_key:'E2E016-RESOLVE-IDEM',author_actor_ref:'PROSE_SYSTEM',author_authority_proof_ref:'',expected_parent_state_version:c.parent.state_version,expected_parent_state_digest:c.parent.state_digest,expected_queue_ledger_version:p.queueLedger.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(p.queueLedger),decision_request_id:snap.decision_request_id,expected_decision_request_version:snap.decision_request_version,expected_decision_request_digest:adq.digestDecisionRequest(snap),selected_option_id:'APPROVE',custom_author_choice:null,confirmation_evidence:{confirmed:true,decision_request_digest:adq.digestDecisionRequest(snap),selected_option_identity:'OPTION:APPROVE',consequence_reviewed:false,confirmation_evidence_ref:'SYNTHETIC:E2E016'},rationale_optional:null,resolved_at:'2026-09-09T23:50:00Z'};expectError(()=>adq.resolveDecision({parentState:c.parent,versionLedger:c.versionLedger,queueLedger:p.queueLedger,request:rr}),'AUTHOR_AUTHORITY_PROOF_REQUIRED');});
test('E2E017_SYNTHETIC_AUTHOR_FIXTURE_EXPLICITLY_LABELED',()=>{const c=setup('AUTHOR_REVIEW');const a=addSyntheticAuthorDecision(c,'FINALIZATION_APPROVAL','E2E017','FINALIZATION');assert(a.resolutionRequest.author_actor_ref.startsWith('SYNTHETIC-')&&a.resolutionRequest.author_authority_proof_ref.startsWith('SYNTHETIC-')&&String(a.resolutionRequest.rationale_optional).includes('SYNTHETIC_FIXTURE'),'SYNTHETIC_LABEL_MISSING');});
test('E2E018_SYNTHETIC_AUTHOR_DECISION_CAN_SATISFY_SOFTWARE_GATE',()=>{let c=setup('AUTHOR_REVIEW');const a=addSyntheticAuthorDecision(c,'FINALIZATION_APPROVAL','E2E018','FINALIZATION');c=a.ctx;c=applyLifecycle(c,'FINALIZATION',['E2E-EV-AUTHOR-REVIEW-COMPLETE'],[a.decision.decision_id],[],'E2E018-LIFE');assert(c.parent.book_project.status==='FINALIZATION','SYNTHETIC_AUTHOR_GATE_DID_NOT_COMMIT');});
test('E2E019_CHANGED_AUTHOR_SUBJECT_INVALIDATES_PRIOR_DECISION_FOR_NEW_SUBJECT',()=>{let c=setup('AUTHOR_REVIEW');const pending=enqueueSyntheticDecision(c,'E2E019');const changed=commitChangedManuscript(c,'E2E019-CHANGE');const reval=adq.revalidateAgainstParent({previousParentState:c.parent,currentParentState:changed.ctx.parent,queueLedger:pending.queueLedger,request:{revalidation_request_id:'E2E019-REVAL',idempotency_key:'E2E019-REVAL-IDEM',actor_class:'PARENT_SYSTEM',expected_queue_ledger_version:pending.queueLedger.queue_ledger_version,expected_queue_ledger_digest:adq.digestQueueLedger(pending.queueLedger),revalidation_evidence_refs:['SYNTHETIC:E2E019:REVALIDATE'],revalidated_at:'2026-09-09T23:51:00Z'}});const currentId=reval.queue_ledger.current_request_index[Object.keys(reval.queue_ledger.current_request_index)[0]];const snap=reval.queue_ledger.decision_request_snapshots[currentId];assert(snap.queue_state==='STALE','CHANGED_SUBJECT_DID_NOT_STALE_AUTHOR_REQUEST');});
test('E2E020_AUTHOR_DECISION_APPEND_RECORDED_BY_VERSION_ROLLBACK',()=>{const c=setup('AUTHOR_REVIEW');const a=addSyntheticAuthorDecision(c,'FINALIZATION_APPROVAL','E2E020','FINALIZATION');assert(a.ctx.parent.author_decisions.some(d=>d.decision_id===a.decision.decision_id),'DECISION_NOT_APPENDED');assert(a.ctx.versionLedger.version_receipts[a.out.version_receipt.receipt_id],'VERSION_RECEIPT_MISSING');assert(a.out.resolution_receipt.version_rollback_authority_handoff_ref===a.out.version_receipt.receipt_id,'VERSION_HANDOFF_MISMATCH');});
test('E2E021_DOCUMENT_PROVIDER_SUCCESS_ALONE_CANNOT_FREEZE',()=>{const c=setup('FINALIZATION');const pair=documentPair(c.parent,'021');pair.response.requested_parent_action='NONE';const l=rt.createLedger(c.parent,{source_identity_refs:[pair.source]});const doc=rt.intakeServiceResponse({registry,parentState:c.parent,ledger:l,request:pair.request,response:pair.response});assert(doc.intake_record.result_class==='SUCCESS','DOC_SUCCESS_SETUP_FAIL');const fl=ef.createFreezeLedger(c.parent);const req=freezeRequest(c.parent,fl,[]);req.parent_admission_refs=[];expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),['AUTHOR_DECISION_REF_REQUIRED','PARENT_ADMISSION_REF_REQUIRED','EXPORT_FREEZE_PARENT_AUTHORITY_REQUIRED']);});
test('E2E022_STALE_ARTIFACT_CANNOT_FREEZE',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);const req=freezeRequest(c.parent,fl,[]);req.artifact_evidence.artifact_currentness='STALE_SOURCE';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'EXPORT_ARTIFACT_NOT_CURRENT');});
test('E2E023_FAILED_PROOF_CANNOT_FREEZE',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);const req=freezeRequest(c.parent,fl,[]);req.target_medium_evidence.proof_result='FAIL';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'POST_LAYOUT_PROOF_NOT_PASS');});
test('E2E024_OPEN_CORRECTION_CANNOT_FREEZE',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);const req=freezeRequest(c.parent,fl,[]);req.target_medium_evidence.correction_ledger_state='OPEN';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'CORRECTION_LEDGER_NOT_CLOSED_CURRENT');});
test('E2E025_RIGHTS_OR_PRIVACY_BLOCK_CANNOT_FREEZE',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);let req=freezeRequest(c.parent,fl,[]);req.rights_privacy_evidence.rights_state='BLOCKED';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'RIGHTS_NOT_CURRENT_AUTHORIZED');req=freezeRequest(c.parent,fl,[]);req.rights_privacy_evidence.privacy_state='BLOCKED';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'PRIVACY_NOT_CURRENT_ALLOWED');});
test('E2E026_STALE_OR_INVALID_PROVENANCE_CANNOT_FREEZE',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);let req=freezeRequest(c.parent,fl,[]);req.provenance_evidence.currentness_state='SUPERSEDED_FOR_CURRENT_RELEASE';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'PROVENANCE_NOT_CURRENT');req=freezeRequest(c.parent,fl,[]);req.provenance_evidence.validation_result='FAIL';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'PROVENANCE_VALIDATION_NOT_PASS');});
test('E2E027_VALID_FREEZE_APPENDS_ONE_RELEASE_ONLY',()=>{const h=happyFreeze({toFrozen:false});assert(h.freeze.parent_state.export_releases.length===1&&h.freeze.release.approval_state==='FROZEN','FREEZE_RELEASE_COUNT');});
test('E2E028_FREEZE_DOES_NOT_MUTATE_LIFECYCLE',()=>{const h=happyFreeze({toFrozen:false});assert(h.freeze.parent_state.book_project.status==='FINALIZATION'&&h.freeze.release.publication_authority_state==='NOT_AUTHORIZED','FREEZE_MUTATED_LIFECYCLE_OR_PUBLICATION');});
test('E2E029_VERSION_ROLLBACK_RECORDS_EXPORT_RELEASE_SUCCESSOR',()=>{const h=happyFreeze({toFrozen:false});assert(h.afterRelease.lastVersionReceipt.authority_kind==='EXPORT_RELEASE'&&h.afterRelease.versionLedger.bound_parent_state_digest===h.afterRelease.parent.state_digest,'EXPORT_RELEASE_NOT_VERSION_RECORDED');});
test('E2E030_LIFECYCLE_ADAPTER_TRANSITIONS_FINALIZATION_TO_EXPORT_FROZEN',()=>{const h=happyFreeze();assert(h.ctx.parent.book_project.status==='EXPORT_FROZEN'&&h.ctx.lastLifecycleReceipt.from_status==='FINALIZATION','EXPORT_FROZEN_TRANSITION_FAIL');});
test('E2E031_VERSION_ROLLBACK_RECORDS_LIFECYCLE_SUCCESSOR',()=>{const h=happyFreeze();assert(h.ctx.lastVersionReceipt.authority_kind==='LIFECYCLE_TRANSITION'&&h.ctx.versionLedger.bound_parent_state_digest===h.ctx.parent.state_digest,'LIFECYCLE_SUCCESSOR_NOT_VERSION_RECORDED');});
test('E2E032_EXPORT_FROZEN_STILL_HAS_ZERO_PUBLICATION_AUTHORITY',()=>{const h=happyFreeze();assert(h.ctx.parent.book_project.status==='EXPORT_FROZEN'&&h.freeze.release.publication_authority_state==='NOT_AUTHORIZED','PUBLICATION_AUTHORITY_SYNTHESIZED');});
test('E2E033_TECHNICAL_PASS_CANNOT_PUBLISH',()=>{const h=happyFreeze();expectError(()=>lifecycleAttempt(h.ctx,'PUBLISHED_OR_DELIVERED',[h.freeze.release.release_id],[],[],'E2E033'),'REQUIRED_TRANSITION_EVIDENCE_MISSING');});
test('E2E034_C2PA_OR_PROVENANCE_PASS_CANNOT_PUBLISH',()=>{const h=happyFreeze();const p=clone(h.ctx.parent);assert(h.request.provenance_evidence.validation_result==='PASS','PROVENANCE_PASS_SETUP');expectError(()=>lifecycleAttempt(h.ctx,'PUBLISHED_OR_DELIVERED',[h.freeze.release.release_id],[],[],'E2E034'),'REQUIRED_TRANSITION_EVIDENCE_MISSING');assert(p.book_project.status==='EXPORT_FROZEN','PROVENANCE_CHANGED_STATE');});
test('E2E035_PUBLICATION_GATE_REQUIRES_EXPLICIT_RECORDED_AUTHORITY',()=>{const h=happyFreeze();expectError(()=>lifecycleAttempt(h.ctx,'PUBLISHED_OR_DELIVERED',['E2E-EV-SYN-PUBLICATION'],[],[],'E2E035'),'REQUIRED_AUTHOR_DECISION_MISSING');});
test('E2E036_SYNTHETIC_PUBLICATION_GATE_FIXTURE_NOT_REAL_AUTHORIZATION',()=>{let h=happyFreeze();const a=addSyntheticAuthorDecision(h.ctx,'PUBLICATION_AUTHORIZATION','E2E036-PUB','PUBLICATION_OR_RELEASE');h.ctx=a.ctx;h.ctx=applyLifecycle(h.ctx,'PUBLISHED_OR_DELIVERED',['E2E-EV-SYN-PUBLICATION'],[a.decision.decision_id],[],'E2E036-LIFE');assert(h.ctx.parent.book_project.status==='PUBLISHED_OR_DELIVERED','SYNTHETIC_PUBLICATION_GATE_FAIL');assert(a.resolutionRequest.author_actor_ref==='SYNTHETIC-AUTHOR-FIXTURE'&&a.resolutionRequest.author_authority_proof_ref==='SYNTHETIC-AUTHORITY-PROOF-FIXTURE','SYNTHETIC_PUBLICATION_MISLABELED');});
test('E2E037_CHANGED_MANUSCRIPT_MAKES_OLD_ARTIFACT_STALE',()=>{const c=setup('FINALIZATION');const old=manuscriptRecord(c.parent);const changed=commitChangedManuscript(c,'E2E037');const fl=ef.createFreezeLedger(changed.ctx.parent);const req=freezeRequest(changed.ctx.parent,fl,[]);req.canonical_manuscript_identity={manuscript_id:old.object_id,version_id:old.object_version,artifact_digest:old.payload.artifact_digest};req.artifact_evidence.source_manuscript_id=old.object_id;req.artifact_evidence.source_version_id=old.object_version;req.artifact_evidence.source_digest=old.payload.artifact_digest;expectError(()=>ef.freezeExport({parentState:changed.ctx.parent,freezeLedger:fl,request:req}),['CANONICAL_MANUSCRIPT_IDENTITY_MISMATCH','EXPORT_SOURCE_MANUSCRIPT_MISMATCH']);});
test('E2E038_CHANGED_ARTIFACT_BYTES_REQUIRE_NEW_DIGEST_AND_RELEASE_ID',()=>{const h=happyFreeze({toFrozen:false});const parent=h.afterRelease.parent;const fl=h.freeze.freeze_ledger;const req=freezeRequest(parent,fl,[h.author.decision.decision_id]);req.release_id=h.freeze.release.release_id;req.artifact_evidence.artifact_digest='d'.repeat(64);req.target_medium_evidence.rendered_candidate_digest='d'.repeat(64);req.provenance_evidence.bound_artifact_digest='d'.repeat(64);expectError(()=>ef.freezeExport({parentState:parent,freezeLedger:fl,request:req}),'RELEASE_ID_CONFLICT');const req2=clone(req);req2.freeze_request_id='E2E038-NEW';req2.idempotency_key='E2E038-NEW-IDEM';req2.release_id='RELEASE-E2E-CHANGED-BYTES';req2.expected_parent_state_version=parent.state_version;req2.expected_parent_state_digest=parent.state_digest;req2.expected_freeze_ledger_version=fl.ledger_version;req2.expected_freeze_ledger_digest=ef.digestFreezeLedger(fl);const out=ef.freezeExport({parentState:parent,freezeLedger:fl,request:req2});assert(out.release.digest==='d'.repeat(64)&&out.release.release_id==='RELEASE-E2E-CHANGED-BYTES','CHANGED_BYTES_NEW_IDENTITY_FAIL');});
test('E2E039_ROLLBACK_PRESERVES_OLD_RELEASE_HISTORY_WITHOUT_REBIND',()=>{const h=happyFreeze({toFrozen:false});const c=h.afterRelease;const snapshots=Object.values(c.versionLedger.state_snapshots).sort((a,b)=>a.state_version-b.state_version);const target=snapshots[0];const out=vr.restoreAsNewSuccessor({parentState:c.parent,versionLedger:c.versionLedger,request:{request_id:'E2E039-RESTORE',idempotency_key:'E2E039-RESTORE-IDEM',actor_class:'PARENT_SYSTEM',expected_state_version:c.parent.state_version,expected_state_digest:c.parent.state_digest,expected_ledger_version:c.versionLedger.ledger_version,expected_ledger_digest:vr.digestLedger(c.versionLedger),target_state_version:target.state_version,target_state_digest:target.state_digest,mode:'RESTORE_CONTENT',revalidation:{rights_privacy_current:true,critical_evidence_resolved:true,dependency_revalidation_refs:[],binding_checks:[],author_decision_required:false,author_decision_refs:[],lifecycle_transition_receipt:null}}});assert(out.parent_state.export_releases.some(r=>r.release_id===h.freeze.release.release_id),'RELEASE_HISTORY_LOST_ON_RESTORE');const r=out.parent_state.export_releases.find(x=>x.release_id===h.freeze.release.release_id);assert(r.digest===h.freeze.release.digest&&r.canonical_manuscript_digest===h.freeze.release.canonical_manuscript_digest,'OLD_RELEASE_REBOUND');});
test('E2E040_IDEMPOTENT_REPLAY_DOES_NOT_DUPLICATE_PROPOSAL_DECISION_OR_RELEASE',()=>{const c=setup();const pair=prosePair(c.parent,'040');const l=rt.createLedger(c.parent,{source_identity_refs:[pair.source]});const first=rt.intakeServiceResponse({registry,parentState:c.parent,ledger:l,request:pair.request,response:pair.response});const second=rt.intakeServiceResponse({registry,parentState:first.parentState,ledger:first.ledger,request:pair.request,response:pair.response});assert(second.disposition==='REPLAY'&&second.parentState.integration_proposals.length===first.parentState.integration_proposals.length,'PROPOSAL_REPLAY_DUPLICATED');const h=happyFreeze({toFrozen:false});const replay=ef.freezeExport({parentState:h.freeze.parent_state,freezeLedger:h.freeze.freeze_ledger,request:h.request});assert(replay.disposition==='REPLAY'&&replay.parent_state.export_releases.length===1,'RELEASE_REPLAY_DUPLICATED');});
test('E2E041_CONCURRENT_PARENT_VERSION_REJECTED',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);const req=freezeRequest(c.parent,fl,[]);req.expected_parent_state_version+=1;expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'STALE_PARENT_WRITE');});
test('E2E042_CONCURRENT_LEDGER_VERSION_REJECTED',()=>{const c=setup('DRAFTING');const r=lifecycleRequest(c,'STRUCTURAL_REVIEW',['E2E-EV-STRUCT-READY'],[],[],'E2E042',{expected_ledger_version:c.lifecycleLedger.ledger_version+1});expectError(()=>adapter.applyTransition(lifecycleContract,c.parent,c.lifecycleLedger,r),'LEDGER_VERSION_MISMATCH');});
test('E2E043_FAILURE_PATH_PRESERVES_INPUT_STATE',()=>{const c=setup('FINALIZATION');const fl=ef.createFreezeLedger(c.parent);const pd=c.parent.state_digest,ld=ef.digestFreezeLedger(fl);const req=freezeRequest(c.parent,fl,[]);req.target_medium_evidence.proof_result='FAIL';expectError(()=>ef.freezeExport({parentState:c.parent,freezeLedger:fl,request:req}),'POST_LAYOUT_PROOF_NOT_PASS');assert(c.parent.state_digest===pd&&ef.digestFreezeLedger(fl)===ld,'FAILED_FREEZE_MUTATED_INPUT');});
test('E2E044_NO_BOOK_DOCUMENT_ENGINE_EXPORTS',()=>{const names=fs.readdirSync(path.join(workspace,'system-master/book-system'));const bad=names.filter(n=>/(pdf|docx|epub|renderer|render-engine|conversion-engine)/i.test(n));assert(bad.length===0,'BOOK_DOCUMENT_ENGINE_FOUND',bad.join(','));assert(typeof ef.freezeExport==='function'&&typeof ef.createFreezeLedger==='function','EXPORT_POLICY_API_MISSING');});
test('E2E045_NO_NEW_LIFECYCLE_POLICY_OR_TRANSITION_TYPES',()=>{assert(sameHistoricalBytes(subjects.lifecycle,rel.lifecycle),'LIFECYCLE_ENGINE_CHANGED');assert(sameHistoricalBytes(subjects.lifecycle,rel.lifecycleContract),'LIFECYCLE_CONTRACT_CHANGED');});
test('E2E046_PROSE_REMAINS_CHILD_EVIDENCE_SOURCE_NO_SELF_ADMISSION',()=>{const c=setup();const pair=prosePair(c.parent,'046');const x=runtimeIntake(c,pair);assert(registry.services.PROSE_ANALYSIS_AND_REVISION.canonical_owner_path==='SYSTEM_MASTER/BOOK/PROSE','PROSE_HIERARCHY_WRONG');assert(x.out.proposal_snapshot.admission_state==='PROPOSED','PROSE_SELF_ADMITTED');assert(pair.response.provider_class==='PROSE_SYSTEM'&&pair.request.authority_context.canonical_write_allowed===false,'PROSE_AUTHORITY_WIDENED');});
test('E2E047_END_STATE_EVIDENCE_SCOPE_NOT_PRODUCTION_STANDING',()=>{const h=happyFreeze();assert(h.ctx.parent.book_project.status==='EXPORT_FROZEN','QUALIFICATION_END_STATE_UNEXPECTED');assert(h.freeze.release.publication_authority_state==='NOT_AUTHORIZED','QUALIFICATION_BECAME_PRODUCTION');assert(state020.qualification_effect.includes('NO_REAL_AUTHOR_OR_PUBLICATION_AUTHORITY'),'STATE020_SCOPE_WIDENED');});
test('E2E048_NO_PREDECESSOR_QUALIFICATION_TRANSFER_TO_E2E_SUBJECT',()=>{const head=gitHead();assert(!Object.values(subjects).includes(head),'E2E_SUBJECT_EQUALS_PREDECESSOR');assert(map.harness_rules.some(x=>String(x).includes('hosted PASS is prequalification only')),'EXACT_SHA_E2E_RULE_MISSING');});

const expectedIds=map.target_matrix;
const results=[]; let failures=0;
for(const id of expectedIds){
  const fn=tests[id];
  if(!fn){results.push({id,result:'FAIL',code:'TEST_NOT_IMPLEMENTED'});failures++;continue;}
  try{fn();results.push({id,result:'PASS'});}catch(e){results.push({id,result:'FAIL',code:e&&e.code||'ERROR',detail:e&&e.message||String(e)});failures++;}
}
const head=gitHead();
const summary={qualification_id:'BOOK-SYSTEM-END-TO-END-AUTHORING-QUALIFICATION-001',subject_sha:head,target_case_count:48,case_count:results.length,pass_count:results.filter(x=>x.result==='PASS').length,fail_count:failures,result_class:failures===0?'PASS':'FAIL',standing:'QUALIFICATION_ONLY_SYNTHETIC_COMPOSITION_EVIDENCE__NO_PRODUCTION_OR_REAL_AUTHOR_AUTHORITY',synthetic_fixture_notice:'All provider, author, publication and document evidence used by this harness is synthetic qualification evidence only and is not human consent, publication authorization, or production standing.',predecessor_subjects:subjects,authority:{new_runtime_authority:false,new_lifecycle_policy:false,document_engine_authority:false,provider_canonical_authority:false,real_author_authority:false,production_publication_authority:false},files:{forensic_map_sha256:shaFile(rel.map),qualifier_sha256:shaFile(rel.qualifier)},results};
write('summary.json',summary);write('cases.json',results);write('result.txt',`result=${summary.result_class}\npass_count=${summary.pass_count}\nfail_count=${summary.fail_count}\nsubject_sha=${head}\n`);
console.log(JSON.stringify(summary,null,2));
if(failures>0) process.exit(1);
