'use strict';
const fs=require('fs'),path=require('path');
const root=process.env.GITHUB_WORKSPACE||process.cwd(),q='qualification/learning/';
const load=n=>JSON.parse(fs.readFileSync(path.join(root,q+n),'utf8'));
const contract=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-CONTRACT-025A.json');
const source=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const topo=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');
const batch=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-BATCH-01-CANDIDATE-026A.json');
const sourceMap=new Map(source.nodes.map(r=>[r[0],{locator:r[2],cognitive:r[3]}]));
const subMap=new Map(topo.subskills.map(s=>[s.subskill_id,s]));
const text=v=>typeof v==='string'&&v.trim().length>0,fail=(c,d='')=>{throw new Error(d?`${c}:${d}`:c)};
function validate(t){
  for(const f of contract.target_schema.required_fields)if(!Object.prototype.hasOwnProperty.call(t,f))fail('TARGET_FIELD_MISSING',`${t.assessment_target_id||'?'}:${f}`);
  const s=subMap.get(t.subskill_id);if(!s)fail('UNKNOWN_SUBSKILL',t.subskill_id);
  if(t.parent_requirement_id!==s.parent_requirement_id)fail('SUBSKILL_PARENT_MISMATCH',t.assessment_target_id);
  const r=sourceMap.get(t.parent_requirement_id);if(!r)fail('UNKNOWN_PARENT',t.parent_requirement_id);
  if(t.source_locator!==r.locator)fail('SOURCE_LOCATOR_MISMATCH',t.assessment_target_id);
  if(t.preserved_cognitive_level!==r.cognitive)fail('COGNITIVE_LEVEL_MISMATCH',t.assessment_target_id);
  if(t.capability_statement!==s.capability_statement)fail('CAPABILITY_STATEMENT_MISMATCH',t.assessment_target_id);
  if(!text(t.assessment_target_id)||!t.assessment_target_id.startsWith(`ASSESS::CSSGB-2022::${t.parent_requirement_id}::`))fail('TARGET_ID_INVALID',t.assessment_target_id);
  if(!contract.target_schema.target_types.includes(t.target_type)||!contract.target_schema.evidence_input_classes.includes(t.evidence_input_class)||!contract.target_schema.response_action_classes.includes(t.response_action_class))fail('TARGET_CLASS_INVALID',t.assessment_target_id);
  if(!contract.cognitive_alignment_rules[t.preserved_cognitive_level].includes(t.response_action_class))fail('COGNITIVE_ACTION_MISALIGNMENT',t.assessment_target_id);
  if(!t.prompt_contract||!text(t.prompt_contract.supplied_evidence)||!text(t.prompt_contract.required_action)||!Array.isArray(t.prompt_contract.must_not_assume))fail('PROMPT_CONTRACT_INVALID',t.assessment_target_id);
  const min=t.preserved_cognitive_level==='REMEMBER'?1:2;if(!Array.isArray(t.scoring_assertions)||t.scoring_assertions.length<min)fail('SCORING_ASSERTION_COUNT',t.assessment_target_id);
  const seen=new Set();for(const a of t.scoring_assertions){if(!a||!text(a.assertion_id)||seen.has(a.assertion_id)||!text(a.observable_property)||!text(a.pass_condition))fail('SCORING_ASSERTION_INVALID',t.assessment_target_id);seen.add(a.assertion_id);const x=`${a.observable_property} ${a.pass_condition}`.toLowerCase();if(x.includes('evaluator agrees')||x.includes('looks correct')||x.includes('seems correct')||x.includes('subjective'))fail('NONDETERMINISTIC_SCORING',t.assessment_target_id)}
  if(!t.insufficient_evidence_behavior||!text(t.insufficient_evidence_behavior.trigger)||!text(t.insufficient_evidence_behavior.required_behavior))fail('INSUFFICIENT_EVIDENCE_BEHAVIOR_REQUIRED',t.assessment_target_id);
  if(!Array.isArray(t.provenance_refs)||!t.provenance_refs.includes(`SOURCE_NODE_INDEX:${t.parent_requirement_id}`)||!t.provenance_refs.includes(`SUBSKILL:${t.subskill_id}`))fail('PROVENANCE_REQUIRED',t.assessment_target_id);
  if(t.validation_status!=='PROVISIONAL_BOUND')fail('VALIDATION_STATUS_INVALID',t.assessment_target_id);
  for(const k of ['psychometric_validity','learner_mastery','retention','transfer','workplace_effectiveness','sme_approval','certification_equivalence'])if(!t.evidence_boundaries||t.evidence_boundaries[k]!=='UNOBSERVED')fail('UNAUTHORIZED_EVIDENCE_CLAIM',`${t.assessment_target_id}:${k}`);
}
const expected=source.nodes.filter(r=>String(r[0]).startsWith('ASQ-CSSGB-2022-I.')).map(r=>r[0]);
if(batch.base_control_head!=='9598c0b6b24a33a306608535110c38f26355b9bf'||batch.domain!=='I'||batch.target_count!==8||batch.targets.length!==8)fail('BATCH_CONTRACT');
if(JSON.stringify(batch.targets.map(t=>t.parent_requirement_id))!==JSON.stringify(expected))fail('DOMAIN_I_SOURCE_ORDER');
if(new Set(batch.targets.map(t=>t.assessment_target_id)).size!==8||new Set(batch.targets.map(t=>t.subskill_id)).size!==8)fail('DUPLICATE_TARGET_OR_SUBSKILL');
for(const t of batch.targets)validate(t);
for(const k of ['psychometric_validity','learner_mastery','retention','transfer','workplace_effectiveness','sme_approval','certification_equivalence'])if(batch.batch_boundaries[k]!=='UNOBSERVED')fail('BATCH_BOUNDARY_CLAIM',k);
if(batch.batch_boundaries.unresolved_dependency_candidates!=='UNCHANGED__SEPARATE_LANE')fail('DEPENDENCY_BOUNDARY');
const result={qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-BATCH-01-026-HOSTED-PREQUAL',subject_sha:process.env.GITHUB_SHA||'LOCAL',result_class:'PASS',domain:'I',targets_validated:8,parent_requirements:expected,exact_source_order:true,deterministic_scoring_contract:true,insufficient_evidence_behavior_bound:true,psychometric_validity:'UNOBSERVED',learner_mastery:'UNOBSERVED',retention:'UNOBSERVED',transfer:'UNOBSERVED',workplace_effectiveness:'UNOBSERVED',sme_approval:'UNOBSERVED',certification_equivalence:'UNOBSERVED',unresolved_dependency_candidates:'UNCHANGED__SEPARATE_LANE',next_objective:batch.next_batch};
const ed=path.join(process.env.RUNNER_TEMP||root,'learning-assessment-target-batch-01-evidence');fs.mkdirSync(ed,{recursive:true});fs.writeFileSync(path.join(ed,'qualification-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
