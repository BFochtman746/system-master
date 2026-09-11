'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

function isoMs(v){ const n=Date.parse(v); if(!Number.isFinite(n)) throw new Error(`INVALID_TIME:${v}`); return n; }
function addSeconds(v,s){ return new Date(isoMs(v)+s*1000).toISOString(); }
function stable(v){ return JSON.stringify(v ?? null, Object.keys(v ?? {}).sort()); }
function effectKey(kind,id,generation){ return `${kind}:${id}:${generation}`; }

class SecondShiftKernel {
  constructor(dbPath=':memory:'){
    this.db=new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_items(
        id TEXT PRIMARY KEY,
        lane TEXT NOT NULL,
        objective_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('READY','CLAIMED','RUNNING','COMPLETED','BLOCKED','DEAD_LETTER')),
        generation INTEGER NOT NULL DEFAULT 0,
        attempt INTEGER NOT NULL DEFAULT 0,
        retry_budget INTEGER NOT NULL DEFAULT 3,
        priority INTEGER NOT NULL DEFAULT 0,
        available_at TEXT NOT NULL,
        lease_owner TEXT,
        lease_expires_at TEXT,
        heartbeat_at TEXT,
        terminal_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(lane,idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS work_ready_idx ON work_items(lane,state,available_at,priority,created_at);
      CREATE TABLE IF NOT EXISTS events(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        occurred_at TEXT NOT NULL,
        lane TEXT NOT NULL,
        work_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        FOREIGN KEY(work_id) REFERENCES work_items(id)
      );
      CREATE TABLE IF NOT EXISTS outbox(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        effect_key TEXT NOT NULL UNIQUE,
        work_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('PENDING','ACKED')) DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        acked_at TEXT,
        FOREIGN KEY(work_id) REFERENCES work_items(id)
      );
      CREATE TABLE IF NOT EXISTS authority_snapshots(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        main_sha TEXT NOT NULL,
        authority_digest TEXT NOT NULL,
        authority_json TEXT NOT NULL
      );
    `);
  }
  close(){ this.db.close(); }
  tx(fn){ this.db.exec('BEGIN IMMEDIATE'); try{ const v=fn(); this.db.exec('COMMIT'); return v; } catch(e){ try{this.db.exec('ROLLBACK');}catch(_){} throw e; } }
  event(row,type,at,detail={}){
    this.db.prepare('INSERT INTO events(event_id,occurred_at,lane,work_id,generation,event_type,detail_json) VALUES(?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(),at,row.lane,row.id,row.generation,type,JSON.stringify(detail));
  }
  snapshotAuthority({capturedAt,mainSha,authority}){
    if(!/^[0-9a-f]{40}$/i.test(mainSha)) throw new Error('INVALID_AUTHORITY_SHA');
    const json=JSON.stringify(authority); const digest=crypto.createHash('sha256').update(json).digest('hex');
    this.db.prepare('INSERT INTO authority_snapshots(captured_at,main_sha,authority_digest,authority_json) VALUES(?,?,?,?)').run(capturedAt,mainSha,digest,json);
    return {mainSha,digest};
  }
  enqueue({id,lane,objectiveId,payload={},idempotencyKey,retryBudget=3,priority=0,availableAt,now}){
    if(!id||!lane||!objectiveId||!idempotencyKey) throw new Error('WORK_IDENTITY_REQUIRED');
    if(!Number.isInteger(retryBudget)||retryBudget<0||retryBudget>20) throw new Error('INVALID_RETRY_BUDGET');
    const at=availableAt||now; isoMs(at); isoMs(now);
    return this.tx(()=>{
      const prior=this.db.prepare('SELECT * FROM work_items WHERE lane=? AND idempotency_key=?').get(lane,idempotencyKey);
      const payloadJson=JSON.stringify(payload);
      if(prior){
        if(prior.objective_id!==objectiveId || prior.payload_json!==payloadJson) throw new Error('IDEMPOTENCY_CONFLICT');
        return {...prior,duplicate:true};
      }
      this.db.prepare(`INSERT INTO work_items(id,lane,objective_id,payload_json,idempotency_key,state,retry_budget,priority,available_at,created_at,updated_at)
        VALUES(?,?,?,?,?,'READY',?,?,?,?,?)`).run(id,lane,objectiveId,payloadJson,idempotencyKey,retryBudget,priority,at,now,now);
      const row=this.get(id); this.event(row,'READY',now,{source:'ENQUEUE'}); return {...row,duplicate:false};
    });
  }
  get(id){ return this.db.prepare('SELECT * FROM work_items WHERE id=?').get(id); }
  laneActive(lane){ return this.db.prepare("SELECT * FROM work_items WHERE lane=? AND state IN ('CLAIMED','RUNNING') LIMIT 1").get(lane); }
  assertLease(row,worker,generation,now){
    if(!row) throw new Error('WORK_NOT_FOUND');
    if(!['CLAIMED','RUNNING'].includes(row.state)) throw new Error('WORK_NOT_LEASED');
    if(row.lease_owner!==worker || row.generation!==generation) throw new Error('FENCING_TOKEN_REJECTED');
    if(!row.lease_expires_at || isoMs(now)>isoMs(row.lease_expires_at)) throw new Error('LEASE_EXPIRED');
  }
  claim(lane,worker,now,leaseSeconds=300){
    isoMs(now); if(!worker) throw new Error('WORKER_REQUIRED');
    return this.tx(()=>{
      if(this.laneActive(lane)) return null;
      const row=this.db.prepare("SELECT * FROM work_items WHERE lane=? AND state='READY' AND available_at<=? ORDER BY priority DESC, created_at, id LIMIT 1").get(lane,now);
      if(!row) return null;
      const gen=row.generation+1, attempt=row.attempt+1, expires=addSeconds(now,leaseSeconds);
      this.db.prepare("UPDATE work_items SET state='CLAIMED',generation=?,attempt=?,lease_owner=?,lease_expires_at=?,heartbeat_at=?,updated_at=? WHERE id=? AND state='READY'")
        .run(gen,attempt,worker,expires,now,now,row.id);
      const next=this.get(row.id); this.event(next,'CLAIMED',now,{lease_owner:worker,lease_expires_at:expires,idempotency_key:next.idempotency_key,attempt}); return next;
    });
  }
  start(id,worker,generation,now){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now); if(row.state==='RUNNING') return row; this.db.prepare("UPDATE work_items SET state='RUNNING',updated_at=? WHERE id=?").run(now,id); const n=this.get(id); this.event(n,'RUNNING',now,{worker,idempotency_key:n.idempotency_key}); return n; }); }
  heartbeat(id,worker,generation,now,leaseSeconds=300,checkpoint=null){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now); const expires=addSeconds(now,leaseSeconds); this.db.prepare('UPDATE work_items SET heartbeat_at=?,lease_expires_at=?,updated_at=? WHERE id=?').run(now,expires,now,id); const n=this.get(id); this.event(n,'HEARTBEAT',now,{checkpoint,lease_expires_at:expires,idempotency_key:n.idempotency_key}); return n; }); }
  complete(id,worker,generation,now,result={}){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now); this.db.prepare("UPDATE work_items SET state='COMPLETED',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason=NULL,updated_at=? WHERE id=?").run(now,id); const n=this.get(id); this.event(n,'COMPLETED',now,{result,idempotency_key:n.idempotency_key}); this.outbox(n,'RECONCILE_SUCCESSOR',{terminal:'COMPLETED',result},now); return n; }); }
  block(id,worker,generation,now,reason,detail={}){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now); this.db.prepare("UPDATE work_items SET state='BLOCKED',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason=?,updated_at=? WHERE id=?").run(reason,now,id); const n=this.get(id); this.event(n,'BLOCKED',now,{reason,detail,idempotency_key:n.idempotency_key}); this.outbox(n,'SELECT_FALLBACK',{reason,detail},now); return n; }); }
  transientFailure(id,worker,generation,now,failureClass,backoffSeconds=30){
    return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now);
      this.event(row,'RETRY',now,{failure_class:failureClass,attempt:row.attempt,retry_budget:row.retry_budget});
      if(row.attempt<row.retry_budget){ const available=addSeconds(now,backoffSeconds); this.db.prepare("UPDATE work_items SET state='READY',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,available_at=?,updated_at=? WHERE id=?").run(available,now,id); const n=this.get(id); this.event(n,'READY',now,{source:'RETRY',available_at:available}); return n; }
      this.db.prepare("UPDATE work_items SET state='BLOCKED',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason=?,updated_at=? WHERE id=?").run(`RETRY_EXHAUSTED:${failureClass}`,now,id); const n=this.get(id); this.event(n,'CIRCUIT_OPEN',now,{failure_class:failureClass,retry_budget:row.retry_budget}); this.outbox(n,'SELECT_FALLBACK',{failure_class:failureClass,retry_exhausted:true},now); return n; });
  }
  outbox(row,kind,payload,now){ this.db.prepare("INSERT OR IGNORE INTO outbox(effect_key,work_id,generation,kind,payload_json,state,created_at) VALUES(?,?,?,?,?,'PENDING',?)").run(effectKey(kind,row.id,row.generation),row.id,row.generation,kind,JSON.stringify(payload),now); }
  pendingOutbox(limit=100){ return this.db.prepare("SELECT * FROM outbox WHERE state='PENDING' ORDER BY id LIMIT ?").all(limit); }
  ackOutbox(effectKeyValue,now){ return this.tx(()=>{ const r=this.db.prepare("UPDATE outbox SET state='ACKED',acked_at=? WHERE effect_key=? AND state='PENDING'").run(now,effectKeyValue); return Number(r.changes); }); }
  sweepExpired(now){
    isoMs(now); return this.tx(()=>{
      const rows=this.db.prepare("SELECT * FROM work_items WHERE state IN ('CLAIMED','RUNNING') AND lease_expires_at IS NOT NULL AND lease_expires_at<? ORDER BY lane,id").all(now);
      const results=[];
      for(const row of rows){
        this.event(row,'STALE',now,{reason:'LEASE_EXPIRED',expired_generation:row.generation});
        if(row.attempt<row.retry_budget){ this.db.prepare("UPDATE work_items SET state='READY',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,available_at=?,updated_at=? WHERE id=?").run(now,now,row.id); const n=this.get(row.id); this.event(n,'READY',now,{source:'LEASE_SWEEPER'}); results.push(n); }
        else { this.db.prepare("UPDATE work_items SET state='BLOCKED',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason='LEASE_RETRY_EXHAUSTED',updated_at=? WHERE id=?").run(now,row.id); const n=this.get(row.id); this.event(n,'CIRCUIT_OPEN',now,{reason:'LEASE_RETRY_EXHAUSTED'}); this.outbox(n,'SELECT_FALLBACK',{reason:'LEASE_RETRY_EXHAUSTED'},now); results.push(n); }
      }
      return results;
    });
  }
  startupRecover(now){ const recovered=this.sweepExpired(now); const active=this.db.prepare("SELECT lane,id,state,generation,lease_owner,lease_expires_at FROM work_items WHERE state IN ('CLAIMED','RUNNING') ORDER BY lane").all(); const ready=this.db.prepare("SELECT lane,count(*) AS count FROM work_items WHERE state='READY' GROUP BY lane ORDER BY lane").all(); return {recovered,active,ready,pending_outbox:this.pendingOutbox().length}; }
  integrity(){ return this.db.prepare('PRAGMA integrity_check').get(); }
  events(id){ return this.db.prepare('SELECT * FROM events WHERE work_id=? ORDER BY seq').all(id); }
  counts(){ return this.db.prepare('SELECT state,count(*) AS count FROM work_items GROUP BY state ORDER BY state').all(); }
}
module.exports={SecondShiftKernel};
