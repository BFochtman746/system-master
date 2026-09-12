'use strict';

const { ContractVersioningError } = require('./contract-versioning');

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

function instant(value, field) {
  const raw = text(value, field);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new ContractVersioningError('INVALID_DEPRECATION_TIMELINE', `${field} is not a valid timestamp`, { field, value: raw });
  return { raw, ms };
}

function unique(values) { return [...new Set(values || [])].sort(); }

class ContractAuthorizationPort {
  constructor(authorize) {
    if (typeof authorize !== 'function') throw new ContractVersioningError('UNAUTHORIZED_CONTRACT_CHANGE', '001Q authorization provider is required');
    this.authorize = authorize;
  }

  require(action, context) {
    let result;
    try { result = this.authorize({ action, context }); }
    catch (error) {
      throw new ContractVersioningError('UNAUTHORIZED_CONTRACT_CHANGE', '001Q authorization provider unavailable', { action, provider_error: error?.message || 'unknown' });
    }
    if (result !== true && result?.allowed !== true) {
      throw new ContractVersioningError('UNAUTHORIZED_CONTRACT_CHANGE', 'Contract lifecycle action denied', { action, reason: result?.reason || null });
    }
    return result;
  }
}

class DeprecationSunsetService {
  constructor({ identityAllocator, authorization }) {
    this.allocate = identityAllocator;
    this.auth = new ContractAuthorizationPort(authorization);
    this.deprecations = new Map();
    this.sunsets = new Map();
    this.retirements = new Map();
  }

  deprecate(record) {
    this.auth.require('DEPRECATE_CONTRACT_SURFACE', record.authorization_context || null);
    const announced = instant(record.announcement_at, 'announcement_at');
    const effective = instant(record.effective_at, 'effective_at');
    if (effective.ms < announced.ms) throw new ContractVersioningError('INVALID_DEPRECATION_TIMELINE', 'Deprecation effective time cannot precede announcement');
    const result = freeze({
      deprecation_id: String(this.allocate('DEPRECATION_RECORD')),
      contract_version_id: text(record.contract_version_id, 'contract_version_id'),
      affected_surface_ref: text(record.affected_surface_ref, 'affected_surface_ref'),
      announcement_at: announced.raw,
      effective_at: effective.raw,
      reason: text(record.reason, 'reason'),
      replacement_version_id: record.replacement_version_id || null,
      migration_plan_id: record.migration_plan_id || null,
      authority_ref: text(record.authority_ref, 'authority_ref'),
      state: 'DEPRECATED'
    });
    this.deprecations.set(result.deprecation_id, result);
    return result;
  }

  scheduleSunset(record) {
    this.auth.require('SCHEDULE_CONTRACT_SUNSET', record.authorization_context || null);
    const deprecation = this.deprecations.get(text(record.deprecation_id, 'deprecation_id'));
    if (!deprecation) throw new ContractVersioningError('INVALID_DEPRECATION_TIMELINE', 'Sunset requires an existing deprecation record');
    const unavailable = instant(record.planned_unavailable_at, 'planned_unavailable_at');
    const deprecationEffective = instant(deprecation.effective_at, 'deprecation.effective_at');
    if (unavailable.ms < deprecationEffective.ms) throw new ContractVersioningError('SUNSET_PREMATURE', 'Sunset cannot precede deprecation effective time');
    const supportBoundary = record.support_boundary_at ? instant(record.support_boundary_at, 'support_boundary_at') : unavailable;
    if (supportBoundary.ms > unavailable.ms) throw new ContractVersioningError('INVALID_DEPRECATION_TIMELINE', 'Support boundary cannot be after planned unavailable time');
    const result = freeze({
      sunset_id: String(this.allocate('SUNSET_RECORD')),
      deprecation_id: deprecation.deprecation_id,
      contract_version_id: deprecation.contract_version_id,
      planned_unavailable_at: unavailable.raw,
      support_boundary_at: supportBoundary.raw,
      replacement_version_id: record.replacement_version_id || deprecation.replacement_version_id || null,
      migration_plan_id: record.migration_plan_id || deprecation.migration_plan_id || null,
      guidance: record.guidance || null,
      authority_ref: text(record.authority_ref, 'authority_ref'),
      state: 'SUNSET_SCHEDULED'
    });
    this.sunsets.set(result.sunset_id, result);
    return result;
  }

