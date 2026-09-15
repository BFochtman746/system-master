'use strict';

const kb = require('./book-story-bible-knowledge-v1');
const registry = require('./book-reader-dimension-registry-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');
const invalidation = require('./book-knowledge-invalidation-v1');

const h = value => kb.sha256(value);
const clone = value => JSON.parse(JSON.stringify(value));
const SA_ID = 'book-source-custody-v1:source-b04e';
const SA_DIGEST = h('b04e-source-acceptance');
const PROJ_ID = 'book-normalized-source-projection-v1:b04e';
const PROJ_DIGEST = h('b04e-source-projection');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-B04E:v1';
const MANUSCRIPT_DIGEST = h('b04e-manuscript');

function anchor(id, ordinal, current = true) {
  return {
    anchor_id: id,
    source_acceptance_id: SA_ID,
    source_acceptance_digest: SA_DIGEST,
    projection_id: PROJ_ID,
    projection_digest: PROJ_DIGEST,
    manuscript_ref: MANUSCRIPT_REF,
    unit_ref: 'CHAPTER:B04E-CH-001:v1',
    ordinal,
    span_start: ordinal * 10,
    span_end: ordinal * 10 + 5,
    span_sha256: h(`b04e-span-${id}`),
    source_current: current,
    provenance_refs: [`evidence://b04e/anchor/${ordinal}`]
  };
}

function common(anchorId, depends = []) {
  return {
    status: 'ASSERTED',
    confidence: 0.9,
    source_anchor_ids: [anchorId],
    provenance_refs: [`evidence://b04e/record/${anchorId}`],
    evidence_refs: [],
    depends_on_refs: [...depends]
  };
}

function sealKnowledge(k) {
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  return k;
}

function knowledgeFixture(options = {}) {
  const a1 = anchor('ANCHOR:B04E-A1', 1, true);
  const a2 = anchor('ANCHOR:B04E-A2', 2, options.a2_current !== false);
  const a3 = anchor('ANCHOR:B04E-A3', 3, true);
  const entity = { entity_id: 'ENTITY:B04E-E1', entity_type: 'CHARACTER', aliases: ['Reader Target'], state_assertion_ids: [], ...common(a1.anchor_id) };
  const early = { event_id: 'EVENT:B04E-EARLY', event_family_id: null, participant_entity_ids: [entity.entity_id], state_change_ids: [], goal_relation_ids: [], ...common(a2.anchor_id) };
  const future = { event_id: 'EVENT:B04E-FUTURE', event_family_id: null, participant_entity_ids: [entity.entity_id], state_change_ids: [], goal_relation_ids: [], ...common(a3.anchor_id) };
  const dependentFuture = { event_id: 'EVENT:B04E-DEPENDENT-FUTURE', event_family_id: null, participant_entity_ids: [entity.entity_id], state_change_ids: [], goal_relation_ids: [], ...common(a2.anchor_id, [future.event_id]) };
  const k = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: 'BOOK-PROJECT-B04E',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://b04e-fixture'],
    source_acceptance_refs: [{ source_acceptance_id: SA_ID, source_acceptance_digest: SA_DIGEST }],
    projection_refs: [{ projection_id: PROJ_ID, projection_digest: PROJ_DIGEST, source_acceptance_id: SA_ID }],
    manuscript_refs: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST }],
    calibration_policy_ref: 'policy://book-knowledge/b04e',
    calibration_policy_digest: h('b04e-policy'),
    anchors: [a1, a2, a3],
    entities: [entity],
    events: [early, future, dependentFuture],
    temporal_claims: [], causal_goal_claims: [], state_assertions: [], character_knowledge_claims: [], relationships: [], arcs: [], motifs: [], themes: [], promises: [], setup_payoffs: [], open_questions: [], identity_lineage: [],
    standing: options.standing || 'MATERIALIZED_NOT_CANONICAL'
  };
  if (options.cycle) {
    k.events[1].depends_on_refs = [k.events[2].event_id];
    k.events[2].depends_on_refs = [k.events[1].event_id];
  }
  return sealKnowledge(k);
}

function storyBibleBinding(knowledge, options = {}) {
  return {
    story_bible_ref: options.story_bible_ref || 'STORY_BIBLE:BOOK-B04E:v1',
    story_bible_digest: options.story_bible_digest || h('b04e-story-bible'),
    knowledge_candidate_id: options.knowledge_candidate_id || knowledge.knowledge_candidate_id,
    knowledge_digest: options.knowledge_digest || knowledge.knowledge_digest,
    current: options.current !== false
  };
}

function exposureFixture(options = {}) {
  const knowledge = options.knowledge || knowledgeFixture(options);
  const frontierOrdinal = options.frontier_ordinal === undefined ? 2 : options.frontier_ordinal;
  const frontierAnchor = knowledge.anchors.find(a => a.ordinal === frontierOrdinal) || knowledge.anchors[1];
  const scopeKind = options.scope_kind || 'CHAPTER';
  const scope = {
    scope_kind: scopeKind,
    scope_ref: options.scope_ref || `${scopeKind}:B04E-${scopeKind}-001:v1`,
    scope_digest: options.scope_digest || h(`b04e-scope-${scopeKind}`)
  };
  const frontier = {
    frontier_anchor_id: options.frontier_anchor_id || frontierAnchor.anchor_id,
    frontier_ordinal: frontierOrdinal,
    frontier_anchor_digest: options.frontier_anchor_digest || exposure.anchorDigestV1(frontierAnchor)
  };
  const binding = storyBibleBinding(knowledge, options.story_bible_binding || {});
  const exp = exposure.buildReaderExposureProjectionV1({ knowledge, story_bible_binding: binding, scope, reveal_frontier: frontier });
  return { knowledge, exp, scope, frontier, story_bible_binding: binding };
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
    evidence_refs: ['evidence://b04e/default'],
    confidence: 0.8,
    calibration_ref: null,
    reveal_frontier: clone(exp.reveal_frontier),
    canonical_effect: false,
    ...overrides
  };
}

