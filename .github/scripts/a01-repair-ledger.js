'use strict';

const fs = require('fs');
const path = require('path');
const { finalizeTransaction } = require('./a01-repair-broker');
const { classifyReceipt } = require('./a01-closed-loop-repair');

const root = path.resolve(__dirname, '..', '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'governance/repair/REPAIR-LEDGER-REGISTRY-001.json'), 'utf8'));
const inboxRegistry = JSON.parse(fs.readFileSync(path.join(root, 'governance/repair/REPAIR-INBOX-REGISTRY-001.json'), 'utf8'));

const activeStates = new Set([
  'REPAIR_REQUEST_READY', 'CLAIMED', 'CANDIDATE_PREQUAL_REQUIRED', 'A01_REQUEUE_READY',
  'OWNER_ACTION_REQUIRED', 'OWNER_AUTHORITY_REQUIRED', 'WAIT_FOR_PREDECESSOR',
  'REPLAN_ADMISSION', 'RETRY_REQUEST_READY'
]);
const terminalStates = new Set(['CLOSED', 'DEAD_LETTER', 'SUPERSEDED']);
const MAX_SAME_SHA_INFRA_RETRIES = 1;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function isSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || ''));
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
    replacement_ticket_pointer: extras.replacement_ticket_pointer || tx.replacement_ticket_pointer || tx.retry_ticket_pointer || null,
    a01_rerun_receipt_pointer: extras.a01_rerun_receipt_pointer || tx.a01_rerun_receipt_pointer || null,
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
function findHistoricalTransaction(txId) {
  for (const [systemId, rel] of Object.entries(inboxRegistry.owner_files || {})) {
    const inbox = getInbox(rel);
    const historyIndex = (inbox.transaction_history || []).findIndex((x) => x.transaction_id === txId);
    if (historyIndex >= 0) return { systemId, rel, inbox, historyIndex, tx: inbox.transaction_history[historyIndex] };
  }
  return null;
}
function currentRepairSubject(tx) {
  return tx.repair_base_subject_sha || tx.replacement_subject_sha || tx.failed_subject_sha;
}
function currentRerunSubject(tx) {
  return tx.replacement_subject_sha || tx.repair_base_subject_sha || tx.failed_subject_sha;
}
function nextCandidateAttempt(tx) {
  return Number(tx.repair_attempt || 0) + 1;
}
function dispatchPacket(tx) {
  const repairSubject = currentRepairSubject(tx);
  return {
    dispatch_version: 2,
    dispatch_id: `AGENT-DISPATCH-${sanitize(tx.transaction_id)}-A${nextCandidateAttempt(tx)}`,
    transaction_id: tx.transaction_id,
    owner_path: tx.owner_path,
    owner_system_id: tx.inbox_owner_system_id,
    state: 'OWNER_WORKER_READY',
    qualification_id: tx.qualification_id,
    workstream_id: tx.workstream_id,
    root_failed_subject_sha: tx.failed_subject_sha,
    repair_subject_sha: repairSubject,
    receipt_id: tx.receipt_id,
    latest_failed_receipt_id: tx.latest_failed_receipt_id || tx.receipt_id,
    repair_attempts_consumed: Number(tx.repair_attempt || 0),
    next_repair_attempt: nextCandidateAttempt(tx),
    max_repair_attempts: tx.max_repair_attempts,
    evidence_pointer: tx.latest_failure_evidence_pointer || tx.evidence_pointer || null,
    objective: `Reproduce the authoritative failure on exact subject ${repairSubject}, make the smallest evidence-justified repair, preserve the root failed-subject lineage ${tx.failed_subject_sha}, produce a new exact SHA for changed bytes, and obtain deterministic prequalification PASS on that exact replacement SHA.`,
    forbidden_authority: [
      'Do not create A-01 PASS or promotion authority.',
      'Do not change qualification/workstream ownership.',
      'Do not repair human/author/private/native/external authority boundaries as code defects.',
      'Do not transfer evidence from any failed subject to changed bytes.'
    ]
  };
}
function dispatchPathFor(tx, initial = false) {
  if (initial) return path.posix.join('governance/repair/agent-dispatch', `${sanitize(tx.transaction_id)}.json`);
  return path.posix.join('governance/repair/agent-dispatch', `${sanitize(tx.transaction_id)}-A${nextCandidateAttempt(tx)}.json`);
}
function ingest(envelope) {
  const tx = envelope.transaction || envelope;
  assert(tx.transaction_id, 'transaction_id is required');
  assert(tx.receipt_id, 'receipt_id is required');
  assert(tx.target_inbox, 'target_inbox is required');
  const existing = findTransaction(tx.transaction_id) || findHistoricalTransaction(tx.transaction_id);
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
    dispatchPointer = dispatchPathFor(tx, true);
    writeJson(dispatchPointer, packet);
    normalized.dispatch_state = 'OWNER_WORKER_READY';
    normalized.dispatch_packet_pointer = dispatchPointer;
    appendEvent('AGENT_DISPATCH_READY', normalized, { dispatch_packet_pointer: dispatchPointer, repair_subject_sha: packet.repair_subject_sha });
  }

  if (tx.state === 'RETRY_REQUEST_READY') {
    const retryCount = Number(normalized.same_sha_infra_retry_count || 0);
    const ticket = retryTicket(normalized);
    const ticketPointer = path.posix.join(
      registry.replacement_ticket_root,
      `${sanitize(normalized.transaction_id)}-A${Number(normalized.candidate_repair_attempt || nextCandidateAttempt(normalized))}-infra-R${retryCount}.json`
    );
    writeJson(ticketPointer, ticket);
    normalized.retry_ticket_pointer = ticketPointer;
    normalized.same_sha_infra_retry_count = retryCount;
    normalized.last_event_pointer = appendEvent('A01_RETRY_TICKET_EMITTED', normalized, {
      retry_ticket: ticket,
      same_sha_infra_retry_count: retryCount
    }, { replacement_ticket_pointer: ticketPointer });
  }

  if (activeStates.has(tx.state)) {
    inbox.active_transactions = [...(inbox.active_transactions || []), normalized];
  } else {
    inbox.transaction_history = [...(inbox.transaction_history || []), {
      transaction_id: tx.transaction_id,
      final_state: tx.state,
      closed_at: new Date().toISOString(),
      receipt_id: tx.receipt_id,
      qualification_id: tx.qualification_id,
      workstream_id: tx.workstream_id,
      failed_subject_sha: tx.failed_subject_sha,
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
  const repairBase = tx.repair_base_subject_sha || tx.failed_subject_sha;
  return {
    workstream_id: tx.workstream_id,
    qualification_id: tx.qualification_id,
    subject_sha: tx.replacement_subject_sha,
    origin_ref: tx.repair_branch || `repair/${sanitize(tx.transaction_id)}`,
    resume_on_pass: `Record authoritative A-01 PASS for replacement subject ${tx.replacement_subject_sha}, close repair transaction ${tx.transaction_id}, preserve root failed subject ${tx.failed_subject_sha} and immediate repair base ${repairBase}, then continue the owner lane from current repository authority.`,
    resume_on_failure: `Record the new authoritative A-01 result against existing repair transaction ${tx.transaction_id}; do not create a second repair lineage; reclassify truthfully and do not exceed repair budget ${tx.max_repair_attempts}.`,
    notification_target: `repair-transaction:${tx.transaction_id}`
  };
}
function replacementTicketPath(tx) {
  const attempt = Number(tx.candidate_repair_attempt || nextCandidateAttempt(tx));
  const base = sanitize(tx.transaction_id);
  return path.posix.join(registry.replacement_ticket_root, attempt <= 1 ? `${base}.json` : `${base}-A${attempt}.json`);
}
function retryTicket(tx) {
  const subject = currentRerunSubject(tx);
  return {
    workstream_id: tx.workstream_id,
    qualification_id: tx.qualification_id,
    subject_sha: subject,
    origin_ref: tx.repair_branch || `repair/${sanitize(tx.transaction_id)}`,
    resume_on_pass: `Record authoritative A-01 PASS for same-SHA infrastructure retry ${subject} against repair transaction ${tx.transaction_id}; close only that transaction lineage if exact-SHA receipt evidence passes.`,
    resume_on_failure: `Record the new authoritative result against repair transaction ${tx.transaction_id}; classify subject versus infrastructure/control-plane/admission truthfully and do not create a disconnected transaction.`,
    notification_target: `repair-transaction:${tx.transaction_id}`
  };
}
function finalize(input) {
  assert(input.transaction_id, 'transaction_id is required');
  const found = findTransaction(input.transaction_id);
  assert(found, `TRANSACTION_NOT_FOUND:${input.transaction_id}`);
  const rootFailedSubject = found.tx.failed_subject_sha;
  const repairBaseSubject = found.tx.repair_base_subject_sha || rootFailedSubject;
  const brokerTx = { ...found.tx, failed_subject_sha: repairBaseSubject };
  const result = finalizeTransaction({
    transaction: brokerTx,
    candidate: input.candidate || {},
    finalized_at: input.finalized_at || new Date().toISOString()
  });
  const tx = {
    ...result.transaction,
    failed_subject_sha: rootFailedSubject,
    repair_base_subject_sha: repairBaseSubject,
    candidate_repair_attempt: nextCandidateAttempt(found.tx),
    same_sha_infra_retry_count: 0
  };
  if (tx.replacement_request) {
    tx.replacement_request.root_receipt_id = found.tx.receipt_id;
    tx.replacement_request.parent_receipt_id = found.tx.latest_failed_receipt_id || found.tx.receipt_id;
    tx.replacement_request.replacement_of_subject_sha = repairBaseSubject;
    tx.replacement_request.repair_attempt = tx.candidate_repair_attempt;
  }
  const prequalEvent = appendEvent('CANDIDATE_PREQUALIFIED', tx, {
    repair_branch: tx.repair_branch || null,
    root_failed_subject_sha: rootFailedSubject,
    repair_base_subject_sha: repairBaseSubject,
    replacement_subject_sha: tx.replacement_subject_sha,
    candidate_repair_attempt: tx.candidate_repair_attempt,
    prequalification_evidence_pointer: tx.prequalification_evidence_pointer || null
  });
  const ticket = replacementTicket(tx);
  const ticketPointer = replacementTicketPath(tx);
  writeJson(ticketPointer, ticket);
  const ticketEvent = appendEvent('A01_REPLACEMENT_TICKET_EMITTED', tx, {
    replacement_ticket: ticket,
    root_receipt_id: tx.receipt_id,
    parent_receipt_id: tx.latest_failed_receipt_id || tx.receipt_id,
    candidate_repair_attempt: tx.candidate_repair_attempt
  }, { replacement_ticket_pointer: ticketPointer });

  tx.replacement_ticket_pointer = ticketPointer;
  tx.retry_ticket_pointer = null;
  tx.last_event_pointer = ticketEvent;
  found.inbox.active_transactions[found.activeIndex] = tx;
  saveInbox(found.rel, found.inbox);
  return {
    action: 'FINALIZED_A01_REQUEUE_READY',
    transaction_id: tx.transaction_id,
    replacement_subject_sha: tx.replacement_subject_sha,
    candidate_repair_attempt: tx.candidate_repair_attempt,
    prequalification_event: prequalEvent,
    replacement_ticket: ticketPointer,
    replacement_ticket_event: ticketEvent
  };
}
function prepareRerun(input) {
  assert(input.transaction_id, 'transaction_id is required');
  const found = findTransaction(input.transaction_id);
  assert(found, `TRANSACTION_NOT_FOUND:${input.transaction_id}`);
  const tx = found.tx;
  assert(['A01_REQUEUE_READY', 'RETRY_REQUEST_READY'].includes(tx.state), `TRANSACTION_NOT_RERUN_READY:${tx.state}`);
  const subject = currentRerunSubject(tx);
  assert(isSha(subject), `RERUN_SUBJECT_INVALID:${subject || '<missing>'}`);
  const ticketPointer = tx.state === 'RETRY_REQUEST_READY' ? tx.retry_ticket_pointer : tx.replacement_ticket_pointer;
  assert(ticketPointer, `RERUN_TICKET_POINTER_MISSING:${tx.transaction_id}`);
  const ticket = readJson(ticketPointer);
  assert(ticket.subject_sha.toLowerCase() === subject.toLowerCase(), 'rerun ticket subject mismatch');
  assert(ticket.qualification_id === tx.qualification_id, 'rerun ticket qualification mismatch');
  assert(ticket.workstream_id === tx.workstream_id, 'rerun ticket workstream mismatch');
  return {
    transaction_id: tx.transaction_id,
    transaction_state: tx.state,
    root_receipt_id: tx.receipt_id,
    latest_failed_receipt_id: tx.latest_failed_receipt_id || tx.receipt_id,
    root_failed_subject_sha: tx.failed_subject_sha,
    repair_base_subject_sha: tx.repair_base_subject_sha || tx.failed_subject_sha,
    qualification_id: tx.qualification_id,
    workstream_id: tx.workstream_id,
    subject_sha: subject,
    origin_ref: ticket.origin_ref,
    resume_on_pass: ticket.resume_on_pass,
    resume_on_failure: ticket.resume_on_failure,
    notification_target: ticket.notification_target,
    repair_attempt: Number(tx.repair_attempt || 0),
    candidate_repair_attempt: Number(tx.candidate_repair_attempt || nextCandidateAttempt(tx)),
    max_repair_attempts: Number(tx.max_repair_attempts || 0),
    same_sha_infra_retry_count: Number(tx.same_sha_infra_retry_count || 0),
    ticket_pointer: ticketPointer,
    standing: 'A01_RERUN_ADMISSION_READY',
    authoritative_pass: false
  };
}
function reasonToken(reason) {
  return String(reason || '').trim().split(/\s+/)[0] || '';
}
function classifyRerun(receipt, failureReason, attemptResultClass) {
  const reason = reasonToken(failureReason);
  if (reason === 'SUBJECT_CHECKOUT_MISMATCH') return 'CONTROL_PLANE_OWNER_ROUTE';
  if (reason) {
    const reasonClass = classifyReceipt({ classification: reason });
    if (reasonClass !== 'UNKNOWN') return reasonClass;
  }
  return classifyReceipt(receipt || { result_class: attemptResultClass });
}
function archive(found, tx, finalState, eventType, payload, at) {
  assert(terminalStates.has(finalState), `INVALID_TERMINAL_STATE:${finalState}`);
  tx.state = finalState;
  tx.closed_at = at;
  const terminalEvent = appendEvent(eventType, tx, payload, { recorded_at: at, a01_rerun_receipt_pointer: tx.a01_rerun_receipt_pointer || null });
  tx.last_event_pointer = terminalEvent;
  found.inbox.active_transactions.splice(found.activeIndex, 1);
  found.inbox.transaction_history = [...(found.inbox.transaction_history || []), {
    transaction_id: tx.transaction_id,
    final_state: finalState,
    closed_at: at,
    receipt_id: tx.receipt_id,
    qualification_id: tx.qualification_id,
    workstream_id: tx.workstream_id,
    failed_subject_sha: tx.failed_subject_sha,
    final_subject_sha: currentRerunSubject(tx),
    final_result_class: tx.final_result_class || null,
    final_classification: tx.classification || null,
    repair_attempts_consumed: Number(tx.repair_attempt || 0),
    candidate_repair_attempt: Number(tx.candidate_repair_attempt || 0),
    a01_rerun_receipt_pointer: tx.a01_rerun_receipt_pointer || null,
    terminal_event_pointer: terminalEvent
  }];
  saveInbox(found.rel, found.inbox);
  return terminalEvent;
}
function adjudicateRerun(input) {
  assert(input.transaction_id, 'transaction_id is required');
  const found = findTransaction(input.transaction_id);
  assert(found, `TRANSACTION_NOT_FOUND:${input.transaction_id}`);
  const tx = { ...found.tx };
  assert(['A01_REQUEUE_READY', 'RETRY_REQUEST_READY'].includes(tx.state), `TRANSACTION_NOT_RERUN_ADJUDICABLE:${tx.state}`);
  const expectedSubject = currentRerunSubject(tx);
  assert(isSha(expectedSubject), 'current rerun subject must be a 40-hex Git SHA');
  const receipt = input.receipt || null;
  const rerunReceiptId = input.rerun_receipt_id || null;
  const receiptPointer = input.receipt_pointer || null;
  const at = input.adjudicated_at || new Date().toISOString();
  const failureReason = input.failure_reason || null;
  const attemptResultClass = receipt?.result_class || input.attempt_result_class || null;

  if (receipt) {
    assert(receipt.qualification_id === tx.qualification_id, 'rerun receipt qualification mismatch');
    assert(receipt.workstream_id === tx.workstream_id, 'rerun receipt workstream mismatch');
    assert(isSha(receipt.subject_sha), 'rerun receipt subject_sha invalid');
    assert(receipt.subject_sha.toLowerCase() === expectedSubject.toLowerCase(), 'rerun receipt subject does not match transaction subject');
    assert(isSha(receipt.checkout_sha), 'rerun receipt checkout_sha invalid');
    if (receipt.result_class === 'PASS') assert(receipt.checkout_sha.toLowerCase() === expectedSubject.toLowerCase(), 'PASS rerun receipt checkout mismatch');
  } else {
    assert(['INFRA_FAILURE', 'CONTROL_PLANE_FAILURE'].includes(String(attemptResultClass || '').toUpperCase()), 'receipt-less rerun may only record infrastructure/control-plane attempt failure');
  }

  const classification = classifyRerun(receipt, failureReason, attemptResultClass);
  const receiptEventType = receipt ? 'A01_RERUN_RECEIPT_RECORDED' : 'A01_RERUN_ATTEMPT_RECORDED';
  tx.a01_rerun_receipt_pointer = receiptPointer;
  tx.latest_rerun_receipt_id = rerunReceiptId;
  tx.latest_rerun_result_class = attemptResultClass;
  tx.latest_rerun_failure_reason = failureReason;
  tx.final_result_class = attemptResultClass;

  if (classification === 'PASS') {
    tx.classification = 'PASS';
    tx.route = 'A01_REPLACEMENT_PASS';
    const receiptEvent = appendEvent(receiptEventType, tx, {
      rerun_receipt_id: rerunReceiptId,
      receipt_pointer: receiptPointer,
      result_class: receipt.result_class,
      subject_sha: receipt.subject_sha,
      checkout_sha: receipt.checkout_sha,
      promotion_authorized: receipt.promotion_authorized === true,
      prior_transaction_state: found.tx.state
    }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
    const terminalEvent = archive(found, tx, 'CLOSED', 'TRANSACTION_CLOSED', {
      reason: 'AUTHORITATIVE_A01_REPLACEMENT_PASS',
      rerun_receipt_event: receiptEvent,
      subject_sha: expectedSubject,
      root_failed_subject_sha: tx.failed_subject_sha
    }, at);
    return {
      action: 'TRANSACTION_CLOSED_A01_PASS',
      transaction_id: tx.transaction_id,
      final_subject_sha: expectedSubject,
      rerun_receipt_event: receiptEvent,
      terminal_event: terminalEvent,
      authoritative_source: 'A01_RECEIPT'
    };
  }

  if (classification === 'REPAIRABLE_SUBJECT') {
    const consumedAttempt = Math.max(Number(tx.repair_attempt || 0), Number(tx.candidate_repair_attempt || nextCandidateAttempt(tx)));
    tx.repair_attempt = consumedAttempt;
    tx.latest_failed_receipt_id = rerunReceiptId || tx.latest_failed_receipt_id || tx.receipt_id;
    tx.latest_failure_evidence_pointer = receiptPointer || tx.latest_failure_evidence_pointer || tx.evidence_pointer || null;
    tx.repair_base_subject_sha = expectedSubject;
    tx.previous_replacement_subject_sha = expectedSubject;
    tx.replacement_subject_sha = null;
    tx.prequalification_evidence_pointer = null;
    tx.replacement_request = null;
    tx.replacement_ticket_pointer = null;
    tx.retry_ticket_pointer = null;
    tx.candidate_repair_attempt = null;
    tx.same_sha_infra_retry_count = 0;
    tx.classification = 'REPAIRABLE_SUBJECT';

    if (consumedAttempt >= Number(tx.max_repair_attempts || 0)) {
      tx.route = 'REPAIR_BUDGET_EXHAUSTED';
      const receiptEvent = appendEvent(receiptEventType, { ...tx, state: 'DEAD_LETTER' }, {
        rerun_receipt_id: rerunReceiptId,
        receipt_pointer: receiptPointer,
        result_class: attemptResultClass,
        failure_reason: failureReason,
        consumed_repair_attempt: consumedAttempt,
        max_repair_attempts: tx.max_repair_attempts
      }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
      tx.state = 'DEAD_LETTER';
      const terminalEvent = archive(found, tx, 'DEAD_LETTER', 'TRANSACTION_DEAD_LETTERED', {
        reason: 'REPAIR_BUDGET_EXHAUSTED',
        rerun_receipt_event: receiptEvent,
        latest_failed_subject_sha: expectedSubject
      }, at);
      return { action: 'TRANSACTION_DEAD_LETTERED', transaction_id: tx.transaction_id, rerun_receipt_event: receiptEvent, terminal_event: terminalEvent };
    }

    tx.state = 'REPAIR_REQUEST_READY';
    tx.route = 'RETURN_TO_PRODUCT_OWNER';
    const receiptEvent = appendEvent(receiptEventType, tx, {
      rerun_receipt_id: rerunReceiptId,
      receipt_pointer: receiptPointer,
      result_class: attemptResultClass,
      failure_reason: failureReason,
      latest_failed_subject_sha: expectedSubject,
      repair_attempts_consumed: consumedAttempt
    }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
    const packet = dispatchPacket(tx);
    const dispatchPointer = dispatchPathFor(tx, false);
    writeJson(dispatchPointer, packet);
    tx.dispatch_state = 'OWNER_WORKER_READY';
    tx.dispatch_packet_pointer = dispatchPointer;
    const dispatchEvent = appendEvent('AGENT_DISPATCH_READY', tx, {
      dispatch_packet_pointer: dispatchPointer,
      repair_subject_sha: packet.repair_subject_sha,
      rerun_receipt_event: receiptEvent
    }, { recorded_at: at });
    tx.last_event_pointer = dispatchEvent;
    found.inbox.active_transactions[found.activeIndex] = tx;
    saveInbox(found.rel, found.inbox);
    return {
      action: 'REDISPATCHED_SAME_TRANSACTION',
      transaction_id: tx.transaction_id,
      repair_subject_sha: expectedSubject,
      repair_attempts_consumed: consumedAttempt,
      rerun_receipt_event: receiptEvent,
      dispatch_packet: dispatchPointer,
      dispatch_event: dispatchEvent
    };
  }

  if (classification === 'RETRYABLE_INFRA') {
    const retryCount = Number(tx.same_sha_infra_retry_count || 0) + 1;
    tx.same_sha_infra_retry_count = retryCount;
    tx.classification = 'RETRYABLE_INFRA';
    tx.latest_failure_evidence_pointer = receiptPointer || tx.latest_failure_evidence_pointer || tx.evidence_pointer || null;
    if (retryCount > MAX_SAME_SHA_INFRA_RETRIES) {
      tx.route = 'INFRA_RETRY_BUDGET_EXHAUSTED';
      tx.state = 'DEAD_LETTER';
      const receiptEvent = appendEvent(receiptEventType, tx, {
        rerun_receipt_id: rerunReceiptId,
        receipt_pointer: receiptPointer,
        result_class: attemptResultClass,
        failure_reason: failureReason,
        same_sha_infra_retry_count: retryCount
      }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
      const terminalEvent = archive(found, tx, 'DEAD_LETTER', 'TRANSACTION_DEAD_LETTERED', {
        reason: 'INFRA_RETRY_BUDGET_EXHAUSTED',
        rerun_receipt_event: receiptEvent,
        subject_sha: expectedSubject
      }, at);
      return { action: 'TRANSACTION_DEAD_LETTERED_INFRA', transaction_id: tx.transaction_id, rerun_receipt_event: receiptEvent, terminal_event: terminalEvent };
    }
    tx.state = 'RETRY_REQUEST_READY';
    tx.route = 'RETRY_SAME_SHA';
    const receiptEvent = appendEvent(receiptEventType, tx, {
      rerun_receipt_id: rerunReceiptId,
      receipt_pointer: receiptPointer,
      result_class: attemptResultClass,
      failure_reason: failureReason,
      same_sha_infra_retry_count: retryCount,
      repair_attempts_consumed: tx.repair_attempt
    }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
    const ticket = retryTicket(tx);
    const ticketPointer = path.posix.join(registry.replacement_ticket_root, `${sanitize(tx.transaction_id)}-A${Number(tx.candidate_repair_attempt || nextCandidateAttempt(tx))}-infra-R${retryCount}.json`);
    writeJson(ticketPointer, ticket);
    tx.retry_ticket_pointer = ticketPointer;
    const ticketEvent = appendEvent('A01_RETRY_TICKET_EMITTED', tx, {
      retry_ticket: ticket,
      same_sha_infra_retry_count: retryCount,
      rerun_receipt_event: receiptEvent
    }, { recorded_at: at, replacement_ticket_pointer: ticketPointer });
    tx.last_event_pointer = ticketEvent;
    found.inbox.active_transactions[found.activeIndex] = tx;
    saveInbox(found.rel, found.inbox);
    return {
      action: 'SAME_SHA_INFRA_RETRY_READY',
      transaction_id: tx.transaction_id,
      subject_sha: expectedSubject,
      rerun_receipt_event: receiptEvent,
      retry_ticket: ticketPointer,
      retry_ticket_event: ticketEvent
    };
  }

  const routeMap = {
    CONTROL_PLANE_OWNER_ROUTE: ['OWNER_ACTION_REQUIRED', 'CORE_CONTROL_PLANE_REPAIR'],
    NON_AUTOMATABLE: ['OWNER_AUTHORITY_REQUIRED', 'NON_AUTOMATABLE_BOUNDARY'],
    ADMISSION_ONLY: ['REPLAN_ADMISSION', 'REPLAN_ADMISSION'],
    DEPENDENCY_ONLY: ['WAIT_FOR_PREDECESSOR', 'WAIT_FOR_PREDECESSOR']
  };
  const routed = routeMap[classification];
  if (routed) {
    tx.state = routed[0];
    tx.route = routed[1];
    tx.classification = classification;
    if (classification === 'CONTROL_PLANE_OWNER_ROUTE') tx.route_owner_path = 'SYSTEM_MASTER/CORE';
    const receiptEvent = appendEvent(receiptEventType, tx, {
      rerun_receipt_id: rerunReceiptId,
      receipt_pointer: receiptPointer,
      result_class: attemptResultClass,
      failure_reason: failureReason,
      route: tx.route,
      route_owner_path: tx.route_owner_path || tx.owner_path
    }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
    tx.last_event_pointer = receiptEvent;
    found.inbox.active_transactions[found.activeIndex] = tx;
    saveInbox(found.rel, found.inbox);
    return { action: 'ROUTED_SAME_TRANSACTION', transaction_id: tx.transaction_id, state: tx.state, route: tx.route, rerun_receipt_event: receiptEvent };
  }

  tx.state = 'DEAD_LETTER';
  tx.route = 'UNCLASSIFIED_RERUN_FAILURE';
  tx.classification = classification || 'UNKNOWN';
  const receiptEvent = appendEvent(receiptEventType, tx, {
    rerun_receipt_id: rerunReceiptId,
    receipt_pointer: receiptPointer,
    result_class: attemptResultClass,
    failure_reason: failureReason
  }, { recorded_at: at, a01_rerun_receipt_pointer: receiptPointer });
  const terminalEvent = archive(found, tx, 'DEAD_LETTER', 'TRANSACTION_DEAD_LETTERED', {
    reason: 'UNCLASSIFIED_RERUN_FAILURE',
    rerun_receipt_event: receiptEvent
  }, at);
  return { action: 'TRANSACTION_DEAD_LETTERED_UNKNOWN', transaction_id: tx.transaction_id, rerun_receipt_event: receiptEvent, terminal_event: terminalEvent };
}
function main() {
  const command = process.argv[2];
  let raw = '';
// --- stdin safety guard -------------------------------------------------------
// This script reads its payload from stdin. Without a guard, an invocation with
// no pipe attached blocks forever: on a GitHub runner that is a job pinned for
// the full six-hour ceiling, and on a self-hosted runner it blocks every other
// queued job behind it. Fail fast and say why.
const STDIN_TIMEOUT_MS = Number(process.env.A01_STDIN_TIMEOUT_MS || 120000);
function guardStdin() {
  if (process.stdin.isTTY) {
    process.stderr.write(
      'STDIN_REQUIRED: this script reads a JSON payload from standard input.\n' +
      'Pipe one in, for example:  node ' + __filename + ' < payload.json\n'
    );
    process.exit(2);
  }
  const timer = setTimeout(() => {
    process.stderr.write(
      'STDIN_TIMEOUT: no end-of-input after ' + STDIN_TIMEOUT_MS + ' ms.\n' +
      'Set A01_STDIN_TIMEOUT_MS to change the deadline.\n'
    );
    process.exit(2);
  }, STDIN_TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  process.stdin.once('end', () => clearTimeout(timer));
  process.stdin.once('error', () => clearTimeout(timer));
}
guardStdin();
// --- end stdin safety guard ---------------------------------------------------
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw || '{}');
      let output;
      if (command === 'ingest') output = ingest(input);
      else if (command === 'finalize') output = finalize(input);
      else if (command === 'prepare-rerun') output = prepareRerun(input);
      else if (command === 'adjudicate-rerun') output = adjudicateRerun(input);
      else throw new Error('usage: node a01-repair-ledger.js <ingest|finalize|prepare-rerun|adjudicate-rerun>');
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } catch (error) {
      console.error(`A01_REPAIR_LEDGER_ERROR:${error.message}`);
      process.exit(1);
    }
  });
}

module.exports = {
  ingest,
  finalize,
  prepareRerun,
  adjudicateRerun,
  replacementTicket,
  retryTicket,
  dispatchPacket,
  findTransaction,
  currentRepairSubject,
  currentRerunSubject,
  classifyRerun
};
if (require.main === module) main();
