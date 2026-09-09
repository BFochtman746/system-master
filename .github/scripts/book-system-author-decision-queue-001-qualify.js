'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runtimePath = path.join(workspace, 'system-master/book-system/author-decision-queue.js');
const fixturesPath = path.join(workspace, 'qualification/book-system/author-decision-001/AUTHOR-DECISION-QUEUE-001-FIXTURES.json');
const contractPath = path.join(workspace, 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001.json');
const clarificationPath = path.join(workspace, 'qualification/book-system/author-decision-001/BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001-STATUS-MAPPING-CLARIFICATION.json');
const q = require(runtimePath);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const clarification = JSON.parse(fs.readFileSync(clarificationPath, 'utf8'));
assert.equal(fixtures.synthetic_only, true);
assert.equal(fixtures.real_author_decision_evidence, false);
assert.equal(contract.queue_id, 'BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001');
assert.equal(clarification.option_contract_addition.required_field, 'canonical_decision_status');

function baseState() {
  return {
    schema_version: 1, state_version: 1,
    book_project: { book_project_id: 'BOOKPROJECT:001', book_id: 'BOOK:001', status: 'DRAFTING', governing_brief_ref: 'BRIEF:001', canonical_manifest_ref: 'CANON:001' },
    governing_briefs: { 'BRIEF:001': { brief_id:'BRIEF:001', version:1, author_intent:'Preserve intent', form:'BOOK', genre:'PROJECT_DEFINED', audience:'PROJECT_DEFINED', voice_goals:['PROJECT_SPECIFIC'], hard_constraints:['NO_SILENT_CANON_MUTATION'] } },
    canon_manifests: { 'CANON:001': { canon_manifest_id:'CANON:001', version:1, facts:[], entities:[], world_rules:[], protected_language_refs:[], intent_constraints:[], approval_state:'APPROVED' } },
    story_bibles: { 'STORYBIBLE:001': { story_bible_id:'STORYBIBLE:001', version:1, entity_refs:[], relationship_refs:[], timeline_refs:[], arc_refs:[], motif_theme_refs:[], open_questions:[], provenance:[] } },
    book_plans: { 'PLAN:001': { plan_id:'PLAN:001', version:1, part_refs:[], chapter_refs:[], scene_refs:[], dependency_edges:[], purpose_and_payoff_refs:[] } },
    manuscripts: { 'MANUSCRIPT:001:V1': { manuscript_id:'MANUSCRIPT:001', version_id:'MANUSCRIPT:001:V1', artifact_digest:'a'.repeat(64), authority_state:'CANONICAL', parent_version_ref:null, change_set_ref:'CHANGESET:000', created_by:'PARENT_SYSTEM', created_at:'2026-09-09T16:00:00Z' } },
    research_evidence_links:{}, author_decisions:{}, integration_proposals:{}, export_releases:{},
    active:{ governing_brief_ref:'BRIEF:001', canon_manifest_ref:'CANON:001', story_bible_ref:'STORYBIBLE:001', book_plan_ref:'PLAN:001', canonical_manuscript_ref:'MANUSCRIPT:001:V1' }
  };
}
function manuscriptIdentity(state) {
  const obj=state.manuscripts['MANUSCRIPT:001:V1'];
  return { object_id:'MANUSCRIPT:001:V1', object_version:'MANUSCRIPT:001:V1', object_digest:q.sha256(obj) };
}
function opts() {
  return [
    { option_id:'ACCEPT_REVISION', label:'Use the revision', effect:'Promote this direction for later parent processing.', consequence_class:'MATERIAL_REVISION', canonical_decision_status:'APPROVED' },
    { option_id:'RETAIN_ORIGINAL', label:'Keep the original', effect:'Reject this revision and retain current text.', consequence_class:'MATERIAL_REVISION', canonical_decision_status:'REJECTED' }
  ];
}
function bind(state, ledger) { return { expected_parent_state_version:state.state_version, expected_parent_state_digest:q.digestState(state), expected_queue_ledger_version:ledger.queue_ledger_version, expected_queue_ledger_digest:q.digestLedger(ledger) }; }
function enqueueReq(state, ledger, patch={}) {
  return Object.assign({ enqueue_request_id:'ENQUEUE:001', idempotency_key:'IDEMP:ENQ:001', actor_class:'PARENT_SYSTEM', ...bind(state,ledger), source_authority_kind:'INTEGRATION_RUNTIME_HANDOFF', source_handoff_refs:['HANDOFF:001'], decision_type:'REVISION_PROMOTION', subject_ref:'MANUSCRIPT:001:V1', subject_identity_refs:[manuscriptIdentity(state)], options:opts(), custom_option_allowed:true, evidence_refs:['EVIDENCE:001'], disagreement_refs:[], consequence_summary:'Accepting selects the revision direction; rejecting retains current text.', confirmation_policy:'REVIEW_SELECTED_CHOICE' }, patch);
}
function transitionReq(state,ledger,s,id,patch={}) { return Object.assign({ request_id:id, idempotency_key:`IDEMP:${id}`, actor_class:'PARENT_SYSTEM', ...bind(state,ledger), decision_request_id:s.decision_request_id, expected_decision_request_version:s.decision_request_version, expected_decision_request_digest:s.decision_request_digest },patch); }
function confirmation(s, choiceIdentity) { return { decision_request_digest:s.decision_request_digest, choice_identity_digest:q.sha256(choiceIdentity) }; }
function resolveReq(state,ledger,s,patch={}) {
  const identity={ option_id:'ACCEPT_REVISION', option_set_digest:s.option_set_digest };
  return Object.assign({ resolution_request_id:'RESOLVE:001', idempotency_key:'IDEMP:RESOLVE:001', author_actor_ref:'AUTHOR:BRIAN', author_authority_proof_ref:'SESSIONPROOF:001', ...bind(state,ledger), decision_request_id:s.decision_request_id, expected_decision_request_version:s.decision_request_version, expected_decision_request_digest:s.decision_request_digest, selected_option_id:'ACCEPT_REVISION', custom_author_choice:null, confirmation_evidence:confirmation(s,identity), rationale_optional:null },patch);
}
function throws(code, fn) { let ok=false; try { fn(); } catch(e) { if(e && e.code===code) ok=true; else throw e; } assert.ok(ok, `expected ${code}`); }

let passed=0; const tests=[];
function test(name, fn){ tests.push([name,fn]); }

test('create ledger binds exact parent',()=>{const s=baseState(),l=q.createQueueLedger(s); assert.equal(l.bound_parent_state_digest,q.digestState(s));});
test('enqueue current exact subject',()=>{const s=baseState(),l=q.createQueueLedger(s),r=q.enqueue(s,l,enqueueReq(s,l)); assert.equal(r.queue_state,'PENDING'); assert.equal(r.queue_ledger.queue_ledger_version,2); assert.deepEqual(r.parent_state,s);});
test('provider cannot enqueue',()=>{const s=baseState(),l=q.createQueueLedger(s); throws('ENQUEUE_ACTOR_DENIED',()=>q.enqueue(s,l,enqueueReq(s,l,{actor_class:'PROSE_PROJECT'})));});
test('unknown source kind fails',()=>{const s=baseState(),l=q.createQueueLedger(s); throws('UNKNOWN_SOURCE_AUTHORITY_KIND',()=>q.enqueue(s,l,enqueueReq(s,l,{source_authority_kind:'MODEL_DIRECT'})));});
test('preselected option fails',()=>{const s=baseState(),l=q.createQueueLedger(s),o=opts();o[0].selected=true;throws('PRESELECTED_OPTION_FORBIDDEN',()=>q.enqueue(s,l,enqueueReq(s,l,{options:o})));});
test('missing status mapping fails',()=>{const s=baseState(),l=q.createQueueLedger(s),o=opts();delete o[0].canonical_decision_status;throws('REQUIRED_FIELD_MISSING',()=>q.enqueue(s,l,enqueueReq(s,l,{options:o})));});
test('invalid status mapping fails',()=>{const s=baseState(),l=q.createQueueLedger(s),o=opts();o[0].canonical_decision_status='PENDING';throws('INVALID_CANONICAL_DECISION_STATUS',()=>q.enqueue(s,l,enqueueReq(s,l,{options:o})));});
test('weak confirmation policy fails',()=>{const s=baseState(),l=q.createQueueLedger(s);throws('CONFIRMATION_POLICY_TOO_WEAK',()=>q.enqueue(s,l,enqueueReq(s,l,{confirmation_policy:'NONE'})));});
test('stale parent enqueue fails',()=>{const s=baseState(),l=q.createQueueLedger(s);throws('PARENT_STATE_VERSION_MISMATCH',()=>q.enqueue(s,l,enqueueReq(s,l,{expected_parent_state_version:2})));});
test('subject digest mismatch fails',()=>{const s=baseState(),l=q.createQueueLedger(s),ids=[manuscriptIdentity(s)];ids[0].object_digest='0'.repeat(64);throws('SUBJECT_DIGEST_MISMATCH',()=>q.enqueue(s,l,enqueueReq(s,l,{subject_identity_refs:ids})));});
test('exact enqueue replay no duplicate queue item',()=>{const s=baseState(),l=q.createQueueLedger(s),req=enqueueReq(s,l),a=q.enqueue(s,l,req),b=q.enqueue(s,a.queue_ledger,req);assert.equal(b.replay,true);assert.equal(Object.keys(b.queue_ledger.decision_request_snapshots).length,1);});
test('idempotency conflict fails',()=>{const s=baseState(),l=q.createQueueLedger(s),req=enqueueReq(s,l),a=q.enqueue(s,l,req);const bad={...req,decision_type:'FINALIZATION_APPROVAL'};throws('IDEMPOTENCY_KEY_CONFLICT',()=>q.enqueue(s,a.queue_ledger,bad));});
test('duplicate semantic handoff preserves both via successor',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l));const cur=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const req=enqueueReq(s,a.queue_ledger,{enqueue_request_id:'ENQUEUE:002',idempotency_key:'IDEMP:ENQ:002',source_handoff_refs:['HANDOFF:002']});const b=q.enqueue(s,a.queue_ledger,req);const n=b.queue_ledger.decision_request_snapshots[b.decision_request_id];assert.equal(n.predecessor_decision_request_id,cur.decision_request_id);assert.deepEqual(n.source_handoff_refs,['HANDOFF:001','HANDOFF:002']);});
test('present creates immutable successor',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const b=q.present(s,a.queue_ledger,transitionReq(s,a.queue_ledger,snap,'PRESENT:001'));assert.equal(b.queue_state,'PRESENTED');assert.equal(b.queue_ledger.decision_request_snapshots[snap.decision_request_id].queue_state,'PENDING');});
test('defer creates no canonical decision',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const b=q.defer(s,a.queue_ledger,transitionReq(s,a.queue_ledger,snap,'DEFER:001'));assert.equal(b.queue_state,'DEFERRED');assert.equal(Object.keys(b.parent_state.author_decisions).length,0);});
test('reopen deferred item',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const b=q.defer(s,a.queue_ledger,transitionReq(s,a.queue_ledger,snap,'DEFER:001')),d=b.queue_ledger.decision_request_snapshots[b.decision_request_id];const c=q.reopen(s,b.queue_ledger,transitionReq(s,b.queue_ledger,d,'REOPEN:001'));assert.equal(c.queue_state,'PENDING');});
test('stale item cannot resolve',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const b=q.markStale(s,a.queue_ledger,transitionReq(s,a.queue_ledger,snap,'STALE:001'),'manuscript changed'),st=b.queue_ledger.decision_request_snapshots[b.decision_request_id];throws('DECISION_REQUEST_NOT_RESOLVABLE',()=>q.resolve(s,b.queue_ledger,resolveReq(s,b.queue_ledger,st)));});
test('withdraw preserves history and cannot resolve',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const b=q.withdraw(s,a.queue_ledger,transitionReq(s,a.queue_ledger,snap,'WITHDRAW:001')),w=b.queue_ledger.decision_request_snapshots[b.decision_request_id];throws('DECISION_REQUEST_NOT_RESOLVABLE',()=>q.resolve(s,b.queue_ledger,resolveReq(s,b.queue_ledger,w)));assert.ok(b.queue_ledger.decision_request_snapshots[snap.decision_request_id]);});
test('supersede preserves history and cannot resolve',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const b=q.supersede(s,a.queue_ledger,transitionReq(s,a.queue_ledger,snap,'SUPER:001')),w=b.queue_ledger.decision_request_snapshots[b.decision_request_id];throws('DECISION_REQUEST_NOT_RESOLVABLE',()=>q.resolve(s,b.queue_ledger,resolveReq(s,b.queue_ledger,w)));});
test('approved option maps APPROVED',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],r=q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap));assert.equal(r.decision_status,'APPROVED');assert.equal(r.parent_state.author_decisions[r.decision_id].status,'APPROVED');});
test('reject option maps REJECTED not APPROVED',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const identity={option_id:'RETAIN_ORIGINAL',option_set_digest:snap.option_set_digest};const req=resolveReq(s,a.queue_ledger,snap,{resolution_request_id:'RESOLVE:REJECT',idempotency_key:'IDEMP:RESOLVE:REJECT',selected_option_id:'RETAIN_ORIGINAL',confirmation_evidence:confirmation(snap,identity)});const r=q.resolve(s,a.queue_ledger,req);assert.equal(r.parent_state.author_decisions[r.decision_id].status,'REJECTED');});
test('reject decision cannot satisfy approved lifecycle predicate',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const identity={option_id:'RETAIN_ORIGINAL',option_set_digest:snap.option_set_digest};const r=q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap,{resolution_request_id:'RESOLVE:R2',idempotency_key:'IDEMP:R2',selected_option_id:'RETAIN_ORIGINAL',confirmation_evidence:confirmation(snap,identity)}));const d=r.parent_state.author_decisions[r.decision_id];assert.equal(d.status==='APPROVED' && d.decision_type==='REVISION_PROMOTION',false);});
test('missing author proof fails',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];throws('NONEMPTY_STRING_REQUIRED',()=>q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap,{author_authority_proof_ref:''})));});
test('AI cannot substitute author proof',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const req=resolveReq(s,a.queue_ledger,snap,{author_actor_ref:'MODEL:001',author_authority_proof_ref:'SESSIONPROOF:FAKE'});throws('AUTHOR_ACTOR_CLASS_DENIED',()=>q.resolve(s,a.queue_ledger,req));});
test('missing confirmation fails',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];throws('CONFIRMATION_EVIDENCE_REQUIRED',()=>q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap,{confirmation_evidence:null})));});
test('wrong confirmation choice binding fails',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const c=confirmation(snap,{option_id:'RETAIN_ORIGINAL',option_set_digest:snap.option_set_digest});throws('CONFIRMATION_CHOICE_BINDING_MISMATCH',()=>q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap,{confirmation_evidence:c})));});
test('custom choice disallowed fails',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l,{custom_option_allowed:false})),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const req=resolveReq(s,a.queue_ledger,snap,{selected_option_id:null,custom_author_choice:'Use a third approach',confirmation_evidence:{decision_request_digest:snap.decision_request_digest,choice_identity_digest:q.sha256({custom_choice_digest:q.sha256('Use a third approach'),option_set_digest:snap.option_set_digest})}});throws('CUSTOM_OPTION_NOT_ALLOWED',()=>q.resolve(s,a.queue_ledger,req));});
test('custom choice allowed maps explicit APPROVED',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id];const custom='Use a third approach';const req=resolveReq(s,a.queue_ledger,snap,{resolution_request_id:'RESOLVE:CUSTOM',idempotency_key:'IDEMP:CUSTOM',selected_option_id:null,custom_author_choice:custom,confirmation_evidence:{decision_request_digest:snap.decision_request_digest,choice_identity_digest:q.sha256({custom_choice_digest:q.sha256(custom),option_set_digest:snap.option_set_digest})}});const r=q.resolve(s,a.queue_ledger,req);assert.equal(r.decision_status,'APPROVED');assert.equal(r.parent_state.author_decisions[r.decision_id].author_choice,custom);});
test('atomic resolution changes only state_version and author_decisions',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],r=q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap));const before=JSON.parse(JSON.stringify(s)),after=JSON.parse(JSON.stringify(r.parent_state));delete before.state_version;delete after.state_version;before.author_decisions={};after.author_decisions={};assert.deepEqual(after,before);});
test('resolution emits Version/Rollback AUTHOR_DECISION handoff only',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],r=q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap));assert.equal(r.version_rollback_authority_handoff.authority_kind,'AUTHOR_DECISION');assert.equal(r.version_rollback_authority_handoff.operation,'RECORD_AUTHORIZED_PARENT_SUCCESSOR');});
test('resolution receipt binds exact pre/post identities',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],r=q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap)),rc=r.resolution_receipt;assert.equal(rc.pre_parent_state_digest,q.digestState(s));assert.equal(rc.post_parent_state_digest,q.digestState(r.parent_state));assert.equal(rc.post_queue_ledger_digest,q.digestLedger(r.queue_ledger));});
test('same resolution replay returns same decision no second commit',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],req=resolveReq(s,a.queue_ledger,snap),r=q.resolve(s,a.queue_ledger,req),rr=q.resolve(r.parent_state,r.queue_ledger,req);assert.equal(rr.replay,true);assert.equal(rr.decision_id,r.decision_id);assert.equal(rr.parent_state.state_version,2);});
test('same idempotency different choice conflicts',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],req=resolveReq(s,a.queue_ledger,snap),r=q.resolve(s,a.queue_ledger,req);const bad={...req,selected_option_id:'RETAIN_ORIGINAL'};throws('IDEMPOTENCY_KEY_CONFLICT',()=>q.resolve(r.parent_state,r.queue_ledger,bad));});
test('concurrent different choice on stale prestate rejected',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),snap=a.queue_ledger.decision_request_snapshots[a.decision_request_id],first=q.resolve(s,a.queue_ledger,resolveReq(s,a.queue_ledger,snap)),identity={option_id:'RETAIN_ORIGINAL',option_set_digest:snap.option_set_digest};const second=resolveReq(s,a.queue_ledger,snap,{resolution_request_id:'RESOLVE:CONCURRENT',idempotency_key:'IDEMP:CONCURRENT',selected_option_id:'RETAIN_ORIGINAL',confirmation_evidence:confirmation(snap,identity)});throws('STALE_OR_CONFLICTING_RESOLUTION',()=>q.resolve(first.parent_state,first.queue_ledger,second));});
test('presentation projection has no selected default',()=>{const s=baseState(),l=q.createQueueLedger(s),a=q.enqueue(s,l,enqueueReq(s,l)),p=q.presentationProjection(a.queue_ledger,a.decision_request_id,'Which direction should the book use?');assert.ok(p.options.every(o=>!o.selected&&!o.default));assert.equal(p.can_defer,true);});
test('publication consequence requires strongest confirmation',()=>{const s=baseState(),l=q.createQueueLedger(s),o=opts();o[0].consequence_class='PUBLICATION_OR_RELEASE';o[1].consequence_class='PUBLICATION_OR_RELEASE';throws('CONFIRMATION_POLICY_TOO_WEAK',()=>q.enqueue(s,l,enqueueReq(s,l,{options:o,confirmation_policy:'REVIEW_SELECTED_CHOICE'})));});

