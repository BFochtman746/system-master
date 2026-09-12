'use strict';

const assert = require('assert');
const core = require('../../system-master/book-system/canonical-parent-v2-core.js');

const H = s => core.sha256(String(s));
function governed(object_id, version='1') {
  return { object_id, version, book_project_id:'BOOK-PROJECT-001', object_digest:H(`${object_id}:${version}`) };
}
function style(object_id='STYLE-1', version='1', standing='CURRENT') {
  return { object_id, version, book_project_id:'BOOK-PROJECT-001', standing, profile_digest:H(`${object_id}:${version}:${standing}`) };
}
function baseParent() {
  const p = {
    schema_version: core.SCHEMA_VERSION,
    state_version: 1,
    state_digest: '0'.repeat(64),
    book_project: { book_project_id:'BOOK-PROJECT-001', book_id:'BOOK-001', status:'PLANNING' },
    governed_objects: {
      governing_briefs:[governed('BRIEF-1')],
      canon_manifests:[governed('CANON-1')],
      story_bibles:[governed('BIBLE-1')],
      book_plans:[governed('PLAN-1')],
      manuscripts:[governed('MS-1')],
    },
    research_evidence_links:[],
    author_decisions:[],
    integration_proposals:[],
    rights_custody_records:[],
    style_profiles:[style()],
    export_releases:[],
    active: {
      governing_brief_ref:'BRIEF-1:1', canon_manifest_ref:'CANON-1:1', story_bible_ref:'BIBLE-1:1',
      book_plan_ref:'PLAN-1:1', canonical_manuscript_ref:'MS-1:1', style_profile_ref:'STYLE-1:1'
    },
    authority_metadata:{ owner:'SYSTEM_MASTER/BOOK' },
    mutation_head:null,
  };
  return core.sealParent(p);
}
function effect(parent, type='SET_ACTIVE_BOOK_PLAN', payload={target_ref:'PLAN-1:1'}, overrides={}) {
  const target = payload.target_ref;
  const e = {
    effect_schema_version:core.EFFECT_SCHEMA_VERSION,
    effect_request_id:'REQ-001',
    idempotency_key:'IDEM-001',
    actor_class:'SYSTEM',
    authority_ref:null,
    expected_parent_state_version:parent.state_version,
    expected_parent_state_digest:parent.state_digest,
    effect_type:type,
    effect_payload:payload,
    effect_payload_digest:core.effectPayloadDigest(payload),
    subject_identity_refs: target ? [target] : ['BOOK-PROJECT-001'],
    evidence_refs:['EVID-001'],
    specialist_receipt_refs:[],
    created_at:'2026-09-12T06:40:00.000Z',
    expected_specialist_ledger_identity:null,
  };
  return Object.assign(e, overrides);
}
function expectCode(code, fn) {
  assert.throws(fn, err => err && err.code === code, `expected ${code}`);
}

const tests = [];
function t(id, name, fn) { tests.push({id,name,fn}); }

t('Q001','valid v2 parent',()=>assert.strictEqual(core.validateParent(baseParent()),true));
t('Q002','wrong schema version',()=>{const p=baseParent();p.schema_version='BAD';p.state_digest=core.computeStateDigest(p);expectCode('INVALID_PARENT_SCHEMA_VERSION',()=>core.validateParent(p));});
t('Q003','missing stable project ID',()=>{const p=baseParent();delete p.book_project.book_project_id;p.state_digest=core.computeStateDigest(p);expectCode('REQUIRED_FIELD_MISSING',()=>core.validateParent(p));});
t('Q004','attempted identity change in mutation payload rejected',()=>{const p=baseParent();const payload={target_ref:'PLAN-1:1',book_project_id:'OTHER'};const e=effect(p,'SET_ACTIVE_BOOK_PLAN',payload);expectCode('UNKNOWN_FIELD',()=>core.applyEffect(p,e));});
t('Q005','invalid state version',()=>{const p=baseParent();p.state_version=0;p.state_digest=core.computeStateDigest(p);expectCode('INVALID_PARENT_STATE_VERSION',()=>core.validateParent(p));});
t('Q006','digest mismatch',()=>{const p=baseParent();p.state_digest='f'.repeat(64);expectCode('PARENT_STATE_DIGEST_MISMATCH',()=>core.validateParent(p));});
t('Q007','active pointer missing target',()=>{const p=baseParent();p.active.book_plan_ref='NOPE:1';p.state_digest=core.computeStateDigest(p);expectCode('ACTIVE_POINTER_TARGET_NOT_FOUND',()=>core.validateParent(p));});
t('Q008','active pointer foreign Book',()=>{const p=baseParent();p.governed_objects.book_plans[0].book_project_id='FOREIGN';p.state_digest=core.computeStateDigest(p);expectCode('FOREIGN_BOOK_OBJECT',()=>core.validateParent(p));});
t('Q009','malformed governed object ref',()=>{const p=baseParent();delete p.governed_objects.book_plans[0].object_id;p.state_digest=core.computeStateDigest(p);expectCode('REQUIRED_FIELD_MISSING',()=>core.validateParent(p));});
t('Q010','illegal project status',()=>{const p=baseParent();p.book_project.status='MAGIC';p.state_digest=core.computeStateDigest(p);expectCode('INVALID_PROJECT_STATUS',()=>core.validateParent(p));});
t('Q011','unknown mutation field fail closed',()=>{const p=baseParent();const payload={target_ref:'PLAN-1:1',surprise:true};const e=effect(p,'SET_ACTIVE_BOOK_PLAN',payload);expectCode('UNKNOWN_FIELD',()=>core.applyEffect(p,e));});
t('Q012','recursive forbidden raw/private field',()=>{const p=baseParent();p.authority_metadata.nested={private_payload:'secret'};p.state_digest=core.computeStateDigest(p);expectCode('FORBIDDEN_PRIVATE_FIELD',()=>core.validateParent(p));});

