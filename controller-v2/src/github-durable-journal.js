import { canonicalize, sha256 } from './canonical.js';
import { ControllerError } from './errors.js';
import { journalDigest, normalizeCheckpoint, checkpointsEqual, verifyDurableJournal } from './journal-integrity.js';
import { GitHubApiError } from './github-git-transport.js';

const JOURNAL_PROTOCOL = 'controller-journal.v1';
const CHECKPOINT_PATH = 'journal/state/checkpoint.json';
const DIGEST_RE = /^[0-9a-f]{64}$/;

function parseJson(text, code, label) {
  if (typeof text !== 'string') throw new ControllerError(code, `${label} missing`);
  try { return JSON.parse(text); } catch { throw new ControllerError(code, `${label} is not valid JSON`); }
}

function eventPath(eventId) {
  const flat = String(eventId).toLowerCase().replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/.test(flat)) throw new ControllerError('JOURNAL_EVENT_INVALID', 'event_id must be canonical UUID hex');
  return `journal/events/${flat.slice(0,2)}/${flat.slice(2,4)}/${eventId}.json`;
}

function streamPath(streamId) {
  const digest = sha256(String(streamId));
  return `journal/streams/${digest.slice(0,2)}/${digest.slice(2,4)}/${digest}.json`;
}

function batchPath(batchId) {
  return `journal/batches/${batchId.slice(0,2)}/${batchId.slice(2,4)}/${batchId}.json`;
}

function semanticCore(event) {
  return {
    event_id: event.event_id,
    event_schema: event.event_schema,
    stream_id: event.stream_id,
    stream_version: event.stream_version,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    prev_event_digest: event.prev_event_digest,
    data: event.data
  };
}

function assertSemanticEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new ControllerError('JOURNAL_EVENT_INVALID', 'event object required');
  for (const key of ['event_id','event_schema','stream_id','stream_version','event_type','occurred_at','event_digest']) {
    if (event[key] === undefined || event[key] === null) throw new ControllerError('JOURNAL_EVENT_INVALID', `${key} required`);
  }
  if (!Number.isSafeInteger(event.stream_version) || event.stream_version < 1) throw new ControllerError('JOURNAL_EVENT_INVALID', 'stream_version must be positive safe integer');
  if (!DIGEST_RE.test(event.event_digest)) throw new ControllerError('JOURNAL_EVENT_INVALID', 'event_digest must be lowercase SHA-256');
  if (event.prev_event_digest !== null && !DIGEST_RE.test(event.prev_event_digest)) throw new ControllerError('JOURNAL_EVENT_INVALID', 'prev_event_digest must be null or lowercase SHA-256');
  if (sha256(semanticCore(event)) !== event.event_digest) throw new ControllerError('JOURNAL_EVENT_INTEGRITY_FAILURE', 'semantic event digest does not match event bytes');
}

function checkpointDocument(value) {
  const core = normalizeCheckpoint(value);
  const protocol_version = value?.protocol_version ?? JOURNAL_PROTOCOL;
  if (protocol_version !== JOURNAL_PROTOCOL) throw new ControllerError('JOURNAL_PROTOCOL_UNSUPPORTED', `unsupported journal protocol ${protocol_version}`);
  const last_batch_path = value?.last_batch_path ?? null;
  const last_batch_digest = value?.last_batch_digest ?? null;
  if (core.size === 0) {
    if (last_batch_path !== null || last_batch_digest !== null) throw new ControllerError('JOURNAL_CHECKPOINT_INVALID', 'empty checkpoint cannot name a batch');
  } else {
    if (typeof last_batch_path !== 'string' || !last_batch_path.startsWith('journal/batches/')) throw new ControllerError('JOURNAL_CHECKPOINT_INVALID', 'nonempty checkpoint requires last_batch_path');
    if (!DIGEST_RE.test(last_batch_digest ?? '')) throw new ControllerError('JOURNAL_CHECKPOINT_INVALID', 'nonempty checkpoint requires last_batch_digest');
  }
  return { protocol_version, ...core, last_batch_path, last_batch_digest };
}

