'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const sourcePath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const candidatePath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');
const batchPaths = [
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-01-CANDIDATE-006.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-02-CANDIDATE-007.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-03-CANDIDATE-008.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-04-CANDIDATE-009.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-05-CANDIDATE-010.json'
].map(p=>path.join(root,p));
const validatorPath = path.join(root,'.github/scripts/learning-full-standard-topology-validator-003.js');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root,'learning-domain-ii-batch-05-evidence');
fs.mkdirSync(evidenceDir,{recursive:true});

function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code);}
function uniq(xs){return new Set(xs).size===xs.length;}
function load(p){return JSON.parse(fs.readFileSync(p,'utf8'));}

const source=load(sourcePath);
const base=load(candidatePath);
const batches=batchPaths.map(load);
const b5=batches[4];

if(source.node_count!==66||!Array.isArray(source.nodes)||source.nodes.length!==66) fail('SOURCE_66_NODE_CONTRACT_BROKEN');
if(source.source.owner_version!=='2022 CSSGB BoK') fail('SOURCE_VERSION_DRIFT');
const domainII=source.nodes.filter(row=>Array.isArray(row)&&String(row[0]).startsWith('ASQ-CSSGB-2022-II.'));
if(domainII.length!==23) fail('DOMAIN_II_COUNT_MISMATCH',String(domainII.length));
const expectedSizes=[5,5,5,5,3];
let offset=0;
for(let i=0;i<5;i++){
  const expected=domainII.slice(offset,offset+expectedSizes[i]).map(row=>row[0]);
  if(JSON.stringify(batches[i].requirement_ids)!==JSON.stringify(expected)) fail(`BATCH_0${i+1}_SOURCE_ORDER_MISMATCH`);
  offset+=expectedSizes[i];
}
if(b5.base_control_head!=='24282a16335764ddb018f31a89c75d670e6363c1') fail('BATCH_05_CONTROL_HEAD_MISMATCH',String(b5.base_control_head));
if(b5.source_version!=='2022'||b5.batch_index!==5||b5.expected_domain_ii_count!==23) fail('BATCH_05_SOURCE_CONTRACT_INVALID');
const allRequirementIds=batches.flatMap(b=>b.requirement_ids);
if(!uniq(allRequirementIds)) fail('CROSS_BATCH_REQUIREMENT_DUPLICATE');
if(allRequirementIds.length!==23) fail('CUMULATIVE_DOMAIN_II_COUNT',String(allRequirementIds.length));
if(JSON.stringify(allRequirementIds)!==JSON.stringify(domainII.map(row=>row[0]))) fail('DOMAIN_II_FULL_SOURCE_ORDER_MISMATCH');
if(!uniq(b5.subskills.map(s=>s.subskill_id))||!uniq(b5.decomposition_edges.map(e=>e.edge_id))) fail('BATCH_05_DUPLICATE_IDENTITY');
if((b5.prerequisite_edges||[]).length!==0) fail('BATCH_05_UNJUSTIFIED_HARD_PREREQUISITE');
if(b5.subskills.length!==3||b5.decomposition_edges.length!==3) fail('BATCH_05_EXPECTED_THREE_NODE_DECOMPOSITION');
for(const s of b5.subskills){
  if(!b5.requirement_ids.includes(s.parent_requirement_id)) fail('SUBSKILL_OUTSIDE_BATCH',s.subskill_id);
  if(s.derivation_class!=='LEARNING_OWNER_DERIVED_PROVISIONAL'||s.assessment_target_status!=='UNBOUND'||s.validation_status!=='PROVISIONAL') fail('SUBSKILL_PREMATURE_AUTHORITY',s.subskill_id);
}
for(const e of b5.decomposition_edges){
  if(e.edge_type!=='DECOMPOSES_TO'||e.derivation_class!=='LEARNING_OWNER_DERIVED_PROVISIONAL'||e.validation_status!=='PROVISIONAL') fail('DECOMPOSITION_PREMATURE_AUTHORITY',e.edge_id);
  if(!b5.requirement_ids.includes(e.from_id)) fail('DECOMPOSITION_OUTSIDE_BATCH',e.edge_id);
}
for(const u of b5.unresolved_dependency_candidates||[]){if(u.admission_status!=='UNRESOLVED__NOT_CANONICAL') fail('UNRESOLVED_PREMATURE_ADMISSION',u.candidate_id);}
for(const [k,v] of Object.entries(b5.human_outcomes||{})) if(v!=='UNOBSERVED') fail('HUMAN_EVIDENCE_INFERENCE',k);
if(b5.canonical_admission_ready!==false) fail('PREMATURE_CANONICAL_ADMISSION');

