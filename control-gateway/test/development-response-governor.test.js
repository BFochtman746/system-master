import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPMENT_RESPONSE_CLASSES,
  DevelopmentResponseGovernorError,
  assertDevelopmentResponseAuthorization,
  issueDevelopmentResponseReceipt,
  verifyDevelopmentResponseReceipt
} from '../src/development-response-governor.js';

const AUTHORITY = Object.freeze({
  channel: 'GITHUB_MUTATION',
  workstream_id: 'FOUNDATION-1-0-CLOSURE-001',
  authority_epoch: 5,
  authority_packet_digest: 'a'.repeat(64),
  repository: 'BFochtman746/system-master',
  operation_id: 'C04-CHAT-RESPONSE-GOVERNOR'
});

const FULL = `## STATUS\nWORKING\n\n## WHERE WE ARE\nC04 CHAT is active.\n\n## SYSTEM COMPLETION STANDING\nSystem Master remains incomplete.\n\n## LOCKED JOB\nClose C04 without crossing owner lanes.\n\n## WHAT CHANGED\nResponse governance was added.\n\n## EVIDENCE / RESULT\nLocal executable qualification passed.\n\n## WHERE WE ARE GOING\nBind the controller gates.\n\n## EXACT NEXT STEP\nObjective: Bind response receipts to mutation admission.\nFirst action: Verify the receipt before any mutation transport call.\nPASS boundary: Malformed or missing responses cannot receive admission.\nSuccessor: Run exact-subject A-01 qualification.\nFailure route: Preserve the failing case and keep C04 open.\nForbidden authority: Do not claim Foundation completion without required evidence.`;

const CONTINUATION = `## STATUS\nWORKING\n\n## WORK COMPLETED\nAdded response receipt validation.\n\n## EVIDENCE / RESULT\nUnit tests pass.\n\n## CURRENT BLOCKER\nNONE\n\n## EXACT NEXT STEP\nObjective: Wire GitHub and A-01 gates.\nFirst action: Require the exact receipt at both admission chokepoints.\nPASS boundary: A missing or malformed response is rejected before authorization.`;

async function code(fn, expected) {
  await assert.rejects(fn, (error) => error instanceof DevelopmentResponseGovernorError && error.code === expected);
}

test('FULL response receives a deterministic PASS receipt', () => {
  const a = issueDevelopmentResponseReceipt({ responseText: FULL, responseClass: DEVELOPMENT_RESPONSE_CLASSES.FULL, authorityContext: AUTHORITY });
  const b = issueDevelopmentResponseReceipt({ responseText: FULL, responseClass: DEVELOPMENT_RESPONSE_CLASSES.FULL, authorityContext: AUTHORITY });
  assert.equal(a.receipt_digest, b.receipt_digest);
  assert.equal(a.compliance, 'PASS');
  assert.equal(verifyDevelopmentResponseReceipt({ responseText: FULL, receipt: a, authorityContext: AUTHORITY }), true);
});

test('CONTINUATION response receives PASS receipt', () => {
  const receipt = issueDevelopmentResponseReceipt({ responseText: CONTINUATION, responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION, authorityContext: AUTHORITY });
  assert.equal(verifyDevelopmentResponseReceipt({ responseText: CONTINUATION, receipt, authorityContext: AUTHORITY }), true);
});

test('ordinary unstructured chat prose cannot authorize mutation', async () => {
  await code(async () => issueDevelopmentResponseReceipt({ responseText: 'Done. I updated the files.', responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION, authorityContext: AUTHORITY }), 'RESPONSE_REQUIRED_HEADING_INVALID');
});

test('missing CONTINUATION section cannot authorize mutation', async () => {
  const malformed = CONTINUATION.replace('## CURRENT BLOCKER\nNONE\n\n', '');
  await code(async () => issueDevelopmentResponseReceipt({ responseText: malformed, responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION, authorityContext: AUTHORITY }), 'RESPONSE_REQUIRED_HEADING_INVALID');
});

test('FULL response missing exact next-step boundary cannot authorize mutation', async () => {
  const malformed = FULL.replace('Forbidden authority: Do not claim Foundation completion without required evidence.', '');
  await code(async () => issueDevelopmentResponseReceipt({ responseText: malformed, responseClass: DEVELOPMENT_RESPONSE_CLASSES.FULL, authorityContext: AUTHORITY }), 'RESPONSE_NEXT_STEP_INCOMPLETE');
});

test('missing response receipt fails closed', async () => {
  await code(async () => assertDevelopmentResponseAuthorization({ responseText: CONTINUATION, responseReceipt: null, authorityContext: AUTHORITY }), 'RESPONSE_RECEIPT_REQUIRED');
});

test('tampered response text is rejected even with a prior valid receipt', async () => {
  const receipt = issueDevelopmentResponseReceipt({ responseText: CONTINUATION, responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION, authorityContext: AUTHORITY });
  const tampered = `${CONTINUATION}\nUnauthorized post-receipt text.`;
  await code(async () => verifyDevelopmentResponseReceipt({ responseText: tampered, receipt, authorityContext: AUTHORITY }), 'RESPONSE_RECEIPT_RESPONSE_MISMATCH');
});

test('stale authority context is rejected', async () => {
  const receipt = issueDevelopmentResponseReceipt({ responseText: CONTINUATION, responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION, authorityContext: AUTHORITY });
  await code(async () => verifyDevelopmentResponseReceipt({ responseText: CONTINUATION, receipt, authorityContext: { ...AUTHORITY, authority_epoch: 6 } }), 'RESPONSE_RECEIPT_AUTHORITY_MISMATCH');
});

test('tampered receipt digest is rejected', async () => {
  const receipt = structuredClone(issueDevelopmentResponseReceipt({ responseText: CONTINUATION, responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION, authorityContext: AUTHORITY }));
  receipt.response_digest = 'f'.repeat(64);
  await code(async () => verifyDevelopmentResponseReceipt({ responseText: CONTINUATION, receipt, authorityContext: AUTHORITY }), 'RESPONSE_RECEIPT_RESPONSE_MISMATCH');
});
