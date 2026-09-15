'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const registry = require('./book-reader-dimension-registry-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const knowledgeInvalidation = require('./book-knowledge-invalidation-v1');

const CURRENTNESS_SCHEMA_VERSION = 'BOOK_READER_UNDERSTANDING_CURRENTNESS_V1';
const CURRENTNESS_PREFIX = 'book-reader-currentness-v1:';
const RUNTIME_SCHEMA_VERSION = 'BOOK_READER_RUNTIME_V1';
const RUNTIME_PREFIX = 'book-reader-runtime-v1:';
const SHA256 = /^[a-f0-9]{64}$/;

const COMMAND_NAMES = Object.freeze([
  'ComputeReaderUnderstandingInvalidationV1'
]);

const QUERY_NAMES = Object.freeze([
  'GetReaderExposureProjectionV1',
  'GetReaderUnderstandingProjectionV1',
  'GetReaderDimensionEvidenceV1',
  'GetReaderLensCoverageV1',
  'GetReaderUnderstandingCurrentnessV1'
]);

const EXPOSURE_DEPENDENCY_KINDS = new Set([
  'STORY_BIBLE',
  'KNOWLEDGE',
  'SCOPE',
  'FRONTIER',
  'B03_INVALIDATION_IMPACT'
]);

class BookReaderCurrentnessError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookReaderCurrentnessError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookReaderCurrentnessError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function hash(v) { return kb.sha256(v); }
function stable(v) { return kb.stableStringify(v); }
function sorted(values) { return [...new Set(values)].sort(); }

function req(v, fields, label) {
  if (!obj(v)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:OBJECT_REQUIRED`);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(v, field)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.${field}`);
  }
}

function assertNoForbiddenPayload(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((x, i) => assertNoForbiddenPayload(x, `${path}[${i}]`));
  if (!obj(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (/score|rating|rank|percentile|aggregate/i.test(key)) fail('BLOCKED_UNIVERSAL_READER_SCORE_FORBIDDEN', `${path}.${key}`);
    if (/race|ethnic|religion|gender|sex|sexual|politic|nationality|disability|demographic/i.test(key)) fail('BLOCKED_DEMOGRAPHIC_ESSENTIALISM_FORBIDDEN', `${path}.${key}`);
    if (/raw.*(?:manuscript|source|document|text|bytes)/i.test(key) || /quoted.*text/i.test(key) || /full.*text/i.test(key) || /chain.*of.*thought/i.test(key) || /hidden.*reason/i.test(key) || /credential/i.test(key) || /secret/i.test(key)) {
      fail('BLOCKED_RAW_TEXT_FORBIDDEN', `${path}.${key}`);
    }
    assertNoForbiddenPayload(child, `${path}.${key}`);
  }
}

function compareProjectionBindings(exposureProjection, understandingProjection, observations) {
  try { exposure.validateReaderExposureProjectionV1(exposureProjection); }
  catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `exposure:${err.code || err.message || 'invalid'}`); }
  try { understanding.validateReaderUnderstandingProjectionV1(understandingProjection); }
  catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `understanding:${err.code || err.message || 'invalid'}`); }
  if (!Array.isArray(observations)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'observations');

  const directFields = [
    'book_project_id',
    'exposure_projection_id',
    'exposure_projection_digest',
    'story_bible_ref',
    'story_bible_digest',
    'knowledge_candidate_id',
    'knowledge_digest'
  ];
  for (const field of directFields) {
    const expected = field === 'exposure_projection_id' || field === 'exposure_projection_digest'
      ? exposureProjection[field]
      : exposureProjection[field];
    if (understandingProjection[field] !== expected) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', field);
  }
  if (stable(understandingProjection.scope) !== stable(exposureProjection.scope)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'scope');
  if (stable(understandingProjection.reveal_frontier) !== stable(exposureProjection.reveal_frontier)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'frontier');

  const seen = new Set();
  for (const observation of observations) {
    try { understanding.validateReaderObservationV1(observation, exposureProjection); }
    catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `observation:${err.code || err.message || 'invalid'}`); }
    if (seen.has(observation.observation_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `duplicate:${observation.observation_id}`);
    seen.add(observation.observation_id);
  }

  let rebuilt;
  try {
    rebuilt = understanding.assembleReaderUnderstandingProjectionV1({
      exposure_projection: exposureProjection,
      observations
    });
  } catch (err) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `rebuild:${err.code || err.message || 'invalid'}`);
  }
  if (rebuilt.understanding_projection_id !== understandingProjection.understanding_projection_id || rebuilt.understanding_projection_digest !== understandingProjection.understanding_projection_digest) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'projection_observation_set');
  }
  return true;
}

