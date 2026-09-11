'use strict';

const crypto = require('crypto');
const { SystemModelError, SystemModelService } = require('./system-model');
const { DependencyGraphEngine } = require('./authority-model');
const { canonicalStringify, makeSnapshot } = require('./model-snapshots');

const req = (v, f) => { if (typeof v !== 'string' || !v.trim()) throw new SystemModelError('INVALID_FIELD', `${f} must be a non-empty string`, { field: f }); return v; };
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const freeze = (v) => { if (!v || typeof v !== 'object' || Object.isFrozen(v)) return v; Object.freeze(v); for (const c of Object.values(v)) freeze(c); return v; };
const hash = (v) => crypto.createHash('sha256').update(canonicalStringify(v)).digest('hex');

function validateModel(state) {
  const m = new SystemModelService({ workspace_id: req(state?.workspace_id, 'model.workspace_id') });
  for (const x of state.entity_types || []) m.registerEntityType(clone(x));
  for (const x of state.relationship_types || []) m.registerRelationshipType(clone(x));
  for (const x of state.entities || []) m.upsertEntity(clone(x));
  for (const x of state.relationships || []) m.declareRelationship(clone(x));
  m.validate();
  return true;
}

class AuthorizationGuard {
  constructor({ authorize } = {}) { if (typeof authorize !== 'function') throw new SystemModelError('AUTHORIZATION_PORT_REQUIRED', '001Q authorization port required'); this.port = authorize; }
  assertAllowed({ capability, operation, subject = {}, context = {} }) {
    req(capability, 'capability'); req(operation, 'operation'); let d;
    try { d = this.port({ capability, operation, subject: clone(subject), context: clone(context) }); }
    catch (e) { throw new SystemModelError('AUTHORIZATION_UNAVAILABLE', '001Q authorization failed closed', { capability, operation, message: e?.message || String(e) }); }
    if (!(d === true || d?.allowed === true)) throw new SystemModelError('AUTHORIZATION_DENIED', '001Q denied operation', { capability, operation, decision_id: d?.decision_id || null, reason: d?.reason || null });
    return freeze({ allowed: true, capability, operation, decision_id: d?.decision_id || null });
  }
}

class ResourceGuard {
  constructor({ limits = {} } = {}) {
    this.limits = Object.freeze({ TRAVERSAL_NODES: limits.TRAVERSAL_NODES ?? 1000, IMPORT_BYTES: limits.IMPORT_BYTES ?? 1048576, PROJECTION_ELEMENTS: limits.PROJECTION_ELEMENTS ?? 5000, MIGRATION_BYTES: limits.MIGRATION_BYTES ?? 4194304 });
    for (const [kind, limit] of Object.entries(this.limits)) if (!Number.isInteger(limit) || limit <= 0) throw new SystemModelError('INVALID_RESOURCE_LIMIT', 'resource limit must be positive', { kind, limit });
  }
  assertWithin(kind, requested) {
    req(kind, 'resource.kind'); const limit = this.limits[kind];
    if (!Number.isInteger(requested) || requested < 0) throw new SystemModelError('INVALID_RESOURCE_REQUEST', 'requested resource must be non-negative integer', { kind, requested });
    if (limit === undefined) throw new SystemModelError('RESOURCE_LIMIT_UNKNOWN', `No admitted limit for ${kind}`, { kind });
    if (requested > limit) throw new SystemModelError('RESOURCE_BUDGET_EXCEEDED', `${kind} exceeds admitted budget`, { kind, requested, limit });
    return freeze({ kind, requested, limit });
  }
}

