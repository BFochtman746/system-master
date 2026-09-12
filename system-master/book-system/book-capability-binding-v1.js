'use strict';

const crypto = require('crypto');
const path = require('path');

const OWNER_PATH = 'SYSTEM_MASTER/BOOK';
const SCHEMA_VERSION = '1';
const RETIRED_OWNER_PREFIX = 'SYSTEM_MASTER/BOOK/PROSE';
const ALLOWED_CONTEXT_CLASSES = new Set(['GENERATION_CONTEXT', 'EVALUATION_CONTEXT']);
const ALLOWED_CONCURRENCY_CLASSES = new Set([
  'READ_ONLY_PARALLEL_ELIGIBLE',
  'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING',
  'ISOLATION_GATED'
]);
const AUTHORITY_FALSE_FIELDS = [
  'canonical_write_authority',
  'lifecycle_transition_authority',
  'export_freeze_authority',
  'publication_authority',
  'author_decision_authority'
];
const SEMANTIC_FIELDS = [
  'binding_schema_version',
  'current_capability_id',
  'current_owner_path',
  'adapter_id',
  'adapter_version',
  'authority_domain',
  'context_package_class',
  'registered_idempotent',
  'concurrency_policy_class',
  'provider_provenance',
  'canonical_write_authority',
  'lifecycle_transition_authority',
  'export_freeze_authority',
  'publication_authority',
  'author_decision_authority',
  'private_data_authority'
];

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  throw err;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function semanticProjection(input) {
  const out = {};
  for (const key of SEMANTIC_FIELDS) out[key] = input[key];
  return stable(out);
}

function digestBinding(input) {
  return sha256(JSON.stringify(semanticProjection(input)));
}

function isRetiredExecutionIdentity(capabilityId, ownerPath, serviceId) {
  const cap = String(capabilityId || '').toUpperCase();
  const owner = String(ownerPath || '').toUpperCase();
  const service = String(serviceId || '').toUpperCase();
  return cap.startsWith('PROSE.') || owner === RETIRED_OWNER_PREFIX || owner.startsWith(`${RETIRED_OWNER_PREFIX}/`) || service === 'PROSE_ANALYSIS_AND_REVISION' && cap.startsWith('PROSE.');
}

function assertProviderProvenance(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail('INVALID_PROVIDER_PROVENANCE');
  const required = [
    'historical_or_provider_service_id',
    'operation_id',
    'provider_class',
    'provider_subject_ref',
    'service_registry_id',
    'service_registry_subject_or_digest'
  ];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(p, key)) fail('INVALID_PROVIDER_PROVENANCE', `missing ${key}`);
  }
  for (const key of ['historical_or_provider_service_id', 'operation_id', 'provider_class', 'service_registry_id', 'service_registry_subject_or_digest']) {
    if (typeof p[key] !== 'string' || p[key].length === 0) fail('INVALID_PROVIDER_PROVENANCE', `invalid ${key}`);
  }
  if (!(p.provider_subject_ref === null || (typeof p.provider_subject_ref === 'string' && p.provider_subject_ref.length > 0))) {
    fail('INVALID_PROVIDER_PROVENANCE', 'provider_subject_ref must be null or nonempty string');
  }
  return true;
}

function validateBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) fail('INVALID_CAPABILITY_BINDING');
  if (binding.binding_schema_version !== SCHEMA_VERSION) fail('UNSUPPORTED_BINDING_SCHEMA');
  if (typeof binding.current_capability_id !== 'string' || !binding.current_capability_id.startsWith('BOOK.')) fail('INVALID_CURRENT_CAPABILITY_ID');
  if (binding.current_capability_id.startsWith('PROSE.')) fail('RETIRED_PROSE_EXECUTION_ID');
  if (binding.current_owner_path !== OWNER_PATH) fail('INVALID_CURRENT_OWNER_PATH');
  if (isRetiredExecutionIdentity(binding.current_capability_id, binding.current_owner_path, null)) fail('RETIRED_PROSE_EXECUTION_ID');
  for (const key of ['adapter_id', 'adapter_version', 'authority_domain', 'private_data_authority']) {
    if (typeof binding[key] !== 'string' || binding[key].length === 0) fail('INVALID_CAPABILITY_BINDING', `invalid ${key}`);
  }
  if (!ALLOWED_CONTEXT_CLASSES.has(binding.context_package_class)) fail('INVALID_CONTEXT_PACKAGE_CLASS');
  if (typeof binding.registered_idempotent !== 'boolean') fail('INVALID_IDEMPOTENCY_CLASS');
  if (!ALLOWED_CONCURRENCY_CLASSES.has(binding.concurrency_policy_class)) fail('INVALID_CONCURRENCY_POLICY_CLASS');
  assertProviderProvenance(binding.provider_provenance);
  for (const key of AUTHORITY_FALSE_FIELDS) {
    if (binding[key] !== false) fail('AUTHORITY_WIDENING_FORBIDDEN', `${key} must be false`);
  }
  if (typeof binding.binding_digest !== 'string' || !/^[0-9a-f]{64}$/.test(binding.binding_digest)) fail('INVALID_BINDING_DIGEST');
  const expectedDigest = digestBinding(binding);
  if (binding.binding_digest !== expectedDigest) fail('BINDING_DIGEST_MISMATCH');
  const expectedId = `book-capability-binding-v1:${expectedDigest}`;
  if (binding.binding_id !== expectedId) fail('BINDING_ID_CONTENT_ADDRESS_MISMATCH');
  return true;
}

