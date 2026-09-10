'use strict';
const fs=require('fs');const path=require('path');const{spawnSync}=require('child_process');
const root=process.env.GITHUB_WORKSPACE||process.cwd();
const sourcePath=path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const basePath=path.join(root,'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-TOPOLOGY-CANDIDATE-003.json');
const batchPaths=[
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-01-CANDIDATE-006.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-02-CANDIDATE-007.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-03-CANDIDATE-008.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-04-CANDIDATE-009.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-II-BATCH-05-CANDIDATE-010.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-III-BATCH-01-CANDIDATE-012.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-III-BATCH-02-CANDIDATE-013.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-III-BATCH-03-CANDIDATE-014.json',
'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-IV-BATCH-01-CANDIDATE-016.json'
].map(p=>path.join(root,p));
const validator=path.join(root,'.github/scripts/learning-full-standard-topology-validator-003.js');
const evidenceDir=path.join(process.env.RUNNER_TEMP||root,'learning-domain-iv-batch-01-evidence');fs.mkdirSync(evidenceDir,{recursive:true});
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));const fail=(c,d='')=>{throw new Error(d?`${c}:${d}`:c)};const uniq=xs=>new Set(xs).size===xs.length;
const source=load(sourcePath),base=load(basePath),batches=batchPaths.map(load),b1=batches[8];
if(source.node_count!==66||source.source.owner_version!=='2022 CSSGB BoK')fail('SOURCE_CONTRACT');
const d2=source.nodes.filter(r=>String(r[0]).startsWith('ASQ-CSSGB-2022-II.'));
const d3=source.nodes.filter(r=>String(r[0]).startsWith('ASQ-CSSGB-2022-III.'));
const d4=source.nodes.filter(r=>String(r[0]).startsWith('ASQ-CSSGB-2022-IV.'));
if(d2.length!==23||d3.length!==13||d4.length!==6)fail('DOMAIN_COUNT');
const allD2=batches.slice(0,5).flatMap(b=>b.requirement_ids);if(JSON.stringify(allD2)!==JSON.stringify(d2.map(r=>r[0])))fail('DOMAIN_II_PRESERVED_ORDER');
const allD3=batches.slice(5,8).flatMap(b=>b.requirement_ids);if(JSON.stringify(allD3)!==JSON.stringify(d3.map(r=>r[0])))fail('DOMAIN_III_PRESERVED_ORDER');
const expectedD4B1=d4.slice(0,5).map(r=>r[0]);if(JSON.stringify(b1.requirement_ids)!==JSON.stringify(expectedD4B1))fail('DOMAIN_IV_BATCH_01_ORDER');
if(!uniq(b1.requirement_ids)||b1.batch_index!==1||b1.expected_domain_iv_count!==6||b1.base_control_head!=='a305c91d9de978b1bbfbd6d3cf9d047e8148ab92')fail('BATCH_01_CONTRACT');
if(b1.subskills.length!==5||b1.decomposition_edges.length!==5||(b1.prerequisite_edges||[]).length!==0)fail('BATCH_01_SHAPE');
for(const s of b1.subskills){if(!b1.requirement_ids.includes(s.parent_requirement_id)||s.derivation_class!=='LEARNING_OWNER_DERIVED_PROVISIONAL'||s.assessment_target_status!=='UNBOUND'||s.validation_status!=='PROVISIONAL')fail('SUBSKILL_AUTHORITY',s.subskill_id)}
for(const e of b1.decomposition_edges){if(e.edge_type!=='DECOMPOSES_TO'||e.derivation_class!=='LEARNING_OWNER_DERIVED_PROVISIONAL'||e.validation_status!=='PROVISIONAL'||!b1.requirement_ids.includes(e.from_id))fail('DECOMP_AUTHORITY',e.edge_id)}
for(const u of b1.unresolved_dependency_candidates||[]){if(u.admission_status!=='UNRESOLVED__NOT_CANONICAL')fail('UNRESOLVED_AUTHORITY',u.candidate_id)}
for(const[k,v]of Object.entries(b1.human_outcomes||{}))if(v!=='UNOBSERVED')fail('HUMAN_EVIDENCE',k);if(b1.canonical_admission_ready!==false)fail('CANONICAL_PREMATURE');
const merged=JSON.parse(JSON.stringify(base));const sids=new Set(merged.subskills.map(s=>s.subskill_id)),eids=new Set(merged.prerequisite_edges.map(e=>e.edge_id));
for(const b of batches){for(const s of b.subskills){if(sids.has(s.subskill_id))fail('DUP_SUBSKILL',s.subskill_id);sids.add(s.subskill_id);merged.subskills.push(s)}for(const e of [...b.decomposition_edges,...(b.prerequisite_edges||[])]){if(eids.has(e.edge_id))fail('DUP_EDGE',e.edge_id);eids.add(e.edge_id);merged.prerequisite_edges.push(e)}merged.unresolved_dependency_candidates=[...(merged.unresolved_dependency_candidates||[]),...(b.unresolved_dependency_candidates||[])]}
merged.derivation_status='DOMAIN_I_PLUS_DOMAIN_II_FULL_PLUS_DOMAIN_III_FULL_PLUS_DOMAIN_IV_BATCH_01_PROVISIONAL__DOMAIN_IV_REMAINDER_AND_DOMAINS_V_VI_PENDING';merged.canonical_admission_ready=false;merged.next_population_batch='Domain IV batch 02: final exact frozen source-order Domain IV requirement.';fs.writeFileSync(basePath,JSON.stringify(merged,null,2)+'\n');
const child=spawnSync(process.execPath,[validator],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);if(child.status!==0)process.exit(child.status||1);const lines=(child.stdout||'').trim().split(/\r?\n/).filter(Boolean);const vr=JSON.parse(lines[lines.length-1]);if(vr.requirement_nodes!==66||vr.canonical_admission_ready!==false||vr.human_outcomes!=='UNOBSERVED')fail('VALIDATOR_BOUNDARY');
const receipt={qualification_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-DOMAIN-IV-BATCH-01-016-HOSTED-PREQUAL',subject_sha:process.env.GITHUB_SHA||'LOCAL',result_class:'PASS',source_version:'2022',frozen_source_digest:source.source.requirement_set_digest,domain_ii_full_source_order_covered:true,domain_iii_full_source_order_covered:true,domain_iv_source_nodes:6,cumulative_domain_iv_requirements_validated:5,domain_iv_full_source_order_covered:false,batch_requirement_ids:b1.requirement_ids,provisional_subskills_added:5,hard_prerequisites_added:0,unresolved_dependencies_added:(b1.unresolved_dependency_candidates||[]).length,validator_003:vr,domain_iv_topology_phase_complete:false,canonical_admission_ready:false,learner_mastery:'UNOBSERVED',retention:'UNOBSERVED',transfer:'UNOBSERVED',workplace_effectiveness:'UNOBSERVED',psychometric_validity:'UNOBSERVED',sme_approval:'UNOBSERVED',certification_equivalence:'UNOBSERVED',a01_pass_claimed:false,native_or_production_claimed:false,next_objective:b1.next_batch};fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
