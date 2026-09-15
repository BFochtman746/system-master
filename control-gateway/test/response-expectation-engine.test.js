import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESPONSE_EXPECTATION_ENGINE_ID,
  ResponseExpectationEngineError,
  assertResponseExpectations,
  evaluateResponseExpectations,
  responseExpectationPolicyDigest
} from '../src/response-expectation-engine.js';

const POLICY = Object.freeze({
  classes: {
    FULL: {
      required_headings: ['## STATUS', '## BODY', '## NEXT'],
      forbidden_headings: [],
      required_labels_by_heading: {
        '## NEXT': ['Objective', 'PASS boundary']
      }
    },
    CONTINUATION: {
      required_headings: ['## STATUS', '## PROGRESS', '## NEXT'],
      forbidden_headings: ['## BODY'],
      required_labels_by_heading: {
        '## NEXT': ['Objective']
      }
    }
  },
  first_line_allowlist_by_heading: {
    '## STATUS': ['WORKING', 'COMPLETE']
  }
});

const FULL = `## STATUS\nWORKING\n\n## BODY\nReusable response policy validation is active.\n\n## NEXT\nObjective: Prove the C11 engine.\nPASS boundary: Every declared expectation is enforced.`;
const CONTINUATION = `## STATUS\nWORKING\n\n## PROGRESS\nThe engine is being qualified.\n\n## NEXT\nObjective: Continue qualification.`;

async function rejectsCode(fn, expected) {
  await assert.rejects(fn, (error) => error instanceof ResponseExpectationEngineError && error.code === expected);
}

test('valid FULL response evaluates to PASS', () => {
  const result = evaluateResponseExpectations({ responseText: FULL, responseClass: 'FULL', policy: POLICY });
  assert.equal(result.status, 'PASS');
  assert.equal(result.engine_id, RESPONSE_EXPECTATION_ENGINE_ID);
  assert.equal(result.response_class, 'FULL');
});

test('valid CONTINUATION response evaluates to PASS', () => {
  assert.equal(assertResponseExpectations({ responseText: CONTINUATION, responseClass: 'CONTINUATION', policy: POLICY }), true);
});

test('CRLF responses preserve exact-line validation semantics', () => {
  const crlf = FULL.replaceAll('\n', '\r\n');
  assert.equal(assertResponseExpectations({ responseText: crlf, responseClass: 'FULL', policy: POLICY }), true);
});

test('policy digest is deterministic across object key order', () => {
  const reordered = {
    first_line_allowlist_by_heading: POLICY.first_line_allowlist_by_heading,
    classes: {
      CONTINUATION: POLICY.classes.CONTINUATION,
      FULL: POLICY.classes.FULL
    }
  };
  assert.equal(responseExpectationPolicyDigest(POLICY), responseExpectationPolicyDigest(reordered));
});

test('unknown response class fails closed', async () => {
  await rejectsCode(async () => assertResponseExpectations({ responseText: FULL, responseClass: 'UNKNOWN', policy: POLICY }), 'EXPECTATION_CLASS_INVALID');
});

test('inherited object prototype name is not accepted as a response class', async () => {
  await rejectsCode(async () => assertResponseExpectations({ responseText: FULL, responseClass: 'toString', policy: POLICY }), 'EXPECTATION_CLASS_INVALID');
});

test('explicit prototype-like class key remains an owned policy class', () => {
  const prototypePolicy = JSON.parse('{"classes":{"__proto__":{"required_headings":["## ONLY"],"forbidden_headings":[],"required_labels_by_heading":{}}},"first_line_allowlist_by_heading":{}}');
  const result = evaluateResponseExpectations({ responseText: '## ONLY\ncontent', responseClass: '__proto__', policy: prototypePolicy });
  assert.equal(result.status, 'PASS');
  assert.equal(result.response_class, '__proto__');
});

test('missing required heading fails closed', async () => {
  const malformed = FULL.replace('## BODY\nReusable response policy validation is active.\n\n', '');
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_REQUIRED_HEADING_INVALID');
});

test('duplicate required heading fails closed', async () => {
  const malformed = `${FULL}\n\n## BODY\nDuplicate.`;
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_REQUIRED_HEADING_INVALID');
});

test('out-of-order headings fail closed', async () => {
  const malformed = `## STATUS\nWORKING\n\n## NEXT\nObjective: X\nPASS boundary: Y\n\n## BODY\nLate.`;
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_HEADING_ORDER_INVALID');
});

test('empty required section fails closed', async () => {
  const malformed = FULL.replace('## BODY\nReusable response policy validation is active.', '## BODY');
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_SECTION_EMPTY');
});

test('inline heading substring cannot spoof content for an empty exact heading section', async () => {
  const actualEmptyBody = FULL.replace('## BODY\nReusable response policy validation is active.', '## BODY');
  const malformed = `preamble ## BODY\nSpoofed body content.\n\n${actualEmptyBody}`;
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_SECTION_EMPTY');
});

test('inline heading substring cannot spoof required labels for the exact heading section', async () => {
  const actualWithoutLabels = FULL
    .replace('Objective: Prove the C11 engine.', 'No objective declared.')
    .replace('PASS boundary: Every declared expectation is enforced.', 'No pass boundary declared.');
  const malformed = `preamble ## NEXT\nObjective: spoofed\nPASS boundary: spoofed\n\n${actualWithoutLabels}`;
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_REQUIRED_LABEL_MISSING');
});

test('forbidden peer heading fails closed', async () => {
  const malformed = `${CONTINUATION}\n\n## BODY\nNot allowed for continuation.`;
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'CONTINUATION', policy: POLICY }), 'EXPECTATION_FORBIDDEN_HEADING');
});

test('invalid first-line allowlist value fails closed', async () => {
  const malformed = FULL.replace('WORKING', 'UNKNOWN');
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_FIRST_LINE_INVALID');
});

test('missing required label fails closed', async () => {
  const malformed = FULL.replace('PASS boundary: Every declared expectation is enforced.', 'No boundary declared.');
  await rejectsCode(async () => assertResponseExpectations({ responseText: malformed, responseClass: 'FULL', policy: POLICY }), 'EXPECTATION_REQUIRED_LABEL_MISSING');
});

test('malformed policy with duplicate headings fails closed', async () => {
  const malformedPolicy = {
    classes: { FULL: { required_headings: ['## STATUS', '## STATUS'], forbidden_headings: [], required_labels_by_heading: {} } },
    first_line_allowlist_by_heading: { '## STATUS': ['WORKING'] }
  };
  await rejectsCode(async () => assertResponseExpectations({ responseText: FULL, responseClass: 'FULL', policy: malformedPolicy }), 'EXPECTATION_SCHEMA_INVALID');
});
