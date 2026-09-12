'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const core = require('../../system-master/book-system/canonical-parent-v2-core.js');
const storeLib = require('../../system-master/book-system/canonical-parent-v2-sqlite-store.js');

const H = s => core.sha256(String(s));
function governed(object_id, version='1') { return {object_id,version,book_project_id:'BOOK-PROJECT-001',object_digest:H(`${object_id}:${version}`)}; }
function style() { return {object_id:'STYLE-1',version:'1',book_project_id:'BOOK-PROJECT-001',standing:'CURRENT',profile_digest:H('STYLE-1:1')}; }
function parent() {
  return core.sealParent({
    schema_version:core.SCHEMA_VERSION,state_version:1,state_digest:'0'.repeat(64),
    book_project:{book_project_id:'BOOK-PROJECT-001',book_id:'BOOK-001',status:'PLANNING'},
    governed_objects:{governing_briefs:[governed('BRIEF-1')],canon_manifests:[governed('CANON-1')],story_bibles:[governed('BIBLE-1')],book_plans:[governed('PLAN-1')],manuscripts:[governed('MS-1')]},
    research_evidence_links:[],author_decisions:[],integration_proposals:[],rights_custody_records:[],style_profiles:[style()],export_releases:[],
    active:{governing_brief_ref:'BRIEF-1:1',canon_manifest_ref:'CANON-1:1',story_bible_ref:'BIBLE-1:1',book_plan_ref:'PLAN-1:1',canonical_manuscript_ref:'MS-1:1',style_profile_ref:'STYLE-1:1'},
    authority_metadata:{owner:'SYSTEM_MASTER/BOOK'},mutation_head:null,
  });
}
function effect(p, n=1, type='ADVANCE_PROJECT_STATUS', payload=null) {
  const actualPayload = payload || {to_status:n===1?'RESEARCH':'DRAFTING'};
  return {
    effect_schema_version:core.EFFECT_SCHEMA_VERSION,
    effect_request_id:`REQ-F2-${n}`,
    idempotency_key:`IDEM-F2-${n}`,
    actor_class:'SYSTEM',authority_ref:null,
    expected_parent_state_version:p.state_version,expected_parent_state_digest:p.state_digest,
    effect_type:type,effect_payload:actualPayload,effect_payload_digest:core.effectPayloadDigest(actualPayload),
    subject_identity_refs:['BOOK-PROJECT-001'],evidence_refs:[`EVID-F2-${n}`],specialist_receipt_refs:[],
    created_at:`2026-09-12T06:5${n}:00.000Z`,expected_specialist_ledger_identity:null,
  };
}
function withStore(fn, options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'book-b00-f2-'));
  const db=path.join(dir,'parent.sqlite');
  const s=new storeLib.CanonicalParentSqliteStore(db,options);
  try { s.createParent(parent(),'TEST'); return fn(s,db,dir); }
  finally { try{s.close();}catch(_){}; fs.rmSync(dir,{recursive:true,force:true}); }
}
function expectCode(code, fn) { assert.throws(fn, e => e && e.code===code, `expected ${code}`); }
const tests=[]; const t=(id,name,fn)=>tests.push({id,name,fn});

