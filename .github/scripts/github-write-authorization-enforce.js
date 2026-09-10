'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const fail = (code, detail = '') => {
  const err = new Error(detail ? `${code}:${detail}` : code);
  err.code = code;
  throw err;
};
const isSha = (v) => /^[0-9a-f]{40}$/i.test(String(v || ''));
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');

const policy = readJson('governance/github/CANONICAL-WRITER-POLICY-001.json');
const leaseSchema = readJson('governance/github/GITHUB-WORK-LEASE-SCHEMA-001.json');
const opSchema = readJson('governance/github/GITHUB-OPERATION-LEDGER-SCHEMA-001.json');
const topology = readJson('governance/SYSTEM-TOPOLOGY-003.json');

function canonicalRefs() {
  const refs = new Set([policy.canonical_ref_discovery.product_ref]);
  for (const s of topology.canonical_internal_systems || []) {
    if (s && s.control_ref) refs.add(String(s.control_ref));
  }
  return refs;
}

function pathMatches(pattern, candidate) {
  const p = norm(pattern);
  const c = norm(candidate);
  if (p.endsWith('/**')) return c === p.slice(0, -3) || c.startsWith(p.slice(0, -2));
  if (p.includes('*')) {
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(c);
  }
  return p === c;
}

function pathAllowed(allowedPatterns, candidate) {
  return (allowedPatterns || []).some((p) => pathMatches(p, candidate));
}

function requiresUserAuthority(paths, effect) {
  const userEffects = new Set(leaseSchema.effect_classes?.USER_REQUIRED || []);
  if (userEffects.has(effect)) return true;
  const userPaths = policy.protected_path_classes?.USER_REQUIRED || [];
  return (paths || []).some((p) => userPaths.some((rule) => pathMatches(rule, p)));
}

function validateLease(lease, now = new Date()) {
  for (const field of leaseSchema.required_fields || []) {
    if (lease[field] === undefined || lease[field] === null || lease[field] === '') fail('MISSING_WORK_LEASE', field);
  }
  if (!isSha(lease.base_sha) || !isSha(lease.owner_control_head)) fail('MISSING_WORK_LEASE', 'invalid SHA binding');
  if (!Number.isInteger(lease.fence_epoch) || lease.fence_epoch < 1) fail('MISSING_REPOSITORY_WRITER_FENCE', 'invalid lease epoch');
  if (!Array.isArray(lease.allowed_paths) || !Array.isArray(lease.allowed_effects) || !Array.isArray(lease.forbidden_effects)) fail('MISSING_WORK_LEASE', 'effect/path arrays');
  if (!(leaseSchema.authorization_classes || []).includes(lease.authorization_class)) fail('MISSING_WORK_LEASE', 'authorization_class');
  const expires = new Date(lease.expires_at);
  if (Number.isNaN(expires.getTime()) || expires <= now) fail('LEASE_EXPIRED');
  if (lease.state === 'REVOKED') fail('LEASE_REVOKED');
  if (canonicalRefs().has(lease.candidate_branch)) fail('USER_AUTHORITY_REQUIRED', 'candidate branch cannot be canonical');
  return true;
}

function validateOperation(op) {
  for (const field of opSchema.required_fields || []) {
    if (op[field] === undefined || op[field] === null || op[field] === '') fail('MISSING_WORK_LEASE', `operation.${field}`);
  }
  if (!isSha(op.expected_base_sha)) fail('STALE_BASE', 'invalid expected_base_sha');
  if (!Number.isInteger(op.fence_epoch) || op.fence_epoch < 1) fail('MISSING_REPOSITORY_WRITER_FENCE');
  if (!Array.isArray(op.paths)) op.paths = [];
  return true;
}

