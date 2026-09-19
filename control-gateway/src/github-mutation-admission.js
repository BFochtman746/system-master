import { canonicalize, sha256, CG001_MISSION_VERSION } from './active-work-state.js';

export const GITHUB_MUTATION_REQUEST_PROTOCOL = 'control-gateway.github-mutation-request.v1';
export const GITHUB_MUTATION_ADMISSION_PROTOCOL = 'control-gateway.github-mutation-admission.v1';

const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const TARGET_KINDS = new Set(['WORK_REF', 'AUTHORITY_STATE_REF']);
const DENIED_GITHUB_STATES = new Set(['DENIED', 'STALE']);
const RESERVED_STATE_PREFIX = 'control-gateway-state/active-work/';

export class GitHubMutationAdmissionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubMutationAdmissionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new GitHubMutationAdmissionError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictKeys(value, allowed, label) {
  if (!isPlainObject(value)) fail('MUTATION_SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('MUTATION_SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of allowed) if (!(key in value)) fail('MUTATION_SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('MUTATION_SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('MUTATION_SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}

function nullableId(value, label) {
  if (value === null) return null;
  return requiredString(value, label, ID_RE);
}

function validateSubject(subject, label = 'authoritative_subject') {
  strictKeys(subject, ['algorithm', 'oid'], label);
  if (subject.algorithm !== 'sha1' || !SHA1_RE.test(subject.oid ?? '')) fail('MUTATION_SCHEMA_INVALID', `${label} must be a lowercase SHA-1 Git subject`);
}

function validateExactPath(path, label = 'path') {
  requiredString(path, label);
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) fail('MUTATION_PATH_INVALID', `${label} is unsafe`);
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('*'))) fail('MUTATION_PATH_INVALID', `${label} must be an exact normalized repository path`);
}

