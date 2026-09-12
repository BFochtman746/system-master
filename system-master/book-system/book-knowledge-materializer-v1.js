'use strict';

const kb = require('./book-story-bible-knowledge-v1');

const POLICY_SCHEMA_VERSION = 'BOOK_KNOWLEDGE_CALIBRATION_POLICY_V1';
const RECEIPT_SCHEMA_VERSION = 'BOOK_KNOWLEDGE_MATERIALIZATION_RECEIPT_V1';
const MATERIALIZER_SUBJECT_REF = 'BOOK.KNOWLEDGE.MATERIALIZE_STORY_BIBLE:v1:20260912';
const VALIDATOR_SUBJECT_REF = 'BOOK.KNOWLEDGE.VALIDATE_STORY_BIBLE:v1:20260912';
const OPERATION_PREFIX = 'book-knowledge-materialization-v1:';
const RECEIPT_PREFIX = 'book-knowledge-materialization-receipt-v1:';
const SHA256 = /^[a-f0-9]{64}$/;

const ORIGINS = new Set(['DETERMINISTIC', 'B02_RECOVERY', 'PROVIDER_PROJECTION']);
const SUPPORT_STATUSES = new Set(['VERIFIED', 'OBSERVED', 'INFERRED', 'CONTESTED']);
const ADMISSION_MODES = new Set(['DETERMINISTIC_ONLY', 'CALIBRATED_MODEL', 'AUTHOR_REQUIRED']);
const POLICY_STANDINGS = new Set(['ADMITTED', 'BLOCKED_UNCALIBRATED', 'SUPERSEDED']);

const CLASS_META = Object.freeze({
  ANCHOR: ['anchors', 'anchor_id', 'ANCHOR:'],
  ENTITY: ['entities', 'entity_id', 'ENTITY:'],
  EVENT: ['events', 'event_id', 'EVENT:'],
  TEMPORAL: ['temporal_claims', 'temporal_claim_id', 'TEMPORAL:'],
  CAUSAL: ['causal_goal_claims', 'causal_goal_claim_id', 'CAUSAL:'],
  STATE: ['state_assertions', 'state_assertion_id', 'STATE:'],
  CHARACTER_KNOWLEDGE: ['character_knowledge_claims', 'knowledge_claim_id', 'KNOWLEDGE:'],
  RELATIONSHIP: ['relationships', 'relationship_id', 'RELATIONSHIP:'],
  ARC: ['arcs', 'arc_id', 'ARC:'],
  MOTIF: ['motifs', 'motif_id', 'MOTIF:'],
  THEME: ['themes', 'theme_id', 'THEME:'],
  PROMISE: ['promises', 'promise_id', 'PROMISE:'],
  SETUP_PAYOFF: ['setup_payoffs', 'setup_payoff_id', 'SETUP_PAYOFF:'],
  OPEN_QUESTION: ['open_questions', 'open_question_id', 'OPEN_QUESTION:']
});

class BookKnowledgeMaterializationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookKnowledgeMaterializationError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookKnowledgeMaterializationError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function array(v, label) { if (!Array.isArray(v)) fail('ARRAY_REQUIRED', label); }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const f of fields) if (!Object.prototype.hasOwnProperty.call(v, f)) fail('REQUIRED_FIELD_MISSING', `${label}.${f}`);
}
function str(v, label) { if (!text(v)) fail('REFERENCE_REQUIRED', label); }
function digest(v, label) { if (typeof v !== 'string' || !SHA256.test(v)) fail('INVALID_SHA256', label); }
function bool(v, label) { if (typeof v !== 'boolean') fail('BOOLEAN_REQUIRED', label); }
function uniqueSorted(values) { return [...new Set(values)].sort(); }
function stable(v) { return kb.stableStringify(v); }
function hash(v) { return kb.sha256(v); }

