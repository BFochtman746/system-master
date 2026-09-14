'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const durable = require('./book-workflow-durable-store');

function h(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function sourceIdentity() {
  return {
    book_state_version: 1,
    book_state_digest: h('book-state'),
    canonical_manuscript_ref: 'book://canonical/ref-001',
    manuscript_version_id: 'mv-001',
    manuscript_digest_sha256: h('manuscript-bytes-not-stored-here')
  };
}
function makeState() {
  return stateModel.createWorkflowState({
    workflow_id: 'wf-durable-001',
    book_project_id: 'book-001',
    objective: 'prove durable coordination state',
    target_section_ref: 'section://chapter-1',
    source_identity: sourceIdentity(),
    input_hashes: { 'input-ref-1': h('input-ref-1') },
    created_at: '2026-09-11T07:40:00-04:00'
  });
}
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'book-durable-store-'));
try {
  const adapterA = durable.createFileSystemAdapter(root);
  const storeA = durable.createDurableCoordinationStore(adapterA);
  const v1 = makeState();

  const first = storeA.saveWorkflow(v1);
  assert.strictEqual(first.persisted, true);
  assert.strictEqual(storeA.saveWorkflow(v1).idempotent, true);

  // Crash/reload proof: a new adapter/store instance reads the same exact sealed record.
  const storeAfterReload = durable.createDurableCoordinationStore(durable.createFileSystemAdapter(root));
  assert.deepStrictEqual(storeAfterReload.loadWorkflow(v1.workflow_id), v1);

  // Optimistic stale-write rejection and exactly-one-version advancement.
  const v2 = stateModel.advanceWorkflowState(v1, { workflow_status: 'PLANNING' });
  const writerARead = storeA.loadWorkflow(v1.workflow_id);
  const writerBRead = storeAfterReload.loadWorkflow(v1.workflow_id);
  assert.deepStrictEqual(writerARead, writerBRead);
  storeA.saveWorkflow(v2, { workflow_version: writerARead.workflow_version, workflow_digest: writerARead.workflow_digest });
  const competingV2 = stateModel.advanceWorkflowState(writerBRead, { workflow_status: 'CANCELLED', cancelled_at: '2026-09-11T07:41:00-04:00' });
  expectCode(() => storeAfterReload.saveWorkflow(competingV2, { workflow_version: writerBRead.workflow_version, workflow_digest: writerBRead.workflow_digest }), 'STALE_WORKFLOW_WRITE');
  assert.deepStrictEqual(storeAfterReload.loadWorkflow(v1.workflow_id), v2);

  // Coordination-only fence rejects raw manuscript bytes even before an adapter write.
  expectCode(() => durable.assertCoordinationOnly({ manuscript_text: 'forbidden bytes' }), 'RAW_CONTENT_PERSISTENCE_FORBIDDEN');
  expectCode(() => durable.assertCoordinationOnly({ canonical_manuscript_state: { changed: true } }), 'CANONICAL_EFFECT_PERSISTENCE_FORBIDDEN');

  // Persistence mechanics for checkpoints and receipts are exercised with injected semantic
  // validators; production defaults remain the Book checkpoint/receipt validators.
  const testValidators = {
    validateWorkflowState: stateModel.validateWorkflowState,
    validateCheckpoint(cp) { assert(cp.checkpoint_id); assert(/^[a-f0-9]{64}$/.test(cp.checkpoint_digest)); return true; },
    validateReceipt(r) { assert(r.receipt_id); assert(/^[a-f0-9]{64}$/.test(r.receipt_digest)); return true; },
    validateReceiptChain(chain) {
      assert(Array.isArray(chain));
      chain.forEach((r, i) => assert.strictEqual(r.sequence_number, i + 1));
      return true;
    },
    appendReceipt(existing, receipt) {
      if (receipt.sequence_number !== existing.length + 1) throw new Error('sequence mismatch');
      return [...existing, JSON.parse(JSON.stringify(receipt))];
    }
  };
  const testStore = durable.createDurableCoordinationStore(durable.createFileSystemAdapter(root), testValidators);
  const cp1 = { checkpoint_id: 'cp-001', checkpoint_digest: h('cp-001'), workflow_id: v2.workflow_id, workflow_digest: v2.workflow_digest, coordination_ref: 'coord://cp-001' };
  assert.strictEqual(testStore.saveCheckpoint({ checkpoint: cp1, workflow_state: v2, plan: {} }).persisted, true);
  assert.strictEqual(testStore.saveCheckpoint({ checkpoint: cp1, workflow_state: v2, plan: {} }).idempotent, true);
  expectCode(() => testStore.saveCheckpoint({ checkpoint: { ...cp1, checkpoint_digest: h('different') }, workflow_state: v2, plan: {} }), 'CHECKPOINT_ID_CONFLICT');
  assert.deepStrictEqual(durable.createDurableCoordinationStore(durable.createFileSystemAdapter(root), testValidators).loadCheckpoint('cp-001'), cp1);

  const r1 = { receipt_id: 'r-001', receipt_digest: h('r-001'), sequence_number: 1, workflow_id: v2.workflow_id, workflow_digest: v2.workflow_digest, evidence_refs: ['artifact://one'] };
  const r2 = { receipt_id: 'r-002', receipt_digest: h('r-002'), sequence_number: 2, workflow_id: v2.workflow_id, workflow_digest: v2.workflow_digest, evidence_refs: ['artifact://two'] };
  assert.strictEqual(testStore.appendEvidenceReceipt({ receipt: r1, workflow_state: v2, plan: {} }).receipt_count, 1);
  assert.strictEqual(testStore.appendEvidenceReceipt({ receipt: r1, workflow_state: v2, plan: {} }).idempotent, true);
  assert.strictEqual(testStore.appendEvidenceReceipt({ receipt: r2, workflow_state: v2, plan: {} }).receipt_count, 2);
  const reloadedReceipts = durable.createDurableCoordinationStore(durable.createFileSystemAdapter(root), testValidators).loadEvidenceReceipts(v2, {});
  assert.deepStrictEqual(reloadedReceipts, [r1, r2]);
  expectCode(() => testStore.appendEvidenceReceipt({ receipt: { ...r2, receipt_digest: h('r-002-conflict') }, workflow_state: v2, plan: {} }), 'RECEIPT_ID_CONFLICT');

  console.log(JSON.stringify({
    result: 'PASS',
    cases: 14,
    durable_reload: true,
    optimistic_stale_write_rejection: true,
    idempotent_workflow_write: true,
    idempotent_checkpoint_write: true,
    append_only_receipts: true,
    raw_manuscript_persistence_forbidden: true,
    canonical_effect_persistence_forbidden: true,
    canonical_effect_performed: false
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
