'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT_PATH = path.join(__dirname, '../../qualification/book-system/lifecycle/BOOK-LIFECYCLE-STATE-MACHINE-001.json');
const STATE_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const TERMINAL_PHASE_STATUSES = new Set(['NOT_APPLICABLE', 'COMPLETE']);

class BookLifecycleError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLifecycleError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookLifecycleError(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
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
function digestState(state) {
  const copy = clone(state);
  delete copy.lifecycle_digest;
  return sha256(stableStringify(copy));
}
function seal(state) {
  const next = clone(state);
  delete next.lifecycle_digest;
  next.lifecycle_digest = digestState(next);
  return next;
}
function loadContract() { return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')); }
function phaseById(contract, phaseId) {
  const phase = contract.phases.find(p => p.phase_id === phaseId);
  if (!phase) fail('UNKNOWN_PHASE', String(phaseId));
  return phase;
}
function uniqueStrings(values, label) {
  if (!Array.isArray(values)) fail('ARRAY_REQUIRED', label);
  const seen = new Set();
  for (const value of values) {
    if (!nonEmpty(value)) fail('NONEMPTY_STRING_REQUIRED', label);
    if (seen.has(value)) fail('DUPLICATE_VALUE', `${label}:${value}`);
    seen.add(value);
  }
}

function validateContract(contract) {
  if (!isObject(contract)) fail('LIFECYCLE_CONTRACT_REQUIRED');
  if (contract.contract_id !== 'BOOK-LIFECYCLE-STATE-MACHINE-001') fail('LIFECYCLE_CONTRACT_ID_MISMATCH');
  if (contract.owner_path !== 'SYSTEM_MASTER/BOOK' || contract.book_component_id !== 'BOOK-COMP-05') fail('LIFECYCLE_OWNER_MISMATCH');
  if (!Array.isArray(contract.phase_order) || contract.phase_order.length !== 20) fail('FROZEN_PHASE_COUNT_MISMATCH');
  if (!Array.isArray(contract.phases) || contract.phases.length !== contract.phase_order.length) fail('PHASE_DEFINITION_COUNT_MISMATCH');
  uniqueStrings(contract.phase_order, 'phase_order');
  const statuses = new Set(contract.phase_statuses || []);
  for (const required of ['NOT_APPLICABLE','PENDING','READY','ACTIVE','BLOCKED','STALE','RECOVERY_REQUIRED','COMPLETE','CANCELLED']) {
    if (!statuses.has(required)) fail('PHASE_STATUS_MISSING', required);
  }
  const requiredFields = ['phase_id','entry_state','required_inputs','required_decisions','allowed_operations','completion_gate','blocked_state','stale_state','reopen_rules','cancellation','recovery','next_step_calculation','applicability'];
  const seen = new Set();
  for (let i = 0; i < contract.phases.length; i += 1) {
    const phase = contract.phases[i];
    for (const field of requiredFields) if (!Object.prototype.hasOwnProperty.call(phase, field)) fail('PHASE_FIELD_MISSING', `${phase.phase_id || '?'}:${field}`);
    if (phase.phase_id !== contract.phase_order[i]) fail('PHASE_ORDER_DEFINITION_MISMATCH', `${i}:${phase.phase_id}`);
    if (seen.has(phase.phase_id)) fail('DUPLICATE_PHASE_ID', phase.phase_id);
    seen.add(phase.phase_id);
    uniqueStrings(phase.required_inputs, `${phase.phase_id}.required_inputs`);
    uniqueStrings(phase.required_decisions, `${phase.phase_id}.required_decisions`);
    uniqueStrings(phase.allowed_operations, `${phase.phase_id}.allowed_operations`);
    if (!['MANDATORY','PROFILE_FLAG'].includes(phase.applicability.mode)) fail('INVALID_APPLICABILITY_MODE', phase.phase_id);
    if (phase.applicability.mode === 'PROFILE_FLAG' && !nonEmpty(phase.applicability.flag)) fail('APPLICABILITY_FLAG_REQUIRED', phase.phase_id);
    if (!isObject(phase.completion_gate) || !nonEmpty(phase.completion_gate.gate_id)) fail('COMPLETION_GATE_REQUIRED', phase.phase_id);
  }
  const projection = contract.legacy_227_projection;
  if (!isObject(projection) || projection.source_atomic_step_count !== 227 || projection.projected_once !== 227 || projection.unmapped !== 0 || projection.multiply_mapped !== 0) fail('LEGACY_227_PROJECTION_INVALID');
  const targetCount = Object.values(projection.target_step_counts || {}).reduce((sum, n) => sum + n, 0);
  if (targetCount !== 227) fail('LEGACY_227_TARGET_COUNT_MISMATCH', String(targetCount));
  return true;
}

function validateProfile(profile, contract = loadContract()) {
  validateContract(contract);
  if (!isObject(profile)) fail('LIFECYCLE_PROFILE_REQUIRED');
  const schema = contract.applicability_model.profile_schema;
  for (const [field, rule] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(profile, field)) fail('PROFILE_FIELD_MISSING', field);
    if (rule.type === 'boolean' && typeof profile[field] !== 'boolean') fail('PROFILE_BOOLEAN_REQUIRED', field);
    if (rule.type === 'enum' && !rule.values.includes(profile[field])) fail('PROFILE_ENUM_INVALID', `${field}:${profile[field]}`);
  }
  for (const rule of contract.applicability_model.constraints || []) {
    if (profile[rule.if] === true && profile[rule.then] !== true) fail(rule.error);
  }
  for (const rule of contract.applicability_model.conditional_constraints || []) {
    const matches = Object.entries(rule.when).every(([k, v]) => profile[k] === v);
    if (matches) for (const field of rule.require_true) if (profile[field] !== true) fail(rule.error, field);
  }
  return true;
}

function isApplicable(phase, profile) {
  if (phase.applicability.mode === 'MANDATORY') return true;
  return profile[phase.applicability.flag] === true;
}

function phaseStateTemplate(phase, profile) {
  const applicable = isApplicable(phase, profile);
  return {
    phase_id: phase.phase_id,
    applicable,
    status: applicable ? 'PENDING' : 'NOT_APPLICABLE',
    source_identity_digest: null,
    satisfied_inputs: [],
    resolved_decisions: [],
    completed_operations: [],
    completion_gate_passed: false,
    completion_receipt_ref: null,
    superseded_completion_receipt_refs: [],
    blocker_refs: [],
    stale_reason: null,
    checkpoint_ref: null,
    reopen_count: 0,
    last_transition_at: null
  };
}

function prerequisitesSatisfied(state, contract, index) {
  for (let i = 0; i < index; i += 1) {
    const ps = state.phase_states[contract.phase_order[i]];
    if (!ps) return false;
    if (ps.applicable && ps.status !== 'COMPLETE') return false;
  }
  return true;
}

function refreshReadiness(state, contract) {
  for (let i = 0; i < contract.phase_order.length; i += 1) {
    const ps = state.phase_states[contract.phase_order[i]];
    if (!ps.applicable || ps.status !== 'PENDING') continue;
    if (prerequisitesSatisfied(state, contract, i)) {
      ps.status = 'READY';
      break;
    }
    break;
  }
  return state;
}

function deriveLifecycleStatus(state, contract) {
  const applicable = contract.phase_order.map(id => state.phase_states[id]).filter(ps => ps.applicable);
  if (applicable.every(ps => ps.status === 'COMPLETE')) return 'COMPLETE';
  if (applicable.some(ps => ps.status === 'STALE' || ps.status === 'RECOVERY_REQUIRED')) return 'STALE';
  if (applicable.some(ps => ps.status === 'BLOCKED')) return 'BLOCKED';
  if (applicable.some(ps => ps.status === 'CANCELLED')) return 'CANCELLED';
  return 'ACTIVE';
}

function validateLifecycleState(state, contract = loadContract()) {
  validateContract(contract);
  if (!isObject(state)) fail('LIFECYCLE_STATE_REQUIRED');
  const required = ['lifecycle_schema_version','lifecycle_id','lifecycle_version','lifecycle_digest','lifecycle_generation','book_project_id','source_identity_digest','profile','phase_states','lifecycle_status','created_at','updated_at'];
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(state, field)) fail('LIFECYCLE_STATE_FIELD_MISSING', field);
  if (state.lifecycle_schema_version !== STATE_SCHEMA_VERSION) fail('LIFECYCLE_SCHEMA_VERSION_MISMATCH');
  if (!nonEmpty(state.lifecycle_id) || !nonEmpty(state.book_project_id) || !nonEmpty(state.created_at) || !nonEmpty(state.updated_at)) fail('LIFECYCLE_IDENTITY_REQUIRED');
  if (!Number.isInteger(state.lifecycle_version) || state.lifecycle_version < 1 || !Number.isInteger(state.lifecycle_generation) || state.lifecycle_generation < 1) fail('LIFECYCLE_VERSION_INVALID');
  if (!SHA256.test(String(state.source_identity_digest || ''))) fail('SOURCE_IDENTITY_DIGEST_INVALID');
  validateProfile(state.profile, contract);
  if (!isObject(state.phase_states)) fail('PHASE_STATES_REQUIRED');
  for (const phase of contract.phases) {
    const ps = state.phase_states[phase.phase_id];
    if (!isObject(ps) || ps.phase_id !== phase.phase_id) fail('PHASE_STATE_MISSING', phase.phase_id);
    const expectedApplicable = isApplicable(phase, state.profile);
    if (ps.applicable !== expectedApplicable) fail('PHASE_APPLICABILITY_MISMATCH', phase.phase_id);
    if (!contract.phase_statuses.includes(ps.status)) fail('PHASE_STATUS_INVALID', `${phase.phase_id}:${ps.status}`);
    if (!expectedApplicable && ps.status !== 'NOT_APPLICABLE') fail('NONAPPLICABLE_PHASE_STATUS_INVALID', phase.phase_id);
    if (expectedApplicable && ps.status === 'NOT_APPLICABLE') fail('APPLICABLE_PHASE_NOT_APPLICABLE', phase.phase_id);
    uniqueStrings(ps.satisfied_inputs, `${phase.phase_id}.satisfied_inputs`);
    uniqueStrings(ps.resolved_decisions, `${phase.phase_id}.resolved_decisions`);
    uniqueStrings(ps.completed_operations, `${phase.phase_id}.completed_operations`);
    uniqueStrings(ps.superseded_completion_receipt_refs, `${phase.phase_id}.superseded_completion_receipt_refs`);
    uniqueStrings(ps.blocker_refs, `${phase.phase_id}.blocker_refs`);
    for (const input of ps.satisfied_inputs) if (!phase.required_inputs.includes(input)) fail('UNKNOWN_SATISFIED_INPUT', `${phase.phase_id}:${input}`);
    for (const decision of ps.resolved_decisions) if (!phase.required_decisions.includes(decision)) fail('UNKNOWN_RESOLVED_DECISION', `${phase.phase_id}:${decision}`);
    for (const operation of ps.completed_operations) if (!phase.allowed_operations.includes(operation)) fail('UNKNOWN_COMPLETED_OPERATION', `${phase.phase_id}:${operation}`);
    if (ps.status === 'COMPLETE') {
      if (!ps.completion_gate_passed || !nonEmpty(ps.completion_receipt_ref) || ps.source_identity_digest !== state.source_identity_digest) fail('COMPLETE_PHASE_EVIDENCE_INVALID', phase.phase_id);
      for (const input of phase.required_inputs) if (!ps.satisfied_inputs.includes(input)) fail('COMPLETE_PHASE_INPUT_MISSING', `${phase.phase_id}:${input}`);
      for (const decision of phase.required_decisions) if (!ps.resolved_decisions.includes(decision)) fail('COMPLETE_PHASE_DECISION_MISSING', `${phase.phase_id}:${decision}`);
    }
    if (ps.status === 'BLOCKED' && ps.blocker_refs.length === 0) fail('BLOCKED_PHASE_REQUIRES_BLOCKER', phase.phase_id);
    if ((ps.status === 'CANCELLED' || ps.status === 'RECOVERY_REQUIRED') && !nonEmpty(ps.checkpoint_ref)) fail('RECOVERABLE_PHASE_REQUIRES_CHECKPOINT', phase.phase_id);
    if (ps.status === 'STALE' && !nonEmpty(ps.stale_reason)) fail('STALE_PHASE_REASON_REQUIRED', phase.phase_id);
  }
  const derived = deriveLifecycleStatus(state, contract);
  if (state.lifecycle_status !== derived) fail('LIFECYCLE_STATUS_MISMATCH', `${state.lifecycle_status}->${derived}`);
  if (state.lifecycle_digest !== digestState(state)) fail('LIFECYCLE_DIGEST_MISMATCH');
  return true;
}

