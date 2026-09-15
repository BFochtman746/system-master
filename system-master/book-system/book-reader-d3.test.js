'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const knowledgeInvalidation = require('./book-knowledge-invalidation-v1');
const d3 = require('./book-reader-currentness-runtime-v1');

const h = value => kb.sha256(value);
const clone = value => JSON.parse(JSON.stringify(value));
const SA_ID = 'book-source-custody-v1:source-d3';
const SA_DIGEST = h('d3-source-acceptance');
const PROJ_ID = 'book-normalized-source-projection-v1:d3';
const PROJ_DIGEST = h('d3-source-projection');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-D3:v1';
const MANUSCRIPT_DIGEST = h('d3-manuscript');

function anchor(id, ordinal) {
  return {
    anchor_id: id,
    source_acceptance_id: SA_ID,
    source_acceptance_digest: SA_DIGEST,
    projection_id: PROJ_ID,
    projection_digest: PROJ_DIGEST,
    manuscript_ref: MANUSCRIPT_REF,
    unit_ref: 'CHAPTER:D3-CH-001:v1',
    ordinal,
    span_start: ordinal * 10,
    span_end: ordinal * 10 + 5,
    span_sha256: h(`d3-span-${id}`),
    source_current: true,
    provenance_refs: [`evidence://d3/anchor/${ordinal}`]
  };
}

function common(anchorId) {
  return {
    status: 'ASSERTED',
    confidence: 0.9,
    source_anchor_ids: [anchorId],
    provenance_refs: [`evidence://d3/record/${anchorId}`],
    evidence_refs: [],
    depends_on_refs: []
  };
}

function sealKnowledge(k) {
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  return k;
}

function knowledgeFixture() {
  return sealKnowledge({
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: 'BOOK-PROJECT-D3',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://d3-fixture'],
    source_acceptance_refs: [{ source_acceptance_id: SA_ID, source_acceptance_digest: SA_DIGEST }],
    projection_refs: [{ projection_id: PROJ_ID, projection_digest: PROJ_DIGEST, source_acceptance_id: SA_ID }],
    manuscript_refs: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST }],
    calibration_policy_ref: 'policy://book-knowledge/d3',
    calibration_policy_digest: h('d3-policy'),
    anchors: [anchor('ANCHOR:D3-A1', 1), anchor('ANCHOR:D3-A2', 2)],
    entities: [{ entity_id: 'ENTITY:D3-E1', entity_type: 'CHARACTER', aliases: ['Reader Target'], state_assertion_ids: [], ...common('ANCHOR:D3-A1') }],
    events: [{ event_id: 'EVENT:D3-EARLY', event_family_id: null, participant_entity_ids: ['ENTITY:D3-E1'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:D3-A2') }],
    temporal_claims: [], causal_goal_claims: [], state_assertions: [], character_knowledge_claims: [], relationships: [], arcs: [], motifs: [], themes: [], promises: [], setup_payoffs: [], open_questions: [], identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL'
  });
}

function exposureFixture(options = {}) {
  const knowledge = knowledgeFixture();
  const a = knowledge.anchors[1];
  const exp = exposure.buildReaderExposureProjectionV1({
    knowledge,
    story_bible_binding: {
      story_bible_ref: options.story_bible_ref || 'STORY_BIBLE:BOOK-D3:v1',
      story_bible_digest: options.story_bible_digest || h('d3-story-bible'),
      knowledge_candidate_id: knowledge.knowledge_candidate_id,
      knowledge_digest: knowledge.knowledge_digest,
      current: true
    },
    scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:D3-CH-001:v1', scope_digest: options.scope_digest || h('d3-scope') },
    reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) }
  });
  return { knowledge, exp };
}

function candidate(exp, target, overrides = {}) {
  return {
    observation_schema_version: understanding.OBSERVATION_SCHEMA_VERSION,
    exposure_projection_id: exp.exposure_projection_id,
    exposure_projection_digest: exp.exposure_projection_digest,
    target,
    source_class: 'DETERMINISTIC',
    standing: 'OBSERVED_UNCALIBRATED',
    provider_subject_ref: null,
    provider_admission_ref: null,
    reader_profile_ref: null,
    evidence_refs: ['evidence://d3/default'],
    confidence: 0.8,
    calibration_ref: null,
    reveal_frontier: clone(exp.reveal_frontier),
    canonical_effect: false,
    ...overrides
  };
}

function providerBinding(ref = 'provider://reader-model/d3', admission = 'provider-admission://reader-model/d3') {
  return { provider_subject_ref: ref, provider_admission_ref: admission, provider_admission_digest: h(`${ref}|${admission}`), current: true };
}

