'use strict';

const fs = require('fs');
const path = require('path');
const { openTransaction } = require('./a01-repair-broker');
const ledger = require('./a01-repair-ledger');

const root = path.resolve(__dirname, '..', '..');
const inboxRel = 'governance/repair/BOOK-REPAIR-INBOX.json';
const inboxAbs = path.join(root, inboxRel);
const originalInbox = fs.readFileSync(inboxAbs, 'utf8');
const txId = 'A01-REPAIR-synthetic-rerun-selftest-A1';
const budgetTxId = 'A01-REPAIR-synthetic-rerun-budget-selftest-A1';
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccccccccccc';
const D = 'dddddddddddddddddddddddddddddddddddddddd';

function assert(condition, message) { if (!condition) throw new Error(message); }
function receipt(subject, resultClass, promotionAuthorized = false) {
  return {
    receipt_version: 1,
    policy_version: 6,
    registry_version: 26,
    qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
    workstream_id: 'BOOK-SYSTEM',
    gate_class: 'focused',
    subject_sha: subject,
    checkout_sha: subject,
    requested_at: '2026-09-10T00:00:00Z',
    started_at: '2026-09-10T00:00:01Z',
    completed_at: '2026-09-10T00:00:02Z',
    queue_ms: 1000,
    execution_ms: 1000,
    result_class: resultClass,
    child_exit_code: resultClass === 'PASS' ? 0 : 1,
    runner: { name: 'A-01', os: 'Windows', arch: 'X64', version: '2.337.0', required_labels: ['self-hosted', 'Windows', 'X64'] },
    evidence_artifact: `synthetic-${subject.slice(0, 8)}-evidence`,
    return_ticket: {
      workstream_id: 'BOOK-SYSTEM',
      qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
      subject_sha: subject,
      origin_ref: 'refs/heads/book/synthetic-repair',
      resume_on_pass: 'synthetic pass continuation',
      resume_on_failure: 'synthetic failure continuation',
      notification_target: 'synthetic-rerun-selftest'
    },
    promotion_authorized: promotionAuthorized
  };
}
function removeIfExists(rel) { fs.rmSync(path.join(root, rel), { recursive: true, force: true }); }
function cleanup() {
  fs.writeFileSync(inboxAbs, originalInbox);
  for (const id of [txId, budgetTxId]) {
    removeIfExists(path.posix.join('governance/repair/events', id));
    const dispatchDir = path.join(root, 'governance/repair/agent-dispatch');
    if (fs.existsSync(dispatchDir)) {
      for (const name of fs.readdirSync(dispatchDir)) if (name.startsWith(id)) fs.rmSync(path.join(dispatchDir, name), { force: true });
    }
    const ticketDir = path.join(root, 'qualification/a01/repair-requests');
    if (fs.existsSync(ticketDir)) {
      for (const name of fs.readdirSync(ticketDir)) if (name.startsWith(id)) fs.rmSync(path.join(ticketDir, name), { force: true });
    }
  }
}
function open(id, maxRepairAttempts) {
  return openTransaction({
    transaction_id: id,
    receipt_id: `${id}-root-receipt`,
    qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
    workstream_id: 'BOOK-SYSTEM',
    failed_subject_sha: A,
    receipt: { result_class: 'SUBJECT_FAILURE' },
    repair_attempt: 0,
    max_repair_attempts: maxRepairAttempts,
    evidence_pointer: `synthetic:${id}:root`,
    created_at: '2026-09-10T00:00:00Z'
  });
}
function finalize(id, subject, evidence, at) {
  return ledger.finalize({
    transaction_id: id,
    candidate: {
      replacement_subject_sha: subject,
      repair_branch: 'refs/heads/book/synthetic-repair',
      prequalification: {
        result: 'PASS',
        subject_sha: subject,
        qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
        workstream_id: 'BOOK-SYSTEM',
        evidence_pointer: evidence
      }
    },
    finalized_at: at
  });
}

