'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const registry = require('./book-reader-dimension-registry-v1');
const exposure = require('./book-reader-exposure-projection-v1');

const OBSERVATION_SCHEMA_VERSION = 'BOOK_READER_OBSERVATION_V1';
const OBSERVATION_PREFIX = 'book-reader-observation-v1:';
const UNDERSTANDING_SCHEMA_VERSION = 'BOOK_READER_UNDERSTANDING_V1';
const UNDERSTANDING_PREFIX = 'book-reader-understanding-v1:';
const SHA256 = /^[a-f0-9]{64}$/;

const SOURCE_CLASSES = Object.freeze(['DETERMINISTIC', 'MODEL', 'SYNTHETIC_READER', 'HUMAN']);
const OBSERVATION_STANDINGS = Object.freeze(['OBSERVED_UNCALIBRATED', 'OBSERVED_CALIBRATED', 'ABSTAINED', 'NOT_APPLICABLE']);
const DIMENSION_DISPOSITIONS = Object.freeze(['OBSERVED', 'ABSTAINED', 'NOT_APPLICABLE', 'UNOBSERVED']);
const PROJECTION_STANDINGS = Object.freeze(['READY_FOR_OBSERVATION', 'PARTIALLY_OBSERVED', 'OBSERVED_UNCALIBRATED', 'OBSERVED_WITH_CALIBRATION_EVIDENCE', 'BLOCKED_STALE', 'BLOCKED_INVALID']);
const EXTERNAL_CALIBRATION_FENCES = Object.freeze([
  'MODEL_READER_SIMULATION_CALIBRATION_REQUIRED',
  'HUMAN_READER_ALIGNMENT_REQUIRED',
  'REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED',
  'PROVIDER_SUBJECT_ADMISSION_REQUIRED'
]);

const CANDIDATE_FIELDS = Object.freeze([
  'observation_schema_version',
  'exposure_projection_id',
  'exposure_projection_digest',
  'target',
  'source_class',
  'standing',
  'provider_subject_ref',
  'provider_admission_ref',
  'reader_profile_ref',
  'evidence_refs',
  'confidence',
  'calibration_ref',
  'reveal_frontier',
  'canonical_effect'
]);

const SEALED_FIELDS = Object.freeze([
  'observation_schema_version',
  'observation_id',
  'observation_digest',
  'exposure_projection_id',
  'exposure_projection_digest',
  'target',
  'source_class',
  'standing',
  'provider_subject_ref',
  'provider_admission_ref',
  'reader_profile_ref',
  'evidence_refs',
  'confidence',
  'calibration_ref',
  'reveal_frontier',
  'canonical_effect'
]);

class BookReaderUnderstandingError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookReaderUnderstandingError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookReaderUnderstandingError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function digest(v) { return typeof v === 'string' && SHA256.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function hash(v) { return kb.sha256(v); }
function sorted(values) { return [...new Set(values)].sort(); }
function nullableText(v) { return v === null || text(v); }

function req(v, fields, label) {
  if (!obj(v)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}:OBJECT_REQUIRED`);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(v, field)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.${field}`);
  }
}

