'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ELIGIBILITY_KEYS,
  SCORE_MAX,
  REPORT_KEYS,
  validateNightSelectionGate,
  validateAssignmentContract
} = require('../.github/scripts/second-shift-mastery-contract-validate.js');

const clone = (value) => structuredClone(value);
const oid = (ch) => ch.repeat(40);
const now = '2026-09-12T23:30:00-04:00';

function checks(overrides = {}) {
  return Object.fromEntries(ELIGIBILITY_KEYS.map((key) => [key, overrides[key] ?? true]));
}

function candidate({
  system_id,
  head,
  score,
  eligible = true,
  mandatory = false,
  last = '2026-09-10T00:00:00-04:00',
  overrides = {},
  checkOverrides = {}
}) {
  const score_components = {
    critical_path_unlock_value: 0,
    executable_queue_depth: 0,
    milestone_completion_value: 0,
    reliability_blocker_reduction: 0,
    dependency_leverage: 0,
    age_starvation: 0,
    ...overrides
  };
  const computed = Object.values(score_components).reduce((sum, value) => sum + value, 0);
  assert.equal(computed, score);
  const eligibility_checks = checks(checkOverrides);
  if (!eligible && Object.values(eligibility_checks).every(Boolean)) {
    eligibility_checks.UNATTENDED_SAFE = false;
  }
  return {
    system_id,
    owner_path: `SYSTEM_MASTER/${system_id}`,
    control_ref: `${system_id.toLowerCase()}/control-v1`,
    control_head: head,
    objective_id: `${system_id}-OBJECTIVE-001`,
    module_or_capability: `${system_id} CAPABILITY`,
    eligible,
    eligibility_checks,
    rejection_reasons: eligible ? [] : ['UNATTENDED_SAFE=false'],
    mandatory_repair_control_health: mandatory,
    score_components,
    total_score: score,
    score_evidence: eligible ? [`${system_id} scored from current authority and prepared queue`] : [],
    executable_queue_packet_ids: eligible ? [`${system_id}-P1`, `${system_id}-P2`] : [],
    last_primary_night_at: last
  };
}

function selectionFixture() {
  const weights = { ...SCORE_MAX };
  return {
    schema_id: 'SECOND-SHIFT-NIGHT-SELECTION-GATE-SCHEMA-001',
    shift_id: 'SECOND-SHIFT-2026-09-13',
    shift_date: '2026-09-13',
    timezone: 'America/New_York',
    status: 'FROZEN',
    authority_snapshot: {
      current_authority_ref: 'governance/CURRENT-AUTHORITY.json',
      topology_ref: 'governance/SYSTEM-TOPOLOGY-007.json',
      obligation_registry_ref: 'governance/WORK-OBLIGATION-REGISTRY-017.json',
      repair_registry_refs: ['governance/repair/REPAIR-INBOX-REGISTRY-001.json'],
      captured_at: now
    },
    selection_policy: {
      policy_id: 'SECOND-SHIFT-NIGHT-SELECTION-SCORE-001',
      weights
    },
    candidates: [
      candidate({
        system_id: 'BOOK', head: oid('a'), score: 90,
        overrides: {
          critical_path_unlock_value: 28,
          executable_queue_depth: 19,
          milestone_completion_value: 14,
          reliability_blocker_reduction: 13,
          dependency_leverage: 8,
          age_starvation: 8
        }
      }),
      candidate({
        system_id: 'DOCUMENTS', head: oid('b'), score: 80,
        overrides: {
          critical_path_unlock_value: 24,
          executable_queue_depth: 18,
          milestone_completion_value: 12,
          reliability_blocker_reduction: 12,
          dependency_leverage: 7,
          age_starvation: 7
        }
      }),
      candidate({
        system_id: 'LEARNING', head: oid('c'), score: 70, eligible: false,
        overrides: {
          critical_path_unlock_value: 22,
          executable_queue_depth: 15,
          milestone_completion_value: 10,
          reliability_blocker_reduction: 10,
          dependency_leverage: 7,
          age_starvation: 6
        },
        checkOverrides: { UNATTENDED_SAFE: false }
      })
    ],
    ranking: ['BOOK', 'DOCUMENTS'],
    selected_primary_system: 'BOOK',
    selected_reserve_system: 'DOCUMENTS',
    primary_selection_reason: 'BOOK is the highest-ranked eligible system under the locked v1 policy.',
    selected_at: now
  };
}

