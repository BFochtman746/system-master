'use strict';

const { classifySqliteError } = require('./canonical-parent-v2-sqlite-store.js');
const { CanonicalParentF6SqliteStore, BookCanonicalParentF6StoreError } = require('./canonical-parent-v2-f6-sqlite-store.js');
const core = require('./canonical-parent-v2-f6-core.js');
const rebind = require('./version-admission-v2-rebind.js');

class BookVersionAdmissionStoreError extends Error {
  constructor(code, detail = '', cause = null) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookVersionAdmissionStoreError';
    this.code = code;
    this.detail = detail;
    this.cause = cause || undefined;
  }
}

function fail(code, detail = '', cause = null) { throw new BookVersionAdmissionStoreError(code, detail, cause); }
function json(v) { return JSON.stringify(v); }
function parse(v, label) { try { return JSON.parse(v); } catch (e) { fail('STORE_JSON_CORRUPT', label, e); } }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }

class VersionAdmissionV2SqliteStore extends CanonicalParentF6SqliteStore {
  constructor(dbPath, options = {}) {
    super(dbPath, options);
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS book_version_admission_state (
          book_project_id TEXT PRIMARY KEY,
          ledger_identity TEXT NOT NULL,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
        CREATE TABLE IF NOT EXISTS book_version_admission_receipt (
          receipt_id TEXT PRIMARY KEY,
          book_project_id TEXT NOT NULL,
          mutation_id TEXT NOT NULL UNIQUE,
          parent_receipt_id TEXT NOT NULL UNIQUE,
          pre_ledger_identity TEXT NOT NULL,
          post_ledger_identity TEXT NOT NULL,
          delta_digest TEXT NOT NULL,
          receipt_json TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
      `);
    } catch (err) {
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  createVersionAdmissionState(stateInput, createdAt = new Date().toISOString()) {
    const state = JSON.parse(JSON.stringify(stateInput));
    rebind.validateSpecialistState(state);
    const identity = rebind.specialistIdentity(state);
    const bookId = state.book_project_id;
    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const parentRow = this.db.prepare('SELECT book_project_id FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!parentRow) fail('PARENT_NOT_FOUND', bookId);
      const existing = this.db.prepare('SELECT ledger_identity FROM book_version_admission_state WHERE book_project_id=?').get(bookId);
      if (existing) fail('SPECIALIST_STATE_ALREADY_EXISTS', bookId);
      this.db.prepare('INSERT INTO book_version_admission_state(book_project_id,ledger_identity,state_json,updated_at) VALUES(?,?,?,?)')
        .run(bookId, identity, json(state), createdAt);
      this.db.exec('COMMIT');
      committed = true;
      return { ledger_identity: identity, state };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookVersionAdmissionStoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof rebind.BookVersionAdmissionRebindError) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  readVersionAdmissionState(bookProjectId) {
    const row = this.db.prepare('SELECT ledger_identity,state_json FROM book_version_admission_state WHERE book_project_id=?').get(bookProjectId);
    if (!row) fail('SPECIALIST_STATE_NOT_FOUND', bookProjectId);
    const state = parse(row.state_json, 'book_version_admission_state.state_json');
    rebind.validateSpecialistState(state);
    const derived = rebind.specialistIdentity(state);
    if (derived !== row.ledger_identity) fail('SPECIALIST_STATE_IDENTITY_MISMATCH', bookProjectId);
    return { ledger_identity: row.ledger_identity, state };
  }

  readSpecialistReceipt(receiptId) {
    if (!nonEmpty(receiptId)) return null;
    const row = this.db.prepare('SELECT receipt_json FROM book_version_admission_receipt WHERE receipt_id=?').get(receiptId);
    return row ? parse(row.receipt_json, 'book_version_admission_receipt.receipt_json') : null;
  }

  commitEffect(effectInput, preparedSpecialistDelta = null) {
    const effect = JSON.parse(JSON.stringify(effectInput));
    if (effect.effect_type !== core.F5_EFFECT_TYPE) return super.commitEffect(effect);
    const fingerprint = core.effectRequestFingerprint(effect);
    const byReq = this.readCommitReceiptByRequest(effect.effect_request_id);
    const byKey = this.readCommitReceiptByIdempotencyKey(effect.idempotency_key);
    const prior = byReq || byKey;
    if (prior) {
      if (prior.effect_request_id !== effect.effect_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
      if (prior.idempotency_key !== effect.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
      if (prior.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
      const specialistReceiptId = Array.isArray(prior.specialist_receipt_refs) ? prior.specialist_receipt_refs[0] : null;
      return {
        replay: true,
        parent_state: this._stateAt(prior.book_project_id, prior.post_parent_state_version),
        commit_receipt: prior,
        specialist_receipt: this.readSpecialistReceipt(specialistReceiptId),
      };
    }

    rebind.validatePreparedDelta(preparedSpecialistDelta);
    const delta = JSON.parse(JSON.stringify(preparedSpecialistDelta));
    const bookId = this._inferBookProjectId(effect);
    if (delta.book_project_id !== bookId) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
    if (effect.expected_specialist_ledger_identity !== delta.expected_ledger_identity) fail('SPECIALIST_EFFECT_IDENTITY_MISMATCH');
    if (effect.effect_payload.specialist_delta_digest !== delta.delta_digest) fail('SPECIALIST_EFFECT_DELTA_DIGEST_MISMATCH');
    if (!effect.specialist_receipt_refs.includes(delta.specialist_receipt.receipt_id)) fail('SPECIALIST_RECEIPT_BINDING_MISMATCH');

    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const currentRow = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!currentRow) fail('PARENT_NOT_FOUND', bookId);
      const current = parse(currentRow.state_json, 'canonical_parent.state_json');
      core.validateParent(current);

      const specialistRow = this.db.prepare('SELECT ledger_identity,state_json FROM book_version_admission_state WHERE book_project_id=?').get(bookId);
      if (!specialistRow) fail('SPECIALIST_STATE_NOT_FOUND', bookId);
      const specialistState = parse(specialistRow.state_json, 'book_version_admission_state.state_json');
      rebind.validateSpecialistState(specialistState);
      if (rebind.specialistIdentity(specialistState) !== specialistRow.ledger_identity) fail('SPECIALIST_STATE_IDENTITY_MISMATCH', bookId);
      if (specialistRow.ledger_identity !== delta.expected_ledger_identity) fail('SPECIALIST_LEDGER_IDENTITY_CONFLICT');
      if (specialistRow.ledger_identity !== effect.expected_specialist_ledger_identity) fail('SPECIALIST_EFFECT_IDENTITY_MISMATCH');

      const result = core.applyEffect(current, effect);
      const next = result.parent_state;
      const receipt = result.commit_receipt;
      receipt.specialist_pre_ledger_identity = delta.expected_ledger_identity;
      receipt.specialist_post_ledger_identity = delta.post_ledger_identity;
      receipt.specialist_transaction_receipt_ref = delta.specialist_receipt.receipt_id;
      receipt.transaction_identity = `BVA-TX-${core.sha256({ parent_receipt_id: receipt.receipt_id, specialist_receipt_id: delta.specialist_receipt.receipt_id, pre: delta.expected_ledger_identity, post: delta.post_ledger_identity }).slice(0, 32).toUpperCase()}`;
      const receiptForDigest = JSON.parse(JSON.stringify(receipt));
      delete receiptForDigest.receipt_digest;
      receipt.receipt_digest = core.sha256(receiptForDigest);

      const sequenceRow = this.db.prepare('SELECT COALESCE(MAX(commit_sequence),0)+1 AS next_sequence FROM parent_commit_receipt WHERE book_project_id=?').get(bookId);
      const seq = Number(sequenceRow.next_sequence);
      this._fault('before_parent_update', { current, next, receipt, specialist_delta: delta });
      const parentUpdate = this.db.prepare('UPDATE canonical_parent SET state_version=?,state_digest=?,state_json=?,mutation_head=?,updated_at=? WHERE book_project_id=? AND state_version=? AND state_digest=?')
        .run(next.state_version, next.state_digest, json(next), next.mutation_head, receipt.committed_at, bookId, current.state_version, current.state_digest);
      if (Number(parentUpdate.changes) !== 1) fail('PARENT_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_parent_update', { current, next, receipt, specialist_delta: delta });

      this._fault('before_specialist_update', { specialist_state: specialistState, specialist_delta: delta });
      const specialistUpdate = this.db.prepare('UPDATE book_version_admission_state SET ledger_identity=?,state_json=?,updated_at=? WHERE book_project_id=? AND ledger_identity=?')
        .run(delta.post_ledger_identity, json(delta.post_state), receipt.committed_at, bookId, delta.expected_ledger_identity);
      if (Number(specialistUpdate.changes) !== 1) fail('SPECIALIST_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_specialist_update', { specialist_delta: delta });

      this.db.prepare('INSERT INTO book_version_admission_receipt(receipt_id,book_project_id,mutation_id,parent_receipt_id,pre_ledger_identity,post_ledger_identity,delta_digest,receipt_json) VALUES(?,?,?,?,?,?,?,?)')
        .run(delta.specialist_receipt.receipt_id, bookId, delta.specialist_receipt.mutation_id, receipt.receipt_id, delta.expected_ledger_identity, delta.post_ledger_identity, delta.delta_digest, json(delta.specialist_receipt));
      this._fault('after_specialist_receipt_insert', { specialist_receipt: delta.specialist_receipt });

      this.db.prepare('INSERT INTO parent_commit_receipt(receipt_id,book_project_id,effect_request_id,idempotency_key,request_fingerprint,post_state_version,post_state_digest,receipt_json,commit_sequence) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(receipt.receipt_id, bookId, receipt.effect_request_id, receipt.idempotency_key, receipt.request_fingerprint, receipt.post_parent_state_version, receipt.post_parent_state_digest, json(receipt), seq);
      this._fault('after_receipt_insert', { receipt });
      this.db.prepare('INSERT INTO parent_history(book_project_id,state_version,state_digest,state_json,receipt_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(bookId, next.state_version, next.state_digest, json(next), receipt.receipt_id, receipt.committed_at);
      this._fault('before_commit', { current, next, receipt, specialist_delta: delta });
      this.db.exec('COMMIT');
      committed = true;
      this._fault('after_commit', { current, next, receipt, specialist_delta: delta });
      return { replay: false, parent_state: next, commit_receipt: receipt, specialist_receipt: delta.specialist_receipt };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookVersionAdmissionStoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof core.BookCanonicalParentV2Error || err instanceof core.BookCanonicalParentF5Error || err instanceof core.BookCanonicalParentF6Error || err instanceof rebind.BookVersionAdmissionRebindError) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  reconcileContentAdmission(effectInput) {
    const effect = JSON.parse(JSON.stringify(effectInput));
    const receipt = this.readCommitReceiptByRequest(effect.effect_request_id) || this.readCommitReceiptByIdempotencyKey(effect.idempotency_key);
    if (!receipt) return { committed: false };
    if (receipt.request_fingerprint !== core.effectRequestFingerprint(effect)) fail('IDEMPOTENCY_KEY_CONFLICT');
    const specialistReceiptId = Array.isArray(receipt.specialist_receipt_refs) ? receipt.specialist_receipt_refs[0] : null;
    const specialistReceipt = this.readSpecialistReceipt(specialistReceiptId);
    if (!specialistReceipt) fail('SPECIALIST_RECEIPT_MISSING', specialistReceiptId || 'none');
    const specialist = this.readVersionAdmissionState(receipt.book_project_id);
    if (specialist.ledger_identity !== specialistReceipt.post_ledger_identity) fail('SPECIALIST_RECONCILIATION_IDENTITY_MISMATCH');
    return {
      committed: true,
      parent_state: this._stateAt(receipt.book_project_id, receipt.post_parent_state_version),
      commit_receipt: receipt,
      specialist_receipt: specialistReceipt,
      specialist_ledger_identity: specialist.ledger_identity,
    };
  }

  recoverAndVerify(bookProjectId) {
    const baseResult = super.recoverAndVerify(bookProjectId);
    const specialist = this.readVersionAdmissionState(bookProjectId);
    const receipts = this.db.prepare('SELECT receipt_json,parent_receipt_id,post_ledger_identity FROM book_version_admission_receipt WHERE book_project_id=? ORDER BY rowid ASC').all(bookProjectId);
    for (const row of receipts) {
      const specialistReceipt = parse(row.receipt_json, 'book_version_admission_receipt.receipt_json');
      if (specialistReceipt.post_ledger_identity !== row.post_ledger_identity) fail('SPECIALIST_RECEIPT_ROW_MISMATCH');
      const parentReceipt = this.readParentCommitReceipt(row.parent_receipt_id);
      if (!parentReceipt || !parentReceipt.specialist_receipt_refs.includes(specialistReceipt.receipt_id)) fail('SPECIALIST_PARENT_RECEIPT_LINK_MISMATCH');
    }
    return { ...baseResult, specialist_ledger_identity: specialist.ledger_identity, specialist_receipt_count: receipts.length };
  }
}

module.exports = {
  VersionAdmissionV2SqliteStore,
  BookVersionAdmissionStoreError,
};
