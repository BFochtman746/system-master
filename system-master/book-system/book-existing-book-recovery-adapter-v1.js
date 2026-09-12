'use strict';

const crypto = require('crypto');

const BINDING_SCHEMA_VERSION = '1';
const EVIDENCE_SCHEMA_VERSION = '1';
const OPERATION_SCHEMA_VERSION = '1';
const CURRENT_CAPABILITY_ID = 'BOOK.SOURCE_RECOVERY.RECOVER_EXISTING_BOOK';
const CURRENT_OWNER_PATH = 'SYSTEM_MASTER/BOOK';
const ADAPTER_ID = 'BOOK_EXISTING_BOOK_RECOVERY_ADAPTER_V1';
const ADAPTER_VERSION = '1.0.0';
const ENGINE_ID = 'BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001';
const PROFILE_VERSION = 'EBR-SEMANTIC-PROFILE-001';
const ENGINE_SUBJECT_REF = `book-recovery-engine:${ENGINE_ID}:${PROFILE_VERSION}`;
const B01_EXECUTION_FREEZE_REF = 'BOOK-RECONSTRUCTION-B01-F-CONTROL-FREEZE-001';
const SOURCE_ACCEPTANCE_SCHEMA_VERSION = '1';
const PROJECTION_SCHEMA_VERSION = '1';
const BINDING_PREFIX = 'book-recovery-runtime-binding-v1:';
const OPERATION_PREFIX = 'book-recovery-operation-v1:';
const EVIDENCE_PREFIX = 'book-recovery-evidence-v1:';
const SHA256 = /^[a-f0-9]{64}$/;

const RAW_COORDINATION_FIELDS = new Set([
  'raw_bytes','source_bytes','original_bytes','file_bytes','document_bytes','manuscript_bytes',
  'raw_manuscript','raw_document','raw_source','manuscript_text','document_text','full_text',
  'private_manuscript_text','candidate_text','raw_passage','raw_candidate','raw_research',
  'provider_chain_of_thought','canonical_mutation_command','publication_credentials','production_credentials'
]);

