import { canonicalize, sha256 } from './canonical.js';
import { ControllerError } from './errors.js';
import { journalDigest, verifyDurableJournal } from './journal-integrity.js';

const PROTOCOL_PATH='controller-journal-v1.json';
const CHECKPOINT_PATH='checkpoint.json';
const SEGMENT_PREFIX='segments/';
const CHECKPOINT_SCHEMA='controller.journal.checkpoint.v1';
const PROTOCOL_SCHEMA='controller.journal.protocol.v1';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function pad(n){return String(n).padStart(20,'0');}
function clone(v){return structuredClone(v);}
function parseJson(text,code){try{return JSON.parse(text);}catch{fail(code,'invalid JSON');}}

function validateSemanticEvent(event){
  if(!event||typeof event!=='object'||Array.isArray(event))fail('JOURNAL_EVENT_INVALID','event object required');
  for(const key of ['event_id','event_schema','stream_id','stream_version','event_type','occurred_at','data','prev_event_digest','event_digest'])if(!(key in event))fail('JOURNAL_EVENT_INVALID',`missing ${key}`);
  if(event.event_schema!=='controller.event.v1')fail('UNSUPPORTED_EVENT_SCHEMA',`unsupported ${event.event_schema}`);
  if(!Number.isSafeInteger(event.stream_version)||event.stream_version<1)fail('JOURNAL_EVENT_INVALID','stream_version must be positive integer');
  const core={event_id:event.event_id,event_schema:event.event_schema,stream_id:event.stream_id,stream_version:event.stream_version,event_type:event.event_type,occurred_at:event.occurred_at,prev_event_digest:event.prev_event_digest,data:event.data};
  if(sha256(core)!==event.event_digest)fail('JOURNAL_EVENT_INTEGRITY_FAILURE','semantic event digest mismatch');
}

function validateCheckpoint(cp){
  if(!cp||typeof cp!=='object'||Array.isArray(cp))fail('REMOTE_CHECKPOINT_INVALID','checkpoint object required');
  if(cp.schema!==CHECKPOINT_SCHEMA||cp.protocol_version!=='1')fail('REMOTE_CHECKPOINT_SCHEMA_MISMATCH','unsupported checkpoint schema/protocol');
  if(!Number.isSafeInteger(cp.size)||cp.size<0)fail('REMOTE_CHECKPOINT_INVALID','size invalid');
  if(cp.size===0&&cp.head_digest!==null)fail('REMOTE_CHECKPOINT_INVALID','empty checkpoint must have null head');
  if(cp.size>0&&!/^[0-9a-f]{64}$/.test(cp.head_digest??''))fail('REMOTE_CHECKPOINT_INVALID','head digest invalid');
  if(!cp.stream_heads||typeof cp.stream_heads!=='object'||Array.isArray(cp.stream_heads))fail('REMOTE_CHECKPOINT_INVALID','stream_heads object required');
  return cp;
}

function validateProtocol(p){
  if(!p||p.schema!==PROTOCOL_SCHEMA||p.protocol_version!=='1'||p.event_schema!=='controller.event.v1'||p.digest!=='sha256'||p.segment_encoding!=='canonical-jsonl')fail('REMOTE_PROTOCOL_MISMATCH','journal protocol mismatch');
  return p;
}

function deterministicSegment(entries){return entries.map(e=>canonicalize(e)).join('\n')+'\n';}
function segmentPath(start,end,digest){return `${SEGMENT_PREFIX}${pad(start)}-${pad(end)}-${digest}.jsonl`;}

export class GitDataJournalAdapter {
  constructor(client,{ref='heads/journal',repositoryIdentity='UNSET',maxConflictRetries=4}={}){
    this.client=client;this.ref=ref;this.repositoryIdentity=repositoryIdentity;this.maxConflictRetries=maxConflictRetries;
    if(!client)fail('GIT_CLIENT_REQUIRED','Git data client required');
  }

  protocolDescriptor(){return {schema:PROTOCOL_SCHEMA,protocol_version:'1',event_schema:'controller.event.v1',digest:'sha256',segment_encoding:'canonical-jsonl'};}
  emptyCheckpoint(){return {schema:CHECKPOINT_SCHEMA,protocol_version:'1',size:0,head_digest:null,stream_heads:{},last_segment:null,previous_git_commit_oid:null};}