t('Q013','valid typed effect',()=>{const p=baseParent();const r=core.applyEffect(p,effect(p));assert.strictEqual(r.parent_state.state_version,2);});
t('Q014','unknown effect type',()=>{const p=baseParent();const e=effect(p);e.effect_type='UNKNOWN';expectCode('UNKNOWN_EFFECT_TYPE',()=>core.applyEffect(p,e));});
t('Q015','generic patch rejected',()=>{const p=baseParent();const e=effect(p);e.effect_type='PATCH';expectCode('UNKNOWN_EFFECT_TYPE',()=>core.applyEffect(p,e));});
t('Q016','payload digest mismatch',()=>{const p=baseParent();const e=effect(p);e.effect_payload_digest='0'.repeat(64);expectCode('EFFECT_PAYLOAD_DIGEST_MISMATCH',()=>core.applyEffect(p,e));});
t('Q017','actor class disallowed',()=>{const p=baseParent();const e=effect(p);e.actor_class='PROVIDER';expectCode('ACTOR_CLASS_NOT_ALLOWED',()=>core.applyEffect(p,e));});
t('Q018','required author authority absent',()=>{const p=baseParent();const rec={decision_id:'D1'};const e=effect(p,'REGISTER_FINAL_AUTHOR_DECISION',{record:rec},{actor_class:'AUTHOR',authority_ref:null,subject_identity_refs:['BOOK-PROJECT-001']});e.effect_payload_digest=core.effectPayloadDigest(e.effect_payload);expectCode('AUTHOR_AUTHORITY_REQUIRED',()=>core.applyEffect(p,e));});
t('Q019','subject identity mismatch',()=>{const p=baseParent();const e=effect(p);e.subject_identity_refs=['OTHER'];expectCode('SUBJECT_IDENTITY_MISMATCH',()=>core.applyEffect(p,e));});
t('Q020','malformed evidence ref',()=>{const p=baseParent();const e=effect(p);e.evidence_refs=[''];expectCode('MALFORMED_REFERENCE',()=>core.applyEffect(p,e));});
t('Q021','illegal project transition',()=>{const p=baseParent();const payload={to_status:'EXPORT_FROZEN'};const e=effect(p,'ADVANCE_PROJECT_STATUS',payload,{subject_identity_refs:['BOOK-PROJECT-001']});expectCode('ILLEGAL_PROJECT_TRANSITION',()=>core.applyEffect(p,e));});
t('Q022','pointer target not admitted',()=>{const p=baseParent();const e=effect(p,'SET_ACTIVE_BOOK_PLAN',{target_ref:'PLAN-X:1'});expectCode('POINTER_TARGET_NOT_ADMITTED',()=>core.applyEffect(p,e));});
t('Q023','publication effect without executable authority contract blocked',()=>{const p=baseParent();const payload={record:{publication_id:'P1'}};const e=effect(p,'REGISTER_PUBLICATION_AUTHORIZATION',payload,{subject_identity_refs:['BOOK-PROJECT-001'],authority_ref:'AUTH-1'});expectCode('PUBLICATION_EFFECT_BUILD_BLOCKED',()=>core.applyEffect(p,e));});
t('Q024','provider-defined effect rejected',()=>{const p=baseParent();const e=effect(p);e.effect_type='PROVIDER_CUSTOM_EFFECT';e.actor_class='PROVIDER';expectCode('UNKNOWN_EFFECT_TYPE',()=>core.applyEffect(p,e));});

