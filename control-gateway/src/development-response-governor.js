import { createHash } from 'node:crypto';
import {
  ResponseExpectationEngineError,
  assertResponseExpectations
} from './response-expectation-engine.js';

export const DEVELOPMENT_RESPONSE_CONTRACT_ID = 'SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001';
export const DEVELOPMENT_RESPONSE_RECEIPT_PROTOCOL = 'control-gateway.development-response-receipt.v1';
export const DEVELOPMENT_RESPONSE_CLASSES = Object.freeze({ FULL: 'FULL', CONTINUATION: 'CONTINUATION' });

const FULL_HEADINGS = Object.freeze([
  '## STATUS',
  '## WHERE WE ARE',
  '## SYSTEM COMPLETION STANDING',
  '## LOCKED JOB',
  '## WHAT CHANGED',
  '## EVIDENCE / RESULT',
  '## WHERE WE ARE GOING',
  '## EXACT NEXT STEP'
]);
const CONTINUATION_HEADINGS = Object.freeze([
  '## STATUS',
  '## WORK COMPLETED',
  '## EVIDENCE / RESULT',
  '## CURRENT BLOCKER',
  '## EXACT NEXT STEP'
]);
const FULL_ONLY_HEADINGS = Object.freeze([
  '## WHERE WE ARE', '## SYSTEM COMPLETION STANDING', '## LOCKED JOB', '## WHAT CHANGED', '## WHERE WE ARE GOING'
]);
const STATUS_VALUES = Object.freeze([
  'CHAT READY', 'CHAT READY WITH DECISION', 'NOT READY', 'WORKING', 'BLOCKED', 'QUALIFICATION PENDING', 'COMPLETE WITH EVIDENCE'
]);
const SHA256_RE = /^[0-9a-f]{64}$/;

const DEVELOPMENT_RESPONSE_POLICY = Object.freeze({
  classes: Object.freeze({
    FULL: Object.freeze({
      required_headings: FULL_HEADINGS,
      forbidden_headings: Object.freeze([]),
      required_labels_by_heading: Object.freeze({
        '## EXACT NEXT STEP': Object.freeze(['Objective', 'First action', 'PASS boundary', 'Successor', 'Failure route', 'Forbidden authority'])
      })
    }),
    CONTINUATION: Object.freeze({
      required_headings: CONTINUATION_HEADINGS,
      forbidden_headings: FULL_ONLY_HEADINGS,
      required_labels_by_heading: Object.freeze({
        '## EXACT NEXT STEP': Object.freeze(['Objective', 'First action', 'PASS boundary'])
      })
    })
  }),
  first_line_allowlist_by_heading: Object.freeze({
    '## STATUS': STATUS_VALUES
  })
});

export class DevelopmentResponseGovernorError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DevelopmentResponseGovernorError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new DevelopmentResponseGovernorError(code, message, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function hash(value) {
  const bytes = typeof value === 'string' ? value : JSON.stringify(canonicalize(value));
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) fail('RESPONSE_SCHEMA_INVALID', `${label} must be non-empty text`);
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RESPONSE_SCHEMA_INVALID', `${label} must be an object`);
  return value;
}

function mapExpectationViolation(error) {
  const codes = {
    EXPECTATION_SCHEMA_INVALID: 'RESPONSE_SCHEMA_INVALID',
    EXPECTATION_CLASS_INVALID: 'RESPONSE_CLASS_INVALID',
    EXPECTATION_REQUIRED_HEADING_INVALID: 'RESPONSE_REQUIRED_HEADING_INVALID',
    EXPECTATION_HEADING_ORDER_INVALID: 'RESPONSE_HEADING_ORDER_INVALID',
    EXPECTATION_FORBIDDEN_HEADING: 'RESPONSE_CLASS_AMBIGUOUS',
    EXPECTATION_SECTION_EMPTY: 'RESPONSE_SECTION_EMPTY',
    EXPECTATION_FIRST_LINE_INVALID: 'RESPONSE_STATUS_INVALID',
    EXPECTATION_REQUIRED_LABEL_MISSING: 'RESPONSE_NEXT_STEP_INCOMPLETE'
  };
  fail(codes[error.code] ?? 'RESPONSE_SCHEMA_INVALID', error.message, error.details);
}

