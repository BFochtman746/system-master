'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const validatorPath = path.join(ROOT, '.github', 'scripts', 'second-shift-enforce.js');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'second-shift', 'SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json'), 'utf8'));

function loadValidatorFunctions() {
  const source = fs.readFileSync(validatorPath, 'utf8');
  const marker = 'if (selftest) runSelftest();';
  const idx = source.indexOf(marker);
  if (idx < 0) throw new Error('Could not locate validator selftest boundary');
  const prefix = source.slice(0, idx);
  const moduleObj = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', '__filename', `${prefix}\nmodule.exports = { validExhaustion, validClaim, validateOwner, validateLedger, minutesSince, nyParts };`);
  factory(require, moduleObj, moduleObj.exports, path.dirname(validatorPath), validatorPath);
  return { api: moduleObj.exports, source };
}

const { api, source } = loadValidatorFunctions();
const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const NOW = new Date('2026-09-11T05:00:00.000Z'); // 01:00 America/New_York
const SHIFT_DATE = '2026-09-11';
const LIMITS = { heartbeat_sla_minutes: 50, ready_dispatch_sla_minutes: 70, telemetry_freshness_sla_minutes: 75, max_retry_budget: 3 };

function delegation(overrides = {}) {
  return {
    delegation_id: 'D-001',
    owner_path: 'SYSTEM_MASTER/CORE',
    objective_id: 'O-001',
    obligation_id: 'O-001',
    state: 'READY',
    valid_for_control_ref: 'core/control',
    valid_for_control_head: HEAD,
    created_at: '2026-09-11T04:20:00.000Z',
    last_revalidated_at: '2026-09-11T04:40:00.000Z',
    completion_delta: 'complete bounded work',
    stop_condition: 'terminal evidence preserved',
    allowed_work: ['bounded work'],
    forbidden_authority: ['no cross-lane authority'],
    on_pass: 'bind successor',
    on_failure: 'preserve blocker',
    ...overrides,
  };
}

function claim(overrides = {}) {
  return {
    lease_id: 'L-001',
    lane: 'CORE',
    delegation_id: 'D-001',
    objective_id: 'O-001',
    control_ref: 'core/control',
    control_head_at_claim: HEAD,
    idempotency_key: 'IDEM-001',
    claimed_at: '2026-09-11T04:30:00.000Z',
    lease_expires_at: '2026-09-11T05:30:00.000Z',
    last_heartbeat_at: '2026-09-11T04:50:00.000Z',
    attempt: 1,
    checkpoint_pointer: 'checkpoint:1',
    ...overrides,
  };
}

function owner(activeDelegations = [delegation()], overrides = {}) {
  return {
    owner_system_id: 'CORE',
    owner_path: 'SYSTEM_MASTER/CORE',
    control_ref: 'core/control',
    last_known_control_head: HEAD,
    active_delegations: activeDelegations,
    retired_delegations: [],
    empty_is_valid: false,
    ...overrides,
  };
}

const obligations = [{ obligation_id: 'O-001', owner_path: 'SYSTEM_MASTER/CORE', state: 'READY' }];
const resolved = { type: 'BRANCH_HEAD', ref: 'core/control', head: HEAD };

function event(n, event_type, overrides = {}) {
  const minute = String(n).padStart(2, '0');
  return {
    event_id: `E-${n}-${event_type}`,
    occurred_at: `2026-09-11T04:${minute}:00.000Z`,
    event_type,
    lane: 'CORE',
    control_ref: 'core/control',
    control_head: HEAD,
    delegation_id: 'D-001',
    objective_id: 'O-001',
    evidence: `evidence:${n}`,
    ...overrides,
  };
}

function claimedEvent(n = 2, overrides = {}) {
  return event(n, 'CLAIMED', {
    lease_id: 'L-001',
    idempotency_key: 'IDEM-001',
    lease_expires_at: '2026-09-11T05:30:00.000Z',
    attempt: 1,
    ...overrides,
  });
}

function validRungs() {
  return Array.from({ length: 8 }, (_, i) => ({
    rung: i + 1,
    disposition: 'DEPENDENCY_BLOCKED',
    evidence_or_blocker: `B-${i + 1}`,
    independent_preparation_assessment: 'none remains',
    next_executable_condition: 'dependency changes',
  }));
}

function ledger(events, overrides = {}) {
  return {
    schema_id: schema.schema_id,
    shift_id: 'SECOND-SHIFT-2026-09-11-CORE',
    shift_date: SHIFT_DATE,
    lane: 'CORE',
    events,
    ...overrides,
  };
}

