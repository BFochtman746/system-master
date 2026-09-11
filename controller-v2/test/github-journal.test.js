import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubDurableJournal, GitHubJournalPaths } from '../src/github-durable-journal.js';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { publishPendingOutbox } from '../src/durable-journal.js';
import { sha256, uuidv7 } from '../src/canonical.js';
import { FakeGitTransport } from '../test-support/fake-git-transport.js';

function event({stream='stream:a',version=1,prev=null,type='test.event',data={}}={}){
  const core={event_id:uuidv7(),event_schema:'controller.event.v1',stream_id:stream,stream_version:version,event_type:type,occurred_at:new Date().toISOString(),prev_event_digest:prev,data};
  return {...core,event_digest:sha256(core)};
}
function setup(){const transport=new FakeGitTransport();const journal=new GitHubDurableJournal({transport,genesisSha:transport.genesisSha});return {transport,journal};}
async function assertRejectCode(promise,code){await assert.rejects(promise,(e)=>e instanceof ControllerError&&e.code===code);}

// GHJ-T001
test('GHJ-T001 genesis checkpoint is empty and no durable ref exists',async()=>{
  const {transport,journal}=setup();
  assert.deepEqual(await journal.getCheckpoint(),{protocol_version:'controller-journal.v1',size:0,head_digest:null,last_batch_path:null,last_batch_digest:null,transport_revision:null});
  assert.equal(transport.refs.size,0);
});

// GHJ-T002
test('GHJ-T002 one event appends with exact logical journal digest and verifies',async()=>{
  const {transport,journal}=setup();const e=event();const r=await journal.putIfAbsent(e,{expectedCheckpoint:{size:0,head_digest:null}});
  assert.equal(r.created,true);assert.equal(r.journal_position,1);assert.equal((await journal.get(e.event_id)).event_digest,e.event_digest);
  const v=await journal.verify();assert.equal(v.entries.length,1);assert.deepEqual(v.checkpoint,{size:1,head_digest:r.journal_digest});assert.ok(transport.refs.has('controller-journal/v1'));
});

// GHJ-T003 + T004
test('GHJ-T003/T004 ordered batch preserves event order and same-stream semantic chain',async()=>{
  const {journal}=setup();const e1=event({stream:'s'});const e2=event({stream:'s',version:2,prev:e1.event_digest});const e3=event({stream:'z'});
  const r=await journal.appendBatch([e1,e2,e3],{expectedCheckpoint:{size:0,head_digest:null},expectedTransportRevision:null});
  assert.deepEqual(r.events.map(x=>x.journal_position),[1,2,3]);
  const listed=await journal.list();assert.deepEqual(listed.map(x=>x.event_id),[e1.event_id,e2.event_id,e3.event_id]);
});

// GHJ-T006
 test('GHJ-T006 stale semantic checkpoint is rejected',async()=>{
  const {journal}=setup();const e1=event();await journal.putIfAbsent(e1);
  await assertRejectCode(journal.appendBatch([event({stream:'b'})],{expectedCheckpoint:{size:0,head_digest:null}}),'JOURNAL_HEAD_CONFLICT');
});

// GHJ-T007
test('GHJ-T007 stale transport revision is rejected',async()=>{
  const {journal}=setup();await journal.putIfAbsent(event());
  const old=(await journal.getCheckpoint()).transport_revision;
  await journal.putIfAbsent(event({stream:'b'}));
  await assertRejectCode(journal.appendBatch([event({stream:'c'})],{expectedTransportRevision:old}),'JOURNAL_HEAD_CONFLICT');
});

// GHJ-T005 + T008
test('GHJ-T005/T008 two writers from one parent produce one winner and loser objects remain unreachable',async()=>{
  const {transport,journal}=setup();await journal.putIfAbsent(event());
  const j2=new GitHubDurableJournal({transport,genesisSha:transport.genesisSha});
  let waiting=0;let release;const gate=new Promise(r=>{release=r;});
  transport.beforeRefUpdate=async({create})=>{if(create)return;waiting+=1;if(waiting===2)release();await gate;};
  const a=journal.appendBatch([event({stream:'a2'})]);
  const b=j2.appendBatch([event({stream:'b2'})]);
  const settled=await Promise.allSettled([a,b]);transport.beforeRefUpdate=null;
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
  const rejected=settled.find(x=>x.status==='rejected');assert.equal(rejected.reason.code,'JOURNAL_HEAD_CONFLICT');
  assert.equal((await journal.list()).length,2);
  assert.ok(transport.commits.size>=4,'genesis + first durable commit + two sibling candidate commits');
});

// GHJ-T009
test('GHJ-T009 lost ref-update acknowledgement is recovered by immutable event observation',async()=>{
  const {transport,journal}=setup();await journal.putIfAbsent(event());transport.failAfterRefUpdate=1;
  const e=event({stream:'lost-ack'});const r=await journal.putIfAbsent(e);
  assert.equal(r.created,false);assert.equal(r.recovered_after_error,true);assert.equal((await journal.get(e.event_id)).event_digest,e.event_digest);
});