function validateCurrentBindings(bindings) {
  req(bindings, ['story_bible','knowledge','scope','reveal_frontier','observations','provider_admissions','calibrations'], 'current_bindings');
  req(bindings.story_bible, ['story_bible_ref','story_bible_digest','current'], 'current_bindings.story_bible');
  req(bindings.knowledge, ['knowledge_candidate_id','knowledge_digest','current'], 'current_bindings.knowledge');
  req(bindings.scope, ['scope_kind','scope_ref','scope_digest','current'], 'current_bindings.scope');
  req(bindings.reveal_frontier, ['frontier_anchor_id','frontier_ordinal','frontier_anchor_digest','current'], 'current_bindings.reveal_frontier');
  if (!text(bindings.story_bible.story_bible_ref) || !digest(bindings.story_bible.story_bible_digest)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'story_bible');
  if (!text(bindings.knowledge.knowledge_candidate_id) || !digest(bindings.knowledge.knowledge_digest)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'knowledge');
  if (!text(bindings.scope.scope_kind) || !text(bindings.scope.scope_ref) || !digest(bindings.scope.scope_digest)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'scope');
  if (!text(bindings.reveal_frontier.frontier_anchor_id) || !Number.isInteger(bindings.reveal_frontier.frontier_ordinal) || bindings.reveal_frontier.frontier_ordinal < 0 || !digest(bindings.reveal_frontier.frontier_anchor_digest)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'frontier');
  for (const item of [bindings.story_bible, bindings.knowledge, bindings.scope, bindings.reveal_frontier]) {
    if (typeof item.current !== 'boolean') fail('BLOCKED_CURRENTNESS_REQUIRED', 'current_boolean');
  }
  if (!Array.isArray(bindings.observations) || !Array.isArray(bindings.provider_admissions) || !Array.isArray(bindings.calibrations)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'binding_arrays');

  const observationIds = new Set();
  for (const item of bindings.observations) {
    req(item, ['observation_id','observation_digest','current'], 'current_bindings.observations');
    if (!text(item.observation_id) || !digest(item.observation_digest) || typeof item.current !== 'boolean') fail('BLOCKED_CURRENTNESS_REQUIRED', 'observation_binding');
    if (observationIds.has(item.observation_id)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate_observation:${item.observation_id}`);
    observationIds.add(item.observation_id);
  }

  const providerKeys = new Set();
  for (const item of bindings.provider_admissions) {
    req(item, ['provider_subject_ref','provider_admission_ref','provider_admission_digest','current'], 'current_bindings.provider_admissions');
    if (!text(item.provider_subject_ref) || !text(item.provider_admission_ref) || !digest(item.provider_admission_digest) || typeof item.current !== 'boolean') fail('BLOCKED_CURRENTNESS_REQUIRED', 'provider_binding');
    const key = `${item.provider_subject_ref}|${item.provider_admission_ref}`;
    if (providerKeys.has(key)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate_provider:${key}`);
    providerKeys.add(key);
  }

  const calibrationKeys = new Set();
  for (const item of bindings.calibrations) {
    req(item, ['calibration_ref','calibration_digest','calibration_class','current'], 'current_bindings.calibrations');
    if (!text(item.calibration_ref) || !digest(item.calibration_digest) || !understanding.SOURCE_CLASSES.includes(item.calibration_class) || typeof item.current !== 'boolean') fail('BLOCKED_CURRENTNESS_REQUIRED', 'calibration_binding');
    if (calibrationKeys.has(item.calibration_ref)) fail('BLOCKED_CURRENTNESS_REQUIRED', `duplicate_calibration:${item.calibration_ref}`);
    calibrationKeys.add(item.calibration_ref);
  }
  assertNoForbiddenPayload(bindings, 'current_bindings');
  return true;
}

