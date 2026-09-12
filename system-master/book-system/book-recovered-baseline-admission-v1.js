'use strict';

const crypto = require('crypto');

const SCHEMA_VERSION = '1';
const RECEIPT_SCHEMA_VERSION = '1';
const ADAPTER_ID = 'BOOK_RECOVERED_BASELINE_ADMISSION_V1';
const RECOVERY_STANDING = 'PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION';
const RECONCILE_STANDING = 'RECONCILE_REQUIRED__ADMISSION_COMMITTED__LIFECYCLE_REBIND_PENDING';
const COMMITTED_STANDING = 'COMMITTED_VERIFIED';
const PENDING_STATUS = 'ADMISSION_COMMITTED_LIFECYCLE_PENDING';
const OPERATION_PREFIX = 'book-recovered-baseline-admission-v1:';
const RECEIPT_PREFIX = 'book-recovered-baseline-admission-receipt-v1:';
const NEXT_LIFECYCLE_DIRECTIVE = 'REMAIN_IN_CURRENT_LIFECYCLE_STATUS__EXPLICIT_TRANSITION_REQUIRED';
const RATIFICATION_DECISION_TYPE = 'RATIFY_RECOVERED_BOOK_BASELINE';
const SHA256 = /^[a-f0-9]{64}$/;
const AFFIRMATIVE = new Set(['APPROVE','APPROVED','ACCEPT','ACCEPTED','PROMOTE','PROMOTED','YES',true]);
const RAW_FIELDS = new Set([
  'raw_bytes','source_bytes','original_bytes','file_bytes','document_bytes','manuscript_bytes',
  'raw_manuscript','raw_document','raw_source','manuscript_text','document_text','full_text',
  'private_manuscript_text','candidate_text','raw_passage','raw_candidate','raw_research',
  'provider_chain_of_thought','canonical_mutation_command','publication_credentials','production_credentials'
]);

