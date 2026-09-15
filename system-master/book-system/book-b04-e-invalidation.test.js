'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const d3 = require('./book-reader-currentness-runtime-v1');
const queryRuntime = require('./book-reader-query-runtime-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');
const f = require('./book-b04-e-fixtures-v1');

const c = (name, run) => ({ name, run });
const code = expected => err => err && err.code === expected;

function compute(x, bindings = x.current_bindings, extra = {}) {
  return d3.computeReaderUnderstandingInvalidationV1({ exposure_projection: x.exp, understanding_projection: x.projection, observations: x.observations, current_bindings: bindings, ...extra });
}

manifest.registerFamilyTests(test, 'I', [
  c('exact dependency snapshot is current at exposure and understanding layers', () => {
    const x = f.mixedEvidenceFixture(); const r = compute(x); assert.equal(r.exposure_current, true); assert.equal(r.understanding_current, true); assert.deepEqual(r.stale_dependency_kinds, []);
  }),
  c('currentness computation is deterministic and content addressed', () => {
    const x = f.mixedEvidenceFixture(); const a = compute(x); const b = compute({ ...x, observations: f.clone(x.observations), current_bindings: f.clone(x.current_bindings) }); assert.deepEqual(a, b); assert.match(a.currentness_id, /^book-reader-currentness-v1:[a-f0-9]{64}$/); assert.equal(d3.validateReaderUnderstandingCurrentnessV1(a, x.exp, x.projection), true);
  }),
  c('Story Bible noncurrent binding stales both layers', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.story_bible.current = false; const r = compute(x, b); assert.equal(r.exposure_current, false); assert.equal(r.understanding_current, false); assert.ok(r.stale_dependency_kinds.includes('STORY_BIBLE'));
  }),
  c('knowledge identity or digest change stales both layers', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.knowledge.knowledge_digest = f.h('changed-knowledge'); const r = compute(x, b); assert.equal(r.exposure_current, false); assert.equal(r.understanding_current, false); assert.ok(r.stale_dependency_kinds.includes('KNOWLEDGE'));
  }),
  c('scope binding change stales both layers', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.scope.scope_digest = f.h('changed-scope'); const r = compute(x, b); assert.equal(r.exposure_current, false); assert.ok(r.stale_dependency_kinds.includes('SCOPE'));
  }),
  c('reveal-frontier change stales both layers', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.reveal_frontier.frontier_anchor_digest = f.h('changed-frontier'); const r = compute(x, b); assert.equal(r.exposure_current, false); assert.ok(r.stale_dependency_kinds.includes('FRONTIER'));
  }),
  c('exact B03 invalidation impact stales B04 without creating a second B03 invalidation authority', () => {
    const x = f.mixedEvidenceFixture(); const impact = f.b03ImpactFor(x); const r = compute(x, x.current_bindings, { b03_invalidation_result: impact }); assert.equal(r.exposure_current, false); assert.equal(r.understanding_current, false); assert.ok(r.stale_dependency_kinds.includes('B03_INVALIDATION_IMPACT')); assert.equal(r.b03_invalidation_impact_ref, impact.impact.impact_id);
  }),
  c('observation digest change stales understanding only', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.observations[0].observation_digest = f.h('changed-observation'); const r = compute(x, b); assert.equal(r.exposure_current, true); assert.equal(r.understanding_current, false); assert.deepEqual(r.stale_dependency_kinds, ['OBSERVATION']);
  }),
  c('provider admission change stales understanding only', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.provider_admissions[0].provider_admission_digest = f.h('changed-provider'); const r = compute(x, b); assert.equal(r.exposure_current, true); assert.equal(r.understanding_current, false); assert.ok(r.stale_dependency_kinds.includes('PROVIDER_ADMISSION'));
  }),
  c('calibration binding change stales understanding only', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.calibrations[0].calibration_digest = f.h('changed-calibration'); const r = compute(x, b); assert.equal(r.exposure_current, true); assert.equal(r.understanding_current, false); assert.ok(r.stale_dependency_kinds.includes('CALIBRATION'));
  }),
  c('recompute flags exactly mirror layered currentness', () => {
    const x = f.mixedEvidenceFixture(); const a = compute(x); assert.equal(a.recompute_exposure_required, false); assert.equal(a.recompute_understanding_required, false); const b = f.clone(x.current_bindings); b.observations[0].current = false; const readerStale = compute(x, b); assert.equal(readerStale.recompute_exposure_required, false); assert.equal(readerStale.recompute_understanding_required, true); const c2 = f.clone(x.current_bindings); c2.scope.current = false; const exposureStale = compute(x, c2); assert.equal(exposureStale.recompute_exposure_required, true); assert.equal(exposureStale.recompute_understanding_required, true);
  }),
  c('current exposure query returns exact exposure projection', () => {
    const x = f.mixedEvidenceFixture(); const r = compute(x); assert.deepEqual(d3.getReaderExposureProjectionV1({ exposure_projection: x.exp, currentness: r }), x.exp);
  }),
  c('stale exposure cannot be returned as current', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.scope.current = false; const r = compute(x, b); assert.throws(() => d3.getReaderExposureProjectionV1({ exposure_projection: x.exp, currentness: r }), code('BLOCKED_CURRENTNESS_REQUIRED'));
  }),
  c('stale understanding is blocked while currentness remains queryable and current exposure may survive', () => {
    const x = f.mixedEvidenceFixture(); const b = f.clone(x.current_bindings); b.observations[0].current = false; const r = compute(x, b); assert.equal(r.exposure_current, true); assert.throws(() => d3.getReaderUnderstandingProjectionV1({ exposure_projection: x.exp, understanding_projection: x.projection, currentness: r }), code('BLOCKED_CURRENTNESS_REQUIRED')); assert.deepEqual(d3.getReaderUnderstandingCurrentnessV1({ currentness: r, exposure_projection: x.exp, understanding_projection: x.projection }), r); assert.deepEqual(d3.getReaderExposureProjectionV1({ exposure_projection: x.exp, currentness: r }), x.exp);
  }),
  c('runtime surface is exactly one locked command and five locked queries with no provider-registry widening', () => {
    const x = f.mixedEvidenceFixture(); const runtime = queryRuntime.createBookReaderQueryRuntimeV1({ exposure_projection: x.exp, understanding_projection: x.projection, observations: x.observations, current_bindings: x.current_bindings }); assert.deepEqual(runtime.command_names, ['ComputeReaderUnderstandingInvalidationV1']); assert.deepEqual(runtime.query_names, ['GetReaderExposureProjectionV1','GetReaderUnderstandingProjectionV1','GetReaderDimensionEvidenceV1','GetReaderLensCoverageV1','GetReaderUnderstandingCurrentnessV1']); assert.equal(runtime.provider_registry_modified, false); assert.equal(runtime.canonical_effect, false);
  }),
  c('exact replay is idempotent across currentness runtime and hardened query reachability', () => {
    const x = f.mixedEvidenceFixture(); const input = { exposure_projection: x.exp, understanding_projection: x.projection, observations: x.observations, current_bindings: x.current_bindings }; const a = queryRuntime.createBookReaderQueryRuntimeV1(input); const b = queryRuntime.createBookReaderQueryRuntimeV1(f.clone(input)); assert.equal(a.runtime_id, b.runtime_id); assert.equal(a.runtime_digest, b.runtime_digest); assert.deepEqual(a.execute('ComputeReaderUnderstandingInvalidationV1'), b.execute('ComputeReaderUnderstandingInvalidationV1')); assert.deepEqual(a.execute('GetReaderDimensionEvidenceV1', { dimension_id: 'PCE013-DIM-001' }), b.execute('GetReaderDimensionEvidenceV1', { dimension_id: 'PCE013-DIM-001' }));
  })
]);