import { canonicalize, sha256, CG001_MISSION_VERSION } from './active-work-state.js';

export const VALIDATOR_REQUEST_PROTOCOL = 'control-gateway.validator-request.v1';
export const VALIDATOR_RECEIPT_PROTOCOL = 'control-gateway.validator-receipt.v1';

const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const FAMILY_SET = new Set(['CODE', 'ROUTING', 'SCHEMA', 'CONTRACT', 'DEPENDENCY']);
const KIND_MINIMUMS = new Map([
  ['CODE', ['CODE']],
  ['WORKFLOW', ['CODE', 'ROUTING']],
  ['SCHEMA', ['SCHEMA', 'CONTRACT']],
  ['CONTRACT', ['CONTRACT']],
  ['DEPENDENCY', ['DEPENDENCY']],
  ['GOVERNANCE', ['DEPENDENCY']]
]);
const DENIED_GITHUB_STATES = new Set(['DENIED', 'STALE']);

export class ValidatorClosureError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ValidatorClosureError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ValidatorClosureError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictKeys(value, allowed, label) {
  if (!isPlainObject(value)) fail('VALIDATOR_SCHEMA_INVALID', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('VALIDATOR_SCHEMA_UNKNOWN_FIELD', `${label}.${key} is not allowed`);
  for (const key of allowed) if (!(key in value)) fail('VALIDATOR_SCHEMA_MISSING_FIELD', `${label}.${key} is required`);
}

function requiredString(value, label, pattern = null) {
  if (typeof value !== 'string' || value.length === 0) fail('VALIDATOR_SCHEMA_INVALID', `${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('VALIDATOR_SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}

function validateExactPath(path, label = 'path') {
  requiredString(path, label);
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) fail('VALIDATOR_PATH_INVALID', `${label} is unsafe`);
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('*'))) fail('VALIDATOR_PATH_INVALID', `${label} must be an exact normalized repository path`);
}

function allowedPathMatches(path, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

function uniqueStrings(values, label, pattern = null) {
  if (!Array.isArray(values)) fail('VALIDATOR_SCHEMA_INVALID', `${label} must be an array`);
  const seen = new Set();
  for (const value of values) {
    requiredString(value, `${label}[]`, pattern);
    if (seen.has(value)) fail('VALIDATOR_DUPLICATE', `${label} contains duplicate ${value}`);
    seen.add(value);
  }
  return seen;
}

function validateArtifact(artifact, label) {
  strictKeys(artifact, ['path', 'digest', 'kind', 'families'], label);
  validateExactPath(artifact.path, `${label}.path`);
  requiredString(artifact.digest, `${label}.digest`, SHA256_RE);
  if (!KIND_MINIMUMS.has(artifact.kind)) fail('VALIDATOR_ARTIFACT_KIND_INVALID', `${label}.kind unsupported`);
  const families = uniqueStrings(artifact.families, `${label}.families`);
  for (const family of families) if (!FAMILY_SET.has(family)) fail('VALIDATOR_FAMILY_INVALID', `${label} declares unsupported family ${family}`);
  for (const minimum of KIND_MINIMUMS.get(artifact.kind)) if (!families.has(minimum)) fail('VALIDATOR_FAMILY_MISSING', `${artifact.path} kind ${artifact.kind} requires ${minimum}`);
}

function validateCodeEvidence(item, label) {
  strictKeys(item, ['artifact_path', 'artifact_digest', 'syntax', 'static_analysis', 'tests'], label);
  validateExactPath(item.artifact_path, `${label}.artifact_path`);
  requiredString(item.artifact_digest, `${label}.artifact_digest`, SHA256_RE);
  for (const field of ['syntax', 'static_analysis', 'tests']) if (item[field] !== 'PASS') fail('VALIDATOR_CODE_FAILED', `${label}.${field} must be PASS`);
}

function validateRoute(item, label) {
  strictKeys(item, [
    'route_id', 'artifact_path', 'artifact_digest', 'execution_class', 'source', 'destination',
    'control_authority', 'execution_owner', 'scheduler_owner', 'gateway_enforced', 'direct_bypass'
  ], label);
  requiredString(item.route_id, `${label}.route_id`, ID_RE);
  validateExactPath(item.artifact_path, `${label}.artifact_path`);
  requiredString(item.artifact_digest, `${label}.artifact_digest`, SHA256_RE);
  requiredString(item.source, `${label}.source`, ID_RE);
  requiredString(item.destination, `${label}.destination`, ID_RE);
  if (item.control_authority !== 'CONTROL_GATEWAY') fail('VALIDATOR_ROUTE_AUTHORITY_INVALID', `${label}.control_authority must be CONTROL_GATEWAY`);
  if (item.gateway_enforced !== true || item.direct_bypass !== false) fail('VALIDATOR_ROUTE_BYPASS', `${label} must be gateway-enforced with no direct bypass`);
  if (item.execution_class === 'GITHUB_MUTATION') {
    if (item.execution_owner !== 'GITHUB' || item.scheduler_owner !== 'NONE') fail('VALIDATOR_ROUTE_OWNER_INVALID', `${label} GitHub mutation ownership invalid`);
  } else if (item.execution_class === 'A01_EXECUTION') {
    if (item.execution_owner !== 'A01_SUPERVISOR' || item.scheduler_owner !== 'A01_SUPERVISOR') fail('VALIDATOR_ROUTE_OWNER_INVALID', `${label} A-01 execution ownership invalid`);
  } else if (item.execution_class === 'HOST_QUALIFICATION') {
    if (item.execution_owner !== 'GITHUB_ACTIONS' || item.scheduler_owner !== 'GITHUB_ACTIONS') fail('VALIDATOR_ROUTE_OWNER_INVALID', `${label} host qualification ownership invalid`);
  } else {
    fail('VALIDATOR_ROUTE_CLASS_INVALID', `${label}.execution_class unsupported`);
  }
}

function validateSchemaEvidence(item, label) {
  strictKeys(item, ['schema_id', 'artifact_path', 'artifact_digest', 'version', 'strict', 'unknown_fields', 'validation'], label);
  requiredString(item.schema_id, `${label}.schema_id`, ID_RE);
  validateExactPath(item.artifact_path, `${label}.artifact_path`);
  requiredString(item.artifact_digest, `${label}.artifact_digest`, SHA256_RE);
  requiredString(item.version, `${label}.version`, ID_RE);
  if (item.strict !== true || item.unknown_fields !== 'REJECT' || item.validation !== 'PASS') fail('VALIDATOR_SCHEMA_EVIDENCE_FAILED', `${label} schema evidence must be strict, reject unknown fields and PASS validation`);
}

function validateContractEvidence(item, label) {
  strictKeys(item, [
    'contract_id', 'artifact_path', 'artifact_digest', 'version', 'producer', 'consumer',
    'schema_ids', 'route_ids', 'required_fields', 'compatibility'
  ], label);
  requiredString(item.contract_id, `${label}.contract_id`, ID_RE);
  validateExactPath(item.artifact_path, `${label}.artifact_path`);
  requiredString(item.artifact_digest, `${label}.artifact_digest`, SHA256_RE);
  requiredString(item.version, `${label}.version`, ID_RE);
  requiredString(item.producer, `${label}.producer`, ID_RE);
  requiredString(item.consumer, `${label}.consumer`, ID_RE);
  uniqueStrings(item.schema_ids, `${label}.schema_ids`, ID_RE);
  uniqueStrings(item.route_ids, `${label}.route_ids`, ID_RE);
  uniqueStrings(item.required_fields, `${label}.required_fields`, ID_RE);
  if (item.compatibility !== 'PASS') fail('VALIDATOR_CONTRACT_FAILED', `${label}.compatibility must be PASS`);
}

function validateDependencyEvidence(item, label) {
  strictKeys(item, ['dependency_id', 'artifact_path', 'receipt_id', 'operation_id', 'state'], label);
  requiredString(item.dependency_id, `${label}.dependency_id`, ID_RE);
  validateExactPath(item.artifact_path, `${label}.artifact_path`);
  requiredString(item.receipt_id, `${label}.receipt_id`, ID_RE);
  requiredString(item.operation_id, `${label}.operation_id`, ID_RE);
  if (item.state !== 'SATISFIED') fail('VALIDATOR_DEPENDENCY_UNSATISFIED', `${label}.state must be SATISFIED`);
}

function normalizeRequest(request) {
  const copy = structuredClone(request);
  copy.artifacts.sort((a, b) => a.path.localeCompare(b.path));
  copy.code_evidence.sort((a, b) => a.artifact_path.localeCompare(b.artifact_path));
  copy.routes.sort((a, b) => a.route_id.localeCompare(b.route_id));
  copy.schemas.sort((a, b) => a.schema_id.localeCompare(b.schema_id));
  copy.contracts.sort((a, b) => a.contract_id.localeCompare(b.contract_id));
  for (const contract of copy.contracts) {
    contract.schema_ids.sort();
    contract.route_ids.sort();
    contract.required_fields.sort();
  }
  copy.dependencies.sort((a, b) => a.dependency_id.localeCompare(b.dependency_id));
  for (const artifact of copy.artifacts) artifact.families.sort();
  return copy;
}

export function validateValidatorRequest(request) {
  strictKeys(request, [
    'protocol_version', 'validation_id', 'mission_version', 'workstream_id', 'authority_epoch',
    'recovery_digest', 'authority_publication_commit_sha', 'authority_packet_digest', 'repository',
    'operation_id', 'predecessor_receipt_id', 'artifacts', 'code_evidence', 'routes', 'schemas',
    'contracts', 'dependencies'
  ], 'validator_request');
  if (request.protocol_version !== VALIDATOR_REQUEST_PROTOCOL) fail('VALIDATOR_PROTOCOL_INVALID', 'validator request protocol mismatch');
  requiredString(request.validation_id, 'validation_id', ID_RE);
  requiredString(request.mission_version, 'mission_version');
  requiredString(request.workstream_id, 'workstream_id', ID_RE);
  if (!Number.isSafeInteger(request.authority_epoch) || request.authority_epoch < 1) fail('VALIDATOR_SCHEMA_INVALID', 'authority_epoch must be positive');
  requiredString(request.recovery_digest, 'recovery_digest', SHA256_RE);
  requiredString(request.authority_publication_commit_sha, 'authority_publication_commit_sha', SHA1_RE);
  requiredString(request.authority_packet_digest, 'authority_packet_digest', SHA256_RE);
  requiredString(request.repository, 'repository', REPO_RE);
  requiredString(request.operation_id, 'operation_id', ID_RE);
  requiredString(request.predecessor_receipt_id, 'predecessor_receipt_id', ID_RE);
  if (!Array.isArray(request.artifacts) || request.artifacts.length === 0) fail('VALIDATOR_ARTIFACTS_REQUIRED', 'at least one changed artifact is required');
  const paths = new Set();
  request.artifacts.forEach((item, index) => {
    validateArtifact(item, `artifacts[${index}]`);
    if (paths.has(item.path)) fail('VALIDATOR_DUPLICATE', `duplicate artifact path ${item.path}`);
    paths.add(item.path);
  });
  if (!Array.isArray(request.code_evidence) || !Array.isArray(request.routes) || !Array.isArray(request.schemas) || !Array.isArray(request.contracts) || !Array.isArray(request.dependencies)) fail('VALIDATOR_SCHEMA_INVALID', 'all evidence families must be arrays');
  request.code_evidence.forEach((item, index) => validateCodeEvidence(item, `code_evidence[${index}]`));
  request.routes.forEach((item, index) => validateRoute(item, `routes[${index}]`));
  request.schemas.forEach((item, index) => validateSchemaEvidence(item, `schemas[${index}]`));
  request.contracts.forEach((item, index) => validateContractEvidence(item, `contracts[${index}]`));
  request.dependencies.forEach((item, index) => validateDependencyEvidence(item, `dependencies[${index}]`));
  return true;
}

export function validatorRequestDigest(request) {
  validateValidatorRequest(request);
  return sha256(normalizeRequest(request));
}

function bindContinuation(contract, request) {
  if (!isPlainObject(contract)) fail('VALIDATOR_RECOVERY_INVALID', 'recovery gate returned no contract');
  if (contract.mission_version !== CG001_MISSION_VERSION || request.mission_version !== contract.mission_version) fail('VALIDATOR_MISSION_MISMATCH', 'mission version mismatch');
  if (request.workstream_id !== contract.workstream_id) fail('VALIDATOR_WORKSTREAM_MISMATCH', 'workstream mismatch');
  if (request.authority_epoch !== contract.authority_epoch) fail('VALIDATOR_AUTHORITY_EPOCH_MISMATCH', 'authority epoch mismatch');
  if (request.recovery_digest !== contract.recovery_digest) fail('VALIDATOR_RECOVERY_MISMATCH', 'request does not bind the recovered continuation');
  if (request.authority_publication_commit_sha !== contract.publication_commit_sha || request.authority_packet_digest !== contract.packet_digest) fail('VALIDATOR_AUTHORITY_MISMATCH', 'request does not bind the durable authority publication');
  if (request.repository !== contract.repository) fail('VALIDATOR_REPOSITORY_MISMATCH', 'repository mismatch');
  if (DENIED_GITHUB_STATES.has(contract.github_admission_state)) fail('VALIDATOR_GITHUB_STANDING_INVALID', 'GitHub standing is denied or stale');
  const continuation = contract.continuation;
  if (!continuation || !new Set(['CONTINUE_CURRENT', 'START_SUCCESSOR']).has(continuation.mode)) fail('VALIDATOR_CONTINUATION_INVALID', 'recovered continuation is not executable');
  if (request.operation_id !== continuation.operation_id || request.predecessor_receipt_id !== continuation.predecessor_receipt_id) fail('VALIDATOR_OPERATION_MISMATCH', 'validator request is not bound to the recovered operation');
}

function artifactIndex(request) {
  return new Map(request.artifacts.map((artifact) => [artifact.path, artifact]));
}

function evidenceForPath(items, path) {
  return items.filter((item) => item.artifact_path === path);
}

function verifyEvidenceCoverage(request, contract, packet) {
  const artifacts = artifactIndex(request);
  const allowed = contract.allowed_paths_or_effects?.paths;
  if (!Array.isArray(allowed)) fail('VALIDATOR_RECOVERY_INVALID', 'recovery contract has no allowed path scope');
  for (const artifact of request.artifacts) {
    if (!allowed.some((pattern) => allowedPathMatches(artifact.path, pattern))) fail('VALIDATOR_PATH_OUT_OF_SCOPE', `${artifact.path} is outside durable authority`);
    const families = new Set(artifact.families);
    const familyEvidence = {
      CODE: evidenceForPath(request.code_evidence, artifact.path),
      ROUTING: evidenceForPath(request.routes, artifact.path),
      SCHEMA: evidenceForPath(request.schemas, artifact.path),
      CONTRACT: evidenceForPath(request.contracts, artifact.path),
      DEPENDENCY: evidenceForPath(request.dependencies, artifact.path)
    };
    for (const family of families) {
      const evidence = familyEvidence[family];
      if (!evidence || evidence.length === 0) fail('VALIDATOR_EVIDENCE_MISSING', `${artifact.path} requires ${family} evidence`);
      if (family !== 'DEPENDENCY') {
        for (const item of evidence) if (item.artifact_digest !== artifact.digest) fail('VALIDATOR_EVIDENCE_DIGEST_MISMATCH', `${family} evidence for ${artifact.path} does not bind artifact digest`);
      }
    }
  }

  const routeIds = new Set();
  for (const route of request.routes) {
    if (!artifacts.has(route.artifact_path)) fail('VALIDATOR_ORPHAN_EVIDENCE', `route ${route.route_id} references undeclared artifact`);
    if (routeIds.has(route.route_id)) fail('VALIDATOR_DUPLICATE', `duplicate route_id ${route.route_id}`);
    routeIds.add(route.route_id);
  }
  const schemaIds = new Set();
  for (const schema of request.schemas) {
    if (!artifacts.has(schema.artifact_path)) fail('VALIDATOR_ORPHAN_EVIDENCE', `schema ${schema.schema_id} references undeclared artifact`);
    if (schemaIds.has(schema.schema_id)) fail('VALIDATOR_DUPLICATE', `duplicate schema_id ${schema.schema_id}`);
    schemaIds.add(schema.schema_id);
  }
  const contractIds = new Set();
  for (const item of request.contracts) {
    if (!artifacts.has(item.artifact_path)) fail('VALIDATOR_ORPHAN_EVIDENCE', `contract ${item.contract_id} references undeclared artifact`);
    if (contractIds.has(item.contract_id)) fail('VALIDATOR_DUPLICATE', `duplicate contract_id ${item.contract_id}`);
    contractIds.add(item.contract_id);
    for (const schemaId of item.schema_ids) if (!schemaIds.has(schemaId)) fail('VALIDATOR_CONTRACT_SCHEMA_MISSING', `contract ${item.contract_id} references missing schema ${schemaId}`);
    for (const routeId of item.route_ids) if (!routeIds.has(routeId)) fail('VALIDATOR_CONTRACT_ROUTE_MISSING', `contract ${item.contract_id} references missing route ${routeId}`);
  }
  for (const code of request.code_evidence) if (!artifacts.has(code.artifact_path)) fail('VALIDATOR_ORPHAN_EVIDENCE', `code evidence references undeclared artifact ${code.artifact_path}`);

  const receipts = new Map(packet.receipt_index.map((receipt) => [receipt.receipt_id, receipt]));
  const predecessor = receipts.get(request.predecessor_receipt_id);
  if (!predecessor || predecessor.outcome !== 'SUCCEEDED' || predecessor.satisfies_dependency !== true) fail('VALIDATOR_PREDECESSOR_INVALID', 'predecessor receipt is not a successful durable dependency receipt');
  const dependencyIds = new Set();
  for (const dependency of request.dependencies) {
    if (!artifacts.has(dependency.artifact_path)) fail('VALIDATOR_ORPHAN_EVIDENCE', `dependency ${dependency.dependency_id} references undeclared artifact`);
    if (dependencyIds.has(dependency.dependency_id)) fail('VALIDATOR_DUPLICATE', `duplicate dependency_id ${dependency.dependency_id}`);
    dependencyIds.add(dependency.dependency_id);
    const receipt = receipts.get(dependency.receipt_id);
    if (!receipt || receipt.operation_id !== dependency.operation_id || receipt.outcome !== 'SUCCEEDED' || receipt.satisfies_dependency !== true) fail('VALIDATOR_DEPENDENCY_RECEIPT_INVALID', `dependency ${dependency.dependency_id} is not backed by a successful durable receipt`);
  }
}

function withoutReceiptDigest(receipt) {
  const copy = structuredClone(receipt);
  delete copy.validation_digest;
  return copy;
}

export function computeValidatorReceiptDigest(receipt) {
  return sha256(withoutReceiptDigest(receipt));
}

export function validateValidatorReceipt(receipt) {
  strictKeys(receipt, [
    'protocol_version', 'decision', 'validation_id', 'request_digest', 'mission_version', 'workstream_id',
    'authority_epoch', 'recovery_digest', 'authority_publication_commit_sha', 'authority_packet_digest',
    'repository', 'operation_id', 'predecessor_receipt_id', 'validated_artifact_count', 'family_counts',
    'validation_digest'
  ], 'validator_receipt');
  if (receipt.protocol_version !== VALIDATOR_RECEIPT_PROTOCOL || receipt.decision !== 'GRANTED') fail('VALIDATOR_RECEIPT_INVALID', 'validator receipt protocol/decision invalid');
  requiredString(receipt.validation_id, 'validation_id', ID_RE);
  requiredString(receipt.request_digest, 'request_digest', SHA256_RE);
  requiredString(receipt.mission_version, 'mission_version');
  requiredString(receipt.workstream_id, 'workstream_id', ID_RE);
  if (!Number.isSafeInteger(receipt.authority_epoch) || receipt.authority_epoch < 1) fail('VALIDATOR_RECEIPT_INVALID', 'authority_epoch invalid');
  requiredString(receipt.recovery_digest, 'recovery_digest', SHA256_RE);
  requiredString(receipt.authority_publication_commit_sha, 'authority_publication_commit_sha', SHA1_RE);
  requiredString(receipt.authority_packet_digest, 'authority_packet_digest', SHA256_RE);
  requiredString(receipt.repository, 'repository', REPO_RE);
  requiredString(receipt.operation_id, 'operation_id', ID_RE);
  requiredString(receipt.predecessor_receipt_id, 'predecessor_receipt_id', ID_RE);
  if (!Number.isSafeInteger(receipt.validated_artifact_count) || receipt.validated_artifact_count < 1) fail('VALIDATOR_RECEIPT_INVALID', 'validated_artifact_count invalid');
  strictKeys(receipt.family_counts, ['CODE', 'ROUTING', 'SCHEMA', 'CONTRACT', 'DEPENDENCY'], 'family_counts');
  for (const family of FAMILY_SET) if (!Number.isSafeInteger(receipt.family_counts[family]) || receipt.family_counts[family] < 0) fail('VALIDATOR_RECEIPT_INVALID', `family_counts.${family} invalid`);
  requiredString(receipt.validation_digest, 'validation_digest', SHA256_RE);
  if (computeValidatorReceiptDigest(receipt) !== receipt.validation_digest) fail('VALIDATOR_RECEIPT_DIGEST_MISMATCH', 'validator receipt digest mismatch');
  return true;
}

function familyCounts(request) {
  const counts = { CODE: 0, ROUTING: 0, SCHEMA: 0, CONTRACT: 0, DEPENDENCY: 0 };
  for (const artifact of request.artifacts) for (const family of artifact.families) counts[family] += 1;
  return counts;
}

export class ValidatorClosureGate {
  constructor({ recoveryGate, publisher }) {
    if (!recoveryGate || typeof recoveryGate.recoverContinue !== 'function' || typeof recoveryGate.verifyRecoveryContractFresh !== 'function') throw new TypeError('recoveryGate recoverContinue/verifyRecoveryContractFresh functions required');
    if (!publisher || typeof publisher.reconstruct !== 'function') throw new TypeError('publisher.reconstruct function required');
    this.recoveryGate = recoveryGate;
    this.publisher = publisher;
  }

  async validate(request) {
    validateValidatorRequest(request);
    const recovery = await this.recoveryGate.recoverContinue();
    bindContinuation(recovery, request);
    const publication = await this.publisher.reconstruct();
    if (publication.head_commit_sha !== recovery.publication_commit_sha || publication.packet_digest !== recovery.packet_digest) fail('VALIDATOR_AUTHORITY_MOVED', 'publication and recovery contract do not resolve to the same authority snapshot');
    verifyEvidenceCoverage(request, recovery, publication.envelope.packet);
    await this.recoveryGate.verifyRecoveryContractFresh(recovery);
    const finalPublication = await this.publisher.reconstruct();
    if (finalPublication.head_commit_sha !== publication.head_commit_sha || finalPublication.packet_digest !== publication.packet_digest || finalPublication.publication_digest !== publication.publication_digest) fail('VALIDATOR_AUTHORITY_MOVED', 'durable authority changed during validation');

    const receipt = {
      protocol_version: VALIDATOR_RECEIPT_PROTOCOL,
      decision: 'GRANTED',
      validation_id: request.validation_id,
      request_digest: validatorRequestDigest(request),
      mission_version: request.mission_version,
      workstream_id: request.workstream_id,
      authority_epoch: request.authority_epoch,
      recovery_digest: request.recovery_digest,
      authority_publication_commit_sha: request.authority_publication_commit_sha,
      authority_packet_digest: request.authority_packet_digest,
      repository: request.repository,
      operation_id: request.operation_id,
      predecessor_receipt_id: request.predecessor_receipt_id,
      validated_artifact_count: request.artifacts.length,
      family_counts: familyCounts(request),
      validation_digest: ''
    };
    receipt.validation_digest = computeValidatorReceiptDigest(receipt);
    validateValidatorReceipt(receipt);
    return Object.freeze(receipt);
  }
}
