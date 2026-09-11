'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const TEST_NOW = '2026-09-11T04:00:00-04:00';
const SHIFT_DATE = '2026-09-11';
const scriptRel = '.github/scripts/second-shift-enforce.js';
const coverageRel = '.github/scripts/second-shift-owner-coverage.js';
const registryRel = 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json';
const schemaRel = 'governance/second-shift/SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json';
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryRel), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, schemaRel), 'utf8'));
const lanes = Object.keys(registry.owner_files);
const report = { generated_at: new Date().toISOString(), production_script: scriptRel, test_now: TEST_NOW, named_cases: [], owner_coverage_cases: [], fuzz: {}, blindspots: [] };

function jread(root, rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function jwrite(root, rel, obj) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function cloneGovernance(dest) { fs.cpSync(path.join(repoRoot, 'governance'), path.join(dest, 'governance'), { recursive: true }); }
function patchedScript(sourceRel, dest, withTime) {
  let text = fs.readFileSync(path.join(repoRoot, sourceRel), 'utf8');
  const rootNeedle = "const root = path.resolve(__dirname, '..', '..');";
  if (!text.includes(rootNeedle)) throw new Error(`stress patch root anchor missing in ${sourceRel}`);
  text = text.replace(rootNeedle, `const root = ${JSON.stringify(dest)};`);
  if (withTime) {
    const timeNeedle = 'const now = new Date();';
    if (!text.includes(timeNeedle)) throw new Error(`stress patch time anchor missing in ${sourceRel}`);
    text = text.replace(timeNeedle, `const now = new Date(${JSON.stringify(TEST_NOW)});`);
  }
  const out = path.join(dest, sourceRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  return out;
}
function cleanDelegation(lane, owner, state = 'READY') {
  return {
    delegation_id: `STRESS-${lane}-001`, owner_path: owner.owner_path, objective_id: `STRESS-${lane}-OBJECTIVE-001`, state,
    valid_for_control_ref: owner.control_ref, valid_for_control_head: owner.last_known_control_head,
    created_at: '2026-09-11T03:54:00-04:00', last_revalidated_at: '2026-09-11T03:55:00-04:00',
    completion_delta: 'stress fixture', stop_condition: 'stress fixture terminal', allowed_work: ['stress fixture'], forbidden_authority: ['no production authority'],
    on_pass: 'stress fixture', on_failure: 'stress fixture'
  };
}
function event(lane, owner, d, type, at, extra = {}) {
  return {
    event_id: `${lane}-${type}-${String(Math.random()).slice(2)}`, occurred_at: at, event_type: type, lane,
    control_ref: owner.control_ref, control_head: owner.last_known_control_head,
    delegation_id: d.delegation_id, objective_id: d.objective_id, evidence: 'stress-fixture', ...extra
  };
}
function makeFixture() {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'second-shift-stress-'));
  cloneGovernance(dest);
  patchedScript(scriptRel, dest, true);
  patchedScript(coverageRel, dest, false);
  fs.mkdirSync(path.join(dest, '.stress'), { recursive: true });
  const reg = jread(dest, registryRel);
  for (const lane of lanes) {
    const rel = reg.owner_files[lane];
    const original = jread(dest, rel);
    const owner = {
      owner_system_id: lane, owner_path: original.owner_path, control_ref: original.control_ref,
      last_known_control_head: original.last_known_control_head,
      active_delegations: [], retired_delegations: [], owner_revalidation_required: false, empty_is_valid: false
    };
    const d = cleanDelegation(lane, owner);
    owner.active_delegations = [d];
    jwrite(dest, rel, owner);
    const ledger = {
      schema_id: schema.schema_id, shift_id: `STRESS-${SHIFT_DATE}-${lane}`, shift_date: SHIFT_DATE, lane,
      events: [
        event(lane, owner, d, 'SHIFT_OPEN', '2026-09-11T03:54:00-04:00'),
        event(lane, owner, d, 'READY', '2026-09-11T03:55:00-04:00')
      ]
    };
    jwrite(dest, `governance/second-shift/execution-events/${SHIFT_DATE}/${lane}.json`, ledger);
  }
  return dest;
}
function runEnforce(root) {
  const script = path.join(root, scriptRel);
  const result = cp.spawnSync(process.execPath, [script, '--watchdog', '--no-live', '--out=.stress/report.json'], { cwd: root, encoding: 'utf8' });
  const p = path.join(root, '.stress/report.json');
  const parsed = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  const findings = parsed?.findings || parsed?.problems || [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed, findings, types: new Set(findings.map((f) => f.type)) };
}
function runCoverage(root) {
  const script = path.join(root, coverageRel);
  const result = cp.spawnSync(process.execPath, [script, '--no-live'], { cwd: root, encoding: 'utf8' });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch (_) {}
  const findings = parsed?.findings || [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed, findings, types: new Set(findings.map((f) => f.type)) };
}
function withLane(root, lane = 'CORE') {
  const reg = jread(root, registryRel); const rel = reg.owner_files[lane]; const owner = jread(root, rel);
  const ledgerRel = `governance/second-shift/execution-events/${SHIFT_DATE}/${lane}.json`; const ledger = jread(root, ledgerRel);
  return { reg, rel, owner, d: owner.active_delegations[0], ledgerRel, ledger };
}
function claimFields(lane, owner, d, overrides = {}) {
  return {
    lease_id: `LEASE-${lane}-001`, lane, delegation_id: d.delegation_id, objective_id: d.objective_id,
    control_ref: owner.control_ref, control_head_at_claim: owner.last_known_control_head,
    idempotency_key: `IDEMP-${lane}-001`, claimed_at: '2026-09-11T03:40:00-04:00', lease_expires_at: '2026-09-11T04:30:00-04:00',
    last_heartbeat_at: '2026-09-11T03:50:00-04:00', attempt: 1, checkpoint_pointer: 'stress://checkpoint', ...overrides
  };
}
function ledgerClaim(lane, owner, d, at = '2026-09-11T03:40:00-04:00', extra = {}) {
  return event(lane, owner, d, 'CLAIMED', at, {
    lease_id: `LEASE-${lane}-001`, idempotency_key: `IDEMP-${lane}-001`, lease_expires_at: '2026-09-11T04:30:00-04:00', attempt: 1, ...extra
  });
}
function named(name, expectedType, mutate, options = {}) {
  const root = makeFixture();
  try {
    mutate(root);
    const r = runEnforce(root);
    const detected = expectedType === null ? r.findings.filter((x) => x.severity === 'ERROR').length === 0 : r.types.has(expectedType);
    const row = { name, expected: expectedType || 'NO_ERROR', detected, exit_status: r.status, finding_types: [...r.types].sort() };
    report.named_cases.push(row);
    if (!detected) report.blindspots.push({ category: 'named', name, expected: expectedType || 'NO_ERROR', observed: row.finding_types });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function coverageCase(name, expectedType, mutate) {
  const root = makeFixture();
  try {
    mutate(root);
    const r = runCoverage(root);
    const detected = r.types.has(expectedType);
    const row = { name, expected: expectedType, detected, exit_status: r.status, finding_types: [...r.types].sort() };
    report.owner_coverage_cases.push(row);
    if (!detected) report.blindspots.push({ category: 'owner_coverage', name, expected: expectedType, observed: row.finding_types });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

named('clean baseline', null, () => {});
named('READY exceeds dispatch SLA', 'READY_UNDISPATCHED', (root) => { const x = withLane(root); x.d.last_revalidated_at = '2026-09-11T02:40:00-04:00'; jwrite(root, x.rel, x.owner); });
named('missing utilization ledger', 'UTILIZATION_LEDGER_MISSING', (root) => { const x = withLane(root); fs.unlinkSync(path.join(root, x.ledgerRel)); });
named('duplicate active delegation id', 'DELEGATION_ID_INVALID', (root) => { const x = withLane(root); x.owner.active_delegations.push(JSON.parse(JSON.stringify(x.d))); jwrite(root, x.rel, x.owner); });
named('invalid active delegation state', 'DELEGATION_STATE_INVALID', (root) => { const x = withLane(root); x.d.state = 'RUNNING'; jwrite(root, x.rel, x.owner); });
named('missing required delegation field', 'DELEGATION_CONTRACT_DRIFT', (root) => { const x = withLane(root); delete x.d.stop_condition; jwrite(root, x.rel, x.owner); });
named('delegation owner mismatch', 'DELEGATION_OWNER_MISMATCH', (root) => { const x = withLane(root); x.d.owner_path = 'SYSTEM_MASTER/LEARNING'; jwrite(root, x.rel, x.owner); });
named('delegation control ref mismatch', 'CONTROL_REF_MISMATCH', (root) => { const x = withLane(root); x.d.valid_for_control_ref = 'wrong/ref'; jwrite(root, x.rel, x.owner); });
named('invalid delegation control head', 'CONTROL_HEAD_INVALID', (root) => { const x = withLane(root); x.d.valid_for_control_head = 'not-a-sha'; jwrite(root, x.rel, x.owner); });
named('invalid owner control head', 'OWNER_FILE_HEAD_INVALID', (root) => { const x = withLane(root); x.owner.last_known_control_head = 'bad'; jwrite(root, x.rel, x.owner); });
named('false empty declaration', 'FALSE_EMPTY', (root) => { const x = withLane(root); x.owner.active_delegations = []; x.owner.empty_is_valid = true; jwrite(root, x.rel, x.owner); });
named('empty lane without exhaustion', 'SECOND_SHIFT_SCOPE_VIOLATION', (root) => { const x = withLane(root); x.owner.active_delegations = []; jwrite(root, x.rel, x.owner); });
named('overlapping owner claims', 'OVERLAPPING_MUTATION_CLAIMS', (root) => { const x = withLane(root); x.d.state = 'CLAIMED'; x.d.claim = claimFields('CORE', x.owner, x.d); const d2 = cleanDelegation('CORE', x.owner, 'CLAIMED'); d2.delegation_id = 'STRESS-CORE-002'; d2.objective_id = 'STRESS-CORE-OBJECTIVE-002'; d2.claim = claimFields('CORE', x.owner, d2, { lease_id: 'LEASE-CORE-002', idempotency_key: 'IDEMP-CORE-002' }); x.owner.active_delegations.push(d2); jwrite(root, x.rel, x.owner); });
named('invalid lease chronology', 'CLAIM_INVALID', (root) => { const x = withLane(root); x.d.state = 'CLAIMED'; x.d.claim = claimFields('CORE', x.owner, x.d, { lease_expires_at: '2026-09-11T03:39:00-04:00' }); jwrite(root, x.rel, x.owner); });
named('expired active claim', 'STALE_CLAIM', (root) => { const x = withLane(root); x.d.state = 'CLAIMED'; x.d.claim = claimFields('CORE', x.owner, x.d, { lease_expires_at: '2026-09-11T03:59:00-04:00' }); jwrite(root, x.rel, x.owner); });
named('stale active heartbeat', 'STALE_CLAIM', (root) => { const x = withLane(root); x.d.state = 'CLAIMED'; x.d.claim = claimFields('CORE', x.owner, x.d, { claimed_at: '2026-09-11T02:50:00-04:00', lease_expires_at: '2026-09-11T04:30:00-04:00', last_heartbeat_at: '2026-09-11T03:00:00-04:00' }); jwrite(root, x.rel, x.owner); });
named('duplicate utilization event id', 'UTILIZATION_EVENT_DUPLICATE', (root) => { const x = withLane(root); x.ledger.events[1].event_id = x.ledger.events[0].event_id; jwrite(root, x.ledgerRel, x.ledger); });
named('out-of-order utilization timestamp', 'UTILIZATION_EVENT_ORDER_INVALID', (root) => { const x = withLane(root); x.ledger.events[1].occurred_at = '2026-09-11T03:53:00-04:00'; jwrite(root, x.ledgerRel, x.ledger); });
named('invalid utilization event type', 'UTILIZATION_EVENT_TYPE_INVALID', (root) => { const x = withLane(root); x.ledger.events[1].event_type = 'MAGIC'; jwrite(root, x.ledgerRel, x.ledger); });
named('utilization lane mismatch', 'UTILIZATION_EVENT_LANE_MISMATCH', (root) => { const x = withLane(root); x.ledger.events[1].lane = 'LEARNING'; jwrite(root, x.ledgerRel, x.ledger); });
named('utilization control ref mismatch', 'UTILIZATION_CONTROL_REF_MISMATCH', (root) => { const x = withLane(root); x.ledger.events[1].control_ref = 'wrong/ref'; jwrite(root, x.ledgerRel, x.ledger); });
named('invalid utilization control head', 'UTILIZATION_CONTROL_HEAD_INVALID', (root) => { const x = withLane(root); x.ledger.events[1].control_head = 'bad'; jwrite(root, x.ledgerRel, x.ledger); });
named('RUNNING without claim', 'RUNNING_WITHOUT_CLAIM', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'RUNNING', '2026-09-11T03:56:00-04:00', { idempotency_key: 'IDEMP-CORE-001' })); jwrite(root, x.ledgerRel, x.ledger); });
named('PROGRESS without claim', 'PROGRESS_WITHOUT_CLAIM', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'PROGRESS', '2026-09-11T03:56:00-04:00', { idempotency_key: 'IDEMP-CORE-001' })); jwrite(root, x.ledgerRel, x.ledger); });
named('HEARTBEAT without claim', 'HEARTBEAT_WITHOUT_CLAIM', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'HEARTBEAT', '2026-09-11T03:56:00-04:00', { lease_id: 'L', idempotency_key: 'I', checkpoint_pointer: 'stress://cp' })); jwrite(root, x.ledgerRel, x.ledger); });
named('overlapping ledger claims', 'OVERLAPPING_MUTATION_CLAIMS', (root) => { const x = withLane(root); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d)); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d, '2026-09-11T03:41:00-04:00', { lease_id: 'LEASE-CORE-002' })); jwrite(root, x.ledgerRel, x.ledger); });
named('unclosed ledger mutation claim', 'UNCLOSED_MUTATION_CLAIM', (root) => { const x = withLane(root); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d)); jwrite(root, x.ledgerRel, x.ledger); });
named('invalid all-rungs exhaustion proof', 'ALL_RUNGS_EXHAUSTED_INVALID', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'ALL_RUNGS_EXHAUSTED', '2026-09-11T03:56:00-04:00', { rungs: [], independent_work_remaining: false, next_external_condition: 'x' })); jwrite(root, x.ledgerRel, x.ledger); });
named('IDLE without exhaustion proof', 'IDLE_WITHOUT_EXHAUSTION', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'IDLE_VALID', '2026-09-11T03:56:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });

// Contract-level tests below intentionally look for protections required by the schema/state machine.
// A missing finding is a real validator blind spot, not a harness failure.
named('RETRY budget above configured maximum', 'RETRY_BUDGET_INVALID', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'RETRY', '2026-09-11T03:56:00-04:00', { dependency_or_operation: 'dep', failure_class: 'TRANSIENT', attempt: 4, retry_budget: 4, next_action: 'fallback' })); jwrite(root, x.ledgerRel, x.ledger); });
named('RETRY attempt exceeds declared budget', 'RETRY_ATTEMPT_EXCEEDS_BUDGET', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'RETRY', '2026-09-11T03:56:00-04:00', { dependency_or_operation: 'dep', failure_class: 'TRANSIENT', attempt: 3, retry_budget: 2, next_action: 'fallback' })); jwrite(root, x.ledgerRel, x.ledger); });
named('terminal event without live claim', 'TERMINAL_WITHOUT_CLAIM', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'COMPLETED', '2026-09-11T03:56:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });
named('RUNNING idempotency key differs from claim', 'IDEMPOTENCY_KEY_MISMATCH', (root) => { const x = withLane(root); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d)); x.ledger.events.push(event('CORE', x.owner, x.d, 'RUNNING', '2026-09-11T03:41:00-04:00', { idempotency_key: 'DIFFERENT' })); x.ledger.events.push(event('CORE', x.owner, x.d, 'COMPLETED', '2026-09-11T03:42:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });
named('RUNNING occurs after lease expiry', 'EXECUTION_AFTER_LEASE_EXPIRY', (root) => { const x = withLane(root); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d, '2026-09-11T03:40:00-04:00', { lease_expires_at: '2026-09-11T03:41:00-04:00' })); x.ledger.events.push(event('CORE', x.owner, x.d, 'RUNNING', '2026-09-11T03:42:00-04:00', { idempotency_key: 'IDEMP-CORE-001' })); x.ledger.events.push(event('CORE', x.owner, x.d, 'COMPLETED', '2026-09-11T03:43:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });
named('future heartbeat accepted as healthy', 'FUTURE_HEARTBEAT', (root) => { const x = withLane(root); x.d.state = 'CLAIMED'; x.d.claim = claimFields('CORE', x.owner, x.d, { last_heartbeat_at: '2026-09-11T04:20:00-04:00' }); jwrite(root, x.rel, x.owner); });
named('future READY revalidation accepted as fresh', 'FUTURE_REVALIDATION', (root) => { const x = withLane(root); x.d.last_revalidated_at = '2026-09-11T04:20:00-04:00'; jwrite(root, x.rel, x.owner); });
named('SUCCESSOR_BOUND without preceding terminal', 'SUCCESSOR_SEQUENCE_INVALID', (root) => { const x = withLane(root); x.ledger.events.push(event('CORE', x.owner, x.d, 'SUCCESSOR_BOUND', '2026-09-11T03:56:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });
named('COMPLETED without successor before later READY', 'SUCCESSOR_MISSING_AFTER_TERMINAL', (root) => { const x = withLane(root); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d, '2026-09-11T03:56:00-04:00')); x.ledger.events.push(event('CORE', x.owner, x.d, 'RUNNING', '2026-09-11T03:57:00-04:00', { idempotency_key: 'IDEMP-CORE-001' })); x.ledger.events.push(event('CORE', x.owner, x.d, 'COMPLETED', '2026-09-11T03:58:00-04:00')); x.ledger.events.push(event('CORE', x.owner, x.d, 'READY', '2026-09-11T03:59:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });
named('SHIFT_CLOSE while mutation claim remains open', 'SHIFT_CLOSE_WITH_OPEN_CLAIM', (root) => { const x = withLane(root); x.ledger.events.push(ledgerClaim('CORE', x.owner, x.d, '2026-09-11T03:56:00-04:00')); x.ledger.events.push(event('CORE', x.owner, x.d, 'SHIFT_CLOSE', '2026-09-11T03:57:00-04:00')); jwrite(root, x.ledgerRel, x.ledger); });

coverageCase('topology peer missing from owner_files', 'SECOND_SHIFT_PEER_COVERAGE_MISSING', (root) => { const r = jread(root, registryRel); delete r.owner_files.DOCUMENTS; jwrite(root, registryRel, r); });
coverageCase('retired PROSE provisioned as active lane', 'RETIRED_SYSTEM_PROVISIONED', (root) => { const r = jread(root, registryRel); r.owner_files.PROSE = r.owner_files.BOOK; jwrite(root, registryRel, r); });
coverageCase('registry lane absent from telemetry schema', 'SECOND_SHIFT_TELEMETRY_LANE_MISSING', (root) => { const s = jread(root, schemaRel); s.allowed_lanes = s.allowed_lanes.filter((x) => x !== 'DOCUMENTS'); jwrite(root, schemaRel, s); });
coverageCase('telemetry schema contains orphan lane', 'SECOND_SHIFT_TELEMETRY_LANE_ORPHANED', (root) => { const s = jread(root, schemaRel); s.allowed_lanes.push('GHOST'); jwrite(root, schemaRel, s); });
coverageCase('declared owner file missing', 'MISSING_OWNER_FILE', (root) => { const r = jread(root, registryRel); fs.unlinkSync(path.join(root, r.owner_files.CORE)); });

// Independent randomized state-machine oracle. We run the actual production validator on each generated ledger.
let seed = 0x5eed1234;
function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
const types = ['READY','CLAIMED','RUNNING','HEARTBEAT','PROGRESS','COMPLETED','BLOCKED','STALE','RETRY','SUCCESSOR_BOUND','SHIFT_CLOSE'];
function oracleInvalid(events) {
  let lease = null; let terminalPendingSuccessor = false;
  for (const e of events) {
    if (e.event_type === 'CLAIMED') {
      if (lease) return true;
      lease = { delegation_id: e.delegation_id, control_head: e.control_head, idempotency_key: e.idempotency_key, expires: Date.parse(e.lease_expires_at) };
    } else if (['RUNNING','PROGRESS'].includes(e.event_type)) {
      if (!lease || lease.delegation_id !== e.delegation_id || lease.control_head !== e.control_head || lease.idempotency_key !== e.idempotency_key || Date.parse(e.occurred_at) > lease.expires) return true;
    } else if (e.event_type === 'HEARTBEAT') {
      if (!lease || lease.idempotency_key !== e.idempotency_key || Date.parse(e.occurred_at) > lease.expires) return true;
    } else if (['COMPLETED','BLOCKED','STALE'].includes(e.event_type)) {
      if (!lease || lease.delegation_id !== e.delegation_id) return true;
      lease = null; terminalPendingSuccessor = true;
    } else if (e.event_type === 'SUCCESSOR_BOUND') {
      if (!terminalPendingSuccessor) return true;
      terminalPendingSuccessor = false;
    } else if (e.event_type === 'READY' && terminalPendingSuccessor) return true;
    else if (e.event_type === 'SHIFT_CLOSE' && lease) return true;
    else if (e.event_type === 'RETRY') {
      if (!Number.isInteger(e.retry_budget) || e.retry_budget < 1 || e.retry_budget > schema.operational_limits.max_retry_budget || !Number.isInteger(e.attempt) || e.attempt > e.retry_budget) return true;
    }
  }
  return Boolean(lease);
}
let fuzzInvalid = 0, fuzzFalseNegatives = 0, fuzzValid = 0, fuzzFalsePositives = 0;
const fuzzSamples = [];
for (let i = 0; i < 250; i++) {
  const root = makeFixture();
  try {
    const x = withLane(root);
    x.ledger.events = [event('CORE', x.owner, x.d, 'SHIFT_OPEN', '2026-09-11T03:30:00-04:00')];
    let minute = 31;
    const n = 1 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++, minute++) {
      const type = pick(types);
      const at = `2026-09-11T03:${String(minute).padStart(2,'0')}:00-04:00`;
      const extra = {};
      if (type === 'CLAIMED') Object.assign(extra, { lease_id: 'FZ-L', idempotency_key: rnd() < 0.2 ? 'FZ-X' : 'FZ-I', lease_expires_at: rnd() < 0.2 ? '2026-09-11T03:32:00-04:00' : '2026-09-11T04:20:00-04:00', attempt: 1 });
      if (['RUNNING','PROGRESS'].includes(type)) extra.idempotency_key = rnd() < 0.25 ? 'FZ-X' : 'FZ-I';
      if (type === 'HEARTBEAT') Object.assign(extra, { lease_id: 'FZ-L', idempotency_key: rnd() < 0.25 ? 'FZ-X' : 'FZ-I', checkpoint_pointer: 'stress://fuzz' });
      if (type === 'RETRY') Object.assign(extra, { dependency_or_operation: 'fuzz', failure_class: 'TRANSIENT', attempt: 1 + Math.floor(rnd()*5), retry_budget: 1 + Math.floor(rnd()*5), next_action: 'fallback' });
      x.ledger.events.push(event('CORE', x.owner, x.d, type, at, extra));
    }
    jwrite(root, x.ledgerRel, x.ledger);
    const invalid = oracleInvalid(x.ledger.events);
    const r = runEnforce(root);
    const validatorError = r.findings.some((f) => f.severity === 'ERROR' && f.lane === 'CORE');
    if (invalid) { fuzzInvalid++; if (!validatorError) { fuzzFalseNegatives++; if (fuzzSamples.length < 10) fuzzSamples.push({ kind: 'FALSE_NEGATIVE', events: x.ledger.events.map((e) => e.event_type), findings: [...r.types] }); } }
    else { fuzzValid++; if (validatorError) { fuzzFalsePositives++; if (fuzzSamples.length < 10) fuzzSamples.push({ kind: 'FALSE_POSITIVE', events: x.ledger.events.map((e) => e.event_type), findings: [...r.types] }); } }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
report.fuzz = { seed: '0x5eed1234', cases: 250, oracle_invalid: fuzzInvalid, oracle_valid: fuzzValid, false_negatives: fuzzFalseNegatives, false_positives: fuzzFalsePositives, samples: fuzzSamples };
if (fuzzFalseNegatives) report.blindspots.push({ category: 'fuzz', name: 'state-machine false negatives', count: fuzzFalseNegatives });
if (fuzzFalsePositives) report.blindspots.push({ category: 'fuzz', name: 'state-machine false positives', count: fuzzFalsePositives });

const out = path.join(repoRoot, '.second-shift-stress-report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ named_cases: report.named_cases.length, owner_coverage_cases: report.owner_coverage_cases.length, fuzz_cases: report.fuzz.cases, blindspots: report.blindspots.length, output: path.relative(repoRoot, out) }, null, 2));
if (report.blindspots.length) process.exit(2);
