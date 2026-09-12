'use strict';

const assert = require('assert');
const kb = require('./book-story-bible-knowledge-v1');
const inv = require('./book-knowledge-invalidation-v1');

let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function h(v) { return kb.sha256(v); }
function common(anchor, status = 'ASSERTED', confidence = 0.9, deps = null) {
  return {
    status,
    confidence,
    source_anchor_ids: [anchor],
    provenance_refs: [`evidence://prov/${anchor}`],
    evidence_refs: [`evidence://obs/${anchor}`],
    depends_on_refs: deps || [anchor]
  };
}
function sealKnowledge(k) {
  k.knowledge_digest = kb.knowledgeDigest(k);
  k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest);
  return k;
}

const S1 = 'SOURCE:S1'; const S1D = h('source-1');
const S2 = 'SOURCE:S2'; const S2D = h('source-2');
const P1 = 'PROJECTION:P1'; const P1D = h('projection-1');
const P2 = 'PROJECTION:P2'; const P2D = h('projection-2');
const M1 = 'MANUSCRIPT:M1'; const M1D = h('manuscript-1');
const M2 = 'MANUSCRIPT:M2'; const M2D = h('manuscript-2');
const A1D = h('anchor-span-1'); const A2D = h('anchor-span-2');
const STORY_REF = 'STORY_BIBLE:BOOK-001:v3';
const STORY_DIGEST = h('story-bible-v3');