function pushChange(changes, dependencyKind, dependencyRef, expectedRef, currentRef, expectedDigest, currentDigest, reasonCode) {
  changes.push({
    dependency_kind: dependencyKind,
    dependency_ref: dependencyRef,
    expected_ref: expectedRef,
    current_ref: currentRef,
    expected_digest: expectedDigest,
    current_digest: currentDigest,
    reason_code: reasonCode
  });
}

function evaluateB03Impact(b03InvalidationResult, projection, changes) {
  if (b03InvalidationResult === null || b03InvalidationResult === undefined) return { impact_ref: null, impact_digest: null };
  try { knowledgeInvalidation.validateInvalidationImpactV1(b03InvalidationResult); }
  catch (err) { fail('BLOCKED_CURRENTNESS_REQUIRED', `b03_impact:${err.code || err.message || 'invalid'}`); }
  const impact = b03InvalidationResult.impact;
  if (impact.base_story_bible_ref !== projection.story_bible_ref || impact.base_story_bible_digest !== projection.story_bible_digest || impact.base_knowledge_candidate_id !== projection.knowledge_candidate_id || impact.base_knowledge_digest !== projection.knowledge_digest) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'b03_impact_base');
  }
  if (Array.isArray(impact.changed_identity_refs) && impact.changed_identity_refs.length > 0) {
    pushChange(
      changes,
      'B03_INVALIDATION_IMPACT',
      impact.impact_id,
      projection.knowledge_candidate_id,
      impact.proposed_successor_candidate_ref,
      projection.knowledge_digest,
      impact.proposed_successor_candidate_digest,
      'B03_KNOWLEDGE_INVALIDATION_IMPACT'
    );
  }
  return { impact_ref: impact.impact_id, impact_digest: impact.impact_digest };
}

function dependencySnapshot(projection, observations) {
  const providerBindings = observations
    .filter(o => o.provider_subject_ref !== null)
    .map(o => ({
      provider_subject_ref: o.provider_subject_ref,
      provider_admission_ref: o.provider_admission_ref,
      provider_admission_digest: o.provider_admission_digest
    }));
  const calibrationBindings = observations
    .filter(o => o.calibration_ref !== null)
    .map(o => ({
      calibration_ref: o.calibration_ref,
      calibration_digest: o.calibration_digest,
      calibration_class: o.calibration_class
    }));
  providerBindings.sort((a, b) => `${a.provider_subject_ref}|${a.provider_admission_ref}`.localeCompare(`${b.provider_subject_ref}|${b.provider_admission_ref}`));
  calibrationBindings.sort((a, b) => a.calibration_ref.localeCompare(b.calibration_ref));
  return {
    story_bible: { story_bible_ref: projection.story_bible_ref, story_bible_digest: projection.story_bible_digest },
    knowledge: { knowledge_candidate_id: projection.knowledge_candidate_id, knowledge_digest: projection.knowledge_digest },
    scope: clone(projection.scope),
    reveal_frontier: clone(projection.reveal_frontier),
    observation_refs: projection.observation_refs.map(clone),
    provider_admission_bindings: providerBindings,
    calibration_bindings: calibrationBindings
  };
}

