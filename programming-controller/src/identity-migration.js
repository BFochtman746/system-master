'use strict';

const crypto = require('crypto');
const { IdentityError } = require('./identity');

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const req = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('INCOMPLETE_INPUT', `${field} must be a non-empty string`, { field });
  return value;
};
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

class IdentityExchangeCompatibilityPort {
  constructor({ resolveContractVersion, validateEnvelope } = {}) {
    if (typeof resolveContractVersion !== 'function' || typeof validateEnvelope !== 'function') {
      throw new IdentityError('CONTRACT_COMPATIBILITY_UNAVAILABLE', '001O identity exchange compatibility ports are required');
    }
    this.resolveFn = resolveContractVersion;
    this.validateFn = validateEnvelope;
  }

  resolve(contractId = 'programming.identity.exchange') {
    let result;
    try { result = this.resolveFn({ contract_id: contractId, consumer_authority_id: 'PROGRAMMING-FOUNDATION-001N' }); }
    catch (error) { throw new IdentityError('CONTRACT_COMPATIBILITY_UNAVAILABLE', '001O contract version resolution failed', { cause: error?.message || String(error) }); }
    if (!result || typeof result.version !== 'string' || !result.version) throw new IdentityError('CONTRACT_COMPATIBILITY_UNAVAILABLE', '001O returned no identity exchange version');
    return freeze(clone(result));
  }

  validate(envelope) {
    let result;
    try { result = this.validateFn(clone(envelope)); }
    catch (error) { throw new IdentityError('INVALID_ID_PROFILE', '001O identity envelope compatibility validation failed', { cause: error?.message || String(error) }); }
    if (!(result === true || result?.compatible === true)) {
      throw new IdentityError('INVALID_ID_PROFILE', 'Identity exchange envelope is incompatible', { reason: result?.reason || null, unknown_required_fields: clone(result?.unknown_required_fields || []) });
    }
    return freeze(result === true ? { compatible: true } : clone(result));
  }
}

class IdentityMigrationService {
  constructor({ allocator, compatibilityPort, clock = () => Date.now(), max_batch_records = 10000 } = {}) {
    if (!allocator || typeof allocator.allocateCandidate !== 'function') throw new IdentityError('INVALID_PORT', 'IdentityAllocator port required');
    this.allocator = allocator;
    this.compatibility = compatibilityPort instanceof IdentityExchangeCompatibilityPort ? compatibilityPort : new IdentityExchangeCompatibilityPort(compatibilityPort);
    this.clock = clock;
    if (!Number.isInteger(max_batch_records) || max_batch_records <= 0) throw new IdentityError('INVALID_CONFIGURATION', 'max_batch_records must be positive integer');
    this.maxBatchRecords = max_batch_records;
  }

