import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ACTIVE_WORK_PROTOCOL,
  CG001_MISSION_VERSION,
  ActiveWorkError,
  ActiveWorkStore,
  deriveNextLegalOperation,
  finalizeActiveWorkPacket,
  rebindAuthority,
  startNextLegalOperation,
  transitionCurrentOperation,
  updateCurrentStanding,
  validateActiveWorkPacket
} from '../src/active-work-state.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

function subject(oid = SHA_A) {
  return { algorithm: 'sha1', oid };
}

function receipt(id, operationId, { outcome = 'SUCCEEDED', satisfies = true, oid = SHA_A } = {}) {
  return { receipt_id: id, operation_id: operationId, outcome, satisfies_dependency: satisfies, subject: subject(oid) };
}

function successor(operationId, predecessorReceiptId, requiredReceiptIds = [], states = {}) {
  return {
    operation_id: operationId,
    predecessor_receipt_id: predecessorReceiptId,
    required_receipt_ids: requiredReceiptIds,
    qualification_state: states.qualification_state ?? 'PENDING',
    github_admission_state: states.github_admission_state ?? 'PENDING',
    a01_state: states.a01_state ?? 'NOT_REQUIRED'
  };
}

function packet(options = {}) {
  const candidates = options.successor_candidates ?? [];
  const edges = options.dependency_edges ?? candidates.flatMap((candidate) => candidate.required_receipt_ids.map((id) => ({ from_receipt_id: id, to_operation_id: candidate.operation_id })));
  return finalizeActiveWorkPacket({
    protocol_version: ACTIVE_WORK_PROTOCOL,
    mission_version: CG001_MISSION_VERSION,
    workstream_id: options.workstream_id ?? 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: options.authority_epoch ?? 1,
    authority_rebind_receipt_id: options.authority_rebind_receipt_id ?? null,
    authoritative_subject: options.authoritative_subject ?? subject(),
    repository: options.repository ?? 'BFochtman746/system-master',
    branch_or_ref: options.branch_or_ref ?? 'second-shift-control-gateway/cg-003-active-work-state',
    allowed_paths_or_effects: options.allowed_paths_or_effects ?? { paths: ['control-gateway/**'], effects: ['CONTROL_GATEWAY_STATE_WRITE'] },
    dependency_graph: { version: options.dependency_graph_version ?? 1, edges },
    qualification_state: options.qualification_state ?? 'PENDING',
    github_admission_state: options.github_admission_state ?? 'PENDING',
    a01_state: options.a01_state ?? 'NOT_REQUIRED',
    current_operation: options.current_operation ?? { operation_id: 'CG-003', state: 'ACTIVE', predecessor_receipt_id: 'CG-002-RECEIPT' },
    last_terminal_receipt: options.last_terminal_receipt ?? null,
    receipt_index: options.receipt_index ?? [],
    successor_candidates: candidates,
    next_legal_operation: options.next_legal_operation ?? { kind: 'CONTINUE_CURRENT', operation_id: 'CG-003', predecessor_receipt_id: 'CG-002-RECEIPT', reason: 'placeholder' }
  });
}

function terminalPacket({ candidates = [], extraReceipts = [], terminalReceipt = receipt('CG-003-RECEIPT', 'CG-003'), edges = undefined } = {}) {
  return packet({
    current_operation: { operation_id: 'CG-003', state: 'TERMINAL', predecessor_receipt_id: 'CG-002-RECEIPT' },
    last_terminal_receipt: terminalReceipt,
    receipt_index: [...extraReceipts, terminalReceipt],
    successor_candidates: candidates,
    dependency_edges: edges
  });
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ActiveWorkError && error.code === code);
}

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'cg003-'));
  return { dir, path: join(dir, 'active-work.sqlite') };
}

test('active work packet derives CONTINUE_CURRENT for nonterminal work', () => {
  const p = packet();
  assert.equal(p.next_legal_operation.kind, 'CONTINUE_CURRENT');
  assert.equal(p.next_legal_operation.operation_id, 'CG-003');
  assert.equal(validateActiveWorkPacket(p), true);
});