function policyRef(policy) { return `${policy.policy_id}@${policy.policy_version}`; }
function policySemantic(policy) {
  const x = clone(policy);
  delete x.policy_digest;
  delete x.audit_metadata;
  delete x.transport_metadata;
  return x;
}
function policyDigest(policy) { return hash(policySemantic(policy)); }
function sealCalibrationPolicyV1(policy) {
  const out = clone(policy);
  out.policy_digest = policyDigest(out);
  return out;
}
function validateCalibrationPolicyV1(policy) {
  req(policy, ['policy_schema_version', 'policy_id', 'policy_version', 'policy_digest', 'provider_subject_scopes', 'rules', 'standing'], 'policy');
  if (policy.policy_schema_version !== POLICY_SCHEMA_VERSION) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'schema');
  str(policy.policy_id, 'policy.policy_id');
  str(policy.policy_version, 'policy.policy_version');
  digest(policy.policy_digest, 'policy.policy_digest');
  if (policy.policy_digest !== policyDigest(policy)) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'digest');
  array(policy.provider_subject_scopes, 'policy.provider_subject_scopes');
  const scopes = uniqueSorted(policy.provider_subject_scopes);
  if (scopes.length !== policy.provider_subject_scopes.length || scopes.some(x => !text(x))) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'provider_subject_scopes');
  array(policy.rules, 'policy.rules');
  if (!POLICY_STANDINGS.has(policy.standing)) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'standing');
  const seen = new Set();
  for (const [i, rule] of policy.rules.entries()) {
    req(rule, ['semantic_class', 'admission_mode', 'min_confidence', 'min_distinct_evidence_families', 'allowed_support_statuses', 'allowed_output_statuses', 'calibration_evidence_refs', 'abstain_when_uncalibrated'], `policy.rules.${i}`);
    if (!CLASS_META[rule.semantic_class]) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `semantic_class:${rule.semantic_class}`);
    if (seen.has(rule.semantic_class)) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `duplicate_rule:${rule.semantic_class}`);
    seen.add(rule.semantic_class);
    if (!ADMISSION_MODES.has(rule.admission_mode)) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `admission_mode:${rule.semantic_class}`);
    if (rule.min_confidence !== null && (typeof rule.min_confidence !== 'number' || !Number.isFinite(rule.min_confidence) || rule.min_confidence < 0 || rule.min_confidence > 1)) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `min_confidence:${rule.semantic_class}`);
    if (!Number.isInteger(rule.min_distinct_evidence_families) || rule.min_distinct_evidence_families < 1) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `evidence_families:${rule.semantic_class}`);
    array(rule.allowed_support_statuses, `policy.rules.${i}.allowed_support_statuses`);
    array(rule.allowed_output_statuses, `policy.rules.${i}.allowed_output_statuses`);
    array(rule.calibration_evidence_refs, `policy.rules.${i}.calibration_evidence_refs`);
    if (!rule.allowed_support_statuses.length || !rule.allowed_output_statuses.length) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `allowed_statuses:${rule.semantic_class}`);
    if (rule.allowed_support_statuses.some(x => !SUPPORT_STATUSES.has(x))) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `support_status:${rule.semantic_class}`);
    if (rule.allowed_output_statuses.some(x => !text(x))) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `output_status:${rule.semantic_class}`);
    if (uniqueSorted(rule.calibration_evidence_refs).length !== rule.calibration_evidence_refs.length) fail('BLOCKED_CALIBRATION_POLICY_MISSING', `calibration_refs:${rule.semantic_class}`);
    bool(rule.abstain_when_uncalibrated, `policy.rules.${i}.abstain_when_uncalibrated`);
  }
  return true;
}

function materializationSemantic(input) {
  const x = clone(input);
  delete x.materialization_operation_id;
  delete x.materialization_operation_digest;
  delete x.audit_metadata;
  delete x.transport_metadata;
  return x;
}
function materializationOperationDigest(input) { return hash(materializationSemantic(input)); }
function materializationOperationId(inputOrDigest) {
  const d = typeof inputOrDigest === 'string' ? inputOrDigest : materializationOperationDigest(inputOrDigest);
  return `${OPERATION_PREFIX}${d}`;
}
function sealMaterializationInputV1(input) {
  const out = clone(input);
  if (!out.materializer_subject_ref) out.materializer_subject_ref = MATERIALIZER_SUBJECT_REF;
  if (!out.validator_subject_ref) out.validator_subject_ref = VALIDATOR_SUBJECT_REF;
  out.materialization_operation_digest = materializationOperationDigest(out);
  out.materialization_operation_id = materializationOperationId(out.materialization_operation_digest);
  return out;
}

