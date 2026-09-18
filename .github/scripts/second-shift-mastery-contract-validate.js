'use strict';

const fs = require('fs');

const ELIGIBILITY_KEYS = [
  'CURRENT_AUTHORITY_RESOLVES',
  'TOPOLOGY_OWNER_ACTIVE',
  'UNATTENDED_SAFE',
  'OPEN_OBJECTIVE',
  'EXECUTABLE_PACKET_EXISTS',
  'NO_IMMEDIATE_HUMAN_OR_HIGHER_AUTHORITY_BLOCK',
  'SAME_SYSTEM_QUEUE_PREPARED',
  'INDEPENDENT_EVALUATION_AVAILABLE',
  'MUTATION_OWNERSHIP_UNAMBIGUOUS',
  'MANDATORY_REPAIR_CONTROL_HEALTH_REPRESENTED'
];

const SCORE_MAX = Object.freeze({
  critical_path_unlock_value: 30,
  executable_queue_depth: 20,
  milestone_completion_value: 15,
  reliability_blocker_reduction: 15,
  dependency_leverage: 10,
  age_starvation: 10
});

const REPORT_KEYS = [
  'mission', 'start', 'finish', 'progress', 'night_use', 'assignment_adherence',
  'quality', 'recovery', 'remaining', 'decision', 'verdict', 'next_night_recommendation'
];

function fail(message) {
  const error = new Error(message);
  error.name = 'SecondShiftMasteryContractError';
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function strictObject(value, required, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    fail(`${label} fields must equal ${expected.join(',')}`);
  }
}

function string(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value, label) {
  if (value === null) return null;
  return string(value, label);
}

function bool(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean`);
  return value;
}

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer ${min}..${max}`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function stringArray(value, label, { nonEmpty = false } = {}) {
  const values = array(value, label);
  if (nonEmpty && values.length === 0) fail(`${label} must not be empty`);
  for (const [i, item] of values.entries()) string(item, `${label}[${i}]`);
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
  return values;
}

function exactStringSet(value, expected, label) {
  const actual = stringArray(value, label).slice().sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((v, i) => v !== wanted[i])) fail(`${label} must equal ${wanted.join(',')}`);
}

function timestampOrNull(value, label) {
  if (value === null) return null;
  string(value, label);
  if (Number.isNaN(Date.parse(value))) fail(`${label} must be an ISO timestamp or null`);
  return value;
}

function gitOid(value, label) {
  string(value, label);
  if (!/^[0-9a-f]{40,64}$/.test(value)) fail(`${label} must be an exact hexadecimal Git object id`);
  return value;
}

function validateAuthoritySnapshot(value) {
  strictObject(value, ['current_authority_ref', 'topology_ref', 'obligation_registry_ref', 'repair_registry_refs', 'captured_at'], 'authority_snapshot');
  string(value.current_authority_ref, 'authority_snapshot.current_authority_ref');
  string(value.topology_ref, 'authority_snapshot.topology_ref');
  string(value.obligation_registry_ref, 'authority_snapshot.obligation_registry_ref');
  stringArray(value.repair_registry_refs, 'authority_snapshot.repair_registry_refs');
  timestampOrNull(value.captured_at, 'authority_snapshot.captured_at');
}

function validateSelectionPolicy(value) {
  strictObject(value, ['policy_id', 'weights'], 'selection_policy');
  if (value.policy_id !== 'SECOND-SHIFT-NIGHT-SELECTION-SCORE-001') fail('selection_policy.policy_id mismatch');
  strictObject(value.weights, Object.keys(SCORE_MAX), 'selection_policy.weights');
  for (const [key, maximum] of Object.entries(SCORE_MAX)) {
    if (value.weights[key] !== maximum) fail(`selection_policy.weights.${key} must equal locked v1 weight ${maximum}`);
  }
}

