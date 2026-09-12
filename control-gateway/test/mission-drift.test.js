import test from 'node:test';
import assert from 'node:assert/strict';
import { ActiveWorkError, ActiveWorkStore, ACTIVE_WORK_PROTOCOL, CG001_MISSION_VERSION, finalizeActiveWorkPacket } from '../src/active-work-state.js';

function activePacket(missionVersion = CG001_MISSION_VERSION) {
  return finalizeActiveWorkPacket({
    protocol_version: ACTIVE_WORK_PROTOCOL,
    mission_version: missionVersion,
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 1,
    authority_rebind_receipt_id: null,
    authoritative_subject: { algorithm: 'sha1', oid: 'a'.repeat(40) },
    repository: 'BFochtman746/system-master',
    branch_or_ref: 'second-shift-control-gateway/cg-003-active-work-state',
    allowed_paths_or_effects: { paths: ['control-gateway/**'], effects: ['CONTROL_GATEWAY_STATE_WRITE'] },
    dependency_graph: { version: 1, edges: [] },
    qualification_state: 'PENDING',
    github_admission_state: 'PENDING',
    a01_state: 'NOT_REQUIRED',
    current_operation: { operation_id: 'CG-003', state: 'ACTIVE', predecessor_receipt_id: 'CG-002-RECEIPT' },
    last_terminal_receipt: null,
    receipt_index: [],
    successor_candidates: [],
    next_legal_operation: { kind: 'CONTINUE_CURRENT', operation_id: 'CG-003', predecessor_receipt_id: 'CG-002-RECEIPT', reason: 'placeholder' }
  });
}

test('same-workstream mission version cannot drift across durable CAS history', () => {
  const store = new ActiveWorkStore(':memory:');
  const initial = store.putInitial(activePacket());
  const drift = activePacket('SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v2.0');
  assert.throws(
    () => store.compareAndSwap(initial.workstream_id, { expected_revision: initial.revision, expected_digest: initial.packet_digest, packet: drift }),
    (error) => error instanceof ActiveWorkError && error.code === 'MISSION_DRIFT'
  );
  store.close();
});
