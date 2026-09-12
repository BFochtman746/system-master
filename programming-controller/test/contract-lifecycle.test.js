'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BreakingChangeGovernance,
  ContractHistoryGuard,
  DeprecationSunsetService,
  SupersessionGraph
} = require('../src/contract-lifecycle');
const { ContractVersioningError } = require('../src/contract-versioning');

function fixture() {
  let n = 0;
  const allocate = (kind) => `${kind}:${++n}`;
  const allow = () => ({ allowed: true });
  return {
    allocate,
    lifecycle: new DeprecationSunsetService({ identityAllocator: allocate, authorization: allow }),
    graph: new SupersessionGraph({ identityAllocator: allocate, authorization: allow }),
    breaking: new BreakingChangeGovernance({ identityAllocator: allocate, authorization: allow })
  };
}

test('deprecation is a first-class record and does not mutate the published version bytes', () => {
  const { lifecycle } = fixture();
  const dep = lifecycle.deprecate({
    contract_version_id: 'v1', affected_surface_ref: 'surface:cmd', announcement_at: '2026-09-01T00:00:00Z', effective_at: '2026-10-01T00:00:00Z',
    reason: 'replacement available', replacement_version_id: 'v2', migration_plan_id: 'plan:1', authority_ref: 'PROGRAMMING'
  });
  assert.equal(dep.state, 'DEPRECATED');
  assert.equal(dep.contract_version_id, 'v1');
  assert.equal(lifecycle.timeline('v1').deprecations.length, 1);
});

test('deprecation timeline rejects effective time before announcement', () => {
  const { lifecycle } = fixture();
  assert.throws(() => lifecycle.deprecate({
    contract_version_id: 'v1', affected_surface_ref: 'surface:cmd', announcement_at: '2026-10-01T00:00:00Z', effective_at: '2026-09-01T00:00:00Z', reason: 'bad', authority_ref: 'PROGRAMMING'
  }), (error) => error.code === 'INVALID_DEPRECATION_TIMELINE');
});

test('sunset is separate from deprecation and cannot precede deprecation effective time', () => {
  const { lifecycle } = fixture();
  const dep = lifecycle.deprecate({
    contract_version_id: 'v1', affected_surface_ref: 'surface:cmd', announcement_at: '2026-09-01T00:00:00Z', effective_at: '2026-10-01T00:00:00Z', reason: 'replace', authority_ref: 'PROGRAMMING'
  });
  assert.throws(() => lifecycle.scheduleSunset({
    deprecation_id: dep.deprecation_id, planned_unavailable_at: '2026-09-15T00:00:00Z', authority_ref: 'PROGRAMMING'
  }), (error) => error.code === 'SUNSET_PREMATURE');
  const sunset = lifecycle.scheduleSunset({
    deprecation_id: dep.deprecation_id, planned_unavailable_at: '2026-11-01T00:00:00Z', support_boundary_at: '2026-10-15T00:00:00Z', authority_ref: 'PROGRAMMING'
  });
  assert.equal(sunset.state, 'SUNSET_SCHEDULED');
  assert.notEqual(sunset.sunset_id, dep.deprecation_id);
});

test('time alone cannot authorize retirement when support policy is unmet', () => {
  const { lifecycle } = fixture();
  const dep = lifecycle.deprecate({
    contract_version_id: 'v1', affected_surface_ref: 'surface:cmd', announcement_at: '2026-09-01T00:00:00Z', effective_at: '2026-09-10T00:00:00Z', reason: 'replace', authority_ref: 'PROGRAMMING'
  });
  const sunset = lifecycle.scheduleSunset({ deprecation_id: dep.deprecation_id, planned_unavailable_at: '2026-09-20T00:00:00Z', authority_ref: 'PROGRAMMING' });
  assert.throws(() => lifecycle.evaluateRetirement({
    sunset_id: sunset.sunset_id, now: '2026-09-21T00:00:00Z', support_policy_met: false,
    impact_assessment: { inventory: { standing: 'COMPLETE' }, known_consumers: [] }
  }), (error) => error.code === 'SUNSET_PREMATURE');
});

test('incomplete consumer inventory blocks retirement without scoped override', () => {
  const { lifecycle } = fixture();
  const dep = lifecycle.deprecate({
    contract_version_id: 'v1', affected_surface_ref: 'surface:cmd', announcement_at: '2026-09-01T00:00:00Z', effective_at: '2026-09-10T00:00:00Z', reason: 'replace', authority_ref: 'PROGRAMMING'
  });
  const sunset = lifecycle.scheduleSunset({ deprecation_id: dep.deprecation_id, planned_unavailable_at: '2026-09-20T00:00:00Z', authority_ref: 'PROGRAMMING' });
  assert.throws(() => lifecycle.evaluateRetirement({
    sunset_id: sunset.sunset_id, now: '2026-09-21T00:00:00Z', support_policy_met: true,
    impact_assessment: { inventory: { standing: 'INCOMPLETE' }, known_consumers: [] }
  }), (error) => error.code === 'CONSUMER_INVENTORY_INCOMPLETE');
});