class BookExistingBookRecoveryAdapterV1Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookExistingBookRecoveryAdapterV1Error';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookExistingBookRecoveryAdapterV1Error(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(typeof v === 'string' ? v : stableStringify(v), 'utf8').digest('hex'); }
function assertDigest(v, label) { if (!SHA256.test(String(v || ''))) fail('INVALID_SHA256', label); }
function assertRef(v, label) { if (!nonEmpty(v)) fail('REFERENCE_REQUIRED', label); }
function assertObject(v, label) { if (!isObject(v)) fail('OBJECT_REQUIRED', label); }
function requireFields(v, fields, label) {
  assertObject(v, label);
  for (const field of fields) if (!Object.prototype.hasOwnProperty.call(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}

function assertNoRawCoordination(value, where = 'coordination') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoRawCoordination(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (RAW_COORDINATION_FIELDS.has(key)) fail('RAW_CONTENT_FORBIDDEN', `${where}.${key}`);
    assertNoRawCoordination(child, `${where}.${key}`);
  }
}

function semanticBinding(binding) {
  const copy = clone(binding);
  delete copy.binding_id;
  delete copy.binding_digest;
  return copy;
}

function buildBookRecoveryRuntimeBindingV1(overrides = {}) {
  const binding = {
    binding_schema_version: BINDING_SCHEMA_VERSION,
    binding_id: '',
    binding_digest: '',
    current_capability_id: CURRENT_CAPABILITY_ID,
    current_owner_path: CURRENT_OWNER_PATH,
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    recovery_engine_id: ENGINE_ID,
    recovery_profile_version: PROFILE_VERSION,
    recovery_engine_subject_ref: ENGINE_SUBJECT_REF,
    b01_execution_freeze_ref: B01_EXECUTION_FREEZE_REF,
    source_acceptance_schema_version: SOURCE_ACCEPTANCE_SCHEMA_VERSION,
    projection_schema_version: PROJECTION_SCHEMA_VERSION,
    registered_idempotent: true,
    canonical_write_authority: false,
    lifecycle_transition_authority: false,
    author_decision_authority: false,
    publication_authority: false,
    ...clone(overrides)
  };
  binding.binding_id = '';
  binding.binding_digest = '';
  binding.binding_digest = sha256(semanticBinding(binding));
  binding.binding_id = `${BINDING_PREFIX}${binding.binding_digest}`;
  return stableNormalize(binding);
}

function validateBookRecoveryRuntimeBindingV1(binding, options = {}) {
  requireFields(binding, [
    'binding_schema_version','binding_id','binding_digest','current_capability_id','current_owner_path',
    'adapter_id','adapter_version','recovery_engine_id','recovery_profile_version','recovery_engine_subject_ref',
    'b01_execution_freeze_ref','source_acceptance_schema_version','projection_schema_version','registered_idempotent',
    'canonical_write_authority','lifecycle_transition_authority','author_decision_authority','publication_authority'
  ], 'binding');
  assertNoRawCoordination(binding, 'binding');
  if (binding.binding_schema_version !== BINDING_SCHEMA_VERSION) fail('RECOVERY_BINDING_SCHEMA_MISMATCH');
  if (String(binding.current_capability_id || '').toUpperCase().startsWith('PROSE.')) fail('RETIRED_PROSE_EXECUTION_ID', binding.current_capability_id);
  if (binding.current_capability_id !== CURRENT_CAPABILITY_ID) fail('RECOVERY_CAPABILITY_ID_MISMATCH', String(binding.current_capability_id));
  if (binding.current_owner_path !== CURRENT_OWNER_PATH) fail('RECOVERY_OWNER_PATH_MISMATCH', String(binding.current_owner_path));
  if (binding.adapter_id !== ADAPTER_ID) fail('RECOVERY_ADAPTER_ID_MISMATCH', String(binding.adapter_id));
  assertRef(binding.adapter_version, 'binding.adapter_version');
  if (binding.b01_execution_freeze_ref !== B01_EXECUTION_FREEZE_REF) fail('B01_EXECUTION_FREEZE_REF_MISMATCH');
  if (binding.source_acceptance_schema_version !== SOURCE_ACCEPTANCE_SCHEMA_VERSION) fail('SOURCE_ACCEPTANCE_SCHEMA_VERSION_MISMATCH');
  if (binding.projection_schema_version !== PROJECTION_SCHEMA_VERSION) fail('PROJECTION_SCHEMA_VERSION_MISMATCH');
  if (binding.registered_idempotent !== true) fail('RECOVERY_MUST_BE_REGISTERED_IDEMPOTENT');
  if (binding.canonical_write_authority !== false || binding.lifecycle_transition_authority !== false || binding.author_decision_authority !== false || binding.publication_authority !== false) fail('RECOVERY_BINDING_AUTHORITY_WIDENING');
  assertDigest(binding.binding_digest, 'binding.binding_digest');
  const expectedDigest = sha256(semanticBinding(binding));
  if (binding.binding_digest !== expectedDigest) fail('RECOVERY_BINDING_DIGEST_MISMATCH');
  if (binding.binding_id !== `${BINDING_PREFIX}${expectedDigest}`) fail('RECOVERY_BINDING_ID_MISMATCH');
  const requireCurrent = options.require_current !== false;
  if (requireCurrent) {
    const engineId = options.engine_id || ENGINE_ID;
    const profileVersion = options.profile_version || PROFILE_VERSION;
    const subjectRef = options.engine_subject_ref || ENGINE_SUBJECT_REF;
    if (binding.recovery_engine_id !== engineId) fail('RECOVERY_ENGINE_SUBJECT_MISMATCH', 'engine_id');
    if (binding.recovery_profile_version !== profileVersion) fail('RECOVERY_ENGINE_SUBJECT_MISMATCH', 'profile_version');
    if (binding.recovery_engine_subject_ref !== subjectRef) fail('RECOVERY_ENGINE_SUBJECT_MISMATCH', 'subject_ref');
  }
  return true;
}

function resolveDependencies(options = {}) {
  return {
    acceptance: options.acceptance_runtime || require('./book-source-recovery-acceptance-v1'),
    recovery: options.recovery_engine || require('./existing-book-recovery'),
    b01: options.b01_execution || require('./book-execution-foundation-b01'),
    durable: options.durable_store || require('./book-workflow-durable-store')
  };
}

function assertCoordinationLaw(value, deps, where) {
  assertNoRawCoordination(value, where);
  if (deps && deps.durable && typeof deps.durable.assertCoordinationOnly === 'function') {
    try { deps.durable.assertCoordinationOnly(value, where); }
    catch (err) { fail(err.code || 'COORDINATION_ONLY_VIOLATION', err.detail || where); }
  }
}

function normalizeRefArray(items, kind) {
  if (!Array.isArray(items) || items.length === 0) fail(`${kind}_REFS_REQUIRED`);
  const idField = kind === 'SOURCE_ACCEPTANCE' ? 'source_acceptance_id' : 'projection_id';
  const digestField = kind === 'SOURCE_ACCEPTANCE' ? 'source_acceptance_digest' : 'projection_digest';
  const ids = new Set();
  return items.map((item, i) => {
    requireFields(item, [idField, digestField], `${kind.toLowerCase()}_refs.${i}`);
    assertRef(item[idField], `${kind.toLowerCase()}_refs.${i}.${idField}`);
    assertDigest(item[digestField], `${kind.toLowerCase()}_refs.${i}.${digestField}`);
    if (ids.has(item[idField])) fail(`DUPLICATE_${kind}_REF`, item[idField]);
    ids.add(item[idField]);
    return { [idField]: item[idField], [digestField]: item[digestField] };
  });
}

function validateCommand(command, binding, deps) {
  requireFields(command, ['capability_id','owner_path','binding_id','binding_digest','reentry_mode','source_acceptance_refs','projection_acceptance_refs'], 'command');
  assertCoordinationLaw(command, deps, 'command');
  if (deps.b01 && typeof deps.b01.assertNotRetiredExecutionIdentity === 'function') {
    try { deps.b01.assertNotRetiredExecutionIdentity(command.capability_id, command.owner_path); }
    catch (err) { fail(err.code || 'RETIRED_EXECUTION_IDENTITY', err.detail || String(command.capability_id)); }
  } else if (String(command.capability_id || '').toUpperCase().startsWith('PROSE.')) {
    fail('RETIRED_PROSE_EXECUTION_ID', command.capability_id);
  }
  if (command.capability_id !== CURRENT_CAPABILITY_ID) fail('RECOVERY_CAPABILITY_ID_MISMATCH', String(command.capability_id));
  if (command.owner_path !== CURRENT_OWNER_PATH) fail('RECOVERY_OWNER_PATH_MISMATCH', String(command.owner_path));
  if (command.binding_id !== binding.binding_id) fail('RECOVERY_BINDING_ID_MISMATCH');
  if (command.binding_digest !== binding.binding_digest) fail('RECOVERY_BINDING_DIGEST_MISMATCH');
  if (!nonEmpty(command.book_project_id) && !nonEmpty(command.recovery_session_id)) fail('BOOK_PROJECT_OR_RECOVERY_SESSION_REQUIRED');
  if (!['RECOVER_EXISTING','NEW_EDITION'].includes(command.reentry_mode)) fail('INVALID_REENTRY_MODE', String(command.reentry_mode));
  if (command.reentry_mode === 'NEW_EDITION') {
    requireFields(command.prior_edition_ref, ['edition_id','edition_digest'], 'prior_edition_ref');
    assertRef(command.prior_edition_ref.edition_id, 'prior_edition_ref.edition_id');
    assertDigest(command.prior_edition_ref.edition_digest, 'prior_edition_ref.edition_digest');
  } else if (command.prior_edition_ref !== undefined && command.prior_edition_ref !== null) {
    fail('PRIOR_EDITION_REF_NOT_ALLOWED_FOR_RECOVER_EXISTING');
  }
  const sources = normalizeRefArray(command.source_acceptance_refs, 'SOURCE_ACCEPTANCE');
  const projections = normalizeRefArray(command.projection_acceptance_refs, 'PROJECTION_ACCEPTANCE');
  if (sources.length !== projections.length) fail('SOURCE_PROJECTION_CARDINALITY_MISMATCH');
  return { sources, projections };
}

function collectionLookup(collection, id, idField) {
  if (collection instanceof Map) return collection.get(id) || null;
  if (Array.isArray(collection)) return collection.find(x => x && x[idField] === id) || null;
  if (isObject(collection)) return collection[id] || null;
  return null;
}

function resolveRecord(options, resolverName, collectionName, id, idField) {
  if (typeof options[resolverName] === 'function') return options[resolverName](id);
  return collectionLookup(options[collectionName], id, idField);
}

function resolveArtifact(options, artifactRef) {
  if (typeof options.load_projection_artifact === 'function') return options.load_projection_artifact(artifactRef);
  return collectionLookup(options.projection_artifacts, artifactRef, 'artifact_ref');
}

function validateProjectionArtifactRecord(record, projection, source) {
  requireFields(record, ['artifact_ref','artifact_digest','payload'], 'projection_artifact_record');
  if (record.artifact_ref !== projection.projection_artifact_ref) fail('PROJECTION_ARTIFACT_REF_MISMATCH');
  assertDigest(record.artifact_digest, 'projection_artifact_record.artifact_digest');
  if (record.artifact_digest !== projection.projection_artifact_digest) fail('PROJECTION_ARTIFACT_DIGEST_MISMATCH');
  const payload = record.payload;
  requireFields(payload, [
    'source_acceptance_id','source_acceptance_digest','projection_id','projection_digest',
    'source_digest_sha256','recovered_content_digest_sha256','normalized_projection','version_candidate'
  ], 'projection_artifact_payload');
  if (payload.source_acceptance_id !== source.source_acceptance_id || payload.source_acceptance_digest !== source.source_acceptance_digest) fail('PROJECTION_ARTIFACT_SOURCE_ACCEPTANCE_MISMATCH');
  if (payload.projection_id !== projection.projection_id || payload.projection_digest !== projection.projection_digest) fail('PROJECTION_ARTIFACT_ACCEPTANCE_MISMATCH');
  if (payload.source_digest_sha256 !== source.source_digest_sha256) fail('PROJECTION_ARTIFACT_SOURCE_DIGEST_MISMATCH');
  if (payload.recovered_content_digest_sha256 !== projection.recovered_content_digest_sha256) fail('PROJECTION_ARTIFACT_RECOVERED_CONTENT_DIGEST_MISMATCH');
  assertObject(payload.normalized_projection, 'projection_artifact_payload.normalized_projection');
  assertObject(payload.version_candidate, 'projection_artifact_payload.version_candidate');
  assertDigest(payload.version_candidate.content_digest, 'projection_artifact_payload.version_candidate.content_digest');
  if (payload.version_candidate.content_digest !== projection.recovered_content_digest_sha256) fail('VERSION_CANDIDATE_CONTENT_DIGEST_MISMATCH');
  assertNoRawCoordination({ version_candidate: payload.version_candidate }, 'projection_artifact_payload.version_candidate');
  return true;
}

function normalizeCoreStructure(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, i) => {
    if (!isObject(item)) fail('INVALID_STRUCTURE_ITEM', String(i));
    const kind = nonEmpty(item.kind) ? item.kind.trim() : 'SECTION';
    const title = typeof item.title === 'string' ? item.title : '';
    const anchor = nonEmpty(item.anchor) ? item.anchor.trim() : `STRUCTURE-${i + 1}`;
    const confidence = Number.isFinite(item.confidence) ? Number(item.confidence) : 1;
    if (confidence < 0 || confidence > 1) fail('INVALID_STRUCTURE_CONFIDENCE', anchor);
    return {
      structure_id: nonEmpty(item.structure_id) ? item.structure_id.trim() : `S-${i + 1}`,
      kind,
      title,
      ordinal: Number.isInteger(item.ordinal) ? item.ordinal : i + 1,
      anchor,
      confidence,
      ambiguous: item.ambiguous === true
    };
  }).sort((a, b) => a.ordinal - b.ordinal || a.structure_id.localeCompare(b.structure_id));
}

