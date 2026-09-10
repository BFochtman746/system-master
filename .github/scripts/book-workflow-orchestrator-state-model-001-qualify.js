'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const outDir = process.env.RUNNER_TEMP || root;
const model = require(path.join(root, 'system-master/book-system/book-workflow-state-model.js'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/book-prose-integration/orchestrator/BOOK-WORKFLOW-ORCHESTRATOR-WORKFLOW-STATE-MODEL-001.json'), 'utf8'));

function fail(code, detail = '') { const e = new Error(detail ? `${code}:${detail}` : code); e.code = code; throw e; }
function assert(v, code, detail = '') { if (!v) fail(code, detail); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sha(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }

const baseSource = {
  book_state_version: 12,
  book_state_digest: 'a'.repeat(64),
  canonical_manuscript_ref: 'MANUSCRIPT:AGLO-001:V12',
  manuscript_version_id: 'V12',
  manuscript_digest_sha256: 'b'.repeat(64)
};

function createInput(suffix = '001') {
  return {
    workflow_id: `BOOK-WF-${suffix}`,
    book_project_id: 'BOOK-PROJECT-001',
    objective: 'Improve one bounded passage while preserving Book authority.',
    target_section_ref: 'CHAPTER:CH-01:V12',
    source_identity: clone(baseSource),
    input_hashes: {
      objective_sha256: 'c'.repeat(64),
      target_sha256: 'd'.repeat(64)
    },
    created_at: '2026-09-10T15:10:00Z'
  };
}

function expectCode(id, fn, prefixes) {
  try { fn(); }
  catch (e) {
    const code = String(e && (e.code || e.message) || 'UNKNOWN');
    if (prefixes.some(p => code.startsWith(p))) return { case_id: id, result: 'PASS', observed: code };
    throw new Error(`${id}:WRONG_FAILURE:${code}`);
  }
  throw new Error(`${id}:EXPECTED_FAILURE_NOT_THROWN`);
}

const results = [];
let assertions = 0;
function pass(id, fn) { fn(); assertions += 1; results.push({ case_id: id, result: 'PASS' }); }
function reject(id, fn, prefixes) { const r = expectCode(id, fn, prefixes); assertions += 1; results.push(r); }

pass('OWS-001-CREATE-VALID', () => {
  const s = model.createWorkflowState(createInput('001'));
  assert(s.workflow_status === 'CREATED', 'CREATE_STATUS_MISMATCH');
  assert(s.workflow_version === 1, 'CREATE_VERSION_MISMATCH');
  assert(model.validateWorkflowState(s) === true, 'CREATE_NOT_VALID');
});

pass('OWS-002-DETERMINISTIC-DIGEST', () => {
  const a = model.createWorkflowState(createInput('002'));
  const b = model.createWorkflowState(createInput('002'));
  assert(a.workflow_digest === b.workflow_digest, 'NONDETERMINISTIC_DIGEST');
  assert(sha(a) === sha(b), 'NONDETERMINISTIC_STATE');
});

pass('OWS-003-EXACT-SOURCE-CURRENT', () => {
  const s = model.createWorkflowState(createInput('003'));
  assert(model.assertCurrentSourceIdentity(s, clone(baseSource)) === true, 'CURRENT_SOURCE_REJECTED');
});

reject('OWS-004-STALE-BOOK-STATE-REJECT', () => {
  const s = model.createWorkflowState(createInput('004'));
  const current = clone(baseSource); current.book_state_version = 13;
  model.assertCurrentSourceIdentity(s, current);
}, ['STALE_WORKFLOW_SOURCE_IDENTITY']);

reject('OWS-005-STALE-MANUSCRIPT-DIGEST-REJECT', () => {
  const s = model.createWorkflowState(createInput('005'));
  const current = clone(baseSource); current.manuscript_digest_sha256 = 'e'.repeat(64);
  model.assertCurrentSourceIdentity(s, current);
}, ['STALE_WORKFLOW_SOURCE_IDENTITY']);

reject('OWS-006-RAW-MANUSCRIPT-FIELD-REJECT', () => {
  const s = model.createWorkflowState(createInput('006'));
  s.manuscript_text = 'forbidden raw prose';
  s.workflow_digest = model.digestWorkflowState(s);
  model.validateWorkflowState(s);
}, ['RAW_MANUSCRIPT_CONTENT_FORBIDDEN']);

reject('OWS-007-NESTED-CANDIDATE-TEXT-REJECT', () => {
  const s = model.createWorkflowState(createInput('007'));
  s.task_statuses = { T1: 'PLANNED' };
  s.evidence_receipt_refs = ['E1'];
  s.metadata = { candidate_text: 'forbidden' };
  s.workflow_digest = model.digestWorkflowState(s);
  model.validateWorkflowState(s);
}, ['RAW_MANUSCRIPT_CONTENT_FORBIDDEN']);

reject('OWS-008-CANONICAL-MUTATION-FIELD-REJECT', () => {
  const s = model.createWorkflowState(createInput('008'));
  s.apply_revision_to_canonical = true;
  s.workflow_digest = model.digestWorkflowState(s);
  model.validateWorkflowState(s);
}, ['CANONICAL_MUTATION_FIELD_FORBIDDEN']);

reject('OWS-009-IMMUTABLE-SOURCE-PATCH-REJECT', () => {
  const s = model.createWorkflowState(createInput('009'));
  model.advanceWorkflowState(s, { source_identity: { ...baseSource, manuscript_version_id: 'V13' } });
}, ['IMMUTABLE_WORKFLOW_FIELD']);

pass('OWS-010-LEGAL-TRANSITIONS', () => {
  let s = model.createWorkflowState(createInput('010'));
  s = model.advanceWorkflowState(s, { workflow_status: 'PLANNING' });
  s = model.advanceWorkflowState(s, { workflow_status: 'READY' });
  s = model.advanceWorkflowState(s, { workflow_status: 'RUNNING', started_at: '2026-09-10T15:11:00Z' });
  assert(s.workflow_status === 'RUNNING', 'LEGAL_TRANSITION_FAILED');
  assert(s.workflow_version === 4, 'VERSION_INCREMENT_FAILED');
});

reject('OWS-011-ILLEGAL-TERMINAL-JUMP-REJECT', () => {
  const s = model.createWorkflowState(createInput('011'));
  model.advanceWorkflowState(s, { workflow_status: 'COMPLETED_ADMITTED', completed_at: '2026-09-10T15:12:00Z', admission_decision_ref: 'ADM-1' });
}, ['ILLEGAL_WORKFLOW_STATUS_TRANSITION']);

reject('OWS-012-ADMITTED-WITHOUT-ADMISSION-REF-REJECT', () => {
  let s = model.createWorkflowState(createInput('012'));
  s = model.advanceWorkflowState(s, { workflow_status: 'PLANNING' });
  s = model.advanceWorkflowState(s, { workflow_status: 'READY' });
  s = model.advanceWorkflowState(s, { workflow_status: 'RUNNING', started_at: '2026-09-10T15:11:00Z' });
  s = model.advanceWorkflowState(s, { workflow_status: 'READY_FOR_ADMISSION_HANDOFF' });
  s = model.advanceWorkflowState(s, { workflow_status: 'ADMISSION_PENDING' });
  model.advanceWorkflowState(s, { workflow_status: 'COMPLETED_ADMITTED', completed_at: '2026-09-10T15:12:00Z' });
}, ['ADMISSION_DECISION_REF_REQUIRED']);

reject('OWS-013-FAILED-WITHOUT-TIMESTAMP-REJECT', () => {
  const s = model.createWorkflowState(createInput('013'));
  model.advanceWorkflowState(s, { workflow_status: 'FAILED_CLOSED' });
}, ['FAILED_AT_REQUIRED']);

reject('OWS-014-CANCELLED-WITHOUT-TIMESTAMP-REJECT', () => {
  const s = model.createWorkflowState(createInput('014'));
  model.advanceWorkflowState(s, { workflow_status: 'CANCELLED' });
}, ['CANCELLED_AT_REQUIRED']);

reject('OWS-015-SUPERSEDED-WITHOUT-EVIDENCE-REJECT', () => {
  const s = model.createWorkflowState(createInput('015'));
  model.advanceWorkflowState(s, { workflow_status: 'SUPERSEDED' });
}, ['SUPERSESSION_EVIDENCE_REQUIRED']);

pass('OWS-016-COMPLETED-NO-CHANGE', () => {
  let s = model.createWorkflowState(createInput('016'));
  s = model.advanceWorkflowState(s, { workflow_status: 'PLANNING' });
  s = model.advanceWorkflowState(s, { workflow_status: 'READY' });
  s = model.advanceWorkflowState(s, { workflow_status: 'RUNNING', started_at: '2026-09-10T15:11:00Z' });
  s = model.advanceWorkflowState(s, { workflow_status: 'COMPLETED_NO_CHANGE', completed_at: '2026-09-10T15:12:00Z', evidence_receipt_refs: ['PROSE-LEVEL0-001'] });
  assert(s.admission_decision_ref === null, 'NO_CHANGE_SHOULD_NOT_REQUIRE_ADMISSION');
});

reject('OWS-017-TERMINAL-IMMUTABLE', () => {
  let s = model.createWorkflowState(createInput('017'));
  s = model.advanceWorkflowState(s, { workflow_status: 'CANCELLED', cancelled_at: '2026-09-10T15:12:00Z' });
  model.advanceWorkflowState(s, { workflow_status: 'PLANNING' });
}, ['TERMINAL_WORKFLOW_IMMUTABLE']);

reject('OWS-018-DUPLICATE-REFERENCE-REJECT', () => {
  const s = model.createWorkflowState(createInput('018'));
  const x = clone(s); x.context_package_ids = ['CTX-1','CTX-1']; x.workflow_digest = model.digestWorkflowState(x);
  model.validateWorkflowState(x);
}, ['DUPLICATE_REFERENCE']);

reject('OWS-019-BAD-INPUT-HASH-REJECT', () => {
  const input = createInput('019'); input.input_hashes.objective_sha256 = 'not-a-sha';
  model.createWorkflowState(input);
}, ['INVALID_INPUT_HASH']);

reject('OWS-020-NEGATIVE-RETRY-REJECT', () => {
  const s = model.createWorkflowState(createInput('020'));
  model.advanceWorkflowState(s, { retry_count: -1 });
}, ['INVALID_RETRY_COUNT']);

reject('OWS-021-DIGEST-TAMPER-REJECT', () => {
  const s = model.createWorkflowState(createInput('021'));
  s.workflow_status = 'PLANNING';
  model.validateWorkflowState(s);
}, ['WORKFLOW_DIGEST_MISMATCH']);

pass('OWS-022-CONTRACT-RUNTIME-STATUS-CONSISTENCY', () => {
  const runtimeStatuses = [...model.WORKFLOW_STATUSES].sort();
  const contractStatuses = [...contract.workflow_statuses].sort();
  assert(JSON.stringify(runtimeStatuses) === JSON.stringify(contractStatuses), 'WORKFLOW_STATUS_CONTRACT_DRIFT');
  assert(contract.required_next_packet_on_pass === 'BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001', 'NEXT_PACKET_CONTRACT_MISMATCH');
});

const summary = {
  qualification_id: 'BOOK-WORKFLOW-ORCHESTRATOR-WORKFLOW-STATE-MODEL-001-QUALIFICATION',
  result: results.length === 22 && results.every(x => x.result === 'PASS') ? 'PASS' : 'FAIL',
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  fixture_class: 'SYNTHETIC_NON_PRIVATE_COORDINATION_STATE',
  planned_cases: 22,
  passed_cases: results.filter(x => x.result === 'PASS').length,
  assertions,
  source_identity_bound: true,
  raw_manuscript_persisted: false,
  canonical_manuscript_mutated: false,
  prose_runtime_mutated: false,
  fresh_blind_scoring_executed: false,
  a01_pass_claimed: false,
  native_publication_production_claimed: false,
  results
};

fs.writeFileSync(path.join(outDir, 'book-workflow-orchestrator-state-model-001-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.result !== 'PASS') process.exit(1);
