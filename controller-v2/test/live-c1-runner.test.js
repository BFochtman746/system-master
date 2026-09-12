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

function seededMetadata(){return {full_name:'BFochtman746/system-master-controller-journal',name:'system-master-controller-journal',owner:{login:'BFochtman746'},archived:false,default_branch:'main',permissions:{push:true}};}

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

test('C1R-T004 seeded fresh repository passes using GET-only remote calls',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method});
    if(url.endsWith('/repos/BFochtman746/system-master-controller-journal'))return response(200,seededMetadata());
    if(url.endsWith('/git/ref/heads/journal'))return response(404,{message:'Not Found'});
    throw new Error(`unexpected ${options.method} ${url}`);
  };
  const result=await runC1Preflight({env,fetchImpl});
  assert.equal(result.result,'PASS');
  assert.equal(result.qualified_for_live_journal_mutation,true);
  assert.deepEqual(calls.map(c=>c.method),['GET','GET']);
});

test('C1R-T005 existing journal ref fails closed without mutation',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method});
    if(url.endsWith('/repos/BFochtman746/system-master-controller-journal'))return response(200,seededMetadata());
    if(url.endsWith('/git/ref/heads/journal'))return response(200,{object:{sha:'a'.repeat(40)}});
    throw new Error('unexpected');
  };
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_JOURNAL_REF_ALREADY_EXISTS');
  assert.ok(calls.every(c=>c.method==='GET'));
});

test('C1R-T006 branchless repository fails before journal-ref lookup',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,method:options.method});return response(200,{...seededMetadata(),default_branch:null});};
  await assert.rejects(()=>runC1Preflight({env,fetchImpl}),e=>e.code==='LIVE_REPOSITORY_UNSEEDED');
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'GET');
});

test('C1R-T007 failure serializer is deterministic and machine readable',()=>{
  const error=Object.assign(new Error('blocked'),{code:'LIVE_REPOSITORY_UNSEEDED',details:{repo:'x'}});
  assert.deepEqual(serializeC1Failure(error),{schema:'controller://qualification/c1-preflight/v1',result:'FAIL',error_code:'LIVE_REPOSITORY_UNSEEDED',message:'blocked',details:{repo:'x'}});
});
