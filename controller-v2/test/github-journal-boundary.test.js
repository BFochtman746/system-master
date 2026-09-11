import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubGitDataClient } from '../src/github-git-data-client.js';
import { GitDataJournalAdapter } from '../src/git-data-journal.js';
import { ControllerError } from '../src/errors.js';

function response(status,body=null,headers={}){const text=body===null?'':typeof body==='string'?body:JSON.stringify(body);return {status,ok:status>=200&&status<300,headers:{get(name){const key=Object.keys(headers).find(k=>k.toLowerCase()===String(name).toLowerCase());return key?String(headers[key]):null;}},async text(){return text;}};}
function mock(queue){const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push({url,options});const x=queue.shift();if(x instanceof Error)throw x;return typeof x==='function'?x(url,options):x;}};}
function makeClient(queue){const m=mock(queue);const client=new GitHubGitDataClient({owner:'o',repo:'journal',tokenProvider:async()=>({token:'t'}),fetchImpl:m.fetchImpl});return {client,calls:m.calls};}
function code(e,c){return e instanceof ControllerError&&e.code===c;}

test('GB-T001 real-client missing ref keeps top-level 404 shape expected by journal initializer',async()=>{const {client}=makeClient([response(404,{message:'ref missing'}),response(200,{default_branch:'main'})]);await assert.rejects(()=>client.getRef('heads/journal'),e=>code(e,'GITHUB_NOT_FOUND')&&e.status===404);});

test('GB-T002 empty repository is rejected before any Git object mutation',async()=>{const {client,calls}=makeClient([response(404,{message:'ref missing'}),response(200,{default_branch:null})]);await assert.rejects(()=>client.getRef('heads/journal'),e=>code(e,'JOURNAL_REPOSITORY_UNSEEDED'));assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.method==='GET'));});

test('GB-T003 journal initialize interoperates with normalized real-client 404 and seeded repository',async()=>{
  const {client,calls}=makeClient([
    response(404,{message:'ref missing'}),
    response(200,{default_branch:'main'}),
    response(201,{sha:'pblob'}),
    response(201,{sha:'cblob'}),
    response(201,{sha:'tree'}),
    response(201,{sha:'rootcommit'}),
    response(201,{object:{sha:'rootcommit'}})
  ]);
  const journal=new GitDataJournalAdapter(client,{repositoryIdentity:'o/journal',subjectRepositoryIdentity:'o/subject'});
  const result=await journal.initialize();
  assert.equal(result.commit_oid,'rootcommit');
  assert.equal(result.checkpoint.size,0);
  assert.deepEqual(calls.map(c=>c.options.method),['GET','GET','POST','POST','POST','POST','POST']);
});

test('GB-T004 ambiguous mutating transport error exposes top-level flag consumed by journal adapter',async()=>{const {client}=makeClient([new Error('connection reset')]);await assert.rejects(()=>client.createBlob('x'),e=>code(e,'GITHUB_REMOTE_STATE_UNKNOWN')&&e.ambiguous===true);});

test('GB-T005 read transport error is not mislabeled as an ambiguous mutation',async()=>{const {client}=makeClient([new Error('connection reset')]);await assert.rejects(()=>client.getBlob('x'),e=>code(e,'GITHUB_REMOTE_STATE_UNKNOWN')&&e.ambiguous===false);});
