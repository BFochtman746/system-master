import { canonicalize, sha256, CG001_MISSION_VERSION } from './active-work-state.js';

export const A01_ADMISSION_REQUEST_PROTOCOL = 'control-gateway.a01-admission-request.v1';
export const A01_ADMISSION_RECEIPT_PROTOCOL = 'control-gateway.a01-admission-receipt.v1';
export const A01_SUPERVISOR_HANDOFF_PROTOCOL = 'control-gateway.a01-supervisor-handoff.v1';

const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const EXECUTION_CLASSES = new Set(['A01_QUALIFICATION', 'IMMEDIATE', 'DELAYED', 'OVERNIGHT']);
const BLOCKED_A01_STATES = new Set(['BLOCKED', 'STALE']);

export class A01SupervisorHandoffError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'A01SupervisorHandoffError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) { throw new A01SupervisorHandoffError(code, message, details); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function strict(value, keys, label) {
  if (!plain(value)) fail('A01_SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('A01_SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of keys) if (!(key in value)) fail('A01_SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}
function string(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('A01_SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('A01_SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}
function nullableIso(value, label) {
  if (value === null) return null;
  string(value, label);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail('A01_TIME_INVALID', `${label} must be canonical UTC ISO-8601`);
  return value;
}
function subject(value, label = 'authoritative_subject') {
  strict(value, ['algorithm', 'oid'], label);
  if (value.algorithm !== 'sha1' || !SHA1_RE.test(value.oid ?? '')) fail('A01_SCHEMA_INVALID', `${label} must be lowercase SHA-1`);
}
function uniqueStrings(values, label, pattern = ID_RE) {
  if (!Array.isArray(values)) fail('A01_SCHEMA_INVALID', `${label} must be an array`);
  const seen = new Set();
  for (const value of values) {
    string(value, `${label}[]`, pattern);
    if (seen.has(value)) fail('A01_SCHEMA_INVALID', `${label} contains duplicate ${value}`);
    seen.add(value);
  }
}
function without(value, field) { const copy = structuredClone(value); delete copy[field]; return copy; }
function sameSubject(a, b) { return a?.algorithm === b?.algorithm && a?.oid === b?.oid; }

export function validateA01AdmissionRequest(request) {
  strict(request, [
    'protocol_version','admission_id','mission_version','workstream_id','authority_epoch','authority_publication_commit_sha',
    'authority_packet_digest','authoritative_subject','repository','authority_ref','authority_ref_head_sha','operation_id',
    'predecessor_receipt_id','command_id','task_id','idempotency_key','execution_class','execution_order','priority',
    'not_before','not_after','lane','owner_path','delegation_id','objective_id','control_ref','control_head','executor_kind',
    'payload_digest','dependency_receipt_ids'
  ], 'a01_admission_request');
  if (request.protocol_version !== A01_ADMISSION_REQUEST_PROTOCOL) fail('A01_PROTOCOL_INVALID', 'admission request protocol mismatch');
  for (const key of ['admission_id','workstream_id','operation_id','predecessor_receipt_id','command_id','task_id','idempotency_key','lane','owner_path','delegation_id','objective_id','executor_kind']) string(request[key], key, ID_RE);
  string(request.mission_version, 'mission_version');
  if (!Number.isSafeInteger(request.authority_epoch) || request.authority_epoch < 1) fail('A01_SCHEMA_INVALID', 'authority_epoch must be positive');
  string(request.authority_publication_commit_sha, 'authority_publication_commit_sha', SHA1_RE);
  string(request.authority_packet_digest, 'authority_packet_digest', SHA256_RE);
  subject(request.authoritative_subject);
  string(request.repository, 'repository', REPO_RE);
  string(request.authority_ref, 'authority_ref', REF_RE);
  string(request.authority_ref_head_sha, 'authority_ref_head_sha', SHA1_RE);
  if (!EXECUTION_CLASSES.has(request.execution_class)) fail('A01_EXECUTION_CLASS_INVALID', 'execution_class unsupported');
  if (!Number.isSafeInteger(request.execution_order) || request.execution_order < 0) fail('A01_ORDER_INVALID', 'execution_order must be nonnegative integer');
  if (!Number.isSafeInteger(request.priority) || request.priority < 0 || request.priority > 1000) fail('A01_PRIORITY_INVALID', 'priority must be 0..1000');
  nullableIso(request.not_before, 'not_before');
  nullableIso(request.not_after, 'not_after');
  if (request.not_before && request.not_after && request.not_before >= request.not_after) fail('A01_TIME_INVALID', 'not_before must precede not_after');
  string(request.control_ref, 'control_ref', REF_RE);
  string(request.control_head, 'control_head', SHA1_RE);
  string(request.payload_digest, 'payload_digest', SHA256_RE);
  uniqueStrings(request.dependency_receipt_ids, 'dependency_receipt_ids');
  return true;
}

export function a01AdmissionRequestDigest(request) { validateA01AdmissionRequest(request); return sha256(request); }

function exactContinuationBinding(request, authority) {
  if (!plain(authority)) fail('A01_AUTHORITY_INVALID', 'verified durable authority required');
  if (authority.mission_version !== CG001_MISSION_VERSION || request.mission_version !== authority.mission_version) fail('A01_MISSION_MISMATCH', 'mission mismatch');
  if (request.workstream_id !== authority.workstream_id) fail('A01_WORKSTREAM_MISMATCH', 'workstream mismatch');
  if (request.authority_epoch !== authority.authority_epoch) fail('A01_AUTHORITY_EPOCH_MISMATCH', 'authority epoch mismatch');
  if (request.authority_publication_commit_sha !== authority.publication_commit_sha) fail('A01_AUTHORITY_HEAD_MISMATCH', 'durable publication mismatch');
  if (request.authority_packet_digest !== authority.packet_digest) fail('A01_AUTHORITY_PACKET_MISMATCH', 'packet digest mismatch');
  if (!sameSubject(request.authoritative_subject, authority.authoritative_subject)) fail('A01_AUTHORITY_SUBJECT_MISMATCH', 'authoritative subject mismatch');
  if (request.repository !== authority.repository) fail('A01_REPOSITORY_MISMATCH', 'repository mismatch');
  if (request.authority_ref !== authority.branch_or_ref) fail('A01_REF_MISMATCH', 'authority ref mismatch');
  if (request.authority_ref_head_sha !== request.authoritative_subject.oid) fail('A01_AUTHORITY_REF_HEAD_MISMATCH', 'authority_ref_head_sha must equal the exact admitted authoritative subject');
  if (authority.current_operation?.state !== 'ACTIVE') fail('A01_OPERATION_NOT_ACTIVE', 'A-01 admission requires ACTIVE current operation');
  if (request.operation_id !== authority.current_operation.operation_id || request.predecessor_receipt_id !== authority.current_operation.predecessor_receipt_id) fail('A01_OPERATION_MISMATCH', 'operation/predecessor mismatch');
  if (authority.github_admission_state !== 'ADMITTED') fail('A01_GITHUB_ADMISSION_REQUIRED', 'GitHub admission must be ADMITTED before A-01 release');
  if (BLOCKED_A01_STATES.has(authority.a01_state)) fail('A01_STANDING_INVALID', 'durable A-01 standing is blocked or stale');
  if (request.execution_class !== 'A01_QUALIFICATION' && authority.qualification_state !== 'PASSED') fail('A01_QUALIFICATION_REQUIRED', 'non-qualification A-01 work requires PASSED authority');
}

function dependencyIndex(authority) {
  const index = new Map();
  for (const receipt of authority.receipt_index ?? []) index.set(receipt.receipt_id, receipt);
  return index;
}

function assertDependencies(request, authority) {
  const index = dependencyIndex(authority);
  for (const id of request.dependency_receipt_ids) {
    const receipt = index.get(id);
    if (!receipt || receipt.outcome !== 'SUCCEEDED' || receipt.satisfies_dependency !== true) fail('A01_DEPENDENCY_UNSATISFIED', `dependency receipt ${id} is not a successful durable dependency receipt`);
  }
}

export function computeA01AdmissionDigest(receipt) { return sha256(without(receipt, 'admission_digest')); }

export function admitA01Execution({ request, authority }) {
  validateA01AdmissionRequest(request);
  exactContinuationBinding(request, authority);
  assertDependencies(request, authority);
  const receipt = {
    protocol_version: A01_ADMISSION_RECEIPT_PROTOCOL,
    decision: 'GRANTED',
    admission_id: request.admission_id,
    request_digest: a01AdmissionRequestDigest(request),
    mission_version: request.mission_version,
    workstream_id: request.workstream_id,
    authority_epoch: request.authority_epoch,
    authority_publication_commit_sha: request.authority_publication_commit_sha,
    authority_packet_digest: request.authority_packet_digest,
    authoritative_subject: structuredClone(request.authoritative_subject),
    repository: request.repository,
    authority_ref: request.authority_ref,
    authority_ref_head_sha: request.authority_ref_head_sha,
    operation_id: request.operation_id,
    predecessor_receipt_id: request.predecessor_receipt_id,
    command_id: request.command_id,
    task_id: request.task_id,
    idempotency_key: request.idempotency_key,
    execution_class: request.execution_class,
    execution_order: request.execution_order,
    priority: request.priority,
    not_before: request.not_before,
    not_after: request.not_after,
    lane: request.lane,
    owner_path: request.owner_path,
    delegation_id: request.delegation_id,
    objective_id: request.objective_id,
    control_ref: request.control_ref,
    control_head: request.control_head,
    executor_kind: request.executor_kind,
    payload_digest: request.payload_digest,
    dependency_receipt_ids: [...request.dependency_receipt_ids].sort(),
    scheduling_owner: 'A01_SUPERVISOR',
    github_role: 'ADMISSION_TRANSPORT_EVIDENCE_ONLY',
    admission_digest: ''
  };
  receipt.admission_digest = computeA01AdmissionDigest(receipt);
  return Object.freeze(receipt);
}

export function validateA01AdmissionReceipt(receipt) {
  strict(receipt, [
    'protocol_version','decision','admission_id','request_digest','mission_version','workstream_id','authority_epoch',
    'authority_publication_commit_sha','authority_packet_digest','authoritative_subject','repository','authority_ref','authority_ref_head_sha',
    'operation_id','predecessor_receipt_id','command_id','task_id','idempotency_key','execution_class','execution_order','priority',
    'not_before','not_after','lane','owner_path','delegation_id','objective_id','control_ref','control_head','executor_kind','payload_digest',
    'dependency_receipt_ids','scheduling_owner','github_role','admission_digest'
  ], 'a01_admission_receipt');
  if (receipt.protocol_version !== A01_ADMISSION_RECEIPT_PROTOCOL || receipt.decision !== 'GRANTED') fail('A01_RECEIPT_INVALID', 'receipt protocol/decision invalid');
  string(receipt.request_digest, 'request_digest', SHA256_RE);
  string(receipt.admission_digest, 'admission_digest', SHA256_RE);
  if (receipt.scheduling_owner !== 'A01_SUPERVISOR' || receipt.github_role !== 'ADMISSION_TRANSPORT_EVIDENCE_ONLY') fail('A01_SCHEDULER_AUTHORITY_INVALID', 'receipt would create a competing scheduler');
  const request = {
    protocol_version: A01_ADMISSION_REQUEST_PROTOCOL, admission_id: receipt.admission_id, mission_version: receipt.mission_version,
    workstream_id: receipt.workstream_id, authority_epoch: receipt.authority_epoch, authority_publication_commit_sha: receipt.authority_publication_commit_sha,
    authority_packet_digest: receipt.authority_packet_digest, authoritative_subject: receipt.authoritative_subject, repository: receipt.repository,
    authority_ref: receipt.authority_ref, authority_ref_head_sha: receipt.authority_ref_head_sha, operation_id: receipt.operation_id,
    predecessor_receipt_id: receipt.predecessor_receipt_id, command_id: receipt.command_id, task_id: receipt.task_id,
    idempotency_key: receipt.idempotency_key, execution_class: receipt.execution_class, execution_order: receipt.execution_order,
    priority: receipt.priority, not_before: receipt.not_before, not_after: receipt.not_after, lane: receipt.lane, owner_path: receipt.owner_path,
    delegation_id: receipt.delegation_id, objective_id: receipt.objective_id, control_ref: receipt.control_ref, control_head: receipt.control_head,
    executor_kind: receipt.executor_kind, payload_digest: receipt.payload_digest, dependency_receipt_ids: receipt.dependency_receipt_ids
  };
  validateA01AdmissionRequest(request);
  if (a01AdmissionRequestDigest(request) !== receipt.request_digest) fail('A01_RECEIPT_REQUEST_DIGEST_MISMATCH', 'receipt request digest mismatch');
  if (computeA01AdmissionDigest(receipt) !== receipt.admission_digest) fail('A01_RECEIPT_DIGEST_MISMATCH', 'admission receipt digest mismatch');
  return true;
}

export function computeA01SupervisorHandoffDigest(handoff) { return sha256(without(handoff, 'handoff_digest')); }

export function buildA01SupervisorHandoff({ request, admissionReceipt, payload = {} }) {
  validateA01AdmissionRequest(request);
  validateA01AdmissionReceipt(admissionReceipt);
  if (admissionReceipt.request_digest !== a01AdmissionRequestDigest(request)) fail('A01_HANDOFF_REQUEST_MISMATCH', 'admission receipt is not bound to request');
  if (sha256(payload) !== request.payload_digest) fail('A01_HANDOFF_PAYLOAD_MISMATCH', 'payload digest mismatch');
  const handoff = {
    protocol_version: A01_SUPERVISOR_HANDOFF_PROTOCOL,
    admission_receipt: structuredClone(admissionReceipt),
    scheduling_owner: 'A01_SUPERVISOR',
    github_role: 'ADMISSION_TRANSPORT_EVIDENCE_ONLY',
    lane: request.lane,
    owner_path: request.owner_path,
    delegation_id: request.delegation_id,
    objective_id: request.objective_id,
    control_ref: request.control_ref,
    control_head: request.control_head,
    idempotency_key: request.idempotency_key,
    executor_kind: request.executor_kind,
    execution_class: request.execution_class,
    execution_order: request.execution_order,
    priority: request.priority,
    not_before: request.not_before,
    not_after: request.not_after,
    payload_digest: request.payload_digest,
    payload: structuredClone(payload),
    handoff_digest: ''
  };
  handoff.handoff_digest = computeA01SupervisorHandoffDigest(handoff);
  return Object.freeze(handoff);
}

export function validateA01SupervisorHandoff(handoff) {
  strict(handoff, ['protocol_version','admission_receipt','scheduling_owner','github_role','lane','owner_path','delegation_id','objective_id','control_ref','control_head','idempotency_key','executor_kind','execution_class','execution_order','priority','not_before','not_after','payload_digest','payload','handoff_digest'], 'a01_supervisor_handoff');
  if (handoff.protocol_version !== A01_SUPERVISOR_HANDOFF_PROTOCOL) fail('A01_HANDOFF_PROTOCOL_INVALID', 'handoff protocol mismatch');
  validateA01AdmissionReceipt(handoff.admission_receipt);
  if (handoff.scheduling_owner !== 'A01_SUPERVISOR' || handoff.github_role !== 'ADMISSION_TRANSPORT_EVIDENCE_ONLY') fail('A01_SCHEDULER_AUTHORITY_INVALID', 'handoff would create a competing scheduler');
  for (const key of ['lane','owner_path','delegation_id','objective_id','idempotency_key','executor_kind']) string(handoff[key], key, ID_RE);
  string(handoff.control_ref, 'control_ref', REF_RE); string(handoff.control_head, 'control_head', SHA1_RE);
  if (!EXECUTION_CLASSES.has(handoff.execution_class)) fail('A01_EXECUTION_CLASS_INVALID', 'unsupported execution class');
  if (!Number.isSafeInteger(handoff.execution_order) || handoff.execution_order < 0) fail('A01_ORDER_INVALID', 'execution order invalid');
  if (!Number.isSafeInteger(handoff.priority) || handoff.priority < 0 || handoff.priority > 1000) fail('A01_PRIORITY_INVALID', 'priority invalid');
  nullableIso(handoff.not_before, 'not_before'); nullableIso(handoff.not_after, 'not_after');
  string(handoff.payload_digest, 'payload_digest', SHA256_RE); string(handoff.handoff_digest, 'handoff_digest', SHA256_RE);
  if (sha256(handoff.payload) !== handoff.payload_digest) fail('A01_HANDOFF_PAYLOAD_MISMATCH', 'payload digest mismatch');
  const receipt = handoff.admission_receipt;
  for (const key of ['lane','owner_path','delegation_id','objective_id','control_ref','control_head','idempotency_key','executor_kind','execution_class','execution_order','priority','not_before','not_after','payload_digest']) {
    if (canonicalize(handoff[key]) !== canonicalize(receipt[key])) fail('A01_HANDOFF_RECEIPT_MISMATCH', `handoff.${key} differs from admission receipt`);
  }
  if (computeA01SupervisorHandoffDigest(handoff) !== handoff.handoff_digest) fail('A01_HANDOFF_DIGEST_MISMATCH', 'handoff digest mismatch');
  return true;
}
