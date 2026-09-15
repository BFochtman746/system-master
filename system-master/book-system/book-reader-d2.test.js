'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const kb = require('./book-story-bible-knowledge-v1');
const registry = require('./book-reader-dimension-registry-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');

const h = value => kb.sha256(value);
const SA_ID = 'book-source-custody-v1:source-d2';
const SA_DIGEST = h('d2-source-acceptance');
const PROJ_ID = 'book-normalized-source-projection-v1:d2';
const PROJ_DIGEST = h('d2-source-projection');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-D2:v1';
const MANUSCRIPT_DIGEST = h('d2-manuscript');

function anchor(id, ordinal) {
  return {
    anchor_id: id,
    source_acceptance_id: SA_ID,
    source_acceptance_digest: SA_DIGEST,
    projection_id: PROJ_ID,
    projection_digest: PROJ_DIGEST,
    manuscript_ref: MANUSCRIPT_REF,
    unit_ref: 'CHAPTER:D2-CH-001:v1',
    ordinal,
    span_start: ordinal * 10,
    span_end: ordinal * 10 + 5,
    span_sha256: h(`d2-span-${id}`),
    source_current: true,
    provenance_refs: [`evidence://d2/anchor/${ordinal}`]
  };
}

function common(anchorId) {
  return {
    status: 'ASSERTED',
    confidence: 0.9,
    source_anchor_ids: [anchorId],
    provenance_refs: [`evidence://d2/record/${anchorId}`],
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
    book_project_id: 'BOOK-PROJECT-D2',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://d2-fixture'],
    source_acceptance_refs: [{ source_acceptance_id: SA_ID, source_acceptance_digest: SA_DIGEST }],
    projection_refs: [{ projection_id: PROJ_ID, projection_digest: PROJ_DIGEST, source_acceptance_id: SA_ID }],
    manuscript_refs: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST }],
    calibration_policy_ref: 'policy://book-knowledge/d2',
    calibration_policy_digest: h('d2-policy'),
    anchors: [anchor('ANCHOR:D2-A1', 1), anchor('ANCHOR:D2-A2', 2)],
    entities: [{ entity_id: 'ENTITY:D2-E1', entity_type: 'CHARACTER', aliases: ['Reader Target'], state_assertion_ids: [], ...common('ANCHOR:D2-A1') }],
    events: [{ event_id: 'EVENT:D2-EARLY', event_family_id: null, participant_entity_ids: ['ENTITY:D2-E1'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:D2-A2') }],
    temporal_claims: [], causal_goal_claims: [], state_assertions: [], character_knowledge_claims: [], relationships: [], arcs: [], motifs: [], themes: [], promises: [], setup_payoffs: [], open_questions: [], identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL'
  });
}

function exposureFixture() {
  const knowledge = knowledgeFixture();
  const a = knowledge.anchors[1];
  return exposure.buildReaderExposureProjectionV1({
    knowledge,
    story_bible_binding: {
      story_bible_ref: 'STORY_BIBLE:BOOK-D2:v1',
      story_bible_digest: h('d2-story-bible'),
      knowledge_candidate_id: knowledge.knowledge_candidate_id,
      knowledge_digest: knowledge.knowledge_digest,
      current: true
    },
    scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:D2-CH-001:v1', scope_digest: h('d2-scope') },
    reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) }
  });
}

function observationCandidate(exp, target = { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, overrides = {}) {
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
    evidence_refs: ['evidence://d2/default'],
    confidence: 0.8,
    calibration_ref: null,
    reveal_frontier: JSON.parse(JSON.stringify(exp.reveal_frontier)),
    canonical_effect: false,
    ...overrides
  };
}

function accept(exp, candidate, extra = {}) {
  return understanding.acceptReaderObservationV1({ candidate, exposure_projection: exp, ...extra });
}

function providerBinding(ref = 'provider://reader-model/v1', admission = 'provider-admission://reader-model/v1') {
  return { provider_subject_ref: ref, provider_admission_ref: admission, provider_admission_digest: h(`${ref}|${admission}`), current: true };
}

function calibrationBinding(ref, calibrationClass) {
  return { calibration_ref: ref, calibration_digest: h(`${ref}|${calibrationClass}`), calibration_class: calibrationClass, current: true };
}

function fullDimensionObservations(exp, firstOverride = null) {
  return registry.DIMENSIONS.map((d, index) => {
    if (index === 0 && firstOverride) return firstOverride;
    return accept(exp, observationCandidate(exp, { dimension_id: d.dimension_id, perspective_lens_id: null }, { evidence_refs: [`evidence://d2/dimension/${d.dimension_id}`] }));
  });
}

test('D2-01 deterministic dimension observation is sealed and content addressed', () => {
  const exp = exposureFixture();
  const o = accept(exp, observationCandidate(exp));
  assert.match(o.observation_id, /^book-reader-observation-v1:[a-f0-9]{64}$/);
  assert.equal(understanding.validateReaderObservationV1(o, exp), true);
  assert.equal(o.canonical_effect, false);
});

