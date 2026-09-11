import { ControllerError } from './errors.js';

function pendingRows(kernel){
  if(!kernel?.db?.prepare)throw new ControllerError('OUTBOX_ADAPTER_INVALID','reference SQLite kernel required');
  return kernel.db.prepare("SELECT o.rowid AS local_outbox_sequence,o.*,e.event_schema,e.stream_id,e.stream_version,e.event_type,e.occurred_at,e.data_json,e.prev_event_digest,e.event_digest FROM outbox o JOIN events e ON e.event_id=o.event_id WHERE o.status='PENDING' ORDER BY o.rowid").all();
}
function toEvent(row){return {event_id:row.event_id,event_schema:row.event_schema,stream_id:row.stream_id,stream_version:Number(row.stream_version),event_type:row.event_type,occurred_at:row.occurred_at,data:JSON.parse(row.data_json),prev_event_digest:row.prev_event_digest,event_digest:row.event_digest};}
function markBatchSealed(kernel,rows,now=new Date().toISOString()){
  kernel.atomic(()=>{const stmt=kernel.db.prepare("UPDATE outbox SET status='SEALED',sealed_at=? WHERE outbox_id=? AND status='PENDING'");for(const row of rows){const result=stmt.run(now,row.outbox_id);if(Number(result.changes)!==1)throw new ControllerError('OUTBOX_STATE_CONFLICT',`outbox row ${row.outbox_id} was not pending during batch seal`);}});
}
function recordBatchFailure(kernel,rows,error){for(const row of rows)kernel.recordOutboxFailure(row.outbox_id,error.code||error.message||String(error));}

export async function publishPendingOutboxBatched(kernel,journal,{maxBatchEvents=20,maxBatches=Infinity}={}){
  if(!Number.isSafeInteger(maxBatchEvents)||maxBatchEvents<1||maxBatchEvents>500)throw new RangeError('maxBatchEvents must be 1..500');
  const results=[];let batches=0;
  while(batches<maxBatches){
    const rows=pendingRows(kernel).slice(0,maxBatchEvents);if(rows.length===0)break;
    const expected=await journal.getCheckpoint();
    try{
      const receipt=await journal.appendBatch(rows.map(toEvent),{expectedCheckpoint:expected,expectedTransportRevision:expected.transport_revision});
      markBatchSealed(kernel,rows);
      results.push({sealed:true,count:rows.length,first_local_sequence:Number(rows[0].local_outbox_sequence),last_local_sequence:Number(rows.at(-1).local_outbox_sequence),...receipt});
      batches+=1;
    }catch(error){
      recordBatchFailure(kernel,rows,error);
      results.push({sealed:false,count:rows.length,first_local_sequence:Number(rows[0].local_outbox_sequence),last_local_sequence:Number(rows.at(-1).local_outbox_sequence),code:error.code||'JOURNAL_ERROR'});
      break; // preserve strict local commit order; later rows may not bypass the failed batch.
    }
  }
  return results;
}

export async function flushDurabilityBarrier(kernel,journal,{maxBatchEvents=20}={}){
  const results=[];
  while(pendingRows(kernel).length>0){
    const batch=await publishPendingOutboxBatched(kernel,journal,{maxBatchEvents,maxBatches:1});
    results.push(...batch);
    if(batch.length===0||batch[0].sealed!==true)throw new ControllerError(batch[0]?.code||'JOURNAL_ERROR','durability barrier could not seal all pending semantic events');
  }
  const checkpoint=await journal.getCheckpoint();
  return {sealed:true,checkpoint,batches:results};
}
