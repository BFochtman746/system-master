'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const qdir = path.join(root, 'qualification', 'learning');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, 'learning-dependency-adjudication-full-closure-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const load = (name) => JSON.parse(fs.readFileSync(path.join(qdir, name), 'utf8'));
const base = (p) => path.basename(p);
const fail = (code, detail = '') => {
  const failure = detail ? `${code}:${detail}` : code;
  fs.writeFileSync(path.join(evidenceDir, 'failure-summary.json'), JSON.stringify({
    subject_sha: process.env.GITHUB_SHA || 'LOCAL',
    result_class: 'FAIL',
    failure
  }, null, 2) + '\n');
  throw new Error(failure);
};

const closure = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-FULL-CLOSURE-CANDIDATE-055A.json');
const contract = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-CONTRACT-044.json');
const structural = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-FULL-GRAPH-CLOSURE-CANDIDATE-024A.json');
const assessment = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-FULL-CLOSURE-CANDIDATE-042A.json');

if (closure.base_control_head !== '3b4d849051c6694819af68f07812f7a99e370397') fail('CONTROL_HEAD_DRIFT');
if (closure.structural_closure_subject !== contract.inputs.structural_closure_subject) fail('STRUCTURAL_SUBJECT_DRIFT');
if (closure.assessment_full_closure_subject !== contract.inputs.assessment_full_closure_subject) fail('ASSESSMENT_SUBJECT_DRIFT');
if (closure.final_batch_subject !== '3614ec23b7639753344f161240d44443a02978a2') fail('FINAL_BATCH_SUBJECT_DRIFT');
if (!Array.isArray(closure.batch_candidates) || closure.batch_candidates.length !== 10) fail('BATCH_FILE_COUNT');

const topologyPaths = [structural.cumulative_inputs.domain_i_base, ...structural.cumulative_inputs.bounded_candidates];
const universe = [];
const subskills = new Map();
for (const p of topologyPaths) {
  const topology = load(base(p));
  for (const s of topology.subskills || []) {
    if (!s.subskill_id || !s.parent_requirement_id) fail('SUBSKILL_SHAPE', p);
    if (subskills.has(s.parent_requirement_id)) fail('DUPLICATE_SUBSKILL_PARENT', s.parent_requirement_id);
    subskills.set(s.parent_requirement_id, s.subskill_id);
  }
  for (const u of topology.unresolved_dependency_candidates || []) {
    if (!u.candidate_id || !u.from_id || !u.to_id || u.admission_status !== 'UNRESOLVED__NOT_CANONICAL') fail('UNRESOLVED_SOURCE_SHAPE', p);
    universe.push({candidate_id:u.candidate_id, from_id:u.from_id, to_id:u.to_id, source_topology_artifact:p});
  }
}
if (universe.length !== 46) fail('UNIVERSE_COUNT', String(universe.length));
if (subskills.size !== 66) fail('SUBSKILL_COUNT', String(subskills.size));

const allTargets = [];
for (const name of assessment.assessment_batches) {
  const b = load(name);
  if (!Array.isArray(b.targets) || b.targets.length !== b.target_count) fail('ASSESSMENT_BATCH_SHAPE', name);
  allTargets.push(...b.targets);
}
const targetParents = new Set(allTargets.map(t => t.parent_requirement_id));
if (allTargets.length !== 66 || targetParents.size !== 66) fail('ASSESSMENT_TARGET_COUNT', `${allTargets.length}/${targetParents.size}`);
for (const parent of subskills.keys()) if (!targetParents.has(parent)) fail('ASSESSMENT_PARENT_GAP', parent);

const expectedBatchSizes = [5,5,5,5,5,5,5,5,5,1];
const allDispositions = [];
const batchArtifacts = [];
for (let i = 0; i < closure.batch_candidates.length; i++) {
  const name = closure.batch_candidates[i];
  const b = load(name);
  if (b.batch_index !== i + 1) fail('BATCH_INDEX', name);
  if (!Array.isArray(b.dispositions) || b.dispositions.length !== expectedBatchSizes[i] || b.selected_candidate_count !== expectedBatchSizes[i]) fail('BATCH_SIZE', name);
  if ((b.admitted_prerequisite_edges || []).length !== b.batch_summary.admitted) fail('BATCH_ADMITTED_EDGE_COUNT', name);
  batchArtifacts.push(b.artifact_id);
  allDispositions.push(...b.dispositions);
}
if (allDispositions.length !== 46) fail('TOTAL_DISPOSITION_COUNT', String(allDispositions.length));

