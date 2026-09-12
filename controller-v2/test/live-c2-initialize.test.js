import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatedGitDataApi } from '../src/simulated-git-data.js';
import { digestC1Receipt } from '../src/live-c1-runner.js';
import { digestC2InitializationReceipt, executeC2Initialization } from '../src/live-c2-initialize.js';

const controllerCommit='a'.repeat(40),policyDigest='b'.repeat(64);
async function fixture(){
  const client=new SimulatedGitDataApi();
  const blob=await client.createBlob('seed');
  const tree=await client.createTree(null,{'README.md':blob});
  const seed=await client.createCommit({message:'seed',tree,parents:[]});
  await client.createRef('heads/main',seed);
  const base={schema:'controller://qualification/c1-preflight/v2',qualification_id:'C1-LIVE-001',result:'PASS',qualified_for_live_journal_mutation:true,controller_commit:controllerCommit,policy_digest:policyDigest,journal_repository:'bfochtman746/system-master-controller-journal',journal_repository_id:24680,subject_repository:'bfochtman746/system-master',default_branch:'main',seed_head:seed};
  const receipt={...base,receipt_digest:digestC1Receipt(base)};
  const repositoryReader=async()=>({id:24680,full_name:'BFochtman746/system-master-controller-journal',name:'system-master-controller-journal',owner:{login:'BFochtman746'},private:true,archived:false,default_branch:'main',permissions:{push:true}});
  return {client,seed,receipt,repositoryReader};
}
const expected={expectedControllerCommit:controllerCommit,expectedPolicyDigest:policyDigest};

test('C2I-T001 admitted initialization creates and verifies one empty journal root',async()=>{const f=await fixture();const result=await executeC2Initialization({...f,...expected,journalClient:f.client});assert.equal(result.result,'PASS');assert.equal(result.witness.size,0);assert.equal(result.witness.head_digest,null);assert.equal(await f.client.getRef('heads/journal'),result.journal_root_commit);assert.equal(result.receipt_digest,digestC2InitializationReceipt(result));});

test('C2I-T002 invalid C1 receipt cannot create journal ref or objects',async()=>{const f=await fixture();f.receipt.seed_head='f'.repeat(40);const before={blobs:f.client.blobs.size,trees:f.client.trees.size,commits:f.client.commits.size};await assert.rejects(()=>executeC2Initialization({...f,...expected,journalClient:f.client}),e=>e.code==='C2_C1_RECEIPT_DIGEST_MISMATCH');assert.equal(f.client.refs.has('heads/journal'),false);assert.deepEqual({blobs:f.client.blobs.size,trees:f.client.trees.size,commits:f.client.commits.size},before);});

test('C2I-T003 seed branch remains unchanged after journal initialization',async()=>{const f=await fixture();await executeC2Initialization({...f,...expected,journalClient:f.client});assert.equal(await f.client.getRef('heads/main'),f.seed);});

test('C2I-T004 journal appearing between C1 and C2 prevents second initialization',async()=>{const f=await fixture();const p=await f.client.createBlob('{}');const c=await f.client.createTree(null,{'x':p});const existing=await f.client.createCommit({message:'other',tree:c,parents:[]});await f.client.createRef('heads/journal',existing);await assert.rejects(()=>executeC2Initialization({...f,...expected,journalClient:f.client}),e=>e.code==='LIVE_JOURNAL_REF_ALREADY_EXISTS');assert.equal(await f.client.getRef('heads/journal'),existing);});

test('C2I-T005 initialization is not declared PASS unless newly created head verifies',async()=>{const f=await fixture();const fakeFactory=()=>({async initialize(){return {commit_oid:'x',checkpoint:{size:0,head_digest:null}};},async verifyHead(){return {commit_oid:'y',checkpoint:{size:0,head_digest:null}};},witnessFrom(){return {commit_oid:'y',size:0,head_digest:null};}});await assert.rejects(()=>executeC2Initialization({...f,...expected,journalClient:f.client,journalFactory:fakeFactory}),e=>e.code==='C2_INITIALIZED_HEAD_MISMATCH');});

test('C2I-T006 nonempty post-initialization checkpoint cannot pass',async()=>{const f=await fixture();const fakeFactory=()=>({async initialize(){return {commit_oid:'x',checkpoint:{size:0,head_digest:null}};},async verifyHead(){return {commit_oid:'x',checkpoint:{size:1,head_digest:'d'.repeat(64)}};},witnessFrom(){return {commit_oid:'x',size:1,head_digest:'d'.repeat(64)};}});await assert.rejects(()=>executeC2Initialization({...f,...expected,journalClient:f.client,journalFactory:fakeFactory}),e=>e.code==='C2_INITIAL_CHECKPOINT_INVALID');});
test('C2I-T007 C2 PASS receipt is bound to original C1 receipt and exact journal root',async()=>{const f=await fixture();const result=await executeC2Initialization({...f,...expected,journalClient:f.client});assert.equal(result.c1_receipt_digest,f.receipt.receipt_digest);const original=result.receipt_digest;result.journal_root_commit='e'.repeat(40);assert.notEqual(original,digestC2InitializationReceipt(result));});