function deriveCoreProjectionDigest(normalizedProjection) {
  const p = normalizedProjection || {};
  const metadata = isObject(p.metadata) ? clone(p.metadata) : {};
  const arr = key => Array.isArray(p[key]) ? clone(p[key]) : [];
  return sha256({
    structure: normalizeCoreStructure(p.structure),
    metadata,
    citations: arr('citations'),
    comments: arr('comments'),
    todos: arr('todos'),
    tracked_changes: arr('tracked_changes'),
    story_bible_candidates: Array.isArray(p.story_bible_candidates) ? clone(p.story_bible_candidates) : [],
    nonfiction_knowledge_candidates: Array.isArray(p.nonfiction_knowledge_candidates) ? clone(p.nonfiction_knowledge_candidates) : [],
    voice_candidates: Array.isArray(p.voice_candidates) ? clone(p.voice_candidates) : []
  });
}

function prepareRecoveryInvocationV1(command, options = {}) {
  const deps = resolveDependencies(options);
  const binding = clone(options.binding || buildBookRecoveryRuntimeBindingV1());
  validateBookRecoveryRuntimeBindingV1(binding, {
    engine_id: deps.recovery.ENGINE_ID,
    profile_version: deps.recovery.PROFILE_VERSION,
    engine_subject_ref: ENGINE_SUBJECT_REF
  });
  const refs = validateCommand(command, binding, deps);
  const sources = [];
  const sourceById = new Map();
  for (const ref of refs.sources) {
    const record = resolveRecord(options, 'load_source_acceptance', 'source_acceptances', ref.source_acceptance_id, 'source_acceptance_id');
    if (!record) fail('SOURCE_ACCEPTANCE_NOT_FOUND', ref.source_acceptance_id);
    try { deps.acceptance.validateSourceCustodyAcceptanceV1(record); }
    catch (err) { fail('SOURCE_ACCEPTANCE_INVALID', err.code || ref.source_acceptance_id); }
    if (record.source_acceptance_digest !== ref.source_acceptance_digest) fail('SOURCE_ACCEPTANCE_REF_DIGEST_MISMATCH', ref.source_acceptance_id);
    if (record.source_acceptance_schema_version !== binding.source_acceptance_schema_version) fail('SOURCE_ACCEPTANCE_SCHEMA_VERSION_MISMATCH');
    sources.push(record);
    sourceById.set(record.source_acceptance_id, record);
  }
  const projectionRecords = [];
  const projectionBySource = new Map();
  const engineSources = [];
  for (const ref of refs.projections) {
    const projection = resolveRecord(options, 'load_projection_acceptance', 'projection_acceptances', ref.projection_id, 'projection_id');
    if (!projection) fail('PROJECTION_ACCEPTANCE_NOT_FOUND', ref.projection_id);
    if (projection.projection_digest !== ref.projection_digest) fail('PROJECTION_ACCEPTANCE_REF_DIGEST_MISMATCH', ref.projection_id);
    if (projection.projection_schema_version !== binding.projection_schema_version) fail('PROJECTION_SCHEMA_VERSION_MISMATCH');
    const source = sourceById.get(projection.source_acceptance_id);
    if (!source) fail('PROJECTION_SOURCE_ACCEPTANCE_NOT_IN_REQUEST', projection.source_acceptance_id);
    try { deps.acceptance.validateNormalizedSourceProjectionV1(projection, source); }
    catch (err) { fail('PROJECTION_ACCEPTANCE_INVALID', err.code || ref.projection_id); }
    if (projectionBySource.has(source.source_acceptance_id)) fail('MULTIPLE_PROJECTIONS_FOR_SOURCE', source.source_acceptance_id);
    const artifact = resolveArtifact(options, projection.projection_artifact_ref);
    if (!artifact) fail('PROJECTION_ARTIFACT_NOT_FOUND', projection.projection_artifact_ref);
    validateProjectionArtifactRecord(artifact, projection, source);
    projectionBySource.set(source.source_acceptance_id, projection);
    projectionRecords.push(projection);
    engineSources.push({
      source_id: source.source_id,
      source_digest: source.source_digest_sha256,
      source_kind: source.source_kind,
      normalized_projection: clone(artifact.payload.normalized_projection),
      version_candidate: clone(artifact.payload.version_candidate)
    });
  }
  for (const source of sources) if (!projectionBySource.has(source.source_acceptance_id)) fail('PROJECTION_REQUIRED_FOR_ACCEPTED_SOURCE', source.source_acceptance_id);
  engineSources.sort((a, b) => String(a.source_id).trim().localeCompare(String(b.source_id).trim()));
  const engineRequest = {
    reentry_mode: command.reentry_mode,
    sources: engineSources
  };
  if (nonEmpty(command.book_project_id)) engineRequest.book_project_id = command.book_project_id;
  if (nonEmpty(command.recovery_session_id)) engineRequest.recovery_session_id = command.recovery_session_id;
  if (command.reentry_mode === 'NEW_EDITION') engineRequest.prior_edition_ref = clone(command.prior_edition_ref);
  const anchor = String(engineRequest.book_project_id || engineRequest.recovery_session_id).trim();
  const priorEditionRef = command.reentry_mode === 'NEW_EDITION' ? { edition_id: String(command.prior_edition_ref.edition_id).trim(), edition_digest: command.prior_edition_ref.edition_digest } : null;
  const sourceIdentities = engineSources.map(s => ({
    source_id: String(s.source_id).trim(),
    source_digest: s.source_digest,
    projection_digest: deriveCoreProjectionDigest(s.normalized_projection)
  }));
  const recoveryKey = sha256({
    anchor,
    profile_version: binding.recovery_profile_version,
    reentry_mode: command.reentry_mode,
    source_identities: sourceIdentities,
    prior_edition_ref: priorEditionRef
  });
  const operationProjection = stableNormalize({
    operation_schema_version: OPERATION_SCHEMA_VERSION,
    binding_digest: binding.binding_digest,
    book_or_recovery_anchor: anchor,
    reentry_mode: command.reentry_mode,
    prior_edition_ref: priorEditionRef,
    source_acceptance_digests: sources.map(x => x.source_acceptance_digest).sort(),
    projection_digests: projectionRecords.map(x => x.projection_digest).sort(),
    recovery_profile_version: binding.recovery_profile_version,
    recovery_key: recoveryKey
  });
  const operationDigest = sha256(operationProjection);
  const operationIdentity = stableNormalize({
    operation_schema_version: OPERATION_SCHEMA_VERSION,
    operation_id: `${OPERATION_PREFIX}${operationDigest}`,
    operation_digest: operationDigest,
    idempotency_key: `${OPERATION_PREFIX}${operationDigest}`,
    registered_idempotent: true,
    projection: operationProjection
  });
  return { deps, binding, sources, projections: projectionRecords, engine_request: engineRequest, recovery_key: recoveryKey, operation_identity: operationIdentity };
}