class GovernedModelSnapshotService {
  constructor({ service, authorizationGuard } = {}) { if (!service || !authorizationGuard) throw new SystemModelError('GOVERNED_MODEL_PORT_REQUIRED', 'snapshot service and authorization guard required'); this.service = service; this.store = service.store; this.auth = authorizationGuard; }
  a(capability, operation, subject) { return this.auth.assertAllowed({ capability, operation, subject }); }
  createWorkspace(x) { this.a('MODEL_MUTATE', 'CREATE_WORKSPACE', { workspace_id: x?.workspace_id }); return this.service.createWorkspace(x); }
  getActiveSnapshot(id) { this.a('MODEL_READ', 'GET_ACTIVE_SNAPSHOT', { workspace_id: id }); return this.service.getActiveSnapshot(id); }
  verifySnapshotIntegrity(x) { this.a('MODEL_READ', 'VERIFY_SNAPSHOT_INTEGRITY', { snapshot_id: typeof x === 'string' ? x : x?.snapshot_id }); return this.service.verifySnapshotIntegrity(x); }
  openChangeSet(x) { this.a('MODEL_MUTATE', 'OPEN_CHANGESET', { workspace_id: x?.workspace_id, change_set_id: x?.change_set_id, base_snapshot_id: x?.base_snapshot_id || null }); return this.service.openChangeSet(x); }
  applyChange(x) { this.a('MODEL_MUTATE', 'APPLY_CHANGE', { change_set_id: x?.change_set_id, expected_revision: x?.expected_revision }); return this.service.applyChange(x); }
  commitChangeSet(x) { this.a('MODEL_PUBLISH', 'COMMIT_CHANGESET', { change_set_id: x?.change_set_id, command_id: x?.command_id, expected_base_snapshot_id: x?.expected_base_snapshot_id }); return this.service.commitChangeSet(x); }
  query(x) { this.a('MODEL_READ', 'QUERY_SNAPSHOT', { snapshot_id: x?.snapshot_id, query_key: x?.query_key }); return this.service.query(x); }
  recoverWorkspace(id) { this.a('MODEL_RECOVER', 'RECOVER_WORKSPACE', { workspace_id: id }); return this.service.recoverWorkspace(id); }
}

class GovernedModelIO {
  constructor({ importExportService, viewProjectionService, authorizationGuard, resourceGuard = new ResourceGuard() } = {}) { if (!importExportService || !viewProjectionService || !authorizationGuard) throw new SystemModelError('GOVERNED_IO_PORT_REQUIRED', 'model IO services and authorization guard required'); this.io = importExportService; this.views = viewProjectionService; this.auth = authorizationGuard; this.resources = resourceGuard; }
  exportSnapshot(x) { this.auth.assertAllowed({ capability: 'MODEL_EXPORT', operation: 'EXPORT_SNAPSHOT', subject: { snapshot_id: x?.snapshot_id } }); const e = this.io.exportSnapshot(x); this.resources.assertWithin('PROJECTION_ELEMENTS', (e.model.entities || []).length + (e.model.relationships || []).length); return e; }
  importModel(x) { this.auth.assertAllowed({ capability: 'MODEL_IMPORT', operation: 'IMPORT_MODEL', subject: {} }); const raw = typeof x?.document === 'string' ? x.document : canonicalStringify(x?.document); this.resources.assertWithin('IMPORT_BYTES', Buffer.byteLength(raw, 'utf8')); return this.io.importModel(x); }
  generateView(x) { this.auth.assertAllowed({ capability: 'MODEL_READ', operation: 'GENERATE_VIEW', subject: { snapshot_id: x?.snapshot_id, viewpoint_id: x?.viewpoint_id } }); const v = this.views.generateView(x); this.resources.assertWithin('PROJECTION_ELEMENTS', (v.content?.entities || []).length + (v.content?.relationships || []).length); return v; }
}

class GuardedDependencyGraphEngine {
  constructor({ model, resourceGuard = new ResourceGuard() } = {}) { this.engine = new DependencyGraphEngine({ model }); this.resources = resourceGuard; }
  getDependents(...x) { return this.engine.getDependents(...x); }
  traverse(x) { this.resources.assertWithin('TRAVERSAL_NODES', x?.max_nodes ?? 1000); return this.engine.traverse(x); }
  evaluateImpact(x) { this.resources.assertWithin('TRAVERSAL_NODES', x?.max_nodes ?? 1000); return this.engine.evaluateImpact(x); }
}

