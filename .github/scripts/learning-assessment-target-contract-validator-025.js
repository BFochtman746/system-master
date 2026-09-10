'use strict';
const fs=require('fs'),path=require('path');
const root=process.env.GITHUB_WORKSPACE||process.cwd(),q='qualification/learning/';
const load=n=>JSON.parse(fs.readFileSync(path.join(root,q+n),'utf8'));
const contract=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-CONTRACT-025A.json');
const fixtures=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-CONTRACT-FIXTURES-025B.json');
const source=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const topo=load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');
const text=v=>typeof v==='string'&&v.trim().length>0;
const sourceMap=new Map(source.nodes.map(r=>[r[0],{id:r[0],code:r[1],locator:r[2],cognitive:r[3],title:r[4]}]));
const subMap=new Map(topo.subskills.map(s=>[s.subskill_id,s]));
const fail=(code)=>({ok:false,code});
function validate(t){
  for(const f of contract.target_schema.required_fields)if(!Object.prototype.hasOwnProperty.call(t,f))return fail('TARGET_FIELD_MISSING');
  const s=subMap.get(t.subskill_id);if(!s)return fail('UNKNOWN_SUBSKILL');
  if(t.parent_requirement_id!==s.parent_requirement_id)return fail('SUBSKILL_PARENT_MISMATCH');
  const r=sourceMap.get(t.parent_requirement_id);if(!r)return fail('UNKNOWN_PARENT_REQUIREMENT');
  if(t.source_locator!==r.locator)return fail('SOURCE_LOCATOR_MISMATCH');
  if(t.preserved_cognitive_level!==r.cognitive)return fail('COGNITIVE_LEVEL_MISMATCH');
  if(t.capability_statement!==s.capability_statement)return fail('CAPABILITY_STATEMENT_MISMATCH');
  if(!text(t.assessment_target_id)||!t.assessment_target_id.startsWith(`ASSESS::CSSGB-2022::${t.parent_requirement_id}::`))return fail('ASSESSMENT_TARGET_ID_INVALID');
  if(!contract.target_schema.target_types.includes(t.target_type))return fail('TARGET_TYPE_INVALID');
  if(!contract.target_schema.evidence_input_classes.includes(t.evidence_input_class))return fail('EVIDENCE_INPUT_CLASS_INVALID');
  if(!contract.target_schema.response_action_classes.includes(t.response_action_class))return fail('RESPONSE_ACTION_CLASS_INVALID');
  if(!contract.cognitive_alignment_rules[t.preserved_cognitive_level].includes(t.response_action_class))return fail('COGNITIVE_ACTION_MISALIGNMENT');
  if(!t.prompt_contract||!text(t.prompt_contract.supplied_evidence)||!text(t.prompt_contract.required_action)||!Array.isArray(t.prompt_contract.must_not_assume))return fail('PROMPT_CONTRACT_INVALID');
  const min=t.preserved_cognitive_level==='REMEMBER'?1:2;
  if(!Array.isArray(t.scoring_assertions)||t.scoring_assertions.length<min)return fail('SCORING_ASSERTION_COUNT_OR_DETERMINISM');
  const aid=new Set();
  for(const a of t.scoring_assertions){
    if(!a||!text(a.assertion_id)||aid.has(a.assertion_id)||!text(a.observable_property)||!text(a.pass_condition))return fail('SCORING_ASSERTION_COUNT_OR_DETERMINISM');
    aid.add(a.assertion_id);
    const joined=`${a.observable_property} ${a.pass_condition}`.toLowerCase();
    if(joined.includes('evaluator agrees')||joined.includes('looks correct')||joined.includes('seems correct')||joined.includes('subjective'))return fail('SCORING_ASSERTION_COUNT_OR_DETERMINISM');
  }
  if(!t.insufficient_evidence_behavior||!text(t.insufficient_evidence_behavior.trigger)||!text(t.insufficient_evidence_behavior.required_behavior))return fail('INSUFFICIENT_EVIDENCE_BEHAVIOR_REQUIRED');
  if(!Array.isArray(t.provenance_refs)||!t.provenance_refs.includes(`SOURCE_NODE_INDEX:${t.parent_requirement_id}`)||!t.provenance_refs.includes(`SUBSKILL:${t.subskill_id}`))return fail('PROVENANCE_REQUIRED');
  if(t.validation_status!=='PROVISIONAL_BOUND')return fail('VALIDATION_STATUS_INVALID');
  const boundaries=['psychometric_validity','learner_mastery','retention','transfer','workplace_effectiveness','sme_approval','certification_equivalence'];
  if(!t.evidence_boundaries)return fail('UNAUTHORIZED_EVIDENCE_CLAIM');
  for(const k of boundaries)if(t.evidence_boundaries[k]!=='UNOBSERVED')return fail('UNAUTHORIZED_EVIDENCE_CLAIM');
  return {ok:true,code:'PASS'};
}
const pos=validate(fixtures.positive);if(!pos.ok)throw new Error(`POSITIVE_REJECTED:${pos.code}`);
function clone(x){return JSON.parse(JSON.stringify(x))}
function mutate(obj,key,val){const parts=key.split('.');let cur=obj;for(let i=0;i<parts.length-1;i++)cur=cur[parts[i]];cur[parts.at(-1)]=val}
const negative_results=[];
for(const n of fixtures.negative_mutations){const x=clone(fixtures.positive);mutate(x,n.mutation,n.value);const r=validate(x);if(r.ok)throw new Error(`NEGATIVE_ACCEPTED:${n.fixture_id}`);if(r.code!==n.expected_failure)throw new Error(`NEGATIVE_WRONG_FAILURE:${n.fixture_id}:${r.code}:${n.expected_failure}`);negative_results.push({fixture_id:n.fixture_id,rejected_with:r.code})}
if(source.node_count!==66||source.source.requirement_set_digest!==contract.source_contract.requirement_set_digest)throw new Error('SOURCE_CONTRACT_DRIFT');
const result={qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-CONTRACT-VALIDATOR-025B',subject_sha:process.env.GITHUB_SHA||'LOCAL',result_class:'PASS',positive_fixture:'ACCEPTED',negative_fixture_count:negative_results.length,negative_results,source_requirement_count:source.node_count,source_digest:source.source.requirement_set_digest,psychometric_validity:'UNOBSERVED',learner_mastery:'UNOBSERVED',retention:'UNOBSERVED',transfer:'UNOBSERVED',workplace_effectiveness:'UNOBSERVED',sme_approval:'UNOBSERVED',certification_equivalence:'UNOBSERVED',next_objective:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-BATCH-01-026'};
const ed=path.join(process.env.RUNNER_TEMP||root,'learning-assessment-target-contract-evidence');fs.mkdirSync(ed,{recursive:true});fs.writeFileSync(path.join(ed,'qualification-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
