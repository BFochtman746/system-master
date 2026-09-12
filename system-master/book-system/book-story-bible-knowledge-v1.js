'use strict';
const crypto = require('crypto');
const KNOWLEDGE_SCHEMA_VERSION = 'BOOK_STORY_BIBLE_KNOWLEDGE_V1';
const CANDIDATE_PREFIX = 'book-story-bible-knowledge-v1:';
const SHA256 = /^[a-f0-9]{64}$/;
const TOP_LEVEL_STANDINGS = new Set([
  'MATERIALIZED_NOT_CANONICAL',
  'READY_FOR_GOVERNED_ADMISSION',
  'BLOCKED_INVALID',
  'BLOCKED_STALE',
  'BLOCKED_AUTHORITY_REQUIRED'
]);
const EPISTEMIC_STATUSES = new Set(['ASSERTED', 'ALTERNATIVE', 'UNRESOLVED', 'CONTESTED', 'INVALIDATED']);
const ENTITY_TYPES = new Set(['CHARACTER', 'PLACE', 'OBJECT', 'GROUP', 'ABSTRACT', 'OTHER']);
const TEMPORAL_RELATIONS = new Set(['STORY_TIME_BEFORE', 'STORY_TIME_AFTER', 'STORY_TIME_OVERLAPS', 'SAME_STORY_EVENT', 'DISCOURSE_PRECEDES']);
const CAUSAL_RELATIONS = new Set(['CAUSES', 'ENABLES', 'PREVENTS', 'GOAL_SUPPORTS', 'PRECONDITION_OF', 'EFFECT_OF']);
const KNOWLEDGE_TYPES = new Set(['KNOWS', 'BELIEVES', 'PERCEIVES']);
const ARC_TYPES = new Set(['CHARACTER', 'RELATIONSHIP', 'PLOT', 'MOTIF', 'THEME', 'OTHER']);
const BEAT_ROLES = new Set(['INTRODUCE', 'DEVELOP', 'COMPLICATE', 'REVERSE', 'TRANSFORM', 'CALLBACK', 'PAYOFF', 'CLOSE', 'REOPEN', 'OTHER']);
const ARC_STATUSES = new Set(['ACTIVE', 'CLOSED', 'INTENTIONALLY_OPEN', 'INVALIDATED']);
const THEME_KINDS = new Set(['THEME', 'IDEA', 'SUBTEXT']);
const PROMISE_STATUSES = new Set(['OPEN', 'PARTIAL', 'FULFILLED', 'INTENTIONALLY_UNRESOLVED', 'INVALIDATED']);
const SETUP_PAYOFF_STATUSES = new Set(['OPEN', 'PARTIAL', 'PAID_OFF', 'INTENTIONALLY_UNRESOLVED', 'INVALIDATED']);
const OPEN_QUESTION_STATUSES = new Set(['OPEN', 'PARTIAL', 'CLOSED', 'INTENTIONALLY_UNRESOLVED', 'INVALIDATED']);
const DURATION_PRECISION = new Set(['EXACT', 'APPROXIMATE', 'RANGE', 'UNKNOWN']);
const FREQUENCY_CLASSES = new Set(['ONCE', 'REPEATED', 'HABITUAL', 'ITERATIVE', 'UNKNOWN']);
const TEMPORAL_COMPATIBILITY = new Set(['COMPATIBLE', 'AMBIGUOUS', 'UNKNOWN', 'INCOMPATIBLE']);
const LINEAGE_RELATIONS = new Set(['SUPERSEDES', 'MERGED_FROM', 'SPLIT_FROM']);
const COLLECTIONS = [
  ['anchors', 'anchor_id', 'ANCHOR:'],
  ['entities', 'entity_id', 'ENTITY:'],
  ['events', 'event_id', 'EVENT:'],
  ['temporal_claims', 'temporal_claim_id', 'TEMPORAL:'],
  ['causal_goal_claims', 'causal_goal_claim_id', 'CAUSAL:'],
  ['state_assertions', 'state_assertion_id', 'STATE:'],
  ['character_knowledge_claims', 'knowledge_claim_id', 'KNOWLEDGE:'],
  ['relationships', 'relationship_id', 'RELATIONSHIP:'],
  ['arcs', 'arc_id', 'ARC:'],
  ['motifs', 'motif_id', 'MOTIF:'],
  ['themes', 'theme_id', 'THEME:'],
  ['promises', 'promise_id', 'PROMISE:'],
  ['setup_payoffs', 'setup_payoff_id', 'SETUP_PAYOFF:'],
  ['open_questions', 'open_question_id', 'OPEN_QUESTION:']
];
const REQUIRED_TOP = [
  'knowledge_schema_version', 'book_project_id', 'knowledge_candidate_id', 'knowledge_digest',
  'prior_story_bible_ref', 'source_subject_refs', 'source_acceptance_refs', 'projection_refs',
  'manuscript_refs', 'calibration_policy_ref', 'calibration_policy_digest', 'anchors', 'entities',
  'events', 'temporal_claims', 'causal_goal_claims', 'state_assertions', 'character_knowledge_claims',
  'relationships', 'arcs', 'motifs', 'themes', 'promises', 'setup_payoffs', 'open_questions',
  'identity_lineage', 'standing'
];
const FORBIDDEN_KEY_PATTERNS = [
  /raw.*(?:manuscript|source|document|text|bytes)/i,
  /(?:manuscript|source|document).*text/i,
  /quoted.*text/i,
  /full.*text/i,
  /private.*(?:payload|content|text)/i,
  /credential/i,
  /access.*token/i,
  /secret/i,
  /chain.*of.*thought/i,
  /author.*intent/i,
  /literary.*quality/i,
  /quality.*score/i,
  /revision.*instruction/i,
  /reader.*state/i,
  /focaliz/i,
  /narrative.*function/i,
  /passage.*purpose/i,
  /scene.*purpose/i
];
class BookStoryBibleKnowledgeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookStoryBibleKnowledgeError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookStoryBibleKnowledgeError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function sha(v) { return typeof v === 'string' && SHA256.test(v); }
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
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const field of fields) if (!own(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function array(v, label) { if (!Array.isArray(v)) fail('ARRAY_REQUIRED', label); }
function ref(v, label) { if (!text(v)) fail('REFERENCE_REQUIRED', label); }
function digest(v, label) { if (!sha(v)) fail('INVALID_SHA256', label); }
function number01(v, label, nullable = false) {
  if (nullable && v === null) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) fail('INVALID_CONFIDENCE', label);
}
function noForbidden(v, path = '$') {
  if (Array.isArray(v)) return v.forEach((x, i) => noForbidden(x, `${path}[${i}]`));
  if (!obj(v)) return;
  for (const [key, child] of Object.entries(v)) {
    if (FORBIDDEN_KEY_PATTERNS.some(r => r.test(key))) fail('FORBIDDEN_KNOWLEDGE_FIELD', `${path}.${key}`);
    noForbidden(child, `${path}.${key}`);
  }
}
function textArray(v, label, { allowEmpty = true } = {}) {
  array(v, label);
  if (!allowEmpty && v.length === 0) fail('NONEMPTY_ARRAY_REQUIRED', label);
  v.forEach((x, i) => ref(x, `${label}.${i}`));
}
function uniqueStrings(v, label) {
  textArray(v, label);
  const seen = new Set();
  for (const x of v) {
    if (seen.has(x)) fail('DUPLICATE_REFERENCE', `${label}:${x}`);
    seen.add(x);
  }
}
function validateTypedId(id, prefix, label) {
  ref(id, label);
  if (!id.startsWith(prefix) || id.length <= prefix.length) fail('INVALID_STABLE_ID_PREFIX', `${label}:${id}`);
}
function validateCommon(record, idField, prefix, label, { statusSet = EPISTEMIC_STATUSES, confidenceNullable = false } = {}) {
  req(record, [idField, 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateTypedId(record[idField], prefix, `${label}.${idField}`);
  if (!statusSet.has(record.status)) fail('INVALID_RECORD_STATUS', `${label}.${record.status}`);
  number01(record.confidence, `${label}.confidence`, confidenceNullable);
  uniqueStrings(record.source_anchor_ids, `${label}.source_anchor_ids`);
  uniqueStrings(record.provenance_refs, `${label}.provenance_refs`);
  uniqueStrings(record.evidence_refs, `${label}.evidence_refs`);
  uniqueStrings(record.depends_on_refs, `${label}.depends_on_refs`);
  if (record.provenance_refs.length === 0) fail('PROVENANCE_REQUIRED', label);
}
function knowledgeSemantic(candidate) {
  const out = clone(candidate);
  delete out.knowledge_candidate_id;
  delete out.knowledge_digest;
  delete out.audit_metadata;
  delete out.ui_labels;
  delete out.retry_counters;
  delete out.transport_metadata;
  return out;
}
function knowledgeDigest(candidate) { return sha256(knowledgeSemantic(candidate)); }
function knowledgeCandidateId(candidateOrDigest) {
  const d = typeof candidateOrDigest === 'string' ? candidateOrDigest : knowledgeDigest(candidateOrDigest);
  return `${CANDIDATE_PREFIX}${d}`;
}
function validateTopBindings(candidate) {
  uniqueStrings(candidate.source_subject_refs, 'source_subject_refs');
  array(candidate.source_acceptance_refs, 'source_acceptance_refs');
  const sourceIds = new Map();
  candidate.source_acceptance_refs.forEach((x, i) => {
    req(x, ['source_acceptance_id', 'source_acceptance_digest'], `source_acceptance_refs.${i}`);
    ref(x.source_acceptance_id, `source_acceptance_refs.${i}.source_acceptance_id`);
    digest(x.source_acceptance_digest, `source_acceptance_refs.${i}.source_acceptance_digest`);
    if (sourceIds.has(x.source_acceptance_id)) fail('DUPLICATE_SOURCE_ACCEPTANCE_REF', x.source_acceptance_id);
    sourceIds.set(x.source_acceptance_id, x.source_acceptance_digest);
  });
  array(candidate.projection_refs, 'projection_refs');
  const projectionIds = new Map();
  candidate.projection_refs.forEach((x, i) => {
    req(x, ['projection_id', 'projection_digest', 'source_acceptance_id'], `projection_refs.${i}`);
    ref(x.projection_id, `projection_refs.${i}.projection_id`);
    digest(x.projection_digest, `projection_refs.${i}.projection_digest`);
    ref(x.source_acceptance_id, `projection_refs.${i}.source_acceptance_id`);
    if (!sourceIds.has(x.source_acceptance_id)) fail('PROJECTION_SOURCE_ACCEPTANCE_UNRESOLVED', x.projection_id);
    if (projectionIds.has(x.projection_id)) fail('DUPLICATE_PROJECTION_REF', x.projection_id);
    projectionIds.set(x.projection_id, { digest: x.projection_digest, source_acceptance_id: x.source_acceptance_id });
  });
  array(candidate.manuscript_refs, 'manuscript_refs');
  const manuscripts = new Map();
  candidate.manuscript_refs.forEach((x, i) => {
    req(x, ['manuscript_ref', 'manuscript_digest'], `manuscript_refs.${i}`);
    ref(x.manuscript_ref, `manuscript_refs.${i}.manuscript_ref`);
    digest(x.manuscript_digest, `manuscript_refs.${i}.manuscript_digest`);
    if (manuscripts.has(x.manuscript_ref)) fail('DUPLICATE_MANUSCRIPT_REF', x.manuscript_ref);
    manuscripts.set(x.manuscript_ref, x.manuscript_digest);
  });
  ref(candidate.calibration_policy_ref, 'calibration_policy_ref');
  digest(candidate.calibration_policy_digest, 'calibration_policy_digest');
  return { sourceIds, projectionIds, manuscripts };
}
function validateAnchor(a, i, bindings) {
  const label = `anchors.${i}`;
  req(a, ['anchor_id', 'source_acceptance_id', 'source_acceptance_digest', 'projection_id', 'projection_digest', 'manuscript_ref', 'unit_ref', 'ordinal', 'span_start', 'span_end', 'span_sha256', 'source_current', 'provenance_refs'], label);
  validateTypedId(a.anchor_id, 'ANCHOR:', `${label}.anchor_id`);
  ref(a.source_acceptance_id, `${label}.source_acceptance_id`);
  digest(a.source_acceptance_digest, `${label}.source_acceptance_digest`);
  ref(a.projection_id, `${label}.projection_id`);
  digest(a.projection_digest, `${label}.projection_digest`);
  ref(a.manuscript_ref, `${label}.manuscript_ref`);
  if (a.unit_ref !== null) ref(a.unit_ref, `${label}.unit_ref`);
  if (!Number.isInteger(a.ordinal) || a.ordinal < 0) fail('INVALID_ANCHOR_ORDINAL', label);
  if (!Number.isInteger(a.span_start) || !Number.isInteger(a.span_end) || a.span_start < 0 || a.span_end < a.span_start) fail('INVALID_ANCHOR_SPAN', label);
  digest(a.span_sha256, `${label}.span_sha256`);
  if (a.source_current !== true) fail('ANCHOR_SOURCE_NOT_CURRENT', a.anchor_id);
  uniqueStrings(a.provenance_refs, `${label}.provenance_refs`);
  if (a.provenance_refs.length === 0) fail('PROVENANCE_REQUIRED', label);
  const acceptedDigest = bindings.sourceIds.get(a.source_acceptance_id);
  if (!acceptedDigest || acceptedDigest !== a.source_acceptance_digest) fail('ANCHOR_SOURCE_ACCEPTANCE_MISMATCH', a.anchor_id);
  const p = bindings.projectionIds.get(a.projection_id);
  if (!p || p.digest !== a.projection_digest || p.source_acceptance_id !== a.source_acceptance_id) fail('ANCHOR_PROJECTION_MISMATCH', a.anchor_id);
  if (!bindings.manuscripts.has(a.manuscript_ref)) fail('ANCHOR_MANUSCRIPT_UNRESOLVED', a.anchor_id);
}
function validateEntity(x, i) {
  const label = `entities.${i}`;
  req(x, ['entity_id', 'entity_type', 'aliases', 'source_anchor_ids', 'state_assertion_ids', 'status', 'confidence', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'entity_id', 'ENTITY:', label);
  if (!ENTITY_TYPES.has(x.entity_type)) fail('INVALID_ENTITY_TYPE', `${label}.${x.entity_type}`);
  textArray(x.aliases, `${label}.aliases`);
  uniqueStrings(x.state_assertion_ids, `${label}.state_assertion_ids`);
}
function validateEvent(x, i) {
  const label = `events.${i}`;
  req(x, ['event_id', 'event_family_id', 'participant_entity_ids', 'source_anchor_ids', 'state_change_ids', 'goal_relation_ids', 'status', 'confidence', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'event_id', 'EVENT:', label);
  if (x.event_family_id !== null) validateTypedId(x.event_family_id, 'EVENT_FAMILY:', `${label}.event_family_id`);
  uniqueStrings(x.participant_entity_ids, `${label}.participant_entity_ids`);
  uniqueStrings(x.state_change_ids, `${label}.state_change_ids`);
  uniqueStrings(x.goal_relation_ids, `${label}.goal_relation_ids`);
}
function validateDuration(d, label) {
  if (d === null) return;
  req(d, ['value', 'unit', 'lower_bound', 'upper_bound', 'precision'], label);
  if (!DURATION_PRECISION.has(d.precision)) fail('INVALID_DURATION_PRECISION', label);
  if (d.unit !== null && !text(d.unit)) fail('INVALID_DURATION_UNIT', label);
  for (const k of ['value', 'lower_bound', 'upper_bound']) if (d[k] !== null && (typeof d[k] !== 'number' || !Number.isFinite(d[k]) || d[k] < 0)) fail('INVALID_DURATION_VALUE', `${label}.${k}`);
  if (d.precision === 'EXACT' && d.value === null) fail('DURATION_VALUE_REQUIRED', label);
  if (d.precision === 'RANGE' && (d.lower_bound === null || d.upper_bound === null || d.lower_bound > d.upper_bound)) fail('INVALID_DURATION_RANGE', label);
}
function validateFrequency(f, label) {
  if (f === null) return;
  req(f, ['count', 'recurrence_class', 'lower_bound', 'upper_bound'], label);
  if (!FREQUENCY_CLASSES.has(f.recurrence_class)) fail('INVALID_FREQUENCY_CLASS', label);
  for (const k of ['count', 'lower_bound', 'upper_bound']) if (f[k] !== null && (!Number.isInteger(f[k]) || f[k] < 0)) fail('INVALID_FREQUENCY_VALUE', `${label}.${k}`);
  if (f.lower_bound !== null && f.upper_bound !== null && f.lower_bound > f.upper_bound) fail('INVALID_FREQUENCY_RANGE', label);
}
function validateTemporal(x, i) {
  const label = `temporal_claims.${i}`;
  req(x, ['temporal_claim_id', 'relation_type', 'subject_ref', 'object_ref', 'duration', 'frequency', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'temporal_claim_id', 'TEMPORAL:', label);
  if (!TEMPORAL_RELATIONS.has(x.relation_type)) fail('INVALID_TEMPORAL_RELATION', label);
  ref(x.subject_ref, `${label}.subject_ref`); ref(x.object_ref, `${label}.object_ref`);
  validateDuration(x.duration, `${label}.duration`);
  validateFrequency(x.frequency, `${label}.frequency`);
}
function validateCausal(x, i) {
  const label = `causal_goal_claims.${i}`;
  req(x, ['causal_goal_claim_id', 'relation_type', 'subject_ref', 'object_ref', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'causal_goal_claim_id', 'CAUSAL:', label);
  if (!CAUSAL_RELATIONS.has(x.relation_type)) fail('INVALID_CAUSAL_RELATION', label);
  ref(x.subject_ref, `${label}.subject_ref`); ref(x.object_ref, `${label}.object_ref`);
}
function validateState(x, i) {
  const label = `state_assertions.${i}`;
  req(x, ['state_assertion_id', 'subject_ref', 'predicate', 'value', 'valid_from_event_ref', 'valid_to_event_ref', 'change_event_refs', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'state_assertion_id', 'STATE:', label);
  ref(x.subject_ref, `${label}.subject_ref`); ref(x.predicate, `${label}.predicate`);
  if (x.value === undefined || typeof x.value === 'function') fail('INVALID_STATE_VALUE', label);
  if (x.valid_from_event_ref !== null) ref(x.valid_from_event_ref, `${label}.valid_from_event_ref`);
  if (x.valid_to_event_ref !== null) ref(x.valid_to_event_ref, `${label}.valid_to_event_ref`);
  uniqueStrings(x.change_event_refs, `${label}.change_event_refs`);
}
function validateKnowledgeClaim(x, i) {
  const label = `character_knowledge_claims.${i}`;
  req(x, ['knowledge_claim_id', 'claim_type', 'character_entity_id', 'object_ref', 'exposure_event_refs', 'temporal_compatibility', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'knowledge_claim_id', 'KNOWLEDGE:', label);
  if (!KNOWLEDGE_TYPES.has(x.claim_type)) fail('INVALID_CHARACTER_KNOWLEDGE_TYPE', label);
  ref(x.character_entity_id, `${label}.character_entity_id`); ref(x.object_ref, `${label}.object_ref`);
  uniqueStrings(x.exposure_event_refs, `${label}.exposure_event_refs`);
  if (!TEMPORAL_COMPATIBILITY.has(x.temporal_compatibility)) fail('INVALID_TEMPORAL_COMPATIBILITY', label);
}
function validateRelationship(x, i) {
  const label = `relationships.${i}`;
  req(x, ['relationship_id', 'participant_entity_ids', 'relationship_kind', 'state_assertion_ids', 'change_event_ids', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'relationship_id', 'RELATIONSHIP:', label);
  uniqueStrings(x.participant_entity_ids, `${label}.participant_entity_ids`);
  if (x.participant_entity_ids.length < 2) fail('RELATIONSHIP_PARTICIPANTS_REQUIRED', label);
  ref(x.relationship_kind, `${label}.relationship_kind`);
  uniqueStrings(x.state_assertion_ids, `${label}.state_assertion_ids`);
  uniqueStrings(x.change_event_ids, `${label}.change_event_ids`);
}
function validateArc(x, i) {
  const label = `arcs.${i}`;
  req(x, ['arc_id', 'arc_type', 'subject_refs', 'beats', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'arc_id', 'ARC:', label, { statusSet: ARC_STATUSES });
  if (!ARC_TYPES.has(x.arc_type)) fail('INVALID_ARC_TYPE', label);
  uniqueStrings(x.subject_refs, `${label}.subject_refs`);
  array(x.beats, `${label}.beats`);
  const beatIds = new Set();
  x.beats.forEach((b, j) => {
    const bl = `${label}.beats.${j}`;
    req(b, ['beat_id', 'event_refs', 'role', 'status', 'confidence', 'provenance_refs'], bl);
    ref(b.beat_id, `${bl}.beat_id`);
    if (beatIds.has(b.beat_id)) fail('DUPLICATE_ARC_BEAT_ID', b.beat_id); beatIds.add(b.beat_id);
    uniqueStrings(b.event_refs, `${bl}.event_refs`);
    if (!BEAT_ROLES.has(b.role)) fail('INVALID_ARC_BEAT_ROLE', bl);
    if (!EPISTEMIC_STATUSES.has(b.status)) fail('INVALID_RECORD_STATUS', `${bl}.${b.status}`);
    number01(b.confidence, `${bl}.confidence`);
    uniqueStrings(b.provenance_refs, `${bl}.provenance_refs`);
    if (!b.provenance_refs.length) fail('PROVENANCE_REQUIRED', bl);
  });
}
function validateMotif(x, i) {
  const label = `motifs.${i}`;
  req(x, ['motif_id', 'label', 'occurrence_event_ids', 'occurrence_anchor_ids', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'motif_id', 'MOTIF:', label);
  ref(x.label, `${label}.label`);
  uniqueStrings(x.occurrence_event_ids, `${label}.occurrence_event_ids`);
  uniqueStrings(x.occurrence_anchor_ids, `${label}.occurrence_anchor_ids`);
}
function validateTheme(x, i) {
  const label = `themes.${i}`;
  req(x, ['theme_id', 'kind', 'label', 'subject_refs', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'theme_id', 'THEME:', label);
  if (!THEME_KINDS.has(x.kind)) fail('INVALID_THEME_KIND', label);
  ref(x.label, `${label}.label`);
  uniqueStrings(x.subject_refs, `${label}.subject_refs`);
}
function validatePromise(x, i) {
  const label = `promises.${i}`;
  req(x, ['promise_id', 'introduced_event_refs', 'related_open_question_refs', 'related_setup_payoff_refs', 'resolution_event_refs', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'promise_id', 'PROMISE:', label, { statusSet: PROMISE_STATUSES });
  uniqueStrings(x.introduced_event_refs, `${label}.introduced_event_refs`);
  uniqueStrings(x.related_open_question_refs, `${label}.related_open_question_refs`);
  uniqueStrings(x.related_setup_payoff_refs, `${label}.related_setup_payoff_refs`);
  uniqueStrings(x.resolution_event_refs, `${label}.resolution_event_refs`);
}
function validateSetupPayoff(x, i) {
  const label = `setup_payoffs.${i}`;
  req(x, ['setup_payoff_id', 'setup_event_refs', 'payoff_event_refs', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'setup_payoff_id', 'SETUP_PAYOFF:', label, { statusSet: SETUP_PAYOFF_STATUSES });
  uniqueStrings(x.setup_event_refs, `${label}.setup_event_refs`);
  uniqueStrings(x.payoff_event_refs, `${label}.payoff_event_refs`);
}
function validateOpenQuestion(x, i) {
  const label = `open_questions.${i}`;
  req(x, ['open_question_id', 'introduced_event_refs', 'resolution_event_refs', 'reopened_event_refs', 'status', 'confidence', 'source_anchor_ids', 'provenance_refs', 'evidence_refs', 'depends_on_refs'], label);
  validateCommon(x, 'open_question_id', 'OPEN_QUESTION:', label, { statusSet: OPEN_QUESTION_STATUSES });
  uniqueStrings(x.introduced_event_refs, `${label}.introduced_event_refs`);
  uniqueStrings(x.resolution_event_refs, `${label}.resolution_event_refs`);
  uniqueStrings(x.reopened_event_refs, `${label}.reopened_event_refs`);
}
function validateLineage(x, i) {
  const label = `identity_lineage.${i}`;
  req(x, ['lineage_id', 'relation', 'from_ids', 'to_ids', 'provenance_refs'], label);
  ref(x.lineage_id, `${label}.lineage_id`);
  if (!LINEAGE_RELATIONS.has(x.relation)) fail('INVALID_LINEAGE_RELATION', label);
  uniqueStrings(x.from_ids, `${label}.from_ids`); uniqueStrings(x.to_ids, `${label}.to_ids`);
  if (!x.from_ids.length || !x.to_ids.length) fail('LINEAGE_ENDPOINT_REQUIRED', label);
  uniqueStrings(x.provenance_refs, `${label}.provenance_refs`);
  if (!x.provenance_refs.length) fail('PROVENANCE_REQUIRED', label);
}
function collectIds(candidate) {
  const ids = new Map();
  for (const [collection, idField, prefix] of COLLECTIONS) {
    const list = candidate[collection];
    array(list, collection);
    for (const item of list) {
      const id = item && item[idField];
      if (text(id)) {
        validateTypedId(id, prefix, `${collection}.${idField}`);
        if (ids.has(id)) fail('DUPLICATE_STABLE_ID', id);
        ids.set(id, collection);
      }
    }
  }
  return ids;
}
function anchorIdSet(candidate) { return new Set(candidate.anchors.map(x => x.anchor_id)); }
function requireResolved(id, ids, label, allowedPrefixes = null) {
  ref(id, label);
  if (allowedPrefixes && !allowedPrefixes.some(prefix => id.startsWith(prefix))) fail('TYPED_REFERENCE_KIND_MISMATCH', `${label}:${id}`);
  if (!ids.has(id)) fail('UNRESOLVED_TYPED_REFERENCE', `${label}:${id}`);
}
function validateCommonRefs(candidate, ids) {
  const anchors = anchorIdSet(candidate);
  for (const [collection, idField] of COLLECTIONS) {
    if (collection === 'anchors') continue;
    candidate[collection].forEach((r, i) => {
      (r.source_anchor_ids || []).forEach(id => {
        if (!anchors.has(id)) fail('UNRESOLVED_ANCHOR_REFERENCE', `${collection}.${i}:${id}`);
      });
      (r.depends_on_refs || []).forEach(id => {
        if (!ids.has(id) && !anchors.has(id)) fail('UNRESOLVED_DEPENDENCY_REFERENCE', `${collection}.${i}:${id}`);
      });
    });
  }
}
function validateTypedReferences(candidate, ids) {
  candidate.entities.forEach((x, i) => x.state_assertion_ids.forEach(id => requireResolved(id, ids, `entities.${i}.state_assertion_ids`, ['STATE:'])));
  candidate.events.forEach((x, i) => {
    x.participant_entity_ids.forEach(id => requireResolved(id, ids, `events.${i}.participant_entity_ids`, ['ENTITY:']));
    x.state_change_ids.forEach(id => requireResolved(id, ids, `events.${i}.state_change_ids`, ['STATE:']));
    x.goal_relation_ids.forEach(id => requireResolved(id, ids, `events.${i}.goal_relation_ids`, ['CAUSAL:']));
  });
  candidate.temporal_claims.forEach((x, i) => {
    requireResolved(x.subject_ref, ids, `temporal_claims.${i}.subject_ref`, ['EVENT:']);
    requireResolved(x.object_ref, ids, `temporal_claims.${i}.object_ref`, ['EVENT:']);
  });
  candidate.causal_goal_claims.forEach((x, i) => {
    requireResolved(x.subject_ref, ids, `causal_goal_claims.${i}.subject_ref`);
    requireResolved(x.object_ref, ids, `causal_goal_claims.${i}.object_ref`);
  });
  candidate.state_assertions.forEach((x, i) => {
    requireResolved(x.subject_ref, ids, `state_assertions.${i}.subject_ref`);
    if (x.valid_from_event_ref !== null) requireResolved(x.valid_from_event_ref, ids, `state_assertions.${i}.valid_from_event_ref`, ['EVENT:']);
    if (x.valid_to_event_ref !== null) requireResolved(x.valid_to_event_ref, ids, `state_assertions.${i}.valid_to_event_ref`, ['EVENT:']);
    x.change_event_refs.forEach(id => requireResolved(id, ids, `state_assertions.${i}.change_event_refs`, ['EVENT:']));
  });
  candidate.character_knowledge_claims.forEach((x, i) => {
    requireResolved(x.character_entity_id, ids, `character_knowledge_claims.${i}.character_entity_id`, ['ENTITY:']);
    const entity = candidate.entities.find(e => e.entity_id === x.character_entity_id);
    if (!entity || entity.entity_type !== 'CHARACTER') fail('KNOWLEDGE_SUBJECT_NOT_CHARACTER', x.character_entity_id);
    requireResolved(x.object_ref, ids, `character_knowledge_claims.${i}.object_ref`);
    x.exposure_event_refs.forEach(id => requireResolved(id, ids, `character_knowledge_claims.${i}.exposure_event_refs`, ['EVENT:']));
  });
  candidate.relationships.forEach((x, i) => {
    x.participant_entity_ids.forEach(id => requireResolved(id, ids, `relationships.${i}.participant_entity_ids`, ['ENTITY:']));
    x.state_assertion_ids.forEach(id => requireResolved(id, ids, `relationships.${i}.state_assertion_ids`, ['STATE:']));
    x.change_event_ids.forEach(id => requireResolved(id, ids, `relationships.${i}.change_event_ids`, ['EVENT:']));
  });
  candidate.arcs.forEach((x, i) => {
    x.subject_refs.forEach(id => requireResolved(id, ids, `arcs.${i}.subject_refs`));
    x.beats.forEach((b, j) => b.event_refs.forEach(id => requireResolved(id, ids, `arcs.${i}.beats.${j}.event_refs`, ['EVENT:'])));
  });
  candidate.motifs.forEach((x, i) => {
    x.occurrence_event_ids.forEach(id => requireResolved(id, ids, `motifs.${i}.occurrence_event_ids`, ['EVENT:']));
    x.occurrence_anchor_ids.forEach(id => { if (!ids.has(id) || !id.startsWith('ANCHOR:')) fail('UNRESOLVED_TYPED_REFERENCE', `motifs.${i}.occurrence_anchor_ids:${id}`); });
  });
  candidate.themes.forEach((x, i) => x.subject_refs.forEach(id => requireResolved(id, ids, `themes.${i}.subject_refs`)));
  candidate.promises.forEach((x, i) => {
    x.introduced_event_refs.forEach(id => requireResolved(id, ids, `promises.${i}.introduced_event_refs`, ['EVENT:']));
    x.related_open_question_refs.forEach(id => requireResolved(id, ids, `promises.${i}.related_open_question_refs`, ['OPEN_QUESTION:']));
    x.related_setup_payoff_refs.forEach(id => requireResolved(id, ids, `promises.${i}.related_setup_payoff_refs`, ['SETUP_PAYOFF:']));
    x.resolution_event_refs.forEach(id => requireResolved(id, ids, `promises.${i}.resolution_event_refs`, ['EVENT:']));
  });
  candidate.setup_payoffs.forEach((x, i) => {
    x.setup_event_refs.forEach(id => requireResolved(id, ids, `setup_payoffs.${i}.setup_event_refs`, ['EVENT:']));
    x.payoff_event_refs.forEach(id => requireResolved(id, ids, `setup_payoffs.${i}.payoff_event_refs`, ['EVENT:']));
  });
  candidate.open_questions.forEach((x, i) => {
    x.introduced_event_refs.forEach(id => requireResolved(id, ids, `open_questions.${i}.introduced_event_refs`, ['EVENT:']));
    x.resolution_event_refs.forEach(id => requireResolved(id, ids, `open_questions.${i}.resolution_event_refs`, ['EVENT:']));
    x.reopened_event_refs.forEach(id => requireResolved(id, ids, `open_questions.${i}.reopened_event_refs`, ['EVENT:']));
  });
}
function storyEdge(x) {
  if (x.relation_type === 'STORY_TIME_BEFORE') return [x.subject_ref, x.object_ref, 'BEFORE'];
  if (x.relation_type === 'STORY_TIME_AFTER') return [x.object_ref, x.subject_ref, 'BEFORE'];
  return null;
}
function validateTemporalContradictions(candidate) {
  const asserted = candidate.temporal_claims.filter(x => x.status === 'ASSERTED');
  const before = new Set();
  const same = new Set();
  for (const x of asserted) {
    const e = storyEdge(x);
    if (e) before.add(`${e[0]}|${e[1]}`);
    if (x.relation_type === 'SAME_STORY_EVENT') {
      const pair = [x.subject_ref, x.object_ref].sort();
      same.add(`${pair[0]}|${pair[1]}`);
    }
  }
  for (const edge of before) {
    const [a, b] = edge.split('|');
    if (before.has(`${b}|${a}`)) fail('CONTRADICTORY_ASSERTED_TEMPORAL_STATE', `${a}<->${b}`);
    const pair = [a, b].sort();
    if (same.has(`${pair[0]}|${pair[1]}`)) fail('CONTRADICTORY_ASSERTED_TEMPORAL_STATE', `${a}<->${b}:SAME_STORY_EVENT`);
  }
}
function validateLineageGraph(candidate, ids, priorCandidate) {
  array(candidate.identity_lineage, 'identity_lineage');
  const lineageIds = new Set();
  const priorIds = priorCandidate ? new Set([...collectIds(priorCandidate).keys()]) : new Set();
  const allowed = new Set([...ids.keys(), ...priorIds]);
  const edges = new Map();
  candidate.identity_lineage.forEach((x, i) => {
    validateLineage(x, i);
    if (lineageIds.has(x.lineage_id)) fail('DUPLICATE_LINEAGE_ID', x.lineage_id); lineageIds.add(x.lineage_id);
    x.from_ids.forEach(id => { if (!allowed.has(id)) fail('LINEAGE_SOURCE_UNRESOLVED', id); });
    x.to_ids.forEach(id => { if (!ids.has(id)) fail('LINEAGE_TARGET_UNRESOLVED', id); });
    for (const from of x.from_ids) for (const to of x.to_ids) {
      if (from === to) fail('IDENTITY_LINEAGE_CYCLE', `${from}->${to}`);
      if (!edges.has(from)) edges.set(from, new Set());
      edges.get(from).add(to);
    }
  });
  const visiting = new Set(), visited = new Set();
  function dfs(id) {
    if (visiting.has(id)) fail('IDENTITY_LINEAGE_CYCLE', id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const n of edges.get(id) || []) dfs(n);
    visiting.delete(id); visited.add(id);
  }
  for (const id of edges.keys()) dfs(id);
  const targetOrigins = new Map();
  candidate.identity_lineage.forEach(x => {
    x.to_ids.forEach(to => {
      const key = `${x.relation}:${to}`;
      if (!targetOrigins.has(key)) targetOrigins.set(key, new Set());
      x.from_ids.forEach(from => targetOrigins.get(key).add(from));
    });
  });
  for (const [key, origins] of targetOrigins) {
    if (key.startsWith('SPLIT_FROM:') && origins.size > 1) fail('LINEAGE_REFERENT_CONFLICT', key);
  }
}
function validatePriorStableIdentity(candidate, priorCandidate) {
  if (!priorCandidate) return;
  if (priorCandidate.book_project_id !== candidate.book_project_id) fail('FOREIGN_PRIOR_STORY_BIBLE');
  validateStoryBibleKnowledgeV1(priorCandidate, { expected_book_project_id: candidate.book_project_id });
  const priorIds = collectIds(priorCandidate);
  const currentIds = collectIds(candidate);
  for (const id of currentIds.keys()) {
    if (priorIds.has(id) && priorIds.get(id) !== currentIds.get(id)) fail('STABLE_ID_REFERENT_CONFLICT', id);
  }
  const explained = new Set(candidate.identity_lineage.flatMap(x => x.from_ids));
  for (const id of priorIds.keys()) {
    if (!currentIds.has(id) && !explained.has(id)) fail('STABLE_ID_LINEAGE_REQUIRED', id);
  }
}
function validateStoryBibleKnowledgeV1(candidate, options = {}) {
  req(candidate, REQUIRED_TOP, 'knowledge');
  noForbidden(candidate, 'knowledge');
  if (candidate.knowledge_schema_version !== KNOWLEDGE_SCHEMA_VERSION) fail('KNOWLEDGE_SCHEMA_VERSION_MISMATCH');
  ref(candidate.book_project_id, 'book_project_id');
  if (options.expected_book_project_id && candidate.book_project_id !== options.expected_book_project_id) fail('FOREIGN_BOOK_PROJECT', candidate.book_project_id);
  if (candidate.prior_story_bible_ref !== null) ref(candidate.prior_story_bible_ref, 'prior_story_bible_ref');
  if (!TOP_LEVEL_STANDINGS.has(candidate.standing)) fail('INVALID_KNOWLEDGE_STANDING', candidate.standing);
  const bindings = validateTopBindings(candidate);
  const ids = collectIds(candidate);
  candidate.anchors.forEach((x, i) => validateAnchor(x, i, bindings));
  candidate.entities.forEach(validateEntity);
  candidate.events.forEach(validateEvent);
  candidate.temporal_claims.forEach(validateTemporal);
  candidate.causal_goal_claims.forEach(validateCausal);
  candidate.state_assertions.forEach(validateState);
  candidate.character_knowledge_claims.forEach(validateKnowledgeClaim);
  candidate.relationships.forEach(validateRelationship);
  candidate.arcs.forEach(validateArc);
  candidate.motifs.forEach(validateMotif);
  candidate.themes.forEach(validateTheme);
  candidate.promises.forEach(validatePromise);
  candidate.setup_payoffs.forEach(validateSetupPayoff);
  candidate.open_questions.forEach(validateOpenQuestion);
  validateCommonRefs(candidate, ids);
  validateTypedReferences(candidate, ids);
  validateTemporalContradictions(candidate);
  validateLineageGraph(candidate, ids, options.prior_knowledge || null);
  validatePriorStableIdentity(candidate, options.prior_knowledge || null);
  const d = knowledgeDigest(candidate);
  digest(candidate.knowledge_digest, 'knowledge_digest');
  if (candidate.knowledge_digest !== d) fail('KNOWLEDGE_DIGEST_MISMATCH');
  if (candidate.knowledge_candidate_id !== `${CANDIDATE_PREFIX}${d}`) fail('KNOWLEDGE_CANDIDATE_ID_MISMATCH');
  return true;
}
function checkStoryBibleKnowledgeIntegrityV1(candidate, options = {}) {
  validateStoryBibleKnowledgeV1(candidate, options);
  return {
    result: 'PASS',
    knowledge_candidate_id: candidate.knowledge_candidate_id,
    knowledge_digest: candidate.knowledge_digest,
    book_project_id: candidate.book_project_id,
    stable_id_count: collectIds(candidate).size,
    deterministic_only: true,
    canonical_effect: false,
    model_accuracy_claimed: false
  };
}
module.exports = {
  BookStoryBibleKnowledgeError,
  KNOWLEDGE_SCHEMA_VERSION,
  CANDIDATE_PREFIX,
  TOP_LEVEL_STANDINGS,
  EPISTEMIC_STATUSES,
  knowledgeDigest,
  knowledgeCandidateId,
  validateStoryBibleKnowledgeV1,
  checkStoryBibleKnowledgeIntegrityV1,
  sha256,
  stableStringify
};
