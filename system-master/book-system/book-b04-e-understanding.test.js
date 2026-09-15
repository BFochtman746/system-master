'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const registry = require('./book-reader-dimension-registry-v1');
const understanding = require('./book-reader-understanding-v1');
const hardenedQuery = require('./book-reader-query-runtime-v1');
const fx = require('./book-b04-e-fixtures-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');

function emptyProjection() { const { exp }=fx.buildExposure(); return { exp, projection: understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[]}) }; }
function completeUncalibrated() { const { exp }=fx.buildExposure(); const observations=fx.fullDimensionObservations(exp); return { exp, observations, projection:understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations}) }; }
function completeWithHumanCalibration() { const { exp }=fx.buildExposure(); const cal=fx.calibrationBinding(); const human=fx.accept(exp,fx.observationCandidate(exp,{dimension_id:'PCE013-DIM-001',perspective_lens_id:null},{source_class:'HUMAN',standing:'OBSERVED_CALIBRATED',reader_profile_ref:'reader-profile://human/b04-e/full',calibration_ref:cal.calibration_ref,evidence_refs:['evidence://b04-e/human/full']}),{calibration_binding:cal}); const observations=fx.fullDimensionObservations(exp,{first_observation:human}); return { exp, observations, cal, projection:understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations}) }; }
function hasForbiddenScalarKey(value) { if (Array.isArray(value)) return value.some(hasForbiddenScalarKey); if (!value || typeof value!=='object') return false; return Object.entries(value).some(([k,v])=>/score|rating|rank|percentile|aggregate/i.test(k)||hasForbiddenScalarKey(v)); }

const cases = [
  ['empty projection emits exactly all 64 dimension dispositions', () => assert.equal(emptyProjection().projection.dimension_dispositions.length,64)],
  ['empty projection emits exactly all 12 lens coverage rows', () => assert.equal(emptyProjection().projection.lens_coverage.length,12)],
  ['empty projection standing is READY_FOR_OBSERVATION', () => assert.equal(emptyProjection().projection.standing,'READY_FOR_OBSERVATION')],
  ['one observed dimension produces PARTIALLY_OBSERVED', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp)); const p=understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[o]}); assert.equal(p.standing,'PARTIALLY_OBSERVED'); }],
  ['observed dimension maps to OBSERVED disposition', () => { const f=fx.fixture(); assert.equal(f.projection.dimension_dispositions.find(x=>x.dimension_id==='PCE013-DIM-001').disposition,'OBSERVED'); }],
  ['lens evidence does not falsely complete dimension coverage', () => { const { exp }=fx.buildExposure(); const lens=fx.accept(exp,fx.observationCandidate(exp,{dimension_id:null,perspective_lens_id:'REVEAL_INFORMATION'})); const p=understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[lens]}); assert.equal(p.standing,'PARTIALLY_OBSERVED'); assert.ok(p.dimension_dispositions.every(x=>x.disposition==='UNOBSERVED')); }],
  ['complete 64-dimension evidence without calibration is OBSERVED_UNCALIBRATED', () => assert.equal(completeUncalibrated().projection.standing,'OBSERVED_UNCALIBRATED')],
  ['complete 64-dimension evidence with accepted calibration is OBSERVED_WITH_CALIBRATION_EVIDENCE', () => assert.equal(completeWithHumanCalibration().projection.standing,'OBSERVED_WITH_CALIBRATION_EVIDENCE')],
  ['all four external evidence fences are preserved exactly', () => assert.deepEqual(emptyProjection().projection.external_calibration_fences,[...manifest.EXTERNAL_EVIDENCE_FENCES])],
  ['calibration-evidence standing does not close external fences', () => { const p=completeWithHumanCalibration().projection; assert.equal(p.external_calibration_fences.length,4); manifest.EXTERNAL_EVIDENCE_FENCES.forEach(f=>assert.ok(p.external_calibration_fences.includes(f))); }],
  ['dimension rows preserve immutable registry order', () => { const p=emptyProjection().projection; assert.deepEqual(p.dimension_dispositions.map(x=>x.dimension_id),registry.DIMENSIONS.map(x=>x.dimension_id)); }],
  ['lens rows preserve exact registry order', () => { const p=emptyProjection().projection; assert.deepEqual(p.lens_coverage.map(x=>x.perspective_lens_id),[...registry.LENSES]); }],
  ['duplicate observation IDs fail closed instead of double-counting', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp)); assert.throws(()=>understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[o,o]}),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['assembly is deterministic for identical sealed evidence', () => { const f=fx.fixture(); const a=understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:f.exp,observations:f.observations}); const b=understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:f.exp,observations:f.observations}); assert.deepEqual(a,b); }],
  ['understanding projection identity is content addressed', () => { const f=fx.fixture(); assert.match(f.projection.understanding_projection_id,/^book-reader-understanding-v1:[a-f0-9]{64}$/); }],
  ['provider subject refs are retained as exact dependency evidence', () => { const f=fx.fixture(); assert.deepEqual(f.projection.provider_subject_refs,[f.provider.provider_subject_ref]); }],
  ['provider admission refs are retained exactly', () => { const f=fx.fixture(); assert.deepEqual(f.projection.provider_admission_refs,[f.provider.provider_admission_ref]); }],
  ['provider admission digests are retained exactly', () => { const f=fx.fixture(); assert.deepEqual(f.projection.provider_admission_digests,[f.provider.provider_admission_digest]); }],
  ['calibration refs are retained exactly', () => { const f=fx.fixture(); assert.deepEqual(f.projection.calibration_refs,[f.calibration.calibration_ref]); }],
  ['calibration digests are retained exactly', () => { const f=fx.fixture(); assert.deepEqual(f.projection.calibration_digests,[f.calibration.calibration_digest]); }],
  ['understanding projection is explicitly noncanonical', () => { const f=fx.fixture(); assert.equal(f.projection.canonical_effect,false); }],
  ['sealed understanding projection validates exact content address', () => { const f=fx.fixture(); assert.equal(understanding.validateReaderUnderstandingProjectionV1(f.projection),true); }],
  ['cross-boundary substituted observation bytes are rejected before evidence query', () => { const f=fx.fixture(); const observations=fx.clone(f.observations); observations[0].evidence_refs=['evidence://substituted']; assert.throws(()=>hardenedQuery.validateExactObservationSet({exposure_projection:f.exp,understanding_projection:f.projection,observations}),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['understanding projection exposes no universal scalar score/rating/rank/aggregate', () => { const f=fx.fixture(); assert.equal(hasForbiddenScalarKey(f.projection),false); }]
];

assert.equal(cases.length,24);
cases.forEach(([name,fn],i)=>test(`${manifest.CASE_IDS.UNDERSTANDING[i]} ${name}`,fn));
