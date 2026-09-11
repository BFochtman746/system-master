'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const argSet = new Set(args);
const noLive = argSet.has('--no-live');
const selftest = argSet.has('--selftest');
const outArg = args.find((v) => v.startsWith('--out='));
const outDir = path.resolve(root, outArg ? outArg.slice('--out='.length) : '.state-reconciler');
const coverageScript = path.join(root, '.github/scripts/second-shift-owner-coverage.js');

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`required file missing: ${rel}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function exists(rel) { return Boolean(rel) && fs.existsSync(path.join(root, rel)); }
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '')); }
function now() { return new Date().toISOString(); }
function liveHead(ref) {
  if (noLive) return null;
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return out ? out.split(/\s+/)[0] : null;
  } catch (_) { return null; }
}
function runNode(script, childArgs) {
  return spawnSync(process.execPath, [script, ...childArgs], { cwd: root, encoding: 'utf8' });
}
function systemOwnerPath(system) {
  return system?.owner_path || (system?.system_id ? `SYSTEM_MASTER/${system.system_id}` : null);
}
function isSameOrDescendant(candidate, ownerPath) {
  return candidate === ownerPath || String(candidate || '').startsWith(`${ownerPath}/`);
}

if (selftest) {
  const authority = readJson('governance/CURRENT-AUTHORITY.json');
  const topology = readJson(authority.topology);
  const systems = topology.canonical_internal_systems || [];
  const byId = Object.fromEntries(systems.map((s) => [s.system_id, s]));
  const registry = readJson(authority.second_shift_registry);
  const checks = [
    ['product_root', authority.product_root === 'SYSTEM_MASTER'],
    ['documents_is_active_peer', Boolean(byId.DOCUMENTS)],
    ['prose_is_active_child', Boolean(byId.PROSE) && byId.PROSE.parent_id === 'BOOK'],
    ['prose_owner_path_is_book_child', systemOwnerPath(byId.PROSE) === 'SYSTEM_MASTER/BOOK/PROSE'],
    ['prose_has_no_separate_second_shift_lane', !registry.owner_files?.PROSE && registry.coverage_routes?.['SYSTEM_MASTER/BOOK/PROSE'] === 'BOOK'],
    ['current_obligation_registry_selected', exists(authority.obligation_registry)],
    ['current_second_shift_registry_selected', exists(authority.second_shift_registry)],
    ['owner_coverage_guard_present', fs.existsSync(coverageScript)]
  ];
  let failed = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`); if (!ok) failed += 1; }
  const coverage = runNode(coverageScript, ['--selftest']);
  if (coverage.stdout) process.stdout.write(coverage.stdout);
  if (coverage.stderr) process.stderr.write(coverage.stderr);
  if (coverage.status !== 0 || failed) process.exit(1);
  console.log('SYSTEM_STATE_RECONCILER_SELFTEST_PASS');
  process.exit(0);
}

const findings = [];
const finding = (severity, type, message, detail = {}) => findings.push({ severity, type, message, ...detail });
const authority = readJson('governance/CURRENT-AUTHORITY.json');
const selected = {
  topology: authority.topology,
  completion_ledger: authority.completion_ledger,
  obligation_registry: authority.obligation_registry,
  expectation_registry: authority.expectation_registry,
  reallocation_ledger: authority.reallocation_ledger,
  second_shift_registry: authority.second_shift_registry,
  repair_inbox_registry: authority.repair_inbox_registry
};
for (const [key, rel] of Object.entries(selected)) if (!exists(rel)) finding('ERROR', 'CURRENT_AUTHORITY_REFERENCE_MISSING', `CURRENT-AUTHORITY selected ${key} is missing`, { path: rel || null });

const topology = exists(selected.topology) ? readJson(selected.topology) : {};
const completion = exists(selected.completion_ledger) ? readJson(selected.completion_ledger) : {};
const obligationsDoc = exists(selected.obligation_registry) ? readJson(selected.obligation_registry) : {};
const secondShift = exists(selected.second_shift_registry) ? readJson(selected.second_shift_registry) : {};
const repairRegistry = exists(selected.repair_inbox_registry) ? readJson(selected.repair_inbox_registry) : {};
const obligations = obligationsDoc.obligations || [];
const completionEntries = completion.entries || [];
const terminal = new Set(['CLOSED', 'SUPERSEDED']);

