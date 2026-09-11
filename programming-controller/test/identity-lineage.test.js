'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { IdentityError } = require('../src/identity');
const {
  IdentityAdjudicationService,
  IdentityCorrelationService,
  IdentityLifecycleRegistry,
  IdentityLineageGraph
} = require('../src/identity-lineage');

const A = '018bcfe5-6800-7000-8000-000000000001';
const B = '018bcfe5-6800-7000-8000-000000000002';
const C = '018bcfe5-6800-7000-8000-000000000003';
const D = '018bcfe5-6800-7000-8000-000000000004';

function registry(ids = [A, B, C, D]) {
  const identities = new IdentityLifecycleRegistry({ clock: () => Date.parse('2026-09-11T23:00:00.000Z') });
  for (const entity_id of ids) identities.register({ entity_id, entity_kind: 'PROJECT', scope: 'PROGRAMMING', owner_authority_ref: 'PROGRAMMING' });
  return identities;
}

function services({ allow = true } = {}) {
  const identities = registry();
  const correlations = new IdentityCorrelationService({ identityRegistry: identities, clock: () => Date.parse('2026-09-11T23:00:00.000Z') });
  const lineage = new IdentityLineageGraph({ identityRegistry: identities, clock: () => Date.parse('2026-09-11T23:00:00.000Z') });
  const adjudication = new IdentityAdjudicationService({
    identityRegistry: identities,
    correlationService: correlations,
    lineageGraph: lineage,
    clock: () => Date.parse('2026-09-11T23:00:00.000Z'),
    policyPort: {
      authorizeDecision: (request) => allow
        ? { allowed: true, decision_ref: `POLICY:${request.decision_id}` }
        : { allowed: false, reason: 'DOMAIN_OWNER_DENIED' }
    }
  });
  return { identities, correlations, lineage, adjudication };
}

test('correlation is evidence-bound candidate only and never canonical equivalence', () => {
  const { identities, correlations, lineage } = services();
  const candidate = correlations.propose({
    correlation_id: 'CORR-1',
    left_entity_id: A,
    right_entity_id: B,
    method: 'embedding-similarity',
    method_version: 'model-x@1',
    model_ref: 'MODEL:x@1',
    confidence: 0.999,
    evidence_refs: ['EVIDENCE:1']
  });
  assert.equal(candidate.standing, 'CANDIDATE_ONLY');
  assert.equal(candidate.authoritative_equivalence, false);
  assert.equal(candidate.confidence, 0.999);
  assert.equal(identities.get(A).lifecycle, 'ACTIVE');
  assert.equal(identities.get(B).lifecycle, 'ACTIVE');
  assert.deepEqual(lineage.getLineage(A), []);
});

test('owner policy denial blocks adjudication with no decision, lineage or lifecycle mutation', () => {
  const { identities, correlations, lineage, adjudication } = services({ allow: false });
  correlations.propose({ correlation_id: 'CORR-1', left_entity_id: A, right_entity_id: B, method: 'manual-observation', confidence: null, evidence_refs: ['E1'] });
  assert.throws(() => adjudication.adjudicate({
    decision_id: 'D1', decision_type: 'EQUIVALENT', owner_authority_ref: 'BOOK', actor_ref: 'USER', rationale: 'same real subject', evidence_refs: ['E1'], predecessor_entity_ids: [A, B], correlation_ids: ['CORR-1']
  }), (error) => error instanceof IdentityError && error.code === 'OWNER_REQUIRED');
  assert.equal(adjudication.decisions.size, 0);
  assert.deepEqual(lineage.getLineage(A), []);
  assert.equal(identities.get(A).lifecycle, 'ACTIVE');
  assert.equal(correlations.get('CORR-1').standing, 'CANDIDATE_ONLY');
});

