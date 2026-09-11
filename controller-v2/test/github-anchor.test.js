import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubDurableJournal } from '../src/github-durable-journal.js';
import { GitHubCheckpointAnchor, GitHubAnchorPaths } from '../src/github-checkpoint-anchor.js';
import { ControllerError } from '../src/errors.js';
import { sha256, uuidv7 } from '../src/canonical.js';
import { FakeGitTransport } from '../test-support/fake-git-transport.js';

function event({stream='s',version=1,prev=null,data={}}={}){const core={event_id:uuidv7(),event_schema:'controller.event.v1',stream_id:stream,stream_version:version,event_type:'anchor.test',occurred_at:new Date().toISOString(),prev_event_digest:prev,data};return {...core,event_digest:sha256(core)};}
function setup(){const transport=new FakeGitTransport();const journal=new GitHubDurableJournal({transport,genesisSha:transport.genesisSha});const anchor=new GitHubCheckpointAnchor({anchorTransport:transport,journalTransport:transport,anchorGenesisSha:transport.genesisSha,journalRepository:'BFochtman746/system-master-control-state'});return {transport,journal,anchor};}
async function assertCode(promise,code){await assert.rejects(promise,e=>e instanceof ControllerError&&e.code===code);}

// GHA-T001
test('GHA-T001 anchor verifies checkpoint at the exact journal commit',async()=>{
  const {journal,anchor}=setup();await journal.putIfAbsent(event());const cp=await journal.getCheckpoint();
  await assertCode(anchor.anchor({journalRevision:cp.transport_revision,checkpoint:{size:0,head_digest:null}}),'ANCHOR_JOURNAL_MISMATCH');
  const a=await anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp});assert.equal(a.created,true);assert.deepEqual(a.record.checkpoint,{size:cp.size,head_digest:cp.head_digest});
});

// GHA-T002
test('GHA-T002 exact duplicate anchor is idempotent',async()=>{
  const {journal,anchor}=setup();await journal.putIfAbsent(event());const cp=await journal.getCheckpoint();const a=await anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp,createdAt:'2026-09-11T00:00:00.000Z'});const b=await anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp,createdAt:'2026-09-12T00:00:00.000Z'});
  assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(a.record.anchor_digest,b.record.anchor_digest);assert.equal((await anchor.list()).length,1);
});

// GHA-T003 + GHA-T006
test('GHA-T003/T006 tampered anchor record fails digest/chain verification',async()=>{
  const {transport,journal,anchor}=setup();await journal.putIfAbsent(event());const cp=await journal.getCheckpoint();const a=await anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp});
  transport.corruptFileAtRef('controller-anchor/v1',GitHubAnchorPaths.record(a.record.anchor_digest),(raw)=>raw.replace('system-master-control-state','evil-state'));
  await assertCode(anchor.list(),'ANCHOR_INTEGRITY_FAILURE');
});

// GHA-T004
test('GHA-T004 concurrent anchor writers from one parent have exactly one fast-forward winner',async()=>{
  const {transport,journal,anchor}=setup();await journal.putIfAbsent(event());let cp=await journal.getCheckpoint();await anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp});
  await journal.putIfAbsent(event({stream:'next'}));cp=await journal.getCheckpoint();
  const second=new GitHubCheckpointAnchor({anchorTransport:transport,journalTransport:transport,anchorGenesisSha:transport.genesisSha,journalRepository:'BFochtman746/system-master-control-state'});
  let waiting=0;let release;const gate=new Promise(r=>release=r);transport.beforeRefUpdate=async({branch,create})=>{if(branch!=='controller-anchor/v1'||create)return;waiting+=1;if(waiting===2)release();await gate;};
  const settled=await Promise.allSettled([anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp,createdAt:'2026-09-11T01:00:00.000Z'}),second.anchor({journalRevision:cp.transport_revision,checkpoint:cp,createdAt:'2026-09-11T01:00:01.000Z'})]);transport.beforeRefUpdate=null;
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);const loser=settled.find(x=>x.status==='rejected');assert.equal(loser.reason.code,'ANCHOR_HEAD_CONFLICT');assert.equal((await anchor.list()).length,2);
});

// GHA-T005
test('GHA-T005 journal rollback below anchored checkpoint is detected',async()=>{
  const {transport,journal,anchor}=setup();await journal.putIfAbsent(event({stream:'a'}));const rev1=(await journal.getCheckpoint()).transport_revision;await journal.putIfAbsent(event({stream:'b'}));const cp2=await journal.getCheckpoint();await anchor.anchor({journalRevision:cp2.transport_revision,checkpoint:cp2});
  assert.equal((await anchor.verifyJournalExtendsLatest(journal)).anchored,true);
  transport.rewindRef('controller-journal/v1',rev1);await assertCode(anchor.verifyJournalExtendsLatest(journal),'JOURNAL_ROLLBACK_DETECTED');
});

test('GHA-extra lost anchor ref acknowledgement is recovered by observing exact anchor digest',async()=>{
  const {transport,journal,anchor}=setup();await journal.putIfAbsent(event());const cp=await journal.getCheckpoint();transport.failAfterRefUpdate=1;const r=await anchor.anchor({journalRevision:cp.transport_revision,checkpoint:cp});assert.equal(r.recovered_after_error,true);assert.equal((await anchor.list()).length,1);
});