function validateRecoveryOperationIdentityV1(identity) {
  requireFields(identity, ['operation_schema_version','operation_id','operation_digest','idempotency_key','registered_idempotent','projection'], 'operation_identity');
  assertNoRawCoordination(identity, 'operation_identity');
  if (identity.operation_schema_version !== OPERATION_SCHEMA_VERSION) fail('RECOVERY_OPERATION_SCHEMA_MISMATCH');
  assertDigest(identity.operation_digest, 'operation_identity.operation_digest');
  const expected = sha256(identity.projection);
  if (identity.operation_digest !== expected) fail('RECOVERY_OPERATION_DIGEST_MISMATCH');
  if (identity.operation_id !== `${OPERATION_PREFIX}${expected}` || identity.idempotency_key !== `${OPERATION_PREFIX}${expected}`) fail('RECOVERY_OPERATION_ID_MISMATCH');
  if (identity.registered_idempotent !== true) fail('RECOVERY_OPERATION_IDEMPOTENCY_MISMATCH');
  return true;
}

function sameRecoveryOperationV1(a, b) {
  validateRecoveryOperationIdentityV1(a);
  validateRecoveryOperationIdentityV1(b);
  return a.operation_digest === b.operation_digest;
}

function evidenceSemantic(receipt) {
  const copy = clone(receipt);
  delete copy.evidence_id;
  delete copy.evidence_digest;
  return copy;
}