function computeReaderUnderstandingInvalidationV1(input) {
  req(input, ['exposure_projection','understanding_projection','observations','current_bindings'], 'input');
  compareProjectionBindings(input.exposure_projection, input.understanding_projection, input.observations);
  validateCurrentBindings(input.current_bindings);

  const projection = input.understanding_projection;
  const bindings = input.current_bindings;
  const changes = [];

  if (bindings.story_bible.current !== true || bindings.story_bible.story_bible_ref !== projection.story_bible_ref || bindings.story_bible.story_bible_digest !== projection.story_bible_digest) {
    pushChange(changes, 'STORY_BIBLE', projection.story_bible_ref, projection.story_bible_ref, bindings.story_bible.story_bible_ref, projection.story_bible_digest, bindings.story_bible.story_bible_digest, 'STORY_BIBLE_BINDING_CHANGED');
  }
  if (bindings.knowledge.current !== true || bindings.knowledge.knowledge_candidate_id !== projection.knowledge_candidate_id || bindings.knowledge.knowledge_digest !== projection.knowledge_digest) {
    pushChange(changes, 'KNOWLEDGE', projection.knowledge_candidate_id, projection.knowledge_candidate_id, bindings.knowledge.knowledge_candidate_id, projection.knowledge_digest, bindings.knowledge.knowledge_digest, 'KNOWLEDGE_BINDING_CHANGED');
  }
  const expectedScopeRef = `${projection.scope.scope_kind}:${projection.scope.scope_ref}`;
  const currentScopeRef = `${bindings.scope.scope_kind}:${bindings.scope.scope_ref}`;
  if (bindings.scope.current !== true || expectedScopeRef !== currentScopeRef || bindings.scope.scope_digest !== projection.scope.scope_digest) {
    pushChange(changes, 'SCOPE', expectedScopeRef, expectedScopeRef, currentScopeRef, projection.scope.scope_digest, bindings.scope.scope_digest, 'SCOPE_BINDING_CHANGED');
  }
  const expectedFrontierRef = `${projection.reveal_frontier.frontier_anchor_id}:${projection.reveal_frontier.frontier_ordinal}`;
  const currentFrontierRef = `${bindings.reveal_frontier.frontier_anchor_id}:${bindings.reveal_frontier.frontier_ordinal}`;
  if (bindings.reveal_frontier.current !== true || expectedFrontierRef !== currentFrontierRef || bindings.reveal_frontier.frontier_anchor_digest !== projection.reveal_frontier.frontier_anchor_digest) {
    pushChange(changes, 'FRONTIER', expectedFrontierRef, expectedFrontierRef, currentFrontierRef, projection.reveal_frontier.frontier_anchor_digest, bindings.reveal_frontier.frontier_anchor_digest, 'FRONTIER_BINDING_CHANGED');
  }

  const observationMap = new Map(bindings.observations.map(x => [x.observation_id, x]));
  for (const ref of projection.observation_refs) {
    const current = observationMap.get(ref.observation_id);
    if (!current || current.current !== true || current.observation_digest !== ref.observation_digest) {
      pushChange(changes, 'OBSERVATION', ref.observation_id, ref.observation_id, current ? current.observation_id : null, ref.observation_digest, current ? current.observation_digest : null, 'OBSERVATION_BINDING_CHANGED');
    }
  }

  const providerMap = new Map(bindings.provider_admissions.map(x => [`${x.provider_subject_ref}|${x.provider_admission_ref}`, x]));
  for (const observation of input.observations) {
    if (observation.provider_subject_ref === null) continue;
    const key = `${observation.provider_subject_ref}|${observation.provider_admission_ref}`;
    const current = providerMap.get(key);
    if (!current || current.current !== true || current.provider_admission_digest !== observation.provider_admission_digest) {
      pushChange(changes, 'PROVIDER_ADMISSION', key, observation.provider_admission_ref, current ? current.provider_admission_ref : null, observation.provider_admission_digest, current ? current.provider_admission_digest : null, 'PROVIDER_ADMISSION_CHANGED');
    }
  }

  const calibrationMap = new Map(bindings.calibrations.map(x => [x.calibration_ref, x]));
  for (const observation of input.observations) {
    if (observation.calibration_ref === null) continue;
    const current = calibrationMap.get(observation.calibration_ref);
    if (!current || current.current !== true || current.calibration_digest !== observation.calibration_digest || current.calibration_class !== observation.calibration_class) {
      pushChange(changes, 'CALIBRATION', observation.calibration_ref, observation.calibration_ref, current ? current.calibration_ref : null, observation.calibration_digest, current ? current.calibration_digest : null, 'CALIBRATION_BINDING_CHANGED');
    }
  }

  const b03 = evaluateB03Impact(input.b03_invalidation_result || null, projection, changes);
  changes.sort((a, b) => `${a.dependency_kind}|${a.dependency_ref}`.localeCompare(`${b.dependency_kind}|${b.dependency_ref}`));

  const exposureChanges = changes.filter(change => EXPOSURE_DEPENDENCY_KINDS.has(change.dependency_kind));
  const exposureCurrent = exposureChanges.length === 0;
  const understandingCurrent = exposureCurrent && changes.length === 0;

  const output = {
    currentness_schema_version: CURRENTNESS_SCHEMA_VERSION,
    currentness_id: null,
    currentness_digest: null,
    book_project_id: projection.book_project_id,
    exposure_projection_id: projection.exposure_projection_id,
    exposure_projection_digest: projection.exposure_projection_digest,
    understanding_projection_id: projection.understanding_projection_id,
    understanding_projection_digest: projection.understanding_projection_digest,
    dependency_snapshot: dependencySnapshot(projection, input.observations),
    b03_invalidation_impact_ref: b03.impact_ref,
    b03_invalidation_impact_digest: b03.impact_digest,
    exposure_current: exposureCurrent,
    understanding_current: understandingCurrent,
    exposure_currentness_standing: exposureCurrent ? 'CURRENT' : 'BLOCKED_STALE',
    understanding_currentness_standing: understandingCurrent ? 'CURRENT' : 'BLOCKED_STALE',
    changed_dependencies: changes,
    stale_dependency_kinds: sorted(changes.map(x => x.dependency_kind)),
    recompute_exposure_required: !exposureCurrent,
    recompute_understanding_required: !understandingCurrent,
    canonical_effect: false
  };
  assertNoForbiddenPayload(output, 'currentness');
  const semantic = clone(output);
  delete semantic.currentness_id;
  delete semantic.currentness_digest;
  const d = hash(semantic);
  output.currentness_digest = d;
  output.currentness_id = `${CURRENTNESS_PREFIX}${d}`;
  return output;
}

