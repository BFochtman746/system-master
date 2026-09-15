'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const registryBinding = require('./book-capability-binding-v1.registry.json');
const d3 = require('./book-reader-currentness-runtime-v1');
const queryRuntime = require('./book-reader-query-runtime-v1');
const f = require('./book-b04-e-fixtures-v1');

function runtimeInput(x, currentBindings = x.current_bindings, extra = {}) {
  return { exposure_projection: x.exp, understanding_projection: x.projection, observations: x.observations, current_bindings: currentBindings, ...extra };
}

test('C01 B03 knowledge composes through exposure observation understanding currentness and bounded query', () => {
  const x = f.mixedEvidenceFixture();
  const runtime = queryRuntime.createBookReaderQueryRuntimeV1(runtimeInput(x));
  const currentness = runtime.execute('GetReaderUnderstandingCurrentnessV1');
  assert.equal(currentness.exposure_current, true);
  assert.equal(currentness.understanding_current, true);
  const evidence = runtime.execute('GetReaderDimensionEvidenceV1', { dimension_id: 'PCE013-DIM-001' });
  assert.equal(evidence.dimension_id, 'PCE013-DIM-001');
  assert.equal(evidence.canonical_effect, false);
});

test('C02 B03 invalidation stales B04 projections without mutating historical B03 knowledge', () => {
  const x = f.mixedEvidenceFixture();
  const before = JSON.stringify(x.knowledge);
  const impact = f.b03ImpactFor(x);
  const currentness = d3.computeReaderUnderstandingInvalidationV1({ ...runtimeInput(x), b03_invalidation_result: impact });
  assert.equal(currentness.exposure_current, false);
  assert.equal(currentness.understanding_current, false);
  assert.ok(currentness.stale_dependency_kinds.includes('B03_INVALIDATION_IMPACT'));
  assert.equal(JSON.stringify(x.knowledge), before);
});

test('C03 reader evidence drift stales understanding only and preserves reusable exposure', () => {
  const x = f.mixedEvidenceFixture();
  const bindings = f.clone(x.current_bindings);
  bindings.observations[0].current = false;
  const currentness = d3.computeReaderUnderstandingInvalidationV1(runtimeInput(x, bindings));
  assert.equal(currentness.exposure_current, true);
  assert.equal(currentness.understanding_current, false);
  assert.deepEqual(d3.getReaderExposureProjectionV1({ exposure_projection: x.exp, currentness }), x.exp);
});

test('C04 all five locked B04 queries are reachable through hardened runtime', () => {
  const x = f.mixedEvidenceFixture();
  const runtime = queryRuntime.createBookReaderQueryRuntimeV1(runtimeInput(x));
  assert.equal(runtime.execute('GetReaderExposureProjectionV1').exposure_projection_id, x.exp.exposure_projection_id);
  assert.equal(runtime.execute('GetReaderUnderstandingProjectionV1').understanding_projection_id, x.projection.understanding_projection_id);
  assert.equal(runtime.execute('GetReaderDimensionEvidenceV1', { dimension_id: 'PCE013-DIM-001' }).dimension_id, 'PCE013-DIM-001');
  assert.equal(runtime.execute('GetReaderLensCoverageV1', { perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }).perspective_lens_id, 'PERSPECTIVE_FOCALIZATION');
  assert.equal(runtime.execute('GetReaderUnderstandingCurrentnessV1').understanding_current, true);
});

test('C05 B04 consumes existing provider seam and does not widen frozen B01 11-capability registry', () => {
  assert.equal(Array.isArray(registryBinding.binding_inputs), true);
  assert.equal(registryBinding.binding_inputs.length, 11);
  assert.equal(registryBinding.binding_inputs.some(x => x.current_capability_id === 'BOOK.LITERARY.ANALYZE_PASSAGE'), true);
  assert.equal(registryBinding.binding_inputs.some(x => /^BOOK\.READER\./.test(x.current_capability_id)), false);
  const x = f.mixedEvidenceFixture();
  const runtime = queryRuntime.createBookReaderQueryRuntimeV1(runtimeInput(x));
  assert.equal(runtime.provider_registry_modified, false);
});

test('C06 B04 derived records carry no raw manuscript payload and no canonical effect', () => {
  const x = f.mixedEvidenceFixture();
  const currentness = d3.computeReaderUnderstandingInvalidationV1(runtimeInput(x));
  const runtime = queryRuntime.createBookReaderQueryRuntimeV1(runtimeInput(x));
  for (const record of [x.exp, ...x.observations, x.projection, currentness, runtime]) {
    const serialized = JSON.stringify(record);
    assert.equal(/raw_manuscript|quoted_text|full_text|chain_of_thought|hidden_reasoning/i.test(serialized), false);
  }
  assert.equal(x.projection.canonical_effect, false);
  assert.equal(currentness.canonical_effect, false);
  assert.equal(runtime.canonical_effect, false);
});

test('C07 exact replay reproduces content-addressed B04 identities without duplicate effect', () => {
  const a = f.mixedEvidenceFixture();
  const b = f.mixedEvidenceFixture();
  assert.equal(a.exp.exposure_projection_id, b.exp.exposure_projection_id);
  assert.equal(a.projection.understanding_projection_id, b.projection.understanding_projection_id);
  const ar = queryRuntime.createBookReaderQueryRuntimeV1(runtimeInput(a));
  const br = queryRuntime.createBookReaderQueryRuntimeV1(runtimeInput(b));
  assert.equal(ar.runtime_id, br.runtime_id);
  assert.equal(ar.execute('ComputeReaderUnderstandingInvalidationV1').currentness_id, br.execute('ComputeReaderUnderstandingInvalidationV1').currentness_id);
});

test('C08 deterministic cumulative PASS preserves all external calibration fences and makes no semantic authority uplift', () => {
  const x = f.mixedEvidenceFixture();
  assert.deepEqual(x.projection.external_calibration_fences, [
    'MODEL_READER_SIMULATION_CALIBRATION_REQUIRED',
    'HUMAN_READER_ALIGNMENT_REQUIRED',
    'REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED',
    'PROVIDER_SUBJECT_ADMISSION_REQUIRED'
  ]);
  assert.equal(x.projection.standing, 'PARTIALLY_OBSERVED');
  assert.equal(Object.keys(x.projection).some(k => /publication|production|author_approval|literary_quality/i.test(k)), false);
});