test('known affected consumers must be migrated or explicitly dispositioned before retirement', () => {
  const { lifecycle } = fixture();
  const dep = lifecycle.deprecate({
    contract_version_id: 'v1', affected_surface_ref: 'surface:cmd', announcement_at: '2026-09-01T00:00:00Z', effective_at: '2026-09-10T00:00:00Z', reason: 'replace', authority_ref: 'PROGRAMMING'
  });
  const sunset = lifecycle.scheduleSunset({ deprecation_id: dep.deprecation_id, planned_unavailable_at: '2026-09-20T00:00:00Z', authority_ref: 'PROGRAMMING' });
  const impact = { inventory: { standing: 'COMPLETE' }, known_consumers: [{ consumer_id: 'consumer:A', standing: 'AFFECTED' }] };
  assert.throws(() => lifecycle.evaluateRetirement({ sunset_id: sunset.sunset_id, now: '2026-09-21T00:00:00Z', support_policy_met: true, impact_assessment: impact }), (error) => error.code === 'SUNSET_PREMATURE');
  const retirement = lifecycle.evaluateRetirement({
    sunset_id: sunset.sunset_id, now: '2026-09-21T00:00:00Z', support_policy_met: true, impact_assessment: impact,
    consumer_dispositions: { 'consumer:A': 'MIGRATED' }
  });
  assert.equal(retirement.state, 'RETIRED');
});

test('supersession graph preserves history and rejects self edges/cycles', () => {
  const { graph } = fixture();
  const e1 = graph.supersede({ source_version_id: 'v1', target_version_id: 'v2', reason: 'replacement', authority_ref: 'PROGRAMMING' });
  const e2 = graph.supersede({ source_version_id: 'v2', target_version_id: 'v3', reason: 'replacement', authority_ref: 'PROGRAMMING' });
  assert.equal(graph.lineage('v2').incoming[0].supersession_edge_id, e1.supersession_edge_id);
  assert.equal(graph.lineage('v2').outgoing[0].supersession_edge_id, e2.supersession_edge_id);
  assert.throws(() => graph.supersede({ source_version_id: 'v3', target_version_id: 'v1', reason: 'cycle', authority_ref: 'PROGRAMMING' }), (error) => error.code === 'SUPERSESSION_CYCLE');
  assert.throws(() => graph.supersede({ source_version_id: 'v3', target_version_id: 'v3', reason: 'self', authority_ref: 'PROGRAMMING' }), (error) => error.code === 'SUPERSESSION_CYCLE');
});

test('incompatible successor requires explicit supersession/migration/authorized waiver path', () => {
  const { graph, breaking } = fixture();
  const assessment = { assessment_id: 'a1', source_version_id: 'v1', target_version_id: 'v2', status: 'INCOMPATIBLE' };
  assert.throws(() => breaking.requireBreakingDisposition({ compatibility_assessment: assessment, target_version_id: 'v2' }), (error) => error.code === 'BREAKING_CHANGE_UNWAIVED');
  const edge = graph.supersede({ source_version_id: 'v1', target_version_id: 'v2', reason: 'breaking successor', authority_ref: 'PROGRAMMING' });
  const disposition = breaking.requireBreakingDisposition({ compatibility_assessment: assessment, target_version_id: 'v2', supersession_edge: edge });
  assert.equal(disposition.allowed, true);
  assert.equal(disposition.standing, 'BREAKING_CHANGE_EXPLICITLY_DISPOSITIONED');
});

test('compatibility waiver is scoped and requires authorization', () => {
  let n = 0;
  const breaking = new BreakingChangeGovernance({
    identityAllocator: (kind) => `${kind}:${++n}`,
    authorization: ({ action }) => action === 'APPROVE_COMPATIBILITY_WAIVER' ? { allowed: false, reason: 'denied' } : { allowed: true }
  });
  assert.throws(() => breaking.createWaiver({ assessment_id: 'a1', source_version_id: 'v1', target_version_id: 'v2', scope: 'consumer:A', rationale: 'temporary', authority_ref: 'PROGRAMMING' }), (error) => error.code === 'UNAUTHORIZED_CONTRACT_CHANGE');
});

test('history guard fails explicitly when a supported historical version is unavailable', () => {
  const guard = new ContractHistoryGuard({ versionRegistry: { get: (id) => { if (id === 'v2') return { contract_version_id: 'v2' }; throw new Error('missing'); } } });
  assert.deepEqual(guard.requireVersions(['v2']), [{ contract_version_id: 'v2' }]);
  assert.throws(() => guard.requireVersions(['v1', 'v2']), (error) => error instanceof ContractVersioningError && error.code === 'HISTORY_GAP');
});
