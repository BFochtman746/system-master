import { canonicalize, sha256, isControllerTimestamp } from './canonical.js';
import { ControllerError } from './errors.js';
import { checkpointsEqual, normalizeCheckpoint } from './journal-integrity.js';
import { GitHubApiError } from './github-git-transport.js';
import { GitHubJournalPaths } from './github-durable-journal.js';

const ANCHOR_PROTOCOL='controller-anchor.v1';
const HEAD_PATH='anchor/state/head.json';
const DIGEST_RE=/^[0-9a-f]{64}$/;
export const EmptyAnchorHead=Object.freeze({protocol_version:ANCHOR_PROTOCOL,sequence:0,anchor_digest:null,anchor_path:null,journal_commit_sha:null,checkpoint:null});

function parse(text,code,label){if(typeof text!=='string')throw new ControllerError(code,`${label} missing`);try{return JSON.parse(text);}catch{throw new ControllerError(code,`${label} invalid JSON`);}}
function anchorPath(digest){return `anchor/records/${digest.slice(0,2)}/${digest.slice(2,4)}/${digest}.json`;}
function isNotFound(e){return e instanceof GitHubApiError&&e.status===404;}
function isConflict(e){return e?.code==='JOURNAL_HEAD_CONFLICT'||e?.code==='GITHUB_HEAD_CONFLICT'||(e instanceof GitHubApiError&&(e.status===409||e.status===422));}
function anchorCore(record){const {anchor_digest,...core}=record;return core;}
function validateAnchorRecord(record,path=null){
  if(!record||record.protocol_version!==ANCHOR_PROTOCOL)throw new ControllerError('ANCHOR_PROTOCOL_UNSUPPORTED','unsupported anchor protocol');
  if(!Number.isSafeInteger(record.anchor_sequence)||record.anchor_sequence<1)throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','invalid anchor sequence');
  if(typeof record.journal_repository!=='string'||typeof record.journal_ref!=='string'||typeof record.journal_commit_sha!=='string')throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','journal identity missing');
  if(!isControllerTimestamp(record.created_at))throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','anchor created_at is not a valid controller timestamp');
  normalizeCheckpoint(record.checkpoint);
  if(record.previous_anchor_digest!==null&&!DIGEST_RE.test(record.previous_anchor_digest))throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','invalid previous anchor digest');
  if(record.previous_anchor_path!==null&&typeof record.previous_anchor_path!=='string')throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','invalid previous anchor path');
  const digest=sha256(anchorCore(record));
  if(record.anchor_digest!==digest)throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','anchor digest mismatch');
  if(path&&anchorPath(digest)!==path)throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','anchor content address mismatch');
  return record;
}
function validateHead(head){
  if(!head||head.protocol_version!==ANCHOR_PROTOCOL||!Number.isSafeInteger(head.sequence)||head.sequence<0)throw new ControllerError('ANCHOR_HEAD_INVALID','malformed anchor head');
  if(head.sequence===0){if(head.anchor_digest!==null||head.anchor_path!==null||head.journal_commit_sha!==null||head.checkpoint!==null)throw new ControllerError('ANCHOR_HEAD_INVALID','empty anchor head contains authority state');return head;}
  if(!DIGEST_RE.test(head.anchor_digest??'')||typeof head.anchor_path!=='string'||typeof head.journal_commit_sha!=='string')throw new ControllerError('ANCHOR_HEAD_INVALID','malformed nonempty anchor head');
  normalizeCheckpoint(head.checkpoint);return head;
}

export class GitHubCheckpointAnchor {
  constructor({anchorTransport,journalTransport,anchorBranch='controller-anchor/v1',anchorGenesisSha,journalRepository,journalBranch='controller-journal/v1'}){
    if(!anchorTransport||!journalTransport)throw new TypeError('anchorTransport and journalTransport required');
    if(!anchorGenesisSha)throw new TypeError('anchorGenesisSha required');
    this.anchorTransport=anchorTransport;this.journalTransport=journalTransport;this.anchorBranch=anchorBranch;this.anchorGenesisSha=anchorGenesisSha;this.journalRepository=journalRepository;this.journalBranch=journalBranch;
  }

  async readHead(){
    let ref;try{ref=await this.anchorTransport.getRef(this.anchorBranch);}catch(e){if(isNotFound(e))return {exists:false,revision:null,parent_sha:this.anchorGenesisSha,head:{...EmptyAnchorHead}};throw e;}
    const raw=await this.anchorTransport.readFile(ref.sha,HEAD_PATH);if(raw===null)throw new ControllerError('ANCHOR_HEAD_MISSING','anchor ref exists without head');
    const head=validateHead(parse(raw,'ANCHOR_HEAD_INVALID','anchor head'));
    return {exists:true,revision:ref.sha,parent_sha:ref.sha,head};
  }

  async readRecord(revision,path,expectedDigest=null){
    const raw=await this.anchorTransport.readFile(revision,path);if(raw===null)throw new ControllerError('ANCHOR_RECORD_MISSING',`missing anchor ${path}`);
    const record=validateAnchorRecord(parse(raw,'ANCHOR_INTEGRITY_FAILURE','anchor record'),path);
    if(expectedDigest&&record.anchor_digest!==expectedDigest)throw new ControllerError('ANCHOR_INTEGRITY_FAILURE','anchor head digest mismatch');
    return record;
  }