test('qualification failure deterministically requires reconciliation', () => {
  assert.equal(packet({ qualification_state: 'FAILED' }).next_legal_operation.reason, 'QUALIFICATION_FAILED');
});

test('GitHub admission denial deterministically requires reconciliation', () => {
  const p = packet({ qualification_state: 'PASSED', github_admission_state: 'DENIED' });
  assert.equal(p.next_legal_operation.kind, 'RECONCILE_CURRENT');
  assert.equal(p.next_legal_operation.reason, 'GITHUB_ADMISSION_DENIED');
});

test('stale GitHub admission deterministically requires reconciliation', () => {
  assert.equal(packet({ qualification_state: 'PASSED', github_admission_state: 'STALE' }).next_legal_operation.reason, 'GITHUB_ADMISSION_STALE');
});

test('A-01 blocked and stale standing fail closed into reconciliation', () => {
  assert.equal(packet({ qualification_state: 'PASSED', github_admission_state: 'ADMITTED', a01_state: 'BLOCKED' }).next_legal_operation.reason, 'A01_BLOCKED');
  assert.equal(packet({ qualification_state: 'PASSED', github_admission_state: 'ADMITTED', a01_state: 'STALE' }).next_legal_operation.reason, 'A01_STALE');
});

test('blocked current operation remains current and requires reconciliation', () => {
  const p = packet({ current_operation: { operation_id: 'CG-003', state: 'BLOCKED', predecessor_receipt_id: 'CG-002-RECEIPT' }, qualification_state: 'PASSED', github_admission_state: 'ADMITTED' });
  assert.deepEqual(p.next_legal_operation, { kind: 'RECONCILE_CURRENT', operation_id: 'CG-003', predecessor_receipt_id: 'CG-002-RECEIPT', reason: 'CURRENT_OPERATION_BLOCKED' });
});

test('terminal work with no dependency-valid successor fails closed', () => {
  assert.equal(terminalPacket().next_legal_operation.kind, 'NO_LEGAL_SUCCESSOR');
});

test('exactly one predecessor-valid successor is startable', () => {
  const p = terminalPacket({ candidates: [successor('CG-004', 'CG-003-RECEIPT')] });
  assert.deepEqual(p.next_legal_operation, { kind: 'START_SUCCESSOR', operation_id: 'CG-004', predecessor_receipt_id: 'CG-003-RECEIPT', reason: 'EXACTLY_ONE_DEPENDENCY_VALID_SUCCESSOR' });
});

test('invalid predecessor candidate is ignored while exact candidate remains legal', () => {
  const p = terminalPacket({ candidates: [successor('WRONG', 'OTHER-RECEIPT'), successor('CG-004', 'CG-003-RECEIPT')] });
  assert.equal(p.next_legal_operation.operation_id, 'CG-004');
});

test('multiple dependency-valid successors are ambiguous and never guessed', () => {
  const p = terminalPacket({ candidates: [successor('CG-004A', 'CG-003-RECEIPT'), successor('CG-004B', 'CG-003-RECEIPT')] });
  assert.equal(p.next_legal_operation.kind, 'AMBIGUOUS_SUCCESSORS');
  assert.equal(p.next_legal_operation.operation_id, null);
});

test('missing dependency receipt prevents successor admission', () => {
  const p = terminalPacket({ candidates: [successor('CG-004', 'CG-003-RECEIPT', ['CG-001-RECEIPT'])] });
  assert.equal(p.next_legal_operation.kind, 'NO_LEGAL_SUCCESSOR');
});

test('dependency-satisfying receipt makes successor legal', () => {
  const dependency = receipt('CG-001-RECEIPT', 'CG-001');
  const p = terminalPacket({ extraReceipts: [dependency], candidates: [successor('CG-004', 'CG-003-RECEIPT', [dependency.receipt_id])] });
  assert.equal(p.next_legal_operation.operation_id, 'CG-004');
});

test('non-satisfying receipt does not unlock dependency', () => {
  const dependency = receipt('CG-001-RECEIPT', 'CG-001', { outcome: 'FAILED', satisfies: false });
  const p = terminalPacket({ extraReceipts: [dependency], candidates: [successor('CG-004', 'CG-003-RECEIPT', [dependency.receipt_id])] });
  assert.equal(p.next_legal_operation.kind, 'NO_LEGAL_SUCCESSOR');
});

