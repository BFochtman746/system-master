'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const sourcePath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const candidatePath = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');
const domainIIBatchPaths = [
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-01-CANDIDATE-006.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-02-CANDIDATE-007.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-03-CANDIDATE-008.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-04-CANDIDATE-009.json',
  'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-05-CANDIDATE-010.json'
].map(p=>path.join(root,p));
const domainIIIBatch01Path = path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-III-BATCH-01-CANDIDATE-012.json');
const validatorPath = path.join(root,'.github/scripts/learning-full-standard-topology-validator-003.js');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root,'learning-domain-iii-batch-01-evidence');
fs.mkdirSync(evidenceDir,{recursive:true});

function fail(code,detail=''){throw new Error(detail?`${code}:${detail}`:code);}
function uniq(xs){return new Set(xs).size===xs.length;}
function load(p){return JSON.parse(fs.readFileSync(p,'utf8'));}

const source=load(sourcePath);
const base=load(candidatePath);
const domainIIBatches=domainIIBatchPaths.map(load);
const b1=load(domainIIIBatch01Path);

if(source.node_count!==66||!Array.isArray(source.nodes)||source.nodes.length!==66) fail('SOURCE_66_NODE_CONTRACT_BROKEN');
if(source.source.owner_version!=='2022 CSSGB BoK') fail('SOURCE_VERSION_DRIFT');
const domainII=source.nodes.filter(row=>Array.isArray(row)&&String(row[0]).startsWith('ASQ-CSSGB-2022-II.'));
const domainIII=source.nodes.filter(row=>Array.isArray(row)&&String(row[0]).startsWith('ASQ-CSSGB-2022-III.'));
if(domainII.length!==23) fail('DOMAIN_II_COUNT_MISMATCH',String(domainII.length));
if(domainIII.length!==13) fail('DOMAIN_III_COUNT_MISMATCH',String(domainIII.length));
const domainIISizes=[5,5,5,5,3];
let offset=0;
for(let i=0;i<5;i++){
  const expected=domainII.slice(offset,offset+domainIISizes[i]).map(row=>row[0]);
  if(JSON.stringify(domainIIBatches[i].requirement_ids)!==JSON.stringify(expected)) fail(`DOMAIN_II_BATCH_${i+1}_SOURCE_ORDER_MISMATCH`);
  offset+=domainIISizes[i];
}
const expectedD3B1=domainIII.slice(0,5).map(row=>row[0]);
if(JSON.stringify(b1.requirement_ids)!==JSON.stringify(expectedD3B1)) fail('DOMAIN_III_BATCH_01_SOURCE_ORDER_MISMATCH');
if(b1.base_control_head!=='35a12e8d3778b7b0f9b36affbac6b2fb188832f5') fail('DOMAIN_III_CONTROL_HEAD_MISMATCH',String(b1.base_control_head));
if(b1.source_version!=='2022'||b1.batch_index!==1||b1.expected_domain_iii_count!==13) fail('DOMAIN_III_BATCH_01_SOURCE_CONTRACT_INVALID');
if(!uniq(b1.subskills.map(s=>s.subskill_id))||!uniq(b1.decomposition_edges.map(e=>e.edge_id))) fail('DOMAIN_III_BATCH_01_DUPLICATE_IDENTITY');
if((b1.prerequisite_edges||[]).length!==0) fail('DOMAIN_III_BATCH_01_UNJUSTIFIED_HARD_PREREQUISITE');
if(b1.subskills.length!==5||b1.decomposition_edges.length!==5) fail('DOMAIN_III_BATCH_01_EXPECTED_FIVE_NODE_DECOMPOSITION');
for(const s of b1.subskills){
  if(!b1.requirement_ids.includes(s.parent_requirement_id)) fail('SUBSKILL_OUTSIDE_BATCH',s.subskill_id);
  if(s.derivation_class!=='LEARNING_OWNER_DERIVED_PROVISIONAL'||s.assessment_target_status!=='UNBOUND'||s.validation_status!=='PROVISIONAL') fail('SUBSKILL_PREMATURE_AUTHORITY',s.subskill_id);
}
for(const u of b1.unresolved_dependency_candidates||[]){if(u.admission_status!=='UNRESOLVED__NOT_CANONICAL') fail('UNRESOLVED_PREMATURE_ADMISSION',u.candidate_id);}
for(const [k,v] of Object.entries(b1.human_outcomes||{})) if(v!=='UNOBSERVED') fail('HUMAN_EVIDENCE_INFERENCE',k);
if(b1.canonical_admission_ready!==false) fail('PREMATURE_CANONICAL_ADMISSION');