function manifestDigest(manifestWithoutDigest) { return sha256(manifestWithoutDigest); }
function manifestSeed(value) { const { batch_digest, batch_id, ...seed } = value; return seed; }
function isNotFound(error) { return error instanceof GitHubApiError && error.status === 404; }
function isHeadConflict(error) {
  return error?.code === 'JOURNAL_HEAD_CONFLICT' || error?.code === 'GITHUB_HEAD_CONFLICT' || (error instanceof GitHubApiError && (error.status === 409 || error.status === 422));
}

export class GitHubDurableJournal {
  constructor({ transport, branch = 'controller-journal/v1', genesisSha, maxBatchEvents = 50 }) {
    if (!transport) throw new TypeError('transport required');
    if (!genesisSha || typeof genesisSha !== 'string') throw new TypeError('genesisSha required');
    if (!Number.isSafeInteger(maxBatchEvents) || maxBatchEvents < 1 || maxBatchEvents > 500) throw new RangeError('maxBatchEvents must be 1..500');
    this.transport = transport;
    this.branch = branch;
    this.genesisSha = genesisSha;
    this.maxBatchEvents = maxBatchEvents;
  }

  async readHead() {
    let ref;
    try { ref = await this.transport.getRef(this.branch); }
    catch (error) {
      if (isNotFound(error)) return { exists:false,revision:null,parent_sha:this.genesisSha,checkpoint:checkpointDocument({size:0,head_digest:null}) };
      throw error;
    }
    const raw = await this.transport.readFile(ref.sha, CHECKPOINT_PATH);
    if (raw === null) throw new ControllerError('JOURNAL_CHECKPOINT_MISSING', 'journal ref exists without checkpoint');
    const checkpoint = checkpointDocument(parseJson(raw, 'JOURNAL_CHECKPOINT_INVALID', 'checkpoint'));
    return { exists:true,revision:ref.sha,parent_sha:ref.sha,checkpoint };
  }

  async getCheckpoint() {
    const head = await this.readHead();
    return { ...head.checkpoint, transport_revision:head.revision };
  }

  async get(eventId) {
    const head = await this.readHead();
    if (!head.exists) return null;
    const raw = await this.transport.readFile(head.revision, eventPath(eventId));
    if (raw === null) return null;
    const event = parseJson(raw, 'JOURNAL_EVENT_INVALID', 'stored event');
    assertSemanticEvent(event);
    if (!Number.isSafeInteger(event.journal_position) || event.journal_position < 1) throw new ControllerError('JOURNAL_INTEGRITY_FAILURE', 'stored event missing journal_position');
    if (!DIGEST_RE.test(event.journal_digest ?? '')) throw new ControllerError('JOURNAL_INTEGRITY_FAILURE', 'stored event missing journal_digest');
    return event;
  }

  async readStreamHead(revision, streamId) {
    if (!revision) return null;
    const raw = await this.transport.readFile(revision, streamPath(streamId));
    if (raw === null) return null;
    const value = parseJson(raw, 'JOURNAL_STREAM_HEAD_INVALID', 'stream head');
    if (value.stream_id !== streamId || !Number.isSafeInteger(value.stream_version) || value.stream_version < 1 || !DIGEST_RE.test(value.event_digest ?? '')) throw new ControllerError('JOURNAL_STREAM_HEAD_INVALID', 'stored stream head is malformed');
    return value;
  }