const merged=JSON.parse(JSON.stringify(base));
const existingSubskills=new Set(merged.subskills.map(s=>s.subskill_id));
const existingEdges=new Set(merged.prerequisite_edges.map(e=>e.edge_id));
for(const batch of batches){
  for(const s of batch.subskills){if(existingSubskills.has(s.subskill_id)) fail('SUBSKILL_ALREADY_PRESENT',s.subskill_id); existingSubskills.add(s.subskill_id); merged.subskills.push(s);}
  for(const e of [...batch.decomposition_edges,...(batch.prerequisite_edges||[])]){if(existingEdges.has(e.edge_id)) fail('EDGE_ALREADY_PRESENT',e.edge_id); existingEdges.add(e.edge_id); merged.prerequisite_edges.push(e);}
  merged.unresolved_dependency_candidates=[...(merged.unresolved_dependency_candidates||[]),...(batch.unresolved_dependency_candidates||[])];
}
merged.derivation_status='DOMAIN_I_PLUS_DOMAIN_II_FULL_PROVISIONAL_TOPOLOGY__DOMAINS_III_VI_PENDING';
merged.canonical_admission_ready=false;
merged.next_population_batch='Domain III topology: next exact frozen source-order domain after Domain II closure.';
fs.writeFileSync(candidatePath,JSON.stringify(merged,null,2)+'\n','utf8');

const child=spawnSync(process.execPath,[validatorPath],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});
if(child.stdout) process.stdout.write(child.stdout);
if(child.stderr) process.stderr.write(child.stderr);
if(child.status!==0) process.exit(child.status||1);
let validatorResult;
try{validatorResult=JSON.parse((child.stdout||'').trim().split(/\r?\n/).filter(Boolean).pop());}catch(e){fail('VALIDATOR_OUTPUT_NOT_JSON',String(e));}
if(validatorResult.qualification!=='LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-DERIVATION-VALIDATOR-003') fail('WRONG_VALIDATOR');
if(validatorResult.requirement_nodes!==66) fail('VALIDATOR_REQUIREMENT_COUNT');
if(validatorResult.subskills!==(base.subskills.length+batches.reduce((n,b)=>n+b.subskills.length,0))) fail('VALIDATOR_SUBSKILL_COUNT');
if(validatorResult.canonical_admission_ready!==false) fail('PREMATURE_CANONICAL_ADMISSION');
if(validatorResult.human_outcomes!=='UNOBSERVED') fail('VALIDATOR_HUMAN_BOUNDARY');

const receipt={
  qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-05-010-HOSTED-PREQUAL',
  subject_sha:process.env.GITHUB_SHA||'LOCAL',
  result_class:'PASS',
  source_version:'2022',
  frozen_source_digest:source.source.requirement_set_digest,
  domain_ii_source_nodes:23,
  cumulative_domain_ii_requirements_validated:23,
  domain_ii_full_source_order_covered:true,
  batch_requirement_ids:b5.requirement_ids,
  provisional_subskills_added:b5.subskills.length,
  hard_prerequisites_added:0,
  unresolved_dependencies_added:(b5.unresolved_dependency_candidates||[]).length,
  validator_003:validatorResult,
  domain_ii_topology_phase_complete:true,
  canonical_admission_ready:false,
  learner_mastery:'UNOBSERVED',
  retention:'UNOBSERVED',
  transfer:'UNOBSERVED',
  workplace_effectiveness:'UNOBSERVED',
  psychometric_validity:'UNOBSERVED',
  sme_approval:'UNOBSERVED',
  certification_equivalence:'UNOBSERVED',
  a01_pass_claimed:false,
  native_or_production_claimed:false,
  next_objective:b5.next_batch
};
fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