function createLifecycleState(input, contract = loadContract()) {
  validateContract(contract);
  if (!isObject(input)) fail('CREATE_LIFECYCLE_INPUT_REQUIRED');
  for (const field of ['lifecycle_id','book_project_id','source_identity_digest','profile','created_at']) if (!Object.prototype.hasOwnProperty.call(input, field)) fail('CREATE_LIFECYCLE_FIELD_MISSING', field);
  if (!SHA256.test(String(input.source_identity_digest || ''))) fail('SOURCE_IDENTITY_DIGEST_INVALID');
  validateProfile(input.profile, contract);
  const phaseStates = {};
  for (const phase of contract.phases) phaseStates[phase.phase_id] = phaseStateTemplate(phase, input.profile);
  const state = {
    lifecycle_schema_version: STATE_SCHEMA_VERSION,
    lifecycle_id: input.lifecycle_id,
    lifecycle_version: 1,
    lifecycle_digest: '',
    lifecycle_generation: input.lifecycle_generation || 1,
    book_project_id: input.book_project_id,
    source_identity_digest: input.source_identity_digest,
    profile: clone(input.profile),
    phase_states: phaseStates,
    lifecycle_status: 'ACTIVE',
    created_at: input.created_at,
    updated_at: input.created_at
  };
  refreshReadiness(state, contract);
  state.lifecycle_status = deriveLifecycleStatus(state, contract);
  const sealed = seal(state);
  validateLifecycleState(sealed, contract);
  return sealed;
}

