'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const sourceRuntime = require('./book-source-recovery-acceptance-v1');
const lensRegistry = require('./book-literary-diagnostic-lens-registry-v1');

const CRAFT_SCHEMA_VERSION = 'BOOK_CRAFT_INTELLIGENCE_V1';
const CRAFT_PREFIX = 'book-craft-intelligence-v1:';
const RETRIEVAL_SCHEMA_VERSION = 'BOOK_CRAFT_INTELLIGENCE_RETRIEVAL_V1';
const TASK_FIT_STANDINGS = Object.freeze(['APPLICABLE','CONDITIONAL','NOT_APPLICABLE','UNRESOLVED','BLOCKED_SOURCE']);
const EVIDENCE_STATUSES = Object.freeze(['EVIDENCE_BACKED','BOUNDED_INFERENCE','CONTESTED','UNRESOLVED']);
const UNCERTAINTY_STANDINGS = Object.freeze(['BOUNDED','UNCERTAIN','CONTESTED','UNRESOLVED']);
const PROVENANCE_CLASSES = Object.freeze(['SOURCE','SCHOLARSHIP','AUTHOR_WORK_METADATA']);
const SHA256 = /^[a-f0-9]{64}$/;

const FORBIDDEN_KEY_PATTERNS = Object.freeze([
  /raw.*(?:manuscript|source|document|text|bytes)/i,
  /full.*text/i,
  /quoted.*text/i,
  /reconstruct(?:ed|ive).*text/i,
  /replacement.*prose/i,
  /candidate.*text/i,
  /rewritten.*text/i,
  /applied.*(?:revision|transform)/i,
  /chain.*of.*thought/i,
  /hidden.*reason/i,
  /private.*model.*reason/i,
  /(?:quality|prose|literary).*score/i,
  /percentile/i,
  /(?:overall|aggregate).*rank/i,
  /prestige.*rank/i,
  /citation.*count.*rank/i,
  /named.*author.*target/i,
  /nearest.*author/i,
  /similarity.*author/i,
  /winner/i,
  /evaluation.*disposition/i,
  /candidate.*superior/i,
  /credential/i,
  /access.*token/i,
  /secret/i
]);