test('authorized equivalence records decision/rationale/evidence without collapsing either canonical ID', () => {
  const { identities, correlations, lineage, adjudication } = services();
  correlations.propose({ correlation_id: 'CORR-1', left_entity_id: A, right_entity_id: B, method: 'exact-external-evidence', confidence: 1, evidence_refs: ['E1', 'E2'] });
  const outcome = adjudication.adjudicate({
    decision_id: 'D1', decision_type: 'EQUIVALENT', owner_authority_ref: 'PROGRAMMING', actor_ref: 'BFochtman746', rationale: 'owner confirms same subject for domain purposes', evidence_refs: ['E1', 'E2'], predecessor_entity_ids: [A, B], correlation_ids: ['CORR-1']
  });
  assert.equal(outcome.decision.owner_authority_ref, 'PROGRAMMING');
  assert.equal(outcome.decision.rationale, 'owner confirms same subject for domain purposes');
  assert.deepEqual(outcome.decision.evidence_refs, ['E1', 'E2']);
  assert.deepEqual(outcome.lineage_edges, []);
  assert.equal(identities.get(A).lifecycle, 'ACTIVE');
  assert.equal(identities.get(B).lifecycle, 'ACTIVE');
  assert.equal(correlations.get('CORR-1').standing, 'ADJUDICATED');
  assert.deepEqual(lineage.getLineage(A), []);
});

test('retirement preserves durable identity and permanently prevents canonical ID reassignment', () => {
  const identities = registry([A]);
  const retired = identities.retire(A);
  assert.equal(retired.entity_id, A);
  assert.equal(retired.lifecycle, 'RETIRED');
  assert.equal(identities.get(A).entity_id, A);
  assert.throws(() => identities.register({ entity_id: A, entity_kind: 'NEW_PROJECT', scope: 'PROGRAMMING', owner_authority_ref: 'PROGRAMMING' }), (error) => error instanceof IdentityError && error.code === 'IDENTITY_REASSIGNMENT_FORBIDDEN');
});

test('tombstoning preserves minimum identity record rather than deleting or recycling it', () => {
  const identities = registry([A]);
  const tombstone = identities.retire(A, { tombstone: true });
  assert.equal(tombstone.lifecycle, 'TOMBSTONED');
  assert.equal(tombstone.entity_id, A);
  assert.equal(tombstone.owner_authority_ref, 'PROGRAMMING');
  assert.equal(identities.list().length, 1);
});

test('replacement records decision-bound REPLACED_BY lineage and terminalizes predecessor only', () => {
  const { identities, lineage, adjudication } = services();
  const outcome = adjudication.adjudicate({
    decision_id: 'D-REPLACE', decision_type: 'REPLACE', owner_authority_ref: 'PROGRAMMING', actor_ref: 'USER', rationale: 'new canonical subject replaces legacy subject', evidence_refs: ['E1'], predecessor_entity_ids: [A], successor_entity_ids: [B]
  });
  assert.equal(outcome.lineage_edges.length, 1);
  assert.equal(outcome.lineage_edges[0].lineage_type, 'REPLACED_BY');
  assert.equal(outcome.lineage_edges[0].decision_id, 'D-REPLACE');
  assert.equal(identities.get(A).lifecycle, 'SUPERSEDED');
  assert.deepEqual(identities.get(A).successor_entity_ids, [B]);
  assert.equal(identities.get(B).lifecycle, 'ACTIVE');
});

test('merge preserves every predecessor ID and creates explicit MERGED_INTO edges to one successor', () => {
  const { identities, lineage, adjudication } = services();
  const outcome = adjudication.adjudicate({
    decision_id: 'D-MERGE', decision_type: 'MERGE', owner_authority_ref: 'PROGRAMMING', actor_ref: 'USER', rationale: 'owner-authorized merge', evidence_refs: ['E1'], predecessor_entity_ids: [A, B], successor_entity_ids: [C]
  });
  assert.equal(outcome.lineage_edges.length, 2);
  assert.equal(outcome.lineage_edges.every((edge) => edge.lineage_type === 'MERGED_INTO' && edge.to_entity_id === C), true);
  assert.equal(identities.get(A).entity_id, A);
  assert.equal(identities.get(B).entity_id, B);
  assert.equal(identities.get(A).lifecycle, 'SUPERSEDED');
  assert.equal(identities.get(B).lifecycle, 'SUPERSEDED');
  assert.equal(identities.get(C).lifecycle, 'ACTIVE');
  assert.equal(lineage.traceSuccessors(A).entity_ids.includes(C), true);
});

