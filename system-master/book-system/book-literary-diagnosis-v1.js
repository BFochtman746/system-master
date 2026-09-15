'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const contextRuntime = require('./book-literary-diagnostic-context-v1');
const registry = require('./book-literary-diagnostic-lens-registry-v1');
const observationRuntime = require('./book-literary-diagnostic-observation-v1');

const DIAGNOSIS_SCHEMA_VERSION = 'BOOK_LITERARY_DIAGNOSIS_V1';
const DIAGNOSIS_PREFIX = 'book-literary-diagnosis-v1:';
const COVERAGE_DISPOSITIONS = Object.freeze(['OBSERVED','NO_FINDING','ABSTAINED','BLOCKED','UNOBSERVED']);
const DIAGNOSIS_STANDINGS = Object.freeze(['PARTIALLY_OBSERVED','DIAGNOSED','BLOCKED_STALE','BLOCKED_INVALID']);
const CURRENTNESS_STANDINGS = Object.freeze(['CURRENT','STALE','INVALID']);
const SHA256 = /^[a-f0-9]{64}$/;

class BookLiteraryDiagnosisError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLiteraryDiagnosisError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail = '') { throw new BookLiteraryDiagnosisError(code, detail); }
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
function uniqueSortedStrings(values, label) {
  if (!Array.isArray(values)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:ARRAY_REQUIRED`);
  const seen = new Set();
  const out = [];
  for (const x of values) {
    if (!text(x)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', label);
    if (seen.has(x)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.duplicate:${x}`);
    seen.add(x); out.push(x);
  }
  return out.sort();
}
function diagnosisSemanticV1(diagnosis) {
  const out = clone(diagnosis);
  delete out.diagnosis_id;
  delete out.diagnosis_digest;
  return out;
}
function diagnosisDigestV1(diagnosis) { return hash(diagnosisSemanticV1(diagnosis)); }

function observationDispositionV1(observations) {
  if (observations.length === 0) return 'UNOBSERVED';
  if (observations.some(x => x.standing === 'ACCEPTED_UNCALIBRATED' && ['STRENGTH','LIMITATION','RISK','OPPORTUNITY_SUPPORT','CONTRADICTION'].includes(x.finding_class))) return 'OBSERVED';
  if (observations.some(x => x.standing === 'ACCEPTED_UNCALIBRATED' && x.finding_class === 'NO_FINDING')) return 'NO_FINDING';
  if (observations.some(x => x.standing === 'BLOCKED')) return 'BLOCKED';
  if (observations.some(x => x.standing === 'ABSTAINED')) return 'ABSTAINED';
  return 'UNOBSERVED';
}

