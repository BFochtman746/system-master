'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const contextRuntime = require('./book-literary-diagnostic-context-v1');
const registry = require('./book-literary-diagnostic-lens-registry-v1');

const OBSERVATION_SCHEMA_VERSION = 'BOOK_LITERARY_DIAGNOSTIC_OBSERVATION_V1';
const OBSERVATION_PREFIX = 'book-literary-diagnostic-observation-v1:';

const FINDING_CLASSES = Object.freeze([
  'STRENGTH','LIMITATION','RISK','OPPORTUNITY_SUPPORT','CONTRADICTION','NO_FINDING','ABSTAINED','BLOCKED'
]);
const SOURCE_CLASSES = Object.freeze(['DETERMINISTIC','MODEL','HUMAN']);
const OBSERVATION_STANDINGS = Object.freeze(['ACCEPTED_UNCALIBRATED','ABSTAINED','BLOCKED']);
const EVIDENCE_STRENGTH_CLASSES = Object.freeze(['UNSPECIFIED','LIMITED','SUPPORTED','STRONG']);
const PURPOSE_RELEVANCE_CLASSES = Object.freeze(['UNKNOWN','LOW','MEDIUM','HIGH']);
const RISK_CLASSES = Object.freeze(['UNKNOWN','NONE','LOW','MEDIUM','HIGH']);
const MODEL_CAPABILITIES = Object.freeze(['BOOK.LITERARY.ANALYZE_PASSAGE','BOOK.LITERARY.DIAGNOSE']);
const EXTERNAL_SIGNAL_CLASSES = Object.freeze(['VOICE_RELEVANT_LOCAL_SIGNAL','POTENTIAL_HOMOGENIZATION_RISK_SIGNAL']);
const SUBSTANTIVE = new Set(['STRENGTH','LIMITATION','RISK','OPPORTUNITY_SUPPORT','CONTRADICTION']);
const SHA256 = /^[a-f0-9]{64}$/;

const FORBIDDEN_KEY_PATTERNS = Object.freeze([
  /raw.*(?:manuscript|source|document|text|bytes)/i,
  /full.*text/i,
  /quoted.*text/i,
  /replacement.*prose/i,
  /candidate.*text/i,
  /rewritten.*text/i,
  /applied.*revision/i,
  /chain.*of.*thought/i,
  /hidden.*reason/i,
  /(?:quality|prose|literary).*score/i,
  /percentile/i,
  /(?:overall|aggregate).*rank/i,
  /named.*author.*target/i,
  /nearest.*author/i,
  /similarity.*author/i,
  /voice.*standing/i,
  /voice.*degradation/i,
  /voice.*evolution/i,
  /trait.*disposition/i,
  /homogenization.*standing/i,
  /winner/i,
  /credential/i,
  /access.*token/i,
  /secret/i
]);

class BookLiteraryDiagnosticObservationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLiteraryDiagnosticObservationError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookLiteraryDiagnosticObservationError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function hash(v) { return kb.sha256(v); }
function stable(v) { return kb.stableStringify(v); }
function exactKeys(v, fields, code, label) {
  if (!obj(v)) fail(code, `${label}:OBJECT_REQUIRED`);
  const expected = new Set(fields);
  for (const key of Object.keys(v)) if (!expected.has(key)) fail(code, `${label}.unexpected:${key}`);
  for (const field of fields) if (!own(v, field)) fail(code, `${label}.missing:${field}`);
}
function assertNoForbiddenPayload(v, path = '$') {
  if (Array.isArray(v)) return v.forEach((x, i) => assertNoForbiddenPayload(x, `${path}[${i}]`));
  if (!obj(v)) return;
  for (const [key, child] of Object.entries(v)) {
    if (FORBIDDEN_KEY_PATTERNS.some(re => re.test(key))) {
      if (/voice.*(?:standing|degradation|evolution)|trait.*disposition|homogenization.*standing/i.test(key)) fail('BLOCKED_VOICE_STANDING_FORBIDDEN', `${path}.${key}`);
      if (/(?:quality|prose|literary).*score|percentile|(?:overall|aggregate).*rank/i.test(key)) fail('BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN', `${path}.${key}`);
      if (/named.*author.*target|nearest.*author|similarity.*author/i.test(key)) fail('BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN', `${path}.${key}`);
      if (/replacement.*prose|candidate.*text|rewritten.*text|applied.*revision/i.test(key)) fail('BLOCKED_REWRITE_PAYLOAD_FORBIDDEN', `${path}.${key}`);
      fail('BLOCKED_RAW_TEXT_FORBIDDEN', `${path}.${key}`);
    }
    assertNoForbiddenPayload(child, `${path}.${key}`);
  }
}
function normalizeStrings(values, label, allowEmpty = true) {
  if (!Array.isArray(values)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:ARRAY_REQUIRED`);
  if (!allowEmpty && values.length === 0) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:NONEMPTY_REQUIRED`);
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!text(value)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', label);
    if (seen.has(value)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.duplicate:${value}`);
    seen.add(value); out.push(value);
  }
  return out.sort();
}
function normalizeEvidenceRefs(values) {
  if (!Array.isArray(values)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'evidence_refs');
  const seen = new Set();
  return values.map((x, i) => {
    exactKeys(x, ['evidence_ref','evidence_digest'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `evidence_refs.${i}`);
    if (!text(x.evidence_ref) || !digest(x.evidence_digest)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `evidence_refs.${i}`);
    if (seen.has(x.evidence_ref)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `evidence_refs.duplicate:${x.evidence_ref}`);
    seen.add(x.evidence_ref);
    return clone(x);
  }).sort((a,b) => a.evidence_ref.localeCompare(b.evidence_ref));
}
function normalizeDependencyRefs(values, context) {
  if (!Array.isArray(values)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'upstream_dependency_refs');
  const contextMap = new Map(context.dependency_snapshot_refs.map(x => [`${x.dependency_kind}:${x.dependency_ref}`, x]));
  const seen = new Set();
  return values.map((x, i) => {
    exactKeys(x, ['dependency_kind','dependency_ref','dependency_digest'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `upstream_dependency_refs.${i}`);
    if (!text(x.dependency_kind) || !text(x.dependency_ref) || !digest(x.dependency_digest)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `upstream_dependency_refs.${i}`);
    const key = `${x.dependency_kind}:${x.dependency_ref}`;
    if (seen.has(key)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `upstream_dependency_refs.duplicate:${key}`);
    const expected = contextMap.get(key);
    if (!expected || expected.dependency_digest !== x.dependency_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `upstream_dependency_refs.unbound:${key}`);
    seen.add(key);
    return clone(x);
  }).sort((a,b) => `${a.dependency_kind}:${a.dependency_ref}`.localeCompare(`${b.dependency_kind}:${b.dependency_ref}`));
}
function normalizeSignals(values, lensId) {
  if (!Array.isArray(values)) fail('BLOCKED_VOICE_STANDING_FORBIDDEN', 'external_owner_signal_refs');
  const seen = new Set();
  return values.map((x, i) => {
    exactKeys(x, ['owner_domain','signal_class','signal_ref'], 'BLOCKED_VOICE_STANDING_FORBIDDEN', `external_owner_signal_refs.${i}`);
    if (x.owner_domain !== 'B08' || !EXTERNAL_SIGNAL_CLASSES.includes(x.signal_class) || !text(x.signal_ref)) fail('BLOCKED_VOICE_STANDING_FORBIDDEN', `external_owner_signal_refs.${i}`);
    if (x.signal_class === 'VOICE_RELEVANT_LOCAL_SIGNAL' && !['B05-LENS-003','B05-LENS-006'].includes(lensId)) fail('BLOCKED_VOICE_STANDING_FORBIDDEN', `voice_signal_wrong_lens:${lensId}`);
    const key = `${x.owner_domain}:${x.signal_class}:${x.signal_ref}`;
    if (seen.has(key)) fail('BLOCKED_VOICE_STANDING_FORBIDDEN', `duplicate_signal:${key}`);
    seen.add(key); return clone(x);
  }).sort((a,b) => `${a.owner_domain}:${a.signal_class}:${a.signal_ref}`.localeCompare(`${b.owner_domain}:${b.signal_class}:${b.signal_ref}`));
}
function providerFieldsNull(payload) {
  return payload.provider_capability_id === null && payload.provider_operation_id === null && payload.provider_subject_ref === null && payload.provider_admission_ref === null && payload.provider_admission_digest === null;
}
function validateProviderV1(payload, providerAdmission) {
  if (payload.source_class === 'MODEL') {
    if (!obj(providerAdmission)) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', 'provider_admission');
    exactKeys(providerAdmission, ['provider_capability_id','provider_operation_id','provider_subject_ref','provider_admission_ref','provider_admission_digest','current'], 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED', 'provider_admission');
    if (!MODEL_CAPABILITIES.includes(providerAdmission.provider_capability_id) || !text(providerAdmission.provider_operation_id) || !text(providerAdmission.provider_subject_ref) || !text(providerAdmission.provider_admission_ref) || !digest(providerAdmission.provider_admission_digest) || providerAdmission.current !== true) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
    return {
      provider_capability_id: providerAdmission.provider_capability_id,
      provider_operation_id: providerAdmission.provider_operation_id,
      provider_subject_ref: providerAdmission.provider_subject_ref,
      provider_admission_ref: providerAdmission.provider_admission_ref,
      provider_admission_digest: providerAdmission.provider_admission_digest
    };
  }
  if (providerAdmission !== null && providerAdmission !== undefined) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', 'provider_binding_for_non_model');
  return {
    provider_capability_id: null,
    provider_operation_id: null,
    provider_subject_ref: null,
    provider_admission_ref: null,
    provider_admission_digest: null
  };
}
function requireLensDependenciesV1(context, lensId) {
  const hasB03 = context.story_bible_ref !== null && context.knowledge_candidate_id !== null;
  const hasB04 = context.reader_exposure_ref !== null;
  if (['B05-LENS-005','B05-LENS-006'].includes(lensId) && !hasB03) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${lensId}:B03_REQUIRED`);
  if (lensId === 'B05-LENS-009' && !hasB04) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${lensId}:B04_REQUIRED`);
  if (['B05-LENS-004','B05-LENS-007'].includes(lensId) && !hasB03 && !hasB04) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${lensId}:B03_OR_B04_REQUIRED`);
  if (lensId === 'B05-LENS-016' && (!hasB03 || context.author_constraint_refs.length === 0)) fail('BLOCKED_OWNER_CONSTRAINT', `${lensId}:B03_B10_REQUIRED`);
}
function observationSemanticV1(observation) {
  const out = clone(observation);
  delete out.diagnostic_observation_id;
  delete out.diagnostic_observation_digest;
  return out;
}
function diagnosticObservationDigestV1(observation) { return hash(observationSemanticV1(observation)); }