const fixtureNames = fixtures.cases.map((c) => c.description);
assert.deepEqual(fixtureNames, tests.map(([name]) => name), 'fixture manifest must exactly match executable cases');
const caseResults = [];
for (const [name,fn] of tests) {
  try { fn(); passed++; caseResults.push({name, result:'PASS'}); console.log(`PASS ${name}`); }
  catch(e) { caseResults.push({name, result:'FAIL', error_code:e && e.code ? e.code : null, error:String(e)}); console.error(`FAIL ${name}:`,e); process.exitCode=1; break; }
}
const evidence = {
  qualification_id:'BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001', synthetic_only:true, real_author_decision_evidence:false,
  runtime_sha256:crypto.createHash('sha256').update(fs.readFileSync(runtimePath)).digest('hex'),
  fixtures_sha256:crypto.createHash('sha256').update(fs.readFileSync(fixturesPath)).digest('hex'),
  contract_sha256:crypto.createHash('sha256').update(fs.readFileSync(contractPath)).digest('hex'),
  clarification_sha256:crypto.createHash('sha256').update(fs.readFileSync(clarificationPath)).digest('hex'),
  cases_total:tests.length, cases_passed:passed, cases:caseResults,
  authority_nonclaims:{real_author_choice_created:false,lifecycle_mutation_authorized:false,manuscript_promotion_authorized:false,proposal_admission_authorized:false,export_freeze_authorized:false,publication_authorized:false}
};
const evidenceDir = process.env.BOOK_AUTHOR_DECISION_EVIDENCE_DIR || process.env.RUNNER_TEMP || path.join(workspace,'.tmp-author-decision-queue');
fs.mkdirSync(evidenceDir,{recursive:true});
fs.writeFileSync(path.join(evidenceDir,'qualification-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
if (!process.exitCode) console.log(`AUTHOR_DECISION_QUEUE_QUALIFICATION_PASS=${passed}/${tests.length}`);
