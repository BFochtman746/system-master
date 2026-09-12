import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const ACTIVE_WORK_PROTOCOL = 'control-gateway.active-work.v1';
export const ACTIVE_WORK_STORE_PROTOCOL = 'control-gateway.active-work-store.v1';
export const CG001_MISSION_VERSION = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0';

const OPERATION_STATES = new Set(['ACTIVE', 'BLOCKED', 'TERMINAL']);
const QUALIFICATION_STATES = new Set(['NOT_REQUIRED', 'PENDING', 'PASSED', 'FAILED']);
const GITHUB_ADMISSION_STATES = new Set(['NOT_REQUIRED', 'PENDING', 'ADMITTED', 'DENIED', 'STALE']);
const A01_STATES = new Set(['NOT_REQUIRED', 'PENDING', 'QUEUED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'BLOCKED', 'STALE']);
const RECEIPT_OUTCOMES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'SUPERSEDED', 'BLOCKED']);
const NEXT_KINDS = new Set(['CONTINUE_CURRENT', 'RECONCILE_CURRENT', 'START_SUCCESSOR', 'NO_LEGAL_SUCCESSOR', 'AMBIGUOUS_SUCCESSORS']);
const WORKSTREAM_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export class ActiveWorkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ActiveWorkError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ActiveWorkError(code, message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictKeys(value, allowed, required = allowed, label = 'object') {
  if (!isPlainObject(value)) fail('SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of required) if (!(key in value)) fail('SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}

function optionalId(value, label) {
  if (value === null) return null;
  return requiredString(value, label, ID_RE);
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) fail('SCHEMA_INVALID', `${label} has unsupported value ${String(value)}`);
  return value;
}

function canonicalizeInner(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CANONICAL_INVALID', 'non-finite numbers are not canonical');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeInner).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeInner(value[key])}`).join(',')}}`;
  }
  fail('CANONICAL_INVALID', `unsupported canonical value type ${typeof value}`);
}

export function canonicalize(value) {
  return canonicalizeInner(value);
}

