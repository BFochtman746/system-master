'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { IdentityError } = require('../src/identity');
const { IdentityExchangeCompatibilityPort, IdentityMigrationService } = require('../src/identity-migration');

const IDS = [
  '018bcfe5-6800-7000-8000-000000000101',
  '018bcfe5-6800-7000-8000-000000000102',
  '018bcfe5-6800-7000-8000-000000000103',
  '018bcfe5-6800-7000-8000-000000000104'
];

function allocator() {
  let index = 0;
  return {
    allocateCandidate({ entity_kind }) {
      const entity_id = IDS[index++];
      if (!entity_id) throw new Error('fixture exhausted');
      return { entity_id, entity_kind, scheme_profile_id: 'uuidv7-internal-v1', persistence_standing: 'UNPROBED_NOT_COMMITTED' };
    }
  };
}

function compatibility({ version = '1.0.0', reject = false, unknown = [] } = {}) {
  return new IdentityExchangeCompatibilityPort({
    resolveContractVersion: () => ({ version, compatibility: 'COMPATIBLE' }),
    validateEnvelope: (envelope) => reject || envelope.contract_version !== version
      ? { compatible: false, reason: 'SCHEMA_INCOMPATIBLE', unknown_required_fields: unknown }
      : { compatible: true }
  });
}

function service(options = {}) {
  return new IdentityMigrationService({ allocator: options.allocator || allocator(), compatibilityPort: options.compatibility || compatibility(), clock: () => Date.parse('2026-09-11T23:20:00.000Z'), max_batch_records: options.max_batch_records || 100 });
}

function records() {
  return [
    {
      legacy_key: 'project/path/alpha',
      entity_kind: 'PROJECT',
      provenance_ref: 'legacy:snapshot:1:alpha',
      aliases: [{ namespace_id: 'legacy-project-name', raw_value: 'Alpha', provenance_ref: 'legacy:name:alpha' }],
      locators: [{ locator_kind: 'PATH', raw_locator: '/legacy/alpha', context_scope: 'old-workspace', source_ref: 'legacy-fs' }],
      external_ids: [{ external_authority: 'GITHUB', external_namespace: 'repository-id', raw_value: '1360399247', data_classification: 'RESTRICTED', provenance_ref: 'github:repo:1360399247' }],
      references: [{ target_legacy_key: 'project/path/beta', reference_kind: 'DEPENDS_ON' }]
    },
    {
      legacy_key: 'project/path/beta',
      entity_kind: 'PROJECT',
      provenance_ref: 'legacy:snapshot:1:beta',
      aliases: [{ namespace_id: 'legacy-project-name', raw_value: 'Beta' }],
      locators: [{ locator_kind: 'PATH', raw_locator: '/legacy/beta', context_scope: 'old-workspace', source_ref: 'legacy-fs' }]
    }
  ];
}

test('brownfield planning allocates opaque canonical IDs and preserves legacy names/paths/keys as typed metadata', () => {
  const batch = service().planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: records() });
  assert.equal(batch.identities.length, 2);
  assert.equal(batch.identities[0].entity_id, IDS[0]);
  assert.notEqual(batch.identities[0].entity_id, 'project/path/alpha');
  assert.equal(batch.aliases.some((x) => x.raw_value === 'Alpha'), true);
  assert.equal(batch.locators.some((x) => x.raw_locator === '/legacy/alpha'), true);
  assert.equal(batch.crosswalk['project/path/alpha'], IDS[0]);
  assert.equal(batch.identities[0].provenance_ref, 'legacy:snapshot:1:alpha');
});

test('referential closure reaches READY_TO_CUTOVER only when every required legacy reference maps uniquely', () => {
  const migration = service();
  const batch = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: records() });
  assert.equal(batch.orphan_references.length, 0);
  assert.equal(batch.conflicts.length, 0);
  assert.equal(migration.validateForCutover({ batch, current_source_snapshot_ref: 'LEGACY:SNAP:1' }).standing, 'READY_TO_CUTOVER');
});

test('missing referenced legacy subject creates explicit orphan and blocks cutover', () => {
  const migration = service();
  const input = records();
  input.pop();
  const batch = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: input });
  assert.equal(batch.orphan_references[0].orphan_type, 'LEGACY_ORPHAN_REFERENCE');
  assert.throws(() => migration.validateForCutover({ batch, current_source_snapshot_ref: 'LEGACY:SNAP:1' }), (error) => error instanceof IdentityError && error.code === 'LEGACY_ORPHAN_REFERENCE');
});

test('duplicate legacy key creates AMBIGUOUS_MAPPING and never last-write-wins the crosswalk', () => {
  const migration = service();
  const input = records();
  input.push({ ...input[0], provenance_ref: 'different-source' });
  const batch = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: input });
  assert.equal(batch.conflicts.some((x) => x.conflict_type === 'AMBIGUOUS_MAPPING'), true);
  assert.equal(Object.keys(batch.crosswalk).filter((key) => key === 'project/path/alpha').length, 1);
  assert.throws(() => migration.validateForCutover({ batch, current_source_snapshot_ref: 'LEGACY:SNAP:1' }), (error) => error instanceof IdentityError && error.code === 'AMBIGUOUS_MAPPING');
});