function mutate(state, contract, at, mutator) {
  validateLifecycleState(state, contract);
  if (!nonEmpty(at)) fail('TRANSITION_TIMESTAMP_REQUIRED');
  const next = clone(state);
  mutator(next);
  refreshReadiness(next, contract);
  next.lifecycle_version += 1;
  next.updated_at = at;
  next.lifecycle_status = deriveLifecycleStatus(next, contract);
  const sealed = seal(next);
  validateLifecycleState(sealed, contract);
  return sealed;
}

function phaseMutable(next, phaseId, allowedStatuses) {
  const ps = next.phase_states[phaseId];
  if (!ps) fail('UNKNOWN_PHASE', phaseId);
  if (!ps.applicable) fail('PHASE_NOT_APPLICABLE', phaseId);
  if (allowedStatuses && !allowedStatuses.includes(ps.status)) fail('PHASE_STATUS_TRANSITION_INVALID', `${phaseId}:${ps.status}`);
  return ps;
}

function recordPhaseProgress(state, phaseId, progress, at, contract = loadContract()) {
  if (!isObject(progress)) fail('PHASE_PROGRESS_REQUIRED');
  const phase = phaseById(contract, phaseId);
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['READY','ACTIVE','BLOCKED']);
    for (const value of progress.satisfied_inputs || []) {
      if (!phase.required_inputs.includes(value)) fail('UNKNOWN_SATISFIED_INPUT', `${phaseId}:${value}`);
      if (!ps.satisfied_inputs.includes(value)) ps.satisfied_inputs.push(value);
    }
    for (const value of progress.resolved_decisions || []) {
      if (!phase.required_decisions.includes(value)) fail('UNKNOWN_RESOLVED_DECISION', `${phaseId}:${value}`);
      if (!ps.resolved_decisions.includes(value)) ps.resolved_decisions.push(value);
    }
    for (const value of progress.completed_operations || []) {
      if (!phase.allowed_operations.includes(value)) fail('UNKNOWN_COMPLETED_OPERATION', `${phaseId}:${value}`);
      if (!ps.completed_operations.includes(value)) ps.completed_operations.push(value);
    }
    ps.last_transition_at = at;
  });
}