function buildRecoveryEvidenceReceiptV1(prepared, result, executionClass) {
  const baseline = result && result.recovered_book_baseline;
  const engineReceipt = result && result.recovery_receipt;
  if (!isObject(baseline) || !isObject(engineReceipt)) fail('RECOVERY_ENGINE_RESULT_INVALID');
  if (engineReceipt.engine_id !== prepared.binding.recovery_engine_id || engineReceipt.profile_version !== prepared.binding.recovery_profile_version) fail('RECOVERY_ENGINE_RESULT_SUBJECT_MISMATCH');
  if (engineReceipt.recovery_key !== prepared.recovery_key) fail('RECOVERY_KEY_DERIVATION_MISMATCH');
  if (baseline.standing !== 'PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION') fail('RECOVERY_OUTPUT_STANDING_INVALID');
  if (baseline.canonical_book_mutation_performed !== false || baseline.lifecycle_join_authorized !== false || engineReceipt.canonical_mutation_performed !== false || engineReceipt.author_decision_synthesized !== false) fail('RECOVERY_OUTPUT_AUTHORITY_VIOLATION');
  const blockers = Array.isArray(baseline.unresolved_findings) ? baseline.unresolved_findings.filter(x => x && x.severity === 'BLOCKING').map(x => x.finding_code).filter(nonEmpty).sort() : [];
  const ambiguities = baseline.reconstructed_structure && Array.isArray(baseline.reconstructed_structure.ambiguous_structure_ids) ? [...baseline.reconstructed_structure.ambiguous_structure_ids].sort() : [];
  const receipt = stableNormalize({
    evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
    evidence_id: '',
    evidence_digest: '',
    event_type: 'BOOK_RECOVERY_PROPOSED',
    execution_class: executionClass,
    current_capability_id: prepared.binding.current_capability_id,
    current_owner_path: prepared.binding.current_owner_path,
    binding_id: prepared.binding.binding_id,
    binding_digest: prepared.binding.binding_digest,
    operation_id: prepared.operation_identity.operation_id,
    operation_digest: prepared.operation_identity.operation_digest,
    source_acceptances: prepared.sources.map(x => ({ source_acceptance_id: x.source_acceptance_id, source_acceptance_digest: x.source_acceptance_digest })).sort((a,b) => a.source_acceptance_id.localeCompare(b.source_acceptance_id)),
    projection_acceptances: prepared.projections.map(x => ({ projection_id: x.projection_id, projection_digest: x.projection_digest })).sort((a,b) => a.projection_id.localeCompare(b.projection_id)),
    recovery_engine_id: prepared.binding.recovery_engine_id,
    recovery_profile_version: prepared.binding.recovery_profile_version,
    recovery_key: prepared.recovery_key,
    engine_recovery_receipt_id: engineReceipt.recovery_receipt_id,
    engine_recovery_input_digest: engineReceipt.recovery_input_digest,
    result_baseline_id: baseline.recovered_book_baseline_id,
    result_baseline_digest: baseline.baseline_digest,
    result_standing: baseline.standing,
    blocking_finding_codes: blockers,
    ambiguous_structure_ids: ambiguities,
    canonical_effect: false,
    lifecycle_transition_authorized: false,
    author_decision_synthesized: false,
    publication_authority: false
  });
  receipt.evidence_digest = sha256(evidenceSemantic(receipt));
  receipt.evidence_id = `${EVIDENCE_PREFIX}${receipt.evidence_digest}`;
  return stableNormalize(receipt);
}

