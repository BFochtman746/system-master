'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const mat = require('./book-knowledge-materializer-v1');
const inv = require('./book-knowledge-invalidation-v1');
const ca = require('./content-object-admission-core');
const applicability = require('./content-admission-author-decision-applicability-guard');
const authorQueue = require('./author-decision-queue');
const vr = require('./version-and-rollback-core');

const OWNER = 'SYSTEM_MASTER/BOOK';
const ADAPTER_ID = 'BOOK_STORY_BIBLE_ADMISSION_V1';
const PREPARED_SCHEMA_VERSION = 'BOOK_STORY_BIBLE_ADMISSION_PREPARED_V1';
const RECEIPT_SCHEMA_VERSION = 'BOOK_STORY_BIBLE_ADMISSION_RECEIPT_V1';
const OPERATION_PREFIX = 'book-story-bible-admission-v1:';
const RECEIPT_PREFIX = 'book-story-bible-admission-receipt-v1:';
const SHA256 = /^[a-f0-9]{64}$/;
const SUBJECT_SHA = /^[a-f0-9]{40,64}$/;
const AFFIRMATIVE = new Set(['APPROVE','APPROVED','ACCEPT','ACCEPTED','PROMOTE','PROMOTED','YES',true]);

const OPERATION_IDENTITIES = Object.freeze({
  VALIDATE: 'BOOK.KNOWLEDGE.VALIDATE_STORY_BIBLE',
  MATERIALIZE: 'BOOK.KNOWLEDGE.MATERIALIZE_STORY_BIBLE',
  INVALIDATE: 'BOOK.KNOWLEDGE.COMPUTE_STORY_BIBLE_INVALIDATION',
  PREPARE: 'BOOK.KNOWLEDGE.PREPARE_STORY_BIBLE_ADMISSION',
  COMMIT: 'BOOK.KNOWLEDGE.COMMIT_STORY_BIBLE_ADMISSION',
  CHECK: 'BOOK.KNOWLEDGE.CHECK_STORY_BIBLE_INTEGRITY'
});
const QUERY_IDENTITIES = Object.freeze({
  BY_ID: 'GetStoryBibleKnowledgeByIdV1',
  RELATIONS: 'GetStoryBibleKnowledgeRelationsV1',
  STATUS: 'GetStoryBibleKnowledgeCandidateStatusV1',
  EVIDENCE: 'GetStoryBibleKnowledgeEvidenceV1',
  INVALIDATION: 'GetStoryBibleInvalidationImpactV1',
  READINESS: 'GetStoryBibleKnowledgeAdmissionReadinessV1',
  INTEGRITY: 'CheckStoryBibleKnowledgeIntegrityV1'
});
const RETIRED = [/^CANONICAL_NARRATIVE_STATE(?:\.|$)/, /^PROSE\./];
const HARD_FORBIDDEN = [
  /raw.*(?:manuscript|source|document|text|bytes)/i,
  /(?:manuscript|source|document).*text/i,
  /private.*(?:payload|content|text)/i,
  /credential/i, /access.*token/i, /secret/i, /chain.*of.*thought/i
];
const FORBIDDEN_AUTHORITY_CLAIMS = [
  /reader.*state/i, /focaliz/i, /narrative.*function/i, /passage.*purpose/i, /scene.*purpose/i,
  /whole.*book.*coherence/i, /literary.*quality/i, /author.*intent/i, /revision.*instruction/i,
  /direct.*canonical.*write/i, /active.*pointer.*mutation/i, /confidence.*canonical.*truth/i,
  /author.*decision.*synth/i, /publication.*authority/i, /production.*standing/i,
  /a01.*standing/i, /real.*book.*validation.*claim/i, /model.*accuracy.*claim/i,
  /historical.*pass.*transfer/i, /duplicate.*evidence.*vote.*inflation/i
];