function calibrationBinding(ref = 'calibration://human/d3', calibrationClass = 'HUMAN') {
  return { calibration_ref: ref, calibration_digest: h(`${ref}|${calibrationClass}`), calibration_class: calibrationClass, current: true };
}

function fixture() {
  const base = exposureFixture();
  const exp = base.exp;
  const dimension = understanding.acceptReaderObservationV1({
    candidate: candidate(exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, { evidence_refs: ['evidence://d3/dimension/1'] }),
    exposure_projection: exp
  });
  const lens = understanding.acceptReaderObservationV1({
    candidate: candidate(exp, { dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }, { evidence_refs: ['evidence://d3/lens/focalization'] }),
    exposure_projection: exp
  });
  const provider = providerBinding();
  const model = understanding.acceptReaderObservationV1({
    candidate: candidate(exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, {
      source_class: 'MODEL',
      provider_subject_ref: provider.provider_subject_ref,
      provider_admission_ref: provider.provider_admission_ref,
      evidence_refs: ['evidence://d3/model/1']
    }),
    exposure_projection: exp,
    provider_admission_binding: provider
  });
  const calibration = calibrationBinding();
  const human = understanding.acceptReaderObservationV1({
    candidate: candidate(exp, { dimension_id: 'PCE013-DIM-003', perspective_lens_id: null }, {
      source_class: 'HUMAN',
      standing: 'OBSERVED_CALIBRATED',
      reader_profile_ref: 'reader-profile://human/d3/1',
      evidence_refs: ['evidence://d3/human/1'],
      calibration_ref: calibration.calibration_ref
    }),
    exposure_projection: exp,
    calibration_binding: calibration
  });
  const observations = [dimension, lens, model, human];
  const projection = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations });
  const current_bindings = bindingsFrom(exp, observations);
  return { ...base, observations, projection, current_bindings, provider, calibration };
}

function bindingsFrom(exp, observations) {
  const providerMap = new Map();
  const calibrationMap = new Map();
  for (const o of observations) {
    if (o.provider_subject_ref !== null) {
      providerMap.set(`${o.provider_subject_ref}|${o.provider_admission_ref}`, {
        provider_subject_ref: o.provider_subject_ref,
        provider_admission_ref: o.provider_admission_ref,
        provider_admission_digest: o.provider_admission_digest,
        current: true
      });
    }
    if (o.calibration_ref !== null) {
      calibrationMap.set(o.calibration_ref, {
        calibration_ref: o.calibration_ref,
        calibration_digest: o.calibration_digest,
        calibration_class: o.calibration_class,
        current: true
      });
    }
  }
  return {
    story_bible: { story_bible_ref: exp.story_bible_ref, story_bible_digest: exp.story_bible_digest, current: true },
    knowledge: { knowledge_candidate_id: exp.knowledge_candidate_id, knowledge_digest: exp.knowledge_digest, current: true },
    scope: { ...clone(exp.scope), current: true },
    reveal_frontier: { ...clone(exp.reveal_frontier), current: true },
    observations: observations.map(o => ({ observation_id: o.observation_id, observation_digest: o.observation_digest, current: true })),
    provider_admissions: [...providerMap.values()],
    calibrations: [...calibrationMap.values()]
  };
}

function compute(f, overrides = {}) {
  return d3.computeReaderUnderstandingInvalidationV1({
    exposure_projection: f.exp,
    understanding_projection: f.projection,
    observations: f.observations,
    current_bindings: f.current_bindings,
    ...overrides
  });
}

function b03ImpactFor(f, overrides = {}) {
  const input = knowledgeInvalidation.sealInvalidationInputV1({
    invalidation_subject_ref: knowledgeInvalidation.INVALIDATION_SUBJECT_REF,
    book_project_id: f.knowledge.book_project_id,
    base_story_bible_ref: overrides.base_story_bible_ref || f.exp.story_bible_ref,
    base_story_bible_digest: overrides.base_story_bible_digest || f.exp.story_bible_digest,
    base_knowledge: f.knowledge,
    changed_identities: [{
      kind: 'ANCHOR',
      identity_ref: f.knowledge.anchors[0].anchor_id,
      prior_digest: f.knowledge.anchors[0].span_sha256,
      current_digest: h('d3-anchor-changed'),
      current_identity_ref: f.knowledge.anchors[0].anchor_id
    }]
  });
  return knowledgeInvalidation.computeStoryBibleInvalidationImpactV1(input);
}

