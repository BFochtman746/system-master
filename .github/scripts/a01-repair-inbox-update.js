'use strict';

const fs = require('fs');
const path = require('path');

const ACTIVE_STATES = new Set([
  'REPAIR_REQUEST_READY', 'CLAIMED', 'CANDIDATE_PREQUAL_REQUIRED', 'A01_REQUEUE_READY',
  'OWNER_ACTION_REQUIRED', 'OWNER_AUTHORITY_REQUIRED', 'WAIT_FOR_PREDECESSOR',
  'REPLAN_ADMISSION', 'RETRY_REQUEST_READY'
]);
const TERMINAL_STATES = new Set(['NO_ACTION', 'DEAD_LETTER']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }
function canonicalPath(root, rel) {
  const target = path.resolve(root, rel);
  const base = path.resolve(root) + path.sep;
  assert(target.startsWith(base), `PATH_ESCAPE:${rel}`);
  return target;
}
function immutableLineageMatches(a, b) {
  return ['receipt_id', 'qualification_id', 'workstream_id', 'failed_subject_sha'].every((key) => String(a?.[key] || '') === String(b?.[key] || ''));
}
function authorityViolation(tx) {
  return tx?.promotion_authorized === true || tx?.authoritative_pass === true || tx?.a01_pass === true ||
    tx?.publication_authorized === true || tx?.production_authorized === true ||
    String(tx?.result_class || '').toUpperCase() === 'PASS';
}

function validateEnvelope(root, envelope) {
  assert(envelope && envelope.action === 'OPEN', 'BROKER_ENVELOPE_ACTION_INVALID');
  const tx = envelope.transaction;
  assert(tx && typeof tx === 'object', 'BROKER_TRANSACTION_REQUIRED');
  for (const field of ['transaction_id', 'state', 'owner_path', 'target_inbox', 'receipt_id', 'qualification_id', 'workstream_id', 'failed_subject_sha', 'classification', 'created_at']) {
    assert(tx[field] !== undefined && tx[field] !== null && tx[field] !== '', `BROKER_TRANSACTION_MISSING:${field}`);
  }
  assert(isSha(tx.failed_subject_sha), 'BROKER_FAILED_SUBJECT_SHA_INVALID');
  assert(!authorityViolation(tx), 'BROKER_TRANSACTION_AUTHORITY_VIOLATION');
  assert(ACTIVE_STATES.has(tx.state) || TERMINAL_STATES.has(tx.state), `BROKER_TRANSACTION_STATE_INVALID:${tx.state}`);

  const registry = readJson(canonicalPath(root, 'governance/repair/REPAIR-INBOX-REGISTRY-001.json'));
  const allowedPaths = new Set(Object.values(registry.owner_files || {}));
  assert(allowedPaths.has(tx.target_inbox), `BROKER_TARGET_INBOX_NOT_REGISTERED:${tx.target_inbox}`);
  const expectedSystem = Object.entries(registry.owner_files || {}).find(([, rel]) => rel === tx.target_inbox)?.[0] || null;
  assert(expectedSystem, `BROKER_TARGET_OWNER_NOT_FOUND:${tx.target_inbox}`);
  assert(tx.inbox_owner_system_id === expectedSystem, `BROKER_TARGET_OWNER_MISMATCH:${tx.inbox_owner_system_id}->${expectedSystem}`);
  return { tx, registry, expectedSystem };
}

