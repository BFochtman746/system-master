'use strict';

const fs = require('fs');
const path = require('path');
const { openTransaction } = require('./a01-repair-broker');
const ledger = require('./a01-repair-ledger');

const root = path.resolve(__dirname, '..', '..');
const TRANSACTION_ID = 'A01-REPAIR-001C-LIVE-PROOF-001';
const ROOT_SEED_SHA = '49dac6aa75a3b617092c0a20c66fa692ee04f5a2';
const REPLACEMENT_SHA = String(process.env.A01_001C_REPLACEMENT_SUBJECT_SHA || '').trim().toLowerCase();
const PREQUAL_POINTER = String(process.env.A01_001C_PREQUAL_EVIDENCE || '').trim();
const FIXTURE_PATH = 'governance/repair/proof/A01-CLOSED-LOOP-REPAIR-001C-LIVE-PROOF-FIXTURE-001.json';

function assert(condition, message) { if (!condition) throw new Error(message); }
function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }
function writeJson(rel, value) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, 2) + '\n');
}

assert(isSha(ROOT_SEED_SHA), 'synthetic root seed SHA invalid');
assert(isSha(REPLACEMENT_SHA), 'A01_001C_REPLACEMENT_SUBJECT_SHA must be a 40-hex SHA');
assert(REPLACEMENT_SHA !== ROOT_SEED_SHA, 'replacement subject must differ from synthetic root seed');
assert(PREQUAL_POINTER, 'A01_001C_PREQUAL_EVIDENCE is required');

const active = ledger.findTransaction(TRANSACTION_ID);
if (active) {
  const prepared = ledger.prepareRerun({ transaction_id: TRANSACTION_ID });
  assert(prepared.subject_sha === REPLACEMENT_SHA, 'existing live-proof transaction points to a different replacement subject');
  console.log(`A01_001C_LIVE_PROOF_FIXTURE_ALREADY_READY transaction_id=${TRANSACTION_ID} subject=${REPLACEMENT_SHA}`);
  process.exit(0);
}

const opened = openTransaction({
  transaction_id: TRANSACTION_ID,
  receipt_id: 'SYNTHETIC-CONTROL-SEED-001-NOT-AUTHORITATIVE-A01-RECEIPT',
  qualification_id: 'A01-CLOSED-LOOP-REPAIR-SELFTEST',
  workstream_id: 'SYSTEM-MASTER',
  failed_subject_sha: ROOT_SEED_SHA,
  receipt: { result_class: 'SUBJECT_FAILURE' },
  repair_attempt: 0,
  max_repair_attempts: 1,
  evidence_pointer: 'synthetic-control-fixture:A01-CLOSED-LOOP-REPAIR-001C:root-seed-only',
  created_at: new Date().toISOString()
});
opened.transaction.fixture_kind = 'SYNTHETIC_CONTROL_PROOF_ONLY';
opened.transaction.fixture_authority = 'ZERO_PRODUCT_FAILURE_AUTHORITY';
ledger.ingest(opened);

const finalized = ledger.finalize({
  transaction_id: TRANSACTION_ID,
  candidate: {
    replacement_subject_sha: REPLACEMENT_SHA,
    repair_branch: 'refs/heads/main',
    prequalification: {
      result: 'PASS',
      subject_sha: REPLACEMENT_SHA,
      qualification_id: 'A01-CLOSED-LOOP-REPAIR-SELFTEST',
      workstream_id: 'SYSTEM-MASTER',
      evidence_pointer: PREQUAL_POINTER
    }
  },
  finalized_at: new Date().toISOString()
});

writeJson(FIXTURE_PATH, {
  proof_id: 'A01-CLOSED-LOOP-REPAIR-001C-LIVE-PROOF-001',
  standing: 'SYNTHETIC_CONTROL_FIXTURE__A01_REQUEUE_READY',
  transaction_id: TRANSACTION_ID,
  authority_boundary: 'CONTROL_MECHANICS_ONLY',
  synthetic_root_seed: {
    receipt_id: opened.transaction.receipt_id,
    failed_subject_sha: ROOT_SEED_SHA,
    authoritative_a01_failure: false,
    product_failure_claimed: false,
    note: 'This seed exists only to exercise same-transaction rerun mechanics. It is not an A-01 failure receipt and must never be cited as product failure evidence.'
  },
  replacement_subject_sha: REPLACEMENT_SHA,
  replacement_qualification_id: 'A01-CLOSED-LOOP-REPAIR-SELFTEST',
  replacement_workstream_id: 'SYSTEM-MASTER',
  deterministic_prequalification_evidence: PREQUAL_POINTER,
  expected_live_proof: [
    'canonical A-01 Repair Rerun resolves this exact transaction',
    'canonical gateway validates transaction/qualification/workstream/subject/ref binding',
    'A-01 Windows/X64 executes exact replacement subject',
    'repair-lineage.json is emitted with the A-01 evidence',
    'workflow-run adjudicator attaches the actual rerun result to this same transaction',
    'authoritative PASS closes this transaction without rewriting the synthetic root seed; other outcomes remain truthfully routed'
  ],
  forbidden_claims: [
    'Do not call the synthetic root seed an authoritative A-01 failure.',
    'Do not infer any product repair quality from this fixture.',
    'Do not transfer A-01 PASS beyond the exact replacement subject and registered selftest boundary.',
    'Do not infer promotion, publication, production, human, author, private-data, native-platform or external authority.'
  ],
  generated_at: new Date().toISOString(),
  finalize_result: finalized
});

const prepared = ledger.prepareRerun({ transaction_id: TRANSACTION_ID });
assert(prepared.transaction_state === 'A01_REQUEUE_READY', 'live proof fixture did not reach A01_REQUEUE_READY');
assert(prepared.subject_sha === REPLACEMENT_SHA, 'live proof fixture replacement subject mismatch');
console.log(`A01_001C_LIVE_PROOF_FIXTURE_READY transaction_id=${TRANSACTION_ID} subject=${REPLACEMENT_SHA}`);
