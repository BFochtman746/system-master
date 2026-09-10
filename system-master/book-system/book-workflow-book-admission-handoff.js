'use strict';

const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');
const evidence = require('./book-workflow-evidence-provenance');
const contentAdmission = require('./content-object-admission');

const HANDOFF_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_REF = /^[A-Za-z0-9._:/#@-]{1,256}$/;
const TARGET_OWNER_PATH = 'SYSTEM_MASTER/BOOK';
const TARGET_MODULE = 'system-master/book-system/content-object-admission.js';
const TARGET_ENTRYPOINT = 'commitContentAdmission';
const REQUIRED_ACTOR_CLASS = 'PARENT_SYSTEM';
const CANDIDATE_CAPABILITY = 'PROSE.GENERATE_REVISION_CANDIDATE';
const CANDIDATE_AUTHORITY_DOMAIN = 'LITERARY_CANDIDATE_GENERATION';
const ALLOWED_PREPARE_FIELDS = new Set([
  'handoff_id','workflow_state','plan','current_source_identity','receipts','admission_task_id',
  'candidate_artifact_ref','candidate_digest_sha256','created_at'
]);
const FORBIDDEN_RAW_FIELDS = new Set([
  'manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate',
  'raw_research','raw_evaluator_text','private_manuscript_text','candidate_bytes','manuscript_bytes'
]);
const FORBIDDEN_EFFECT_FIELDS = new Set([
  'operations','actor_class','canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref',
  'apply_revision_to_canonical','admit_canonical_manuscript','canonical_write_allowed','publication_authorized',
  'export_freeze_allowed','execute_admission','commit_admission'
]);

class BookWorkflowAdmissionHandoffError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookWorkflowAdmissionHandoffError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookWorkflowAdmissionHandoffError(code, detail); }
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
function handoffDigest(handoff) {
  const copy = clone(handoff);
  delete copy.handoff_digest;
  return sha256(stableStringify(copy));
}
function sameSource(a, b) { return stableStringify(a) === stableStringify(b); }

function assertNoForbiddenFields(value, where = 'handoff') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoForbiddenFields(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_CONTENT_FORBIDDEN', `${where}.${key}`);
    if (FORBIDDEN_EFFECT_FIELDS.has(key)) fail('ADMISSION_EXECUTION_FIELD_FORBIDDEN', `${where}.${key}`);
    assertNoForbiddenFields(child, `${where}.${key}`);
  }
}

function validateSafeRef(v, label) {
  if (!nonEmpty(v) || !SAFE_REF.test(v)) fail('INVALID_REFERENCE', label);
}

function validatePrepareInput(input) {
  if (!isObject(input)) fail('HANDOFF_INPUT_REQUIRED');
  for (const key of Object.keys(input)) if (!ALLOWED_PREPARE_FIELDS.has(key)) fail('UNEXPECTED_HANDOFF_INPUT_FIELD', key);
  assertNoForbiddenFields(input, 'handoff_input');
  for (const field of ALLOWED_PREPARE_FIELDS) if (!Object.prototype.hasOwnProperty.call(input, field)) fail('HANDOFF_INPUT_FIELD_MISSING', field);
  validateSafeRef(input.handoff_id, 'handoff_id');
  validateSafeRef(input.admission_task_id, 'admission_task_id');
  validateSafeRef(input.candidate_artifact_ref, 'candidate_artifact_ref');
  if (!SHA256.test(String(input.candidate_digest_sha256 || ''))) fail('INVALID_CANDIDATE_DIGEST');
  if (!nonEmpty(input.created_at)) fail('CREATED_AT_REQUIRED');
  if (!Array.isArray(input.receipts) || input.receipts.length === 0) fail('EVIDENCE_CHAIN_REQUIRED');
}

function assertAdmissionTargetAvailable() {
  if (!contentAdmission || typeof contentAdmission.commitContentAdmission !== 'function') fail('BOOK_ADMISSION_ENTRYPOINT_UNAVAILABLE');
  return true;
}

function taskMap(plan) { return new Map(plan.tasks.map(task => [task.task_id, task])); }

