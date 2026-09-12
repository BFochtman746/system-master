import { DatabaseSync } from 'node:sqlite';
import { canonicalize, sha256, uuidv7, isUuidV7, isRfc3339 } from './canonical.js';
import { ControllerError } from './errors.js';
import { EVENT_SCHEMA, reduceSemanticEvents } from './semantic-events.js';
import { assertCanonicalSubjectRef, normalizeSubjectRef, sameSubject } from './subject.js';

export { ControllerError } from './errors.js';

const SCHEMA_VERSION = 4;
const TX_STATES = new Set(['OPEN','ADMITTED','ACTIVE','WAITING','SUCCEEDED','REJECTED','FAILED','CANCELLED','SUPERSEDED']);
const TX_TERMINAL = new Set(['SUCCEEDED','REJECTED','FAILED','CANCELLED','SUPERSEDED']);
const TX_TRANSITIONS = new Map([
  ['OPEN', new Set(['ADMITTED','REJECTED','CANCELLED'])],
  ['ADMITTED', new Set(['ACTIVE','CANCELLED','SUPERSEDED'])],
  ['ACTIVE', new Set(['WAITING','SUCCEEDED','FAILED','CANCELLED','SUPERSEDED'])],
  ['WAITING', new Set(['ACTIVE','FAILED','CANCELLED','SUPERSEDED'])]
]);
const OP_STATES = new Set(['PLANNED','READY','RUNNING','VERIFYING','SUCCEEDED','FAILED','BLOCKED','CANCELLED','STALE']);
const OP_TRANSITIONS = new Map([
  ['PLANNED', new Set(['READY','CANCELLED','STALE'])],
  ['READY', new Set(['BLOCKED','CANCELLED','STALE'])],
  ['RUNNING', new Set(['VERIFYING','FAILED','BLOCKED','CANCELLED','STALE'])],
  ['VERIFYING', new Set(['FAILED','BLOCKED','STALE'])],
  ['BLOCKED', new Set(['READY','CANCELLED','STALE'])]
]);
const TERMINAL_OP = new Set(['SUCCEEDED','FAILED','CANCELLED','STALE']);

function strictKeys(obj, allowed, required = allowed) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new ControllerError('SCHEMA_INVALID', 'object required');
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new ControllerError('SCHEMA_UNKNOWN_FIELD', `unknown field ${k}`);
  for (const k of required) if (!(k in obj)) throw new ControllerError('SCHEMA_MISSING_FIELD', `missing field ${k}`);
}

function normalizeCompletionContract(input = {}) {
  strictKeys(input, ['operations','qualification','promotion'], []);
  const contract = { operations:input.operations??'all_succeeded', qualification:input.qualification??'not_required', promotion:input.promotion??'not_required' };
  if (!['none','all_succeeded'].includes(contract.operations)) throw new ControllerError('COMPLETION_CONTRACT_INVALID','invalid operations completion mode');
  if (!['not_required','required'].includes(contract.qualification)) throw new ControllerError('COMPLETION_CONTRACT_INVALID','invalid qualification completion mode');
  if (!['not_required','required'].includes(contract.promotion)) throw new ControllerError('COMPLETION_CONTRACT_INVALID','invalid promotion completion mode');
  if (contract.promotion === 'required' && contract.qualification !== 'required') throw new ControllerError('COMPLETION_CONTRACT_INVALID','promotion requires qualification');
  return contract;
}

function rowSubject(row) { return { algorithm:row.subject_algorithm, oid:row.subject_oid }; }

export function validateCommand(c) {
  const allowed = ['protocol_version','schema','command_id','created_at','issuer','command_type','target','preconditions','intent','constraints','required_policy_version','fingerprint'];
  const required = ['protocol_version','schema','command_id','created_at','issuer','command_type','target','preconditions','intent','constraints','required_policy_version'];
  strictKeys(c, allowed, required);
  if (c.protocol_version !== '1.0') throw new ControllerError('UNSUPPORTED_PROTOCOL','protocol_version must be 1.0');
  if (c.schema !== 'controller://schemas/command/v1') throw new ControllerError('UNSUPPORTED_SCHEMA','unsupported command schema');
  if (!isUuidV7(c.command_id)) throw new ControllerError('SCHEMA_INVALID','command_id must be UUIDv7');
  if (!isRfc3339(c.created_at)) throw new ControllerError('SCHEMA_INVALID','created_at must use the Controller UTC timestamp profile');
  strictKeys(c.issuer, ['principal','source']);
  strictKeys(c.target, ['repository','expected_subject']);
  if (typeof c.target.repository !== 'string' || c.target.repository.length === 0) throw new ControllerError('SCHEMA_INVALID','target repository required');
  assertCanonicalSubjectRef(c.target.expected_subject);
  return true;
}