class BookCraftIntelligenceError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCraftIntelligenceError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookCraftIntelligenceError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stable(v) { return kb.stableStringify(v); }
function exactKeys(v, fields, code, label) {
  if (!obj(v)) fail(code, `${label}:OBJECT_REQUIRED`);
  const expected = new Set(fields);
  for (const key of Object.keys(v)) if (!expected.has(key)) fail(code, `${label}.unexpected:${key}`);
  for (const field of fields) if (!own(v, field)) fail(code, `${label}.missing:${field}`);
}
function assertNoForbiddenPayload(v, path = '$', provenanceMetadata = false) {
  if (typeof v === 'string') {
    if (/(?:replacement[-_ ]?prose|candidate[-_ ]?text|rewritten[-_ ]?text|applied[-_ ]?(?:revision|transform))\s*:/i.test(v)) {
      fail('BLOCKED_REWRITE_PAYLOAD_FORBIDDEN', `${path}:${v}`);
    }
    if (/(?:(?:quality|prose|literary)[-_ ]?score|percentile|(?:overall|aggregate)[-_ ]?rank|prestige[-_ ]?rank|citation[-_ ]?count[-_ ]?rank)\s*:/i.test(v)) {
      fail('BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN', `${path}:${v}`);
    }
    if (/(?:winner|evaluation[-_ ]?disposition|candidate[-_ ]?superior)\s*:/i.test(v)) {
      fail('BLOCKED_EVALUATION_AUTHORITY_FORBIDDEN', `${path}:${v}`);
    }
    if (/(?:named[-_ ]?author[-_ ]?target|nearest[-_ ]?author|similarity[-_ ]?author|imitat(?:e|ion)[-_ ]?author|mimic[-_ ]?author|write\s+like|in\s+the\s+style\s+of)/i.test(v)) {
      fail('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN', `${path}:${v}`);
    }
    return;
  }
  if (Array.isArray(v)) return v.forEach((x, i) => assertNoForbiddenPayload(x, `${path}[${i}]`, provenanceMetadata));
  if (!obj(v)) return;
  for (const [key, child] of Object.entries(v)) {
    if (FORBIDDEN_KEY_PATTERNS.some(re => re.test(key))) {
      if (/(?:quality|prose|literary).*score|percentile|(?:overall|aggregate).*rank|prestige.*rank|citation.*count.*rank/i.test(key)) fail('BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN', `${path}.${key}`);
      if (/named.*author.*target|nearest.*author|similarity.*author/i.test(key)) fail('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN', `${path}.${key}`);
      if (/replacement.*prose|candidate.*text|rewritten.*text|applied.*(?:revision|transform)/i.test(key)) fail('BLOCKED_REWRITE_PAYLOAD_FORBIDDEN', `${path}.${key}`);
      if (/winner|evaluation.*disposition|candidate.*superior/i.test(key)) fail('BLOCKED_EVALUATION_AUTHORITY_FORBIDDEN', `${path}.${key}`);
      fail('BLOCKED_RAW_TEXT_FORBIDDEN', `${path}.${key}`);
    }
    assertNoForbiddenPayload(child, `${path}.${key}`, provenanceMetadata);
  }
}
function normalizeStrings(values, label) {
  if (!Array.isArray(values)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `${label}:ARRAY_REQUIRED`);
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!text(value)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', label);
    assertNoForbiddenPayload(value, label);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.sort();
}
function normalizeEvidenceRefs(values) {
  if (!Array.isArray(values)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'evidence_refs');
  const map = new Map();
  for (let i = 0; i < values.length; i += 1) {
    const x = values[i];
    exactKeys(x, ['evidence_ref','evidence_digest'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `evidence_refs.${i}`);
    if (!text(x.evidence_ref) || !digest(x.evidence_digest)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `evidence_refs.${i}`);
    assertNoForbiddenPayload(x.evidence_ref, `evidence_refs.${i}.evidence_ref`);
    const prior = map.get(x.evidence_ref);
    if (prior && prior.evidence_digest !== x.evidence_digest) fail('BLOCKED_CONFLICT_UNRESOLVED', `evidence_ref:${x.evidence_ref}`);
    map.set(x.evidence_ref, clone(x));
  }
  return [...map.values()].sort((a,b) => a.evidence_ref.localeCompare(b.evidence_ref));
}
function normalizeProvenanceRefs(values) {
  if (!Array.isArray(values)) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'provenance_refs');
  const map = new Map();
  for (let i = 0; i < values.length; i += 1) {
    const x = values[i];
    exactKeys(x, ['provenance_ref','provenance_digest','provenance_class'], 'BLOCKED_CRAFT_SOURCE_UNADMITTED', `provenance_refs.${i}`);
    if (!text(x.provenance_ref) || !digest(x.provenance_digest) || !PROVENANCE_CLASSES.includes(x.provenance_class)) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', `provenance_refs.${i}`);
    assertNoForbiddenPayload(x.provenance_ref, `provenance_refs.${i}.provenance_ref`, true);
    const key = `${x.provenance_class}:${x.provenance_ref}`;
    const prior = map.get(key);
    if (prior && prior.provenance_digest !== x.provenance_digest) fail('BLOCKED_CONFLICT_UNRESOLVED', `provenance_ref:${key}`);
    map.set(key, clone(x));
  }
  return [...map.values()].sort((a,b) => `${a.provenance_class}:${a.provenance_ref}`.localeCompare(`${b.provenance_class}:${b.provenance_ref}`));
}
function normalizeApplicability(v) {
  exactKeys(v, ['task_classes','genres','forms','audiences','pov_modes','narrative_distances'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'applicability');
  return {
    task_classes: normalizeStrings(v.task_classes, 'applicability.task_classes'),
    genres: normalizeStrings(v.genres, 'applicability.genres'),
    forms: normalizeStrings(v.forms, 'applicability.forms'),
    audiences: normalizeStrings(v.audiences, 'applicability.audiences'),
    pov_modes: normalizeStrings(v.pov_modes, 'applicability.pov_modes'),
    narrative_distances: normalizeStrings(v.narrative_distances, 'applicability.narrative_distances')
  };
}
function craftSemanticV1(record) {
  const out = clone(record);
  delete out.craft_record_id;
  delete out.craft_record_digest;
  return out;
}
function craftRecordDigestV1(record) { return kb.sha256(craftSemanticV1(record)); }
function assertCurrentBinding(binding, ref, dg, label) {
  exactKeys(binding, ['ref','digest','current'], 'BLOCKED_CRAFT_SOURCE_UNADMITTED', label);
  if (binding.ref !== ref || binding.digest !== dg || binding.current !== true) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', label);
}
function validateRightsBindingV1(rights, sourceAcceptance) {
  exactKeys(rights, ['rights_ref','rights_digest','standing','current'], 'BLOCKED_CRAFT_SOURCE_UNADMITTED', 'rights_custody');
  if (rights.rights_ref !== sourceAcceptance.rights_record_id || rights.rights_digest !== sourceAcceptance.rights_record_digest) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'rights_identity');
  if (rights.standing !== 'ACCEPTED_FOR_DECLARED_SCOPE' || rights.current !== true) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', `rights_standing:${rights.standing}`);
}
function normalizeEffectClaim(v) {
  exactKeys(v, ['claim','evidence_status'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'effect_claim');
  if (!text(v.claim) || !EVIDENCE_STATUSES.includes(v.evidence_status)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'effect_claim');
  assertNoForbiddenPayload(v.claim, 'effect_claim.claim');
  return { claim: v.claim.trim(), evidence_status: v.evidence_status };
}
function normalizeRecordPayloadV1(p) {
  const fields = ['mechanism','effect_claim','applicability_conditions','counterconditions','failure_modes','technique_interactions','diagnostic_signals','abstract_revision_transforms','applicability','evidence_refs','provenance_refs','uncertainty_standing','task_fit_standing','canonical_effect'];
  assertNoForbiddenPayload(p, 'record');
  exactKeys(p, fields, 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'record');
  if (!text(p.mechanism)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'mechanism');
  if (!UNCERTAINTY_STANDINGS.includes(p.uncertainty_standing)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'uncertainty_standing');
  if (!TASK_FIT_STANDINGS.includes(p.task_fit_standing)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'task_fit_standing');
  if (p.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  return {
    mechanism: p.mechanism.trim(),
    effect_claim: normalizeEffectClaim(p.effect_claim),
    applicability_conditions: normalizeStrings(p.applicability_conditions, 'applicability_conditions'),
    counterconditions: normalizeStrings(p.counterconditions, 'counterconditions'),
    failure_modes: normalizeStrings(p.failure_modes, 'failure_modes'),
    technique_interactions: normalizeStrings(p.technique_interactions, 'technique_interactions'),
    diagnostic_signals: normalizeStrings(p.diagnostic_signals, 'diagnostic_signals'),
    abstract_revision_transforms: normalizeStrings(p.abstract_revision_transforms, 'abstract_revision_transforms'),
    applicability: normalizeApplicability(p.applicability),
    evidence_refs: normalizeEvidenceRefs(p.evidence_refs),
    provenance_refs: normalizeProvenanceRefs(p.provenance_refs),
    uncertainty_standing: p.uncertainty_standing,
    task_fit_standing: p.task_fit_standing,
    canonical_effect: false
  };
}

function acceptCraftIntelligenceRecordV1(input) {
  if (!obj(input)) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'input');
  exactKeys(input, ['source_acceptance','normalized_source_projection','source_currentness','projection_currentness','rights_custody','record'], 'BLOCKED_CRAFT_SOURCE_UNADMITTED', 'input');
  try { sourceRuntime.validateSourceCustodyAcceptanceV1(input.source_acceptance); }
  catch (err) { fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', `source:${err.code || err.message}`); }
  const sourceAcceptance = input.source_acceptance;
  assertCurrentBinding(input.source_currentness, sourceAcceptance.source_acceptance_id, sourceAcceptance.source_acceptance_digest, 'source_currentness');
  let projectionRef = null;
  let projectionDigest = null;
  if (input.normalized_source_projection !== null) {
    try { sourceRuntime.validateNormalizedSourceProjectionV1(input.normalized_source_projection, sourceAcceptance); }
    catch (err) { fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', `projection:${err.code || err.message}`); }
    projectionRef = input.normalized_source_projection.projection_id;
    projectionDigest = input.normalized_source_projection.projection_digest;
    if (input.projection_currentness === null) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'projection_currentness');
    assertCurrentBinding(input.projection_currentness, projectionRef, projectionDigest, 'projection_currentness');
  } else if (input.projection_currentness !== null) {
    fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'projection_currentness_without_projection');
  }
  validateRightsBindingV1(input.rights_custody, sourceAcceptance);
  const p = normalizeRecordPayloadV1(input.record);
  if (p.task_fit_standing === 'BLOCKED_SOURCE') fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'blocked_source_task_fit');
  const out = {
    craft_schema_version: CRAFT_SCHEMA_VERSION,
    craft_record_id: null,
    craft_record_digest: null,
    book_project_id: sourceAcceptance.book_project_id,
    source_acceptance_ref: sourceAcceptance.source_acceptance_id,
    source_acceptance_digest: sourceAcceptance.source_acceptance_digest,
    normalized_source_projection_ref: projectionRef,
    normalized_source_projection_digest: projectionDigest,
    rights_custody_ref: input.rights_custody.rights_ref,
    rights_custody_digest: input.rights_custody.rights_digest,
    rights_custody_standing: input.rights_custody.standing,
    mechanism: p.mechanism,
    effect_claim: p.effect_claim,
    applicability_conditions: p.applicability_conditions,
    counterconditions: p.counterconditions,
    failure_modes: p.failure_modes,
    technique_interactions: p.technique_interactions,
    diagnostic_signals: p.diagnostic_signals,
    abstract_revision_transforms: p.abstract_revision_transforms,
    applicability: p.applicability,
    evidence_refs: p.evidence_refs,
    provenance_refs: p.provenance_refs,
    uncertainty_standing: p.uncertainty_standing,
    task_fit_standing: p.task_fit_standing,
    canonical_effect: false
  };
  const dg = craftRecordDigestV1(out);
  out.craft_record_digest = dg;
  out.craft_record_id = `${CRAFT_PREFIX}${dg}`;
  validateCraftIntelligenceRecordV1(out);
  return out;
}

