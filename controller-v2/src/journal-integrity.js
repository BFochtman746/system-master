import { sha256 } from './canonical.js';
import { ControllerError } from './errors.js';

const DIGEST_RE=/^[0-9a-f]{64}$/;

function assertDigest(value,name,{nullable=false}={}){
  if(nullable&&value===null)return;
  if(typeof value!=='string'||!DIGEST_RE.test(value))throw new ControllerError('JOURNAL_INTEGRITY_FAILURE',`${name} must be a lowercase SHA-256 digest`);
}

export function journalDigest({journal_position,event_id,event_digest,prev_journal_digest}){
  if(!Number.isSafeInteger(journal_position)||journal_position<1)throw new ControllerError('JOURNAL_INTEGRITY_FAILURE','journal_position must be a positive safe integer');
  if(typeof event_id!=='string'||event_id.length===0)throw new ControllerError('JOURNAL_INTEGRITY_FAILURE','event_id required');
  assertDigest(event_digest,'event_digest');
  assertDigest(prev_journal_digest,'prev_journal_digest',{nullable:true});
  return sha256({journal_position,event_id,event_digest,prev_journal_digest});
}

export function normalizeCheckpoint(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ControllerError('JOURNAL_CHECKPOINT_INVALID','checkpoint object required');
  if(!Number.isSafeInteger(value.size)||value.size<0)throw new ControllerError('JOURNAL_CHECKPOINT_INVALID','checkpoint size must be a nonnegative safe integer');
  if(value.size===0){if(value.head_digest!==null)throw new ControllerError('JOURNAL_CHECKPOINT_INVALID','empty checkpoint must have null head');}
  else assertDigest(value.head_digest,'checkpoint head_digest');
  return {size:value.size,head_digest:value.head_digest};
}

export function checkpointsEqual(a,b){
  const x=normalizeCheckpoint(a),y=normalizeCheckpoint(b);
  return x.size===y.size&&x.head_digest===y.head_digest;
}

export function verifyDurableJournal(entries,{expectedCheckpoint=null}={}){
  if(!Array.isArray(entries))throw new ControllerError('JOURNAL_INTEGRITY_FAILURE','journal entries must be an array');
  const ordered=entries.map(e=>structuredClone(e)).sort((a,b)=>a.journal_position-b.journal_position);
  let position=0,head=null;
  const eventIds=new Set();
  for(const entry of ordered){
    if(eventIds.has(entry.event_id))throw new ControllerError('JOURNAL_INTEGRITY_FAILURE',`duplicate event id ${entry.event_id}`);
    eventIds.add(entry.event_id);
    if(entry.journal_position!==position+1)throw new ControllerError('JOURNAL_GAP',`expected journal position ${position+1}, got ${entry.journal_position}`);
    if(entry.prev_journal_digest!==head)throw new ControllerError('JOURNAL_INTEGRITY_FAILURE','journal predecessor digest mismatch');
    const digest=journalDigest(entry);
    if(entry.journal_digest!==digest)throw new ControllerError('JOURNAL_INTEGRITY_FAILURE','journal digest mismatch');
    position=entry.journal_position;head=digest;
  }
  const checkpoint={size:position,head_digest:head};
  if(expectedCheckpoint&&!checkpointsEqual(checkpoint,expectedCheckpoint))throw new ControllerError('JOURNAL_CHECKPOINT_MISMATCH','journal does not match anchored checkpoint');
  return {checkpoint,entries:ordered};
}