function authorize({ lease, operation: op, context }) {
  const now = new Date(context.now || Date.now());
  validateLease(lease, now);
  validateOperation(op);

  if (op.work_session_id !== lease.work_session_id) fail('MISSING_WORK_LEASE', 'work_session_id');
  if (op.owner_lane !== lease.owner_lane) fail('OWNER_MISMATCH');
  if (op.objective_id !== lease.objective_id) fail('OBJECTIVE_MISMATCH');
  if (context.current_owner_control_ref !== lease.owner_control_ref) fail('CONTROL_HEAD_STALE', 'control_ref');
  if (context.current_owner_control_head !== lease.owner_control_head) fail('CONTROL_HEAD_STALE', 'control_head');

  for (const p of op.paths) {
    if (!pathAllowed(lease.allowed_paths, p)) fail('PATH_OUTSIDE_LEASE', p);
  }
  if (!lease.allowed_effects.includes(op.effect)) fail('EFFECT_OUTSIDE_LEASE', op.effect);
  if (lease.forbidden_effects.includes(op.effect)) fail('EFFECT_OUTSIDE_LEASE', `forbidden:${op.effect}`);

  if (requiresUserAuthority(op.paths, op.effect) && lease.authorization_class !== 'USER_REQUIRED') {
    fail('USER_AUTHORITY_REQUIRED');
  }

  const targetRef = String(op.target_ref || lease.candidate_branch);
  const isCanonical = canonicalRefs().has(targetRef);
  const mutation = op.operation_class === 'GIT_WRITE' || op.operation_class === 'ADMISSION';

  if (op.force === true) fail('FORCE_MUTATION_FORBIDDEN');

  if (mutation) {
    if (op.fence_epoch !== lease.fence_epoch) fail('STALE_FENCE_EPOCH', 'lease mismatch');
    if (op.fence_epoch !== context.current_repository_writer_epoch) fail('STALE_FENCE_EPOCH', 'not current writer');
  }

  if (isCanonical) {
    if (op.operation_class !== 'ADMISSION') fail('USER_AUTHORITY_REQUIRED', 'canonical mutation must use admission');
    if (context.actor_class !== 'CONTROLLER') fail('USER_AUTHORITY_REQUIRED', 'chat cannot admit canonical ref');
    if (context.owner_lane_lease_valid !== true) fail('MISSING_WORK_LEASE', 'owner lane lease');
    if (context.repository_writer_lease_valid !== true) fail('MISSING_REPOSITORY_WRITER_FENCE');
    if (context.live_target_sha !== op.expected_base_sha) fail('STALE_BASE');
    if (context.qualified_candidate !== true) fail('UNQUALIFIED_CANDIDATE');
  } else {
    if (targetRef !== lease.candidate_branch) fail('PATH_OUTSIDE_LEASE', `branch:${targetRef}`);
  }

  return {
    decision: 'AUTHORIZED',
    owner_lane: lease.owner_lane,
    objective_id: lease.objective_id,
    target_ref: targetRef,
    canonical: isCanonical,
    fence_epoch: op.fence_epoch,
    expected_base_sha: op.expected_base_sha
  };
}

function expectFailure(code, fn) {
  try { fn(); } catch (e) {
    if (e.code === code || String(e.message).startsWith(code)) return true;
    throw e;
  }
  throw new Error(`EXPECTED_FAILURE_NOT_OBSERVED:${code}`);
}

