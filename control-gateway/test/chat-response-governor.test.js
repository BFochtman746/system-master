import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChatResponseComplianceError,
  RESPONSE_CONTRACT_ID,
  createResponseComplianceReceipt,
  validateDevelopmentResponse,
  validateResponseComplianceReceipt
} from '../src/chat-response-governor.js';

const context = { authority_id: 'CURRENT-AUTHORITY-005', owner_lane: 'CORE', objective_id: 'FOUNDATION-1-0-CLOSURE-001' };

function full(overrides = {}) {
  const c = { cls: 'FULL', contract: RESPONSE_CONTRACT_ID, authority: context.authority_id, owner: context.owner_lane, objective: context.objective_id, readiness: 'CHAT READY', ...overrides };
  return `## CONTROL\n- RESPONSE CLASS: ${c.cls}\n- CONTRACT: ${c.contract}\n- AUTHORITY: ${c.authority}\n- OWNER LANE: ${c.owner}\n- OBJECTIVE: ${c.objective}\n- READINESS: ${c.readiness}\n\n## WHERE WE ARE\nC04 is the current gap.\n\n## SYSTEM COMPLETION STANDING\nSystem Master remains incomplete.\n\n## LOCKED JOB\nCORE Foundation closure only.\n\n## WORK COMPLETED / WHAT CHANGED\nResponse governor implemented.\n\n## EVIDENCE / VERIFICATION\nUnit qualification in this test.\n\n## WHERE WE ARE GOING\nBind controller admission.\n\n## EXACT NEXT STEP\nRun negative qualification.`;
}

function continuation() {
  return `## CONTROL\n- RESPONSE CLASS: CONTINUATION\n- CONTRACT: ${RESPONSE_CONTRACT_ID}\n- AUTHORITY: ${context.authority_id}\n- OWNER LANE: ${context.owner_lane}\n- OBJECTIVE: ${context.objective_id}\n- READINESS: CHAT READY\n\n## STATUS\nC04 remains active.\n\n## WORK COMPLETED\nValidator added.\n\n## EVIDENCE / RESULT\nLocal tests pass.\n\n## BLOCKER\nNONE.\n\n## EXACT NEXT STEP\nQualify controller gate.`;
}

async function rejectsCode(fn, code) {
  await assert.rejects(Promise.resolve().then(fn), (error) => error instanceof ChatResponseComplianceError && error.code === code);
}

test('FULL response validates and produces exact-bound compliance receipt', () => {
  const result = validateDevelopmentResponse(full(), context);
  assert.equal(result.response_class, 'FULL');
  const receipt = createResponseComplianceReceipt(full(), context, '2026-09-15T22:30:00.000Z');
  assert.equal(receipt.decision, 'PASS');
  assert.equal(validateResponseComplianceReceipt(receipt, full(), context), true);
});

test('CONTINUATION response validates', () => {
  assert.equal(validateDevelopmentResponse(continuation(), context).response_class, 'CONTINUATION');
});

test('ordinary ungoverned chat response is rejected', async () => {
  await rejectsCode(() => validateDevelopmentResponse('I updated the code and everything looks good.', context), 'RESPONSE_SECTION_MISSING');
});

test('missing required section is rejected', async () => {
  const malformed = full().replace(/\n## EVIDENCE \/ VERIFICATION[\s\S]*?(?=\n## WHERE WE ARE GOING)/, '');
  await rejectsCode(() => validateDevelopmentResponse(malformed, context), 'RESPONSE_STRUCTURE_INVALID');
});

test('wrong authority, owner and objective fail closed', async () => {
  await rejectsCode(() => validateDevelopmentResponse(full({ authority: 'CURRENT-AUTHORITY-004' }), context), 'RESPONSE_AUTHORITY_MISMATCH');
  await rejectsCode(() => validateDevelopmentResponse(full({ owner: 'BOOK' }), context), 'RESPONSE_OWNER_MISMATCH');
  await rejectsCode(() => validateDevelopmentResponse(full({ objective: 'OTHER' }), context), 'RESPONSE_OBJECTIVE_MISMATCH');
});

test('tampered response invalidates an otherwise valid receipt', async () => {
  const receipt = createResponseComplianceReceipt(full(), context, '2026-09-15T22:30:00.000Z');
  await rejectsCode(() => validateResponseComplianceReceipt(receipt, full().replace('C04 is the current gap.', 'Different body.'), context), 'RECEIPT_BINDING_MISMATCH');
});

test('tampered receipt is rejected', async () => {
  const receipt = structuredClone(createResponseComplianceReceipt(full(), context, '2026-09-15T22:30:00.000Z'));
  receipt.owner_lane = 'BOOK';
  await rejectsCode(() => validateResponseComplianceReceipt(receipt, full(), context), 'RECEIPT_BINDING_MISMATCH');
});

test('stale receipt is rejected', async () => {
  const receipt = createResponseComplianceReceipt(full(), context, '2026-09-15T22:00:00.000Z');
  await rejectsCode(() => validateResponseComplianceReceipt(receipt, full(), context, { now: '2026-09-15T22:30:00.000Z', max_age_ms: 60_000 }), 'RECEIPT_STALE');
});