function changedBinding(f, mutate) {
  const bindings = clone(f.current_bindings);
  mutate(bindings);
  return bindings;
}

function staleObservationFixture() {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.observations[0].current = false; });
  const currentness = compute(f, { current_bindings: bindings });
  return { f, bindings, currentness };
}

test('D3-01 exact dependency snapshot is current at both layers', () => {
  const f = fixture();
  const c = compute(f);
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, true);
  assert.deepEqual(c.changed_dependencies, []);
});

test('D3-02 currentness computation is deterministic and content addressed', () => {
  const f = fixture();
  const a = compute(f);
  const b = compute(f);
  assert.equal(a.currentness_id, b.currentness_id);
  assert.equal(a.currentness_digest, b.currentness_digest);
  assert.match(a.currentness_id, /^book-reader-currentness-v1:[a-f0-9]{64}$/);
});

test('D3-03 exact currentness receipt validates', () => {
  const f = fixture();
  const c = compute(f);
  assert.equal(d3.validateReaderUnderstandingCurrentnessV1(c, f.exp, f.projection), true);
});

test('D3-04 Story Bible current=false makes exposure and understanding stale', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.story_bible.current = false; });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, false);
  assert.equal(c.understanding_current, false);
  assert.ok(c.stale_dependency_kinds.includes('STORY_BIBLE'));
});

test('D3-05 Story Bible digest change makes both layers stale', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.story_bible.story_bible_digest = h('changed-story-bible'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, false);
  assert.ok(c.stale_dependency_kinds.includes('STORY_BIBLE'));
});

test('D3-06 knowledge identity/digest change makes both layers stale', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.knowledge.knowledge_digest = h('changed-knowledge'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, false);
  assert.ok(c.stale_dependency_kinds.includes('KNOWLEDGE'));
});

test('D3-07 scope digest change makes both layers stale', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.scope.scope_digest = h('changed-scope'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, false);
  assert.ok(c.stale_dependency_kinds.includes('SCOPE'));
});

test('D3-08 frontier digest change makes both layers stale', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.reveal_frontier.frontier_anchor_digest = h('changed-frontier'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, false);
  assert.ok(c.stale_dependency_kinds.includes('FRONTIER'));
});

test('D3-09 observation digest change stales understanding but preserves exposure', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.observations[0].observation_digest = h('changed-observation'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, false);
  assert.ok(c.stale_dependency_kinds.includes('OBSERVATION'));
});

test('D3-10 observation current=false stales understanding only', () => {
  const { currentness } = staleObservationFixture();
  assert.equal(currentness.exposure_current, true);
  assert.equal(currentness.understanding_current, false);
});

test('D3-11 missing bound observation stales understanding only', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.observations.shift(); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, false);
});

test('D3-12 provider-admission digest change stales understanding only', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.provider_admissions[0].provider_admission_digest = h('changed-provider-admission'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, false);
  assert.ok(c.stale_dependency_kinds.includes('PROVIDER_ADMISSION'));
});

test('D3-13 provider admission current=false stales understanding only', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.provider_admissions[0].current = false; });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, false);
});

test('D3-14 calibration digest change stales understanding only', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.calibrations[0].calibration_digest = h('changed-calibration'); });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, false);
  assert.ok(c.stale_dependency_kinds.includes('CALIBRATION'));
});

test('D3-15 calibration class change stales understanding only', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.calibrations[0].calibration_class = 'MODEL'; });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.exposure_current, true);
  assert.equal(c.understanding_current, false);
});

test('D3-16 calibration current=false stales understanding only', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.calibrations[0].current = false; });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.understanding_current, false);
});

test('D3-17 unrelated extra current bindings do not invalidate bound projection', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => {
    b.observations.push({ observation_id: 'book-reader-observation-v1:' + h('extra-observation'), observation_digest: h('extra-observation'), current: true });
    b.provider_admissions.push({ provider_subject_ref: 'provider://extra', provider_admission_ref: 'provider-admission://extra', provider_admission_digest: h('extra-provider'), current: true });
    b.calibrations.push({ calibration_ref: 'calibration://extra', calibration_digest: h('extra-calibration'), calibration_class: 'MODEL', current: true });
  });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.understanding_current, true);
});

test('D3-18 valid B03 invalidation impact stales exposure and understanding', () => {
  const f = fixture();
  const impact = b03ImpactFor(f);
  const c = compute(f, { b03_invalidation_result: impact });
  assert.equal(c.exposure_current, false);
  assert.equal(c.understanding_current, false);
  assert.equal(c.b03_invalidation_impact_ref, impact.impact.impact_id);
  assert.ok(c.stale_dependency_kinds.includes('B03_INVALIDATION_IMPACT'));
});

