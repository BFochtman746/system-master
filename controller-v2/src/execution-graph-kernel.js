import { ControllerKernel } from './kernel.js';
import { ControllerError } from './errors.js';
import { sha256 } from './canonical.js';
import { rebuildControllerStore } from './recovery.js';

export const EXECUTION_GRAPH_SCHEMA_VERSION = 6;
export const OPERATION_DEPENDENCY_PROTOCOL = 'controller.operation-dependency/v1';
export const OPERATION_DEPENDENCY_RELATION = 'REQUIRES_SUCCESS';

const TX_ELIGIBLE = new Set(['ADMITTED', 'ACTIVE']);
const PREREQUISITE_WAITING = new Set(['PLANNED', 'READY', 'RUNNING', 'VERIFYING', 'BLOCKED']);
const PREREQUISITE_TERMINAL_BLOCK = new Set(['FAILED', 'CANCELLED', 'STALE']);
const OPERATION_STATE_EVENT = new Map([
  ['operation.planned', 'PLANNED'],
  ['operation.ready', 'READY'],
  ['operation.running', 'RUNNING'],
  ['operation.verifying', 'VERIFYING'],
  ['operation.succeeded', 'SUCCEEDED'],
  ['operation.failed', 'FAILED'],
  ['operation.blocked', 'BLOCKED'],
  ['operation.cancelled', 'CANCELLED'],
  ['operation.stale', 'STALE']
]);

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function currentSchemaVersion(db) {
  if (!hasTable(db, 'schema_migrations')) return 0;
  return Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
}

function dependencySemantic(transactionId, dependentOperationId, prerequisiteOperationId) {
  return {
    protocol: OPERATION_DEPENDENCY_PROTOCOL,
    transaction_id: transactionId,
    dependent_operation_id: dependentOperationId,
    prerequisite_operation_id: prerequisiteOperationId,
    relation: OPERATION_DEPENDENCY_RELATION
  };
}

export function operationDependencyId(transactionId, dependentOperationId, prerequisiteOperationId) {
  return sha256(dependencySemantic(transactionId, dependentOperationId, prerequisiteOperationId));
}

function assertString(value, code, message) {
  if (typeof value !== 'string' || value.length === 0) throw new ControllerError(code, message);
}

export class ExecutionGraphKernel extends ControllerKernel {
  migrate() {
    let current = currentSchemaVersion(this.db);

    if (current === 0 || current < 5) {
      super.migrate();
      current = currentSchemaVersion(this.db);
    }

    if (current > EXECUTION_GRAPH_SCHEMA_VERSION) {
      throw new ControllerError('SCHEMA_TOO_NEW', `database schema ${current} is newer than supported ${EXECUTION_GRAPH_SCHEMA_VERSION}`);
    }

    if (current === 5) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(`
          CREATE TABLE operation_dependencies(
            dependency_id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
            dependent_operation_id TEXT NOT NULL REFERENCES operations(operation_id),
            prerequisite_operation_id TEXT NOT NULL REFERENCES operations(operation_id),
            relation TEXT NOT NULL CHECK(relation='REQUIRES_SUCCESS'),
            created_at TEXT NOT NULL,
            UNIQUE(dependent_operation_id, prerequisite_operation_id)
          );
        `);
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (6,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
        this.db.exec('COMMIT');
      } catch (error) {
        if (this.db.isTransaction) this.db.exec('ROLLBACK');
        throw error;
      }
      current = 6;
    }