function providerBinding(ref = 'provider://reader-model/b04e', admission = 'provider-admission://reader-model/b04e') {
  return { provider_subject_ref: ref, provider_admission_ref: admission, provider_admission_digest: h(`${ref}|${admission}`), current: true };
}

function calibrationBinding(ref = 'calibration://human/b04e', calibrationClass = 'HUMAN') {
  return { calibration_ref: ref, calibration_digest: h(`${ref}|${calibrationClass}`), calibration_class: calibrationClass, current: true };
}

function accept(exp, candidate, extra = {}) {
  return understanding.acceptReaderObservationV1({ candidate, exposure_projection: exp, ...extra });
}

function fullDimensionObservations(exp, overridesByIndex = new Map()) {
  return registry.DIMENSIONS.map((d, index) => {
    const overrides = overridesByIndex.get(index) || {};
    const c = observationCandidate(exp, { dimension_id: d.dimension_id, perspective_lens_id: null }, {
      evidence_refs: [`evidence://b04e/dimension/${d.dimension_id}`],
      ...overrides.candidate
    });
    return accept(exp, c, overrides.extra || {});
  });
}

function bindingsFrom(exp, observations) {
  const providers = new Map();
  const calibrations = new Map();
  for (const o of observations) {
    if (o.provider_subject_ref !== null) {
      providers.set(`${o.provider_subject_ref}|${o.provider_admission_ref}`, {
        provider_subject_ref: o.provider_subject_ref,
        provider_admission_ref: o.provider_admission_ref,
        provider_admission_digest: o.provider_admission_digest,
        current: true
      });
    }
    if (o.calibration_ref !== null) {
      calibrations.set(o.calibration_ref, {
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
    provider_admissions: [...providers.values()],
    calibrations: [...calibrations.values()]
  };
}

function understandingFixture(options = {}) {
  const base = exposureFixture(options);
  const exp = base.exp;
  const observations = [];
  if (options.include_dimension !== false) observations.push(accept(exp, observationCandidate(exp)));
  if (options.include_lens) observations.push(accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }, { evidence_refs: ['evidence://b04e/lens'] })));
  const projection = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations });
  return { ...base, observations, projection, current_bindings: bindingsFrom(exp, observations) };
}

function mixedEvidenceFixture() {
  const base = exposureFixture();
  const exp = base.exp;
  const provider = providerBinding();
  const calibration = calibrationBinding();
  const deterministic = accept(exp, observationCandidate(exp));
  const lens = accept(exp, observationCandidate(exp, { dimension_id: null, perspective_lens_id: 'PERSPECTIVE_FOCALIZATION' }, { evidence_refs: ['evidence://b04e/lens/focalization'] }));
  const model = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-002', perspective_lens_id: null }, {
    source_class: 'MODEL', provider_subject_ref: provider.provider_subject_ref, provider_admission_ref: provider.provider_admission_ref, evidence_refs: ['evidence://b04e/model']
  }), { provider_admission_binding: provider });
  const human = accept(exp, observationCandidate(exp, { dimension_id: 'PCE013-DIM-003', perspective_lens_id: null }, {
    source_class: 'HUMAN', standing: 'OBSERVED_CALIBRATED', reader_profile_ref: 'reader-profile://human/b04e', evidence_refs: ['evidence://b04e/human'], calibration_ref: calibration.calibration_ref
  }), { calibration_binding: calibration });
  const observations = [deterministic, lens, model, human];
  const projection = understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection: exp, observations });
  return { ...base, observations, projection, current_bindings: bindingsFrom(exp, observations), provider, calibration };
}

function b03ImpactFor(fixture) {
  const input = invalidation.sealInvalidationInputV1({
    invalidation_subject_ref: invalidation.INVALIDATION_SUBJECT_REF,
    book_project_id: fixture.knowledge.book_project_id,
    base_story_bible_ref: fixture.exp.story_bible_ref,
    base_story_bible_digest: fixture.exp.story_bible_digest,
    base_knowledge: fixture.knowledge,
    changed_identities: [{
      kind: 'ANCHOR',
      identity_ref: fixture.knowledge.anchors[0].anchor_id,
      prior_digest: fixture.knowledge.anchors[0].span_sha256,
      current_digest: h('b04e-anchor-changed'),
      current_identity_ref: fixture.knowledge.anchors[0].anchor_id
    }]
  });
  return invalidation.computeStoryBibleInvalidationImpactV1(input);
}

module.exports = {
  h, clone, anchor, common, sealKnowledge, knowledgeFixture, storyBibleBinding, exposureFixture,
  observationCandidate, providerBinding, calibrationBinding, accept, fullDimensionObservations,
  bindingsFrom, understandingFixture, mixedEvidenceFixture, b03ImpactFor
};