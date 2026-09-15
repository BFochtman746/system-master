import { createHash } from 'node:crypto';

export const RESPONSE_PROTOCOL = 'system-master.development-response.v1';
export const RECEIPT_PROTOCOL = 'control-gateway.chat-response-compliance-receipt.v1';
export const RESPONSE_CONTRACT_ID = 'SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001';

const READINESS = new Set(['CHAT READY', 'CHAT READY WITH DECISION', 'NOT READY']);
const CLASS_HEADINGS = Object.freeze({
  FULL: Object.freeze([
    'CONTROL',
    'WHERE WE ARE',
    'SYSTEM COMPLETION STANDING',
    'LOCKED JOB',
    'WORK COMPLETED / WHAT CHANGED',
    'EVIDENCE / VERIFICATION',
    'WHERE WE ARE GOING',
    'EXACT NEXT STEP'
  ]),
  CONTINUATION: Object.freeze([
    'CONTROL',
    'STATUS',
    'WORK COMPLETED',
    'EVIDENCE / RESULT',
    'BLOCKER',
    'EXACT NEXT STEP'
  ])
});
const CONTROL_KEYS = Object.freeze(['RESPONSE CLASS', 'CONTRACT', 'AUTHORITY', 'OWNER LANE', 'OBJECTIVE', 'READINESS']);

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digestObject(value) {
  return sha256Text(JSON.stringify(stable(value)));
}

const CONTRACT_DEFINITION = Object.freeze({
  protocol_version: RESPONSE_PROTOCOL,
  contract_id: RESPONSE_CONTRACT_ID,
  control_keys: CONTROL_KEYS,
  response_classes: CLASS_HEADINGS
});

export const RESPONSE_CONTRACT_DIGEST = digestObject(CONTRACT_DEFINITION);

export class ChatResponseComplianceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ChatResponseComplianceError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ChatResponseComplianceError(code, message, details);
}

export function normalizeResponseText(value) {
  if (typeof value !== 'string') fail('RESPONSE_TEXT_INVALID', 'response text must be a string');
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) fail('RESPONSE_TEXT_INVALID', 'response text must not be empty');
  return normalized;
}

