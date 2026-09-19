'use strict';

const { SystemModelError, SystemModelService } = require('./system-model');
const { AuthorityBoundaryService, DependencyGraphEngine } = require('./authority-model');
const { ImportExportService, ViewProjectionService } = require('./model-io');
const { ModelSnapshotService } = require('./model-snapshots');
const {
  AuthorizationGuard,
  EvidenceOutboxAdapter,
  GovernedModelIO,
  GovernedModelSnapshotService,
  GuardedDependencyGraphEngine,
  ResourceGuard
} = require('./model-governance');

const REQUIRED_BINDINGS = Object.freeze([
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001L', key: 'closureGovernance', kind: 'GOVERNANCE_PREREQUISITE' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001N', key: 'identity', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001O', key: 'contracts', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001P', key: 'persistence', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001Q', key: 'authorization', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001R', key: 'consistency', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001S', key: 'evidence', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-FOUNDATION-001W', key: 'scheduling', kind: 'RUNTIME_PORT' }),
  Object.freeze({ authority_id: 'PROGRAMMING-CLOSURE-REPAIR-002', key: 'projectArchitecture', kind: 'RUNTIME_PORT' })
]);

const REQUIREMENT_PACKAGE_RANGES = Object.freeze([
  ['IMPL-001M-01', [1, 2, 3, 12]],
  ['IMPL-001M-02', [4, 5, 6, 13, 14, 15, 16, 17]],
  ['IMPL-001M-03', [8, 9, 10, 11, 28]],
  ['IMPL-001M-04', [7, 18, 19, 20, 21]],
  ['IMPL-001M-05', [22, 23, 24, 25, 26, 27, 29, 30]],
  ['IMPL-001M-06', [31, 32]]
]);

const TEST_FAMILIES = Object.freeze({
  1: ['SCHEMA', 'STATE', 'CRASH_RESTART'],
  2: ['SCHEMA', 'PROPERTY', 'ADVERSARIAL'],
  3: ['SCHEMA', 'GRAPH', 'PROPERTY'],
  4: ['SCHEMA', 'INVARIANT'],
  5: ['PROPERTY', 'GRAPH', 'ADVERSARIAL'],
  6: ['PROPERTY', 'CONTRACT', 'SECURITY'],
  7: ['CONTRACT', 'SNAPSHOT', 'ROUNDTRIP'],
  8: ['PROPERTY', 'STATE', 'MIGRATION'],
  9: ['STATE', 'CONCURRENCY', 'ADVERSARIAL'],
  10: ['CRASH_RESTART', 'TRANSACTION', 'INTEGRATION'],
  11: ['PROPERTY', 'RETRY', 'IDEMPOTENCY'],
  12: ['UNIT', 'SCHEMA', 'PROPERTY', 'FUZZ'],
  13: ['GRAPH', 'PROPERTY', 'ADVERSARIAL'],
  14: ['UNIT', 'GRAPH', 'DETERMINISM'],
  15: ['GRAPH', 'CLOSURE', 'PROPERTY'],
  16: ['PROPERTY', 'CACHE', 'REBUILD'],
  17: ['GRAPH', 'RESOURCE', 'PERFORMANCE'],
  18: ['CONTRACT', 'REVIEW', 'SNAPSHOT'],
  19: ['SCHEMA', 'GOLDEN', 'ROUNDTRIP'],
  20: ['FUZZ', 'SECURITY', 'RESOURCE', 'ADVERSARIAL'],
  21: ['ROUNDTRIP', 'CONTRACT', 'DIFFERENTIAL'],
  22: ['PROPERTY', 'CONFORMANCE', 'DIFFERENTIAL'],
  23: ['CONFORMANCE', 'BROWNFIELD', 'ADVERSARIAL'],
  24: ['SECURITY', 'TOCTOU', 'AUTHZ'],
  25: ['SECURITY', 'PRIVACY', 'FUZZ'],
  26: ['INTEGRATION', 'CRASH_RESTART', 'IDEMPOTENCY'],
  27: ['RESOURCE', 'PERFORMANCE', 'DOS'],
  28: ['CACHE', 'PROPERTY', 'CONCURRENCY'],
  29: ['MIGRATION', 'ROLLBACK', 'CORRUPTION'],
  30: ['CORRUPTION', 'RECOVERY', 'ADVERSARIAL'],
  31: ['ARCHITECTURE', 'CONTRACT', 'OWNERSHIP'],
  32: ['TRACEABILITY', 'QUALIFICATION_META']
});

function requiredFunction(value, field) {
  if (typeof value !== 'function') throw new SystemModelError('DOWNSTREAM_BINDING_INVALID', `${field} must be a function`, { field });
  return value;
}

function requiredObject(value, field) {
  if (!value || typeof value !== 'object') throw new SystemModelError('DOWNSTREAM_BINDING_INVALID', `${field} must be an object`, { field });
  return value;
}

