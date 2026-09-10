'use strict';

const fs = require('fs');
const path = require('path');
const { classifyReceipt, planRepair } = require('./a01-closed-loop-repair');

const root = path.resolve(__dirname, '..', '..');
const authorityPath = path.join(root, 'governance', 'CURRENT-AUTHORITY.json');
const inboxRegistryPath = path.join(root, 'governance', 'repair', 'REPAIR-INBOX-REGISTRY-001.json');

function assert(condition, message) { if (!condition) throw new Error(message); }
function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function authority() { return readJson(authorityPath); }
function topology() {
  const rel = authority().topology;
  assert(rel, 'CURRENT_TOPOLOGY_MISSING');
  return readJson(path.join(root, rel));
}
function inboxRegistry() { return readJson(inboxRegistryPath); }

function ownerPathForSystem(systemId, topo = topology()) {
  if (systemId === 'CORE') return 'SYSTEM_MASTER/CORE';
  if (systemId === 'LEARNING') return 'SYSTEM_MASTER/LEARNING';
  if (systemId === 'BOOK') return 'SYSTEM_MASTER/BOOK';
  if (systemId === 'DOCUMENTS') return 'SYSTEM_MASTER/DOCUMENTS';
  const system = (topo.canonical_internal_systems || []).find((s) => s.system_id === systemId);
  return system ? `SYSTEM_MASTER/${system.system_id}` : null;
}

function resolveProductOwner(workstreamId, topo = topology()) {
  const systemId = topo.execution_lane_owner_map?.[workstreamId] || null;
  assert(systemId, `UNALLOCATED_WORKSTREAM:${workstreamId || '<missing>'}`);
  const ownerPath = ownerPathForSystem(systemId, topo);
  assert(ownerPath, `UNALLOCATED_SYSTEM:${systemId}`);
  return { system_id: systemId, owner_path: ownerPath };
}