function validateRecoveryEvidenceReceiptV1(receipt, operationIdentity, binding) {
  requireFields(receipt, ['evidence_schema_version','evidence_id','evidence_digest','event_type','current_capability_id','current_owner_path','binding_id','binding_digest','operation_id','operation_digest','source_acceptances','projection_acceptances','recovery_engine_id','recovery_profile_version','recovery_key','engine_recovery_receipt_id','engine_recovery_input_digest','result_baseline_id','result_baseline_digest','result_standing','blocking_finding_codes','ambiguous_structure_ids','canonical_effect','lifecycle_transition_authorized','author_decision_synthesized','publication_authority'], 'recovery_evidence');
  assertNoRawCoordination(receipt, 'recovery_evidence');
  validateRecoveryOperationIdentityV1(operationIdentity);
  validateBookRecoveryRuntimeBindingV1(binding, { require_current: false });
  if (receipt.evidence_schema_version !== EVIDENCE_SCHEMA_VERSION || receipt.event_type !== 'BOOK_RECOVERY_PROPOSED') fail('RECOVERY_EVIDENCE_SCHEMA_MISMATCH');
  if (receipt.current_capability_id !== binding.current_capability_id || receipt.current_owner_path !== binding.current_owner_path || receipt.binding_id !== binding.binding_id || receipt.binding_digest !== binding.binding_digest) fail('RECOVERY_EVIDENCE_BINDING_MISMATCH');
  if (receipt.operation_id !== operationIdentity.operation_id || receipt.operation_digest !== operationIdentity.operation_digest) fail('RECOVERY_EVIDENCE_OPERATION_MISMATCH');
  if (receipt.recovery_key !== operationIdentity.projection.recovery_key) fail('RECOVERY_EVIDENCE_KEY_MISMATCH');
  if (receipt.recovery_engine_id !== binding.recovery_engine_id || receipt.recovery_profile_version !== binding.recovery_profile_version) fail('RECOVERY_EVIDENCE_ENGINE_MISMATCH');
  if (receipt.result_standing !== 'PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION') fail('RECOVERY_EVIDENCE_STANDING_MISMATCH');
  if (receipt.canonical_effect !== false || receipt.lifecycle_transition_authorized !== false || receipt.author_decision_synthesized !== false || receipt.publication_authority !== false) fail('RECOVERY_EVIDENCE_AUTHORITY_WIDENING');
  assertDigest(receipt.evidence_digest, 'recovery_evidence.evidence_digest');
  const expected = sha256(evidenceSemantic(receipt));
  if (receipt.evidence_digest !== expected || receipt.evidence_id !== `${EVIDENCE_PREFIX}${expected}`) fail('RECOVERY_EVIDENCE_DIGEST_MISMATCH');
  return true;
}