test('external identifier without classification is preserved as conflict and cannot cross cutover gate', () => {
  const migration = service();
  const input = records();
  input[0].external_ids[0] = { external_authority: 'GITHUB', external_namespace: 'repository-id', raw_value: '1360399247', provenance_ref: 'github:repo' };
  const batch = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: input });
  assert.equal(batch.conflicts.some((x) => x.conflict_type === 'PRIVACY_CLASSIFICATION_MISSING'), true);
  assert.equal(batch.external_bindings.length, 0);
});

test('source snapshot drift invalidates validation and requires rebase before cutover', () => {
  const migration = service();
  const batch = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: records() });
  assert.throws(() => migration.validateForCutover({ batch, current_source_snapshot_ref: 'LEGACY:SNAP:2' }), (error) => error instanceof IdentityError && error.code === 'SOURCE_CHANGED_DURING_MIGRATION' && error.details.validation_standing === 'INVALIDATED_REBASE_REQUIRED');
});

test('rebase preserves already allocated canonical mappings for unchanged legacy keys', () => {
  const migration = service();
  const first = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: records() });
  const updated = records();
  updated[0].aliases.push({ namespace_id: 'legacy-project-name', raw_value: 'Alpha Renamed' });
  const rebased = migration.rebase({ prior_batch: first, new_source_snapshot_ref: 'LEGACY:SNAP:2', legacy_records: updated });
  assert.equal(rebased.rebased_from_batch_id, 'B1');
  assert.equal(rebased.source_snapshot_ref, 'LEGACY:SNAP:2');
  assert.equal(rebased.crosswalk['project/path/alpha'], first.crosswalk['project/path/alpha']);
  assert.equal(rebased.crosswalk['project/path/beta'], first.crosswalk['project/path/beta']);
  assert.equal(rebased.aliases.some((x) => x.raw_value === 'Alpha Renamed'), true);
});

test('cutover delegates durability to DurableIdentityCommandExecutor with exact source and plan digest', () => {
  const migration = service();
  const batch = migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'LEGACY:SNAP:1', legacy_records: records() });
  let captured;
  const durableExecutor = { execute: (request) => { captured = request; return { command_id: request.command_id, status: 'COMMITTED' }; } };
  const receipt = migration.commitCutover({ batch, current_source_snapshot_ref: 'LEGACY:SNAP:1', durableExecutor, actor_ref: 'USER:BF', expected_versions: {} });
  assert.equal(receipt.status, 'COMMITTED');
  assert.equal(captured.operation, 'COMMIT_IDENTITY_MIGRATION');
  assert.deepEqual(captured.subject_refs, ['LEGACY:SNAP:1']);
  assert.match(captured.command_id, /^IDENTITY-MIGRATION-CUTOVER:B1:/);
  const plan = captured.planMutation();
  assert.equal(plan.event_type, 'IDENTITY_MIGRATION_CUTOVER');
  assert.equal(plan.writes.some((x) => x.record_kind === 'LegacyIdentityCrosswalk'), true);
  assert.equal(plan.writes.some((x) => x.record_kind === 'ExternalIdentityBinding' && x.sensitive === true), true);
});

test('migration batch limit is explicit and never silently truncates imported subjects', () => {
  const migration = service({ max_batch_records: 1 });
  assert.throws(() => migration.planImport({ batch_id: 'B1', source_snapshot_ref: 'S1', legacy_records: records() }), (error) => error instanceof IdentityError && error.code === 'IMPORT_LIMIT' && error.details.count === 2);
});

test('versioned export/import round-trip preserves scheme namespace lineage external binding and provenance fields', () => {
  const migration = service();
  const original = {
    subject_snapshot_ref: 'IDENTITY:SNAP:1',
    scheme_profiles: [{ scheme_profile_id: 'uuidv7-internal-v1', version: 1 }],
    namespaces: [{ namespace_id: 'ns:user', policy_version: 2 }],
    identities: [{ entity_id: IDS[0], scheme_profile_id: 'uuidv7-internal-v1' }],
    aliases: [{ entity_id: IDS[0], namespace_id: 'ns:user', raw_value: 'Alpha', normalization_profile_version: 1 }],
    locators: [{ entity_id: IDS[0], locator_kind: 'PATH', raw_locator: '/legacy/alpha' }],
    external_bindings: [{ entity_id: IDS[0], external_authority: 'GITHUB', external_namespace: 'repository-id', raw_value: '1360399247', provenance_ref: 'github:repo' }],
    lineage_edges: [{ lineage_type: 'REPLACED_BY', from_entity_id: IDS[0], to_entity_id: IDS[1], decision_id: 'D1' }],
    provenance: [{ subject_ref: IDS[0], evidence_ref: 'E1' }]
  };
  const envelope = migration.exportSnapshot(original);
  assert.equal(envelope.contract_version, '1.0.0');
  const imported = migration.importEnvelope(envelope);
  assert.equal(imported.standing, 'VALIDATED_IMPORT_CANDIDATE');
  assert.equal(imported.authoritative, false);
  for (const field of ['scheme_profiles','namespaces','identities','aliases','locators','external_bindings','lineage_edges','provenance']) assert.deepEqual(imported.content[field], envelope[field]);
});

test('001O incompatibility or unknown required fields fails identity import/export instead of lossy flattening', () => {
  const migration = service({ compatibility: compatibility({ reject: true, unknown: ['new_required_identity_field'] }) });
  assert.throws(() => migration.exportSnapshot({ subject_snapshot_ref: 'S1' }), (error) => error instanceof IdentityError && error.code === 'INVALID_ID_PROFILE' && error.details.unknown_required_fields.includes('new_required_identity_field'));
});
