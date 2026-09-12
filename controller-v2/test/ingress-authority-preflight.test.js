import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAuthoritativeIngressPreflight } from '../src/ingress-authority-preflight.js';
import { CONTROL_STATE_ACTIVATION_PROTOCOL } from '../src/control-state-activation-closure.js';
import { COMMAND_INBOX_NAMESPACE } from '../src/github-command-inbox-transport.js';

function receipt(){return {protocol_version:CONTROL_STATE_ACTIVATION_PROTOCOL,authority:{control_state_repository:'bfochtman746/system-master-control-state',control_state_repository_id:'999'}};}
function config(){return {mode:'authoritative',namespace:COMMAND_INBOX_NAMESPACE,principal:{kind:'github-app',id:'303'}};}
function writer(){return {enforcement:'active',rules:[{type:'creation'}],bypass_actors:[{actor_type:'Integration',actor_id:303,bypass_mode:'always'}]};}
function immutable(){return [
  {enforcement:'active',rules:[{type:'update'}],bypass_actors:[]},
  {enforcement:'active',rules:[{type:'deletion'}],bypass_actors:[]}
];}
function observation(){return {repository_exists:true,repository_full_name:'BFochtman746/system-master-control-state',repository_id:999,creation_rulesets:[writer()],immutability_rulesets:immutable()};}
function transport(){const token=()=>{};token.principal={kind:'github-app',id:'303'};token.repositoryId=999;return {git:{owner:'BFochtman746',repo:'system-master-control-state',tokenProvider:token}};}
function code(fn,expected){assert.throws(fn,e=>e?.code===expected);}

test('IN-PF001 exact C1 repo/app/tag-protection topology passes',()=>{
  const out=assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:observation(),transport:transport()});
  assert.equal(out.authoritative,true);assert.equal(out.repository_id,'999');assert.equal(out.principal.id,'303');
});

test('IN-PF002 C1 activation receipt is mandatory',()=>code(()=>assertAuthoritativeIngressPreflight({activationReceipt:{protocol_version:'wrong'},config:config(),observation:observation(),transport:transport()}),'INGRESS_ACTIVATION_REQUIRED'));

test('IN-PF003 ingress repository must equal exact C1 activated name and numeric id',()=>{
  const o=observation();o.repository_id=1000;code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:o,transport:transport()}),'INGRESS_REPOSITORY_MISMATCH');
});

test('IN-PF004 creation rule must actively authorize exactly the configured App',()=>{
  const o=observation();o.creation_rulesets=[{enforcement:'evaluate',rules:[{type:'creation'}],bypass_actors:[{actor_type:'Integration',actor_id:303,bypass_mode:'always'}]}];
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:o,transport:transport()}),'INGRESS_CREATION_PROTECTION_INVALID');
  o.creation_rulesets=[{enforcement:'active',rules:[{type:'creation'}],bypass_actors:[{actor_type:'Integration',actor_id:303,bypass_mode:'always'},{actor_type:'RepositoryRole',actor_id:5,bypass_mode:'always'}]}];
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:o,transport:transport()}),'INGRESS_CREATION_PROTECTION_INVALID');
});

test('IN-PF005 immutable namespace requires update restriction with no bypass',()=>{
  const o=observation();o.immutability_rulesets=o.immutability_rulesets.filter(r=>!r.rules.some(x=>x.type==='update'));
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:o,transport:transport()}),'INGRESS_UPDATE_PROTECTION_MISSING');
});

test('IN-PF006 immutable namespace requires deletion restriction with no bypass',()=>{
  const o=observation();o.immutability_rulesets=o.immutability_rulesets.filter(r=>!r.rules.some(x=>x.type==='deletion'));
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:o,transport:transport()}),'INGRESS_DELETE_PROTECTION_MISSING');
});

test('IN-PF007 immutability rules may never contain an always bypass actor',()=>{
  const o=observation();o.immutability_rulesets.push({enforcement:'active',rules:[{type:'update'}],bypass_actors:[{actor_type:'Integration',actor_id:303,bypass_mode:'always'}]});
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:o,transport:transport()}),'INGRESS_IMMUTABILITY_BYPASS_PRESENT');
});

test('IN-PF008 runtime GitHub App principal must equal configured ingress principal',()=>{
  const t=transport();t.git.tokenProvider.principal={kind:'github-app',id:'404'};
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:observation(),transport:t}),'INGRESS_RUNTIME_PRINCIPAL_MISMATCH');
});

test('IN-PF009 runtime token and transport must be bound to exact activated repository',()=>{
  const t=transport();t.git.tokenProvider.repositoryId=1000;
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:observation(),transport:t}),'INGRESS_RUNTIME_REPOSITORY_MISMATCH');
  const t2=transport();t2.git.repo='system-master';
  code(()=>assertAuthoritativeIngressPreflight({activationReceipt:receipt(),config:config(),observation:observation(),transport:t2}),'INGRESS_RUNTIME_REPOSITORY_MISMATCH');
});