test('D3-19 B03 impact bound to another Story Bible is rejected', () => {
  const f = fixture();
  const impact = b03ImpactFor(f, { base_story_bible_digest: h('other-story-bible') });
  assert.throws(() => compute(f, { b03_invalidation_result: impact }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D3-20 understanding projection and observation set must reproduce exact projection', () => {
  const f = fixture();
  assert.throws(() => compute(f, { observations: f.observations.slice(1) }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D3-21 tampered understanding projection digest fails closed', () => {
  const f = fixture();
  const p = clone(f.projection);
  p.understanding_projection_digest = h('tampered-projection');
  assert.throws(() => compute(f, { understanding_projection: p }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D3-22 current exposure query returns exact exposure projection', () => {
  const f = fixture();
  const c = compute(f);
  const result = d3.getReaderExposureProjectionV1({ exposure_projection: f.exp, currentness: c });
  assert.equal(result.exposure_projection_id, f.exp.exposure_projection_id);
});

test('D3-23 exposure remains queryable when only observation evidence is stale', () => {
  const { f, currentness } = staleObservationFixture();
  const result = d3.getReaderExposureProjectionV1({ exposure_projection: f.exp, currentness });
  assert.equal(result.exposure_projection_id, f.exp.exposure_projection_id);
});

test('D3-24 stale exposure cannot be returned as current', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.scope.current = false; });
  const c = compute(f, { current_bindings: bindings });
  assert.throws(() => d3.getReaderExposureProjectionV1({ exposure_projection: f.exp, currentness: c }), e => e.code === 'BLOCKED_CURRENTNESS_REQUIRED');
});

test('D3-25 current understanding query returns exact understanding projection', () => {
  const f = fixture();
  const c = compute(f);
  const result = d3.getReaderUnderstandingProjectionV1({ exposure_projection: f.exp, understanding_projection: f.projection, currentness: c });
  assert.equal(result.understanding_projection_id, f.projection.understanding_projection_id);
});

test('D3-26 stale understanding cannot be returned as current', () => {
  const { f, currentness } = staleObservationFixture();
  assert.throws(() => d3.getReaderUnderstandingProjectionV1({ exposure_projection: f.exp, understanding_projection: f.projection, currentness }), e => e.code === 'BLOCKED_CURRENTNESS_REQUIRED');
});

test('D3-27 currentness query remains available while projection is stale and carries no projection payload', () => {
  const { f, currentness } = staleObservationFixture();
  const result = d3.getReaderUnderstandingCurrentnessV1({ currentness, exposure_projection: f.exp, understanding_projection: f.projection });
  assert.equal(result.understanding_current, false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'understanding_projection'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'exposure_projection'), false);
});

test('D3-28 dimension evidence query returns exact disposition and sealed evidence refs', () => {
  const f = fixture();
  const c = compute(f);
  const result = d3.getReaderDimensionEvidenceV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, currentness: c, dimension_id: 'PCE013-DIM-001' });
  assert.equal(result.dimension_id, 'PCE013-DIM-001');
  assert.equal(result.disposition, 'OBSERVED');
  assert.deepEqual(result.observation_evidence[0].evidence_refs, ['evidence://d3/dimension/1']);
  assert.equal(result.canonical_effect, false);
});

test('D3-29 lens coverage query returns exact current lens evidence', () => {
  const f = fixture();
  const c = compute(f);
  const result = d3.getReaderLensCoverageV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, currentness: c, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' });
  assert.equal(result.perspective_lens_id, 'PERSPECTIVE_FOCALIZATION');
  assert.equal(result.disposition, 'OBSERVED');
  assert.equal(result.observation_evidence.length, 1);
});

test('D3-30 unknown dimension query fails closed', () => {
  const f = fixture();
  const c = compute(f);
  assert.throws(() => d3.getReaderDimensionEvidenceV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, currentness: c, dimension_id: 'PCE013-DIM-999' }), e => e.code === 'BLOCKED_DIMENSION_UNKNOWN');
});

test('D3-31 unknown lens query fails closed', () => {
  const f = fixture();
  const c = compute(f);
  assert.throws(() => d3.getReaderLensCoverageV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, currentness: c, perspective_lens_id: 'NOT_A_LENS' }), e => e.code === 'BLOCKED_LENS_UNKNOWN');
});