function startPhase(state, phaseId, at, contract = loadContract()) {
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['READY']);
    ps.status = 'ACTIVE';
    ps.source_identity_digest = next.source_identity_digest;
    ps.last_transition_at = at;
  });
}

function completePhase(state, phaseId, completionReceiptRef, at, contract = loadContract()) {
  const phase = phaseById(contract, phaseId);
  if (!nonEmpty(completionReceiptRef)) fail('COMPLETION_RECEIPT_REQUIRED', phaseId);
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['READY','ACTIVE']);
    for (const input of phase.required_inputs) if (!ps.satisfied_inputs.includes(input)) fail('REQUIRED_INPUT_UNSATISFIED', `${phaseId}:${input}`);
    for (const decision of phase.required_decisions) if (!ps.resolved_decisions.includes(decision)) fail('REQUIRED_DECISION_UNRESOLVED', `${phaseId}:${decision}`);
    ps.status = 'COMPLETE';
    ps.completion_gate_passed = true;
    ps.completion_receipt_ref = completionReceiptRef;
    ps.source_identity_digest = next.source_identity_digest;
    ps.blocker_refs = [];
    ps.stale_reason = null;
    ps.checkpoint_ref = null;
    ps.last_transition_at = at;
  });
}

function blockPhase(state, phaseId, blockerRefs, at, contract = loadContract()) {
  uniqueStrings(blockerRefs, 'blocker_refs');
  if (blockerRefs.length === 0) fail('BLOCKER_REF_REQUIRED', phaseId);
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['READY','ACTIVE']);
    ps.status = 'BLOCKED';
    ps.blocker_refs = [...blockerRefs];
    ps.last_transition_at = at;
  });
}

