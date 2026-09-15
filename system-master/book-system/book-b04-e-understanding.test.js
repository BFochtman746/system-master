'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const understanding = require('./book-reader-understanding-v1');
const d3 = require('./book-reader-currentness-runtime-v1');
const queryRuntime = require('./book-reader-query-runtime-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');
const f = require('./book-b04-e-fixtures-v1');

const c = (name, run) => ({ name, run });
const code = expected => err => err && err.code === expected;

manifest.registerFamilyTests(test, 'U', [
  c('empty observation set yields READY_FOR_OBSERVATION with all 64 dimensions and 12 lenses', () => {
    const x = f.exposureFixture(); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [] }); assert.equal(p.standing, 'READY_FOR_OBSERVATION'); assert.equal(p.dimension_dispositions.length, 64); assert.equal(p.lens_coverage.length, 12);
  }),
  c('one dimension observation yields PARTIALLY_OBSERVED', () => {
    const x = f.understandingFixture(); assert.equal(x.projection.standing, 'PARTIALLY_OBSERVED');
  }),
  c('lens-only evidence does not change dimension completeness', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' })); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [o] }); assert.equal(p.standing, 'PARTIALLY_OBSERVED'); assert.equal(p.dimension_dispositions.every(d => d.disposition === 'UNOBSERVED'), true); assert.equal(p.lens_coverage.find(l => l.perspective_lens_id === 'PERSPECTIVE_FOCALIZATION').disposition, 'OBSERVED');
  }),
  c('complete 64-dimension uncalibrated evidence yields OBSERVED_UNCALIBRATED', () => {
    const x = f.exposureFixture(); const observations = f.fullDimensionObservations(x.exp); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations }); assert.equal(p.standing, 'OBSERVED_UNCALIBRATED');
  }),
  c('complete dimensions with valid calibrated HUMAN evidence yields calibration-evidence standing only', () => {
    const x = f.exposureFixture(); const cal = f.calibrationBinding(); const overrides = new Map([[0, { candidate: { source_class: 'HUMAN', standing: 'OBSERVED_CALIBRATED', reader_profile_ref: 'reader-profile://human/b04e/full', calibration_ref: cal.calibration_ref }, extra: { calibration_binding: cal } }]]); const observations = f.fullDimensionObservations(x.exp, overrides); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations }); assert.equal(p.standing, 'OBSERVED_WITH_CALIBRATION_EVIDENCE'); assert.ok(p.external_calibration_fences.includes('HUMAN_READER_ALIGNMENT_REQUIRED'));
  }),
  c('duplicate observation IDs are rejected', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp)); assert.throws(() => understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [o, o] }), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  }),
  c('observation bound to another exposure is rejected as stale', () => {
    const a = f.exposureFixture({ scope_digest: f.h('scope-a') }); const b = f.exposureFixture({ scope_digest: f.h('scope-b') }); const o = f.accept(a.exp, f.observationCandidate(a.exp)); assert.throws(() => understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: b.exp, observations: [o] }), code('BLOCKED_OBSERVATION_STALE'));
  }),
  c('observation frontier drift is rejected as stale', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp)); const t = f.clone(o); t.reveal_frontier.frontier_anchor_digest = f.h('frontier-drift'); assert.throws(() => understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [t] }), code('BLOCKED_OBSERVATION_STALE'));
  }),
  c('sealed observation digest tampering is rejected', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp)); o.observation_digest = f.h('tamper'); assert.throws(() => understanding.validateReaderObservationV1(o, x.exp), code('BLOCKED_DIGEST_MISMATCH'));
  }),
  c('understanding assembly is deterministic and content addressed', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp)); const a = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [o] }); const b = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [f.clone(o)] }); assert.deepEqual(a, b); assert.match(a.understanding_projection_id, /^book-reader-understanding-v1:[a-f0-9]{64}$/);
  }),
  c('understanding projection digest tampering is rejected', () => {
    const x = f.understandingFixture(); const p = f.clone(x.projection); p.understanding_projection_digest = f.h('tamper'); assert.throws(() => understanding.validateReaderUnderstandingProjectionV1(p), code('BLOCKED_DIGEST_MISMATCH'));
  }),
  c('dimension disposition binds exact sealed observation reference', () => {
    const x = f.understandingFixture(); const e = x.projection.dimension_dispositions[0]; assert.deepEqual(e.observation_refs, [{ observation_id: x.observations[0].observation_id, observation_digest: x.observations[0].observation_digest }]);
  }),
  c('lens coverage binds exact sealed observation reference', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: null, perspective_lens_id: 'REVEAL_INFORMATION' })); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [o] }); const e = p.lens_coverage.find(v => v.perspective_lens_id === 'REVEAL_INFORMATION'); assert.deepEqual(e.observation_refs, [{ observation_id: o.observation_id, observation_digest: o.observation_digest }]);
  }),
  c('provider subject refs are sorted and deduplicated', () => {
    const x = f.exposureFixture(); const p = f.providerBinding(); const one = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, { source_class: 'MODEL', provider_subject_ref: p.provider_subject_ref, provider_admission_ref: p.provider_admission_ref, evidence_refs: ['evidence://m/1'] }), { provider_admission_binding: p }); const two = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, { source_class: 'MODEL', provider_subject_ref: p.provider_subject_ref, provider_admission_ref: p.provider_admission_ref, evidence_refs: ['evidence://m/2'] }), { provider_admission_binding: p }); const u = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [two, one] }); assert.deepEqual(u.provider_subject_refs, [p.provider_subject_ref]);
  }),
  c('provider admission refs are sorted and deduplicated', () => {
    const x = f.mixedEvidenceFixture(); assert.deepEqual(x.projection.provider_admission_refs, [x.provider.provider_admission_ref]);
  }),
  c('provider admission digests are sorted and deduplicated', () => {
    const x = f.mixedEvidenceFixture(); assert.deepEqual(x.projection.provider_admission_digests, [x.provider.provider_admission_digest]);
  }),
  c('calibration refs are sorted and deduplicated', () => {
    const x = f.mixedEvidenceFixture(); assert.deepEqual(x.projection.calibration_refs, [x.calibration.calibration_ref]);
  }),
  c('calibration digests are sorted and deduplicated', () => {
    const x = f.mixedEvidenceFixture(); assert.deepEqual(x.projection.calibration_digests, [x.calibration.calibration_digest]);
  }),
  c('all four external calibration fences remain explicit and exact', () => {
    const x = f.understandingFixture(); assert.deepEqual(x.projection.external_calibration_fences, ['MODEL_READER_SIMULATION_CALIBRATION_REQUIRED','HUMAN_READER_ALIGNMENT_REQUIRED','REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED','PROVIDER_SUBJECT_ADMISSION_REQUIRED']);
  }),
  c('understanding projection has canonical_effect false', () => {
    const x = f.understandingFixture(); assert.equal(x.projection.canonical_effect, false);
  }),
  c('cross-boundary raw-text payload is rejected during projection validation', () => {
    const x = f.understandingFixture(); const p = { ...f.clone(x.projection), raw_manuscript_text: 'forbidden' }; assert.throws(() => understanding.validateReaderUnderstandingProjectionV1(p), code('BLOCKED_RAW_TEXT_FORBIDDEN'));
  }),
  c('cross-boundary universal reader score is rejected', () => {
    const x = f.understandingFixture(); const p = { ...f.clone(x.projection), aggregate_reader_score: 0.75 }; assert.throws(() => understanding.validateReaderUnderstandingProjectionV1(p), code('BLOCKED_UNIVERSAL_READER_SCORE_FORBIDDEN'));
  }),
  c('cross-boundary demographic essentialism is rejected', () => {
    const x = f.understandingFixture(); const p = { ...f.clone(x.projection), demographic_profile: 'forbidden' }; assert.throws(() => understanding.validateReaderUnderstandingProjectionV1(p), code('BLOCKED_DEMOGRAPHIC_ESSENTIALISM_FORBIDDEN'));
  }),
  c('hardened query facade rejects substituted evidence behind unchanged observation identity', () => {
    const x = f.mixedEvidenceFixture(); const currentness = d3.computeReaderUnderstandingInvalidationV1({ exposure_projection: x.exp, understanding_projection: x.projection, observations: x.observations, current_bindings: x.current_bindings }); const observations = f.clone(x.observations); observations[0].evidence_refs = ['evidence://substituted']; assert.throws(() => queryRuntime.getReaderDimensionEvidenceV1({ exposure_projection: x.exp, understanding_projection: x.projection, observations, currentness, dimension_id: 'PCE013-DIM-001' }), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  })
]);