class BookStoryBibleAdmissionError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookStoryBibleAdmissionError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookStoryBibleAdmissionError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const field of fields) if (!own(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function digest(v, label) { if (typeof v !== 'string' || !SHA256.test(v)) fail('INVALID_SHA256', label); }
function reference(v, label) { if (!text(String(v === undefined || v === null ? '' : v))) fail('REFERENCE_REQUIRED', label); }
function sorted(values) { return [...new Set(values)].sort(); }
function stable(v) { return kb.stableStringify(v); }
function same(a, b) { return stable(a) === stable(b); }
function hash(v) { return kb.sha256(v); }
function assertNoForbidden(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((x, i) => assertNoForbidden(x, `${path}[${i}]`));
  if (!obj(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (HARD_FORBIDDEN.some(r => r.test(key)) && !(key === 'raw_manuscript_text_persisted' && child === false)) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', `${path}.${key}`);
    if (FORBIDDEN_AUTHORITY_CLAIMS.some(r => r.test(key)) && ![false, 0, null, undefined].includes(child)) {
      fail('BLOCKED_AUTHORITY_WIDENING', `${path}.${key}`);
    }
    assertNoForbidden(child, `${path}.${key}`);
  }
}
function rejectRetiredIdentity(identity) {
  if (typeof identity === 'string' && RETIRED.some(r => r.test(identity))) fail('BLOCKED_RETIRED_B03_AUTHORITY', identity);
}
function exactRuntimeIdentity(owner, identity) {
  if (owner !== OWNER) fail('BLOCKED_B03_OWNER_MISMATCH', String(owner));
  rejectRetiredIdentity(identity);
  if (!Object.values(OPERATION_IDENTITIES).includes(identity)) fail('BLOCKED_B03_OPERATION_IDENTITY', String(identity));
  return true;
}
function policyRef(policy) { return `${policy.policy_id}@${policy.policy_version}`; }
function normalizePairs(items, idField, digestField, label) {
  if (!Array.isArray(items)) fail('ARRAY_REQUIRED', label);
  const seen = new Set();
  return items.map((x, i) => {
    req(x, [idField, digestField], `${label}.${i}`);
    reference(x[idField], `${label}.${i}.${idField}`); digest(x[digestField], `${label}.${i}.${digestField}`);
    if (seen.has(x[idField])) fail('BLOCKED_REFERENCE_INTEGRITY', `${label}:${x[idField]}`);
    seen.add(x[idField]);
    return { [idField]: x[idField], [digestField]: x[digestField] };
  }).sort((a, b) => String(a[idField]).localeCompare(String(b[idField])));
}
function validateCurrentEvidence(input, knowledge) {
  const sourceEvidence = input.source_identity_evidence;
  const projectionEvidence = input.projection_identity_evidence;
  const manuscriptEvidence = input.manuscript_identity_evidence;
  if (!Array.isArray(sourceEvidence) || !Array.isArray(projectionEvidence) || !Array.isArray(manuscriptEvidence)) fail('BLOCKED_REFERENCE_INTEGRITY', 'identity_evidence_arrays');
  for (const x of sourceEvidence) {
    req(x, ['source_acceptance_id','source_acceptance_digest','current','rights_current','private_authority_current'], 'source_identity_evidence');
    if (x.current !== true) fail('BLOCKED_SOURCE_STALE', x.source_acceptance_id);
    if (x.rights_current !== true || x.private_authority_current !== true) fail('BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY', x.source_acceptance_id);
  }
  for (const x of projectionEvidence) {
    req(x, ['projection_id','projection_digest','current'], 'projection_identity_evidence');
    if (x.current !== true) fail('BLOCKED_PROJECTION_STALE', x.projection_id);
  }
  for (const x of manuscriptEvidence) {
    req(x, ['manuscript_ref','manuscript_digest','current'], 'manuscript_identity_evidence');
    if (x.current !== true) fail('BLOCKED_MANUSCRIPT_STALE', x.manuscript_ref);
  }
  const ks = normalizePairs(knowledge.source_acceptance_refs, 'source_acceptance_id', 'source_acceptance_digest', 'knowledge.source_acceptance_refs');
  const is = normalizePairs(sourceEvidence, 'source_acceptance_id', 'source_acceptance_digest', 'source_identity_evidence');
  const kp = normalizePairs(knowledge.projection_refs, 'projection_id', 'projection_digest', 'knowledge.projection_refs');
  const ip = normalizePairs(projectionEvidence, 'projection_id', 'projection_digest', 'projection_identity_evidence');
  const km = normalizePairs(knowledge.manuscript_refs, 'manuscript_ref', 'manuscript_digest', 'knowledge.manuscript_refs');
  const im = normalizePairs(manuscriptEvidence, 'manuscript_ref', 'manuscript_digest', 'manuscript_identity_evidence');
  if (!same(ks, is) || !same(kp, ip) || !same(km, im)) fail('BLOCKED_REFERENCE_INTEGRITY', 'candidate_identity_evidence_mismatch');
}
function currentStoryBible(parentState, activeRef) {
  if (!vr || typeof vr.objectRecords !== 'function') fail('BLOCKED_EXTERNAL_SETUP', 'versioning.objectRecords');
  const matches = vr.objectRecords(parentState).filter(r => r.type === 'STORY_BIBLE' && (activeRef === r.object_id || activeRef === `${r.object_id}:${r.object_version}`));
  if (matches.length !== 1) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', `cardinality:${matches.length}`);
  return matches[0];
}
function recordById(knowledge, id) {
  for (const [semanticClass, meta] of Object.entries(mat.CLASS_META)) {
    const [collection, idField] = meta;
    const item = (knowledge[collection] || []).find(x => x && x[idField] === id);
    if (item) return { semantic_class: semanticClass, collection, id_field: idField, record: item };
  }
  return null;
}
function validateInvalidationClosure(input, knowledge) {
  if (input.invalidation_result == null) return;
  try { inv.validateInvalidationImpactV1(input.invalidation_result); }
  catch (err) { fail('BLOCKED_INVALIDATION_REQUIRED', err && err.code ? err.code : 'INVALID'); }
  const impact = input.invalidation_result.impact;
  for (const id of [...impact.directly_affected_refs, ...impact.transitively_affected_refs]) {
    const found = recordById(knowledge, id);
    if (!found) continue;
    if (found.collection === 'anchors') {
      if (found.record.source_current !== false) fail('BLOCKED_INVALIDATION_REQUIRED', id);
    } else if (found.record.status !== 'INVALIDATED') {
      fail('BLOCKED_INVALIDATION_REQUIRED', id);
    }
  }
}
function authorCoverage(parentState, input) {
  const definitive = Array.isArray(input.definitive_contested_resolution_refs) ? input.definitive_contested_resolution_refs : [];
  const decisionRefs = Array.isArray(input.author_decision_refs) ? input.author_decision_refs : [];
  if (!definitive.length) return false;
  if (!decisionRefs.length) fail('BLOCKED_AUTHOR_DECISION', 'missing');
  const decisions = decisionRefs.map(id => (parentState.author_decisions || []).find(x => x && x.decision_id === id));
  if (decisions.some(x => !x || x.status !== 'APPROVED' || !AFFIRMATIVE.has(x.author_choice))) fail('BLOCKED_AUTHOR_DECISION', 'not_approved');
  for (const subjectRef of definitive) {
    const found = decisions.some(d => {
      const refs = Array.isArray(d.subject_refs) ? d.subject_refs.map(String) : [String(d.subject_ref || '')];
      const currentEnough = d.effective_version === undefined || d.effective_version === parentState.state_version;
      return currentEnough && refs.includes(String(subjectRef));
    });
    if (!found) fail('BLOCKED_AUTHOR_DECISION', String(subjectRef));
  }
  return true;
}
function storyBiblePayload(input) {
  return {
    story_bible_id: input.new_story_bible_id,
    version: String(input.new_story_bible_version),
    book_project_id: input.book_project_id,
    knowledge_schema_version: input.knowledge.knowledge_schema_version,
    knowledge_candidate_id: input.knowledge.knowledge_candidate_id,
    knowledge_digest: input.knowledge.knowledge_digest,
    knowledge: clone(input.knowledge),
    materialization_receipt_id: input.materialization_receipt.receipt_id,
    materialization_receipt_digest: input.materialization_receipt.receipt_digest,
    calibration_policy_ref: input.calibration_policy_ref,
    calibration_policy_digest: input.calibration_policy_digest
  };
}
function admissionSemantic(input) {
  const out = clone(input);
  delete out.admission_operation_id;
  delete out.admission_operation_digest;
  delete out.audit_metadata;
  delete out.transport_metadata;
  return out;
}
function admissionOperationDigest(input) { return hash(admissionSemantic(input)); }
function admissionOperationId(inputOrDigest) {
  const d = typeof inputOrDigest === 'string' ? inputOrDigest : admissionOperationDigest(inputOrDigest);
  return `${OPERATION_PREFIX}${d}`;
}
function sealStoryBibleAdmissionInputV1(input) {
  const out = clone(input);
  if (!out.new_story_bible_content_digest) out.new_story_bible_content_digest = vr.digest(storyBiblePayload(out));
  out.admission_operation_digest = admissionOperationDigest(out);
  out.admission_operation_id = admissionOperationId(out.admission_operation_digest);
  return out;
}
function validateMaterializationBinding(input) {
  try { mat.validateMaterializationReceiptV1(input.materialization_receipt); }
  catch (err) { fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', `materialization:${err.code || err.name}`); }
  try { mat.validateCalibrationPolicyV1(input.calibration_policy); }
  catch (err) { fail('BLOCKED_CALIBRATION_POLICY_MISSING', err.code || err.name); }
  if (input.calibration_policy.standing !== 'ADMITTED') fail('BLOCKED_CALIBRATION_UNPROVED', input.calibration_policy.standing);
  if (input.calibration_policy_ref !== policyRef(input.calibration_policy) || input.calibration_policy_digest !== input.calibration_policy.policy_digest) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'binding');
  if (input.knowledge.calibration_policy_ref !== input.calibration_policy_ref || input.knowledge.calibration_policy_digest !== input.calibration_policy_digest) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'candidate');
  const receipt = input.materialization_receipt;
  if (receipt.knowledge_candidate_id !== input.knowledge.knowledge_candidate_id || receipt.knowledge_digest !== input.knowledge.knowledge_digest || receipt.calibration_policy_ref !== input.calibration_policy_ref || receipt.calibration_policy_digest !== input.calibration_policy_digest) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'materialization_binding');
  if (input.materialization_receipt_id !== receipt.receipt_id || input.materialization_receipt_digest !== receipt.receipt_digest) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'materialization_receipt_ref');
}
function buildApplicabilityBindings(input, registerOperation) {
  const needed = registerOperation.requires_author_decision === true;
  const source = Array.isArray(input.author_applicability_bindings) ? input.author_applicability_bindings : [];
  if (!needed) {
    if (source.length) fail('BLOCKED_AUTHOR_DECISION', 'unexpected_applicability_binding');
    return [];
  }
  if (!source.length) fail('BLOCKED_AUTHOR_DECISION', 'applicability_binding_missing');
  const byDecision = new Map();
  for (const x of source) {
    req(x, ['decision_id','resolution_receipt_id','required_subject_identity_refs'], 'author_applicability_binding');
    reference(x.decision_id, 'author_applicability_binding.decision_id');
    reference(x.resolution_receipt_id, 'author_applicability_binding.resolution_receipt_id');
    if (!Array.isArray(x.required_subject_identity_refs) || !x.required_subject_identity_refs.length) fail('BLOCKED_AUTHOR_DECISION', 'subject_refs');
    if (byDecision.has(x.decision_id)) fail('BLOCKED_AUTHOR_DECISION', 'duplicate_binding');
    byDecision.set(x.decision_id, x);
  }
  const requestRefs = sorted(input.author_decision_refs.map(String));
  if (!same(sorted([...byDecision.keys()]), requestRefs)) fail('BLOCKED_AUTHOR_DECISION', 'binding_set');
  return requestRefs.map(id => {
    const x = byDecision.get(id);
    return {
      operation_index: 0,
      operation_fingerprint: authorQueue.digest(registerOperation),
      author_decision_ref: id,
      resolution_receipt_id: x.resolution_receipt_id,
      required_subject_identity_refs: clone(x.required_subject_identity_refs)
    };
  });
}
function validatePrepared(prepared) {
  req(prepared, ['prepared_schema_version','admission_operation_id','admission_operation_digest','knowledge_candidate_id','knowledge_digest','expected_parent_state_version','expected_parent_state_digest','expected_current_story_bible_ref','expected_current_story_bible_digest','expected_successor_story_bible_ref','new_story_bible_content_digest','content_admission_request','applicability_bindings','readiness','canonical_effect','lifecycle_transition_authorized','export_authority','publication_authority','author_decision_authority','b01_registry_modified','historical_pass_transferred'], 'prepared');
  if (prepared.prepared_schema_version !== PREPARED_SCHEMA_VERSION) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', 'prepared_schema');
  digest(prepared.admission_operation_digest, 'prepared.admission_operation_digest');
  if (prepared.admission_operation_id !== admissionOperationId(prepared.admission_operation_digest)) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'prepared_operation_id');
  if (prepared.readiness !== 'READY_FOR_GOVERNED_ADMISSION' || prepared.canonical_effect !== false) fail('BLOCKED_GRAPH_INTEGRITY', 'prepared_readiness');
  if (prepared.lifecycle_transition_authorized !== false || prepared.export_authority !== false || prepared.publication_authority !== false || prepared.author_decision_authority !== false || prepared.b01_registry_modified !== false || prepared.historical_pass_transferred !== 0) fail('BLOCKED_AUTHORITY_WIDENING', 'prepared');
  if (!Array.isArray(prepared.content_admission_request.operations) || prepared.content_admission_request.operations.length !== 2) fail('BLOCKED_GRAPH_INTEGRITY', 'operation_count');
  const [register, activate] = prepared.content_admission_request.operations;
  if (register.operation_type !== 'REGISTER_CONTENT_OBJECT_VERSION' || register.object_type !== 'STORY_BIBLE') fail('BLOCKED_GRAPH_INTEGRITY', 'register');
  if (activate.operation_type !== 'SET_ACTIVE_CONTENT_OBJECT_VERSION' || activate.object_type !== 'STORY_BIBLE' || activate.object_ref !== prepared.expected_successor_story_bible_ref) fail('BLOCKED_GRAPH_INTEGRITY', 'activate');
  return true;
}
function prepareStoryBibleKnowledgeAdmissionV1(input, options = {}) {
  req(input, ['admission_operation_id','admission_operation_digest','book_project_id','current_parent_state_version','current_parent_state_digest','current_story_bible_ref','current_story_bible_digest','knowledge','knowledge_candidate_id','knowledge_digest','materialization_receipt','materialization_receipt_id','materialization_receipt_digest','calibration_policy','calibration_policy_ref','calibration_policy_digest','source_identity_evidence','projection_identity_evidence','manuscript_identity_evidence','definitive_contested_resolution_refs','author_decision_refs','author_applicability_bindings','new_story_bible_id','new_story_bible_version','new_story_bible_content_digest','b03_subject_sha','created_at','invalidation_result'], 'input');
  assertNoForbidden(input);
  reference(input.book_project_id, 'book_project_id');
  if (!SUBJECT_SHA.test(String(input.b03_subject_sha || ''))) fail('BLOCKED_REFERENCE_INTEGRITY', 'b03_subject_sha');
  if (!text(input.created_at) || Number.isNaN(Date.parse(input.created_at))) fail('BLOCKED_REFERENCE_INTEGRITY', 'created_at');
  digest(input.admission_operation_digest, 'admission_operation_digest');
  if (input.admission_operation_digest !== admissionOperationDigest(input) || input.admission_operation_id !== admissionOperationId(input.admission_operation_digest)) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'admission_operation');
  if (input.knowledge_candidate_id !== input.knowledge.knowledge_candidate_id || input.knowledge_digest !== input.knowledge.knowledge_digest) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'knowledge_ref');
  if (input.knowledge.standing !== 'MATERIALIZED_NOT_CANONICAL') fail('BLOCKED_GRAPH_INTEGRITY', `standing:${input.knowledge.standing}`);
  try { kb.validateStoryBibleKnowledgeV1(input.knowledge, { expected_book_project_id: input.book_project_id }); }
  catch (err) { fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', `${err.code || err.name}:${err.detail || ''}`); }
  try { kb.checkStoryBibleKnowledgeIntegrityV1(input.knowledge, { expected_book_project_id: input.book_project_id }); }
  catch (err) { fail('BLOCKED_GRAPH_INTEGRITY', err.code || err.name); }
  validateMaterializationBinding(input);
  validateCurrentEvidence(input, input.knowledge);
  validateInvalidationClosure(input, input.knowledge);
  const parent = options.parent_state;
  const ledger = options.version_ledger;
  if (!obj(parent) || !obj(ledger)) fail('BLOCKED_EXTERNAL_SETUP', 'current_parent_and_ledger');
  try { vr.validateParentState(parent); if (typeof vr.validateLedger === 'function') vr.validateLedger(ledger, parent); }
  catch (err) { fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', err.code || err.name); }
  if (parent.book_project.book_project_id !== input.book_project_id) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'book_project');
  if (parent.state_version !== input.current_parent_state_version || parent.state_digest !== input.current_parent_state_digest) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'parent');
  if (parent.active.story_bible_ref !== input.current_story_bible_ref) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'active_ref');
  const current = currentStoryBible(parent, input.current_story_bible_ref);
  if (current.object_digest !== input.current_story_bible_digest) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'digest');
  if (input.knowledge.prior_story_bible_ref !== input.current_story_bible_ref) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'candidate_predecessor');
  if (String(input.new_story_bible_id) !== String(current.object_id) || String(input.new_story_bible_version) === String(current.object_version)) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'successor_identity');
  const payload = storyBiblePayload(input);
  if (vr.digest(payload) !== input.new_story_bible_content_digest) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'story_bible_content');
  const requiresAuthor = authorCoverage(parent, input);
  const register = {
    operation_type: 'REGISTER_CONTENT_OBJECT_VERSION', object_type: 'STORY_BIBLE',
    object_id: String(input.new_story_bible_id), version_id: String(input.new_story_bible_version),
    content_digest_sha256: input.new_story_bible_content_digest,
    parent_version_ref: input.current_story_bible_ref,
    provenance_ref: input.admission_operation_id,
    source_subject_sha: input.b03_subject_sha, source_current: true,
    created_by: ADAPTER_ID, created_at: input.created_at,
    requires_author_decision: requiresAuthor,
    payload
  };
  const activate = { operation_type: 'SET_ACTIVE_CONTENT_OBJECT_VERSION', object_type: 'STORY_BIBLE', object_ref: `${input.new_story_bible_id}:${String(input.new_story_bible_version)}` };
  const evidenceRefs = sorted([
    input.materialization_receipt_id, input.calibration_policy_ref,
    ...input.source_identity_evidence.map(x => x.source_acceptance_id),
    ...input.projection_identity_evidence.map(x => x.projection_id),
    ...input.manuscript_identity_evidence.map(x => x.manuscript_ref),
    input.invalidation_result && input.invalidation_result.impact && input.invalidation_result.impact.impact_id
  ].filter(text));
  const request = {
    mutation_id: input.admission_operation_id,
    actor_class: 'PARENT_SYSTEM',
    expected_state_version: input.current_parent_state_version,
    expected_state_digest: input.current_parent_state_digest,
    operations: [register, activate],
    evidence_refs: evidenceRefs,
    author_decision_refs: sorted(input.author_decision_refs.map(String))
  };
  const applicabilityBindings = buildApplicabilityBindings(input, register);
  const prepared = {
    prepared_schema_version: PREPARED_SCHEMA_VERSION,
    admission_operation_id: input.admission_operation_id,
    admission_operation_digest: input.admission_operation_digest,
    knowledge_candidate_id: input.knowledge_candidate_id,
    knowledge_digest: input.knowledge_digest,
    expected_parent_state_version: input.current_parent_state_version,
    expected_parent_state_digest: input.current_parent_state_digest,
    expected_current_story_bible_ref: input.current_story_bible_ref,
    expected_current_story_bible_digest: input.current_story_bible_digest,
    expected_successor_story_bible_ref: activate.object_ref,
    new_story_bible_content_digest: input.new_story_bible_content_digest,
    content_admission_request: request,
    applicability_bindings: applicabilityBindings,
    readiness: 'READY_FOR_GOVERNED_ADMISSION',
    canonical_effect: false,
    lifecycle_transition_authorized: false,
    export_authority: false,
    publication_authority: false,
    author_decision_authority: false,
    b01_registry_modified: false,
    historical_pass_transferred: 0
  };
  validatePrepared(prepared);
  return clone(prepared);
}
function receiptSemantic(receipt) {
  const out = clone(receipt); delete out.receipt_id; delete out.receipt_digest; return out;
}
function admissionReceiptDigest(receipt) { return hash(receiptSemantic(receipt)); }
function buildAdmissionReceipt(prepared, result, preStatus, preExports) {
  const receipt = {
    receipt_schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_id: '', receipt_digest: '',
    admission_operation_id: prepared.admission_operation_id,
    admission_operation_digest: prepared.admission_operation_digest,
    knowledge_candidate_id: prepared.knowledge_candidate_id,
    knowledge_digest: prepared.knowledge_digest,
    admitted_story_bible_ref: prepared.expected_successor_story_bible_ref,
    canonical_version_receipt_id: result.version_receipt && result.version_receipt.receipt_id,
    base_admission_disposition: result.disposition,
    post_parent_state_version: result.parent_state.state_version,
    post_parent_state_digest: result.parent_state.state_digest,
    lifecycle_status_before: preStatus,
    lifecycle_status_after: result.parent_state.book_project.status,
    export_releases_unchanged: same(preExports, result.parent_state.export_releases),
    canonical_admission_performed: true,
    active_pointer_changed_by_b00_only: true,
    author_decision_synthesized: false,
    lifecycle_transition_performed: false,
    export_authority: false,
    publication_authority: false,
    production_standing_claimed: false,
    a01_standing_claimed: false,
    model_accuracy_claimed: false,
    real_book_validation_claimed: false,
    b01_registry_modified: false,
    historical_pass_transferred: 0
  };
  receipt.receipt_digest = admissionReceiptDigest(receipt);
  receipt.receipt_id = `${RECEIPT_PREFIX}${receipt.receipt_digest}`;
  return receipt;
}
function validateStoryBibleAdmissionReceiptV1(receipt, prepared) {
  req(receipt, ['receipt_schema_version','receipt_id','receipt_digest','admission_operation_id','admission_operation_digest','knowledge_candidate_id','knowledge_digest','admitted_story_bible_ref','canonical_admission_performed','active_pointer_changed_by_b00_only','author_decision_synthesized','lifecycle_transition_performed','export_authority','publication_authority','production_standing_claimed','a01_standing_claimed','model_accuracy_claimed','real_book_validation_claimed','b01_registry_modified','historical_pass_transferred'], 'receipt');
  if (receipt.receipt_schema_version !== RECEIPT_SCHEMA_VERSION) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', 'receipt_schema');
  if (receipt.admission_operation_id !== prepared.admission_operation_id || receipt.admission_operation_digest !== prepared.admission_operation_digest || receipt.knowledge_candidate_id !== prepared.knowledge_candidate_id || receipt.knowledge_digest !== prepared.knowledge_digest || receipt.admitted_story_bible_ref !== prepared.expected_successor_story_bible_ref) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'receipt_binding');
  const expected = admissionReceiptDigest(receipt);
  if (receipt.receipt_digest !== expected || receipt.receipt_id !== `${RECEIPT_PREFIX}${expected}`) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'receipt');
  if (receipt.canonical_admission_performed !== true || receipt.active_pointer_changed_by_b00_only !== true || receipt.author_decision_synthesized !== false || receipt.lifecycle_transition_performed !== false || receipt.export_authority !== false || receipt.publication_authority !== false || receipt.production_standing_claimed !== false || receipt.a01_standing_claimed !== false || receipt.model_accuracy_claimed !== false || receipt.real_book_validation_claimed !== false || receipt.b01_registry_modified !== false || receipt.historical_pass_transferred !== 0) fail('BLOCKED_AUTHORITY_WIDENING', 'receipt');
  return true;
}
function commitStoryBibleKnowledgeAdmissionV1(prepared, options = {}) {
  validatePrepared(prepared);
  const parent = options.parent_state;
  const ledger = options.version_ledger;
  if (!obj(parent) || !obj(ledger)) fail('BLOCKED_EXTERNAL_SETUP', 'current_parent_and_ledger');
  const priorProcessed = ledger.processed_requests && ledger.processed_requests[prepared.admission_operation_id];
  if (!priorProcessed) {
    if (parent.state_version !== prepared.expected_parent_state_version || parent.state_digest !== prepared.expected_parent_state_digest || parent.active.story_bible_ref !== prepared.expected_current_story_bible_ref) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'commit_precondition');
    const current = currentStoryBible(parent, prepared.expected_current_story_bible_ref);
    if (current.object_digest !== prepared.expected_current_story_bible_digest) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'commit_story_bible_digest');
  }
  const preSnapshot = clone(parent);
  let result;
  try {
    if (prepared.content_admission_request.operations[0].requires_author_decision === true) {
      result = applicability.commitContentAdmissionWithAuthorDecisionApplicability({
        parentState: parent, versionLedger: ledger, queueLedger: options.queue_ledger,
        request: prepared.content_admission_request, applicabilityBindings: prepared.applicability_bindings
      });
    } else {
      result = ca.commitContentAdmission({ parentState: parent, versionLedger: ledger, request: prepared.content_admission_request });
    }
  } catch (err) {
    if (err && ['STALE_PARENT_WRITE','CONTENT_OBJECT_PREDECESSOR_MISMATCH','ACTIVE_CONTENT_OBJECT_STALE','IDEMPOTENCY_KEY_CONFLICT'].includes(err.code)) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', err.code);
    if (err && /AUTHOR/.test(String(err.code || ''))) fail('BLOCKED_AUTHOR_DECISION', err.code);
    fail('BLOCKED_B00_CANONICAL_ADMISSION', err && err.code ? err.code : String(err));
  }
  if (!obj(result) || !obj(result.parent_state) || !obj(result.admission_receipt)) fail('BLOCKED_B00_CANONICAL_ADMISSION', 'invalid_result');
  if (result.parent_state.active.story_bible_ref !== prepared.expected_successor_story_bible_ref) fail('BLOCKED_B00_CANONICAL_ADMISSION', 'active_pointer');
  if (result.parent_state.book_project.status !== preSnapshot.book_project.status) fail('BLOCKED_AUTHORITY_WIDENING', 'lifecycle');
  if (!same(result.parent_state.export_releases, preSnapshot.export_releases)) fail('BLOCKED_AUTHORITY_WIDENING', 'export');
  const receipt = buildAdmissionReceipt(prepared, result, preSnapshot.book_project.status, preSnapshot.export_releases);
  validateStoryBibleAdmissionReceiptV1(receipt, prepared);
  return {
    result: result.disposition === 'REPLAY' ? 'COMMITTED_VERIFIED_REPLAY' : 'COMMITTED_VERIFIED',
    parent_state: result.parent_state,
    version_ledger: result.version_ledger,
    version_receipt: result.version_receipt,
    base_admission_receipt: result.admission_receipt,
    applicability_receipt: result.applicability_receipt || null,
    story_bible_admission_receipt: receipt,
    canonical_effect: true,
    canonical_effect_authority: 'B00_CONTENT_ADMISSION_ONLY',
    lifecycle_transition_performed: false,
    export_authority: false,
    publication_authority: false,
    author_decision_synthesized: false,
    b01_registry_modified: false,
    historical_pass_transferred: 0,
    model_accuracy_claimed: false,
    real_book_validation_claimed: false,
    production_standing_claimed: false,
    a01_standing_claimed: false
  };
}
function cloneRead(value) { return clone(value); }
function getStoryBibleKnowledgeByIdV1(knowledge, id) {
  kb.validateStoryBibleKnowledgeV1(knowledge);
  const found = recordById(knowledge, id);
  return found ? cloneRead(found) : null;
}
function containsRef(value, id) {
  if (Array.isArray(value)) return value.some(x => containsRef(x, id));
  if (!obj(value)) return value === id;
  return Object.values(value).some(x => containsRef(x, id));
}
function getStoryBibleKnowledgeRelationsV1(knowledge, id) {
  kb.validateStoryBibleKnowledgeV1(knowledge);
  const out = [];
  for (const [semanticClass, meta] of Object.entries(mat.CLASS_META)) {
    const [collection, idField] = meta;
    for (const record of knowledge[collection] || []) {
      if (record[idField] !== id && containsRef(record, id)) out.push({ semantic_class: semanticClass, record_id: record[idField] });
    }
  }
  return out.sort((a, b) => `${a.semantic_class}|${a.record_id}`.localeCompare(`${b.semantic_class}|${b.record_id}`));
}
function getStoryBibleKnowledgeCandidateStatusV1(knowledge) {
  kb.validateStoryBibleKnowledgeV1(knowledge);
  return { knowledge_candidate_id: knowledge.knowledge_candidate_id, knowledge_digest: knowledge.knowledge_digest, standing: knowledge.standing, canonical_effect: false };
}
function getStoryBibleKnowledgeEvidenceV1(knowledge, id) {
  kb.validateStoryBibleKnowledgeV1(knowledge);
  const found = recordById(knowledge, id);
  if (!found) return null;
  const r = found.record;
  return { record_id: id, source_anchor_ids: cloneRead(r.source_anchor_ids || []), provenance_refs: cloneRead(r.provenance_refs || []), evidence_refs: cloneRead(r.evidence_refs || []), depends_on_refs: cloneRead(r.depends_on_refs || []) };
}
function getStoryBibleInvalidationImpactV1(result) { inv.validateInvalidationImpactV1(result); return cloneRead(result.impact); }
function getStoryBibleKnowledgeAdmissionReadinessV1(prepared) { validatePrepared(prepared); return { admission_operation_id: prepared.admission_operation_id, readiness: prepared.readiness, expected_successor_story_bible_ref: prepared.expected_successor_story_bible_ref, canonical_effect: false }; }
function checkStoryBibleKnowledgeIntegrityV1(knowledge, options = {}) { return cloneRead(kb.checkStoryBibleKnowledgeIntegrityV1(knowledge, options)); }
function invokeBookKnowledgeCommandV1(envelope, options = {}) {
  req(envelope, ['owner','operation_identity','payload'], 'command');
  exactRuntimeIdentity(envelope.owner, envelope.operation_identity);
  const p = envelope.payload;
  if (envelope.operation_identity === OPERATION_IDENTITIES.VALIDATE) { kb.validateStoryBibleKnowledgeV1(p.knowledge, p.options || {}); return { result: 'VALID', canonical_effect: false }; }
  if (envelope.operation_identity === OPERATION_IDENTITIES.MATERIALIZE) return mat.materializeStoryBibleKnowledgeCandidateV1(p.input, p.policy);
  if (envelope.operation_identity === OPERATION_IDENTITIES.INVALIDATE) return inv.computeStoryBibleInvalidationImpactV1(p.input);
  if (envelope.operation_identity === OPERATION_IDENTITIES.PREPARE) return prepareStoryBibleKnowledgeAdmissionV1(p.input, options);
  if (envelope.operation_identity === OPERATION_IDENTITIES.COMMIT) return commitStoryBibleKnowledgeAdmissionV1(p.prepared, options);
  if (envelope.operation_identity === OPERATION_IDENTITIES.CHECK) return kb.checkStoryBibleKnowledgeIntegrityV1(p.knowledge, p.options || {});
  fail('BLOCKED_B03_OPERATION_IDENTITY', envelope.operation_identity);
}
function invokeBookKnowledgeQueryV1(queryIdentity, payload) {
  rejectRetiredIdentity(queryIdentity);
  if (!Object.values(QUERY_IDENTITIES).includes(queryIdentity)) fail('BLOCKED_B03_QUERY_IDENTITY', String(queryIdentity));
  if (queryIdentity === QUERY_IDENTITIES.BY_ID) return getStoryBibleKnowledgeByIdV1(payload.knowledge, payload.id);
  if (queryIdentity === QUERY_IDENTITIES.RELATIONS) return getStoryBibleKnowledgeRelationsV1(payload.knowledge, payload.id);
  if (queryIdentity === QUERY_IDENTITIES.STATUS) return getStoryBibleKnowledgeCandidateStatusV1(payload.knowledge);
  if (queryIdentity === QUERY_IDENTITIES.EVIDENCE) return getStoryBibleKnowledgeEvidenceV1(payload.knowledge, payload.id);
  if (queryIdentity === QUERY_IDENTITIES.INVALIDATION) return getStoryBibleInvalidationImpactV1(payload.result);
  if (queryIdentity === QUERY_IDENTITIES.READINESS) return getStoryBibleKnowledgeAdmissionReadinessV1(payload.prepared);
  if (queryIdentity === QUERY_IDENTITIES.INTEGRITY) return checkStoryBibleKnowledgeIntegrityV1(payload.knowledge, payload.options || {});
  fail('BLOCKED_B03_QUERY_IDENTITY', queryIdentity);
}