class BookRecoveredBaselineAdmissionV1Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookRecoveredBaselineAdmissionV1Error';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookRecoveredBaselineAdmissionV1Error(code, detail); }
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
function same(a, b) { return stableStringify(a) === stableStringify(b); }
function assertObject(v, label) { if (!isObject(v)) fail('OBJECT_REQUIRED', label); }
function assertRef(v, label) { if (!nonEmpty(String(v === undefined || v === null ? '' : v))) fail('REFERENCE_REQUIRED', label); }
function assertDigest(v, label) { if (!SHA256.test(String(v || ''))) fail('INVALID_SHA256', label); }
function requireFields(v, fields, label) {
  assertObject(v, label);
  for (const field of fields) if (!Object.prototype.hasOwnProperty.call(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function assertNoRaw(value, where = 'input') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoRaw(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (RAW_FIELDS.has(key)) fail('RAW_CONTENT_FORBIDDEN', `${where}.${key}`);
    assertNoRaw(child, `${where}.${key}`);
  }
}

function resolveDependencies(options = {}) {
  return {
    recovery: options.recovery_runtime || require('./book-existing-book-recovery-adapter-v1'),
    engine: options.recovery_engine || require('./existing-book-recovery'),
    acceptance: options.acceptance_runtime || require('./book-source-recovery-acceptance-v1'),
    applicability: options.applicability_guard || require('./content-admission-author-decision-applicability-guard'),
    currentSubject: options.current_subject_guard || require('./author-decision-current-subject-guard'),
    authorQueue: options.author_queue || require('./author-decision-queue'),
    versioning: options.versioning || require('./version-and-rollback-core'),
    lifecycleRebind: options.lifecycle_rebind || require('./lifecycle-current-parent-rebind-adapter'),
    lifecycleCompatibility: options.lifecycle_compatibility || require('./lifecycle-current-parent-compatibility-adapter')
  };
}

function baselineDigest(baseline, depsOrOptions = {}) {
  const copy = clone(baseline);
  delete copy.recovered_book_baseline_id;
  delete copy.baseline_digest;
  const engine = depsOrOptions.engine || depsOrOptions.recoveryEngine || depsOrOptions.recovery_engine;
  return engine && typeof engine.digest === 'function' ? engine.digest(copy) : sha256(copy);
}

function validateBaseline(baseline, deps) {
  requireFields(baseline, [
    'recovered_book_baseline_id','baseline_digest','standing','reentry_mode','source_manifest',
    'candidate_revision_graph','unresolved_findings','canonical_book_mutation_performed','lifecycle_join_authorized'
  ], 'recovery_baseline');
  assertRef(baseline.recovered_book_baseline_id, 'recovery_baseline.recovered_book_baseline_id');
  assertDigest(baseline.baseline_digest, 'recovery_baseline.baseline_digest');
  const expected = baselineDigest(baseline, deps);
  if (baseline.baseline_digest !== expected) fail('RECOVERY_BASELINE_DIGEST_MISMATCH');
  if (baseline.recovered_book_baseline_id !== `RBB-${expected.slice(0, 24)}`) fail('RECOVERY_BASELINE_ID_MISMATCH');
  if (baseline.standing !== RECOVERY_STANDING) fail('RECOVERY_BASELINE_STANDING_INVALID');
  if (baseline.canonical_book_mutation_performed !== false || baseline.lifecycle_join_authorized !== false) fail('RECOVERY_OUTPUT_AUTHORITY_VIOLATION');
  if (!Array.isArray(baseline.source_manifest) || baseline.source_manifest.length === 0) fail('RECOVERY_SOURCE_MANIFEST_REQUIRED');
  if (!isObject(baseline.candidate_revision_graph) || !Array.isArray(baseline.candidate_revision_graph.nodes)) fail('RECOVERY_CANDIDATE_GRAPH_REQUIRED');
  if (!Array.isArray(baseline.unresolved_findings)) fail('RECOVERY_FINDINGS_ARRAY_REQUIRED');
  const blockers = baseline.unresolved_findings.filter(x => x && x.severity === 'BLOCKING');
  if (blockers.length) fail('BLOCKED_RECOVERY_AMBIGUITY', blockers.map(x => x.finding_code || 'BLOCKING').sort().join(','));
  return true;
}

function normalizeIdentityRefs(items, kind) {
  if (!Array.isArray(items) || items.length === 0) fail(`${kind}_IDENTITIES_REQUIRED`);
  const idField = kind === 'SOURCE_ACCEPTANCE' ? 'source_acceptance_id' : 'projection_id';
  const digestField = kind === 'SOURCE_ACCEPTANCE' ? 'source_acceptance_digest' : 'projection_digest';
  const seen = new Set();
  return items.map((item, i) => {
    requireFields(item, [idField, digestField], `${kind.toLowerCase()}.${i}`);
    assertRef(item[idField], `${kind.toLowerCase()}.${i}.${idField}`);
    assertDigest(item[digestField], `${kind.toLowerCase()}.${i}.${digestField}`);
    if (seen.has(item[idField])) fail(`DUPLICATE_${kind}_IDENTITY`, item[idField]);
    seen.add(item[idField]);
    return { [idField]: item[idField], [digestField]: item[digestField] };
  }).sort((a, b) => a[idField].localeCompare(b[idField]));
}

function normalizeSubjectRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) fail('AUTHOR_DECISION_SUBJECT_REFS_REQUIRED');
  const seen = new Set();
  return refs.map((item, i) => {
    requireFields(item, ['object_id','object_version','object_digest'], `subject_identity_refs.${i}`);
    assertRef(String(item.object_id), `subject_identity_refs.${i}.object_id`);
    assertRef(String(item.object_version), `subject_identity_refs.${i}.object_version`);
    assertDigest(item.object_digest, `subject_identity_refs.${i}.object_digest`);
    const value = { object_id: String(item.object_id), object_version: String(item.object_version), object_digest: item.object_digest };
    const key = stableStringify(value);
    if (seen.has(key)) fail('DUPLICATE_AUTHOR_DECISION_SUBJECT_REF', key);
    seen.add(key);
    return value;
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function currentCanonicalManuscript(parentState, deps) {
  if (deps.versioning && typeof deps.versioning.validateParentState === 'function') deps.versioning.validateParentState(parentState);
  if (!isObject(parentState) || !isObject(parentState.active)) fail('CURRENT_PARENT_REQUIRED');
  const activeRef = parentState.active.canonical_manuscript_ref;
  assertRef(activeRef, 'parent_state.active.canonical_manuscript_ref');
  if (!deps.versioning || typeof deps.versioning.objectRecords !== 'function') fail('VERSIONING_OBJECT_RECORDS_REQUIRED');
  const matches = deps.versioning.objectRecords(parentState).filter(record => record && record.type === 'MANUSCRIPT_MANIFEST' && (activeRef === record.object_id || activeRef === `${record.object_id}:${record.object_version}`));
  if (matches.length !== 1) fail('CURRENT_MANUSCRIPT_IDENTITY_AMBIGUOUS', String(matches.length));
  if (matches[0].payload && matches[0].payload.authority_state !== 'CANONICAL') fail('CURRENT_MANUSCRIPT_NOT_CANONICAL');
  return matches[0];
}

function validateRecoveryExecution(input, deps) {
  requireFields(input.recovery_execution, ['binding','operation_identity','recovery_evidence_receipt','recovery_result'], 'recovery_execution');
  try {
    deps.recovery.validateRecoveryEvidenceReceiptV1(
      input.recovery_execution.recovery_evidence_receipt,
      input.recovery_execution.operation_identity,
      input.recovery_execution.binding
    );
  } catch (err) {
    fail('RECOVERY_EVIDENCE_INVALID', err && err.code ? err.code : 'INVALID');
  }
  const baseline = input.recovery_execution.recovery_result && input.recovery_execution.recovery_result.recovered_book_baseline;
  if (!isObject(baseline)) fail('RECOVERY_RESULT_REQUIRED');
  const evidence = input.recovery_execution.recovery_evidence_receipt;
  if (evidence.result_baseline_id !== undefined && evidence.result_baseline_id !== baseline.recovered_book_baseline_id) fail('RECOVERY_EVIDENCE_BASELINE_MISMATCH');
  if (evidence.result_baseline_digest !== baseline.baseline_digest) fail('RECOVERY_EVIDENCE_BASELINE_MISMATCH');
  validateBaseline(baseline, deps);
  return baseline;
}

function validateAcceptedRecords(input, deps) {
  if (!Array.isArray(input.source_acceptances) || input.source_acceptances.length === 0) fail('ACCEPTED_SOURCE_AND_PROJECTION_RECORDS_REQUIRED');
  if (!Array.isArray(input.projection_acceptances) || input.projection_acceptances.length === 0) fail('ACCEPTED_SOURCE_AND_PROJECTION_RECORDS_REQUIRED');
  const sourceById = new Map();
  for (const source of input.source_acceptances) {
    try { deps.acceptance.validateSourceCustodyAcceptanceV1(source); }
    catch (err) { fail('SOURCE_ACCEPTANCE_INVALID', err && err.code ? err.code : 'INVALID'); }
    if (sourceById.has(source.source_acceptance_id)) fail('DUPLICATE_SOURCE_ACCEPTANCE_RECORD', source.source_acceptance_id);
    sourceById.set(source.source_acceptance_id, source);
  }
  const projectionBySource = new Map();
  const projectionById = new Map();
  for (const projection of input.projection_acceptances) {
    const source = sourceById.get(projection.source_acceptance_id);
    if (!source) fail('PROJECTION_SOURCE_ACCEPTANCE_NOT_IN_REQUEST', String(projection.source_acceptance_id));
    try { deps.acceptance.validateNormalizedSourceProjectionV1(projection, source); }
    catch (err) { fail('PROJECTION_ACCEPTANCE_INVALID', err && err.code ? err.code : 'INVALID'); }
    if (projectionById.has(projection.projection_id)) fail('DUPLICATE_PROJECTION_ACCEPTANCE_RECORD', projection.projection_id);
    if (projectionBySource.has(source.source_acceptance_id)) fail('MULTIPLE_PROJECTIONS_FOR_SOURCE', source.source_acceptance_id);
    projectionById.set(projection.projection_id, projection);
    projectionBySource.set(source.source_acceptance_id, projection);
  }
  if (projectionBySource.size !== sourceById.size) fail('PROJECTION_REQUIRED_FOR_ACCEPTED_SOURCE');
  if (input.source_reresolutions !== undefined && input.source_reresolutions !== null) {
    if (!Array.isArray(input.source_reresolutions)) fail('SOURCE_RERESOLUTIONS_ARRAY_REQUIRED');
    for (const item of input.source_reresolutions) {
      requireFields(item, ['source_acceptance_id','observation'], 'source_reresolution');
      const source = sourceById.get(item.source_acceptance_id);
      if (!source) fail('SOURCE_RERESOLUTION_ACCEPTANCE_NOT_IN_REQUEST', item.source_acceptance_id);
      try { deps.acceptance.validateSourceReresolutionV1(source, item.observation); }
      catch (err) { fail('BLOCKED_SOURCE_STALE', err && err.code ? err.code : 'STALE'); }
    }
  }
  return { sourceById, projectionById, projectionBySource };
}

function validateExactRecoveryIdentities(input, accepted) {
  const declaredSources = normalizeIdentityRefs(input.source_acceptance_ids_and_digests, 'SOURCE_ACCEPTANCE');
  const declaredProjections = normalizeIdentityRefs(input.projection_ids_and_digests, 'PROJECTION_ACCEPTANCE');
  const evidence = input.recovery_execution.recovery_evidence_receipt;
  const evidenceSources = normalizeIdentityRefs(evidence.source_acceptances, 'SOURCE_ACCEPTANCE');
  const evidenceProjections = normalizeIdentityRefs(evidence.projection_acceptances, 'PROJECTION_ACCEPTANCE');
  const recordSources = normalizeIdentityRefs([...accepted.sourceById.values()].map(x => ({ source_acceptance_id: x.source_acceptance_id, source_acceptance_digest: x.source_acceptance_digest })), 'SOURCE_ACCEPTANCE');
  const recordProjections = normalizeIdentityRefs([...accepted.projectionById.values()].map(x => ({ projection_id: x.projection_id, projection_digest: x.projection_digest })), 'PROJECTION_ACCEPTANCE');
  if (!same(declaredSources, evidenceSources)) fail('RECOVERY_SOURCE_IDENTITY_MISMATCH');
  if (!same(declaredProjections, evidenceProjections)) fail('RECOVERY_PROJECTION_IDENTITY_MISMATCH');
  if (!same(declaredSources, recordSources) || !same(declaredProjections, recordProjections)) fail('ACCEPTANCE_RECORD_IDENTITY_MISMATCH');
  return { sources: declaredSources, projections: declaredProjections };
}

function validateCandidate(input, baseline, accepted) {
  assertRef(input.selected_candidate_id, 'selected_candidate_id');
  assertDigest(input.selected_candidate_content_digest, 'selected_candidate_content_digest');
  const graph = baseline.candidate_revision_graph;
  const matches = graph.nodes.filter(x => x && x.candidate_id === input.selected_candidate_id);
  if (matches.length !== 1) fail('RECOVERY_SELECTED_CANDIDATE_CARDINALITY_INVALID', String(matches.length));
  const candidate = matches[0];
  if (candidate.content_digest !== input.selected_candidate_content_digest) fail('RECOVERY_SELECTED_CANDIDATE_DIGEST_MISMATCH');
  if (graph.proposed_selected_candidate_id !== input.selected_candidate_id) fail('RECOVERY_SELECTED_CANDIDATE_NOT_GOVERNED_GRAPH_SELECTION');
  assertRef(candidate.source_ref, 'selected_candidate.source_ref');
  const manifestMatches = baseline.source_manifest.filter(x => x && x.source_ref === candidate.source_ref);
  if (manifestMatches.length !== 1) fail('RECOVERY_CANDIDATE_PROVENANCE_INCOMPLETE', String(manifestMatches.length));
  const manifest = manifestMatches[0];
  const acceptedSource = [...accepted.sourceById.values()].find(x => String(x.source_id) === String(manifest.source_id) && x.source_digest_sha256 === manifest.source_digest);
  if (!acceptedSource) fail('RECOVERY_CANDIDATE_PROVENANCE_INCOMPLETE', 'SOURCE_MANIFEST_NOT_ACCEPTED');
  return clone(candidate);
}

function validateAuthorRatification(input, parentState, currentManuscript, deps, queueLedger) {
  assertRef(input.author_decision_id, 'author_decision_id');
  assertRef(input.author_resolution_receipt_id, 'author_resolution_receipt_id');
  assertDigest(input.author_resolution_receipt_digest, 'author_resolution_receipt_digest');
  if (!queueLedger) fail('AUTHOR_DECISION_QUEUE_EVIDENCE_REQUIRED');
  if (deps.authorQueue && typeof deps.authorQueue.validateQueueLedger === 'function') {
    try { deps.authorQueue.validateQueueLedger(queueLedger, parentState); }
    catch (err) { fail('AUTHOR_DECISION_QUEUE_INVALID', err && err.code ? err.code : 'INVALID'); }
  }
  const decision = (parentState.author_decisions || []).find(x => x && x.decision_id === input.author_decision_id);
  if (!decision || decision.status !== 'APPROVED' || !AFFIRMATIVE.has(decision.author_choice)) fail('BLOCKED_AUTHOR_DECISION', 'DECISION_NOT_APPROVED');
  if (decision.decision_type !== RATIFICATION_DECISION_TYPE) fail('BLOCKED_AUTHOR_DECISION', 'WRONG_DECISION_TYPE');
  const receipt = queueLedger.resolution_receipts && queueLedger.resolution_receipts[input.author_resolution_receipt_id];
  if (!receipt) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_MISSING');
  const receiptDigest = deps.authorQueue && typeof deps.authorQueue.digest === 'function' ? deps.authorQueue.digest(receipt) : sha256(receipt);
  if (receiptDigest !== input.author_resolution_receipt_digest) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_DIGEST_MISMATCH');
  if (receipt.decision_id !== input.author_decision_id || receipt.decision_type !== RATIFICATION_DECISION_TYPE || receipt.canonical_decision_status !== decision.status) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_DECISION_MISMATCH');
  const refs = normalizeSubjectRefs(receipt.subject_identity_refs || []);
  const manuscriptRef = { object_id: String(currentManuscript.object_id), object_version: String(currentManuscript.object_version), object_digest: currentManuscript.object_digest };
  const projectRef = { object_id: String(parentState.book_project.book_project_id), object_version: `STATE-${parentState.state_version}`, object_digest: deps.versioning.digest(parentState.book_project) };
  if (!refs.some(x => same(x, manuscriptRef))) fail('BLOCKED_AUTHOR_DECISION', 'CURRENT_MANUSCRIPT_SUBJECT_NOT_BOUND');
  if (!refs.some(x => same(x, projectRef))) fail('BLOCKED_AUTHOR_DECISION', 'CURRENT_BOOK_PROJECT_SUBJECT_NOT_BOUND');
  try { deps.currentSubject.assertStrictSubjectCurrent(parentState, refs); }
  catch (err) { fail('BLOCKED_AUTHOR_DECISION', err && err.code ? err.code : 'AUTHOR_DECISION_SUBJECT_NOT_CURRENT'); }
  return { decision: clone(decision), receipt: clone(receipt), subjectRefs: refs };
}

function validatePriorEdition(input, baseline) {
  if (baseline.reentry_mode === 'NEW_EDITION') {
    requireFields(input.prior_edition_ref, ['edition_id','edition_digest'], 'prior_edition_ref');
    assertRef(input.prior_edition_ref.edition_id, 'prior_edition_ref.edition_id');
    assertDigest(input.prior_edition_ref.edition_digest, 'prior_edition_ref.edition_digest');
    const lineage = baseline.edition_lineage;
    if (!isObject(lineage) || lineage.relationship !== 'NEW_EDITION_OF' || lineage.history_rewrite_permitted !== false || !same(lineage.prior_edition_ref, input.prior_edition_ref)) fail('NEW_EDITION_PRIOR_IDENTITY_MISMATCH');
  } else if (input.prior_edition_ref !== undefined && input.prior_edition_ref !== null) {
    fail('PRIOR_EDITION_REF_NOT_ALLOWED_FOR_RECOVER_EXISTING');
  }
}

function validateUnitEvidence(input, accepted, identities, deps) {
  const requested = Array.isArray(input.requested_unit_ids) ? input.requested_unit_ids : [];
  if (requested.length === 0) return [];
  if (requested.some(x => !nonEmpty(x)) || new Set(requested).size !== requested.length) fail('BLOCKED_PER_UNIT_EVIDENCE', 'INVALID_UNIT_IDS');
  const evidence = [];
  for (const projection of accepted.projectionById.values()) {
    const available = new Set((projection.unit_evidence || []).map(x => x && x.unit_id).filter(nonEmpty));
    const wanted = requested.filter(id => available.has(id));
    if (!wanted.length) continue;
    const source = accepted.sourceById.get(projection.source_acceptance_id);
    let checked;
    try { checked = deps.acceptance.assertUnitAdmissionEvidenceV1(projection, source, wanted); }
    catch (err) { fail('BLOCKED_PER_UNIT_EVIDENCE', err && err.detail ? err.detail : (err && err.code ? err.code : 'INVALID')); }
    evidence.push(...checked.unit_evidence);
  }
  const found = new Set(evidence.map(x => x.unit_id));
  for (const id of requested) if (!found.has(id)) fail('BLOCKED_PER_UNIT_EVIDENCE', id);
  for (const item of evidence) {
    if (!identities.sources.some(x => x.source_acceptance_digest === item.source_acceptance_digest)) fail('BLOCKED_PER_UNIT_EVIDENCE', `SOURCE:${item.unit_id}`);
    if (!identities.projections.some(x => x.projection_digest === item.projection_digest)) fail('BLOCKED_PER_UNIT_EVIDENCE', `PROJECTION:${item.unit_id}`);
  }
  return evidence.sort((a, b) => a.unit_id.localeCompare(b.unit_id));
}

function admissionSemanticProjection(input, baseline, candidate, identities, author, unitEvidence) {
  return stableNormalize({
    admission_schema_version: SCHEMA_VERSION,
    book_project_id: input.book_project_id,
    current_book_state_version: input.current_book_state_version,
    current_book_state_digest: input.current_book_state_digest,
    current_manuscript_id: input.current_manuscript_id,
    current_manuscript_version: String(input.current_manuscript_version),
    current_manuscript_digest: input.current_manuscript_digest,
    recovery_baseline_id: baseline.recovered_book_baseline_id,
    recovery_baseline_digest: baseline.baseline_digest,
    selected_candidate_id: candidate.candidate_id,
    selected_candidate_content_digest: candidate.content_digest,
    source_acceptance_ids_and_digests: identities.sources,
    projection_ids_and_digests: identities.projections,
    author_decision_id: input.author_decision_id,
    author_resolution_receipt_id: input.author_resolution_receipt_id,
    author_resolution_receipt_digest: input.author_resolution_receipt_digest,
    author_subject_identity_refs: author.subjectRefs,
    prior_edition_ref: baseline.reentry_mode === 'NEW_EDITION' ? clone(input.prior_edition_ref) : null,
    unit_evidence: clone(unitEvidence)
  });
}

function buildPrepared(input, options, deps, parentState, baseline, candidate, identities, author, unitEvidence) {
  const semanticProjection = admissionSemanticProjection(input, baseline, candidate, identities, author, unitEvidence);
  const admissionDigest = sha256(semanticProjection);
  const admissionId = `${OPERATION_PREFIX}${admissionDigest}`;
  const versionId = `RECOVERED-${admissionDigest.slice(0, 20).toUpperCase()}`;
  const successorRef = `${input.current_manuscript_id}:${versionId}`;
  const createdAt = nonEmpty(author.receipt.resolved_at) ? author.receipt.resolved_at : `SEMANTIC:${admissionDigest}`;
  const register = {
    operation_type: 'REGISTER_CONTENT_OBJECT_VERSION',
    object_type: 'MANUSCRIPT_MANIFEST',
    object_id: input.current_manuscript_id,
    version_id: versionId,
    content_digest_sha256: candidate.content_digest,
    parent_version_ref: `${input.current_manuscript_id}:${String(input.current_manuscript_version)}`,
    provenance_ref: admissionId,
    source_subject_sha: baseline.baseline_digest,
    source_current: true,
    created_by: ADAPTER_ID,
    created_at: createdAt,
    requires_author_decision: true,
    payload: {
      manuscript_id: input.current_manuscript_id,
      version_id: versionId,
      artifact_digest: candidate.content_digest,
      authority_state: 'CANONICAL',
      recovery_baseline_id: baseline.recovered_book_baseline_id,
      recovery_baseline_digest: baseline.baseline_digest,
      selected_candidate_id: candidate.candidate_id,
      recovery_admission_operation_id: admissionId,
      recovery_admission_operation_digest: admissionDigest,
      source_acceptances: clone(identities.sources),
      projection_acceptances: clone(identities.projections),
      prior_edition_ref: baseline.reentry_mode === 'NEW_EDITION' ? clone(input.prior_edition_ref) : null,
      history_rewrite_permitted: false
    }
  };
  const setActive = { operation_type: 'SET_ACTIVE_CONTENT_OBJECT_VERSION', object_type: 'MANUSCRIPT_MANIFEST', object_ref: successorRef };
  const request = stableNormalize({
    mutation_id: admissionId,
    actor_class: 'PARENT_SYSTEM',
    expected_state_version: parentState.state_version,
    expected_state_digest: parentState.state_digest,
    operations: [register, setActive],
    evidence_refs: [
      input.recovery_execution.recovery_evidence_receipt.evidence_id,
      baseline.recovered_book_baseline_id,
      input.author_resolution_receipt_id,
      ...identities.sources.map(x => x.source_acceptance_id),
      ...identities.projections.map(x => x.projection_id)
    ].filter(nonEmpty).sort(),
    author_decision_refs: [input.author_decision_id]
  });
  const operationFingerprint = deps.authorQueue && typeof deps.authorQueue.digest === 'function' ? deps.authorQueue.digest(register) : sha256(register);
  return stableNormalize({
    admission_operation_id: admissionId,
    admission_operation_digest: admissionDigest,
    semantic_projection: semanticProjection,
    recovery_baseline: clone(baseline),
    selected_candidate: clone(candidate),
    content_admission_request: request,
    applicability_bindings: [{
      operation_index: 0,
      operation_fingerprint: operationFingerprint,
      author_decision_ref: input.author_decision_id,
      resolution_receipt_id: input.author_resolution_receipt_id,
      required_subject_identity_refs: clone(author.subjectRefs)
    }],
    expected_successor_manuscript_ref: successorRef,
    unit_evidence: clone(unitEvidence),
    canonical_effect: false,
    lifecycle_transition_authorized: false,
    author_decision_authority: false,
    publication_authority: false,
    export_freeze_authority: false
  });
}

function prepareRecoveredBaselineAdmissionV1(input, options = {}) {
  assertObject(input, 'input');
  assertNoRaw(input, 'input');
  assertEvidenceClaimBoundariesV1(input);
  requireFields(input, [
    'book_project_id','current_book_state_version','current_book_state_digest',
    'current_manuscript_id','current_manuscript_version','current_manuscript_digest',
    'recovery_execution','selected_candidate_id','selected_candidate_content_digest',
    'source_acceptance_ids_and_digests','projection_ids_and_digests','source_acceptances','projection_acceptances',
    'author_decision_id','author_resolution_receipt_id','author_resolution_receipt_digest'
  ], 'input');
  const deps = resolveDependencies(options);
  const parentState = options.parent_state;
  const versionLedger = options.version_ledger;
  const queueLedger = options.queue_ledger;
  const lifecycleLedger = options.lifecycle_ledger;
  const lifecycleContract = options.lifecycle_contract;
  if (!isObject(parentState) || !isObject(versionLedger) || !isObject(queueLedger) || !isObject(lifecycleLedger)) fail('CURRENT_CANONICAL_STATE_REQUIRED');
  if (!lifecycleContract || lifecycleContract.engine_id !== 'BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001') fail('LIFECYCLE_CONTRACT_REQUIRED');
  assertRef(input.book_project_id, 'book_project_id');
  assertDigest(input.current_book_state_digest, 'current_book_state_digest');
  assertDigest(input.current_manuscript_digest, 'current_manuscript_digest');
  if (!Number.isInteger(input.current_book_state_version) || input.current_book_state_version < 1) fail('INVALID_CURRENT_BOOK_STATE_VERSION');
  if (parentState.book_project.book_project_id !== input.book_project_id) fail('BOOK_PROJECT_IDENTITY_MISMATCH');
  if (parentState.state_version !== input.current_book_state_version || parentState.state_digest !== input.current_book_state_digest) fail('BLOCKED_CURRENT_PARENT_STALE');
  const currentManuscript = currentCanonicalManuscript(parentState, deps);
  if (String(currentManuscript.object_id) !== String(input.current_manuscript_id) || String(currentManuscript.object_version) !== String(input.current_manuscript_version) || currentManuscript.object_digest !== input.current_manuscript_digest) fail('BLOCKED_CURRENT_PARENT_STALE', 'CURRENT_MANUSCRIPT_MISMATCH');
  const baseline = validateRecoveryExecution(input, deps);
  if (baseline.book_project_id && baseline.book_project_id !== input.book_project_id) fail('RECOVERY_BOOK_PROJECT_MISMATCH');
  const accepted = validateAcceptedRecords(input, deps);
  const identities = validateExactRecoveryIdentities(input, accepted);
  const candidate = validateCandidate(input, baseline, accepted);
  validatePriorEdition(input, baseline);
  const author = validateAuthorRatification(input, parentState, currentManuscript, deps, queueLedger);
  const unitEvidence = validateUnitEvidence(input, accepted, identities, deps);
  if (deps.lifecycleCompatibility && typeof deps.lifecycleCompatibility.validateCompatibleLedger === 'function') {
    try { deps.lifecycleCompatibility.validateCompatibleLedger(lifecycleContract, parentState, lifecycleLedger); }
    catch (err) { fail('LIFECYCLE_LEDGER_INVALID', err && err.code ? err.code : 'INVALID'); }
  }
  return buildPrepared(input, options, deps, parentState, baseline, candidate, identities, author, unitEvidence);
}

function validatePrepared(prepared) {
  requireFields(prepared, [
    'admission_operation_id','admission_operation_digest','semantic_projection','content_admission_request',
    'applicability_bindings','expected_successor_manuscript_ref','canonical_effect','lifecycle_transition_authorized',
    'author_decision_authority','publication_authority','export_freeze_authority'
  ], 'prepared_admission');
  assertDigest(prepared.admission_operation_digest, 'admission_operation_digest');
  if (prepared.admission_operation_id !== `${OPERATION_PREFIX}${prepared.admission_operation_digest}`) fail('ADMISSION_OPERATION_ID_MISMATCH');
  if (prepared.admission_operation_digest !== sha256(prepared.semantic_projection)) fail('ADMISSION_OPERATION_DIGEST_MISMATCH');
  if (prepared.canonical_effect !== false || prepared.lifecycle_transition_authorized !== false || prepared.author_decision_authority !== false || prepared.publication_authority !== false || prepared.export_freeze_authority !== false) fail('PREPARED_ADMISSION_AUTHORITY_WIDENING');
  return true;
}

function receiptSemantic(receipt) {
  const copy = clone(receipt);
  delete copy.receipt_id;
  delete copy.receipt_digest;
  return copy;
}

function buildRecoveryAdmissionReceipt(prepared, admissionResult, lifecycleResult) {
  const receipt = stableNormalize({
    receipt_schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_id: '',
    receipt_digest: '',
    event_type: 'BOOK_RECOVERY_ADMISSION_COMMITTED',
    admission_operation_id: prepared.admission_operation_id,
    admission_operation_digest: prepared.admission_operation_digest,
    recovery_baseline_id: prepared.semantic_projection.recovery_baseline_id,
    recovery_baseline_digest: prepared.semantic_projection.recovery_baseline_digest,
    selected_candidate_id: prepared.semantic_projection.selected_candidate_id,
    selected_candidate_content_digest: prepared.semantic_projection.selected_candidate_content_digest,
    source_acceptances: clone(prepared.semantic_projection.source_acceptance_ids_and_digests),
    projection_acceptances: clone(prepared.semantic_projection.projection_ids_and_digests),
    author_decision_id: prepared.semantic_projection.author_decision_id,
    author_resolution_receipt_id: prepared.semantic_projection.author_resolution_receipt_id,
    canonical_admission_receipt: clone(admissionResult.admission_receipt),
    canonical_version_receipt_id: admissionResult.version_receipt && admissionResult.version_receipt.receipt_id,
    admitted_parent_state_version: admissionResult.parent_state.state_version,
    admitted_parent_state_digest: admissionResult.parent_state.state_digest,
    admitted_manuscript_ref: prepared.expected_successor_manuscript_ref,
    lifecycle_rebind_receipt_id: lifecycleResult.receipt.rebind_receipt_id,
    lifecycle_ledger_version: lifecycleResult.lifecycle_ledger.ledger_version,
    lifecycle_status: lifecycleResult.receipt.lifecycle_status,
    unit_evidence: clone(prepared.unit_evidence || []),
    lifecycle_transition_performed: false,
    canonical_admission_performed: true,
    author_decision_synthesized: false,
    publication_authority: false,
    export_freeze_authority: false,
    exact_next_lifecycle_directive: NEXT_LIFECYCLE_DIRECTIVE
  });
  receipt.receipt_digest = sha256(receiptSemantic(receipt));
  receipt.receipt_id = `${RECEIPT_PREFIX}${receipt.receipt_digest}`;
  return stableNormalize(receipt);
}

function validateAdmissionReceiptV1(receipt, prepared) {
  requireFields(receipt, [
    'receipt_schema_version','receipt_id','receipt_digest','event_type','admission_operation_id','admission_operation_digest',
    'admitted_manuscript_ref','lifecycle_transition_performed','canonical_admission_performed','author_decision_synthesized',
    'publication_authority','export_freeze_authority','exact_next_lifecycle_directive'
  ], 'recovery_admission_receipt');
  assertNoRaw(receipt, 'recovery_admission_receipt');
  if (receipt.receipt_schema_version !== RECEIPT_SCHEMA_VERSION || receipt.event_type !== 'BOOK_RECOVERY_ADMISSION_COMMITTED') fail('ADMISSION_RECEIPT_SCHEMA_MISMATCH');
  if (receipt.admission_operation_id !== prepared.admission_operation_id || receipt.admission_operation_digest !== prepared.admission_operation_digest) fail('ADMISSION_RECEIPT_OPERATION_MISMATCH');
  if (receipt.admitted_manuscript_ref !== prepared.expected_successor_manuscript_ref) fail('ADMISSION_RECEIPT_SUCCESSOR_MISMATCH');
  if (receipt.lifecycle_transition_performed !== false || receipt.canonical_admission_performed !== true || receipt.author_decision_synthesized !== false || receipt.publication_authority !== false || receipt.export_freeze_authority !== false) fail('ADMISSION_RECEIPT_AUTHORITY_WIDENING');
  if (receipt.exact_next_lifecycle_directive !== NEXT_LIFECYCLE_DIRECTIVE) fail('ADMISSION_RECEIPT_LIFECYCLE_DIRECTIVE_MISMATCH');
  const expected = sha256(receiptSemantic(receipt));
  if (receipt.receipt_digest !== expected || receipt.receipt_id !== `${RECEIPT_PREFIX}${expected}`) fail('ADMISSION_RECEIPT_DIGEST_MISMATCH');
  return true;
}

function validatePostAdmission(prepared, preParent, admissionResult) {
  if (!isObject(admissionResult) || !isObject(admissionResult.parent_state) || !isObject(admissionResult.version_receipt) || !isObject(admissionResult.admission_receipt)) fail('CANONICAL_ADMISSION_RESULT_INVALID');
  const post = admissionResult.parent_state;
  if (post.state_version !== preParent.state_version + 1) fail('CANONICAL_SUCCESSOR_VERSION_INVALID');
  if (post.book_project.status !== preParent.book_project.status) fail('LIFECYCLE_STATUS_MUTATION_FORBIDDEN');
  if (admissionResult.version_receipt.pre_parent_state_version !== preParent.state_version || admissionResult.version_receipt.pre_parent_state_digest !== preParent.state_digest || admissionResult.version_receipt.post_parent_state_version !== post.state_version || admissionResult.version_receipt.post_parent_state_digest !== post.state_digest) fail('CANONICAL_ADMISSION_RECEIPT_PARENT_MISMATCH');
  if (!post.active || post.active.canonical_manuscript_ref !== prepared.expected_successor_manuscript_ref) fail('ADMITTED_MANUSCRIPT_NOT_ACTIVE');
  const split = prepared.expected_successor_manuscript_ref.lastIndexOf(':');
  const manuscriptId = prepared.expected_successor_manuscript_ref.slice(0, split);
  const versionId = prepared.expected_successor_manuscript_ref.slice(split + 1);
  const manifest = (post.manuscripts || []).find(x => x && String(x.manuscript_id) === manuscriptId && String(x.version_id) === versionId);
  if (!manifest || manifest.authority_state !== 'CANONICAL' || manifest.artifact_digest !== prepared.semantic_projection.selected_candidate_content_digest) fail('ADMITTED_MANUSCRIPT_IDENTITY_MISMATCH');
  return true;
}

function buildRebindRequest(prepared, preParent, admissionResult, lifecycleLedger, deps) {
  if (!isObject(admissionResult.version_receipt)) fail('CANONICAL_VERSION_RECEIPT_REQUIRED');
  return stableNormalize({
    rebind_request_id: `BOOK-RECOVERY-LIFECYCLE-REBIND:${prepared.admission_operation_digest}`,
    idempotency_key: `BOOK-RECOVERY-LIFECYCLE-REBIND:${prepared.admission_operation_digest}`,
    actor_class: 'PARENT_SYSTEM',
    authority_kind: 'CANONICAL_STATE_MUTATION',
    expected_pre_parent_state_version: preParent.state_version,
    expected_pre_parent_state_digest: preParent.state_digest,
    expected_post_parent_state_version: admissionResult.parent_state.state_version,
    expected_post_parent_state_digest: admissionResult.parent_state.state_digest,
    expected_lifecycle_ledger_version: lifecycleLedger.ledger_version,
    expected_lifecycle_ledger_digest: deps.lifecycleCompatibility.digestCompatibleLedger(lifecycleLedger),
    authority_receipt: clone(admissionResult.version_receipt)
  });
}

function committedReplay(prior, prepared) {
  if (!prior.recovery_admission_receipt) fail('BLOCKED_RECONCILIATION', 'MISSING_COMMITTED_RECEIPT');
  validateAdmissionReceiptV1(prior.recovery_admission_receipt, prepared);
  return stableNormalize({
    standing: COMMITTED_STANDING,
    status: 'COMMITTED_VERIFIED',
    disposition: 'REPLAY',
    admission_operation_id: prepared.admission_operation_id,
    admission_operation_digest: prepared.admission_operation_digest,
    recovery_admission_receipt: clone(prior.recovery_admission_receipt),
    canonical_admission_performed: false,
    lifecycle_rebind_performed: false,
    publication_authority: false,
    export_freeze_authority: false
  });
}

function commitRecoveredBaselineAdmissionV1(preparedInput, currentInput, options = {}) {
  const prepared = clone(preparedInput);
  validatePrepared(prepared);
  const prior = options.prior_admission_state || options.durable_state || null;
  if (prior) {
    if (['UNKNOWN','CONTRADICTORY'].includes(prior.status)) fail('BLOCKED_RECONCILIATION', prior.status);
    if (prior.admission_operation_digest && prior.admission_operation_digest !== prepared.admission_operation_digest) fail('BLOCKED_RECONCILIATION', 'PRIOR_OPERATION_MISMATCH');
    if (prior.status === 'COMMITTED_VERIFIED') return committedReplay(prior, prepared);
    if (prior.status === PENDING_STATUS) return reconcileRecoveredBaselineAdmissionV1(prior, options);
  }
  const fresh = prepareRecoveredBaselineAdmissionV1(currentInput, options);
  if (!same(fresh, prepared)) fail('BLOCKED_CURRENT_PARENT_STALE', 'PREPARED_OPERATION_CHANGED');
  const deps = resolveDependencies(options);
  let admissionResult;
  try {
    admissionResult = deps.applicability.commitContentAdmissionWithAuthorDecisionApplicability({
      parentState: options.parent_state,
      versionLedger: options.version_ledger,
      queueLedger: options.queue_ledger,
      request: prepared.content_admission_request,
      applicabilityBindings: prepared.applicability_bindings
    });
  } catch (err) {
    if (err && err.code === 'STALE_PARENT_WRITE') fail('BLOCKED_CURRENT_PARENT_STALE', err.code);
    fail(err && err.code ? err.code : 'CANONICAL_ADMISSION_FAILED', err && err.detail ? err.detail : 'canonical_admission');
  }
  validatePostAdmission(prepared, options.parent_state, admissionResult);
  const rebindRequest = buildRebindRequest(prepared, options.parent_state, admissionResult, options.lifecycle_ledger, deps);
  let lifecycleResult;
  try {
    lifecycleResult = deps.lifecycleRebind.rebindAfterAuthorizedParentSuccessor({
      contract: options.lifecycle_contract,
      preParentState: options.parent_state,
      postParentState: admissionResult.parent_state,
      lifecycleLedger: options.lifecycle_ledger,
      request: rebindRequest
    });
  } catch (err) {
    return stableNormalize({
      standing: RECONCILE_STANDING,
      status: PENDING_STATUS,
      disposition: 'RECONCILE_REQUIRED',
      admission_operation_id: prepared.admission_operation_id,
      admission_operation_digest: prepared.admission_operation_digest,
      prepared_admission: prepared,
      pre_parent_state_version: options.parent_state.state_version,
      pre_parent_state_digest: options.parent_state.state_digest,
      post_parent_state_version: admissionResult.parent_state.state_version,
      post_parent_state_digest: admissionResult.parent_state.state_digest,
      canonical_admission_receipt: clone(admissionResult.admission_receipt),
      canonical_version_receipt: clone(admissionResult.version_receipt),
      lifecycle_rebind_request: rebindRequest,
      lifecycle_ledger_version: options.lifecycle_ledger.ledger_version,
      reconciliation_error_code: err && err.code ? err.code : 'LIFECYCLE_REBIND_UNKNOWN',
      canonical_admission_performed: true,
      lifecycle_transition_performed: false,
      publication_authority: false,
      export_freeze_authority: false
    });
  }
  if (!lifecycleResult || !lifecycleResult.receipt || lifecycleResult.receipt.lifecycle_transition_performed !== false || lifecycleResult.receipt.publication_authorized !== false) fail('LIFECYCLE_REBIND_AUTHORITY_VIOLATION');
  if (!lifecycleResult.parent_state || lifecycleResult.parent_state.state_digest !== admissionResult.parent_state.state_digest || lifecycleResult.parent_state.book_project.status !== options.parent_state.book_project.status) fail('LIFECYCLE_REBIND_PARENT_MISMATCH');
  const recoveryReceipt = buildRecoveryAdmissionReceipt(prepared, admissionResult, lifecycleResult);
  validateAdmissionReceiptV1(recoveryReceipt, prepared);
  return stableNormalize({
    standing: COMMITTED_STANDING,
    status: 'COMMITTED_VERIFIED',
    disposition: admissionResult.disposition === 'REPLAY' || lifecycleResult.disposition === 'REPLAY' ? 'COMMITTED_WITH_VERIFIED_REPLAY_COMPONENT' : 'COMMITTED',
    admission_operation_id: prepared.admission_operation_id,
    admission_operation_digest: prepared.admission_operation_digest,
    prepared_admission: prepared,
    parent_state: admissionResult.parent_state,
    version_ledger: admissionResult.version_ledger,
    lifecycle_ledger: lifecycleResult.lifecycle_ledger,
    canonical_admission_receipt: admissionResult.admission_receipt,
    lifecycle_rebind_receipt: lifecycleResult.receipt,
    recovery_admission_receipt: recoveryReceipt,
    canonical_admission_performed: true,
    lifecycle_transition_performed: false,
    publication_authority: false,
    export_freeze_authority: false
  });
}

function reconcileRecoveredBaselineAdmissionV1(pending, options = {}) {
  if (!isObject(pending) || pending.status !== PENDING_STATUS) fail('BLOCKED_RECONCILIATION', 'STATE_NOT_RECONCILABLE');
  requireFields(pending, [
    'admission_operation_id','admission_operation_digest','prepared_admission','pre_parent_state_version','pre_parent_state_digest',
    'post_parent_state_version','post_parent_state_digest','canonical_admission_receipt','canonical_version_receipt','lifecycle_rebind_request'
  ], 'pending_admission');
  const prepared = pending.prepared_admission;
  validatePrepared(prepared);
  if (pending.admission_operation_id !== prepared.admission_operation_id || pending.admission_operation_digest !== prepared.admission_operation_digest) fail('BLOCKED_RECONCILIATION', 'OPERATION_IDENTITY_MISMATCH');
  const preParent = options.pre_parent_state;
  const postParent = options.post_parent_state;
  const lifecycleLedger = options.lifecycle_ledger;
  const lifecycleContract = options.lifecycle_contract;
  if (!isObject(preParent) || !isObject(postParent) || !isObject(lifecycleLedger) || !lifecycleContract) fail('BLOCKED_RECONCILIATION', 'CURRENT_RECONCILIATION_STATE_REQUIRED');
  if (preParent.state_version !== pending.pre_parent_state_version || preParent.state_digest !== pending.pre_parent_state_digest || postParent.state_version !== pending.post_parent_state_version || postParent.state_digest !== pending.post_parent_state_digest) fail('BLOCKED_RECONCILIATION', 'PARENT_IDENTITY_MISMATCH');
  const admissionResult = {
    parent_state: postParent,
    admission_receipt: clone(pending.canonical_admission_receipt),
    version_receipt: clone(pending.canonical_version_receipt),
    version_ledger: options.version_ledger || null
  };
  validatePostAdmission(prepared, preParent, admissionResult);
  const deps = resolveDependencies(options);
  const expectedRebind = buildRebindRequest(prepared, preParent, admissionResult, lifecycleLedger, deps);
  if (!same(expectedRebind, pending.lifecycle_rebind_request)) fail('BLOCKED_RECONCILIATION', 'LIFECYCLE_REBIND_REQUEST_MISMATCH');
  let lifecycleResult;
  try {
    lifecycleResult = deps.lifecycleRebind.rebindAfterAuthorizedParentSuccessor({
      contract: lifecycleContract,
      preParentState: preParent,
      postParentState: postParent,
      lifecycleLedger,
      request: pending.lifecycle_rebind_request
    });
  } catch (err) {
    fail('BLOCKED_RECONCILIATION', err && err.code ? err.code : 'LIFECYCLE_REBIND_FAILED');
  }
  if (!lifecycleResult || !lifecycleResult.receipt || lifecycleResult.receipt.lifecycle_transition_performed !== false || lifecycleResult.receipt.publication_authorized !== false) fail('BLOCKED_RECONCILIATION', 'LIFECYCLE_REBIND_AUTHORITY_VIOLATION');
  const recoveryReceipt = buildRecoveryAdmissionReceipt(prepared, admissionResult, lifecycleResult);
  validateAdmissionReceiptV1(recoveryReceipt, prepared);
  return stableNormalize({
    standing: COMMITTED_STANDING,
    status: 'COMMITTED_VERIFIED',
    disposition: 'RECONCILED_LIFECYCLE_ONLY',
    admission_operation_id: prepared.admission_operation_id,
    admission_operation_digest: prepared.admission_operation_digest,
    parent_state: postParent,
    lifecycle_ledger: lifecycleResult.lifecycle_ledger,
    lifecycle_rebind_receipt: lifecycleResult.receipt,
    recovery_admission_receipt: recoveryReceipt,
    canonical_admission_performed: false,
    lifecycle_transition_performed: false,
    publication_authority: false,
    export_freeze_authority: false
  });
}

function assertEvidenceClaimBoundariesV1(claim = {}) {
  assertNoRaw(claim, 'evidence_claim');
  if (claim.native_provider_fidelity === true || claim.native_provider_fidelity_claimed === true || claim.real_book_fidelity === true || claim.private_source_standing === true || claim.production_standing === true || claim.a01_standing === true) fail('SYNTHETIC_EVIDENCE_CLAIM_FORBIDDEN');
  if (claim.historical_pass_transferred === true) fail('HISTORICAL_PASS_TRANSFER_FORBIDDEN');
  if (claim.author_ratification_synthesized === true || claim.publication_authority === true || claim.export_freeze_authority === true) fail('AUTHORITY_WIDENING_FORBIDDEN');
  if (claim.parallel_scheduler_created === true || claim.second_scheduler_or_retry_authority_requested === true || claim.b01_registry_modified === true || claim.b01_registry_mutation_requested === true) fail('B02_DESIGN_COMPATIBILITY_VIOLATION');
  return true;
}

module.exports = {
  SCHEMA_VERSION,
  RECEIPT_SCHEMA_VERSION,
  ADAPTER_ID,
  RECOVERY_STANDING,
  RECONCILE_STANDING,
  COMMITTED_STANDING,
  PENDING_STATUS,
  NEXT_LIFECYCLE_DIRECTIVE,
  RATIFICATION_DECISION_TYPE,
  BookRecoveredBaselineAdmissionV1Error,
  stableStringify,
  sha256,
  baselineDigest,
  prepareRecoveredBaselineAdmissionV1,
  validatePrepared,
  commitRecoveredBaselineAdmissionV1,
  reconcileRecoveredBaselineAdmissionV1,
  validateAdmissionReceiptV1,
  assertEvidenceClaimBoundariesV1
};
