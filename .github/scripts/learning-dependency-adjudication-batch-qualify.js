'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const qdir = path.join(root, 'qualification', 'learning');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, process.env.EVIDENCE_DIR || 'learning-dependency-adjudication-batch-01-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const load = (name) => JSON.parse(fs.readFileSync(path.join(qdir, name), 'utf8'));
const basename = (p) => path.basename(p);
const fail = (code, detail = '') => {
  const failure = detail ? `${code}:${detail}` : code;
  fs.writeFileSync(path.join(evidenceDir, 'failure-summary.json'), `${JSON.stringify({
    subject_sha: process.env.GITHUB_SHA || 'LOCAL',
    result_class: 'FAIL',
    failure
  }, null, 2)}\n`);
  throw new Error(failure);
};

const contract = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-CONTRACT-044.json');
const candidate = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-BATCH-01-CANDIDATE-044A.json');
const structuralClosure = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-FULL-GRAPH-CLOSURE-CANDIDATE-024A.json');
const assessmentClosure = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-FULL-CLOSURE-CANDIDATE-042A.json');

if (candidate.contract !== 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-DEPENDENCY-EVIDENCE-ADJUDICATION-CONTRACT-044.json') fail('CONTRACT_POINTER');
if (candidate.base_control_head !== '00117121ec08e27c00e0fad61aa5c455d1b06ab8') fail('CONTROL_HEAD_DRIFT');
if (candidate.assessment_full_closure_subject !== contract.inputs.assessment_full_closure_subject) fail('ASSESSMENT_CLOSURE_SUBJECT_DRIFT');
if (candidate.structural_closure_subject !== contract.inputs.structural_closure_subject) fail('STRUCTURAL_CLOSURE_SUBJECT_DRIFT');
if (structuralClosure.frozen_requirement_count !== 66 || assessmentClosure.expected_requirement_count !== 66 || assessmentClosure.expected_assessment_target_count !== 66) fail('FROZEN_COUNT_DRIFT');

const topologyPaths = [structuralClosure.cumulative_inputs.domain_i_base, ...structuralClosure.cumulative_inputs.bounded_candidates];
const universe = [];
const topologyByCandidate = new Map();
const subskillParents = new Set();
for (const p of topologyPaths) {
  const topology = load(basename(p));
  if (!Array.isArray(topology.subskills)) fail('TOPOLOGY_SUBSKILLS', p);
  for (const s of topology.subskills) {
    if (!s || !s.subskill_id || !s.parent_requirement_id) fail('SUBSKILL_SHAPE', p);
    subskillParents.add(s.parent_requirement_id);
  }
  const unresolved = Array.isArray(topology.unresolved_dependency_candidates) ? topology.unresolved_dependency_candidates : [];
  for (const u of unresolved) {
    if (!u.candidate_id || !u.from_id || !u.to_id || u.admission_status !== 'UNRESOLVED__NOT_CANONICAL') fail('UNRESOLVED_SHAPE', p);
    const record = { ...u, source_topology_artifact: p };
    universe.push(record);
    topologyByCandidate.set(u.candidate_id, record);
  }
}
if (subskillParents.size !== 66) fail('SUBSKILL_PARENT_COUNT', String(subskillParents.size));

const allTargets = [];
for (const batchName of assessmentClosure.assessment_batches) {
  const batch = load(batchName);
  if (!Array.isArray(batch.targets) || batch.targets.length !== batch.target_count) fail('ASSESSMENT_BATCH_SHAPE', batchName);
  allTargets.push(...batch.targets);
}
if (allTargets.length !== 66) fail('ASSESSMENT_TARGET_COUNT', String(allTargets.length));
const targetByParent = new Map(allTargets.map((t) => [t.parent_requirement_id, t]));
if (targetByParent.size !== 66) fail('ASSESSMENT_PARENT_UNIQUENESS', String(targetByParent.size));

if (!Array.isArray(candidate.dispositions) || candidate.selected_candidate_count !== candidate.dispositions.length) fail('DISPOSITION_COUNT');
if (candidate.dispositions.length !== 5) fail('BATCH_SIZE', String(candidate.dispositions.length));
const expectedFirstIds = universe.slice(0, 5).map((u) => u.candidate_id);
const selectedIds = candidate.dispositions.map((d) => d.candidate_id);
if (JSON.stringify(selectedIds) !== JSON.stringify(expectedFirstIds)) fail('DETERMINISTIC_SELECTION', JSON.stringify({ expectedFirstIds, selectedIds }));

const allowed = new Set(contract.allowed_dispositions);
const seen = new Set();
let admitted = 0;
let rejected = 0;
let unresolved = 0;
let deferred = 0;
for (const d of candidate.dispositions) {
  if (seen.has(d.candidate_id)) fail('DUPLICATE_DISPOSITION', d.candidate_id);
  seen.add(d.candidate_id);
  const original = topologyByCandidate.get(d.candidate_id);
  if (!original) fail('UNKNOWN_CANDIDATE', d.candidate_id);
  if (d.from_id !== original.from_id || d.to_id !== original.to_id) fail('ENDPOINT_DRIFT', d.candidate_id);
  if (d.source_topology_artifact !== original.source_topology_artifact) fail('TOPOLOGY_POINTER_DRIFT', d.candidate_id);
  if (!allowed.has(d.disposition)) fail('UNALLOWED_DISPOSITION', d.candidate_id);
  if (!Array.isArray(d.evidence_refs) || d.evidence_refs.length < 4 || d.evidence_refs.some((r) => typeof r !== 'string' || !r.trim())) fail('EVIDENCE_REFS', d.candidate_id);
  if (typeof d.rationale !== 'string' || d.rationale.trim().length < 40) fail('RATIONALE_REQUIRED', d.candidate_id);
  if (!targetByParent.has(d.from_id) || !targetByParent.has(d.to_id)) fail('ASSESSMENT_ENDPOINT_MISSING', d.candidate_id);

  if (d.disposition === 'REJECT_AS_HARD_PREREQUISITE') {
    rejected += 1;
    if (!d.material_dependency_test || d.material_dependency_test.target_independently_performable !== true) fail('REJECTION_MATERIAL_TEST', d.candidate_id);
    if (typeof d.material_dependency_test.basis !== 'string' || d.material_dependency_test.basis.trim().length < 40) fail('REJECTION_BASIS', d.candidate_id);
  } else if (d.disposition === 'REMAIN_UNRESOLVED__NOT_CANONICAL') {
    unresolved += 1;
  } else if (d.disposition === 'DEFER_TO_SEPARATE_HUMAN_OR_SME_EVIDENCE') {
    deferred += 1;
  } else {
    admitted += 1;
  }
}

if (admitted !== 0) fail('UNEXPECTED_ADMISSION_IN_BATCH_01');
if (!Array.isArray(candidate.admitted_prerequisite_edges) || candidate.admitted_prerequisite_edges.length !== 0) fail('ADMITTED_EDGE_MISMATCH');
if (!candidate.batch_summary || candidate.batch_summary.admitted !== admitted || candidate.batch_summary.rejected_as_hard_prerequisite !== rejected || candidate.batch_summary.remain_unresolved_not_canonical !== unresolved || candidate.batch_summary.deferred_to_human_or_sme !== deferred) fail('SUMMARY_MISMATCH');

const expectedBoundaries = contract.evidence_boundaries;
for (const [key, value] of Object.entries(expectedBoundaries)) {
  if (!candidate.evidence_boundaries || candidate.evidence_boundaries[key] !== value) fail('EVIDENCE_BOUNDARY_DRIFT', key);
}

const summary = {
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  result_class: 'PASS',
  contract_id: contract.contract_id,
  batch_artifact_id: candidate.artifact_id,
  unresolved_candidate_universe_count: universe.length,
  selected_candidate_count: candidate.dispositions.length,
  dispositions: { admitted, rejected_as_hard_prerequisite: rejected, remain_unresolved_not_canonical: unresolved, deferred_to_human_or_sme: deferred },
  untouched_candidate_count: universe.length - candidate.dispositions.length,
  frozen_requirement_count: 66,
  frozen_subskill_count: 66,
  frozen_assessment_target_count: 66,
  next_objective: candidate.next_batch_on_pass,
  authority_boundary: 'HOSTED_MACHINE_EVIDENCE_ONLY__NO_HUMAN_SME_A01_NATIVE_OR_PRODUCTION_AUTHORITY_INFERRED'
};
fs.writeFileSync(path.join(evidenceDir, 'qualification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