  async initialize(){
    const existing=await this.client.getRef(this.ref).catch(e=>e?.status===404?null:Promise.reject(e));
    if(existing)fail('JOURNAL_ALREADY_INITIALIZED','journal ref already exists');
    const protocolBlob=await this.client.createBlob(canonicalize(this.protocolDescriptor()));
    const checkpointBlob=await this.client.createBlob(canonicalize(this.emptyCheckpoint()));
    const tree=await this.client.createTree(null,{[PROTOCOL_PATH]:protocolBlob,[CHECKPOINT_PATH]:checkpointBlob});
    const commit=await this.client.createCommit({message:'controller journal initialize v1',tree,parents:[]});
    await this.client.createRef(this.ref,commit);
    return {commit_oid:commit,checkpoint:this.emptyCheckpoint()};
  }

  async _readCommitState(commitOid){
    const commit=await this.client.getCommit(commitOid);
    const tree=await this.client.getTree(commit.tree);
    const protocolOid=tree.files?.[PROTOCOL_PATH],checkpointOid=tree.files?.[CHECKPOINT_PATH];
    if(!protocolOid||!checkpointOid)fail('REMOTE_JOURNAL_INCOMPLETE','protocol/checkpoint missing from journal tree');
    validateProtocol(parseJson(await this.client.getBlob(protocolOid),'REMOTE_PROTOCOL_INVALID'));
    const checkpoint=validateCheckpoint(parseJson(await this.client.getBlob(checkpointOid),'REMOTE_CHECKPOINT_INVALID'));
    return {commit_oid:commitOid,commit,tree,checkpoint};
  }

  async readHead(){
    const oid=await this.client.getRef(this.ref).catch(e=>{if(e?.status===404)fail('JOURNAL_REF_MISSING','journal ref missing');throw e;});
    return this._readCommitState(oid);
  }

  async _allEntries(state){
    const paths=Object.keys(state.tree.files??{}).filter(p=>p.startsWith(SEGMENT_PREFIX)).sort();
    const entries=[];
    for(const path of paths){
      const oid=state.tree.files[path];
      const bytes=await this.client.getBlob(oid);
      const digest=sha256(bytes);
      if(!path.endsWith(`-${digest}.jsonl`))fail('REMOTE_SEGMENT_DIGEST_MISMATCH',`segment path digest mismatch: ${path}`);
      for(const line of bytes.split('\n')){if(!line)continue;entries.push(parseJson(line,'REMOTE_SEGMENT_INVALID'));}
    }
    return entries;
  }

  async verifyHead({expectedWitness=null}={}){
    const state=await this.readHead();
    if(expectedWitness)await this.assertExtendsWitness(state.commit_oid,expectedWitness);
    const entries=await this._allEntries(state);
    const verified=verifyDurableJournal(entries,{expectedCheckpoint:{size:state.checkpoint.size,head_digest:state.checkpoint.head_digest}});
    const streamHeads={};
    for(const event of verified.entries){
      validateSemanticEvent(event);
      const prior=streamHeads[event.stream_id]??{version:0,digest:null};
      if(event.stream_version!==prior.version+1||event.prev_event_digest!==prior.digest)fail('REMOTE_SEMANTIC_STREAM_INVALID',`stream ${event.stream_id} fork/gap`);
      streamHeads[event.stream_id]={version:event.stream_version,digest:event.event_digest};
    }
    if(canonicalize(streamHeads)!==canonicalize(state.checkpoint.stream_heads))fail('REMOTE_STREAM_HEAD_MISMATCH','checkpoint stream heads do not match durable history');
    return {...state,entries};
  }

  async assertExtendsWitness(headOid,witness){
    if(!witness||typeof witness.commit_oid!=='string')fail('LOCAL_WITNESS_INVALID','witness commit_oid required');
    const witnessState=await this._readCommitState(witness.commit_oid).catch(()=>fail('LOCAL_WITNESS_NOT_FOUND','witness commit unavailable'));
    if(witnessState.checkpoint.size!==witness.size||witnessState.checkpoint.head_digest!==witness.head_digest)fail('LOCAL_WITNESS_MISMATCH','stored witness does not match its Git commit');
    let cursor=headOid,steps=0;
    while(cursor&&steps<100000){
      if(cursor===witness.commit_oid)return true;
      const c=await this.client.getCommit(cursor);
      if((c.parents??[]).length>1)fail('REMOTE_JOURNAL_NONLINEAR','journal commit has multiple parents');
      cursor=c.parents?.[0]??null;steps+=1;
    }
    fail('REMOTE_JOURNAL_ROLLBACK_OR_FORK','remote head does not extend local witness');
  }

