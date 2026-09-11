import { ControllerKernel } from './kernel.js';
import { ControllerError } from './errors.js';
import { canonicalize, uuidv7 } from './canonical.js';
import { reduceSemanticEvents } from './semantic-events.js';

export { reduceSemanticEvents } from './semantic-events.js';

export function rebuildControllerStore(path, durableEvents) {
  const state=reduceSemanticEvents(durableEvents);
  const kernel=new ControllerKernel(path);
  const existing=Number(kernel.db.prepare('SELECT COUNT(*) n FROM events').get().n);
  if(existing!==0){kernel.close();throw new ControllerError('RECOVERY_TARGET_NOT_EMPTY','recovery target must be a fresh controller store');}
  kernel.atomic(()=>{
    for(const [commandId,record] of Object.entries(state.commands)) kernel.db.prepare('INSERT INTO commands VALUES (?,?,?,?)').run(commandId,record.fingerprint,canonicalize(record.command),record.created_at);
    for(const tx of Object.values(state.transactions)) kernel.db.prepare('INSERT INTO transactions(transaction_id,command_id,state,controller_version,policy_version,subject_repo,subject_oid,subject_algorithm,completion_contract_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(tx.transaction_id,tx.command_id,tx.state,tx.controller_version,tx.policy_version,tx.subject_repo,tx.subject.oid,tx.subject.algorithm,tx.completion_contract?canonicalize(tx.completion_contract):null,tx.created_at,tx.updated_at);
    for(const op of Object.values(state.operations)) kernel.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run(op.operation_id,op.transaction_id,op.state,op.resource_id,op.created_at,op.updated_at);
    for(const [resourceId,generation] of Object.entries(state.resource_generations)) kernel.db.prepare('INSERT INTO resource_generations(resource_id,generation) VALUES (?,?)').run(resourceId,generation);
    for(const q of Object.values(state.qualifications)) kernel.db.prepare('INSERT INTO qualifications(qualification_id,transaction_id,subject_oid,policy_version,state,created_at,updated_at,subject_algorithm) VALUES (?,?,?,?,?,?,?,?)').run(q.qualification_id,q.transaction_id,q.subject.oid,q.policy_version,q.state,q.created_at,q.updated_at,q.subject.algorithm);
    for(const p of Object.values(state.promotions)) kernel.db.prepare('INSERT INTO promotions(promotion_id,transaction_id,subject_oid,qualification_id,state,authorization_event_id,created_at,updated_at,subject_algorithm) VALUES (?,?,?,?,?,?,?,?,?)').run(p.promotion_id,p.transaction_id,p.subject.oid,p.qualification_id,p.state,p.authorization_event_id,p.created_at,p.updated_at,p.subject.algorithm);
    for(const event of durableEvents){kernel.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)').run(event.event_id,event.event_schema,event.stream_id,event.stream_version,event.event_type,event.occurred_at,canonicalize(event.data),event.prev_event_digest,event.event_digest);kernel.db.prepare("INSERT INTO outbox(outbox_id,event_id,status,attempts,created_at,sealed_at) VALUES (?,?,'SEALED',0,?,?)").run(uuidv7(),event.event_id,event.occurred_at,event.occurred_at);}
  });
  return kernel;
}

export function reconcileRecoveredStore(kernel){const orphaned=kernel.db.prepare(`SELECT o.operation_id,o.state FROM operations o LEFT JOIN leases l ON l.operation_id=o.operation_id AND l.status='ACTIVE' WHERE o.state IN ('RUNNING','VERIFYING') AND l.lease_id IS NULL`).all();const staled=[];for(const op of orphaned){kernel.transitionOperation(op.operation_id,'STALE',op.state);staled.push(op.operation_id);}return {orphaned_operations_staled:staled};}