function validatePersistencePort(store) {
  requiredObject(store, '001P.persistence.store');
  for (const name of ['initializeWorkspace', 'getWorkspace', 'getSnapshot', 'putChangeSet', 'updateChangeSet', 'getChangeSet', 'getReceipt', 'atomicCommit', 'listPendingOutboxEvents']) {
    requiredFunction(store[name], `001P.persistence.store.${name}`);
  }
  return store;
}

class DownstreamBindingRegistry {
  constructor(bindings = {}) {
    this.bindings = bindings;
    this.records = [];
    this.validate();
  }

  validate() {
    const missing = REQUIRED_BINDINGS.filter((spec) => this.bindings[spec.key] === undefined || this.bindings[spec.key] === null);
    if (missing.length) {
      throw new SystemModelError('DOWNSTREAM_BINDING_MISSING', '001M cannot start with missing delegated-authority bindings', {
        missing: missing.map((item) => item.authority_id)
      });
    }

    const governance = requiredObject(this.bindings.closureGovernance, '001L.closureGovernance');
    if (governance.standing !== 'SATISFIED_PRECONDITION') {
      throw new SystemModelError('GOVERNANCE_PREREQUISITE_UNSATISFIED', '001L must be explicitly satisfied before 001M integration', {
        standing: governance.standing || null
      });
    }
    if (!Array.isArray(governance.evidence_refs) || governance.evidence_refs.length === 0) {
      throw new SystemModelError('GOVERNANCE_EVIDENCE_MISSING', '001L satisfied prerequisite requires evidence refs');
    }

    requiredFunction(this.bindings.identity.validate, '001N.identity.validate');
    requiredFunction(this.bindings.contracts.resolveVersion, '001O.contracts.resolveVersion');
    validatePersistencePort(this.bindings.persistence.store);
    requiredFunction(this.bindings.authorization.authorize, '001Q.authorization.authorize');
    requiredFunction(this.bindings.consistency.validateMutationContext, '001R.consistency.validateMutationContext');
    requiredFunction(this.bindings.evidence.listPendingEvents, '001S.evidence.listPendingEvents');
    requiredFunction(this.bindings.evidence.acknowledgeEvent, '001S.evidence.acknowledgeEvent');
    requiredFunction(this.bindings.scheduling.enqueueDurableJob, '001W.scheduling.enqueueDurableJob');
    requiredFunction(this.bindings.projectArchitecture.getObservedFacts, 'REPAIR-002.projectArchitecture.getObservedFacts');

    this.records = REQUIRED_BINDINGS.map((spec) => Object.freeze({
      authority_id: spec.authority_id,
      binding_key: spec.key,
      binding_kind: spec.kind,
      standing: spec.kind === 'GOVERNANCE_PREREQUISITE' ? 'SATISFIED_PRECONDITION' : 'BOUND',
      ownership_transfer: false
    }));
    return this.records;
  }

  describe() {
    return Object.freeze(this.records.slice());
  }
}

class QualificationProfile001M {
  constructor() {
    const packageByRequirement = new Map();
    for (const [pkg, numbers] of REQUIREMENT_PACKAGE_RANGES) {
      for (const number of numbers) packageByRequirement.set(number, pkg);
    }
    this.requirements = Object.freeze(Array.from({ length: 32 }, (_, index) => {
      const number = index + 1;
      const id = `BS-001M-${String(number).padStart(3, '0')}`;
      const pkg = packageByRequirement.get(number);
      const families = TEST_FAMILIES[number];
      if (!pkg || !families?.length) throw new SystemModelError('QUALIFICATION_DESTINATION_MISSING', `No qualification destination for ${id}`, { requirement_id: id });
      return Object.freeze({ requirement_id: id, implementation_package: pkg, test_families: Object.freeze(families.slice()) });
    }));
  }

  getQualificationPlan() {
    return Object.freeze({
      profile_id: 'QualificationProfile001M',
      authority_id: 'PROGRAMMING-FOUNDATION-001M',
      requirement_count: this.requirements.length,
      implementation_packages: Object.freeze(REQUIREMENT_PACKAGE_RANGES.map(([pkg]) => pkg)),
      requirements: this.requirements,
      coverage_standing: this.requirements.length === 32 ? '32_OF_32_DESTINATIONS_BOUND' : 'INCOMPLETE'
    });
  }
}