function requiredAncestors(plan, taskId) {
  const byId = taskMap(plan);
  const target = byId.get(taskId);
  if (!target) fail('ADMISSION_TASK_NOT_FOUND', taskId);
  const seen = new Set();
  const stack = [...target.required_dependency_ids];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    const task = byId.get(id);
    if (!task) fail('MISSING_REQUIRED_ANCESTOR', id);
    seen.add(id);
    for (const parent of task.required_dependency_ids) stack.push(parent);
  }
  return [...seen].sort();
}

function assertAdmissionPlan(workflowState, plan, admissionTaskId, routingRegistry) {
  stateModel.validateWorkflowState(workflowState);
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  if (workflowState.workflow_status !== 'READY_FOR_ADMISSION_HANDOFF') fail('WORKFLOW_NOT_READY_FOR_ADMISSION_HANDOFF', workflowState.workflow_status);
  const admissionTasks = plan.tasks.filter(t => t.task_class === 'BOOK_ADMISSION_HANDOFF');
  if (admissionTasks.length !== 1) fail('SINGLE_BOOK_ADMISSION_HANDOFF_REQUIRED', String(admissionTasks.length));
  const admission = admissionTasks[0];
  if (admission.task_id !== admissionTaskId) fail('ADMISSION_TASK_ID_MISMATCH');
  if (admission.capability_id !== 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION' || admission.required_authority_domain !== 'CANONICAL_MANUSCRIPT_MUTATION') {
    fail('ADMISSION_TASK_AUTHORITY_INVALID');
  }
  if (workflowState.task_statuses[admission.task_id] !== 'READY') fail('ADMISSION_TASK_NOT_READY', String(workflowState.task_statuses[admission.task_id]));
  const ancestors = requiredAncestors(plan, admission.task_id);
  for (const id of ancestors) {
    const status = workflowState.task_statuses[id];
    if (status !== 'COMPLETED') fail('REQUIRED_ANCESTOR_NOT_COMPLETED', `${id}:${String(status)}`);
  }
  return { admission, ancestors };
}

function receiptsForTask(receipts, taskId, receiptClass) {
  return receipts.filter(r => r.task_id === taskId && r.receipt_class === receiptClass);
}

function qualifyPredecessorEvidence(plan, workflowState, receipts, ancestors) {
  const byId = taskMap(plan);
  const requiredReceipts = [];
  const authorDecisionRefs = [];
  for (const id of ancestors) {
    const task = byId.get(id);
    if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY') fail('DECLARED_BLOCKED_CAPABILITY_CANNOT_SATISFY_ADMISSION', id);
    if (task.task_class === 'BOOK_ADMISSION_HANDOFF') fail('NESTED_ADMISSION_HANDOFF_FORBIDDEN', id);
    if (task.task_class === 'SPECIALIST_SERVICE_TASK') {
      const matches = receiptsForTask(receipts, id, 'TASK_RESULT_OBSERVED');
      if (matches.length === 0) fail('REQUIRED_SPECIALIST_EVIDENCE_MISSING', id);
      requiredReceipts.push(...matches);
      continue;
    }
    if (task.task_class === 'AUTHORITY_WAIT') {
      const matches = receiptsForTask(receipts, id, 'AUTHOR_DECISION_REFERENCE_OBSERVED');
      if (matches.length !== 1) fail('AUTHOR_DECISION_EVIDENCE_AMBIGUOUS_OR_MISSING', `${id}:${matches.length}`);
      if (!Array.isArray(matches[0].decision_refs) || matches[0].decision_refs.length === 0) fail('AUTHOR_DECISION_REFERENCE_MISSING', id);
      requiredReceipts.push(matches[0]);
      authorDecisionRefs.push(...matches[0].decision_refs);
      continue;
    }
    fail('UNSUPPORTED_REQUIRED_PREDECESSOR_CLASS', `${id}:${task.task_class}`);
  }
  requiredReceipts.sort((a, b) => a.sequence_number - b.sequence_number);
  return {
    requiredReceipts,
    authorDecisionRefs: [...new Set(authorDecisionRefs)].sort()
  };
}