export function commandFingerprint(c) {
  const x = structuredClone(c);
  delete x.fingerprint;
  return sha256(x);
}

export class ControllerKernel {
  constructor(path = ':memory:', options = {}) {
    this.db = new DatabaseSync(path, { timeout: options.timeout ?? 5000 });
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.migrate();
  }

  close() { this.db.close(); }

  migrate() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
      const current = Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
      if (current > SCHEMA_VERSION) throw new ControllerError('SCHEMA_TOO_NEW', `database schema ${current} is newer than supported ${SCHEMA_VERSION}`);
      if (current < 1) {
        this.db.exec(`
          CREATE TABLE commands(command_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE transactions(transaction_id TEXT PRIMARY KEY, command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id), state TEXT NOT NULL CHECK(state IN ('OPEN','ADMITTED','ACTIVE','WAITING','SUCCEEDED','REJECTED','FAILED','CANCELLED','SUPERSEDED')), controller_version TEXT NOT NULL, policy_version TEXT NOT NULL, subject_repo TEXT NOT NULL, subject_sha TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE operations(operation_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), state TEXT NOT NULL CHECK(state IN ('PLANNED','READY','RUNNING','VERIFYING','SUCCEEDED','FAILED','BLOCKED','CANCELLED','STALE')), resource_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE resource_generations(resource_id TEXT PRIMARY KEY, generation INTEGER NOT NULL CHECK(generation >= 0));
          CREATE TABLE leases(lease_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES operations(operation_id), resource_id TEXT NOT NULL, worker_id TEXT NOT NULL, generation INTEGER NOT NULL CHECK(generation > 0), status TEXT NOT NULL CHECK(status IN ('ACTIVE','RELEASED','EXPIRED','REVOKED')), issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_heartbeat_at TEXT NOT NULL);
          CREATE UNIQUE INDEX one_active_lease_per_resource ON leases(resource_id) WHERE status='ACTIVE';
          CREATE TABLE events(event_id TEXT PRIMARY KEY, event_schema TEXT NOT NULL, stream_id TEXT NOT NULL, stream_version INTEGER NOT NULL CHECK(stream_version > 0), event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, data_json TEXT NOT NULL, prev_event_digest TEXT, event_digest TEXT NOT NULL, UNIQUE(stream_id, stream_version));
          CREATE TABLE outbox(outbox_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id), status TEXT NOT NULL CHECK(status IN ('PENDING','SEALED')), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, sealed_at TEXT);
          CREATE TABLE qualifications(qualification_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), subject_sha TEXT NOT NULL, policy_version TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('REQUESTED','RUNNING','PASSED','FAILED','INDETERMINATE','CANCELLED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE promotions(promotion_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), subject_sha TEXT NOT NULL, qualification_id TEXT NOT NULL REFERENCES qualifications(qualification_id), state TEXT NOT NULL CHECK(state IN ('REQUESTED','AUTHORIZED','EXECUTING','SUCCEEDED','FAILED','CANCELLED','RECONCILIATION_REQUIRED')), authorization_event_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        `);
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
      }
      const afterV1 = Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
      if (afterV1 < 2) {
        this.db.exec('ALTER TABLE transactions ADD COLUMN completion_contract_json TEXT');
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (2,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
      }
      const afterV2 = Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
      if (afterV2 < 3) {
        this.db.exec(`
          ALTER TABLE transactions RENAME COLUMN subject_sha TO subject_oid;
          ALTER TABLE transactions ADD COLUMN subject_algorithm TEXT NOT NULL DEFAULT 'sha1';
          ALTER TABLE qualifications RENAME COLUMN subject_sha TO subject_oid;
          ALTER TABLE qualifications ADD COLUMN subject_algorithm TEXT NOT NULL DEFAULT 'sha1';
          ALTER TABLE promotions RENAME COLUMN subject_sha TO subject_oid;
          ALTER TABLE promotions ADD COLUMN subject_algorithm TEXT NOT NULL DEFAULT 'sha1';
        `);
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
      }
      const afterV3 = Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
      if (afterV3 < 4) {
        this.db.exec(`
          CREATE TABLE external_effects(
            effect_id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
            operation_id TEXT NOT NULL REFERENCES operations(operation_id),
            provider TEXT NOT NULL,
            effect_type TEXT NOT NULL,
            target_key TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            request_digest TEXT NOT NULL,
            expected_remote_version TEXT,
            state TEXT NOT NULL CHECK(state IN ('PREPARED','UNKNOWN','RECONCILING','SUCCEEDED','FAILED','CANCELLED')),
            terminal_evidence_json TEXT,
            last_error_code TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(provider,idempotency_key)
          );
          CREATE TABLE external_effect_attempts(
            attempt_id TEXT PRIMARY KEY,
            effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
            attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
            lease_id TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            generation INTEGER NOT NULL CHECK(generation > 0),
            authorized_at TEXT NOT NULL,
            UNIQUE(effect_id,attempt_number)
          );
        `);
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (4,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
      }
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  atomic(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r=fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw e; }
  }

  currentStreamVersion(streamId) { return Number(this.db.prepare('SELECT COALESCE(MAX(stream_version),0) v FROM events WHERE stream_id=?').get(streamId).v); }

  appendEvent(streamId, expectedVersion, eventType, data, occurredAt = new Date().toISOString(), eventSchema = EVENT_SCHEMA) {
    if (eventSchema !== EVENT_SCHEMA) throw new ControllerError('UNSUPPORTED_EVENT_SCHEMA', `unsupported event schema ${eventSchema}`);
    const row = this.db.prepare('SELECT stream_version,event_digest FROM events WHERE stream_id=? ORDER BY stream_version DESC LIMIT 1').get(streamId);
    const current = row ? Number(row.stream_version) : 0;
    if (current !== expectedVersion) throw new ControllerError('CONCURRENCY_CONFLICT', `expected stream version ${expectedVersion}, got ${current}`);
    const version=current+1,eventId=uuidv7(),prev=row?.event_digest??null;
    const core={event_id:eventId,event_schema:eventSchema,stream_id:streamId,stream_version:version,event_type:eventType,occurred_at:occurredAt,prev_event_digest:prev,data};
    const digest=sha256(core);
    this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)').run(eventId,eventSchema,streamId,version,eventType,occurredAt,canonicalize(data),prev,digest);
    const outboxId=uuidv7();
    this.db.prepare("INSERT INTO outbox(outbox_id,event_id,status,created_at) VALUES (?,?,'PENDING',?)").run(outboxId,eventId,occurredAt);
    return {...core,event_digest:digest,outbox_id:outboxId};
  }