function validateReaderUnderstandingCurrentnessV1(currentness, exposureProjection = null, understandingProjection = null) {
  const fields = [
    'currentness_schema_version','currentness_id','currentness_digest','book_project_id','exposure_projection_id','exposure_projection_digest',
    'understanding_projection_id','understanding_projection_digest','dependency_snapshot','b03_invalidation_impact_ref','b03_invalidation_impact_digest',
    'exposure_current','understanding_current','exposure_currentness_standing','understanding_currentness_standing','changed_dependencies','stale_dependency_kinds',
    'recompute_exposure_required','recompute_understanding_required','canonical_effect'
  ];
  req(currentness, fields, 'currentness');
  assertNoForbiddenPayload(currentness, 'currentness');
  if (currentness.currentness_schema_version !== CURRENTNESS_SCHEMA_VERSION) fail('BLOCKED_CURRENTNESS_REQUIRED', 'schema');
  if (!digest(currentness.currentness_digest) || currentness.currentness_id !== `${CURRENTNESS_PREFIX}${currentness.currentness_digest}`) fail('BLOCKED_DIGEST_MISMATCH', 'currentness_identity');
  const semantic = clone(currentness);
  delete semantic.currentness_id;
  delete semantic.currentness_digest;
  if (hash(semantic) !== currentness.currentness_digest) fail('BLOCKED_DIGEST_MISMATCH', 'currentness');
  if (typeof currentness.exposure_current !== 'boolean' || typeof currentness.understanding_current !== 'boolean') fail('BLOCKED_CURRENTNESS_REQUIRED', 'booleans');
  if (!currentness.exposure_current && currentness.understanding_current) fail('BLOCKED_CURRENTNESS_REQUIRED', 'understanding_without_exposure');
  if (currentness.exposure_currentness_standing !== (currentness.exposure_current ? 'CURRENT' : 'BLOCKED_STALE')) fail('BLOCKED_CURRENTNESS_REQUIRED', 'exposure_standing');
  if (currentness.understanding_currentness_standing !== (currentness.understanding_current ? 'CURRENT' : 'BLOCKED_STALE')) fail('BLOCKED_CURRENTNESS_REQUIRED', 'understanding_standing');
  if (currentness.recompute_exposure_required !== !currentness.exposure_current || currentness.recompute_understanding_required !== !currentness.understanding_current) fail('BLOCKED_CURRENTNESS_REQUIRED', 'recompute_flags');
  if (!Array.isArray(currentness.changed_dependencies) || !Array.isArray(currentness.stale_dependency_kinds)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'change_arrays');
  if (currentness.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  if ((currentness.b03_invalidation_impact_ref === null) !== (currentness.b03_invalidation_impact_digest === null)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'b03_impact_pair');
  if (currentness.b03_invalidation_impact_digest !== null && !digest(currentness.b03_invalidation_impact_digest)) fail('BLOCKED_DIGEST_MISMATCH', 'b03_impact');
  if (exposureProjection) {
    try { exposure.validateReaderExposureProjectionV1(exposureProjection); }
    catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `exposure:${err.code || err.message || 'invalid'}`); }
    if (currentness.exposure_projection_id !== exposureProjection.exposure_projection_id || currentness.exposure_projection_digest !== exposureProjection.exposure_projection_digest) fail('BLOCKED_CURRENTNESS_REQUIRED', 'exposure_binding');
  }
  if (understandingProjection) {
    try { understanding.validateReaderUnderstandingProjectionV1(understandingProjection); }
    catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `understanding:${err.code || err.message || 'invalid'}`); }
    if (currentness.understanding_projection_id !== understandingProjection.understanding_projection_id || currentness.understanding_projection_digest !== understandingProjection.understanding_projection_digest) fail('BLOCKED_CURRENTNESS_REQUIRED', 'understanding_binding');
  }
  return true;
}

