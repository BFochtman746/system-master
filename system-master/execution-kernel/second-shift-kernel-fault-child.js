'use strict';
const { DatabaseSync } = require('node:sqlite');
const {SecondShiftKernel}=require('./second-shift-kernel');
const [mode,dbPath,arg1,arg2]=process.argv.slice(2);
const HEAD='a'.repeat(40), AUTH='c'.repeat(40), CTRL={controlRef:'system-master/control-v2',controlHead:HEAD};
const NOW='2026-09-11T05:10:00.000Z';
if(mode==='crash_after_start'){
  const k=new SecondShiftKernel(dbPath);
  const id=arg1||'HARD-CRASH';
  k.enqueue({id,lane:'CORE',objectiveId:'OBJ-HARD-CRASH',payload:{},idempotencyKey:'KEY-HARD-CRASH',retryBudget:3,now:NOW,controlRef:CTRL.controlRef,controlHead:CTRL.controlHead,authoritySha:AUTH});
  const c=k.claim('CORE','CRASH-WORKER',NOW,2,CTRL);k.start(id,'CRASH-WORKER',c.generation,'2026-09-11T05:10:01.000Z',CTRL);
  process.stdout.write(JSON.stringify({generation:c.generation}));
  process.exit(77); // intentionally no close: emulate abrupt process death after committed RUNNING
}
if(mode==='uncommitted_exit'){
  const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
  db.prepare("INSERT INTO authority_snapshots(captured_at,main_sha,authority_digest,authority_json) VALUES(?,?,?,?)").run(NOW,'d'.repeat(40),'e'.repeat(64),'{}');
  process.exit(78); // SQLite must roll this transaction back on next open
}
if(mode==='claim_once'){
  const k=new SecondShiftKernel(dbPath);const lane=arg1||'CORE',worker=arg2||`W-${process.pid}`;
  try{const c=k.claim(lane,worker,NOW,60,CTRL);process.stdout.write(JSON.stringify({ok:true,claimed:c?c.id:null,generation:c?c.generation:null}));k.close();process.exit(0);}catch(e){process.stdout.write(JSON.stringify({ok:false,error:e.message}));try{k.close();}catch(_){}process.exit(2);}
}
throw new Error(`UNKNOWN_MODE:${mode}`);