  acceptCommand(command,{controllerVersion='dev',policyVersion='dev'}={}) {
    validateCommand(command);
    const fp=commandFingerprint(command);
    if(command.fingerprint&&command.fingerprint!==fp) throw new ControllerError('FINGERPRINT_MISMATCH','command fingerprint mismatch');
    return this.atomic(()=>{
      const prior=this.db.prepare('SELECT fingerprint FROM commands WHERE command_id=?').get(command.command_id);
      if(prior){if(prior.fingerprint!==fp) throw new ControllerError('IDEMPOTENCY_CONFLICT','command id reused with different semantic contents');const tx=this.db.prepare('SELECT transaction_id FROM transactions WHERE command_id=?').get(command.command_id);return {duplicate:true,transaction_id:tx.transaction_id,fingerprint:fp};}
      const subject=assertCanonicalSubjectRef(command.target.expected_subject);
      this.db.prepare('INSERT INTO commands VALUES (?,?,?,?)').run(command.command_id,fp,canonicalize({...command,fingerprint:fp}),command.created_at);
      const txId=uuidv7(),now=new Date().toISOString();
      this.db.prepare('INSERT INTO transactions(transaction_id,command_id,state,controller_version,policy_version,subject_repo,subject_oid,subject_algorithm,completion_contract_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,NULL,?,?)').run(txId,command.command_id,'OPEN',controllerVersion,policyVersion,command.target.repository,subject.oid,subject.algorithm,now,now);
      this.appendEvent(`transaction:${txId}`,0,'command.accepted',{transaction_id:txId,command_id:command.command_id,fingerprint:fp,command:{...command,fingerprint:fp},controller_version:controllerVersion,policy_version:policyVersion},now);
      return {duplicate:false,transaction_id:txId,fingerprint:fp};
    });
  }