  evaluateRetirement({ sunset_id, now, support_policy_met, impact_assessment, consumer_dispositions = {}, scoped_override = null, authorization_context = null }) {
    this.auth.require('RETIRE_CONTRACT_VERSION', authorization_context);
    const sunset = this.sunsets.get(text(sunset_id, 'sunset_id'));
    if (!sunset) throw new ContractVersioningError('SUNSET_PREMATURE', 'Retirement requires scheduled sunset');
    const nowInstant = instant(now, 'now');
    const unavailable = instant(sunset.planned_unavailable_at, 'planned_unavailable_at');
    if (nowInstant.ms < unavailable.ms) throw new ContractVersioningError('SUNSET_PREMATURE', 'Planned unavailable time has not been reached');
    if (support_policy_met !== true) throw new ContractVersioningError('SUNSET_PREMATURE', 'Required support policy is not met');

    const unresolved = [];
    const inventoryComplete = impact_assessment?.inventory?.standing === 'COMPLETE';
    if (!inventoryComplete && !scoped_override) throw new ContractVersioningError('CONSUMER_INVENTORY_INCOMPLETE', 'Consumer inventory must be complete before retirement without override');
    for (const consumer of impact_assessment?.known_consumers || []) {
      if (consumer.standing === 'SAFE') continue;
      const disposition = consumer_dispositions[consumer.consumer_id];
      if (!['MIGRATED', 'EXPLICITLY_ACCEPTED', 'EXEMPT'].includes(disposition)) unresolved.push(consumer.consumer_id);
    }
    if (unresolved.length && !scoped_override) throw new ContractVersioningError('SUNSET_PREMATURE', 'Known affected consumers are not migrated or dispositioned', { unresolved_consumer_ids: unresolved.sort() });
    const overrideRef = scoped_override ? text(scoped_override.override_ref, 'scoped_override.override_ref') : null;
    if (scoped_override) this.auth.require('APPROVE_CONTRACT_RETIREMENT_OVERRIDE', scoped_override.authorization_context || authorization_context);

    const retirement = freeze({
      retirement_id: String(this.allocate('RETIREMENT_RECORD')),
      sunset_id: sunset.sunset_id,
      contract_version_id: sunset.contract_version_id,
      retired_at: nowInstant.raw,
      support_policy_met: true,
      consumer_inventory_standing: impact_assessment?.inventory?.standing || 'UNKNOWN',
      consumer_dispositions: freeze({ ...consumer_dispositions }),
      scoped_override_ref: overrideRef,
      state: 'RETIRED'
    });
    this.retirements.set(retirement.retirement_id, retirement);
    return retirement;
  }

  timeline(contractVersionId) {
    return freeze({
      contract_version_id: contractVersionId,
      deprecations: Object.freeze([...this.deprecations.values()].filter((item) => item.contract_version_id === contractVersionId)),
      sunsets: Object.freeze([...this.sunsets.values()].filter((item) => item.contract_version_id === contractVersionId)),
      retirements: Object.freeze([...this.retirements.values()].filter((item) => item.contract_version_id === contractVersionId))
    });
  }
}

class SupersessionGraph {
  constructor({ identityAllocator, authorization }) {
    this.allocate = identityAllocator;
    this.auth = new ContractAuthorizationPort(authorization);
    this.edges = new Map();
  }

  supersede(record) {
    this.auth.require('SUPERSEDE_CONTRACT_VERSION', record.authorization_context || null);
    const source = text(record.source_version_id, 'source_version_id');
    const target = text(record.target_version_id, 'target_version_id');
    if (source === target) throw new ContractVersioningError('SUPERSESSION_CYCLE', 'Supersession cannot self-reference');
    const edge = freeze({
      supersession_edge_id: String(this.allocate('SUPERSESSION_EDGE')),
      source_version_id: source,
      target_version_id: target,
      relationship: record.relationship || 'SUPERSEDED_BY',
      reason: text(record.reason, 'reason'),
      migration_plan_id: record.migration_plan_id || null,
      waiver_ref: record.waiver_ref || null,
      authority_ref: text(record.authority_ref, 'authority_ref')
    });
    this.edges.set(edge.supersession_edge_id, edge);
    try { this.assertAcyclic(); }
    catch (error) { this.edges.delete(edge.supersession_edge_id); throw error; }
    return edge;
  }

