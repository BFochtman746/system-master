'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const d3 = require('./book-reader-currentness-runtime-v1');
const hardened = require('./book-reader-query-runtime-v1');

const h = value => kb.sha256(value);
const clone = value => JSON.parse(JSON.stringify(value));

function makeFixture() {
  const anchor = {
    anchor_id: 'ANCHOR:D3-H-A1',
    source_acceptance_id: 'book-source-custody-v1:d3-h',
    source_acceptance_digest: h('d3-h-source'),
    projection_id: 'book-normalized-source-projection-v1:d3-h',
    projection_digest: h('d3-h-projection'),
    manuscript_ref: 'MANUSCRIPT:D3-H:v1',
    unit_ref: 'CHAPTER:D3-H-001:v1',
    ordinal: 1,
    span_start: 0,
    span_end: 5,
    span_sha256: h('d3-h-span'),
    source_current: true,
    provenance_refs: ['evidence://d3-h/anchor']
  };
  const knowledge = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: 'BOOK-PROJECT-D3-H',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://d3-h'],
    source_acceptance_refs: [{ source_acceptance_id: anchor.source_acceptance_id, source_acceptance_digest: anchor.source_acceptance_digest }],
    projection_refs: [{ projection_id: anchor.projection_id, projection_digest: anchor.projection_digest, source_acceptance_id: anchor.source_acceptance_id }],
    manuscript_refs: [{ manuscript_ref: anchor.manuscript_ref, manuscript_digest: h('d3-h-manuscript') }],
    calibration_policy_ref: 'policy://d3-h',
    calibration_policy_digest: h('d3-h-policy'),
    anchors: [anchor],
    entities: [{
      entity_id: 'ENTITY:D3-H-E1',
      entity_type: 'CHARACTER',
      aliases: ['Target'],
      state_assertion_ids: [],
      status: 'ASSERTED',
      confidence: 0.9,
      source_anchor_ids: [anchor.anchor_id],
      provenance_refs: ['evidence://d3-h/entity'],
      evidence_refs: [],
      depends_on_refs: []
    }],
    events: [], temporal_claims: [], causal_goal_claims: [], state_assertions: [], character_knowledge_claims: [], relationships: [], arcs: [], motifs: [], themes: [], promises: [], setup_payoffs: [], open_questions: [], identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL'
  };
  knowledge.knowledge_digest = kb.knowledgeDigest(knowledge);
  knowledge.knowledge_candidate_id = kb.knowledgeCandidateId(knowledge.knowledge_digest);

  const exp = exposure.buildReaderExposureProjectionV1({
    knowledge,
    story_bible_binding: {
      story_bible_ref: 'STORY_BIBLE:D3-H:v1',
      story_bible_digest: h('d3-h-story-bible'),
      knowledge_candidate_id: knowledge.knowledge_candidate_id,
      knowledge_digest: knowledge.knowledge_digest,
      current: true
    },
    scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:D3-H-001:v1', scope_digest: h('d3-h-scope') },
    reveal_frontier: { frontier_anchor_id: anchor.anchor_id, frontier_ordinal: 1, frontier_anchor_digest: exposure.anchorDigestV1(anchor) }
  });

  function candidate(target, evidenceRef) {
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
      evidence_refs: [evidenceRef],
      confidence: 0.8,
      calibration_ref: null,
      reveal_frontier: clone(exp.reveal_frontier),
      canonical_effect: false
    };
  }

  const dimension = understanding.acceptReaderObservationV1({
    candidate: candidate({ dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, 'evidence://d3-h/dimension'),
    exposure_projection: exp
  });
  const lens = understanding.acceptReaderObservationV1({
    candidate: candidate({ dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }, 'evidence://d3-h/lens'),
    exposure_projection: exp
  });
  const observations = [dimension, lens];
  const projection = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations });
  const current_bindings = {
    story_bible: { story_bible_ref: exp.story_bible_ref, story_bible_digest: exp.story_bible_digest, current: true },
    knowledge: { knowledge_candidate_id: exp.knowledge_candidate_id, knowledge_digest: exp.knowledge_digest, current: true },
    scope: { ...clone(exp.scope), current: true },
    reveal_frontier: { ...clone(exp.reveal_frontier), current: true },
    observations: observations.map(o => ({ observation_id: o.observation_id, observation_digest: o.observation_digest, current: true })),
    provider_admissions: [],
    calibrations: []
  };
  const currentness = d3.computeReaderUnderstandingInvalidationV1({ exposure_projection: exp, understanding_projection: projection, observations, current_bindings });
  return { exp, observations, projection, current_bindings, currentness };
}

test('D3-41 hardened dimension query rejects substituted evidence behind unchanged id/digest fields', () => {
  const f = makeFixture();
  const forged = clone(f.observations);
  forged[0].evidence_refs = ['evidence://forged'];
  assert.throws(() => hardened.getReaderDimensionEvidenceV1({
    exposure_projection: f.exp,
    understanding_projection: f.projection,
    observations: forged,
    currentness: f.currentness,
    dimension_id: 'PCE013-DIM-001'
  }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D3-42 hardened lens query rejects substituted standing behind unchanged id/digest fields', () => {
  const f = makeFixture();
  const forged = clone(f.observations);
  forged[1].standing = 'ABSTAINED';
  assert.throws(() => hardened.getReaderLensCoverageV1({
    exposure_projection: f.exp,
    understanding_projection: f.projection,
    observations: forged,
    currentness: f.currentness,
    perspective_lens_id: 'PERSPECTIVE_FOCALIZATION'
  }), e => e.code === 'BLOCKED_OBSERVATION_BINDING_MISMATCH');
});

test('D3-43 hardened query runtime preserves all locked reachability on exact sealed evidence', () => {
  const f = makeFixture();
  const runtime = hardened.createBookReaderQueryRuntimeV1({
    exposure_projection: f.exp,
    understanding_projection: f.projection,
    observations: f.observations,
    current_bindings: f.current_bindings
  });
  assert.equal(runtime.execute('GetReaderDimensionEvidenceV1', { dimension_id: 'PCE013-DIM-001' }).disposition, 'OBSERVED');
  assert.equal(runtime.execute('GetReaderLensCoverageV1', { perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }).disposition, 'OBSERVED');
  assert.equal(runtime.execute('GetReaderExposureProjectionV1').exposure_projection_id, f.exp.exposure_projection_id);
  assert.equal(runtime.execute('GetReaderUnderstandingProjectionV1').understanding_projection_id, f.projection.understanding_projection_id);
  assert.equal(runtime.execute('GetReaderUnderstandingCurrentnessV1').understanding_current, true);
  assert.equal(runtime.provider_registry_modified, false);
  assert.equal(runtime.canonical_effect, false);
});