function validateExactIdentities(input) {
  const sources = new Map();
  const projections = new Map();
  const manuscripts = new Map();
  const b02 = new Map();
  const providers = new Map();
  array(input.source_acceptance_refs_and_digests, 'source_acceptance_refs_and_digests');
  for (const x of input.source_acceptance_refs_and_digests) {
    req(x, ['source_acceptance_id', 'source_acceptance_digest', 'source_subject_ref', 'current', 'rights_current', 'private_authority_current'], 'source_acceptance');
    str(x.source_acceptance_id, 'source_acceptance_id'); digest(x.source_acceptance_digest, 'source_acceptance_digest'); str(x.source_subject_ref, 'source_subject_ref');
    bool(x.current, 'source.current'); bool(x.rights_current, 'source.rights_current'); bool(x.private_authority_current, 'source.private_authority_current');
    if (!x.current) fail('BLOCKED_SOURCE_STALE', x.source_acceptance_id);
    if (!x.rights_current || !x.private_authority_current) fail('BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY', x.source_acceptance_id);
    if (sources.has(x.source_acceptance_id)) fail('BLOCKED_REFERENCE_INTEGRITY', x.source_acceptance_id);
    sources.set(x.source_acceptance_id, x);
  }
  array(input.projection_refs_and_digests, 'projection_refs_and_digests');
  for (const x of input.projection_refs_and_digests) {
    req(x, ['projection_id', 'projection_digest', 'source_acceptance_id', 'current'], 'projection');
    str(x.projection_id, 'projection_id'); digest(x.projection_digest, 'projection_digest'); str(x.source_acceptance_id, 'projection.source_acceptance_id'); bool(x.current, 'projection.current');
    if (!x.current) fail('BLOCKED_PROJECTION_STALE', x.projection_id);
    if (!sources.has(x.source_acceptance_id)) fail('BLOCKED_REFERENCE_INTEGRITY', x.projection_id);
    projections.set(x.projection_id, x);
  }
  array(input.manuscript_refs_and_digests, 'manuscript_refs_and_digests');
  for (const x of input.manuscript_refs_and_digests) {
    req(x, ['manuscript_ref', 'manuscript_digest', 'current'], 'manuscript');
    str(x.manuscript_ref, 'manuscript_ref'); digest(x.manuscript_digest, 'manuscript_digest'); bool(x.current, 'manuscript.current');
    if (!x.current) fail('BLOCKED_MANUSCRIPT_STALE', x.manuscript_ref);
    manuscripts.set(x.manuscript_ref, x);
  }
  array(input.b02_recovery_proposal_refs_and_digests, 'b02_recovery_proposal_refs_and_digests');
  for (const x of input.b02_recovery_proposal_refs_and_digests) {
    req(x, ['proposal_ref', 'proposal_digest', 'standing'], 'b02_proposal'); str(x.proposal_ref, 'proposal_ref'); digest(x.proposal_digest, 'proposal_digest');
    if (x.standing !== 'PROPOSED_NOT_CANONICAL') fail('BLOCKED_REFERENCE_INTEGRITY', `b02_standing:${x.proposal_ref}`);
    b02.set(x.proposal_ref, x);
  }
  array(input.provider_projection_refs_and_digests, 'provider_projection_refs_and_digests');
  for (const x of input.provider_projection_refs_and_digests) {
    req(x, ['projection_ref', 'projection_digest', 'provider_subject_ref', 'standing', 'current'], 'provider_projection');
    str(x.projection_ref, 'provider_projection.projection_ref'); digest(x.projection_digest, 'provider_projection.projection_digest'); str(x.provider_subject_ref, 'provider_subject_ref'); bool(x.current, 'provider_projection.current');
    if (!x.current) fail('BLOCKED_PROJECTION_STALE', x.projection_ref);
    if (x.standing !== 'PROJECTION_EVIDENCE') fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', x.projection_ref);
    providers.set(x.projection_ref, x);
  }
  return { sources, projections, manuscripts, b02, providers };
}