export function sha256(value) {
  const bytes = typeof value === 'string' ? value : canonicalize(value);
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function validateSubject(subject, label = 'authoritative_subject') {
  strictKeys(subject, ['algorithm', 'oid'], undefined, label);
  if (subject.algorithm === 'sha1') {
    if (!SHA1_RE.test(subject.oid ?? '')) fail('SUBJECT_INVALID', `${label}.oid must be lowercase SHA-1`);
  } else if (subject.algorithm === 'sha256') {
    if (!SHA256_RE.test(subject.oid ?? '')) fail('SUBJECT_INVALID', `${label}.oid must be lowercase SHA-256`);
  } else {
    fail('SUBJECT_INVALID', `${label}.algorithm must be sha1 or sha256`);
  }
  return subject;
}

function validateAllowedScope(scope) {
  strictKeys(scope, ['paths', 'effects'], undefined, 'allowed_paths_or_effects');
  if (!Array.isArray(scope.paths) || !Array.isArray(scope.effects)) fail('SCHEMA_INVALID', 'allowed scope paths/effects must be arrays');
  if (scope.paths.length + scope.effects.length === 0) fail('SCHEMA_INVALID', 'allowed scope cannot be empty');
  const seen = new Set();
  for (const path of scope.paths) {
    requiredString(path, 'allowed path');
    if (path.includes('..') || path.startsWith('/')) fail('SCOPE_INVALID', `unsafe allowed path ${path}`);
    if (seen.has(`p:${path}`)) fail('SCOPE_INVALID', `duplicate allowed path ${path}`);
    seen.add(`p:${path}`);
  }
  for (const effect of scope.effects) {
    requiredString(effect, 'allowed effect', ID_RE);
    if (seen.has(`e:${effect}`)) fail('SCOPE_INVALID', `duplicate allowed effect ${effect}`);
    seen.add(`e:${effect}`);
  }
}

function validateCurrentOperation(operation) {
  strictKeys(operation, ['operation_id', 'state', 'predecessor_receipt_id'], undefined, 'current_operation');
  requiredString(operation.operation_id, 'current_operation.operation_id', ID_RE);
  enumValue(operation.state, OPERATION_STATES, 'current_operation.state');
  optionalId(operation.predecessor_receipt_id, 'current_operation.predecessor_receipt_id');
}

function validateReceipt(receipt, label = 'receipt') {
  strictKeys(receipt, ['receipt_id', 'operation_id', 'outcome', 'satisfies_dependency', 'subject'], undefined, label);
  requiredString(receipt.receipt_id, `${label}.receipt_id`, ID_RE);
  requiredString(receipt.operation_id, `${label}.operation_id`, ID_RE);
  enumValue(receipt.outcome, RECEIPT_OUTCOMES, `${label}.outcome`);
  if (typeof receipt.satisfies_dependency !== 'boolean') fail('SCHEMA_INVALID', `${label}.satisfies_dependency must be boolean`);
  validateSubject(receipt.subject, `${label}.subject`);
}

function validateSuccessor(candidate, label = 'successor_candidate') {
  strictKeys(candidate, ['operation_id', 'predecessor_receipt_id', 'required_receipt_ids', 'qualification_state', 'github_admission_state', 'a01_state'], undefined, label);
  requiredString(candidate.operation_id, `${label}.operation_id`, ID_RE);
  requiredString(candidate.predecessor_receipt_id, `${label}.predecessor_receipt_id`, ID_RE);
  if (!Array.isArray(candidate.required_receipt_ids)) fail('SCHEMA_INVALID', `${label}.required_receipt_ids must be an array`);
  const seen = new Set();
  for (const id of candidate.required_receipt_ids) {
    requiredString(id, `${label}.required_receipt_id`, ID_RE);
    if (seen.has(id)) fail('DEPENDENCY_INVALID', `${label} duplicates required receipt ${id}`);
    seen.add(id);
  }
  enumValue(candidate.qualification_state, QUALIFICATION_STATES, `${label}.qualification_state`);
  enumValue(candidate.github_admission_state, GITHUB_ADMISSION_STATES, `${label}.github_admission_state`);
  enumValue(candidate.a01_state, A01_STATES, `${label}.a01_state`);
}

function validateDependencyGraph(graph, candidates) {
  strictKeys(graph, ['version', 'edges'], undefined, 'dependency_graph');
  if (!Number.isSafeInteger(graph.version) || graph.version < 1) fail('DEPENDENCY_INVALID', 'dependency_graph.version must be a positive safe integer');
  if (!Array.isArray(graph.edges)) fail('DEPENDENCY_INVALID', 'dependency_graph.edges must be an array');
  const edgeKeys = new Set();
  for (const edge of graph.edges) {
    strictKeys(edge, ['from_receipt_id', 'to_operation_id'], undefined, 'dependency_graph.edge');
    requiredString(edge.from_receipt_id, 'dependency_graph.edge.from_receipt_id', ID_RE);
    requiredString(edge.to_operation_id, 'dependency_graph.edge.to_operation_id', ID_RE);
    const key = `${edge.from_receipt_id}\n${edge.to_operation_id}`;
    if (edgeKeys.has(key)) fail('DEPENDENCY_INVALID', `duplicate dependency edge ${key}`);
    edgeKeys.add(key);
  }
  for (const candidate of candidates) {
    for (const receiptId of candidate.required_receipt_ids) {
      if (!edgeKeys.has(`${receiptId}\n${candidate.operation_id}`)) fail('DEPENDENCY_INVALID', `missing graph edge ${receiptId} -> ${candidate.operation_id}`);
    }
  }
}

function validateNext(next) {
  strictKeys(next, ['kind', 'operation_id', 'predecessor_receipt_id', 'reason'], undefined, 'next_legal_operation');
  enumValue(next.kind, NEXT_KINDS, 'next_legal_operation.kind');
  if (next.operation_id !== null) requiredString(next.operation_id, 'next_legal_operation.operation_id', ID_RE);
  if (next.predecessor_receipt_id !== null) requiredString(next.predecessor_receipt_id, 'next_legal_operation.predecessor_receipt_id', ID_RE);
  requiredString(next.reason, 'next_legal_operation.reason');
}

function validatePacketBase(packet) {
  strictKeys(packet, [
    'protocol_version', 'mission_version', 'workstream_id', 'authority_epoch', 'authority_rebind_receipt_id',
    'authoritative_subject', 'repository', 'branch_or_ref', 'allowed_paths_or_effects', 'dependency_graph',
    'qualification_state', 'github_admission_state', 'a01_state', 'current_operation', 'last_terminal_receipt',
    'receipt_index', 'successor_candidates', 'next_legal_operation'
  ], undefined, 'active_work_packet');
  if (packet.protocol_version !== ACTIVE_WORK_PROTOCOL) fail('PROTOCOL_INVALID', `protocol_version must be ${ACTIVE_WORK_PROTOCOL}`);
  requiredString(packet.mission_version, 'mission_version');
  requiredString(packet.workstream_id, 'workstream_id', WORKSTREAM_RE);
  if (!Number.isSafeInteger(packet.authority_epoch) || packet.authority_epoch < 1) fail('AUTHORITY_INVALID', 'authority_epoch must be a positive safe integer');
  optionalId(packet.authority_rebind_receipt_id, 'authority_rebind_receipt_id');
  validateSubject(packet.authoritative_subject);
  requiredString(packet.repository, 'repository', REPO_RE);
  requiredString(packet.branch_or_ref, 'branch_or_ref');
  validateAllowedScope(packet.allowed_paths_or_effects);
  enumValue(packet.qualification_state, QUALIFICATION_STATES, 'qualification_state');
  enumValue(packet.github_admission_state, GITHUB_ADMISSION_STATES, 'github_admission_state');
  enumValue(packet.a01_state, A01_STATES, 'a01_state');
  validateCurrentOperation(packet.current_operation);

  if (!Array.isArray(packet.receipt_index)) fail('SCHEMA_INVALID', 'receipt_index must be an array');
  const receipts = new Map();
  for (const receipt of packet.receipt_index) {
    validateReceipt(receipt, 'receipt_index[]');
    if (receipts.has(receipt.receipt_id)) fail('RECEIPT_CONFLICT', `duplicate receipt ${receipt.receipt_id}`);
    receipts.set(receipt.receipt_id, receipt);
  }

  if (packet.last_terminal_receipt !== null) {
    validateReceipt(packet.last_terminal_receipt, 'last_terminal_receipt');
    const indexed = receipts.get(packet.last_terminal_receipt.receipt_id);
    if (!indexed || canonicalize(indexed) !== canonicalize(packet.last_terminal_receipt)) fail('RECEIPT_CONFLICT', 'last_terminal_receipt must exactly match receipt_index');
  }
  if (packet.current_operation.state === 'TERMINAL') {
    if (!packet.last_terminal_receipt) fail('RECEIPT_REQUIRED', 'terminal current operation requires last_terminal_receipt');
    if (packet.last_terminal_receipt.operation_id !== packet.current_operation.operation_id) fail('RECEIPT_CONFLICT', 'last terminal receipt does not bind current operation');
  }

  if (!Array.isArray(packet.successor_candidates)) fail('SCHEMA_INVALID', 'successor_candidates must be an array');
  const candidateIds = new Set();
  for (const candidate of packet.successor_candidates) {
    validateSuccessor(candidate);
    if (candidateIds.has(candidate.operation_id)) fail('SUCCESSOR_CONFLICT', `duplicate successor ${candidate.operation_id}`);
    candidateIds.add(candidate.operation_id);
  }
  validateDependencyGraph(packet.dependency_graph, packet.successor_candidates);

  if (packet.authority_rebind_receipt_id !== null) {
    const receipt = receipts.get(packet.authority_rebind_receipt_id);
    if (!receipt || !receipt.satisfies_dependency || receipt.outcome !== 'SUCCEEDED') fail('AUTHORITY_INVALID', 'authority_rebind_receipt_id must reference a successful dependency-satisfying receipt');
  }
}

function reconcileReason(packet) {
  if (packet.qualification_state === 'FAILED') return 'QUALIFICATION_FAILED';
  if (packet.github_admission_state === 'DENIED') return 'GITHUB_ADMISSION_DENIED';
  if (packet.github_admission_state === 'STALE') return 'GITHUB_ADMISSION_STALE';
  if (packet.a01_state === 'BLOCKED') return 'A01_BLOCKED';
  if (packet.a01_state === 'STALE') return 'A01_STALE';
  return packet.current_operation.state === 'BLOCKED' ? 'CURRENT_OPERATION_BLOCKED' : null;
}

export function deriveNextLegalOperation(packet) {
  validatePacketBase(packet);
  const current = packet.current_operation;
  if (current.state !== 'TERMINAL') {
    const reason = reconcileReason(packet);
    if (reason) return deepFreeze({ kind: 'RECONCILE_CURRENT', operation_id: current.operation_id, predecessor_receipt_id: current.predecessor_receipt_id, reason });
    return deepFreeze({ kind: 'CONTINUE_CURRENT', operation_id: current.operation_id, predecessor_receipt_id: current.predecessor_receipt_id, reason: 'CURRENT_OPERATION_NONTERMINAL' });
  }

  const last = packet.last_terminal_receipt;
  const receipts = new Map(packet.receipt_index.map((receipt) => [receipt.receipt_id, receipt]));
  const eligible = packet.successor_candidates.filter((candidate) => {
    if (candidate.predecessor_receipt_id !== last.receipt_id) return false;
    return candidate.required_receipt_ids.every((id) => receipts.get(id)?.satisfies_dependency === true);
  });
  if (eligible.length === 0) return deepFreeze({ kind: 'NO_LEGAL_SUCCESSOR', operation_id: null, predecessor_receipt_id: last.receipt_id, reason: 'NO_DEPENDENCY_VALID_SUCCESSOR' });
  if (eligible.length > 1) return deepFreeze({ kind: 'AMBIGUOUS_SUCCESSORS', operation_id: null, predecessor_receipt_id: last.receipt_id, reason: 'MULTIPLE_DEPENDENCY_VALID_SUCCESSORS' });
  return deepFreeze({ kind: 'START_SUCCESSOR', operation_id: eligible[0].operation_id, predecessor_receipt_id: last.receipt_id, reason: 'EXACTLY_ONE_DEPENDENCY_VALID_SUCCESSOR' });
}

function normalizeCollections(packet) {
  packet.receipt_index.sort((a, b) => a.receipt_id.localeCompare(b.receipt_id));
  packet.successor_candidates.sort((a, b) => a.operation_id.localeCompare(b.operation_id));
  for (const candidate of packet.successor_candidates) candidate.required_receipt_ids.sort();
  packet.dependency_graph.edges.sort((a, b) => `${a.to_operation_id}\n${a.from_receipt_id}`.localeCompare(`${b.to_operation_id}\n${b.from_receipt_id}`));
  packet.allowed_paths_or_effects.paths.sort();
  packet.allowed_paths_or_effects.effects.sort();
  return packet;
}

export function finalizeActiveWorkPacket(input) {
  const packet = normalizeCollections(clone(input));
  packet.next_legal_operation = { kind: 'CONTINUE_CURRENT', operation_id: packet.current_operation?.operation_id ?? null, predecessor_receipt_id: packet.current_operation?.predecessor_receipt_id ?? null, reason: 'DERIVATION_PLACEHOLDER' };
  validatePacketBase(packet);
  packet.next_legal_operation = deriveNextLegalOperation(packet);
  validateActiveWorkPacket(packet);
  return deepFreeze(packet);
}

export function validateActiveWorkPacket(packet) {
  validatePacketBase(packet);
  validateNext(packet.next_legal_operation);
  const expected = deriveNextLegalOperation(packet);
  if (canonicalize(expected) !== canonicalize(packet.next_legal_operation)) fail('NEXT_OPERATION_MISMATCH', 'stored next_legal_operation differs from deterministic derivation');
  return true;
}

export function updateCurrentStanding(packet, patch) {
  validateActiveWorkPacket(packet);
  strictKeys(patch, ['qualification_state', 'github_admission_state', 'a01_state'], [], 'standing_patch');
  const next = clone(packet);
  if ('qualification_state' in patch) next.qualification_state = enumValue(patch.qualification_state, QUALIFICATION_STATES, 'standing_patch.qualification_state');
  if ('github_admission_state' in patch) next.github_admission_state = enumValue(patch.github_admission_state, GITHUB_ADMISSION_STATES, 'standing_patch.github_admission_state');
  if ('a01_state' in patch) next.a01_state = enumValue(patch.a01_state, A01_STATES, 'standing_patch.a01_state');
  return finalizeActiveWorkPacket(next);
}

export function transitionCurrentOperation(packet, { state, terminal_receipt = null, successor_candidates = undefined } = {}) {
  validateActiveWorkPacket(packet);
  enumValue(state, OPERATION_STATES, 'transition.state');
  const from = packet.current_operation.state;
  const allowed = from === 'ACTIVE' ? new Set(['BLOCKED', 'TERMINAL']) : from === 'BLOCKED' ? new Set(['ACTIVE', 'TERMINAL']) : new Set();
  if (!allowed.has(state)) fail('ILLEGAL_TRANSITION', `${from} -> ${state} is not allowed`);
  const next = clone(packet);
  next.current_operation.state = state;
  if (successor_candidates !== undefined) {
    if (!Array.isArray(successor_candidates)) fail('SCHEMA_INVALID', 'successor_candidates must be an array');
    next.successor_candidates = clone(successor_candidates);
  }
  if (state === 'TERMINAL') {
    if (!terminal_receipt) fail('RECEIPT_REQUIRED', 'terminal transition requires terminal_receipt');
    validateReceipt(terminal_receipt, 'terminal_receipt');
    if (terminal_receipt.operation_id !== packet.current_operation.operation_id) fail('RECEIPT_CONFLICT', 'terminal receipt operation does not match current operation');
    if (next.receipt_index.some((receipt) => receipt.receipt_id === terminal_receipt.receipt_id)) fail('RECEIPT_CONFLICT', `receipt ${terminal_receipt.receipt_id} already exists`);
    next.receipt_index.push(clone(terminal_receipt));
    next.last_terminal_receipt = clone(terminal_receipt);
  } else if (terminal_receipt !== null) {
    fail('RECEIPT_INVALID', 'terminal_receipt is only allowed for TERMINAL transition');
  }
  return finalizeActiveWorkPacket(next);
}

export function startNextLegalOperation(packet, { successor_candidates = [] } = {}) {
  validateActiveWorkPacket(packet);
  const nextLegal = deriveNextLegalOperation(packet);
  if (nextLegal.kind !== 'START_SUCCESSOR') fail('NEXT_OPERATION_NOT_STARTABLE', `cannot start successor while next action is ${nextLegal.kind}`);
  const candidate = packet.successor_candidates.find((item) => item.operation_id === nextLegal.operation_id);
  const next = clone(packet);
  next.current_operation = { operation_id: candidate.operation_id, state: 'ACTIVE', predecessor_receipt_id: candidate.predecessor_receipt_id };
  next.qualification_state = candidate.qualification_state;
  next.github_admission_state = candidate.github_admission_state;
  next.a01_state = candidate.a01_state;
  next.successor_candidates = clone(successor_candidates);
  return finalizeActiveWorkPacket(next);
}

export function rebindAuthority(packet, { authoritative_subject, repository = packet.repository, branch_or_ref = packet.branch_or_ref, allowed_paths_or_effects = packet.allowed_paths_or_effects, receipt_id } = {}) {
  validateActiveWorkPacket(packet);
  requiredString(receipt_id, 'receipt_id', ID_RE);
  const receipt = packet.receipt_index.find((item) => item.receipt_id === receipt_id);
  if (!receipt || receipt.outcome !== 'SUCCEEDED' || !receipt.satisfies_dependency) fail('AUTHORITY_REBIND_DENIED', 'authority rebind requires successful dependency-satisfying receipt');
  validateSubject(authoritative_subject, 'rebind.authoritative_subject');
  requiredString(repository, 'rebind.repository', REPO_RE);
  requiredString(branch_or_ref, 'rebind.branch_or_ref');
  validateAllowedScope(allowed_paths_or_effects);
  const next = clone(packet);
  next.authority_epoch += 1;
  next.authority_rebind_receipt_id = receipt_id;
  next.authoritative_subject = clone(authoritative_subject);
  next.repository = repository;
  next.branch_or_ref = branch_or_ref;
  next.allowed_paths_or_effects = clone(allowed_paths_or_effects);
  return finalizeActiveWorkPacket(next);
}

function authorityCore(packet) {
  return {
    authoritative_subject: packet.authoritative_subject,
    repository: packet.repository,
    branch_or_ref: packet.branch_or_ref,
    allowed_paths_or_effects: packet.allowed_paths_or_effects
  };
}

function assertAuthorityTransition(previous, next) {
  if (next.protocol_version !== previous.protocol_version || next.mission_version !== previous.mission_version || next.workstream_id !== previous.workstream_id) {
    fail('MISSION_DRIFT', 'protocol, mission version, and workstream identity are immutable within an active-work history');
  }
  const changed = canonicalize(authorityCore(previous)) !== canonicalize(authorityCore(next));
  if (!changed) {
    if (next.authority_epoch !== previous.authority_epoch || next.authority_rebind_receipt_id !== previous.authority_rebind_receipt_id) fail('AUTHORITY_DRIFT', 'authority epoch/rebind receipt changed without authority change');
    return;
  }
  if (next.authority_epoch !== previous.authority_epoch + 1) fail('AUTHORITY_DRIFT', 'authority change must increment authority_epoch exactly once');
  if (!next.authority_rebind_receipt_id) fail('AUTHORITY_DRIFT', 'authority change requires authority_rebind_receipt_id');
  const receipt = next.receipt_index.find((item) => item.receipt_id === next.authority_rebind_receipt_id);
  if (!receipt || receipt.outcome !== 'SUCCEEDED' || !receipt.satisfies_dependency) fail('AUTHORITY_DRIFT', 'authority rebind receipt is not successful and dependency-satisfying');
}

function envelopeDigest({ workstream_id, revision, predecessor_digest, packet }) {
  return sha256({ protocol: ACTIVE_WORK_STORE_PROTOCOL, workstream_id, revision, predecessor_digest, packet });
}

function parsePacket(raw) {
  let packet;
  try { packet = JSON.parse(raw); } catch { fail('STORE_CORRUPT', 'stored packet JSON is invalid'); }
  validateActiveWorkPacket(packet);
  return packet;
}

export class ActiveWorkStore {
  constructor(path = ':memory:', { timeout = 5000 } = {}) {
    this.db = new DatabaseSync(path, { timeout });
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS active_work_heads(
        workstream_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL CHECK(revision > 0),
        predecessor_digest TEXT,
        packet_digest TEXT NOT NULL,
        packet_json TEXT NOT NULL,
        written_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS active_work_history(
        workstream_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK(revision > 0),
        predecessor_digest TEXT,
        packet_digest TEXT NOT NULL,
        packet_json TEXT NOT NULL,
        written_at TEXT NOT NULL,
        PRIMARY KEY(workstream_id, revision)
      );
    `);
  }

  close() { this.db.close(); }

  pragmaState() {
    return {
      journal_mode: String(this.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(),
      synchronous: Number(this.db.prepare('PRAGMA synchronous').get().synchronous),
      integrity_check: String(this.db.prepare('PRAGMA integrity_check').get().integrity_check)
    };
  }

  atomic(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  putInitial(packet, { written_at = new Date().toISOString() } = {}) {
    validateActiveWorkPacket(packet);
    requiredString(written_at, 'written_at');
    return this.atomic(() => {
      const existing = this.db.prepare('SELECT 1 AS ok FROM active_work_heads WHERE workstream_id=?').get(packet.workstream_id);
      if (existing) fail('STORE_CONFLICT', `workstream ${packet.workstream_id} already exists`);
      const revision = 1;
      const predecessor_digest = null;
      const packet_digest = envelopeDigest({ workstream_id: packet.workstream_id, revision, predecessor_digest, packet });
      const packet_json = canonicalize(packet);
      this.db.prepare('INSERT INTO active_work_history VALUES (?,?,?,?,?,?)').run(packet.workstream_id, revision, predecessor_digest, packet_digest, packet_json, written_at);
      this.db.prepare('INSERT INTO active_work_heads VALUES (?,?,?,?,?,?)').run(packet.workstream_id, revision, predecessor_digest, packet_digest, packet_json, written_at);
      return this.read(packet.workstream_id);
    });
  }

  compareAndSwap(workstreamId, { expected_revision, expected_digest, packet, written_at = new Date().toISOString() } = {}) {
    requiredString(workstreamId, 'workstream_id', WORKSTREAM_RE);
    if (!Number.isSafeInteger(expected_revision) || expected_revision < 1) fail('STORE_CONFLICT', 'expected_revision must be positive');
    if (!SHA256_RE.test(expected_digest ?? '')) fail('STORE_CONFLICT', 'expected_digest must be lowercase SHA-256');
    validateActiveWorkPacket(packet);
    if (packet.workstream_id !== workstreamId) fail('STORE_CONFLICT', 'packet workstream differs from CAS key');
    requiredString(written_at, 'written_at');
    return this.atomic(() => {
      const row = this.db.prepare('SELECT * FROM active_work_heads WHERE workstream_id=?').get(workstreamId);
      if (!row) fail('STORE_NOT_FOUND', `workstream ${workstreamId} not found`);
      const previous = this.verifyRow(row);
      if (Number(row.revision) !== expected_revision || row.packet_digest !== expected_digest) fail('STORE_CONFLICT', 'active-work head changed before compare-and-swap');
      assertAuthorityTransition(previous.packet, packet);
      const revision = expected_revision + 1;
      const predecessor_digest = expected_digest;
      const packet_digest = envelopeDigest({ workstream_id: workstreamId, revision, predecessor_digest, packet });
      const packet_json = canonicalize(packet);
      this.db.prepare('INSERT INTO active_work_history VALUES (?,?,?,?,?,?)').run(workstreamId, revision, predecessor_digest, packet_digest, packet_json, written_at);
      const updated = this.db.prepare('UPDATE active_work_heads SET revision=?,predecessor_digest=?,packet_digest=?,packet_json=?,written_at=? WHERE workstream_id=? AND revision=? AND packet_digest=?')
        .run(revision, predecessor_digest, packet_digest, packet_json, written_at, workstreamId, expected_revision, expected_digest);
      if (Number(updated.changes) !== 1) fail('STORE_CONFLICT', 'active-work head changed during compare-and-swap');
      return this.read(workstreamId);
    });
  }

  verifyRow(row) {
    const packet = parsePacket(row.packet_json);
    if (packet.workstream_id !== row.workstream_id) fail('STORE_CORRUPT', 'stored packet workstream differs from row key');
    const actual = envelopeDigest({ workstream_id: row.workstream_id, revision: Number(row.revision), predecessor_digest: row.predecessor_digest, packet });
    if (actual !== row.packet_digest) fail('STORE_DIGEST_MISMATCH', `active-work digest mismatch at revision ${row.revision}`);
    return deepFreeze({
      workstream_id: row.workstream_id,
      revision: Number(row.revision),
      predecessor_digest: row.predecessor_digest,
      packet_digest: row.packet_digest,
      written_at: row.written_at,
      packet
    });
  }

  read(workstreamId) {
    requiredString(workstreamId, 'workstream_id', WORKSTREAM_RE);
    const row = this.db.prepare('SELECT * FROM active_work_heads WHERE workstream_id=?').get(workstreamId);
    if (!row) return null;
    return this.verifyRow(row);
  }

  history(workstreamId) {
    requiredString(workstreamId, 'workstream_id', WORKSTREAM_RE);
    const rows = this.db.prepare('SELECT * FROM active_work_history WHERE workstream_id=? ORDER BY revision').all(workstreamId);
    const result = [];
    let priorDigest = null;
    let expectedRevision = 1;
    for (const row of rows) {
      if (Number(row.revision) !== expectedRevision) fail('STORE_HISTORY_GAP', `expected revision ${expectedRevision}, got ${row.revision}`);
      if (row.predecessor_digest !== priorDigest) fail('STORE_HISTORY_FORK', `predecessor mismatch at revision ${row.revision}`);
      const verified = this.verifyRow(row);
      result.push(verified);
      priorDigest = verified.packet_digest;
      expectedRevision += 1;
    }
    return deepFreeze(result);
  }

  verify(workstreamId) {
    const pragma = this.pragmaState();
    if (pragma.integrity_check !== 'ok') fail('STORE_SQLITE_INTEGRITY', pragma.integrity_check);
    const history = this.history(workstreamId);
    const head = this.read(workstreamId);
    if (history.length === 0) {
      if (head !== null) fail('STORE_CORRUPT', 'head exists without history');
      return deepFreeze({ workstream_id: workstreamId, revisions: 0, head_digest: null, pragma });
    }
    const tail = history.at(-1);
    if (!head || head.revision !== tail.revision || head.packet_digest !== tail.packet_digest) fail('STORE_HEAD_MISMATCH', 'head does not match history tail');
    return deepFreeze({ workstream_id: workstreamId, revisions: history.length, head_digest: head.packet_digest, pragma });
  }
}