if (topology.product_root?.product_id !== 'SYSTEM_MASTER') finding('ERROR', 'TOPOLOGY_ROOT_MISMATCH', 'topology product root must be SYSTEM_MASTER');
const systems = topology.canonical_internal_systems || [];
const activeIds = new Set(systems.map((s) => s.system_id));
for (const required of ['CORE', 'LEARNING', 'BOOK', 'PROSE', 'DOCUMENTS']) if (!activeIds.has(required)) finding('ERROR', 'CANONICAL_SYSTEM_MISSING', `canonical active system missing: ${required}`);
const prose = systems.find((s) => s.system_id === 'PROSE');
if (prose && prose.parent_id !== 'BOOK') finding('ERROR', 'PROSE_PARENT_MISMATCH', 'PROSE must be an active child of BOOK', { parent_id: prose.parent_id || null });
if (prose && systemOwnerPath(prose) !== 'SYSTEM_MASTER/BOOK/PROSE') finding('ERROR', 'PROSE_OWNER_PATH_MISMATCH', 'PROSE owner path must be SYSTEM_MASTER/BOOK/PROSE', { owner_path: systemOwnerPath(prose) });

const retiredSystems = topology.retired_systems || [];
if (retiredSystems.some((s) => s.system_id === 'PROSE' && s.status && !String(s.status).includes('HISTORICAL'))) {
  finding('ERROR', 'PROSE_CURRENT_RETIREMENT_CONFLICT', 'topology simultaneously marks active PROSE as currently retired');
}

const validOwnerPaths = new Set(['SYSTEM_MASTER', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01']);
for (const s of systems) {
  const p = systemOwnerPath(s);
  if (p) validOwnerPaths.add(p);
}
for (const o of obligations) {
  if (!o?.obligation_id || !o?.owner_path || !o?.state) { finding('ERROR', 'OBLIGATION_SHAPE_INVALID', 'current obligation lacks obligation_id/owner_path/state', { obligation_id: o?.obligation_id || null }); continue; }
  if (!terminal.has(o.state) && !o.objective) finding('ERROR', 'OBLIGATION_OBJECTIVE_MISSING', `open obligation lacks objective: ${o.obligation_id}`);
  const directValid = [...validOwnerPaths].some((p) => isSameOrDescendant(o.owner_path, p));
  if (!directValid) finding('ERROR', 'UNALLOCATED', `current obligation has invalid owner path: ${o.obligation_id}`, { owner_path: o.owner_path });
}

const ownerFiles = secondShift.owner_files || {};
if (ownerFiles.PROSE) finding('ERROR', 'DUPLICATE_PROSE_EXECUTION_LANE', 'PROSE is a BOOK child and must not have a separate Second Shift owner lane');
if (secondShift.coverage_routes?.['SYSTEM_MASTER/BOOK/PROSE'] !== 'BOOK') finding('ERROR', 'PROSE_BOOK_LANE_ROUTE_MISSING', 'active Prose child path must route through BOOK Second Shift lane');
if (ownerFiles.SYSTEM_MASTER) finding('ERROR', 'ROOT_WORKER_LANE_ACTIVE', 'SYSTEM_MASTER product-root controller must not be an active peer worker lane');
for (const required of ['CORE', 'LEARNING', 'BOOK', 'DOCUMENTS']) if (!ownerFiles[required]) finding('ERROR', 'SECOND_SHIFT_OWNER_FILE_MISSING', `Second Shift registry missing active lane ${required}`);

const owners = {};
for (const [lane, rel] of Object.entries(ownerFiles)) {
  if (!exists(rel)) { finding('ERROR', 'SECOND_SHIFT_OWNER_FILE_MISSING', `owner file missing for ${lane}`, { path: rel }); continue; }
  const data = readJson(rel);
  const system = systems.find((s) => s.system_id === lane);
  if (!system) finding('ERROR', 'SECOND_SHIFT_UNKNOWN_ACTIVE_SYSTEM', `Second Shift lane ${lane} is not an active canonical peer/owner system`);
  const expectedPath = systemOwnerPath(system);
  if (system && data.owner_path !== expectedPath) finding('ERROR', 'SECOND_SHIFT_OWNER_PATH_MISMATCH', `${lane} owner_path mismatch`, { owner_path: data.owner_path, expected: expectedPath });
  if (system && data.control_ref !== system.control_ref) finding('ERROR', 'SECOND_SHIFT_CONTROL_REF_MISMATCH', `${lane} delegation control_ref differs from topology`, { delegation_control_ref: data.control_ref, topology_control_ref: system.control_ref });
  const live = noLive ? data.last_known_control_head : liveHead(data.control_ref);
  if (!isSha(data.last_known_control_head)) finding('ERROR', 'OWNER_CONTROL_HEAD_INVALID', `${lane} last_known_control_head is invalid`);
  if (live && live !== data.last_known_control_head) finding('ERROR', 'STALE_DELEGATION', `${lane} owner selector is stale`, { recorded_head: data.last_known_control_head, live_head: live });
  owners[lane] = {
    owner_path: data.owner_path,
    control_ref: data.control_ref,
    live_control_head: live,
    recorded_control_head: data.last_known_control_head,
    completion_count: completionEntries.filter((e) => e.owner_path === data.owner_path).length,
    open_obligations: obligations.filter((o) => isSameOrDescendant(o.owner_path, data.owner_path) && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective, owner_path: o.owner_path })),
    active_delegations: (data.active_delegations || []).map((d) => ({ delegation_id: d.delegation_id, objective_id: d.objective_id, obligation_id: d.obligation_id || null, state: d.state, valid_for_control_head: d.valid_for_control_head }))
  };
}