function validateCraftIntelligenceRecordV1(record) {
  const fields = ['craft_schema_version','craft_record_id','craft_record_digest','book_project_id','source_acceptance_ref','source_acceptance_digest','normalized_source_projection_ref','normalized_source_projection_digest','rights_custody_ref','rights_custody_digest','rights_custody_standing','mechanism','effect_claim','applicability_conditions','counterconditions','failure_modes','technique_interactions','diagnostic_signals','abstract_revision_transforms','applicability','evidence_refs','provenance_refs','uncertainty_standing','task_fit_standing','canonical_effect'];
  exactKeys(record, fields, 'BLOCKED_CRAFT_SOURCE_UNADMITTED', 'craft_record');
  assertNoForbiddenPayload(record, 'craft_record');
  if (record.craft_schema_version !== CRAFT_SCHEMA_VERSION || !text(record.book_project_id) || !text(record.source_acceptance_ref) || !digest(record.source_acceptance_digest) || !text(record.rights_custody_ref) || !digest(record.rights_custody_digest) || record.rights_custody_standing !== 'ACCEPTED_FOR_DECLARED_SCOPE') fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'record_binding');
  if ((record.normalized_source_projection_ref === null) !== (record.normalized_source_projection_digest === null)) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'projection_pair');
  if (record.normalized_source_projection_ref !== null && (!text(record.normalized_source_projection_ref) || !digest(record.normalized_source_projection_digest))) fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'projection_binding');
  const normalized = normalizeRecordPayloadV1({
    mechanism: record.mechanism,
    effect_claim: record.effect_claim,
    applicability_conditions: record.applicability_conditions,
    counterconditions: record.counterconditions,
    failure_modes: record.failure_modes,
    technique_interactions: record.technique_interactions,
    diagnostic_signals: record.diagnostic_signals,
    abstract_revision_transforms: record.abstract_revision_transforms,
    applicability: record.applicability,
    evidence_refs: record.evidence_refs,
    provenance_refs: record.provenance_refs,
    uncertainty_standing: record.uncertainty_standing,
    task_fit_standing: record.task_fit_standing,
    canonical_effect: record.canonical_effect
  });
  for (const field of ['mechanism','effect_claim','applicability_conditions','counterconditions','failure_modes','technique_interactions','diagnostic_signals','abstract_revision_transforms','applicability','evidence_refs','provenance_refs','uncertainty_standing','task_fit_standing','canonical_effect']) {
    if (stable(record[field]) !== stable(normalized[field])) fail('BLOCKED_DIGEST_MISMATCH', `unnormalized:${field}`);
  }
  if (record.task_fit_standing === 'BLOCKED_SOURCE') fail('BLOCKED_CRAFT_SOURCE_UNADMITTED', 'blocked_source_record');
  if (!digest(record.craft_record_digest)) fail('BLOCKED_DIGEST_MISMATCH', 'craft_record_digest');
  const dg = craftRecordDigestV1(record);
  if (record.craft_record_digest !== dg || record.craft_record_id !== `${CRAFT_PREFIX}${dg}`) fail('BLOCKED_DIGEST_MISMATCH', 'craft_record_identity');
  return true;
}