  async appendBatch(events, { expectedCheckpoint = null, expectedTransportRevision = undefined } = {}) {
    if (!Array.isArray(events) || events.length === 0) throw new ControllerError('JOURNAL_BATCH_INVALID', 'nonempty event array required');
    if (events.length > this.maxBatchEvents) throw new ControllerError('JOURNAL_BATCH_TOO_LARGE', `batch exceeds ${this.maxBatchEvents} events`);
    for (const event of events) assertSemanticEvent(event);
    if (new Set(events.map((e) => e.event_id)).size !== events.length) throw new ControllerError('JOURNAL_BATCH_INVALID', 'duplicate event id within batch');

    const head = await this.readHead();
    if (expectedCheckpoint && !checkpointsEqual(head.checkpoint, expectedCheckpoint)) throw new ControllerError('JOURNAL_HEAD_CONFLICT', 'semantic journal checkpoint changed before append');
    if (expectedTransportRevision !== undefined && expectedTransportRevision !== head.revision) throw new ControllerError('JOURNAL_HEAD_CONFLICT', 'transport revision changed before append');

    const existing=[];
    for (const event of events) {
      const raw=head.exists?await this.transport.readFile(head.revision,eventPath(event.event_id)):null;
      if(raw===null){existing.push(null);continue;}
      const stored=parseJson(raw,'JOURNAL_EVENT_INVALID','stored event');
      assertSemanticEvent(stored);
      if(stored.event_digest!==event.event_digest||canonicalize(semanticCore(stored))!==canonicalize(semanticCore(event)))throw new ControllerError('JOURNAL_CONFLICT',`event id ${event.event_id} already exists with different semantic bytes`);
      existing.push(stored);
    }
    if(existing.every(Boolean))return {created:false,events:existing.map((e)=>({event_id:e.event_id,event_digest:e.event_digest,journal_position:e.journal_position,journal_digest:e.journal_digest})),checkpoint:head.checkpoint,transport_revision:head.revision};
    if(existing.some(Boolean))throw new ControllerError('JOURNAL_PARTIAL_DUPLICATE','batch mixes already-durable and new events');

    const streamHeads=new Map();
    for(const streamId of new Set(events.map((e)=>e.stream_id)))streamHeads.set(streamId,await this.readStreamHead(head.revision,streamId));

    let position=head.checkpoint.size;
    let globalHead=head.checkpoint.head_digest;
    const storedEvents=[];
    const files={};
    for(const event of events){
      const prior=streamHeads.get(event.stream_id)??null;
      const expectedVersion=(prior?.stream_version??0)+1;
      const expectedPrev=prior?.event_digest??null;
      if(event.stream_version!==expectedVersion)throw new ControllerError('JOURNAL_STREAM_GAP',`stream ${event.stream_id} expected version ${expectedVersion}, got ${event.stream_version}`);
      if(event.prev_event_digest!==expectedPrev)throw new ControllerError('JOURNAL_STREAM_FORK',`stream ${event.stream_id} predecessor mismatch`);
      position+=1;
      const prev_journal_digest=globalHead;
      const journal_digest=journalDigest({journal_position:position,event_id:event.event_id,event_digest:event.event_digest,prev_journal_digest});
      const stored={...semanticCore(event),event_digest:event.event_digest,journal_position:position,prev_journal_digest,journal_digest};
      storedEvents.push(stored);
      files[eventPath(event.event_id)]=canonicalize(stored);
      globalHead=journal_digest;
      streamHeads.set(event.stream_id,{stream_id:event.stream_id,stream_version:event.stream_version,event_id:event.event_id,event_digest:event.event_digest,journal_position:position});
    }
    for(const [streamId,streamHead] of streamHeads.entries())if(events.some((e)=>e.stream_id===streamId))files[streamPath(streamId)]=canonicalize(streamHead);

    const expectedCore=normalizeCheckpoint(head.checkpoint);
    const resultCore={size:position,head_digest:globalHead};
    const batchSeed={protocol_version:JOURNAL_PROTOCOL,previous_batch_path:head.checkpoint.last_batch_path,expected_checkpoint:expectedCore,result_checkpoint:resultCore,events:storedEvents.map((e)=>({event_id:e.event_id,event_path:eventPath(e.event_id),event_digest:e.event_digest,journal_position:e.journal_position,journal_digest:e.journal_digest}))};
    const batch_id=sha256(batchSeed);
    const bPath=batchPath(batch_id);
    const manifestWithoutDigest={...batchSeed,batch_id};
    const batch_digest=manifestDigest(manifestWithoutDigest);
    const manifest={...manifestWithoutDigest,batch_digest};
    files[bPath]=canonicalize(manifest);
    const checkpoint=checkpointDocument({protocol_version:JOURNAL_PROTOCOL,...resultCore,last_batch_path:bPath,last_batch_digest:batch_digest});
    files[CHECKPOINT_PATH]=canonicalize(checkpoint);

    const commit=await this.transport.createCommitFromFiles({parentSha:head.parent_sha,files,message:`controller journal: ${expectedCore.size+1}-${resultCore.size} ${batch_id.slice(0,12)}`});
    try{
      if(head.exists)await this.transport.updateRefFastForward(this.branch,commit.sha);else await this.transport.createRef(this.branch,commit.sha);
    }catch(error){
      if(isHeadConflict(error))throw new ControllerError('JOURNAL_HEAD_CONFLICT','journal ref changed during append');
      if(error?.code==='GITHUB_NETWORK_AMBIGUOUS'){
        const observed=await this.observeBatch(events,resultCore).catch(()=>null);
        if(observed)return {created:false,recovered_after_error:true,...observed};
      }
      throw error;
    }
    return {created:true,events:storedEvents.map((e)=>({event_id:e.event_id,event_digest:e.event_digest,journal_position:e.journal_position,journal_digest:e.journal_digest})),checkpoint,transport_revision:commit.sha,batch_path:bPath,batch_digest};
  }