function unblockPhase(state, phaseId, at, contract = loadContract()) {
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['BLOCKED']);
    ps.status = 'READY';
    ps.blocker_refs = [];
    ps.last_transition_at = at;
  });
}

function staleOne(ps, reason, at) {
  if (!ps.applicable || ps.status === 'PENDING' || ps.status === 'NOT_APPLICABLE') return;
  if (ps.status === 'COMPLETE' && nonEmpty(ps.completion_receipt_ref) && !ps.superseded_completion_receipt_refs.includes(ps.completion_receipt_ref)) ps.superseded_completion_receipt_refs.push(ps.completion_receipt_ref);
  ps.status = 'STALE';
  ps.stale_reason = reason;
  ps.completion_gate_passed = false;
  ps.completion_receipt_ref = null;
  ps.blocker_refs = [];
  ps.last_transition_at = at;
}

function markPhaseStale(state, phaseId, reason, at, contract = loadContract(), includeDownstream = true) {
  if (!nonEmpty(reason)) fail('STALE_REASON_REQUIRED', phaseId);
  const index = contract.phase_order.indexOf(phaseId);
  if (index < 0) fail('UNKNOWN_PHASE', phaseId);
  return mutate(state, contract, at, next => {
    const ids = includeDownstream ? contract.phase_order.slice(index) : [phaseId];
    for (const id of ids) staleOne(next.phase_states[id], reason, at);
  });
}

