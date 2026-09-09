'use strict';

const fs = require('fs');
const path = require('path');
const { finalizeTransaction } = require('./a01-repair-broker');

const root = path.resolve(__dirname, '..', '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'governance/repair/REPAIR-LEDGER-REGISTRY-001.json'), 'utf8'));
const inboxRegistry = JSON.parse(fs.readFileSync(path.join(root, 'governance/repair/REPAIR-INBOX-REGISTRY-001.json'), 'utf8'));

const activeStates = new Set([
  'REPAIR_REQUEST_READY', 'CLAIMED', 'CANDIDATE_PREQUAL_REQUIRED', 'A01_REQUEUE_READY',
  'OWNER_ACTION_REQUIRED', 'OWNER_AUTHORITY_REQUIRED', 'WAIT_FOR_PREDECESSOR',
  'REPLAN_ADMISSION', 'RETRY_REQUEST_READY'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
function writeJson(rel, value) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function sanitize(value) {
  return String(value || '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
function eventDir(txId) {
  return path.posix.join(registry.event_root, sanitize(txId));
}
function eventPath(txId, seq, type) {
  return path.posix.join(eventDir(txId), `${String(seq).padStart(4, '0')}-${type.toLowerCase()}.json`);
}
function listExistingEventFiles(txId) {
  const abs = path.join(root, eventDir(txId));
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((x) => x.endsWith('.json')).sort();
}
function nextSeq(txId) {
  const files = listExistingEventFiles(txId);
  if (!files.length) return 1;
  const last = Number(files[files.length - 1].slice(0, 4));
  return Number.isFinite(last) ? last + 1 : files.length + 1;
}
function ownerSystemForInbox(rel) {
  for (const [systemId, file] of Object.entries(inboxRegistry.owner_files || {})) {
    if (file === rel) return systemId;
  }
  return null;
}
function eventFromTransaction(type, tx, payload = null, extras = {}) {
  const seq = extras.seq || nextSeq(tx.transaction_id);
  return {
    event_version: 1,
    event_id: `${sanitize(tx.transaction_id)}-E${String(seq).padStart(4, '0')}`,
    transaction_id: tx.transaction_id,
    event_type: type,
    recorded_at: extras.recorded_at || new Date().toISOString(),
    owner_path: tx.owner_path,
    receipt_id: tx.receipt_id,
    qualification_id: tx.qualification_id,
    workstream_id: tx.workstream_id,
    failed_subject_sha: tx.failed_subject_sha,
    replacement_subject_sha: tx.replacement_subject_sha || null,
    state: tx.state,
    classification: tx.classification || null,
    repair_attempt: Number.isInteger(tx.repair_attempt) ? tx.repair_attempt : null,
    evidence_pointer: tx.evidence_pointer || null,
    prequalification_evidence_pointer: tx.prequalification_evidence_pointer || null,
    replacement_ticket_pointer: extras.replacement_ticket_pointer || null,
    a01_rerun_receipt_pointer: extras.a01_rerun_receipt_pointer || null,
    payload
  };
}
function appendEvent(type, tx, payload = null, extras = {}) {
  const seq = nextSeq(tx.transaction_id);
  const rel = eventPath(tx.transaction_id, seq, type);
  writeJson(rel, eventFromTransaction(type, tx, payload, { ...extras, seq }));
  return rel;
}
function getInbox(rel) {
  assert(rel && inboxRegistry.owner_files && Object.values(inboxRegistry.owner_files).includes(rel), `UNREGISTERED_REPAIR_INBOX:${rel || '<missing>'}`);
  return readJson(rel);
}
function saveInbox(rel, inbox) {
  inbox.inbox_version = Number(inbox.inbox_version || 0) + 1;
  writeJson(rel, inbox);
}
function findTransaction(txId) {
  for (const [systemId, rel] of Object.entries(inboxRegistry.owner_files || {})) {
    const inbox = getInbox(rel);
    const activeIndex = (inbox.active_transactions || []).findIndex((x) => x.transaction_id === txId);
    if (activeIndex >= 0) return { systemId, rel, inbox, activeIndex, tx: inbox.active_transactions[activeIndex] };
  }
  return null;
}
function dispatchPacket(tx) {
  return {
    dispatch_version: 1,
    dispatch_id: `AGENT-DISPATCH-${sanitize(tx.transaction_id)}`,
    transaction_id: tx.transaction_id,
    owner_path: tx.owner_path,
    owner_system_id: tx.inbox_owner_system_id,
    state: 'OWNER_WORKER_READY',
    qualification_id: tx.qualification_id,
    workstream_id: tx.workstream_id,
    failed_subject_sha: tx.failed_subject_sha,
    receipt_id: tx.receipt_id,
    repair_attempt: tx.repair_attempt,
    max_repair_attempts: tx.max_repair_attempts,
    evidence_pointer: tx.evidence_pointer || null,
    objective: 'Reproduce the authoritative failure, make the smallest evidence-justified repair, preserve failed-subject lineage, produce a new exact SHA for changed bytes, and obtain deterministic prequalification PASS on that exact replacement SHA.',
    forbidden_authority: [
      'Do not create A-01 PASS or promotion authority.',
      'Do not change qualification/workstream ownership.',
      'Do not repair human/author/private/native/external authority boundaries as code defects.',
      'Do not transfer evidence from the failed subject to changed bytes.'
    ]
  };
}
function ingest(envelope) {
  const tx = envelope.transaction || envelope;
  assert(tx.transaction_id, 'transaction_id is required');
  assert(tx.receipt_id, 'receipt_id is required');
  assert(tx.target_inbox, 'target_inbox is required');
  const existing = findTransaction(tx.transaction_id);
  if (existing) {
    assert(existing.tx.receipt_id === tx.receipt_id, `TRANSACTION_ID_CONFLICT:${tx.transaction_id}`);
    return { action: 'NOOP_ALREADY_INGESTED', transaction_id: tx.transaction_id, target_inbox: existing.rel };
  }

  const inbox = getInbox(tx.target_inbox);
  const ownerSystem = ownerSystemForInbox(tx.target_inbox);
  assert(ownerSystem, `OWNER_INBOX_UNRESOLVED:${tx.target_inbox}`);
  assert(inbox.owner_system_id === ownerSystem, `OWNER_INBOX_ID_MISMATCH:${tx.target_inbox}`);

  const openedEvent = appendEvent('TRANSACTION_OPENED', tx, { broker_version: envelope.broker_version || null, route: tx.route || null });
  let dispatchPointer = null;
  const normalized = { ...tx };

  if (tx.state === 'REPAIR_REQUEST_READY') {
    const packet = dispatchPacket(tx);
    dispatchPointer = path.posix.join('governance/repair/agent-dispatch', `${sanitize(tx.transaction_id)}.json`);
    writeJson(dispatchPointer, packet);
    normalized.dispatch_state = 'OWNER_WORKER_READY';
    normalized.dispatch_packet_pointer = dispatchPointer;
    appendEvent('AGENT_DISPATCH_READY', normalized, { dispatch_packet_pointer: dispatchPointer });
  }

  if (activeStates.has(tx.state)) {
    inbox.active_transactions = [...(inbox.active_transactions || []), normalized];
  } else {
    inbox.transaction_history = [...(inbox.transaction_history || []), {
      transaction_id: tx.transaction_id,
      final_state: tx.state,
      closed_at: new Date().toISOString(),
      receipt_id: tx.receipt_id,
      event_pointer: openedEvent
    }];
  }
  saveInbox(tx.target_inbox, inbox);
  return { action: 'INGESTED', transaction_id: tx.transaction_id, target_inbox: tx.target_inbox, opened_event: openedEvent, dispatch_packet: dispatchPointer };
}
function replacementTicket(tx) {
  const req = tx.replacement_request || {};
  assert(tx.state === 'A01_REQUEUE_READY', 'transaction must be A01_REQUEUE_READY');
  assert(req.subject_sha === tx.replacement_subject_sha, 'replacement request SHA must equal replacement transaction SHA');
  return {
    workstream_id: tx.workstream_id,
    qualification_id: tx.qualification_id,
    subject_sha: tx.replacement_subject_sha,
    origin_ref: tx.repair_branch || `repair/${sanitize(tx.transaction_id)}`,
    resume_on_pass: `Record authoritative A-01 PASS for replacement subject ${tx.replacement_subject_sha}, close repair transaction ${tx.transaction_id}, preserve the failed subject ${tx.failed_subject_sha} and continue the owner lane from current repository authority.`,
    resume_on_failure: `Record the new authoritative receipt against repair transaction ${tx.transaction_id}; reclassify truthfully and do not exceed repair budget ${tx.max_repair_attempts}.`,
    notification_target: `repair-transaction:${tx.transaction_id}`
  };
}
function finalize(input) {
  assert(input.transaction_id, 'transaction_id is required');
  const found = findTransaction(input.transaction_id);
  assert(found, `TRANSACTION_NOT_FOUND:${input.transaction_id}`);
  const result = finalizeTransaction({
    transaction: found.tx,
    candidate: input.candidate || {},
    finalized_at: input.finalized_at || new Date().toISOString()
  });
  const tx = result.transaction;
  const prequalEvent = appendEvent('CANDIDATE_PREQUALIFIED', tx, {
    repair_branch: tx.repair_branch || null,
    replacement_subject_sha: tx.replacement_subject_sha,
    prequalification_evidence_pointer: tx.prequalification_evidence_pointer || null
  });
  const ticket = replacementTicket(tx);
  const ticketPointer = path.posix.join(registry.replacement_ticket_root, `${sanitize(tx.transaction_id)}.json`);
  writeJson(ticketPointer, ticket);
  const ticketEvent = appendEvent('A01_REPLACEMENT_TICKET_EMITTED', tx, {
    replacement_ticket: ticket,
    parent_receipt_id: tx.receipt_id
  }, { replacement_ticket_pointer: ticketPointer });

  tx.replacement_ticket_pointer = ticketPointer;
  tx.last_event_pointer = ticketEvent;
  found.inbox.active_transactions[found.activeIndex] = tx;
  saveInbox(found.rel, found.inbox);
  return {
    action: 'FINALIZED_A01_REQUEUE_READY',
    transaction_id: tx.transaction_id,
    replacement_subject_sha: tx.replacement_subject_sha,
    prequalification_event: prequalEvent,
    replacement_ticket: ticketPointer,
    replacement_ticket_event: ticketEvent
  };
}
function main() {
  const command = process.argv[2];
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw || '{}');
      const output = command === 'ingest' ? ingest(input) : command === 'finalize' ? finalize(input) : (() => { throw new Error('usage: node a01-repair-ledger.js <ingest|finalize>'); })();
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } catch (error) {
      console.error(`A01_REPAIR_LEDGER_ERROR:${error.message}`);
      process.exit(1);
    }
  });
}

module.exports = { ingest, finalize, replacementTicket, dispatchPacket };
if (require.main === module) main();