const central = authority.central_next_objective;
if (!central) finding('ERROR', 'CENTRAL_NEXT_OBJECTIVE_MISSING', 'CURRENT-AUTHORITY central_next_objective is unset');
else {
  const current = obligations.find((o) => o.obligation_id === central);
  if (!current) finding('ERROR', 'CENTRAL_NEXT_OBJECTIVE_MISSING', 'central_next_objective absent from current obligation registry', { objective_id: central });
  else if (terminal.has(current.state)) finding('ERROR', 'CENTRAL_NEXT_OBJECTIVE_TERMINAL', 'central_next_objective is terminal', { objective_id: central, state: current.state });
}

const coverage = runNode(coverageScript, noLive ? ['--no-live'] : ['--watchdog']);
if (coverage.stdout) process.stdout.write(coverage.stdout);
if (coverage.stderr) process.stderr.write(coverage.stderr);
if (coverage.status !== 0) finding('ERROR', 'SECOND_SHIFT_OWNER_COVERAGE_FAILED', 'registry-driven Second Shift owner coverage failed', { exit_status: coverage.status });

const repairInboxes = {};
for (const [lane, rel] of Object.entries(repairRegistry.owner_files || {})) {
  if (!exists(rel)) continue;
  const inbox = readJson(rel);
  if (lane === 'PROSE' && (inbox.active_transactions || []).length) finding('ERROR', 'LEGACY_PROSE_REPAIR_LANE_ACTIVE', 'standalone Prose repair inbox contains active transactions; active Prose child repair work must be reconciled to BOOK');
  repairInboxes[lane] = inbox.active_transactions || [];
}

const derived = {
  generated_at: now(),
  product_root: 'SYSTEM_MASTER',
  topology_id: topology.topology_id || null,
  central_next_objective: central || null,
  active_systems: systems.map((s) => ({ system_id: s.system_id, parent_id: s.parent_id || null, owner_path: systemOwnerPath(s) })),
  historical_retired_systems: retiredSystems.map((s) => ({ system_id: s.system_id, successor_system_id: s.successor_system_id || null, retirement_record: s.retirement_record || null })),
  owners,
  product_governance: { open_obligations: obligations.filter((o) => o.owner_path === 'SYSTEM_MASTER' && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective })) },
  shared_infrastructure: { open_obligations: obligations.filter((o) => o.owner_path?.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE') && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective })) },
  second_shift_active_lanes: Object.keys(ownerFiles),
  prose_execution_lane: secondShift.coverage_routes?.['SYSTEM_MASTER/BOOK/PROSE'] || null,
  second_shift_owner_coverage: coverage.status === 0 ? 'PASS' : 'DRIFT_DETECTED'
};

const errors = findings.filter((f) => f.severity === 'ERROR');
const warnings = findings.filter((f) => f.severity === 'WARN');
const report = { generated_at: now(), standing: errors.length ? 'DRIFT_DETECTED' : 'PASS', error_count: errors.length, warning_count: warnings.length, findings };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'DERIVED-CURRENT-STATE.json'), JSON.stringify(derived, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'SYSTEM-STATE-DRIFT-REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`SYSTEM_STATE_RECONCILER_${report.standing}`);
console.log(`active_systems=${derived.active_systems.map((s) => s.system_id).join(',')}`);
console.log(`second_shift_lanes=${derived.second_shift_active_lanes.join(',')}`);
for (const f of findings) console.log(`${f.severity}:${f.type}:${f.message}`);
process.exit(errors.length ? 1 : 0);