    if (current !== EXECUTION_GRAPH_SCHEMA_VERSION || !hasTable(this.db, 'operation_dependencies')) {
      throw new ControllerError('SCHEMA_INCOMPLETE', 'execution graph schema v6 is incomplete');
    }
  }

  _dependencyRows(dependentOperationId) {
    return this.db.prepare(`
      SELECT d.dependency_id,d.transaction_id,d.dependent_operation_id,d.prerequisite_operation_id,d.relation,
             p.state prerequisite_state
      FROM operation_dependencies d
      JOIN operations p ON p.operation_id=d.prerequisite_operation_id
      WHERE d.dependent_operation_id=?
      ORDER BY d.prerequisite_operation_id
    `).all(dependentOperationId);
  }

  _wouldCreateCycle(dependentOperationId, prerequisiteOperationId) {
    if (dependentOperationId === prerequisiteOperationId) return true;
    const row = this.db.prepare(`
      WITH RECURSIVE reach(operation_id) AS (
        SELECT prerequisite_operation_id
        FROM operation_dependencies
        WHERE dependent_operation_id=?
        UNION
        SELECT d.prerequisite_operation_id
        FROM operation_dependencies d
        JOIN reach r ON d.dependent_operation_id=r.operation_id
      )
      SELECT 1 cycle FROM reach WHERE operation_id=? LIMIT 1
    `).get(prerequisiteOperationId, dependentOperationId);
    return Boolean(row);
  }

  _classifyDependencyEligibility(operationId) {
    assertString(operationId, 'DEPENDENCY_OPERATION_INVALID', 'operationId required');
    const row = this.db.prepare(`
      SELECT o.operation_id,o.transaction_id,o.state operation_state,t.state transaction_state
      FROM operations o JOIN transactions t ON t.transaction_id=o.transaction_id
      WHERE o.operation_id=?
    `).get(operationId);
    if (!row) throw new ControllerError('NOT_FOUND', 'operation not found');

    const base = {
      operation_id: row.operation_id,
      transaction_id: row.transaction_id,
      transaction_state: row.transaction_state,
      operation_state: row.operation_state
    };

    if (!TX_ELIGIBLE.has(row.transaction_state)) {
      return { ...base, standing: 'INELIGIBLE_TRANSACTION', prerequisites: [] };
    }
    if (row.operation_state !== 'PLANNED') {
      return { ...base, standing: 'INELIGIBLE_OPERATION_STATE', prerequisites: [] };
    }

    const deps = this._dependencyRows(operationId).map((dep) => ({
      dependency_id: dep.dependency_id,
      prerequisite_operation_id: dep.prerequisite_operation_id,
      prerequisite_state: dep.prerequisite_state,
      relation: dep.relation
    }));

    const terminal = deps.filter((dep) => PREREQUISITE_TERMINAL_BLOCK.has(dep.prerequisite_state));
    if (terminal.length > 0) {
      return { ...base, standing: 'BLOCKED_DEPENDENCY_TERMINAL', prerequisites: deps, blocking_prerequisites: terminal };
    }

    const waiting = deps.filter((dep) => PREREQUISITE_WAITING.has(dep.prerequisite_state));
    if (waiting.length > 0) {
      return { ...base, standing: 'WAITING_DEPENDENCY', prerequisites: deps, waiting_prerequisites: waiting };
    }

    if (deps.some((dep) => dep.prerequisite_state !== 'SUCCEEDED')) {
      throw new ControllerError('DEPENDENCY_STATE_INVALID', 'unexpected prerequisite state');
    }

    return { ...base, standing: 'ELIGIBLE', prerequisites: deps };
  }

  classifyDependencyEligibility(operationId) {
    return structuredClone(this._classifyDependencyEligibility(operationId));
  }

  _validateEdgeRows(dependentOperationId, prerequisiteOperationId) {
    assertString(dependentOperationId, 'DEPENDENCY_OPERATION_INVALID', 'dependent operation required');
    assertString(prerequisiteOperationId, 'DEPENDENCY_OPERATION_INVALID', 'prerequisite operation required');
    if (dependentOperationId === prerequisiteOperationId) throw new ControllerError('DEPENDENCY_SELF_CYCLE', 'operation cannot depend on itself');

    const dependent = this.db.prepare('SELECT operation_id,transaction_id,state FROM operations WHERE operation_id=?').get(dependentOperationId);
    if (!dependent) throw new ControllerError('NOT_FOUND', 'dependent operation not found');
    const prerequisite = this.db.prepare('SELECT operation_id,transaction_id,state FROM operations WHERE operation_id=?').get(prerequisiteOperationId);
    if (!prerequisite) throw new ControllerError('NOT_FOUND', 'prerequisite operation not found');
    if (dependent.transaction_id !== prerequisite.transaction_id) throw new ControllerError('DEPENDENCY_SCOPE_INVALID', 'v1 dependencies must remain inside one transaction');
    return { dependent, prerequisite };
  }

  addOperationDependency(dependentOperationId, prerequisiteOperationId, occurredAt = new Date().toISOString()) {
    return this.atomic(() => {
      const { dependent } = this._validateEdgeRows(dependentOperationId, prerequisiteOperationId);
      const dependencyId = operationDependencyId(dependent.transaction_id, dependentOperationId, prerequisiteOperationId);
      const existing = this.db.prepare('SELECT * FROM operation_dependencies WHERE dependent_operation_id=? AND prerequisite_operation_id=?').get(dependentOperationId, prerequisiteOperationId);
      if (existing) {
        if (existing.dependency_id !== dependencyId || existing.transaction_id !== dependent.transaction_id || existing.relation !== OPERATION_DEPENDENCY_RELATION) {
          throw new ControllerError('DEPENDENCY_IDEMPOTENCY_CONFLICT', 'existing dependency differs from canonical semantic identity');
        }
        return { dependency_id: dependencyId, duplicate: true, changed: false };
      }
      if (dependent.state !== 'PLANNED') throw new ControllerError('DEPENDENCY_SET_FROZEN', 'dependencies may only be added while dependent operation is PLANNED');
      if (this._wouldCreateCycle(dependentOperationId, prerequisiteOperationId)) throw new ControllerError('DEPENDENCY_CYCLE', 'dependency would create a cycle');

      this.db.prepare('INSERT INTO operation_dependencies(dependency_id,transaction_id,dependent_operation_id,prerequisite_operation_id,relation,created_at) VALUES (?,?,?,?,?,?)')
        .run(dependencyId, dependent.transaction_id, dependentOperationId, prerequisiteOperationId, OPERATION_DEPENDENCY_RELATION, occurredAt);
      this.appendEvent(`operation:${dependentOperationId}`, this.currentStreamVersion(`operation:${dependentOperationId}`), 'operation.dependency_added', {
        dependency_id: dependencyId,
        transaction_id: dependent.transaction_id,
        dependent_operation_id: dependentOperationId,
        prerequisite_operation_id: prerequisiteOperationId,
        relation: OPERATION_DEPENDENCY_RELATION
      }, occurredAt);
      return { dependency_id: dependencyId, duplicate: false, changed: true };
    });
  }

  markOperationReadyIfEligible(operationId, occurredAt = new Date().toISOString()) {
    return this.atomic(() => {
      const current = this.db.prepare('SELECT operation_id,transaction_id,state FROM operations WHERE operation_id=?').get(operationId);
      if (!current) throw new ControllerError('NOT_FOUND', 'operation not found');
      if (current.state === 'READY') return { operation_id: operationId, state: 'READY', changed: false, standing: 'ALREADY_READY' };
      const eligibility = this._classifyDependencyEligibility(operationId);
      if (eligibility.standing !== 'ELIGIBLE') {
        throw new ControllerError('DEPENDENCY_NOT_ELIGIBLE', eligibility.standing);
      }
      const changed = this.db.prepare("UPDATE operations SET state='READY',updated_at=? WHERE operation_id=? AND state='PLANNED'").run(occurredAt, operationId);
      if (Number(changed.changes) !== 1) throw new ControllerError('STATE_CONFLICT', 'operation changed before readiness commit');
      this.appendEvent(`operation:${operationId}`, this.currentStreamVersion(`operation:${operationId}`), 'operation.ready', {
        operation_id: operationId,
        transaction_id: current.transaction_id,
        from: 'PLANNED',
        to: 'READY'
      }, occurredAt);
      const reread = this.db.prepare('SELECT state,updated_at FROM operations WHERE operation_id=?').get(operationId);
      return { operation_id: operationId, state: reread.state, updated_at: reread.updated_at, changed: true, standing: 'READY' };
    });
  }

  _restoreDependencyEvent(event) {
    const d = event?.data || {};
    if (event.event_type !== 'operation.dependency_added') throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'wrong dependency event type');
    for (const key of ['dependency_id', 'transaction_id', 'dependent_operation_id', 'prerequisite_operation_id', 'relation']) {
      assertString(d[key], 'RECOVERY_DEPENDENCY_INVALID', `dependency event missing ${key}`);
    }
    if (d.relation !== OPERATION_DEPENDENCY_RELATION) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'unsupported dependency relation');
    if (event.stream_id !== `operation:${d.dependent_operation_id}`) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'dependency event stream does not match dependent operation');
    const { dependent } = this._validateEdgeRows(d.dependent_operation_id, d.prerequisite_operation_id);
    if (dependent.transaction_id !== d.transaction_id) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'dependency transaction binding mismatch');
    const expected = operationDependencyId(d.transaction_id, d.dependent_operation_id, d.prerequisite_operation_id);
    if (d.dependency_id !== expected) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'dependency identity mismatch');
    const existing = this.db.prepare('SELECT dependency_id FROM operation_dependencies WHERE dependent_operation_id=? AND prerequisite_operation_id=?').get(d.dependent_operation_id, d.prerequisite_operation_id);
    if (existing) {
      if (existing.dependency_id !== expected) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'conflicting recovered dependency');
      return false;
    }
    if (this._wouldCreateCycle(d.dependent_operation_id, d.prerequisite_operation_id)) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'recovered dependency graph contains a cycle');
    this.db.prepare('INSERT INTO operation_dependencies(dependency_id,transaction_id,dependent_operation_id,prerequisite_operation_id,relation,created_at) VALUES (?,?,?,?,?,?)')
      .run(expected, d.transaction_id, d.dependent_operation_id, d.prerequisite_operation_id, OPERATION_DEPENDENCY_RELATION, event.occurred_at);
    return true;
  }

  restoreDependencyProjection(events = this.exportEvents()) {
    if (!Array.isArray(events)) throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'events array required');
    return this.atomic(() => {
      const currentCount = Number(this.db.prepare('SELECT COUNT(*) n FROM operation_dependencies').get().n);
      if (currentCount !== 0) throw new ControllerError('RECOVERY_DEPENDENCY_TARGET_NOT_EMPTY', 'dependency recovery target must be empty');

      const byStream = new Map();
      for (const event of events) {
        if (!byStream.has(event.stream_id)) byStream.set(event.stream_id, []);
        byStream.get(event.stream_id).push(event);
      }

      let restored = 0;
      for (const [streamId, list] of byStream.entries()) {
        if (!streamId.startsWith('operation:')) continue;
        list.sort((a, b) => a.stream_version - b.stream_version);
        let observedState = null;
        for (const event of list) {
          if (event.event_type === 'operation.dependency_added') {
            if (observedState !== 'PLANNED') throw new ControllerError('RECOVERY_DEPENDENCY_INVALID', 'dependency event occurred outside PLANNED mutation window');
            if (this._restoreDependencyEvent(event)) restored += 1;
          }
          if (OPERATION_STATE_EVENT.has(event.event_type)) observedState = OPERATION_STATE_EVENT.get(event.event_type);
        }
      }
      return restored;
    });
  }
}

export function rebuildExecutionControllerStore(path, durableEntries, options = {}) {
  const base = rebuildControllerStore(path, durableEntries, options);
  const checkpoint = base.recoveredJournalCheckpoint;
  const events = base.exportEvents();
  base.close();

  let kernel;
  try {
    kernel = new ExecutionGraphKernel(path);
    kernel.restoreDependencyProjection(events);
    Object.defineProperty(kernel, 'recoveredJournalCheckpoint', {
      value: checkpoint,
      writable: false,
      enumerable: true,
      configurable: false
    });
    return kernel;
  } catch (error) {
    if (kernel) kernel.close();
    throw error;
  }
}