function baseKnowledge() {
  const k = {
    knowledge_schema_version: kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id: 'BOOK-PROJECT-001',
    knowledge_candidate_id: '',
    knowledge_digest: '',
    prior_story_bible_ref: null,
    source_subject_refs: ['subject://accepted/source-v1'],
    source_acceptance_refs: [
      { source_acceptance_id: S1, source_acceptance_digest: S1D },
      { source_acceptance_id: S2, source_acceptance_digest: S2D }
    ],
    projection_refs: [
      { projection_id: P1, projection_digest: P1D, source_acceptance_id: S1 },
      { projection_id: P2, projection_digest: P2D, source_acceptance_id: S2 }
    ],
    manuscript_refs: [
      { manuscript_ref: M1, manuscript_digest: M1D },
      { manuscript_ref: M2, manuscript_digest: M2D }
    ],
    calibration_policy_ref: 'policy://book-knowledge/v1',
    calibration_policy_digest: h('policy-v1'),
    anchors: [
      { anchor_id: 'ANCHOR:A1', source_acceptance_id: S1, source_acceptance_digest: S1D, projection_id: P1, projection_digest: P1D, manuscript_ref: M1, unit_ref: 'CHAPTER:C1', ordinal: 1, span_start: 1, span_end: 10, span_sha256: A1D, source_current: true, provenance_refs: ['evidence://anchor/a1'] },
      { anchor_id: 'ANCHOR:A2', source_acceptance_id: S2, source_acceptance_digest: S2D, projection_id: P2, projection_digest: P2D, manuscript_ref: M2, unit_ref: 'CHAPTER:C2', ordinal: 2, span_start: 20, span_end: 30, span_sha256: A2D, source_current: true, provenance_refs: ['evidence://anchor/a2'] }
    ],
    entities: [
      { entity_id: 'ENTITY:E1', entity_type: 'CHARACTER', aliases: ['One'], state_assertion_ids: [], ...common('ANCHOR:A1') },
      { entity_id: 'ENTITY:E2', entity_type: 'CHARACTER', aliases: ['Two'], state_assertion_ids: [], ...common('ANCHOR:A2', 'ALTERNATIVE', 0.65) }
    ],
    events: [
      { event_id: 'EVENT:EV1', event_family_id: null, participant_entity_ids: ['ENTITY:E1'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:A2', 'ASSERTED', 0.9, ['ENTITY:E1']) },
      { event_id: 'EVENT:EV2', event_family_id: null, participant_entity_ids: ['ENTITY:E1'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:A2', 'ASSERTED', 0.9, ['EVENT:EV1']) },
      { event_id: 'EVENT:EV3', event_family_id: null, participant_entity_ids: ['ENTITY:E2'], state_change_ids: [], goal_relation_ids: [], ...common('ANCHOR:A2', 'CONTESTED', 0.52, ['ENTITY:E2']) }
    ],
    temporal_claims: [],
    causal_goal_claims: [],
    state_assertions: [
      { state_assertion_id: 'STATE:S1', subject_ref: 'ENTITY:E1', predicate: 'state', value: 'ACTIVE', valid_from_event_ref: 'EVENT:EV1', valid_to_event_ref: null, change_event_refs: ['EVENT:EV1'], ...common('ANCHOR:A2', 'ASSERTED', 0.88, ['EVENT:EV1']) }
    ],
    character_knowledge_claims: [],
    relationships: [
      { relationship_id: 'RELATIONSHIP:R1', participant_entity_ids: ['ENTITY:E1', 'ENTITY:E2'], relationship_kind: 'ALLY', state_assertion_ids: ['STATE:S1'], change_event_ids: ['EVENT:EV1'], ...common('ANCHOR:A2', 'ASSERTED', 0.8, ['STATE:S1']) }
    ],
    arcs: [
      { arc_id: 'ARC:AR1', arc_type: 'CHARACTER', subject_refs: ['ENTITY:E1'], beats: [{ beat_id: 'beat-1', event_refs: ['EVENT:EV1'], role: 'DEVELOP', status: 'ASSERTED', confidence: 0.8, provenance_refs: ['evidence://beat/1'] }], status: 'ACTIVE', confidence: 0.82, source_anchor_ids: ['ANCHOR:A2'], provenance_refs: ['evidence://arc/1'], evidence_refs: ['evidence://arcobs/1'], depends_on_refs: ['EVENT:EV1'] }
    ],
    motifs: [
      { motif_id: 'MOTIF:M-AFFECTED', label: 'Affected motif', occurrence_event_ids: ['EVENT:EV1'], occurrence_anchor_ids: ['ANCHOR:A2'], ...common('ANCHOR:A2', 'ASSERTED', 0.7, ['EVENT:EV1']) },
      { motif_id: 'MOTIF:M-DECLARED-ONLY', label: 'Declared-only motif', occurrence_event_ids: ['EVENT:EV1'], occurrence_anchor_ids: ['ANCHOR:A2'], ...common('ANCHOR:A2', 'ASSERTED', 0.7, ['ANCHOR:A2']) },
      { motif_id: 'MOTIF:CYCLE', label: 'Cycle motif', occurrence_event_ids: [], occurrence_anchor_ids: ['ANCHOR:A2'], ...common('ANCHOR:A2', 'CONTESTED', 0.5, ['THEME:CYCLE']) }
    ],
    themes: [
      { theme_id: 'THEME:T-AFFECTED', kind: 'THEME', label: 'Affected theme', subject_refs: ['EVENT:EV1'], ...common('ANCHOR:A2', 'UNRESOLVED', 0.61, ['EVENT:EV1']) },
      { theme_id: 'THEME:T-DECLARED-ONLY', kind: 'IDEA', label: 'Declared-only theme', subject_refs: ['EVENT:EV1'], ...common('ANCHOR:A2', 'ALTERNATIVE', 0.55, ['ANCHOR:A2']) },
      { theme_id: 'THEME:CYCLE', kind: 'SUBTEXT', label: 'Cycle theme', subject_refs: [], ...common('ANCHOR:A2', 'UNRESOLVED', 0.44, ['MOTIF:CYCLE']) }
    ],
    promises: [
      { promise_id: 'PROMISE:P1', introduced_event_refs: ['EVENT:EV1'], related_open_question_refs: [], related_setup_payoff_refs: [], resolution_event_refs: [], status: 'OPEN', confidence: 0.72, source_anchor_ids: ['ANCHOR:A2'], provenance_refs: ['evidence://promise/1'], evidence_refs: ['evidence://promiseobs/1'], depends_on_refs: ['EVENT:EV1'] }
    ],
    setup_payoffs: [
      { setup_payoff_id: 'SETUP_PAYOFF:SP1', setup_event_refs: ['EVENT:EV1'], payoff_event_refs: [], status: 'OPEN', confidence: 0.73, source_anchor_ids: ['ANCHOR:A2'], provenance_refs: ['evidence://setup/1'], evidence_refs: ['evidence://setupobs/1'], depends_on_refs: ['EVENT:EV1'] }
    ],
    open_questions: [
      { open_question_id: 'OPEN_QUESTION:Q1', introduced_event_refs: ['EVENT:EV1'], resolution_event_refs: [], reopened_event_refs: [], status: 'OPEN', confidence: 0.74, source_anchor_ids: ['ANCHOR:A2'], provenance_refs: ['evidence://question/1'], evidence_refs: ['evidence://questionobs/1'], depends_on_refs: ['EVENT:EV1'] }
    ],
    identity_lineage: [],
    standing: 'MATERIALIZED_NOT_CANONICAL'
  };
  return sealKnowledge(k);
}

const base = baseKnowledge();
kb.validateStoryBibleKnowledgeV1(base, { expected_book_project_id: 'BOOK-PROJECT-001' });

function recordById(id) {
  const groups = [base.entities, base.events, base.temporal_claims, base.causal_goal_claims, base.state_assertions, base.character_knowledge_claims, base.relationships, base.arcs, base.motifs, base.themes, base.promises, base.setup_payoffs, base.open_questions];
  const idFields = ['entity_id', 'event_id', 'temporal_claim_id', 'causal_goal_claim_id', 'state_assertion_id', 'knowledge_claim_id', 'relationship_id', 'arc_id', 'motif_id', 'theme_id', 'promise_id', 'setup_payoff_id', 'open_question_id'];
  for (const group of groups) for (const record of group) for (const field of idFields) if (record[field] === id) return record;
  return null;
}
function priorDigest(kind, id) {
  if (kind === 'SOURCE_ACCEPTANCE') return base.source_acceptance_refs.find(x => x.source_acceptance_id === id).source_acceptance_digest;
  if (kind === 'PROJECTION') return base.projection_refs.find(x => x.projection_id === id).projection_digest;
  if (kind === 'MANUSCRIPT') return base.manuscript_refs.find(x => x.manuscript_ref === id).manuscript_digest;
  if (kind === 'ANCHOR') return base.anchors.find(x => x.anchor_id === id).span_sha256;
  return kb.sha256(recordById(id));
}
function change(kind, id, options = {}) {
  const prior = priorDigest(kind, id);
  return {
    kind,
    identity_ref: id,
    prior_digest: prior,
    current_digest: Object.prototype.hasOwnProperty.call(options, 'current_digest') ? options.current_digest : h(`changed:${kind}:${id}`),
    current_identity_ref: Object.prototype.hasOwnProperty.call(options, 'current_identity_ref') ? options.current_identity_ref : null
  };
}
function request(changes) {
  return inv.sealInvalidationInputV1({
    invalidation_operation_id: '',
    invalidation_operation_digest: '',
    invalidation_subject_ref: inv.INVALIDATION_SUBJECT_REF,
    book_project_id: 'BOOK-PROJECT-001',
    base_story_bible_ref: STORY_REF,
    base_story_bible_digest: STORY_DIGEST,
    base_knowledge: clone(base),
    changed_identities: changes
  });
}
function compute(changes) { return inv.computeStoryBibleInvalidationImpactV1(request(changes)); }
function successorRecord(result, id) {
  const k = result.successor.proposed_knowledge;
  const groups = [k.entities, k.events, k.temporal_claims, k.causal_goal_claims, k.state_assertions, k.character_knowledge_claims, k.relationships, k.arcs, k.motifs, k.themes, k.promises, k.setup_payoffs, k.open_questions];
  const idFields = ['entity_id', 'event_id', 'temporal_claim_id', 'causal_goal_claim_id', 'state_assertion_id', 'knowledge_claim_id', 'relationship_id', 'arc_id', 'motif_id', 'theme_id', 'promise_id', 'setup_payoff_id', 'open_question_id'];
  for (const group of groups) for (const r of group) for (const field of idFields) if (r[field] === id) return r;
  return null;
}

pass('I01', () => {
  const r = compute([change('ANCHOR', 'ANCHOR:A1')]);
  assert(r.impact.directly_affected_refs.includes('ENTITY:E1'));
  assert(r.successor.stale_anchor_refs.includes('ANCHOR:A1'));
});
pass('I02', () => {
  const r = compute([change('SOURCE_ACCEPTANCE', S1)]);
  assert(r.impact.reason_codes.includes('SOURCE_ACCEPTANCE_CHANGED'));
  assert(r.impact.directly_affected_refs.includes('ENTITY:E1'));
});
pass('I03', () => {
  const r = compute([change('PROJECTION', P1)]);
  assert(r.impact.reason_codes.includes('PROJECTION_CHANGED'));
  assert(r.impact.directly_affected_refs.includes('ENTITY:E1'));
});
pass('I04', () => {
  const r = compute([change('MANUSCRIPT', M1)]);
  assert(r.impact.reason_codes.includes('MANUSCRIPT_CHANGED'));
  assert(r.impact.directly_affected_refs.includes('ENTITY:E1'));
});
pass('I05', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  assert(r.impact.directly_affected_refs.includes('ENTITY:E1'));
  for (const id of ['EVENT:EV1', 'EVENT:EV2', 'STATE:S1', 'RELATIONSHIP:R1']) assert(r.impact.transitively_affected_refs.includes(id), id);
});
pass('I06', () => {
  const prior = priorDigest('AUTHORITY_INVALIDATION', 'MOTIF:CYCLE');
  const r1 = compute([change('AUTHORITY_INVALIDATION', 'MOTIF:CYCLE', { current_digest: prior })]);
  const r2 = compute([change('AUTHORITY_INVALIDATION', 'MOTIF:CYCLE', { current_digest: prior })]);
  assert.deepStrictEqual(r1.impact.cycle_refs, ['MOTIF:CYCLE', 'THEME:CYCLE']);
  assert.strictEqual(r1.impact.impact_digest, r2.impact.impact_digest);
});
pass('I07', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  for (const id of ['ENTITY:E2', 'EVENT:EV3', 'MOTIF:M-DECLARED-ONLY', 'THEME:T-DECLARED-ONLY']) assert(r.impact.unaffected_refs.includes(id), id);
});
pass('I08', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  for (const id of [...r.impact.directly_affected_refs, ...r.impact.transitively_affected_refs]) assert.strictEqual(successorRecord(r, id).status, 'INVALIDATED', id);
});
pass('I09', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  assert.strictEqual(successorRecord(r, 'RELATIONSHIP:R1').status, 'INVALIDATED');
});
pass('I10', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  assert.strictEqual(successorRecord(r, 'ARC:AR1').status, 'INVALIDATED');
});
pass('I11', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  for (const id of ['PROMISE:P1', 'SETUP_PAYOFF:SP1', 'OPEN_QUESTION:Q1']) assert.strictEqual(successorRecord(r, id).status, 'INVALIDATED');
});
pass('I12', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  assert.strictEqual(successorRecord(r, 'MOTIF:M-AFFECTED').status, 'INVALIDATED');
  assert.strictEqual(successorRecord(r, 'THEME:T-AFFECTED').status, 'INVALIDATED');
  assert.strictEqual(successorRecord(r, 'MOTIF:M-DECLARED-ONLY').status, 'ASSERTED');
  assert.strictEqual(successorRecord(r, 'THEME:T-DECLARED-ONLY').status, 'ALTERNATIVE');
});
pass('I13', () => {
  const snapshot = JSON.stringify(base);
  compute([change('SOURCE_ACCEPTANCE', S1)]);
  assert.strictEqual(JSON.stringify(base), snapshot);
});
pass('I14', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  for (const id of ['ENTITY:E2', 'EVENT:EV3', 'MOTIF:M-DECLARED-ONLY']) {
    assert(r.successor.preserved_record_refs.includes(id));
    assert(successorRecord(r, id), id);
  }
});
pass('I15', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  const affected = successorRecord(r, 'THEME:T-AFFECTED');
  assert.strictEqual(affected.status, 'INVALIDATED');
  assert.strictEqual(affected.invalidation.prior_status, 'UNRESOLVED');
  assert.strictEqual(successorRecord(r, 'THEME:T-DECLARED-ONLY').status, 'ALTERNATIVE');
  assert.strictEqual(successorRecord(r, 'EVENT:EV3').status, 'CONTESTED');
});
pass('I16', () => {
  const r = compute([change('SEMANTIC_IDENTITY', 'ENTITY:E1', { current_identity_ref: 'ENTITY:E1-NEW' })]);
  assert(inv.validateInvalidationImpactV1(r));
  const partition = [...r.impact.directly_affected_refs, ...r.impact.transitively_affected_refs, ...r.impact.unaffected_refs];
  const universe = [...base.entities, ...base.events, ...base.temporal_claims, ...base.causal_goal_claims, ...base.state_assertions, ...base.character_knowledge_claims, ...base.relationships, ...base.arcs, ...base.motifs, ...base.themes, ...base.promises, ...base.setup_payoffs, ...base.open_questions].length;
  assert.strictEqual(new Set(partition).size, universe);
  assert.strictEqual(r.impact.proposed_successor_candidate_ref, r.successor.successor_candidate_id);
  assert.strictEqual(r.canonical_effect, false);
  assert.strictEqual(r.historical_story_bible_mutated, false);
});

assert.strictEqual(cases, 16);
process.stdout.write(JSON.stringify({
  result: 'PASS',
  denominator: 'I01-I16',
  cases,
  invalidation_engine_implemented: true,
  successor_reconciliation_implemented: true,
  canonical_admission_implemented: false,
  b01_registry_modified: false,
  model_accuracy_claimed: false,
  historical_pass_transferred: 0,
  historical_story_bible_mutated: false,
  canonical_effect: false
}) + '\n');