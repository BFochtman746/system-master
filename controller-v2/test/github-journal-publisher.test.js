import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerKernel } from '../src/kernel.js';
import { GitHubDurableJournal } from '../src/github-durable-journal.js';
import { publishPendingOutboxBatched, flushDurabilityBarrier } from '../src/github-journal-publisher.js';
import { sha256, uuidv7 } from '../src/canonical.js';
import { FakeGitTransport } from '../test-support/fake-git-transport.js';

const SUBJECT={algorithm:'sha1',oid:'0'.repeat(40)};
function command(i){return {protocol_version:'1.0',schema:'controller://schemas/command/v1',command_id:uuidv7(),created_at:new Date(Date.now()+i).toISOString(),issuer:{principal:'user:test',source:'chatgpt'},command_type:'controller.work.submit',target:{repository:'BFochtman746/system-master',expected_subject:SUBJECT},preconditions:{},intent:{task:`batch-${i}`},constraints:{},required_policy_version:null};}
function event({stream='external'}={}){const core={event_id:uuidv7(),event_schema:'controller.event.v1',stream_id:stream,stream_version:1,event_type:'external',occurred_at:new Date().toISOString(),prev_event_digest:null,data:{}};return {...core,event_digest:sha256(core)};}
function setup(n){const k=new ControllerKernel(':memory:');for(let i=0;i<n;i++)k.acceptCommand(command(i));const transport=new FakeGitTransport();const journal=new GitHubDurableJournal({transport,genesisSha:transport.genesisSha,maxBatchEvents:50});return {k,transport,journal};}

test('GHP-T001 publisher batches in exact local commit order and reduces Git pushes',async()=>{
  const {k,transport,journal}=setup(25);const expected=k.db.prepare("SELECT event_id FROM outbox ORDER BY rowid").all().map(x=>x.event_id);
  const result=await publishPendingOutboxBatched(k,journal,{maxBatchEvents:10});
  assert.deepEqual(result.map(x=>x.count),[10,10,5]);assert.ok(result.every(x=>x.sealed));assert.equal(k.pendingOutbox().length,0);
  assert.deepEqual((await journal.list()).map(x=>x.event_id),expected);
  assert.equal(transport.commits.size,4,'genesis plus three physical batch commits');k.close();
});

test('GHP-T002 lost GitHub acknowledgement seals whole batch once after observation',async()=>{
  const {k,transport,journal}=setup(5);transport.failAfterRefUpdate=1;const result=await publishPendingOutboxBatched(k,journal,{maxBatchEvents:20});
  assert.equal(result.length,1);assert.equal(result[0].sealed,true);assert.equal(result[0].recovered_after_error,true);assert.equal(k.pendingOutbox().length,0);assert.equal((await journal.list()).length,5);k.close();
});

test('GHP-T003 stale head race leaves entire local batch pending and later rows cannot bypass it',async()=>{
  const {k,journal}=setup(3);const realAppend=journal.appendBatch.bind(journal);let raced=false;
  const wrapper={getCheckpoint:()=>journal.getCheckpoint(),appendBatch:async(events,opts)=>{if(!raced){raced=true;await journal.putIfAbsent(event());}return realAppend(events,opts);}};
  const result=await publishPendingOutboxBatched(k,wrapper,{maxBatchEvents:3});
  assert.equal(result.length,1);assert.equal(result[0].sealed,false);assert.equal(result[0].code,'JOURNAL_HEAD_CONFLICT');assert.equal(k.pendingOutbox().length,3);k.close();
});

test('GHP-T004 durability barrier drains every pending event before returning checkpoint',async()=>{
  const {k,journal}=setup(23);const result=await flushDurabilityBarrier(k,journal,{maxBatchEvents:7});
  assert.equal(result.sealed,true);assert.equal(result.batches.length,4);assert.equal(result.checkpoint.size,23);assert.equal(k.pendingOutbox().length,0);assert.equal((await journal.verify()).entries.length,23);k.close();
});