  _transitionTransaction(transactionId,to,data={}) {
    if(!TX_STATES.has(to)) throw new ControllerError('INVALID_STATE','unknown transaction state');
    const tx=this.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(transactionId);
    if(!tx) throw new ControllerError('NOT_FOUND','transaction not found');
    if(TX_TERMINAL.has(tx.state)) throw new ControllerError('ILLEGAL_TRANSITION','terminal transaction cannot transition');
    const allowed=TX_TRANSITIONS.get(tx.state)??new Set();
    if(!allowed.has(to)) throw new ControllerError('ILLEGAL_TRANSITION',`${tx.state} -> ${to} not allowed`);
    const now=new Date().toISOString();
    this.db.prepare('UPDATE transactions SET state=?,updated_at=? WHERE transaction_id=?').run(to,now,transactionId);
    this.appendEvent(`transaction:${transactionId}`,this.currentStreamVersion(`transaction:${transactionId}`),`transaction.${to.toLowerCase()}`,{transaction_id:transactionId,from:tx.state,to,...data},now);
    return to;
  }

  admitTransaction(transactionId,completionContract={}) {
    const contract=normalizeCompletionContract(completionContract);
    return this.atomic(()=>{const tx=this.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(transactionId);if(!tx) throw new ControllerError('NOT_FOUND','transaction not found');if(tx.state!=='OPEN') throw new ControllerError('ILLEGAL_TRANSITION','only OPEN transaction can be admitted');this.db.prepare('UPDATE transactions SET completion_contract_json=? WHERE transaction_id=?').run(canonicalize(contract),transactionId);this._transitionTransaction(transactionId,'ADMITTED',{completion_contract:contract});return contract;});
  }
  activateTransaction(transactionId){return this.atomic(()=>this._transitionTransaction(transactionId,'ACTIVE'));}
  waitTransaction(transactionId,reason=null){return this.atomic(()=>this._transitionTransaction(transactionId,'WAITING',{reason}));}
  resumeTransaction(transactionId){return this.atomic(()=>this._transitionTransaction(transactionId,'ACTIVE'));}
  failTransaction(transactionId,reason=null){return this.atomic(()=>this._transitionTransaction(transactionId,'FAILED',{reason}));}
  cancelTransaction(transactionId,reason=null){return this.atomic(()=>this._transitionTransaction(transactionId,'CANCELLED',{reason}));}
  rejectTransaction(transactionId,reason=null){return this.atomic(()=>this._transitionTransaction(transactionId,'REJECTED',{reason}));}

  transactionCompletionStatus(transactionId) {
    const tx=this.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(transactionId);
    if(!tx) throw new ControllerError('NOT_FOUND','transaction not found');
    if(!tx.completion_contract_json) return {satisfied:false,reason:'NO_COMPLETION_CONTRACT'};
    const contract=JSON.parse(tx.completion_contract_json);
    const operations=this.db.prepare('SELECT state FROM operations WHERE transaction_id=?').all(transactionId);
    if(contract.operations==='all_succeeded'&&(operations.length===0||operations.some(o=>o.state!=='SUCCEEDED'))) return {satisfied:false,reason:'OPERATIONS_INCOMPLETE'};
    if(contract.qualification==='required') {const q=this.db.prepare("SELECT 1 ok FROM qualifications WHERE transaction_id=? AND subject_algorithm=? AND subject_oid=? AND state='PASSED' LIMIT 1").get(transactionId,tx.subject_algorithm,tx.subject_oid);if(!q)return {satisfied:false,reason:'QUALIFICATION_INCOMPLETE'};}
    if(contract.promotion==='required') {const p=this.db.prepare("SELECT 1 ok FROM promotions WHERE transaction_id=? AND subject_algorithm=? AND subject_oid=? AND state='SUCCEEDED' LIMIT 1").get(transactionId,tx.subject_algorithm,tx.subject_oid);if(!p)return {satisfied:false,reason:'PROMOTION_INCOMPLETE'};}
    return {satisfied:true,reason:null};
  }

  completeTransaction(transactionId){return this.atomic(()=>{const tx=this.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(transactionId);if(!tx||tx.state!=='ACTIVE')throw new ControllerError('ILLEGAL_TRANSITION','only ACTIVE transaction can complete');const status=this.transactionCompletionStatus(transactionId);if(!status.satisfied)throw new ControllerError('TRANSACTION_INCOMPLETE',status.reason);return this._transitionTransaction(transactionId,'SUCCEEDED',{completion_verified:true});});}

  createOperation(transactionId,{resourceId=null}={}){return this.atomic(()=>{const tx=this.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(transactionId);if(!tx||!['ADMITTED','ACTIVE'].includes(tx.state))throw new ControllerError('TRANSACTION_NOT_ADMITTED','operation planning requires ADMITTED or ACTIVE transaction');const now=new Date().toISOString(),id=uuidv7();this.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run(id,transactionId,'PLANNED',resourceId,now,now);this.appendEvent(`operation:${id}`,0,'operation.planned',{operation_id:id,transaction_id:transactionId,resource_id:resourceId},now);return id;});}