function normalizeQueryV1(q) {
  assertNoForbiddenPayload(q, 'query');
  exactKeys(q, ['policy_ref','policy_digest','task_class','requested_lens_ids','genre','form','audience','pov_mode','narrative_distance','include_conditional'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'query');
  if (!text(q.policy_ref) || !digest(q.policy_digest) || !text(q.task_class) || typeof q.include_conditional !== 'boolean') fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'query');
  const lensIds = normalizeStrings(q.requested_lens_ids, 'query.requested_lens_ids');
  for (const id of lensIds) {
    try { lensRegistry.assertLiteraryDiagnosticLensV1(id); }
    catch { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', id); }
  }
  for (const key of ['genre','form','audience','pov_mode','narrative_distance']) if (q[key] !== null && !text(q[key])) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `query.${key}`);
  return { ...clone(q), requested_lens_ids: lensIds };
}
function fieldCompatibility(values, queryValue) {
  if (queryValue === null || values.length === 0) return 'NEUTRAL';
  return values.includes(queryValue) ? 'EXACT' : 'MISMATCH';
}
function recordEligibilityV1(record, current, query) {
  if (current !== true) return { eligible: false, reason: 'STALE' };
  if (record.task_fit_standing === 'BLOCKED_SOURCE') return { eligible: false, reason: 'BLOCKED_SOURCE' };
  if (record.task_fit_standing === 'UNRESOLVED') return { eligible: false, reason: 'UNRESOLVED' };
  if (record.task_fit_standing === 'NOT_APPLICABLE') return { eligible: false, reason: 'NOT_APPLICABLE' };
  if (record.task_fit_standing === 'CONDITIONAL' && !query.include_conditional) return { eligible: false, reason: 'CONDITIONAL_EXCLUDED' };
  if (record.applicability.task_classes.length > 0 && !record.applicability.task_classes.includes(query.task_class)) return { eligible: false, reason: 'TASK_MISMATCH' };
  const fields = [['genres','genre'],['forms','form'],['audiences','audience'],['pov_modes','pov_mode'],['narrative_distances','narrative_distance']];
  for (const [recordField, queryField] of fields) if (fieldCompatibility(record.applicability[recordField], query[queryField]) === 'MISMATCH') return { eligible: false, reason: `${queryField.toUpperCase()}_MISMATCH` };
  return { eligible: true, reason: null };
}
function retrievalTupleV1(record, query) {
  const fit = record.task_fit_standing === 'APPLICABLE' ? 0 : 1;
  const exactness = [
    fieldCompatibility(record.applicability.genres, query.genre),
    fieldCompatibility(record.applicability.forms, query.form),
    fieldCompatibility(record.applicability.audiences, query.audience),
    fieldCompatibility(record.applicability.pov_modes, query.pov_mode),
    fieldCompatibility(record.applicability.narrative_distances, query.narrative_distance)
  ].map(x => x === 'EXACT' ? 0 : 1);
  return [fit, ...exactness, record.craft_record_id];
}
function compareTuple(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
function retrieveCraftIntelligenceV1(input) {
  if (!obj(input)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'input');
  exactKeys(input, ['record_bindings','query'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'input');
  const query = normalizeQueryV1(input.query);
  if (!Array.isArray(input.record_bindings)) fail('BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', 'record_bindings');
  const seen = new Set();
  const selected = [];
  const excluded = [];
  for (let i = 0; i < input.record_bindings.length; i += 1) {
    const binding = input.record_bindings[i];
    exactKeys(binding, ['record','current'], 'BLOCKED_CRAFT_TASK_FIT_UNRESOLVED', `record_bindings.${i}`);
    validateCraftIntelligenceRecordV1(binding.record);
    if (seen.has(binding.record.craft_record_id)) fail('BLOCKED_CONFLICT_UNRESOLVED', `duplicate_craft_record:${binding.record.craft_record_id}`);
    seen.add(binding.record.craft_record_id);
    const eligibility = recordEligibilityV1(binding.record, binding.current, query);
    const ref = { craft_record_id: binding.record.craft_record_id, craft_record_digest: binding.record.craft_record_digest };
    if (eligibility.eligible) selected.push({ record: binding.record, ref, tuple: retrievalTupleV1(binding.record, query) });
    else excluded.push({ ...ref, reason: eligibility.reason });
  }
  selected.sort((a,b) => compareTuple(a.tuple, b.tuple));
  excluded.sort((a,b) => a.craft_record_id.localeCompare(b.craft_record_id));
  return {
    retrieval_schema_version: RETRIEVAL_SCHEMA_VERSION,
    policy_ref: query.policy_ref,
    policy_digest: query.policy_digest,
    task_class: query.task_class,
    requested_lens_ids: query.requested_lens_ids,
    selected_record_refs: selected.map(x => x.ref),
    excluded_record_refs: excluded,
    canonical_effect: false
  };
}

module.exports = {
  CRAFT_SCHEMA_VERSION,
  CRAFT_PREFIX,
  RETRIEVAL_SCHEMA_VERSION,
  TASK_FIT_STANDINGS,
  EVIDENCE_STATUSES,
  UNCERTAINTY_STANDINGS,
  PROVENANCE_CLASSES,
  BookCraftIntelligenceError,
  craftRecordDigestV1,
  acceptCraftIntelligenceRecordV1,
  validateCraftIntelligenceRecordV1,
  retrieveCraftIntelligenceV1
};
