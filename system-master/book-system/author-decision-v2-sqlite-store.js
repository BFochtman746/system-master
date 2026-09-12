'use strict';

const { classifySqliteError } = require('./canonical-parent-v2-sqlite-store.js');
const { CanonicalParentF6SqliteStore, BookCanonicalParentF6StoreError } = require('./canonical-parent-v2-f6-sqlite-store.js');
const core = require('./canonical-parent-v2-f6-core.js');
const rebind = require('./author-decision-v2-rebind.js');

class BookAuthorDecisionV2StoreError extends Error {
  constructor(code, detail = '', cause = null) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookAuthorDecisionV2StoreError';
    this.code = code;
    this.detail = detail;
    this.cause = cause || undefined;
  }
}

function fail(code, detail = '', cause = null) { throw new BookAuthorDecisionV2StoreError(code, detail, cause); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function json(v) { return JSON.stringify(v); }
function parse(v, label) { try { return JSON.parse(v); } catch (e) { fail('STORE_JSON_CORRUPT', label, e); } }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }

class AuthorDecisionV2SqliteStore extends CanonicalParentF6SqliteStore {
  constructor(dbPath, options = {}) {
    super(dbPath, options);
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS book_author_decision_state (
          book_project_id TEXT PRIMARY KEY,
          author_decision_identity TEXT NOT NULL,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
        CREATE TABLE IF NOT EXISTS book_author_decision_receipt (
          receipt_id TEXT PRIMARY KEY,
          book_project_id TEXT NOT NULL,
          resolution_request_id TEXT NOT NULL UNIQUE,
          idempotency_key TEXT NOT NULL UNIQUE,
          parent_receipt_id TEXT NOT NULL UNIQUE,
          pre_author_decision_identity TEXT NOT NULL,
          post_author_decision_identity TEXT NOT NULL,
          delta_digest TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL,
          receipt_json TEXT NOT NULL,
          post_state_json TEXT NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
      `);
    } catch (err) {
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  createAuthorDecisionState(stateInput, createdAt = new Date().toISOString()) {
    const state = clone(stateInput);
    const bookId = state && state.book_project_id;
    if (!nonEmpty(bookId)) fail('SPECIALIST_BOOK_PROJECT_ID_REQUIRED');
    const parent = this.readCurrentParent(bookId);
    rebind.validateAuthorDecisionSpecialistState(state, parent);
    const identity = rebind.authorDecisionIdentity(state, parent);
    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const parentRow = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!parentRow) fail('PARENT_NOT_FOUND', bookId);
      const current = parse(parentRow.state_json, 'canonical_parent.state_json');
      core.validateParent(current);
      rebind.validateAuthorDecisionSpecialistState(state, current);
      const existing = this.db.prepare('SELECT author_decision_identity FROM book_author_decision_state WHERE book_project_id=?').get(bookId);
      if (existing) fail('AUTHOR_DECISION_STATE_ALREADY_EXISTS', bookId);
      this.db.prepare('INSERT INTO book_author_decision_state(book_project_id,author_decision_identity,state_json,updated_at) VALUES(?,?,?,?)')
        .run(bookId, identity, json(state), createdAt);
      this.db.exec('COMMIT');
      committed = true;
      return { author_decision_identity: identity, state };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookAuthorDecisionV2StoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof rebind.BookAuthorDecisionV2RebindError) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  readAuthorDecisionState(bookProjectId) {
    const parent = this.readCurrentParent(bookProjectId);
    const row = this.db.prepare('SELECT author_decision_identity,state_json FROM book_author_decision_state WHERE book_project_id=?').get(bookProjectId);
    if (!row) fail('AUTHOR_DECISION_STATE_NOT_FOUND', bookProjectId);
    const state = parse(row.state_json, 'book_author_decision_state.state_json');
    rebind.validateAuthorDecisionSpecialistState(state, parent);
    const derived = rebind.authorDecisionIdentity(state, parent);
    if (derived !== row.author_decision_identity) fail('AUTHOR_DECISION_STATE_IDENTITY_MISMATCH', bookProjectId);
    return { author_decision_identity: row.author_decision_identity, state };
  }

  readAuthorDecisionReceipt(receiptId) {
    if (!nonEmpty(receiptId)) return null;
    const row = this.db.prepare('SELECT receipt_json FROM book_author_decision_receipt WHERE receipt_id=?').get(receiptId);
    return row ? parse(row.receipt_json, 'book_author_decision_receipt.receipt_json') : null;
  }

  _readReceiptRowByRequest(resolutionRequestId) {
    return this.db.prepare('SELECT receipt_json,post_state_json,parent_receipt_id FROM book_author_decision_receipt WHERE resolution_request_id=?').get(resolutionRequestId) || null;
  }

  _readReceiptRowByIdempotencyKey(idempotencyKey) {
    return this.db.prepare('SELECT receipt_json,post_state_json,parent_receipt_id FROM book_author_decision_receipt WHERE idempotency_key=?').get(idempotencyKey) || null;
  }

  _replayPrepared(prepared) {
    const delta = prepared && prepared.specialist_delta;
    const incoming = delta && delta.specialist_receipt;
    if (!incoming) fail('PREPARED_AUTHOR_DECISION_DELTA_REQUIRED');
    const row = this._readReceiptRowByRequest(incoming.resolution_request_id) || this._readReceiptRowByIdempotencyKey(incoming.idempotency_key);
    if (!row) return null;
    const prior = parse(row.receipt_json, 'book_author_decision_receipt.receipt_json');
    if (prior.resolution_request_id !== incoming.resolution_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    if (prior.idempotency_key !== incoming.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
    if (prior.request_fingerprint !== incoming.request_fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.receipt_id !== incoming.receipt_id || prior.post_author_decision_identity !== incoming.post_author_decision_identity) fail('PREPARED_REPLAY_DIVERGENCE');
    const parentAtCommit = this._stateAt(prior.book_project_id, prior.post_parent_state_version);
    const postState = parse(row.post_state_json, 'book_author_decision_receipt.post_state_json');
    rebind.validateAuthorDecisionSpecialistState(postState, parentAtCommit);
    return {
      replay: true,
      parent_state: parentAtCommit,
      author_decision_state: postState,
      author_decision_identity: prior.post_author_decision_identity,
      specialist_receipt: prior,
      commit_receipt: this.readParentCommitReceipt(row.parent_receipt_id),
    };
  }

  commitPreparedAuthorDecision(preparedInput) {
    const prepared = clone(preparedInput);
    const replay = this._replayPrepared(prepared);
    if (replay) return replay;
    if (!prepared || !prepared.specialist_delta || !prepared.parent_effect) fail('PREPARED_AUTHOR_DECISION_DELTA_REQUIRED');
    const delta = prepared.specialist_delta;
    const specialistReceipt = delta.specialist_receipt;
    const effect = prepared.parent_effect;
    const bookId = delta.book_project_id;
    if (!nonEmpty(bookId)) fail('SPECIALIST_BOOK_PROJECT_ID_REQUIRED');

    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const parentRow = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (!parentRow) fail('PARENT_NOT_FOUND', bookId);
      const currentParent = parse(parentRow.state_json, 'canonical_parent.state_json');
      core.validateParent(currentParent);

      const stateRow = this.db.prepare('SELECT author_decision_identity,state_json FROM book_author_decision_state WHERE book_project_id=?').get(bookId);
      if (!stateRow) fail('AUTHOR_DECISION_STATE_NOT_FOUND', bookId);
      const currentState = parse(stateRow.state_json, 'book_author_decision_state.state_json');
      rebind.validateAuthorDecisionSpecialistState(currentState, currentParent);
      const currentIdentity = rebind.authorDecisionIdentity(currentState, currentParent);
      if (currentIdentity !== stateRow.author_decision_identity) fail('AUTHOR_DECISION_STATE_IDENTITY_MISMATCH', bookId);
      if (currentIdentity !== delta.expected_author_decision_identity) fail('AUTHOR_DECISION_IDENTITY_CONFLICT');
      if (specialistReceipt.pre_parent_state_version !== currentParent.state_version || specialistReceipt.pre_parent_state_digest !== currentParent.state_digest) fail('AUTHOR_DECISION_PARENT_IDENTITY_CONFLICT');
      if (effect.expected_specialist_ledger_identity !== currentIdentity) fail('AUTHOR_DECISION_EFFECT_IDENTITY_MISMATCH');
      if (!Array.isArray(effect.specialist_receipt_refs) || !effect.specialist_receipt_refs.includes(specialistReceipt.receipt_id)) fail('AUTHOR_DECISION_RECEIPT_BINDING_MISMATCH');

      const result = core.applyEffect(currentParent, effect);
      const nextParent = result.parent_state;
      const parentReceipt = result.commit_receipt;
      if (!prepared.anticipated_parent_state || prepared.anticipated_parent_state.state_digest !== nextParent.state_digest) fail('ANTICIPATED_PARENT_STATE_MISMATCH');
      rebind.validatePreparedAuthorDecisionDelta(delta, currentParent, nextParent);

      parentReceipt.author_decision_pre_identity = delta.expected_author_decision_identity;
      parentReceipt.author_decision_post_identity = delta.post_author_decision_identity;
      parentReceipt.author_decision_transaction_receipt_ref = specialistReceipt.receipt_id;
      parentReceipt.transaction_identity = `BAD-TX-${core.sha256({ parent_receipt_id: parentReceipt.receipt_id, specialist_receipt_id: specialistReceipt.receipt_id, pre: delta.expected_author_decision_identity, post: delta.post_author_decision_identity }).slice(0, 32).toUpperCase()}`;
      const parentReceiptForDigest = clone(parentReceipt); delete parentReceiptForDigest.receipt_digest;
      parentReceipt.receipt_digest = core.sha256(parentReceiptForDigest);

      const parentSequence = Number(this.db.prepare('SELECT COALESCE(MAX(commit_sequence),0)+1 AS next_sequence FROM parent_commit_receipt WHERE book_project_id=?').get(bookId).next_sequence);
      this._fault('before_parent_update', { current: currentParent, next: nextParent, receipt: parentReceipt, author_decision_delta: delta });
      const parentUpdate = this.db.prepare('UPDATE canonical_parent SET state_version=?,state_digest=?,state_json=?,mutation_head=?,updated_at=? WHERE book_project_id=? AND state_version=? AND state_digest=?')
        .run(nextParent.state_version, nextParent.state_digest, json(nextParent), nextParent.mutation_head, specialistReceipt.created_at, bookId, currentParent.state_version, currentParent.state_digest);
      if (Number(parentUpdate.changes) !== 1) fail('PARENT_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_parent_update', { current: currentParent, next: nextParent, receipt: parentReceipt, author_decision_delta: delta });

      this._fault('before_author_decision_update', { author_decision_state: currentState, author_decision_delta: delta });
      const stateUpdate = this.db.prepare('UPDATE book_author_decision_state SET author_decision_identity=?,state_json=?,updated_at=? WHERE book_project_id=? AND author_decision_identity=?')
        .run(delta.post_author_decision_identity, json(delta.post_state), specialistReceipt.created_at, bookId, delta.expected_author_decision_identity);
      if (Number(stateUpdate.changes) !== 1) fail('AUTHOR_DECISION_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_author_decision_update', { author_decision_delta: delta });

      const storedSpecialistReceipt = clone(specialistReceipt);
      storedSpecialistReceipt.parent_commit_receipt_ref = parentReceipt.receipt_id;
      const srForDigest = clone(storedSpecialistReceipt); delete srForDigest.receipt_digest;
      storedSpecialistReceipt.receipt_digest = core.sha256(srForDigest);
      this.db.prepare('INSERT INTO book_author_decision_receipt(receipt_id,book_project_id,resolution_request_id,idempotency_key,parent_receipt_id,pre_author_decision_identity,post_author_decision_identity,delta_digest,request_fingerprint,receipt_json,post_state_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(storedSpecialistReceipt.receipt_id, bookId, storedSpecialistReceipt.resolution_request_id, storedSpecialistReceipt.idempotency_key, parentReceipt.receipt_id, delta.expected_author_decision_identity, delta.post_author_decision_identity, delta.delta_digest, storedSpecialistReceipt.request_fingerprint, json(storedSpecialistReceipt), json(delta.post_state));
      this._fault('after_author_decision_receipt_insert', { specialist_receipt: storedSpecialistReceipt });

      this.db.prepare('INSERT INTO parent_commit_receipt(receipt_id,book_project_id,effect_request_id,idempotency_key,request_fingerprint,post_state_version,post_state_digest,receipt_json,commit_sequence) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(parentReceipt.receipt_id, bookId, parentReceipt.effect_request_id, parentReceipt.idempotency_key, parentReceipt.request_fingerprint, parentReceipt.post_parent_state_version, parentReceipt.post_parent_state_digest, json(parentReceipt), parentSequence);
      this._fault('after_parent_receipt_insert', { receipt: parentReceipt });
      this.db.prepare('INSERT INTO parent_history(book_project_id,state_version,state_digest,state_json,receipt_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(bookId, nextParent.state_version, nextParent.state_digest, json(nextParent), parentReceipt.receipt_id, specialistReceipt.created_at);

      this._fault('before_commit', { current: currentParent, next: nextParent, parent_receipt: parentReceipt, author_decision_delta: delta });
      this.db.exec('COMMIT');
      committed = true;
      this._fault('after_commit', { current: currentParent, next: nextParent, parent_receipt: parentReceipt, author_decision_delta: delta });
      return {
        replay: false,
        parent_state: nextParent,
        author_decision_state: delta.post_state,
        author_decision_identity: delta.post_author_decision_identity,
        specialist_receipt: storedSpecialistReceipt,
        commit_receipt: parentReceipt,
      };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookAuthorDecisionV2StoreError || err instanceof BookCanonicalParentF6StoreError || err instanceof rebind.BookAuthorDecisionV2RebindError || err instanceof core.BookCanonicalParentF6Error || err instanceof core.BookCanonicalParentV2Error || err instanceof core.BookCanonicalParentF5Error) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  reconcileAuthorDecision(preparedInput) {
    const prepared = clone(preparedInput);
    if (!prepared || !prepared.specialist_delta || !prepared.specialist_delta.specialist_receipt) fail('PREPARED_AUTHOR_DECISION_DELTA_REQUIRED');
    const incoming = prepared.specialist_delta.specialist_receipt;
    const row = this._readReceiptRowByRequest(incoming.resolution_request_id) || this._readReceiptRowByIdempotencyKey(incoming.idempotency_key);
    if (!row) {
      const current = this.readCurrentParent(prepared.specialist_delta.book_project_id);
      const state = this.readAuthorDecisionState(prepared.specialist_delta.book_project_id);
      return { committed: false, parent_state: current, author_decision_state: state.state, author_decision_identity: state.author_decision_identity };
    }
    const receipt = parse(row.receipt_json, 'book_author_decision_receipt.receipt_json');
    if (receipt.request_fingerprint !== incoming.request_fingerprint || receipt.receipt_id !== incoming.receipt_id) fail('PREPARED_RECONCILIATION_DIVERGENCE');
    const parentAtCommit = this._stateAt(receipt.book_project_id, receipt.post_parent_state_version);
    const postState = parse(row.post_state_json, 'book_author_decision_receipt.post_state_json');
    rebind.validateAuthorDecisionSpecialistState(postState, parentAtCommit);
    return {
      committed: true,
      parent_state: parentAtCommit,
      author_decision_state: postState,
      author_decision_identity: receipt.post_author_decision_identity,
      specialist_receipt: receipt,
      commit_receipt: this.readParentCommitReceipt(row.parent_receipt_id),
    };
  }

  recoverAndVerifyAuthorDecision(bookProjectId) {
    const base = this.recoverAndVerify(bookProjectId);
    const current = this.readAuthorDecisionState(bookProjectId);
    const rows = this.db.prepare('SELECT receipt_json,post_state_json,parent_receipt_id FROM book_author_decision_receipt WHERE book_project_id=? ORDER BY rowid ASC').all(bookProjectId);
    for (const row of rows) {
      const receipt = parse(row.receipt_json, 'book_author_decision_receipt.receipt_json');
      const parent = this._stateAt(bookProjectId, receipt.post_parent_state_version);
      const state = parse(row.post_state_json, 'book_author_decision_receipt.post_state_json');
      rebind.validateAuthorDecisionSpecialistState(state, parent);
      if (core.sha256(state) !== receipt.post_author_decision_identity) fail('AUTHOR_DECISION_RECEIPT_STATE_MISMATCH', receipt.receipt_id);
      if (!this.readParentCommitReceipt(row.parent_receipt_id)) fail('AUTHOR_DECISION_PARENT_RECEIPT_MISSING', receipt.receipt_id);
    }
    return { ...base, author_decision_identity: current.author_decision_identity, author_decision_receipt_count: rows.length };
  }
}

module.exports = {
  AuthorDecisionV2SqliteStore,
  BookAuthorDecisionV2StoreError,
};