'use strict';
const assert = require('assert');
const kb = require('./book-story-bible-knowledge-v1');
let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function h(label) { return kb.sha256(label); }
function seal(candidate) {
  candidate.knowledge_digest = kb.knowledgeDigest(candidate);
  candidate.knowledge_candidate_id = kb.knowledgeCandidateId(candidate.knowledge_digest);
  return candidate;
}
function mutate(base, fn) { const c = clone(base); fn(c); return seal(c); }
const SA_ID = 'book-source-custody-v1:source-001';
const SA_DIGEST = h('source-acceptance-001');
const PROJ_ID = 'book-normalized-source-projection-v1:projection-001';
const PROJ_DIGEST = h('projection-001');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-001:v7';
const MANUSCRIPT_DIGEST = h('manuscript-v7');
const POLICY_DIGEST = h('calibration-policy-v1');
function common(status = 'ASSERTED', confidence = 0.91) {
  return {
    status,
    confidence,
    source_anchor_ids: ['ANCHOR:A1'],
    provenance_refs: ['evidence://provider/001'],
    evidence_refs: ['evidence://claim/001'],
    depends_on_refs: ['ANCHOR:A1']
  };
}
function baseCandidate() {
  const c = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: 'BOOK-PROJECT-001',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://provider/model-v1'],
    source_acceptance_refs: [{ source_acceptance_id: SA_ID, source_acceptance_digest: SA_DIGEST }],
    projection_refs: [{ projection_id: PROJ_ID, projection_digest: PROJ_DIGEST, source_acceptance_id: SA_ID }],
    manuscript_refs: [{ manuscript_ref: MANUSCRIPT_REF, manuscript_digest: MANUSCRIPT_DIGEST }],
    calibration_policy_ref: 'policy://book-knowledge/v1',
    calibration_policy_digest: POLICY_DIGEST,
    anchors: [{
      anchor_id: 'ANCHOR:A1',
      source_acceptance_id: SA_ID,
      source_acceptance_digest: SA_DIGEST,
      projection_id: PROJ_ID,
      projection_digest: PROJ_DIGEST,
      manuscript_ref: MANUSCRIPT_REF,
      unit_ref: 'CHAPTER:CH-001:v1',
      ordinal: 1,
      span_start: 10,
      span_end: 24,
      span_sha256: h('normalized-span-a1'),
      source_current: true,
      provenance_refs: ['evidence://anchor/a1']
    }],
    entities: [
      { entity_id: 'ENTITY:ALICE', entity_type: 'CHARACTER', aliases: ['Alice'], state_assertion_ids: ['STATE:ALICE_GOAL'], ...common() },
      { entity_id: 'ENTITY:BOB', entity_type: 'CHARACTER', aliases: ['Bob'], state_assertion_ids: [], ...common() },
      { entity_id: 'ENTITY:SECRET', entity_type: 'ABSTRACT', aliases: ['The secret'], state_assertion_ids: [], ...common() }
    ],
    events: [
      { event_id: 'EVENT:E1', event_family_id: 'EVENT_FAMILY:F1', participant_entity_ids: ['ENTITY:ALICE'], state_change_ids: ['STATE:ALICE_GOAL'], goal_relation_ids: ['CAUSAL:C1'], ...common() },
      { event_id: 'EVENT:E2', event_family_id: 'EVENT_FAMILY:F1', participant_entity_ids: ['ENTITY:ALICE', 'ENTITY:BOB'], state_change_ids: ['STATE:RELATIONSHIP'], goal_relation_ids: [], ...common() }
    ],
    temporal_claims: [
      {
        temporal_claim_id: 'TEMPORAL:T1', relation_type: 'STORY_TIME_BEFORE', subject_ref: 'EVENT:E1', object_ref: 'EVENT:E2',
        duration: { value: 2, unit: 'DAY', lower_bound: null, upper_bound: null, precision: 'EXACT' },
        frequency: { count: 1, recurrence_class: 'ONCE', lower_bound: 1, upper_bound: 1 }, ...common()
      },
      {
        temporal_claim_id: 'TEMPORAL:T2', relation_type: 'SAME_STORY_EVENT', subject_ref: 'EVENT:E1', object_ref: 'EVENT:E2',
        duration: null, frequency: { count: 2, recurrence_class: 'REPEATED', lower_bound: 2, upper_bound: 2 }, ...common('ALTERNATIVE', 0.55)
      }
    ],
    causal_goal_claims: [{
      causal_goal_claim_id: 'CAUSAL:C1', relation_type: 'GOAL_SUPPORTS', subject_ref: 'EVENT:E1', object_ref: 'EVENT:E2', ...common()
    }],
    state_assertions: [
      {
        state_assertion_id: 'STATE:ALICE_GOAL', subject_ref: 'ENTITY:ALICE', predicate: 'goal_state', value: 'ACTIVE',
        valid_from_event_ref: 'EVENT:E1', valid_to_event_ref: null, change_event_refs: ['EVENT:E1'], ...common()
      },
      {
        state_assertion_id: 'STATE:RELATIONSHIP', subject_ref: 'RELATIONSHIP:R1', predicate: 'trust_state', value: 'STRAINED',
        valid_from_event_ref: 'EVENT:E2', valid_to_event_ref: null, change_event_refs: ['EVENT:E2'], ...common()
      }
    ],
    character_knowledge_claims: [
      { knowledge_claim_id: 'KNOWLEDGE:K1', claim_type: 'KNOWS', character_entity_id: 'ENTITY:ALICE', object_ref: 'ENTITY:SECRET', exposure_event_refs: ['EVENT:E1'], temporal_compatibility: 'COMPATIBLE', ...common() },
      { knowledge_claim_id: 'KNOWLEDGE:K2', claim_type: 'BELIEVES', character_entity_id: 'ENTITY:ALICE', object_ref: 'ENTITY:SECRET', exposure_event_refs: [], temporal_compatibility: 'UNKNOWN', ...common('UNRESOLVED', 0.61) },
      { knowledge_claim_id: 'KNOWLEDGE:K3', claim_type: 'PERCEIVES', character_entity_id: 'ENTITY:BOB', object_ref: 'EVENT:E2', exposure_event_refs: ['EVENT:E2'], temporal_compatibility: 'COMPATIBLE', ...common() }
    ],
    relationships: [{
      relationship_id: 'RELATIONSHIP:R1', participant_entity_ids: ['ENTITY:ALICE', 'ENTITY:BOB'], relationship_kind: 'ALLY',
      state_assertion_ids: ['STATE:RELATIONSHIP'], change_event_ids: ['EVENT:E2'], ...common()
    }],
    arcs: [{
      arc_id: 'ARC:A1', arc_type: 'CHARACTER', subject_refs: ['ENTITY:ALICE'],
      beats: [{ beat_id: 'beat-1', event_refs: ['EVENT:E1'], role: 'INTRODUCE', status: 'ASSERTED', confidence: 0.9, provenance_refs: ['evidence://beat/1'] }],
      status: 'ACTIVE', confidence: 0.9, source_anchor_ids: ['ANCHOR:A1'], provenance_refs: ['evidence://arc/1'], evidence_refs: ['evidence://arc-observation/1'], depends_on_refs: ['EVENT:E1']
    }],
    motifs: [{
      motif_id: 'MOTIF:M1', label: 'Key image', occurrence_event_ids: ['EVENT:E1'], occurrence_anchor_ids: ['ANCHOR:A1'], ...common()
    }],
    themes: [{
      theme_id: 'THEME:TH1', kind: 'THEME', label: 'Trust and disclosure', subject_refs: ['EVENT:E1', 'RELATIONSHIP:R1'], ...common('ALTERNATIVE', 0.67)
    }],
    promises: [{
      promise_id: 'PROMISE:P1', introduced_event_refs: ['EVENT:E1'], related_open_question_refs: ['OPEN_QUESTION:Q1'],
      related_setup_payoff_refs: ['SETUP_PAYOFF:SP1'], resolution_event_refs: [], status: 'OPEN', confidence: 0.78,
      source_anchor_ids: ['ANCHOR:A1'], provenance_refs: ['evidence://promise/1'], evidence_refs: ['evidence://promise-observation/1'], depends_on_refs: ['EVENT:E1']
    }],
    setup_payoffs: [{
      setup_payoff_id: 'SETUP_PAYOFF:SP1', setup_event_refs: ['EVENT:E1'], payoff_event_refs: [], status: 'OPEN', confidence: 0.8,
      source_anchor_ids: ['ANCHOR:A1'], provenance_refs: ['evidence://setup/1'], evidence_refs: ['evidence://setup-observation/1'], depends_on_refs: ['EVENT:E1']
    }],
    open_questions: [{
      open_question_id: 'OPEN_QUESTION:Q1', introduced_event_refs: ['EVENT:E1'], resolution_event_refs: [], reopened_event_refs: [], status: 'OPEN', confidence: 0.82,
      source_anchor_ids: ['ANCHOR:A1'], provenance_refs: ['evidence://question/1'], evidence_refs: ['evidence://question-observation/1'], depends_on_refs: ['EVENT:E1']
    }],
    identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL'
  };
  return seal(c);
}
const base = baseCandidate();
pass('K01', () => {
  assert(kb.validateStoryBibleKnowledgeV1(base, { expected_book_project_id: 'BOOK-PROJECT-001' }));
  const result = kb.checkStoryBibleKnowledgeIntegrityV1(base, { expected_book_project_id: 'BOOK-PROJECT-001' });
  assert.strictEqual(result.result, 'PASS');
  assert.strictEqual(result.canonical_effect, false);
});
pass('K02', () => {
  const c = mutate(base, x => { x.knowledge_schema_version = 'BOOK_STORY_BIBLE_KNOWLEDGE_V2'; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'KNOWLEDGE_SCHEMA_VERSION_MISMATCH');
});
pass('K03', () => {
  const c = clone(base); c.knowledge_digest = '0'.repeat(64);
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'KNOWLEDGE_DIGEST_MISMATCH');
});
pass('K04', () => {
  expectCode(() => kb.validateStoryBibleKnowledgeV1(base, { expected_book_project_id: 'BOOK-PROJECT-OTHER' }), 'FOREIGN_BOOK_PROJECT');
});
pass('K05', () => {
  const c = mutate(base, x => { x.entities[0].raw_manuscript_text = 'forbidden'; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'FORBIDDEN_KNOWLEDGE_FIELD');
});
pass('K06', () => {
  const c = mutate(base, x => { x.anchors[0].source_acceptance_id = 'book-source-custody-v1:other'; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'ANCHOR_SOURCE_ACCEPTANCE_MISMATCH');
});
pass('K07', () => {
  const c = mutate(base, x => { x.anchors[0].span_start = 30; x.anchors[0].span_end = 20; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'INVALID_ANCHOR_SPAN');
});
pass('K08', () => {
  const c = mutate(base, x => { x.anchors.push(clone(x.anchors[0])); });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'DUPLICATE_STABLE_ID');
});
pass('K09', () => {
  assert.strictEqual(base.entities[0].entity_type, 'CHARACTER');
  assert(kb.validateStoryBibleKnowledgeV1(base));
});
pass('K10', () => {
  const c = mutate(base, x => { const e = clone(x.entities[0]); e.aliases = ['Different referent']; x.entities.push(e); });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'DUPLICATE_STABLE_ID');
});
pass('K11', () => {
  assert.deepStrictEqual(base.events[1].participant_entity_ids, ['ENTITY:ALICE', 'ENTITY:BOB']);
  assert(kb.validateStoryBibleKnowledgeV1(base));
});
pass('K12', () => {
  const c = mutate(base, x => { x.events[0].participant_entity_ids.push('ENTITY:MISSING'); });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'UNRESOLVED_TYPED_REFERENCE');
});
pass('K13', () => {
  assert.strictEqual(base.events[0].event_family_id, base.events[1].event_family_id);
  assert(base.temporal_claims.some(x => x.relation_type === 'SAME_STORY_EVENT' && x.status === 'ALTERNATIVE'));
  assert(kb.validateStoryBibleKnowledgeV1(base));
});
pass('K14', () => {
  const c = mutate(base, x => {
    x.temporal_claims.push({
      temporal_claim_id: 'TEMPORAL:DISCOURSE1', relation_type: 'DISCOURSE_PRECEDES', subject_ref: 'EVENT:E2', object_ref: 'EVENT:E1',
      duration: null, frequency: null, ...common()
    });
  });
  assert(kb.validateStoryBibleKnowledgeV1(c));
});
pass('K15', () => {
  const bad = mutate(base, x => {
    x.temporal_claims.push({
      temporal_claim_id: 'TEMPORAL:BADREVERSE', relation_type: 'STORY_TIME_BEFORE', subject_ref: 'EVENT:E2', object_ref: 'EVENT:E1',
      duration: null, frequency: null, ...common()
    });
  });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(bad), 'CONTRADICTORY_ASSERTED_TEMPORAL_STATE');
  const allowed = mutate(base, x => {
    x.temporal_claims.push({
      temporal_claim_id: 'TEMPORAL:ALTREVERSE', relation_type: 'STORY_TIME_BEFORE', subject_ref: 'EVENT:E2', object_ref: 'EVENT:E1',
      duration: null, frequency: null, ...common('ALTERNATIVE', 0.4)
    });
  });
  assert(kb.validateStoryBibleKnowledgeV1(allowed));
});
pass('K16', () => {
  for (const duration of [
    { value: 3, unit: 'HOUR', lower_bound: null, upper_bound: null, precision: 'EXACT' },
    { value: 3, unit: 'HOUR', lower_bound: null, upper_bound: null, precision: 'APPROXIMATE' },
    { value: null, unit: 'HOUR', lower_bound: 2, upper_bound: 5, precision: 'RANGE' },
    { value: null, unit: null, lower_bound: null, upper_bound: null, precision: 'UNKNOWN' }
  ]) {
    const c = mutate(base, x => { x.temporal_claims[0].duration = duration; });
    assert(kb.validateStoryBibleKnowledgeV1(c));
  }
});
pass('K17', () => {
  for (const recurrence_class of ['ONCE', 'REPEATED', 'HABITUAL', 'ITERATIVE', 'UNKNOWN']) {
    const c = mutate(base, x => { x.temporal_claims[0].frequency = { count: recurrence_class === 'UNKNOWN' ? null : 1, recurrence_class, lower_bound: null, upper_bound: null }; });
    assert(kb.validateStoryBibleKnowledgeV1(c));
  }
});
pass('K18', () => {
  const c = mutate(base, x => { x.causal_goal_claims[0].object_ref = 'EVENT:MISSING'; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'UNRESOLVED_TYPED_REFERENCE');
});
pass('K19', () => {
  assert(kb.validateStoryBibleKnowledgeV1(base));
  const c = mutate(base, x => { x.state_assertions[0].change_event_refs = ['EVENT:MISSING']; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'UNRESOLVED_TYPED_REFERENCE');
});
pass('K20', () => {
  assert.deepStrictEqual(base.character_knowledge_claims.map(x => x.claim_type), ['KNOWS', 'BELIEVES', 'PERCEIVES']);
  const c = mutate(base, x => { x.character_knowledge_claims[0].claim_type = 'FOCALIZES'; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'INVALID_CHARACTER_KNOWLEDGE_TYPE');
});
pass('K21', () => {
  assert.strictEqual(base.relationships[0].participant_entity_ids.length, 2);
  assert(kb.validateStoryBibleKnowledgeV1(base));
});
pass('K22', () => {
  const c = mutate(base, x => { x.relationships[0].state_assertion_ids = ['STATE:MISSING']; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'UNRESOLVED_TYPED_REFERENCE');
});
pass('K23', () => {
  const c = mutate(base, x => { x.arcs[0].beats = []; });
  assert(kb.validateStoryBibleKnowledgeV1(c));
});
pass('K24', () => {
  assert.strictEqual(base.motifs[0].occurrence_event_ids[0], 'EVENT:E1');
  assert(kb.validateStoryBibleKnowledgeV1(base));
});
pass('K25', () => {
  assert(kb.validateStoryBibleKnowledgeV1(base));
  const c = mutate(base, x => { x.themes[0].author_intent_certainty = 0.99; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(c), 'FORBIDDEN_KNOWLEDGE_FIELD');
});
pass('K26', () => {
  const c = mutate(base, x => { x.promises[0].status = 'INTENTIONALLY_UNRESOLVED'; });
  assert(kb.validateStoryBibleKnowledgeV1(c));
});
pass('K27', () => {
  const c = mutate(base, x => { x.setup_payoffs[0].status = 'OPEN'; x.setup_payoffs[0].payoff_event_refs = []; });
  assert(kb.validateStoryBibleKnowledgeV1(c));
});
pass('K28', () => {
  const c = mutate(base, x => { x.open_questions[0].status = 'INTENTIONALLY_UNRESOLVED'; x.open_questions[0].reopened_event_refs = ['EVENT:E2']; });
  assert(kb.validateStoryBibleKnowledgeV1(c));
});
pass('K29', () => {
  for (const status of ['ALTERNATIVE', 'UNRESOLVED', 'CONTESTED']) {
    const c = mutate(base, x => { x.entities[0].status = status; });
    assert(kb.validateStoryBibleKnowledgeV1(c));
  }
});
pass('K30', () => {
  const missingProv = mutate(base, x => { x.entities[0].provenance_refs = []; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(missingProv), 'PROVENANCE_REQUIRED');
  const missingDeps = clone(base); delete missingDeps.entities[0].depends_on_refs; seal(missingDeps);
  expectCode(() => kb.validateStoryBibleKnowledgeV1(missingDeps), 'REQUIRED_FIELD_MISSING');
});
pass('K31', () => {
  const prior = baseCandidate();
  const successor = mutate(prior, x => { x.prior_story_bible_ref = 'STORY_BIBLE:SB1:v1'; x.entities[0].aliases = ['Alice', 'A.']; });
  assert(kb.validateStoryBibleKnowledgeV1(successor, { expected_book_project_id: 'BOOK-PROJECT-001', prior_knowledge: prior }));
  const split = clone(prior);
  split.prior_story_bible_ref = 'STORY_BIBLE:SB1:v1';
  split.entities = split.entities.filter(e => e.entity_id !== 'ENTITY:BOB');
  for (const id of ['ENTITY:BOB_A', 'ENTITY:BOB_B']) {
    split.entities.push({ entity_id: id, entity_type: 'CHARACTER', aliases: [id.endsWith('_A') ? 'Bob A' : 'Bob B'], state_assertion_ids: [], ...common() });
  }
  split.relationships[0].participant_entity_ids = ['ENTITY:ALICE', 'ENTITY:BOB_A'];
  split.events[1].participant_entity_ids = ['ENTITY:ALICE', 'ENTITY:BOB_A'];
  split.character_knowledge_claims[2].character_entity_id = 'ENTITY:BOB_A';
  split.identity_lineage = [{ lineage_id: 'lineage-bob-split', relation: 'SPLIT_FROM', from_ids: ['ENTITY:BOB'], to_ids: ['ENTITY:BOB_A', 'ENTITY:BOB_B'], provenance_refs: ['evidence://identity-correction/1'] }];
  seal(split);
  assert(kb.validateStoryBibleKnowledgeV1(split, { expected_book_project_id: 'BOOK-PROJECT-001', prior_knowledge: prior }));
});
pass('K32', () => {
  const cycle = mutate(base, x => {
    x.identity_lineage = [
      { lineage_id: 'l1', relation: 'SUPERSEDES', from_ids: ['ENTITY:ALICE'], to_ids: ['ENTITY:BOB'], provenance_refs: ['evidence://lineage/1'] },
      { lineage_id: 'l2', relation: 'SUPERSEDES', from_ids: ['ENTITY:BOB'], to_ids: ['ENTITY:ALICE'], provenance_refs: ['evidence://lineage/2'] }
    ];
  });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(cycle), 'IDENTITY_LINEAGE_CYCLE');
  const broken = mutate(base, x => { x.themes[0].subject_refs = ['EVENT:MISSING']; });
  expectCode(() => kb.validateStoryBibleKnowledgeV1(broken), 'UNRESOLVED_TYPED_REFERENCE');
});
assert.strictEqual(cases, 32);
console.log(JSON.stringify({
  result: 'PASS',
  denominator: 'K01-K32',
  cases,
  scope: 'B03-D1_SCHEMA_VALIDATOR_ONLY',
  materializer_implemented: false,
  invalidation_engine_implemented: false,
  canonical_admission_implemented: false,
  b01_registry_modified: false,
  model_accuracy_claimed: false,
  historical_pass_transferred: 0,
  canonical_effect: false
}));