function parseSections(responseText) {
  const lines = normalizeResponseText(responseText).split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = /^## ([A-Z][A-Z0-9 /-]*)\s*$/.exec(line);
    if (match) {
      current = { heading: match[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (sections.length === 0) fail('RESPONSE_SECTION_MISSING', 'response contains no governed ## sections');
  return sections;
}

function parseControl(section) {
  const values = {};
  for (const line of section.lines) {
    const match = /^\s*(?:[-*]\s*)?([A-Z][A-Z ]+):\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    if (CONTROL_KEYS.includes(match[1])) {
      if (values[match[1]] !== undefined) fail('RESPONSE_CONTROL_DUPLICATE', `CONTROL.${match[1]} appears more than once`);
      values[match[1]] = match[2];
    }
  }
  for (const key of CONTROL_KEYS) if (!values[key]) fail('RESPONSE_CONTROL_MISSING', `CONTROL.${key} is required`);
  return values;
}

function exactHeadingCheck(sections, responseClass) {
  const required = CLASS_HEADINGS[responseClass];
  if (!required) fail('RESPONSE_CLASS_INVALID', `unsupported response class ${responseClass}`);
  const actual = sections.map((item) => item.heading);
  if (actual.length !== required.length || actual.some((value, index) => value !== required[index])) {
    fail('RESPONSE_STRUCTURE_INVALID', `response headings must exactly match ${responseClass} contract`, { required, actual });
  }
  for (const section of sections) {
    if (!section.lines.join('\n').trim()) fail('RESPONSE_SECTION_EMPTY', `${section.heading} must not be empty`);
  }
}

function expectedEquals(actual, expected, code, label) {
  if (expected !== undefined && expected !== null && actual !== String(expected)) fail(code, `${label} does not match expected context`);
}

export function validateDevelopmentResponse(responseText, expected = {}) {
  const text = normalizeResponseText(responseText);
  const sections = parseSections(text);
  if (sections[0].heading !== 'CONTROL') fail('RESPONSE_CONTROL_MISSING', 'CONTROL must be the first section');
  const control = parseControl(sections[0]);
  const responseClass = control['RESPONSE CLASS'];
  exactHeadingCheck(sections, responseClass);
  if (control.CONTRACT !== RESPONSE_CONTRACT_ID) fail('RESPONSE_CONTRACT_MISMATCH', 'CONTROL.CONTRACT is not the active response contract');
  if (!READINESS.has(control.READINESS)) fail('RESPONSE_READINESS_INVALID', 'CONTROL.READINESS is invalid');
  expectedEquals(control.AUTHORITY, expected.authority_id, 'RESPONSE_AUTHORITY_MISMATCH', 'CONTROL.AUTHORITY');
  expectedEquals(control['OWNER LANE'], expected.owner_lane, 'RESPONSE_OWNER_MISMATCH', 'CONTROL.OWNER LANE');
  expectedEquals(control.OBJECTIVE, expected.objective_id, 'RESPONSE_OBJECTIVE_MISMATCH', 'CONTROL.OBJECTIVE');
  if (expected.response_class) expectedEquals(responseClass, expected.response_class, 'RESPONSE_CLASS_MISMATCH', 'CONTROL.RESPONSE CLASS');
  return Object.freeze({
    protocol_version: RESPONSE_PROTOCOL,
    contract_id: RESPONSE_CONTRACT_ID,
    contract_digest: RESPONSE_CONTRACT_DIGEST,
    response_class: responseClass,
    authority_id: control.AUTHORITY,
    owner_lane: control['OWNER LANE'],
    objective_id: control.OBJECTIVE,
    readiness: control.READINESS,
    response_digest: sha256Text(text)
  });
}

function withoutReceiptDigest(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receipt_digest;
  return copy;
}

export function createResponseComplianceReceipt(responseText, expected = {}, issuedAt = new Date().toISOString()) {
  const validated = validateDevelopmentResponse(responseText, expected);
  if (typeof issuedAt !== 'string' || Number.isNaN(Date.parse(issuedAt))) fail('RECEIPT_TIME_INVALID', 'issuedAt must be an ISO-8601 timestamp');
  const receipt = {
    protocol_version: RECEIPT_PROTOCOL,
    decision: 'PASS',
    contract_id: validated.contract_id,
    contract_digest: validated.contract_digest,
    response_class: validated.response_class,
    response_digest: validated.response_digest,
    authority_id: validated.authority_id,
    owner_lane: validated.owner_lane,
    objective_id: validated.objective_id,
    readiness: validated.readiness,
    issued_at: issuedAt,
    receipt_digest: ''
  };
  receipt.receipt_digest = digestObject(withoutReceiptDigest(receipt));
  return Object.freeze(receipt);
}

export function validateResponseComplianceReceipt(receipt, responseText, expected = {}, options = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('RECEIPT_INVALID', 'receipt must be an object');
  const requiredKeys = [
    'protocol_version', 'decision', 'contract_id', 'contract_digest', 'response_class', 'response_digest',
    'authority_id', 'owner_lane', 'objective_id', 'readiness', 'issued_at', 'receipt_digest'
  ];
  const actualKeys = Object.keys(receipt).sort();
  const expectedKeys = [...requiredKeys].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) fail('RECEIPT_SCHEMA_INVALID', 'receipt keys do not match contract');
  if (receipt.protocol_version !== RECEIPT_PROTOCOL || receipt.decision !== 'PASS') fail('RECEIPT_INVALID', 'receipt protocol/decision invalid');
  if (receipt.contract_id !== RESPONSE_CONTRACT_ID || receipt.contract_digest !== RESPONSE_CONTRACT_DIGEST) fail('RECEIPT_CONTRACT_MISMATCH', 'receipt contract binding invalid');
  const validated = validateDevelopmentResponse(responseText, { ...expected, response_class: receipt.response_class });
  for (const [key, value] of [
    ['response_digest', validated.response_digest], ['authority_id', validated.authority_id], ['owner_lane', validated.owner_lane],
    ['objective_id', validated.objective_id], ['readiness', validated.readiness]
  ]) if (receipt[key] !== value) fail('RECEIPT_BINDING_MISMATCH', `receipt.${key} does not match response`);
  if (digestObject(withoutReceiptDigest(receipt)) !== receipt.receipt_digest) fail('RECEIPT_DIGEST_MISMATCH', 'receipt digest mismatch');
  const issued = Date.parse(receipt.issued_at);
  if (Number.isNaN(issued)) fail('RECEIPT_TIME_INVALID', 'receipt issued_at is invalid');
  if (options.now !== undefined || options.max_age_ms !== undefined) {
    const now = options.now === undefined ? Date.now() : (typeof options.now === 'number' ? options.now : Date.parse(options.now));
    const maxAge = options.max_age_ms ?? 15 * 60 * 1000;
    if (!Number.isFinite(now) || !Number.isFinite(maxAge) || maxAge < 0) fail('RECEIPT_TIME_INVALID', 'freshness parameters are invalid');
    if (issued > now + 30_000 || now - issued > maxAge) fail('RECEIPT_STALE', 'response compliance receipt is outside the freshness window');
  }
  return true;
}