module.exports = {
  BookStoryBibleAdmissionError,
  OWNER, ADAPTER_ID, PREPARED_SCHEMA_VERSION, RECEIPT_SCHEMA_VERSION,
  OPERATION_IDENTITIES, QUERY_IDENTITIES,
  storyBiblePayload,
  admissionOperationDigest, admissionOperationId, sealStoryBibleAdmissionInputV1,
  prepareStoryBibleKnowledgeAdmissionV1, commitStoryBibleKnowledgeAdmissionV1,
  admissionReceiptDigest, validateStoryBibleAdmissionReceiptV1,
  getStoryBibleKnowledgeByIdV1, getStoryBibleKnowledgeRelationsV1,
  getStoryBibleKnowledgeCandidateStatusV1, getStoryBibleKnowledgeEvidenceV1,
  getStoryBibleInvalidationImpactV1, getStoryBibleKnowledgeAdmissionReadinessV1,
  checkStoryBibleKnowledgeIntegrityV1,
  invokeBookKnowledgeCommandV1, invokeBookKnowledgeQueryV1,
  AUTHORITY_CLAIMS: Object.freeze({
    canonical_store_created: false, canon_manifest_semantic_copy_created: false,
    b01_registry_modified: false, author_decision_authority: false,
    lifecycle_authority: false, export_authority: false, publication_authority: false,
    b04_reader_authority: false, b09_whole_book_authority: false,
    historical_pass_transferred: 0
  })
};