function morningLabels() {
  return Object.fromEntries(REPORT_KEYS.map((key) => [key, key.replaceAll('_', ' ')]));
}

function reservePolicy() {
  return {
    requires_no_executable_primary_packet: true,
    requires_same_system_fallbacks_checked: true,
    requires_durable_blocker_or_exhaustion_evidence: true,
    requires_no_primary_qualification_repair_evidence_reconciliation_or_successor_prep: true,
    requires_independent_evaluator_exhaustion_verdict: true,
    requires_recorded_mission_transition_reason: true,
    reserve_never_rewrites_primary_result: true
  };
}

function successorPolicy() {
  return {
    worker_may_propose: true,
    worker_may_self_authorize: false,
    allowed_admission_modes: ['PREAPPROVED_PACKET', 'EVALUATOR_ADMITTED_SAME_MISSION_CONTINUATION'],
    cross_system_requires_replan: true,
    capability_boundary_change_requires_replan: true,
    objective_change_requires_replan: true,
    research_scope_change_requires_replan: true,
    authority_class_change_requires_replan: true
  };
}

function packet1() {
  return {
    packet_id: 'BOOK-P1',
    purpose: 'Implement the first bounded Book mission packet.',
    required_predecessor_packet_ids: [],
    bounded_scope: 'Only the named Book capability and its direct tests/evidence.',
    expected_completion_delta: 'BOOK-P1 accepted by independent evaluator.',
    allowed_mutation_surfaces: ['book-system/runtime/**', 'tests/book/**'],
    forbidden_mutation_surfaces: ['learning/**', 'documents/**', 'system-master/core/**'],
    objective_verification_method: 'Run deterministic packet tests and inspect evaluator evidence.',
    evaluator_acceptance_criteria: ['All packet tests pass.', 'No forbidden surface changed.', 'Definition of done evidence is complete.'],
    on_pass_successor_packet_ids: ['BOOK-P2'],
    on_block_fallback_packet_ids: [],
    research_allowed: false,
    bounded_research_question_or_null: null,
    research_allowed_sources_or_surfaces: [],
    research_stop_condition_or_null: null,
    human_escalation_conditions: []
  };
}

function packet2() {
  return {
    packet_id: 'BOOK-P2',
    purpose: 'Verify and seal the same Book mission capability.',
    required_predecessor_packet_ids: ['BOOK-P1'],
    bounded_scope: 'Same mission verification and evidence only.',
    expected_completion_delta: 'Target mission end state accepted by evaluator.',
    allowed_mutation_surfaces: ['book-system/runtime/**', 'tests/book/**'],
    forbidden_mutation_surfaces: ['learning/**', 'documents/**', 'system-master/core/**'],
    objective_verification_method: 'Run final tests and compare against target end state.',
    evaluator_acceptance_criteria: ['Target end state is satisfied.', 'Required evidence is complete.'],
    on_pass_successor_packet_ids: [],
    on_block_fallback_packet_ids: [],
    research_allowed: false,
    bounded_research_question_or_null: null,
    research_allowed_sources_or_surfaces: [],
    research_stop_condition_or_null: null,
    human_escalation_conditions: []
  };
}

