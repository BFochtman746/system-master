'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const registry = require('./book-reader-dimension-registry-v1');
const understanding = require('./book-reader-understanding-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');
const f = require('./book-b04-e-fixtures-v1');

const c = (name, run) => ({ name, run });

manifest.registerFamilyTests(test, 'D', [
  c('dimension registry cardinality is exactly 64', () => assert.equal(registry.DIMENSIONS.length, 64)),
  c('current perspective lens cardinality is exactly 12', () => assert.equal(registry.LENSES.length, 12)),
  c('dimension IDs preserve exact PCE013 sequence', () => registry.DIMENSIONS.forEach((d, i) => assert.equal(d.dimension_id, `PCE013-DIM-${String(i + 1).padStart(3, '0')}`))),
  c('registry contains exactly nine locked groups', () => assert.equal(Object.keys(registry.GROUP_COUNTS).length, 9)),
  c('group cardinalities match recovered registry', () => {
    const actual = {};
    registry.DIMENSIONS.forEach(d => { actual[d.group] = (actual[d.group] || 0) + 1; });
    assert.deepEqual(actual, registry.GROUP_COUNTS);
  }),
  c('dimension IDs are unique', () => assert.equal(new Set(registry.DIMENSIONS.map(d => d.dimension_id)).size, 64)),
  c('dimension keys are unique', () => assert.equal(new Set(registry.DIMENSIONS.map(d => d.key)).size, 64)),
  c('measurement posture is exact for every dimension', () => registry.DIMENSIONS.forEach(d => assert.equal(d.measurement_posture, 'INTENT_RELATIVE_MULTIMODAL_EVIDENCE'))),
  c('anti-gaming rule is exact for every dimension', () => registry.DIMENSIONS.forEach(d => assert.equal(d.anti_gaming_rule, 'Never optimize the dimension without its intent envelope; preserve uncertainty and reader plurality.'))),
  c('first recovered dimension identity is exact', () => {
    const d = registry.DIMENSIONS[0]; assert.equal(d.dimension_id, 'PCE013-DIM-001'); assert.equal(d.group, 'COMPREHENSION'); assert.equal(d.key, 'LOCAL_MEANING');
  }),
  c('last recovered dimension identity is exact', () => {
    const d = registry.DIMENSIONS[63]; assert.equal(d.dimension_id, 'PCE013-DIM-064'); assert.equal(d.group, 'CALIBRATION_PLURALISM'); assert.equal(d.key, 'LONG_FORM_STATE_RETENTION');
  }),
  c('unknown dimension fails closed', () => assert.throws(() => registry.getDimensionV1('PCE013-DIM-999'), /BLOCKED_DIMENSION_UNKNOWN/)),
  c('known current lens succeeds', () => assert.equal(registry.assertLensV1('REVEAL_INFORMATION'), 'REVEAL_INFORMATION')),
  c('unknown current lens fails closed', () => assert.throws(() => registry.assertLensV1('HISTORICAL_UNRECOVERED_AXIS'), /BLOCKED_LENS_UNKNOWN/)),
  c('unrecovered historical 18-axis labels are not invented into current registry', () => {
    assert.equal(registry.LENSES.length, 12); assert.equal(registry.LENSES.some(x => /PCE013.*AXIS|HISTORICAL/i.test(x)), false);
  }),
  c('dimension registry array is immutable', () => assert.equal(Object.isFrozen(registry.DIMENSIONS), true)),
  c('lens registry array is immutable', () => assert.equal(Object.isFrozen(registry.LENSES), true)),
  c('every dimension record is immutable', () => registry.DIMENSIONS.forEach(d => assert.equal(Object.isFrozen(d), true))),
  c('every evaluation question is nonempty', () => registry.DIMENSIONS.forEach(d => assert.ok(typeof d.evaluation_question === 'string' && d.evaluation_question.trim()))),
  c('every dimension name is nonempty', () => registry.DIMENSIONS.forEach(d => assert.ok(typeof d.name === 'string' && d.name.trim()))),
  c('every dimension key is nonempty', () => registry.DIMENSIONS.forEach(d => assert.ok(typeof d.key === 'string' && d.key.trim()))),
  c('zero-based registry index matches immutable sequence', () => registry.DIMENSIONS.forEach((d, i) => assert.equal(d.index, i))),
  c('group counts sum to exactly 64', () => assert.equal(Object.values(registry.GROUP_COUNTS).reduce((a, b) => a + b, 0), 64)),
  c('registry records contain no aggregate score field', () => registry.DIMENSIONS.forEach(d => assert.equal(Object.keys(d).some(k => /score|aggregate/i.test(k)), false))),
  c('registry records contain no rating rank or percentile field', () => registry.DIMENSIONS.forEach(d => assert.equal(Object.keys(d).some(k => /rating|rank|percentile/i.test(k)), false))),
  c('registry records contain no protected-demographic identity field', () => registry.DIMENSIONS.forEach(d => assert.equal(Object.keys(d).some(k => /race|ethnic|religion|gender|sex|politic|nationality|disability|demographic/i.test(k)), false))),
  c('NOT_APPLICABLE is a valid sparse dimension disposition source', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, undefined, { standing: 'NOT_APPLICABLE', evidence_refs: [], confidence: null })); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [o] }); assert.equal(p.dimension_dispositions[0].disposition, 'NOT_APPLICABLE');
  }),
  c('ABSTAINED is a valid sparse dimension disposition source', () => {
    const x = f.exposureFixture(); const o = f.accept(x.exp, f.observationCandidate(x.exp, undefined, { standing: 'ABSTAINED', evidence_refs: [], confidence: null })); const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [o] }); assert.equal(p.dimension_dispositions[0].disposition, 'ABSTAINED');
  }),
  c('understanding projection always materializes all 64 dimension dispositions', () => {
    const x = f.understandingFixture({ include_dimension: false }); assert.equal(x.projection.dimension_dispositions.length, 64);
  }),
  c('unobserved dimensions default to UNOBSERVED rather than fabricated evidence', () => {
    const x = f.understandingFixture(); assert.equal(x.projection.dimension_dispositions[1].disposition, 'UNOBSERVED');
  }),
  c('sparse mixed dimension dispositions remain distinct', () => {
    const x = f.exposureFixture();
    const a = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, { standing: 'ABSTAINED', evidence_refs: [], confidence: null }));
    const n = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, { standing: 'NOT_APPLICABLE', evidence_refs: [], confidence: null }));
    const o = f.accept(x.exp, f.observationCandidate(x.exp, { dimension_id: 'PCE013-DIM-003', perspective_lens_id: null }));
    const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: x.exp, observations: [a, n, o] });
    assert.deepEqual(p.dimension_dispositions.slice(0, 4).map(d => d.disposition), ['ABSTAINED','NOT_APPLICABLE','OBSERVED','UNOBSERVED']);
  }),
  c('understanding projection exposes no scalar aggregate reader score', () => {
    const x = f.understandingFixture(); assert.equal(Object.keys(x.projection).some(k => /score|rating|rank|percentile|aggregate/i.test(k)), false);
  })
]);