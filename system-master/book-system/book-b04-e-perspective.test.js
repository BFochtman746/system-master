'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const understanding = require('./book-reader-understanding-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');
const f = require('./book-b04-e-fixtures-v1');

const c = (name, run) => ({ name, run });
const code = expected => err => err && err.code === expected;

manifest.registerFamilyTests(test, 'P', [
  c('dimension-target observation is accepted', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp)); assert.equal(o.target.dimension_id, 'PCE013-DIM-001');
  }),
  c('lens-target observation is accepted independently', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: null, perspective_lens_id: 'REVEAL_INFORMATION' })); assert.equal(o.target.perspective_lens_id, 'REVEAL_INFORMATION');
  }),
  c('observation target cannot omit both dimension and lens', () => {
    const x = f.exposureFixture(); assert.throws(() => f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: null, perspective_lens_id: null })), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  }),
  c('observation target cannot claim both dimension and lens', () => {
    const x = f.exposureFixture(); assert.throws(() => f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: 'REVEAL_INFORMATION' })), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  }),
  c('unknown dimension target fails closed', () => {
    const x = f.exposureFixture(); assert.throws(() => f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-999', perspective_lens_id: null })), code('BLOCKED_DIMENSION_UNKNOWN'));
  }),
  c('unknown lens target fails closed', () => {
    const x = f.exposureFixture(); assert.throws(() => f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: null, perspective_lens_id: 'UNKNOWN_LENS' })), code('BLOCKED_LENS_UNKNOWN'));
  }),
  c('deterministic uncalibrated observation is valid evidence standing', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp)); assert.equal(o.source_class, 'DETERMINISTIC'); assert.equal(o.standing, 'OBSERVED_UNCALIBRATED');
  }),
  c('MODEL observation requires provider subject and admission refs', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'MODEL' }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_PROVIDER_SUBJECT_UNADMITTED'));
  }),
  c('MODEL observation requires exact current external provider admission binding', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'MODEL', provider_subject_ref: 'provider://m', provider_admission_ref: 'admission://m' }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_PROVIDER_SUBJECT_UNADMITTED'));
  }),
  c('MODEL observation with exact current provider admission is accepted and sealed', () => {
    const x = f.exposureFixture(); const p = f.providerBinding(); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'MODEL', provider_subject_ref: p.provider_subject_ref, provider_admission_ref: p.provider_admission_ref }); const o = f.accept(x.exp, candidate, { provider_admission_binding: p }); assert.equal(o.provider_admission_digest, p.provider_admission_digest);
  }),
  c('SYNTHETIC_READER observation requires governed opaque reader profile', () => {
    const x = f.exposureFixture(); const p = f.providerBinding('provider://synthetic','admission://synthetic'); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'SYNTHETIC_READER', provider_subject_ref: p.provider_subject_ref, provider_admission_ref: p.provider_admission_ref }); assert.throws(() => f.accept(x.exp, candidate, { provider_admission_binding: p }), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  }),
  c('SYNTHETIC_READER with exact provider admission and opaque profile is accepted', () => {
    const x = f.exposureFixture(); const p = f.providerBinding('provider://synthetic','admission://synthetic'); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'SYNTHETIC_READER', provider_subject_ref: p.provider_subject_ref, provider_admission_ref: p.provider_admission_ref, reader_profile_ref: 'reader-profile://synthetic/b04e' }); const o = f.accept(x.exp, candidate, { provider_admission_binding: p }); assert.equal(o.source_class, 'SYNTHETIC_READER');
  }),
  c('HUMAN observation requires governed opaque reader profile', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'HUMAN' }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_HUMAN_STANDING_SYNTHESIZED'));
  }),
  c('HUMAN source cannot carry provider execution standing', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'HUMAN', reader_profile_ref: 'reader-profile://human/b04e', provider_subject_ref: 'provider://forbidden', provider_admission_ref: 'admission://forbidden' }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_HUMAN_STANDING_SYNTHESIZED'));
  }),
  c('calibrated HUMAN observation requires explicit current external calibration evidence', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'HUMAN', standing: 'OBSERVED_CALIBRATED', reader_profile_ref: 'reader-profile://human/b04e', calibration_ref: 'calibration://human/b04e' }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED'));
  }),
  c('calibration class must exactly match observation source class', () => {
    const x = f.exposureFixture(); const cal = f.calibrationBinding('calibration://human/mismatch', 'MODEL'); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'HUMAN', standing: 'OBSERVED_CALIBRATED', reader_profile_ref: 'reader-profile://human/b04e', calibration_ref: cal.calibration_ref }); assert.throws(() => f.accept(x.exp, candidate, { calibration_binding: cal }), code('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED'));
  }),
  c('MODEL and SYNTHETIC_READER cannot claim HUMAN calibration class', () => {
    const x = f.exposureFixture(); const p = f.providerBinding(); const cal = f.calibrationBinding('calibration://human/for-model', 'HUMAN'); const candidate = f.observationCandidate(x.exp, undefined, { source_class: 'MODEL', standing: 'OBSERVED_CALIBRATED', provider_subject_ref: p.provider_subject_ref, provider_admission_ref: p.provider_admission_ref, calibration_ref: cal.calibration_ref }); assert.throws(() => f.accept(x.exp, candidate, { provider_admission_binding: p, calibration_binding: cal }), code('BLOCKED_HUMAN_STANDING_SYNTHESIZED'));
  }),
  c('non-calibrated observation cannot carry calibration reference', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { calibration_ref: 'calibration://not-applicable' }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_CALIBRATION_EVIDENCE_REQUIRED'));
  }),
  c('observed standing requires at least one evidence reference', () => {
    const x = f.exposureFixture(); const candidate = f.observationCandidate(x.exp, undefined, { evidence_refs: [] }); assert.throws(() => f.accept(x.exp, candidate), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  }),
  c('ABSTAINED may preserve sparse evidence and null confidence', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, undefined, { standing: 'ABSTAINED', evidence_refs: [], confidence: null })); assert.equal(o.standing, 'ABSTAINED');
  }),
  c('NOT_APPLICABLE may preserve sparse evidence and null confidence', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, undefined, { standing: 'NOT_APPLICABLE', evidence_refs: [], confidence: null })); assert.equal(o.standing, 'NOT_APPLICABLE');
  }),
  c('confidence is nullable or bounded to inclusive zero-one interval', () => {
    const x = f.exposureFixture(); const n = f.accept(x.exp, f.observationCandidate(x.exp, undefined, { standing: 'ABSTAINED', evidence_refs: [], confidence: null })); assert.equal(n.confidence, null); assert.throws(() => f.accept(x.exp, f.observationCandidate(x.exp, undefined, { confidence: 1.01 })), code('BLOCKED_OBSERVATION_BINDING_MISMATCH')); assert.throws(() => f.accept(x.exp, f.observationCandidate(x.exp, undefined, { confidence: -0.01 })), code('BLOCKED_OBSERVATION_BINDING_MISMATCH'));
  }),
  c('raw text chain-of-thought hidden reasoning and credentials are forbidden', () => {
    const x = f.exposureFixture();
    for (const extra of [{ raw_manuscript_text: 'x' }, { chain_of_thought: 'x' }, { hidden_reasoning: 'x' }, { credential_secret: 'x' }]) {
      assert.throws(() => f.accept(x.exp, { ...f.observationCandidate(x.exp), ...extra }), code('BLOCKED_RAW_TEXT_FORBIDDEN'));
    }
  }),
  c('universal scoring and demographic-essentialist payloads are forbidden', () => {
    const x = f.exposureFixture();
    assert.throws(() => f.accept(x.exp, { ...f.observationCandidate(x.exp), aggregate_reader_score: 0.9 }), code('BLOCKED_UNIVERSAL_READER_SCORE_FORBIDDEN'));
    assert.throws(() => f.accept(x.exp, { ...f.observationCandidate(x.exp), demographic_profile: 'forbidden' }), code('BLOCKED_DEMOGRAPHIC_ESSENTIALISM_FORBIDDEN'));
  })
]);