const cases = [];
function test(name, fn) { cases.push([name, fn]); }
function types(findings) { return new Set(findings.filter((f) => f.severity === 'ERROR').map((f) => f.type)); }
function expectType(findings, type) { assert(types(findings).has(type), `expected ${type}; got ${JSON.stringify(findings)}`); }
function expectAnyError(findings, label) { assert(findings.some((f) => f.severity === 'ERROR'), `expected error for ${label}`); }
function expectNoErrors(findings) { assert.strictEqual(findings.filter((f) => f.severity === 'ERROR').length, 0, JSON.stringify(findings)); }

// Owner/claim contract tests.
test('valid READY owner inside dispatch SLA passes', () => expectNoErrors(api.validateOwner(owner(), 'CORE', NOW, true, resolved, obligations, LIMITS)));
test('READY older than dispatch SLA is rejected', () => {
  const d = delegation({ last_revalidated_at: '2026-09-11T03:00:00.000Z' });
  expectType(api.validateOwner(owner([d]), 'CORE', NOW, true, resolved, obligations, LIMITS), 'READY_UNDISPATCHED');
});
test('expired claim is stale', () => {
  const d = delegation({ state: 'CLAIMED', claim: claim({ lease_expires_at: '2026-09-11T04:59:00.000Z' }) });
  expectType(api.validateOwner(owner([d]), 'CORE', NOW, true, resolved, obligations, LIMITS), 'STALE_CLAIM');
});
test('heartbeat older than SLA is stale', () => {
  const d = delegation({ state: 'CLAIMED', claim: claim({ last_heartbeat_at: '2026-09-11T03:00:00.000Z' }) });
  expectType(api.validateOwner(owner([d]), 'CORE', NOW, true, resolved, obligations, LIMITS), 'STALE_CLAIM');
});
test('future heartbeat is invalid', () => {
  const d = delegation({ state: 'CLAIMED', claim: claim({ last_heartbeat_at: '2026-09-11T06:00:00.000Z' }) });
  expectAnyError(api.validateOwner(owner([d]), 'CORE', NOW, true, resolved, obligations, LIMITS), 'future heartbeat');
});
test('two claimed delegations are rejected', () => {
  const d1 = delegation({ state: 'CLAIMED', claim: claim() });
  const d2 = delegation({ delegation_id: 'D-002', objective_id: 'O-002', obligation_id: undefined, state: 'CLAIMED', claim: claim({ lease_id: 'L-002', delegation_id: 'D-002', objective_id: 'O-002', idempotency_key: 'IDEM-002' }) });
  expectType(api.validateOwner(owner([d1, d2]), 'CORE', NOW, true, resolved, obligations, LIMITS), 'OVERLAPPING_MUTATION_CLAIMS');
});
test('stale delegation head is rejected', () => {
  const d = delegation({ valid_for_control_head: OTHER_HEAD });
  expectType(api.validateOwner(owner([d]), 'CORE', NOW, false, resolved, obligations, LIMITS), 'STALE_DELEGATION');
});
test('terminal obligation cannot remain active delegation', () => {
  const terminal = [{ obligation_id: 'O-001', owner_path: 'SYSTEM_MASTER/CORE', state: 'CLOSED' }];
  expectType(api.validateOwner(owner(), 'CORE', NOW, false, resolved, terminal, LIMITS), 'SEMANTIC_STALE_DELEGATION');
});
test('invalid eight-rung exhaustion is rejected', () => {
  const o = owner([], { empty_is_valid: true, all_rungs_exhausted: { rungs: validRungs().slice(0, 7), independent_work_remaining: false } });
  expectType(api.validateOwner(o, 'CORE', NOW, false, resolved, obligations, LIMITS), 'FALSE_EMPTY');
});

// Ledger/state-machine tests.
function baselineEvents() {
  return [
    event(0, 'SHIFT_OPEN'),
    event(1, 'READY'),
    claimedEvent(2),
    event(3, 'RUNNING', { idempotency_key: 'IDEM-001', lease_id: 'L-001' }),
    event(4, 'HEARTBEAT', { idempotency_key: 'IDEM-001', lease_id: 'L-001', checkpoint_pointer: 'checkpoint:2' }),
    event(5, 'PROGRESS', { idempotency_key: 'IDEM-001', lease_id: 'L-001' }),
    event(6, 'COMPLETED', { idempotency_key: 'IDEM-001', lease_id: 'L-001' }),
    event(7, 'SUCCESSOR_BOUND', { delegation_id: 'D-002', objective_id: 'O-002' }),
    event(8, 'SHIFT_CLOSE', { delegation_id: 'D-002', objective_id: 'O-002' }),
  ];
}