function inspectDurableState(prepared, durableState) {
  if (durableState === undefined || durableState === null) return { action: 'EXECUTE' };
  assertCoordinationLaw(durableState, prepared.deps, 'durable_state');
  requireFields(durableState, ['status','operation_identity'], 'durable_state');
  validateRecoveryOperationIdentityV1(durableState.operation_identity);
  if (!sameRecoveryOperationV1(durableState.operation_identity, prepared.operation_identity)) return { action: 'EXECUTE_NEW_OPERATION' };
  if (durableState.status === 'UNKNOWN' || durableState.status === 'CONTRADICTORY') fail('BLOCKED_RECONCILIATION', durableState.status);
  if (durableState.status === 'COMPLETED_VERIFIED') {
    if (!durableState.recovery_evidence_receipt) fail('BLOCKED_RECONCILIATION', 'MISSING_COMPLETED_EVIDENCE');
    validateRecoveryEvidenceReceiptV1(durableState.recovery_evidence_receipt, prepared.operation_identity, prepared.binding);
    return { action: 'REUSE', receipt: clone(durableState.recovery_evidence_receipt) };
  }
  if (durableState.status === 'INTERRUPTED') {
    if (!isObject(durableState.checkpoint)) fail('BLOCKED_RECONCILIATION', 'MISSING_CHECKPOINT');
    if (durableState.checkpoint.engine_id !== prepared.binding.recovery_engine_id || durableState.checkpoint.profile_version !== prepared.binding.recovery_profile_version) fail('BLOCKED_RECONCILIATION', 'CHECKPOINT_SUBJECT_MISMATCH');
    return { action: 'RESUME', checkpoint: clone(durableState.checkpoint) };
  }
  fail('BLOCKED_RECONCILIATION', `UNKNOWN_DURABLE_STATUS:${String(durableState.status)}`);
}

