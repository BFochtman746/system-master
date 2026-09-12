'use strict';

const { classifySqliteError } = require('./canonical-parent-v2-sqlite-store.js');
const { CanonicalParentF6SqliteStore, BookCanonicalParentF6StoreError } = require('./canonical-parent-v2-f6-sqlite-store.js');
const core = require('./canonical-parent-v2-f6-core.js');
const rebind = require('./lifecycle-v2-rebind.js');

class BookLifecycleV2StoreError extends Error {
  constructor(code, detail = '', cause = null) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLifecycleV2StoreError';
    this.code = code;
    this.detail = detail;
    this.cause = cause || undefined;
  }
}

function fail(code, detail = '', cause = null) { throw new BookLifecycleV2StoreError(code, detail, cause); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function json(v) { return JSON.stringify(v); }
function parse(v, label) { try { return JSON.parse(v); } catch (e) { fail('STORE_JSON_CORRUPT', label, e); } }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }

class LifecycleV2SqliteStore extends CanonicalParentF6SqliteStore {
  constructor(dbPath, options = {}) {
    super(dbPath, options);
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS book_lifecycle_state (
          book_project_id TEXT PRIMARY KEY,
          lifecycle_identity TEXT NOT NULL,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
        CREATE TABLE IF NOT EXISTS book_lifecycle_receipt (
          receipt_id TEXT PRIMARY KEY,
          book_project_id TEXT NOT NULL,
          transition_request_id TEXT NOT NULL UNIQUE,
          idempotency_key TEXT NOT NULL UNIQUE,
          scope TEXT NOT NULL,
          parent_receipt_id TEXT UNIQUE,
          pre_lifecycle_identity TEXT NOT NULL,
          post_lifecycle_identity TEXT NOT NULL,
          delta_digest TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL,
          receipt_json TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
      `);
    } catch (err) {
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  createLifecycleState(stateInput, createdAt = new Date().toISOString()) {
    const state = clone(stateInput);
    const bookId = state && state.book_project_id;
    if (!nonEmpty(bookId)) fail('SPECIALIST_BOOK_PROJECT_ID_REQUIRED');
    const parent = this.readCurrentParent(bookId);
    rebind.validateLifecycleSpecialistState(state, parent);
    const identity = rebind.lifecycleIdentity(state, parent);
    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const currentRow = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!currentRow) fail('PARENT_NOT_FOUND', bookId);
      const current = parse(currentRow.state_json, 'canonical_parent.state_json');
      core.validateParent(current);
      rebind.validateLifecycleSpecialistState(state, current);
      const existing = this.db.prepare('SELECT lifecycle_identity FROM book_lifecycle_state WHERE book_project_id=?').get(bookId);
      if (existing) fail('LIFECYCLE_STATE_ALREADY_EXISTS', bookId);
      this.db.prepare('INSERT INTO book_lifecycle_state(book_project_id,lifecycle_identity,state_json,updated_at) VALUES(?,?,?,?)')
        .run(bookId, identity, json(state), createdAt);
      this.db.exec('COMMIT');
      committed = true;
      return { lifecycle_identity: identity, state };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookLifecycleV2StoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof rebind.BookLifecycleV2RebindError) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  readLifecycleState(bookProjectId) {
    const parent = this.readCurrentParent(bookProjectId);
    const row = this.db.prepare('SELECT lifecycle_identity,state_json FROM book_lifecycle_state WHERE book_project_id=?').get(bookProjectId);
    if (!row) fail('LIFECYCLE_STATE_NOT_FOUND', bookProjectId);
    const state = parse(row.state_json, 'book_lifecycle_state.state_json');
    rebind.validateLifecycleSpecialistState(state, parent);
    const derived = rebind.lifecycleIdentity(state, parent);
    if (derived !== row.lifecycle_identity) fail('LIFECYCLE_STATE_IDENTITY_MISMATCH', bookProjectId);
    return { lifecycle_identity: row.lifecycle_identity, state };
  }

  readLifecycleReceipt(receiptId) {
    if (!nonEmpty(receiptId)) return null;
    const row = this.db.prepare('SELECT receipt_json FROM book_lifecycle_receipt WHERE receipt_id=?').get(receiptId);
    return row ? parse(row.receipt_json, 'book_lifecycle_receipt.receipt_json') : null;
  }

  readLifecycleReceiptByRequest(transitionRequestId) {
    const row = this.db.prepare('SELECT receipt_json FROM book_lifecycle_receipt WHERE transition_request_id=?').get(transitionRequestId);
    return row ? parse(row.receipt_json, 'book_lifecycle_receipt.receipt_json') : null;
  }

  readLifecycleReceiptByIdempotencyKey(idempotencyKey) {
    const row = this.db.prepare('SELECT receipt_json FROM book_lifecycle_receipt WHERE idempotency_key=?').get(idempotencyKey);
    return row ? parse(row.receipt_json, 'book_lifecycle_receipt.receipt_json') : null;
  }

  _replayPrepared(prepared) {
    const delta = prepared && prepared.specialist_delta;
    const incoming = delta && delta.specialist_receipt;
    if (!incoming) fail('PREPARED_LIFECYCLE_DELTA_REQUIRED');
    const byReq = this.readLifecycleReceiptByRequest(incoming.transition_request_id);
    const byKey = this.readLifecycleReceiptByIdempotencyKey(incoming.idempotency_key);
    const prior = byReq || byKey;
    if (!prior) return null;
    if (prior.transition_request_id !== incoming.transition_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    if (prior.idempotency_key !== incoming.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
    if (prior.request_fingerprint !== incoming.request_fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.receipt_id !== incoming.receipt_id || prior.post_lifecycle_identity !== incoming.post_lifecycle_identity) fail('PREPARED_REPLAY_DIVERGENCE');
    const parentAtCommit = this._stateAt(prior.book_project_id, prior.post_parent_state_version);
    const currentLifecycle = this.db.prepare('SELECT lifecycle_identity,state_json FROM book_lifecycle_state WHERE book_project_id=?').get(prior.book_project_id);
    if (!currentLifecycle) fail('LIFECYCLE_STATE_NOT_FOUND', prior.book_project_id);
    return {
      replay: true,
      parent_state: parentAtCommit,
      lifecycle_state: parse(currentLifecycle.state_json, 'book_lifecycle_state.state_json'),
      lifecycle_identity: currentLifecycle.lifecycle_identity,
      specialist_receipt: prior,
      commit_receipt: prior.parent_commit_receipt_ref ? this.readParentCommitReceipt(prior.parent_commit_receipt_ref) : null,
    };
  }

  commitPreparedLifecycle(preparedInput) {
    const prepared = clone(preparedInput);
    const replay = this._replayPrepared(prepared);
    if (replay) return replay;
    if (!prepared || !prepared.specialist_delta) fail('PREPARED_LIFECYCLE_DELTA_REQUIRED');
    const delta = prepared.specialist_delta;
    const specialistReceipt = delta.specialist_receipt;
    const bookId = delta.book_project_id;
    if (!nonEmpty(bookId)) fail('SPECIALIST_BOOK_PROJECT_ID_REQUIRED');
    if (!['PROJECT','UNIT'].includes(delta.scope)) fail('INVALID_TRANSITION_SCOPE', String(delta.scope));
    if (delta.scope === 'PROJECT' && !prepared.parent_effect) fail('PROJECT_PARENT_EFFECT_REQUIRED');
    if (delta.scope === 'UNIT' && prepared.parent_effect !== null) fail('UNIT_PARENT_EFFECT_FORBIDDEN');

    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const parentRow = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!parentRow) fail('PARENT_NOT_FOUND', bookId);
      const currentParent = parse(parentRow.state_json, 'canonical_parent.state_json');
      core.validateParent(currentParent);

      const lifecycleRow = this.db.prepare('SELECT lifecycle_identity,state_json FROM book_lifecycle_state WHERE book_project_id=?').get(bookId);
      if (!lifecycleRow) fail('LIFECYCLE_STATE_NOT_FOUND', bookId);
      const currentLifecycle = parse(lifecycleRow.state_json, 'book_lifecycle_state.state_json');
      rebind.validateLifecycleSpecialistState(currentLifecycle, currentParent);
      if (rebind.lifecycleIdentity(currentLifecycle, currentParent) !== lifecycleRow.lifecycle_identity) fail('LIFECYCLE_STATE_IDENTITY_MISMATCH', bookId);
      if (lifecycleRow.lifecycle_identity !== delta.expected_lifecycle_identity) fail('LIFECYCLE_IDENTITY_CONFLICT');
      if (specialistReceipt.pre_parent_state_version !== currentParent.state_version || specialistReceipt.pre_parent_state_digest !== currentParent.state_digest) fail('LIFECYCLE_PARENT_IDENTITY_CONFLICT');

      let nextParent = currentParent;
      let parentReceipt = null;
      if (delta.scope === 'PROJECT') {
        const effect = prepared.parent_effect;
        if (effect.expected_specialist_ledger_identity !== lifecycleRow.lifecycle_identity) fail('LIFECYCLE_EFFECT_IDENTITY_MISMATCH');
        if (!Array.isArray(effect.specialist_receipt_refs) || !effect.specialist_receipt_refs.includes(specialistReceipt.receipt_id)) fail('LIFECYCLE_RECEIPT_BINDING_MISMATCH');
        const result = core.applyEffect(currentParent, effect);
        nextParent = result.parent_state;
        parentReceipt = result.commit_receipt;
        if (prepared.anticipated_parent_state && prepared.anticipated_parent_state.state_digest !== nextParent.state_digest) fail('ANTICIPATED_PARENT_STATE_MISMATCH');
        rebind.validatePreparedLifecycleDelta(delta, currentParent, nextParent);
      } else {
        rebind.validatePreparedLifecycleDelta(delta, currentParent, currentParent);
        if (specialistReceipt.post_parent_state_version !== currentParent.state_version || specialistReceipt.post_parent_state_digest !== currentParent.state_digest) fail('UNIT_PARENT_MUTATION_FORBIDDEN');
      }

      if (specialistReceipt.receipt_id !== rebind.specialistReceiptId({
        transition_request_id: specialistReceipt.transition_request_id,
        idempotency_key: specialistReceipt.idempotency_key,
        request_fingerprint: specialistReceipt.request_fingerprint,
      }, delta.expected_lifecycle_identity) && !nonEmpty(specialistReceipt.request_fingerprint)) {
        fail('LIFECYCLE_RECEIPT_BINDING_MISMATCH');
      }

      if (delta.scope === 'PROJECT') {
        parentReceipt.lifecycle_pre_identity = delta.expected_lifecycle_identity;
        parentReceipt.lifecycle_post_identity = delta.post_lifecycle_identity;
        parentReceipt.lifecycle_transaction_receipt_ref = specialistReceipt.receipt_id;
        parentReceipt.transaction_identity = `BLC-TX-${core.sha256({ parent_receipt_id: parentReceipt.receipt_id, lifecycle_receipt_id: specialistReceipt.receipt_id, pre: delta.expected_lifecycle_identity, post: delta.post_lifecycle_identity }).slice(0, 32).toUpperCase()}`;
        const receiptForDigest = clone(parentReceipt);
        delete receiptForDigest.receipt_digest;
        parentReceipt.receipt_digest = core.sha256(receiptForDigest);
      }

      const parentSequence = delta.scope === 'PROJECT'
        ? Number(this.db.prepare('SELECT COALESCE(MAX(commit_sequence),0)+1 AS next_sequence FROM parent_commit_receipt WHERE book_project_id=?').get(bookId).next_sequence)
        : null;

      if (delta.scope === 'PROJECT') {
        this._fault('before_parent_update', { current: currentParent, next: nextParent, receipt: parentReceipt, lifecycle_delta: delta });
        const parentUpdate = this.db.prepare('UPDATE canonical_parent SET state_version=?,state_digest=?,state_json=?,mutation_head=?,updated_at=? WHERE book_project_id=? AND state_version=? AND state_digest=?')
          .run(nextParent.state_version, nextParent.state_digest, json(nextParent), nextParent.mutation_head, specialistReceipt.created_at, bookId, currentParent.state_version, currentParent.state_digest);
        if (Number(parentUpdate.changes) !== 1) fail('PARENT_COMPARE_AND_SWAP_CONFLICT');
        this._fault('after_parent_update', { current: currentParent, next: nextParent, receipt: parentReceipt, lifecycle_delta: delta });
      }

      this._fault('before_lifecycle_update', { lifecycle_state: currentLifecycle, lifecycle_delta: delta });
      const lifecycleUpdate = this.db.prepare('UPDATE book_lifecycle_state SET lifecycle_identity=?,state_json=?,updated_at=? WHERE book_project_id=? AND lifecycle_identity=?')
        .run(delta.post_lifecycle_identity, json(delta.post_state), specialistReceipt.created_at, bookId, delta.expected_lifecycle_identity);
      if (Number(lifecycleUpdate.changes) !== 1) fail('LIFECYCLE_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_lifecycle_update', { lifecycle_delta: delta });

      const parentReceiptId = parentReceipt ? parentReceipt.receipt_id : null;
      const storedSpecialistReceipt = clone(specialistReceipt);
      storedSpecialistReceipt.parent_commit_receipt_ref = parentReceiptId;
      const srForDigest = clone(storedSpecialistReceipt);
      delete srForDigest.receipt_digest;
      storedSpecialistReceipt.receipt_digest = core.sha256(srForDigest);

      this.db.prepare('INSERT INTO book_lifecycle_receipt(receipt_id,book_project_id,transition_request_id,idempotency_key,scope,parent_receipt_id,pre_lifecycle_identity,post_lifecycle_identity,delta_digest,request_fingerprint,receipt_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(storedSpecialistReceipt.receipt_id, bookId, storedSpecialistReceipt.transition_request_id, storedSpecialistReceipt.idempotency_key, storedSpecialistReceipt.scope, parentReceiptId, delta.expected_lifecycle_identity, delta.post_lifecycle_identity, delta.delta_digest, storedSpecialistReceipt.request_fingerprint, json(storedSpecialistReceipt));
      this._fault('after_lifecycle_receipt_insert', { specialist_receipt: storedSpecialistReceipt });

      if (delta.scope === 'PROJECT') {
        this.db.prepare('INSERT INTO parent_commit_receipt(receipt_id,book_project_id,effect_request_id,idempotency_key,request_fingerprint,post_state_version,post_state_digest,receipt_json,commit_sequence) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(parentReceipt.receipt_id, bookId, parentReceipt.effect_request_id, parentReceipt.idempotency_key, parentReceipt.request_fingerprint, parentReceipt.post_parent_state_version, parentReceipt.post_parent_state_digest, json(parentReceipt), parentSequence);
        this._fault('after_parent_receipt_insert', { receipt: parentReceipt });
        this.db.prepare('INSERT INTO parent_history(book_project_id,state_version,state_digest,state_json,receipt_id,created_at) VALUES(?,?,?,?,?,?)')
          .run(bookId, nextParent.state_version, nextParent.state_digest, json(nextParent), parentReceipt.receipt_id, specialistReceipt.created_at);
      }

      this._fault('before_commit', { current: currentParent, next: nextParent, parent_receipt: parentReceipt, lifecycle_delta: delta });
      this.db.exec('COMMIT');
      committed = true;
      this._fault('after_commit', { current: currentParent, next: nextParent, parent_receipt: parentReceipt, lifecycle_delta: delta });
      return {
        replay: false,
        parent_state: nextParent,
        lifecycle_state: delta.post_state,
        lifecycle_identity: delta.post_lifecycle_identity,
        specialist_receipt: storedSpecialistReceipt,
        commit_receipt: parentReceipt,
      };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookLifecycleV2StoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof core.BookCanonicalParentF6Error || err instanceof core.BookCanonicalParentV2Error || err instanceof core.BookCanonicalParentF5Error || err instanceof rebind.BookLifecycleV2RebindError) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  reconcileLifecycle(preparedInput) {
    const prepared = clone(preparedInput);
    if (!prepared || !prepared.specialist_delta || !prepared.specialist_delta.specialist_receipt) fail('PREPARED_LIFECYCLE_DELTA_REQUIRED');
    const incoming = prepared.specialist_delta.specialist_receipt;
    const receipt = this.readLifecycleReceiptByRequest(incoming.transition_request_id) || this.readLifecycleReceiptByIdempotencyKey(incoming.idempotency_key);
    if (!receipt) return { committed: false };
    if (receipt.request_fingerprint !== incoming.request_fingerprint || receipt.receipt_id !== incoming.receipt_id) fail('IDEMPOTENCY_KEY_CONFLICT');
    const parentState = this._stateAt(receipt.book_project_id, receipt.post_parent_state_version);
    const lifecycleRow = this.db.prepare('SELECT lifecycle_identity,state_json FROM book_lifecycle_state WHERE book_project_id=?').get(receipt.book_project_id);
    if (!lifecycleRow) fail('LIFECYCLE_STATE_NOT_FOUND', receipt.book_project_id);
    if (lifecycleRow.lifecycle_identity !== receipt.post_lifecycle_identity) fail('LIFECYCLE_RECONCILIATION_IDENTITY_MISMATCH');
    const lifecycleState = parse(lifecycleRow.state_json, 'book_lifecycle_state.state_json');
    return {
      committed: true,
      parent_state: parentState,
      lifecycle_state: lifecycleState,
      lifecycle_identity: lifecycleRow.lifecycle_identity,
      specialist_receipt: receipt,
      commit_receipt: receipt.parent_commit_receipt_ref ? this.readParentCommitReceipt(receipt.parent_commit_receipt_ref) : null,
    };
  }

  recoverLifecycleAndVerify(bookProjectId) {
    const parentRecovery = super.recoverAndVerify(bookProjectId);
    const lifecycleRow = this.db.prepare('SELECT lifecycle_identity,state_json FROM book_lifecycle_state WHERE book_project_id=?').get(bookProjectId);
    if (!lifecycleRow) return { ...parentRecovery, lifecycle_present: false, lifecycle_receipt_count: 0 };
    const currentParent = this.readCurrentParent(bookProjectId);
    const lifecycleState = parse(lifecycleRow.state_json, 'book_lifecycle_state.state_json');
    rebind.validateLifecycleSpecialistState(lifecycleState, currentParent);
    if (rebind.lifecycleIdentity(lifecycleState, currentParent) !== lifecycleRow.lifecycle_identity) fail('LIFECYCLE_STATE_IDENTITY_MISMATCH', bookProjectId);
    const receipts = this.db.prepare('SELECT receipt_json,parent_receipt_id,post_lifecycle_identity FROM book_lifecycle_receipt WHERE book_project_id=? ORDER BY rowid ASC').all(bookProjectId);
    for (const row of receipts) {
      const specialistReceipt = parse(row.receipt_json, 'book_lifecycle_receipt.receipt_json');
      const receiptCopy = clone(specialistReceipt);
      const claimed = receiptCopy.receipt_digest;
      delete receiptCopy.receipt_digest;
      if (core.sha256(receiptCopy) !== claimed) fail('SPECIALIST_RECEIPT_DIGEST_MISMATCH');
      if (specialistReceipt.post_lifecycle_identity !== row.post_lifecycle_identity) fail('LIFECYCLE_RECEIPT_ROW_MISMATCH');
      if (row.parent_receipt_id) {
        const parentReceipt = this.readParentCommitReceipt(row.parent_receipt_id);
        if (!parentReceipt || !Array.isArray(parentReceipt.specialist_receipt_refs) || !parentReceipt.specialist_receipt_refs.includes(specialistReceipt.receipt_id)) fail('LIFECYCLE_PARENT_RECEIPT_LINK_MISMATCH');
      }
    }
    return { ...parentRecovery, lifecycle_present: true, lifecycle_identity: lifecycleRow.lifecycle_identity, lifecycle_receipt_count: receipts.length };
  }
}

module.exports = {
  LifecycleV2SqliteStore,
  BookLifecycleV2StoreError,
};