function reopenPhase(state, phaseId, at, contract = loadContract()) {
  const phase = phaseById(contract, phaseId);
  if (phase.reopen_rules.allowed !== true) fail('PHASE_REOPEN_FORBIDDEN', phaseId);
  const index = contract.phase_order.indexOf(phaseId);
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['COMPLETE','STALE','BLOCKED','CANCELLED','RECOVERY_REQUIRED']);
    if (ps.status === 'COMPLETE' && nonEmpty(ps.completion_receipt_ref) && !ps.superseded_completion_receipt_refs.includes(ps.completion_receipt_ref)) ps.superseded_completion_receipt_refs.push(ps.completion_receipt_ref);
    ps.status = 'READY';
    ps.completion_gate_passed = false;
    ps.completion_receipt_ref = null;
    ps.blocker_refs = [];
    ps.stale_reason = null;
    ps.checkpoint_ref = null;
    ps.reopen_count += 1;
    ps.last_transition_at = at;
    for (let i = index + 1; i < contract.phase_order.length; i += 1) staleOne(next.phase_states[contract.phase_order[i]], `UPSTREAM_REOPEN:${phaseId}`, at);
  });
}

function cancelPhase(state, phaseId, checkpointRef, at, contract = loadContract()) {
  if (!nonEmpty(checkpointRef)) fail('CHECKPOINT_REF_REQUIRED', phaseId);
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['READY','ACTIVE','BLOCKED','STALE','RECOVERY_REQUIRED']);
    ps.status = 'CANCELLED';
    ps.checkpoint_ref = checkpointRef;
    ps.blocker_refs = [];
    ps.last_transition_at = at;
  });
}

function recoverPhase(state, phaseId, currentSourceIdentityDigest, checkpointRef, at, contract = loadContract()) {
  if (!SHA256.test(String(currentSourceIdentityDigest || ''))) fail('SOURCE_IDENTITY_DIGEST_INVALID');
  if (!nonEmpty(checkpointRef)) fail('CHECKPOINT_REF_REQUIRED', phaseId);
  return mutate(state, contract, at, next => {
    const ps = phaseMutable(next, phaseId, ['CANCELLED','RECOVERY_REQUIRED','STALE']);
    if (ps.checkpoint_ref !== null && ps.checkpoint_ref !== checkpointRef) fail('CHECKPOINT_REF_MISMATCH', phaseId);
    if (currentSourceIdentityDigest !== next.source_identity_digest) fail('RECOVERY_SOURCE_NOT_CURRENT', phaseId);
    ps.status = 'READY';
    ps.checkpoint_ref = null;
    ps.stale_reason = null;
    ps.blocker_refs = [];
    ps.last_transition_at = at;
  });
}

function reprofileLifecycle(state, nextProfile, at, contract = loadContract()) {
  validateProfile(nextProfile, contract);
  return mutate(state, contract, at, next => {
    const oldProfile = clone(next.profile);
    next.profile = clone(nextProfile);
    let firstNewlyApplicable = null;
    for (let i = 0; i < contract.phase_order.length; i += 1) {
      const phase = phaseById(contract, contract.phase_order[i]);
      const ps = next.phase_states[phase.phase_id];
      const was = isApplicable(phase, oldProfile);
      const now = isApplicable(phase, nextProfile);
      ps.applicable = now;
      if (!was && now) {
        ps.status = 'PENDING';
        ps.stale_reason = null;
        ps.checkpoint_ref = null;
        if (firstNewlyApplicable === null) firstNewlyApplicable = i;
      } else if (was && !now) {
        if (ps.status === 'COMPLETE' && nonEmpty(ps.completion_receipt_ref) && !ps.superseded_completion_receipt_refs.includes(ps.completion_receipt_ref)) ps.superseded_completion_receipt_refs.push(ps.completion_receipt_ref);
        ps.status = 'NOT_APPLICABLE';
        ps.completion_gate_passed = false;
        ps.completion_receipt_ref = null;
        ps.blocker_refs = [];
        ps.stale_reason = null;
        ps.checkpoint_ref = null;
      }
      ps.last_transition_at = at;
    }
    if (firstNewlyApplicable !== null) {
      for (let i = firstNewlyApplicable + 1; i < contract.phase_order.length; i += 1) staleOne(next.phase_states[contract.phase_order[i]], 'APPLICABILITY_PROFILE_CHANGED', at);
    }
  });
}

