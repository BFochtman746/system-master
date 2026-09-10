'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const errors = [];
const warnings = [];

function error(type, message, detail = {}) { errors.push({ type, message, ...detail }); }
function warn(type, message, detail = {}) { warnings.push({ type, message, ...detail }); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function readJson(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`MISSING:${rel}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));
}
function jsonFilesUnder(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name);
      const childRel = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) walk(child, childRel);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(childRel);
    }
  }
  walk(abs, rel);
  return out.sort();
}

let authority;
let registry;
let inboxRegistry;
try {
  authority = readJson('governance/CURRENT-AUTHORITY.json');
  registry = readJson('governance/repair/REPAIR-LEDGER-REGISTRY-001.json');
  inboxRegistry = readJson('governance/repair/REPAIR-INBOX-REGISTRY-001.json');
} catch (e) {
  console.error(`A01_REPAIR_LEDGER_RECONCILE_FATAL:${e.message}`);
  process.exit(2);
}

const requiredAuthorityPointers = {
  repair_ledger_registry: 'governance/repair/REPAIR-LEDGER-REGISTRY-001.json',
  repair_ledger: '.github/scripts/a01-repair-ledger.js',
  repair_receipt_ingest_workflow: '.github/workflows/a01-repair-receipt-ingest.yml',
  repair_finalize_workflow: '.github/workflows/a01-repair-finalize.yml',
  repair_rerun_workflow: '.github/workflows/a01-repair-rerun.yml',
  repair_rerun_adjudicate_workflow: '.github/workflows/a01-repair-rerun-adjudicate.yml'
};
for (const [field, expected] of Object.entries(requiredAuthorityPointers)) {
  if (authority[field] !== expected) error('BROKEN_REFERENCE', `CURRENT-AUTHORITY ${field} mismatch`, { expected, actual: authority[field] || null });
  if (!exists(expected)) error('BROKEN_REFERENCE', `required repair-control file missing: ${expected}`);
}
for (const rel of [registry.event_schema, registry.owner_inbox_registry, registry.replacement_ticket_schema].filter(Boolean)) {
  if (!exists(rel)) error('BROKEN_REFERENCE', `repair ledger registry points to missing file: ${rel}`);
}

const known = new Map();
for (const [systemId, inboxRel] of Object.entries(inboxRegistry.owner_files || {})) {
  if (!exists(inboxRel)) {
    error('BROKEN_REFERENCE', `repair inbox missing: ${inboxRel}`, { system_id: systemId });
    continue;
  }
  const inbox = readJson(inboxRel);
  for (const tx of inbox.active_transactions || []) {
    if (known.has(tx.transaction_id)) error('REPAIR_TRANSACTION_DUPLICATE', `repair transaction appears more than once: ${tx.transaction_id}`);
    known.set(tx.transaction_id, { tx, stateClass: 'active', inboxRel });
  }
  for (const h of inbox.transaction_history || []) {
    if (known.has(h.transaction_id)) error('REPAIR_TRANSACTION_DUPLICATE', `repair transaction appears in active/history more than once: ${h.transaction_id}`);
    known.set(h.transaction_id, { tx: h, stateClass: 'history', inboxRel });
  }
}

for (const [txId, record] of known.entries()) {
  const tx = record.tx;
  const eventDir = path.posix.join(registry.event_root, txId);
  const eventFiles = jsonFilesUnder(eventDir);
  if (!eventFiles.length) {
    error('REPAIR_EVENT_LINEAGE_MISSING', `repair transaction has no append-only events: ${txId}`, { inbox: record.inboxRel });
    continue;
  }
  const events = eventFiles.map((rel) => ({ rel, value: readJson(rel) }));
  const opened = events.find((e) => e.value.event_type === 'TRANSACTION_OPENED');
  if (!opened) error('REPAIR_EVENT_LINEAGE_MISSING', `repair transaction lacks TRANSACTION_OPENED: ${txId}`);
  for (const e of events) {
    if (e.value.transaction_id !== txId) error('REPAIR_EVENT_LINEAGE_MISMATCH', 'event transaction_id mismatch', { event: e.rel, expected: txId, actual: e.value.transaction_id });
  }

  if (record.stateClass === 'active' && tx.classification === 'REPAIRABLE_SUBJECT' && ['REPAIR_REQUEST_READY', 'CLAIMED', 'CANDIDATE_PREQUAL_REQUIRED'].includes(tx.state)) {
    const dispatchRel = tx.dispatch_packet_pointer || path.posix.join('governance/repair/agent-dispatch', `${txId}.json`);
    if (!exists(dispatchRel)) error('REPAIR_AGENT_DISPATCH_MISSING', `repairable active transaction lacks current durable agent dispatch packet: ${txId}`, { expected: dispatchRel });
    const dispatchEvent = [...events].reverse().find((e) => e.value.event_type === 'AGENT_DISPATCH_READY');
    if (!dispatchEvent) error('REPAIR_EVENT_LINEAGE_MISSING', `repairable transaction lacks AGENT_DISPATCH_READY event: ${txId}`);
  }

  if (record.stateClass === 'active' && tx.state === 'A01_REQUEUE_READY') {
    const ticketRel = tx.replacement_ticket_pointer;
    if (!ticketRel || !exists(ticketRel)) {
      error('REPAIR_REPLACEMENT_TICKET_MISSING', `A01_REQUEUE_READY transaction lacks durable replacement ticket: ${txId}`, { pointer: ticketRel || null });
    } else {
      const ticket = readJson(ticketRel);
      if (String(ticket.subject_sha).toLowerCase() !== String(tx.replacement_subject_sha).toLowerCase()) error('REPAIR_LINEAGE_MISMATCH', `replacement ticket subject mismatch: ${txId}`, { ticket: ticket.subject_sha, transaction: tx.replacement_subject_sha });
      if (ticket.qualification_id !== tx.qualification_id) error('REPAIR_LINEAGE_MISMATCH', `replacement ticket qualification mismatch: ${txId}`);
      if (ticket.workstream_id !== tx.workstream_id) error('REPAIR_LINEAGE_MISMATCH', `replacement ticket workstream mismatch: ${txId}`);
    }
    if (!events.some((e) => e.value.event_type === 'CANDIDATE_PREQUALIFIED')) error('REPAIR_EVENT_LINEAGE_MISSING', `A01_REQUEUE_READY lacks CANDIDATE_PREQUALIFIED event: ${txId}`);
    if (!events.some((e) => e.value.event_type === 'A01_REPLACEMENT_TICKET_EMITTED')) error('REPAIR_EVENT_LINEAGE_MISSING', `A01_REQUEUE_READY lacks A01_REPLACEMENT_TICKET_EMITTED event: ${txId}`);
  }

  if (record.stateClass === 'active' && tx.state === 'RETRY_REQUEST_READY') {
    const ticketRel = tx.retry_ticket_pointer;
    if (!ticketRel || !exists(ticketRel)) {
      error('REPAIR_RETRY_TICKET_MISSING', `RETRY_REQUEST_READY transaction lacks durable same-SHA retry ticket: ${txId}`, { pointer: ticketRel || null });
    } else {
      const ticket = readJson(ticketRel);
      if (String(ticket.subject_sha).toLowerCase() !== String(tx.replacement_subject_sha || tx.repair_base_subject_sha || tx.failed_subject_sha).toLowerCase()) {
        error('REPAIR_LINEAGE_MISMATCH', `same-SHA retry ticket subject mismatch: ${txId}`, { ticket: ticket.subject_sha, transaction: tx.replacement_subject_sha || tx.repair_base_subject_sha || tx.failed_subject_sha });
      }
      if (ticket.qualification_id !== tx.qualification_id) error('REPAIR_LINEAGE_MISMATCH', `retry ticket qualification mismatch: ${txId}`);
      if (ticket.workstream_id !== tx.workstream_id) error('REPAIR_LINEAGE_MISMATCH', `retry ticket workstream mismatch: ${txId}`);
    }
    if (!events.some((e) => e.value.event_type === 'A01_RETRY_TICKET_EMITTED')) error('REPAIR_EVENT_LINEAGE_MISSING', `RETRY_REQUEST_READY lacks A01_RETRY_TICKET_EMITTED event: ${txId}`);
  }

  if (record.stateClass === 'history') {
    const terminalTypes = new Set(['TRANSACTION_CLOSED', 'TRANSACTION_DEAD_LETTERED', 'TRANSACTION_SUPERSEDED']);
    if (!events.some((e) => terminalTypes.has(e.value.event_type))) {
      error('REPAIR_TERMINAL_EVENT_MISSING', `historical repair transaction lacks terminal event: ${txId}`, { final_state: tx.final_state || null });
    }
    if (tx.final_state === 'CLOSED' && tx.final_result_class === 'PASS' && !events.some((e) => e.value.event_type === 'A01_RERUN_RECEIPT_RECORDED')) {
      error('REPAIR_PASS_RECEIPT_EVENT_MISSING', `CLOSED/PASS repair transaction lacks authoritative rerun receipt event: ${txId}`);
    }
  }
}

for (const rel of jsonFilesUnder(registry.event_root)) {
  const ev = readJson(rel);
  if (!known.has(ev.transaction_id)) error('ORPHAN_REPAIR_EVENT', `repair event has no inbox/history transaction: ${rel}`, { transaction_id: ev.transaction_id || null });
}

function resolveTicketTransaction(base) {
  if (known.has(base)) return base;
  return [...known.keys()].sort((a, b) => b.length - a.length).find((id) => base.startsWith(`${id}-`)) || null;
}
for (const rel of jsonFilesUnder(registry.replacement_ticket_root)) {
  const base = path.basename(rel, '.json');
  const txId = resolveTicketTransaction(base);
  if (!txId) {
    error('ORPHAN_REPLACEMENT_TICKET', `replacement/retry ticket has no repair transaction: ${rel}`);
    continue;
  }
  const rec = known.get(txId);
  if (!rec) continue;
  const ticket = readJson(rel);
  if (rec.stateClass === 'history' && rec.tx.final_state === 'CLOSED' && rec.tx.final_result_class === 'PASS') {
    continue;
  }
  if (rec.stateClass === 'active' && rec.tx.state === 'A01_REQUEUE_READY' && rec.tx.replacement_ticket_pointer === rel) continue;
  if (rec.stateClass === 'active' && rec.tx.state === 'RETRY_REQUEST_READY' && rec.tx.retry_ticket_pointer === rel) continue;
  if (rec.stateClass === 'active') warn('HISTORICAL_REPAIR_TICKET_RETAINED', 'older replacement/retry ticket retained as append-only lineage while transaction has advanced', { transaction_id: txId, ticket: rel, current_state: rec.tx.state });
}

const result = {
  standing: errors.length ? 'DRIFT_DETECTED' : 'PASS',
  error_count: errors.length,
  warning_count: warnings.length,
  transaction_count: known.size,
  errors,
  warnings
};
console.log(JSON.stringify(result, null, 2));
process.exit(errors.length ? 1 : 0);