// GHJ-T010
test('GHJ-T010 exact duplicate event is idempotent',async()=>{
  const {journal}=setup();const e=event();const a=await journal.putIfAbsent(e);const b=await journal.putIfAbsent(e);
  assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(b.journal_position,1);assert.equal((await journal.list()).length,1);
});

// GHJ-T011
test('GHJ-T011 duplicate event id with changed semantic bytes fails closed',async()=>{
  const {journal}=setup();const e=event();await journal.putIfAbsent(e);
  const core={...e,data:{changed:true}};delete core.event_digest;const changed={...core,event_digest:sha256(core)};
  await assertRejectCode(journal.putIfAbsent(changed),'JOURNAL_CONFLICT');
});

// GHJ-T012
test('GHJ-T012 stream predecessor or version fork fails closed',async()=>{
  const {journal}=setup();const e1=event({stream:'fork'});await journal.putIfAbsent(e1);
  await assertRejectCode(journal.putIfAbsent(event({stream:'fork',version:2,prev:'0'.repeat(64)})),'JOURNAL_STREAM_FORK');
  await assertRejectCode(journal.putIfAbsent(event({stream:'fork',version:3,prev:e1.event_digest})),'JOURNAL_STREAM_GAP');
});

// GHJ-T013
test('GHJ-T013 tampered event file is detected by semantic verification',async()=>{
  const {transport,journal}=setup();const e=event();await journal.putIfAbsent(e);
  transport.corruptFileAtRef('controller-journal/v1',GitHubJournalPaths.event(e.event_id),(raw)=>raw.replace('test.event','evil.event'));
  await assertRejectCode(journal.list(),'JOURNAL_EVENT_INTEGRITY_FAILURE');
});

// GHJ-T014
test('GHJ-T014 missing event referenced by a batch is detected',async()=>{
  const {transport,journal}=setup();const e=event();await journal.putIfAbsent(e);
  transport.deleteFileAtRef('controller-journal/v1',GitHubJournalPaths.event(e.event_id));
  await assertRejectCode(journal.list(),'JOURNAL_EVENT_MISSING');
});

// GHJ-T015
test('GHJ-T015 altered batch manifest is rejected by content address',async()=>{
  const {transport,journal}=setup();await journal.putIfAbsent(event());const cp=await journal.getCheckpoint();
  transport.corruptFileAtRef('controller-journal/v1',cp.last_batch_path,(raw)=>raw.replace('controller-journal.v1','controller-journal.v9'));
  await assertRejectCode(journal.list(),'JOURNAL_PROTOCOL_UNSUPPORTED');
});

// GHJ-T016
test('GHJ-T016 checkpoint and batch tail mismatch is detected',async()=>{
  const {transport,journal}=setup();await journal.putIfAbsent(event());
  transport.corruptFileAtRef('controller-journal/v1',GitHubJournalPaths.checkpoint,(raw)=>{const x=JSON.parse(raw);x.size+=1;return JSON.stringify(x);});
  await assertRejectCode(journal.list(),'JOURNAL_CHECKPOINT_MISMATCH');
});

// GHJ-T017 + T018
test('GHJ-T017/T018 missing predecessor batch breaks chain and intact journal recreates exact 002B checkpoint',async()=>{
  const {transport,journal}=setup();const e1=event({stream:'one'});await journal.putIfAbsent(e1);const cp1=await journal.getCheckpoint();const e2=event({stream:'two'});await journal.putIfAbsent(e2);const cp2=await journal.getCheckpoint();
  const ok=await journal.verify({size:cp2.size,head_digest:cp2.head_digest});assert.equal(ok.entries.length,2);
  transport.deleteFileAtRef('controller-journal/v1',cp1.last_batch_path);
  await assertRejectCode(journal.list(),'JOURNAL_BATCH_MISSING');
});

// GHJ-T020
test('GHJ-T020 transport outage before ref advance leaves SQLite outbox unsealed',async()=>{
  const {transport,journal}=setup();transport.failBeforeRefUpdate=1;
  const k=new ControllerKernel(':memory:');
  const command={protocol_version:'1.0',schema:'controller://schemas/command/v1',command_id:uuidv7(),created_at:new Date().toISOString(),issuer:{principal:'user:test',source:'chatgpt'},command_type:'controller.work.submit',target:{repository:'BFochtman746/system-master',subject:{algorithm:'sha1',oid:'0'.repeat(40)}},preconditions:{},intent:{task:'journal-outage'},constraints:{},required_policy_version:null};
  k.acceptCommand(command);
  const result=await publishPendingOutbox(k,journal);
  assert.equal(result[0].sealed,false);assert.equal(k.pendingOutbox().length,1);k.close();
});