function assignmentFixture() {
  return {
    schema_id: 'SECOND-SHIFT-ASSIGNMENT-CONTRACT-SCHEMA-003',
    shift_id: 'SECOND-SHIFT-2026-09-13',
    mission_id: 'BOOK-NIGHT-MISSION-001',
    status: 'FROZEN',
    selection_gate_ref: 'governance/second-shift/night-selection/2026-09-13.json',
    primary_system: 'BOOK',
    reserve_system_or_null: 'DOCUMENTS',
    owner_path: 'SYSTEM_MASTER/BOOK',
    control_ref: 'book-system/control-v1',
    control_head_at_freeze: oid('a'),
    objective_id: 'BOOK-OBJECTIVE-001',
    module_or_capability: 'BOOK DURABLE WORKFLOW',
    plain_language_mission: 'Finish one verified Book capability without leaving the Book mission.',
    starting_state: 'BOOK-P1 is ready and BOOK-P2 is dependency-blocked on BOOK-P1.',
    target_end_state: 'BOOK-P1 and BOOK-P2 are independently accepted with durable evidence.',
    definition_of_done: ['Both packets accepted by evaluator.', 'No drift or unresolved blocker remains.'],
    approved_packet_queue: ['BOOK-P1', 'BOOK-P2'],
    packets: [packet1(), packet2()],
    packet_dependency_graph: {
      version: 1,
      edges: [
        { from_packet_id: 'BOOK-P1', to_packet_id: 'BOOK-P2', kind: 'PASS_SUCCESSOR' },
        { from_packet_id: 'BOOK-P1', to_packet_id: 'BOOK-P2', kind: 'REQUIRES' }
      ]
    },
    allowed_actions: ['IMPLEMENT_PACKET', 'RUN_TESTS', 'COLLECT_EVIDENCE', 'INDEPENDENT_EVALUATE', 'RECOVER_SAME_MISSION'],
    allowed_paths_or_surfaces: ['book-system/**', 'tests/book/**'],
    forbidden_actions: ['OPEN_ENDED_RESEARCH', 'CROSS_SYSTEM_MUTATION', 'WORKER_SELF_ACCEPTANCE', 'UNLISTED_SUCCESSOR_EXECUTION'],
    forbidden_authority: ['A01_WINDOWS', 'HUMAN', 'AUTHOR', 'PRIVATE_DATA', 'NATIVE', 'PUBLICATION', 'PRODUCTION'],
    required_tests_or_evaluations: ['BOOK-P1 deterministic test suite', 'BOOK-P2 deterministic test suite', 'independent evaluator verdict'],
    required_evidence: ['packet receipts', 'test evidence', 'evaluator verdict', 'checkpoint lineage'],
    checkpoint_contract: {
      durable: true,
      checkpoint_pointer_required: true,
      restart_reconstructable: true,
      progress_signal_distinct_from_heartbeat: true
    },
    retry_recovery_policy: {
      at_least_once_assumed: true,
      idempotency_required: true,
      deduplication_required: true,
      fencing_required: true,
      durable_checkpoint_required: true,
      max_retry_budget: 3
    },
    research_policy: {
      mode: 'NONE',
      default_permission: 'DENY',
      mission_is_research: false,
      bounded_question_or_null: null,
      allowed_sources_or_surfaces: [],
      stop_condition_or_null: null
    },
    successor_policy: successorPolicy(),
    reserve_activation_policy: reservePolicy(),
    human_escalation_conditions: ['Required human/author/private/native/external authority becomes necessary.'],
    stop_conditions: ['Target end state is evaluator accepted.', 'No safe mission-valid work remains and primary exhaustion is evaluator verified.'],
    morning_report_labels: morningLabels(),
    top_level_system_wip: 1,
    mutation_packet_wip: 1,
    created_at: now
  };
}

test('night selection accepts deterministic primary and reserve ranking', () => {
  assert.equal(validateNightSelectionGate(selectionFixture()), true);
});

test('night selection rejects an ineligible candidate placed in ranking', () => {
  const value = selectionFixture();
  value.ranking = ['LEARNING', 'BOOK', 'DOCUMENTS'];
  value.selected_primary_system = 'LEARNING';
  assert.throws(() => validateNightSelectionGate(value), /ranking does not match deterministic eligible ranking/);
});

test('night selection mandatory repair tie-break wins equal total score', () => {
  const value = selectionFixture();
  const book = candidate({
    system_id: 'BOOK', head: oid('a'), score: 80, mandatory: false,
    overrides: { critical_path_unlock_value: 24, executable_queue_depth: 17, milestone_completion_value: 12, reliability_blocker_reduction: 12, dependency_leverage: 8, age_starvation: 7 }
  });
  const documents = candidate({
    system_id: 'DOCUMENTS', head: oid('b'), score: 80, mandatory: true,
    overrides: { critical_path_unlock_value: 24, executable_queue_depth: 17, milestone_completion_value: 12, reliability_blocker_reduction: 12, dependency_leverage: 8, age_starvation: 7 }
  });
  value.candidates = [book, documents];
  value.ranking = ['DOCUMENTS', 'BOOK'];
  value.selected_primary_system = 'DOCUMENTS';
  value.selected_reserve_system = 'BOOK';
  assert.equal(validateNightSelectionGate(value), true);
});

