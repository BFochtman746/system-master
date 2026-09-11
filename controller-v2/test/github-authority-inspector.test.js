import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubGitDatabaseTransport } from '../src/github-git-transport.js';
import { GitHubAuthorityInspector } from '../src/github-authority-inspector.js';
import { assertAuthoritativePreflight } from '../src/authority-preflight.js';

function response(status,body){return {ok:status>=200&&status<300,status,headers:{get(){return null;}},async text(){return body===undefined?'':JSON.stringify(body);}};}
function config(){return {mode:'authoritative',subjectRepository:'BFochtman746/system-master',controlStateRepository:'BFochtman746/system-master-control-state',controlStateRepositoryId:404,journal:{branch:'controller-journal/v1',principal:{kind:'github-app',id:101}},anchor:{branch:'controller-anchor/v1',principal:{kind:'github-app',id:202}}};}
function updateRuleset(id,appId){return {id,enforcement:'active',rules:[{type:'update',parameters:{update_allows_fetch_and_merge:false}}],bypass_actors:[{actor_type:'Integration',actor_id:appId,bypass_mode:'always'}]};}
function integrityRuleset(id){return {id,enforcement:'active',rules:[{type:'deletion'},{type:'non_fast_forward'}],bypass_actors:[]};}
function setup({missingRepo=false,hideBypass=false}={}){
  const rules={11:updateRuleset(11,101),12:integrityRuleset(12),21:updateRuleset(21,202),22:integrityRuleset(22)};
  if(hideBypass){rules[11]={...rules[11]};delete rules[11].bypass_actors;}
  const fetchImpl=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path==='/repos/BFochtman746/system-master-control-state')return missingRepo?response(404,{message:'Not Found'}):response(200,{id:404,full_name:'BFochtman746/system-master-control-state'});
    if(path.endsWith('/git/ref/heads/controller-journal/v1')||path.endsWith('/git/ref/heads/controller-anchor/v1'))return response(200,{object:{sha:'abc'}});
    if(path.endsWith('/rules/branches/controller-journal/v1'))return response(200,[{type:'update',ruleset_id:11},{type:'deletion',ruleset_id:12},{type:'non_fast_forward',ruleset_id:12}]);
    if(path.endsWith('/rules/branches/controller-anchor/v1'))return response(200,[{type:'update',ruleset_id:21},{type:'deletion',ruleset_id:22},{type:'non_fast_forward',ruleset_id:22}]);
    const m=path.match(/\/rulesets\/(\d+)$/);if(m)return response(200,rules[Number(m[1])]);
    throw new Error(`unexpected ${options.method} ${path}`);
  };
  const transport=new GitHubGitDatabaseTransport({owner:'BFochtman746',repo:'system-master-control-state',tokenProvider:async()=> 'admin-provisioning-token',fetchImpl});
  return new GitHubAuthorityInspector({transport});
}

test('GAI-T001 privileged inspector resolves repository ID and effective rule IDs to full bypass-aware rulesets',async()=>{
  const observation=await setup().inspect({journalBranch:'controller-journal/v1',anchorBranch:'controller-anchor/v1'});
  assert.equal(observation.repository_exists,true);assert.equal(observation.repository_id,404);assert.equal(observation.journal.writer_rulesets[0].id,11);assert.equal(observation.journal.integrity_rulesets[0].id,12);assert.equal(observation.anchor.writer_rulesets[0].id,21);assert.equal(observation.anchor.integrity_rulesets[0].id,22);
  assert.equal(assertAuthoritativePreflight(config(),observation).authoritative,true);
});

test('GAI-T002 missing repository is reported without inventing protection state',async()=>{const o=await setup({missingRepo:true}).inspect({journalBranch:'controller-journal/v1',anchorBranch:'controller-anchor/v1'});assert.equal(o.repository_exists,false);assert.equal(o.repository_id,null);assert.equal(o.journal,null);assert.equal(o.anchor,null);});
test('GAI-T003 hidden/missing bypass actor data fails authoritative preflight closed',async()=>{const o=await setup({hideBypass:true}).inspect({journalBranch:'controller-journal/v1',anchorBranch:'controller-anchor/v1'});assert.throws(()=>assertAuthoritativePreflight(config(),o),e=>e.code==='AUTH_WRITER_BYPASS_INVALID');});