function findCandidateReceipt(plan, workflowState, receipts, ancestors, candidateArtifactRef) {
  if (!workflowState.specialist_output_refs.includes(candidateArtifactRef)) fail('CANDIDATE_NOT_IN_WORKFLOW_OUTPUT_REFS');
  const ancestorSet = new Set(ancestors);
  const candidates = receipts.filter(r => {
    if (r.receipt_class !== 'TASK_RESULT_OBSERVED' || !ancestorSet.has(r.task_id)) return false;
    const task = plan.tasks.find(t => t.task_id === r.task_id);
    return !!task && task.task_class === 'SPECIALIST_SERVICE_TASK' &&
      task.capability_id === CANDIDATE_CAPABILITY && task.required_authority_domain === CANDIDATE_AUTHORITY_DOMAIN &&
      Array.isArray(r.output_refs) && r.output_refs.includes(candidateArtifactRef);
  });
  if (candidates.length !== 1) fail('CANDIDATE_PROVENANCE_AMBIGUOUS_OR_MISSING', String(candidates.length));
  return candidates[0];
}

function prepareAdmissionHandoff(input, routingRegistry = routing.loadDefaultRegistry()) {
  validatePrepareInput(input);
  assertAdmissionTargetAvailable();
  const workflowState = input.workflow_state;
  const plan = input.plan;
  stateModel.assertCurrentSourceIdentity(workflowState, input.current_source_identity);
  if (!sameSource(workflowState.source_identity, plan.source_identity)) fail('PLAN_SOURCE_IDENTITY_MISMATCH');
  const { ancestors } = assertAdmissionPlan(workflowState, plan, input.admission_task_id, routingRegistry);
  evidence.validateChain(input.receipts, workflowState, plan, routingRegistry);
  const { requiredReceipts, authorDecisionRefs } = qualifyPredecessorEvidence(plan, workflowState, input.receipts, ancestors);
  const candidateReceipt = findCandidateReceipt(plan, workflowState, input.receipts, ancestors, input.candidate_artifact_ref);
  const receiptIds = requiredReceipts.map(r => r.receipt_id);
  const receiptDigests = requiredReceipts.map(r => r.receipt_digest);
  if (!receiptIds.includes(candidateReceipt.receipt_id)) fail('CANDIDATE_RECEIPT_NOT_REQUIRED_EVIDENCE');

  const handoff = {
    handoff_schema_version: HANDOFF_SCHEMA_VERSION,
    handoff_id: input.handoff_id,
    handoff_digest: '',
    workflow_id: workflowState.workflow_id,
    workflow_digest: workflowState.workflow_digest,
    book_project_id: workflowState.book_project_id,
    source_identity: clone(workflowState.source_identity),
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    admission_task_id: input.admission_task_id,
    candidate_artifact_ref: input.candidate_artifact_ref,
    candidate_digest_sha256: input.candidate_digest_sha256,
    candidate_provenance_receipt_id: candidateReceipt.receipt_id,
    candidate_provenance_receipt_digest: candidateReceipt.receipt_digest,
    required_evidence_receipt_ids: receiptIds,
    required_evidence_receipt_digests: receiptDigests,
    author_decision_refs: authorDecisionRefs,
    expected_parent_state_version: workflowState.source_identity.book_state_version,
    expected_parent_state_digest: workflowState.source_identity.book_state_digest,
    target_owner_path: TARGET_OWNER_PATH,
    target_module: TARGET_MODULE,
    target_entrypoint: TARGET_ENTRYPOINT,
    required_actor_class: REQUIRED_ACTOR_CLASS,
    created_at: input.created_at,
    canonical_effect_allowed: false
  };
  handoff.handoff_digest = handoffDigest(handoff);
  validateAdmissionHandoff(handoff, workflowState, plan, input.receipts, input.current_source_identity, routingRegistry);
  return handoff;
}

