'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-system-service-interface');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(runnerTemp, `book-system-service-interface-001-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const registryRel = 'qualification/book-system/service-interface-001/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001.json';
const fixturesRel = 'qualification/book-system/service-interface-001/SERVICE-INTERFACE-FIXTURES-001.json';
const scriptRel = '.github/scripts/book-system-service-interface-001-qualify.js';
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

function deepMerge(target, patch) {
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
function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function digest(value) { return sha256Bytes(Buffer.from(stableStringify(value), 'utf8')); }

function requireFields(obj, fields, context) {
  if (!isObject(obj)) fail('OBJECT_REQUIRED', context);
  for (const field of fields) if (!hasOwn(obj, field)) fail('REQUIRED_FIELD_MISSING', `${context}.${field}`);
}

function validateRegistry(registry, expectedServiceCount = null, expectedOperationCount = null) {
  if (registry.registry_id !== 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001') fail('REGISTRY_ID_MISMATCH');
  if (registry.registry_version !== 1) fail('REGISTRY_VERSION_MISMATCH');
  if (!isObject(registry.services)) fail('SERVICES_REQUIRED');
  if (!Array.isArray(registry.provider_classes)) fail('PROVIDER_CLASSES_REQUIRED');
  requireFields(registry.common_request_envelope, ['schema_version', 'required', 'authority_context_required'], 'common_request_envelope');
  requireFields(registry.common_response_envelope, ['schema_version', 'required', 'provider_subject_required', 'parent_projection_identity_required', 'result_classes', 'requested_parent_actions'], 'common_response_envelope');
  if (!registry.common_response_envelope.result_classes.includes('ABSTAIN') || !registry.common_response_envelope.result_classes.includes('ERROR')) {
    fail('ABSTENTION_ERROR_CLASSES_REQUIRED');
  }

  const requiredFamilies = ['PROSE_ANALYSIS_AND_REVISION', 'BOOK_EVALUATION', 'RESEARCH_AND_EVIDENCE', 'DOCUMENT_ARTIFACT_AND_EXPORT'];
  for (const family of requiredFamilies) if (!hasOwn(registry.services, family)) fail('REQUIRED_SERVICE_FAMILY_MISSING', family);

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
      for (const field of ['required_projection', 'allowed_outputs', 'requested_parent_action_allowed']) {
        if (!Array.isArray(operation[field])) fail('OPERATION_ARRAY_REQUIRED', `${serviceId}:${operationId}:${field}`);
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
  if (request.schema_version !== registry.common_request_envelope.schema_version) fail('UNKNOWN_REQUEST_SCHEMA_VERSION', String(request.schema_version));
  if (!Number.isInteger(request.parent_state_version) || request.parent_state_version < 1) fail('INVALID_PARENT_STATE_VERSION');
  if (typeof request.parent_state_digest !== 'string' || !/^[a-f0-9]{64}$/.test(request.parent_state_digest)) fail('INVALID_PARENT_STATE_DIGEST');
  if (!Array.isArray(request.target_refs)) fail('TARGET_REFS_ARRAY_REQUIRED');
  requireFields(request.authority_context, registry.common_request_envelope.authority_context_required, 'request.authority_context');
  if (request.authority_context.canonical_write_allowed !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  const { service, operation } = resolveOperation(registry, request);
  if (service.canonical_write_authority !== false) fail('SERVICE_CANONICAL_WRITE_FORBIDDEN');
  if (!isObject(request.projection)) fail('REQUEST_PROJECTION_REQUIRED');
  for (const field of operation.required_projection) {
    if (!hasOwn(request.projection, field)) fail('REQUIRED_PROJECTION_FIELD_MISSING', field);
  }
  return { service, operation };
}

function validateResponse(registry, request, response) {
  const { service, operation } = validateRequest(registry, request);
  requireFields(response, registry.common_response_envelope.required, 'response');
  if (response.schema_version !== registry.common_response_envelope.schema_version) fail('UNKNOWN_RESPONSE_SCHEMA_VERSION', String(response.schema_version));
  const bindingFields = ['request_id', 'correlation_id', 'idempotency_key', 'service_id', 'operation_id'];
  for (const field of bindingFields) {
    if (response[field] !== request[field]) fail('RESPONSE_REQUEST_BINDING_MISMATCH', field);
  }
  if (response.provider_class !== service.provider_class) fail('PROVIDER_CLASS_MISMATCH', `${response.provider_class}:${service.provider_class}`);
  requireFields(response.provider_subject, registry.common_response_envelope.provider_subject_required, 'response.provider_subject');
  requireFields(response.parent_projection_identity, registry.common_response_envelope.parent_projection_identity_required, 'response.parent_projection_identity');
  if (response.parent_projection_identity.parent_state_version !== request.parent_state_version ||
      response.parent_projection_identity.parent_state_digest !== request.parent_state_digest) {
    fail('STALE_PARENT_PROJECTION');
  }
  if (!registry.common_response_envelope.result_classes.includes(response.result_class)) fail('UNKNOWN_RESULT_CLASS', String(response.result_class));
  if (!operation.requested_parent_action_allowed.includes(response.requested_parent_action)) {
    fail('PARENT_ACTION_NOT_ALLOWED_FOR_OPERATION', response.requested_parent_action);
  }
  if (response.result_class === 'ABSTAIN' && (!Array.isArray(response.abstentions) || response.abstentions.length === 0)) {
    fail('ABSTENTION_REASON_REQUIRED');
  }
  if (response.result_class !== 'ABSTAIN' && !Array.isArray(response.abstentions)) fail('ABSTENTIONS_ARRAY_REQUIRED');
  for (const field of ['evidence_refs', 'proposal_refs', 'artifact_refs', 'warnings']) {
    if (!Array.isArray(response[field])) fail('RESPONSE_ARRAY_REQUIRED', field);
  }
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
        if (testCase.delete_request_projection_field) delete request.projection[testCase.delete_request_projection_field];
        validateRequest(registry, request);
      } else if (testCase.type === 'VALIDATE_RESPONSE') {
        const request = deepMerge(fixtures.base_request, testCase.request_patch || {});
        const response = deepMerge(fixtures.base_response, testCase.response_patch || {});
        const validated = validateResponse(registry, request, response);
        detail = { result_class: validated.result_class };
        if (testCase.expected_result_class && validated.result_class !== testCase.expected_result_class) fail('RESULT_CLASS_NOT_PRESERVED');
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
        const request = deepMerge(fixtures.base_request, testCase.request_patch || {});
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

  const invariantSummary = validateRegistry(registry, 4, 17);
  const commit = gitHead();
  const subject = {
    qualification_id: 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001',
    repository: process.env.GITHUB_REPOSITORY || '',
    commit,
    runner_name: process.env.RUNNER_NAME || '',
    runner_os: process.env.RUNNER_OS || '',
    runner_arch: process.env.RUNNER_ARCH || '',
    registry_git_blob_sha256: gitBlobSha256(registryRel),
    fixtures_git_blob_sha256: gitBlobSha256(fixturesRel),
    qualifier_git_blob_sha256: gitBlobSha256(scriptRel),
    service_count: invariantSummary.service_count,
    operation_count: invariantSummary.operation_count,
    test_case_count: results.length,
    qualification_scope: 'A01_EXACT_SHA_BOOK_SYSTEM_SERVICE_INTERFACE_REGISTRY__NO_CANONICAL_WRITE_OR_PUBLICATION_AUTHORITY',
  };
  writeEvidence('subject.json', `${JSON.stringify(subject, null, 2)}\n`);
  writeEvidence('cases.json', `${JSON.stringify(results, null, 2)}\n`);
  writeEvidence('result.txt', 'result=PASS\n');
  writeEvidence('qualification.txt', [
    `qualification_id=${subject.qualification_id}`,
    `commit=${commit}`,
    `services=${subject.service_count}`,
    `operations=${subject.operation_count}`,
    `cases=${subject.test_case_count}`,
    'service_operation_schema_validation=PASS',
    'provider_class_binding=PASS',
    'minimum_projection_enforcement=PASS',
    'canonical_write_denial=PASS',
    'stale_projection_rejection=PASS',
    'idempotent_replay=PASS',
    'idempotency_conflict_rejection=PASS',
    'nonidempotent_retry_reconciliation=PASS',
    'abstention_preservation=PASS',
    'parent_admission_handoff=PASS',
    'result=PASS',
    '',
  ].join('\n'));
  console.log(`BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001 PASS services=${subject.service_count} operations=${subject.operation_count} cases=${subject.test_case_count}`);
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  writeEvidence('result.txt', 'result=FAIL\n');
  writeEvidence('failure.txt', `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