test('split preserves predecessor ID and creates one SPLIT_INTO edge per explicit successor', () => {
  const { identities, adjudication } = services();
  const outcome = adjudication.adjudicate({
    decision_id: 'D-SPLIT', decision_type: 'SPLIT', owner_authority_ref: 'PROGRAMMING', actor_ref: 'USER', rationale: 'subject separated into two independent subjects', evidence_refs: ['E1'], predecessor_entity_ids: [A], successor_entity_ids: [B, C]
  });
  assert.equal(outcome.lineage_edges.length, 2);
  assert.equal(outcome.lineage_edges.every((edge) => edge.lineage_type === 'SPLIT_INTO' && edge.from_entity_id === A), true);
  assert.deepEqual(identities.get(A).successor_entity_ids, [B, C]);
  assert.equal(identities.get(A).entity_id, A);
});

test('lineage graph forbids self edges', () => {
  const identities = registry([A]);
  const graph = new IdentityLineageGraph({ identityRegistry: identities });
  assert.throws(() => graph.addEdge({ lineage_type: 'SUPERSEDED_BY', from_entity_id: A, to_entity_id: A, decision_id: 'D1' }), (error) => error instanceof IdentityError && error.code === 'FORBIDDEN_LINEAGE');
});

test('successor lineage graph is acyclic and rejects a closing cycle before mutation', () => {
  const identities = registry([A, B, C]);
  const graph = new IdentityLineageGraph({ identityRegistry: identities });
  graph.addEdge({ lineage_type: 'SUPERSEDED_BY', from_entity_id: A, to_entity_id: B, decision_id: 'D1' });
  graph.addEdge({ lineage_type: 'REPLACED_BY', from_entity_id: B, to_entity_id: C, decision_id: 'D2' });
  assert.throws(() => graph.addEdge({ lineage_type: 'MERGED_INTO', from_entity_id: C, to_entity_id: A, decision_id: 'D3' }), (error) => error instanceof IdentityError && error.code === 'FORBIDDEN_LINEAGE');
  assert.equal(graph.getLineage(C).some((edge) => edge.to_entity_id === A), false);
});

test('derivation lineage remains non-terminal and distinct from successor replacement semantics', () => {
  const { identities, adjudication } = services();
  const outcome = adjudication.adjudicate({
    decision_id: 'D-DERIVE', decision_type: 'DERIVE', owner_authority_ref: 'PROGRAMMING', actor_ref: 'USER', rationale: 'derived representation remains a separate identity', evidence_refs: ['E1'], predecessor_entity_ids: [A], successor_entity_ids: [B]
  });
  assert.equal(outcome.lineage_edges[0].lineage_type, 'DERIVED_INTO');
  assert.equal(identities.get(A).lifecycle, 'ACTIVE');
  assert.equal(identities.get(B).lifecycle, 'ACTIVE');
});

test('invalid merge/split cardinality is rejected without last-write-wins collapse', () => {
  const { identities, adjudication } = services();
  assert.throws(() => adjudication.adjudicate({
    decision_id: 'D-BAD', decision_type: 'MERGE', owner_authority_ref: 'PROGRAMMING', actor_ref: 'USER', rationale: 'bad merge', evidence_refs: ['E1'], predecessor_entity_ids: [A], successor_entity_ids: [B, C]
  }), (error) => error instanceof IdentityError && error.code === 'INVALID_DECISION');
  assert.equal(adjudication.decisions.size, 0);
  assert.equal(identities.get(A).lifecycle, 'ACTIVE');
});

test('all 001N-04 semantic mutations remain explicit NOT_PERSISTED candidates for the later 001P/001R integration slice', () => {
  const { correlations, adjudication } = services();
  const correlation = correlations.propose({ correlation_id: 'CORR-1', left_entity_id: A, right_entity_id: B, method: 'manual', confidence: null, evidence_refs: ['E1'] });
  const outcome = adjudication.adjudicate({
    decision_id: 'D1', decision_type: 'EQUIVALENT', owner_authority_ref: 'PROGRAMMING', actor_ref: 'USER', rationale: 'semantic decision only', evidence_refs: ['E1'], predecessor_entity_ids: [A, B], correlation_ids: ['CORR-1']
  });
  assert.equal(correlation.persistence_standing, 'NOT_PERSISTED');
  assert.equal(outcome.decision.persistence_standing, 'NOT_PERSISTED');
  assert.equal(outcome.persistence_standing, 'NOT_PERSISTED');
});