function assertExactKeys(v, fields, label) {
  const expected = new Set(fields);
  const actual = Object.keys(v);
  for (const key of actual) if (!expected.has(key)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.unexpected:${key}`);
  for (const key of fields) if (!Object.prototype.hasOwnProperty.call(v, key)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `${label}.missing:${key}`);
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

function validateFrontierBinding(frontier, exposureProjection) {
  if (!obj(frontier) || !text(frontier.frontier_anchor_id) || !Number.isInteger(frontier.frontier_ordinal) || frontier.frontier_ordinal < 0 || !digest(frontier.frontier_anchor_digest)) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'frontier');
  }
  const e = exposureProjection.reveal_frontier;
  if (frontier.frontier_anchor_id !== e.frontier_anchor_id || frontier.frontier_ordinal !== e.frontier_ordinal || frontier.frontier_anchor_digest !== e.frontier_anchor_digest) {
    fail('BLOCKED_OBSERVATION_STALE', 'frontier');
  }
}

function validateTarget(target) {
  if (!obj(target)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'target');
  assertExactKeys(target, ['dimension_id', 'perspective_lens_id'], 'target');
  const hasDimension = target.dimension_id !== null;
  const hasLens = target.perspective_lens_id !== null;
  if (hasDimension === hasLens) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'target_exactly_one');
  if (hasDimension) {
    try { registry.getDimensionV1(target.dimension_id); }
    catch (_) { fail('BLOCKED_DIMENSION_UNKNOWN', String(target.dimension_id)); }
  }
  if (hasLens) {
    try { registry.assertLensV1(target.perspective_lens_id); }
    catch (_) { fail('BLOCKED_LENS_UNKNOWN', String(target.perspective_lens_id)); }
  }
}

function validateEvidenceRefs(refs, standing) {
  if (!Array.isArray(refs) || refs.some(x => !text(x))) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'evidence_refs');
  if ((standing === 'OBSERVED_UNCALIBRATED' || standing === 'OBSERVED_CALIBRATED') && refs.length === 0) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'observed_requires_evidence');
  }
}

function validateProviderBinding(candidate, providerAdmissionBinding) {
  const providerSource = candidate.source_class === 'MODEL' || candidate.source_class === 'SYNTHETIC_READER';
  if (!providerSource) {
    if (candidate.provider_subject_ref !== null || candidate.provider_admission_ref !== null) {
      if (candidate.source_class === 'HUMAN') fail('BLOCKED_HUMAN_STANDING_SYNTHESIZED', 'provider_claim_on_human_source');
      fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'provider_binding_not_applicable');
    }
    return;
  }
  if (!text(candidate.provider_subject_ref) || !text(candidate.provider_admission_ref)) {
    fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', 'provider_refs_required');
  }
  if (!obj(providerAdmissionBinding) || providerAdmissionBinding.current !== true || providerAdmissionBinding.provider_subject_ref !== candidate.provider_subject_ref || providerAdmissionBinding.provider_admission_ref !== candidate.provider_admission_ref) {
    fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', candidate.provider_subject_ref);
  }
  if (!digest(providerAdmissionBinding.provider_admission_digest)) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED', 'admission_digest');
}

function validateCalibrationBinding(candidate, calibrationBinding) {
  if (candidate.standing !== 'OBSERVED_CALIBRATED') return;
  if (!text(candidate.calibration_ref)) fail('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED', 'calibration_ref');
  if (!obj(calibrationBinding) || calibrationBinding.current !== true || calibrationBinding.calibration_ref !== candidate.calibration_ref || !digest(calibrationBinding.calibration_digest)) {
    fail('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED', candidate.calibration_ref || 'missing');
  }
  if (!SOURCE_CLASSES.includes(calibrationBinding.calibration_class)) fail('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED', 'calibration_class');
  if ((candidate.source_class === 'MODEL' || candidate.source_class === 'SYNTHETIC_READER') && calibrationBinding.calibration_class === 'HUMAN') {
    fail('BLOCKED_HUMAN_STANDING_SYNTHESIZED', candidate.source_class);
  }
  if (calibrationBinding.calibration_class !== candidate.source_class) {
    fail('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED', 'source_class_mismatch');
  }
}

function validateCandidate(candidate, exposureProjection, providerAdmissionBinding, calibrationBinding) {
  assertNoForbiddenPayload(candidate, 'candidate');
  req(candidate, CANDIDATE_FIELDS, 'candidate');
  assertExactKeys(candidate, CANDIDATE_FIELDS, 'candidate');
  try { exposure.validateReaderExposureProjectionV1(exposureProjection); }
  catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', err && err.code ? err.code : 'exposure'); }
  if (candidate.observation_schema_version !== OBSERVATION_SCHEMA_VERSION) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'schema');
  if (candidate.exposure_projection_id !== exposureProjection.exposure_projection_id || candidate.exposure_projection_digest !== exposureProjection.exposure_projection_digest) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'exposure');
  }
  validateTarget(candidate.target);
  if (!SOURCE_CLASSES.includes(candidate.source_class)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'source_class');
  if (!OBSERVATION_STANDINGS.includes(candidate.standing)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'standing');
  if (!nullableText(candidate.provider_subject_ref) || !nullableText(candidate.provider_admission_ref) || !nullableText(candidate.reader_profile_ref) || !nullableText(candidate.calibration_ref)) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'nullable_refs');
  }
  if (candidate.confidence !== null && (typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1)) {
    fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'confidence');
  }
  if (candidate.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  validateFrontierBinding(candidate.reveal_frontier, exposureProjection);
  validateEvidenceRefs(candidate.evidence_refs, candidate.standing);
  validateProviderBinding(candidate, providerAdmissionBinding);
  if ((candidate.source_class === 'SYNTHETIC_READER' || candidate.source_class === 'HUMAN') && !text(candidate.reader_profile_ref)) {
    fail(candidate.source_class === 'HUMAN' ? 'BLOCKED_HUMAN_STANDING_SYNTHESIZED' : 'BLOCKED_OBSERVATION_BINDING_MISMATCH', 'reader_profile_ref_required');
  }
  validateCalibrationBinding(candidate, calibrationBinding);
}

function acceptReaderObservationV1(input) {
  if (!obj(input) || !obj(input.candidate) || !obj(input.exposure_projection)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'input');
  validateCandidate(input.candidate, input.exposure_projection, input.provider_admission_binding || null, input.calibration_binding || null);
  const c = input.candidate;
  const output = {
    observation_schema_version: OBSERVATION_SCHEMA_VERSION,
    observation_id: null,
    observation_digest: null,
    exposure_projection_id: c.exposure_projection_id,
    exposure_projection_digest: c.exposure_projection_digest,
    target: clone(c.target),
    source_class: c.source_class,
    standing: c.standing,
    provider_subject_ref: c.provider_subject_ref,
    provider_admission_ref: c.provider_admission_ref,
    reader_profile_ref: c.reader_profile_ref,
    evidence_refs: sorted(c.evidence_refs),
    confidence: c.confidence,
    calibration_ref: c.calibration_ref,
    reveal_frontier: clone(c.reveal_frontier),
    canonical_effect: false
  };
  const semantic = clone(output);
  delete semantic.observation_id;
  delete semantic.observation_digest;
  const d = hash(semantic);
  output.observation_digest = d;
  output.observation_id = `${OBSERVATION_PREFIX}${d}`;
  return output;
}

function validateReaderObservationV1(observation, exposureProjection) {
  assertNoForbiddenPayload(observation, 'observation');
  req(observation, SEALED_FIELDS, 'observation');
  assertExactKeys(observation, SEALED_FIELDS, 'observation');
  try { exposure.validateReaderExposureProjectionV1(exposureProjection); }
  catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', err && err.code ? err.code : 'exposure'); }
  if (observation.observation_schema_version !== OBSERVATION_SCHEMA_VERSION) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'schema');
  if (observation.exposure_projection_id !== exposureProjection.exposure_projection_id || observation.exposure_projection_digest !== exposureProjection.exposure_projection_digest) fail('BLOCKED_OBSERVATION_STALE', 'exposure');
  validateTarget(observation.target);
  if (!SOURCE_CLASSES.includes(observation.source_class) || !OBSERVATION_STANDINGS.includes(observation.standing)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'standing_or_source');
  if (observation.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  validateFrontierBinding(observation.reveal_frontier, exposureProjection);
  validateEvidenceRefs(observation.evidence_refs, observation.standing);
  if (!nullableText(observation.provider_subject_ref) || !nullableText(observation.provider_admission_ref) || !nullableText(observation.reader_profile_ref) || !nullableText(observation.calibration_ref)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'nullable_refs');
  if ((observation.source_class === 'MODEL' || observation.source_class === 'SYNTHETIC_READER') && (!text(observation.provider_subject_ref) || !text(observation.provider_admission_ref))) fail('BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
  if ((observation.source_class === 'SYNTHETIC_READER' || observation.source_class === 'HUMAN') && !text(observation.reader_profile_ref)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'profile');
  if (observation.standing === 'OBSERVED_CALIBRATED' && !text(observation.calibration_ref)) fail('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED');
  if (observation.confidence !== null && (typeof observation.confidence !== 'number' || !Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'confidence');
  if (!digest(observation.observation_digest) || observation.observation_id !== `${OBSERVATION_PREFIX}${observation.observation_digest}`) fail('BLOCKED_DIGEST_MISMATCH', 'observation_identity');
  const semantic = clone(observation);
  delete semantic.observation_id;
  delete semantic.observation_digest;
  const d = hash(semantic);
  if (d !== observation.observation_digest) fail('BLOCKED_DIGEST_MISMATCH', 'observation');
  return true;
}

function observationRef(observation) {
  return Object.freeze({ observation_id: observation.observation_id, observation_digest: observation.observation_digest });
}

function dispositionFor(observations) {
  if (observations.some(o => o.standing === 'OBSERVED_UNCALIBRATED' || o.standing === 'OBSERVED_CALIBRATED')) return 'OBSERVED';
  if (observations.some(o => o.standing === 'ABSTAINED')) return 'ABSTAINED';
  if (observations.some(o => o.standing === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  return 'UNOBSERVED';
}

function assembleReaderUnderstandingProjectionV1(input) {
  if (!obj(input) || !obj(input.exposure_projection) || !Array.isArray(input.observations)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'assembly_input');
  try { exposure.validateReaderExposureProjectionV1(input.exposure_projection); }
  catch (err) { fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', err && err.code ? err.code : 'exposure'); }

  const observations = input.observations.map(o => clone(o));
  const ids = new Set();
  for (const observation of observations) {
    validateReaderObservationV1(observation, input.exposure_projection);
    if (ids.has(observation.observation_id)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `duplicate:${observation.observation_id}`);
    ids.add(observation.observation_id);
  }
  observations.sort((a, b) => a.observation_id.localeCompare(b.observation_id));

  const dimensionDispositions = registry.DIMENSIONS.map(d => {
    const matches = observations.filter(o => o.target.dimension_id === d.dimension_id);
    return {
      dimension_id: d.dimension_id,
      disposition: dispositionFor(matches),
      observation_refs: matches.map(observationRef)
    };
  });

  const lensCoverage = registry.LENSES.map(lens => {
    const matches = observations.filter(o => o.target.perspective_lens_id === lens);
    return {
      perspective_lens_id: lens,
      disposition: dispositionFor(matches),
      observation_refs: matches.map(observationRef)
    };
  });

  const unresolvedDimensions = dimensionDispositions.filter(d => d.disposition === 'UNOBSERVED').length;
  let standing;
  if (observations.length === 0) standing = 'READY_FOR_OBSERVATION';
  else if (unresolvedDimensions > 0) standing = 'PARTIALLY_OBSERVED';
  else if (observations.some(o => o.standing === 'OBSERVED_CALIBRATED')) standing = 'OBSERVED_WITH_CALIBRATION_EVIDENCE';
  else standing = 'OBSERVED_UNCALIBRATED';

  const output = {
    understanding_schema_version: UNDERSTANDING_SCHEMA_VERSION,
    understanding_projection_id: null,
    understanding_projection_digest: null,
    book_project_id: input.exposure_projection.book_project_id,
    exposure_projection_id: input.exposure_projection.exposure_projection_id,
    exposure_projection_digest: input.exposure_projection.exposure_projection_digest,
    story_bible_ref: input.exposure_projection.story_bible_ref,
    story_bible_digest: input.exposure_projection.story_bible_digest,
    knowledge_candidate_id: input.exposure_projection.knowledge_candidate_id,
    knowledge_digest: input.exposure_projection.knowledge_digest,
    scope: clone(input.exposure_projection.scope),
    reveal_frontier: clone(input.exposure_projection.reveal_frontier),
    observation_refs: observations.map(observationRef),
    dimension_dispositions: dimensionDispositions,
    lens_coverage: lensCoverage,
    provider_subject_refs: sorted(observations.map(o => o.provider_subject_ref).filter(Boolean)),
    provider_admission_refs: sorted(observations.map(o => o.provider_admission_ref).filter(Boolean)),
    calibration_refs: sorted(observations.map(o => o.calibration_ref).filter(Boolean)),
    external_calibration_fences: [...EXTERNAL_CALIBRATION_FENCES],
    standing,
    canonical_effect: false
  };
  assertNoForbiddenPayload(output, 'projection');
  const semantic = clone(output);
  delete semantic.understanding_projection_id;
  delete semantic.understanding_projection_digest;
  const d = hash(semantic);
  output.understanding_projection_digest = d;
  output.understanding_projection_id = `${UNDERSTANDING_PREFIX}${d}`;
  return output;
}

function validateReaderUnderstandingProjectionV1(projection) {
  const required = [
    'understanding_schema_version','understanding_projection_id','understanding_projection_digest','book_project_id',
    'exposure_projection_id','exposure_projection_digest','story_bible_ref','story_bible_digest','knowledge_candidate_id','knowledge_digest',
    'scope','reveal_frontier','observation_refs','dimension_dispositions','lens_coverage','provider_subject_refs','provider_admission_refs',
    'calibration_refs','external_calibration_fences','standing','canonical_effect'
  ];
  assertNoForbiddenPayload(projection, 'projection');
  req(projection, required, 'projection');
  assertExactKeys(projection, required, 'projection');
  if (projection.understanding_schema_version !== UNDERSTANDING_SCHEMA_VERSION) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'understanding_schema');
  if (projection.canonical_effect !== false) fail('BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
  if (!PROJECTION_STANDINGS.includes(projection.standing)) fail('BLOCKED_CURRENTNESS_REQUIRED', 'projection_standing');
  if (!Array.isArray(projection.dimension_dispositions) || projection.dimension_dispositions.length !== 64) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'dimension_dispositions');
  for (let i = 0; i < registry.DIMENSIONS.length; i += 1) {
    const entry = projection.dimension_dispositions[i];
    if (!obj(entry) || entry.dimension_id !== registry.DIMENSIONS[i].dimension_id || !DIMENSION_DISPOSITIONS.includes(entry.disposition) || !Array.isArray(entry.observation_refs)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `dimension:${i}`);
  }
  if (!Array.isArray(projection.lens_coverage) || projection.lens_coverage.length !== registry.LENSES.length) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', 'lens_coverage');
  for (let i = 0; i < registry.LENSES.length; i += 1) {
    const entry = projection.lens_coverage[i];
    if (!obj(entry) || entry.perspective_lens_id !== registry.LENSES[i] || !DIMENSION_DISPOSITIONS.includes(entry.disposition) || !Array.isArray(entry.observation_refs)) fail('BLOCKED_OBSERVATION_BINDING_MISMATCH', `lens:${i}`);
  }
  if (JSON.stringify(projection.external_calibration_fences) !== JSON.stringify(EXTERNAL_CALIBRATION_FENCES)) fail('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED', 'external_fences');
  if (!digest(projection.understanding_projection_digest) || projection.understanding_projection_id !== `${UNDERSTANDING_PREFIX}${projection.understanding_projection_digest}`) fail('BLOCKED_DIGEST_MISMATCH', 'understanding_identity');
  const semantic = clone(projection);
  delete semantic.understanding_projection_id;
  delete semantic.understanding_projection_digest;
  const d = hash(semantic);
  if (d !== projection.understanding_projection_digest) fail('BLOCKED_DIGEST_MISMATCH', 'understanding');
  return true;
}

module.exports = {
  BookReaderUnderstandingError,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_PREFIX,
  UNDERSTANDING_SCHEMA_VERSION,
  UNDERSTANDING_PREFIX,
  SOURCE_CLASSES,
  OBSERVATION_STANDINGS,
  DIMENSION_DISPOSITIONS,
  PROJECTION_STANDINGS,
  EXTERNAL_CALIBRATION_FENCES,
  acceptReaderObservationV1,
  validateReaderObservationV1,
  assembleReaderUnderstandingProjectionV1,
  validateReaderUnderstandingProjectionV1
};