function validateAdmissionHandoff(handoff, workflowState, plan, receipts, currentSourceIdentity, routingRegistry = routing.loadDefaultRegistry()) {
  if (!isObject(handoff)) fail('HANDOFF_REQUIRED');
  assertNoForbiddenFields(handoff, 'handoff');
  const required = [
    'handoff_schema_version','handoff_id','handoff_digest','workflow_id','workflow_digest','book_project_id','source_identity',
    'plan_id','plan_digest','admission_task_id','candidate_artifact_ref','candidate_digest_sha256',
    'candidate_provenance_receipt_id','candidate_provenance_receipt_digest','required_evidence_receipt_ids',
    'required_evidence_receipt_digests','author_decision_refs','expected_parent_state_version','expected_parent_state_digest',
    'target_owner_path','target_module','target_entrypoint','required_actor_class','created_at','canonical_effect_allowed'
  ];
  if (Object.keys(handoff).length !== required.length) fail('HANDOFF_FIELD_SET_MISMATCH');
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(handoff, field)) fail('HANDOFF_FIELD_MISSING', field);
  if (handoff.handoff_schema_version !== HANDOFF_SCHEMA_VERSION) fail('HANDOFF_SCHEMA_VERSION_MISMATCH');
  validateSafeRef(handoff.handoff_id, 'handoff_id');
  validateSafeRef(handoff.admission_task_id, 'admission_task_id');
  validateSafeRef(handoff.candidate_artifact_ref, 'candidate_artifact_ref');
  if (!SHA256.test(String(handoff.handoff_digest || ''))) fail('INVALID_HANDOFF_DIGEST');
  if (!SHA256.test(String(handoff.candidate_digest_sha256 || ''))) fail('INVALID_CANDIDATE_DIGEST');
  if (!SHA256.test(String(handoff.candidate_provenance_receipt_digest || ''))) fail('INVALID_CANDIDATE_PROVENANCE_DIGEST');
  if (!nonEmpty(handoff.created_at)) fail('CREATED_AT_REQUIRED');
  if (handoff.target_owner_path !== TARGET_OWNER_PATH || handoff.target_module !== TARGET_MODULE || handoff.target_entrypoint !== TARGET_ENTRYPOINT || handoff.required_actor_class !== REQUIRED_ACTOR_CLASS) {
    fail('BOOK_ADMISSION_TARGET_MISMATCH');
  }
  if (handoff.canonical_effect_allowed !== false) fail('HANDOFF_CANONICAL_EFFECT_FORBIDDEN');
  assertAdmissionTargetAvailable();
  stateModel.assertCurrentSourceIdentity(workflowState, currentSourceIdentity);
  const { ancestors } = assertAdmissionPlan(workflowState, plan, handoff.admission_task_id, routingRegistry);
  evidence.validateChain(receipts, workflowState, plan, routingRegistry);
  if (handoff.workflow_id !== workflowState.workflow_id || handoff.workflow_digest !== workflowState.workflow_digest || handoff.book_project_id !== workflowState.book_project_id) fail('HANDOFF_WORKFLOW_BINDING_MISMATCH');
  if (handoff.plan_id !== plan.plan_id || handoff.plan_digest !== plan.plan_digest) fail('HANDOFF_PLAN_BINDING_MISMATCH');
  if (!sameSource(handoff.source_identity, workflowState.source_identity) || !sameSource(handoff.source_identity, plan.source_identity)) fail('HANDOFF_SOURCE_BINDING_MISMATCH');
  if (handoff.expected_parent_state_version !== workflowState.source_identity.book_state_version || handoff.expected_parent_state_digest !== workflowState.source_identity.book_state_digest) fail('HANDOFF_PARENT_STATE_BINDING_MISMATCH');
  const { requiredReceipts, authorDecisionRefs } = qualifyPredecessorEvidence(plan, workflowState, receipts, ancestors);
  const candidateReceipt = findCandidateReceipt(plan, workflowState, receipts, ancestors, handoff.candidate_artifact_ref);
  const expectedIds = requiredReceipts.map(r => r.receipt_id);
  const expectedDigests = requiredReceipts.map(r => r.receipt_digest);
  if (stableStringify(handoff.required_evidence_receipt_ids) !== stableStringify(expectedIds) || stableStringify(handoff.required_evidence_receipt_digests) !== stableStringify(expectedDigests)) fail('HANDOFF_EVIDENCE_SET_MISMATCH');
  if (stableStringify(handoff.author_decision_refs) !== stableStringify(authorDecisionRefs)) fail('HANDOFF_AUTHOR_DECISION_SET_MISMATCH');
  if (handoff.candidate_provenance_receipt_id !== candidateReceipt.receipt_id || handoff.candidate_provenance_receipt_digest !== candidateReceipt.receipt_digest) fail('HANDOFF_CANDIDATE_PROVENANCE_MISMATCH');
  if (handoff.handoff_digest !== handoffDigest(handoff)) fail('HANDOFF_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  HANDOFF_SCHEMA_VERSION,
  TARGET_OWNER_PATH,
  TARGET_MODULE,
  TARGET_ENTRYPOINT,
  REQUIRED_ACTOR_CLASS,
  BookWorkflowAdmissionHandoffError,
  stableStringify,
  handoffDigest,
  prepareAdmissionHandoff,
  validateAdmissionHandoff
};
