import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, sha256 } from '../src/canonical.js';
import { ControllerError } from '../src/errors.js';
import { GitHubApiError } from '../src/github-git-transport.js';
import { ControllerKernel, commandFingerprint } from '../src/kernel.js';
import { DurableCommandInbox, classifyIngressFailure } from '../src/durable-command-inbox.js';
import { COMMAND_INBOX_NAMESPACE } from '../src/github-command-inbox-transport.js';

function command(id='018f3f7c-8b2a-7abc-8def-0123456789ab', overrides={}) {
  return {
    protocol_version:'1.0', schema:'controller://schemas/command/v1', command_id:id,
    created_at:'2026-09-11T23:59:00Z', issuer:{principal:'user',source:'chat'},
    command_type:'BUILD', target:{repository:'BFochtman746/system-master',expected_subject:{algorithm:'sha1',oid:'1'.repeat(40)}},
    preconditions:{}, intent:{operation:'test'}, constraints:{}, required_policy_version:'v1', ...overrides
  };
}

class MemoryTransport {
  constructor(){this.blobs=new Map();this.tags=new Map();this.refs=new Map();this.fail=null;}
  async createCommandBlob(raw){if(this.fail)throw this.fail;const sha=sha256(raw);this.blobs.set(sha,raw);return sha;}
  async createAnnotatedCommandTag(id,blobSha){const tag=`${COMMAND_INBOX_NAMESPACE}/${id}`;const sha=sha256({tag,blobSha,nonce:this.tags.size});this.tags.set(sha,{sha,tag,message:'meta ignored',tagger:{name:'nobody'},object:{type:'blob',sha:blobSha}});return {sha,tag};}
  async createCommandRef(id,tagSha){const ref=`refs/tags/${COMMAND_INBOX_NAMESPACE}/${id}`;if(this.refs.has(ref))throw new GitHubApiError('GITHUB_HEAD_CONFLICT','exists',{status:422});this.refs.set(ref,tagSha);return {ref,sha:tagSha};}
  async getCommandRef(id){const ref=`refs/tags/${COMMAND_INBOX_NAMESPACE}/${id}`;const sha=this.refs.get(ref);return sha?{ref,sha}:null;}
  async listCommandRefs(){return [...this.refs.entries()].map(([ref,sha])=>({ref,sha}));}
  async getAnnotatedTag(sha){const value=this.tags.get(sha);if(!value)throw new Error('missing tag');return structuredClone(value);}
  async getBlobText(sha){if(!this.blobs.has(sha))throw new Error('missing blob');return this.blobs.get(sha);}
}

function expectCode(promise,code){return assert.rejects(promise,e=>e instanceof ControllerError&&e.code===code);}

test('IN-T001 valid immutable command is submitted, rediscovered and validated',async()=>{
  const t=new MemoryTransport(), inbox=new DurableCommandInbox({transport:t});const c=command();
  const s=await inbox.submit(c);assert.equal(s.created,true);const got=await inbox.get(c.command_id);
  assert.equal(got.command.fingerprint,commandFingerprint(c));assert.equal(got.command_id,c.command_id);
});

test('IN-T002 offline submission survives a new inbox instance',async()=>{
  const t=new MemoryTransport(), c=command();await new DurableCommandInbox({transport:t}).submit(c);
  const recovered=await new DurableCommandInbox({transport:t}).discover();assert.equal(recovered.length,1);assert.equal(recovered[0].command_id,c.command_id);
});

test('IN-T003 concurrent different command refs do not contend on one mutable head',async()=>{
  const t=new MemoryTransport(), inbox=new DurableCommandInbox({transport:t});
  const a=command('018f3f7c-8b2a-7abc-8def-0123456789ab'),b=command('018f3f7c-8b2a-7abc-8def-0123456789ac');
  await Promise.all([inbox.submit(a),inbox.submit(b)]);assert.equal((await inbox.discover()).length,2);
});

test('IN-T004 exact duplicate submission is idempotent',async()=>{
  const t=new MemoryTransport(), inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);
  for(let i=0;i<100;i++)assert.equal((await inbox.submit(c)).duplicate,true);assert.equal(t.refs.size,1);
});

