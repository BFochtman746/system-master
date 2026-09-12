'use strict';

const { ContractVersioningError } = require('./contract-versioning');
const { COMPATIBILITY_AXES } = require('./contract-compatibility');

const INVENTORY_STANDINGS = new Set(['UNKNOWN', 'INCOMPLETE', 'COMPLETE']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `${field} is required`, { field });
  return value;
}

function unique(values) { return [...new Set(values || [])].sort(); }

class ConsumerBindingRegistry {
  constructor({ identityAllocator }) {
    if (typeof identityAllocator !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port required');
    this.allocate = identityAllocator;
    this.bindings = new Map();
    this.currentByConsumerFamily = new Map();
    this.inventory = new Map();
  }

  register(record) {
    const familyId = text(record?.contract_family_id, 'contract_family_id');
    const consumerId = text(record?.consumer_id, 'consumer_id');
    const requiredAxes = unique(record.required_axes);
    for (const axis of requiredAxes) if (!COMPATIBILITY_AXES.includes(axis)) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `Unknown required axis: ${axis}`, { axis });
    const key = `${familyId}\u0000${consumerId}`;
    const priorId = this.currentByConsumerFamily.get(key);
    const prior = priorId ? this.bindings.get(priorId) : null;
    const expectedRevision = record.expected_revision === undefined ? (prior ? prior.revision : 0) : record.expected_revision;
    if ((prior ? prior.revision : 0) !== expectedRevision) {
      throw new ContractVersioningError('STALE_DRAFT_BASE', 'Consumer binding revision changed', { contract_family_id: familyId, consumer_id: consumerId, expected_revision: expectedRevision, actual_revision: prior ? prior.revision : 0 });
    }
    const binding = freeze({
      consumer_binding_id: String(this.allocate('CONSUMER_BINDING')),
      contract_family_id: familyId,
      consumer_id: consumerId,
      revision: (prior ? prior.revision : 0) + 1,
      prior_binding_id: prior?.consumer_binding_id || null,
      supported_version_constraint: text(record.supported_version_constraint, 'supported_version_constraint'),
      required_axes: Object.freeze(requiredAxes),
      capability_profile: freeze({
        profile_id: text(record.capability_profile?.profile_id, 'capability_profile.profile_id'),
        profile_version: text(record.capability_profile?.profile_version, 'capability_profile.profile_version'),
        capabilities: Object.freeze(unique(record.capability_profile?.capabilities))
      }),
      observed_version_id: record.observed_version_id || null,
      support_horizon: freeze({
        supported_target_version_ids: Object.freeze(unique(record.support_horizon?.supported_target_version_ids)),
        end_at: record.support_horizon?.end_at || null,
        evidence_refs: Object.freeze(unique(record.support_horizon?.evidence_refs))
      }),
      migration_after_consumer_ids: Object.freeze(unique(record.migration_after_consumer_ids)),
      migration_before_consumer_ids: Object.freeze(unique(record.migration_before_consumer_ids)),
      evidence_refs: Object.freeze(unique(record.evidence_refs))
    });
    this.bindings.set(binding.consumer_binding_id, binding);
    this.currentByConsumerFamily.set(key, binding.consumer_binding_id);
    return binding;
  }

  getCurrent(contractFamilyId, consumerId) {
    const id = this.currentByConsumerFamily.get(`${contractFamilyId}\u0000${consumerId}`);
    return id ? this.bindings.get(id) : null;
  }

  listCurrent(contractFamilyId) {
    const prefix = `${contractFamilyId}\u0000`;
    return [...this.currentByConsumerFamily.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, id]) => this.bindings.get(id))
      .sort((a, b) => a.consumer_id.localeCompare(b.consumer_id));
  }

  setInventoryStanding({ contract_family_id, standing, evidence_refs = [], observed_at = null }) {
    const familyId = text(contract_family_id, 'contract_family_id');
    if (!INVENTORY_STANDINGS.has(standing)) throw new ContractVersioningError('CONSUMER_INVENTORY_INCOMPLETE', `Invalid inventory standing: ${standing}`);
    if (standing === 'COMPLETE' && (!Array.isArray(evidence_refs) || evidence_refs.length === 0)) {
      throw new ContractVersioningError('CONSUMER_INVENTORY_INCOMPLETE', 'COMPLETE inventory requires evidence refs');
    }
    const record = freeze({ contract_family_id: familyId, standing, evidence_refs: Object.freeze(unique(evidence_refs)), observed_at });
    this.inventory.set(familyId, record);
    return record;
  }

  getInventoryStanding(contractFamilyId) {
    return this.inventory.get(contractFamilyId) || freeze({ contract_family_id: contractFamilyId, standing: 'UNKNOWN', evidence_refs: Object.freeze([]), observed_at: null });
  }
}

