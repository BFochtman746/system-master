'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-system-service-interface-002');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(runnerTemp, `book-system-service-interface-002-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const registryRel = 'qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json';
const fixturesRel = 'qualification/book-system/service-interface-002/SERVICE-INTERFACE-FIXTURES-002.json';
const scriptRel = '.github/scripts/book-system-service-interface-002-qualify.js';
const registryPath = path.join(workspace, ...registryRel.split('/'));
const fixturesPath = path.join(workspace, ...fixturesRel.split('/'));

class QualificationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new QualificationError(code, detail); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }

function deepMerge(target, patch) {
  if (Array.isArray(patch)) return clone(patch);
  if (!isObject(patch)) return clone(patch);
  const out = isObject(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isObject(value) ? deepMerge(out[key], value) : clone(value);
  }
  return out;
}

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableNormalize(value[key]);
    return out;
  }
  return value;
}
function stableStringify(value) { return JSON.stringify(stableNormalize(value)); }
function digest(value) { return sha256Bytes(Buffer.from(stableStringify(value), 'utf8')); }

function requireFields(obj, fields, context) {
  if (!isObject(obj)) fail('OBJECT_REQUIRED', context);
  for (const field of fields) if (!hasOwn(obj, field)) fail('REQUIRED_FIELD_MISSING', `${context}.${field}`);
}

function deletePath(obj, dottedPath) {
  if (!dottedPath) return;
  const parts = dottedPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (current == null || !hasOwn(current, key)) return;
    current = current[key];
  }
  const finalKey = /^\d+$/.test(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
  if (current != null) delete current[finalKey];
}

function validateSourceIdentityRefs(refs, context) {
  if (!Array.isArray(refs) || refs.length === 0) fail('SOURCE_IDENTITY_REFS_REQUIRED', context);
  refs.forEach((ref, index) => {
    if (!isObject(ref)) fail('SOURCE_IDENTITY_OBJECT_REQUIRED', `${context}.${index}`);
    for (const field of ['object_id', 'object_version', 'object_digest']) {
      if (!hasOwn(ref, field)) fail('SOURCE_IDENTITY_FIELD_MISSING', `${context}.${index}.${field}`);
    }
    if (!isSha256(ref.object_digest)) fail('INVALID_SOURCE_OBJECT_DIGEST', `${context}.${index}`);
  });
}

function validateEditorialContext(registry, context, label) {
  if (!isObject(context)) fail('EDITORIAL_STAGE_CONTEXT_REQUIRED', label);
  if (!registry.editorial_stage_context.recognized_stages.includes(context.stage_token)) {
    fail('UNKNOWN_EDITORIAL_STAGE', String(context.stage_token));
  }
  if (!['APPLICABLE', 'NOT_APPLICABLE'].includes(context.applicability)) {
    fail('INVALID_EDITORIAL_APPLICABILITY', String(context.applicability));
  }
  if (context.applicability === 'NOT_APPLICABLE' &&
      (typeof context.not_applicable_rationale !== 'string' || context.not_applicable_rationale.trim().length === 0)) {
    fail('NOT_APPLICABLE_RATIONALE_REQUIRED');
  }
}

function validateRegistry(registry, expectedServiceCount = null, expectedOperationCount = null) {
  if (registry.registry_id !== 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002') fail('REGISTRY_ID_MISMATCH');
  if (registry.registry_version !== 2) fail('REGISTRY_VERSION_MISMATCH');
  if (registry.schema_compatibility.v2_request_schema_version !== 2 ||
      registry.schema_compatibility.v2_response_schema_version !== 2 ||
      registry.schema_compatibility.v1_envelopes_accepted_by_v2_registry !== false ||
      registry.schema_compatibility.automatic_cross_version_field_inference !== false) {
    fail('SCHEMA_COMPATIBILITY_FAIL_CLOSED_REQUIRED');
  }
  requireFields(registry.common_request_envelope, ['schema_version', 'required', 'source_identity_ref_required', 'authority_context_required'], 'common_request_envelope');
  requireFields(registry.common_response_envelope, ['schema_version', 'required', 'provider_subject_required', 'parent_projection_identity_required', 'result_classes', 'requested_parent_actions', 'provider_technical_states_allowed', 'provider_technical_states_forbidden'], 'common_response_envelope');
  if (registry.common_request_envelope.schema_version !== 2 || registry.common_response_envelope.schema_version !== 2) fail('V2_SCHEMA_REQUIRED');
  for (const resultClass of ['SUCCESS', 'PARTIAL', 'ABSTAIN', 'REJECTED', 'ERROR']) {
    if (!registry.common_response_envelope.result_classes.includes(resultClass)) fail('RESULT_CLASS_REQUIRED', resultClass);
  }
  for (const state of ['EXPORT_FROZEN', 'PUBLICATION_AUTHORIZED']) {
    if (!registry.common_response_envelope.provider_technical_states_forbidden.includes(state)) fail('FORBIDDEN_TECHNICAL_STATE_REQUIRED', state);
  }
  if (registry.editorial_stage_context.provider_stage_completion_authority !== false) fail('PROVIDER_STAGE_AUTHORITY_MUST_BE_FALSE');
  if (!isObject(registry.services)) fail('SERVICES_REQUIRED');
  const requiredFamilies = ['PROSE_ANALYSIS_AND_REVISION', 'BOOK_EVALUATION', 'RESEARCH_AND_EVIDENCE', 'DOCUMENT_ARTIFACT_AND_EXPORT'];
  for (const family of requiredFamilies) if (!hasOwn(registry.services, family)) fail('REQUIRED_SERVICE_FAMILY_MISSING', family);
  if (registry.services.PROSE_ANALYSIS_AND_REVISION.provider_class !== 'PROSE_SYSTEM') fail('PROSE_CANONICAL_PROVIDER_CLASS_REQUIRED');
  if (registry.services.PROSE_ANALYSIS_AND_REVISION.canonical_owner_path !== 'SYSTEM_MASTER/BOOK/PROSE') fail('PROSE_OWNER_PATH_MISMATCH');
  if (registry.services.BOOK_EVALUATION.canonical_owner_path !== 'SYSTEM_MASTER/BOOK/PROSE') fail('BOOK_EVALUATOR_OWNER_PATH_MISMATCH');
  const docService = registry.services.DOCUMENT_ARTIFACT_AND_EXPORT;
  if (docService.provider_class !== 'HEADLESS_ARTIFACT_SERVICE') fail('DOCUMENT_PROVIDER_CLASS_MISMATCH');
  if (docService.planned_document_system_label_is_topology_authority !== false) fail('PLANNED_DOCUMENT_LABEL_CANNOT_CREATE_TOPOLOGY');
  if (String(docService.canonical_owner_path).startsWith('SYSTEM_MASTER/BOOK')) fail('BOOK_CANNOT_OWN_DOCUMENT_IMPLEMENTATION');

  const requiredDocumentOperations = [
    'MATERIALIZE_DURABLE_ARTIFACT',
    'EXPORT_FROZEN_MANUSCRIPT',
    'VERIFY_ARTIFACT_IDENTITY',
    'VALIDATE_TARGET_MEDIUM_ARTIFACT',
    'VERIFY_SOURCE_TO_RENDER_INTEGRITY',
    'POST_LAYOUT_PROOF_ARTIFACT',
    'ATTACH_OR_VALIDATE_PROVENANCE'
  ];
  for (const operationId of requiredDocumentOperations) {
    if (!hasOwn(docService.operations, operationId)) fail('REQUIRED_DOCUMENT_OPERATION_MISSING', operationId);
  }

  const safeParentActions = new Set(registry.common_response_envelope.requested_parent_actions);
  const forbiddenDirect = new Set(registry.parent_admission_handoff.forbidden_direct_operations_from_service || []);
  let operationCount = 0;
  for (const [serviceId, service] of Object.entries(registry.services)) {
    if (service.service_id !== serviceId) fail('SERVICE_KEY_ID_MISMATCH', serviceId);
    if (!registry.provider_classes.includes(service.provider_class)) fail('UNKNOWN_PROVIDER_CLASS', `${serviceId}:${service.provider_class}`);
    if (service.canonical_write_authority !== false) fail('SERVICE_CANONICAL_WRITE_AUTHORITY_MUST_BE_FALSE', serviceId);
    if (!isObject(service.operations) || Object.keys(service.operations).length === 0) fail('SERVICE_OPERATIONS_REQUIRED', serviceId);
    for (const [operationId, operation] of Object.entries(service.operations)) {
      operationCount += 1;
      if (operation.operation_id !== operationId) fail('OPERATION_KEY_ID_MISMATCH', `${serviceId}:${operationId}`);
      if (typeof operation.idempotent !== 'boolean') fail('OPERATION_IDEMPOTENCY_REQUIRED', `${serviceId}:${operationId}`);
      if (typeof operation.stage_scoped !== 'boolean') fail('OPERATION_STAGE_SCOPE_REQUIRED', `${serviceId}:${operationId}`);
      for (const field of ['required_projection', 'allowed_outputs', 'requested_parent_action_allowed']) {
        if (!Array.isArray(operation[field])) fail('OPERATION_ARRAY_REQUIRED', `${serviceId}:${operationId}:${field}`);
      }
      if (operation.stage_scoped && !operation.required_projection.includes('editorial_stage_context')) {
        fail('STAGE_SCOPED_OPERATION_MISSING_CONTEXT', `${serviceId}:${operationId}`);
      }
      for (const action of operation.requested_parent_action_allowed) {
        if (!safeParentActions.has(action)) fail('UNKNOWN_PARENT_ACTION', `${serviceId}:${operationId}:${action}`);
        if (forbiddenDirect.has(action)) fail('DIRECT_CANONICAL_ACTION_REGISTERED', `${serviceId}:${operationId}:${action}`);
      }
    }
  }
  if (expectedServiceCount !== null && Object.keys(registry.services).length !== expectedServiceCount) fail('SERVICE_COUNT_MISMATCH');
  if (expectedOperationCount !== null && operationCount !== expectedOperationCount) fail('OPERATION_COUNT_MISMATCH', String(operationCount));
  return { service_count: Object.keys(registry.services).length, operation_count: operationCount };
}

function resolveOperation(registry, request) {
  const service = registry.services[request.service_id];
  if (!service) fail('UNKNOWN_SERVICE_ID', String(request.service_id));
  const operation = service.operations[request.operation_id];
  if (!operation) fail('UNKNOWN_OPERATION_ID', `${request.service_id}:${String(request.operation_id)}`);
  return { service, operation };
}

function validateRequest(registry, request) {
  requireFields(request, registry.common_request_envelope.required, 'request');
  if (request.schema_version !== 2) fail('UNKNOWN_REQUEST_SCHEMA_VERSION', String(request.schema_version));
  if (!Number.isInteger(request.parent_state_version) || request.parent_state_version < 1) fail('INVALID_PARENT_STATE_VERSION');
  if (!isSha256(request.parent_state_digest)) fail('INVALID_PARENT_STATE_DIGEST');
  if (!Array.isArray(request.target_refs)) fail('TARGET_REFS_ARRAY_REQUIRED');
  validateSourceIdentityRefs(request.source_identity_refs, 'request.source_identity_refs');
  requireFields(request.authority_context, registry.common_request_envelope.authority_context_required, 'request.authority_context');
  if (request.authority_context.canonical_write_allowed !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (request.authority_context.lifecycle_transition_allowed !== false) fail('SERVICE_LIFECYCLE_TRANSITION_FORBIDDEN');
  if (request.authority_context.export_freeze_allowed !== false) fail('SERVICE_EXPORT_FREEZE_FORBIDDEN');
  if (request.authority_context.publication_authorized !== false) fail('SERVICE_PUBLICATION_AUTHORITY_FORBIDDEN');
  const { service, operation } = resolveOperation(registry, request);
  if (service.canonical_write_authority !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (!isObject(request.projection)) fail('REQUEST_PROJECTION_REQUIRED');
  for (const field of operation.required_projection) {
    if (!hasOwn(request.projection, field)) fail('REQUIRED_PROJECTION_FIELD_MISSING', field);
  }
  if (hasOwn(request.projection, 'publication_authorized') && request.projection.publication_authorized !== false) {
    fail('SERVICE_PUBLICATION_AUTHORITY_FORBIDDEN');
  }
  if (operation.stage_scoped) validateEditorialContext(registry, request.projection.editorial_stage_context, 'request.projection.editorial_stage_context');
  return { service, operation };
}

function validateArtifactEvidence(registry, evidence) {
  requireFields(evidence, registry.artifact_evidence_contract.required_when_artifact_returned, 'artifact_evidence');
  if (!isSha256(evidence.artifact_digest)) fail('INVALID_ARTIFACT_DIGEST');
  if (!registry.artifact_evidence_contract.artifact_currentness_states.includes(evidence.artifact_currentness)) {
    fail('UNKNOWN_ARTIFACT_CURRENTNESS', String(evidence.artifact_currentness));
  }
}

function validateTargetMediumEvidence(registry, evidence) {
  requireFields(evidence, registry.target_medium_evidence_contract.required_when_target_medium_operation, 'target_medium_evidence');
  if (registry.common_response_envelope.provider_technical_states_forbidden.includes(evidence.technical_state)) {
    fail('PROVIDER_TECHNICAL_STATE_FORBIDDEN', evidence.technical_state);
  }
  if (!registry.common_response_envelope.provider_technical_states_allowed.includes(evidence.technical_state)) {
    fail('UNKNOWN_PROVIDER_TECHNICAL_STATE', String(evidence.technical_state));
  }
  if (!isSha256(evidence.rendered_candidate_digest)) fail('INVALID_RENDERED_CANDIDATE_DIGEST');
}

function validateProvenanceEvidence(registry, evidence, artifactEvidence) {
  requireFields(evidence, registry.provenance_evidence_contract.required_when_present, 'provenance_evidence');
  if (!isSha256(evidence.bound_artifact_digest)) fail('INVALID_PROVENANCE_BOUND_ARTIFACT_DIGEST');
  if (!isSha256(evidence.projection_digest)) fail('INVALID_PROVENANCE_PROJECTION_DIGEST');
  if (!registry.provenance_evidence_contract.currentness_states.includes(evidence.currentness_state)) {
    fail('UNKNOWN_PROVENANCE_CURRENTNESS', String(evidence.currentness_state));
  }
  if (evidence.credential_attachment_changed_bytes === true) {
    if (!isSha256(evidence.pre_credential_artifact_digest)) fail('PRE_CREDENTIAL_DIGEST_REQUIRED');
    if (evidence.pre_credential_artifact_digest === evidence.bound_artifact_digest) {
      fail('CREDENTIAL_CHANGED_BYTES_REQUIRES_NEW_DIGEST');
    }
  }
  if (artifactEvidence.length > 0 && !artifactEvidence.some(item => item.artifact_digest === evidence.bound_artifact_digest)) {
    fail('PROVENANCE_ARTIFACT_BINDING_MISMATCH');
  }
}

function validateResponse(registry, request, response) {
  const { service, operation } = validateRequest(registry, request);
  requireFields(response, registry.common_response_envelope.required, 'response');
  if (response.schema_version !== 2) fail('UNKNOWN_RESPONSE_SCHEMA_VERSION', String(response.schema_version));
  for (const field of ['request_id', 'correlation_id', 'idempotency_key', 'service_id', 'operation_id']) {
    if (response[field] !== request[field]) fail('RESPONSE_REQUEST_BINDING_MISMATCH', field);
  }
  if (response.provider_class !== service.provider_class) fail('PROVIDER_CLASS_MISMATCH', `${response.provider_class}:${service.provider_class}`);
  requireFields(response.provider_subject, registry.common_response_envelope.provider_subject_required, 'response.provider_subject');
  requireFields(response.parent_projection_identity, registry.common_response_envelope.parent_projection_identity_required, 'response.parent_projection_identity');
  if (response.parent_projection_identity.parent_state_version !== request.parent_state_version ||
      response.parent_projection_identity.parent_state_digest !== request.parent_state_digest) fail('STALE_PARENT_PROJECTION');
  validateSourceIdentityRefs(response.source_identity_refs, 'response.source_identity_refs');
  if (stableStringify(response.source_identity_refs) !== stableStringify(request.source_identity_refs)) fail('SOURCE_IDENTITY_BINDING_MISMATCH');
  if (!registry.common_response_envelope.result_classes.includes(response.result_class)) fail('UNKNOWN_RESULT_CLASS', String(response.result_class));
  if (!operation.requested_parent_action_allowed.includes(response.requested_parent_action)) fail('PARENT_ACTION_NOT_ALLOWED_FOR_OPERATION', response.requested_parent_action);
  for (const field of ['evidence_refs', 'proposal_refs', 'artifact_evidence', 'editorial_stage_evidence', 'target_medium_evidence', 'provenance_evidence', 'abstentions', 'warnings']) {
    if (!Array.isArray(response[field])) fail('RESPONSE_ARRAY_REQUIRED', field);
  }
  if (response.result_class === 'ABSTAIN' && response.abstentions.length === 0) fail('ABSTENTION_REASON_REQUIRED');
  if (response.result_class === 'ERROR' && response.warnings.length === 0 && response.evidence_refs.length === 0) fail('ERROR_DETAIL_REQUIRED');
  for (const forbiddenField of ['canonical_write', 'lifecycle_transition_allowed', 'export_freeze_allowed', 'publication_authorized']) {
    if (response[forbiddenField] === true) fail('PROVIDER_AUTHORITY_CLAIM_FORBIDDEN', forbiddenField);
  }

  const outputClasses = [
    ['artifact_evidence', response.artifact_evidence],
    ['editorial_stage_evidence', response.editorial_stage_evidence],
    ['target_medium_evidence', response.target_medium_evidence],
    ['provenance_evidence', response.provenance_evidence]
  ];
  for (const [outputClass, values] of outputClasses) {
    if (values.length > 0 && !operation.allowed_outputs.includes(outputClass)) fail('OUTPUT_CLASS_NOT_REGISTERED_FOR_OPERATION', outputClass);
  }

  response.artifact_evidence.forEach(item => validateArtifactEvidence(registry, item));
  response.editorial_stage_evidence.forEach(item => {
    validateEditorialContext(registry, item, 'response.editorial_stage_evidence');
    for (const field of registry.editorial_stage_context.stage_evidence_fields) {
      if (!hasOwn(item, field)) fail('EDITORIAL_STAGE_EVIDENCE_FIELD_MISSING', field);
    }
    if (item.stage_complete === true || item.lifecycle_advance_requested === true) fail('PROVIDER_STAGE_AUTHORITY_FORBIDDEN');
  });
  response.target_medium_evidence.forEach(item => validateTargetMediumEvidence(registry, item));
  response.provenance_evidence.forEach(item => validateProvenanceEvidence(registry, item, response.artifact_evidence));
  return { service, operation, result_class: response.result_class };
}

class IdempotencyLedger {
  constructor() { this.entries = new Map(); }
  submit(registry, request, outcomeKnown = true) {
    const { operation } = validateRequest(registry, request);
    const key = request.idempotency_key;
    const fingerprint = digest(request);
    const prior = this.entries.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
      if (!operation.idempotent && prior.outcomeKnown === false) fail('NONIDEMPOTENT_RETRY_REQUIRES_RECONCILIATION');
      return { disposition: 'REPLAY', request_fingerprint: fingerprint };
    }
    this.entries.set(key, { fingerprint, outcomeKnown });
    return { disposition: 'NEW', request_fingerprint: fingerprint };
  }
}

function run(command, args) {
  return spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, shell: false });
}
function gitHead() {
  const result = run('git', ['-c', `safe.directory=${workspace}`, 'rev-parse', 'HEAD']);
  if (result.error || result.status !== 0) fail('GIT_HEAD_FAILED', `${result.stderr || ''}`);
  return result.stdout.trim();
}
function gitBlobSha256(repoPath) {
  const result = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'show', `HEAD:${repoPath}`], { cwd: workspace, encoding: null, windowsHide: true, shell: false });
  if (result.error || result.status !== 0) fail('GIT_BLOB_READ_FAILED', repoPath);
  return sha256Bytes(result.stdout || Buffer.alloc(0));
}
function writeEvidence(name, value) { fs.writeFileSync(path.join(evidenceDir, name), String(value), 'utf8'); }

try {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  if (fixtures.registry_id !== registry.registry_id) fail('FIXTURE_REGISTRY_ID_MISMATCH');
  const results = [];

  for (const testCase of fixtures.cases) {
    let actual = 'PASS';
    let code = null;
    let detail = null;
    try {
      if (testCase.type === 'VALIDATE_REGISTRY') {
        detail = validateRegistry(registry, testCase.expected_service_count, testCase.expected_operation_count);
      } else if (testCase.type === 'VALIDATE_REQUEST') {
        const request = deepMerge(fixtures.base_request, testCase.request_patch || {});
        deletePath(request, testCase.delete_request_path);
        validateRequest(registry, request);
      } else if (testCase.type === 'VALIDATE_DOCUMENT_REQUEST') {
        const request = deepMerge(fixtures.document_request, testCase.request_patch || {});
        deletePath(request, testCase.delete_request_path);
        validateRequest(registry, request);
      } else if (testCase.type === 'VALIDATE_RESPONSE') {
        const request = deepMerge(fixtures.base_request, testCase.request_patch || {});
        const response = deepMerge(fixtures.base_response, testCase.response_patch || {});
        const validated = validateResponse(registry, request, response);
        detail = { result_class: validated.result_class };
        if (testCase.expected_result_class && validated.result_class !== testCase.expected_result_class) fail('RESULT_CLASS_NOT_PRESERVED');
      } else if (testCase.type === 'VALIDATE_DOCUMENT_RESPONSE') {
        const request = deepMerge(fixtures.document_request, testCase.request_patch || {});
        const response = deepMerge(fixtures.document_response, testCase.response_patch || {});
        const validated = validateResponse(registry, request, response);
        detail = { result_class: validated.result_class };
      } else if (testCase.type === 'VALIDATE_PROVENANCE_RESPONSE') {
        const request = deepMerge(fixtures.provenance_request, testCase.request_patch || {});
        const response = deepMerge(fixtures.provenance_response, testCase.response_patch || {});
        const validated = validateResponse(registry, request, response);
        detail = { result_class: validated.result_class };
      } else if (testCase.type === 'IDEMPOTENCY_SEQUENCE') {
        const ledger = new IdempotencyLedger();
        const first = clone(fixtures.base_request);
        const firstResult = ledger.submit(registry, first, true);
        if (firstResult.disposition !== 'NEW') fail('FIRST_REQUEST_NOT_NEW');
        const second = clone(first);
        if (testCase.sequence === 'SAME_KEY_DIFFERENT_REQUEST') second.projection.purpose = 'DIFFERENT_PURPOSE';
        const secondResult = ledger.submit(registry, second, true);
        detail = { second_disposition: secondResult.disposition };
        if (testCase.expected_second_disposition && secondResult.disposition !== testCase.expected_second_disposition) fail('REPLAY_DISPOSITION_MISMATCH');
      } else if (testCase.type === 'NONIDEMPOTENT_RETRY') {
        const request = clone(fixtures.provenance_request);
        const ledger = new IdempotencyLedger();
        const first = ledger.submit(registry, request, false);
        if (first.disposition !== 'NEW') fail('FIRST_REQUEST_NOT_NEW');
        ledger.submit(registry, clone(request), false);
      } else {
        fail('UNKNOWN_FIXTURE_CASE_TYPE', testCase.type);
      }
    } catch (error) {
      if (!(error instanceof QualificationError)) throw error;
      actual = 'REJECT';
      code = error.code;
      detail = error.detail || null;
    }
    if (actual !== testCase.expected) fail('FIXTURE_EXPECTATION_MISMATCH', `${testCase.case_id}:expected=${testCase.expected}:actual=${actual}:code=${code || ''}`);
    if (actual === 'REJECT' && testCase.expected_code && code !== testCase.expected_code) {
      fail('FIXTURE_REJECTION_CODE_MISMATCH', `${testCase.case_id}:expected=${testCase.expected_code}:actual=${code}`);
    }
    results.push({ case_id: testCase.case_id, actual, code, detail });
  }

  const invariantSummary = validateRegistry(registry, 4, 21);
  const commit = gitHead();
  const subject = {
    qualification_id: 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002',
    repository: process.env.GITHUB_REPOSITORY || 'BFochtman746/system-master',
    subject_sha: commit,
    registry_blob_sha256: gitBlobSha256(registryRel),
    fixtures_blob_sha256: gitBlobSha256(fixturesRel),
    qualifier_blob_sha256: gitBlobSha256(scriptRel),
    service_count: invariantSummary.service_count,
    operation_count: invariantSummary.operation_count,
    fixture_count: results.length,
    exact_subject_only: true,
    v1_qualification_transfer: false,
    provider_canonical_write_authority: false,
    provider_lifecycle_transition_authority: false,
    provider_export_freeze_authority: false,
    provider_publication_authority: false,
    book_owned_document_engine_authority: false
  };
  writeEvidence('qualification-result.json', JSON.stringify({ standing: 'PASS', subject, results }, null, 2));
  writeEvidence('subject-sha.txt', `${commit}\n`);
  writeEvidence('registry-digest.txt', `${subject.registry_blob_sha256}\n`);
  writeEvidence('fixtures-digest.txt', `${subject.fixtures_blob_sha256}\n`);
  writeEvidence('qualifier-digest.txt', `${subject.qualifier_blob_sha256}\n`);
  writeEvidence('authority-boundary.json', JSON.stringify({
    canonical_owner: 'SYSTEM_MASTER/BOOK',
    prose_owner: 'SYSTEM_MASTER/BOOK/PROSE',
    document_implementation_owner: 'EXTERNAL_OR_FUTURE_ALLOCATED_TOOL__NOT_BOOK',
    planned_document_system_label_is_topology_authority: false,
    publication_authority_created: false,
    exact_sha_evidence_transfer: false
  }, null, 2));
  console.log(`BOOK_SYSTEM_SERVICE_INTERFACE_002_QUALIFICATION_PASS cases=${results.length} services=${invariantSummary.service_count} operations=${invariantSummary.operation_count} sha=${commit}`);
} catch (error) {
  const payload = error instanceof QualificationError
    ? { standing: 'FAIL', code: error.code, detail: error.detail || null }
    : { standing: 'FAIL', code: 'UNEXPECTED_ERROR', detail: error && error.stack ? error.stack : String(error) };
  try { writeEvidence('qualification-result.json', JSON.stringify(payload, null, 2)); } catch (_) {}
  console.error(`BOOK_SYSTEM_SERVICE_INTERFACE_002_QUALIFICATION_FAIL ${payload.code}${payload.detail ? `:${payload.detail}` : ''}`);
  process.exit(1);
}
