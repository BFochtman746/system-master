'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ContractVersioningError } = require('../src/contract-versioning');
const { ChangeImpactAnalyzer, ConsumerBindingRegistry, topologicalMigrationOrder } = require('../src/contract-consumers');

function fixture() {
  let n = 0;
  const id = (kind) => `${kind}:${++n}`;
  const bindings = new ConsumerBindingRegistry({ identityAllocator: id });
  const analyzer = new ChangeImpactAnalyzer({ identityAllocator: id, bindings });
  return { id, bindings, analyzer };
}

function exactEvidence({ axisStatus = 'COMPATIBLE', target = 'v2' } = {}) {
  return {
    diff: {
      complete: true,
      source_version_id: 'v1',
      target_version_id: target,
      source_canonical_digest: 'a'.repeat(64),
      target_canonical_digest: 'b'.repeat(64)
    },
    compatibility_assessment: {
      assessment_id: 'assessment:1',
      source_version_id: 'v1',
      target_version_id: target,
      status: axisStatus,
      axis_results: [{ axis: 'SCHEMA_WIRE', status: axisStatus, findings: [] }],
      findings: []
    }
  };
}

function registerConsumer(bindings, consumerId, options = {}) {
  return bindings.register({
    contract_family_id: 'family:1',
    consumer_id: consumerId,
    supported_version_constraint: options.supported_version_constraint || '>=1.0.0 <3.0.0',
    required_axes: options.required_axes || ['SCHEMA_WIRE'],
    capability_profile: { profile_id: `profile:${consumerId}`, profile_version: '1', capabilities: options.capabilities || ['READ'] },
    observed_version_id: options.observed_version_id || 'v1',
    support_horizon: {
      supported_target_version_ids: options.supported_target_version_ids || ['v2'],
      evidence_refs: options.support_horizon_evidence_refs || [`horizon:${consumerId}`]
    },
    migration_after_consumer_ids: options.migration_after_consumer_ids || [],
    migration_before_consumer_ids: options.migration_before_consumer_ids || [],
    evidence_refs: [`binding:${consumerId}`]
  });
}

test('consumer bindings are versioned exact records with required axes and capability profile', () => {
  const { bindings } = fixture();
  const first = registerConsumer(bindings, 'consumer:A');
  const second = bindings.register({
    contract_family_id: 'family:1', consumer_id: 'consumer:A', expected_revision: 1,
    supported_version_constraint: '>=2.0.0 <4.0.0', required_axes: ['SCHEMA_WIRE'],
    capability_profile: { profile_id: 'profile:consumer:A', profile_version: '2', capabilities: ['READ', 'WRITE'] },
    observed_version_id: 'v2', support_horizon: { supported_target_version_ids: ['v2'], evidence_refs: ['horizon:A:2'] }
  });
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal(second.prior_binding_id, first.consumer_binding_id);
  assert.equal(bindings.listCurrent('family:1').length, 1);
});

test('consumer binding update rejects stale revision instead of last-write-wins', () => {
  const { bindings } = fixture();
  registerConsumer(bindings, 'consumer:A');
  assert.throws(() => bindings.register({
    contract_family_id: 'family:1', consumer_id: 'consumer:A', expected_revision: 0,
    supported_version_constraint: '*', required_axes: ['SCHEMA_WIRE'],
    capability_profile: { profile_id: 'p', profile_version: '2' }
  }), (error) => error instanceof ContractVersioningError && error.code === 'STALE_DRAFT_BASE');
});

test('inventory defaults UNKNOWN and COMPLETE requires evidence rather than being inferred from known count', () => {
  const { bindings } = fixture();
  registerConsumer(bindings, 'consumer:A');
  assert.equal(bindings.getInventoryStanding('family:1').standing, 'UNKNOWN');
  assert.throws(() => bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'COMPLETE' }), (error) => error.code === 'CONSUMER_INVENTORY_INCOMPLETE');
  const standing = bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'COMPLETE', evidence_refs: ['inventory:census:1'] });
  assert.equal(standing.standing, 'COMPLETE');
});