function targetInbox(systemId, registry = inboxRegistry()) {
  const rel = registry.owner_files?.[systemId];
  assert(rel, `REPAIR_INBOX_MISSING:${systemId}`);
  return rel;
}
function sanitizeId(value) { return String(value || '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'; }

function baseTransaction(input, classification, owner, state, route, createdAt, registry = inboxRegistry()) {
  const attempt = Number(input.repair_attempt ?? 0);
  const maxAttempts = Number(input.max_repair_attempts ?? 1);
  assert(Number.isInteger(attempt) && attempt >= 0, 'repair_attempt must be a non-negative integer');
  assert(Number.isInteger(maxAttempts) && maxAttempts >= 0 && maxAttempts <= 2, 'max_repair_attempts must be an integer from 0 to 2');
  assert(input.receipt_id, 'receipt_id is required');
  assert(input.qualification_id, 'qualification_id is required');
  assert(input.workstream_id, 'workstream_id is required');
  assert(isSha(input.failed_subject_sha), 'failed_subject_sha must be a 40-hex Git SHA');
  const transactionId = input.transaction_id || `A01-REPAIR-${sanitizeId(input.receipt_id)}-A${attempt + 1}`;
  return {
    transaction_id: transactionId,
    state,
    route,
    owner_path: owner.owner_path,
    inbox_owner_system_id: owner.inbox_system_id,
    target_inbox: targetInbox(owner.inbox_system_id, registry),
    receipt_id: input.receipt_id,
    qualification_id: input.qualification_id,
    workstream_id: input.workstream_id,
    failed_subject_sha: String(input.failed_subject_sha).toLowerCase(),
    classification,
    repair_attempt: attempt,
    max_repair_attempts: maxAttempts,
    created_at: createdAt,
    evidence_pointer: input.evidence_pointer || null,
    failed_control_head: input.failed_control_head || null,
    promotion_authorized: false,
    authoritative_pass: false,
    publication_authorized: false,
    production_authorized: false
  };
}

function openTransaction(input, options = {}) {
  const topo = options.topology || topology();
  const registry = options.inboxRegistry || inboxRegistry();
  const productOwner = resolveProductOwner(input.workstream_id, topo);
  const classification = classifyReceipt(input.receipt || input);
  const createdAt = input.created_at || new Date().toISOString();
  const attempt = Number(input.repair_attempt ?? 0);
  const maxAttempts = Number(input.max_repair_attempts ?? 1);

  let owner = { system_id: productOwner.system_id, owner_path: productOwner.owner_path, inbox_system_id: productOwner.system_id };
  let state = 'OWNER_ACTION_REQUIRED';
  let route = 'OWNER_REVIEW';

  if (classification === 'PASS') {
    state = 'NO_ACTION'; route = 'NO_REPAIR';
  } else if (classification === 'REPAIRABLE_SUBJECT') {
    if (attempt >= maxAttempts) {
      state = 'DEAD_LETTER'; route = 'REPAIR_BUDGET_EXHAUSTED';
      owner = { system_id: 'CORE', owner_path: 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', inbox_system_id: 'CORE' };
    } else { state = 'REPAIR_REQUEST_READY'; route = 'RETURN_TO_PRODUCT_OWNER'; }
  } else if (classification === 'RETRYABLE_INFRA') {
    owner = { system_id: 'CORE', owner_path: 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', inbox_system_id: 'CORE' };
    const retryPlan = planRepair({ ...input, owner_path: owner.owner_path, receipt: input.receipt || input, repair_attempt: attempt, max_repair_attempts: maxAttempts });
    state = retryPlan.route === 'RETRY_SAME_SHA' ? 'RETRY_REQUEST_READY' : 'DEAD_LETTER';
    route = retryPlan.route;
    const transaction = baseTransaction(input, classification, owner, state, route, createdAt, registry);
    transaction.original_product_owner_path = productOwner.owner_path;
    transaction.replacement_request = retryPlan.replacement_request || null;
    return { broker_version: 2, action: 'OPEN', transaction, terminal: state === 'DEAD_LETTER', inbox_registry: registry.registry_id };
  } else if (classification === 'CONTROL_PLANE_OWNER_ROUTE') {
    owner = { system_id: 'CORE', owner_path: 'SYSTEM_MASTER/CORE', inbox_system_id: 'CORE' };
    state = 'OWNER_ACTION_REQUIRED'; route = 'CORE_CONTROL_PLANE_REPAIR';
  } else if (classification === 'NON_AUTOMATABLE') {
    state = 'OWNER_AUTHORITY_REQUIRED'; route = 'NON_AUTOMATABLE_BOUNDARY';
  } else if (classification === 'ADMISSION_ONLY') {
    owner = { system_id: 'CORE', owner_path: 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', inbox_system_id: 'CORE' };
    state = 'REPLAN_ADMISSION'; route = 'REPLAN_ADMISSION';
  } else if (classification === 'DEPENDENCY_ONLY') {
    state = 'WAIT_FOR_PREDECESSOR'; route = 'WAIT_FOR_PREDECESSOR';
  } else {
    owner = { system_id: 'CORE', owner_path: 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', inbox_system_id: 'CORE' };
    state = 'DEAD_LETTER'; route = 'UNCLASSIFIED_FAILURE';
  }

  const transaction = baseTransaction(input, classification, owner, state, route, createdAt, registry);
  if (owner.owner_path !== productOwner.owner_path) transaction.original_product_owner_path = productOwner.owner_path;
  return { broker_version: 2, action: 'OPEN', transaction, terminal: ['NO_ACTION', 'DEAD_LETTER'].includes(state), inbox_registry: registry.registry_id };
}

function finalizeTransaction(input, options = {}) {
  const tx = input.transaction || {};
  const candidate = input.candidate || {};
  assert(['REPAIR_REQUEST_READY','CANDIDATE_PREQUAL_REQUIRED','CLAIMED'].includes(tx.state), `transaction state not eligible for product repair finalization: ${tx.state || '<missing>'}`);
  assert(tx.classification === 'REPAIRABLE_SUBJECT', `transaction classification not repairable: ${tx.classification || '<missing>'}`);
  assert(tx.receipt_id && tx.qualification_id && tx.workstream_id && tx.owner_path, 'transaction lineage is incomplete');
  assert(isSha(tx.failed_subject_sha), 'transaction failed_subject_sha is invalid');
  assert(isSha(candidate.replacement_subject_sha), 'candidate replacement_subject_sha must be a 40-hex Git SHA');

  const topo = options.topology || topology();
  const currentOwner = resolveProductOwner(tx.workstream_id, topo);
  assert(currentOwner.owner_path === tx.owner_path, `OWNER_DRIFT:${tx.owner_path}->${currentOwner.owner_path}`);

  const plan = planRepair({
    receipt_id: tx.receipt_id, qualification_id: tx.qualification_id, workstream_id: tx.workstream_id,
    owner_path: tx.owner_path, failed_subject_sha: tx.failed_subject_sha,
    receipt: { result_class: 'SUBJECT_FAILURE' }, repair_attempt: tx.repair_attempt,
    max_repair_attempts: tx.max_repair_attempts, replacement_subject_sha: candidate.replacement_subject_sha,
    repair_branch: candidate.repair_branch || null, prequalification: candidate.prequalification || {},
    promotion_authorized: false, authoritative_pass: false
  });
  assert(plan.route === 'REQUEUE_CHANGED_SHA', `repair candidate did not produce changed-SHA requeue: ${plan.route}`);
  return {
    broker_version: 2, action: 'FINALIZE',
    transaction: { ...tx, state: 'A01_REQUEUE_READY', route: 'REQUEUE_CHANGED_SHA', replacement_subject_sha: plan.replacement_subject_sha, repair_branch: candidate.repair_branch || null, prequalification_evidence_pointer: plan.prequalification?.evidence_pointer || null, replacement_request: plan.replacement_request, promotion_authorized: false, authoritative_pass: false, publication_authorized: false, production_authorized: false, finalized_at: input.finalized_at || new Date().toISOString() },
    terminal: false
  };
}

function cli(argv) {
  const command = argv[2];
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw || '{}');
      const result = command === 'open' ? openTransaction(input) : command === 'finalize' ? finalizeTransaction(input) : (() => { throw new Error(`unknown command: ${command || '<missing>'}`); })();
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  });
}

if (require.main === module) cli(process.argv);
module.exports = { openTransaction, finalizeTransaction, resolveProductOwner, ownerPathForSystem };
