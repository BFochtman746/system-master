import { canonicalize, sha256, CG001_MISSION_VERSION } from './active-work-state.js';

export const SUCCESSOR_REF_REQUEST_PROTOCOL = 'control-gateway.successor-ref-request.v1';
export const SUCCESSOR_REF_ADMISSION_PROTOCOL = 'control-gateway.successor-ref-admission.v1';
export const SUCCESSOR_REF_EXECUTION_PROTOCOL = 'control-gateway.successor-ref-execution.v1';
export const SUCCESSOR_REF_EFFECT = 'CONTROL_GATEWAY_SUCCESSOR_REF_CREATE';

const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const DENIED_STATES = new Set(['DENIED', 'STALE']);

export class SuccessorRefAdmissionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'SuccessorRefAdmissionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new SuccessorRefAdmissionError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictKeys(value, allowed, label) {
  if (!isPlainObject(value)) fail('SUCCESSOR_REF_SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('SUCCESSOR_REF_SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of allowed) if (!(key in value)) fail('SUCCESSOR_REF_SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('SUCCESSOR_REF_SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('SUCCESSOR_REF_SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}

function repositoryFromTransport(transport) {
  if (!transport || typeof transport.getRef !== 'function' || typeof transport.createRef !== 'function') throw new TypeError('refTransport.getRef/createRef functions required');
  if (typeof transport.owner !== 'string' || typeof transport.repo !== 'string') throw new TypeError('refTransport owner/repo binding required');
  return `${transport.owner}/${transport.repo}`;
}

function operationRefToken(operationId) {
  const match = /(?:^|-)CG-(\d{3,})$/.exec(operationId);
  if (!match) fail('SUCCESSOR_REF_OPERATION_INVALID', 'operation_id must end in CG-NNN for deterministic successor ref routing');
  return `cg-${match[1]}`;
}

function validateTargetRefForOperation(targetRef, operationId) {
  requiredString(targetRef, 'target_ref', REF_RE);
  if (targetRef.startsWith('refs/') || targetRef.includes('..') || targetRef.endsWith('/') || targetRef.includes('//')) fail('SUCCESSOR_REF_TARGET_INVALID', 'target_ref is not a normalized branch name');
  const token = operationRefToken(operationId);
  const prefix = `second-shift-control-gateway/${token}-`;
  if (!targetRef.startsWith(prefix)) fail('SUCCESSOR_REF_TARGET_INVALID', `target_ref must begin ${prefix}`);
  const suffix = targetRef.slice(prefix.length);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(suffix)) fail('SUCCESSOR_REF_TARGET_INVALID', 'target_ref suffix must be a lowercase deterministic slug');
}

export function validateSuccessorRefRequest(request) {
  strictKeys(request, [
    'protocol_version', 'mutation_id', 'mission_version', 'workstream_id', 'authority_epoch',
    'recovery_digest', 'authority_publication_commit_sha', 'authority_packet_digest', 'repository',
    'operation_id', 'predecessor_receipt_id', 'target_ref', 'base_sha', 'effect'
  ], 'successor_ref_request');
  if (request.protocol_version !== SUCCESSOR_REF_REQUEST_PROTOCOL) fail('SUCCESSOR_REF_PROTOCOL_INVALID', 'successor ref request protocol mismatch');
  requiredString(request.mutation_id, 'mutation_id', ID_RE);
  requiredString(request.mission_version, 'mission_version');
  requiredString(request.workstream_id, 'workstream_id', ID_RE);
  if (!Number.isSafeInteger(request.authority_epoch) || request.authority_epoch < 1) fail('SUCCESSOR_REF_SCHEMA_INVALID', 'authority_epoch must be positive');
  requiredString(request.recovery_digest, 'recovery_digest', SHA256_RE);
  requiredString(request.authority_publication_commit_sha, 'authority_publication_commit_sha', SHA1_RE);
  requiredString(request.authority_packet_digest, 'authority_packet_digest', SHA256_RE);
  requiredString(request.repository, 'repository', REPO_RE);
  requiredString(request.operation_id, 'operation_id', ID_RE);
  requiredString(request.predecessor_receipt_id, 'predecessor_receipt_id', ID_RE);
  validateTargetRefForOperation(request.target_ref, request.operation_id);
  requiredString(request.base_sha, 'base_sha', SHA1_RE);
  if (request.effect !== SUCCESSOR_REF_EFFECT) fail('SUCCESSOR_REF_EFFECT_INVALID', `effect must be ${SUCCESSOR_REF_EFFECT}`);
  return true;
}

export function successorRefRequestDigest(request) {
  validateSuccessorRefRequest(request);
  return sha256(request);
}

function bindRecovery(contract, request, refTransport) {
  if (!isPlainObject(contract)) fail('SUCCESSOR_REF_RECOVERY_INVALID', 'recovery gate returned no contract');
  if (contract.mission_version !== CG001_MISSION_VERSION || request.mission_version !== contract.mission_version) fail('SUCCESSOR_REF_MISSION_MISMATCH', 'mission version mismatch');
  if (request.workstream_id !== contract.workstream_id) fail('SUCCESSOR_REF_WORKSTREAM_MISMATCH', 'workstream mismatch');
  if (request.authority_epoch !== contract.authority_epoch) fail('SUCCESSOR_REF_AUTHORITY_EPOCH_MISMATCH', 'authority epoch mismatch');
  if (request.recovery_digest !== contract.recovery_digest) fail('SUCCESSOR_REF_RECOVERY_MISMATCH', 'request does not bind the recovered continuation');
  if (request.authority_publication_commit_sha !== contract.publication_commit_sha || request.authority_packet_digest !== contract.packet_digest) fail('SUCCESSOR_REF_AUTHORITY_MISMATCH', 'request does not bind the recovered durable authority publication');
  if (request.repository !== contract.repository || repositoryFromTransport(refTransport) !== contract.repository) fail('SUCCESSOR_REF_REPOSITORY_MISMATCH', 'repository binding mismatch');
  if (contract.qualification_state !== 'PASSED') fail('SUCCESSOR_REF_QUALIFICATION_REQUIRED', 'predecessor authority must be qualified before creating a successor ref');
  if (DENIED_STATES.has(contract.github_admission_state)) fail('SUCCESSOR_REF_GITHUB_STANDING_INVALID', 'predecessor GitHub standing is denied or stale');
  if (contract.continuation?.mode !== 'START_SUCCESSOR') fail('SUCCESSOR_REF_NOT_STARTABLE', 'recovery continuation is not START_SUCCESSOR');
  if (contract.continuation.operation_id !== request.operation_id || contract.continuation.predecessor_receipt_id !== request.predecessor_receipt_id) fail('SUCCESSOR_REF_OPERATION_MISMATCH', 'request is not the exact recovered successor');
  if (DENIED_STATES.has(contract.continuation.successor_standing?.github_admission_state)) fail('SUCCESSOR_REF_GITHUB_STANDING_INVALID', 'successor GitHub standing is denied or stale');
  if (request.base_sha !== contract.authority_branch_head_sha) fail('SUCCESSOR_REF_BASE_MISMATCH', 'successor ref base must equal the exact recovered governance freeze head');
  validateTargetRefForOperation(request.target_ref, request.operation_id);
}

function withoutDigest(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

export function computeSuccessorRefAdmissionDigest(receipt) {
  return sha256(withoutDigest(receipt, 'admission_digest'));
}

export function validateSuccessorRefAdmissionReceipt(receipt) {
  strictKeys(receipt, [
    'protocol_version', 'decision', 'mutation_id', 'request_digest', 'mission_version', 'workstream_id',
    'authority_epoch', 'recovery_digest', 'authority_publication_commit_sha', 'authority_packet_digest',
    'repository', 'operation_id', 'predecessor_receipt_id', 'target_ref', 'base_sha', 'effect',
    'executor_requirement', 'admission_digest'
  ], 'successor_ref_admission');
  if (receipt.protocol_version !== SUCCESSOR_REF_ADMISSION_PROTOCOL || receipt.decision !== 'GRANTED') fail('SUCCESSOR_REF_ADMISSION_INVALID', 'admission protocol/decision invalid');
  requiredString(receipt.request_digest, 'request_digest', SHA256_RE);
  requiredString(receipt.admission_digest, 'admission_digest', SHA256_RE);
  validateSuccessorRefRequest({
    protocol_version: SUCCESSOR_REF_REQUEST_PROTOCOL,
    mutation_id: receipt.mutation_id,
    mission_version: receipt.mission_version,
    workstream_id: receipt.workstream_id,
    authority_epoch: receipt.authority_epoch,
    recovery_digest: receipt.recovery_digest,
    authority_publication_commit_sha: receipt.authority_publication_commit_sha,
    authority_packet_digest: receipt.authority_packet_digest,
    repository: receipt.repository,
    operation_id: receipt.operation_id,
    predecessor_receipt_id: receipt.predecessor_receipt_id,
    target_ref: receipt.target_ref,
    base_sha: receipt.base_sha,
    effect: receipt.effect
  });
  if (receipt.executor_requirement !== 'CREATE_REF_IF_ABSENT_AT_EXACT_BASE_SHA') fail('SUCCESSOR_REF_ADMISSION_INVALID', 'executor requirement invalid');
  if (computeSuccessorRefAdmissionDigest(receipt) !== receipt.admission_digest) fail('SUCCESSOR_REF_ADMISSION_DIGEST_MISMATCH', 'admission digest mismatch');
  return true;
}

function makeAdmission(request) {
  const receipt = {
    protocol_version: SUCCESSOR_REF_ADMISSION_PROTOCOL,
    decision: 'GRANTED',
    mutation_id: request.mutation_id,
    request_digest: successorRefRequestDigest(request),
    mission_version: request.mission_version,
    workstream_id: request.workstream_id,
    authority_epoch: request.authority_epoch,
    recovery_digest: request.recovery_digest,
    authority_publication_commit_sha: request.authority_publication_commit_sha,
    authority_packet_digest: request.authority_packet_digest,
    repository: request.repository,
    operation_id: request.operation_id,
    predecessor_receipt_id: request.predecessor_receipt_id,
    target_ref: request.target_ref,
    base_sha: request.base_sha,
    effect: request.effect,
    executor_requirement: 'CREATE_REF_IF_ABSENT_AT_EXACT_BASE_SHA',
    admission_digest: ''
  };
  receipt.admission_digest = computeSuccessorRefAdmissionDigest(receipt);
  validateSuccessorRefAdmissionReceipt(receipt);
  return Object.freeze(receipt);
}

export function computeSuccessorRefExecutionDigest(receipt) {
  return sha256(withoutDigest(receipt, 'execution_digest'));
}

export function validateSuccessorRefExecutionReceipt(receipt) {
  strictKeys(receipt, [
    'protocol_version', 'outcome', 'mutation_id', 'request_digest', 'admission_digest', 'repository',
    'operation_id', 'target_ref', 'created_sha', 'recovered_after_ambiguous_create', 'execution_digest'
  ], 'successor_ref_execution');
  if (receipt.protocol_version !== SUCCESSOR_REF_EXECUTION_PROTOCOL || receipt.outcome !== 'SUCCEEDED') fail('SUCCESSOR_REF_EXECUTION_INVALID', 'execution protocol/outcome invalid');
  requiredString(receipt.mutation_id, 'mutation_id', ID_RE);
  requiredString(receipt.request_digest, 'request_digest', SHA256_RE);
  requiredString(receipt.admission_digest, 'admission_digest', SHA256_RE);
  requiredString(receipt.repository, 'repository', REPO_RE);
  requiredString(receipt.operation_id, 'operation_id', ID_RE);
  requiredString(receipt.target_ref, 'target_ref', REF_RE);
  requiredString(receipt.created_sha, 'created_sha', SHA1_RE);
  if (typeof receipt.recovered_after_ambiguous_create !== 'boolean') fail('SUCCESSOR_REF_EXECUTION_INVALID', 'recovered_after_ambiguous_create must be boolean');
  requiredString(receipt.execution_digest, 'execution_digest', SHA256_RE);
  if (computeSuccessorRefExecutionDigest(receipt) !== receipt.execution_digest) fail('SUCCESSOR_REF_EXECUTION_DIGEST_MISMATCH', 'execution digest mismatch');
  return true;
}

export class SuccessorRefAdmissionGate {
  constructor({ recoveryGate, refTransport }) {
    if (!recoveryGate || typeof recoveryGate.recoverContinue !== 'function' || typeof recoveryGate.verifyRecoveryContractFresh !== 'function') throw new TypeError('recoveryGate recoverContinue/verifyRecoveryContractFresh functions required');
    repositoryFromTransport(refTransport);
    this.recoveryGate = recoveryGate;
    this.refTransport = refTransport;
  }

  async admit(request) {
    validateSuccessorRefRequest(request);
    const first = await this.recoveryGate.recoverContinue();
    bindRecovery(first, request, this.refTransport);
    if (await this.refTransport.getRef(request.target_ref)) fail('SUCCESSOR_REF_ALREADY_EXISTS', 'successor ref must not exist at admission time');
    const second = await this.recoveryGate.recoverContinue();
    if (canonicalize(second) !== canonicalize(first)) fail('SUCCESSOR_REF_AUTHORITY_MOVED', 'recovery authority changed during successor-ref admission');
    if (await this.refTransport.getRef(request.target_ref)) fail('SUCCESSOR_REF_TARGET_MOVED', 'successor ref appeared during admission');
    return makeAdmission(request);
  }

  async verifyGrantFresh(receipt, request) {
    validateSuccessorRefAdmissionReceipt(receipt);
    validateSuccessorRefRequest(request);
    if (receipt.request_digest !== successorRefRequestDigest(request)) fail('SUCCESSOR_REF_REQUEST_MISMATCH', 'admission receipt does not bind this request');
    const contract = await this.recoveryGate.recoverContinue();
    bindRecovery(contract, request, this.refTransport);
    if (contract.recovery_digest !== receipt.recovery_digest) fail('SUCCESSOR_REF_ADMISSION_STALE', 'recovery authority changed after admission');
    await this.recoveryGate.verifyRecoveryContractFresh(contract);
    if (await this.refTransport.getRef(request.target_ref)) fail('SUCCESSOR_REF_ADMISSION_STALE', 'target ref no longer absent');
    return true;
  }

  async executeGrant(receipt, request) {
    await this.verifyGrantFresh(receipt, request);
    let recoveredAfterAmbiguousCreate = false;
    try {
      await this.refTransport.createRef(request.target_ref, request.base_sha);
    } catch (error) {
      const observed = await this.refTransport.getRef(request.target_ref);
      if (!observed || observed.sha !== request.base_sha) throw error;
      recoveredAfterAmbiguousCreate = true;
    }
    const observed = await this.refTransport.getRef(request.target_ref);
    if (!observed || observed.sha !== request.base_sha) fail('SUCCESSOR_REF_EXECUTION_MISMATCH', 'created successor ref does not point to admitted base SHA');
    const execution = {
      protocol_version: SUCCESSOR_REF_EXECUTION_PROTOCOL,
      outcome: 'SUCCEEDED',
      mutation_id: request.mutation_id,
      request_digest: receipt.request_digest,
      admission_digest: receipt.admission_digest,
      repository: request.repository,
      operation_id: request.operation_id,
      target_ref: request.target_ref,
      created_sha: observed.sha,
      recovered_after_ambiguous_create: recoveredAfterAmbiguousCreate,
      execution_digest: ''
    };
    execution.execution_digest = computeSuccessorRefExecutionDigest(execution);
    validateSuccessorRefExecutionReceipt(execution);
    return Object.freeze(execution);
  }
}