function applyOpen(root, envelope, closedAt = new Date().toISOString()) {
  const { tx } = validateEnvelope(root, envelope);
  const inboxPath = canonicalPath(root, tx.target_inbox);
  const inbox = readJson(inboxPath);
  assert(inbox.owner_system_id === tx.inbox_owner_system_id, 'INBOX_OWNER_SYSTEM_MISMATCH');

  inbox.active_transactions ||= [];
  inbox.transaction_history ||= [];
  const activeIndex = inbox.active_transactions.findIndex((item) => item.transaction_id === tx.transaction_id);
  const historyIndex = inbox.transaction_history.findIndex((item) => item.transaction_id === tx.transaction_id);

  if (TERMINAL_STATES.has(tx.state) || envelope.terminal === true) {
    assert(activeIndex < 0, `TERMINAL_TRANSACTION_STILL_ACTIVE:${tx.transaction_id}`);
    if (historyIndex >= 0) {
      const existing = inbox.transaction_history[historyIndex];
      assert(existing.final_state === tx.state, `TERMINAL_TRANSACTION_COLLISION:${tx.transaction_id}`);
      return { changed: false, target_inbox: tx.target_inbox, transaction_id: tx.transaction_id, state: tx.state };
    }
    if (tx.state === 'NO_ACTION') return { changed: false, target_inbox: tx.target_inbox, transaction_id: tx.transaction_id, state: tx.state };
    inbox.transaction_history.push({
      ...tx,
      final_state: tx.state,
      closed_at: closedAt,
      source: 'A01_REPAIR_BROKER'
    });
    writeJson(inboxPath, inbox);
    return { changed: true, target_inbox: tx.target_inbox, transaction_id: tx.transaction_id, state: tx.state };
  }

  assert(historyIndex < 0, `ACTIVE_TRANSACTION_ALREADY_HISTORICAL:${tx.transaction_id}`);
  if (activeIndex >= 0) {
    const existing = inbox.active_transactions[activeIndex];
    assert(immutableLineageMatches(existing, tx), `ACTIVE_TRANSACTION_LINEAGE_COLLISION:${tx.transaction_id}`);
    if (JSON.stringify(existing) === JSON.stringify(tx)) {
      return { changed: false, target_inbox: tx.target_inbox, transaction_id: tx.transaction_id, state: tx.state };
    }
    const allowedProgression = new Set([
      'REPAIR_REQUEST_READY->CLAIMED',
      'REPAIR_REQUEST_READY->CANDIDATE_PREQUAL_REQUIRED',
      'REPAIR_REQUEST_READY->A01_REQUEUE_READY',
      'CLAIMED->CANDIDATE_PREQUAL_REQUIRED',
      'CLAIMED->A01_REQUEUE_READY',
      'CANDIDATE_PREQUAL_REQUIRED->A01_REQUEUE_READY'
    ]);
    assert(existing.state === tx.state || allowedProgression.has(`${existing.state}->${tx.state}`), `ACTIVE_TRANSACTION_INVALID_TRANSITION:${existing.state}->${tx.state}`);
    inbox.active_transactions[activeIndex] = tx;
  } else {
    inbox.active_transactions.push(tx);
  }
  inbox.inbox_version = Number(inbox.inbox_version || 0) + 1;
  writeJson(inboxPath, inbox);
  return { changed: true, target_inbox: tx.target_inbox, transaction_id: tx.transaction_id, state: tx.state };
}

function closeTransaction(root, input) {
  assert(input && input.transaction_id, 'CLOSE_TRANSACTION_ID_REQUIRED');
  assert(input.final_state, 'CLOSE_FINAL_STATE_REQUIRED');
  const registry = readJson(canonicalPath(root, 'governance/repair/REPAIR-INBOX-REGISTRY-001.json'));
  const closedAt = input.closed_at || new Date().toISOString();
  let found = null;
  for (const [systemId, rel] of Object.entries(registry.owner_files || {})) {
    const inboxPath = canonicalPath(root, rel);
    const inbox = readJson(inboxPath);
    inbox.active_transactions ||= [];
    inbox.transaction_history ||= [];
    const activeIndex = inbox.active_transactions.findIndex((item) => item.transaction_id === input.transaction_id);
    const historical = inbox.transaction_history.find((item) => item.transaction_id === input.transaction_id);
    if (historical) {
      assert(historical.final_state === input.final_state, `CLOSE_HISTORY_COLLISION:${input.transaction_id}`);
      return { changed: false, target_inbox: rel, transaction_id: input.transaction_id, final_state: input.final_state };
    }
    if (activeIndex < 0) continue;
    assert(!found, `CLOSE_TRANSACTION_DUPLICATE_ACTIVE:${input.transaction_id}`);
    const tx = inbox.active_transactions[activeIndex];
    inbox.active_transactions.splice(activeIndex, 1);
    inbox.transaction_history.push({
      ...tx,
      final_state: input.final_state,
      closed_at: closedAt,
      closing_receipt_id: input.closing_receipt_id || null,
      closing_subject_sha: input.closing_subject_sha || null,
      closing_result_class: input.closing_result_class || null,
      successor_transaction_id: input.successor_transaction_id || null,
      source: 'A01_REPAIR_INBOX_CLOSURE'
    });
    inbox.inbox_version = Number(inbox.inbox_version || 0) + 1;
    writeJson(inboxPath, inbox);
    found = { changed: true, target_inbox: rel, transaction_id: input.transaction_id, final_state: input.final_state, owner_system_id: systemId };
  }
  assert(found, `CLOSE_TRANSACTION_NOT_FOUND:${input.transaction_id}`);
  return found;
}

function cli(argv) {
  let root = process.cwd();
  let envelopeFile = null;
  let closeFile = null;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--root') root = path.resolve(argv[++i]);
    else if (argv[i] === '--envelope') envelopeFile = path.resolve(argv[++i]);
    else if (argv[i] === '--close') closeFile = path.resolve(argv[++i]);
    else throw new Error(`UNKNOWN_ARGUMENT:${argv[i]}`);
  }
  assert((envelopeFile ? 1 : 0) + (closeFile ? 1 : 0) === 1, 'EXACTLY_ONE_OF_ENVELOPE_OR_CLOSE_REQUIRED');
  const result = envelopeFile ? applyOpen(root, readJson(envelopeFile)) : closeTransaction(root, readJson(closeFile));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { applyOpen, closeTransaction, validateEnvelope, authorityViolation };

if (require.main === module) {
  try { cli(process.argv); }
  catch (error) {
    console.error(`A01_REPAIR_INBOX_UPDATE_ERROR: ${error.message}`);
    process.exit(1);
  }
}