function selftest() {
  const now = new Date('2026-09-10T22:00:00Z');
  const base = 'a'.repeat(40);
  const control = 'b'.repeat(40);
  const lease = {
    work_session_id: 'session-1', owner_lane: 'DOCUMENTS', objective_id: 'OBJ-1',
    candidate_branch: 'work/documents/session-1', base_sha: base,
    owner_control_ref: 'documents/control-v1', owner_control_head: control,
    fence_epoch: 8, allowed_paths: ['documents/**', 'governance/second-shift/DOCUMENTS-DELEGATIONS.json'],
    allowed_effects: ['WRITE_CANDIDATE_BRANCH', 'PROMOTE_CANDIDATE_FAST_FORWARD'],
    forbidden_effects: ['REPLACE_CENTRAL_OBJECTIVE', 'CROSS_OWNER_CANONICAL_WRITE'],
    authorization_class: 'AUTONOMOUS', issued_at: '2026-09-10T21:00:00Z',
    expires_at: '2026-09-11T01:00:00Z', issued_by: 'SYSTEM_MASTER_CONTROLLER', state: 'ACTIVE'
  };
  const op = {
    operation_id: 'op-1', idempotency_key: 'idem-1', owner_lane: 'DOCUMENTS', objective_id: 'OBJ-1',
    work_session_id: 'session-1', operation_class: 'GIT_WRITE', resource: 'repo', expected_base_sha: base,
    fence_epoch: 8, payload_sha256: 'c'.repeat(64), priority: 10, attempt: 1, state: 'READY',
    created_at: now.toISOString(), updated_at: now.toISOString(), effect: 'WRITE_CANDIDATE_BRANCH',
    target_ref: 'work/documents/session-1', paths: ['documents/example.txt'], force: false
  };
  const ctx = {
    now: now.toISOString(), current_owner_control_ref: 'documents/control-v1', current_owner_control_head: control,
    current_repository_writer_epoch: 8, actor_class: 'CHAT', owner_lane_lease_valid: true,
    repository_writer_lease_valid: true, live_target_sha: base, qualified_candidate: false
  };

  const candidate = authorize({ lease: structuredClone(lease), operation: structuredClone(op), context: { ...ctx } });
  if (!candidate || candidate.canonical) throw new Error('CANDIDATE_AUTHORIZATION_FAILED');

  expectFailure('OWNER_MISMATCH', () => authorize({ lease: structuredClone(lease), operation: { ...structuredClone(op), owner_lane: 'BOOK' }, context: { ...ctx } }));
  expectFailure('STALE_FENCE_EPOCH', () => authorize({ lease: structuredClone(lease), operation: { ...structuredClone(op), fence_epoch: 7 }, context: { ...ctx } }));
  expectFailure('LEASE_EXPIRED', () => authorize({ lease: structuredClone(lease), operation: structuredClone(op), context: { ...ctx, now: '2026-09-12T00:00:00Z' } }));
  expectFailure('USER_AUTHORITY_REQUIRED', () => authorize({ lease: structuredClone(lease), operation: { ...structuredClone(op), operation_class: 'ADMISSION', target_ref: 'main', effect: 'PROMOTE_CANDIDATE_FAST_FORWARD' }, context: { ...ctx, actor_class: 'CHAT', qualified_candidate: true } }));

  const controllerLease = { ...structuredClone(lease), authorization_class: 'CONTROLLER_ADMITTED' };
  const admitOp = { ...structuredClone(op), operation_class: 'ADMISSION', target_ref: 'main', effect: 'PROMOTE_CANDIDATE_FAST_FORWARD' };
  const admitCtx = { ...ctx, actor_class: 'CONTROLLER', qualified_candidate: true };
  const admitted = authorize({ lease: controllerLease, operation: admitOp, context: admitCtx });
  if (!admitted.canonical) throw new Error('CANONICAL_ADMISSION_NOT_RECOGNIZED');
  expectFailure('STALE_BASE', () => authorize({ lease: controllerLease, operation: admitOp, context: { ...admitCtx, live_target_sha: 'd'.repeat(40) } }));
  expectFailure('FORCE_MUTATION_FORBIDDEN', () => authorize({ lease: controllerLease, operation: { ...admitOp, force: true }, context: admitCtx }));

  const userPathLease = { ...structuredClone(lease), allowed_paths: ['.github/workflows/**'], allowed_effects: ['WRITE_CANDIDATE_BRANCH'] };
  const userPathOp = { ...structuredClone(op), paths: ['.github/workflows/unsafe.yml'] };
  expectFailure('USER_AUTHORITY_REQUIRED', () => authorize({ lease: userPathLease, operation: userPathOp, context: ctx }));

  console.log(JSON.stringify({
    status: 'PASS',
    canonical_refs: [...canonicalRefs()],
    tests: {
      autonomous_candidate_work_allowed: true,
      owner_mismatch_rejected: true,
      stale_fence_rejected: true,
      expired_lease_rejected: true,
      chat_canonical_write_rejected: true,
      controller_two_lock_admission_allowed: true,
      stale_base_rejected: true,
      force_mutation_rejected: true,
      workflow_security_change_requires_user_authority: true
    }
  }, null, 2));
}

if (require.main === module) {
  const mode = process.argv[2] || 'selftest';
  if (mode === 'selftest') selftest();
  else if (mode === 'authorize') {
    const lease = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const operation = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
    const context = JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
    console.log(JSON.stringify(authorize({ lease, operation, context }), null, 2));
  } else fail('UNKNOWN_MODE', mode);
}

module.exports = { authorize, canonicalRefs, validateLease, validateOperation, requiresUserAuthority };