test('baseline lifecycle passes', () => expectNoErrors(api.validateLedger(ledger(baselineEvents()), 'CORE', SHIFT_DATE, owner(), schema)));
test('duplicate event ID rejected', () => {
  const ev = baselineEvents(); ev[4].event_id = ev[3].event_id;
  expectType(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'UTILIZATION_EVENT_DUPLICATE');
});
test('out-of-order timestamps rejected', () => {
  const ev = baselineEvents(); ev[4].occurred_at = '2026-09-11T04:01:30.000Z';
  expectType(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'UTILIZATION_EVENT_ORDER_INVALID');
});
test('RUNNING without CLAIMED rejected', () => expectType(api.validateLedger(ledger([event(0, 'SHIFT_OPEN'), event(1, 'RUNNING')]), 'CORE', SHIFT_DATE, owner(), schema), 'RUNNING_WITHOUT_CLAIM'));
test('COMPLETED without live claim rejected', () => expectAnyError(api.validateLedger(ledger([event(0, 'SHIFT_OPEN'), event(1, 'COMPLETED')]), 'CORE', SHIFT_DATE, owner(), schema), 'terminal without claim'));
test('RUNNING must preserve idempotency key', () => {
  const ev = [event(0, 'SHIFT_OPEN'), claimedEvent(1), event(2, 'RUNNING', { lease_id: 'L-001', idempotency_key: 'WRONG' }), event(3, 'STALE', { lease_id: 'L-001', idempotency_key: 'IDEM-001' })];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'RUNNING wrong idempotency key');
});
test('PROGRESS must preserve objective identity', () => {
  const ev = [event(0, 'SHIFT_OPEN'), claimedEvent(1), event(2, 'PROGRESS', { objective_id: 'WRONG', lease_id: 'L-001', idempotency_key: 'IDEM-001' }), event(3, 'STALE', { lease_id: 'L-001', idempotency_key: 'IDEM-001' })];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'PROGRESS wrong objective');
});
test('terminal event on wrong control head cannot release lease', () => {
  const ev = [event(0, 'SHIFT_OPEN'), claimedEvent(1), event(2, 'COMPLETED', { control_head: OTHER_HEAD, lease_id: 'L-001', idempotency_key: 'IDEM-001' })];
  const findings = api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema);
  expectAnyError(findings, 'terminal wrong control head');
  expectType(findings, 'UNCLOSED_MUTATION_CLAIM');
});
test('RETRY missing retry contract fields rejected', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'RETRY')];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'retry missing fields');
});
test('RETRY attempt may not exceed retry_budget', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'RETRY', { dependency_or_operation: 'x', failure_class: 'TRANSIENT', attempt: 3, retry_budget: 2, next_action: 'circuit' })];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'retry attempt over budget');
});
test('RETRY budget may not exceed max_retry_budget', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'RETRY', { dependency_or_operation: 'x', failure_class: 'TRANSIENT', attempt: 1, retry_budget: 99, next_action: 'retry' })];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'retry budget over max');
});
test('CIRCUIT_OPEN requires circuit contract fields', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'CIRCUIT_OPEN')];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'circuit fields');
});
test('ALL_RUNGS_EXHAUSTED requires next_external_condition', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'ALL_RUNGS_EXHAUSTED', { rungs: validRungs(), independent_work_remaining: false })];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'missing next_external_condition');
});
test('IDLE_VALID without exhaustion rejected', () => expectType(api.validateLedger(ledger([event(0, 'SHIFT_OPEN'), event(1, 'IDLE_VALID')]), 'CORE', SHIFT_DATE, owner(), schema), 'IDLE_WITHOUT_EXHAUSTION'));
test('SHIFT_CLOSE with open claim rejected', () => {
  const ev = [event(0, 'SHIFT_OPEN'), claimedEvent(1), event(2, 'SHIFT_CLOSE')];
  expectType(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'UNCLOSED_MUTATION_CLAIM');
});
test('SUCCESSOR_BOUND before a terminal transition rejected', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'SUCCESSOR_BOUND', { delegation_id: 'D-002', objective_id: 'O-002' })];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'successor before terminal');
});
test('duplicate SHIFT_OPEN rejected', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'SHIFT_OPEN')];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'duplicate shift open');
});
test('events after SHIFT_CLOSE rejected', () => {
  const ev = [event(0, 'SHIFT_OPEN'), event(1, 'SHIFT_CLOSE'), event(2, 'READY')];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'event after close');
});
test('reusing idempotency key for a distinct claim is rejected', () => {
  const ev = [
    event(0, 'SHIFT_OPEN'), claimedEvent(1), event(2, 'COMPLETED', { lease_id: 'L-001', idempotency_key: 'IDEM-001' }),
    claimedEvent(3, { lease_id: 'L-002', delegation_id: 'D-002', objective_id: 'O-002', idempotency_key: 'IDEM-001' }),
    event(4, 'STALE', { delegation_id: 'D-002', objective_id: 'O-002', lease_id: 'L-002', idempotency_key: 'IDEM-001' }),
  ];
  expectAnyError(api.validateLedger(ledger(ev), 'CORE', SHIFT_DATE, owner(), schema), 'idempotency collision');
});