function acceptLiteraryDiagnosticObservationV1(input) {
  if (!obj(input)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  exactKeys(input, ['diagnostic_context','observation','provider_admission'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  assertNoForbiddenPayload(input.observation, 'observation');
  try { contextRuntime.validateLiteraryDiagnosticContextV1(input.diagnostic_context); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `context:${err.detail || err.message || 'invalid'}`); }
  const context = input.diagnostic_context;
  if (context.standing !== 'READY_FOR_DIAGNOSIS') fail(context.standing === 'BLOCKED_STALE' ? 'BLOCKED_CURRENTNESS_REQUIRED' : 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'context_not_ready');
  const p = input.observation;
  const required = [
    'lens_id','finding_class','target_anchor_refs','evidence_refs','upstream_dependency_refs','source_class','evidence_strength_class',
    'purpose_relevance_class','preservation_risk_class','collateral_risk_class','related_observation_refs','external_owner_signal_refs','scope_limits','abstention_or_blocker_reason','standing','canonical_effect'
  ];
  exactKeys(p, required, 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'observation');
  if (!context.requested_lens_ids.includes(p.lens_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `lens_not_requested:${p.lens_id}`);
  try { registry.assertLiteraryDiagnosticLensV1(p.lens_id); }
  catch (err) { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', p.lens_id); }
  requireLensDependenciesV1(context, p.lens_id);
  if (!FINDING_CLASSES.includes(p.finding_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'finding_class');
  if (!SOURCE_CLASSES.includes(p.source_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'source_class');
  if (!OBSERVATION_STANDINGS.includes(p.standing)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'standing');
  if (!EVIDENCE_STRENGTH_CLASSES.includes(p.evidence_strength_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'evidence_strength_class');
  if (!PURPOSE_RELEVANCE_CLASSES.includes(p.purpose_relevance_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'purpose_relevance_class');
  if (!RISK_CLASSES.includes(p.preservation_risk_class) || !RISK_CLASSES.includes(p.collateral_risk_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'risk_class');
  if (p.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  const anchors = normalizeStrings(p.target_anchor_refs, 'target_anchor_refs');
  const contextAnchors = new Set(context.source_anchor_refs.map(x => x.anchor_ref));
  for (const anchor of anchors) if (!contextAnchors.has(anchor)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `target_anchor_unbound:${anchor}`);
  const evidence = normalizeEvidenceRefs(p.evidence_refs);
  const deps = normalizeDependencyRefs(p.upstream_dependency_refs, context);
  const related = normalizeStrings(p.related_observation_refs, 'related_observation_refs');
  const signals = normalizeSignals(p.external_owner_signal_refs, p.lens_id);
  if (stable(p.scope_limits) !== stable(context.scope)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'scope_limits');
  if (SUBSTANTIVE.has(p.finding_class)) {
    if (p.standing !== 'ACCEPTED_UNCALIBRATED') fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'substantive_standing');
    if (anchors.length === 0 || evidence.length === 0 || deps.length === 0) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'substantive_evidence_required');
    if (p.evidence_strength_class === 'UNSPECIFIED') fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'substantive_strength_required');
    if (p.abstention_or_blocker_reason !== null) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'substantive_reason_must_be_null');
  } else if (p.finding_class === 'NO_FINDING') {
    if (p.standing !== 'ACCEPTED_UNCALIBRATED' || p.abstention_or_blocker_reason !== null) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'no_finding_standing');
  } else if (p.finding_class === 'ABSTAINED') {
    if (p.standing !== 'ABSTAINED' || p.evidence_strength_class !== 'UNSPECIFIED' || !text(p.abstention_or_blocker_reason)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'abstained_law');
  } else if (p.finding_class === 'BLOCKED') {
    if (p.standing !== 'BLOCKED' || p.evidence_strength_class !== 'UNSPECIFIED' || !text(p.abstention_or_blocker_reason)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'blocked_law');
  }
  const provider = validateProviderV1(p, input.provider_admission);
  const out = {
    observation_schema_version: OBSERVATION_SCHEMA_VERSION,
    diagnostic_observation_id: null,
    diagnostic_observation_digest: null,
    diagnostic_context_id: context.diagnostic_context_id,
    diagnostic_context_digest: context.diagnostic_context_digest,
    lens_id: p.lens_id,
    finding_class: p.finding_class,
    target_anchor_refs: anchors,
    evidence_refs: evidence,
    upstream_dependency_refs: deps,
    source_class: p.source_class,
    ...provider,
    evidence_strength_class: p.evidence_strength_class,
    purpose_relevance_class: p.purpose_relevance_class,
    preservation_risk_class: p.preservation_risk_class,
    collateral_risk_class: p.collateral_risk_class,
    related_observation_refs: related,
    external_owner_signal_refs: signals,
    scope_limits: clone(p.scope_limits),
    abstention_or_blocker_reason: p.abstention_or_blocker_reason,
    standing: p.standing,
    canonical_effect: false
  };
  const d = diagnosticObservationDigestV1(out);
  out.diagnostic_observation_digest = d;
  out.diagnostic_observation_id = `${OBSERVATION_PREFIX}${d}`;
  validateLiteraryDiagnosticObservationV1(out, context);
  return out;
}

function validateLiteraryDiagnosticObservationV1(observation, context) {
  const fields = [
    'observation_schema_version','diagnostic_observation_id','diagnostic_observation_digest','diagnostic_context_id','diagnostic_context_digest','lens_id','finding_class',
    'target_anchor_refs','evidence_refs','upstream_dependency_refs','source_class','provider_capability_id','provider_operation_id','provider_subject_ref','provider_admission_ref','provider_admission_digest',
    'evidence_strength_class','purpose_relevance_class','preservation_risk_class','collateral_risk_class','related_observation_refs','external_owner_signal_refs','scope_limits','abstention_or_blocker_reason','standing','canonical_effect'
  ];
  exactKeys(observation, fields, 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'sealed_observation');
  assertNoForbiddenPayload(observation, 'sealed_observation');
  if (observation.observation_schema_version !== OBSERVATION_SCHEMA_VERSION) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'schema');
  try { contextRuntime.validateLiteraryDiagnosticContextV1(context); } catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'context'); }
  if (observation.diagnostic_context_id !== context.diagnostic_context_id || observation.diagnostic_context_digest !== context.diagnostic_context_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'context_binding');
  try { registry.assertLiteraryDiagnosticLensV1(observation.lens_id); } catch (err) { fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', observation.lens_id); }
  if (!context.requested_lens_ids.includes(observation.lens_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'lens_not_requested');
  requireLensDependenciesV1(context, observation.lens_id);
  if (!FINDING_CLASSES.includes(observation.finding_class) || !SOURCE_CLASSES.includes(observation.source_class) || !OBSERVATION_STANDINGS.includes(observation.standing) || !EVIDENCE_STRENGTH_CLASSES.includes(observation.evidence_strength_class) || !PURPOSE_RELEVANCE_CLASSES.includes(observation.purpose_relevance_class) || !RISK_CLASSES.includes(observation.preservation_risk_class) || !RISK_CLASSES.includes(observation.collateral_risk_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'enum');
  if (observation.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  if (stable(observation.scope_limits) !== stable(context.scope)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'scope_limits');
  const contextAnchors = new Set(context.source_anchor_refs.map(x => x.anchor_ref));
  for (const anchor of observation.target_anchor_refs) if (!contextAnchors.has(anchor)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `anchor:${anchor}`);
  normalizeEvidenceRefs(observation.evidence_refs);
  normalizeDependencyRefs(observation.upstream_dependency_refs, context);
  normalizeSignals(observation.external_owner_signal_refs, observation.lens_id);
  if (observation.source_class === 'MODEL') {
    if (!MODEL_CAPABILITIES.includes(observation.provider_capability_id) || !text(observation.provider_operation_id) || !text(observation.provider_subject_ref) || !text(observation.provider_admission_ref) || !digest(observation.provider_admission_digest)) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
  } else if (!providerFieldsNull(observation)) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', 'non_model_provider_fields');
  if (SUBSTANTIVE.has(observation.finding_class)) {
    if (observation.standing !== 'ACCEPTED_UNCALIBRATED' || observation.target_anchor_refs.length === 0 || observation.evidence_refs.length === 0 || observation.upstream_dependency_refs.length === 0 || observation.evidence_strength_class === 'UNSPECIFIED' || observation.abstention_or_blocker_reason !== null) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'substantive_law');
  } else if (observation.finding_class === 'NO_FINDING') {
    if (observation.standing !== 'ACCEPTED_UNCALIBRATED' || observation.abstention_or_blocker_reason !== null) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'no_finding_law');
  } else if (observation.finding_class === 'ABSTAINED') {
    if (observation.standing !== 'ABSTAINED' || observation.evidence_strength_class !== 'UNSPECIFIED' || !text(observation.abstention_or_blocker_reason)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'abstained_law');
  } else if (observation.finding_class === 'BLOCKED') {
    if (observation.standing !== 'BLOCKED' || observation.evidence_strength_class !== 'UNSPECIFIED' || !text(observation.abstention_or_blocker_reason)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'blocked_law');
  }
  if (!digest(observation.diagnostic_observation_digest)) fail('BLOCKED_DIGEST_MISMATCH', 'observation_digest');
  const d = diagnosticObservationDigestV1(observation);
  if (observation.diagnostic_observation_digest !== d || observation.diagnostic_observation_id !== `${OBSERVATION_PREFIX}${d}`) fail('BLOCKED_DIGEST_MISMATCH', 'observation_identity');
  return true;
}

module.exports = {
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_PREFIX,
  FINDING_CLASSES,
  SOURCE_CLASSES,
  OBSERVATION_STANDINGS,
  EVIDENCE_STRENGTH_CLASSES,
  PURPOSE_RELEVANCE_CLASSES,
  RISK_CLASSES,
  MODEL_CAPABILITIES,
  EXTERNAL_SIGNAL_CLASSES,
  BookLiteraryDiagnosticObservationError,
  diagnosticObservationDigestV1,
  acceptLiteraryDiagnosticObservationV1,
  validateLiteraryDiagnosticObservationV1
};