test('IN-T005 same command id with changed bytes hard-conflicts',async()=>{
  const t=new MemoryTransport(), inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);
  await expectCode(inbox.submit(command(c.command_id,{intent:{operation:'different'}})),'INBOX_COMMAND_CONFLICT');
});

test('IN-T006 ref command id and blob command id mismatch is rejected',async()=>{
  const t=new MemoryTransport(), inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);
  const [ref,tagSha]=[...t.refs.entries()][0];const tag=t.tags.get(tagSha);const parsed=JSON.parse(t.blobs.get(tag.object.sha));parsed.command_id='018f3f7c-8b2a-7abc-8def-0123456789ac';parsed.fingerprint=commandFingerprint(parsed);const raw=canonicalize(parsed);const blob=sha256(raw);t.blobs.set(blob,raw);tag.object.sha=blob;
  await expectCode(inbox.get(c.command_id),'INBOX_COMMAND_ID_MISMATCH');
});

test('IN-T007 tag pointing to non-blob object is rejected',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);const tag=t.tags.get([...t.refs.values()][0]);tag.object.type='commit';
  await expectCode(inbox.get(c.command_id),'INBOX_TAG_TARGET_INVALID');
});

test('IN-T008 invalid JSON and noncanonical JSON are rejected',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);const tag=t.tags.get([...t.refs.values()][0]);
  t.blobs.set(tag.object.sha,'{');await expectCode(inbox.get(c.command_id),'INBOX_COMMAND_JSON_INVALID');
  const normalized={...c,fingerprint:commandFingerprint(c)};t.blobs.set(tag.object.sha,JSON.stringify(normalized));await expectCode(inbox.get(c.command_id),'INBOX_COMMAND_NONCANONICAL');
});

test('IN-T009 unknown command field remains rejected by frozen 002B validator',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c={...command(),surprise:true};await assert.rejects(inbox.submit(c),e=>e.code==='SCHEMA_UNKNOWN_FIELD');
});

test('IN-T010 unsupported command protocol remains rejected',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t});await assert.rejects(inbox.submit(command(undefined,{protocol_version:'2.0'})),e=>e.code==='UNSUPPORTED_PROTOCOL');
});

test('IN-T011/T012 recoverable GitHub outage/rate limit classifies as DEFERRED',()=>{
  assert.equal(classifyIngressFailure(new GitHubApiError('GITHUB_UNAVAILABLE','x',{status:503})),'DEFERRED');
  assert.equal(classifyIngressFailure(new GitHubApiError('GITHUB_RATE_LIMITED','x',{status:429})),'DEFERRED');
});

test('IN-T013 tagger metadata is not trusted as logical issuer identity',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);const tag=t.tags.get([...t.refs.values()][0]);tag.tagger={name:'attacker',email:'x@y'};
  const got=await inbox.get(c.command_id);assert.deepEqual(got.command.issuer,c.issuer);
});

test('IN-T014 ingest of the same durable command is semantically exactly-once',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);const k=new ControllerKernel();
  const a=await inbox.ingest(c.command_id,k);const b=await inbox.ingest(c.command_id,k);assert.equal(a.accepted.duplicate,false);assert.equal(b.accepted.duplicate,true);assert.equal(a.accepted.transaction_id,b.accepted.transaction_id);k.close();
});

test('IN-T021 conflicting semantic intents remain distinct immutable commands',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t});await inbox.submit(command());await inbox.submit(command('018f3f7c-8b2a-7abc-8def-0123456789ac',{intent:{operation:'other'}}));assert.equal((await inbox.discover()).length,2);
});

test('IN-T022 expected subject is preserved exactly and never silently retargeted',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);const got=await inbox.get(c.command_id);assert.deepEqual(got.command.target.expected_subject,c.target.expected_subject);
});

test('IN-T024 full scan recovers a command without any notification path',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t}),c=command();await inbox.submit(c);assert.equal((await inbox.discover()).map(x=>x.command_id).includes(c.command_id),true);
});

test('IN-T025 command size limit fails before ref creation',async()=>{
  const t=new MemoryTransport(),inbox=new DurableCommandInbox({transport:t,maxCommandBytes:1024});const c=command(undefined,{intent:{payload:'x'.repeat(5000)}});await expectCode(inbox.submit(c),'INBOX_COMMAND_TOO_LARGE');assert.equal(t.refs.size,0);
});
