'use strict';

const { classifySqliteError } = require('./canonical-parent-v2-sqlite-store.js');
const { CanonicalParentF6SqliteStore, BookCanonicalParentF6StoreError } = require('./canonical-parent-v2-f6-sqlite-store.js');
const core = require('./canonical-parent-v2-f6-core.js');
const rebind = require('./export-freeze-v2-rebind.js');

class BookExportFreezeV2StoreError extends Error {
  constructor(code, detail = '', cause = null) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookExportFreezeV2StoreError';
    this.code = code;
    this.detail = detail;
    this.cause = cause || undefined;
  }
}
function fail(code, detail = '', cause = null) { throw new BookExportFreezeV2StoreError(code, detail, cause); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function json(v) { return JSON.stringify(v); }
function parse(v, label) { try { return JSON.parse(v); } catch (e) { fail('STORE_JSON_CORRUPT', label, e); } }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }

class ExportFreezeV2SqliteStore extends CanonicalParentF6SqliteStore {
  constructor(dbPath, options = {}) {
    super(dbPath, options);
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS book_export_freeze_state (
          book_project_id TEXT PRIMARY KEY,
          export_freeze_identity TEXT NOT NULL,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
        CREATE TABLE IF NOT EXISTS book_export_freeze_receipt (
          receipt_id TEXT PRIMARY KEY,
          book_project_id TEXT NOT NULL,
          freeze_request_id TEXT NOT NULL UNIQUE,
          idempotency_key TEXT NOT NULL UNIQUE,
          parent_receipt_id TEXT NOT NULL UNIQUE,
          pre_export_freeze_identity TEXT NOT NULL,
          post_export_freeze_identity TEXT NOT NULL,
          delta_digest TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL,
          receipt_json TEXT NOT NULL,
          post_state_json TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
      `);
    } catch (err) { fail(classifySqliteError(err), String(err && err.message || err), err); }
  }

  createExportFreezeState(stateInput, createdAt = new Date().toISOString()) {
    const state=clone(stateInput),bookId=state&&state.book_project_id;
    if (!nonEmpty(bookId)) fail('SPECIALIST_BOOK_PROJECT_ID_REQUIRED');
    const parent=this.readCurrentParent(bookId); rebind.validateFreezeSpecialistState(state,parent);
    const identity=rebind.exportFreezeIdentity(state,parent); let committed=false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const parentRow=this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!parentRow) fail('PARENT_NOT_FOUND',bookId);
      const current=parse(parentRow.state_json,'canonical_parent.state_json'); core.validateParent(current); rebind.validateFreezeSpecialistState(state,current);
      if (this.db.prepare('SELECT 1 AS x FROM book_export_freeze_state WHERE book_project_id=?').get(bookId)) fail('EXPORT_FREEZE_STATE_ALREADY_EXISTS',bookId);
      this.db.prepare('INSERT INTO book_export_freeze_state(book_project_id,export_freeze_identity,state_json,updated_at) VALUES(?,?,?,?)').run(bookId,identity,json(state),createdAt);
      this.db.exec('COMMIT'); committed=true; return {export_freeze_identity:identity,state};
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookExportFreezeV2StoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof rebind.BookExportFreezeV2RebindError) throw err;
      fail(classifySqliteError(err),String(err&&err.message||err),err);
    }
  }

  readExportFreezeState(bookProjectId) {
    const parent=this.readCurrentParent(bookProjectId);
    const row=this.db.prepare('SELECT export_freeze_identity,state_json FROM book_export_freeze_state WHERE book_project_id=?').get(bookProjectId);
    if (!row) fail('EXPORT_FREEZE_STATE_NOT_FOUND',bookProjectId);
    const state=parse(row.state_json,'book_export_freeze_state.state_json'); rebind.validateFreezeSpecialistState(state,parent);
    const derived=rebind.exportFreezeIdentity(state,parent); if (derived!==row.export_freeze_identity) fail('EXPORT_FREEZE_STATE_IDENTITY_MISMATCH',bookProjectId);
    return {export_freeze_identity:row.export_freeze_identity,state};
  }

  readExportFreezeReceipt(receiptId) {
    if (!nonEmpty(receiptId)) return null;
    const row=this.db.prepare('SELECT receipt_json FROM book_export_freeze_receipt WHERE receipt_id=?').get(receiptId);
    return row?parse(row.receipt_json,'book_export_freeze_receipt.receipt_json'):null;
  }
  _receiptByRequest(id) { return this.db.prepare('SELECT receipt_json,post_state_json,parent_receipt_id FROM book_export_freeze_receipt WHERE freeze_request_id=?').get(id)||null; }
  _receiptByIdempotency(id) { return this.db.prepare('SELECT receipt_json,post_state_json,parent_receipt_id FROM book_export_freeze_receipt WHERE idempotency_key=?').get(id)||null; }

  _replayPrepared(prepared) {
    const incoming=prepared&&prepared.specialist_delta&&prepared.specialist_delta.specialist_receipt;
    if (!incoming) fail('PREPARED_EXPORT_FREEZE_DELTA_REQUIRED');
    const row=this._receiptByRequest(incoming.freeze_request_id)||this._receiptByIdempotency(incoming.idempotency_key); if (!row) return null;
    const prior=parse(row.receipt_json,'book_export_freeze_receipt.receipt_json');
    if (prior.freeze_request_id!==incoming.freeze_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    if (prior.idempotency_key!==incoming.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
    if (prior.request_fingerprint!==incoming.request_fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.receipt_id!==incoming.receipt_id||prior.post_export_freeze_identity!==incoming.post_export_freeze_identity) fail('PREPARED_REPLAY_DIVERGENCE');
    const parentAtCommit=this._stateAt(prior.book_project_id,prior.post_parent_state_version),postState=parse(row.post_state_json,'book_export_freeze_receipt.post_state_json');
    rebind.validateFreezeSpecialistState(postState,parentAtCommit);
    return {replay:true,parent_state:parentAtCommit,export_freeze_state:postState,export_freeze_identity:prior.post_export_freeze_identity,specialist_receipt:prior,commit_receipt:this.readParentCommitReceipt(row.parent_receipt_id)};
  }

  commitPreparedExportFreeze(preparedInput) {
    const prepared=clone(preparedInput),replay=this._replayPrepared(prepared); if (replay) return replay;
    if (!prepared||!prepared.specialist_delta||!prepared.parent_effect) fail('PREPARED_EXPORT_FREEZE_DELTA_REQUIRED');
    const delta=prepared.specialist_delta,r=delta.specialist_receipt,effect=prepared.parent_effect,bookId=delta.book_project_id; let committed=false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const parentRow=this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId); if (!parentRow) fail('PARENT_NOT_FOUND',bookId);
      const currentParent=parse(parentRow.state_json,'canonical_parent.state_json'); core.validateParent(currentParent);
      const stateRow=this.db.prepare('SELECT export_freeze_identity,state_json FROM book_export_freeze_state WHERE book_project_id=?').get(bookId); if (!stateRow) fail('EXPORT_FREEZE_STATE_NOT_FOUND',bookId);
      const currentState=parse(stateRow.state_json,'book_export_freeze_state.state_json'); rebind.validateFreezeSpecialistState(currentState,currentParent);
      const currentIdentity=rebind.exportFreezeIdentity(currentState,currentParent);
      if (currentIdentity!==stateRow.export_freeze_identity||currentIdentity!==delta.expected_export_freeze_identity) fail('EXPORT_FREEZE_IDENTITY_CONFLICT');
      if (r.pre_parent_state_version!==currentParent.state_version||r.pre_parent_state_digest!==currentParent.state_digest) fail('EXPORT_FREEZE_PARENT_IDENTITY_CONFLICT');
      if (effect.expected_specialist_ledger_identity!==currentIdentity) fail('EXPORT_FREEZE_EFFECT_IDENTITY_MISMATCH');
      if (!Array.isArray(effect.specialist_receipt_refs)||!effect.specialist_receipt_refs.includes(r.receipt_id)) fail('EXPORT_FREEZE_RECEIPT_BINDING_MISMATCH');
      const applied=core.applyEffect(currentParent,effect),nextParent=applied.parent_state,parentReceipt=applied.commit_receipt;
      if (!prepared.anticipated_parent_state||prepared.anticipated_parent_state.state_digest!==nextParent.state_digest) fail('ANTICIPATED_PARENT_STATE_MISMATCH');
      rebind.validatePreparedExportFreezeDelta(delta,currentParent,nextParent);
      parentReceipt.export_freeze_pre_identity=delta.expected_export_freeze_identity;
      parentReceipt.export_freeze_post_identity=delta.post_export_freeze_identity;
      parentReceipt.export_freeze_transaction_receipt_ref=r.receipt_id;
      parentReceipt.transaction_identity=`BEF-TX-${core.sha256({parent_receipt_id:parentReceipt.receipt_id,specialist_receipt_id:r.receipt_id,pre:delta.expected_export_freeze_identity,post:delta.post_export_freeze_identity}).slice(0,32).toUpperCase()}`;
      const prc=clone(parentReceipt); delete prc.receipt_digest; parentReceipt.receipt_digest=core.sha256(prc);
      const seq=Number(this.db.prepare('SELECT COALESCE(MAX(commit_sequence),0)+1 AS next_sequence FROM parent_commit_receipt WHERE book_project_id=?').get(bookId).next_sequence);
      this._fault('before_parent_update',{current:currentParent,next:nextParent,receipt:parentReceipt,export_freeze_delta:delta});
      const pu=this.db.prepare('UPDATE canonical_parent SET state_version=?,state_digest=?,state_json=?,mutation_head=?,updated_at=? WHERE book_project_id=? AND state_version=? AND state_digest=?').run(nextParent.state_version,nextParent.state_digest,json(nextParent),nextParent.mutation_head,r.created_at,bookId,currentParent.state_version,currentParent.state_digest);
      if (Number(pu.changes)!==1) fail('PARENT_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_parent_update',{export_freeze_delta:delta});
      const su=this.db.prepare('UPDATE book_export_freeze_state SET export_freeze_identity=?,state_json=?,updated_at=? WHERE book_project_id=? AND export_freeze_identity=?').run(delta.post_export_freeze_identity,json(delta.post_state),r.created_at,bookId,delta.expected_export_freeze_identity);
      if (Number(su.changes)!==1) fail('EXPORT_FREEZE_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_export_freeze_update',{export_freeze_delta:delta});
      const stored=clone(r); stored.parent_commit_receipt_ref=parentReceipt.receipt_id; const src=clone(stored); delete src.receipt_digest; stored.receipt_digest=core.sha256(src);
      this.db.prepare('INSERT INTO book_export_freeze_receipt(receipt_id,book_project_id,freeze_request_id,idempotency_key,parent_receipt_id,pre_export_freeze_identity,post_export_freeze_identity,delta_digest,request_fingerprint,receipt_json,post_state_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(stored.receipt_id,bookId,stored.freeze_request_id,stored.idempotency_key,parentReceipt.receipt_id,delta.expected_export_freeze_identity,delta.post_export_freeze_identity,delta.delta_digest,stored.request_fingerprint,json(stored),json(delta.post_state));
      this.db.prepare('INSERT INTO parent_commit_receipt(receipt_id,book_project_id,effect_request_id,idempotency_key,request_fingerprint,post_state_version,post_state_digest,receipt_json,commit_sequence) VALUES(?,?,?,?,?,?,?,?,?)').run(parentReceipt.receipt_id,bookId,parentReceipt.effect_request_id,parentReceipt.idempotency_key,parentReceipt.request_fingerprint,parentReceipt.post_parent_state_version,parentReceipt.post_parent_state_digest,json(parentReceipt),seq);
      this.db.prepare('INSERT INTO parent_history(book_project_id,state_version,state_digest,state_json,receipt_id,created_at) VALUES(?,?,?,?,?,?)').run(bookId,nextParent.state_version,nextParent.state_digest,json(nextParent),parentReceipt.receipt_id,r.created_at);
      this._fault('before_commit',{parent_receipt:parentReceipt,export_freeze_delta:delta}); this.db.exec('COMMIT'); committed=true; this._fault('after_commit',{parent_receipt:parentReceipt,export_freeze_delta:delta});
      return {replay:false,parent_state:nextParent,export_freeze_state:delta.post_state,export_freeze_identity:delta.post_export_freeze_identity,specialist_receipt:stored,commit_receipt:parentReceipt};
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookExportFreezeV2StoreError||err instanceof BookCanonicalParentF6StoreError||err instanceof rebind.BookExportFreezeV2RebindError||err instanceof core.BookCanonicalParentF6Error||err instanceof core.BookCanonicalParentV2Error||err instanceof core.BookCanonicalParentF5Error) throw err;
      fail(classifySqliteError(err),String(err&&err.message||err),err);
    }
  }

  reconcileExportFreeze(preparedInput) {
    const prepared=clone(preparedInput),incoming=prepared&&prepared.specialist_delta&&prepared.specialist_delta.specialist_receipt; if (!incoming) fail('PREPARED_EXPORT_FREEZE_DELTA_REQUIRED');
    const row=this._receiptByRequest(incoming.freeze_request_id)||this._receiptByIdempotency(incoming.idempotency_key);
    if (!row) { const parent=this.readCurrentParent(prepared.specialist_delta.book_project_id),s=this.readExportFreezeState(prepared.specialist_delta.book_project_id); return {committed:false,parent_state:parent,export_freeze_state:s.state,export_freeze_identity:s.export_freeze_identity}; }
    const receipt=parse(row.receipt_json,'book_export_freeze_receipt.receipt_json');
    if (receipt.request_fingerprint!==incoming.request_fingerprint||receipt.receipt_id!==incoming.receipt_id) fail('PREPARED_RECONCILIATION_DIVERGENCE');
    const parent=this._stateAt(receipt.book_project_id,receipt.post_parent_state_version),state=parse(row.post_state_json,'book_export_freeze_receipt.post_state_json'); rebind.validateFreezeSpecialistState(state,parent);
    return {committed:true,parent_state:parent,export_freeze_state:state,export_freeze_identity:receipt.post_export_freeze_identity,specialist_receipt:receipt,commit_receipt:this.readParentCommitReceipt(row.parent_receipt_id)};
  }

  recoverAndVerifyExportFreeze(bookProjectId) {
    const base=this.recoverAndVerify(bookProjectId),current=this.readExportFreezeState(bookProjectId);
    const rows=this.db.prepare('SELECT receipt_json,post_state_json,parent_receipt_id FROM book_export_freeze_receipt WHERE book_project_id=? ORDER BY rowid ASC').all(bookProjectId);
    for (const row of rows) {
      const receipt=parse(row.receipt_json,'book_export_freeze_receipt.receipt_json'),parent=this._stateAt(bookProjectId,receipt.post_parent_state_version),state=parse(row.post_state_json,'book_export_freeze_receipt.post_state_json');
      rebind.validateFreezeSpecialistState(state,parent); if (core.sha256(state)!==receipt.post_export_freeze_identity) fail('EXPORT_FREEZE_RECEIPT_STATE_MISMATCH',receipt.receipt_id); if (!this.readParentCommitReceipt(row.parent_receipt_id)) fail('EXPORT_FREEZE_PARENT_RECEIPT_MISSING',receipt.receipt_id);
    }
    return {...base,export_freeze_identity:current.export_freeze_identity,export_freeze_receipt_count:rows.length};
  }
}

module.exports={ExportFreezeV2SqliteStore,BookExportFreezeV2StoreError};