function validateInputEnvelope(input, policy) {
  req(input, ['materialization_operation_id', 'materialization_operation_digest', 'book_project_id', 'prior_story_bible_ref', 'prior_story_bible_digest', 'source_acceptance_refs_and_digests', 'projection_refs_and_digests', 'manuscript_refs_and_digests', 'b02_recovery_proposal_refs_and_digests', 'provider_projection_refs_and_digests', 'calibration_policy_ref', 'calibration_policy_digest', 'candidate_records', 'materializer_subject_ref', 'validator_subject_ref', 'prior_knowledge', 'prior_identity_bindings'], 'materialization');
  str(input.book_project_id, 'book_project_id');
  if (input.prior_story_bible_ref === null) {
    if (input.prior_story_bible_digest !== null || input.prior_knowledge !== null) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'first_version');
  } else {
    str(input.prior_story_bible_ref, 'prior_story_bible_ref'); digest(input.prior_story_bible_digest, 'prior_story_bible_digest');
    if (!obj(input.prior_knowledge)) fail('BLOCKED_CURRENT_STORY_BIBLE_STALE', 'prior_knowledge');
  }
  if (input.materializer_subject_ref !== MATERIALIZER_SUBJECT_REF || input.validator_subject_ref !== VALIDATOR_SUBJECT_REF) fail('BLOCKED_REFERENCE_INTEGRITY', 'subject_ref');
  digest(input.materialization_operation_digest, 'materialization_operation_digest');
  if (input.materialization_operation_digest !== materializationOperationDigest(input)) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'operation');
  if (input.materialization_operation_id !== materializationOperationId(input.materialization_operation_digest)) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'operation_id');
  validateCalibrationPolicyV1(policy);
  if (policy.standing !== 'ADMITTED') fail('BLOCKED_CALIBRATION_UNPROVED', policy.standing);
  if (input.calibration_policy_ref !== policyRef(policy) || input.calibration_policy_digest !== policy.policy_digest) fail('BLOCKED_CALIBRATION_POLICY_MISSING', 'binding');
  array(input.candidate_records, 'candidate_records');
  array(input.prior_identity_bindings, 'prior_identity_bindings');
  return validateExactIdentities(input);
}

function idFieldForClass(semanticClass) {
  const m = CLASS_META[semanticClass];
  if (!m) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', `semantic_class:${semanticClass}`);
  return m[1];
}
function generatedStableId(input, candidate, prefix) {
  const basis = [input.book_project_id, candidate.semantic_class, candidate.creation_operation_id, candidate.candidate_local_id];
  return `${prefix}${hash(stable(basis)).slice(0, 24)}`;
}
function ruleMap(policy) { return new Map(policy.rules.map(x => [x.semantic_class, x])); }
function nonDefinitiveStatus(rule) {
  for (const status of ['CONTESTED', 'UNRESOLVED', 'ALTERNATIVE']) if (rule.allowed_output_statuses.includes(status)) return status;
  return null;
}
function unionField(records, field) { return uniqueSorted(records.flatMap(x => Array.isArray(x[field]) ? x[field] : [])); }
function mergeRecordPayload(records, outputStatus) {
  const sorted = [...records].sort((a, b) => stable(a).localeCompare(stable(b)));
  const out = clone(sorted[0]);
  for (const field of ['source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs']) {
    if (Object.prototype.hasOwnProperty.call(out, field)) out[field] = unionField(records, field);
  }
  if (Object.prototype.hasOwnProperty.call(out, 'confidence')) {
    const values = records.map(x => x.confidence).filter(x => typeof x === 'number' && Number.isFinite(x));
    if (values.length) out.confidence = Math.max(...values);
  }
  if (Object.prototype.hasOwnProperty.call(out, 'status') && outputStatus) out.status = outputStatus;
  return out;
}
function replaceRefs(value, remap) {
  if (Array.isArray(value)) return value.map(x => replaceRefs(x, remap));
  if (!obj(value)) return typeof value === 'string' && remap.has(value) ? remap.get(value) : value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = replaceRefs(v, remap);
  return out;
}
function collectionSkeleton(input) {
  const out = {};
  for (const [collection] of Object.values(CLASS_META)) out[collection] = input.prior_knowledge ? clone(input.prior_knowledge[collection] || []) : [];
  return out;
}
function countInc(target, cls, n = 1) { target[cls] = (target[cls] || 0) + n; }
function identityRefs(input) {
  const refs = [];
  input.source_acceptance_refs_and_digests.forEach(x => refs.push(`SOURCE:${x.source_acceptance_id}@${x.source_acceptance_digest}`));
  input.projection_refs_and_digests.forEach(x => refs.push(`PROJECTION:${x.projection_id}@${x.projection_digest}`));
  input.manuscript_refs_and_digests.forEach(x => refs.push(`MANUSCRIPT:${x.manuscript_ref}@${x.manuscript_digest}`));
  input.b02_recovery_proposal_refs_and_digests.forEach(x => refs.push(`B02:${x.proposal_ref}@${x.proposal_digest}`));
  input.provider_projection_refs_and_digests.forEach(x => refs.push(`PROVIDER:${x.projection_ref}@${x.projection_digest}`));
  return refs.sort();
}