  async readJournalCheckpointAt(revision){
    const raw=await this.journalTransport.readFile(revision,GitHubJournalPaths.checkpoint);if(raw===null)throw new ControllerError('ANCHOR_JOURNAL_CHECKPOINT_MISSING','journal checkpoint missing at requested revision');
    const doc=parse(raw,'ANCHOR_JOURNAL_CHECKPOINT_INVALID','journal checkpoint');return normalizeCheckpoint(doc);
  }

  async anchor({journalRevision,checkpoint,createdAt=new Date().toISOString()}){
    if(!journalRevision)throw new ControllerError('ANCHOR_JOURNAL_REVISION_REQUIRED','exact journal revision required');
    if(!isControllerTimestamp(createdAt))throw new ControllerError('ANCHOR_TIMESTAMP_INVALID','createdAt must be a valid controller UTC timestamp');
    const requested=normalizeCheckpoint(checkpoint);const observed=await this.readJournalCheckpointAt(journalRevision);
    if(!checkpointsEqual(requested,observed))throw new ControllerError('ANCHOR_JOURNAL_MISMATCH','checkpoint does not match exact journal revision');
    const head=await this.readHead();
    if(head.exists&&head.head.sequence>0){const current=await this.readRecord(head.revision,head.head.anchor_path,head.head.anchor_digest);if(current.journal_commit_sha===journalRevision&&checkpointsEqual(current.checkpoint,requested))return {created:false,record:current,transport_revision:head.revision};}
    const sequence=head.head.sequence+1;const previous_anchor_digest=head.head.anchor_digest;const previous_anchor_path=head.head.anchor_path;
    const core={protocol_version:ANCHOR_PROTOCOL,anchor_sequence:sequence,journal_repository:this.journalRepository,journal_ref:this.journalBranch,journal_commit_sha:journalRevision,checkpoint:requested,previous_anchor_digest,previous_anchor_path,created_at:createdAt};
    const anchor_digest=sha256(core);const record={...core,anchor_digest};const path=anchorPath(anchor_digest);
    const nextHead={protocol_version:ANCHOR_PROTOCOL,sequence,anchor_digest,anchor_path:path,journal_commit_sha:journalRevision,checkpoint:requested};
    const commit=await this.anchorTransport.createCommitFromFiles({parentSha:head.parent_sha,files:{[path]:canonicalize(record),[HEAD_PATH]:canonicalize(nextHead)},message:`controller anchor: ${sequence} ${requested.size} ${anchor_digest.slice(0,12)}`});
    try{if(head.exists)await this.anchorTransport.updateRefFastForward(this.anchorBranch,commit.sha);else await this.anchorTransport.createRef(this.anchorBranch,commit.sha);}catch(e){
      if(isConflict(e))throw new ControllerError('ANCHOR_HEAD_CONFLICT','anchor ref changed during append');
      if(e?.code==='GITHUB_NETWORK_AMBIGUOUS'){
        const latest=await this.readHead().catch(()=>null);
        if(latest?.exists&&latest.head.sequence>0){const r=await this.readRecord(latest.revision,latest.head.anchor_path,latest.head.anchor_digest).catch(()=>null);if(r?.anchor_digest===anchor_digest)return {created:false,recovered_after_error:true,record:r,transport_revision:latest.revision};}
      }
      throw e;
    }
    return {created:true,record,transport_revision:commit.sha};
  }

  async list(){
    const head=await this.readHead();if(!head.exists||head.head.sequence===0)return [];
    const records=[];const seen=new Set();let path=head.head.anchor_path;let digest=head.head.anchor_digest;let expectedSequence=head.head.sequence;
    while(path!==null){if(seen.has(path))throw new ControllerError('ANCHOR_CHAIN_LOOP','anchor chain loops');seen.add(path);const r=await this.readRecord(head.revision,path,digest);if(r.anchor_sequence!==expectedSequence)throw new ControllerError('ANCHOR_CHAIN_GAP','anchor sequence gap');records.push(r);path=r.previous_anchor_path;digest=r.previous_anchor_digest;expectedSequence-=1;}
    if(expectedSequence!==0||digest!==null)throw new ControllerError('ANCHOR_CHAIN_GAP','anchor chain does not terminate at genesis');records.reverse();return records;
  }

  async latest(){const records=await this.list();return records.at(-1)??null;}

  async verifyJournalExtendsLatest(journal){
    const latest=await this.latest();if(!latest)return {anchored:false};
    const entries=await journal.list();const current=normalizeCheckpoint(await journal.getCheckpoint());const anchored=normalizeCheckpoint(latest.checkpoint);
    if(current.size<anchored.size)throw new ControllerError('JOURNAL_ROLLBACK_DETECTED','journal is shorter than latest anchor');
    if(anchored.size===0)return {anchored:true,record:latest,current};
    const boundary=entries.find(e=>e.journal_position===anchored.size);
    if(!boundary||boundary.journal_digest!==anchored.head_digest)throw new ControllerError('JOURNAL_ROLLBACK_DETECTED','journal no longer extends anchored checkpoint');
    return {anchored:true,record:latest,current};
  }
}

export const GitHubAnchorPaths=Object.freeze({head:HEAD_PATH,record:anchorPath});