const merged=JSON.parse(JSON.stringify(base));
const existingSubskills=new Set(merged.subskills.map(s=>s.subskill_id));
const existingEdges=new Set(merged.prerequisite_edges.map(e=>e.edge_id));
function mergeBatch(batch){
  for(const s of batch.subskills){if(existingSubskills.has(s.subskill_id)) fail('SUBSKILL_ALREADY_PRESENT',s.subskill_id); existingSubskills.add(s.subskill_id); merged.subskills.push(s);}
  for(const e of [...batch.decomposition_edges,...(batch.prerequisite_edges||[])]){if(existingEdges.has(e.edge_id)) fail('EDGE_ALREADY_PRESENT',e.edge_id); existingEdges.add(e.edge_id); merged.prerequisite_edges.push(e);}
  merged.unresolved_dependency_candidates=[...(merged.unresolved_dependency_candidates||[]),...(batch.unresolved_dependency_candidates||[])];
}
for(const b of domainIIBatches) mergeBatch(b);
mergeBatch(b1);
merged.derivation_status='DOMAIN_I_PLUS_DOMAIN_II_FULL_PLUS_DOMAIN_III_BATCH_01_PROVISIONAL__DOMAIN_III_BATCHES_02_03_AND_DOMAINS_IV_VI_PENDING';
merged.canonical_admission_ready=false;
merged.next_population_batch='Domain III batch 02 of 03: next five exact frozen source-order Domain III requirements.';
fs.writeFileSync(candidatePath,JSON.stringify(merged,null,2)+'\n','utf8');

const child=spawnSync(process.execPath,[validatorPath],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});
if(child.stdout) process.stdout.write(child.stdout);
if(child.stderr) process.stderr.write(child.stderr);
if(child.status!==0) process.exit(child.status||1);
let validatorResult;
try{validatorResult=JSON.parse((child.stdout||'').trim().split(/\r?\n/).filter(Boolean).pop());}catch(e){fail('VALIDATOR_OUTPUT_NOT_JSON',String(e));}
if(validatorResult.qualification!=='LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-DERIVATION-VALIDATOR-003') fail('WRONG_VALIDATOR');
if(validatorResult.requirement_nodes!==66) fail('VALIDATOR_REQUIREMENT_COUNT');
if(validatorResult.subskills!==(base.subskills.length+domainIIBatches.reduce((n,b)=>n+b.subskills.length,0)+b1.subskills.length)) fail('VALIDATOR_SUBSKILL_COUNT');
if(validatorResult.canonical_admission_ready!==false) fail('PREMATURE_CANONICAL_ADMISSION');
if(validatorResult.human_outcomes!=='UNOBSERVED') fail('VALIDATOR_HUMAN_BOUNDARY');

const receipt={
  qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-III-BATCH-01-012-HOSTED-PREQUAL',
  subject_sha:process.env.GITHUB_SHA||'LOCAL',
  result_class:'PASS',
  source_version:'2022',
  frozen_source_digest:source.source.requirement_set_digest,
  domain_ii_source_nodes:23,
  domain_ii_full_source_order_covered:true,
  domain_iii_source_nodes:13,
  cumulative_domain_iii_requirements_validated:5,
  batch_requirement_ids:b1.requirement_ids,
  provisional_subskills_added:b1.subskills.length,
  hard_prerequisites_added:0,
  unresolved_dependencies_added:(b1.unresolved_dependency_candidates||[]).length,
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
  next_objective:b1.next_batch
};
fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
