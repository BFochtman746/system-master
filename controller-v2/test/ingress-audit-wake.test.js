import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerKernel } from '../src/kernel.js';
import { MemoryDurableJournal } from '../src/durable-journal.js';
import { recordDurableIngressRejection } from '../src/ingress-audit.js';
import { resolveCommandWakeHint } from '../src/command-wake-hint.js';
import { reduceSemanticEvents } from '../src/semantic-events.js';

class BatchMemoryJournal extends MemoryDurableJournal {
  async appendBatch(events,{expectedCheckpoint=null}={}){
    const receipts=[];
    let expected=expectedCheckpoint;
    for(const event of events){const r=await this.putIfAbsent(event,{expectedCheckpoint:expected});receipts.push(r);expected=r.checkpoint;}
    return {created:true,events:receipts.map(r=>({event_digest:r.event_digest,journal_position:r.journal_position,journal_digest:r.journal_digest})),checkpoint:await this.getCheckpoint(),transport_revision:null};
  }
}

test('IN-T015 rejected ingress is durably auditable without creating a product transaction',async()=>{
  const kernel=new ControllerKernel();const journal=new BatchMemoryJournal();
  const receipt=await recordDurableIngressRejection({kernel,journal,ref:'refs/tags/controller-inbox/v1/bad-command',reasonCode:'COMMAND_JSON_INVALID',occurredAt:'2026-09-12T00:02:00Z'});
  assert.equal(receipt.reason_code,'COMMAND_JSON_INVALID');
  assert.equal(kernel.db.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);
  assert.equal(kernel.db.prepare("SELECT COUNT(*) n FROM events WHERE event_type='ingress.rejected'").get().n,1);
  assert.equal(kernel.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='SEALED'").get().n,1);
  const durable=await journal.list();assert.equal(durable.length,1);assert.equal(durable[0].event_type,'ingress.rejected');assert.equal(durable[0].data.reason_code,'COMMAND_JSON_INVALID');
  const state=reduceSemanticEvents(durable);assert.deepEqual(state.transactions,{});assert.deepEqual(state.commands,{});
  kernel.close();
});

test('IN-T015 rejection audit stores bounded reason/provenance and not raw diagnostics',async()=>{
  const kernel=new ControllerKernel();const journal=new BatchMemoryJournal();
  await recordDurableIngressRejection({kernel,journal,ref:'refs/tags/controller-inbox/v1/bad-command',tagSha:'1'.repeat(40),blobSha:'2'.repeat(40),error:Object.assign(new Error('SECRET raw diagnostic'),{code:'INBOX_COMMAND_NONCANONICAL'}),occurredAt:'2026-09-12T00:02:01Z'});
  const event=(await journal.list())[0];assert.deepEqual(Object.keys(event.data).sort(),['blob_sha','reason_code','source_ref','tag_sha']);assert.equal(event.data.reason_code,'COMMAND_NONCANONICAL');assert.equal(JSON.stringify(event.data).includes('SECRET'),false);kernel.close();
});

test('IN-T023 wake hint only re-reads durable inbox and cannot create a transaction',async()=>{
  let reads=0;const candidate={ref:'refs/tags/controller-inbox/v1/018f3f7c-8b2a-7abc-8def-0123456789ab',command_id:'018f3f7c-8b2a-7abc-8def-0123456789ab'};
  const inbox={get:async(id)=>{reads+=1;assert.equal(id,candidate.command_id);return candidate;}};
  const kernel=new ControllerKernel();
  const result=await resolveCommandWakeHint(inbox,{command_id:candidate.command_id,ref:candidate.ref});
  assert.equal(result.found,true);assert.equal(reads,1);assert.equal(kernel.db.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);kernel.close();
});

test('IN-T023 missing or forged wake hint cannot manufacture command authority',async()=>{
  const inbox={get:async()=>null};const missing=await resolveCommandWakeHint(inbox,{command_id:'x'});assert.equal(missing.found,false);
  const inbox2={get:async()=>({ref:'refs/tags/controller-inbox/v1/x'})};await assert.rejects(resolveCommandWakeHint(inbox2,{command_id:'x',ref:'refs/tags/controller-inbox/v1/y'}),e=>e.code==='WAKE_HINT_REF_MISMATCH');
});
