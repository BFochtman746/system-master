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
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (obj(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = normalize(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(normalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(typeof v === 'string' ? v : stableStringify(v), 'utf8').digest('hex'); }
function same(a, b) { return stableStringify(a) === stableStringify(b); }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const field of fields) if (!Object.prototype.hasOwnProperty.call(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function ref(v, label) { if (!text(String(v === undefined || v === null ? '' : v))) fail('REFERENCE_REQUIRED', label); }
function digest(v, label) { if (!SHA256.test(String(v || ''))) fail('INVALID_SHA256', label); }
function assertNoRaw(v, where = 'input') {
  if (Array.isArray(v)) return v.forEach((item, i) => assertNoRaw(item, `${where}.${i}`));
  if (!obj(v)) return;
  for (const [key, child] of Object.entries(v)) {
    if (RAW_FIELDS.has(key)) fail('RAW_CONTENT_FORBIDDEN', `${where}.${key}`);
    assertNoRaw(child, `${where}.${key}`);
  }
}

function deps(options = {}) {
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

function baselineDigest(baseline, options = {}) {
  const copy = clone(baseline);
  delete copy.recovered_book_baseline_id;
  delete copy.baseline_digest;
  const engine = options.engine || options.recoveryEngine || options.recovery_engine;
  return engine && typeof engine.digest === 'function' ? engine.digest(copy) : sha256(copy);
}

function validateBaseline(baseline, d) {
  req(baseline, [
    'recovered_book_baseline_id','baseline_digest','standing','reentry_mode','source_manifest',
    'candidate_revision_graph','unresolved_findings','canonical_book_mutation_performed','lifecycle_join_authorized'
  ], 'recovery_baseline');
  digest(baseline.baseline_digest, 'recovery_baseline.baseline_digest');
  const expected = baselineDigest(baseline, d);
  if (baseline.baseline_digest !== expected) fail('RECOVERY_BASELINE_DIGEST_MISMATCH');
  if (baseline.recovered_book_baseline_id !== `RBB-${expected.slice(0,24)}`) fail('RECOVERY_BASELINE_ID_MISMATCH');
  if (baseline.standing !== RECOVERY_STANDING) fail('RECOVERY_BASELINE_STANDING_INVALID');
  if (baseline.canonical_book_mutation_performed !== false || baseline.lifecycle_join_authorized !== false) fail('RECOVERY_OUTPUT_AUTHORITY_VIOLATION');
  if (!Array.isArray(baseline.source_manifest) || baseline.source_manifest.length === 0) fail('RECOVERY_SOURCE_MANIFEST_REQUIRED');
  if (!obj(baseline.candidate_revision_graph) || !Array.isArray(baseline.candidate_revision_graph.nodes)) fail('RECOVERY_CANDIDATE_GRAPH_REQUIRED');
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
    req(item, [idField,digestField], `${kind.toLowerCase()}.${i}`);
    ref(item[idField], `${kind.toLowerCase()}.${i}.${idField}`);
    digest(item[digestField], `${kind.toLowerCase()}.${i}.${digestField}`);
    if (seen.has(item[idField])) fail(`DUPLICATE_${kind}_IDENTITY`, item[idField]);
    seen.add(item[idField]);
    return { [idField]: item[idField], [digestField]: item[digestField] };
  }).sort((a,b) => a[idField].localeCompare(b[idField]));
}

function normalizeSubjectRefs(items) {
  if (!Array.isArray(items) || items.length === 0) fail('AUTHOR_DECISION_SUBJECT_REFS_REQUIRED');
  const seen = new Set();
  return items.map((item, i) => {
    req(item, ['object_id','object_version','object_digest'], `subject_identity_refs.${i}`);
    ref(String(item.object_id), `subject_identity_refs.${i}.object_id`);
    ref(String(item.object_version), `subject_identity_refs.${i}.object_version`);
    digest(item.object_digest, `subject_identity_refs.${i}.object_digest`);
    const out = { object_id: String(item.object_id), object_version: String(item.object_version), object_digest: item.object_digest };
    const key = stableStringify(out);
    if (seen.has(key)) fail('DUPLICATE_AUTHOR_DECISION_SUBJECT_REF', key);
    seen.add(key);
    return out;
  }).sort((a,b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function currentManuscript(parent, d) {
  if (d.versioning && typeof d.versioning.validateParentState === 'function') d.versioning.validateParentState(parent);
  if (!obj(parent) || !obj(parent.active)) fail('CURRENT_PARENT_REQUIRED');
  const activeRef = parent.active.canonical_manuscript_ref;
  ref(activeRef, 'parent_state.active.canonical_manuscript_ref');
  if (!d.versioning || typeof d.versioning.objectRecords !== 'function') fail('VERSIONING_OBJECT_RECORDS_REQUIRED');
  const matches = d.versioning.objectRecords(parent).filter(r => r && r.type === 'MANUSCRIPT_MANIFEST' && (activeRef === r.object_id || activeRef === `${r.object_id}:${r.object_version}`));
  if (matches.length !== 1) fail('CURRENT_MANUSCRIPT_IDENTITY_AMBIGUOUS', String(matches.length));
  if (matches[0].payload && matches[0].payload.authority_state !== 'CANONICAL') fail('CURRENT_MANUSCRIPT_NOT_CANONICAL');
  return matches[0];
}

function validateRecovery(input, d) {
  req(input.recovery_execution, ['binding','operation_identity','recovery_evidence_receipt','recovery_result'], 'recovery_execution');
  try {
    d.recovery.validateRecoveryEvidenceReceiptV1(input.recovery_execution.recovery_evidence_receipt, input.recovery_execution.operation_identity, input.recovery_execution.binding);
  } catch (err) {
    fail('RECOVERY_EVIDENCE_INVALID', err && err.code ? err.code : 'INVALID');
  }
  const baseline = input.recovery_execution.recovery_result && input.recovery_execution.recovery_result.recovered_book_baseline;
  if (!obj(baseline)) fail('RECOVERY_RESULT_REQUIRED');
  const evidence = input.recovery_execution.recovery_evidence_receipt;
  if (evidence.result_baseline_id !== undefined && evidence.result_baseline_id !== baseline.recovered_book_baseline_id) fail('RECOVERY_EVIDENCE_BASELINE_MISMATCH');
  if (evidence.result_baseline_digest !== baseline.baseline_digest) fail('RECOVERY_EVIDENCE_BASELINE_MISMATCH');
  validateBaseline(baseline, d);
  return baseline;
}

function validateAccepted(input, d) {
  if (!Array.isArray(input.source_acceptances) || !input.source_acceptances.length || !Array.isArray(input.projection_acceptances) || !input.projection_acceptances.length) fail('ACCEPTED_SOURCE_AND_PROJECTION_RECORDS_REQUIRED');
  const sourceById = new Map();
  for (const source of input.source_acceptances) {
    try { d.acceptance.validateSourceCustodyAcceptanceV1(source); } catch (err) { fail('SOURCE_ACCEPTANCE_INVALID', err && err.code ? err.code : 'INVALID'); }
    if (sourceById.has(source.source_acceptance_id)) fail('DUPLICATE_SOURCE_ACCEPTANCE_RECORD', source.source_acceptance_id);
    sourceById.set(source.source_acceptance_id, source);
  }
  const projectionById = new Map();
  const projectionBySource = new Map();
  for (const projection of input.projection_acceptances) {
    const source = sourceById.get(projection.source_acceptance_id);
    if (!source) fail('PROJECTION_SOURCE_ACCEPTANCE_NOT_IN_REQUEST', String(projection.source_acceptance_id));
    try { d.acceptance.validateNormalizedSourceProjectionV1(projection, source); } catch (err) { fail('PROJECTION_ACCEPTANCE_INVALID', err && err.code ? err.code : 'INVALID'); }
    if (projectionById.has(projection.projection_id)) fail('DUPLICATE_PROJECTION_ACCEPTANCE_RECORD', projection.projection_id);
    if (projectionBySource.has(source.source_acceptance_id)) fail('MULTIPLE_PROJECTIONS_FOR_SOURCE', source.source_acceptance_id);
    projectionById.set(projection.projection_id, projection);
    projectionBySource.set(source.source_acceptance_id, projection);
  }
  if (projectionBySource.size !== sourceById.size) fail('PROJECTION_REQUIRED_FOR_ACCEPTED_SOURCE');
  if (input.source_reresolutions != null) {
    if (!Array.isArray(input.source_reresolutions)) fail('SOURCE_RERESOLUTIONS_ARRAY_REQUIRED');
    for (const item of input.source_reresolutions) {
      req(item, ['source_acceptance_id','observation'], 'source_reresolution');
      const source = sourceById.get(item.source_acceptance_id);
      if (!source) fail('SOURCE_RERESOLUTION_ACCEPTANCE_NOT_IN_REQUEST', item.source_acceptance_id);
      try { d.acceptance.validateSourceReresolutionV1(source, item.observation); } catch (err) { fail('BLOCKED_SOURCE_STALE', err && err.code ? err.code : 'STALE'); }
    }
  }
  return { sourceById, projectionById, projectionBySource };
}

function exactIdentities(input, accepted) {
  const declaredSources = normalizeIdentityRefs(input.source_acceptance_ids_and_digests, 'SOURCE_ACCEPTANCE');
  const declaredProjections = normalizeIdentityRefs(input.projection_ids_and_digests, 'PROJECTION_ACCEPTANCE');
  const evidence = input.recovery_execution.recovery_evidence_receipt;
  const evidenceSources = normalizeIdentityRefs(evidence.source_acceptances, 'SOURCE_ACCEPTANCE');
  const evidenceProjections = normalizeIdentityRefs(evidence.projection_acceptances, 'PROJECTION_ACCEPTANCE');
  const recordSources = normalizeIdentityRefs([...accepted.sourceById.values()].map(x => ({source_acceptance_id:x.source_acceptance_id,source_acceptance_digest:x.source_acceptance_digest})), 'SOURCE_ACCEPTANCE');
  const recordProjections = normalizeIdentityRefs([...accepted.projectionById.values()].map(x => ({projection_id:x.projection_id,projection_digest:x.projection_digest})), 'PROJECTION_ACCEPTANCE');
  if (!same(declaredSources,evidenceSources)) fail('RECOVERY_SOURCE_IDENTITY_MISMATCH');
  if (!same(declaredProjections,evidenceProjections)) fail('RECOVERY_PROJECTION_IDENTITY_MISMATCH');
  if (!same(declaredSources,recordSources) || !same(declaredProjections,recordProjections)) fail('ACCEPTANCE_RECORD_IDENTITY_MISMATCH');
  return { sources: declaredSources, projections: declaredProjections };
}

function candidate(input, baseline, accepted) {
  ref(input.selected_candidate_id, 'selected_candidate_id');
  digest(input.selected_candidate_content_digest, 'selected_candidate_content_digest');
  const graph = baseline.candidate_revision_graph;
  const matches = graph.nodes.filter(x => x && x.candidate_id === input.selected_candidate_id);
  if (matches.length !== 1) fail('RECOVERY_SELECTED_CANDIDATE_CARDINALITY_INVALID', String(matches.length));
  const out = matches[0];
  if (out.content_digest !== input.selected_candidate_content_digest) fail('RECOVERY_SELECTED_CANDIDATE_DIGEST_MISMATCH');
  if (graph.proposed_selected_candidate_id !== input.selected_candidate_id) fail('RECOVERY_SELECTED_CANDIDATE_NOT_GOVERNED_GRAPH_SELECTION');
  ref(out.source_ref, 'selected_candidate.source_ref');
  const manifestMatches = baseline.source_manifest.filter(x => x && x.source_ref === out.source_ref);
  if (manifestMatches.length !== 1) fail('RECOVERY_CANDIDATE_PROVENANCE_INCOMPLETE', String(manifestMatches.length));
  const manifest = manifestMatches[0];
  if (![...accepted.sourceById.values()].some(x => String(x.source_id) === String(manifest.source_id) && x.source_digest_sha256 === manifest.source_digest)) fail('RECOVERY_CANDIDATE_PROVENANCE_INCOMPLETE', 'SOURCE_MANIFEST_NOT_ACCEPTED');
  return clone(out);
}

function authorRatification(input, parent, manuscript, d, queueLedger) {
  ref(input.author_decision_id, 'author_decision_id');
  ref(input.author_resolution_receipt_id, 'author_resolution_receipt_id');
  digest(input.author_resolution_receipt_digest, 'author_resolution_receipt_digest');
  if (!queueLedger) fail('AUTHOR_DECISION_QUEUE_EVIDENCE_REQUIRED');
  if (d.authorQueue && typeof d.authorQueue.validateQueueLedger === 'function') {
    try { d.authorQueue.validateQueueLedger(queueLedger, parent); } catch (err) { fail('AUTHOR_DECISION_QUEUE_INVALID', err && err.code ? err.code : 'INVALID'); }
  }
  const decision = (parent.author_decisions || []).find(x => x && x.decision_id === input.author_decision_id);
  if (!decision || decision.status !== 'APPROVED' || !AFFIRMATIVE.has(decision.author_choice)) fail('BLOCKED_AUTHOR_DECISION', 'DECISION_NOT_APPROVED');
  if (decision.decision_type !== RATIFICATION_DECISION_TYPE) fail('BLOCKED_AUTHOR_DECISION', 'WRONG_DECISION_TYPE');
  const receipt = queueLedger.resolution_receipts && queueLedger.resolution_receipts[input.author_resolution_receipt_id];
  if (!receipt) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_MISSING');
  const rd = d.authorQueue && typeof d.authorQueue.digest === 'function' ? d.authorQueue.digest(receipt) : sha256(receipt);
  if (rd !== input.author_resolution_receipt_digest) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_DIGEST_MISMATCH');
  if (receipt.decision_id !== input.author_decision_id || (receipt.decision_type !== undefined && receipt.decision_type !== RATIFICATION_DECISION_TYPE) || receipt.canonical_decision_status !== decision.status) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_DECISION_MISMATCH');

  const refs = normalizeSubjectRefs(receipt.subject_identity_refs || []);
  const manuscriptRef = { object_id:String(manuscript.object_id), object_version:String(manuscript.object_version), object_digest:manuscript.object_digest };
  if (!refs.some(x => same(x, manuscriptRef))) fail('BLOCKED_AUTHOR_DECISION', 'CURRENT_MANUSCRIPT_SUBJECT_NOT_BOUND');

  const hasTransitionIdentity = Number.isInteger(receipt.pre_parent_state_version) && Number.isInteger(receipt.post_parent_state_version) && text(receipt.pre_parent_state_digest) && text(receipt.post_parent_state_digest);
  let projectRef;
  if (hasTransitionIdentity) {
    if (receipt.post_parent_state_version !== parent.state_version || receipt.post_parent_state_digest !== parent.state_digest) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_POST_PARENT_NOT_CURRENT');
    if (receipt.post_parent_state_version !== receipt.pre_parent_state_version + 1) fail('BLOCKED_AUTHOR_DECISION', 'RESOLUTION_RECEIPT_PARENT_VERSION_DELTA_INVALID');
    projectRef = { object_id:String(parent.book_project.book_project_id), object_version:`STATE-${receipt.pre_parent_state_version}`, object_digest:d.versioning.digest(parent.book_project) };
  } else {
    projectRef = { object_id:String(parent.book_project.book_project_id), object_version:`STATE-${parent.state_version}`, object_digest:d.versioning.digest(parent.book_project) };
  }
  if (!refs.some(x => same(x, projectRef))) fail('BLOCKED_AUTHOR_DECISION', 'CURRENT_BOOK_PROJECT_SUBJECT_NOT_BOUND');

  const strictRefs = refs.filter(x => !same(x, projectRef));
  try { d.currentSubject.assertStrictSubjectCurrent(parent, strictRefs); }
  catch (err) { fail('BLOCKED_AUTHOR_DECISION', err && err.code ? err.code : 'AUTHOR_DECISION_SUBJECT_NOT_CURRENT'); }

  return { decision:clone(decision), receipt:clone(receipt), subjectRefs:refs, projectRef, strictSubjectRefs:strictRefs };
}

function validatePriorEdition(input, baseline) {
  if (baseline.reentry_mode === 'NEW_EDITION') {
    req(input.prior_edition_ref, ['edition_id','edition_digest'], 'prior_edition_ref');
    ref(input.prior_edition_ref.edition_id, 'prior_edition_ref.edition_id');
    digest(input.prior_edition_ref.edition_digest, 'prior_edition_ref.edition_digest');
    const lineage = baseline.edition_lineage;
    if (!obj(lineage) || lineage.relationship !== 'NEW_EDITION_OF' || lineage.history_rewrite_permitted !== false || !same(lineage.prior_edition_ref,input.prior_edition_ref)) fail('NEW_EDITION_PRIOR_IDENTITY_MISMATCH');
  } else if (input.prior_edition_ref != null) fail('PRIOR_EDITION_REF_NOT_ALLOWED_FOR_RECOVER_EXISTING');
}

function unitEvidence(input, accepted, identities, d) {
  const requested = Array.isArray(input.requested_unit_ids) ? input.requested_unit_ids : [];
  if (!requested.length) return [];
  if (requested.some(x => !text(x)) || new Set(requested).size !== requested.length) fail('BLOCKED_PER_UNIT_EVIDENCE', 'INVALID_UNIT_IDS');
  const evidence = [];
  for (const projection of accepted.projectionById.values()) {
    const available = new Set((projection.unit_evidence || []).map(x => x && x.unit_id).filter(text));
    const wanted = requested.filter(id => available.has(id));
    if (!wanted.length) continue;
    const source = accepted.sourceById.get(projection.source_acceptance_id);
    try { evidence.push(...d.acceptance.assertUnitAdmissionEvidenceV1(projection, source, wanted).unit_evidence); }
    catch (err) { fail('BLOCKED_PER_UNIT_EVIDENCE', err && (err.detail || err.code) ? (err.detail || err.code) : 'INVALID'); }
  }
  const found = new Set(evidence.map(x => x.unit_id));
  for (const id of requested) if (!found.has(id)) fail('BLOCKED_PER_UNIT_EVIDENCE', id);
  for (const item of evidence) {
    if (!identities.sources.some(x => x.source_acceptance_digest === item.source_acceptance_digest)) fail('BLOCKED_PER_UNIT_EVIDENCE', `SOURCE:${item.unit_id}`);
    if (!identities.projections.some(x => x.projection_digest === item.projection_digest)) fail('BLOCKED_PER_UNIT_EVIDENCE', `PROJECTION:${item.unit_id}`);
  }
  return evidence.sort((a,b) => a.unit_id.localeCompare(b.unit_id));
}

function semanticProjection(input, baseline, selected, identities, author, units) {
  return normalize({
    admission_schema_version: SCHEMA_VERSION,
    book_project_id: input.book_project_id,
    current_book_state_version: input.current_book_state_version,
    current_book_state_digest: input.current_book_state_digest,
    current_manuscript_id: input.current_manuscript_id,
    current_manuscript_version: String(input.current_manuscript_version),
    current_manuscript_digest: input.current_manuscript_digest,
    recovery_baseline_id: baseline.recovered_book_baseline_id,
    recovery_baseline_digest: baseline.baseline_digest,
    selected_candidate_id: selected.candidate_id,
    selected_candidate_content_digest: selected.content_digest,
    source_acceptance_ids_and_digests: identities.sources,
    projection_ids_and_digests: identities.projections,
    author_decision_id: input.author_decision_id,
    author_resolution_receipt_id: input.author_resolution_receipt_id,
    author_resolution_receipt_digest: input.author_resolution_receipt_digest,
    author_subject_identity_refs: author.subjectRefs,
    author_project_subject_identity_ref: author.projectRef,
    prior_edition_ref: baseline.reentry_mode === 'NEW_EDITION' ? clone(input.prior_edition_ref) : null,
    unit_evidence: clone(units)
  });
}

function buildPrepared(input, parent, baseline, selected, identities, author, units, d) {
  const sem = semanticProjection(input, baseline, selected, identities, author, units);
  const operationDigest = sha256(sem);
  const operationId = `${OPERATION_PREFIX}${operationDigest}`;
  const versionId = `RECOVERED-${operationDigest.slice(0,20).toUpperCase()}`;
  const successorRef = `${input.current_manuscript_id}:${versionId}`;
  const createdAt = text(author.receipt.resolved_at) ? author.receipt.resolved_at : `SEMANTIC:${operationDigest}`;
  const register = {
    operation_type:'REGISTER_CONTENT_OBJECT_VERSION', object_type:'MANUSCRIPT_MANIFEST',
    object_id:input.current_manuscript_id, version_id:versionId, content_digest_sha256:selected.content_digest,
    parent_version_ref:`${input.current_manuscript_id}:${String(input.current_manuscript_version)}`,
    provenance_ref:operationId, source_subject_sha:baseline.baseline_digest, source_current:true,
    created_by:ADAPTER_ID, created_at:createdAt, requires_author_decision:true,
    payload:{
      manuscript_id:input.current_manuscript_id, version_id:versionId, artifact_digest:selected.content_digest,
      authority_state:'CANONICAL', recovery_baseline_id:baseline.recovered_book_baseline_id,
      recovery_baseline_digest:baseline.baseline_digest, selected_candidate_id:selected.candidate_id,
      recovery_admission_operation_id:operationId, recovery_admission_operation_digest:operationDigest,
      source_acceptances:clone(identities.sources), projection_acceptances:clone(identities.projections),
      prior_edition_ref:baseline.reentry_mode === 'NEW_EDITION' ? clone(input.prior_edition_ref) : null,
      history_rewrite_permitted:false
    }
  };
  const setActive = { operation_type:'SET_ACTIVE_CONTENT_OBJECT_VERSION', object_type:'MANUSCRIPT_MANIFEST', object_ref:successorRef };
  const request = normalize({
    mutation_id:operationId, actor_class:'PARENT_SYSTEM', expected_state_version:parent.state_version,
    expected_state_digest:parent.state_digest, operations:[register,setActive],
    evidence_refs:[input.recovery_execution.recovery_evidence_receipt.evidence_id, baseline.recovered_book_baseline_id, input.author_resolution_receipt_id,
      ...identities.sources.map(x=>x.source_acceptance_id), ...identities.projections.map(x=>x.projection_id)].filter(text).sort(),
    author_decision_refs:[input.author_decision_id]
  });
  const fp = d.authorQueue && typeof d.authorQueue.digest === 'function' ? d.authorQueue.digest(register) : sha256(register);
  return normalize({
    admission_operation_id:operationId, admission_operation_digest:operationDigest, semantic_projection:sem,
    recovery_baseline:clone(baseline), selected_candidate:clone(selected), content_admission_request:request,
    applicability_bindings:[{ operation_index:0, operation_fingerprint:fp, author_decision_ref:input.author_decision_id,
      resolution_receipt_id:input.author_resolution_receipt_id, required_subject_identity_refs:clone(author.subjectRefs) }],
    expected_successor_manuscript_ref:successorRef, unit_evidence:clone(units), canonical_effect:false,
    lifecycle_transition_authorized:false, author_decision_authority:false, publication_authority:false, export_freeze_authority:false
  });
}

function prepareRecoveredBaselineAdmissionV1(input, options = {}) {
  req(input, [
    'book_project_id','current_book_state_version','current_book_state_digest','current_manuscript_id','current_manuscript_version','current_manuscript_digest',
    'recovery_execution','selected_candidate_id','selected_candidate_content_digest','source_acceptance_ids_and_digests','projection_ids_and_digests',
    'source_acceptances','projection_acceptances','author_decision_id','author_resolution_receipt_id','author_resolution_receipt_digest'
  ], 'input');
  assertNoRaw(input);
  assertEvidenceClaimBoundariesV1(input);
  const d = deps(options);
  const parent = options.parent_state;
  if (!obj(parent) || !obj(options.version_ledger) || !obj(options.queue_ledger) || !obj(options.lifecycle_ledger)) fail('CURRENT_CANONICAL_STATE_REQUIRED');
  if (!options.lifecycle_contract || options.lifecycle_contract.engine_id !== 'BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001') fail('LIFECYCLE_CONTRACT_REQUIRED');
  if (parent.book_project.book_project_id !== input.book_project_id) fail('BOOK_PROJECT_IDENTITY_MISMATCH');
  if (parent.state_version !== input.current_book_state_version || parent.state_digest !== input.current_book_state_digest) fail('BLOCKED_CURRENT_PARENT_STALE');
  const manuscript = currentManuscript(parent, d);
  if (String(manuscript.object_id)!==String(input.current_manuscript_id) || String(manuscript.object_version)!==String(input.current_manuscript_version) || manuscript.object_digest!==input.current_manuscript_digest) fail('BLOCKED_CURRENT_PARENT_STALE','CURRENT_MANUSCRIPT_MISMATCH');
  const baseline = validateRecovery(input,d);
  if (baseline.book_project_id && baseline.book_project_id !== input.book_project_id) fail('RECOVERY_BOOK_PROJECT_MISMATCH');
  const accepted = validateAccepted(input,d);
  const identities = exactIdentities(input,accepted);
  const selected = candidate(input,baseline,accepted);
  validatePriorEdition(input,baseline);
  const author = authorRatification(input,parent,manuscript,d,options.queue_ledger);
  const units = unitEvidence(input,accepted,identities,d);
  if (d.lifecycleCompatibility && typeof d.lifecycleCompatibility.validateCompatibleLedger === 'function') {
    try { d.lifecycleCompatibility.validateCompatibleLedger(options.lifecycle_contract,parent,options.lifecycle_ledger); }
    catch (err) { fail('LIFECYCLE_LEDGER_INVALID', err && err.code ? err.code : 'INVALID'); }
  }
  return buildPrepared(input,parent,baseline,selected,identities,author,units,d);
}

function validatePrepared(prepared) {
  req(prepared, ['admission_operation_id','admission_operation_digest','semantic_projection','content_admission_request','applicability_bindings','expected_successor_manuscript_ref','canonical_effect','lifecycle_transition_authorized','author_decision_authority','publication_authority','export_freeze_authority'], 'prepared_admission');
  digest(prepared.admission_operation_digest,'admission_operation_digest');
  if (prepared.admission_operation_id !== `${OPERATION_PREFIX}${prepared.admission_operation_digest}`) fail('ADMISSION_OPERATION_ID_MISMATCH');
  if (prepared.admission_operation_digest !== sha256(prepared.semantic_projection)) fail('ADMISSION_OPERATION_DIGEST_MISMATCH');
  if (prepared.canonical_effect !== false || prepared.lifecycle_transition_authorized !== false || prepared.author_decision_authority !== false || prepared.publication_authority !== false || prepared.export_freeze_authority !== false) fail('PREPARED_ADMISSION_AUTHORITY_WIDENING');
  return true;
}

function receiptSemantic(receipt) {
  const copy = clone(receipt); delete copy.receipt_id; delete copy.receipt_digest; return copy;
}
function buildReceipt(prepared, admissionResult, lifecycleResult) {
  const receipt = normalize({
    receipt_schema_version:RECEIPT_SCHEMA_VERSION, receipt_id:'', receipt_digest:'', event_type:'BOOK_RECOVERY_ADMISSION_COMMITTED',
    admission_operation_id:prepared.admission_operation_id, admission_operation_digest:prepared.admission_operation_digest,
    recovery_baseline_id:prepared.semantic_projection.recovery_baseline_id, recovery_baseline_digest:prepared.semantic_projection.recovery_baseline_digest,
    selected_candidate_id:prepared.semantic_projection.selected_candidate_id, selected_candidate_content_digest:prepared.semantic_projection.selected_candidate_content_digest,
    source_acceptances:clone(prepared.semantic_projection.source_acceptance_ids_and_digests), projection_acceptances:clone(prepared.semantic_projection.projection_ids_and_digests),
    author_decision_id:prepared.semantic_projection.author_decision_id, author_resolution_receipt_id:prepared.semantic_projection.author_resolution_receipt_id,
    canonical_admission_receipt:clone(admissionResult.admission_receipt), canonical_version_receipt_id:admissionResult.version_receipt && admissionResult.version_receipt.receipt_id,
    admitted_parent_state_version:admissionResult.parent_state.state_version, admitted_parent_state_digest:admissionResult.parent_state.state_digest,
    admitted_manuscript_ref:prepared.expected_successor_manuscript_ref, lifecycle_rebind_receipt_id:lifecycleResult.receipt.rebind_receipt_id,
    lifecycle_ledger_version:lifecycleResult.lifecycle_ledger.ledger_version, lifecycle_status:lifecycleResult.receipt.lifecycle_status,
    unit_evidence:clone(prepared.unit_evidence || []), lifecycle_transition_performed:false, canonical_admission_performed:true,
    author_decision_synthesized:false, publication_authority:false, export_freeze_authority:false,
    exact_next_lifecycle_directive:NEXT_LIFECYCLE_DIRECTIVE
  });
  receipt.receipt_digest = sha256(receiptSemantic(receipt));
  receipt.receipt_id = `${RECEIPT_PREFIX}${receipt.receipt_digest}`;
  return normalize(receipt);
}
function validateAdmissionReceiptV1(receipt, prepared) {
  req(receipt, ['receipt_schema_version','receipt_id','receipt_digest','event_type','admission_operation_id','admission_operation_digest','admitted_manuscript_ref','lifecycle_transition_performed','canonical_admission_performed','author_decision_synthesized','publication_authority','export_freeze_authority','exact_next_lifecycle_directive'], 'recovery_admission_receipt');
  assertNoRaw(receipt,'recovery_admission_receipt');
  if (receipt.receipt_schema_version!==RECEIPT_SCHEMA_VERSION || receipt.event_type!=='BOOK_RECOVERY_ADMISSION_COMMITTED') fail('ADMISSION_RECEIPT_SCHEMA_MISMATCH');
  if (receipt.admission_operation_id!==prepared.admission_operation_id || receipt.admission_operation_digest!==prepared.admission_operation_digest) fail('ADMISSION_RECEIPT_OPERATION_MISMATCH');
  if (receipt.admitted_manuscript_ref!==prepared.expected_successor_manuscript_ref) fail('ADMISSION_RECEIPT_SUCCESSOR_MISMATCH');
  if (receipt.lifecycle_transition_performed!==false || receipt.canonical_admission_performed!==true || receipt.author_decision_synthesized!==false || receipt.publication_authority!==false || receipt.export_freeze_authority!==false) fail('ADMISSION_RECEIPT_AUTHORITY_WIDENING');
  if (receipt.exact_next_lifecycle_directive!==NEXT_LIFECYCLE_DIRECTIVE) fail('ADMISSION_RECEIPT_LIFECYCLE_DIRECTIVE_MISMATCH');
  const expected=sha256(receiptSemantic(receipt));
  if (receipt.receipt_digest!==expected || receipt.receipt_id!==`${RECEIPT_PREFIX}${expected}`) fail('ADMISSION_RECEIPT_DIGEST_MISMATCH');
  return true;
}

function validatePost(prepared, pre, out) {
  if (!obj(out) || !obj(out.parent_state) || !obj(out.version_receipt) || !obj(out.admission_receipt)) fail('CANONICAL_ADMISSION_RESULT_INVALID');
  if (out.parent_state.state_version !== pre.state_version + 1) fail('CANONICAL_SUCCESSOR_VERSION_INVALID');
  if (out.parent_state.book_project.status !== pre.book_project.status) fail('LIFECYCLE_STATUS_MUTATION_FORBIDDEN');
  if (out.version_receipt.pre_parent_state_version !== pre.state_version || out.version_receipt.pre_parent_state_digest !== pre.state_digest || out.version_receipt.post_parent_state_version !== out.parent_state.state_version || out.version_receipt.post_parent_state_digest !== out.parent_state.state_digest) fail('CANONICAL_ADMISSION_RECEIPT_PARENT_MISMATCH');
  if (!out.parent_state.active || out.parent_state.active.canonical_manuscript_ref !== prepared.expected_successor_manuscript_ref) fail('CANONICAL_ADMISSION_SUCCESSOR_MISMATCH');
  return true;
}

function buildRebind(prepared, pre, admissionResult, lifecycleLedger, d) {
  return normalize({
    rebind_request_id:`BOOK-RECOVERY-LIFECYCLE-REBIND:${prepared.admission_operation_digest}`,
    idempotency_key:`BOOK-RECOVERY-LIFECYCLE-REBIND:${prepared.admission_operation_digest}`,
    actor_class:'PARENT_SYSTEM', authority_kind:'CANONICAL_STATE_MUTATION',
    expected_pre_parent_state_version:pre.state_version, expected_pre_parent_state_digest:pre.state_digest,
    expected_post_parent_state_version:admissionResult.parent_state.state_version, expected_post_parent_state_digest:admissionResult.parent_state.state_digest,
    expected_lifecycle_ledger_version:lifecycleLedger.ledger_version, expected_lifecycle_ledger_digest:d.lifecycleCompatibility.digestCompatibleLedger(lifecycleLedger),
    authority_receipt:clone(admissionResult.version_receipt)
  });
}

function commitRecoveredBaselineAdmissionV1(prepared, input, options = {}) {
  validatePrepared(prepared);
  const d=deps(options);
  const prior=options.prior_admission_state;
  if (prior) {
    if (['UNKNOWN','CONTRADICTORY'].includes(prior.status)) fail('BLOCKED_RECONCILIATION',prior.status);
    if (prior.admission_operation_digest && prior.admission_operation_digest!==prepared.admission_operation_digest) fail('BLOCKED_RECONCILIATION','PRIOR_OPERATION_MISMATCH');
    if (prior.status===COMMITTED_STANDING || prior.status==='COMMITTED_VERIFIED') {
      validateAdmissionReceiptV1(prior.recovery_admission_receipt,prepared);
      return normalize({standing:COMMITTED_STANDING,status:'COMMITTED_VERIFIED',disposition:'REPLAY',admission_operation_id:prepared.admission_operation_id,admission_operation_digest:prepared.admission_operation_digest,recovery_admission_receipt:clone(prior.recovery_admission_receipt),canonical_effect_replayed:false,canonical_admission_performed:false,lifecycle_transition_performed:false,publication_authority:false,export_freeze_authority:false});
    }
    if (prior.status===PENDING_STATUS || prior.status==='ADMISSION_COMMITTED_LIFECYCLE_PENDING') return reconcileRecoveredBaselineAdmissionV1(prior,options);
  }
  const fresh=prepareRecoveredBaselineAdmissionV1(input,options);
  if (fresh.admission_operation_digest!==prepared.admission_operation_digest || !same(fresh.semantic_projection,prepared.semantic_projection)) fail('BLOCKED_CURRENT_PARENT_STALE','PREPARED_OPERATION_CHANGED');
  let admissionResult;
  try {
    admissionResult=d.applicability.commitContentAdmissionWithAuthorDecisionApplicability({parentState:options.parent_state,versionLedger:options.version_ledger,queueLedger:options.queue_ledger,request:fresh.content_admission_request,applicabilityBindings:fresh.applicability_bindings});
  } catch (err) { fail(err && err.code ? err.code : 'CANONICAL_ADMISSION_FAILED', err && err.detail ? err.detail : 'canonical_admission'); }
  validatePost(fresh,options.parent_state,admissionResult);
  const rebindRequest=buildRebind(fresh,options.parent_state,admissionResult,options.lifecycle_ledger,d);
  let lifecycleResult;
  try {
    lifecycleResult=d.lifecycleRebind.rebindAfterAuthorizedParentSuccessor({contract:options.lifecycle_contract,preParentState:options.parent_state,postParentState:admissionResult.parent_state,lifecycleLedger:options.lifecycle_ledger,request:rebindRequest});
  } catch (err) {
    return normalize({
      standing:RECONCILE_STANDING,status:PENDING_STATUS,disposition:'RECONCILE_REQUIRED',
      admission_operation_id:fresh.admission_operation_id,admission_operation_digest:fresh.admission_operation_digest,
      prepared_admission:fresh,pre_parent_state_version:options.parent_state.state_version,pre_parent_state_digest:options.parent_state.state_digest,
      post_parent_state_version:admissionResult.parent_state.state_version,post_parent_state_digest:admissionResult.parent_state.state_digest,
      canonical_admission_receipt:clone(admissionResult.admission_receipt),canonical_version_receipt:clone(admissionResult.version_receipt),
      canonical_admission_result:clone(admissionResult),lifecycle_rebind_request:rebindRequest,lifecycle_ledger_version:options.lifecycle_ledger.ledger_version,
      reconciliation_error_code:err && err.code ? err.code : 'LIFECYCLE_REBIND_UNKNOWN',canonical_admission_performed:true,lifecycle_transition_performed:false,publication_authority:false,export_freeze_authority:false
    });
  }
  if (!lifecycleResult || !lifecycleResult.receipt || lifecycleResult.receipt.lifecycle_transition_performed!==false || lifecycleResult.receipt.publication_authorized!==false) fail('LIFECYCLE_REBIND_AUTHORITY_VIOLATION');
  if (!lifecycleResult.parent_state || lifecycleResult.parent_state.state_digest!==admissionResult.parent_state.state_digest || lifecycleResult.parent_state.book_project.status!==options.parent_state.book_project.status) fail('LIFECYCLE_REBIND_PARENT_MISMATCH');
  const recoveryReceipt=buildReceipt(fresh,admissionResult,lifecycleResult);
  validateAdmissionReceiptV1(recoveryReceipt,fresh);
  return normalize({standing:COMMITTED_STANDING,status:'COMMITTED_VERIFIED',disposition:admissionResult.disposition==='REPLAY'||lifecycleResult.disposition==='REPLAY'?'COMMITTED_WITH_VERIFIED_REPLAY_COMPONENT':'COMMITTED',admission_operation_id:fresh.admission_operation_id,admission_operation_digest:fresh.admission_operation_digest,prepared_admission:fresh,parent_state:admissionResult.parent_state,version_ledger:admissionResult.version_ledger,lifecycle_ledger:lifecycleResult.lifecycle_ledger,canonical_admission_receipt:admissionResult.admission_receipt,lifecycle_rebind_receipt:lifecycleResult.receipt,recovery_admission_receipt:recoveryReceipt,canonical_admission_performed:true,lifecycle_transition_performed:false,publication_authority:false,export_freeze_authority:false});
}

function reconcileRecoveredBaselineAdmissionV1(pending, options = {}) {
  if (!obj(pending) || pending.status!==PENDING_STATUS) fail('BLOCKED_RECONCILIATION','STATE_NOT_RECONCILABLE');
  req(pending,['admission_operation_id','admission_operation_digest','prepared_admission','pre_parent_state_version','pre_parent_state_digest','post_parent_state_version','post_parent_state_digest','canonical_admission_receipt','canonical_version_receipt','lifecycle_rebind_request'],'pending_admission');
  const prepared=pending.prepared_admission; validatePrepared(prepared);
  if (pending.admission_operation_id!==prepared.admission_operation_id || pending.admission_operation_digest!==prepared.admission_operation_digest) fail('BLOCKED_RECONCILIATION','OPERATION_IDENTITY_MISMATCH');
  const pre=options.pre_parent_state, post=options.post_parent_state || (pending.canonical_admission_result && pending.canonical_admission_result.parent_state), lifecycleLedger=options.lifecycle_ledger;
  if (!obj(pre)||!obj(post)||!obj(lifecycleLedger)||!options.lifecycle_contract) fail('BLOCKED_RECONCILIATION','CURRENT_RECONCILIATION_STATE_REQUIRED');
  if (pre.state_version!==pending.pre_parent_state_version||pre.state_digest!==pending.pre_parent_state_digest||post.state_version!==pending.post_parent_state_version||post.state_digest!==pending.post_parent_state_digest) fail('BLOCKED_RECONCILIATION','PARENT_IDENTITY_MISMATCH');
  const admissionResult={parent_state:post,admission_receipt:clone(pending.canonical_admission_receipt),version_receipt:clone(pending.canonical_version_receipt),version_ledger:options.version_ledger||null};
  validatePost(prepared,pre,admissionResult);
  const d=deps(options); const expected=buildRebind(prepared,pre,admissionResult,lifecycleLedger,d);
  if (!same(expected,pending.lifecycle_rebind_request)) fail('BLOCKED_RECONCILIATION','LIFECYCLE_REBIND_REQUEST_MISMATCH');
  let lifecycleResult;
  try { lifecycleResult=d.lifecycleRebind.rebindAfterAuthorizedParentSuccessor({contract:options.lifecycle_contract,preParentState:pre,postParentState:post,lifecycleLedger,request:pending.lifecycle_rebind_request}); }
  catch (err) { fail('BLOCKED_RECONCILIATION',err && err.code ? err.code : 'LIFECYCLE_REBIND_FAILED'); }
  if (!lifecycleResult||!lifecycleResult.receipt||lifecycleResult.receipt.lifecycle_transition_performed!==false||lifecycleResult.receipt.publication_authorized!==false) fail('BLOCKED_RECONCILIATION','LIFECYCLE_REBIND_AUTHORITY_VIOLATION');
  const recoveryReceipt=buildReceipt(prepared,admissionResult,lifecycleResult); validateAdmissionReceiptV1(recoveryReceipt,prepared);
  return normalize({standing:COMMITTED_STANDING,status:'COMMITTED_VERIFIED',disposition:'RECONCILED_LIFECYCLE_ONLY',admission_operation_id:prepared.admission_operation_id,admission_operation_digest:prepared.admission_operation_digest,parent_state:post,version_ledger:admissionResult.version_ledger,lifecycle_ledger:lifecycleResult.lifecycle_ledger,lifecycle_rebind_receipt:lifecycleResult.receipt,recovery_admission_receipt:recoveryReceipt,canonical_admission_performed:false,lifecycle_transition_performed:false,publication_authority:false,export_freeze_authority:false});
}

function assertEvidenceClaimBoundariesV1(claim = {}) {
  assertNoRaw(claim,'evidence_claim');
  if (claim.native_provider_fidelity===true||claim.native_provider_fidelity_claimed===true||claim.real_book_fidelity===true||claim.private_source_standing===true||claim.production_standing===true||claim.a01_standing===true) fail('SYNTHETIC_EVIDENCE_CLAIM_FORBIDDEN');
  if (claim.historical_pass_transferred===true) fail('HISTORICAL_PASS_TRANSFER_FORBIDDEN');
  if (claim.author_ratification_synthesized===true||claim.publication_authority===true||claim.export_freeze_authority===true) fail('AUTHORITY_WIDENING_FORBIDDEN');
  if (claim.parallel_scheduler_created===true||claim.second_scheduler_or_retry_authority_requested===true||claim.b01_registry_modified===true||claim.b01_registry_mutation_requested===true) fail('B02_DESIGN_COMPATIBILITY_VIOLATION');
  return true;
}

module.exports={
  SCHEMA_VERSION,RECEIPT_SCHEMA_VERSION,ADAPTER_ID,RECOVERY_STANDING,RECONCILE_STANDING,COMMITTED_STANDING,PENDING_STATUS,NEXT_LIFECYCLE_DIRECTIVE,RATIFICATION_DECISION_TYPE,
  BookRecoveredBaselineAdmissionV1Error,stableStringify,sha256,baselineDigest,prepareRecoveredBaselineAdmissionV1,validatePrepared,commitRecoveredBaselineAdmissionV1,reconcileRecoveredBaselineAdmissionV1,validateAdmissionReceiptV1,assertEvidenceClaimBoundariesV1
};