try {
  cleanup();

  const opened = open(txId, 2);
  ledger.ingest(opened);
  const first = finalize(txId, B, 'hosted:prequal-b', '2026-09-10T00:01:00Z');
  assert(first.candidate_repair_attempt === 1, 'first changed candidate must be repair attempt 1');
  const firstPrep = ledger.prepareRerun({ transaction_id: txId });
  assert(firstPrep.transaction_id === txId, 'prepare-rerun must preserve transaction ID');
  assert(firstPrep.subject_sha === B, 'first rerun must bind exact candidate B');
  assert(firstPrep.transaction_state === 'A01_REQUEUE_READY', 'first rerun must start A01_REQUEUE_READY');

  const firstFail = ledger.adjudicateRerun({
    transaction_id: txId,
    rerun_receipt_id: 'a01-rerun-b-subject-failure',
    receipt: receipt(B, 'SUBJECT_FAILURE'),
    receipt_pointer: 'artifact:a01-rerun-b-subject-failure',
    adjudicated_at: '2026-09-10T00:02:00Z'
  });
  assert(firstFail.action === 'REDISPATCHED_SAME_TRANSACTION', 'subject failure with budget remaining must re-dispatch same transaction');
  let inbox = JSON.parse(fs.readFileSync(inboxAbs, 'utf8'));
  let tx = inbox.active_transactions.find((x) => x.transaction_id === txId);
  assert(tx && tx.state === 'REPAIR_REQUEST_READY', 'same transaction must return to REPAIR_REQUEST_READY');
  assert(tx.repair_attempt === 1, 'failed candidate B must consume exactly one product repair attempt');
  assert(tx.repair_base_subject_sha === B, 'next repair must start from newly failed exact subject B');
  assert(tx.failed_subject_sha === A, 'root failed subject A must remain preserved');
  assert(tx.dispatch_packet_pointer.endsWith('-A2.json'), 'second repair dispatch must be versioned without overwriting A1 dispatch');

  const second = finalize(txId, C, 'hosted:prequal-c', '2026-09-10T00:03:00Z');
  assert(second.candidate_repair_attempt === 2, 'second changed candidate must be repair attempt 2');
  const secondPrep = ledger.prepareRerun({ transaction_id: txId });
  assert(secondPrep.subject_sha === C, 'second rerun must bind exact candidate C');
  assert(secondPrep.root_failed_subject_sha === A && secondPrep.repair_base_subject_sha === B, 'rerun context must preserve root and immediate repair-base lineage');

  const infra = ledger.adjudicateRerun({
    transaction_id: txId,
    rerun_receipt_id: 'a01-rerun-c-infra-failure',
    receipt: receipt(C, 'INFRA_FAILURE'),
    receipt_pointer: 'artifact:a01-rerun-c-infra-failure',
    adjudicated_at: '2026-09-10T00:04:00Z'
  });
  assert(infra.action === 'SAME_SHA_INFRA_RETRY_READY', 'first infrastructure failure must emit one same-SHA retry');
  inbox = JSON.parse(fs.readFileSync(inboxAbs, 'utf8'));
  tx = inbox.active_transactions.find((x) => x.transaction_id === txId);
  assert(tx.state === 'RETRY_REQUEST_READY', 'infrastructure retry must stay in same transaction');
  assert(tx.repair_attempt === 1, 'infrastructure failure must not consume a product repair attempt');
  assert(tx.replacement_subject_sha === C, 'infrastructure retry must preserve exact candidate C');
  assert(tx.retry_ticket_pointer && fs.existsSync(path.join(root, tx.retry_ticket_pointer)), 'same-SHA retry ticket must be durable');

  const retryPrep = ledger.prepareRerun({ transaction_id: txId });
  assert(retryPrep.subject_sha === C, 'same-SHA infrastructure retry must remain bound to C');
  assert(retryPrep.transaction_state === 'RETRY_REQUEST_READY', 'retry prepare must preserve retry state');

  const passed = ledger.adjudicateRerun({
    transaction_id: txId,
    rerun_receipt_id: 'a01-rerun-c-pass',
    receipt: receipt(C, 'PASS'),
    receipt_pointer: 'artifact:a01-rerun-c-pass',
    adjudicated_at: '2026-09-10T00:05:00Z'
  });
  assert(passed.action === 'TRANSACTION_CLOSED_A01_PASS', 'authoritative replacement PASS must close same transaction');
  inbox = JSON.parse(fs.readFileSync(inboxAbs, 'utf8'));
  assert(!inbox.active_transactions.some((x) => x.transaction_id === txId), 'closed transaction must leave active inbox');
  const history = inbox.transaction_history.find((x) => x.transaction_id === txId);
  assert(history && history.final_state === 'CLOSED', 'same transaction must enter history as CLOSED');
  assert(history.failed_subject_sha === A && history.final_subject_sha === C, 'terminal history must preserve root failed A and final qualified C');
  assert(history.final_result_class === 'PASS', 'terminal history must record authoritative PASS result class');
  const duplicate = ledger.ingest(opened);
  assert(duplicate.action === 'NOOP_ALREADY_INGESTED', 'closed transaction ID must remain idempotent and cannot reopen as a second lineage');

  const eventDir = path.join(root, 'governance/repair/events', txId);
  const events = fs.readdirSync(eventDir).filter((x) => x.endsWith('.json')).sort();
  assert(events.some((x) => x.includes('a01_rerun_receipt_recorded')), 'rerun receipts must be append-only events');
  assert(events.some((x) => x.includes('a01_retry_ticket_emitted')), 'same-SHA infrastructure retry must have its own event');
  assert(events.some((x) => x.includes('transaction_closed')), 'PASS must append terminal closure event');

  const budgetOpened = open(budgetTxId, 1);
  ledger.ingest(budgetOpened);
  finalize(budgetTxId, D, 'hosted:prequal-d', '2026-09-10T00:06:00Z');
  const exhausted = ledger.adjudicateRerun({
    transaction_id: budgetTxId,
    rerun_receipt_id: 'a01-rerun-d-subject-failure',
    receipt: receipt(D, 'SUBJECT_FAILURE'),
    receipt_pointer: 'artifact:a01-rerun-d-subject-failure',
    adjudicated_at: '2026-09-10T00:07:00Z'
  });
  assert(exhausted.action === 'TRANSACTION_DEAD_LETTERED', 'subject failure at repair budget must dead-letter same transaction');
  inbox = JSON.parse(fs.readFileSync(inboxAbs, 'utf8'));
  const exhaustedHistory = inbox.transaction_history.find((x) => x.transaction_id === budgetTxId);
  assert(exhaustedHistory && exhaustedHistory.final_state === 'DEAD_LETTER', 'budget-exhausted lineage must be terminal history');

  console.log('A01_REPAIR_RERUN_SELFTEST_PASS');
  console.log('same_transaction_subject_redispatch=PASS');
  console.log('same_sha_infra_retry=PASS');
  console.log('authoritative_pass_terminal_closure=PASS');
  console.log('repair_budget_dead_letter=PASS');
  console.log('disconnected_lineage_prevention=PASS');
} finally {
  cleanup();
}