function requireExposureCurrent(currentness, exposureProjection) {
  validateReaderUnderstandingCurrentnessV1(currentness, exposureProjection, null);
  if (currentness.exposure_current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', 'exposure_stale');
}

function requireUnderstandingCurrent(currentness, exposureProjection, understandingProjection) {
  validateReaderUnderstandingCurrentnessV1(currentness, exposureProjection, understandingProjection);
  if (currentness.understanding_current !== true) fail('BLOCKED_CURRENTNESS_REQUIRED', 'understanding_stale');
}

function getReaderExposureProjectionV1(input) {
  req(input, ['exposure_projection','currentness'], 'query');
  requireExposureCurrent(input.currentness, input.exposure_projection);
  return clone(input.exposure_projection);
}

function getReaderUnderstandingProjectionV1(input) {
  req(input, ['exposure_projection','understanding_projection','currentness'], 'query');
  requireUnderstandingCurrent(input.currentness, input.exposure_projection, input.understanding_projection);
  return clone(input.understanding_projection);
}

function observationEvidenceSummary(observations, refs) {
  const map = new Map(observations.map(o => [o.observation_id, o]));
  return refs.map(ref => {
    const observation = map.get(ref.observation_id);
    if (!observation || observation.observation_digest !== ref.observation_digest) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `query_observation:${ref.observation_id}`);
    return {
      observation_id: observation.observation_id,
      observation_digest: observation.observation_digest,
      source_class: observation.source_class,
      standing: observation.standing,
      provider_subject_ref: observation.provider_subject_ref,
      reader_profile_ref: observation.reader_profile_ref,
      evidence_refs: clone(observation.evidence_refs),
      calibration_ref: observation.calibration_ref
    };
  });
}