class ConformanceContractRegistry {
  constructor() {
    this.rules = new Map(); this.evaluators = new Map();
    this.registerEvaluator('FORBID_RELATIONSHIP_TYPE', ({ snapshot, rule }) => { const m = (snapshot.model.relationships || []).filter(x => x.relationship_type === rule.parameters.relationship_type); return m.length ? { standing: 'FAIL', details: { relationship_ids: m.map(x => x.relationship_id).sort() } } : { standing: 'PASS', details: {} }; });
    this.registerEvaluator('REQUIRE_ENTITY_TYPE', ({ snapshot, rule }) => { const n = (snapshot.model.entities || []).filter(x => x.entity_type === rule.parameters.entity_type).length; return n >= (rule.parameters.minimum ?? 1) ? { standing: 'PASS', details: { count: n } } : { standing: 'FAIL', details: { count: n, minimum: rule.parameters.minimum ?? 1 } }; });
    this.registerEvaluator('REQUIRE_CANONICAL_OWNER', ({ authority_state, rule }) => { if (!authority_state) return { standing: 'CANNOT_DETERMINE', details: { reason: 'AUTHORITY_STATE_NOT_SUPPLIED' } }; const a = (authority_state.assignments || []).find(x => x.responsibility_id === rule.parameters.responsibility_id && x.active !== false); if (!a) return { standing: 'FAIL', details: { reason: 'CANONICAL_OWNER_MISSING' } }; if (rule.parameters.owner_entity_id && a.owner_entity_id !== rule.parameters.owner_entity_id) return { standing: 'FAIL', details: { actual_owner_entity_id: a.owner_entity_id, expected_owner_entity_id: rule.parameters.owner_entity_id } }; return { standing: 'PASS', details: { owner_entity_id: a.owner_entity_id } }; });
  }
  registerEvaluator(k, fn) { req(k, 'evaluator_key'); if (typeof fn !== 'function') throw new SystemModelError('EVALUATOR_REQUIRED', 'evaluator must be function'); if (this.evaluators.has(k)) throw new SystemModelError('EVALUATOR_EXISTS', `Evaluator exists: ${k}`); this.evaluators.set(k, fn); }
  registerConstraint(r) { const id = req(r?.constraint_id, 'constraint_id'); const key = req(r?.evaluator_key, 'constraint.evaluator_key'); if (this.rules.has(id)) throw new SystemModelError('CONSTRAINT_EXISTS', `Constraint exists: ${id}`); const x = freeze({ constraint_id: id, evaluator_key: key, severity: r.severity === 'SOFT' ? 'SOFT' : 'HARD', description: r.description || null, parameters: clone(r.parameters || {}) }); this.rules.set(id, x); return x; }
  evaluate({ snapshot, authority_state = null } = {}) {
    if (!snapshot?.snapshot_id || !snapshot?.model) throw new SystemModelError('SNAPSHOT_REQUIRED', 'immutable snapshot required'); const results = [];
    for (const r of [...this.rules.values()].sort((a,b) => a.constraint_id.localeCompare(b.constraint_id))) { let x; const fn = this.evaluators.get(r.evaluator_key); if (!fn) x = { standing: 'CANNOT_DETERMINE', details: { reason: 'EVALUATOR_NOT_REGISTERED' } }; else { try { x = fn({ snapshot, authority_state, rule: r }); } catch (e) { x = { standing: 'CANNOT_DETERMINE', details: { reason: 'EVALUATOR_ERROR', message: e?.message || String(e) } }; } } if (!['PASS','FAIL','CANNOT_DETERMINE'].includes(x?.standing)) x = { standing: 'CANNOT_DETERMINE', details: { reason: 'INVALID_EVALUATOR_STANDING' } }; results.push(freeze({ constraint_id: r.constraint_id, severity: r.severity, evaluator_key: r.evaluator_key, standing: x.standing, details: clone(x.details || {}) })); }
    const standing = results.some(x => x.severity === 'HARD' && x.standing === 'FAIL') ? 'FAIL' : results.some(x => x.severity === 'HARD' && x.standing === 'CANNOT_DETERMINE') ? 'CANNOT_DETERMINE' : results.some(x => x.severity === 'SOFT' && x.standing === 'FAIL') ? 'PASS_WITH_WARNINGS' : 'PASS';
    return freeze({ snapshot_id: snapshot.snapshot_id, standing, results });
  }
}

class EvidenceOutboxAdapter {
  constructor({ listPendingEvents, acknowledgeEvent } = {}) { if (typeof listPendingEvents !== 'function' || typeof acknowledgeEvent !== 'function') throw new SystemModelError('EVIDENCE_OUTBOX_PORT_REQUIRED', '001P/001S outbox ports required'); this.list = listPendingEvents; this.ack = acknowledgeEvent; }
  getPendingEvents(id) { req(id, 'workspace_id'); return freeze(clone(this.list(id) || [])); }
  ackEvent({ event_id, evidence_ref }) { req(event_id, 'event_id'); req(evidence_ref, 'evidence_ref'); return freeze(clone(this.ack({ event_id, evidence_ref }))); }
}

