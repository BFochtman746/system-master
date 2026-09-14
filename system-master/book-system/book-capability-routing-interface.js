'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_PATH = path.join(__dirname, '../../qualification/book-system/book-prose-integration/orchestrator/BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001.json');

class BookCapabilityRoutingError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCapabilityRoutingError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookCapabilityRoutingError(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function loadDefaultRegistry() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

function validateCapability(cap) {
  if (!isObject(cap)) fail('CAPABILITY_OBJECT_REQUIRED');
  for (const field of ['capability_id','owner_path','authority_domain','dispatch_class','callable','service_id','operation_id','contract_ref','canonical_write_authority']) {
    if (!Object.prototype.hasOwnProperty.call(cap, field)) fail('CAPABILITY_FIELD_MISSING', field);
  }
  if (!nonEmpty(cap.capability_id) || !nonEmpty(cap.owner_path) || !nonEmpty(cap.authority_domain) || !nonEmpty(cap.dispatch_class) || !nonEmpty(cap.contract_ref)) fail('CAPABILITY_IDENTITY_INVALID', String(cap.capability_id || ''));
  if (typeof cap.callable !== 'boolean' || typeof cap.canonical_write_authority !== 'boolean') fail('CAPABILITY_BOOLEAN_INVALID', cap.capability_id);
  const allowedDispatch = new Set(['QUALIFIED_SERVICE_OPERATION','BOOK_INTERNAL_AUTHORITY_GATE','DECLARED_AUTHORITY_NO_CALLABLE_INTERFACE']);
  if (!allowedDispatch.has(cap.dispatch_class)) fail('UNKNOWN_DISPATCH_CLASS', cap.dispatch_class);
  if (cap.dispatch_class === 'QUALIFIED_SERVICE_OPERATION') {
    if (!cap.callable) fail('QUALIFIED_SERVICE_MUST_BE_CALLABLE', cap.capability_id);
    if (!nonEmpty(cap.service_id) || !nonEmpty(cap.operation_id)) fail('SERVICE_OPERATION_REQUIRED', cap.capability_id);
    if (cap.canonical_write_authority) fail('PROVIDER_CANONICAL_WRITE_FORBIDDEN', cap.capability_id);
  }
  if (cap.dispatch_class === 'DECLARED_AUTHORITY_NO_CALLABLE_INTERFACE') {
    if (cap.callable) fail('DECLARED_NONCALLABLE_MUST_NOT_BE_CALLABLE', cap.capability_id);
    if (cap.service_id !== null || cap.operation_id !== null) fail('NONCALLABLE_SERVICE_OPERATION_MUST_BE_NULL', cap.capability_id);
  }
  if (cap.dispatch_class === 'BOOK_INTERNAL_AUTHORITY_GATE') {
    if (cap.owner_path !== 'SYSTEM_MASTER/BOOK') fail('BOOK_GATE_OWNER_MISMATCH', cap.capability_id);
    if (cap.callable) fail('BOOK_GATE_NOT_DISPATCHABLE_IN_PHASE2C', cap.capability_id);
  }
  if (cap.authority_domain === 'CANONICAL_MANUSCRIPT_MUTATION') {
    if (cap.owner_path !== 'SYSTEM_MASTER/BOOK' || cap.capability_id !== 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION' || cap.canonical_write_authority !== true) {
      fail('CANONICAL_MUTATION_AUTHORITY_VIOLATION', cap.capability_id);
    }
  } else if (cap.canonical_write_authority) {
    fail('NONBOOK_CANONICAL_WRITE_FORBIDDEN', cap.capability_id);
  }
  return true;
}

function validateRegistry(registry) {
  if (!isObject(registry)) fail('ROUTING_REGISTRY_REQUIRED');
  if (registry.contract_id !== 'BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001') fail('ROUTING_CONTRACT_ID_MISMATCH');
  if (!Array.isArray(registry.capabilities) || registry.capabilities.length === 0) fail('CAPABILITIES_REQUIRED');
  const seen = new Set();
  let canonicalMutationCount = 0;
  for (const cap of registry.capabilities) {
    validateCapability(cap);
    if (seen.has(cap.capability_id)) fail('DUPLICATE_CAPABILITY_ID', cap.capability_id);
    seen.add(cap.capability_id);
    if (cap.authority_domain === 'CANONICAL_MANUSCRIPT_MUTATION') canonicalMutationCount += 1;
  }
  if (canonicalMutationCount !== 1) fail('SINGLE_CANONICAL_MUTATION_CAPABILITY_REQUIRED', String(canonicalMutationCount));
  const requiredServiceCapabilities = [
    'PROSE.ANALYZE_PASSAGE','PROSE.GENERATE_REVISION_CANDIDATE','PROSE.ASSESS_VOICE','PROSE.ASSESS_HOMOGENIZATION',
    'EVALUATION.INDEPENDENT_BOOK_OR_UNIT','EVALUATION.CONTRASTIVE_CANDIDATE','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE'
  ];
  for (const id of requiredServiceCapabilities) {
    const cap = registry.capabilities.find(x => x.capability_id === id);
    if (!cap || cap.dispatch_class !== 'QUALIFIED_SERVICE_OPERATION' || !cap.callable) fail('REQUIRED_SERVICE_CAPABILITY_MISSING', id);
  }
  return true;
}

function resolveCapability(request, registry = loadDefaultRegistry()) {
  validateRegistry(registry);
  if (!isObject(request)) fail('CAPABILITY_LOOKUP_REQUEST_REQUIRED');
  if (!nonEmpty(request.capability_id)) fail('CAPABILITY_ID_REQUIRED');
  if (!nonEmpty(request.required_authority_domain)) fail('REQUIRED_AUTHORITY_DOMAIN_REQUIRED');
  const matches = registry.capabilities.filter(x => x.capability_id === request.capability_id);
  if (matches.length === 0) fail('UNKNOWN_CAPABILITY', request.capability_id);
  if (matches.length !== 1) fail('AMBIGUOUS_CAPABILITY', request.capability_id);
  const cap = matches[0];
  if (cap.authority_domain !== request.required_authority_domain) fail('AUTHORITY_DOMAIN_MISMATCH', `${request.capability_id}:${request.required_authority_domain}->${cap.authority_domain}`);
  return clone(cap);
}

function resolveCallableCapability(request, registry = loadDefaultRegistry()) {
  const cap = resolveCapability(request, registry);
  if (!cap.callable) fail('CAPABILITY_NOT_CALLABLE', cap.capability_id);
  if (cap.dispatch_class !== 'QUALIFIED_SERVICE_OPERATION') fail('CAPABILITY_NOT_SERVICE_OPERATION', cap.capability_id);
  return cap;
}

function assertNoCanonicalWrite(capabilityDescriptor) {
  validateCapability(capabilityDescriptor);
  if (capabilityDescriptor.canonical_write_authority) fail('CANONICAL_WRITE_DESCRIPTOR_NOT_DISPATCHABLE', capabilityDescriptor.capability_id);
  return true;
}

module.exports = {
  CONTRACT_PATH,
  BookCapabilityRoutingError,
  loadDefaultRegistry,
  validateCapability,
  validateRegistry,
  resolveCapability,
  resolveCallableCapability,
  assertNoCanonicalWrite
};
