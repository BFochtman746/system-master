import { ControllerKernel, ControllerError } from './kernel.js';
import { canonicalize, sha256 } from './canonical.js';

function verifyAndGroup(events) {
  const grouped = new Map();
  for (const event of events) {
    if (event.event_schema !== 'controller.event.v1') throw new ControllerError('UNSUPPORTED_EVENT_SCHEMA', 'unsupported historic event schema');
    if (!grouped.has(event.stream_id)) grouped.set(event.stream_id, []);
    grouped.get(event.stream_id).push(structuredClone(event));
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.stream_version - b.stream_version);
    let prior = null;
    let version = 0;
    for (const event of list) {
      if (event.stream_version !== version + 1) throw new ControllerError('EVENT_GAP', 'event stream version gap');
      const core = {
        event_id: event.event_id,
        event_schema: event.event_schema,
        stream_id: event.stream_id,
        stream_version: event.stream_version,
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        prev_event_digest: event.prev_event_digest,
        data: event.data
      };
      if (event.prev_event_digest !== prior || sha256(core) !== event.event_digest) throw new ControllerError('EVENT_INTEGRITY_FAILURE', 'event chain invalid');
      prior = event.event_digest;
      version += 1;
    }
  }
  return grouped;
}

export function reduceSemanticEvents(events) {
  const grouped = verifyAndGroup(events);
  const state = {
    commands: {},
    transactions: {},
    operations: {},
    qualifications: {},
    promotions: {},
    resource_generations: {}
  };

  for (const list of grouped.values()) {
    for (const event of list) {
      const d = event.data || {};
      switch (event.event_type) {
        case 'command.accepted': {
          const c = d.command;
          state.commands[d.command_id] = { command: c, fingerprint: d.fingerprint, created_at: c.created_at };
          state.transactions[d.transaction_id] = {
            transaction_id: d.transaction_id,
            command_id: d.command_id,
            state: 'OPEN',
            controller_version: d.controller_version,
            policy_version: d.policy_version,
            subject_repo: c.target.repository,
            subject_sha: c.target.expected_subject_sha,
            created_at: event.occurred_at,
            updated_at: event.occurred_at
          };
          break;
        }
        case 'operation.planned':
          state.operations[d.operation_id] = { operation_id: d.operation_id, transaction_id: d.transaction_id, state: 'PLANNED', resource_id: d.resource_id ?? null, created_at: event.occurred_at, updated_at: event.occurred_at };
          break;
        case 'operation.ready':
        case 'operation.running':
        case 'operation.verifying':
        case 'operation.failed':
        case 'operation.blocked':
        case 'operation.cancelled':
        case 'operation.stale':
        case 'operation.succeeded': {
          const op = state.operations[d.operation_id];
          if (!op) throw new ControllerError('RECOVERY_REFERENCE_MISSING', `operation event precedes operation.planned for ${d.operation_id}`);
          const stateName = d.to || d.result || event.event_type.slice('operation.'.length).toUpperCase();
          op.state = stateName;
          op.updated_at = event.occurred_at;
          break;
        }
        case 'lease.granted': {
          const prior = state.resource_generations[d.resource_id] || 0;
          state.resource_generations[d.resource_id] = Math.max(prior, Number(d.generation));
          break;
        }
        case 'qualification.requested':
        case 'qualification.passed':
        case 'qualification.failed':
        case 'qualification.indeterminate':
        case 'qualification.cancelled': {
          const prior = state.qualifications[d.qualification_id];
          state.qualifications[d.qualification_id] = {
            qualification_id: d.qualification_id,
            transaction_id: d.transaction_id ?? prior?.transaction_id,
            subject_sha: d.subject_sha ?? prior?.subject_sha,
            policy_version: d.policy_version ?? prior?.policy_version,
            state: d.state,
            created_at: prior?.created_at ?? event.occurred_at,
            updated_at: event.occurred_at
          };
          break;
        }
        case 'promotion.requested':
        case 'promotion.authorized':
        case 'promotion.succeeded':
        case 'promotion.failed':
        case 'promotion.reconciliation-required': {
          const prior = state.promotions[d.promotion_id];
          state.promotions[d.promotion_id] = {
            promotion_id: d.promotion_id,
            transaction_id: d.transaction_id ?? prior?.transaction_id,
            subject_sha: d.subject_sha ?? prior?.subject_sha,
            qualification_id: d.qualification_id ?? prior?.qualification_id,
            state: d.state,
            authorization_event_id: event.event_type === 'promotion.authorized' ? event.event_id : prior?.authorization_event_id ?? null,
            created_at: prior?.created_at ?? event.occurred_at,
            updated_at: event.occurred_at
          };
          break;
        }
        default:
          // Known envelope with an event type not needed by the current semantic projection.
          break;
      }
    }
  }
  return state;
}

export function rebuildControllerStore(path, durableEvents) {
  const state = reduceSemanticEvents(durableEvents);
  const kernel = new ControllerKernel(path);
  const existing = Number(kernel.db.prepare('SELECT COUNT(*) n FROM events').get().n);
  if (existing !== 0) {
    kernel.close();
    throw new ControllerError('RECOVERY_TARGET_NOT_EMPTY', 'recovery target must be a fresh controller store');
  }
  kernel.atomic(() => {
    for (const [commandId, record] of Object.entries(state.commands)) {
      kernel.db.prepare('INSERT INTO commands VALUES (?,?,?,?)').run(commandId, record.fingerprint, canonicalize(record.command), record.created_at);
    }
    for (const tx of Object.values(state.transactions)) {
      kernel.db.prepare('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?)').run(tx.transaction_id, tx.command_id, tx.state, tx.controller_version, tx.policy_version, tx.subject_repo, tx.subject_sha, tx.created_at, tx.updated_at);
    }
    for (const op of Object.values(state.operations)) {
      kernel.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run(op.operation_id, op.transaction_id, op.state, op.resource_id, op.created_at, op.updated_at);
    }
    for (const [resourceId, generation] of Object.entries(state.resource_generations)) {
      kernel.db.prepare('INSERT INTO resource_generations(resource_id,generation) VALUES (?,?)').run(resourceId, generation);
    }
    for (const q of Object.values(state.qualifications)) {
      kernel.db.prepare('INSERT INTO qualifications VALUES (?,?,?,?,?,?,?)').run(q.qualification_id, q.transaction_id, q.subject_sha, q.policy_version, q.state, q.created_at, q.updated_at);
    }
    for (const p of Object.values(state.promotions)) {
      kernel.db.prepare('INSERT INTO promotions VALUES (?,?,?,?,?,?,?,?,?)').run(p.promotion_id, p.transaction_id, p.subject_sha, p.qualification_id, p.state, p.authorization_event_id, p.created_at, p.updated_at);
    }
    for (const event of durableEvents) {
      kernel.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)').run(event.event_id, event.event_schema, event.stream_id, event.stream_version, event.event_type, event.occurred_at, canonicalize(event.data), event.prev_event_digest, event.event_digest);
    }
  });
  return kernel;
}