  planImport({ batch_id, source_snapshot_ref, legacy_records, existing_crosswalk = {} }) {
    const batchId = req(batch_id, 'batch_id');
    const source = req(source_snapshot_ref, 'source_snapshot_ref');
    if (!Array.isArray(legacy_records)) throw new IdentityError('INCOMPLETE_INPUT', 'legacy_records must be array');
    if (legacy_records.length > this.maxBatchRecords) throw new IdentityError('IMPORT_LIMIT', 'migration batch exceeds admitted record count', { count: legacy_records.length, limit: this.maxBatchRecords });

    const conflicts = [];
    const orphans = [];
    const seenLegacy = new Map();
    const crosswalk = new Map();
    const identities = [];
    const aliases = [];
    const locators = [];
    const externalBindings = [];

    for (const record of legacy_records) {
      const legacyKey = req(record?.legacy_key, 'legacy_record.legacy_key');
      if (seenLegacy.has(legacyKey)) {
        conflicts.push(freeze({ conflict_type: 'AMBIGUOUS_MAPPING', legacy_key: legacyKey, record_indexes: [seenLegacy.get(legacyKey), legacy_records.indexOf(record)] }));
        continue;
      }
      seenLegacy.set(legacyKey, legacy_records.indexOf(record));
      const preserved = existing_crosswalk[legacyKey];
      const allocation = preserved
        ? { entity_id: req(preserved, 'existing_crosswalk.entity_id'), scheme_profile_id: 'PRESERVED_FROM_REBASE', persistence_standing: 'MIGRATION_REUSED_MAPPING' }
        : this.allocator.allocateCandidate({ entity_kind: req(record.entity_kind, 'legacy_record.entity_kind'), exposure_class: record.exposure_class || 'INTERNAL', command_id: `MIGRATION:${batchId}:${legacyKey}` });
      const entity = freeze({
        entity_id: allocation.entity_id,
        entity_kind: record.entity_kind,
        scope: record.scope || 'PROGRAMMING',
        scheme_profile_id: allocation.scheme_profile_id,
        legacy_key: legacyKey,
        provenance_ref: req(record.provenance_ref, 'legacy_record.provenance_ref'),
        source_snapshot_ref: source,
        persistence_standing: 'MIGRATION_CANDIDATE'
      });
      identities.push(entity);
      crosswalk.set(legacyKey, entity.entity_id);

      for (const alias of record.aliases || []) {
        aliases.push(freeze({ entity_id: entity.entity_id, namespace_id: req(alias.namespace_id, 'alias.namespace_id'), raw_value: req(alias.raw_value, 'alias.raw_value'), provenance_ref: alias.provenance_ref || entity.provenance_ref, data_classification: alias.data_classification || 'INTERNAL', persistence_standing: 'MIGRATION_CANDIDATE' }));
      }
      for (const locator of record.locators || []) {
        locators.push(freeze({ entity_id: entity.entity_id, locator_kind: req(locator.locator_kind, 'locator.locator_kind'), raw_locator: req(locator.raw_locator, 'locator.raw_locator'), context_scope: req(locator.context_scope, 'locator.context_scope'), source_ref: locator.source_ref || entity.provenance_ref, provenance_ref: locator.provenance_ref || entity.provenance_ref, persistence_standing: 'MIGRATION_CANDIDATE' }));
      }
      for (const external of record.external_ids || []) {
        if (!external.data_classification) {
          conflicts.push(freeze({ conflict_type: 'PRIVACY_CLASSIFICATION_MISSING', legacy_key: legacyKey, external_authority: external.external_authority || null, external_namespace: external.external_namespace || null }));
          continue;
        }
        externalBindings.push(freeze({ entity_id: entity.entity_id, external_authority: req(external.external_authority, 'external.external_authority'), external_namespace: req(external.external_namespace, 'external.external_namespace'), raw_value: req(external.raw_value, 'external.raw_value'), provenance_ref: external.provenance_ref || entity.provenance_ref, data_classification: external.data_classification, persistence_standing: 'MIGRATION_CANDIDATE' }));
      }
    }

    for (const record of legacy_records) {
      if (!record?.legacy_key || !crosswalk.has(record.legacy_key)) continue;
      for (const reference of record.references || []) {
        const target = req(reference.target_legacy_key, 'reference.target_legacy_key');
        if (!crosswalk.has(target)) orphans.push(freeze({ orphan_type: 'LEGACY_ORPHAN_REFERENCE', source_legacy_key: record.legacy_key, target_legacy_key: target, reference_kind: reference.reference_kind || 'UNSPECIFIED' }));
      }
    }

    const createdAt = new Date(this.clock()).toISOString();
    const batch = {
      batch_id: batchId,
      source_snapshot_ref: source,
      created_at: createdAt,
      crosswalk: Object.fromEntries([...crosswalk.entries()].sort(([a], [b]) => a.localeCompare(b))),
      identities: identities.sort((a, b) => a.legacy_key.localeCompare(b.legacy_key)),
      aliases,
      locators,
      external_bindings: externalBindings,
      conflicts: conflicts.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      orphan_references: orphans.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      standing: conflicts.length || orphans.length ? 'BLOCKED' : 'READY_TO_VALIDATE',
      persistence_standing: 'NOT_PERSISTED'
    };
    batch.plan_digest_sha256 = digest(batch);
    return freeze(batch);
  }

  validateForCutover({ batch, current_source_snapshot_ref }) {
    if (!batch || typeof batch !== 'object') throw new IdentityError('INCOMPLETE_INPUT', 'migration batch required');
    const current = req(current_source_snapshot_ref, 'current_source_snapshot_ref');
    if (current !== batch.source_snapshot_ref) {
      throw new IdentityError('SOURCE_CHANGED_DURING_MIGRATION', 'Legacy source changed after migration mapping/validation', { planned_source_snapshot_ref: batch.source_snapshot_ref, current_source_snapshot_ref: current, validation_standing: 'INVALIDATED_REBASE_REQUIRED' });
    }
    if ((batch.conflicts || []).length) throw new IdentityError('AMBIGUOUS_MAPPING', 'Migration has unresolved identity conflicts', { conflict_count: batch.conflicts.length });
    if ((batch.orphan_references || []).length) throw new IdentityError('LEGACY_ORPHAN_REFERENCE', 'Migration has unresolved required references', { orphan_count: batch.orphan_references.length });
    if (batch.identities.length !== Object.keys(batch.crosswalk || {}).length) throw new IdentityError('AMBIGUOUS_MAPPING', 'Migration crosswalk is not one-to-one with imported legacy records');
    return freeze({ batch_id: batch.batch_id, source_snapshot_ref: batch.source_snapshot_ref, plan_digest_sha256: batch.plan_digest_sha256, standing: 'READY_TO_CUTOVER', identity_count: batch.identities.length, alias_count: batch.aliases.length, locator_count: batch.locators.length, external_binding_count: batch.external_bindings.length });
  }

