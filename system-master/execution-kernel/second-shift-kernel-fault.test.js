'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const {SecondShiftKernel}=require('./second-shift-kernel');
const CHILD=path.join(__dirname,'second-shift-kernel-fault-child.js');
const HEAD='a'.repeat(40),AUTH='c'.repeat(40),CTRL={controlRef:'system-master/control-v2',controlHead:HEAD};
const BASE='2026-09-11T05:00:00.000Z';
function item(id,lane='CORE'){return {id,lane,objectiveId:`O-${id}`,payload:{id},idempotencyKey:`K-${id}`,retryBudget:3,now:BASE,controlRef:CTRL.controlRef,controlHead:CTRL.controlHead,authoritySha:AUTH};}
function spawn(args){return new Promise(resolve=>{const p=cp.spawn(process.execPath,[CHILD,...args],{encoding:'utf8'});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>resolve({code,out,err}));});}
(async()=>{
  let scenarios=0;
  // 1. Hard process exit after a committed RUNNING transition; restart must sweep and requeue.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-hard-crash-')),db=path.join(dir,'k.db');
    const r=cp.spawnSync(process.execPath,[CHILD,'crash_after_start',db,'HARD-CRASH'],{encoding:'utf8'});assert.equal(r.status,77);scenarios++;
    let k=new SecondShiftKernel(db);assert.equal(k.get('HARD-CRASH').state,'RUNNING');const recovered=k.startupRecover('2026-09-11T05:10:03.000Z');assert.equal(recovered.recovered.length,1);assert.equal(k.get('HARD-CRASH').state,'READY');assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});
  }
  // 2. Hard exit in an uncommitted transaction must roll back completely.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-uncommitted-')),db=path.join(dir,'k.db');let k=new SecondShiftKernel(db);k.close();
    const r=cp.spawnSync(process.execPath,[CHILD,'uncommitted_exit',db],{encoding:'utf8'});assert.equal(r.status,78);k=new SecondShiftKernel(db);assert.equal(Number(k.db.prepare('SELECT count(*) AS n FROM authority_snapshots').get().n),0);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});scenarios++;
  }
  // 3. Eight concurrent processes racing one lane: exactly one may obtain a mutation lease.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-race-')),db=path.join(dir,'k.db');let k=new SecondShiftKernel(db);for(let i=0;i<20;i++)k.enqueue(item(`RACE-${i}`));k.close();
    const rs=await Promise.all(Array.from({length:8},(_,i)=>spawn(['claim_once',db,'CORE',`RACER-${i}`])));assert(rs.every(r=>r.code===0),JSON.stringify(rs));const parsed=rs.map(r=>JSON.parse(r.out));assert.equal(parsed.filter(x=>x.claimed).length,1,JSON.stringify(parsed));
    k=new SecondShiftKernel(db);assert.equal(Number(k.db.prepare("SELECT count(*) AS n FROM work_items WHERE state='CLAIMED'").get().n),1);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});scenarios++;
  }
  // 4. Thirty-two processes racing across four lanes: at most one active claim per lane, and every lane advances.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-4lane-race-')),db=path.join(dir,'k.db');let k=new SecondShiftKernel(db);for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS'])for(let i=0;i<20;i++)k.enqueue(item(`${lane}-${i}`,lane));k.close();
    const jobs=[];for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS'])for(let i=0;i<8;i++)jobs.push(spawn(['claim_once',db,lane,`${lane}-R${i}`]));const rs=await Promise.all(jobs);assert(rs.every(r=>r.code===0),JSON.stringify(rs));
    k=new SecondShiftKernel(db);const rows=k.db.prepare("SELECT lane,count(*) AS n FROM work_items WHERE state='CLAIMED' GROUP BY lane ORDER BY lane").all();assert.equal(rows.length,4);assert(rows.every(r=>Number(r.n)===1),JSON.stringify(rows));assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});scenarios++;
  }
  // 5. SQLITE_FULL inside enqueue must roll back atomically: no partial work/event rows.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-full-')),db=path.join(dir,'k.db');const k=new SecondShiftKernel(db);const pageCount=Number(k.db.prepare('PRAGMA page_count').get().page_count);k.db.exec(`PRAGMA max_page_count=${pageCount+1}`);const before=Number(k.db.prepare('SELECT count(*) AS n FROM work_items').get().n);let threw=false;try{k.enqueue({...item('HUGE'),payload:{blob:'x'.repeat(8*1024*1024)}});}catch(e){threw=true;}assert(threw,'expected SQLITE_FULL/size failure');assert.equal(Number(k.db.prepare('SELECT count(*) AS n FROM work_items').get().n),before);assert.equal(Number(k.db.prepare('SELECT count(*) AS n FROM events').get().n),0);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});scenarios++;
  }
  // 6. Physical DB header corruption must be detected rather than silently treated as an empty/new queue.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-corrupt-')),db=path.join(dir,'k.db');let k=new SecondShiftKernel(db);for(let i=0;i<50;i++)k.enqueue(item(`C-${i}`));k.close();const fd=fs.openSync(db,'r+');fs.writeSync(fd,Buffer.from('BROKEN-DATABASE!!'),0,16,0);fs.closeSync(fd);let detected=false;try{k=new SecondShiftKernel(db);const r=k.integrity();detected=r.integrity_check!=='ok';k.close();}catch(e){detected=true;}assert(detected,'physical corruption was not detected');fs.rmSync(dir,{recursive:true,force:true});scenarios++;
  }
  console.log(JSON.stringify({result:'PASS',scenarios,hard_process_exit:true,uncommitted_rollback:true,concurrent_single_lane_processes:8,concurrent_four_lane_processes:32,disk_full_atomic_rollback:true,physical_corruption_detected:true},null,2));
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
