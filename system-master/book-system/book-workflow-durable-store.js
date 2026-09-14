'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const cancellation = require('./book-workflow-cancellation-resume');
const evidence = require('./book-workflow-evidence-provenance');

const STORE_SCHEMA_VERSION = 1;
const FORBIDDEN_RAW_FIELDS = new Set([
  'manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate',
  'raw_research','raw_evaluator_text','private_manuscript_text'
]);
const FORBIDDEN_EFFECT_FIELDS = new Set([
  'canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref',
  'apply_revision_to_canonical','admit_canonical_manuscript','canonical_write_allowed',
  'publication_authorized','export_freeze_allowed'
]);
const SHA256 = /^[a-f0-9]{64}$/;

class BookDurableStoreError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookDurableStoreError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookDurableStoreError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }

function assertCoordinationOnly(value, where = 'record') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertCoordinationOnly(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_CONTENT_PERSISTENCE_FORBIDDEN', `${where}.${key}`);
    if (FORBIDDEN_EFFECT_FIELDS.has(key)) fail('CANONICAL_EFFECT_PERSISTENCE_FORBIDDEN', `${where}.${key}`);
    assertCoordinationOnly(child, `${where}.${key}`);
  }
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter.read !== 'function' || typeof adapter.writeAtomic !== 'function') fail('DURABLE_ADAPTER_REQUIRED');
  return adapter;
}

function safeKey(key) {
  if (!nonEmpty(key)) fail('STORE_KEY_REQUIRED');
  return `${sha256(key)}.json`;
}