  async observeBatch(events, expectedResultCheckpoint = null) {
    const head=await this.readHead();
    if(!head.exists)return null;
    if(expectedResultCheckpoint&&!checkpointsEqual(head.checkpoint,expectedResultCheckpoint))return null;
    const observed=[];
    for(const event of events){
      const raw=await this.transport.readFile(head.revision,eventPath(event.event_id));
      if(raw===null)return null;
      const stored=parseJson(raw,'JOURNAL_EVENT_INVALID','stored event');
      assertSemanticEvent(stored);
      if(stored.event_digest!==event.event_digest||canonicalize(semanticCore(stored))!==canonicalize(semanticCore(event)))return null;
      observed.push({event_id:stored.event_id,event_digest:stored.event_digest,journal_position:stored.journal_position,journal_digest:stored.journal_digest});
    }
    return {events:observed,checkpoint:head.checkpoint,transport_revision:head.revision};
  }

  async putIfAbsent(event,{expectedCheckpoint=null}={}){
    const result=await this.appendBatch([event],{expectedCheckpoint});
    const receipt=result.events[0];
    return {created:result.created,event_digest:receipt.event_digest,journal_position:receipt.journal_position,journal_digest:receipt.journal_digest,checkpoint:result.checkpoint,transport_revision:result.transport_revision,recovered_after_error:result.recovered_after_error??false};
  }

  async readManifest(revision,path,expectedDigest=null){
    const raw=await this.transport.readFile(revision,path);
    if(raw===null)throw new ControllerError('JOURNAL_BATCH_MISSING',`missing batch manifest ${path}`);
    const value=parseJson(raw,'JOURNAL_BATCH_INVALID','batch manifest');
    if(value.protocol_version!==JOURNAL_PROTOCOL)throw new ControllerError('JOURNAL_PROTOCOL_UNSUPPORTED','batch protocol mismatch');
    const expectedBatchId=sha256(manifestSeed(value));
    if(value.batch_id!==expectedBatchId||batchPath(expectedBatchId)!==path)throw new ControllerError('JOURNAL_BATCH_INTEGRITY_FAILURE','batch content address mismatch');
    const {batch_digest,...withoutDigest}=value;
    const actual=manifestDigest(withoutDigest);
    if(!DIGEST_RE.test(batch_digest??'')||batch_digest!==actual)throw new ControllerError('JOURNAL_BATCH_INTEGRITY_FAILURE',`batch manifest digest mismatch ${path}`);
    if(expectedDigest&&expectedDigest!==batch_digest)throw new ControllerError('JOURNAL_BATCH_INTEGRITY_FAILURE',`checkpoint batch digest mismatch ${path}`);
    return value;
  }