test('incomplete inventory prohibits ALL_CONSUMERS_SAFE even when every known consumer is safe', () => {
  const { bindings, analyzer } = fixture();
  registerConsumer(bindings, 'consumer:A');
  bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'INCOMPLETE', evidence_refs: ['inventory:partial'] });
  const impact = analyzer.listAffectedConsumers({ contract_family_id: 'family:1', source_version_id: 'v1', target_version_id: 'v2', ...exactEvidence() });
  assert.equal(impact.all_known_consumers_safe, true);
  assert.equal(impact.all_consumers_safe, false);
  assert.equal(impact.claim_standing, 'CONSUMER_INVENTORY_INCOMPLETE');
});

test('complete evidenced inventory plus safe exact compatibility permits ALL_CONSUMERS_SAFE', () => {
  const { bindings, analyzer } = fixture();
  registerConsumer(bindings, 'consumer:A');
  registerConsumer(bindings, 'consumer:B');
  bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'COMPLETE', evidence_refs: ['inventory:census:1'] });
  const impact = analyzer.listAffectedConsumers({ contract_family_id: 'family:1', source_version_id: 'v1', target_version_id: 'v2', ...exactEvidence() });
  assert.equal(impact.all_consumers_safe, true);
  assert.equal(impact.claim_standing, 'ALL_CONSUMERS_SAFE');
});

test('required UNKNOWN compatibility axis produces UNKNOWN consumer standing, not safe', () => {
  const { bindings, analyzer } = fixture();
  registerConsumer(bindings, 'consumer:A');
  bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'COMPLETE', evidence_refs: ['inventory:census:1'] });
  const impact = analyzer.listAffectedConsumers({ contract_family_id: 'family:1', source_version_id: 'v1', target_version_id: 'v2', ...exactEvidence({ axisStatus: 'UNKNOWN' }) });
  assert.equal(impact.known_consumers[0].standing, 'UNKNOWN');
  assert.equal(impact.all_consumers_safe, false);
});

test('support horizon can make a consumer affected even when structural compatibility is clean', () => {
  const { bindings, analyzer } = fixture();
  registerConsumer(bindings, 'consumer:A', { supported_target_version_ids: ['v1'] });
  bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'COMPLETE', evidence_refs: ['inventory:census:1'] });
  const impact = analyzer.listAffectedConsumers({ contract_family_id: 'family:1', source_version_id: 'v1', target_version_id: 'v2', ...exactEvidence() });
  assert.equal(impact.known_consumers[0].target_supported_by_horizon, false);
  assert.equal(impact.known_consumers[0].standing, 'AFFECTED');
});

test('migration order respects explicit before/after consumer constraints', () => {
  const { bindings, analyzer } = fixture();
  registerConsumer(bindings, 'consumer:A', { migration_before_consumer_ids: ['consumer:B'] });
  registerConsumer(bindings, 'consumer:B', { migration_after_consumer_ids: ['consumer:A'] });
  registerConsumer(bindings, 'consumer:C', { migration_after_consumer_ids: ['consumer:B'] });
  bindings.setInventoryStanding({ contract_family_id: 'family:1', standing: 'COMPLETE', evidence_refs: ['inventory:census:1'] });
  const impact = analyzer.listAffectedConsumers({ contract_family_id: 'family:1', source_version_id: 'v1', target_version_id: 'v2', ...exactEvidence() });
  assert.deepEqual(impact.migration_order, ['consumer:A', 'consumer:B', 'consumer:C']);
});

test('migration-order cycle is explicit and blocks impact completion', () => {
  const { bindings } = fixture();
  const a = registerConsumer(bindings, 'consumer:A', { migration_after_consumer_ids: ['consumer:B'] });
  const b = registerConsumer(bindings, 'consumer:B', { migration_after_consumer_ids: ['consumer:A'] });
  assert.throws(() => topologicalMigrationOrder([a, b]), (error) => error.code === 'MIGRATION_ORDER_CYCLE');
});

test('impact analysis rejects mismatched exact diff or compatibility subjects', () => {
  const { bindings, analyzer } = fixture();
  registerConsumer(bindings, 'consumer:A');
  const evidence = exactEvidence();
  evidence.diff.target_version_id = 'other';
  assert.throws(() => analyzer.listAffectedConsumers({ contract_family_id: 'family:1', source_version_id: 'v1', target_version_id: 'v2', ...evidence }), (error) => error.code === 'DIFF_INCOMPLETE');
});