test('D2-02 lens observation is accepted independently of dimension taxonomy', () => {
  const exp = exposureFixture();
  const o = accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }));
  assert.equal(o.target.perspective_lens_id, 'PERSPECTIVE_FOCALIZATION');
});

test('D2-03 target requires exactly one dimension or lens', () => {
  const exp = exposureFixture();
  assert.throws(() => accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: null })), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
  assert.throws(() => accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: 'REVEAL_INFORMATION' })), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D2-04 unknown dimension fails closed', () => {
  const exp = exposureFixture();
  assert.throws(() => accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-999', perspective_lens_id: null })), e => e.code === 'BLOCKED_DIMENSION_UNKNOWN');
});

test('D2-05 unknown lens fails closed', () => {
  const exp = exposureFixture();
  assert.throws(() => accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'FAKE_LENS' })), e => e.code === 'BLOCKED_LENS_UNKNOWN');
});

test('D2-06 exposure identity mismatch fails closed', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp, undefined, { exposure_projection_digest: h('wrong-exposure') });
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D2-07 frontier mismatch is stale evidence', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp);
  c.reveal_frontier.frontier_anchor_digest = h('wrong-frontier');
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_OBSERVATION_STALE');
});

test('D2-08 observed standing requires evidence references', () => {
  const exp = exposureFixture();
  assert.throws(() => accept(exp, observationCandidate(exp, undefined, { evidence_refs: [] })), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D2-09 abstained and not-applicable observations may be sparse', () => {
  const exp = exposureFixture();
  const a = accept(exp, observationCandidate(exp, undefined, { standing: 'ABSTAINED', evidence_refs: [], confidence: null }));
  const n = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, { standing: 'NOT_APPLICABLE', evidence_refs: [], confidence: null }));
  assert.equal(a.standing, 'ABSTAINED');
  assert.equal(n.standing, 'NOT_APPLICABLE');
});

test('D2-10 model observation without current provider admission is blocked', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp, undefined, { source_class: 'MODEL', provider_subject_ref: 'provider://reader-model/v1', provider_admission_ref: 'provider-admission://reader-model/v1' });
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
});

test('D2-11 current exact provider admission permits model evidence', () => {
  const exp = exposureFixture();
  const ref = 'provider://reader-model/v1';
  const admission = 'provider-admission://reader-model/v1';
  const c = observationCandidate(exp, undefined, { source_class: 'MODEL', provider_subject_ref: ref, provider_admission_ref: admission, evidence_refs: ['evidence://model/output/1'] });
  const o = accept(exp, c, { provider_admission_binding: providerBinding(ref, admission) });
  assert.equal(o.provider_subject_ref, ref);
});

test('D2-12 synthetic reader requires an opaque governed profile ref', () => {
  const exp = exposureFixture();
  const ref = 'provider://synthetic-reader/v1';
  const admission = 'provider-admission://synthetic-reader/v1';
  const c = observationCandidate(exp, undefined, { source_class: 'SYNTHETIC_READER', provider_subject_ref: ref, provider_admission_ref: admission });
  assert.throws(() => accept(exp, c, { provider_admission_binding: providerBinding(ref, admission) }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D2-13 calibrated human evidence requires explicit current HUMAN calibration evidence', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp, undefined, { source_class: 'HUMAN', standing: 'OBSERVED_CALIBRATED', reader_profile_ref: 'reader-profile://observed/anon-1', calibration_ref: 'calibration://human-reader/v1', evidence_refs: ['evidence://human/observation/1'] });
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_CALIBRATION_EVIDENCE_REQUIRED');
  const o = accept(exp, c, { calibration_binding: calibrationBinding('calibration://human-reader/v1', 'HUMAN') });
  assert.equal(o.standing, 'OBSERVED_CALIBRATED');
});

test('D2-14 model or synthetic evidence cannot use HUMAN calibration standing', () => {
  const exp = exposureFixture();
  const ref = 'provider://reader-model/v1';
  const admission = 'provider-admission://reader-model/v1';
  const c = observationCandidate(exp, undefined, { source_class: 'MODEL', standing: 'OBSERVED_CALIBRATED', provider_subject_ref: ref, provider_admission_ref: admission, calibration_ref: 'calibration://human-reader/v1', evidence_refs: ['evidence://model/output/calibrated'] });
  assert.throws(() => accept(exp, c, { provider_admission_binding: providerBinding(ref, admission), calibration_binding: calibrationBinding('calibration://human-reader/v1', 'HUMAN') }), e => e.code === 'BLOCKED_HUMAN_STANDING_SYNTHESIZED');
});

test('D2-15 provider claims on HUMAN source are rejected', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp, undefined, { source_class: 'HUMAN', reader_profile_ref: 'reader-profile://observed/anon-2', provider_subject_ref: 'provider://model', provider_admission_ref: 'provider-admission://model', evidence_refs: ['evidence://human/2'] });
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_HUMAN_STANDING_SYNTHESIZED');
});

test('D2-16 raw text and hidden reasoning payload shapes are forbidden', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp);
  c.raw_manuscript_text = 'forbidden';
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_RAW_TEXT_FORBIDDEN');
});