  assertAcyclic() {
    const adjacency = new Map();
    for (const edge of this.edges.values()) {
      if (!adjacency.has(edge.source_version_id)) adjacency.set(edge.source_version_id, []);
      adjacency.get(edge.source_version_id).push(edge.target_version_id);
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (node, stack = []) => {
      if (visiting.has(node)) throw new ContractVersioningError('SUPERSESSION_CYCLE', 'Supersession graph contains a cycle', { cycle: [...stack, node] });
      if (visited.has(node)) return;
      visiting.add(node);
      for (const next of adjacency.get(node) || []) visit(next, [...stack, node]);
      visiting.delete(node);
      visited.add(node);
    };
    for (const node of adjacency.keys()) visit(node);
    return true;
  }

  lineage(versionId) {
    const incoming = [...this.edges.values()].filter((edge) => edge.target_version_id === versionId);
    const outgoing = [...this.edges.values()].filter((edge) => edge.source_version_id === versionId);
    return freeze({ contract_version_id: versionId, incoming: Object.freeze(incoming), outgoing: Object.freeze(outgoing) });
  }
}

class BreakingChangeGovernance {
  constructor({ identityAllocator, authorization }) {
    this.allocate = identityAllocator;
    this.auth = new ContractAuthorizationPort(authorization);
    this.waivers = new Map();
  }

  createWaiver(record) {
    this.auth.require('APPROVE_COMPATIBILITY_WAIVER', record.authorization_context || null);
    const waiver = freeze({
      waiver_ref: String(this.allocate('COMPATIBILITY_WAIVER')),
      assessment_id: text(record.assessment_id, 'assessment_id'),
      source_version_id: text(record.source_version_id, 'source_version_id'),
      target_version_id: text(record.target_version_id, 'target_version_id'),
      scope: text(record.scope, 'scope'),
      rationale: text(record.rationale, 'rationale'),
      expires_at: record.expires_at || null,
      authority_ref: text(record.authority_ref, 'authority_ref')
    });
    this.waivers.set(waiver.waiver_ref, waiver);
    return waiver;
  }

  requireBreakingDisposition({ compatibility_assessment, target_version_id, supersession_edge = null, migration_plan_id = null, waiver_ref = null }) {
    if (!compatibility_assessment) throw new ContractVersioningError('COMPATIBILITY_UNKNOWN', 'Compatibility assessment required');
    if (compatibility_assessment.target_version_id !== target_version_id) throw new ContractVersioningError('COMPATIBILITY_UNKNOWN', 'Compatibility assessment target mismatch');
    if (compatibility_assessment.status !== 'INCOMPATIBLE') return freeze({ standing: compatibility_assessment.status === 'COMPATIBLE' ? 'NO_BREAKING_DISPOSITION_REQUIRED' : 'COMPATIBILITY_NOT_CLEAN', allowed: compatibility_assessment.status === 'COMPATIBLE' });
    const waiver = waiver_ref ? this.waivers.get(waiver_ref) : null;
    const explicitPath = Boolean(supersession_edge && supersession_edge.target_version_id === target_version_id) || Boolean(migration_plan_id) || Boolean(waiver);
    if (!explicitPath) throw new ContractVersioningError('BREAKING_CHANGE_UNWAIVED', 'Incompatible successor requires supersession, migration, or authorized scoped waiver');
    return freeze({ standing: 'BREAKING_CHANGE_EXPLICITLY_DISPOSITIONED', allowed: true, supersession_edge_id: supersession_edge?.supersession_edge_id || null, migration_plan_id: migration_plan_id || null, waiver_ref: waiver?.waiver_ref || null });
  }
}

class ContractHistoryGuard {
  constructor({ versionRegistry }) { this.versions = versionRegistry; }
  requireVersions(versionIds) {
    const records = [];
    for (const id of unique(versionIds)) {
      try { records.push(this.versions.get(id)); }
      catch (_) { throw new ContractVersioningError('HISTORY_GAP', `Required historical version is unavailable: ${id}`, { contract_version_id: id }); }
    }
    return Object.freeze(records);
  }
}

module.exports = {
  BreakingChangeGovernance,
  ContractAuthorizationPort,
  ContractHistoryGuard,
  DeprecationSunsetService,
  SupersessionGraph
};
