'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const d3 = require('./book-reader-currentness-runtime-v1');
const hardenedQuery = require('./book-reader-query-runtime-v1');
const b03Invalidation = require('./book-knowledge-invalidation-v1');
const fx = require('./book-b04-e-fixtures-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');

function changed(f, mutate) { const b=fx.clone(f.current_bindings); mutate(b); return b; }
function impactWithStoryDigest(f,digest) {
  const input=b03Invalidation.sealInvalidationInputV1({
    invalidation_subject_ref:b03Invalidation.INVALIDATION_SUBJECT_REF,
    book_project_id:f.knowledge.book_project_id,
    base_story_bible_ref:f.exp.story_bible_ref,
    base_story_bible_digest:digest,
    base_knowledge:f.knowledge,
    changed_identities:[{kind:'ANCHOR',identity_ref:f.knowledge.anchors[0].anchor_id,prior_digest:f.knowledge.anchors[0].span_sha256,current_digest:fx.h('b04-e-other-anchor'),current_identity_ref:f.knowledge.anchors[0].anchor_id}]
  });
  return b03Invalidation.computeStoryBibleInvalidationImpactV1(input);
}

const cases = [
  ['exact dependency snapshot is current at exposure and understanding layers', () => { const f=fx.fixture(); const c=fx.compute(f); assert.equal(c.exposure_current,true); assert.equal(c.understanding_current,true); assert.deepEqual(c.changed_dependencies,[]); }],
  ['currentness is deterministic and content addressed', () => { const f=fx.fixture(); const a=fx.compute(f); const b=fx.compute(f); assert.equal(a.currentness_id,b.currentness_id); assert.equal(a.currentness_digest,b.currentness_digest); assert.match(a.currentness_id,/^book-reader-currentness-v1:[a-f0-9]{64}$/); }],
  ['exact currentness receipt validates against both projections', () => { const f=fx.fixture(); assert.equal(d3.validateReaderUnderstandingCurrentnessV1(fx.compute(f),f.exp,f.projection),true); }],
  ['Story Bible change stales both exposure and understanding', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.story_bible.story_bible_digest=fx.h('changed-story');})); assert.equal(c.exposure_current,false); assert.equal(c.understanding_current,false); assert.ok(c.stale_dependency_kinds.includes('STORY_BIBLE')); }],
  ['B03 knowledge change stales both exposure and understanding', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.knowledge.knowledge_digest=fx.h('changed-knowledge');})); assert.equal(c.exposure_current,false); assert.equal(c.understanding_current,false); assert.ok(c.stale_dependency_kinds.includes('KNOWLEDGE')); }],
  ['scope change stales both exposure and understanding', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.scope.scope_digest=fx.h('changed-scope');})); assert.equal(c.exposure_current,false); assert.equal(c.understanding_current,false); assert.ok(c.stale_dependency_kinds.includes('SCOPE')); }],
  ['reveal frontier change stales both exposure and understanding', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.reveal_frontier.frontier_anchor_digest=fx.h('changed-frontier');})); assert.equal(c.exposure_current,false); assert.equal(c.understanding_current,false); assert.ok(c.stale_dependency_kinds.includes('FRONTIER')); }],
  ['sealed observation change stales understanding only', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.observations[0].current=false;})); assert.equal(c.exposure_current,true); assert.equal(c.understanding_current,false); assert.equal(c.recompute_exposure_required,false); assert.equal(c.recompute_understanding_required,true); }],
  ['provider admission change stales understanding only', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.provider_admissions[0].provider_admission_digest=fx.h('changed-provider');})); assert.equal(c.exposure_current,true); assert.equal(c.understanding_current,false); assert.ok(c.stale_dependency_kinds.includes('PROVIDER_ADMISSION')); }],
  ['calibration change stales understanding only', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.calibrations[0].calibration_digest=fx.h('changed-calibration');})); assert.equal(c.exposure_current,true); assert.equal(c.understanding_current,false); assert.ok(c.stale_dependency_kinds.includes('CALIBRATION')); }],
  ['valid exact B03 invalidation impact stales both layers', () => { const f=fx.fixture(); const impact=fx.b03ImpactFor(f); const c=fx.compute(f,f.current_bindings,{b03_invalidation_result:impact}); assert.equal(c.exposure_current,false); assert.equal(c.understanding_current,false); assert.equal(c.b03_invalidation_impact_ref,impact.impact.impact_id); assert.ok(c.stale_dependency_kinds.includes('B03_INVALIDATION_IMPACT')); }],
  ['B03 invalidation impact bound to another Story Bible digest is rejected', () => { const f=fx.fixture(); const impact=impactWithStoryDigest(f,fx.h('other-story-bible')); assert.throws(()=>fx.compute(f,f.current_bindings,{b03_invalidation_result:impact}),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['stale exposure query fails closed', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.scope.current=false;})); assert.throws(()=>d3.getReaderExposureProjectionV1({exposure_projection:f.exp,currentness:c}),e=>e.code==='BLOCKED_CURRENTNESS_REQUIRED'); }],
  ['stale understanding, dimension and lens queries all fail closed', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.observations[0].current=false;})); assert.throws(()=>d3.getReaderUnderstandingProjectionV1({exposure_projection:f.exp,understanding_projection:f.projection,currentness:c}),e=>e.code==='BLOCKED_CURRENTNESS_REQUIRED'); assert.throws(()=>hardenedQuery.getReaderDimensionEvidenceV1({exposure_projection:f.exp,understanding_projection:f.projection,observations:f.observations,currentness:c,dimension_id:'PCE013-DIM-001'}),e=>e.code==='BLOCKED_CURRENTNESS_REQUIRED'); assert.throws(()=>hardenedQuery.getReaderLensCoverageV1({exposure_projection:f.exp,understanding_projection:f.projection,observations:f.observations,currentness:c,perspective_lens_id:'PERSPECTIVE_FOCALIZATION'}),e=>e.code==='BLOCKED_CURRENTNESS_REQUIRED'); }],
  ['currentness query remains available while understanding is stale', () => { const f=fx.fixture(); const c=fx.compute(f,changed(f,b=>{b.observations[0].current=false;})); const r=d3.getReaderUnderstandingCurrentnessV1({currentness:c,exposure_projection:f.exp,understanding_projection:f.projection}); assert.equal(r.understanding_current,false); assert.equal(r.exposure_current,true); }],
  ['runtime exposes exactly one command and five queries with idempotent currentness replay', () => { const f=fx.fixture(); const runtime=d3.createBookReaderRuntimeV1({exposure_projection:f.exp,understanding_projection:f.projection,observations:f.observations,current_bindings:f.current_bindings}); assert.deepEqual(runtime.command_names,['ComputeReaderUnderstandingInvalidationV1']); assert.deepEqual(runtime.query_names,['GetReaderExposureProjectionV1','GetReaderUnderstandingProjectionV1','GetReaderDimensionEvidenceV1','GetReaderLensCoverageV1','GetReaderUnderstandingCurrentnessV1']); const a=runtime.execute('ComputeReaderUnderstandingInvalidationV1'); const b=runtime.execute('ComputeReaderUnderstandingInvalidationV1'); assert.equal(a.currentness_id,b.currentness_id); assert.equal(runtime.provider_registry_modified,false); assert.equal(runtime.canonical_effect,false); }]
];

assert.equal(cases.length,16);
cases.forEach(([name,fn],i)=>test(`${manifest.CASE_IDS.INVALIDATION[i]} ${name}`,fn));