test('D3-32 runtime publishes exactly one locked command and five locked queries without registry widening', () => {
  const f = fixture();
  const runtime = d3.createBookReaderRuntimeV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, current_bindings: f.current_bindings });
  assert.deepEqual(runtime.command_names, ['ComputeReaderUnderstandingInvalidationV1']);
  assert.deepEqual(runtime.query_names, [
    'GetReaderExposureProjectionV1',
    'GetReaderUnderstandingProjectionV1',
    'GetReaderDimensionEvidenceV1',
    'GetReaderLensCoverageV1',
    'GetReaderUnderstandingCurrentnessV1'
  ]);
  assert.equal(runtime.provider_registry_modified, false);
  assert.equal(runtime.canonical_effect, false);
  assert.equal(d3.validateRuntimeRecordV1(runtime), true);
});

test('D3-33 runtime invalidation command is exact replay/idempotent', () => {
  const f = fixture();
  const runtime = d3.createBookReaderRuntimeV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, current_bindings: f.current_bindings });
  const a = runtime.execute('ComputeReaderUnderstandingInvalidationV1');
  const b = runtime.execute('ComputeReaderUnderstandingInvalidationV1');
  assert.equal(a.currentness_id, b.currentness_id);
  assert.equal(a.currentness_digest, runtime.currentness_digest);
});

test('D3-34 all five locked queries are runtime reachable', () => {
  const f = fixture();
  const runtime = d3.createBookReaderRuntimeV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, current_bindings: f.current_bindings });
  assert.equal(runtime.execute('GetReaderExposureProjectionV1').exposure_projection_id, f.exp.exposure_projection_id);
  assert.equal(runtime.execute('GetReaderUnderstandingProjectionV1').understanding_projection_id, f.projection.understanding_projection_id);
  assert.equal(runtime.execute('GetReaderDimensionEvidenceV1', { dimension_id: 'PCE013-DIM-001' }).dimension_id, 'PCE013-DIM-001');
  assert.equal(runtime.execute('GetReaderLensCoverageV1', { perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }).perspective_lens_id, 'PERSPECTIVE_FOCALIZATION');
  assert.equal(runtime.execute('GetReaderUnderstandingCurrentnessV1').currentness_id, runtime.currentness_id);
});

test('D3-35 unknown runtime operation fails closed', () => {
  const f = fixture();
  const runtime = d3.createBookReaderRuntimeV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, current_bindings: f.current_bindings });
  assert.throws(() => runtime.execute('WriteCanonicalStoryBibleV1'), e => e.code === 'BLOCKED_CURRENTNESS_REQUIRED');
});

test('D3-36 currentness digest tampering fails closed', () => {
  const f = fixture();
  const c = compute(f);
  const tampered = clone(c);
  tampered.currentness_digest = h('tampered-currentness');
  assert.throws(() => d3.validateReaderUnderstandingCurrentnessV1(tampered, f.exp, f.projection), e => e.code === 'BLOCKED_DIGEST_MISMATCH');
});

test('D3-37 query currentness cannot be rebound to another valid exposure', () => {
  const f = fixture();
  const c = compute(f);
  const other = exposureFixture({ scope_digest: h('different-scope') });
  assert.throws(() => d3.getReaderExposureProjectionV1({ exposure_projection: other.exp, currentness: c }), e => e.code === 'BLOCKED_CURRENTNESS_REQUIRED');
});

test('D3-38 recompute flags exactly mirror layered currentness', () => {
  const f = fixture();
  const bindings = changedBinding(f, b => { b.observations[0].current = false; });
  const c = compute(f, { current_bindings: bindings });
  assert.equal(c.recompute_exposure_required, false);
  assert.equal(c.recompute_understanding_required, true);
});

test('D3-39 currentness and query surfaces preserve canonical_effect=false', () => {
  const f = fixture();
  const c = compute(f);
  const dimension = d3.getReaderDimensionEvidenceV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, currentness: c, dimension_id: 'PCE013-DIM-001' });
  const lens = d3.getReaderLensCoverageV1({ exposure_projection: f.exp, understanding_projection: f.projection, observations: f.observations, currentness: c, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' });
  assert.equal(c.canonical_effect, false);
  assert.equal(dimension.canonical_effect, false);
  assert.equal(lens.canonical_effect, false);
});

test('D3-40 B03 invalidation composition does not mutate historical knowledge input', () => {
  const f = fixture();
  const before = kb.stableStringify(f.knowledge);
  const impact = b03ImpactFor(f);
  compute(f, { b03_invalidation_result: impact });
  assert.equal(kb.stableStringify(f.knowledge), before);
});