  _containsExactBatch(entries,events){
    if(events.length===0)return null;
    for(let i=0;i<=entries.length-events.length;i+=1){
      let ok=true;
      for(let j=0;j<events.length;j+=1){if(entries[i+j].event_id!==events[j].event_id||entries[i+j].event_digest!==events[j].event_digest){ok=false;break;}}
      if(ok)return {start:i+1,end:i+events.length};
    }
    const byId=new Map(entries.map(e=>[e.event_id,e]));
    for(const event of events){const prior=byId.get(event.event_id);if(prior&&prior.event_digest!==event.event_digest)fail('JOURNAL_CONFLICT','event id exists with different digest');}
    return null;
  }

  _buildEntries(events,checkpoint){
    let size=checkpoint.size,head=checkpoint.head_digest;
    const streamHeads=clone(checkpoint.stream_heads);
    const entries=[];
    for(const event of events){
      validateSemanticEvent(event);
      const prior=streamHeads[event.stream_id]??{version:0,digest:null};
      if(event.stream_version!==prior.version+1)fail('JOURNAL_STREAM_GAP',`expected ${prior.version+1}, got ${event.stream_version}`);
      if(event.prev_event_digest!==prior.digest)fail('JOURNAL_STREAM_FORK','semantic predecessor mismatch');
      size+=1;
      const entry={...clone(event),journal_position:size,prev_journal_digest:head};
      entry.journal_digest=journalDigest(entry);
      head=entry.journal_digest;
      streamHeads[event.stream_id]={version:event.stream_version,digest:event.event_digest};
      entries.push(entry);
    }
    return {entries,size,head_digest:head,stream_heads:streamHeads};
  }

  async append(events,{witness=null}={}){
    if(!Array.isArray(events)||events.length===0)fail('EMPTY_JOURNAL_BATCH','non-empty event batch required');
    for(let attempt=0;attempt<=this.maxConflictRetries;attempt+=1){
      const state=await this.verifyHead({expectedWitness:witness});
      const duplicate=this._containsExactBatch(state.entries,events);
      if(duplicate)return {duplicate:true,commit_oid:state.commit_oid,checkpoint:clone(state.checkpoint),positions:duplicate};
      const built=this._buildEntries(events,state.checkpoint);
      const segmentBytes=deterministicSegment(built.entries);
      const segmentDigest=sha256(segmentBytes);
      const path=segmentPath(built.entries[0].journal_position,built.entries.at(-1).journal_position,segmentDigest);
      if(state.tree.files?.[path])fail('REMOTE_SEGMENT_PATH_COLLISION','segment path already exists');
      const checkpoint={schema:CHECKPOINT_SCHEMA,protocol_version:'1',size:built.size,head_digest:built.head_digest,stream_heads:built.stream_heads,last_segment:{start:built.entries[0].journal_position,end:built.entries.at(-1).journal_position,sha256:segmentDigest,path},previous_git_commit_oid:state.commit_oid};
      const segmentBlob=await this.client.createBlob(segmentBytes);
      const checkpointBlob=await this.client.createBlob(canonicalize(checkpoint));
      const tree=await this.client.createTree(state.commit.tree,{[path]:segmentBlob,[CHECKPOINT_PATH]:checkpointBlob});
      const candidate=await this.client.createCommit({message:`controller journal append ${checkpoint.last_segment.start}-${checkpoint.last_segment.end}`,tree,parents:[state.commit_oid]});
      try{
        await this.client.updateRef(this.ref,candidate,{force:false,expectedOldOid:state.commit_oid});
        return {duplicate:false,commit_oid:candidate,checkpoint:clone(checkpoint),positions:{start:checkpoint.last_segment.start,end:checkpoint.last_segment.end}};
      }catch(error){
        const observed=await this.client.getRef(this.ref).catch(()=>null);
        if(observed===candidate){return {duplicate:false,recovered_after_error:true,commit_oid:candidate,checkpoint:clone(checkpoint),positions:{start:checkpoint.last_segment.start,end:checkpoint.last_segment.end}};}
        if(observed){
          const observedState=await this.verifyHead({expectedWitness:witness});
          const included=this._containsExactBatch(observedState.entries,events);
          if(included)return {duplicate:true,recovered_after_error:true,commit_oid:observedState.commit_oid,checkpoint:clone(observedState.checkpoint),positions:included};
        }
        if((error?.status===409||error?.code==='NON_FAST_FORWARD')&&attempt<this.maxConflictRetries)continue;
        if(error?.ambiguous)fail('REMOTE_STATE_UNKNOWN','could not determine whether journal ref mutation took effect',{cause:error.message});
        throw error;
      }
    }
    fail('JOURNAL_CONFLICT_RETRY_EXHAUSTED','concurrent journal append retries exhausted');
  }
}
