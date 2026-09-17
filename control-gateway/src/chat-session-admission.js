import { canonicalize, sha256 } from './active-work-state.js';

export const CHAT_SESSION_ADMISSION_PROTOCOL =
  'control-gateway.chat-session-admission.v1';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;

export class ChatSessionAdmissionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ChatSessionAdmissionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ChatSessionAdmissionError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function requiredString(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !ID_RE.test(value)
  ) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      `${label} must be a non-empty identifier`
    );
  }

  return value;
}

function validateExactPath(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      `${label} must be a non-empty path`
    );
  }

  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    fail(
      'SESSION_CLAIM_SCOPE_INVALID',
      `${label} is unsafe`
    );
  }

  const segments = value.split('/');

  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('*')
    )
  ) {
    fail(
      'SESSION_CLAIM_SCOPE_INVALID',
      `${label} must be an exact normalized path`
    );
  }

  return value;
}

function validateUniqueArray(values, label, validator) {
  if (!Array.isArray(values)) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      `${label} must be an array`
    );
  }

  const seen = new Set();

  for (const value of values) {
    validator(value, `${label}[]`);

    if (seen.has(value)) {
      fail(
        'SESSION_CLAIM_SCHEMA_INVALID',
        `${label} contains duplicate ${value}`
      );
    }

    seen.add(value);
  }
}

function validateClaimScope(scope) {
  if (!isPlainObject(scope)) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      'claim_scope must be an object'
    );
  }

  const keys = Object.keys(scope).sort();

  if (canonicalize(keys) !== canonicalize(['effects', 'paths'])) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      'claim_scope must contain exactly paths and effects'
    );
  }

  validateUniqueArray(
    scope.paths,
    'claim_scope.paths',
    validateExactPath
  );

  validateUniqueArray(
    scope.effects,
    'claim_scope.effects',
    requiredString
  );

  if (scope.paths.length + scope.effects.length === 0) {
    fail(
      'SESSION_CLAIM_SCOPE_EMPTY',
      'claim_scope must contain at least one path or effect'
    );
  }
}

function validateClaim(claim) {
  if (!isPlainObject(claim)) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      'claim must be an object'
    );
  }

  const allowed = [
    'session_id',
    'owner_path',
    'workstream_id',
    'operation_id',
    'authority_epoch',
    'claim_scope'
  ];

  for (const key of Object.keys(claim)) {
    if (!allowed.includes(key)) {
      fail(
        'SESSION_CLAIM_SCHEMA_INVALID',
        `claim.${key} is not allowed`
      );
    }
  }

  for (const key of allowed) {
    if (!(key in claim)) {
      fail(
        'SESSION_CLAIM_SCHEMA_INVALID',
        `claim.${key} is required`
      );
    }
  }

  requiredString(claim.session_id, 'session_id');
  requiredString(claim.owner_path, 'owner_path');
  requiredString(claim.workstream_id, 'workstream_id');
  requiredString(claim.operation_id, 'operation_id');

  if (
    !Number.isSafeInteger(claim.authority_epoch) ||
    claim.authority_epoch < 1
  ) {
    fail(
      'SESSION_CLAIM_SCHEMA_INVALID',
      'authority_epoch must be a positive safe integer'
    );
  }

  validateClaimScope(claim.claim_scope);

  return true;
}

function normalizeClaim(claim) {
  const normalized = structuredClone(claim);
  normalized.claim_scope.paths.sort();
  normalized.claim_scope.effects.sort();
  return normalized;
}

export function chatSessionClaimDigest(claim) {
  validateClaim(claim);
  return sha256(normalizeClaim(claim));
}

function allowedPathMatches(path, allowedPattern) {
  if (allowedPattern.endsWith('/**')) {
    const prefix = allowedPattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  return path === allowedPattern;
}

function assertScopeWithinAuthority(continuation, claim) {
  const allowed = continuation.allowed_paths_or_effects;

  if (
    !allowed ||
    !Array.isArray(allowed.paths) ||
    !Array.isArray(allowed.effects)
  ) {
    fail(
      'SESSION_AUTHORITY_INVALID',
      'durable authority has invalid allowed scope'
    );
  }

  for (const path of claim.claim_scope.paths) {
    if (
      !allowed.paths.some(
        (pattern) => allowedPathMatches(path, pattern)
      )
    ) {
      fail(
        'SESSION_SCOPE_EXCEEDS_AUTHORITY',
        `path ${path} exceeds durable allowed scope`
      );
    }
  }

  for (const effect of claim.claim_scope.effects) {
    if (!allowed.effects.includes(effect)) {
      fail(
        'SESSION_SCOPE_EXCEEDS_AUTHORITY',
        `effect ${effect} exceeds durable allowed scope`
      );
    }
  }
}

function authorizedOperation(continuation) {
  const current = continuation.current_operation;

  if (
    current &&
    current.state === 'ACTIVE' &&
    typeof current.operation_id === 'string'
  ) {
    return current.operation_id;
  }

  const next = continuation.next_legal_operation;

  if (
    current?.state === 'TERMINAL' &&
    next?.kind === 'START_SUCCESSOR' &&
    typeof next.operation_id === 'string'
  ) {
    return next.operation_id;
  }

  fail(
    'SESSION_OPERATION_NOT_ADMISSIBLE',
    'durable authority has no mutation-admissible operation'
  );
}

function assertAuthorityBinding(continuation, claim) {
  if (!isPlainObject(continuation)) {
    fail(
      'SESSION_AUTHORITY_INVALID',
      'reconstruction adapter returned invalid continuation'
    );
  }

  if (claim.workstream_id !== continuation.workstream_id) {
    fail(
      'SESSION_WORKSTREAM_MISMATCH',
      'claim workstream does not match durable authority'
    );
  }

  if (claim.authority_epoch !== continuation.authority_epoch) {
    fail(
      'SESSION_AUTHORITY_EPOCH_MISMATCH',
      'claim authority epoch is stale or mismatched'
    );
  }

  if (claim.operation_id !== authorizedOperation(continuation)) {
    fail(
      'SESSION_OPERATION_MISMATCH',
      'claim operation does not match the admissible durable operation'
    );
  }

  assertScopeWithinAuthority(continuation, claim);
}

function pathsOverlap(left, right) {
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  );
}