function createFileSystemAdapter(rootDir) {
  if (!nonEmpty(rootDir)) fail('STORE_ROOT_REQUIRED');
  const root = path.resolve(rootDir);
  function fileFor(key) { return path.join(root, safeKey(key)); }
  return Object.freeze({
    read(key) {
      const file = fileFor(key);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },
    writeAtomic(key, value) {
      assertCoordinationOnly(value, 'adapter_value');
      fs.mkdirSync(root, { recursive: true });
      const file = fileFor(key);
      const temp = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
      const bytes = `${stableStringify(value)}\n`;
      try {
        fs.writeFileSync(temp, bytes, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        const fd = fs.openSync(temp, 'r');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(temp, file);
        const dirFd = fs.openSync(root, 'r');
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
      return { key, byte_length: Buffer.byteLength(bytes, 'utf8'), content_sha256: sha256(bytes) };
    }
  });
}

function createDurableCoordinationStore(adapter, customValidators = {}) {
  validateAdapter(adapter);
  const validators = {
    validateWorkflowState: customValidators.validateWorkflowState || stateModel.validateWorkflowState,
    validateCheckpoint: customValidators.validateCheckpoint || cancellation.validateCheckpoint,
    validateReceipt: customValidators.validateReceipt || evidence.validateReceipt,
    validateReceiptChain: customValidators.validateReceiptChain || evidence.validateChain,
    appendReceipt: customValidators.appendReceipt || evidence.appendReceipt
  };

  function workflowKey(id) { return `book-workflow-state:${id}`; }
  function checkpointKey(id) { return `book-workflow-checkpoint:${id}`; }
  function receiptKey(workflowId, workflowDigest) { return `book-workflow-receipts:${workflowId}:${workflowDigest}`; }

  function loadWorkflow(workflowId) {
    const envelope = adapter.read(workflowKey(workflowId));
    if (envelope === null) return null;
    if (envelope.store_schema_version !== STORE_SCHEMA_VERSION || envelope.record_type !== 'WORKFLOW_STATE') fail('WORKFLOW_STORE_ENVELOPE_INVALID', workflowId);
    validators.validateWorkflowState(envelope.record);
    assertCoordinationOnly(envelope.record, 'workflow_state');
    if (envelope.record.workflow_id !== workflowId || envelope.record.workflow_digest !== envelope.record_digest) fail('WORKFLOW_STORE_BINDING_MISMATCH', workflowId);
    return clone(envelope.record);
  }

  function saveWorkflow(workflowState, expectedCurrent = null) {
    validators.validateWorkflowState(workflowState);
    assertCoordinationOnly(workflowState, 'workflow_state');
    const key = workflowKey(workflowState.workflow_id);
    const currentEnvelope = adapter.read(key);
    if (currentEnvelope === null) {
      if (workflowState.workflow_version !== 1) fail('INITIAL_WORKFLOW_VERSION_MUST_BE_ONE');
      if (expectedCurrent !== null) fail('INITIAL_WORKFLOW_EXPECTATION_MUST_BE_NULL');
    } else {
      const current = loadWorkflow(workflowState.workflow_id);
      if (current.workflow_version === workflowState.workflow_version && current.workflow_digest === workflowState.workflow_digest) {
        return { persisted: false, idempotent: true, workflow_version: current.workflow_version, workflow_digest: current.workflow_digest };
      }
      if (!isObject(expectedCurrent) || !Number.isInteger(expectedCurrent.workflow_version) || !SHA256.test(String(expectedCurrent.workflow_digest || ''))) fail('STALE_WRITE_EXPECTATION_REQUIRED');
      if (current.workflow_version !== expectedCurrent.workflow_version || current.workflow_digest !== expectedCurrent.workflow_digest) fail('STALE_WORKFLOW_WRITE');
      if (workflowState.workflow_version !== current.workflow_version + 1) fail('WORKFLOW_VERSION_MUST_ADVANCE_BY_ONE');
    }
    const envelope = {
      store_schema_version: STORE_SCHEMA_VERSION,
      record_type: 'WORKFLOW_STATE',
      record_id: workflowState.workflow_id,
      record_version: workflowState.workflow_version,
      record_digest: workflowState.workflow_digest,
      canonical_effect_allowed: false,
      record: clone(workflowState)
    };
    adapter.writeAtomic(key, envelope);
    return { persisted: true, idempotent: false, workflow_version: workflowState.workflow_version, workflow_digest: workflowState.workflow_digest };
  }

  function saveCheckpoint({ checkpoint, workflow_state: workflowState, plan, routing_registry: routingRegistry, service_registry: serviceRegistry }) {
    if (!isObject(checkpoint) || !nonEmpty(checkpoint.checkpoint_id) || !SHA256.test(String(checkpoint.checkpoint_digest || ''))) fail('CHECKPOINT_IDENTITY_INVALID');
    validators.validateCheckpoint(checkpoint, workflowState, plan, routingRegistry, serviceRegistry);
    assertCoordinationOnly(checkpoint, 'checkpoint');
    const key = checkpointKey(checkpoint.checkpoint_id);
    const existing = adapter.read(key);
    if (existing !== null) {
      if (existing.record_digest === checkpoint.checkpoint_digest && stableStringify(existing.record) === stableStringify(checkpoint)) return { persisted: false, idempotent: true, checkpoint_digest: checkpoint.checkpoint_digest };
      fail('CHECKPOINT_ID_CONFLICT', checkpoint.checkpoint_id);
    }
    adapter.writeAtomic(key, {
      store_schema_version: STORE_SCHEMA_VERSION,
      record_type: 'CHECKPOINT',
      record_id: checkpoint.checkpoint_id,
      record_digest: checkpoint.checkpoint_digest,
      canonical_effect_allowed: false,
      record: clone(checkpoint)
    });
    return { persisted: true, idempotent: false, checkpoint_digest: checkpoint.checkpoint_digest };
  }

  function loadCheckpoint(checkpointId) {
    const envelope = adapter.read(checkpointKey(checkpointId));
    if (envelope === null) return null;
    if (envelope.store_schema_version !== STORE_SCHEMA_VERSION || envelope.record_type !== 'CHECKPOINT' || envelope.record_id !== checkpointId) fail('CHECKPOINT_STORE_ENVELOPE_INVALID', checkpointId);
    assertCoordinationOnly(envelope.record, 'checkpoint');
    if (envelope.record.checkpoint_digest !== envelope.record_digest) fail('CHECKPOINT_STORE_DIGEST_BINDING_MISMATCH', checkpointId);
    return clone(envelope.record);
  }

  function appendEvidenceReceipt({ receipt, workflow_state: workflowState, plan, routing_registry: routingRegistry, service_registry: serviceRegistry }) {
    validators.validateReceipt(receipt, workflowState, plan, routingRegistry, serviceRegistry);
    assertCoordinationOnly(receipt, 'receipt');
    const key = receiptKey(workflowState.workflow_id, workflowState.workflow_digest);
    const existingEnvelope = adapter.read(key);
    const existing = existingEnvelope === null ? [] : existingEnvelope.records;
    if (!Array.isArray(existing)) fail('RECEIPT_STORE_ENVELOPE_INVALID');
    validators.validateReceiptChain(existing, workflowState, plan, routingRegistry, serviceRegistry);
    if (existing.some(r => r.receipt_id === receipt.receipt_id)) {
      const prior = existing.find(r => r.receipt_id === receipt.receipt_id);
      if (prior.receipt_digest === receipt.receipt_digest && stableStringify(prior) === stableStringify(receipt)) return { persisted: false, idempotent: true, receipt_count: existing.length, terminal_receipt_digest: prior.receipt_digest };
      fail('RECEIPT_ID_CONFLICT', receipt.receipt_id);
    }
    const next = validators.appendReceipt(existing, receipt, workflowState, plan, routingRegistry, serviceRegistry);
    adapter.writeAtomic(key, {
      store_schema_version: STORE_SCHEMA_VERSION,
      record_type: 'RECEIPT_CHAIN',
      record_id: `${workflowState.workflow_id}:${workflowState.workflow_digest}`,
      record_digest: sha256(stableStringify(next.map(r => r.receipt_digest))),
      canonical_effect_allowed: false,
      records: clone(next)
    });
    return { persisted: true, idempotent: false, receipt_count: next.length, terminal_receipt_digest: receipt.receipt_digest };
  }

  function loadEvidenceReceipts(workflowState, plan, routingRegistry, serviceRegistry) {
    validators.validateWorkflowState(workflowState);
    const envelope = adapter.read(receiptKey(workflowState.workflow_id, workflowState.workflow_digest));
    const records = envelope === null ? [] : envelope.records;
    validators.validateReceiptChain(records, workflowState, plan, routingRegistry, serviceRegistry);
    records.forEach((r, i) => assertCoordinationOnly(r, `receipt.${i}`));
    return clone(records);
  }

  return Object.freeze({ loadWorkflow, saveWorkflow, saveCheckpoint, loadCheckpoint, appendEvidenceReceipt, loadEvidenceReceipts });
}

module.exports = {
  STORE_SCHEMA_VERSION,
  BookDurableStoreError,
  stableStringify,
  assertCoordinationOnly,
  createFileSystemAdapter,
  createDurableCoordinationStore
};
