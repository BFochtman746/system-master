import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerKernel } from '../src/kernel.js';
import { uuidv7 } from '../src/canonical.js';
import { CommandAdmissionPoller, InMemoryDurableCommandInbox, COMMAND_INGRESS_INVARIANTS } from '../src/command-inbox.js';

function command(overrides={}){
  return {
    protocol_version:'1.0',schema:'controller://schemas/command/v1',command_id:uuidv7(),created_at:new Date().toISOString(),
    issuer:{principal:'chatgpt:test',source:'chatgpt'},command_type:'controller.work.submit',
    target:{repository:'BFochtman746/system-master',expected_subject:{algorithm:'sha1',oid:'a'.repeat(40)}},
    preconditions:{},intent:{task:'test'},constraints:{},required_policy_version:null,...overrides
  };
}

test('CI-T001 immutable command put creates one durable object',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),c=command();
  const r=await inbox.put(c); assert.equal(r.created,true); assert.equal(await inbox.count(),1);
  const stored=await inbox.get(c.command_id); assert.equal(stored.command_id,c.command_id); assert.ok(stored.fingerprint);
});

test('CI-T002 identical duplicate put is idempotent',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),c=command();
  await inbox.put(c); const second=await inbox.put(c);
  assert.equal(second.created,false); assert.equal(await inbox.count(),1);
});

test('CI-T003 same command id with changed semantic content hard-conflicts',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),c=command(); await inbox.put(c);
  await assert.rejects(()=>inbox.put({...c,intent:{task:'changed'}}),e=>e.code==='INBOX_IDEMPOTENCY_CONFLICT');
});

test('CI-T004 repeated full rescans create one logical transaction',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),kernel=new ControllerKernel(),c=command(); await inbox.put(c);
  const poller=new CommandAdmissionPoller({inbox,kernel});
  const first=await poller.pollOnce(); assert.equal(first.accepted.length,1);
  for(let i=0;i<25;i++){const r=await poller.pollOnce();assert.equal(r.accepted.length,0);assert.equal(r.duplicates.length,1);}
  const count=kernel.db.prepare('SELECT COUNT(*) n FROM transactions').get().n; assert.equal(Number(count),1); kernel.close();
});

test('CI-T005 ingestion never deletes remote command authority',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),kernel=new ControllerKernel(),c=command(); await inbox.put(c);
  await new CommandAdmissionPoller({inbox,kernel}).pollOnce(); assert.equal(await inbox.count(),1); assert.ok(await inbox.get(c.command_id)); kernel.close();
});

test('CI-T006 stored-content tampering is rejected before kernel mutation',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),kernel=new ControllerKernel(),c=command(); await inbox.put(c);
  inbox.mutateForTest(c.command_id,x=>{x.intent={task:'tampered'};});
  const r=await new CommandAdmissionPoller({inbox,kernel}).pollOnce(); assert.equal(r.rejected.length,1); assert.equal(r.rejected[0].code,'INBOX_CONTENT_TAMPERED');
  assert.equal(Number(kernel.db.prepare('SELECT COUNT(*) n FROM transactions').get().n),0); kernel.close();
});

test('CI-T007 one corrupt command does not erase or suppress an independent valid command',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),kernel=new ControllerKernel(),bad=command(),good=command(); await inbox.put(bad); await inbox.put(good);
  inbox.mutateForTest(bad.command_id,x=>{x.command_type='tampered.type';});
  const r=await new CommandAdmissionPoller({inbox,kernel}).pollOnce(); assert.equal(r.rejected.length,1); assert.equal(r.accepted.length,1);
  assert.equal(Number(kernel.db.prepare('SELECT COUNT(*) n FROM transactions').get().n),1); kernel.close();
});

test('CI-T008 inbox enumeration order is not semantic authority',async()=>{
  const base=new InMemoryDurableCommandInbox(),a=command(),b=command(); await base.put(a); await base.put(b);
  const reversed={list:async()=>[...(await base.list())].reverse()}; const kernel=new ControllerKernel();
  const r=await new CommandAdmissionPoller({inbox:reversed,kernel}).pollOnce(); assert.equal(r.accepted.length,2); assert.equal(Number(kernel.db.prepare('SELECT COUNT(*) n FROM transactions').get().n),2); kernel.close();
});

test('CI-T009 missed notification cannot lose durable work because polling scans authority',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),kernel=new ControllerKernel(),c=command(); await inbox.put(c);
  // No notification or callback occurs here.
  const r=await new CommandAdmissionPoller({inbox,kernel}).pollOnce(); assert.equal(r.accepted.length,1); kernel.close();
});

test('CI-T010 ingestion creates OPEN transaction but never admits it automatically',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),kernel=new ControllerKernel(),c=command(); await inbox.put(c);
  const r=await new CommandAdmissionPoller({inbox,kernel}).pollOnce();
  const tx=kernel.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(r.accepted[0].transaction_id); assert.equal(tx.state,'OPEN'); kernel.close();
});

test('CI-T011 returned inbox objects cannot mutate stored authority by reference',async()=>{
  const inbox=new InMemoryDurableCommandInbox(),c=command(); await inbox.put(c); const x=await inbox.get(c.command_id); x.intent.task='changed';
  const again=await inbox.get(c.command_id); assert.equal(again.intent.task,'test');
});

test('CI-T012 ingress invariants explicitly forbid notification authority and deletion',()=>{
  assert.deepEqual(COMMAND_INGRESS_INVARIANTS,{durable_object_is_authority:true,notification_is_hint_only:true,delete_after_ingest:false,ordering_required:false,admission_automatic:false,replay_expected:true});
});