test('night selection no eligible systems requires null primary and reserve', () => {
  const value = selectionFixture();
  value.candidates = [
    candidate({ system_id: 'BOOK', head: oid('a'), score: 0, eligible: false, checkOverrides: { UNATTENDED_SAFE: false } })
  ];
  value.status = 'NO_ELIGIBLE_SYSTEM';
  value.ranking = [];
  value.selected_primary_system = null;
  value.selected_reserve_system = null;
  value.primary_selection_reason = 'No candidate passed every hard eligibility gate.';
  assert.equal(validateNightSelectionGate(value), true);
});

test('assignment contract accepts one-system one-packet WIP and exact queue graph', () => {
  assert.equal(validateAssignmentContract(assignmentFixture()), true);
});

test('assignment contract rejects WIP greater than one', () => {
  const value = assignmentFixture();
  value.mutation_packet_wip = 2;
  assert.throws(() => validateAssignmentContract(value), /WIP must be exactly one system and one mutation packet/);
});

test('assignment contract rejects research drift under NONE policy', () => {
  const value = assignmentFixture();
  value.packets[0].research_allowed = true;
  value.packets[0].bounded_research_question_or_null = 'What other useful Book work exists?';
  value.packets[0].research_allowed_sources_or_surfaces = ['book-system/**'];
  value.packets[0].research_stop_condition_or_null = 'Stop after finding something interesting.';
  assert.throws(() => validateAssignmentContract(value), /cannot enable research when mission research_policy=NONE/);
});

test('assignment contract rejects worker self-authorization', () => {
  const value = assignmentFixture();
  value.successor_policy.worker_may_self_authorize = true;
  assert.throws(() => validateAssignmentContract(value), /forbid worker self-authorization/);
});

test('assignment contract rejects predecessor that is not earlier in queue', () => {
  const value = assignmentFixture();
  value.packets[0].required_predecessor_packet_ids = ['BOOK-P2'];
  value.packet_dependency_graph.edges.push({ from_packet_id: 'BOOK-P2', to_packet_id: 'BOOK-P1', kind: 'REQUIRES' });
  assert.throws(() => validateAssignmentContract(value), /predecessor BOOK-P2 must appear earlier in queue/);
});

test('assignment contract rejects universal mutation scope', () => {
  const value = assignmentFixture();
  value.allowed_paths_or_surfaces = ['**'];
  assert.throws(() => validateAssignmentContract(value), /cannot grant universal scope/);
});

test('assignment contract rejects reserve equal to primary', () => {
  const value = assignmentFixture();
  value.reserve_system_or_null = 'BOOK';
  assert.throws(() => validateAssignmentContract(value), /primary and reserve must differ/);
});

test('bounded blocking research requires explicit packet question sources and stop condition', () => {
  const value = assignmentFixture();
  value.research_policy = {
    mode: 'BLOCKING_UNCERTAINTY_BOUNDED',
    default_permission: 'DENY',
    mission_is_research: false,
    bounded_question_or_null: null,
    allowed_sources_or_surfaces: [],
    stop_condition_or_null: null
  };
  assert.throws(() => validateAssignmentContract(value), /requires at least one bounded research-enabled packet/);

  value.packets[0].research_allowed = true;
  value.packets[0].bounded_research_question_or_null = 'Which exact documented API contract blocks BOOK-P1 verification?';
  value.packets[0].research_allowed_sources_or_surfaces = ['book-system/contracts/**'];
  value.packets[0].research_stop_condition_or_null = 'Stop when the blocking API contract is identified or proven absent.';
  assert.equal(validateAssignmentContract(value), true);
});

test('night selection final system-id tie-break uses deterministic code-unit order', () => {
  const value = selectionFixture();
  const overrides = {
    critical_path_unlock_value: 24,
    executable_queue_depth: 17,
    milestone_completion_value: 12,
    reliability_blocker_reduction: 12,
    dependency_leverage: 8,
    age_starvation: 7
  };
  const punctuated = candidate({ system_id: 'A_A', head: oid('d'), score: 80, overrides, last: '2026-09-10T00:00:00-04:00' });
  const compact = candidate({ system_id: 'AA', head: oid('e'), score: 80, overrides, last: '2026-09-10T00:00:00-04:00' });
  value.candidates = [punctuated, compact];
  value.ranking = ['AA', 'A_A'];
  value.selected_primary_system = 'AA';
  value.selected_reserve_system = 'A_A';
  value.primary_selection_reason = 'AA is lexicographically smaller under fixed code-unit ordering.';
  assert.equal(validateNightSelectionGate(value), true);
});
