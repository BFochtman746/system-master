'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const qdir = path.join(root, 'qualification', 'learning');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, process.env.EVIDENCE_DIR || 'learning-assessment-target-full-closure-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
const load = (name) => JSON.parse(fs.readFileSync(path.join(qdir, name), 'utf8'));
const fail = (code, detail = '') => {
  const message = detail ? `${code}:${detail}` : code;
  fs.writeFileSync(path.join(evidenceDir, 'failure-summary.json'), `${JSON.stringify({ subject_sha: process.env.GITHUB_SHA || 'LOCAL', result_class: 'FAIL', failure: message }, null, 2)}\n`);
  throw new Error(message);
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;

const closureName = 'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-FULL-CLOSURE-CANDIDATE-042A.json';
const closure = load(closureName);
const contract = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-CONTRACT-025A.json');
const source = load('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-66-SOURCE-NODE-INDEX-001.json');

if (closure.expected_requirement_count !== 66 || closure.expected_assessment_target_count !== 66) fail('CLOSURE_EXPECTED_COUNT');
if (!Array.isArray(closure.assessment_batches) || !Array.isArray(closure.topology_inputs)) fail('CLOSURE_INPUTS_REQUIRED');
if (closure.assessment_batches.length !== closure.topology_inputs.length) fail('CLOSURE_INPUT_PAIR_COUNT');
if (closure.assessment_batches.length !== 15) fail('CLOSURE_BATCH_COUNT', String(closure.assessment_batches.length));
if (source.node_count !== 66) fail('SOURCE_NODE_COUNT', String(source.node_count));
if (source.source.requirement_set_digest !== closure.frozen_requirement_set_digest) fail('SOURCE_DIGEST_CLOSURE_DRIFT');
if (source.source.requirement_set_digest !== contract.source_contract.requirement_set_digest) fail('SOURCE_DIGEST_CONTRACT_DRIFT');
if (closure.contract !== 'qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-CONTRACT-025A.json') fail('CONTRACT_POINTER_DRIFT');

const sourceOrder = source.nodes.map((r) => r[0]);
const sourceMap = new Map(source.nodes.map((r) => [r[0], { locator: r[2], cognitive: r[3] }]));
const globalTargets = [];
const globalParents = [];
const globalTargetIds = new Set();
const globalSubskillIds = new Set();
const globalParentIds = new Set();
let unresolvedCandidateCount = 0;

const protectedEvidence = [
  'psychometric_validity',
  'learner_mastery',
  'retention',
  'transfer',
  'workplace_effectiveness',
  'sme_approval',
  'certification_equivalence'
];

for (let i = 0; i < closure.assessment_batches.length; i += 1) {
  const batchName = closure.assessment_batches[i];
  const topologyName = closure.topology_inputs[i];
  const batch = load(batchName);
  const topology = load(topologyName);

  if (!Array.isArray(batch.targets) || batch.target_count !== batch.targets.length) fail('BATCH_TARGET_COUNT', batchName);
  if (!Array.isArray(topology.subskills)) fail('TOPOLOGY_SUBSKILLS_REQUIRED', topologyName);

  let topologyRequirementIds;
  if (Array.isArray(topology.requirement_ids)) {
    topologyRequirementIds = topology.requirement_ids;
  } else if (batch.domain === 'I') {
    topologyRequirementIds = source.nodes.filter((r) => String(r[0]).startsWith('ASQ-CSSGB-2022-I.')).map((r) => r[0]);
  } else {
    topologyRequirementIds = topology.subskills.map((s) => s.parent_requirement_id);
  }

  if (topologyRequirementIds.length !== batch.target_count) fail('TOPOLOGY_TARGET_COUNT', topologyName);

  const parentOrder = batch.targets.map((t) => t.parent_requirement_id);
  if (JSON.stringify(parentOrder) !== JSON.stringify(topologyRequirementIds)) fail('BATCH_SOURCE_ORDER', batchName);

  const subskillMap = new Map(topology.subskills.map((s) => [s.subskill_id, s]));
  if (subskillMap.size !== topology.subskills.length) fail('TOPOLOGY_DUPLICATE_SUBSKILL', topologyName);

  for (const unresolved of topology.unresolved_dependency_candidates || []) {
    unresolvedCandidateCount += 1;
    if (unresolved.admission_status !== 'UNRESOLVED__NOT_CANONICAL') fail('DEPENDENCY_BOUNDARY', unresolved.candidate_id || topologyName);
  }

  for (const target of batch.targets) {
    for (const field of contract.target_schema.required_fields) {
      if (!Object.prototype.hasOwnProperty.call(target, field)) fail('TARGET_FIELD_MISSING', `${target.parent_requirement_id || batchName}:${field}`);
    }

    const subskill = subskillMap.get(target.subskill_id);
    if (!subskill) fail('UNKNOWN_SUBSKILL', target.subskill_id);
    if (target.parent_requirement_id !== subskill.parent_requirement_id) fail('SUBSKILL_PARENT_MISMATCH', target.subskill_id);

    const sourceRecord = sourceMap.get(target.parent_requirement_id);
    if (!sourceRecord) fail('UNKNOWN_PARENT', target.parent_requirement_id);
    if (target.source_locator !== sourceRecord.locator) fail('SOURCE_LOCATOR_MISMATCH', target.parent_requirement_id);
    if (target.preserved_cognitive_level !== sourceRecord.cognitive) fail('COGNITIVE_LEVEL_MISMATCH', target.parent_requirement_id);
    if (target.capability_statement !== subskill.capability_statement) fail('CAPABILITY_STATEMENT_MISMATCH', target.subskill_id);

    if (!text(target.assessment_target_id) || !target.assessment_target_id.startsWith(`ASSESS::CSSGB-2022::${target.parent_requirement_id}::`)) fail('TARGET_ID_INVALID', target.parent_requirement_id);
    if (!contract.target_schema.target_types.includes(target.target_type)) fail('TARGET_TYPE_INVALID', target.parent_requirement_id);
    if (!contract.target_schema.evidence_input_classes.includes(target.evidence_input_class)) fail('EVIDENCE_INPUT_CLASS_INVALID', target.parent_requirement_id);
    if (!contract.target_schema.response_action_classes.includes(target.response_action_class)) fail('RESPONSE_ACTION_CLASS_INVALID', target.parent_requirement_id);

    const allowedActions = contract.cognitive_alignment_rules[target.preserved_cognitive_level];
    if (!Array.isArray(allowedActions) || !allowedActions.includes(target.response_action_class)) fail('COGNITIVE_ACTION_MISALIGNMENT', target.parent_requirement_id);

    if (!target.prompt_contract || !text(target.prompt_contract.supplied_evidence) || !text(target.prompt_contract.required_action) || !Array.isArray(target.prompt_contract.must_not_assume)) fail('PROMPT_CONTRACT_INVALID', target.parent_requirement_id);

    const minAssertions = target.preserved_cognitive_level === 'REMEMBER' ? 1 : 2;
    if (!Array.isArray(target.scoring_assertions) || target.scoring_assertions.length < minAssertions) fail('SCORING_ASSERTION_COUNT', target.parent_requirement_id);
    const assertionIds = new Set();
    for (const assertion of target.scoring_assertions) {
      if (!assertion || !text(assertion.assertion_id) || assertionIds.has(assertion.assertion_id) || !text(assertion.observable_property) || !text(assertion.pass_condition)) fail('SCORING_ASSERTION_INVALID', target.parent_requirement_id);
      assertionIds.add(assertion.assertion_id);
      const normalized = `${assertion.observable_property} ${assertion.pass_condition}`.toLowerCase();
      if (normalized.includes('evaluator agrees') || normalized.includes('looks correct') || normalized.includes('seems correct') || normalized.includes('subjective')) fail('NONDETERMINISTIC_SCORING', target.parent_requirement_id);
    }

    if (!target.insufficient_evidence_behavior || !text(target.insufficient_evidence_behavior.trigger) || !text(target.insufficient_evidence_behavior.required_behavior)) fail('INSUFFICIENT_EVIDENCE_BEHAVIOR_REQUIRED', target.parent_requirement_id);
    if (!Array.isArray(target.provenance_refs) || !target.provenance_refs.includes(`SOURCE_NODE_INDEX:${target.parent_requirement_id}`) || !target.provenance_refs.includes(`SUBSKILL:${target.subskill_id}`)) fail('PROVENANCE_REQUIRED', target.parent_requirement_id);
    if (target.validation_status !== 'PROVISIONAL_BOUND') fail('VALIDATION_STATUS_INVALID', target.parent_requirement_id);

    for (const key of protectedEvidence) {
      if (!target.evidence_boundaries || target.evidence_boundaries[key] !== 'UNOBSERVED') fail('UNAUTHORIZED_EVIDENCE_CLAIM', `${target.parent_requirement_id}:${key}`);
    }

    if (globalTargetIds.has(target.assessment_target_id)) fail('GLOBAL_DUPLICATE_TARGET', target.assessment_target_id);
    if (globalSubskillIds.has(target.subskill_id)) fail('GLOBAL_DUPLICATE_SUBSKILL', target.subskill_id);
    if (globalParentIds.has(target.parent_requirement_id)) fail('GLOBAL_DUPLICATE_PARENT', target.parent_requirement_id);

    globalTargetIds.add(target.assessment_target_id);
    globalSubskillIds.add(target.subskill_id);
    globalParentIds.add(target.parent_requirement_id);
    globalTargets.push(target);
    globalParents.push(target.parent_requirement_id);
  }

  for (const key of protectedEvidence) {
    if (!batch.batch_boundaries || batch.batch_boundaries[key] !== 'UNOBSERVED') fail('BATCH_BOUNDARY_CLAIM', `${batchName}:${key}`);
  }
  if (!batch.batch_boundaries || batch.batch_boundaries.unresolved_dependency_candidates !== 'UNCHANGED__SEPARATE_LANE') fail('BATCH_DEPENDENCY_BOUNDARY', batchName);
}

if (globalTargets.length !== 66) fail('GLOBAL_TARGET_COUNT', String(globalTargets.length));
if (globalTargetIds.size !== 66) fail('GLOBAL_TARGET_ID_UNIQUENESS', String(globalTargetIds.size));
if (globalSubskillIds.size !== 66) fail('GLOBAL_SUBSKILL_ID_UNIQUENESS', String(globalSubskillIds.size));
if (globalParentIds.size !== 66) fail('GLOBAL_PARENT_ID_UNIQUENESS', String(globalParentIds.size));
if (JSON.stringify(globalParents) !== JSON.stringify(sourceOrder)) fail('GLOBAL_SOURCE_ORDER_MISMATCH');

const summary = {
  qualification_id: 'LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-ASSESSMENT-TARGET-FULL-CLOSURE-HOSTED-PREQUAL',
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  result_class: 'PASS',
  frozen_requirement_count: 66,
  assessment_targets_validated: 66,
  assessment_batches_validated: closure.assessment_batches.length,
  assessment_target_ids_globally_unique: true,
  subskill_ids_globally_unique: true,
  parent_requirement_ids_globally_unique: true,
  global_target_parent_order_equals_frozen_source_order: true,
  source_locator_and_cognitive_level_match_frozen_source: true,
  capability_statement_matches_structural_subskill: true,
  cognitive_action_alignment: true,
  deterministic_scoring: true,
  explicit_insufficient_evidence_behavior: true,
  unresolved_dependency_candidates_observed: unresolvedCandidateCount,
  unresolved_dependency_candidates: 'UNCHANGED__SEPARATE_LANE',
  psychometric_validity: 'UNOBSERVED',
  learner_mastery: 'UNOBSERVED',
  retention: 'UNOBSERVED',
  transfer: 'UNOBSERVED',
  workplace_effectiveness: 'UNOBSERVED',
  sme_approval: 'UNOBSERVED',
  certification_equivalence: 'UNOBSERVED',
  a01_pass_claimed: false,
  native_or_production_claimed: false,
  next_objective: closure.next_objective_on_pass
};

fs.writeFileSync(path.join(evidenceDir, 'qualification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
