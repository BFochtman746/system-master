'use strict';

const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const WORKFLOW_STATUSES = new Set([
  'CREATED','PLANNING','READY','RUNNING','WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR',
  'READY_FOR_ADMISSION_HANDOFF','ADMISSION_PENDING','PAUSED','COMPLETED_NO_CHANGE','COMPLETED_ADMITTED',
  'FAILED_CLOSED','CANCELLED','SUPERSEDED'
]);
const TASK_STATUSES = new Set(['PLANNED','READY','RUNNING','COMPLETED','FAILED','BLOCKED','CANCELLED','SUPERSEDED']);
const DEPENDENCY_STATUSES = new Set(['UNKNOWN','PENDING','SATISFIED','BLOCKED','FAILED','SUPERSEDED']);
const TERMINAL_STATUSES = new Set(['COMPLETED_NO_CHANGE','COMPLETED_ADMITTED','FAILED_CLOSED','CANCELLED','SUPERSEDED']);
const FORBIDDEN_RAW_FIELDS = new Set(['manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate']);
const FORBIDDEN_CANONICAL_MUTATION_FIELDS = new Set([
  'canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref',
  'admit_canonical_manuscript','apply_revision_to_canonical'
]);
const IMMUTABLE_FIELDS = new Set([
  'workflow_schema_version','workflow_id','book_project_id','objective','target_section_ref','source_identity','input_hashes','created_at'
]);
const MUTABLE_FIELDS = new Set([
  'workflow_status','context_package_ids','planned_task_refs','task_statuses','dependency_status','specialist_output_refs',
  'evaluator_result_refs','admission_decision_ref','retry_count','evidence_receipt_refs','checkpoint_ref','started_at',
  'completed_at','failed_at','cancelled_at'
]);
const SOURCE_FIELDS = ['book_state_version','book_state_digest','canonical_manuscript_ref','manuscript_version_id','manuscript_digest_sha256'];
const SHA256 = /^[a-f0-9]{64}$/;