test('telemetry freshness SLA is actually enforced by validator source', () => {
  const count = (source.match(/telemetry_freshness_sla_minutes/g) || []).length;
  assert(count > 1, 'telemetry_freshness_sla_minutes is configured but never enforced');
});


const { validateMasteryContract } = require('../.github/scripts/second-shift-execution-control-enforce.js');
function currentMasteryFixture(){return {
 authority:JSON.parse(fs.readFileSync(path.join(ROOT,'governance','CURRENT-AUTHORITY.json'),'utf8')),
 topology:JSON.parse(fs.readFileSync(path.join(ROOT,'governance','SYSTEM-TOPOLOGY-007.json'),'utf8')),
 registry:JSON.parse(fs.readFileSync(path.join(ROOT,'governance','second-shift','SECOND-SHIFT-REGISTRY-001.json'),'utf8')),
 mastery:JSON.parse(fs.readFileSync(path.join(ROOT,'governance','second-shift','SECOND-SHIFT-MASTERY-CURRENT-AUTHORITY-CONTRACT-002.json'),'utf8')),
 delegationSchema:JSON.parse(fs.readFileSync(path.join(ROOT,'governance','second-shift','SECOND-SHIFT-DELEGATION-SCHEMA-003.json'),'utf8'))
};}
function expectMasteryReject(mutator,label){const fixture=currentMasteryFixture();mutator(fixture);assert.throws(()=>validateMasteryContract(fixture),/SECOND_SHIFT_EXECUTION_CONTROL_DRIFT/,label);}
test('current nine-lane Mastery contract passes exact authority validation',()=>{const report=validateMasteryContract(currentMasteryFixture());assert.strictEqual(report.contract_id,'SECOND-SHIFT-MASTERY-CURRENT-AUTHORITY-CONTRACT-002');assert.strictEqual(report.peer_count,9);assert.strictEqual(report.mutation_wip_per_lane,1);assert.strictEqual(report.evaluation_state,'VALIDATING');});
test('global-primary exclusivity cannot be reactivated',()=>expectMasteryReject(f=>{f.mastery.concurrency_contract.global_primary_system_exclusivity=true;},'global-primary exclusivity'));
test('Mastery lane coverage must remain exact current topology',()=>expectMasteryReject(f=>{f.mastery.execution_ready_peer_system_ids=f.mastery.execution_ready_peer_system_ids.slice(0,-1);},'lane coverage drift'));
test('worker self-approval cannot be enabled',()=>expectMasteryReject(f=>{f.mastery.evaluation_contract.worker_self_approval_forbidden=false;},'self approval'));
test('VALIDATING remains the independent-evaluation barrier',()=>expectMasteryReject(f=>{f.mastery.evaluation_contract.runtime_state='RUNNING';},'runtime state drift'));
test('historical global-primary schemas remain provenance-only',()=>expectMasteryReject(f=>{f.mastery.historical_mastery_dispositions[0].disposition='ACTIVE';},'historical mastery activation'));
test('registry must point at delegation schema 003',()=>expectMasteryReject(f=>{f.registry.schema='governance/second-shift/SECOND-SHIFT-DELEGATION-SCHEMA-002.json';},'schema pointer drift'));
test('same-lane successor is blocked while independent evaluation is pending',()=>expectMasteryReject(f=>{f.delegationSchema.independent_evaluation_runtime_rule.same_lane_successor_while_validating=true;},'validating successor barrier'));

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}
console.log(JSON.stringify({ suite: 'SECOND_SHIFT_EXECUTION_CONTROL_CONTRACT_STRESS', cases: cases.length, passed: cases.length - failed, failed }, null, 2));
if (failed) process.exit(1);
