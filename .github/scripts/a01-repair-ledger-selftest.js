'use strict';

const fs = require('fs');
const path = require('path');
const { openTransaction } = require('./a01-repair-broker');
const ledger = require('./a01-repair-ledger');

const root = path.resolve(__dirname, '..', '..');
const inboxRel = 'governance/repair/BOOK-REPAIR-INBOX.json';
const inboxAbs = path.join(root, inboxRel);
const originalInbox = fs.readFileSync(inboxAbs, 'utf8');
const txId = 'A01-REPAIR-synthetic-ledger-selftest-A1';
const eventDir = path.join(root, 'governance/repair/events', txId);
const dispatchPath = path.join(root, 'governance/repair/agent-dispatch', `${txId}.json`);
const ticketPath = path.join(root, 'qualification/a01/repair-requests', `${txId}.json`);
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function assert(condition, message) { if (!condition) throw new Error(message); }
function cleanup() {
  fs.writeFileSync(inboxAbs, originalInbox);
  fs.rmSync(eventDir, { recursive: true, force: true });
  fs.rmSync(dispatchPath, { force: true });
  fs.rmSync(ticketPath, { force: true });
}

try {
  cleanup();
  const opened = openTransaction({
    transaction_id: txId,
    receipt_id: 'synthetic-ledger-selftest',
    qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
    workstream_id: 'BOOK-SYSTEM',
    failed_subject_sha: A,
    receipt: { result_class: 'SUBJECT_FAILURE' },
    repair_attempt: 0,
    max_repair_attempts: 1,
    evidence_pointer: 'synthetic:selftest',
    created_at: '2026-09-09T23:50:00Z'
  });

  const ingested = ledger.ingest(opened);
  assert(ingested.action === 'INGESTED', 'open transaction must be durably ingested');
  assert(fs.existsSync(dispatchPath), 'repairable transaction must create owner-worker dispatch packet');
  assert(fs.existsSync(path.join(eventDir, '0001-transaction_opened.json')), 'open event must be append-only event 0001');
  assert(fs.existsSync(path.join(eventDir, '0002-agent_dispatch_ready.json')), 'dispatch event must be append-only event 0002');

  const duplicate = ledger.ingest(opened);
  assert(duplicate.action === 'NOOP_ALREADY_INGESTED', 'duplicate broker delivery must be idempotent');

  const finalized = ledger.finalize({
    transaction_id: txId,
    candidate: {
      replacement_subject_sha: B,
      repair_branch: 'book/repair-synthetic-ledger-selftest',
      prequalification: {
        result: 'PASS',
        subject_sha: B,
        qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
        workstream_id: 'BOOK-SYSTEM',
        evidence_pointer: 'hosted:synthetic-prequal'
      }
    },
    finalized_at: '2026-09-09T23:51:00Z'
  });
  assert(finalized.action === 'FINALIZED_A01_REQUEUE_READY', 'qualified changed candidate must finalize to A01 requeue');
  assert(fs.existsSync(ticketPath), 'finalization must emit durable replacement ticket');
  assert(fs.existsSync(path.join(eventDir, '0003-candidate_prequalified.json')), 'prequal event must be event 0003');
  assert(fs.existsSync(path.join(eventDir, '0004-a01_replacement_ticket_emitted.json')), 'replacement-ticket event must be event 0004');

  const ticket = JSON.parse(fs.readFileSync(ticketPath, 'utf8'));
  assert(ticket.subject_sha === B, 'replacement ticket must bind exact replacement SHA');
  assert(ticket.workstream_id === 'BOOK-SYSTEM', 'replacement ticket must preserve workstream');
  assert(ticket.qualification_id === 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001', 'replacement ticket must preserve qualification');

  const inbox = JSON.parse(fs.readFileSync(inboxAbs, 'utf8'));
  const tx = inbox.active_transactions.find((x) => x.transaction_id === txId);
  assert(tx && tx.state === 'A01_REQUEUE_READY', 'owner inbox projection must advance to A01_REQUEUE_READY');
  assert(tx.failed_subject_sha === A && tx.replacement_subject_sha === B, 'inbox must preserve failed and replacement SHA lineage');
  assert(tx.authoritative_pass === false, 'repair projection cannot create A-01 PASS');

  console.log('A01_REPAIR_LEDGER_SELFTEST_PASS');
  console.log('durable_inbox_ingest=PASS');
  console.log('agent_dispatch_packet=PASS');
  console.log('replacement_ticket_emission=PASS');
  console.log('repair_authority=ZERO');
} finally {
  cleanup();
}