class IntegratedSystemModelController {
  constructor({ workspace_id, bindings, resource_limits = {} } = {}) {
    if (typeof workspace_id !== 'string' || !workspace_id.trim()) throw new SystemModelError('INVALID_FIELD', 'workspace_id must be a non-empty string');
    this.workspaceId = workspace_id;
    this.bindingRegistry = new DownstreamBindingRegistry(bindings);
    this.bindings = bindings;
    this.qualification = new QualificationProfile001M();

    const identityValidator = (id, kind) => bindings.identity.validate({ id, kind, workspace_id }) === true;
    this.model = new SystemModelService({ workspace_id, identityValidator });
    this.authorization = new AuthorizationGuard({ authorize: bindings.authorization.authorize });
    this.resources = new ResourceGuard({ limits: resource_limits });
    this.snapshotCore = new ModelSnapshotService({ store: bindings.persistence.store, identityValidator });
    this.snapshots = new GovernedModelSnapshotService({ service: this.snapshotCore, authorizationGuard: this.authorization });
    this.authority = new AuthorityBoundaryService({ model: this.model });
    this.dependencies = new GuardedDependencyGraphEngine({ model: this.model, resourceGuard: this.resources });
    this.views = new ViewProjectionService({ snapshotService: this.snapshotCore });
    this.rawIO = new ImportExportService({ snapshotService: this.snapshotCore });
    this.io = new GovernedModelIO({ importExportService: this.rawIO, viewProjectionService: this.views, authorizationGuard: this.authorization, resourceGuard: this.resources });
    this.evidence = new EvidenceOutboxAdapter({
      listPendingEvents: bindings.evidence.listPendingEvents,
      acknowledgeEvent: bindings.evidence.acknowledgeEvent
    });
  }

  validateMutationContext(operation, subject) {
    const result = this.bindings.consistency.validateMutationContext({ operation, workspace_id: this.workspaceId, subject });
    if (!(result === true || result?.valid === true)) {
      throw new SystemModelError('CONSISTENCY_GATE_REJECTED', '001R rejected mutation context', { operation, reason: result?.reason || null });
    }
    return true;
  }

  createWorkspace(input) {
    this.validateMutationContext('CREATE_WORKSPACE', { workspace_id: input?.workspace_id });
    return this.snapshots.createWorkspace(input);
  }

  openChangeSet(input) {
    this.validateMutationContext('OPEN_CHANGESET', { change_set_id: input?.change_set_id, base_snapshot_id: input?.base_snapshot_id || null });
    return this.snapshots.openChangeSet(input);
  }

  applyChange(input) {
    this.validateMutationContext('APPLY_CHANGE', { change_set_id: input?.change_set_id, expected_revision: input?.expected_revision });
    return this.snapshots.applyChange(input);
  }

  commitChangeSet(input) {
    this.validateMutationContext('COMMIT_CHANGESET', { change_set_id: input?.change_set_id, command_id: input?.command_id, expected_base_snapshot_id: input?.expected_base_snapshot_id });
    return this.snapshots.commitChangeSet(input);
  }

  getContractVersion(contract_id) {
    const resolved = this.bindings.contracts.resolveVersion({ contract_id, consumer_authority_id: 'PROGRAMMING-FOUNDATION-001M' });
    if (!resolved || typeof resolved.version !== 'string' || !resolved.version) {
      throw new SystemModelError('CONTRACT_VERSION_UNRESOLVED', '001O did not resolve a contract version', { contract_id });
    }
    return Object.freeze({ contract_id, version: resolved.version, compatibility: resolved.compatibility || 'UNKNOWN' });
  }

  getObservedProjectArchitecture(subject) {
    const facts = this.bindings.projectArchitecture.getObservedFacts({ workspace_id: this.workspaceId, subject });
    if (!facts || typeof facts !== 'object') throw new SystemModelError('OBSERVED_ARCHITECTURE_UNAVAILABLE', 'REPAIR-002 returned no observed architecture facts');
    return Object.freeze(JSON.parse(JSON.stringify(facts)));
  }

  enqueueDurableEscalation({ reason, payload }) {
    const result = this.bindings.scheduling.enqueueDurableJob({
      authority_id: 'PROGRAMMING-FOUNDATION-001M',
      workspace_id: this.workspaceId,
      reason,
      payload
    });
    if (!result || typeof result.job_id !== 'string' || !result.job_id) {
      throw new SystemModelError('DURABLE_JOB_NOT_ACCEPTED', '001W did not return a durable job identity', { reason });
    }
    return Object.freeze({ job_id: result.job_id, standing: result.standing || 'ACCEPTED' });
  }

  getIntegrationStanding() {
    return Object.freeze({
      authority_id: 'PROGRAMMING-FOUNDATION-001M',
      workspace_id: this.workspaceId,
      bindings: this.bindingRegistry.describe(),
      qualification: this.qualification.getQualificationPlan(),
      production_provider_standing: 'BOUND_BY_CALLER_NOT_PROVEN_BY_001M'
    });
  }
}

module.exports = {
  DownstreamBindingRegistry,
  IntegratedSystemModelController,
  QualificationProfile001M,
  REQUIRED_BINDINGS
};