function normalizeObservationSetV1(context, observations) {
  if (!Array.isArray(observations)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'observations');
  const ids = new Set();
  const out = observations.map((observation, i) => {
    try { observationRuntime.validateLiteraryDiagnosticObservationV1(observation, context); }
    catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation.${i}:${err.detail || err.message || 'invalid'}`); }
    if (ids.has(observation.diagnostic_observation_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `duplicate_observation:${observation.diagnostic_observation_id}`);
    ids.add(observation.diagnostic_observation_id);
    return clone(observation);
  }).sort((a,b) => a.diagnostic_observation_id.localeCompare(b.diagnostic_observation_id));
  for (const observation of out) {
    for (const related of observation.related_observation_refs) {
      if (!ids.has(related)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `related_observation_unbound:${related}`);
      if (related === observation.diagnostic_observation_id) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `self_related_observation:${related}`);
    }
  }
  return out;
}

function assembleLiteraryDiagnosisV1(input) {
  if (!obj(input)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  exactKeys(input, ['diagnostic_context','observations'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  try { contextRuntime.validateLiteraryDiagnosticContextV1(input.diagnostic_context); }
  catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `context:${err.detail || err.message || 'invalid'}`); }
  const context = input.diagnostic_context;
  if (context.standing === 'BLOCKED_STALE') fail('BLOCKED_CURRENTNESS_REQUIRED', 'context');
  if (context.standing !== 'READY_FOR_DIAGNOSIS') fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `context_standing:${context.standing}`);
  const observations = normalizeObservationSetV1(context, input.observations);
  const byLens = new Map(registry.LENSES.map(lens => [lens.lens_id, []]));
  for (const observation of observations) byLens.get(observation.lens_id).push(observation);

  const coverage = registry.LENSES.map(lens => {
    const lensObservations = byLens.get(lens.lens_id);
    const requested = context.requested_lens_ids.includes(lens.lens_id);
    const disposition = requested ? observationDispositionV1(lensObservations) : 'UNOBSERVED';
    if (!requested && lensObservations.length !== 0) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `unrequested_lens_observed:${lens.lens_id}`);
    return {
      lens_id: lens.lens_id,
      disposition,
      observation_refs: lensObservations.map(x => ({ observation_id: x.diagnostic_observation_id, observation_digest: x.diagnostic_observation_digest }))
    };
  });

  const strengthRefs = observations.filter(x => x.finding_class === 'STRENGTH').map(x => x.diagnostic_observation_id).sort();
  const limitationRiskOpportunityRefs = observations.filter(x => ['LIMITATION','RISK','OPPORTUNITY_SUPPORT'].includes(x.finding_class)).map(x => x.diagnostic_observation_id).sort();
  const contradictionRefs = observations.filter(x => x.finding_class === 'CONTRADICTION').map(x => x.diagnostic_observation_id).sort();
  const signals = [];
  const signalKeys = new Set();
  for (const observation of observations) {
    for (const signal of observation.external_owner_signal_refs) {
      const key = `${signal.owner_domain}:${signal.signal_class}:${signal.signal_ref}`;
      if (!signalKeys.has(key)) { signalKeys.add(key); signals.push(clone(signal)); }
    }
  }
  signals.sort((a,b) => `${a.owner_domain}:${a.signal_class}:${a.signal_ref}`.localeCompare(`${b.owner_domain}:${b.signal_class}:${b.signal_ref}`));

  const dependencyMap = new Map();
  for (const dep of context.dependency_snapshot_refs) dependencyMap.set(`${dep.dependency_kind}:${dep.dependency_ref}`, clone(dep));
  for (const observation of observations) {
    for (const dep of observation.upstream_dependency_refs) dependencyMap.set(`${dep.dependency_kind}:${dep.dependency_ref}`, clone(dep));
    if (observation.source_class === 'MODEL') {
      dependencyMap.set(`B01_PROVIDER_ADMISSION:${observation.provider_admission_ref}`, {
        dependency_kind: 'B01_PROVIDER_ADMISSION',
        dependency_ref: observation.provider_admission_ref,
        dependency_digest: observation.provider_admission_digest
      });
    }
  }
  const dependencyRefs = [...dependencyMap.values()].sort((a,b) => `${a.dependency_kind}:${a.dependency_ref}`.localeCompare(`${b.dependency_kind}:${b.dependency_ref}`));

  const requestedCoverage = coverage.filter(x => context.requested_lens_ids.includes(x.lens_id));
  const fullyResolved = requestedCoverage.length > 0 && requestedCoverage.every(x => ['OBSERVED','NO_FINDING'].includes(x.disposition));
  const standing = fullyResolved ? 'DIAGNOSED' : 'PARTIALLY_OBSERVED';

  const out = {
    diagnosis_schema_version: DIAGNOSIS_SCHEMA_VERSION,
    diagnosis_id: null,
    diagnosis_digest: null,
    book_project_id: context.book_project_id,
    diagnostic_context_id: context.diagnostic_context_id,
    diagnostic_context_digest: context.diagnostic_context_digest,
    observation_refs: observations.map(x => ({ observation_id: x.diagnostic_observation_id, observation_digest: x.diagnostic_observation_digest })),
    lens_coverage: coverage,
    strength_observation_refs: strengthRefs,
    limitation_risk_opportunity_observation_refs: limitationRiskOpportunityRefs,
    contradiction_observation_refs: contradictionRefs,
    external_owner_signal_refs: signals,
    dependency_refs: dependencyRefs,
    standing,
    currentness_standing: 'CURRENT',
    canonical_effect: false
  };
  const d = diagnosisDigestV1(out);
  out.diagnosis_digest = d;
  out.diagnosis_id = `${DIAGNOSIS_PREFIX}${d}`;
  validateLiteraryDiagnosisV1(out, context, observations);
  return out;
}

function validateLiteraryDiagnosisV1(diagnosis, context, observations) {
  const fields = [
    'diagnosis_schema_version','diagnosis_id','diagnosis_digest','book_project_id','diagnostic_context_id','diagnostic_context_digest','observation_refs','lens_coverage',
    'strength_observation_refs','limitation_risk_opportunity_observation_refs','contradiction_observation_refs','external_owner_signal_refs','dependency_refs','standing','currentness_standing','canonical_effect'
  ];
  exactKeys(diagnosis, fields, 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'diagnosis');
  try { contextRuntime.validateLiteraryDiagnosticContextV1(context); } catch (err) { fail(err.code || 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'context'); }
  const sealed = normalizeObservationSetV1(context, observations);
  if (diagnosis.diagnosis_schema_version !== DIAGNOSIS_SCHEMA_VERSION || diagnosis.book_project_id !== context.book_project_id || diagnosis.diagnostic_context_id !== context.diagnostic_context_id || diagnosis.diagnostic_context_digest !== context.diagnostic_context_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'diagnosis_context_binding');
  if (!Array.isArray(diagnosis.observation_refs) || diagnosis.observation_refs.length !== sealed.length) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'observation_refs');
  for (let i = 0; i < sealed.length; i += 1) {
    const ref = diagnosis.observation_refs[i];
    exactKeys(ref, ['observation_id','observation_digest'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation_refs.${i}`);
    if (ref.observation_id !== sealed[i].diagnostic_observation_id || ref.observation_digest !== sealed[i].diagnostic_observation_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation_refs.${i}`);
  }
  if (!Array.isArray(diagnosis.lens_coverage) || diagnosis.lens_coverage.length !== 16) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', 'coverage_cardinality');
  const coverageIds = new Set();
  for (let i = 0; i < registry.LENSES.length; i += 1) {
    const c = diagnosis.lens_coverage[i];
    exactKeys(c, ['lens_id','disposition','observation_refs'], 'BLOCKED_OBSERVATION_BINDING_MISMATCH', `lens_coverage.${i}`);
    if (c.lens_id !== registry.LENSES[i].lens_id || coverageIds.has(c.lens_id) || !COVERAGE_DISPOSITIONS.includes(c.disposition)) fail('BLOCKED_DIAGNOSTIC_LENS_UNKNOWN', `lens_coverage.${i}`);
    coverageIds.add(c.lens_id);
    const expected = sealed.filter(x => x.lens_id === c.lens_id).map(x => ({ observation_id: x.diagnostic_observation_id, observation_digest: x.diagnostic_observation_digest }));
    if (stable(c.observation_refs) !== stable(expected)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `coverage_refs:${c.lens_id}`);
    if (!context.requested_lens_ids.includes(c.lens_id) && c.disposition !== 'UNOBSERVED') fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `unrequested_coverage:${c.lens_id}`);
    if (context.requested_lens_ids.includes(c.lens_id) && c.disposition !== observationDispositionV1(sealed.filter(x => x.lens_id === c.lens_id))) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `coverage_disposition:${c.lens_id}`);
  }
  uniqueSortedStrings(diagnosis.strength_observation_refs, 'strength_observation_refs');
  uniqueSortedStrings(diagnosis.limitation_risk_opportunity_observation_refs, 'limitation_risk_opportunity_observation_refs');
  uniqueSortedStrings(diagnosis.contradiction_observation_refs, 'contradiction_observation_refs');
  if (!Array.isArray(diagnosis.external_owner_signal_refs) || !Array.isArray(diagnosis.dependency_refs)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'diagnosis_arrays');
  if (!DIAGNOSIS_STANDINGS.includes(diagnosis.standing) || !CURRENTNESS_STANDINGS.includes(diagnosis.currentness_standing)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'diagnosis_standing');
  if (diagnosis.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  if (!digest(diagnosis.diagnosis_digest)) fail('BLOCKED_DIGEST_MISMATCH', 'diagnosis_digest');
  const d = diagnosisDigestV1(diagnosis);
  if (diagnosis.diagnosis_digest !== d || diagnosis.diagnosis_id !== `${DIAGNOSIS_PREFIX}${d}`) fail('BLOCKED_DIGEST_MISMATCH', 'diagnosis_identity');

  const rebuilt = assembleLiteraryDiagnosisV1({ diagnostic_context: context, observations: sealed });
  if (rebuilt.diagnosis_id !== diagnosis.diagnosis_id || rebuilt.diagnosis_digest !== diagnosis.diagnosis_digest || stable(rebuilt) !== stable(diagnosis)) fail('BLOCKED_DIGEST_MISMATCH', 'diagnosis_rebuild');
  return true;
}

module.exports = {
  DIAGNOSIS_SCHEMA_VERSION,
  DIAGNOSIS_PREFIX,
  COVERAGE_DISPOSITIONS,
  DIAGNOSIS_STANDINGS,
  CURRENTNESS_STANDINGS,
  BookLiteraryDiagnosisError,
  diagnosisDigestV1,
  assembleLiteraryDiagnosisV1,
  validateLiteraryDiagnosisV1
};