function validateCandidate(candidate, index) {
  const label = `candidates[${index}]`;
  strictObject(candidate, [
    'system_id', 'owner_path', 'control_ref', 'control_head', 'objective_id', 'module_or_capability',
    'eligible', 'eligibility_checks', 'rejection_reasons', 'mandatory_repair_control_health',
    'score_components', 'total_score', 'score_evidence', 'executable_queue_packet_ids', 'last_primary_night_at'
  ], label);
  string(candidate.system_id, `${label}.system_id`);
  string(candidate.owner_path, `${label}.owner_path`);
  string(candidate.control_ref, `${label}.control_ref`);
  gitOid(candidate.control_head, `${label}.control_head`);
  string(candidate.objective_id, `${label}.objective_id`);
  string(candidate.module_or_capability, `${label}.module_or_capability`);
  bool(candidate.eligible, `${label}.eligible`);
  strictObject(candidate.eligibility_checks, ELIGIBILITY_KEYS, `${label}.eligibility_checks`);
  const checks = ELIGIBILITY_KEYS.map((key) => bool(candidate.eligibility_checks[key], `${label}.eligibility_checks.${key}`));
  const allTrue = checks.every(Boolean);
  if (candidate.eligible !== allTrue) fail(`${label}.eligible must exactly equal all hard eligibility checks`);
  const rejectionReasons = stringArray(candidate.rejection_reasons, `${label}.rejection_reasons`);
  bool(candidate.mandatory_repair_control_health, `${label}.mandatory_repair_control_health`);
  strictObject(candidate.score_components, Object.keys(SCORE_MAX), `${label}.score_components`);
  let total = 0;
  for (const [key, maximum] of Object.entries(SCORE_MAX)) {
    total += integer(candidate.score_components[key], `${label}.score_components.${key}`, 0, maximum);
  }
  integer(candidate.total_score, `${label}.total_score`, 0, 100);
  if (candidate.total_score !== total) fail(`${label}.total_score must equal exact component sum`);
  const scoreEvidence = stringArray(candidate.score_evidence, `${label}.score_evidence`);
  const queue = stringArray(candidate.executable_queue_packet_ids, `${label}.executable_queue_packet_ids`);
  timestampOrNull(candidate.last_primary_night_at, `${label}.last_primary_night_at`);
  if (candidate.eligible) {
    if (queue.length === 0) fail(`${label} eligible candidate requires executable queue depth`);
    if (scoreEvidence.length === 0) fail(`${label} eligible candidate requires score evidence`);
    if (rejectionReasons.length !== 0) fail(`${label} eligible candidate cannot carry rejection reasons`);
  } else if (rejectionReasons.length === 0) {
    fail(`${label} ineligible candidate requires factual rejection reasons`);
  }
}

function ageValue(value) {
  return value === null ? Number.NEGATIVE_INFINITY : Date.parse(value);
}

function rankCandidates(a, b) {
  if (a.total_score !== b.total_score) return b.total_score - a.total_score;
  if (a.mandatory_repair_control_health !== b.mandatory_repair_control_health) return a.mandatory_repair_control_health ? -1 : 1;
  if (a.score_components.critical_path_unlock_value !== b.score_components.critical_path_unlock_value) {
    return b.score_components.critical_path_unlock_value - a.score_components.critical_path_unlock_value;
  }
  if (a.score_components.executable_queue_depth !== b.score_components.executable_queue_depth) {
    return b.score_components.executable_queue_depth - a.score_components.executable_queue_depth;
  }
  if (ageValue(a.last_primary_night_at) !== ageValue(b.last_primary_night_at)) return ageValue(a.last_primary_night_at) - ageValue(b.last_primary_night_at);
  return a.system_id.localeCompare(b.system_id);
}