test('terminal packet requires terminal receipt bound to current operation', () => {
  expectCode(() => packet({ current_operation: { operation_id: 'CG-003', state: 'TERMINAL', predecessor_receipt_id: 'CG-002-RECEIPT' } }), 'RECEIPT_REQUIRED');
  expectCode(() => terminalPacket({ terminalReceipt: receipt('R-X', 'OTHER') }), 'RECEIPT_CONFLICT');
});

test('unknown packet fields are rejected', () => {
  const p = structuredClone(packet());
  p.unfrozen_guess = true;
  expectCode(() => validateActiveWorkPacket(p), 'SCHEMA_UNKNOWN_FIELD');
});

test('unsafe path scope is rejected', () => {
  expectCode(() => packet({ allowed_paths_or_effects: { paths: ['../escape'], effects: [] } }), 'SCOPE_INVALID');
});

test('duplicate receipt identities are rejected', () => {
  const r = receipt('R-1', 'OP-1');
  expectCode(() => packet({ receipt_index: [r, r] }), 'RECEIPT_CONFLICT');
});

test('declared successor dependencies require dependency-graph edges', () => {
  const r = receipt('R-1', 'OP-1');
  expectCode(() => terminalPacket({ extraReceipts: [r], candidates: [successor('CG-004', 'CG-003-RECEIPT', ['R-1'])], edges: [] }), 'DEPENDENCY_INVALID');
});

test('stored NEXT_LEGAL_OPERATION cannot be forged', () => {
  const p = structuredClone(packet());
  p.next_legal_operation = { kind: 'START_SUCCESSOR', operation_id: 'INVENTED', predecessor_receipt_id: 'X', reason: 'guess' };
  expectCode(() => validateActiveWorkPacket(p), 'NEXT_OPERATION_MISMATCH');
});

test('standing update changes only declared gate standing and re-derives next action', () => {
  const before = packet();
  const after = updateCurrentStanding(before, { qualification_state: 'FAILED' });
  assert.equal(after.qualification_state, 'FAILED');
  assert.equal(after.repository, before.repository);
  assert.equal(after.next_legal_operation.kind, 'RECONCILE_CURRENT');
});

test('ACTIVE may transition to BLOCKED and BLOCKED may resume ACTIVE', () => {
  const blocked = transitionCurrentOperation(packet({ qualification_state: 'PASSED', github_admission_state: 'ADMITTED' }), { state: 'BLOCKED' });
  assert.equal(blocked.current_operation.state, 'BLOCKED');
  const resumed = transitionCurrentOperation(blocked, { state: 'ACTIVE' });
  assert.equal(resumed.current_operation.state, 'ACTIVE');
});

test('terminal transition requires exact typed receipt and records it once', () => {
  const r = receipt('CG-003-RECEIPT', 'CG-003', { oid: SHA_B });
  const terminal = transitionCurrentOperation(packet(), { state: 'TERMINAL', terminal_receipt: r });
  assert.equal(terminal.last_terminal_receipt.receipt_id, r.receipt_id);
  assert.equal(terminal.receipt_index.length, 1);
  expectCode(() => transitionCurrentOperation(terminal, { state: 'TERMINAL', terminal_receipt: r }), 'ILLEGAL_TRANSITION');
});

test('terminal transition can bind successor candidates atomically with receipt', () => {
  const r = receipt('CG-003-RECEIPT', 'CG-003');
  const terminal = transitionCurrentOperation(packet(), { state: 'TERMINAL', terminal_receipt: r, successor_candidates: [successor('CG-004', r.receipt_id)] });
  assert.equal(terminal.next_legal_operation.operation_id, 'CG-004');
});

test('startNextLegalOperation binds exact predecessor and candidate gate standing', () => {
  const terminal = terminalPacket({ candidates: [successor('CG-004', 'CG-003-RECEIPT', [], { qualification_state: 'NOT_REQUIRED', github_admission_state: 'PENDING', a01_state: 'PENDING' })] });
  const started = startNextLegalOperation(terminal);
  assert.deepEqual(started.current_operation, { operation_id: 'CG-004', state: 'ACTIVE', predecessor_receipt_id: 'CG-003-RECEIPT' });
  assert.equal(started.qualification_state, 'NOT_REQUIRED');
  assert.equal(started.a01_state, 'PENDING');
  assert.equal(started.next_legal_operation.kind, 'CONTINUE_CURRENT');
});