function validateCandidateEnvelope(candidate, identities) {
  req(candidate, ['candidate_local_id', 'semantic_class', 'record', 'referent_key', 'origin_type', 'origin_ref', 'origin_digest', 'provider_subject_ref', 'support_status', 'evidence_family', 'creation_operation_id', 'source_acceptance_ids', 'projection_ids', 'manuscript_refs'], 'candidate');
  str(candidate.candidate_local_id, 'candidate_local_id'); str(candidate.referent_key, 'referent_key'); str(candidate.creation_operation_id, 'creation_operation_id'); str(candidate.evidence_family, 'evidence_family');
  if (!CLASS_META[candidate.semantic_class]) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', candidate.semantic_class);
  if (!ORIGINS.has(candidate.origin_type)) fail('BLOCKED_REFERENCE_INTEGRITY', `origin:${candidate.origin_type}`);
  if (!SUPPORT_STATUSES.has(candidate.support_status)) fail('BLOCKED_REFERENCE_INTEGRITY', `support:${candidate.support_status}`);
  if (!obj(candidate.record)) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', `record:${candidate.candidate_local_id}`);
  digest(candidate.origin_digest, 'candidate.origin_digest');
  array(candidate.source_acceptance_ids, 'candidate.source_acceptance_ids'); array(candidate.projection_ids, 'candidate.projection_ids'); array(candidate.manuscript_refs, 'candidate.manuscript_refs');
  for (const id of candidate.source_acceptance_ids) if (!identities.sources.has(id)) fail('BLOCKED_REFERENCE_INTEGRITY', `source:${id}`);
  for (const id of candidate.projection_ids) if (!identities.projections.has(id)) fail('BLOCKED_REFERENCE_INTEGRITY', `projection:${id}`);
  for (const id of candidate.manuscript_refs) if (!identities.manuscripts.has(id)) fail('BLOCKED_REFERENCE_INTEGRITY', `manuscript:${id}`);
  if (candidate.origin_type === 'B02_RECOVERY') {
    const x = identities.b02.get(candidate.origin_ref);
    if (!x || x.proposal_digest !== candidate.origin_digest || x.standing !== 'PROPOSED_NOT_CANONICAL') fail('BLOCKED_REFERENCE_INTEGRITY', `b02:${candidate.origin_ref}`);
    if (candidate.provider_subject_ref !== null) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', candidate.candidate_local_id);
  } else if (candidate.origin_type === 'PROVIDER_PROJECTION') {
    const x = identities.providers.get(candidate.origin_ref);
    if (!x || x.projection_digest !== candidate.origin_digest || x.provider_subject_ref !== candidate.provider_subject_ref) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', candidate.origin_ref);
  } else {
    if (candidate.origin_ref !== 'BOOK_DETERMINISTIC' || candidate.provider_subject_ref !== null) fail('BLOCKED_REFERENCE_INTEGRITY', candidate.candidate_local_id);
  }
}

