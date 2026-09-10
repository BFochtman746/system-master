'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=process.env.GITHUB_WORKSPACE||process.cwd();
const q='qualification/learning/';
const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const fail=(c,d='')=>{throw new Error(d?`${c}:${d}`:c)};
const uniq=a=>new Set(a).size===a.length;
const source=load(q+'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');
const contract=load(q+'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-PREREQUISITE-SUBSKILL-TOPOLOGY-CONTRACT-002.json');
const manifest=load(q+'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-FULL-GRAPH-CLOSURE-CANDIDATE-024A.json');
const basePath=path.join(root,manifest.cumulative_inputs.domain_i_base);
const base=JSON.parse(fs.readFileSync(basePath,'utf8'));
const batches=manifest.cumulative_inputs.bounded_candidates.map(p=>load(p));
if(source.node_count!==66||source.nodes.length!==66)fail('SOURCE_COUNT');
if(source.source.requirement_set_digest!==manifest.frozen_requirement_set_digest)fail('MANIFEST_DIGEST_MISMATCH');
if(contract.frozen_requirement_set.requirement_set_digest!==manifest.frozen_requirement_set_digest)fail('CONTRACT_DIGEST_MISMATCH');
if(manifest.exact_population_subject_sha!=='3d5aa677c818ce965511ae6804e592fe130840d3')fail('POPULATION_SUBJECT_DRIFT');
const sourceIds=source.nodes.map(r=>r[0]);
const domainI=sourceIds.filter(id=>id.startsWith('ASQ-CSSGB-2022-I.'));
const batchIds=batches.flatMap(b=>b.requirement_ids||[]);
const dispositions=[...domainI,...batchIds];
if(dispositions.length!==66||!uniq(dispositions))fail('REQUIREMENT_DISPOSITION_DUPLICATE_OR_COUNT');
if(JSON.stringify(dispositions)!==JSON.stringify(sourceIds))fail('REQUIREMENT_SOURCE_ORDER_DRIFT');
for(const b of batches){
  if(b.canonical_admission_ready!==false)fail('BATCH_PREMATURE_CANONICAL',b.artifact_id);
  for(const [k,v] of Object.entries(b.human_outcomes||{}))if(v!=='UNOBSERVED')fail('BATCH_HUMAN_EVIDENCE',`${b.artifact_id}:${k}`);
}
const merged=JSON.parse(JSON.stringify(base));
const subskillIds=new Set(merged.subskills.map(s=>s.subskill_id));
const edgeIds=new Set(merged.prerequisite_edges.map(e=>e.edge_id));
const unresolvedIds=new Set((merged.unresolved_dependency_candidates||[]).map(u=>u.candidate_id));
for(const b of batches){
  for(const s of b.subskills||[]){if(subskillIds.has(s.subskill_id))fail('DUP_SUBSKILL',s.subskill_id);subskillIds.add(s.subskill_id);merged.subskills.push(s)}
  for(const e of [...(b.decomposition_edges||[]),...(b.prerequisite_edges||[])]){if(edgeIds.has(e.edge_id))fail('DUP_EDGE',e.edge_id);edgeIds.add(e.edge_id);merged.prerequisite_edges.push(e)}
  for(const u of b.unresolved_dependency_candidates||[]){if(unresolvedIds.has(u.candidate_id))fail('DUP_UNRESOLVED',u.candidate_id);unresolvedIds.add(u.candidate_id);merged.unresolved_dependency_candidates.push(u)}
}
merged.derivation_status='FULL_66_NODE_PROVISIONAL_TOPOLOGY_STRUCTURALLY_CLOSED__UNRESOLVED_DEPENDENCIES_AND_ASSESSMENTS_PENDING';
merged.canonical_admission_ready=false;
merged.next_population_batch='NONE__SOURCE_DOMAIN_POPULATION_COMPLETE';
const known=new Set([...sourceIds,...merged.subskills.map(s=>s.subskill_id)]);
if(merged.subskills.length!==66)fail('SUBSKILL_COUNT',String(merged.subskills.length));
const parents=merged.subskills.map(s=>s.parent_requirement_id);
if(parents.length!==66||!uniq(parents)||parents.some(p=>!sourceIds.includes(p)))fail('SUBSKILL_PARENT_COVERAGE');
for(const s of merged.subskills){if(s.assessment_target_status!=='UNBOUND')fail('ASSESSMENT_PREMATURE_BIND',s.subskill_id)}
const decomp=merged.prerequisite_edges.filter(e=>e.edge_type==='DECOMPOSES_TO');
const hard=merged.prerequisite_edges.filter(e=>e.edge_type==='PREREQUISITE');
if(decomp.length!==66)fail('DECOMPOSITION_COUNT',String(decomp.length));
for(const e of merged.prerequisite_edges){if(!known.has(e.from_id)||!known.has(e.to_id))fail('EDGE_ENDPOINT_UNRESOLVED',e.edge_id)}
for(const u of merged.unresolved_dependency_candidates){
  if(u.admission_status!=='UNRESOLVED__NOT_CANONICAL')fail('UNRESOLVED_PREMATURE_ADMISSION',u.candidate_id);
  if(!known.has(u.from_id)||!known.has(u.to_id))fail('UNRESOLVED_ENDPOINT_UNKNOWN',u.candidate_id);
  if(u.from_id===u.to_id)fail('UNRESOLVED_SELF_EDGE',u.candidate_id);
}
if(!uniq(merged.unresolved_dependency_candidates.map(u=>u.candidate_id)))fail('UNRESOLVED_ID_DUPLICATE');
for(const [k,v] of Object.entries(merged.human_outcomes||{}))if(v!=='UNOBSERVED')fail('MERGED_HUMAN_EVIDENCE',k);
fs.writeFileSync(basePath,JSON.stringify(merged,null,2)+'\n');
const validator=spawnSync(process.execPath,[path.join(root,'.github/scripts/learning-full-standard-topology-validator-003.js')],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});
if(validator.stdout)process.stdout.write(validator.stdout);if(validator.stderr)process.stderr.write(validator.stderr);if(validator.status!==0)process.exit(validator.status||1);
const lines=(validator.stdout||'').trim().split(/\r?\n/).filter(Boolean);const vr=JSON.parse(lines[lines.length-1]);
if(vr.requirement_nodes!==66||vr.subskills!==66||vr.decomposition_edges!==66||vr.canonical_admission_ready!==false||vr.human_outcomes!=='UNOBSERVED')fail('VALIDATOR_CLOSURE_BOUNDARY');
const graph=new Map(sourceIds.map(id=>[id,[]]));for(const e of hard){if(!graph.has(e.from_id))graph.set(e.from_id,[]);graph.get(e.from_id).push(e.to_id)}
const mark=new Map();const visit=id=>{if(mark.get(id)===1)fail('PREREQUISITE_CYCLE',id);if(mark.get(id)===2)return;mark.set(id,1);for(const n of graph.get(id)||[])visit(n);mark.set(id,2)};for(const id of graph.keys())visit(id);
const stable=JSON.stringify(merged);const fingerprint=crypto.createHash('sha256').update(stable).digest('hex');
const unresolved=merged.unresolved_dependency_candidates;
const summary={
  closure_id:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-FULL-GRAPH-CLOSURE-024',
  subject_sha:process.env.GITHUB_SHA||'LOCAL',
  result_class:'PASS',
  frozen_requirement_nodes:66,
  source_domain_population_complete:true,
  source_order_exact:true,
  provisional_subskills:merged.subskills.length,
  decomposition_edges:decomp.length,
  admitted_prerequisite_edges:hard.length,
  unresolved_dependency_candidates:unresolved.length,
  unresolved_candidate_ids:unresolved.map(u=>u.candidate_id),
  unresolved_endpoints_all_resolve:true,
  prerequisite_graph_acyclic:true,
  assessment_targets_unbound:merged.subskills.every(s=>s.assessment_target_status==='UNBOUND'),
  validator_003:vr,
  cumulative_topology_sha256:fingerprint,
  structural_full_graph_closure_complete:true,
  canonical_admission_ready:false,
  learner_mastery:'UNOBSERVED',retention:'UNOBSERVED',transfer:'UNOBSERVED',workplace_effectiveness:'UNOBSERVED',psychometric_validity:'UNOBSERVED',sme_approval:'UNOBSERVED',certification_equivalence:'UNOBSERVED',
  next_successor:'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-UNRESOLVED-DEPENDENCY-AND-ASSESSMENT-BINDING-SELECTION'
};
const ed=path.join(process.env.RUNNER_TEMP||root,'learning-full-graph-closure-evidence');fs.mkdirSync(ed,{recursive:true});
fs.writeFileSync(path.join(ed,'full-graph-closure-summary.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(ed,'cumulative-topology.json'),JSON.stringify(merged,null,2)+'\n');
console.log(JSON.stringify(summary));
