import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAuthoritativePreflight, validateAuthorityConfiguration } from '../src/authority-preflight.js';
import { ControllerError } from '../src/errors.js';

const CONFIG={
  mode:'authoritative',
  subjectRepository:'BFochtman746/system-master',
  controlStateRepository:'BFochtman746/system-master-control-state',
  controlStateRepositoryId:404,
  journal:{branch:'controller-journal/v1',principal:{kind:'github-app',id:101}},
  anchor:{branch:'controller-anchor/v1',principal:{kind:'github-app',id:202}}
};
function writer(id){return {enforcement:'active',rules:[{type:'update'}],bypass_actors:[{actor_type:'Integration',actor_id:id,bypass_mode:'always'}]};}
function integrity(){return {enforcement:'active',rules:[{type:'deletion'},{type:'non_fast_forward'}],bypass_actors:[]};}
function observed(){return {repository_exists:true,repository_full_name:'BFochtman746/system-master-control-state',repository_id:404,journal:{branch_exists:true,writer_rulesets:[writer(101)],integrity_rulesets:[integrity()]},anchor:{branch_exists:true,writer_rulesets:[writer(202)],integrity_rulesets:[integrity()]}};}
function assertCode(fn,code){assert.throws(fn,e=>e instanceof ControllerError&&e.code===code);}

test('APF-T001 exact separate-repo/separate-app/layered-ruleset topology passes',()=>{const r=assertAuthoritativePreflight(CONFIG,observed());assert.equal(r.authoritative,true);assert.equal(r.controlStateRepository,'bfochtman746/system-master-control-state');assert.equal(r.controlStateRepositoryId,'404');});
test('APF-T002 subject repository cannot also be control-state repository',()=>{assertCode(()=>validateAuthorityConfiguration({...CONFIG,controlStateRepository:CONFIG.subjectRepository}),'AUTH_SUBJECT_CONTROL_COLLISION');});
test('APF-T003 journal and anchor refs cannot be the same',()=>{assertCode(()=>validateAuthorityConfiguration({...CONFIG,anchor:{...CONFIG.anchor,branch:CONFIG.journal.branch}}),'AUTH_REF_COLLISION');});
test('APF-T004 journal and anchor cannot share one GitHub App identity',()=>{assertCode(()=>validateAuthorityConfiguration({...CONFIG,anchor:{...CONFIG.anchor,principal:{kind:'github-app',id:101}}}),'AUTH_PRINCIPAL_COLLISION');});
test('APF-T005 missing dedicated repository blocks activation',()=>{const o=observed();o.repository_exists=false;assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_CONTROL_REPOSITORY_MISSING');});
test('APF-T006 wrong observed repository name or numeric ID blocks activation',()=>{let o=observed();o.repository_full_name='BFochtman746/system-master';assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_REPOSITORY_IDENTITY_MISMATCH');o=observed();o.repository_id=999;assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_REPOSITORY_IDENTITY_MISMATCH');});
test('APF-T007 journal missing restrict-updates rule blocks activation',()=>{const o=observed();o.journal.writer_rulesets=[];assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_UPDATE_RESTRICTION_MISSING');});
test('APF-T008 writer update rule must bypass exactly designated app and no broad actor',()=>{for(const actors of [[{actor_type:'User',actor_id:1,bypass_mode:'always'}],[{actor_type:'Integration',actor_id:999,bypass_mode:'always'}],[{actor_type:'Integration',actor_id:101,bypass_mode:'always'},{actor_type:'User',actor_id:1,bypass_mode:'always'}]]){const o=observed();o.journal.writer_rulesets=[{enforcement:'active',rules:[{type:'update'}],bypass_actors:actors}];assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_WRITER_BYPASS_INVALID');}});
test('APF-T009 deletion protection without bypass is mandatory',()=>{const o=observed();o.journal.integrity_rulesets=[{enforcement:'active',rules:[{type:'non_fast_forward'}],bypass_actors:[]}];assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_DELETION_PROTECTION_MISSING');});
test('APF-T010 non-fast-forward protection without bypass is mandatory',()=>{const o=observed();o.anchor.integrity_rulesets=[{enforcement:'active',rules:[{type:'deletion'}],bypass_actors:[]}];assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_FORCE_PUSH_PROTECTION_MISSING');});
test('APF-T011 integrity ruleset with any always-bypass actor is rejected even for designated writer',()=>{const o=observed();o.journal.integrity_rulesets=[{enforcement:'active',rules:[{type:'deletion'},{type:'non_fast_forward'}],bypass_actors:[{actor_type:'Integration',actor_id:101,bypass_mode:'always'}]}];assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_DELETION_PROTECTION_MISSING');});
test('APF-T012 both refs must already exist before authoritative activation',()=>{for(const side of ['journal','anchor']){const o=observed();o[side].branch_exists=false;assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_BRANCH_MISSING');}});
test('APF-T013 disabled/evaluate-only rulesets do not satisfy production enforcement',()=>{for(const enforcement of ['disabled','evaluate']){const o=observed();o.journal.writer_rulesets=[{...writer(101),enforcement}];assertCode(()=>assertAuthoritativePreflight(CONFIG,o),'AUTH_UPDATE_RESTRICTION_MISSING');}});
test('APF-T014 repository and app identifiers must be positive canonical integers',()=>{for(const bad of [0,-1,'','abc'])assertCode(()=>validateAuthorityConfiguration({...CONFIG,controlStateRepositoryId:bad}),'AUTH_CONFIG_INVALID');for(const bad of [0,'abc'])assertCode(()=>validateAuthorityConfiguration({...CONFIG,journal:{...CONFIG.journal,principal:{kind:'github-app',id:bad}}}),'AUTH_CONFIG_INVALID');});