const seen = new Set();
let rejected = 0, unresolved = 0, admitted = 0, deferred = 0;
const retainedIds = [];
for (let i = 0; i < allDispositions.length; i++) {
  const d = allDispositions[i];
  const u = universe[i];
  if (seen.has(d.candidate_id)) fail('DUPLICATE_DISPOSITION', d.candidate_id);
  seen.add(d.candidate_id);
  if (d.candidate_id !== u.candidate_id || d.from_id !== u.from_id || d.to_id !== u.to_id || d.source_topology_artifact !== u.source_topology_artifact) {
    fail('DETERMINISTIC_COVERAGE_DRIFT', JSON.stringify({index:i, expected:u, actual:{candidate_id:d.candidate_id,from_id:d.from_id,to_id:d.to_id,source_topology_artifact:d.source_topology_artifact}}));
  }
  if (!contract.allowed_dispositions.includes(d.disposition)) fail('UNALLOWED_DISPOSITION', d.candidate_id);
  if (!Array.isArray(d.evidence_refs) || d.evidence_refs.length < 4 || String(d.rationale || '').length < 40) fail('EVIDENCE_DEFECT', d.candidate_id);
  if (d.disposition === 'REJECT_AS_HARD_PREREQUISITE') {
    rejected++;
    if (!d.material_dependency_test || d.material_dependency_test.target_independently_performable !== true || String(d.material_dependency_test.basis || '').length < 40) fail('REJECTION_TEST_DEFECT', d.candidate_id);
  } else if (d.disposition === 'REMAIN_UNRESOLVED__NOT_CANONICAL') {
    unresolved++;
    retainedIds.push(d.candidate_id);
  } else if (d.disposition === 'DEFER_TO_SEPARATE_HUMAN_OR_SME_EVIDENCE') {
    deferred++;
  } else {
    admitted++;
  }
  for (const [key, value] of Object.entries(contract.evidence_boundaries)) {
    const batchBoundary = closure.batch_candidates.map(load)[Math.min(9, Math.floor(i / 5))].evidence_boundaries;
    if (!batchBoundary || batchBoundary[key] !== value) fail('BOUNDARY_DRIFT', `${d.candidate_id}:${key}`);
  }
}

const exp = closure.expected_disposition_counts;
if (rejected !== exp.rejected_as_hard_prerequisite || unresolved !== exp.remain_unresolved_not_canonical || admitted !== exp.admitted_from_original_unresolved_universe || deferred !== exp.deferred_to_human_or_sme) {
  fail('DISPOSITION_TOTAL_MISMATCH', JSON.stringify({rejected,unresolved,admitted,deferred,expected:exp}));
}
if (closure.expected_original_unresolved_candidate_count !== universe.length) fail('EXPECTED_UNIVERSE_COUNT');
if (JSON.stringify(retainedIds) !== JSON.stringify(closure.retained_noncanonical_candidate_ids)) fail('RETAINED_SET_DRIFT', JSON.stringify({retainedIds, expected:closure.retained_noncanonical_candidate_ids}));
if (admitted !== 0) fail('UNEXPECTED_NEW_HARD_PREREQUISITE');

const summary = {
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  result_class: 'PASS',
  phase: '001C_DEPENDENCY_EVIDENCE_ADJUDICATION',
  original_unresolved_candidate_count: universe.length,
  disposed_exactly_once_count: seen.size,
  batch_count: closure.batch_candidates.length,
  disposition_counts: {
    rejected_as_hard_prerequisite: rejected,
    remain_unresolved_not_canonical: unresolved,
    admitted_from_original_unresolved_universe: admitted,
    deferred_to_human_or_sme: deferred
  },
  retained_noncanonical_candidate_ids: retainedIds,
  frozen_requirement_count: 66,
  provisional_subskill_count: subskills.size,
  assessment_target_count: allTargets.length,
  completion_classification: closure.completion_classification,
  next_action: closure.on_pass,
  authority_boundary: 'HOSTED_MACHINE_EVIDENCE_ONLY__NO_LEARNER_SME_PSYCHOMETRIC_A01_NATIVE_OR_PRODUCTION_AUTHORITY_INFERRED'
};
fs.writeFileSync(path.join(evidenceDir, 'qualification-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
