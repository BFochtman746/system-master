'use strict';
const fs=require('fs'),path=require('path');
const root=process.env.GITHUB_WORKSPACE||process.cwd(),q=path.join(root,'qualification','learning');
const load=n=>JSON.parse(fs.readFileSync(path.join(q,n),'utf8'));
const fail=(c,d='')=>{throw new Error(d?`${c}:${d}`:c)},text=v=>typeof v==='string'&&v.trim().length>0;
const contract=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-CONTRACT-044.json');
const full=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-FULL-CLOSURE-CANDIDATE-042A.json');
const source=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const batch=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-BATCH-01-CANDIDATE-044A.json');
if(contract.current_executable_successor!==batch.artifact_id)fail('CONTRACT_SUCCESSOR_MISMATCH');
if(batch.base_control_head!=='00117121ec08e27c00e0fad61aa5c455d1b06ab8'||batch.batch_index!==1||batch.selected_candidate_count!==5)fail('BATCH_CONTRACT');
if(full.expected_requirement_count!==66||full.expected_assessment_target_count!==66||source.node_count!==66)fail('FROZEN_SET_COUNT');
if(source.source.requirement_set_digest!==full.frozen_requirement_set_digest)fail('FROZEN_SET_DIGEST');
const sourceIds=new Set(source.nodes.map(r=>r[0]));
const unresolved=[];
for(const name of full.topology_inputs){const t=load(name);for(const c of t.unresolved_dependency_candidates||[])unresolved.push({c,topology:name});}
const expected=unresolved.slice(0,5);
if(expected.length!==5||batch.dispositions.length!==5)fail('FIRST_BATCH_SIZE');
const assessByParent=new Map();
for(const name of full.assessment_batches){const b=load(name);for(const t of b.targets||[])assessByParent.set(t.parent_requirement_id,{target:t,batch:name});}
let rejected=0,admitted=0,remaining=0,deferred=0;
for(let i=0;i<5;i++){
 const got=batch.dispositions[i],exp=expected[i];
 if(got.candidate_id!==exp.c.candidate_id||got.from_id!==exp.c.from_id||got.to_id!==exp.c.to_id)fail('DETERMINISTIC_SELECTION',String(i));
 if(got.source_topology_artifact!==`qualification/learning/${exp.topology}`)fail('TOPOLOGY_REF',got.candidate_id);
 if(exp.c.admission_status!=='UNRESOLVED__NOT_CANONICAL')fail('SOURCE_CANDIDATE_ALREADY_RESOLVED',got.candidate_id);
 if(!sourceIds.has(got.from_id)||!sourceIds.has(got.to_id))fail('ENDPOINT_RESOLUTION',got.candidate_id);
 if(!contract.allowed_dispositions.includes(got.disposition))fail('DISPOSITION_CLASS',got.candidate_id);
 if(!got.material_dependency_test||typeof got.material_dependency_test.target_independently_performable!=='boolean'||!text(got.material_dependency_test.basis)||!text(got.rationale))fail('MATERIAL_DEPENDENCY_EVIDENCE',got.candidate_id);
 const fromA=assessByParent.get(got.from_id),toA=assessByParent.get(got.to_id);if(!fromA||!toA)fail('ASSESSMENT_ENDPOINT_EVIDENCE',got.candidate_id);
 if(!Array.isArray(got.evidence_refs)||!got.evidence_refs.includes(`SOURCE_NODE_INDEX:${got.from_id}`)||!got.evidence_refs.includes(`SOURCE_NODE_INDEX:${got.to_id}`))fail('SOURCE_EVIDENCE_REFS',got.candidate_id);
 if(!got.evidence_refs.some(r=>r.includes(got.candidate_id)))fail('TOPOLOGY_EVIDENCE_REF',got.candidate_id);
 if(!got.evidence_refs.some(r=>r.includes(fromA.target.assessment_target_id))||!got.evidence_refs.some(r=>r.includes(toA.target.assessment_target_id)))fail('ASSESSMENT_EVIDENCE_REFS',got.candidate_id);
 if(got.disposition==='REJECT_AS_HARD_PREREQUISITE'){if(got.material_dependency_test.target_independently_performable!==true)fail('REJECTION_INDEPENDENCE_TEST',got.candidate_id);rejected++;}
 else if(got.disposition.startsWith('ADMIT_'))admitted++;
 else if(got.disposition==='REMAIN_UNRESOLVED__NOT_CANONICAL')remaining++;
 else if(got.disposition==='DEFER_TO_SEPARATE_HUMAN_OR_SME_EVIDENCE')deferred++;
}
if(!batch.batch_summary||batch.batch_summary.admitted!==admitted||batch.batch_summary.rejected_as_hard_prerequisite!==rejected||batch.batch_summary.remain_unresolved_not_canonical!==remaining||batch.batch_summary.deferred_to_human_or_sme!==deferred)fail('SUMMARY_MISMATCH');
if(!Array.isArray(batch.admitted_prerequisite_edges)||batch.admitted_prerequisite_edges.length!==admitted)fail('ADMITTED_EDGE_COUNT');
for(const k of ['learner_mastery','psychometric_validity','retention','transfer','workplace_effectiveness','sme_approval','certification_equivalence'])if(!batch.evidence_boundaries||batch.evidence_boundaries[k]!=='UNOBSERVED')fail('PROTECTED_EVIDENCE',k);
if(batch.evidence_boundaries.a01_authority!=='NOT_INFERRED_FROM_HOSTED_ADJUDICATION'||batch.evidence_boundaries.native_platform_authority!=='NOT_INFERRED'||batch.evidence_boundaries.production_authority!=='NOT_INFERRED')fail('AUTHORITY_BOUNDARY');
const out={qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-BATCH-01-HOSTED-PREQUAL',subject_sha:process.env.GITHUB_SHA||'LOCAL',result_class:'PASS',selected_candidates:5,rejected_as_hard_prerequisite:rejected,admitted,remain_unresolved_not_canonical:remaining,deferred_to_human_or_sme:deferred,deterministic_candidate_order:true,endpoints_resolved:true,assessment_evidence_bound:true,learner_mastery:'UNOBSERVED',psychometric_validity:'UNOBSERVED',retention:'UNOBSERVED',transfer:'UNOBSERVED',workplace_effectiveness:'UNOBSERVED',sme_approval:'UNOBSERVED',certification_equivalence:'UNOBSERVED',a01_pass_claimed:false,native_or_production_claimed:false,next_objective:batch.next_batch_on_pass};
const ed=path.join(process.env.RUNNER_TEMP||root,'learning-dependency-adjudication-batch-01-evidence');fs.mkdirSync(ed,{recursive:true});fs.writeFileSync(path.join(ed,'qualification-summary.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