  rebase({ prior_batch, new_source_snapshot_ref, legacy_records }) {
    if (!prior_batch?.crosswalk) throw new IdentityError('INCOMPLETE_INPUT', 'prior migration batch/crosswalk required');
    const rebased = this.planImport({ batch_id: `${prior_batch.batch_id}:REBASE`, source_snapshot_ref: req(new_source_snapshot_ref, 'new_source_snapshot_ref'), legacy_records, existing_crosswalk: prior_batch.crosswalk });
    return freeze({ ...rebased, rebased_from_batch_id: prior_batch.batch_id, prior_source_snapshot_ref: prior_batch.source_snapshot_ref });
  }

  commitCutover({ batch, current_source_snapshot_ref, durableExecutor, actor_ref, expected_versions = {} }) {
    if (!durableExecutor || typeof durableExecutor.execute !== 'function') throw new IdentityError('INVALID_PORT', 'DurableIdentityCommandExecutor required for migration cutover');
    const validation = this.validateForCutover({ batch, current_source_snapshot_ref });
    const writes = [];
    for (const identity of batch.identities) writes.push({ logical_key: `identity:${identity.entity_id}`, record_kind: 'EntityIdentity', entity_id: identity.entity_id, value: clone(identity) });
    for (const [index, alias] of batch.aliases.entries()) writes.push({ logical_key: `migration-alias:${batch.batch_id}:${index}`, record_kind: 'AliasRecord', entity_id: alias.entity_id, value: clone(alias), sensitive: ['SENSITIVE', 'RESTRICTED', 'CONFIDENTIAL'].includes(alias.data_classification), data_classification: alias.data_classification });
    for (const [index, locator] of batch.locators.entries()) writes.push({ logical_key: `migration-locator:${batch.batch_id}:${index}`, record_kind: 'LocatorRecord', entity_id: locator.entity_id, value: clone(locator) });
    for (const [index, binding] of batch.external_bindings.entries()) writes.push({ logical_key: `migration-external:${batch.batch_id}:${index}`, record_kind: 'ExternalIdentityBinding', entity_id: binding.entity_id, value: clone(binding), sensitive: true, data_classification: binding.data_classification });
    writes.push({ logical_key: `migration-crosswalk:${batch.batch_id}`, record_kind: 'LegacyIdentityCrosswalk', value: clone(batch.crosswalk) });
    return durableExecutor.execute({
      command_id: `IDENTITY-MIGRATION-CUTOVER:${batch.batch_id}:${batch.plan_digest_sha256}`,
      actor_ref: req(actor_ref, 'actor_ref'),
      operation: 'COMMIT_IDENTITY_MIGRATION',
      subject_refs: [batch.source_snapshot_ref],
      expected_versions,
      request: { batch_id: batch.batch_id, source_snapshot_ref: batch.source_snapshot_ref, plan_digest_sha256: batch.plan_digest_sha256 },
      record_kind: 'IdentityMigrationBatch',
      data_classification: batch.external_bindings.length ? 'RESTRICTED' : 'INTERNAL',
      sensitive: batch.external_bindings.length > 0,
      planMutation: () => ({ writes, result: validation, result_refs: batch.identities.map((identity) => identity.entity_id), event_type: 'IDENTITY_MIGRATION_CUTOVER' })
    });
  }

  exportSnapshot({ subject_snapshot_ref, identities = [], scheme_profiles = [], namespaces = [], aliases = [], locators = [], external_bindings = [], lineage_edges = [], provenance = [] }) {
    const contract = this.compatibility.resolve();
    const envelope = freeze({
      envelope_kind: 'PROGRAMMING_IDENTITY_EXCHANGE',
      contract_id: 'programming.identity.exchange',
      contract_version: contract.version,
      subject_snapshot_ref: req(subject_snapshot_ref, 'subject_snapshot_ref'),
      scheme_profiles: clone(scheme_profiles),
      namespaces: clone(namespaces),
      identities: clone(identities),
      aliases: clone(aliases),
      locators: clone(locators),
      external_bindings: clone(external_bindings),
      lineage_edges: clone(lineage_edges),
      provenance: clone(provenance)
    });
    this.compatibility.validate(envelope);
    return envelope;
  }

  importEnvelope(envelope) {
    if (!envelope || envelope.envelope_kind !== 'PROGRAMMING_IDENTITY_EXCHANGE') throw new IdentityError('INVALID_ID_PROFILE', 'Unsupported identity exchange envelope kind');
    this.compatibility.validate(envelope);
    const requiredArrays = ['scheme_profiles', 'namespaces', 'identities', 'aliases', 'locators', 'external_bindings', 'lineage_edges', 'provenance'];
    for (const field of requiredArrays) if (!Array.isArray(envelope[field])) throw new IdentityError('INVALID_ID_PROFILE', `Identity exchange envelope missing required array: ${field}`, { field });
    return freeze({ standing: 'VALIDATED_IMPORT_CANDIDATE', contract_id: envelope.contract_id, contract_version: envelope.contract_version, subject_snapshot_ref: envelope.subject_snapshot_ref, content: clone(envelope), authoritative: false });
  }
}

module.exports = {
  IdentityExchangeCompatibilityPort,
  IdentityMigrationService
};