function recoverExistingBookV1(command, options = {}) {
  const prepared = prepareRecoveryInvocationV1(command, options);
  const durableDecision = inspectDurableState(prepared, options.durable_state);
  if (durableDecision.action === 'REUSE') {
    return stableNormalize({
      execution_class: 'REUSE_VERIFIED_RESULT',
      current_capability_id: prepared.binding.current_capability_id,
      binding: prepared.binding,
      operation_identity: prepared.operation_identity,
      recovery_evidence_receipt: durableDecision.receipt,
      engine_invoked: false,
      canonical_effect: false
    });
  }
  let result;
  let executionClass;
  try {
    if (durableDecision.action === 'RESUME') {
      result = prepared.deps.recovery.resumeExistingBookRecovery(prepared.engine_request, durableDecision.checkpoint);
      executionClass = 'RESUMED_FROM_VALIDATED_CHECKPOINT';
    } else {
      result = prepared.deps.recovery.recoverExistingBook(prepared.engine_request);
      executionClass = durableDecision.action === 'EXECUTE_NEW_OPERATION' ? 'EXECUTED_NEW_OPERATION_CHANGED_INPUTS' : 'EXECUTED';
    }
  } catch (err) {
    if (err && err.code) fail(err.code, err.detail || 'recovery_engine');
    throw err;
  }
  const evidence = buildRecoveryEvidenceReceiptV1(prepared, result, executionClass);
  validateRecoveryEvidenceReceiptV1(evidence, prepared.operation_identity, prepared.binding);
  return stableNormalize({
    execution_class: executionClass,
    current_capability_id: prepared.binding.current_capability_id,
    binding: prepared.binding,
    operation_identity: prepared.operation_identity,
    recovery_evidence_receipt: evidence,
    recovery_result: clone(result),
    engine_invoked: true,
    canonical_effect: false
  });
}

module.exports = {
  BINDING_SCHEMA_VERSION,
  EVIDENCE_SCHEMA_VERSION,
  OPERATION_SCHEMA_VERSION,
  CURRENT_CAPABILITY_ID,
  CURRENT_OWNER_PATH,
  ADAPTER_ID,
  ADAPTER_VERSION,
  ENGINE_ID,
  PROFILE_VERSION,
  ENGINE_SUBJECT_REF,
  B01_EXECUTION_FREEZE_REF,
  BookExistingBookRecoveryAdapterV1Error,
  stableStringify,
  sha256,
  assertNoRawCoordination,
  buildBookRecoveryRuntimeBindingV1,
  validateBookRecoveryRuntimeBindingV1,
  prepareRecoveryInvocationV1,
  validateRecoveryOperationIdentityV1,
  sameRecoveryOperationV1,
  buildRecoveryEvidenceReceiptV1,
  validateRecoveryEvidenceReceiptV1,
  recoverExistingBookV1
};
