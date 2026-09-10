'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const stateModel=require('../../system-master/book-system/book-workflow-state-model');
const routing=require('../../system-master/book-system/book-capability-routing-interface');
const planRuntime=require('../../system-master/book-system/book-workflow-execution-plan');
const failure=require('../../system-master/book-system/book-workflow-failure-semantics');

const results=[];
function h(v){return crypto.createHash('sha256').update(String(v),'utf8').digest('hex');}
function clone(v){return JSON.parse(JSON.stringify(v));}
function pass(id,extra={}){results.push({case_id:id,result:'PASS',...extra});}
function expectError(id,fn,code){try{fn();throw new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`);}catch(err){if(err.message===`EXPECTED_ERROR_NOT_THROWN:${code}`)throw err;if(err.code!==code)throw new Error(`${id}:EXPECTED_${code}:GOT_${err.code||err.message}`);pass(id,{observed:err.code});}}
function wf(){return stateModel.createWorkflowState({workflow_id:'WF-2G-001',book_project_id:'BOOK-PROJECT-001',objective:'Handle failure without manuscript loss.',target_section_ref:'chapter-10',source_identity:{book_state_version:10,book_state_digest:h('bs10'),canonical_manuscript_ref:'MANUSCRIPT-CANONICAL-001',manuscript_version_id:'MANUSCRIPT-V010',manuscript_digest_sha256:h('mv10')},input_hashes:{objective:h('2g')},created_at:'2026-09-10T12:30:00-04:00'});}
function task(id,cls,cap,domain,deps=[],opts={}){return{task_id:id,task_class:cls,capability_id:cap,required_authority_domain:domain,authority_wait_owner:opts.authority_wait_owner===undefined?null:opts.authority_wait_owner,required_dependency_ids:deps,optional_dependency_ids:opts.optional_dependency_ids||[],input_ref_hashes:{source:h(id)},context_package_refs:[],required_for_plan_success:opts.required_for_plan_success===undefined?true:opts.required_for_plan_success};}
function plan(tasks,workflow=wf(),id='PLAN-2G'){return planRuntime.createExecutionPlan({plan_id:id,book_project_id:workflow.book_project_id,objective_ref:'OBJ-2G',objective_hash_sha256:h('Handle failure without manuscript loss.'),tasks,created_at:'2026-09-10T12:31:00-04:00'},workflow,routing.loadDefaultRegistry());}
function record(p,w,taskId,failureClass,id='FAIL-001',extra={}){return failure.deriveFailureRecord({plan:p,workflow_state:w,failure_record_id:id,task_id:taskId,failure_class:failureClass,error_code:extra.error_code||'ERR_TEST',evidence_refs:extra.evidence_refs||['EVIDENCE-001'],...extra});}

const w=wf();
const idemPlan=plan([task('T-ANALYZE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS')],w,'PLAN-IDEM');
const idemTimeout=record(idemPlan,w,'T-ANALYZE','PROVIDER_TIMEOUT_UNKNOWN_OUTCOME','FAIL-IDEM-TIMEOUT');
if(idemTimeout.disposition_class!=='RETRY_POLICY_REQUIRED')throw new Error('IDEMPOTENT_TIMEOUT_WRONG');
pass('OFS-001-IDEMPOTENT-UNKNOWN-OUTCOME-ROUTES-RETRY-POLICY');

const genPlan=plan([task('T-GEN','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','LITERARY_CANDIDATE_GENERATION')],w,'PLAN-GEN');
const genTimeout=record(genPlan,w,'T-GEN','PROVIDER_TIMEOUT_UNKNOWN_OUTCOME','FAIL-GEN-TIMEOUT');
if(genTimeout.disposition_class!=='RECONCILIATION_REQUIRED')throw new Error('NONIDEMPOTENT_TIMEOUT_WRONG');
pass('OFS-002-NONIDEMPOTENT-UNKNOWN-OUTCOME-ROUTES-RECONCILIATION');

const genError=record(genPlan,w,'T-GEN','PROVIDER_ERROR_CONFIRMED_NO_EFFECT','FAIL-GEN-ERROR');
if(genError.disposition_class!=='RECONCILIATION_REQUIRED')throw new Error('NONIDEMPOTENT_ERROR_BYPASSED_RECONCILIATION');
pass('OFS-003-NONIDEMPOTENT-ERROR-STILL-ROUTES-2F-RECONCILIATION');

const reqPlan=plan([task('T-REQ','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS')],w,'PLAN-REQ');
for(const [i,fc] of ['PROVIDER_PARTIAL','PROVIDER_ABSTAIN','PROVIDER_REJECTED'].entries()){
  const r=record(reqPlan,w,'T-REQ',fc,`FAIL-REQ-${i}`);if(r.disposition_class!=='FAIL_CLOSED_REQUIRED_TASK')throw new Error(`${fc}_NOT_FAIL_CLOSED`);
}
pass('OFS-004-REQUIRED-PARTIAL-ABSTAIN-REJECT-FAIL-CLOSED');

const optionalPlan=plan([task('T-OPT','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS',[],{required_for_plan_success:false})],w,'PLAN-OPT');
const opt=record(optionalPlan,w,'T-OPT','PROVIDER_ABSTAIN','FAIL-OPT');
if(opt.disposition_class!=='OPTIONAL_FAILURE_CONTINUE_WITH_PARTIAL_EVIDENCE')throw new Error('OPTIONAL_NOT_PARTIAL_CONTINUE');
pass('OFS-005-OPTIONAL-FAILURE-CONTINUES-WITH-PARTIAL-EVIDENCE');

const optionalRequiredDownstreamPlan=plan([
 task('T-OPT','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS',[],{required_for_plan_success:false}),
 task('T-REQ','SPECIALIST_SERVICE_TASK','PROSE.ASSESS_VOICE','VOICE_EVIDENCE',['T-OPT'],{required_for_plan_success:true})
],w,'PLAN-OPT-DOWNSTREAM');
const optBlocked=record(optionalRequiredDownstreamPlan,w,'T-OPT','PROVIDER_ABSTAIN','FAIL-OPT-DOWN');
if(optBlocked.disposition_class!=='FAIL_CLOSED_REQUIRED_TASK'||!optBlocked.blocked_downstream_task_ids.includes('T-REQ'))throw new Error('OPTIONAL_REQUIRED_DOWNSTREAM_NOT_BLOCKED');
pass('OFS-006-OPTIONAL-FAILURE-BLOCKS-REQUIRED-DOWNSTREAM');

const transitivePlan=plan([
 task('T-A','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS',[],{required_for_plan_success:false}),
 task('T-B','SPECIALIST_SERVICE_TASK','PROSE.DIAGNOSE','LITERARY_DIAGNOSIS',['T-A'],{required_for_plan_success:false}),
 task('T-C','SPECIALIST_SERVICE_TASK','PROSE.ASSESS_VOICE','VOICE_EVIDENCE',['T-B'],{required_for_plan_success:true})
],w,'PLAN-TRANSITIVE');
const transitive=record(transitivePlan,w,'T-A','PROVIDER_PARTIAL','FAIL-TRANSITIVE');
if(transitive.disposition_class!=='FAIL_CLOSED_REQUIRED_TASK'||JSON.stringify(transitive.blocked_downstream_task_ids)!==JSON.stringify(['T-B','T-C']))throw new Error('TRANSITIVE_REQUIRED_BLOCK_WRONG');
pass('OFS-007-TRANSITIVE-REQUIRED-DOWNSTREAM-BLOCKED');

const missing=record(reqPlan,w,'T-REQ','MISSING_REQUIRED_EVIDENCE','FAIL-MISSING');
if(missing.disposition_class!=='MISSING_EVIDENCE_FAIL_CLOSED')throw new Error('MISSING_EVIDENCE_NOT_CLOSED');
pass('OFS-008-MISSING-REQUIRED-EVIDENCE-FAILS-CLOSED');

const stale=record(reqPlan,w,'T-REQ','STALE_SOURCE_OR_PLAN','FAIL-STALE');
if(stale.disposition_class!=='STALE_EXECUTION_SUPERSEDE_REQUIRED')throw new Error('STALE_NOT_SUPERSEDED');
pass('OFS-009-DETECTED-STALE-SOURCE-OR-PLAN-SUPERSEDES-ATTEMPT');

const staleCtx=record(reqPlan,w,'T-REQ','STALE_CONTEXT_PACKAGE','FAIL-CTX');
if(staleCtx.disposition_class!=='STALE_EXECUTION_SUPERSEDE_REQUIRED')throw new Error('STALE_CONTEXT_NOT_SUPERSEDED');
pass('OFS-010-STALE-CONTEXT-SUPERSEDES-ATTEMPT');

const hardGate=record(reqPlan,w,'T-REQ','HARD_GATE_FAILURE','FAIL-GATE');
if(hardGate.disposition_class!=='PRESERVE_ORIGINAL_HARD_GATE_REJECTION'||hardGate.canonical_effect_allowed!==false||hardGate.original_manuscript_preserved!==true)throw new Error('HARD_GATE_DID_NOT_PRESERVE_ORIGINAL');
pass('OFS-011-HARD-GATE-REJECTION-PRESERVES-ORIGINAL');

const authorPlan=plan([task('T-AUTHOR','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'})],w,'PLAN-AUTHOR');
const author=record(authorPlan,w,'T-AUTHOR','AUTHORITY_UNRESOLVED','FAIL-AUTHOR');
if(author.disposition_class!=='WAITING_REQUIRED_AUTHORITY')throw new Error('AUTHOR_AUTHORITY_BYPASSED');
pass('OFS-012-UNRESOLVED-AUTHOR-AUTHORITY-WAITS');

expectError('OFS-013-AUTHORITY-FAILURE-ON-PROVIDER-REJECTED',()=>record(reqPlan,w,'T-REQ','AUTHORITY_UNRESOLVED','FAIL-BAD-AUTH'),'AUTHORITY_FAILURE_REQUIRES_AUTHORITY_WAIT_TASK');

const canonPlan=plan([task('T-CANON','DECLARED_BLOCKED_CAPABILITY','CANON.CONSISTENCY_CHECK','CANON_TRUTH')],w,'PLAN-CANON');
const canon=record(canonPlan,w,'T-CANON','DECLARED_INTERFACE_UNAVAILABLE','FAIL-CANON');
if(canon.disposition_class!=='BLOCKED_DECLARED_INTERFACE')throw new Error('CANON_INTERFACE_GUESSED');
pass('OFS-014-DECLARED-CANON-INTERFACE-BLOCKS');

expectError('OFS-015-INTERFACE-FAILURE-ON-CALLABLE-PROVIDER-REJECTED',()=>record(reqPlan,w,'T-REQ','DECLARED_INTERFACE_UNAVAILABLE','FAIL-BAD-INTERFACE'),'INTERFACE_FAILURE_REQUIRES_DECLARED_BLOCKED_TASK');

const admitPlan=plan([task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION')],w,'PLAN-ADMIT');
const admit=record(admitPlan,w,'T-ADMIT','BOOK_ADMISSION_REJECTED','FAIL-ADMIT');
if(admit.disposition_class!=='BOOK_ADMISSION_REJECTION_NO_CANONICAL_EFFECT'||admit.canonical_effect_allowed!==false)throw new Error('ADMISSION_REJECTION_CANONICAL_EFFECT');
pass('OFS-016-BOOK-ADMISSION-REJECTION-NO-CANONICAL-EFFECT');

expectError('OFS-017-ADMISSION-FAILURE-ON-PROVIDER-REJECTED',()=>record(reqPlan,w,'T-REQ','BOOK_ADMISSION_REJECTED','FAIL-BAD-ADMIT'),'ADMISSION_FAILURE_REQUIRES_ADMISSION_HANDOFF');
expectError('OFS-018-UNKNOWN-FAILURE-CLASS-REJECTED',()=>record(reqPlan,w,'T-REQ','SILENT_WEIRD_FAILURE','FAIL-UNKNOWN'),'UNKNOWN_FAILURE_CLASS');
expectError('OFS-019-FAILURE-EVIDENCE-REQUIRED',()=>failure.deriveFailureRecord({plan:reqPlan,workflow_state:w,failure_record_id:'FAIL-NO-EVIDENCE',task_id:'T-REQ',failure_class:'PROVIDER_REJECTED',error_code:'ERR',evidence_refs:[]}),'VALID_FAILURE_EVIDENCE_REFS_REQUIRED');
expectError('OFS-020-DUPLICATE-FAILURE-EVIDENCE-REJECTED',()=>failure.deriveFailureRecord({plan:reqPlan,workflow_state:w,failure_record_id:'FAIL-DUP-EVIDENCE',task_id:'T-REQ',failure_class:'PROVIDER_REJECTED',error_code:'ERR',evidence_refs:['E1','E1']}),'VALID_FAILURE_EVIDENCE_REFS_REQUIRED');
expectError('OFS-021-RAW-MANUSCRIPT-IN-FAILURE-INPUT-REJECTED',()=>failure.deriveFailureRecord({plan:reqPlan,workflow_state:w,failure_record_id:'FAIL-RAW',task_id:'T-REQ',failure_class:'PROVIDER_REJECTED',error_code:'ERR',evidence_refs:['E1'],candidate_text:'forbidden'}),'RAW_MANUSCRIPT_CONTENT_FORBIDDEN');

const badDisposition=clone(hardGate);badDisposition.disposition_class='FAIL_CLOSED_REQUIRED_TASK';badDisposition.record_digest=failure.recordDigest(badDisposition);
expectError('OFS-022-DISPOSITION-TAMPER-REJECTED',()=>failure.validateFailureRecord(badDisposition,reqPlan,w),'FAILURE_DISPOSITION_MISMATCH');
const badEffect=clone(hardGate);badEffect.canonical_effect_allowed=true;badEffect.record_digest=failure.recordDigest(badEffect);
expectError('OFS-023-CANONICAL-EFFECT-TAMPER-REJECTED',()=>failure.validateFailureRecord(badEffect,reqPlan,w),'FAILURE_CANONICAL_EFFECT_FORBIDDEN');
const badPreservation=clone(hardGate);badPreservation.original_manuscript_preserved=false;badPreservation.record_digest=failure.recordDigest(badPreservation);
expectError('OFS-024-ORIGINAL-PRESERVATION-TAMPER-REJECTED',()=>failure.validateFailureRecord(badPreservation,reqPlan,w),'ORIGINAL_MANUSCRIPT_PRESERVATION_REQUIRED');
const badDigest=clone(hardGate);badDigest.record_digest=h('tamper');
expectError('OFS-025-FAILURE-RECORD-DIGEST-TAMPER-REJECTED',()=>failure.validateFailureRecord(badDigest,reqPlan,w),'FAILURE_RECORD_DIGEST_MISMATCH');

const stalePlan=clone(reqPlan);stalePlan.source_identity.manuscript_digest_sha256=h('old-manuscript');stalePlan.plan_digest=planRuntime.digestPlan(stalePlan);
expectError('OFS-026-ACTUALLY-STALE-PLAN-REJECTED-BEFORE-DISPOSITION',()=>record(stalePlan,w,'T-REQ','STALE_SOURCE_OR_PLAN','FAIL-ACTUAL-STALE'),'STALE_WORKFLOW_SOURCE_IDENTITY');

const exportedNames=Object.keys(failure);
if(exportedNames.some(name=>/dispatch|execute|retryProvider|reconcileProvider|admit|cancel|resume|writeCanonical|schedule|worker/i.test(name)))throw new Error(`UNAUTHORIZED_FAILURE_EXECUTION_API:${exportedNames.join(',')}`);
pass('OFS-027-NO-EXECUTION-RETRY-ADMISSION-CANCEL-RESUME-API');

for(const r of [idemTimeout,genTimeout,opt,missing,stale,staleCtx,hardGate,author,canon,admit])if(r.canonical_effect_allowed!==false||r.original_manuscript_preserved!==true)throw new Error('FAILURE_RECORD_PRESERVATION_INVARIANT_BROKEN');
pass('OFS-028-ALL-DISPOSITIONS-PRESERVE-ORIGINAL-NO-CANONICAL-EFFECT');

const hardGate2=record(reqPlan,w,'T-REQ','HARD_GATE_FAILURE','FAIL-GATE');
if(hardGate.record_digest!==hardGate2.record_digest)throw new Error('FAILURE_RECORD_NOT_DETERMINISTIC');
pass('OFS-029-DETERMINISTIC-FAILURE-RECORD-DIGEST');

if(idemTimeout.disposition_class==='RETRY_POLICY_REQUIRED'&&genTimeout.disposition_class==='RECONCILIATION_REQUIRED')pass('OFS-030-FAILURE-LAYER-DELEGATES-TO-2F-WITHOUT-EXECUTION');else throw new Error('2F_DELEGATION_WRONG');

const summary={qualification_id:'BOOK-WORKFLOW-ORCHESTRATOR-FAILURE-SEMANTICS-001-QUALIFICATION',result:'PASS',subject_sha:process.env.GITHUB_SHA||null,fixture_class:'SYNTHETIC_NON_PRIVATE_FAILURE_DISPOSITION',planned_cases:30,passed_cases:results.length,assertions:results.length,provider_execution_performed:false,retry_executed:false,reconciliation_executed:false,canonical_manuscript_mutated:false,book_admission_executed:false,cancellation_resume_executed:false,prose_runtime_mutated:false,fresh_blind_scoring_executed:false,a01_pass_claimed_for_this_subject:false,native_private_publication_production_claimed:false,results};
if(results.length!==30)throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const out=path.join(process.env.RUNNER_TEMP||'/tmp','book-workflow-orchestrator-failure-semantics-001-summary.json');fs.writeFileSync(out,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
