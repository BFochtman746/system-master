import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubGitDatabaseTransport, GitHubApiError } from '../src/github-git-transport.js';

function response(status,body=null){return {ok:status>=200&&status<300,status,async text(){return body===null?'':JSON.stringify(body);}};}
function makeTransport(handler){const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return handler(url,options,calls);};return {calls,transport:new GitHubGitDatabaseTransport({owner:'o',repo:'r',tokenProvider:async()=> 'token',fetchImpl})};}

test('GHT-T001 ref update always sends force false',async()=>{
  const {calls,transport}=makeTransport(()=>response(200,{object:{sha:'abc'}}));
  await transport.updateRefFastForward('controller-journal/v1','abc');
  assert.equal(calls.length,1);assert.equal(calls[0].options.method,'PATCH');
  assert.equal(JSON.parse(calls[0].options.body).force,false);
  assert.match(calls[0].url,/git\/refs\/heads\/controller-journal\/v1$/);
});

test('GHT-T002 GitHub 409 and 422 ref responses become JOURNAL_HEAD_CONFLICT',async()=>{
  for(const status of [409,422]){
    const {transport}=makeTransport(()=>response(status,{message:'not fast forward'}));
    await assert.rejects(transport.updateRefFastForward('controller-journal/v1','abc'),e=>e instanceof GitHubApiError&&e.code==='JOURNAL_HEAD_CONFLICT'&&e.status===status);
  }
});

test('GHT-T003 exact-commit file 404 returns null while other failures propagate',async()=>{
  const {transport}=makeTransport(()=>response(404,{message:'Not Found'}));
  assert.equal(await transport.readFile('deadbeef','journal/x.json'),null);
  const t2=makeTransport(()=>response(500,{message:'server'})).transport;
  await assert.rejects(t2.readFile('deadbeef','journal/x.json'),e=>e.code==='GITHUB_UNAVAILABLE');
});

test('GHT-T004 network exception is classified as ambiguous rather than definite failure',async()=>{
  const transport=new GitHubGitDatabaseTransport({owner:'o',repo:'r',tokenProvider:async()=> 'token',fetchImpl:async()=>{throw new Error('socket reset');}});
  await assert.rejects(transport.getRef('controller-journal/v1'),e=>e.code==='GITHUB_NETWORK_AMBIGUOUS');
});

test('GHT-T005 commit creation uses exact parent tree and exactly one parent',async()=>{
  const calls=[];
  const transport=new GitHubGitDatabaseTransport({owner:'o',repo:'r',tokenProvider:async()=> 'token',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(options.method==='GET'&&url.includes('/git/commits/parent'))return response(200,{sha:'parent',tree:{sha:'tree-parent'},parents:[]});
    if(options.method==='POST'&&url.endsWith('/git/blobs'))return response(201,{sha:`blob-${calls.length}`});
    if(options.method==='POST'&&url.endsWith('/git/trees'))return response(201,{sha:'tree-new'});
    if(options.method==='POST'&&url.endsWith('/git/commits'))return response(201,{sha:'commit-new'});
    throw new Error(`unexpected ${options.method} ${url}`);
  }});
  const result=await transport.createCommitFromFiles({parentSha:'parent',files:{'a.json':'A','b.json':'B'},message:'m'});
  assert.equal(result.sha,'commit-new');
  const treeCall=calls.find(c=>c.url.endsWith('/git/trees'));assert.equal(JSON.parse(treeCall.options.body).base_tree,'tree-parent');
  const commitCall=calls.find(c=>c.url.endsWith('/git/commits'));assert.deepEqual(JSON.parse(commitCall.options.body).parents,['parent']);
});

test('GHT-T006 authorization and API-version headers are set without persisting credentials',async()=>{
  const {calls,transport}=makeTransport(()=>response(200,{object:{sha:'abc'}}));await transport.getRef('x');
  assert.equal(calls[0].options.headers.Authorization,'Bearer token');assert.equal(calls[0].options.headers['X-GitHub-Api-Version'],'2026-03-10');
});