function createBinding(input) {
  if (!input || typeof input !== 'object') fail('INVALID_CAPABILITY_BINDING');
  const semantic = {
    binding_schema_version: SCHEMA_VERSION,
    current_capability_id: input.current_capability_id,
    current_owner_path: OWNER_PATH,
    adapter_id: input.adapter_id,
    adapter_version: input.adapter_version,
    authority_domain: input.authority_domain,
    context_package_class: input.context_package_class,
    registered_idempotent: input.registered_idempotent,
    concurrency_policy_class: input.concurrency_policy_class,
    provider_provenance: stable(input.provider_provenance),
    canonical_write_authority: false,
    lifecycle_transition_authority: false,
    export_freeze_authority: false,
    publication_authority: false,
    author_decision_authority: false,
    private_data_authority: input.private_data_authority || 'NOT_GRANTED_BY_BINDING'
  };
  if (isRetiredExecutionIdentity(semantic.current_capability_id, semantic.current_owner_path, null)) fail('RETIRED_PROSE_EXECUTION_ID');
  const bindingDigest = digestBinding(semantic);
  const binding = stable({
    ...semantic,
    binding_id: `book-capability-binding-v1:${bindingDigest}`,
    binding_digest: bindingDigest
  });
  validateBinding(binding);
  return binding;
}

function loadRegistrySource() {
  const registryPath = path.join(__dirname, 'book-capability-binding-v1.registry.json');
  delete require.cache[require.resolve(registryPath)];
  return require(registryPath);
}

function buildRegistry(source = loadRegistrySource()) {
  if (!source || source.registry_schema_version !== '1' || !Array.isArray(source.binding_inputs)) fail('INVALID_BINDING_REGISTRY');
  const bindings = source.binding_inputs.map(createBinding);
  const byCapability = new Map();
  const byId = new Map();
  for (const binding of bindings) {
    if (byCapability.has(binding.current_capability_id)) fail('DUPLICATE_CURRENT_CAPABILITY_ID');
    if (byId.has(binding.binding_id)) fail('BINDING_ID_CONFLICT');
    byCapability.set(binding.current_capability_id, binding);
    byId.set(binding.binding_id, binding);
  }
  return {
    registry_schema_version: '1',
    owner_path: OWNER_PATH,
    bindings,
    byCapability,
    byId,
    registry_digest: sha256(JSON.stringify(bindings.map(b => b.binding_digest).sort()))
  };
}

function resolveBinding(capabilityId, expectedAuthorityDomain, options = {}) {
  if (String(capabilityId || '').toUpperCase().startsWith('PROSE.')) fail('RETIRED_PROSE_EXECUTION_ID');
  const registry = options.registry || buildRegistry();
  const binding = registry.byCapability.get(capabilityId);
  if (!binding) fail('CAPABILITY_BINDING_NOT_FOUND');
  validateBinding(binding);
  if (expectedAuthorityDomain !== undefined && binding.authority_domain !== expectedAuthorityDomain) fail('CAPABILITY_AUTHORITY_DOMAIN_MISMATCH');
  if (options.requireExecutable === true && binding.provider_provenance.provider_subject_ref === null) fail('PROVIDER_SUBJECT_UNADMITTED');
  return JSON.parse(JSON.stringify(binding));
}

function assertCreateOnce(existing, candidate) {
  validateBinding(candidate);
  if (!existing) return { action: 'CREATE', binding: candidate };
  validateBinding(existing);
  if (existing.binding_id !== candidate.binding_id) fail('BINDING_ID_CONFLICT');
  if (existing.binding_digest !== candidate.binding_digest || JSON.stringify(stable(existing)) !== JSON.stringify(stable(candidate))) fail('BINDING_ID_CONFLICT');
  return { action: 'REUSE', binding: existing };
}

module.exports = {
  OWNER_PATH,
  SCHEMA_VERSION,
  stable,
  semanticProjection,
  digestBinding,
  createBinding,
  validateBinding,
  buildRegistry,
  resolveBinding,
  assertCreateOnce,
  isRetiredExecutionIdentity
};
