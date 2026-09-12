'use strict';

const { DatabaseSync } = require('node:sqlite');
const core = require('./canonical-parent-v2-core.js');

class BookCanonicalParentStoreError extends Error {
  constructor(code, detail = '', cause = null) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCanonicalParentStoreError';
    this.code = code;
    this.detail = detail;
    this.cause = cause || undefined;
  }
}

function fail(code, detail = '', cause = null) { throw new BookCanonicalParentStoreError(code, detail, cause); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function json(v) { return JSON.stringify(v); }
function parse(v, label) { try { return JSON.parse(v); } catch (e) { fail('STORE_JSON_CORRUPT', label, e); } }
function classifySqliteError(err) {
  const msg = String(err && err.message || '');
  if (/database is locked|database table is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(msg)) return 'STORE_BUSY_TRANSIENT';
  return 'STORE_SQLITE_FAILURE';
}

class CanonicalParentSqliteStore {
  constructor(dbPath, options = {}) {
    if (!nonEmpty(dbPath)) fail('STORE_PATH_REQUIRED');
    this.dbPath = dbPath;
    this.faultInjector = typeof options.faultInjector === 'function' ? options.faultInjector : null;
    try {
      this.db = new DatabaseSync(dbPath, { timeout: Number.isInteger(options.timeoutMs) ? options.timeoutMs : 100 });
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS canonical_parent (
          book_project_id TEXT PRIMARY KEY,
          state_version INTEGER NOT NULL,
          state_digest TEXT NOT NULL,
          state_json TEXT NOT NULL,
          mutation_head TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS parent_commit_receipt (
          receipt_id TEXT PRIMARY KEY,
          book_project_id TEXT NOT NULL,
          effect_request_id TEXT NOT NULL UNIQUE,
          idempotency_key TEXT NOT NULL UNIQUE,
          request_fingerprint TEXT NOT NULL,
          post_state_version INTEGER NOT NULL,
          post_state_digest TEXT NOT NULL,
          receipt_json TEXT NOT NULL,
          commit_sequence INTEGER NOT NULL,
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
        CREATE TABLE IF NOT EXISTS parent_history (
          book_project_id TEXT NOT NULL,
          state_version INTEGER NOT NULL,
          state_digest TEXT NOT NULL,
          state_json TEXT NOT NULL,
          receipt_id TEXT,
          created_at TEXT NOT NULL,
          PRIMARY KEY(book_project_id, state_version),
          FOREIGN KEY(book_project_id) REFERENCES canonical_parent(book_project_id)
        );
        CREATE INDEX IF NOT EXISTS idx_receipt_book_sequence ON parent_commit_receipt(book_project_id, commit_sequence);
      `);
    } catch (err) {
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  _fault(point, context = {}) {
    if (!this.faultInjector) return;
    this.faultInjector(point, context);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  createParent(parentInput, createIdentity = 'INITIAL_CREATE') {
    const parent = JSON.parse(JSON.stringify(parentInput));
    core.validateParent(parent);
    if (!nonEmpty(createIdentity)) fail('CREATE_IDENTITY_REQUIRED');
    const bookId = parent.book_project.book_project_id;
    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const existing = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(bookId);
      if (existing) fail('PARENT_ALREADY_EXISTS', bookId);
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO canonical_parent(book_project_id,state_version,state_digest,state_json,mutation_head,updated_at) VALUES(?,?,?,?,?,?)')
        .run(bookId, parent.state_version, parent.state_digest, json(parent), parent.mutation_head, now);
      this.db.prepare('INSERT INTO parent_history(book_project_id,state_version,state_digest,state_json,receipt_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(bookId, parent.state_version, parent.state_digest, json(parent), null, now);
      this._fault('create_before_commit', { book_project_id: bookId });
      this.db.exec('COMMIT');
      committed = true;
      this._fault('create_after_commit', { book_project_id: bookId });
      return parent;
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookCanonicalParentStoreError || err instanceof core.BookCanonicalParentV2Error) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  readCurrentParent(bookProjectId) {
    const row = this.db.prepare('SELECT state_version,state_digest,state_json,mutation_head FROM canonical_parent WHERE book_project_id=?').get(bookProjectId);
    if (!row) fail('PARENT_NOT_FOUND', bookProjectId);
    const parent = parse(row.state_json, 'canonical_parent.state_json');
    core.validateParent(parent);
    if (parent.state_version !== row.state_version || parent.state_digest !== row.state_digest || parent.mutation_head !== row.mutation_head) fail('STORE_PARENT_ROW_MISMATCH');
    return parent;
  }

  _receiptRow(where, value) {
    return this.db.prepare(`SELECT receipt_json,post_state_version,post_state_digest FROM parent_commit_receipt WHERE ${where}=?`).get(value);
  }
  readCommitReceiptByRequest(effectRequestId) {
    const row = this._receiptRow('effect_request_id', effectRequestId);
    return row ? parse(row.receipt_json, 'receipt') : null;
  }
  readCommitReceiptByIdempotencyKey(idempotencyKey) {
    const row = this._receiptRow('idempotency_key', idempotencyKey);
    return row ? parse(row.receipt_json, 'receipt') : null;
  }
  readParentCommitReceipt(receiptId) {
    const row = this._receiptRow('receipt_id', receiptId);
    return row ? parse(row.receipt_json, 'receipt') : null;
  }
  _stateAt(bookProjectId, version) {
    const row = this.db.prepare('SELECT state_json FROM parent_history WHERE book_project_id=? AND state_version=?').get(bookProjectId, version);
    if (!row) fail('HISTORY_STATE_NOT_FOUND', `${bookProjectId}:${version}`);
    const state = parse(row.state_json, 'history.state_json');
    core.validateParent(state);
    return state;
  }

  listParentHistory(bookProjectId) {
    return this.db.prepare('SELECT state_version,state_digest,receipt_id,state_json,created_at FROM parent_history WHERE book_project_id=? ORDER BY state_version ASC').all(bookProjectId)
      .map(row => ({ ...row, state: parse(row.state_json, 'history.state_json') }));
  }

  commitEffect(effectInput) {
    const effect = JSON.parse(JSON.stringify(effectInput));
    const fingerprint = core.effectRequestFingerprint(effect);
    const byReq = this.readCommitReceiptByRequest(effect.effect_request_id);
    const byKey = this.readCommitReceiptByIdempotencyKey(effect.idempotency_key);
    const prior = byReq || byKey;
    if (prior) {
      if (prior.effect_request_id !== effect.effect_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
      if (prior.idempotency_key !== effect.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
      if (prior.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
      return { replay: true, parent_state: this._stateAt(prior.book_project_id, prior.post_parent_state_version), commit_receipt: prior };
    }

    let committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const currentRow = this.db.prepare('SELECT state_json FROM canonical_parent WHERE book_project_id=?').get(this._inferBookProjectId(effect));
      if (!currentRow) fail('PARENT_NOT_FOUND', this._inferBookProjectId(effect));
      const current = parse(currentRow.state_json, 'canonical_parent.state_json');
      core.validateParent(current);
      const result = core.applyEffect(current, effect);
      const receipt = result.commit_receipt;
      const next = result.parent_state;
      const sequenceRow = this.db.prepare('SELECT COALESCE(MAX(commit_sequence),0)+1 AS next_sequence FROM parent_commit_receipt WHERE book_project_id=?').get(current.book_project.book_project_id);
      const seq = Number(sequenceRow.next_sequence);
      this._fault('before_parent_update', { current, next, receipt });
      const update = this.db.prepare('UPDATE canonical_parent SET state_version=?,state_digest=?,state_json=?,mutation_head=?,updated_at=? WHERE book_project_id=? AND state_version=? AND state_digest=?')
        .run(next.state_version, next.state_digest, json(next), next.mutation_head, receipt.committed_at, current.book_project.book_project_id, current.state_version, current.state_digest);
      if (Number(update.changes) !== 1) fail('PARENT_COMPARE_AND_SWAP_CONFLICT');
      this._fault('after_parent_update', { current, next, receipt });
      this.db.prepare('INSERT INTO parent_commit_receipt(receipt_id,book_project_id,effect_request_id,idempotency_key,request_fingerprint,post_state_version,post_state_digest,receipt_json,commit_sequence) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(receipt.receipt_id, current.book_project.book_project_id, receipt.effect_request_id, receipt.idempotency_key, receipt.request_fingerprint, receipt.post_parent_state_version, receipt.post_parent_state_digest, json(receipt), seq);
      this._fault('after_receipt_insert', { current, next, receipt });
      this.db.prepare('INSERT INTO parent_history(book_project_id,state_version,state_digest,state_json,receipt_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(current.book_project.book_project_id, next.state_version, next.state_digest, json(next), receipt.receipt_id, receipt.committed_at);
      this._fault('before_commit', { current, next, receipt });
      this.db.exec('COMMIT');
      committed = true;
      this._fault('after_commit', { current, next, receipt });
      return { replay: false, parent_state: next, commit_receipt: receipt };
    } catch (err) {
      if (!committed) { try { this.db.exec('ROLLBACK'); } catch (_) {} }
      if (err instanceof BookCanonicalParentStoreError || err instanceof core.BookCanonicalParentV2Error) throw err;
      fail(classifySqliteError(err), String(err && err.message || err), err);
    }
  }

  _inferBookProjectId(effect) {
    if (Array.isArray(effect.subject_identity_refs)) {
      const explicit = effect.subject_identity_refs.find(x => typeof x === 'string' && x.startsWith('BOOK-PROJECT-'));
      if (explicit) return explicit;
    }
    const row = this.db.prepare('SELECT book_project_id FROM canonical_parent ORDER BY book_project_id LIMIT 1').get();
    if (!row) fail('PARENT_NOT_FOUND');
    return row.book_project_id;
  }

  recoverAndVerify(bookProjectId) {
    const quick = this.db.prepare('PRAGMA quick_check').all();
    if (!Array.isArray(quick) || quick.length !== 1 || quick[0].quick_check !== 'ok') fail('STORE_INTEGRITY_CHECK_FAILED', json(quick));
    const parent = this.readCurrentParent(bookProjectId);
    const history = this.listParentHistory(bookProjectId);
    if (history.length < 1) fail('PARENT_HISTORY_MISSING');
    const latest = history[history.length - 1];
    if (latest.state_version !== parent.state_version || latest.state_digest !== parent.state_digest) fail('PARENT_HISTORY_CURRENT_MISMATCH');
    const receipts = this.db.prepare('SELECT receipt_json,commit_sequence FROM parent_commit_receipt WHERE book_project_id=? ORDER BY commit_sequence ASC').all(bookProjectId)
      .map(row => ({ receipt: parse(row.receipt_json, 'receipt'), sequence: row.commit_sequence }));
    let predecessor = null;
    for (let i = 0; i < receipts.length; i++) {
      const { receipt, sequence } = receipts[i];
      if (sequence !== i + 1) fail('COMMIT_SEQUENCE_GAP');
      if (receipt.predecessor_parent_commit_receipt_ref !== predecessor) fail('RECEIPT_CHAIN_MISMATCH', receipt.receipt_id);
      const hist = history.find(h => h.state_version === receipt.post_parent_state_version);
      if (!hist || hist.state_digest !== receipt.post_parent_state_digest || hist.receipt_id !== receipt.receipt_id) fail('RECEIPT_HISTORY_MISMATCH', receipt.receipt_id);
      predecessor = receipt.receipt_id;
    }
    if (parent.mutation_head !== predecessor) fail('MUTATION_HEAD_RECEIPT_MISMATCH');
    return { ok: true, parent_state: parent, history_count: history.length, receipt_count: receipts.length };
  }
}

module.exports = { CanonicalParentSqliteStore, BookCanonicalParentStoreError, classifySqliteError };
