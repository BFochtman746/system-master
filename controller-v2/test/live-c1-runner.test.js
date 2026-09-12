import test from 'node:test';
import assert from 'node:assert/strict';
import { c1ConfigFromEnv, runC1Preflight, serializeC1Failure } from '../src/live-c1-runner.js';

function headers(values={}){const map=new Map(Object.entries(values).map(([k,v])=>[k.toLowerCase(),String(v)]));return {get:name=>map.get(String(name).toLowerCase())??null};}
function response(status,body,extraHeaders={}){return {ok:status>=200&&status<300,status,headers:headers(extraHeaders),async text(){return body===null?'':JSON.stringify(body);}};}

const env={
  CONTROLLER_C1_GITHUB_TOKEN:'token',
  CONTROLLER_C1_QUALIFICATION_ID:'C1-LIVE-TEST-001',
  CONTROLLER_C1_DESTRUCTIVE_OPT_IN:'I-UNDERSTAND-C1-WILL-QUALIFY-FOR-LATER-MUTATION'
};
const seedHead='1'.repeat(40), seedTree='2'.repeat(40), readmeBlob='3'.repeat(40);

function seededMetadata(overrides={}){return {id:24680,full_name:'BFochtman746/system-master-controller-journal',name:'system-master-controller-journal',owner:{login:'BFochtman746'},private:true,archived:false,default_branch:'main',permissions:{push:true},...overrides};}
function freshFetch({metadata=seededMetadata(),parents=[],paths=['README.md'],journalRef404=true}={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method});
    if(url.endsWith('/repos/BFochtman746/system-master-controller-journal'))return response(200,metadata);
    if(url.endsWith('/git/ref/heads/main'))return response(200,{object:{sha:seedHead}});
    if(url.endsWith(`/git/commits/${seedHead}`))return response(200,{message:'seed',tree:{sha:seedTree},parents:parents.map(sha=>({sha}))});
    if(url.endsWith(`/git/trees/${seedTree}?recursive=1`))return response(200,{sha:seedTree,truncated:false,tree:paths.map((path,i)=>({path,type:'blob',mode:'100644',sha:i===0?readmeBlob:String(i+4).repeat(40)}))});
    if(url.endsWith('/git/ref/heads/journal'))return journalRef404?response(404,{message:'Not Found'}):response(200,{object:{sha:'a'.repeat(40)}});
    throw new Error(`unexpected ${options.method} ${url}`);
  };
  return {fetchImpl,calls};
}

test('C1R-T001 runner freezes canonical journal and subject identities',()=>{
  const parsed=c1ConfigFromEnv(env);
  assert.equal(parsed.config.journalRepository,'BFochtman746/system-master-controller-journal');
  assert.equal(parsed.config.subjectRepository,'BFochtman746/system-master');
});

test('C1R-T002 missing explicit opt-in fails before remote request',async()=>{
  let calls=0;
  await assert.rejects(()=>runC1Preflight({env:{...env,CONTROLLER_C1_DESTRUCTIVE_OPT_IN:''},fetchImpl:async()=>{calls++;throw new Error('unexpected');}}),e=>e.code==='LIVE_DESTRUCTIVE_OPT_IN_REQUIRED');
  assert.equal(calls,0);
});

test('C1R-T003 missing token fails before remote request',async()=>{
  let calls=0;
  await assert.rejects(()=>runC1Preflight({env:{...env,CONTROLLER_C1_GITHUB_TOKEN:'',GITHUB_TOKEN:''},fetchImpl:async()=>{calls++;throw new Error('unexpected');}}),e=>e.code==='LIVE_GITHUB_TOKEN_REQUIRED');
  assert.equal(calls,0);
});

test('C1R-T004 canonical private one-commit seed passes using GET-only remote calls',async()=>{
  const {fetchImpl,calls}=freshFetch();
  const result=await runC1Preflight({env,fetchImpl});
  assert.equal(result.result,'PASS');
  assert.equal(result.journal_repository_id,24680);
  assert.equal(result.seed_head,seedHead);
  assert.ok(calls.length>=5);
  assert.ok(calls.every(c=>c.method==='GET'));
});

test('C1R-T005 existing journal ref fails closed without mutation',async()=>{
  const {fetchImpl,calls}=freshFetch({journalRef404:false});
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_JOURNAL_REF_ALREADY_EXISTS');
  assert.ok(calls.every(c=>c.method==='GET'));
});

test('C1R-T006 branchless repository fails before seed lookup',async()=>{
  const {fetchImpl,calls}=freshFetch({metadata:seededMetadata({default_branch:null})});
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_REPOSITORY_UNSEEDED');
  assert.equal(calls.length,1);
});

test('C1R-T007 public repository is rejected before seed lookup',async()=>{
  const {fetchImpl,calls}=freshFetch({metadata:seededMetadata({private:false})});
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_REPOSITORY_MUST_BE_PRIVATE');
  assert.equal(calls.length,1);
});

test('C1R-T008 non-main default branch is rejected before seed lookup',async()=>{
  const {fetchImpl,calls}=freshFetch({metadata:seededMetadata({default_branch:'master'})});
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_DEFAULT_BRANCH_MISMATCH');
  assert.equal(calls.length,1);
});

test('C1R-T009 seed commit with a parent is rejected',async()=>{
  const {fetchImpl,calls}=freshFetch({parents:['f'.repeat(40)]});
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_SEED_HISTORY_NOT_MINIMAL');
  assert.equal(calls.length,3);
});

test('C1R-T010 seed tree must contain exactly README.md',async()=>{
  const {fetchImpl,calls}=freshFetch({paths:['README.md','extra.txt']});
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_SEED_TREE_NOT_MINIMAL');
  assert.equal(calls.length,4);
});

test('C1R-T011 failure serializer is deterministic and machine readable',()=>{
  const error=Object.assign(new Error('blocked'),{code:'LIVE_REPOSITORY_UNSEEDED',details:{repo:'x'}});
  assert.deepEqual(serializeC1Failure(error),{schema:'controller://qualification/c1-preflight/v1',result:'FAIL',error_code:'LIVE_REPOSITORY_UNSEEDED',message:'blocked',details:{repo:'x'}});
});