  async list(){
    const head=await this.readHead();
    if(!head.exists)return [];
    const manifests=[];
    const seen=new Set();
    let path=head.checkpoint.last_batch_path;
    let expectedDigest=head.checkpoint.last_batch_digest;
    while(path!==null){
      if(seen.has(path))throw new ControllerError('JOURNAL_BATCH_LOOP','batch manifest chain loops');
      seen.add(path);
      const manifest=await this.readManifest(head.revision,path,expectedDigest);
      manifests.push(manifest);
      path=manifest.previous_batch_path;
      expectedDigest=null;
    }
    manifests.reverse();
    const events=[];
    const streamHeads=new Map();
    let priorBatchPath=null;
    let expectedPosition=1;
    for(const manifest of manifests){
      if(manifest.previous_batch_path!==priorBatchPath)throw new ControllerError('JOURNAL_BATCH_GAP','batch predecessor path mismatch');
      for(const ref of manifest.events){
        if(ref.journal_position!==expectedPosition)throw new ControllerError('JOURNAL_GAP',`expected journal position ${expectedPosition}, got ${ref.journal_position}`);
        const raw=await this.transport.readFile(head.revision,ref.event_path);
        if(raw===null)throw new ControllerError('JOURNAL_EVENT_MISSING',`missing event ${ref.event_id}`);
        const event=parseJson(raw,'JOURNAL_EVENT_INVALID','stored event');
        assertSemanticEvent(event);
        if(event.event_id!==ref.event_id||event.event_digest!==ref.event_digest||event.journal_position!==ref.journal_position||event.journal_digest!==ref.journal_digest)throw new ControllerError('JOURNAL_INTEGRITY_FAILURE','batch event reference mismatch');
        const prior=streamHeads.get(event.stream_id)??null;
        if(event.stream_version!==(prior?.stream_version??0)+1)throw new ControllerError('JOURNAL_STREAM_GAP',`replay stream gap ${event.stream_id}`);
        if(event.prev_event_digest!==(prior?.event_digest??null))throw new ControllerError('JOURNAL_STREAM_FORK',`replay stream predecessor mismatch ${event.stream_id}`);
        streamHeads.set(event.stream_id,{stream_version:event.stream_version,event_digest:event.event_digest,event_id:event.event_id,journal_position:event.journal_position});
        events.push(event);
        expectedPosition+=1;
      }
      priorBatchPath=batchPath(manifest.batch_id);
    }
    const verified=verifyDurableJournal(events,{expectedCheckpoint:head.checkpoint});
    if(verified.checkpoint.size!==head.checkpoint.size)throw new ControllerError('JOURNAL_CHECKPOINT_MISMATCH','checkpoint size does not match manifest history');
    for(const [streamId,expected] of streamHeads.entries()){
      const stored=await this.readStreamHead(head.revision,streamId);
      if(!stored||stored.stream_version!==expected.stream_version||stored.event_digest!==expected.event_digest||stored.event_id!==expected.event_id||stored.journal_position!==expected.journal_position)throw new ControllerError('JOURNAL_STREAM_HEAD_INVALID',`stream head mismatch ${streamId}`);
    }
    return verified.entries;
  }

  async verify(expectedCheckpoint=null){
    const head=await this.readHead();
    const entries=await this.list();
    const expected=expectedCheckpoint??head.checkpoint;
    const verified=verifyDurableJournal(entries,{expectedCheckpoint:expected});
    return {...verified,transport_revision:head.revision,checkpoint_document:head.checkpoint};
  }
}

export const GitHubJournalPaths=Object.freeze({checkpoint:CHECKPOINT_PATH,event:eventPath,stream:streamPath,batch:batchPath});
