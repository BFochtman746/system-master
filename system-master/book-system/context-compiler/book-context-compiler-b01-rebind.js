'use strict';

const crypto = require('crypto');
const donor = require('./book-context-compiler');
const capabilityBindings = require('../book-capability-binding-v1');

function failResult(reason, code = 'REJECTED_AUTHORITY_BOUNDARY') {
  return { result_class: code, reason, canonical_effect: false };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function stable(value) {
  return capabilityBindings.stable(value);
}

function expectedConsumerRole(packageClass) {
  if (packageClass === 'GENERATION_CONTEXT') return 'BOOK_OWNED_GENERATION_ADAPTER';
  if (packageClass === 'EVALUATION_CONTEXT') return 'BOOK_OWNED_EVALUATION_ADAPTER';
  return null;
}

function semanticBoundProjection(compiled, binding) {
  return stable({
    bound_context_schema_version: '1',
    context_package_id: compiled.context_package_id,
    context_package_digest_sha256: compiled.package_digest_sha256,
    package_class: compiled.package_class,
    current_capability_id: binding.current_capability_id,
    current_owner_path: binding.current_owner_path,
    capability_binding_id: binding.binding_id,
    capability_binding_digest: binding.binding_digest,
    adapter_id: binding.adapter_id,
    adapter_version: binding.adapter_version,
    provider_service_id: binding.provider_provenance.historical_or_provider_service_id,
    provider_operation_id: binding.provider_provenance.operation_id,
    provider_subject_ref: binding.provider_provenance.provider_subject_ref,
    provider_execution_standing: binding.provider_provenance.provider_subject_ref === null
      ? 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED'
      : 'SUBJECT_REFERENCE_PRESENT__AVAILABILITY_UNPROVEN',
    canonical_write_authority: false,
    publication_authority: false,
    author_decision_authority: false,
    private_data_authority: 'NOT_GRANTED_BY_BINDING'
  });
}

function validateCapabilityRequest(input, binding) {
  const request = input && input.capability_request;
  if (!request || typeof request !== 'object') return 'CAPABILITY_REQUEST_MISSING';
  if (request.capability_id !== binding.current_capability_id) return 'CURRENT_CAPABILITY_BINDING_MISMATCH';
  if (request.authority_domain !== binding.authority_domain) return 'CAPABILITY_AUTHORITY_DOMAIN_MISMATCH';
  if (request.service_registry_id !== binding.provider_provenance.service_registry_id) return 'SERVICE_REGISTRY_BINDING_MISMATCH';
  if (request.service_registry_subject_sha !== binding.provider_provenance.service_registry_subject_or_digest) return 'SERVICE_REGISTRY_SUBJECT_BINDING_MISMATCH';
  if (String(request.integration_owner || '').toUpperCase() !== 'BOOK') return 'CURRENT_INTEGRATION_OWNER_MUST_BE_BOOK';
  const expectedRole = expectedConsumerRole(input.package_class);
  if (expectedRole && request.consumer_role !== expectedRole) return 'CONTEXT_CONSUMER_ROLE_MISMATCH';
  return null;
}

function compileBoundContext(args) {
  if (!args || typeof args !== 'object') return failResult('BOUND_CONTEXT_ARGUMENTS_REQUIRED');
  const input = args.context_input;
  const live = args.live || {};
  let binding;
  try {
    binding = capabilityBindings.resolveBinding(args.current_capability_id, args.expected_authority_domain, {
      registry: args.binding_registry || capabilityBindings.buildRegistry(),
      requireExecutable: false
    });
  } catch (err) {
    return failResult(err.code || 'CAPABILITY_BINDING_INVALID');
  }

  const requestProblem = validateCapabilityRequest(input, binding);
  if (requestProblem) return failResult(requestProblem);

  const liveService = live.capability_request || {};
  if (liveService.service_registry_id !== undefined && liveService.service_registry_id !== binding.provider_provenance.service_registry_id) {
    return failResult('LIVE_SERVICE_REGISTRY_BINDING_MISMATCH', 'STALE_CONTEXT');
  }
  if (liveService.service_registry_subject_sha !== undefined && liveService.service_registry_subject_sha !== binding.provider_provenance.service_registry_subject_or_digest) {
    return failResult('LIVE_SERVICE_REGISTRY_SUBJECT_MISMATCH', 'STALE_CONTEXT');
  }

  const boundLive = {
    ...live,
    capability_request: {
      service_registry_id: binding.provider_provenance.service_registry_id,
      service_registry_subject_sha: binding.provider_provenance.service_registry_subject_or_digest
    }
  };
  const compiled = donor.compileContext(input, boundLive, args.now || new Date());
  if (compiled.result_class !== 'PACKAGE_READY') return compiled;

  const projection = semanticBoundProjection(compiled, binding);
  const boundDigest = sha256(JSON.stringify(projection));
  const envelope = stable({
    ...projection,
    bound_context_id: `book-bound-context-v1:${boundDigest}`,
    bound_context_digest_sha256: boundDigest
  });

  return {
    result_class: 'BOUND_CONTEXT_READY',
    context_package_id: compiled.context_package_id,
    package_digest_sha256: compiled.package_digest_sha256,
    capability_binding_id: binding.binding_id,
    capability_binding_digest: binding.binding_digest,
    provider_execution_standing: envelope.provider_execution_standing,
    canonical_effect: false,
    compiled_context: compiled,
    bound_context: envelope
  };
}

function validateBoundContext(envelope) {
  if (!envelope || typeof envelope !== 'object') throw Object.assign(new Error('INVALID_BOUND_CONTEXT'), { code: 'INVALID_BOUND_CONTEXT' });
  const required = [
    'bound_context_schema_version','context_package_id','context_package_digest_sha256','package_class',
    'current_capability_id','current_owner_path','capability_binding_id','capability_binding_digest',
    'adapter_id','adapter_version','provider_service_id','provider_operation_id','provider_subject_ref',
    'provider_execution_standing','canonical_write_authority','publication_authority',
    'author_decision_authority','private_data_authority','bound_context_id','bound_context_digest_sha256'
  ];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(envelope, key)) throw Object.assign(new Error(`MISSING:${key}`), { code: 'INVALID_BOUND_CONTEXT' });
  }
  if (envelope.bound_context_schema_version !== '1') throw Object.assign(new Error('UNSUPPORTED_BOUND_CONTEXT_SCHEMA'), { code: 'UNSUPPORTED_BOUND_CONTEXT_SCHEMA' });
  if (envelope.current_owner_path !== 'SYSTEM_MASTER/BOOK') throw Object.assign(new Error('INVALID_BOUND_CONTEXT_OWNER'), { code: 'INVALID_BOUND_CONTEXT_OWNER' });
  if (envelope.current_capability_id.startsWith('PROSE.')) throw Object.assign(new Error('RETIRED_PROSE_EXECUTION_ID'), { code: 'RETIRED_PROSE_EXECUTION_ID' });
  if (envelope.canonical_write_authority !== false || envelope.publication_authority !== false || envelope.author_decision_authority !== false) {
    throw Object.assign(new Error('BOUND_CONTEXT_AUTHORITY_WIDENING'), { code: 'BOUND_CONTEXT_AUTHORITY_WIDENING' });
  }
  if (envelope.private_data_authority !== 'NOT_GRANTED_BY_BINDING') throw Object.assign(new Error('PRIVATE_AUTHORITY_WIDENING_FORBIDDEN'), { code: 'PRIVATE_AUTHORITY_WIDENING_FORBIDDEN' });
  const projection = { ...envelope };
  delete projection.bound_context_id;
  delete projection.bound_context_digest_sha256;
  const expected = sha256(JSON.stringify(stable(projection)));
  if (envelope.bound_context_digest_sha256 !== expected) throw Object.assign(new Error('BOUND_CONTEXT_DIGEST_MISMATCH'), { code: 'BOUND_CONTEXT_DIGEST_MISMATCH' });
  if (envelope.bound_context_id !== `book-bound-context-v1:${expected}`) throw Object.assign(new Error('BOUND_CONTEXT_ID_MISMATCH'), { code: 'BOUND_CONTEXT_ID_MISMATCH' });
  return true;
}

function assertBoundContextFresh(envelope, options = {}) {
  validateBoundContext(envelope);
  let current;
  try {
    current = capabilityBindings.resolveBinding(envelope.current_capability_id, undefined, {
      registry: options.binding_registry || capabilityBindings.buildRegistry(),
      requireExecutable: false
    });
  } catch (err) {
    const out = new Error(err.code || 'BOUND_CONTEXT_BINDING_MISSING');
    out.code = 'STALE_BOUND_CONTEXT';
    throw out;
  }
  if (current.binding_id !== envelope.capability_binding_id || current.binding_digest !== envelope.capability_binding_digest) {
    const err = new Error('CAPABILITY_BINDING_CHANGED');
    err.code = 'STALE_BOUND_CONTEXT';
    throw err;
  }
  if (current.provider_provenance.provider_subject_ref !== envelope.provider_subject_ref) {
    const err = new Error('PROVIDER_SUBJECT_CHANGED');
    err.code = 'STALE_BOUND_CONTEXT';
    throw err;
  }
  return true;
}

module.exports = {
  compileBoundContext,
  validateBoundContext,
  assertBoundContextFresh,
  semanticBoundProjection,
  expectedConsumerRole
};