function getReaderDimensionEvidenceV1(input) {
  req(input, ['exposure_projection','understanding_projection','observations','currentness','dimension_id'], 'query');
  requireUnderstandingCurrent(input.currentness, input.exposure_projection, input.understanding_projection);
  try { registry.getDimensionV1(input.dimension_id); }
  catch (_) { fail('BLOCKED_DIMENSION_UNKNOWN', String(input.dimension_id)); }
  const entry = input.understanding_projection.dimension_dispositions.find(x => x.dimension_id === input.dimension_id);
  if (!entry) fail('BLOCKED_DIMENSION_UNKNOWN', String(input.dimension_id));
  const result = {
    query: 'GetReaderDimensionEvidenceV1',
    understanding_projection_id: input.understanding_projection.understanding_projection_id,
    dimension_id: input.dimension_id,
    disposition: entry.disposition,
    observation_refs: clone(entry.observation_refs),
    observation_evidence: observationEvidenceSummary(input.observations, entry.observation_refs),
    canonical_effect: false
  };
  assertNoForbiddenPayload(result, 'dimension_query');
  return result;
}

function getReaderLensCoverageV1(input) {
  req(input, ['exposure_projection','understanding_projection','observations','currentness','perspective_lens_id'], 'query');
  requireUnderstandingCurrent(input.currentness, input.exposure_projection, input.understanding_projection);
  try { registry.assertLensV1(input.perspective_lens_id); }
  catch (_) { fail('BLOCKED_LENS_UNKNOWN', String(input.perspective_lens_id)); }
  const entry = input.understanding_projection.lens_coverage.find(x => x.perspective_lens_id === input.perspective_lens_id);
  if (!entry) fail('BLOCKED_LENS_UNKNOWN', String(input.perspective_lens_id));
  const result = {
    query: 'GetReaderLensCoverageV1',
    understanding_projection_id: input.understanding_projection.understanding_projection_id,
    perspective_lens_id: input.perspective_lens_id,
    disposition: entry.disposition,
    observation_refs: clone(entry.observation_refs),
    observation_evidence: observationEvidenceSummary(input.observations, entry.observation_refs),
    canonical_effect: false
  };
  assertNoForbiddenPayload(result, 'lens_query');
  return result;
}

function getReaderUnderstandingCurrentnessV1(input) {
  req(input, ['currentness'], 'query');
  validateReaderUnderstandingCurrentnessV1(input.currentness, input.exposure_projection || null, input.understanding_projection || null);
  return clone(input.currentness);
}

function runtimeSemantic(record) {
  const out = clone(record);
  delete out.runtime_id;
  delete out.runtime_digest;
  return out;
}

