'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const sourcePath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const candidatePath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');
const batchPath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-01-CANDIDATE-006.json');
const validatorPath = path.join(root,'.github/scripts/learning-full-standard-topology-validator-003.js');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root,'learning-domain-ii-batch-01-evidence');
fs.mkdirSync(evidenceDir,{recursive:true});

function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code);}
function uniq(xs){return new Set(xs).size===xs.length;}
const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const base=JSON.parse(fs.readFileSync(candidatePath,'utf8'));
const batch=JSON.parse(fs.readFileSync(batchPath,'utf8'));

if(source.node_count!==66||!Array.isArray(source.nodes)||source.nodes.length!==66) fail('SOURCE_66_NODE_CONTRACT_BROKEN');
if(source.source.owner_version!=='2022 CSSGB BoK') fail('SOURCE_VERSION_DRIFT');
if(batch.source_version!=='2022'||batch.expected_domain_ii_count!==23) fail('BATCH_SOURCE_CONTRACT_INVALID');
const domainII=source.nodes.filter(row=>Array.isArray(row)&&String(row[0]).startsWith('ASQ-CSSGB-2022-II.'));
if(domainII.length!==23) fail('DOMAIN_II_COUNT_MISMATCH',String(domainII.length));
const expectedFirstFive=domainII.slice(0,5).map(row=>row[0]);
if(JSON.stringify(batch.requirement_ids)!==JSON.stringify(expectedFirstFive)) fail('BATCH_01_SOURCE_ORDER_MISMATCH',JSON.stringify({expectedFirstFive,actual:batch.requirement_ids}));
if(!uniq(batch.requirement_ids)||!uniq(batch.subskills.map(s=>s.subskill_id))||!uniq(batch.decomposition_edges.map(e=>e.edge_id))) fail('BATCH_DUPLICATE_IDENTITY');
if((batch.prerequisite_edges||[]).length!==0) fail('BATCH_01_UNJUSTIFIED_HARD_PREREQUISITE');
for(const s of batch.subskills){
  if(!batch.requirement_ids.includes(s.parent_requirement_id)) fail('SUBSKILL_OUTSIDE_BATCH',s.subskill_id);
  if(s.derivation_class!=='LEARNING_OWNER_DERIVED_PROVISIONAL'||s.assessment_target_status!=='UNBOUND'||s.validation_status!=='PROVISIONAL') fail('SUBSKILL_PREMATURE_AUTHORITY',s.subskill_id);
}
for(const u of batch.unresolved_dependency_candidates||[]){
  if(u.admission_status!=='UNRESOLVED__NOT_CANONICAL') fail('UNRESOLVED_PREMATURE_ADMISSION',u.candidate_id);
}
for(const [k,v] of Object.entries(batch.human_outcomes||{})) if(v!=='UNOBSERVED') fail('HUMAN_EVIDENCE_INFERENCE',k);

const merged=JSON.parse(JSON.stringify(base));
const existingSubskills=new Set(merged.subskills.map(s=>s.subskill_id));
const existingEdges=new Set(merged.prerequisite_edges.map(e=>e.edge_id));
for(const s of batch.subskills){if(existingSubskills.has(s.subskill_id)) fail('SUBSKILL_ALREADY_PRESENT',s.subskill_id); merged.subskills.push(s);}
for(const e of batch.decomposition_edges){if(existingEdges.has(e.edge_id)) fail('EDGE_ALREADY_PRESENT',e.edge_id); merged.prerequisite_edges.push(e);}
for(const e of batch.prerequisite_edges||[]){if(existingEdges.has(e.edge_id)) fail('EDGE_ALREADY_PRESENT',e.edge_id); merged.prerequisite_edges.push(e);}
merged.unresolved_dependency_candidates=[...(merged.unresolved_dependency_candidates||[]),...(batch.unresolved_dependency_candidates||[])];
merged.derivation_status='DOMAIN_I_PLUS_DOMAIN_II_BATCH_01_PROVISIONAL__DOMAIN_II_BATCHES_02_05_AND_DOMAINS_III_VI_PENDING';
merged.canonical_admission_ready=false;
merged.next_population_batch='Domain II batch 02 of 05: next five exact frozen source-order Domain II requirements.';
fs.writeFileSync(candidatePath,JSON.stringify(merged,null,2)+'\n','utf8');

const child=spawnSync(process.execPath,[validatorPath],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});
if(child.stdout) process.stdout.write(child.stdout);
if(child.stderr) process.stderr.write(child.stderr);
if(child.status!==0) process.exit(child.status||1);
let validatorResult;
try{validatorResult=JSON.parse((child.stdout||'').trim().split(/\r?\n/).filter(Boolean).pop());}catch(e){fail('VALIDATOR_OUTPUT_NOT_JSON',String(e));}
if(validatorResult.qualification!=='LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-DERIVATION-VALIDATOR-003') fail('WRONG_VALIDATOR');
if(validatorResult.requirement_nodes!==66) fail('VALIDATOR_REQUIREMENT_COUNT');
if(validatorResult.subskills!==(base.subskills.length+batch.subskills.length)) fail('VALIDATOR_SUBSKILL_COUNT');
if(validatorResult.canonical_admission_ready!==false) fail('PREMATURE_CANONICAL_ADMISSION');
if(validatorResult.human_outcomes!=='UNOBSERVED') fail('VALIDATOR_HUMAN_BOUNDARY');

const receipt={
  qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-01-006-HOSTED-PREQUAL',
  subject_sha:process.env.GITHUB_SHA||'LOCAL',
  result_class:'PASS',
  source_version:'2022',
  frozen_source_digest:source.source.requirement_set_digest,
  domain_ii_source_nodes:23,
  batch_requirement_ids:batch.requirement_ids,
  provisional_subskills_added:batch.subskills.length,
  hard_prerequisites_added:0,
  unresolved_dependencies_added:(batch.unresolved_dependency_candidates||[]).length,
  validator_003:validatorResult,
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
  next_objective:batch.next_batch
};
fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