function topologicalMigrationOrder(bindings) {
  const ids = new Set(bindings.map((item) => item.consumer_id));
  const edges = new Map([...ids].map((id) => [id, new Set()]));
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const add = (before, after) => {
    if (!ids.has(before) || !ids.has(after)) return;
    if (before === after) throw new ContractVersioningError('MIGRATION_ORDER_CYCLE', 'Consumer cannot depend on itself', { consumer_id: before });
    if (!edges.get(before).has(after)) { edges.get(before).add(after); indegree.set(after, indegree.get(after) + 1); }
  };
  for (const binding of bindings) {
    for (const dependency of binding.migration_after_consumer_ids) add(dependency, binding.consumer_id);
    for (const successor of binding.migration_before_consumer_ids) add(binding.consumer_id, successor);
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of [...edges.get(id)].sort()) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) { queue.push(next); queue.sort(); }
    }
  }
  if (order.length !== ids.size) {
    const cycleMembers = [...ids].filter((id) => indegree.get(id) > 0).sort();
    throw new ContractVersioningError('MIGRATION_ORDER_CYCLE', 'Consumer migration order contains a cycle', { consumer_ids: cycleMembers });
  }
  return Object.freeze(order);
}

class ChangeImpactAnalyzer {
  constructor({ identityAllocator, bindings }) {
    if (typeof identityAllocator !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port required');
    if (!bindings) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'Consumer binding registry required');
    this.allocate = identityAllocator;
    this.bindings = bindings;
  }

  listAffectedConsumers({ contract_family_id, source_version_id, target_version_id, diff, compatibility_assessment, evaluated_at = null }) {
    const familyId = text(contract_family_id, 'contract_family_id');
    const sourceId = text(source_version_id, 'source_version_id');
    const targetId = text(target_version_id, 'target_version_id');
    if (!diff?.complete || diff.source_version_id !== sourceId || diff.target_version_id !== targetId) {
      throw new ContractVersioningError('DIFF_INCOMPLETE', 'Exact complete diff does not match impact subject');
    }
    if (!compatibility_assessment || compatibility_assessment.source_version_id !== sourceId || compatibility_assessment.target_version_id !== targetId) {
      throw new ContractVersioningError('COMPATIBILITY_UNKNOWN', 'Compatibility assessment does not match exact impact subject');
    }
    const axisMap = new Map((compatibility_assessment.axis_results || []).map((item) => [item.axis, item]));
    const bindings = this.bindings.listCurrent(familyId);
    const inventory = this.bindings.getInventoryStanding(familyId);
    const consumers = bindings.map((binding) => {
      const axisStates = binding.required_axes.map((axis) => ({ axis, status: axisMap.get(axis)?.status || 'UNKNOWN' }));
      const statuses = axisStates.map((item) => item.status);
      const supportKnown = binding.support_horizon.supported_target_version_ids.length > 0;
      const targetSupported = !supportKnown || binding.support_horizon.supported_target_version_ids.includes(targetId);
      let standing = 'SAFE';
      if (!targetSupported) standing = 'AFFECTED';
      else if (statuses.some((status) => status === 'INCOMPATIBLE')) standing = 'AFFECTED';
      else if (statuses.some((status) => status === 'FAILED' || status === 'UNKNOWN')) standing = 'UNKNOWN';
      else if (statuses.some((status) => status === 'CONDITIONAL')) standing = 'CONDITIONAL';
      return freeze({
        consumer_id: binding.consumer_id,
        consumer_binding_id: binding.consumer_binding_id,
        binding_revision: binding.revision,
        observed_version_id: binding.observed_version_id,
        required_axes: binding.required_axes,
        axis_states: Object.freeze(axisStates.map(freeze)),
        target_supported_by_horizon: targetSupported,
        support_horizon_evidence_refs: binding.support_horizon.evidence_refs,
        standing
      });
    });
    const migrationOrder = topologicalMigrationOrder(bindings);
    const knownAllSafe = consumers.every((item) => item.standing === 'SAFE');
    const allConsumersSafe = inventory.standing === 'COMPLETE' && knownAllSafe;
    return freeze({
      impact_assessment_id: String(this.allocate('IMPACT_ASSESSMENT')),
      contract_family_id: familyId,
      source_version_id: sourceId,
      target_version_id: targetId,
      source_diff_digests: freeze({ source: diff.source_canonical_digest || null, target: diff.target_canonical_digest || null }),
      compatibility_assessment_id: compatibility_assessment.assessment_id || null,
      compatibility_status: compatibility_assessment.status,
      compatibility_findings: Object.freeze([...(compatibility_assessment.findings || [])]),
      inventory,
      known_consumers: Object.freeze(consumers),
      migration_order: migrationOrder,
      all_known_consumers_safe: knownAllSafe,
      all_consumers_safe: allConsumersSafe,
      claim_standing: allConsumersSafe ? 'ALL_CONSUMERS_SAFE' : inventory.standing === 'COMPLETE' ? 'KNOWN_RISK_REMAINS' : 'CONSUMER_INVENTORY_INCOMPLETE',
      evaluated_at
    });
  }
}

module.exports = {
  ChangeImpactAnalyzer,
  ConsumerBindingRegistry,
  INVENTORY_STANDINGS,
  topologicalMigrationOrder
};