function validateRuntimeRecordV1(record) {
  req(record, ['runtime_schema_version','runtime_id','runtime_digest','book_project_id','exposure_projection_id','exposure_projection_digest','understanding_projection_id','understanding_projection_digest','currentness_id','currentness_digest','command_names','query_names','provider_registry_modified','canonical_effect'], 'runtime');
  if (record.runtime_schema_version !== RUNTIME_SCHEMA_VERSION) fail('BLOCKED_CURRENTNESS_REQUIRED', 'runtime_schema');
  if (stable(record.command_names) !== stable(COMMAND_NAMES) || stable(record.query_names) !== stable(QUERY_NAMES)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'runtime_surface');
  if (record.provider_registry_modified !== false || record.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN', 'runtime_authority');
  if (!digest(record.runtime_digest) || record.runtime_id !== `${RUNTIME_PREFIX}${record.runtime_digest}` || hash(runtimeSemantic(record)) !== record.runtime_digest) fail('BLOCKED_DIGEST_MISMATCH', 'runtime');
  return true;
}

function createBookReaderRuntimeV1(input) {
  req(input, ['exposure_projection','understanding_projection','observations','current_bindings'], 'runtime_input');
  const frozenInput = clone(input);
  const currentness = computeReaderUnderstandingInvalidationV1(frozenInput);
  const record = {
    runtime_schema_version: RUNTIME_SCHEMA_VERSION,
    runtime_id: null,
    runtime_digest: null,
    book_project_id: input.understanding_projection.book_project_id,
    exposure_projection_id: input.exposure_projection.exposure_projection_id,
    exposure_projection_digest: input.exposure_projection.exposure_projection_digest,
    understanding_projection_id: input.understanding_projection.understanding_projection_id,
    understanding_projection_digest: input.understanding_projection.understanding_projection_digest,
    currentness_id: currentness.currentness_id,
    currentness_digest: currentness.currentness_digest,
    command_names: [...COMMAND_NAMES],
    query_names: [...QUERY_NAMES],
    provider_registry_modified: false,
    canonical_effect: false
  };
  const d = hash(runtimeSemantic(record));
  record.runtime_digest = d;
  record.runtime_id = `${RUNTIME_PREFIX}${d}`;
  validateRuntimeRecordV1(record);

  function execute(operationName, args = {}) {
    if (!text(operationName)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'runtime_operation');
    if (!obj(args)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'runtime_args');
    if (operationName === 'ComputeReaderUnderstandingInvalidationV1') {
      if (Object.keys(args).length !== 0) fail('BLOCKED_CURRENTNESS_REQUIRED', 'command_args_not_supported');
      return computeReaderUnderstandingInvalidationV1(clone(frozenInput));
    }
    if (operationName === 'GetReaderExposureProjectionV1') {
      return getReaderExposureProjectionV1({ exposure_projection: frozenInput.exposure_projection, currentness });
    }
    if (operationName === 'GetReaderUnderstandingProjectionV1') {
      return getReaderUnderstandingProjectionV1({ exposure_projection: frozenInput.exposure_projection, understanding_projection: frozenInput.understanding_projection, currentness });
    }
    if (operationName === 'GetReaderDimensionEvidenceV1') {
      return getReaderDimensionEvidenceV1({ exposure_projection: frozenInput.exposure_projection, understanding_projection: frozenInput.understanding_projection, observations: frozenInput.observations, currentness, dimension_id: args.dimension_id });
    }
    if (operationName === 'GetReaderLensCoverageV1') {
      return getReaderLensCoverageV1({ exposure_projection: frozenInput.exposure_projection, understanding_projection: frozenInput.understanding_projection, observations: frozenInput.observations, currentness, perspective_lens_id: args.perspective_lens_id });
    }
    if (operationName === 'GetReaderUnderstandingCurrentnessV1') {
      return getReaderUnderstandingCurrentnessV1({ currentness, exposure_projection: frozenInput.exposure_projection, understanding_projection: frozenInput.understanding_projection });
    }
    fail('BLOCKED_CURRENTNESS_REQUIRED', `runtime_operation_unknown:${operationName}`);
  }

  return Object.freeze({ ...record, execute });
}

module.exports = {
  BookReaderCurrentnessError,
  CURRENTNESS_SCHEMA_VERSION,
  CURRENTNESS_PREFIX,
  RUNTIME_SCHEMA_VERSION,
  RUNTIME_PREFIX,
  COMMAND_NAMES,
  QUERY_NAMES,
  computeReaderUnderstandingInvalidationV1,
  validateReaderUnderstandingCurrentnessV1,
  getReaderExposureProjectionV1,
  getReaderUnderstandingProjectionV1,
  getReaderDimensionEvidenceV1,
  getReaderLensCoverageV1,
  getReaderUnderstandingCurrentnessV1,
  validateRuntimeRecordV1,
  createBookReaderRuntimeV1
};