test('startNextLegalOperation refuses nonterminal or ambiguous state', () => {
  expectCode(() => startNextLegalOperation(packet()), 'NEXT_OPERATION_NOT_STARTABLE');
  const ambiguous = terminalPacket({ candidates: [successor('A', 'CG-003-RECEIPT'), successor('B', 'CG-003-RECEIPT')] });
  expectCode(() => startNextLegalOperation(ambiguous), 'NEXT_OPERATION_NOT_STARTABLE');
});

test('authority rebind requires successful dependency-satisfying receipt and increments epoch', () => {
  const r = receipt('REBIND-R', 'AUTHORITY-REBIND');
  const p = packet({ receipt_index: [r] });
  const rebound = rebindAuthority(p, { authoritative_subject: subject(SHA_B), receipt_id: r.receipt_id, branch_or_ref: 'next/ref' });
  assert.equal(rebound.authority_epoch, 2);
  assert.equal(rebound.authority_rebind_receipt_id, r.receipt_id);
  assert.equal(rebound.authoritative_subject.oid, SHA_B);
  assert.equal(rebound.branch_or_ref, 'next/ref');
});

test('authority rebind fails without qualifying receipt', () => {
  expectCode(() => rebindAuthority(packet(), { authoritative_subject: subject(SHA_B), receipt_id: 'MISSING' }), 'AUTHORITY_REBIND_DENIED');
});

test('normalization makes receipt, successor, dependency and scope ordering deterministic', () => {
  const r1 = receipt('R-A', 'A');
  const r2 = receipt('R-B', 'B');
  const a = packet({ receipt_index: [r2, r1], allowed_paths_or_effects: { paths: ['z/**', 'a/**'], effects: ['Z_EFFECT', 'A_EFFECT'] }, successor_candidates: [successor('Z', 'P'), successor('A', 'P')] });
  assert.deepEqual(a.receipt_index.map((r) => r.receipt_id), ['R-A', 'R-B']);
  assert.deepEqual(a.successor_candidates.map((c) => c.operation_id), ['A', 'Z']);
  assert.deepEqual(a.allowed_paths_or_effects.paths, ['a/**', 'z/**']);
});

test('deriveNextLegalOperation is pure and agrees with stored derivation', () => {
  const p = packet();
  assert.deepEqual(deriveNextLegalOperation(p), p.next_legal_operation);
});