function validateNightSelectionGate(value) {
  strictObject(value, [
    'schema_id', 'shift_id', 'shift_date', 'timezone', 'status', 'authority_snapshot', 'selection_policy',
    'candidates', 'ranking', 'selected_primary_system', 'selected_reserve_system', 'primary_selection_reason', 'selected_at'
  ], 'night_selection');
  if (value.schema_id !== 'SECOND-SHIFT-NIGHT-SELECTION-GATE-SCHEMA-001') fail('night_selection.schema_id mismatch');
  string(value.shift_id, 'night_selection.shift_id');
  string(value.shift_date, 'night_selection.shift_date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.shift_date)) fail('night_selection.shift_date must be YYYY-MM-DD');
  if (value.timezone !== 'America/New_York') fail('night_selection.timezone must be America/New_York');
  if (!['FROZEN', 'NO_ELIGIBLE_SYSTEM'].includes(value.status)) fail('night_selection.status invalid');
  validateAuthoritySnapshot(value.authority_snapshot);
  validateSelectionPolicy(value.selection_policy);
  const candidates = array(value.candidates, 'night_selection.candidates');
  if (candidates.length === 0) fail('night_selection.candidates must not be empty');
  candidates.forEach(validateCandidate);
  const ids = candidates.map((candidate) => candidate.system_id);
  if (new Set(ids).size !== ids.length) fail('candidate system_id values must be unique');
  const eligible = candidates.filter((candidate) => candidate.eligible).sort(rankCandidates);
  const expectedRanking = eligible.map((candidate) => candidate.system_id);
  const ranking = stringArray(value.ranking, 'night_selection.ranking');
  if (JSON.stringify(ranking) !== JSON.stringify(expectedRanking)) fail('night_selection.ranking does not match deterministic eligible ranking');
  nullableString(value.selected_primary_system, 'night_selection.selected_primary_system');
  nullableString(value.selected_reserve_system, 'night_selection.selected_reserve_system');
  string(value.primary_selection_reason, 'night_selection.primary_selection_reason');
  timestampOrNull(value.selected_at, 'night_selection.selected_at');
  if (eligible.length === 0) {
    if (value.status !== 'NO_ELIGIBLE_SYSTEM' || value.selected_primary_system !== null || value.selected_reserve_system !== null) {
      fail('no eligible system requires NO_ELIGIBLE_SYSTEM with null primary/reserve');
    }
  } else {
    if (value.status !== 'FROZEN') fail('eligible night requires FROZEN status');
    if (value.selected_primary_system !== expectedRanking[0]) fail('selected primary must be deterministic rank 1');
    const expectedReserve = expectedRanking.length > 1 ? expectedRanking[1] : null;
    if (value.selected_reserve_system !== expectedReserve) fail('selected reserve must be deterministic rank 2 or null');
    if (value.selected_primary_system === value.selected_reserve_system) fail('primary and reserve cannot be the same system');
  }
  return true;
}

function boundedSurface(value, label) {
  string(value, label);
  if (['*', '**', '/', '/*', '/**'].includes(value.trim())) fail(`${label} cannot grant universal scope`);
}

function validateResearchPolicy(value) {
  strictObject(value, ['mode', 'default_permission', 'mission_is_research', 'bounded_question_or_null', 'allowed_sources_or_surfaces', 'stop_condition_or_null'], 'research_policy');
  if (!['NONE', 'MISSION_EXPLICIT', 'BLOCKING_UNCERTAINTY_BOUNDED'].includes(value.mode)) fail('research_policy.mode invalid');
  if (value.default_permission !== 'DENY') fail('research_policy.default_permission must be DENY');
  bool(value.mission_is_research, 'research_policy.mission_is_research');
  nullableString(value.bounded_question_or_null, 'research_policy.bounded_question_or_null');
  const sources = stringArray(value.allowed_sources_or_surfaces, 'research_policy.allowed_sources_or_surfaces');
  sources.forEach((item, i) => boundedSurface(item, `research_policy.allowed_sources_or_surfaces[${i}]`));
  nullableString(value.stop_condition_or_null, 'research_policy.stop_condition_or_null');
  if (value.mode === 'NONE') {
    if (value.mission_is_research || value.bounded_question_or_null !== null || sources.length !== 0 || value.stop_condition_or_null !== null) fail('NONE research mode must contain no research grant');
  }
  if (value.mode === 'MISSION_EXPLICIT') {
    if (!value.mission_is_research || value.bounded_question_or_null === null || sources.length === 0 || value.stop_condition_or_null === null) fail('MISSION_EXPLICIT requires bounded mission research details');
  }
  if (value.mode === 'BLOCKING_UNCERTAINTY_BOUNDED' && value.mission_is_research) fail('blocking uncertainty mode is not a research mission');
}

function validatePacket(packet, index, queueIndex, researchMode) {
  const label = `packets[${index}]`;
  strictObject(packet, [
    'packet_id', 'purpose', 'required_predecessor_packet_ids', 'bounded_scope', 'expected_completion_delta',
    'allowed_mutation_surfaces', 'forbidden_mutation_surfaces', 'objective_verification_method',
    'evaluator_acceptance_criteria', 'on_pass_successor_packet_ids', 'on_block_fallback_packet_ids',
    'research_allowed', 'bounded_research_question_or_null', 'research_allowed_sources_or_surfaces',
    'research_stop_condition_or_null', 'human_escalation_conditions'
  ], label);
  string(packet.packet_id, `${label}.packet_id`);
  string(packet.purpose, `${label}.purpose`);
  const predecessors = stringArray(packet.required_predecessor_packet_ids, `${label}.required_predecessor_packet_ids`);
  string(packet.bounded_scope, `${label}.bounded_scope`);
  string(packet.expected_completion_delta, `${label}.expected_completion_delta`);
  const allowed = stringArray(packet.allowed_mutation_surfaces, `${label}.allowed_mutation_surfaces`, { nonEmpty: true });
  allowed.forEach((item, i) => boundedSurface(item, `${label}.allowed_mutation_surfaces[${i}]`));
  stringArray(packet.forbidden_mutation_surfaces, `${label}.forbidden_mutation_surfaces`, { nonEmpty: true });
  string(packet.objective_verification_method, `${label}.objective_verification_method`);
  stringArray(packet.evaluator_acceptance_criteria, `${label}.evaluator_acceptance_criteria`, { nonEmpty: true });
  const pass = stringArray(packet.on_pass_successor_packet_ids, `${label}.on_pass_successor_packet_ids`);
  const block = stringArray(packet.on_block_fallback_packet_ids, `${label}.on_block_fallback_packet_ids`);
  bool(packet.research_allowed, `${label}.research_allowed`);
  nullableString(packet.bounded_research_question_or_null, `${label}.bounded_research_question_or_null`);
  const sources = stringArray(packet.research_allowed_sources_or_surfaces, `${label}.research_allowed_sources_or_surfaces`);
  sources.forEach((item, i) => boundedSurface(item, `${label}.research_allowed_sources_or_surfaces[${i}]`));
  nullableString(packet.research_stop_condition_or_null, `${label}.research_stop_condition_or_null`);
  stringArray(packet.human_escalation_conditions, `${label}.human_escalation_conditions`);
  if (packet.research_allowed) {
    if (researchMode === 'NONE') fail(`${label} cannot enable research when mission research_policy=NONE`);
    if (packet.bounded_research_question_or_null === null || sources.length === 0 || packet.research_stop_condition_or_null === null) fail(`${label} research requires bounded question, sources/surfaces and stop condition`);
  } else if (packet.bounded_research_question_or_null !== null || sources.length !== 0 || packet.research_stop_condition_or_null !== null) {
    fail(`${label} research details require research_allowed=true`);
  }
  return { packet, predecessors, pass, block, queueIndex };
}

function validateCheckpoint(value) {
  strictObject(value, ['durable', 'checkpoint_pointer_required', 'restart_reconstructable', 'progress_signal_distinct_from_heartbeat'], 'checkpoint_contract');
  for (const key of Object.keys(value)) if (value[key] !== true) fail(`checkpoint_contract.${key} must be true`);
}

function validateRetryRecovery(value) {
  strictObject(value, ['at_least_once_assumed', 'idempotency_required', 'deduplication_required', 'fencing_required', 'durable_checkpoint_required', 'max_retry_budget'], 'retry_recovery_policy');
  for (const key of ['at_least_once_assumed', 'idempotency_required', 'deduplication_required', 'fencing_required', 'durable_checkpoint_required']) {
    if (value[key] !== true) fail(`retry_recovery_policy.${key} must be true`);
  }
  integer(value.max_retry_budget, 'retry_recovery_policy.max_retry_budget', 1, 3);
}

function validateSuccessorPolicy(value) {
  strictObject(value, ['worker_may_propose', 'worker_may_self_authorize', 'allowed_admission_modes', 'cross_system_requires_replan', 'capability_boundary_change_requires_replan', 'objective_change_requires_replan', 'research_scope_change_requires_replan', 'authority_class_change_requires_replan'], 'successor_policy');
  if (value.worker_may_propose !== true || value.worker_may_self_authorize !== false) fail('successor_policy must allow proposal but forbid worker self-authorization');
  exactStringSet(value.allowed_admission_modes, ['PREAPPROVED_PACKET', 'EVALUATOR_ADMITTED_SAME_MISSION_CONTINUATION'], 'successor_policy.allowed_admission_modes');
  for (const key of ['cross_system_requires_replan', 'capability_boundary_change_requires_replan', 'objective_change_requires_replan', 'research_scope_change_requires_replan', 'authority_class_change_requires_replan']) {
    if (value[key] !== true) fail(`successor_policy.${key} must be true`);
  }
}

function validateReservePolicy(value) {
  const keys = ['requires_no_executable_primary_packet', 'requires_same_system_fallbacks_checked', 'requires_durable_blocker_or_exhaustion_evidence', 'requires_no_primary_qualification_repair_evidence_reconciliation_or_successor_prep', 'requires_independent_evaluator_exhaustion_verdict', 'requires_recorded_mission_transition_reason', 'reserve_never_rewrites_primary_result'];
  strictObject(value, keys, 'reserve_activation_policy');
  for (const key of keys) if (value[key] !== true) fail(`reserve_activation_policy.${key} must be true`);
}

function validateMorningLabels(value) {
  strictObject(value, REPORT_KEYS, 'morning_report_labels');
  for (const key of REPORT_KEYS) string(value[key], `morning_report_labels.${key}`);
}

function validateAssignmentContract(value) {
  strictObject(value, [
    'schema_id', 'shift_id', 'mission_id', 'status', 'selection_gate_ref', 'primary_system', 'reserve_system_or_null',
    'owner_path', 'control_ref', 'control_head_at_freeze', 'objective_id', 'module_or_capability', 'plain_language_mission',
    'starting_state', 'target_end_state', 'definition_of_done', 'approved_packet_queue', 'packets', 'packet_dependency_graph',
    'allowed_actions', 'allowed_paths_or_surfaces', 'forbidden_actions', 'forbidden_authority', 'required_tests_or_evaluations',
    'required_evidence', 'checkpoint_contract', 'retry_recovery_policy', 'research_policy', 'successor_policy',
    'reserve_activation_policy', 'human_escalation_conditions', 'stop_conditions', 'morning_report_labels',
    'top_level_system_wip', 'mutation_packet_wip', 'created_at'
  ], 'assignment');
  if (value.schema_id !== 'SECOND-SHIFT-ASSIGNMENT-CONTRACT-SCHEMA-003') fail('assignment.schema_id mismatch');
  string(value.shift_id, 'assignment.shift_id');
  string(value.mission_id, 'assignment.mission_id');
  if (value.status !== 'FROZEN') fail('assignment.status must be FROZEN');
  string(value.selection_gate_ref, 'assignment.selection_gate_ref');
  string(value.primary_system, 'assignment.primary_system');
  nullableString(value.reserve_system_or_null, 'assignment.reserve_system_or_null');
  if (value.reserve_system_or_null !== null && value.reserve_system_or_null === value.primary_system) fail('assignment primary and reserve must differ');
  string(value.owner_path, 'assignment.owner_path');
  string(value.control_ref, 'assignment.control_ref');
  gitOid(value.control_head_at_freeze, 'assignment.control_head_at_freeze');
  string(value.objective_id, 'assignment.objective_id');
  string(value.module_or_capability, 'assignment.module_or_capability');
  string(value.plain_language_mission, 'assignment.plain_language_mission');
  string(value.starting_state, 'assignment.starting_state');
  string(value.target_end_state, 'assignment.target_end_state');
  stringArray(value.definition_of_done, 'assignment.definition_of_done', { nonEmpty: true });
  const queue = stringArray(value.approved_packet_queue, 'assignment.approved_packet_queue', { nonEmpty: true });
  const packets = array(value.packets, 'assignment.packets');
  if (packets.length === 0) fail('assignment.packets must not be empty');
  if (packets.length !== queue.length) fail('approved_packet_queue must contain every packet exactly once');
  validateResearchPolicy(value.research_policy);
  const packetIds = packets.map((packet) => packet.packet_id);
  if (packetIds.some((id) => typeof id !== 'string') || new Set(packetIds).size !== packetIds.length) fail('packet_id values must be unique strings');
  if (new Set(queue).size !== queue.length || queue.some((id) => !packetIds.includes(id)) || packetIds.some((id) => !queue.includes(id))) fail('approved_packet_queue and packets must contain identical packet ids');
  const queuePos = Object.fromEntries(queue.map((id, i) => [id, i]));
  const parsed = packets.map((packet, i) => validatePacket(packet, i, queuePos[packet.packet_id], value.research_policy.mode));
  const expectedEdges = new Set();
  for (const item of parsed) {
    for (const pred of item.predecessors) {
      if (!(pred in queuePos)) fail(`packet ${item.packet.packet_id} references unknown predecessor ${pred}`);
      if (queuePos[pred] >= item.queueIndex) fail(`packet ${item.packet.packet_id} predecessor ${pred} must appear earlier in queue`);
      expectedEdges.add(`${pred}|${item.packet.packet_id}|REQUIRES`);
    }
    for (const successor of item.pass) {
      if (!(successor in queuePos)) fail(`packet ${item.packet.packet_id} references unknown pass successor ${successor}`);
      if (queuePos[successor] <= item.queueIndex) fail(`packet ${item.packet.packet_id} pass successor ${successor} must appear later in queue`);
      expectedEdges.add(`${item.packet.packet_id}|${successor}|PASS_SUCCESSOR`);
    }
    for (const fallback of item.block) {
      if (!(fallback in queuePos)) fail(`packet ${item.packet.packet_id} references unknown block fallback ${fallback}`);
      if (queuePos[fallback] <= item.queueIndex) fail(`packet ${item.packet.packet_id} block fallback ${fallback} must appear later in queue`);
      expectedEdges.add(`${item.packet.packet_id}|${fallback}|BLOCK_FALLBACK`);
    }
  }
  if (value.research_policy.mode === 'BLOCKING_UNCERTAINTY_BOUNDED' && !parsed.some((item) => item.packet.research_allowed)) fail('blocking uncertainty research mode requires at least one bounded research-enabled packet');
  strictObject(value.packet_dependency_graph, ['version', 'edges'], 'packet_dependency_graph');
  if (value.packet_dependency_graph.version !== 1) fail('packet_dependency_graph.version must equal 1');
  const actualEdges = new Set();
  for (const [i, edge] of array(value.packet_dependency_graph.edges, 'packet_dependency_graph.edges').entries()) {
    strictObject(edge, ['from_packet_id', 'to_packet_id', 'kind'], `packet_dependency_graph.edges[${i}]`);
    string(edge.from_packet_id, `packet_dependency_graph.edges[${i}].from_packet_id`);
    string(edge.to_packet_id, `packet_dependency_graph.edges[${i}].to_packet_id`);
    if (!['REQUIRES', 'PASS_SUCCESSOR', 'BLOCK_FALLBACK'].includes(edge.kind)) fail(`packet_dependency_graph.edges[${i}].kind invalid`);
    const sig = `${edge.from_packet_id}|${edge.to_packet_id}|${edge.kind}`;
    if (actualEdges.has(sig)) fail('packet_dependency_graph contains duplicate edge');
    actualEdges.add(sig);
  }
  if (actualEdges.size !== expectedEdges.size || [...expectedEdges].some((edge) => !actualEdges.has(edge))) fail('packet_dependency_graph must exactly match packet predecessor/successor/fallback declarations');
  stringArray(value.allowed_actions, 'assignment.allowed_actions', { nonEmpty: true });
  const surfaces = stringArray(value.allowed_paths_or_surfaces, 'assignment.allowed_paths_or_surfaces', { nonEmpty: true });
  surfaces.forEach((item, i) => boundedSurface(item, `assignment.allowed_paths_or_surfaces[${i}]`));
  stringArray(value.forbidden_actions, 'assignment.forbidden_actions', { nonEmpty: true });
  stringArray(value.forbidden_authority, 'assignment.forbidden_authority', { nonEmpty: true });
  stringArray(value.required_tests_or_evaluations, 'assignment.required_tests_or_evaluations', { nonEmpty: true });
  stringArray(value.required_evidence, 'assignment.required_evidence', { nonEmpty: true });
  validateCheckpoint(value.checkpoint_contract);
  validateRetryRecovery(value.retry_recovery_policy);
  validateSuccessorPolicy(value.successor_policy);
  validateReservePolicy(value.reserve_activation_policy);
  stringArray(value.human_escalation_conditions, 'assignment.human_escalation_conditions');
  stringArray(value.stop_conditions, 'assignment.stop_conditions', { nonEmpty: true });
  validateMorningLabels(value.morning_report_labels);
  if (value.top_level_system_wip !== 1 || value.mutation_packet_wip !== 1) fail('assignment WIP must be exactly one system and one mutation packet');
  timestampOrNull(value.created_at, 'assignment.created_at');
  return true;
}

if (require.main === module) {
  const [kind, file] = process.argv.slice(2);
  if (!['selection', 'assignment'].includes(kind) || !file) {
    console.error('usage: node second-shift-mastery-contract-validate.js <selection|assignment> <json-file>');
    process.exit(2);
  }
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (kind === 'selection') validateNightSelectionGate(value);
  else validateAssignmentContract(value);
  console.log(`SECOND_SHIFT_MASTERY_${kind.toUpperCase()}_VALID=1`);
}

module.exports = {
  ELIGIBILITY_KEYS,
  SCORE_MAX,
  REPORT_KEYS,
  validateNightSelectionGate,
  validateAssignmentContract,
  rankCandidates
};