function materializeStoryBibleKnowledgeCandidateV1(input, policy) {
  const identities = validateInputEnvelope(input, policy);
  if (input.prior_knowledge) kb.validateStoryBibleKnowledgeV1(input.prior_knowledge, { expected_book_project_id: input.book_project_id });
  const rules = ruleMap(policy);
  const priorBindingsByReferent = new Map();
  const priorReferentByStableId = new Map();
  for (const b of input.prior_identity_bindings) {
    req(b, ['semantic_class', 'referent_key', 'stable_id'], 'prior_identity_binding');
    const meta = CLASS_META[b.semantic_class]; if (!meta) fail('BLOCKED_STABLE_ID_CONFLICT', b.semantic_class);
    str(b.referent_key, 'prior_identity_binding.referent_key'); str(b.stable_id, 'prior_identity_binding.stable_id');
    if (!b.stable_id.startsWith(meta[2])) fail('BLOCKED_STABLE_ID_CONFLICT', b.stable_id);
    const key = `${b.semantic_class}|${b.referent_key}`;
    if (priorBindingsByReferent.has(key) && priorBindingsByReferent.get(key) !== b.stable_id) fail('BLOCKED_STABLE_ID_CONFLICT', key);
    if (priorReferentByStableId.has(b.stable_id) && priorReferentByStableId.get(b.stable_id) !== key) fail('BLOCKED_STABLE_ID_CONFLICT', b.stable_id);
    priorBindingsByReferent.set(key, b.stable_id); priorReferentByStableId.set(b.stable_id, key);
  }
  const inputCounts = {}, admittedCounts = {}, alternativeCounts = {}, unresolvedCounts = {}, contestedCounts = {}, rejectedCounts = {};
  const rejectionReasons = [], lineage = [], remap = new Map(), groups = new Map();
  for (const c of input.candidate_records) {
    validateCandidateEnvelope(c, identities); countInc(inputCounts, c.semantic_class);
    const meta = CLASS_META[c.semantic_class], idField = meta[1], prefix = meta[2], proposed = c.record[idField];
    let stableId = proposed;
    if (!text(stableId) || !stableId.startsWith(prefix)) stableId = generatedStableId(input, c, prefix);
    const priorSame = priorBindingsByReferent.get(`${c.semantic_class}|${c.referent_key}`);
    if (priorSame) stableId = priorSame;
    const oldKey = priorReferentByStableId.get(stableId);
    if (oldKey && oldKey !== `${c.semantic_class}|${c.referent_key}`) {
      const oldId = stableId;
      stableId = generatedStableId(input, c, prefix);
      if (stableId === oldId) fail('BLOCKED_STABLE_ID_CONFLICT', oldId);
      remap.set(oldId, stableId);
      lineage.push({
        lineage_id: `LINEAGE:${hash(`${oldId}|${stableId}|${c.referent_key}`).slice(0, 24)}`,
        relation: 'SUPERSEDES',
        from_ids: [oldId],
        to_ids: [stableId],
        provenance_refs: uniqueSorted([...(c.record.provenance_refs || []), `evidence://materializer/${input.materialization_operation_id}`])
      });
    } else if (text(proposed) && proposed !== stableId) {
      remap.set(proposed, stableId);
    }
    const groupKey = `${c.semantic_class}|${stableId}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { semanticClass: c.semantic_class, stableId, referentKey: c.referent_key, candidates: [] });
    const g = groups.get(groupKey);
    if (g.referentKey !== c.referent_key) fail('BLOCKED_STABLE_ID_CONFLICT', stableId);
    g.candidates.push(c);
  }
  const collections = collectionSkeleton(input);
  const accepted = [];
  for (const g of groups.values()) {
    const rule = rules.get(g.semanticClass);
    if (!rule) fail('BLOCKED_CALIBRATION_POLICY_MISSING', g.semanticClass);
    const candidates = g.candidates;
    const providerSubjects = uniqueSorted(candidates.map(x => x.provider_subject_ref).filter(Boolean));
    for (const subject of providerSubjects) if (!policy.provider_subject_scopes.includes(subject)) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', subject);
    const evidenceFamilies = new Set(candidates.map(x => x.evidence_family));
    const supports = new Set(candidates.map(x => x.support_status));
    const records = candidates.map(x => replaceRefs({ ...clone(x.record), [idFieldForClass(g.semanticClass)]: g.stableId }, remap));
    const requestedStatuses = uniqueSorted(records.map(x => x.status).filter(Boolean));
    let outputStatus = requestedStatuses.length === 1 ? requestedStatuses[0] : nonDefinitiveStatus(rule);
    let rejectCode = null;
    if ([...supports].some(x => !rule.allowed_support_statuses.includes(x))) rejectCode = 'BLOCKED_CALIBRATION_UNPROVED';
    if (g.semanticClass !== 'ANCHOR' && outputStatus && !rule.allowed_output_statuses.includes(outputStatus)) outputStatus = nonDefinitiveStatus(rule);
    const confidence = Math.max(...records.map(x => typeof x.confidence === 'number' ? x.confidence : 0));
    const uncalibrated = rule.admission_mode === 'CALIBRATED_MODEL' && rule.calibration_evidence_refs.length === 0;
    const underEvidence = evidenceFamilies.size < rule.min_distinct_evidence_families;
    const underConfidence = rule.min_confidence !== null && confidence < rule.min_confidence;
    if (rule.admission_mode === 'AUTHOR_REQUIRED') outputStatus = nonDefinitiveStatus(rule);
    if (uncalibrated || underEvidence || underConfidence) {
      if (rule.abstain_when_uncalibrated) outputStatus = nonDefinitiveStatus(rule);
      else rejectCode = 'BLOCKED_CALIBRATION_UNPROVED';
    }
    if (supports.has('CONTESTED')) outputStatus = nonDefinitiveStatus(rule);
    if (g.semanticClass !== 'ANCHOR' && (!outputStatus || !rule.allowed_output_statuses.includes(outputStatus))) rejectCode = rule.admission_mode === 'AUTHOR_REQUIRED' ? 'BLOCKED_CONTESTED_AUTHORITY_REQUIRED' : 'BLOCKED_CALIBRATION_UNPROVED';
    if (rejectCode) {
      countInc(rejectedCounts, g.semanticClass);
      for (const c of candidates) rejectionReasons.push({
        candidate_local_id: c.candidate_local_id,
        semantic_class: c.semantic_class,
        code: rejectCode,
        origin_ref: c.origin_ref,
        origin_digest: c.origin_digest,
        evidence_refs: uniqueSorted(c.record.evidence_refs || []),
        provenance_refs: uniqueSorted(c.record.provenance_refs || [])
      });
      continue;
    }
    const merged = replaceRefs(mergeRecordPayload(records, outputStatus), remap);
    const [collection, idField] = CLASS_META[g.semanticClass];
    merged[idField] = g.stableId;
    const list = collections[collection];
    const index = list.findIndex(x => x[idField] === g.stableId);
    if (index >= 0) list[index] = merged; else list.push(merged);
    accepted.push({ semanticClass: g.semanticClass, record: merged });
    countInc(admittedCounts, g.semanticClass);
    if (merged.status === 'ALTERNATIVE') countInc(alternativeCounts, g.semanticClass);
    if (merged.status === 'UNRESOLVED') countInc(unresolvedCounts, g.semanticClass);
    if (merged.status === 'CONTESTED') countInc(contestedCounts, g.semanticClass);
  }
  const sourceSubjects = uniqueSorted(input.source_acceptance_refs_and_digests.map(x => x.source_subject_ref));
  const knowledge = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: input.book_project_id,
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: input.prior_story_bible_ref,
    source_subject_refs: sourceSubjects,
    source_acceptance_refs: input.source_acceptance_refs_and_digests.map(x => ({ source_acceptance_id: x.source_acceptance_id, source_acceptance_digest: x.source_acceptance_digest })),
    projection_refs: input.projection_refs_and_digests.map(x => ({ projection_id: x.projection_id, projection_digest: x.projection_digest, source_acceptance_id: x.source_acceptance_id })),
    manuscript_refs: input.manuscript_refs_and_digests.map(x => ({ manuscript_ref: x.manuscript_ref, manuscript_digest: x.manuscript_digest })),
    calibration_policy_ref: input.calibration_policy_ref,
    calibration_policy_digest: input.calibration_policy_digest,
    ...collections,
    identity_lineage: uniqueLineage([...(input.prior_knowledge ? input.prior_knowledge.identity_lineage || [] : []), ...lineage]),
    standing: 'MATERIALIZED_NOT_CANONICAL'
  };
  knowledge.knowledge_digest = kb.knowledgeDigest(knowledge);
  knowledge.knowledge_candidate_id = kb.knowledgeCandidateId(knowledge.knowledge_digest);
  try {
    kb.validateStoryBibleKnowledgeV1(knowledge, { expected_book_project_id: input.book_project_id, prior_knowledge: input.prior_knowledge || null });
  } catch (err) {
    fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', `${err.code || err.name}:${err.detail || ''}`);
  }
  const receipt = {
    receipt_schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_id: '',
    receipt_digest: '',
    materialization_operation_id: input.materialization_operation_id,
    materialization_operation_digest: input.materialization_operation_digest,
    materializer_subject_ref: input.materializer_subject_ref,
    validator_subject_ref: input.validator_subject_ref,
    prior_story_bible_ref: input.prior_story_bible_ref,
    input_identity_refs: identityRefs(input),
    calibration_policy_ref: input.calibration_policy_ref,
    calibration_policy_digest: input.calibration_policy_digest,
    input_counts_by_class: inputCounts,
    admitted_counts_by_class: admittedCounts,
    alternative_counts_by_class: alternativeCounts,
    unresolved_counts_by_class: unresolvedCounts,
    contested_counts_by_class: contestedCounts,
    rejected_counts_by_class: rejectedCounts,
    rejection_reasons: rejectionReasons,
    identity_lineage_changes: lineage,
    knowledge_candidate_id: knowledge.knowledge_candidate_id,
    knowledge_digest: knowledge.knowledge_digest,
    knowledge_valid: true,
    raw_manuscript_text_persisted: false,
    canonical_write_performed: false
  };
  receipt.receipt_digest = receiptDigest(receipt);
  receipt.receipt_id = `${RECEIPT_PREFIX}${receipt.receipt_digest}`;
  return {
    result: 'MATERIALIZED_NOT_CANONICAL',
    materialization_operation_id: input.materialization_operation_id,
    knowledge,
    receipt,
    canonical_effect: false,
    model_accuracy_claimed: false,
    author_decision_synthesized: false,
    b01_registry_modified: false,
    historical_pass_transferred: 0,
    invalidation_engine_implemented: false,
    canonical_admission_implemented: false
  };
}

function uniqueLineage(items) {
  const byId = new Map();
  for (const x of items) {
    if (byId.has(x.lineage_id) && stable(byId.get(x.lineage_id)) !== stable(x)) fail('BLOCKED_STABLE_ID_CONFLICT', x.lineage_id);
    byId.set(x.lineage_id, clone(x));
  }
  return [...byId.values()].sort((a, b) => a.lineage_id.localeCompare(b.lineage_id));
}
function receiptSemantic(receipt) {
  const x = clone(receipt); delete x.receipt_id; delete x.receipt_digest; delete x.audit_metadata; return x;
}
function receiptDigest(receipt) { return hash(receiptSemantic(receipt)); }
function validateMaterializationReceiptV1(receipt) {
  req(receipt, ['receipt_schema_version', 'receipt_id', 'receipt_digest', 'materialization_operation_id', 'materialization_operation_digest', 'materializer_subject_ref', 'validator_subject_ref', 'prior_story_bible_ref', 'input_identity_refs', 'calibration_policy_ref', 'calibration_policy_digest', 'input_counts_by_class', 'admitted_counts_by_class', 'alternative_counts_by_class', 'unresolved_counts_by_class', 'contested_counts_by_class', 'rejected_counts_by_class', 'rejection_reasons', 'identity_lineage_changes', 'knowledge_candidate_id', 'knowledge_digest', 'knowledge_valid', 'raw_manuscript_text_persisted', 'canonical_write_performed'], 'receipt');
  if (receipt.receipt_schema_version !== RECEIPT_SCHEMA_VERSION) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', 'receipt_schema');
  digest(receipt.receipt_digest, 'receipt.receipt_digest');
  if (receipt.receipt_digest !== receiptDigest(receipt) || receipt.receipt_id !== `${RECEIPT_PREFIX}${receipt.receipt_digest}`) fail('BLOCKED_KNOWLEDGE_DIGEST_MISMATCH', 'receipt');
  if (receipt.raw_manuscript_text_persisted !== false || receipt.canonical_write_performed !== false || receipt.knowledge_valid !== true) fail('BLOCKED_KNOWLEDGE_SCHEMA_INVALID', 'receipt_effect');
  return true;
}

module.exports = {
  BookKnowledgeMaterializationError,
  POLICY_SCHEMA_VERSION,
  RECEIPT_SCHEMA_VERSION,
  MATERIALIZER_SUBJECT_REF,
  VALIDATOR_SUBJECT_REF,
  CLASS_META,
  policyRef,
  policyDigest,
  sealCalibrationPolicyV1,
  validateCalibrationPolicyV1,
  materializationOperationDigest,
  materializationOperationId,
  sealMaterializationInputV1,
  materializeStoryBibleKnowledgeCandidateV1,
  receiptDigest,
  validateMaterializationReceiptV1
};
