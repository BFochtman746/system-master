'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const qdir = path.join(root, 'qualification', 'learning');
const outDir = process.env.EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || root, 'learning-executable-curriculum-001d-evidence');
fs.mkdirSync(outDir, { recursive: true });

const loadLocal = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const qpath = (name) => name.startsWith('qualification/') ? name : `qualification/learning/${name}`;
const fail = (code, detail = '') => {
  const failure = detail ? `${code}:${detail}` : code;
  fs.writeFileSync(path.join(outDir, 'failure-summary.json'), JSON.stringify({
    subject_sha: process.env.GITHUB_SHA || 'LOCAL', result_class: 'FAIL', failure
  }, null, 2) + '\n');
  throw new Error(failure);
};
const gitShow = (ref, repoPath) => {
  const r = spawnSync('git', ['show', `${ref}:${repoPath}`], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  if (r.status !== 0) fail('HISTORICAL_INPUT_UNAVAILABLE', `${ref}:${repoPath}:${(r.stderr || '').trim()}`);
  try { return JSON.parse(r.stdout); } catch (e) { fail('HISTORICAL_INPUT_JSON_INVALID', `${ref}:${repoPath}`); }
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
};
const canonicalText = (value) => JSON.stringify(canonical(value));
const sha256 = (value) => crypto.createHash('sha256').update(canonicalText(value)).digest('hex');
const uniq = (xs) => new Set(xs).size === xs.length;
const same = (a, b) => canonicalText(a) === canonicalText(b);

const candidatePath = 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-CANDIDATE-057A.json';
const contractPath = 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-CONTRACT-056.json';
const candidate = loadLocal(candidatePath);
const contract = loadLocal(contractPath);
if (candidate.contract !== contractPath) fail('CONTRACT_POINTER_DRIFT');
if (candidate.base_control_head !== contract.base_control_head && candidate.base_control_head !== '2bdd96fa6d6d42f830442978ef28cfe09ad11d95') fail('BASE_CONTROL_HEAD_DRIFT');
if (candidate.inputs.frozen_requirement_set_digest !== contract.evidence_inputs.frozen_requirement_set_digest) fail('FROZEN_DIGEST_CONTRACT_DRIFT');

const source = loadLocal(candidate.inputs.source_index);
if (source.node_count !== 66 || source.nodes.length !== 66) fail('SOURCE_COUNT', String(source.nodes.length));
if (source.source.requirement_set_digest !== candidate.inputs.frozen_requirement_set_digest) fail('SOURCE_DIGEST_DRIFT');
const requirements = source.nodes.map((r, i) => ({
  source_ordinal: i + 1,
  requirement_id: r[0], source_code: r[1], source_locator: r[2], highest_cognitive_level: r[3], title: r[4]
}));
const requirementIds = requirements.map(r => r.requirement_id);
if (!uniq(requirementIds)) fail('SOURCE_REQUIREMENT_DUPLICATE');
const requirementMap = new Map(requirements.map(r => [r.requirement_id, r]));

// Reconstruct the exact qualified 001A topology from its historical closure manifest.
const topoRef = candidate.inputs.topology_subject_sha;
const topoManifest = gitShow(topoRef, candidate.inputs.topology_closure_manifest);
if (topoManifest.frozen_requirement_set_digest !== candidate.inputs.frozen_requirement_set_digest) fail('TOPOLOGY_DIGEST_DRIFT');
const topologyPaths = [topoManifest.cumulative_inputs.domain_i_base, ...topoManifest.cumulative_inputs.bounded_candidates];
const subskillsById = new Map();
const subskillByParent = new Map();
const hardById = new Map();
for (const p of topologyPaths) {
  const t = gitShow(topoRef, p);
  for (const s of t.subskills || []) {
    if (!s.subskill_id || !s.parent_requirement_id || !requirementMap.has(s.parent_requirement_id)) fail('SUBSKILL_SHAPE', p);
    if (subskillsById.has(s.subskill_id) && !same(subskillsById.get(s.subskill_id), s)) fail('SUBSKILL_CONFLICT', s.subskill_id);
    if (subskillByParent.has(s.parent_requirement_id) && subskillByParent.get(s.parent_requirement_id).subskill_id !== s.subskill_id) fail('SUBSKILL_PARENT_CONFLICT', s.parent_requirement_id);
    subskillsById.set(s.subskill_id, s);
    subskillByParent.set(s.parent_requirement_id, s);
  }
  const edges = [...(t.prerequisite_edges || [])];
  for (const e of edges.filter(x => x.edge_type === 'PREREQUISITE')) {
    if (!requirementMap.has(e.from_id) || !requirementMap.has(e.to_id)) fail('HARD_PREREQ_ENDPOINT', e.edge_id);
    if (hardById.has(e.edge_id) && !same(hardById.get(e.edge_id), e)) fail('HARD_PREREQ_CONFLICT', e.edge_id);
    hardById.set(e.edge_id, e);
  }
}
if (subskillsById.size !== candidate.expected.subskills || subskillByParent.size !== candidate.expected.subskills) fail('SUBSKILL_COUNT', `${subskillsById.size}/${subskillByParent.size}`);
if (hardById.size !== candidate.expected.hard_prerequisite_edges) fail('HARD_PREREQUISITE_COUNT', String(hardById.size));
for (const rid of requirementIds) if (!subskillByParent.has(rid)) fail('SUBSKILL_PARENT_GAP', rid);

// Reconstruct the exact qualified 001B assessment target set.
const assessRef = candidate.inputs.assessment_subject_sha;
const assessManifest = gitShow(assessRef, candidate.inputs.assessment_closure_manifest);
if (assessManifest.frozen_requirement_set_digest !== candidate.inputs.frozen_requirement_set_digest) fail('ASSESSMENT_DIGEST_DRIFT');
const targetsById = new Map();
const targetByParent = new Map();
const targetParentOrder = [];
for (const name of assessManifest.assessment_batches) {
  const b = gitShow(assessRef, qpath(name));
  if (!Array.isArray(b.targets) || b.targets.length !== b.target_count) fail('ASSESSMENT_BATCH_SHAPE', name);
  for (const t of b.targets) {
    const subskill = subskillByParent.get(t.parent_requirement_id);
    if (!subskill || subskill.subskill_id !== t.subskill_id) fail('ASSESSMENT_SUBSKILL_MISMATCH', t.parent_requirement_id);
    const req = requirementMap.get(t.parent_requirement_id);
    if (!req || req.source_locator !== t.source_locator || req.highest_cognitive_level !== t.preserved_cognitive_level) fail('ASSESSMENT_SOURCE_MISMATCH', t.parent_requirement_id);
    if (t.capability_statement !== subskill.capability_statement) fail('ASSESSMENT_CAPABILITY_MISMATCH', t.parent_requirement_id);
    if (targetsById.has(t.assessment_target_id)) fail('ASSESSMENT_TARGET_DUPLICATE', t.assessment_target_id);
    if (targetByParent.has(t.parent_requirement_id)) fail('ASSESSMENT_PARENT_DUPLICATE', t.parent_requirement_id);
    targetsById.set(t.assessment_target_id, t);
    targetByParent.set(t.parent_requirement_id, t);
    targetParentOrder.push(t.parent_requirement_id);
  }
}
if (targetsById.size !== candidate.expected.assessment_targets || targetByParent.size !== candidate.expected.assessment_targets) fail('ASSESSMENT_TARGET_COUNT', `${targetsById.size}/${targetByParent.size}`);
if (JSON.stringify(targetParentOrder) !== JSON.stringify(requirementIds)) fail('ASSESSMENT_SOURCE_ORDER_DRIFT');

// Reconstruct the exact qualified 001C disposition set.
const depRef = candidate.inputs.dependency_subject_sha;
const depManifest = gitShow(depRef, candidate.inputs.dependency_closure_manifest);
if (depManifest.structural_closure_subject !== topoRef || depManifest.assessment_full_closure_subject !== assessRef) fail('DEPENDENCY_PREDECESSOR_DRIFT');
const dispositions = [];
for (const name of depManifest.batch_candidates) {
  const b = gitShow(depRef, qpath(name));
  if (!Array.isArray(b.dispositions) || b.dispositions.length !== b.selected_candidate_count) fail('DEPENDENCY_BATCH_SHAPE', name);
  dispositions.push(...b.dispositions);
}
if (dispositions.length !== candidate.expected.dependency_dispositions || !uniq(dispositions.map(d => d.candidate_id))) fail('DEPENDENCY_DISPOSITION_COUNT_OR_DUPLICATE', String(dispositions.length));
let rejected = 0, retained = 0, admitted = 0, deferred = 0;
for (const d of dispositions) {
  if (!requirementMap.has(d.from_id) || !requirementMap.has(d.to_id)) fail('DEPENDENCY_ENDPOINT', d.candidate_id);
  if (d.disposition === 'REJECT_AS_HARD_PREREQUISITE') rejected += 1;
  else if (d.disposition === 'REMAIN_UNRESOLVED__NOT_CANONICAL') retained += 1;
  else if (d.disposition === 'DEFER_TO_SEPARATE_HUMAN_OR_SME_EVIDENCE') deferred += 1;
  else admitted += 1;
}
if (rejected !== candidate.expected.rejected_as_hard_prerequisite) fail('REJECT_COUNT', String(rejected));
if (retained !== candidate.expected.remain_unresolved_not_canonical) fail('RETAINED_COUNT', String(retained));
if (admitted !== candidate.expected.newly_admitted_from_001c) fail('UNEXPECTED_001C_ADMISSION', String(admitted));
if (deferred !== 0) fail('UNEXPECTED_HUMAN_DEFERRAL', String(deferred));

// Bind to current, already-qualified runtime vocabulary rather than creating a parallel model.
const runtimeChecks = [
  ['learning/lab/learning_lab/models.py', ['class Criterion', 'class Skill', 'hard_prerequisite_skill_ids', 'class Lesson', 'class Item', 'class Course', 'READY_FOR_REVIEW']],
  ['learning/lab/learning_lab/engine.py', ['InvalidPrerequisiteGraph', 'hard_prerequisite_skill_ids', 'CURRICULUM_NEXT']],
  ['learning/lab/learning_lab/open_goal.py', ['compile_course_from_dossier', 'course_blueprint']],
  ['learning/lab/learning_lab/domain_general.py', ['DomainGeneralLearningEngine', 'MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED']],
  ['learning/lab/learning_lab/external_standard.py', ['build_certification_readiness_blueprint', 'ASQ-CSSGB-BOK-2022']],
  ['learning/lab/learning_lab/professional_rigor.py', ['assessment_evidence_state', 'PENDING_INDEPENDENT_REVIEW']]
];
for (const [p, tokens] of runtimeChecks) {
  const text = fs.readFileSync(path.join(root, p), 'utf8');
  for (const token of tokens) if (!text.includes(token)) fail('RUNTIME_SCHEMA_SIGNATURE_DRIFT', `${p}:${token}`);
}

const skillByRequirement = new Map(requirementIds.map(rid => [rid, subskillByParent.get(rid).subskill_id]));
const hardSkillEdges = [...hardById.values()].map(e => ({
  edge_id: e.edge_id,
  from_requirement_id: e.from_id,
  to_requirement_id: e.to_id,
  from_skill_id: skillByRequirement.get(e.from_id),
  to_skill_id: skillByRequirement.get(e.to_id),
  standing: e.validation_status || 'PROVISIONAL',
  derivation_class: e.derivation_class,
  rationale: e.rationale,
  evidence_refs: e.evidence_refs || []
}));

// Stable Kahn topological sort: hard gates constrain order; frozen source order breaks ties.
const sourceIndex = new Map(requirementIds.map((id, i) => [id, i]));
const indegree = new Map(requirementIds.map(id => [id, 0]));
const outgoing = new Map(requirementIds.map(id => [id, []]));
for (const e of hardSkillEdges) {
  outgoing.get(e.from_requirement_id).push(e.to_requirement_id);
  indegree.set(e.to_requirement_id, indegree.get(e.to_requirement_id) + 1);
}
let ready = requirementIds.filter(id => indegree.get(id) === 0).sort((a, b) => sourceIndex.get(a) - sourceIndex.get(b));
const order = [];
while (ready.length) {
  const id = ready.shift(); order.push(id);
  for (const n of outgoing.get(id)) {
    indegree.set(n, indegree.get(n) - 1);
    if (indegree.get(n) === 0) {
      ready.push(n);
      ready.sort((a, b) => sourceIndex.get(a) - sourceIndex.get(b));
    }
  }
}
if (order.length !== 66 || !uniq(order)) fail('HARD_PREREQUISITE_CYCLE_OR_ORDER_GAP');

const prereqsForTarget = new Map(requirementIds.map(id => [id, []]));
for (const e of hardSkillEdges) prereqsForTarget.get(e.to_requirement_id).push(e.from_skill_id);
const executionNodes = order.map((rid, i) => {
  const req = requirementMap.get(rid);
  const subskill = subskillByParent.get(rid);
  const target = targetByParent.get(rid);
  const criterionId = `CRIT::${subskill.subskill_id}`;
  return {
    ordinal: i + 1,
    requirement: req,
    skill: {
      skill_id: subskill.subskill_id,
      title: subskill.label,
      criterion_ids: [criterionId],
      hard_prerequisite_skill_ids: [...prereqsForTarget.get(rid)].sort()
    },
    criterion: {
      criterion_id: criterionId,
      skill_id: subskill.subskill_id,
      outcome: subskill.capability_statement
    },
    lesson_spec: {
      lesson_id: `LESSON::${subskill.subskill_id}`,
      title: `${req.title}: ${subskill.label}`,
      skill_id: subskill.subskill_id,
      criterion_ids: [criterionId],
      objective: subskill.capability_statement,
      materialization_status: 'UNMATERIALIZED__GROUNDING_AND_REVIEW_REQUIRED',
      required_runtime_fields: ['explanation', 'worked_examples', 'practice_item_ids', 'claim_refs', 'grounding_spans']
    },
    assessment_binding: {
      assessment_target_id: target.assessment_target_id,
      target_type: target.target_type,
      evidence_input_class: target.evidence_input_class,
      response_action_class: target.response_action_class,
      preserved_cognitive_level: target.preserved_cognitive_level,
      prompt_contract: target.prompt_contract,
      scoring_assertions: target.scoring_assertions,
      insufficient_evidence_behavior: target.insufficient_evidence_behavior,
      provenance_refs: target.provenance_refs,
      evidence_boundaries: target.evidence_boundaries,
      runtime_scoring_status: 'RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND',
      mastery_evidence_admission_allowed: false
    }
  };
});

const compactDispositions = dispositions.map(d => ({
  candidate_id: d.candidate_id,
  from_id: d.from_id,
  to_id: d.to_id,
  disposition: d.disposition,
  evidence_refs: d.evidence_refs || []
}));

const blueprint = {
  artifact_id: 'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-BLUEPRINT-057B',
  effective_date: candidate.effective_date,
  owner: candidate.owner,
  compiler_version: candidate.compiler_version,
  contract: candidate.contract,
  candidate: candidatePath,
  inputs: {
    source_index: candidate.inputs.source_index,
    frozen_requirement_set_digest: candidate.inputs.frozen_requirement_set_digest,
    topology_subject_sha: topoRef,
    assessment_subject_sha: assessRef,
    dependency_subject_sha: depRef
  },
  standing: 'MECHANICALLY_COMPILED_RUNTIME_BLUEPRINT__CONTENT_SCORING_REVIEW_REQUIRED',
  runtime_binding: {
    model: 'Course/Skill/Criterion/Lesson/Item',
    source_runtime_paths: runtimeChecks.map(([p]) => p),
    output_class: candidate.output_class
  },
  course_identity: candidate.course_identity,
  execution_nodes: executionNodes,
  hard_prerequisite_edges: hardSkillEdges,
  dependency_dispositions: compactDispositions,
  activation: {
    runtime_activation_allowed: false,
    review_standing: 'READY_FOR_REVIEW',
    activation_blockers: candidate.activation_blockers
  },
  evidence_boundaries: {
    learner_mastery: 'UNOBSERVED',
    psychometric_validity: 'UNOBSERVED',
    retention: 'UNOBSERVED',
    transfer: 'UNOBSERVED',
    workplace_effectiveness: 'UNOBSERVED',
    sme_approval: 'UNOBSERVED',
    certification_equivalence: 'UNOBSERVED',
    a01_native_production_authority: 'NOT_INFERRED'
  }
};
const digestBase = JSON.parse(JSON.stringify(blueprint));
blueprint.artifact_digest_sha256 = sha256(digestBase);

if (executionNodes.length !== 66 || !uniq(executionNodes.map(n => n.skill.skill_id)) || !uniq(executionNodes.map(n => n.criterion.criterion_id))) fail('COMPILED_NODE_CARDINALITY');
if (hardSkillEdges.length !== 2) fail('COMPILED_HARD_GATE_COUNT');
if (blueprint.activation.runtime_activation_allowed !== false || blueprint.course_identity.state !== 'READY_FOR_REVIEW') fail('ACTIVATION_BOUNDARY');
if (executionNodes.some(n => n.lesson_spec.materialization_status !== 'UNMATERIALIZED__GROUNDING_AND_REVIEW_REQUIRED')) fail('UNQUALIFIED_LESSON_MATERIALIZATION');
if (executionNodes.some(n => n.assessment_binding.runtime_scoring_status !== 'RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND' || n.assessment_binding.mastery_evidence_admission_allowed !== false)) fail('UNQUALIFIED_SCORING_ADMISSION');

const summary = {
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  result_class: 'PASS',
  phase: '001D_EXECUTABLE_CURRICULUM_COMPILATION',
  compiler_version: candidate.compiler_version,
  blueprint_digest_sha256: blueprint.artifact_digest_sha256,
  frozen_requirement_count: requirements.length,
  compiled_skill_count: executionNodes.length,
  compiled_criterion_count: executionNodes.length,
  lesson_spec_count: executionNodes.length,
  assessment_binding_count: targetsById.size,
  hard_prerequisite_edge_count: hardSkillEdges.length,
  dependency_disposition_count: dispositions.length,
  disposition_counts: {
    rejected_as_hard_prerequisite: rejected,
    remain_unresolved_not_canonical: retained,
    admitted_from_001c: admitted,
    deferred_to_human_or_sme: deferred
  },
  prerequisite_graph_acyclic: true,
  deterministic_source_tiebreak: true,
  runtime_schema_signatures_resolved: true,
  runtime_activation_allowed: false,
  course_state: 'READY_FOR_REVIEW',
  lesson_content_materialized: false,
  automated_scoring_oracle_bound: false,
  learner_mastery: 'UNOBSERVED',
  psychometric_validity: 'UNOBSERVED',
  a01_native_production_authority: 'NOT_INFERRED',
  standing: contract.standing_on_pass,
  next_successor: contract.successor_on_pass
};

fs.writeFileSync(path.join(outDir, 'compiled-executable-curriculum-blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'qualification-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