t('Q037','atomic parent plus receipt commit',()=>withStore(s=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const r=s.commitEffect(effect(p,1));assert.strictEqual(r.parent_state.state_version,2);assert.strictEqual(s.readParentCommitReceipt(r.commit_receipt.receipt_id).receipt_id,r.commit_receipt.receipt_id);}));
t('Q038','atomic history index update',()=>withStore(s=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const r=s.commitEffect(effect(p,1));const h=s.listParentHistory('BOOK-PROJECT-001');assert.strictEqual(h.length,2);assert.strictEqual(h[1].receipt_id,r.commit_receipt.receipt_id);}));
t('Q039','validation failure rolls back',()=>withStore(s=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const e=effect(p,1);e.effect_payload_digest='0'.repeat(64);expectCode('EFFECT_PAYLOAD_DIGEST_MISMATCH',()=>s.commitEffect(e));assert.strictEqual(s.readCurrentParent('BOOK-PROJECT-001').state_version,1);assert.strictEqual(s.listParentHistory('BOOK-PROJECT-001').length,1);}));
t('Q040','persistence failure before commit leaves predecessor',()=>{let armed=false;withStore((s)=>{const p=s.readCurrentParent('BOOK-PROJECT-001');armed=true;assert.throws(()=>s.commitEffect(effect(p,1)),/INJECT_AFTER_PARENT/);assert.strictEqual(s.readCurrentParent('BOOK-PROJECT-001').state_version,1);assert.strictEqual(s.listParentHistory('BOOK-PROJECT-001').length,1);},{faultInjector:(point)=>{if(armed&&point==='after_parent_update')throw new Error('INJECT_AFTER_PARENT');}});});
t('Q041','failure after commit recovers successor',()=>{let armed=false;let dbPath;let dir;try{dir=fs.mkdtempSync(path.join(os.tmpdir(),'book-b00-f2-'));dbPath=path.join(dir,'parent.sqlite');const s=new storeLib.CanonicalParentSqliteStore(dbPath,{faultInjector:(point)=>{if(armed&&point==='after_commit')throw new Error('INJECT_AFTER_COMMIT');}});s.createParent(parent(),'TEST');const p=s.readCurrentParent('BOOK-PROJECT-001');armed=true;assert.throws(()=>s.commitEffect(effect(p,1)),/INJECT_AFTER_COMMIT/);s.close();const r=new storeLib.CanonicalParentSqliteStore(dbPath);const recovered=r.recoverAndVerify('BOOK-PROJECT-001');assert.strictEqual(recovered.parent_state.state_version,2);assert.strictEqual(recovered.receipt_count,1);r.close();}finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}});
t('Q042','reopen current parent',()=>withStore((s,db)=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const r=s.commitEffect(effect(p,1));s.close();const reopened=new storeLib.CanonicalParentSqliteStore(db);assert.strictEqual(reopened.readCurrentParent('BOOK-PROJECT-001').state_digest,r.parent_state.state_digest);reopened.close();}));
t('Q043','reopen receipt lookup',()=>withStore((s,db)=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const r=s.commitEffect(effect(p,1));s.close();const reopened=new storeLib.CanonicalParentSqliteStore(db);assert.strictEqual(reopened.readCommitReceiptByRequest('REQ-F2-1').receipt_id,r.commit_receipt.receipt_id);reopened.close();}));
t('Q044','integrity corruption fails closed',()=>withStore((s,db)=>{s.close();const raw=new DatabaseSync(db);raw.prepare("UPDATE canonical_parent SET state_json=? WHERE book_project_id='BOOK-PROJECT-001'").run(JSON.stringify({...parent(),state_version:99}));raw.close();const reopened=new storeLib.CanonicalParentSqliteStore(db);assert.throws(()=>reopened.recoverAndVerify('BOOK-PROJECT-001'));reopened.close();}));
t('Q045','predecessor receipt chain valid',()=>withStore(s=>{let p=s.readCurrentParent('BOOK-PROJECT-001');const r1=s.commitEffect(effect(p,1));p=r1.parent_state;const r2=s.commitEffect(effect(p,2));assert.strictEqual(r2.commit_receipt.predecessor_parent_commit_receipt_ref,r1.commit_receipt.receipt_id);const v=s.recoverAndVerify('BOOK-PROJECT-001');assert.strictEqual(v.receipt_count,2);}));
t('Q046','competing writers one winner',()=>withStore((s,db)=>{const other=new storeLib.CanonicalParentSqliteStore(db);const p=s.readCurrentParent('BOOK-PROJECT-001');const a=effect(p,1);const b=effect(p,3,'ADVANCE_PROJECT_STATUS',{to_status:'DRAFTING'});b.effect_payload_digest=core.effectPayloadDigest(b.effect_payload);const r=s.commitEffect(a);assert.strictEqual(r.parent_state.state_version,2);expectCode('PARENT_STATE_VERSION_CONFLICT',()=>other.commitEffect(b));other.close();}));
t('Q047','transient store contention classified separately',()=>{assert.strictEqual(storeLib.classifySqliteError(new Error('database is locked')),'STORE_BUSY_TRANSIENT');assert.strictEqual(storeLib.classifySqliteError(new Error('SQLITE_BUSY: busy')),'STORE_BUSY_TRANSIENT');});
t('Q048','semantic CAS conflict not transient',()=>withStore(s=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const e=effect(p,1);e.expected_parent_state_version=999;expectCode('PARENT_STATE_VERSION_CONFLICT',()=>s.commitEffect(e));}));
t('Q049','recovery never exposes half effect',()=>{let armed=false;withStore((s)=>{const p=s.readCurrentParent('BOOK-PROJECT-001');armed=true;assert.throws(()=>s.commitEffect(effect(p,1)),/INJECT_AFTER_RECEIPT/);const v=s.recoverAndVerify('BOOK-PROJECT-001');assert.strictEqual(v.parent_state.state_version,1);assert.strictEqual(v.history_count,1);assert.strictEqual(v.receipt_count,0);},{faultInjector:(point)=>{if(armed&&point==='after_receipt_insert')throw new Error('INJECT_AFTER_RECEIPT');}});});
t('Q050','restart preserves exact idempotent replay',()=>withStore((s,db)=>{const p=s.readCurrentParent('BOOK-PROJECT-001');const e=effect(p,1);const first=s.commitEffect(e);s.close();const reopened=new storeLib.CanonicalParentSqliteStore(db);const replay=reopened.commitEffect(e);assert.strictEqual(replay.replay,true);assert.strictEqual(replay.commit_receipt.receipt_id,first.commit_receipt.receipt_id);assert.strictEqual(replay.parent_state.state_digest,first.parent_state.state_digest);reopened.close();}));

let passed=0;
for(const x of tests){try{x.fn();passed++;console.log(`PASS ${x.id} ${x.name}`);}catch(e){console.error(`FAIL ${x.id} ${x.name}: ${e.stack||e}`);process.exitCode=1;}}
console.log(JSON.stringify({qualification:'BOOK-RECONSTRUCTION-B00-F2-STORE',required:14,observed:tests.length,passed,failed:tests.length-passed,status:passed===14&&tests.length===14?'PASS':'FAIL'}));
if(tests.length!==14||passed!==14)process.exit(1);