const STATUS_TRANSITIONS = Object.freeze({
  CREATED: ['PLANNING','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  PLANNING: ['READY','WAITING_EVIDENCE','WAITING_AUTHOR','PAUSED','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  READY: ['RUNNING','PAUSED','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  RUNNING: ['WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR','READY_FOR_ADMISSION_HANDOFF','COMPLETED_NO_CHANGE','PAUSED','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  WAITING_SPECIALIST: ['RUNNING','WAITING_EVIDENCE','PAUSED','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  WAITING_EVIDENCE: ['RUNNING','WAITING_AUTHOR','READY_FOR_ADMISSION_HANDOFF','PAUSED','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  WAITING_AUTHOR: ['RUNNING','READY_FOR_ADMISSION_HANDOFF','COMPLETED_NO_CHANGE','PAUSED','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  READY_FOR_ADMISSION_HANDOFF: ['ADMISSION_PENDING','COMPLETED_NO_CHANGE','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  ADMISSION_PENDING: ['COMPLETED_ADMITTED','FAILED_CLOSED','SUPERSEDED'],
  PAUSED: ['PLANNING','READY','RUNNING','WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR','CANCELLED','FAILED_CLOSED','SUPERSEDED'],
  COMPLETED_NO_CHANGE: [],
  COMPLETED_ADMITTED: [],
  FAILED_CLOSED: [],
  CANCELLED: [],
  SUPERSEDED: []
});

class BookWorkflowStateError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookWorkflowStateError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookWorkflowStateError(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
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
function digestProjection(state) {
  const copy = clone(state);
  delete copy.workflow_digest;
  return copy;
}
function digestWorkflowState(state) { return sha256(stableStringify(digestProjection(state))); }

function assertNoForbiddenFields(value, path = 'workflow') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}.${index}`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_MANUSCRIPT_CONTENT_FORBIDDEN', `${path}.${key}`);
    if (FORBIDDEN_CANONICAL_MUTATION_FIELDS.has(key)) fail('CANONICAL_MUTATION_FIELD_FORBIDDEN', `${path}.${key}`);
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function validateUniqueRefs(values, label) {
  if (!Array.isArray(values)) fail('REFERENCE_ARRAY_REQUIRED', label);
  const seen = new Set();
  for (const ref of values) {
    if (!nonEmpty(ref)) fail('INVALID_REFERENCE', label);
    if (seen.has(ref)) fail('DUPLICATE_REFERENCE', `${label}:${ref}`);
    seen.add(ref);
  }
}

function validateSourceIdentity(source) {
  if (!isObject(source)) fail('SOURCE_IDENTITY_REQUIRED');
  for (const field of SOURCE_FIELDS) if (!Object.prototype.hasOwnProperty.call(source, field)) fail('SOURCE_IDENTITY_FIELD_MISSING', field);
  if (!Number.isInteger(source.book_state_version) || source.book_state_version < 1) fail('INVALID_BOOK_STATE_VERSION');
  if (!SHA256.test(String(source.book_state_digest || ''))) fail('INVALID_BOOK_STATE_DIGEST');
  if (!nonEmpty(source.canonical_manuscript_ref)) fail('CANONICAL_MANUSCRIPT_REF_REQUIRED');
  if (!nonEmpty(source.manuscript_version_id)) fail('MANUSCRIPT_VERSION_ID_REQUIRED');
  if (!SHA256.test(String(source.manuscript_digest_sha256 || ''))) fail('INVALID_MANUSCRIPT_DIGEST');
}

function validateInputHashes(inputHashes) {
  if (!isObject(inputHashes)) fail('INPUT_HASHES_OBJECT_REQUIRED');
  for (const [key, value] of Object.entries(inputHashes)) {
    if (!nonEmpty(key) || !SHA256.test(String(value || ''))) fail('INVALID_INPUT_HASH', key);
  }
}

function validateStatusMap(map, allowed, label) {
  if (!isObject(map)) fail('STATUS_MAP_REQUIRED', label);
  for (const [ref, status] of Object.entries(map)) {
    if (!nonEmpty(ref)) fail('INVALID_STATUS_REF', label);
    if (!allowed.has(status)) fail('INVALID_STATUS_VALUE', `${label}:${ref}:${status}`);
  }
}

function validateWorkflowState(state) {
  if (!isObject(state)) fail('WORKFLOW_STATE_OBJECT_REQUIRED');
  assertNoForbiddenFields(state);
  const required = [
    'workflow_schema_version','workflow_id','workflow_version','workflow_digest','book_project_id','objective','target_section_ref',
    'source_identity','workflow_status','input_hashes','context_package_ids','planned_task_refs','task_statuses','dependency_status',
    'specialist_output_refs','evaluator_result_refs','admission_decision_ref','retry_count','evidence_receipt_refs','checkpoint_ref',
    'created_at','started_at','completed_at','failed_at','cancelled_at'
  ];
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(state, field)) fail('REQUIRED_FIELD_MISSING', field);
  if (state.workflow_schema_version !== SCHEMA_VERSION) fail('WORKFLOW_SCHEMA_VERSION_MISMATCH');
  if (!nonEmpty(state.workflow_id) || !nonEmpty(state.book_project_id) || !nonEmpty(state.objective) || !nonEmpty(state.target_section_ref)) fail('IDENTITY_FIELD_REQUIRED');
  if (!Number.isInteger(state.workflow_version) || state.workflow_version < 1) fail('INVALID_WORKFLOW_VERSION');
  if (!WORKFLOW_STATUSES.has(state.workflow_status)) fail('INVALID_WORKFLOW_STATUS', String(state.workflow_status));
  if (!nonEmpty(state.created_at)) fail('CREATED_AT_REQUIRED');
  validateSourceIdentity(state.source_identity);
  validateInputHashes(state.input_hashes);
  validateUniqueRefs(state.context_package_ids, 'context_package_ids');
  validateUniqueRefs(state.planned_task_refs, 'planned_task_refs');
  validateStatusMap(state.task_statuses, TASK_STATUSES, 'task_statuses');
  validateStatusMap(state.dependency_status, DEPENDENCY_STATUSES, 'dependency_status');
  validateUniqueRefs(state.specialist_output_refs, 'specialist_output_refs');
  validateUniqueRefs(state.evaluator_result_refs, 'evaluator_result_refs');
  validateUniqueRefs(state.evidence_receipt_refs, 'evidence_receipt_refs');
  if (state.admission_decision_ref !== null && !nonEmpty(state.admission_decision_ref)) fail('INVALID_ADMISSION_DECISION_REF');
  if (state.checkpoint_ref !== null && !nonEmpty(state.checkpoint_ref)) fail('INVALID_CHECKPOINT_REF');
  if (!Number.isInteger(state.retry_count) || state.retry_count < 0) fail('INVALID_RETRY_COUNT');
  for (const field of ['started_at','completed_at','failed_at','cancelled_at']) {
    if (state[field] !== null && !nonEmpty(state[field])) fail('INVALID_TIMESTAMP_FIELD', field);
  }
  if (state.workflow_status === 'COMPLETED_NO_CHANGE' && state.completed_at === null) fail('COMPLETED_AT_REQUIRED');
  if (state.workflow_status === 'COMPLETED_ADMITTED') {
    if (state.completed_at === null) fail('COMPLETED_AT_REQUIRED');
    if (state.admission_decision_ref === null) fail('ADMISSION_DECISION_REF_REQUIRED');
  }
  if (state.workflow_status === 'FAILED_CLOSED' && state.failed_at === null) fail('FAILED_AT_REQUIRED');
  if (state.workflow_status === 'CANCELLED' && state.cancelled_at === null) fail('CANCELLED_AT_REQUIRED');
  if (state.workflow_status === 'SUPERSEDED' && state.evidence_receipt_refs.length === 0) fail('SUPERSESSION_EVIDENCE_REQUIRED');
  const expectedDigest = digestWorkflowState(state);
  if (state.workflow_digest !== expectedDigest) fail('WORKFLOW_DIGEST_MISMATCH');
  return true;
}

function sealWorkflowState(state) {
  const next = clone(state);
  delete next.workflow_digest;
  next.workflow_digest = digestWorkflowState(next);
  return next;
}

function createWorkflowState(input) {
  if (!isObject(input)) fail('CREATE_INPUT_REQUIRED');
  for (const field of ['workflow_id','book_project_id','objective','target_section_ref','source_identity','input_hashes','created_at']) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) fail('CREATE_FIELD_MISSING', field);
  }
  const state = sealWorkflowState({
    workflow_schema_version: SCHEMA_VERSION,
    workflow_id: input.workflow_id,
    workflow_version: 1,
    workflow_digest: '',
    book_project_id: input.book_project_id,
    objective: input.objective,
    target_section_ref: input.target_section_ref,
    source_identity: clone(input.source_identity),
    workflow_status: 'CREATED',
    input_hashes: clone(input.input_hashes),
    context_package_ids: [],
    planned_task_refs: [],
    task_statuses: {},
    dependency_status: {},
    specialist_output_refs: [],
    evaluator_result_refs: [],
    admission_decision_ref: null,
    retry_count: 0,
    evidence_receipt_refs: [],
    checkpoint_ref: null,
    created_at: input.created_at,
    started_at: null,
    completed_at: null,
    failed_at: null,
    cancelled_at: null
  });
  validateWorkflowState(state);
  return state;
}

function assertCurrentSourceIdentity(state, currentSourceIdentity) {
  validateWorkflowState(state);
  validateSourceIdentity(currentSourceIdentity);
  for (const field of SOURCE_FIELDS) {
    if (String(state.source_identity[field]) !== String(currentSourceIdentity[field])) {
      fail('STALE_WORKFLOW_SOURCE_IDENTITY', field);
    }
  }
  return true;
}

function advanceWorkflowState(previous, patch) {
  validateWorkflowState(previous);
  if (TERMINAL_STATUSES.has(previous.workflow_status)) fail('TERMINAL_WORKFLOW_IMMUTABLE', previous.workflow_status);
  if (!isObject(patch)) fail('WORKFLOW_PATCH_REQUIRED');
  assertNoForbiddenFields(patch, 'patch');
  for (const field of Object.keys(patch)) {
    if (IMMUTABLE_FIELDS.has(field)) fail('IMMUTABLE_WORKFLOW_FIELD', field);
    if (!MUTABLE_FIELDS.has(field)) fail('UNSUPPORTED_WORKFLOW_PATCH_FIELD', field);
  }
  const nextStatus = Object.prototype.hasOwnProperty.call(patch, 'workflow_status') ? patch.workflow_status : previous.workflow_status;
  if (nextStatus !== previous.workflow_status) {
    const allowed = STATUS_TRANSITIONS[previous.workflow_status] || [];
    if (!allowed.includes(nextStatus)) fail('ILLEGAL_WORKFLOW_STATUS_TRANSITION', `${previous.workflow_status}->${nextStatus}`);
  }
  const next = clone(previous);
  for (const [field, value] of Object.entries(patch)) next[field] = clone(value);
  next.workflow_version = previous.workflow_version + 1;
  delete next.workflow_digest;
  const sealed = sealWorkflowState(next);
  validateWorkflowState(sealed);
  return sealed;
}

module.exports = {
  SCHEMA_VERSION,
  WORKFLOW_STATUSES,
  TASK_STATUSES,
  DEPENDENCY_STATUSES,
  TERMINAL_STATUSES,
  STATUS_TRANSITIONS,
  BookWorkflowStateError,
  stableStringify,
  digestWorkflowState,
  sealWorkflowState,
  validateWorkflowState,
  createWorkflowState,
  assertCurrentSourceIdentity,
  advanceWorkflowState
};