  transitionOperation(operationId,to,expectedFrom=null){if(!OP_STATES.has(to))throw new ControllerError('INVALID_STATE','unknown operation state');if(to==='RUNNING')throw new ControllerError('LEASE_REQUIRED','RUNNING requires startLeasedOperation');if(to==='SUCCEEDED')throw new ControllerError('WORKER_RESULT_REQUIRED','SUCCEEDED requires a fenced worker result');return this.atomic(()=>{const op=this.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(operationId);if(!op)throw new ControllerError('NOT_FOUND','operation not found');if(expectedFrom&&op.state!==expectedFrom)throw new ControllerError('STATE_CONFLICT',`expected ${expectedFrom}, got ${op.state}`);if(TERMINAL_OP.has(op.state))throw new ControllerError('ILLEGAL_TRANSITION','terminal operation cannot transition');const allowed=OP_TRANSITIONS.get(op.state)??new Set();if(!allowed.has(to))throw new ControllerError('ILLEGAL_TRANSITION',`${op.state} -> ${to} not allowed`);const now=new Date().toISOString();this.db.prepare('UPDATE operations SET state=?,updated_at=? WHERE operation_id=?').run(to,now,operationId);this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),`operation.${to.toLowerCase()}`,{operation_id:operationId,transaction_id:op.transaction_id,from:op.state,to},now);return to;});}

  acquireLease(operationId,resourceId,workerId,ttlMs=60000,nowMs=Date.now()){return this.atomic(()=>{const op=this.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(operationId);if(!op)throw new ControllerError('NOT_FOUND','operation not found');if(op.state!=='READY')throw new ControllerError('LEASE_STATE_INVALID','lease requires READY operation');if(!op.resource_id||op.resource_id!==resourceId)throw new ControllerError('LEASE_RESOURCE_MISMATCH','lease resource must equal planned operation resource');const active=this.db.prepare("SELECT * FROM leases WHERE resource_id=? AND status='ACTIVE'").get(resourceId);if(active){if(Date.parse(active.expires_at)>nowMs)throw new ControllerError('LEASE_CONFLICT','resource already leased');this.db.prepare("UPDATE leases SET status='EXPIRED' WHERE lease_id=?").run(active.lease_id);}const g=this.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(resourceId),generation=(g?Number(g.generation):0)+1;this.db.prepare('INSERT INTO resource_generations(resource_id,generation) VALUES (?,?) ON CONFLICT(resource_id) DO UPDATE SET generation=excluded.generation').run(resourceId,generation);const leaseId=uuidv7(nowMs),issued=new Date(nowMs).toISOString(),expires=new Date(nowMs+ttlMs).toISOString();this.db.prepare("INSERT INTO leases VALUES (?,?,?,?,?,'ACTIVE',?,?,?)").run(leaseId,operationId,resourceId,workerId,generation,issued,expires,issued);this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),'lease.granted',{lease_id:leaseId,operation_id:operationId,resource_id:resourceId,worker_id:workerId,generation,expires_at:expires},issued);return {lease_id:leaseId,generation,expires_at:expires};});}

  assertWorkerLease({leaseId,generation,operationId},nowMs=Date.now()){const l=this.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(leaseId);if(!l)throw new ControllerError('NOT_FOUND','lease not found');const rg=this.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(l.resource_id);if(l.status!=='ACTIVE'||l.operation_id!==operationId||Number(l.generation)!==generation||Number(rg.generation)!==generation||Date.parse(l.expires_at)<=nowMs)throw new ControllerError('STALE_LEASE','stale fenced worker');return l;}
  startLeasedOperation({leaseId,generation,operationId,nowMs=Date.now()}){return this.atomic(()=>{this.assertWorkerLease({leaseId,generation,operationId},nowMs);const op=this.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(operationId);if(op.state!=='READY')throw new ControllerError('ILLEGAL_TRANSITION','leased operation must be READY before start');const now=new Date(nowMs).toISOString();this.db.prepare("UPDATE operations SET state='RUNNING',updated_at=? WHERE operation_id=?").run(now,operationId);this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),'operation.running',{operation_id:operationId,transaction_id:op.transaction_id,from:'READY',to:'RUNNING',lease_id:leaseId,generation},now);return 'RUNNING';});}
  heartbeatLease(leaseId,generation,nowMs=Date.now()){return this.atomic(()=>{const l=this.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(leaseId);if(!l)throw new ControllerError('NOT_FOUND','lease not found');const rg=this.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(l.resource_id);if(l.status!=='ACTIVE'||Number(rg.generation)!==generation||Number(l.generation)!==generation||Date.parse(l.expires_at)<=nowMs)throw new ControllerError('STALE_LEASE','lease cannot heartbeat');this.db.prepare('UPDATE leases SET last_heartbeat_at=? WHERE lease_id=?').run(new Date(nowMs).toISOString(),leaseId);return true;});}
  releaseLease(leaseId,generation,nowMs=Date.now()){return this.atomic(()=>{const l=this.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(leaseId);if(!l)throw new ControllerError('NOT_FOUND','lease not found');const rg=this.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(l.resource_id);if(l.status!=='ACTIVE'||Number(l.generation)!==generation||Number(rg.generation)!==generation)throw new ControllerError('STALE_LEASE','lease cannot release');const now=new Date(nowMs).toISOString();this.db.prepare("UPDATE leases SET status='RELEASED',last_heartbeat_at=? WHERE lease_id=?").run(now,leaseId);this.appendEvent(`operation:${l.operation_id}`,this.currentStreamVersion(`operation:${l.operation_id}`),'lease.released',{lease_id:leaseId,operation_id:l.operation_id,resource_id:l.resource_id,generation},now);return true;});}

  submitWorkerResult({leaseId,generation,operationId,result,evidence=null,nowMs=Date.now()}){if(!['SUCCEEDED','FAILED','BLOCKED'].includes(result))throw new ControllerError('WORKER_AUTHORITY_DENIED','worker may only submit bounded execution results');return this.atomic(()=>{const lease=this.assertWorkerLease({leaseId,generation,operationId},nowMs);const op=this.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(operationId);if(!['RUNNING','VERIFYING'].includes(op.state))throw new ControllerError('ILLEGAL_TRANSITION','worker result not legal from current state');const now=new Date(nowMs).toISOString();this.db.prepare('UPDATE operations SET state=?,updated_at=? WHERE operation_id=?').run(result,now,operationId);this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),`operation.${result.toLowerCase()}`,{operation_id:operationId,transaction_id:op.transaction_id,result,evidence},now);this.db.prepare("UPDATE leases SET status='RELEASED',last_heartbeat_at=? WHERE lease_id=?").run(now,leaseId);this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),'lease.released',{lease_id:leaseId,operation_id:operationId,resource_id:lease.resource_id,generation,reason:'worker-terminal-result'},now);return result;});}

  pendingOutbox(){return this.db.prepare("SELECT o.*,e.event_schema,e.stream_id,e.stream_version,e.event_type,e.occurred_at,e.data_json,e.prev_event_digest,e.event_digest FROM outbox o JOIN events e ON e.event_id=o.event_id WHERE o.status='PENDING' ORDER BY o.created_at,o.outbox_id").all();}
  markOutboxSealed(outboxId,now=new Date().toISOString()){this.db.prepare("UPDATE outbox SET status='SEALED',sealed_at=? WHERE outbox_id=? AND status='PENDING'").run(now,outboxId);}
  sealAllOutbox(){for(const o of this.pendingOutbox())this.markOutboxSealed(o.outbox_id);}
  recordOutboxFailure(outboxId,message){this.db.prepare("UPDATE outbox SET attempts=attempts+1,last_error=? WHERE outbox_id=? AND status='PENDING'").run(String(message),outboxId);}

  verifyStream(streamId){const rows=this.db.prepare('SELECT * FROM events WHERE stream_id=? ORDER BY stream_version').all(streamId);const events=rows.map(r=>({event_id:r.event_id,event_schema:r.event_schema,stream_id:r.stream_id,stream_version:Number(r.stream_version),event_type:r.event_type,occurred_at:r.occurred_at,data:JSON.parse(r.data_json),prev_event_digest:r.prev_event_digest,event_digest:r.event_digest}));reduceSemanticEvents(events);return {events:events.length,last_digest:events.at(-1)?.event_digest??null};}
  exportEvents(){return this.db.prepare('SELECT * FROM events ORDER BY stream_id,stream_version').all().map(r=>({event_id:r.event_id,event_schema:r.event_schema,stream_id:r.stream_id,stream_version:Number(r.stream_version),event_type:r.event_type,occurred_at:r.occurred_at,data:JSON.parse(r.data_json),prev_event_digest:r.prev_event_digest,event_digest:r.event_digest}));}
  static replay(events){return reduceSemanticEvents(events);}
  projection(maxAgeMs=300000,nowMs=Date.now()){const events=this.exportEvents(),state=reduceSemanticEvents(events),last=events.reduce((m,e)=>Math.max(m,Date.parse(e.occurred_at)||0),0),pending=Number(this.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='PENDING'").get().n);return {source_authority:'LOCAL_PROVISIONAL',semantic_authority:false,generated_at:new Date(nowMs).toISOString(),freshness:last&&nowMs-last<=maxAgeMs?'FRESH':'STALE',freshness_basis:'LOCAL_EVENT_RECENCY_ONLY',source_event_count:events.length,pending_outbox_count:pending,state};}

  createQualification(transactionId,subjectRef,policyVersion){const subject=normalizeSubjectRef(subjectRef);return this.atomic(()=>{const tx=this.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(transactionId);if(!tx)throw new ControllerError('NOT_FOUND','transaction not found');if(!sameSubject(rowSubject(tx),subject))throw new ControllerError('SUBJECT_MISMATCH','qualification subject differs from transaction subject');const id=uuidv7(),now=new Date().toISOString();this.db.prepare("INSERT INTO qualifications(qualification_id,transaction_id,subject_oid,subject_algorithm,policy_version,state,created_at,updated_at) VALUES (?,?,?,?,?,'REQUESTED',?,?)").run(id,transactionId,subject.oid,subject.algorithm,policyVersion,now,now);this.appendEvent(`qualification:${id}`,0,'qualification.requested',{qualification_id:id,transaction_id:transactionId,subject:rowSubject(tx),policy_version:policyVersion,state:'REQUESTED'},now);return id;});}
  startQualification(id){return this.atomic(()=>{const q=this.db.prepare('SELECT * FROM qualifications WHERE qualification_id=?').get(id);if(!q||q.state!=='REQUESTED')throw new ControllerError('ILLEGAL_TRANSITION','qualification must be REQUESTED');const now=new Date().toISOString();this.db.prepare("UPDATE qualifications SET state='RUNNING',updated_at=? WHERE qualification_id=?").run(now,id);this.appendEvent(`qualification:${id}`,this.currentStreamVersion(`qualification:${id}`),'qualification.running',{qualification_id:id,transaction_id:q.transaction_id,subject:rowSubject(q),policy_version:q.policy_version,state:'RUNNING'},now);return 'RUNNING';});}
  finishQualification(id,result){if(!['PASSED','FAILED','INDETERMINATE','CANCELLED'].includes(result))throw new ControllerError('INVALID_STATE','bad qualification result');return this.atomic(()=>{const q=this.db.prepare('SELECT * FROM qualifications WHERE qualification_id=?').get(id);if(!q||!['REQUESTED','RUNNING'].includes(q.state))throw new ControllerError('ILLEGAL_TRANSITION','qualification terminal or missing');const now=new Date().toISOString();this.db.prepare('UPDATE qualifications SET state=?,updated_at=? WHERE qualification_id=?').run(result,now,id);this.appendEvent(`qualification:${id}`,this.currentStreamVersion(`qualification:${id}`),`qualification.${result.toLowerCase()}`,{qualification_id:id,transaction_id:q.transaction_id,subject:rowSubject(q),policy_version:q.policy_version,state:result},now);return result;});}

  requestPromotion(transactionId,qualificationId,subjectRef){const subject=normalizeSubjectRef(subjectRef);return this.atomic(()=>{const q=this.db.prepare('SELECT * FROM qualifications WHERE qualification_id=?').get(qualificationId);if(!q)throw new ControllerError('NOT_FOUND','qualification not found');if(q.transaction_id!==transactionId)throw new ControllerError('TRANSACTION_MISMATCH','qualification belongs to another transaction');if(q.state!=='PASSED')throw new ControllerError('PROMOTION_NOT_QUALIFIED','qualification is not PASSED');if(!sameSubject(rowSubject(q),subject))throw new ControllerError('SUBJECT_MISMATCH','promotion subject differs from qualification');const id=uuidv7(),now=new Date().toISOString();this.db.prepare("INSERT INTO promotions(promotion_id,transaction_id,subject_oid,subject_algorithm,qualification_id,state,created_at,updated_at) VALUES (?,?,?,?,?,'REQUESTED',?,?)").run(id,transactionId,subject.oid,subject.algorithm,qualificationId,now,now);this.appendEvent(`promotion:${id}`,0,'promotion.requested',{promotion_id:id,transaction_id:transactionId,subject,qualification_id:qualificationId,state:'REQUESTED'},now);return id;});}
  authorizePromotion(id){return this.atomic(()=>{const p=this.db.prepare('SELECT * FROM promotions WHERE promotion_id=?').get(id);if(!p||p.state!=='REQUESTED')throw new ControllerError('ILLEGAL_TRANSITION','promotion not requestable');const now=new Date().toISOString(),subject=rowSubject(p),e=this.appendEvent(`promotion:${id}`,this.currentStreamVersion(`promotion:${id}`),'promotion.authorized',{promotion_id:id,transaction_id:p.transaction_id,subject,qualification_id:p.qualification_id,state:'AUTHORIZED'},now);this.db.prepare("UPDATE promotions SET state='AUTHORIZED',authorization_event_id=?,updated_at=? WHERE promotion_id=?").run(e.event_id,now,id);return e.event_id;});}

  executePromotion(id,adapter){const p=this.db.prepare('SELECT * FROM promotions WHERE promotion_id=?').get(id);if(!p||!['AUTHORIZED','EXECUTING','RECONCILIATION_REQUIRED'].includes(p.state))throw new ControllerError('ILLEGAL_TRANSITION','promotion not executable');if(typeof adapter?.observe!=='function'||typeof adapter?.apply!=='function')throw new ControllerError('PROMOTION_ADAPTER_INVALID','promotion adapter requires observe and apply');const seal=this.db.prepare("SELECT o.status FROM outbox o WHERE o.event_id=?").get(p.authorization_event_id);if(!seal||seal.status!=='SEALED')throw new ControllerError('DURABILITY_BARRIER_NOT_MET','promotion authorization is not durably sealed');const subject=rowSubject(p),observed=adapter.observe({promotion_id:id,subject});if(observed===true)return this._recordPromotionSucceeded(p,true);if(observed!==false)throw new ControllerError('EXTERNAL_STATE_UNKNOWN','promotion reality remains unknown');if(p.state==='EXECUTING'||p.state==='RECONCILIATION_REQUIRED')return this._recordPromotionAuthorizedAfterAbsent(p);try{this.db.prepare("UPDATE promotions SET state='EXECUTING',updated_at=? WHERE promotion_id=?").run(new Date().toISOString(),id);adapter.apply({promotion_id:id,subject});return this._recordPromotionSucceeded(p,false);}catch(error){return this.atomic(()=>{const now=new Date().toISOString();this.db.prepare("UPDATE promotions SET state='RECONCILIATION_REQUIRED',updated_at=? WHERE promotion_id=?").run(now,id);this.appendEvent(`promotion:${id}`,this.currentStreamVersion(`promotion:${id}`),'promotion.reconciliation-required',{promotion_id:id,transaction_id:p.transaction_id,subject,qualification_id:p.qualification_id,state:'RECONCILIATION_REQUIRED',reason:String(error.message||error)},now);return 'RECONCILIATION_REQUIRED';});}}
  _recordPromotionSucceeded(p,recovered){return this.atomic(()=>{const current=this.db.prepare('SELECT state FROM promotions WHERE promotion_id=?').get(p.promotion_id);if(current?.state==='SUCCEEDED')return 'SUCCEEDED';const now=new Date().toISOString(),subject=rowSubject(p);this.db.prepare("UPDATE promotions SET state='SUCCEEDED',updated_at=? WHERE promotion_id=?").run(now,p.promotion_id);this.appendEvent(`promotion:${p.promotion_id}`,this.currentStreamVersion(`promotion:${p.promotion_id}`),'promotion.succeeded',{promotion_id:p.promotion_id,transaction_id:p.transaction_id,subject,qualification_id:p.qualification_id,state:'SUCCEEDED',recovered},now);return 'SUCCEEDED';});}
  _recordPromotionAuthorizedAfterAbsent(p){return this.atomic(()=>{const now=new Date().toISOString(),subject=rowSubject(p);this.db.prepare("UPDATE promotions SET state='AUTHORIZED',updated_at=? WHERE promotion_id=?").run(now,p.promotion_id);this.appendEvent(`promotion:${p.promotion_id}`,this.currentStreamVersion(`promotion:${p.promotion_id}`),'promotion.reconciled-not-applied',{promotion_id:p.promotion_id,transaction_id:p.transaction_id,subject,qualification_id:p.qualification_id,state:'AUTHORIZED'},now);return 'AUTHORIZED';});}
  reconcilePromotion(id,adapter){return this.executePromotion(id,adapter);}
}
