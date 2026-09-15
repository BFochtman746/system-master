'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const invalidation = require('./book-reader-currentness-runtime-v1');
const knowledgeInvalidation = require('./book-knowledge-invalidation-v1');
const registry = require('./book-reader-dimension-registry-v1');

const h = value => kb.sha256(value);
const clone = value => JSON.parse(JSON.stringify(value));
const SA_ID = 'book-source-custody-v1:b04-e-source';
const SA_DIGEST = h('b04-e-source-acceptance');
const PROJ_ID = 'book-normalized-source-projection-v1:b04-e';
const PROJ_DIGEST = h('b04-e-source-projection');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-B04-E:v1';
const MANUSCRIPT_DIGEST = h('b04-e-manuscript');

function anchor(id, ordinal, overrides = {}) {
  return {
    anchor_id: id,
    source_acceptance_id: SA_ID,
    source_acceptance_digest: SA_DIGEST,
    projection_id: PROJ_ID,
    projection_digest: PROJ_DIGEST,
    manuscript_ref: MANUSCRIPT_REF,
    unit_ref: 'CHAPTER:B04-E-CH-001:v1',
    ordinal,
    span_start: ordinal * 10,
    span_end: ordinal * 10 + 5,
    span_sha256: h(`b04-e-span-${id}`),
    source_current: true,
    provenance_refs: [`evidence://b04-e/anchor/${ordinal}`],
    ...overrides
  };
}

function common(anchorId, overrides = {}) {
  return {
    status: 'ASSERTED',
    confidence: 0.9,
    source_anchor_ids: [anchorId],
    provenance_refs: [`evidence://b04-e/record/${anchorId}`],
    evidence_refs: [],
    depends_on_refs: [],
    ...overrides
  };
}

function sealKnowledge(k) {
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  return k;
}

function knowledgeFixture(overrides = {}) {
  const k = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: 'BOOK-PROJECT-B04-E',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://b04-e-fixture'],
    source_acceptance_refs: [{ source_acceptance_id: SA_ID, source_acceptance_digest: SA_DIGEST }],
    projection_refs: [{ projection_id: PROJ_ID, projection_digest: PROJ_DIGEST, source_acceptance_id: SA_ID }],
    manuscript_refs: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST }],
    calibration_policy_ref: 'policy://book-reader/b04-e',
    calibration_policy_digest: h('b04-e-policy'),
    anchors: [anchor('ANCHOR:B04-E-A1', 1), anchor('ANCHOR:B04-E-A2', 2), anchor('ANCHOR:B04-E-A3', 3)],
    entities: [{ entity_id: 'ENTITY:B04-E-E1', entity_type: 'CHARACTER', aliases: ['Reader Target'], state_assertion_ids: [], ...common('ANCHOR:B04-E-A1') }],
    events: [
      { event_id: 'EVENT:B04-E-EARLY', event_family_id: null, participant_entity_ids: ['ENTITY:B04-E-E1'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:B04-E-A2') },
      { event_id: 'EVENT:B04-E-FUTURE', event_family_id: null, participant_entity_ids: ['ENTITY:B04-E-E1'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:B04-E-A3') }
    ],
    temporal_claims: [],
    causal_goal_claims: [],
    state_assertions: [],
    character_knowledge_claims: [],
    relationships: [],
    arcs: [],
    motifs: [],
    themes: [],
    promises: [{
      promise_id: 'PROMISE:B04-E-P1',
      introduced_event_refs: ['EVENT:B04-E-EARLY'],
      related_open_question_refs: [],
      related_setup_payoff_refs: [],
      resolution_event_refs: ['EVENT:B04-E-FUTURE'],
      status: 'FULFILLED',
      confidence: 0.8,
      source_anchor_ids: ['ANCHOR:B04-E-A2'],
      provenance_refs: ['evidence://b04-e/promise/1'],
      evidence_refs: [],
      depends_on_refs: ['EVENT:B04-E-EARLY']
    }],
    setup_payoffs: [],
    open_questions: [],
    identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL',
    ...overrides
  };
  return sealKnowledge(k);
}

function exposureInput(knowledge = knowledgeFixture(), options = {}) {
  const frontierId = options.frontier_id || 'ANCHOR:B04-E-A2';
  const frontier = knowledge.anchors.find(a => a.anchor_id === frontierId);
  return {
    knowledge,
    story_bible_binding: {
      story_bible_ref: options.story_bible_ref || 'STORY_BIBLE:BOOK-B04-E:v1',
      story_bible_digest: options.story_bible_digest || h('b04-e-story-bible'),
      knowledge_candidate_id: knowledge.knowledge_candidate_id,
      knowledge_digest: knowledge.knowledge_digest,
      current: options.story_bible_current === undefined ? true : options.story_bible_current
    },
    scope: {
      scope_kind: options.scope_kind || 'CHAPTER',
      scope_ref: options.scope_ref || 'CHAPTER:B04-E-CH-001:v1',
      scope_digest: options.scope_digest || h(`b04-e-scope-${options.scope_kind || 'CHAPTER'}`)
    },
    reveal_frontier: {
      frontier_anchor_id: frontier.anchor_id,
      frontier_ordinal: frontier.ordinal,
      frontier_anchor_digest: exposure.anchorDigestV1(frontier)
    }
  };
}

function buildExposure(options = {}) {
  const knowledge = options.knowledge || knowledgeFixture();
  return {
    knowledge,
    exp: exposure.buildReaderExposureProjectionV1(exposureInput(knowledge, options))
  };
}

function observationCandidate(exp, target = { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, overrides = {}) {
  return {
    observation_schema_version: understanding.OBSERVATION_SCHEMA_VERSION,
    exposure_projection_id: exp.exposure_projection_id,
    exposure_projection_digest: exp.exposure_projection_digest,
    target: clone(target),
    source_class: 'DETERMINISTIC',
    standing: 'OBSERVED_UNCALIBRATED',
    provider_subject_ref: null,
    provider_admission_ref: null,
    reader_profile_ref: null,
    evidence_refs: ['evidence://b04-e/default'],
    confidence: 0.8,
    calibration_ref: null,
    reveal_frontier: clone(exp.reveal_frontier),
    canonical_effect: false,
    ...overrides
  };
}

function providerBinding(ref = 'provider://reader-model/b04-e', admission = 'provider-admission://reader-model/b04-e') {
  return {
    provider_subject_ref: ref,
    provider_admission_ref: admission,
    provider_admission_digest: h(`${ref}|${admission}`),
    current: true
  };
}

function calibrationBinding(ref = 'calibration://human/b04-e', calibrationClass = 'HUMAN') {
  return {
    calibration_ref: ref,
    calibration_digest: h(`${ref}|${calibrationClass}`),
    calibration_class: calibrationClass,
    current: true
  };
}

function accept(exp, candidate, extra = {}) {
  return understanding.acceptReaderObservationV1({ candidate, exposure_projection: exp, ...extra });
}

function fixture() {
  const base = buildExposure();
  const exp = base.exp;
  const deterministic = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-001', perspective_lens_id: null }, { evidence_refs: ['evidence://b04-e/dim/1'] }));
  const lens = accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }, { evidence_refs: ['evidence://b04-e/lens/1'] }));
  const provider = providerBinding();
  const model = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, {
    source_class: 'MODEL',
    provider_subject_ref: provider.provider_subject_ref,
    provider_admission_ref: provider.provider_admission_ref,
    evidence_refs: ['evidence://b04-e/model/1']
  }), { provider_admission_binding: provider });
  const calibration = calibrationBinding();
  const human = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-003', perspective_lens_id: null }, {
    source_class: 'HUMAN',
    standing: 'OBSERVED_CALIBRATED',
    reader_profile_ref: 'reader-profile://human/b04-e/1',
    evidence_refs: ['evidence://b04-e/human/1'],
    calibration_ref: calibration.calibration_ref
  }), { calibration_binding: calibration });
  const observations = [deterministic, lens, model, human];
  const projection = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations });
  const current_bindings = bindingsFrom(exp, observations);
  return { ...base, observations, projection, current_bindings, provider, calibration };
}