export function validateDevelopmentResponse({ responseText, responseClass }) {
  try {
    assertResponseExpectations({ responseText, responseClass, policy: DEVELOPMENT_RESPONSE_POLICY });
  } catch (error) {
    if (error instanceof ResponseExpectationEngineError) mapExpectationViolation(error);
    throw error;
  }
  return true;
}

function contractDefinition() {
  return {
    contract_id: DEVELOPMENT_RESPONSE_CONTRACT_ID,
    receipt_protocol: DEVELOPMENT_RESPONSE_RECEIPT_PROTOCOL,
    full_headings: FULL_HEADINGS,
    continuation_headings: CONTINUATION_HEADINGS,
    status_values: [...STATUS_VALUES].sort()
  };
}

export function developmentResponseContractDigest() {
  return hash(contractDefinition());
}

export function developmentResponseAuthorityContextDigest(authorityContext) {
  requiredObject(authorityContext, 'authorityContext');
  return hash(authorityContext);
}

function receiptPayload(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receipt_digest;
  return copy;
}

export function developmentResponseReceiptDigest(receipt) {
  return hash(receiptPayload(receipt));
}

export function issueDevelopmentResponseReceipt({ responseText, responseClass, authorityContext }) {
  validateDevelopmentResponse({ responseText, responseClass });
  const receipt = {
    protocol_version: DEVELOPMENT_RESPONSE_RECEIPT_PROTOCOL,
    contract_id: DEVELOPMENT_RESPONSE_CONTRACT_ID,
    contract_digest: developmentResponseContractDigest(),
    response_class: responseClass,
    response_digest: hash(responseText),
    authority_context_digest: developmentResponseAuthorityContextDigest(authorityContext),
    compliance: 'PASS',
    receipt_digest: ''
  };
  receipt.receipt_digest = developmentResponseReceiptDigest(receipt);
  return Object.freeze(receipt);
}

export function verifyDevelopmentResponseReceipt({ responseText, receipt, authorityContext }) {
  requiredObject(receipt, 'receipt');
  const exactKeys = [
    'protocol_version', 'contract_id', 'contract_digest', 'response_class', 'response_digest',
    'authority_context_digest', 'compliance', 'receipt_digest'
  ];
  const keys = Object.keys(receipt).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...exactKeys].sort())) fail('RESPONSE_RECEIPT_SCHEMA_INVALID', 'response receipt fields are not exact');
  if (receipt.protocol_version !== DEVELOPMENT_RESPONSE_RECEIPT_PROTOCOL) fail('RESPONSE_RECEIPT_PROTOCOL_INVALID', 'response receipt protocol mismatch');
  if (receipt.contract_id !== DEVELOPMENT_RESPONSE_CONTRACT_ID) fail('RESPONSE_RECEIPT_CONTRACT_INVALID', 'response receipt contract mismatch');
  if (receipt.contract_digest !== developmentResponseContractDigest()) fail('RESPONSE_RECEIPT_CONTRACT_STALE', 'response receipt contract digest is stale');
  if (receipt.compliance !== 'PASS') fail('RESPONSE_RECEIPT_NOT_PASS', 'response receipt is not PASS');
  for (const key of ['contract_digest', 'response_digest', 'authority_context_digest', 'receipt_digest']) {
    if (!SHA256_RE.test(receipt[key] ?? '')) fail('RESPONSE_RECEIPT_SCHEMA_INVALID', `${key} must be lowercase SHA-256`);
  }
  validateDevelopmentResponse({ responseText, responseClass: receipt.response_class });
  if (receipt.response_digest !== hash(responseText)) fail('RESPONSE_RECEIPT_RESPONSE_MISMATCH', 'response receipt does not bind exact response bytes');
  if (receipt.authority_context_digest !== developmentResponseAuthorityContextDigest(authorityContext)) fail('RESPONSE_RECEIPT_AUTHORITY_MISMATCH', 'response receipt does not bind current authority context');
  if (receipt.receipt_digest !== developmentResponseReceiptDigest(receipt)) fail('RESPONSE_RECEIPT_DIGEST_MISMATCH', 'response receipt digest mismatch');
  return true;
}

export function assertDevelopmentResponseAuthorization({ responseText, responseReceipt, authorityContext }) {
  if (!responseReceipt) fail('RESPONSE_RECEIPT_REQUIRED', 'governed mutation requires a development response receipt');
  return verifyDevelopmentResponseReceipt({ responseText, receipt: responseReceipt, authorityContext });
}