test('D2-17 universal score payloads are forbidden', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp);
  c.reader_score = 0.92;
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_UNIVERSAL_READER_SCORE_FORBIDDEN');
});

test('D2-18 demographic-essentialist payload shapes are forbidden', () => {
  const exp = exposureFixture();
  const c = observationCandidate(exp);
  c.demographic_segment = 'forbidden';
  assert.throws(() => accept(exp, c), e => e.code === 'BLOCKED_DEMOGRAPHIC_ESSENTIALISM_FORBIDDEN');
});

test('D2-19 canonical effects are forbidden', () => {
  const exp = exposureFixture();
  assert.throws(() => accept(exp, observationCandidate(exp, undefined, { canonical_effect: true })), e => e.code === 'BLOCKED_CANONICAL_EFFECT_FORBIDDEN');
});

test('D2-20 empty understanding projection exposes all 64 dimensions and 12 lenses as unobserved', () => {
  const exp = exposureFixture();
  const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: [] });
  assert.equal(p.dimension_dispositions.length, 64);
  assert.equal(p.lens_coverage.length, 12);
  assert.equal(p.dimension_dispositions.every(d => d.disposition === 'UNOBSERVED'), true);
  assert.equal(p.lens_coverage.every(l => l.disposition === 'UNOBSERVED'), true);
  assert.equal(p.standing, 'READY_FOR_OBSERVATION');
  assert.equal(p.canonical_effect, false);
});

test('D2-21 sparse observations produce PARTIALLY_OBSERVED without inventing missing evidence', () => {
  const exp = exposureFixture();
  const observed = accept(exp, observationCandidate(exp));
  const abstained = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, { standing: 'ABSTAINED', evidence_refs: [], confidence: null }));
  const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: [observed, abstained] });
  assert.equal(p.dimension_dispositions[0].disposition, 'OBSERVED');
  assert.equal(p.dimension_dispositions[1].disposition, 'ABSTAINED');
  assert.equal(p.dimension_dispositions[2].disposition, 'UNOBSERVED');
  assert.equal(p.standing, 'PARTIALLY_OBSERVED');
});

test('D2-22 lens observations populate lens coverage without changing dimension completeness', () => {
  const exp = exposureFixture();
  const lens = accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'REVEAL_INFORMATION' }, { evidence_refs: ['evidence://lens/reveal'] }));
  const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: [lens] });
  assert.equal(p.lens_coverage[0].disposition, 'OBSERVED');
  assert.equal(p.dimension_dispositions.every(d => d.disposition === 'UNOBSERVED'), true);
  assert.equal(p.standing, 'PARTIALLY_OBSERVED');
});

test('D2-23 complete 64-dimension disposition without calibration yields OBSERVED_UNCALIBRATED', () => {
  const exp = exposureFixture();
  const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: fullDimensionObservations(exp) });
  assert.equal(p.dimension_dispositions.every(d => d.disposition === 'OBSERVED'), true);
  assert.equal(p.standing, 'OBSERVED_UNCALIBRATED');
});

test('D2-24 complete disposition with valid calibrated human evidence records calibration evidence standing only', () => {
  const exp = exposureFixture();
  const humanCandidate = observationCandidate(exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, { source_class: 'HUMAN', standing: 'OBSERVED_CALIBRATED', reader_profile_ref: 'reader-profile://observed/anon-3', calibration_ref: 'calibration://human-reader/v1', evidence_refs: ['evidence://human/calibrated/3'] });
  const human = accept(exp, humanCandidate, { calibration_binding: calibrationBinding('calibration://human-reader/v1', 'HUMAN') });
  const p = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: fullDimensionObservations(exp, human) });
  assert.equal(p.standing, 'OBSERVED_WITH_CALIBRATION_EVIDENCE');
  assert.deepEqual(p.calibration_refs, ['calibration://human-reader/v1']);
  assert.equal(p.external_calibration_fences.includes('HUMAN_READER_ALIGNMENT_REQUIRED'), true);
});

test('D2-25 duplicate observation IDs are rejected rather than double-counted', () => {
  const exp = exposureFixture();
  const o = accept(exp, observationCandidate(exp));
  assert.throws(() => understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: [o, o] }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D2-26 observation digest tampering fails closed', () => {
  const exp = exposureFixture();
  const o = accept(exp, observationCandidate(exp));
  o.confidence = 0.1;
  assert.throws(() => understanding.validateReaderObservationV1(o, exp), e => e.code === 'BLOCKED_DIGEST_MISMATCH');
});

test('D2-27 assembly is deterministic and content addressed', () => {
  const exp = exposureFixture();
  const observations = [accept(exp, observationCandidate(exp)), accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'RESONANCE_MEMORY' }, { evidence_refs: ['evidence://lens/resonance'] }))];
  const a = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations });
  const b = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations: [...observations].reverse() });
  assert.deepEqual(a, b);
  assert.equal(understanding.validateReaderUnderstandingProjectionV1(a), true);
  assert.match(a.understanding_projection_id, /^book-reader-understanding-v1:[a-f0-9]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(a, 'score'), false);
});