function fullDimensionObservations(exp, options = {}) {
  return registry.DIMENSIONS.map((dimension, index) => {
    if (index === 0 && options.first_observation) return options.first_observation;
    return accept(exp, observationCandidate(exp, { dimension_id: dimension.dimension_id, perspective_lens_id: null }, {
      standing: options.standing || 'OBSERVED_UNCALIBRATED',
      evidence_refs: [`evidence://b04-e/full/${dimension.dimension_id}`],
      confidence: 0.75
    }));
  });
}

function bindingsFrom(exp, observations) {
  const providers = new Map();
  const calibrations = new Map();
  for (const observation of observations) {
    if (observation.provider_subject_ref !== null) {
      const key = `${observation.provider_subject_ref}|${observation.provider_admission_ref}`;
      providers.set(key, {
        provider_subject_ref: observation.provider_subject_ref,
        provider_admission_ref: observation.provider_admission_ref,
        provider_admission_digest: observation.provider_admission_digest,
        current: true
      });
    }
    if (observation.calibration_ref !== null) {
      calibrations.set(observation.calibration_ref, {
        calibration_ref: observation.calibration_ref,
        calibration_digest: observation.calibration_digest,
        calibration_class: observation.calibration_class,
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
    provider_admissions: [...providers.values()],
    calibrations: [...calibrations.values()]
  };
}

function compute(f, currentBindings = f.current_bindings, extra = {}) {
  return invalidation.computeReaderUnderstandingInvalidationV1({
    exposure_projection: f.exp,
    understanding_projection: f.projection,
    observations: f.observations,
    current_bindings: currentBindings,
    ...extra
  });
}

function b03ImpactFor(f) {
  const input = knowledgeInvalidation.sealInvalidationInputV1({
    invalidation_subject_ref: knowledgeInvalidation.INVALIDATION_SUBJECT_REF,
    book_project_id: f.knowledge.book_project_id,
    base_story_bible_ref: f.exp.story_bible_ref,
    base_story_bible_digest: f.exp.story_bible_digest,
    base_knowledge: f.knowledge,
    changed_identities: [{
      kind: 'ANCHOR',
      identity_ref: f.knowledge.anchors[0].anchor_id,
      prior_digest: f.knowledge.anchors[0].span_sha256,
      current_digest: h('b04-e-anchor-changed'),
      current_identity_ref: f.knowledge.anchors[0].anchor_id
    }]
  });
  return knowledgeInvalidation.computeStoryBibleInvalidationImpactV1(input);
}

module.exports = {
  h,
  clone,
  knowledgeFixture,
  exposureInput,
  buildExposure,
  observationCandidate,
  providerBinding,
  calibrationBinding,
  accept,
  fixture,
  fullDimensionObservations,
  bindingsFrom,
  compute,
  b03ImpactFor
};
