import test from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSE_CONTRACT_ID } from '../src/chat-response-governor.js';
import { ChatGovernedMutationAdmissionGate } from '../src/chat-governed-mutation-admission.js';

const context = { authority_id: 'CURRENT-AUTHORITY-005', owner_lane: 'CORE', objective_id: 'FOUNDATION-1-0-CLOSURE-001' };
const mutation = { mutation_id: 'C04-TEST-001' };

function response() {
  return `## CONTROL\n- RESPONSE CLASS: CONTINUATION\n- CONTRACT: ${RESPONSE_CONTRACT_ID}\n- AUTHORITY: CURRENT-AUTHORITY-005\n- OWNER LANE: CORE\n- OBJECTIVE: FOUNDATION-1-0-CLOSURE-001\n- READINESS: CHAT READY\n\n## STATUS\nC04 work is active.\n\n## WORK COMPLETED\nController gate added.\n\n## EVIDENCE / RESULT\nNegative test is executable.\n\n## BLOCKER\nNONE.\n\n## EXACT NEXT STEP\nRun qualification.`;
}

class FakeBaseGate {
  constructor() { this.admitCalls = 0; this.verifyCalls = 0; }
  async admit(req) { this.admitCalls += 1; return { base: 'GRANTED', mutation_id: req.mutation_id }; }
  async verifyGrantFresh(receipt, req) { this.verifyCalls += 1; return receipt.mutation_id === req.mutation_id; }
}

function gate(base = new FakeBaseGate()) {
  return { base, gate: new ChatGovernedMutationAdmissionGate({
    baseGate: base,
    responseContextProvider: async () => context,
    clock: () => new Date('2026-09-15T22:30:00.000Z')
  }) };
}

test('compliant response authorizes base mutation only after controller receipt creation', async () => {
  const { base, gate: g } = gate();
  const grant = await g.admit({ mutation_request: mutation, response_text: response() });
  assert.equal(base.admitCalls, 1);
  assert.equal(grant.decision, 'GRANTED');
  assert.equal(grant.response_compliance_receipt.decision, 'PASS');
  assert.equal(await g.verifyGrantFresh(grant, { mutation_request: mutation, response_text: response() }), true);
});

test('ordinary malformed response cannot authorize GitHub/A-01 mutation', async () => {
  const { base, gate: g } = gate();
  await assert.rejects(g.admit({ mutation_request: mutation, response_text: 'Done. I changed the files. Continue?' }));
  assert.equal(base.admitCalls, 0);
});

test('missing response cannot authorize mutation', async () => {
  const { base, gate: g } = gate();
  await assert.rejects(g.admit({ mutation_request: mutation }), /response_text is required/);
  assert.equal(base.admitCalls, 0);
});

test('wrong-lane response cannot reach base mutation gate', async () => {
  const { base, gate: g } = gate();
  await assert.rejects(g.admit({ mutation_request: mutation, response_text: response().replace('OWNER LANE: CORE', 'OWNER LANE: BOOK') }));
  assert.equal(base.admitCalls, 0);
});