class SnapshotIntegrityInspector {
  constructor({ snapshotService } = {}) { if (!snapshotService) throw new SystemModelError('SNAPSHOT_SERVICE_REQUIRED', 'snapshot service required'); this.s = snapshotService; }
  inspect(id) { req(id, 'snapshot_id'); const x = this.s.store.getSnapshot(id); if (!x) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown snapshot: ${id}`); this.s.verifySnapshotIntegrity(x); return freeze({ snapshot_id: x.snapshot_id, digest_algorithm: x.digest_algorithm, entity_type_count: (x.model.entity_types || []).length, relationship_type_count: (x.model.relationship_types || []).length, entity_count: (x.model.entities || []).length, relationship_count: (x.model.relationships || []).length, standing: 'VALID' }); }
}

function diff(before, after) { const ids = (a,k) => new Set((a || []).map(x => x[k])); const be=ids(before.entities,'entity_id'), ae=ids(after.entities,'entity_id'), br=ids(before.relationships,'relationship_id'), ar=ids(after.relationships,'relationship_id'); const d=(a,b)=>[...a].filter(x=>!b.has(x)).sort(); return freeze({ entity_count_before: be.size, entity_count_after: ae.size, relationship_count_before: br.size, relationship_count_after: ar.size, entities_added:d(ae,be), entities_removed:d(be,ae), relationships_added:d(ar,br), relationships_removed:d(br,ar) }); }

class ModelMigrationService {
  constructor({ snapshotService, authorizationGuard = null, resourceGuard = new ResourceGuard() } = {}) { if (!snapshotService) throw new SystemModelError('SNAPSHOT_SERVICE_REQUIRED', 'snapshot service required'); this.s=snapshotService; this.store=snapshotService.store; this.auth=authorizationGuard; this.resources=resourceGuard; }
  a(op, subject) { if (this.auth) this.auth.assertAllowed({ capability: 'MODEL_SCHEMA_MIGRATION', operation: op, subject }); }
  planMigration({ workspace_id, migration_id, target_schema_version, migrate }) { req(workspace_id,'workspace_id'); req(migration_id,'migration_id'); if (!Number.isInteger(target_schema_version) || target_schema_version <= 0) throw new SystemModelError('INVALID_SCHEMA_VERSION','target schema version must be positive'); if (typeof migrate !== 'function') throw new SystemModelError('MIGRATION_FUNCTION_REQUIRED','migrate function required'); this.a('PLAN_MIGRATION',{workspace_id,migration_id,target_schema_version}); const active=this.s.getActiveSnapshot(workspace_id); const source=Number.isInteger(active.model.schema_version)?active.model.schema_version:1; if (source===target_schema_version) throw new SystemModelError('MIGRATION_NOOP','target equals current schema version'); const candidate=clone(migrate(freeze(clone(active.model)))); if (!candidate || typeof candidate !== 'object') throw new SystemModelError('MIGRATION_RESULT_INVALID','migration must return model object'); candidate.workspace_id=workspace_id; candidate.schema_version=target_schema_version; const bytes=Buffer.byteLength(canonicalStringify(candidate),'utf8'); this.resources.assertWithin('MIGRATION_BYTES',bytes); validateModel(candidate); const plan={ migration_id, workspace_id, base_snapshot_id:active.snapshot_id, source_schema_version:source, target_schema_version, candidate_model:candidate, diff:diff(active.model,candidate), candidate_bytes:bytes }; plan.migration_plan_id=`migration-plan:sha256:${hash(plan)}`; plan.standing='VALIDATED_NOT_ACTIVE'; return freeze(plan); }
  executeMigration({ plan, command_id }) { req(command_id,'command_id'); if (!plan?.migration_plan_id) throw new SystemModelError('MIGRATION_PLAN_REQUIRED','validated migration plan required'); this.a('EXECUTE_MIGRATION',{workspace_id:plan.workspace_id,migration_plan_id:plan.migration_plan_id,command_id}); const fp=hash({migration_plan_id:plan.migration_plan_id,base_snapshot_id:plan.base_snapshot_id}); const prior=this.store.getReceipt(command_id); if (prior) { if (prior.request_fingerprint!==fp) throw new SystemModelError('IDEMPOTENCY_CONFLICT','command id reused'); return freeze(prior); } const w=this.store.getWorkspace(plan.workspace_id); if (!w) throw new SystemModelError('WORKSPACE_UNKNOWN','workspace unknown'); if (w.active_snapshot_id!==plan.base_snapshot_id) throw new SystemModelError('STALE_BASE','active snapshot changed after migration planning',{base_snapshot_id:plan.base_snapshot_id,active_snapshot_id:w.active_snapshot_id}); validateModel(plan.candidate_model); const snapshot=makeSnapshot({workspace_id:plan.workspace_id,parent_snapshot_id:plan.base_snapshot_id,model:plan.candidate_model}); const cs=freeze({change_set_id:`MIGRATION:${plan.migration_id}:${plan.migration_plan_id}`,workspace_id:plan.workspace_id,base_snapshot_id:plan.base_snapshot_id,revision:1,status:'COMMITTED',operations:[{kind:'SCHEMA_MIGRATION',migration_id:plan.migration_id,target_schema_version:plan.target_schema_version}],committed_snapshot_id:snapshot.snapshot_id}); const receipt=freeze({command_id,request_fingerprint:fp,workspace_id:plan.workspace_id,change_set_id:cs.change_set_id,base_snapshot_id:plan.base_snapshot_id,snapshot_id:snapshot.snapshot_id,status:'COMMITTED',migration_plan_id:plan.migration_plan_id}); const event=freeze({event_id:`MODEL-MIGRATION:${command_id}`,workspace_id:plan.workspace_id,event_type:'MODEL_SCHEMA_MIGRATED',command_id,migration_plan_id:plan.migration_plan_id,base_snapshot_id:plan.base_snapshot_id,snapshot_id:snapshot.snapshot_id,status:'PENDING'}); return freeze(this.store.atomicCommit({workspace_id:plan.workspace_id,expected_active_snapshot_id:plan.base_snapshot_id,snapshot,change_set:cs,receipt,outbox_event:event})); }
  rollbackMigration({ workspace_id, target_snapshot_id, command_id }) { req(workspace_id,'workspace_id'); req(target_snapshot_id,'target_snapshot_id'); req(command_id,'command_id'); this.a('ROLLBACK_MIGRATION',{workspace_id,target_snapshot_id,command_id}); const w=this.store.getWorkspace(workspace_id), target=this.store.getSnapshot(target_snapshot_id); if (!w) throw new SystemModelError('WORKSPACE_UNKNOWN','workspace unknown'); if (!target || target.workspace_id!==workspace_id) throw new SystemModelError('SNAPSHOT_UNKNOWN','rollback snapshot unknown'); this.s.verifySnapshotIntegrity(target); const fp=hash({workspace_id,target_snapshot_id,rollback:true}); const prior=this.store.getReceipt(command_id); if (prior) { if (prior.request_fingerprint!==fp) throw new SystemModelError('IDEMPOTENCY_CONFLICT','command id reused'); return freeze(prior); } const snapshot=makeSnapshot({workspace_id,parent_snapshot_id:w.active_snapshot_id,model:clone(target.model)}); const cs=freeze({change_set_id:`MIGRATION-ROLLBACK:${command_id}`,workspace_id,base_snapshot_id:w.active_snapshot_id,revision:1,status:'COMMITTED',operations:[{kind:'SCHEMA_MIGRATION_ROLLBACK',target_snapshot_id}],committed_snapshot_id:snapshot.snapshot_id}); const receipt=freeze({command_id,request_fingerprint:fp,workspace_id,change_set_id:cs.change_set_id,base_snapshot_id:w.active_snapshot_id,snapshot_id:snapshot.snapshot_id,rollback_target_snapshot_id:target_snapshot_id,status:'COMMITTED'}); const event=freeze({event_id:`MODEL-MIGRATION-ROLLBACK:${command_id}`,workspace_id,event_type:'MODEL_SCHEMA_MIGRATION_ROLLED_BACK',command_id,target_snapshot_id,snapshot_id:snapshot.snapshot_id,status:'PENDING'}); return freeze(this.store.atomicCommit({workspace_id,expected_active_snapshot_id:w.active_snapshot_id,snapshot,change_set:cs,receipt,outbox_event:event})); }
}

module.exports = { AuthorizationGuard, ConformanceContractRegistry, EvidenceOutboxAdapter, GovernedModelIO, GovernedModelSnapshotService, GuardedDependencyGraphEngine, ModelMigrationService, ResourceGuard, SnapshotIntegrityInspector, summarizeModelDiff: diff };
