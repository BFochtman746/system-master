import { canonicalize, sha256 } from './canonical.js';
import { ControllerError } from './errors.js';

export const EVENT_SCHEMA = 'controller.event.v1';

export function verifyAndGroupEvents(events) {
  const grouped = new Map();
  for (const event of events) {
    if (event.event_schema !== EVENT_SCHEMA) throw new ControllerError('UNSUPPORTED_EVENT_SCHEMA', `unsupported historic event schema ${event.event_schema}`);
    if (!grouped.has(event.stream_id)) grouped.set(event.stream_id, []);
    grouped.get(event.stream_id).push(structuredClone(event));
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.stream_version - b.stream_version);
    let previousDigest = null;
    let version = 0;
    for (const event of list) {
      if (event.stream_version !== version + 1) throw new ControllerError('EVENT_GAP', 'event stream version gap');
      const core = { event_id:event.event_id,event_schema:event.event_schema,stream_id:event.stream_id,stream_version:event.stream_version,event_type:event.event_type,occurred_at:event.occurred_at,prev_event_digest:event.prev_event_digest,data:event.data };
      if (event.prev_event_digest !== previousDigest || sha256(core) !== event.event_digest) throw new ControllerError('EVENT_INTEGRITY_FAILURE', 'event chain invalid');
      previousDigest = event.event_digest;
      version += 1;
    }
  }
  return grouped;
}

export function reduceSemanticEvents(events) {
  const grouped = verifyAndGroupEvents(events);
  const state = { commands:{},transactions:{},operations:{},qualifications:{},promotions:{},resource_generations:{},last_event:null };

  for (const list of grouped.values()) {
    for (const event of list) {
      state.last_event = event.event_id;
      const d = event.data || {};
      switch (event.event_type) {
        case 'command.accepted': {
          const c = d.command;
          if (!c?.target) throw new ControllerError('RECOVERY_PAYLOAD_INVALID', 'command.accepted missing command target');
          state.commands[d.command_id] = { command:c,fingerprint:d.fingerprint,created_at:c.created_at };
          state.transactions[d.transaction_id] = { transaction_id:d.transaction_id,command_id:d.command_id,state:'OPEN',controller_version:d.controller_version,policy_version:d.policy_version,subject_repo:c.target.repository,subject_sha:c.target.expected_subject_sha,completion_contract:null,created_at:event.occurred_at,updated_at:event.occurred_at };
          break;
        }
        case 'transaction.admitted':
        case 'transaction.active':
        case 'transaction.waiting':
        case 'transaction.succeeded':
        case 'transaction.rejected':
        case 'transaction.failed':
        case 'transaction.cancelled':
        case 'transaction.superseded': {
          const tx = state.transactions[d.transaction_id];
          if (!tx) throw new ControllerError('RECOVERY_REFERENCE_MISSING', `transaction event precedes command.accepted for ${d.transaction_id}`);
          tx.state = d.to || event.event_type.slice('transaction.'.length).toUpperCase();
          if (event.event_type === 'transaction.admitted') {
            if (!d.completion_contract) throw new ControllerError('RECOVERY_PAYLOAD_INVALID', 'transaction.admitted missing completion contract');
            tx.completion_contract = structuredClone(d.completion_contract);
          }
          tx.updated_at = event.occurred_at;
          break;
        }
        case 'operation.planned':
          state.operations[d.operation_id] = { operation_id:d.operation_id,transaction_id:d.transaction_id,state:'PLANNED',resource_id:d.resource_id??null,created_at:event.occurred_at,updated_at:event.occurred_at };
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
          op.state = d.to || d.result || event.event_type.slice('operation.'.length).toUpperCase();
          op.updated_at = event.occurred_at;
          break;
        }
        case 'lease.granted': {
          if (!d.resource_id || !Number.isInteger(Number(d.generation))) throw new ControllerError('RECOVERY_PAYLOAD_INVALID','lease.granted missing resource/generation');
          state.resource_generations[d.resource_id] = Math.max(state.resource_generations[d.resource_id]||0,Number(d.generation));
          break;
        }
        case 'qualification.requested':
        case 'qualification.running':
        case 'qualification.passed':
        case 'qualification.failed':
        case 'qualification.indeterminate':
        case 'qualification.cancelled': {
          const prior = state.qualifications[d.qualification_id];
          state.qualifications[d.qualification_id] = { qualification_id:d.qualification_id,transaction_id:d.transaction_id??prior?.transaction_id,subject_sha:d.subject_sha??prior?.subject_sha,policy_version:d.policy_version??prior?.policy_version,state:d.state||event.event_type.slice('qualification.'.length).toUpperCase(),created_at:prior?.created_at??event.occurred_at,updated_at:event.occurred_at };
          break;
        }
        case 'promotion.requested':
        case 'promotion.authorized':
        case 'promotion.reconciled-not-applied':
        case 'promotion.executing':
        case 'promotion.succeeded':
        case 'promotion.failed':
        case 'promotion.reconciliation-required': {
          const prior = state.promotions[d.promotion_id];
          state.promotions[d.promotion_id] = { promotion_id:d.promotion_id,transaction_id:d.transaction_id??prior?.transaction_id,subject_sha:d.subject_sha??prior?.subject_sha,qualification_id:d.qualification_id??prior?.qualification_id,state:d.state||event.event_type.slice('promotion.'.length).replaceAll('-','_').toUpperCase(),authorization_event_id:event.event_type==='promotion.authorized'?event.event_id:prior?.authorization_event_id??null,created_at:prior?.created_at??event.occurred_at,updated_at:event.occurred_at };
          break;
        }
        default:
          break;
      }
    }
  }
  return state;
}

export function encodeEventData(data) { return canonicalize(data); }
