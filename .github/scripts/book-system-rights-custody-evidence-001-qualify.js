'use strict';
const assert=require('assert');
const rights=require('../../system-master/book-system/rights-custody-evidence-core.js');
const H=s=>rights.sha256(String(s));
const NOW='2026-09-12T06:45:00.000Z';
function evidence(over={}) { return Object.assign({
  evidence_id:'E-1', evidence_issuer_ref:'AUTHORITY-1', evidence_ref:'EVIDENCE-REF-1', source_ref:'SRC-1', source_digest:H('source-1'),
  intended_use_scopes:['RESEARCH_REFERENCE','QUOTATION_REVIEW'], currentness:'CURRENT', effective_at:'2026-01-01T00:00:00.000Z',
  expires_at:'2027-01-01T00:00:00.000Z', revoked_at:null, conflict_refs:[], policy_expression:{type:'ODRL',policy_ref:'urn:policy:1',profile_ref:'urn:profile:book',action_ref:'use'}
 },over); }
function expected(over={}) { return Object.assign({book_project_id:'BOOK-PROJECT-001',source_ref:'SRC-1',source_digest:H('source-1'),intended_use_scope:'RESEARCH_REFERENCE'},over); }
const opts={now:NOW,understood_policy:{odrl_profiles:['urn:profile:book'],odrl_actions:['use']}};
function expectDisposition(d, ev, ex=expected(), op=opts){assert.strictEqual(rights.evaluateRightsCustody(ev,ex,op).disposition,d);}
const tests=[];const t=(id,name,fn)=>tests.push({id,name,fn});
t('Q067','accepted current scoped evidence',()=>expectDisposition('ACCEPTED_FOR_DECLARED_SCOPE',evidence()));
t('Q068','caller authorization flag cannot create authority',()=>{const ev=evidence({disposition:'ACCEPTED_FOR_DECLARED_SCOPE',evidence_issuer_ref:'',evidence_ref:''});assert.throws(()=>rights.evaluateRightsCustody(ev,expected(),opts));});
t('Q069','unknown currentness fails closed',()=>expectDisposition('UNKNOWN',evidence({currentness:'UNKNOWN'})));
t('Q070','stale evidence rejected',()=>expectDisposition('STALE',evidence({currentness:'STALE'})));
t('Q071','expired evidence rejected',()=>expectDisposition('EXPIRED',evidence({expires_at:'2026-01-01T00:00:00.000Z'})));
t('Q072','revoked evidence rejected',()=>expectDisposition('REVOKED',evidence({revoked_at:'2026-08-01T00:00:00.000Z'})));
t('Q073','conflicting evidence rejected',()=>expectDisposition('CONFLICTING',evidence({conflict_refs:['E-CONFLICT']})));
t('Q074','intended-use mismatch rejected',()=>expectDisposition('REJECTED_FOR_SCOPE',evidence(),expected({intended_use_scope:'PUBLICATION'})));
t('Q075','source digest mismatch rejected',()=>expectDisposition('REJECTED_FOR_SCOPE',evidence(),expected({source_digest:H('different')})));
t('Q076','unknown ODRL profile cannot upgrade authority',()=>expectDisposition('REVIEW_REQUIRED',evidence({policy_expression:{type:'ODRL',policy_ref:'urn:policy:1',profile_ref:'urn:profile:unknown',action_ref:'use'}})));
let passed=0;for(const x of tests){try{x.fn();passed++;console.log(`PASS ${x.id} ${x.name}`);}catch(e){console.error(`FAIL ${x.id} ${x.name}: ${e.stack||e}`);process.exitCode=1;}}
console.log(JSON.stringify({qualification:'BOOK-RECONSTRUCTION-B00-F3-RIGHTS',required:10,observed:tests.length,passed,failed:tests.length-passed,status:passed===10?'PASS':'FAIL'}));if(passed!==10||tests.length!==10)process.exit(1);