function validateStringSet(values, label, itemValidator) {
  if (!Array.isArray(values)) fail('MUTATION_SCHEMA_INVALID', `${label} must be an array`);
  const seen = new Set();
  for (const value of values) {
    itemValidator(value, `${label}[]`);
    if (seen.has(value)) fail('MUTATION_SCHEMA_INVALID', `${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

function normalizeRequest(request) {
  const copy = structuredClone(request);
  copy.paths.sort();
  copy.effects.sort();
  return copy;
}

export function validateMutationRequest(request) {
  strictKeys(request, [
    'protocol_version', 'mutation_id', 'mission_version', 'workstream_id', 'authority_epoch',
    'authority_publication_commit_sha', 'authority_packet_digest', 'authoritative_subject',
    'repository', 'target_kind', 'target_ref', 'expected_predecessor_sha',
    'operation_id', 'predecessor_receipt_id', 'paths', 'effects'
  ], 'mutation_request');
  if (request.protocol_version !== GITHUB_MUTATION_REQUEST_PROTOCOL) fail('MUTATION_PROTOCOL_INVALID', 'mutation request protocol mismatch');
  requiredString(request.mutation_id, 'mutation_id', ID_RE);
  requiredString(request.mission_version, 'mission_version');
  requiredString(request.workstream_id, 'workstream_id', ID_RE);
  if (!Number.isSafeInteger(request.authority_epoch) || request.authority_epoch < 1) fail('MUTATION_SCHEMA_INVALID', 'authority_epoch must be positive');
  requiredString(request.authority_publication_commit_sha, 'authority_publication_commit_sha', SHA1_RE);
  requiredString(request.authority_packet_digest, 'authority_packet_digest', SHA256_RE);
  validateSubject(request.authoritative_subject);
  requiredString(request.repository, 'repository', REPO_RE);
  if (!TARGET_KINDS.has(request.target_kind)) fail('MUTATION_SCHEMA_INVALID', 'target_kind is unsupported');
  requiredString(request.target_ref, 'target_ref', REF_RE);
  requiredString(request.expected_predecessor_sha, 'expected_predecessor_sha', SHA1_RE);
  requiredString(request.operation_id, 'operation_id', ID_RE);
  nullableId(request.predecessor_receipt_id, 'predecessor_receipt_id');
  validateStringSet(request.paths, 'paths', validateExactPath);
  validateStringSet(request.effects, 'effects', (value, label) => requiredString(value, label, ID_RE));
  if (request.paths.length + request.effects.length === 0) fail('MUTATION_SCOPE_EMPTY', 'mutation request must declare at least one path or effect');
  return true;
}

export function mutationRequestDigest(request) {
  validateMutationRequest(request);
  return sha256(normalizeRequest(request));
}

function allowedPathMatches(path, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

function repositoryFromTransport(transport) {
  if (!transport || typeof transport.getRef !== 'function') throw new TypeError('mutationTransport.getRef function required');
  if (typeof transport.owner !== 'string' || typeof transport.repo !== 'string') throw new TypeError('mutationTransport owner/repo binding required');
  return `${transport.owner}/${transport.repo}`;
}

function continuationPacket(continuation) {
  if (!isPlainObject(continuation)) fail('AUTHORITY_RECONSTRUCTION_INVALID', 'reconstruction adapter returned no continuation');
  const required = [
    'publication_ref', 'publication_commit_sha', 'publication_revision', 'packet_digest', 'mission_version', 'workstream_id',
    'authority_epoch', 'authoritative_subject', 'repository', 'branch_or_ref', 'allowed_paths_or_effects',
    'current_operation', 'qualification_state', 'github_admission_state', 'next_legal_operation', 'successor_candidates'
  ];
  for (const key of required) if (!(key in continuation)) fail('AUTHORITY_RECONSTRUCTION_INVALID', `continuation.${key} is required for mutation admission`);
  return continuation;
}

function exactSubjectEqual(left, right) {
  return left?.algorithm === right?.algorithm && left?.oid === right?.oid;
}

function bindOperation(continuation, request) {
  const current = continuation.current_operation;
  if (current.state === 'ACTIVE') {
    if (request.operation_id !== current.operation_id || request.predecessor_receipt_id !== current.predecessor_receipt_id) fail('MUTATION_OPERATION_MISMATCH', 'request is not bound to the active operation');
    return;
  }
  if (current.state === 'BLOCKED') fail('MUTATION_OPERATION_BLOCKED', 'blocked operation cannot mutate GitHub');
  if (current.state !== 'TERMINAL') fail('MUTATION_OPERATION_MISMATCH', 'unsupported current operation state');
  const next = continuation.next_legal_operation;
  if (next.kind !== 'START_SUCCESSOR' || request.operation_id !== next.operation_id || request.predecessor_receipt_id !== next.predecessor_receipt_id) fail('MUTATION_OPERATION_MISMATCH', 'request is not the exact dependency-valid successor');
  const candidate = continuation.successor_candidates.find((item) => item.operation_id === next.operation_id);
  if (!candidate || candidate.predecessor_receipt_id !== next.predecessor_receipt_id) fail('MUTATION_OPERATION_MISMATCH', 'successor candidate is missing or predecessor-mismatched');
  if (DENIED_GITHUB_STATES.has(candidate.github_admission_state)) fail('MUTATION_GITHUB_STANDING_INVALID', 'successor candidate GitHub admission standing is denied or stale');
}

function assertAuthorityBindings(continuation, request, mutationTransport) {
  if (continuation.mission_version !== CG001_MISSION_VERSION || request.mission_version !== continuation.mission_version) fail('MUTATION_MISSION_MISMATCH', 'mission version mismatch');
  if (request.workstream_id !== continuation.workstream_id) fail('MUTATION_WORKSTREAM_MISMATCH', 'workstream mismatch');
  if (request.authority_epoch !== continuation.authority_epoch) fail('MUTATION_AUTHORITY_EPOCH_MISMATCH', 'authority epoch mismatch');
  if (request.authority_publication_commit_sha !== continuation.publication_commit_sha) fail('MUTATION_AUTHORITY_HEAD_MISMATCH', 'request does not bind the reconstructed publication head');
  if (request.authority_packet_digest !== continuation.packet_digest) fail('MUTATION_AUTHORITY_PACKET_MISMATCH', 'request does not bind the reconstructed packet digest');
  if (!exactSubjectEqual(request.authoritative_subject, continuation.authoritative_subject)) fail('MUTATION_AUTHORITY_SUBJECT_MISMATCH', 'authoritative subject mismatch');
  if (request.repository !== continuation.repository) fail('MUTATION_REPOSITORY_MISMATCH', 'request repository differs from durable authority');
  if (repositoryFromTransport(mutationTransport) !== continuation.repository) fail('MUTATION_TRANSPORT_REPOSITORY_MISMATCH', 'mutation transport targets a different repository');
  if (continuation.qualification_state !== 'PASSED') fail('MUTATION_QUALIFICATION_REQUIRED', 'durable authority is not qualified');
  if (DENIED_GITHUB_STATES.has(continuation.github_admission_state)) fail('MUTATION_GITHUB_STANDING_INVALID', 'durable GitHub admission standing is denied or stale');
  bindOperation(continuation, request);
}

function assertScope(continuation, request) {
  const allowed = continuation.allowed_paths_or_effects;
  if (!allowed || !Array.isArray(allowed.paths) || !Array.isArray(allowed.effects)) fail('AUTHORITY_RECONSTRUCTION_INVALID', 'continuation allowed scope is invalid');
  if (request.target_kind === 'WORK_REF') {
    if (request.target_ref !== continuation.branch_or_ref) fail('MUTATION_REF_MISMATCH', 'work mutation target ref differs from durable branch/ref');
    for (const path of request.paths) if (!allowed.paths.some((pattern) => allowedPathMatches(path, pattern))) fail('MUTATION_PATH_OUT_OF_SCOPE', `path ${path} is outside durable authority`);
    for (const effect of request.effects) if (!allowed.effects.includes(effect)) fail('MUTATION_EFFECT_OUT_OF_SCOPE', `effect ${effect} is outside durable authority`);
    return;
  }

  if (request.target_ref !== continuation.publication_ref) fail('MUTATION_REF_MISMATCH', 'authority-state mutation must target the reconstructed publication ref');
  if (!allowed.effects.includes('CONTROL_GATEWAY_STATE_PUBLICATION') || request.effects.length !== 1 || request.effects[0] !== 'CONTROL_GATEWAY_STATE_PUBLICATION') fail('MUTATION_EFFECT_OUT_OF_SCOPE', 'authority-state mutation requires the dedicated state-publication effect');
  for (const path of request.paths) {
    if (!path.startsWith(RESERVED_STATE_PREFIX)) fail('MUTATION_PATH_OUT_OF_SCOPE', `authority-state path ${path} is outside reserved state storage`);
    if (path !== `${RESERVED_STATE_PREFIX}head.json` && !path.startsWith(`${RESERVED_STATE_PREFIX}revisions/`)) fail('MUTATION_PATH_OUT_OF_SCOPE', `authority-state path ${path} is not a head or immutable revision path`);
  }
}

function withoutAdmissionDigest(receipt) {
  const copy = structuredClone(receipt);
  delete copy.admission_digest;
  return copy;
}

export function computeAdmissionDigest(receipt) {
  return sha256(withoutAdmissionDigest(receipt));
}

export function validateAdmissionReceipt(receipt) {
  strictKeys(receipt, [
    'protocol_version', 'decision', 'mutation_id', 'request_digest', 'mission_version', 'workstream_id', 'authority_epoch',
    'authority_publication_commit_sha', 'authority_packet_digest', 'authoritative_subject', 'repository', 'target_kind',
    'target_ref', 'observed_predecessor_sha', 'operation_id', 'predecessor_receipt_id', 'paths', 'effects',
    'executor_requirement', 'admission_digest'
  ], 'admission_receipt');
  if (receipt.protocol_version !== GITHUB_MUTATION_ADMISSION_PROTOCOL || receipt.decision !== 'GRANTED') fail('ADMISSION_RECEIPT_INVALID', 'receipt protocol/decision invalid');
  requiredString(receipt.request_digest, 'request_digest', SHA256_RE);
  requiredString(receipt.admission_digest, 'admission_digest', SHA256_RE);
  validateMutationRequest({
    protocol_version: GITHUB_MUTATION_REQUEST_PROTOCOL,
    mutation_id: receipt.mutation_id,
    mission_version: receipt.mission_version,
    workstream_id: receipt.workstream_id,
    authority_epoch: receipt.authority_epoch,
    authority_publication_commit_sha: receipt.authority_publication_commit_sha,
    authority_packet_digest: receipt.authority_packet_digest,
    authoritative_subject: receipt.authoritative_subject,
    repository: receipt.repository,
    target_kind: receipt.target_kind,
    target_ref: receipt.target_ref,
    expected_predecessor_sha: receipt.observed_predecessor_sha,
    operation_id: receipt.operation_id,
    predecessor_receipt_id: receipt.predecessor_receipt_id,
    paths: receipt.paths,
    effects: receipt.effects
  });
  if (receipt.executor_requirement !== 'EXACT_PREDECESSOR_CAS_REQUIRED') fail('ADMISSION_RECEIPT_INVALID', 'executor requirement is invalid');
  if (computeAdmissionDigest(receipt) !== receipt.admission_digest) fail('ADMISSION_RECEIPT_DIGEST_MISMATCH', 'admission receipt digest mismatch');
  return true;
}

function makeReceipt(request, continuation) {
  const normalized = normalizeRequest(request);
  const receipt = {
    protocol_version: GITHUB_MUTATION_ADMISSION_PROTOCOL,
    decision: 'GRANTED',
    mutation_id: normalized.mutation_id,
    request_digest: mutationRequestDigest(normalized),
    mission_version: normalized.mission_version,
    workstream_id: normalized.workstream_id,
    authority_epoch: normalized.authority_epoch,
    authority_publication_commit_sha: continuation.publication_commit_sha,
    authority_packet_digest: continuation.packet_digest,
    authoritative_subject: structuredClone(normalized.authoritative_subject),
    repository: normalized.repository,
    target_kind: normalized.target_kind,
    target_ref: normalized.target_ref,
    observed_predecessor_sha: normalized.expected_predecessor_sha,
    operation_id: normalized.operation_id,
    predecessor_receipt_id: normalized.predecessor_receipt_id,
    paths: normalized.paths,
    effects: normalized.effects,
    executor_requirement: 'EXACT_PREDECESSOR_CAS_REQUIRED',
    admission_digest: ''
  };
  receipt.admission_digest = computeAdmissionDigest(receipt);
  validateAdmissionReceipt(receipt);
  return Object.freeze(receipt);
}

export class GitHubMutationAdmissionGate {
  constructor({ reconstructionAdapter, mutationTransport }) {
    if (!reconstructionAdapter || typeof reconstructionAdapter.reconstructContinuation !== 'function') throw new TypeError('reconstructionAdapter.reconstructContinuation function required');
    repositoryFromTransport(mutationTransport);
    this.reconstructionAdapter = reconstructionAdapter;
    this.mutationTransport = mutationTransport;
  }

  async admit(request) {
    validateMutationRequest(request);
    const first = continuationPacket(await this.reconstructionAdapter.reconstructContinuation());
    assertAuthorityBindings(first, request, this.mutationTransport);
    assertScope(first, request);

    const refBefore = await this.mutationTransport.getRef(request.target_ref);
    if (!refBefore || refBefore.sha !== request.expected_predecessor_sha) fail('MUTATION_PREDECESSOR_MISMATCH', 'target ref does not equal expected predecessor SHA');

    const second = continuationPacket(await this.reconstructionAdapter.reconstructContinuation());
    if (second.publication_commit_sha !== first.publication_commit_sha || second.packet_digest !== first.packet_digest) fail('MUTATION_AUTHORITY_MOVED', 'durable authority changed during admission');
    const refAfter = await this.mutationTransport.getRef(request.target_ref);
    if (!refAfter || refAfter.sha !== refBefore.sha) fail('MUTATION_TARGET_MOVED', 'target ref changed during admission');

    return makeReceipt(request, first);
  }

  async verifyGrantFresh(receipt, request) {
    validateAdmissionReceipt(receipt);
    validateMutationRequest(request);
    if (receipt.request_digest !== mutationRequestDigest(request)) fail('ADMISSION_REQUEST_MISMATCH', 'receipt does not bind this request');
    if (receipt.admission_digest !== computeAdmissionDigest(receipt)) fail('ADMISSION_RECEIPT_DIGEST_MISMATCH', 'receipt digest mismatch');
    if (receipt.observed_predecessor_sha !== request.expected_predecessor_sha) fail('ADMISSION_REQUEST_MISMATCH', 'receipt predecessor differs from request');

    const continuation = continuationPacket(await this.reconstructionAdapter.reconstructContinuation());
    if (continuation.publication_commit_sha !== receipt.authority_publication_commit_sha || continuation.packet_digest !== receipt.authority_packet_digest) fail('ADMISSION_STALE', 'durable authority changed after admission');
    const ref = await this.mutationTransport.getRef(receipt.target_ref);
    if (!ref || ref.sha !== receipt.observed_predecessor_sha) fail('ADMISSION_STALE', 'target ref changed after admission');
    assertAuthorityBindings(continuation, request, this.mutationTransport);
    assertScope(continuation, request);
    return true;
  }
}