test('durable store writes and re-reads initial packet with WAL/FULL durability', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const initial = store.putInitial(packet(), { written_at: '2026-09-12T01:00:00.000Z' });
    assert.equal(initial.revision, 1);
    assert.equal(store.read('SECOND-SHIFT-CONTROL-GATEWAY').packet.current_operation.operation_id, 'CG-003');
    const pragma = store.pragmaState();
    assert.equal(pragma.journal_mode, 'wal');
    assert.equal(pragma.synchronous, 2);
    assert.equal(pragma.integrity_check, 'ok');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('duplicate initial write fails closed', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    store.putInitial(packet());
    expectCode(() => store.putInitial(packet()), 'STORE_CONFLICT');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('compare-and-swap creates hash-linked revision history', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet());
    const p2 = updateCurrentStanding(r1.packet, { qualification_state: 'PASSED' });
    const r2 = store.compareAndSwap(r1.workstream_id, { expected_revision: r1.revision, expected_digest: r1.packet_digest, packet: p2 });
    assert.equal(r2.revision, 2);
    assert.equal(r2.predecessor_digest, r1.packet_digest);
    const history = store.history(r1.workstream_id);
    assert.equal(history.length, 2);
    assert.equal(history[1].predecessor_digest, history[0].packet_digest);
    assert.equal(store.verify(r1.workstream_id).head_digest, r2.packet_digest);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stale revision/digest writer loses CAS race', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet());
    const r2 = store.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: updateCurrentStanding(r1.packet, { qualification_state: 'PASSED' }) });
    assert.equal(r2.revision, 2);
    expectCode(() => store.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: updateCurrentStanding(r1.packet, { qualification_state: 'FAILED' }) }), 'STORE_CONFLICT');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('restart reconstructs exact active work head without chat history', () => {
  const { dir, path } = tempDb();
  try {
    const first = new ActiveWorkStore(path);
    const r1 = first.putInitial(packet());
    const expected = first.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: updateCurrentStanding(r1.packet, { qualification_state: 'PASSED', github_admission_state: 'ADMITTED' }) });
    first.close();
    const restarted = new ActiveWorkStore(path);
    const observed = restarted.read(r1.workstream_id);
    assert.equal(observed.revision, expected.revision);
    assert.equal(observed.packet_digest, expected.packet_digest);
    assert.deepEqual(observed.packet.next_legal_operation, expected.packet.next_legal_operation);
    restarted.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('two store instances cannot both advance the same revision', () => {
  const { dir, path } = tempDb();
  try {
    const a = new ActiveWorkStore(path);
    const r1 = a.putInitial(packet());
    const b = new ActiveWorkStore(path);
    const observed = b.read(r1.workstream_id);
    a.compareAndSwap(r1.workstream_id, { expected_revision: observed.revision, expected_digest: observed.packet_digest, packet: updateCurrentStanding(observed.packet, { qualification_state: 'PASSED' }) });
    expectCode(() => b.compareAndSwap(r1.workstream_id, { expected_revision: observed.revision, expected_digest: observed.packet_digest, packet: updateCurrentStanding(observed.packet, { qualification_state: 'FAILED' }) }), 'STORE_CONFLICT');
    a.close(); b.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('head packet tampering is detected by digest verification', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet());
    store.close();
    const raw = new DatabaseSync(path);
    raw.prepare('UPDATE active_work_heads SET packet_json=? WHERE workstream_id=?').run('{}', r1.workstream_id);
    raw.close();
    const check = new ActiveWorkStore(path);
    expectCode(() => check.read(r1.workstream_id), 'SCHEMA_MISSING_FIELD');
    check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('history predecessor tampering is detected as a fork', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet());
    store.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: updateCurrentStanding(r1.packet, { qualification_state: 'PASSED' }) });
    store.db.prepare("UPDATE active_work_history SET predecessor_digest=? WHERE workstream_id=? AND revision=2").run('f'.repeat(64), r1.workstream_id);
    expectCode(() => store.history(r1.workstream_id), 'STORE_HISTORY_FORK');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('silent authoritative subject drift is rejected by durable CAS', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet());
    const drift = finalizeActiveWorkPacket({ ...structuredClone(r1.packet), authoritative_subject: subject(SHA_B) });
    expectCode(() => store.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: drift }), 'AUTHORITY_DRIFT');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('explicit receipt-backed authority rebind is accepted by durable CAS', () => {
  const { dir, path } = tempDb();
  try {
    const authReceipt = receipt('AUTH-R', 'AUTHORITY-REBIND');
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet({ receipt_index: [authReceipt] }));
    const rebound = rebindAuthority(r1.packet, { authoritative_subject: subject(SHA_C), receipt_id: authReceipt.receipt_id });
    const r2 = store.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: rebound });
    assert.equal(r2.packet.authority_epoch, 2);
    assert.equal(r2.packet.authoritative_subject.oid, SHA_C);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CAS rejects packet stored under a different workstream key', () => {
  const { dir, path } = tempDb();
  try {
    const store = new ActiveWorkStore(path);
    const r1 = store.putInitial(packet());
    const other = packet({ workstream_id: 'OTHER-WORKSTREAM' });
    expectCode(() => store.compareAndSwap(r1.workstream_id, { expected_revision: 1, expected_digest: r1.packet_digest, packet: other }), 'STORE_CONFLICT');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('empty store verifies as zero revisions without inventing work', () => {
  const store = new ActiveWorkStore(':memory:');
  const result = store.verify('SECOND-SHIFT-CONTROL-GATEWAY');
  assert.equal(result.revisions, 0);
  assert.equal(result.head_digest, null);
  store.close();
});