function scopesOverlap(left, right) {
  for (const leftPath of left.paths) {
    for (const rightPath of right.paths) {
      if (pathsOverlap(leftPath, rightPath)) return true;
    }
  }

  const rightEffects = new Set(right.effects);

  return left.effects.some(
    (effect) => rightEffects.has(effect)
  );
}

function laneKey(claim) {
  return [
    claim.owner_path,
    claim.workstream_id,
    claim.operation_id
  ].join('\n');
}

function makeGrant(claim, digest, idempotent) {
  return Object.freeze({
    protocol_version: CHAT_SESSION_ADMISSION_PROTOCOL,
    decision: 'GRANTED',
    session_id: claim.session_id,
    owner_path: claim.owner_path,
    workstream_id: claim.workstream_id,
    operation_id: claim.operation_id,
    authority_epoch: claim.authority_epoch,
    claim_scope: structuredClone(claim.claim_scope),
    claim_digest: digest,
    idempotent
  });
}

function makeDenied(claim, digest, existing) {
  return Object.freeze({
    protocol_version: CHAT_SESSION_ADMISSION_PROTOCOL,
    decision: 'DENIED_ALREADY_CLAIMED',
    session_id: claim.session_id,
    owner_path: claim.owner_path,
    workstream_id: claim.workstream_id,
    operation_id: claim.operation_id,
    authority_epoch: claim.authority_epoch,
    claim_scope: structuredClone(claim.claim_scope),
    claim_digest: digest,
    conflicting_claim_digest: existing.claim_digest
  });
}

export class InMemoryChatSessionClaimStore {
  constructor() {
    this.claims = new Map();
  }

  values() {
    return [...this.claims.values()];
  }

  get(key) {
    return this.claims.get(key) ?? null;
  }

  put(key, value) {
    this.claims.set(key, value);
  }
}

export class ChatSessionAdmissionGate {
  constructor({
    reconstructionAdapter,
    claimStore = new InMemoryChatSessionClaimStore()
  }) {
    if (
      !reconstructionAdapter ||
      typeof reconstructionAdapter.reconstructContinuation !== 'function'
    ) {
      throw new TypeError(
        'reconstructionAdapter.reconstructContinuation function required'
      );
    }

    if (
      !claimStore ||
      typeof claimStore.get !== 'function' ||
      typeof claimStore.put !== 'function' ||
      typeof claimStore.values !== 'function'
    ) {
      throw new TypeError(
        'claimStore get/put/values functions required'
      );
    }

    this.reconstructionAdapter = reconstructionAdapter;
    this.claimStore = claimStore;
  }

  async acquire(claim) {
    validateClaim(claim);

    const normalized = normalizeClaim(claim);
    const digest = chatSessionClaimDigest(normalized);

    const continuation =
      await this.reconstructionAdapter.reconstructContinuation();

    assertAuthorityBinding(continuation, normalized);

    const key = laneKey(normalized);
    const exactExisting = this.claimStore.get(key);

    if (exactExisting) {
      if (
        exactExisting.session_id === normalized.session_id &&
        exactExisting.claim_digest === digest
      ) {
        return makeGrant(normalized, digest, true);
      }

      return makeDenied(
        normalized,
        digest,
        exactExisting
      );
    }

    for (const existing of this.claimStore.values()) {
      if (
        existing.workstream_id !== normalized.workstream_id ||
        existing.operation_id !== normalized.operation_id
      ) {
        continue;
      }

      if (existing.session_id === normalized.session_id) {
        fail(
          'SESSION_CLAIM_IMMUTABLE',
          'session already holds a different claim for this operation'
        );
      }

      if (
        scopesOverlap(
          existing.claim_scope,
          normalized.claim_scope
        )
      ) {
        return makeDenied(
          normalized,
          digest,
          existing
        );
      }
    }

    const stored = Object.freeze({
      session_id: normalized.session_id,
      owner_path: normalized.owner_path,
      workstream_id: normalized.workstream_id,
      operation_id: normalized.operation_id,
      authority_epoch: normalized.authority_epoch,
      claim_scope: structuredClone(normalized.claim_scope),
      claim_digest: digest
    });

    this.claimStore.put(key, stored);

    return makeGrant(normalized, digest, false);
  }
}