function applyInvalidationEvent(state, eventId, at, contract = loadContract(), dynamicReopenTarget = null) {
  const rule = (contract.cross_phase_invalidation_rules || []).find(r => r.event_id === eventId);
  if (!rule) fail('UNKNOWN_INVALIDATION_EVENT', String(eventId));
  let targets = rule.target_phase_ids || [];
  if (rule.dynamic_reopen_target_required) {
    if (!nonEmpty(dynamicReopenTarget) || !contract.phase_order.includes(dynamicReopenTarget)) fail('DYNAMIC_REOPEN_TARGET_REQUIRED', eventId);
    targets = contract.phase_order.slice(contract.phase_order.indexOf(dynamicReopenTarget));
  }
  return mutate(state, contract, at, next => {
    for (const id of targets) staleOne(next.phase_states[id], `${eventId}:${rule.reason}`, at);
  });
}

function calculateNextStep(state, contract = loadContract()) {
  validateLifecycleState(state, contract);
  for (const phaseId of contract.phase_order) {
    const phase = phaseById(contract, phaseId);
    const ps = state.phase_states[phaseId];
    if (!ps.applicable || ps.status === 'COMPLETE') continue;
    if (ps.status === 'BLOCKED') return { action: 'RESOLVE_BLOCKER', phase_id: phaseId, blocker_refs: clone(ps.blocker_refs) };
    if (ps.status === 'STALE') return { action: 'REVALIDATE_OR_REOPEN', phase_id: phaseId, reason: ps.stale_reason };
    if (ps.status === 'CANCELLED' || ps.status === 'RECOVERY_REQUIRED') return { action: 'RECOVER_PHASE', phase_id: phaseId, checkpoint_ref: ps.checkpoint_ref };
    const missingInput = phase.required_inputs.find(v => !ps.satisfied_inputs.includes(v));
    if (missingInput) return { action: 'PROVIDE_INPUT', phase_id: phaseId, input_id: missingInput };
    const missingDecision = phase.required_decisions.find(v => !ps.resolved_decisions.includes(v));
    if (missingDecision) return { action: 'RESOLVE_DECISION', phase_id: phaseId, decision_id: missingDecision };
    if (ps.status === 'PENDING') return { action: 'WAIT_FOR_PREREQUISITE', phase_id: phaseId };
    if (ps.status === 'READY') return { action: 'START_PHASE', phase_id: phaseId };
    if (ps.status === 'ACTIVE') {
      const operation = phase.allowed_operations.find(v => !ps.completed_operations.includes(v));
      if (operation) return { action: 'EXECUTE_OPERATION', phase_id: phaseId, operation_id: operation };
      return { action: 'SEAL_PHASE_COMPLETION', phase_id: phaseId, gate_id: phase.completion_gate.gate_id };
    }
  }
  return { action: 'LIFECYCLE_COMPLETE', phase_id: null };
}

module.exports = {
  CONTRACT_PATH,
  STATE_SCHEMA_VERSION,
  BookLifecycleError,
  loadContract,
  validateContract,
  validateProfile,
  isApplicable,
  validateLifecycleState,
  createLifecycleState,
  recordPhaseProgress,
  startPhase,
  completePhase,
  blockPhase,
  unblockPhase,
  markPhaseStale,
  reopenPhase,
  cancelPhase,
  recoverPhase,
  reprofileLifecycle,
  applyInvalidationEvent,
  calculateNextStep,
  stateDigest: digestState,
  stableStringify
};
