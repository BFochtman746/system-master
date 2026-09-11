'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const ALLOWED_LANES=new Set(['CORE','LEARNING','BOOK','DOCUMENTS']);
const MAX_RETRY_BUDGET=3;
const MAX_LEASE_SECONDS=3600;
function isoMs(v){ const n=Date.parse(v); if(!Number.isFinite(n)) throw new Error(`INVALID_TIME:${v}`); return n; }
function norm(v){ return new Date(isoMs(v)).toISOString(); }
function addSeconds(v,s){ return new Date(isoMs(v)+s*1000).toISOString(); }
function effectKey(kind,id,generation){ return `${kind}:${id}:${generation}`; }
function validSha(v){ return /^[0-9a-f]{40}$/i.test(v||''); }
function validateLeaseSeconds(v){ if(!Number.isInteger(v)||v<1||v>MAX_LEASE_SECONDS) throw new Error('INVALID_LEASE_DURATION'); }
function nyParts(v){
  const d=new Date(isoMs(v));
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second)};
}
function isSecondShiftOpen(v){ const p=nyParts(v); return p.hour>=0 && p.hour<7; }

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
        control_ref TEXT NOT NULL,
        control_head TEXT NOT NULL,
        authority_sha TEXT NOT NULL,
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
      .run(crypto.randomUUID(),norm(at),row.lane,row.id,row.generation,type,JSON.stringify(detail));
  }
  snapshotAuthority({capturedAt,mainSha,authority}){
    if(!validSha(mainSha)) throw new Error('INVALID_AUTHORITY_SHA');
    const json=JSON.stringify(authority); const digest=crypto.createHash('sha256').update(json).digest('hex');
    this.db.prepare('INSERT INTO authority_snapshots(captured_at,main_sha,authority_digest,authority_json) VALUES(?,?,?,?)').run(norm(capturedAt),mainSha,digest,json);
    return {mainSha,digest};
  }
  isShiftOpen(now){ return isSecondShiftOpen(now); }
  shiftIdentity(now){ const p=nyParts(now); return {shift_date:p.date,timezone:'America/New_York',open:this.isShiftOpen(now),local_hour:p.hour}; }
  assertMonotonic(row,now){ if(row && isoMs(now)<isoMs(row.updated_at)) throw new Error('CLOCK_ROLLBACK_DETECTED'); }
  assertControl(row,currentControl){
    if(!currentControl || !currentControl.controlRef || !currentControl.controlHead) throw new Error('CURRENT_CONTROL_REQUIRED');
    if(!validSha(currentControl.controlHead)) throw new Error('CURRENT_CONTROL_HEAD_INVALID');
    if(row.control_ref!==currentControl.controlRef || row.control_head!==currentControl.controlHead) throw new Error('AUTHORITY_FENCE_REJECTED');
  }
  enqueue({id,lane,objectiveId,payload={},idempotencyKey,retryBudget=3,priority=0,availableAt,now,controlRef,controlHead,authoritySha}){
    if(!id||!lane||!objectiveId||!idempotencyKey||!controlRef) throw new Error('WORK_IDENTITY_REQUIRED');
    if(!ALLOWED_LANES.has(lane)) throw new Error('INVALID_LANE');
    if(!validSha(controlHead)||!validSha(authoritySha)) throw new Error('WORK_AUTHORITY_REQUIRED');
    if(!Number.isInteger(retryBudget)||retryBudget<0||retryBudget>MAX_RETRY_BUDGET) throw new Error('INVALID_RETRY_BUDGET');
    if(!Number.isInteger(priority)) throw new Error('INVALID_PRIORITY');
    const nowN=norm(now), at=norm(availableAt||now);
    return this.tx(()=>{
      const prior=this.db.prepare('SELECT * FROM work_items WHERE lane=? AND idempotency_key=?').get(lane,idempotencyKey);
      const payloadJson=JSON.stringify(payload);
      if(prior){
        if(prior.objective_id!==objectiveId || prior.payload_json!==payloadJson || prior.control_ref!==controlRef || prior.control_head!==controlHead) throw new Error('IDEMPOTENCY_CONFLICT');
        return {...prior,duplicate:true};
      }
      this.db.prepare(`INSERT INTO work_items(id,lane,objective_id,payload_json,idempotency_key,control_ref,control_head,authority_sha,state,retry_budget,priority,available_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?, 'READY',?,?,?,?,?)`).run(id,lane,objectiveId,payloadJson,idempotencyKey,controlRef,controlHead,authoritySha,retryBudget,priority,at,nowN,nowN);
      const row=this.get(id); this.event(row,'READY',nowN,{source:'ENQUEUE',control_ref:controlRef,control_head:controlHead,authority_sha:authoritySha}); return {...row,duplicate:false};
    });
  }
  get(id){ return this.db.prepare('SELECT * FROM work_items WHERE id=?').get(id); }
  laneActive(lane){ return this.db.prepare("SELECT * FROM work_items WHERE lane=? AND state IN ('CLAIMED','RUNNING') LIMIT 1").get(lane); }
  assertLease(row,worker,generation,now,currentControl){
    if(!row) throw new Error('WORK_NOT_FOUND'); this.assertMonotonic(row,now); this.assertControl(row,currentControl);
    if(!['CLAIMED','RUNNING'].includes(row.state)) throw new Error('WORK_NOT_LEASED');
    if(row.lease_owner!==worker || row.generation!==generation) throw new Error('FENCING_TOKEN_REJECTED');
    if(!row.lease_expires_at || isoMs(now)>=isoMs(row.lease_expires_at)) throw new Error('LEASE_EXPIRED');
  }
  reconcileAuthority(lane,currentControl,now){
    if(!ALLOWED_LANES.has(lane)) throw new Error('INVALID_LANE');
    const nowN=norm(now); if(!currentControl||!currentControl.controlRef||!validSha(currentControl.controlHead)) throw new Error('CURRENT_CONTROL_REQUIRED');
    return this.tx(()=>{
      const stale=this.db.prepare("SELECT * FROM work_items WHERE lane=? AND state IN ('READY','CLAIMED','RUNNING') AND (control_ref<>? OR control_head<>?) ORDER BY id").all(lane,currentControl.controlRef,currentControl.controlHead);
      for(const row of stale){
        this.db.prepare("UPDATE work_items SET state='BLOCKED',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason='AUTHORITY_CHANGED',updated_at=? WHERE id=?").run(nowN,row.id);
        const n=this.get(row.id); this.event(n,'STALE',nowN,{reason:'AUTHORITY_CHANGED',prior_control_ref:row.control_ref,prior_control_head:row.control_head,current_control_ref:currentControl.controlRef,current_control_head:currentControl.controlHead}); this.outbox(n,'REVALIDATE_AUTHORITY',{currentControl},nowN);
      }
      return stale.length;
    });
  }
  claim(lane,worker,now,leaseSeconds=300,currentControl){
    if(!ALLOWED_LANES.has(lane)) throw new Error('INVALID_LANE'); validateLeaseSeconds(leaseSeconds);
    const nowN=norm(now); if(!worker) throw new Error('WORKER_REQUIRED'); if(!this.isShiftOpen(nowN)) throw new Error('SHIFT_CLOSED');
    if(!currentControl||!currentControl.controlRef||!validSha(currentControl.controlHead)) throw new Error('CURRENT_CONTROL_REQUIRED');
    this.reconcileAuthority(lane,currentControl,nowN);
    return this.tx(()=>{
      if(this.laneActive(lane)) return null;
      const row=this.db.prepare("SELECT * FROM work_items WHERE lane=? AND state='READY' AND available_at<=? AND control_ref=? AND control_head=? ORDER BY priority DESC, created_at, id LIMIT 1").get(lane,nowN,currentControl.controlRef,currentControl.controlHead);
      if(!row) return null;
      const gen=row.generation+1, attempt=row.attempt+1, expires=addSeconds(nowN,leaseSeconds);
      this.db.prepare("UPDATE work_items SET state='CLAIMED',generation=?,attempt=?,lease_owner=?,lease_expires_at=?,heartbeat_at=?,updated_at=? WHERE id=? AND state='READY'")
        .run(gen,attempt,worker,expires,nowN,nowN,row.id);
      const next=this.get(row.id); this.event(next,'CLAIMED',nowN,{lease_owner:worker,lease_expires_at:expires,idempotency_key:next.idempotency_key,attempt,control_head:next.control_head}); return next;
    });
  }
  start(id,worker,generation,now,currentControl){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now,currentControl); if(row.state==='RUNNING') return row; const nowN=norm(now); this.db.prepare("UPDATE work_items SET state='RUNNING',updated_at=? WHERE id=?").run(nowN,id); const n=this.get(id); this.event(n,'RUNNING',nowN,{worker,idempotency_key:n.idempotency_key}); return n; }); }
  heartbeat(id,worker,generation,now,leaseSeconds=300,checkpoint=null,currentControl){ validateLeaseSeconds(leaseSeconds); return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now,currentControl); const nowN=norm(now),expires=addSeconds(nowN,leaseSeconds); this.db.prepare('UPDATE work_items SET heartbeat_at=?,lease_expires_at=?,updated_at=? WHERE id=?').run(nowN,expires,nowN,id); const n=this.get(id); this.event(n,'HEARTBEAT',nowN,{checkpoint,lease_expires_at:expires,idempotency_key:n.idempotency_key}); return n; }); }
  complete(id,worker,generation,now,result={},currentControl){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now,currentControl); const nowN=norm(now); this.db.prepare("UPDATE work_items SET state='COMPLETED',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason=NULL,updated_at=? WHERE id=?").run(nowN,id); const n=this.get(id); this.event(n,'COMPLETED',nowN,{result,idempotency_key:n.idempotency_key}); this.outbox(n,'RECONCILE_SUCCESSOR',{terminal:'COMPLETED',result},nowN); return n; }); }
  block(id,worker,generation,now,reason,detail={},currentControl){ return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now,currentControl); const nowN=norm(now); this.db.prepare("UPDATE work_items SET state='BLOCKED',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason=?,updated_at=? WHERE id=?").run(reason,nowN,id); const n=this.get(id); this.event(n,'BLOCKED',nowN,{reason,detail,idempotency_key:n.idempotency_key}); this.outbox(n,'SELECT_FALLBACK',{reason,detail},nowN); return n; }); }
  transientFailure(id,worker,generation,now,failureClass,backoffSeconds=30,currentControl){
    if(!Number.isInteger(backoffSeconds)||backoffSeconds<0||backoffSeconds>3600) throw new Error('INVALID_BACKOFF');
    return this.tx(()=>{ const row=this.get(id); this.assertLease(row,worker,generation,now,currentControl); const nowN=norm(now);
      this.event(row,'RETRY',nowN,{failure_class:failureClass,attempt:row.attempt,retry_budget:row.retry_budget});
      if(row.attempt<row.retry_budget){ const available=addSeconds(nowN,backoffSeconds); this.db.prepare("UPDATE work_items SET state='READY',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,available_at=?,updated_at=? WHERE id=?").run(available,nowN,id); const n=this.get(id); this.event(n,'READY',nowN,{source:'RETRY',available_at:available}); return n; }
      this.db.prepare("UPDATE work_items SET state='BLOCKED',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason=?,updated_at=? WHERE id=?").run(`RETRY_EXHAUSTED:${failureClass}`,nowN,id); const n=this.get(id); this.event(n,'CIRCUIT_OPEN',nowN,{failure_class:failureClass,retry_budget:row.retry_budget}); this.outbox(n,'SELECT_FALLBACK',{failure_class:failureClass,retry_exhausted:true},nowN); return n; });
  }
  outbox(row,kind,payload,now){ this.db.prepare("INSERT OR IGNORE INTO outbox(effect_key,work_id,generation,kind,payload_json,state,created_at) VALUES(?,?,?,?,?,'PENDING',?)").run(effectKey(kind,row.id,row.generation),row.id,row.generation,kind,JSON.stringify(payload),norm(now)); }
  pendingOutbox(limit=100){ return this.db.prepare("SELECT * FROM outbox WHERE state='PENDING' ORDER BY id LIMIT ?").all(limit); }
  ackOutbox(effectKeyValue,now){ return this.tx(()=>{ const r=this.db.prepare("UPDATE outbox SET state='ACKED',acked_at=? WHERE effect_key=? AND state='PENDING'").run(norm(now),effectKeyValue); return Number(r.changes); }); }
  sweepExpired(now){
    const nowN=norm(now); return this.tx(()=>{
      const rows=this.db.prepare("SELECT * FROM work_items WHERE state IN ('CLAIMED','RUNNING') AND lease_expires_at IS NOT NULL AND lease_expires_at<=? ORDER BY lane,id").all(nowN);
      const results=[];
      for(const row of rows){
        this.event(row,'STALE',nowN,{reason:'LEASE_EXPIRED',expired_generation:row.generation});
        if(row.attempt<row.retry_budget){ this.db.prepare("UPDATE work_items SET state='READY',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,available_at=?,updated_at=? WHERE id=?").run(nowN,nowN,row.id); const n=this.get(row.id); this.event(n,'READY',nowN,{source:'LEASE_SWEEPER'}); results.push(n); }
        else { this.db.prepare("UPDATE work_items SET state='BLOCKED',generation=generation+1,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,terminal_reason='LEASE_RETRY_EXHAUSTED',updated_at=? WHERE id=?").run(nowN,row.id); const n=this.get(row.id); this.event(n,'CIRCUIT_OPEN',nowN,{reason:'LEASE_RETRY_EXHAUSTED'}); this.outbox(n,'SELECT_FALLBACK',{reason:'LEASE_RETRY_EXHAUSTED'},nowN); results.push(n); }
      }
      return results;
    });
  }
  startupRecover(now){ const recovered=this.sweepExpired(now); const active=this.db.prepare("SELECT lane,id,state,generation,lease_owner,lease_expires_at,control_ref,control_head FROM work_items WHERE state IN ('CLAIMED','RUNNING') ORDER BY lane").all(); const ready=this.db.prepare("SELECT lane,count(*) AS count FROM work_items WHERE state='READY' GROUP BY lane ORDER BY lane").all(); return {recovered,active,ready,pending_outbox:this.pendingOutbox().length,shift:this.shiftIdentity(now)}; }
  integrity(){ return this.db.prepare('PRAGMA integrity_check').get(); }
  events(id){ return this.db.prepare('SELECT * FROM events WHERE work_id=? ORDER BY seq').all(id); }
  counts(){ return this.db.prepare('SELECT state,count(*) AS count FROM work_items GROUP BY state ORDER BY state').all(); }
}
module.exports={SecondShiftKernel,isSecondShiftOpen,nyParts,ALLOWED_LANES,MAX_RETRY_BUDGET,MAX_LEASE_SECONDS};
