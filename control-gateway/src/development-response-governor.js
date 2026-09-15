import { createHash } from 'node:crypto';

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
const FULL_ONLY_HEADINGS = new Set([
  '## WHERE WE ARE', '## SYSTEM COMPLETION STANDING', '## LOCKED JOB', '## WHAT CHANGED', '## WHERE WE ARE GOING'
]);
const STATUS_VALUES = new Set([
  'CHAT READY', 'CHAT READY WITH DECISION', 'NOT READY', 'WORKING', 'BLOCKED', 'QUALIFICATION PENDING', 'COMPLETE WITH EVIDENCE'
]);
const SHA256_RE = /^[0-9a-f]{64}$/;

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

function headingLines(responseText) {
  return responseText.split(/\r?\n/).filter((line) => /^## [^#].*$/.test(line));
}

function sectionContent(responseText, heading, nextHeading) {
  const start = responseText.indexOf(heading);
  if (start < 0) return null;
  const from = start + heading.length;
  const end = nextHeading ? responseText.indexOf(nextHeading, from) : responseText.length;
  return responseText.slice(from, end < 0 ? responseText.length : end).trim();
}

function validateHeadingContract(responseText, requiredHeadings, responseClass) {
  const lines = headingLines(responseText);
  let cursor = -1;
  for (const heading of requiredHeadings) {
    const occurrences = lines.filter((line) => line === heading).length;
    if (occurrences !== 1) fail('RESPONSE_REQUIRED_HEADING_INVALID', `${heading} must occur exactly once`, { response_class: responseClass, occurrences });
    const index = lines.indexOf(heading);
    if (index <= cursor) fail('RESPONSE_HEADING_ORDER_INVALID', `${heading} is out of order`, { response_class: responseClass });
    cursor = index;
  }
  if (responseClass === DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION) {
    for (const heading of lines) if (FULL_ONLY_HEADINGS.has(heading)) fail('RESPONSE_CLASS_AMBIGUOUS', `CONTINUATION cannot contain FULL peer heading ${heading}`);
  }
  for (let i = 0; i < requiredHeadings.length; i += 1) {
    const heading = requiredHeadings[i];
    const next = requiredHeadings[i + 1] ?? null;
    const content = sectionContent(responseText, heading, next);
    if (!content) fail('RESPONSE_SECTION_EMPTY', `${heading} must contain content`, { response_class: responseClass });
  }
}

function validateStatus(responseText, requiredHeadings) {
  const next = requiredHeadings[1];
  const statusBody = sectionContent(responseText, '## STATUS', next);
  const firstLine = statusBody.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  if (!STATUS_VALUES.has(firstLine)) fail('RESPONSE_STATUS_INVALID', 'STATUS must begin with an allowed status value', { observed: firstLine });
}

function validateExactNextStep(responseText, responseClass) {
  const body = sectionContent(responseText, '## EXACT NEXT STEP', null) ?? '';
  if (responseClass === DEVELOPMENT_RESPONSE_CLASSES.FULL) {
    for (const label of ['Objective', 'First action', 'PASS boundary', 'Successor', 'Failure route', 'Forbidden authority']) {
      if (!new RegExp(`(^|\\n)${label}:\\s*\\S`, 'm').test(body)) fail('RESPONSE_NEXT_STEP_INCOMPLETE', `FULL EXACT NEXT STEP requires ${label}:`);
    }
  } else {
    for (const label of ['Objective', 'First action', 'PASS boundary']) {
      if (!new RegExp(`(^|\\n)${label}:\\s*\\S`, 'm').test(body)) fail('RESPONSE_NEXT_STEP_INCOMPLETE', `CONTINUATION EXACT NEXT STEP requires ${label}:`);
    }
  }
}

export function validateDevelopmentResponse({ responseText, responseClass }) {
  requiredText(responseText, 'responseText');
  if (!Object.values(DEVELOPMENT_RESPONSE_CLASSES).includes(responseClass)) fail('RESPONSE_CLASS_INVALID', 'responseClass must be FULL or CONTINUATION');
  const headings = responseClass === DEVELOPMENT_RESPONSE_CLASSES.FULL ? FULL_HEADINGS : CONTINUATION_HEADINGS;
  validateHeadingContract(responseText, headings, responseClass);
  validateStatus(responseText, headings);
  validateExactNextStep(responseText, responseClass);
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