t('Q025','exact parent version/digest accepted',()=>{const p=baseParent();const r=core.applyEffect(p,effect(p));assert.strictEqual(r.commit_receipt.pre_parent_state_digest,p.state_digest);});
t('Q026','stale version denied',()=>{const p=baseParent();const e=effect(p);e.expected_parent_state_version=999;expectCode('PARENT_STATE_VERSION_CONFLICT',()=>core.applyEffect(p,e));});
t('Q027','stale digest denied',()=>{const p=baseParent();const e=effect(p);e.expected_parent_state_digest='a'.repeat(64);expectCode('PARENT_STATE_DIGEST_CONFLICT',()=>core.applyEffect(p,e));});
t('Q028','exact replay returns same receipt',()=>{const p=baseParent();const e=effect(p);const first=core.applyEffect(p,e);const replay=core.applyEffect(p,e,{prior_receipt:first.commit_receipt,prior_parent_state:first.parent_state});assert.strictEqual(replay.replay,true);assert.deepStrictEqual(replay.commit_receipt,first.commit_receipt);});
t('Q029','same idempotency key different fingerprint denied',()=>{const p=baseParent();const e=effect(p);const first=core.applyEffect(p,e);const changed=effect(p,'SET_ACTIVE_BOOK_PLAN',{target_ref:'PLAN-1:1'},{created_at:'2026-09-12T06:41:00.000Z'});expectCode('IDEMPOTENCY_KEY_CONFLICT',()=>core.applyEffect(p,changed,{prior_receipt:first.commit_receipt,prior_parent_state:first.parent_state}));});
t('Q030','same request ID conflicting key denied',()=>{const p=baseParent();const e=effect(p);const first=core.applyEffect(p,e);const changed=effect(p);changed.idempotency_key='IDEM-OTHER';expectCode('REQUEST_IDEMPOTENCY_CONFLICT',()=>core.applyEffect(p,changed,{prior_receipt:first.commit_receipt,prior_parent_state:first.parent_state}));});
t('Q031','same request ID conflicting payload denied',()=>{const p=baseParent();const e=effect(p);const first=core.applyEffect(p,e);const changed=effect(p,'SET_ACTIVE_STORY_BIBLE',{target_ref:'BIBLE-1:1'});changed.idempotency_key=e.idempotency_key;expectCode('IDEMPOTENCY_KEY_CONFLICT',()=>core.applyEffect(p,changed,{prior_receipt:first.commit_receipt,prior_parent_state:first.parent_state}));});
t('Q032','one success increments exactly once',()=>{const p=baseParent();const r=core.applyEffect(p,effect(p));assert.strictEqual(r.parent_state.state_version,p.state_version+1);});
t('Q033','replay does not increment',()=>{const p=baseParent();const e=effect(p);const first=core.applyEffect(p,e);const replay=core.applyEffect(p,e,{prior_receipt:first.commit_receipt,prior_parent_state:first.parent_state});assert.strictEqual(replay.parent_state.state_version,first.parent_state.state_version);});
t('Q034','stale subject reference denied',()=>{const p=baseParent();const e=effect(p);e.subject_identity_refs=['PLAN-OLD:1'];expectCode('SUBJECT_IDENTITY_MISMATCH',()=>core.applyEffect(p,e));});
t('Q035','request fingerprint deterministic',()=>{const p=baseParent();const a=effect(p);const b=JSON.parse(JSON.stringify(a));assert.strictEqual(core.effectRequestFingerprint(a),core.effectRequestFingerprint(b));});
t('Q036','response-lost replay converges to committed parent',()=>{const p=baseParent();const e=effect(p);const first=core.applyEffect(p,e);const replay=core.applyEffect(p,e,{prior_receipt:first.commit_receipt,prior_parent_state:first.parent_state});assert.strictEqual(replay.parent_state.state_digest,first.parent_state.state_digest);assert.strictEqual(replay.commit_receipt.receipt_id,first.commit_receipt.receipt_id);});

let passed=0;
for (const test of tests) {
  try { test.fn(); passed++; console.log(`PASS ${test.id} ${test.name}`); }
  catch (err) { console.error(`FAIL ${test.id} ${test.name}: ${err.stack || err}`); process.exitCode=1; }
}
console.log(JSON.stringify({qualification:'BOOK-RECONSTRUCTION-B00-F1',required:36,observed:tests.length,passed,failed:tests.length-passed,status:passed===36&&tests.length===36?'PASS':'FAIL'}));
if (tests.length !== 36 || passed !== 36) process.exit(1);
