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
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
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
function localFileBlob(rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) { return null; }
}
function resolveOwnerControl(owner) {
  const binding = owner?.control_binding || { type: 'BRANCH_HEAD', ref: owner?.control_ref };
  if (binding.type === 'FILE_BLOB') {
    const rel = binding.path || owner?.control_ref;
    return { type: 'FILE_BLOB', ref: rel, head: localFileBlob(rel) };
  }
  const ref = binding.ref || owner?.control_ref;
  return { type: 'BRANCH_HEAD', ref, head: noLive ? owner?.last_known_control_head : liveHead(ref) };
}
function runNode(script, childArgs) { return spawnSync(process.execPath, [script, ...childArgs], { cwd: root, encoding: 'utf8' }); }
function systemOwnerPath(system) { return system?.owner_path || (system?.system_id ? `SYSTEM_MASTER/${system.system_id}` : null); }
function isSameOrDescendant(candidate, ownerPath) { return candidate === ownerPath || String(candidate || '').startsWith(`${ownerPath}/`); }
function setEq(a, b) {
  const aa = [...a].sort(), bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}
function completionRows(doc) {
  if (Array.isArray(doc.system_completion_entries)) return doc.system_completion_entries;
  if (Array.isArray(doc.entries)) return doc.entries;
  return [];
}
function topologySets(topology) {
  const peers = new Set(topology.peer_system_ids || []);
  const executionReady = new Set(topology.execution_readiness?.execution_ready_peer_system_ids || topology.peer_system_ids || []);
  const admittedNotReady = new Set(topology.execution_readiness?.admitted_not_execution_ready_peer_system_ids || []);
  return { peers, executionReady, admittedNotReady };
}

if (selftest) {
  const authority = readJson('governance/CURRENT-AUTHORITY.json');
  const topology = readJson(authority.topology);
  const systems = topology.canonical_internal_systems || [];
  const canonicalIds = new Set(systems.map((s) => s.system_id));
  const { peers, executionReady, admittedNotReady } = topologySets(topology);
  const registry = readJson(authority.second_shift_registry);
  const retiredProse = (topology.retired_systems || []).find((s) => s.system_id === 'PROSE');
  const readinessPartitionValid = [...executionReady].every((id) => peers.has(id)) && [...admittedNotReady].every((id) => peers.has(id)) && [...executionReady].every((id) => !admittedNotReady.has(id)) && executionReady.size + admittedNotReady.size === peers.size;
  const checks = [
    ['product_root', authority.product_root === 'SYSTEM_MASTER'],
    ['selected_topology_exists', Boolean(authority.topology) && exists(authority.topology)],
    ['canonical_systems_match_peers', setEq(canonicalIds, peers)],
    ['execution_readiness_partitions_peers', readinessPartitionValid],
    ['authority_execution_lanes_match_readiness', setEq(new Set(authority.active_peer_execution_lanes || []), executionReady)],
    ['active_systems_exclude_prose', !systems.some((s) => s.system_id === 'PROSE')],
    ['prose_terminally_retired', Boolean(retiredProse) && retiredProse.lifecycle === 'RETIRED_TERMINAL' && retiredProse.final_completion === 'COMPLETE'],
    ['prose_has_no_execution_lane', Boolean(retiredProse) && retiredProse.current_execution_lane === null],
    ['prose_integration_owner_is_book', Boolean(retiredProse) && retiredProse.integration_owner === 'SYSTEM_MASTER/BOOK'],
    ['second_shift_matches_execution_ready_peers', setEq(new Set(Object.keys(registry.owner_files || {})), executionReady)],
    ['prose_has_no_second_shift_lane', !registry.owner_files?.PROSE && registry.retired_routes?.PROSE?.dispatchable === false],
    ['knowledge_recovery_selected', authority.highest_discretionary_objective === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001'],
    ['current_obligation_registry_selected', exists(authority.obligation_registry)],
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
  program_job_lock: authority.program_job_lock,
  system_completion_status: authority.system_completion_status,
  completion_ledger: authority.completion_ledger,
  obligation_registry: authority.obligation_registry,
  expectation_registry: authority.expectation_registry,
  reallocation_ledger: authority.reallocation_ledger,
  second_shift_registry: authority.second_shift_registry,
  repair_inbox_registry: authority.repair_inbox_registry
};
for (const [key, rel] of Object.entries(selected)) if (!exists(rel)) finding('ERROR', 'CURRENT_AUTHORITY_REFERENCE_MISSING', `CURRENT-AUTHORITY selected ${key} is missing`, { path: rel || null });

const topology = exists(selected.topology) ? readJson(selected.topology) : {};
const completionStatus = exists(selected.system_completion_status) ? readJson(selected.system_completion_status) : {};
const completion = exists(selected.completion_ledger) ? readJson(selected.completion_ledger) : {};
const obligationsDoc = exists(selected.obligation_registry) ? readJson(selected.obligation_registry) : {};
const secondShift = exists(selected.second_shift_registry) ? readJson(selected.second_shift_registry) : {};
const repairRegistry = exists(selected.repair_inbox_registry) ? readJson(selected.repair_inbox_registry) : {};
const obligations = obligationsDoc.obligations || [];
const completionEntries = completionRows(completion);
const terminal = new Set(['CLOSED', 'SUPERSEDED']);
const systems = topology.canonical_internal_systems || [];
const activeIds = new Set(systems.map((s) => s.system_id));
const { peers: expectedPeers, executionReady: executionReadyPeers, admittedNotReady: admittedNotReadyPeers } = topologySets(topology);

if (topology.product_root?.product_id !== 'SYSTEM_MASTER') finding('ERROR', 'TOPOLOGY_ROOT_MISMATCH', 'topology product root must be SYSTEM_MASTER');
if (!selected.topology || !exists(selected.topology)) finding('ERROR', 'TOPOLOGY_SELECTION_INVALID', 'current authority must select an accessible topology');
if (!setEq(activeIds, expectedPeers)) finding('ERROR', 'ACTIVE_SYSTEM_SET_MISMATCH', 'active canonical systems must match topology peer_system_ids', { active: [...activeIds], peers: [...expectedPeers] });
const readinessOverlap = [...executionReadyPeers].filter((id) => admittedNotReadyPeers.has(id));
const readinessUnknown = [...executionReadyPeers, ...admittedNotReadyPeers].filter((id) => !expectedPeers.has(id));
if (readinessOverlap.length || readinessUnknown.length || executionReadyPeers.size + admittedNotReadyPeers.size !== expectedPeers.size) finding('ERROR', 'EXECUTION_READINESS_PARTITION_INVALID', 'execution readiness sets must form a disjoint complete partition of topology peers', { execution_ready: [...executionReadyPeers], admitted_not_ready: [...admittedNotReadyPeers], overlap: readinessOverlap, unknown: readinessUnknown });
if (!setEq(new Set(authority.active_peer_execution_lanes || []), executionReadyPeers)) finding('ERROR', 'AUTHORITY_EXECUTION_LANE_MISMATCH', 'CURRENT-AUTHORITY active_peer_execution_lanes must match topology execution-ready peers', { authority_lanes: authority.active_peer_execution_lanes || [], execution_ready: [...executionReadyPeers] });
if ((topology.child_system_ids || []).length !== 0) finding('ERROR', 'ACTIVE_CHILD_SYSTEMS_PRESENT', 'terminal Prose retirement requires no active child execution systems', { child_system_ids: topology.child_system_ids || [] });

const retiredSystems = topology.retired_systems || [];
const retiredProse = retiredSystems.find((s) => s.system_id === 'PROSE');
if (!retiredProse || retiredProse.lifecycle !== 'RETIRED_TERMINAL' || retiredProse.final_completion !== 'COMPLETE') finding('ERROR', 'PROSE_RETIREMENT_MISSING', 'PROSE must be complete and terminally retired');
if (retiredProse) {
  for (const field of ['current_execution_lane', 'current_repair_lane', 'current_qualification_lane', 'current_telemetry_lane', 'successor_system']) {
    if (retiredProse[field] !== null) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', `PROSE ${field} must remain null`, { field, value: retiredProse[field] });
  }
  if (retiredProse.integration_owner !== 'SYSTEM_MASTER/BOOK') finding('ERROR', 'PROSE_INTEGRATION_OWNER_MISMATCH', 'any genuinely open completed-Prose integration must be BOOK-owned');
}

const activeCompletion = new Map((completionStatus.systems || []).map((s) => [s.system_id, s]));
for (const id of ['SYSTEM_MASTER', ...expectedPeers]) {
  if (!activeCompletion.has(id) || activeCompletion.get(id).complete !== false) finding('ERROR', 'FALSE_SYSTEM_COMPLETION', `${id} must remain an active incomplete system`);
}
if (activeCompletion.has('PROSE')) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', 'PROSE must not appear in active completion systems');
const retiredCompletion = (completionStatus.retired_systems || []).find((s) => s.system_id === 'PROSE');
if (!retiredCompletion || retiredCompletion.complete !== true || retiredCompletion.active !== false || retiredCompletion.remaining_product_work !== false) finding('ERROR', 'PROSE_COMPLETION_TRUTH_MISMATCH', 'completion status must record PROSE complete, inactive and with no remaining product work');

const retiredPaths = new Set(retiredSystems.map((s) => s.historical_owner_path).filter(Boolean));
const validOwnerPaths = new Set(['SYSTEM_MASTER', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01']);
for (const s of systems) {
  const p = systemOwnerPath(s);
  if (p) validOwnerPaths.add(p);
}
function ownerIsRetired(ownerPath) { return [...retiredPaths].some((p) => isSameOrDescendant(ownerPath, p)); }
for (const o of obligations) {
  if (!o?.obligation_id || !o?.owner_path || !o?.state) { finding('ERROR', 'OBLIGATION_SHAPE_INVALID', 'current obligation lacks obligation_id/owner_path/state', { obligation_id: o?.obligation_id || null }); continue; }
  if (!terminal.has(o.state) && !o.objective) finding('ERROR', 'OBLIGATION_OBJECTIVE_MISSING', `open obligation lacks objective: ${o.obligation_id}`);
  if (ownerIsRetired(o.owner_path)) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', `current obligation uses retired Prose owner path: ${o.obligation_id}`, { owner_path: o.owner_path });
  if (o.specialist_owner_path && ownerIsRetired(o.specialist_owner_path)) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', `current obligation uses retired Prose specialist owner: ${o.obligation_id}`, { specialist_owner_path: o.specialist_owner_path });
  const directValid = [...validOwnerPaths].some((p) => isSameOrDescendant(o.owner_path, p));
  if (!directValid) finding('ERROR', 'UNALLOCATED', `current obligation has invalid owner path: ${o.obligation_id}`, { owner_path: o.owner_path });
  if (o.owner_path === 'SYSTEM_MASTER/DOCUMENTS' && /PROSE/i.test(String(o.obligation_id || ''))) finding('ERROR', 'JOB_LANE_VIOLATION', `Documents obligation cannot be Prose work: ${o.obligation_id}`);
}

const bookIntegration = obligations.find((o) => o.obligation_id === 'BOOK-PROSE-PHASE-2-ORCHESTRATOR-CLOSURE-CENSUS-001');
if (bookIntegration && (bookIntegration.owner_path !== 'SYSTEM_MASTER/BOOK' || bookIntegration.active_prose_owner !== null)) finding('ERROR', 'PROSE_INTEGRATION_OWNER_MISMATCH', 'historical Book-Prose lineage must be BOOK-owned with no active Prose owner');
const knowledge = obligations.find((o) => o.obligation_id === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001');
if (!knowledge || knowledge.owner_path !== 'SYSTEM_MASTER/CORE' || knowledge.priority !== 'HIGHEST_DISCRETIONARY_SYSTEM_MASTER_PRIORITY' || authority.highest_discretionary_objective !== knowledge.obligation_id) finding('ERROR', 'KNOWLEDGE_RECOVERY_PRIORITY_DRIFT', 'Knowledge Recovery 001 must remain CORE-administered highest discretionary System Master priority while selected');

const ownerFiles = secondShift.owner_files || {};
if (!setEq(new Set(Object.keys(ownerFiles)), executionReadyPeers)) finding('ERROR', 'SECOND_SHIFT_PEER_COVERAGE_MISMATCH', 'Second Shift active owner files must exactly match topology execution-ready peers', { owner_lanes: Object.keys(ownerFiles), execution_ready: [...executionReadyPeers] });
if (ownerFiles.PROSE) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', 'PROSE must not have a Second Shift owner lane');
if (ownerFiles.SYSTEM_MASTER) finding('ERROR', 'ROOT_WORKER_LANE_ACTIVE', 'SYSTEM_MASTER product-root controller must not be an active peer worker lane');
if (Object.keys(secondShift.coverage_routes || {}).some((prefix) => ownerIsRetired(prefix))) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', 'Second Shift active coverage route points into retired Prose');
if (secondShift.retired_routes?.PROSE?.dispatchable !== false || secondShift.retired_routes?.PROSE?.auto_provisionable !== false || secondShift.retired_routes?.PROSE?.inherited_execution !== false) finding('ERROR', 'PROSE_RETIREMENT_ROUTE_DRIFT', 'Second Shift retired Prose route must remain non-dispatchable, non-provisionable and non-inherited');

const owners = {};
for (const [lane, rel] of Object.entries(ownerFiles)) {
  if (!exists(rel)) { finding('ERROR', 'SECOND_SHIFT_OWNER_FILE_MISSING', `owner file missing for ${lane}`, { path: rel }); continue; }
  const data = readJson(rel);
  const system = systems.find((s) => s.system_id === lane);
  if (!system) finding('ERROR', 'SECOND_SHIFT_UNKNOWN_ACTIVE_SYSTEM', `Second Shift lane ${lane} is not an active topology peer`);
  if (!executionReadyPeers.has(lane)) finding('ERROR', 'FALSE_EXECUTION_READINESS', `Second Shift lane ${lane} is not execution-ready in the selected topology`);
  const expectedPath = systemOwnerPath(system);
  if (system && data.owner_path !== expectedPath) finding('ERROR', 'SECOND_SHIFT_OWNER_PATH_MISMATCH', `${lane} owner_path mismatch`, { owner_path: data.owner_path, expected: expectedPath });
  if (system && data.control_ref !== system.control_ref) finding('ERROR', 'SECOND_SHIFT_CONTROL_REF_MISMATCH', `${lane} delegation control_ref differs from topology`, { delegation_control_ref: data.control_ref, topology_control_ref: system.control_ref });
  const resolved = resolveOwnerControl(data);
  const live = resolved.head;
  if (!isSha(data.last_known_control_head)) finding('ERROR', 'OWNER_CONTROL_HEAD_INVALID', `${lane} last_known_control_head is invalid`);
  if (!live || !isSha(live)) finding(noLive ? 'WARN' : 'ERROR', 'OWNER_CONTROL_BINDING_UNRESOLVED', `${lane} owner control binding could not be resolved`, { control_type: resolved.type, control_ref: resolved.ref });
  else if (live !== data.last_known_control_head) finding('ERROR', 'STALE_DELEGATION', `${lane} owner selector is stale`, { recorded_head: data.last_known_control_head, live_head: live, control_type: resolved.type, control_ref: resolved.ref });
  const active = Array.isArray(data.active_delegations) ? data.active_delegations : [];
  const claimed = active.filter((d) => d && d.state === 'CLAIMED');
  if (claimed.length > 1) finding('ERROR', 'OVERLAPPING_MUTATION_CLAIM', `${lane} has more than one active mutation-capable claim`, { claim_count: claimed.length });
  for (const d of active) {
    if (d.owner_path !== data.owner_path) finding('ERROR', 'JOB_LANE_VIOLATION', `${lane} delegation owner_path differs from lane owner`, { delegation_id: d.delegation_id });
    if (d.valid_for_control_ref !== data.control_ref) finding('ERROR', 'STALE_DELEGATION', `${lane} delegation is not bound to owner selector ref`, { delegation_id: d.delegation_id, delegated_ref: d.valid_for_control_ref, owner_ref: data.control_ref });
    if (d.valid_for_control_head !== data.last_known_control_head) finding('ERROR', 'STALE_DELEGATION', `${lane} delegation is not bound to owner selector head`, { delegation_id: d.delegation_id, delegated_head: d.valid_for_control_head, owner_head: data.last_known_control_head });
    if (lane === 'DOCUMENTS' && /PROSE/i.test(`${d.delegation_id || ''} ${d.objective_id || ''} ${d.obligation_id || ''} ${d.parent_objective_id || ''}`)) finding('ERROR', 'JOB_LANE_VIOLATION', 'Documents active delegation contains Prose work', { delegation_id: d.delegation_id });
  }
  owners[lane] = {
    owner_path: data.owner_path,
    control_ref: data.control_ref,
    control_binding_type: resolved.type,
    live_control_head: live,
    recorded_control_head: data.last_known_control_head,
    completion_count: completionEntries.filter((e) => e.owner_path === data.owner_path).length,
    open_obligations: obligations.filter((o) => isSameOrDescendant(o.owner_path, data.owner_path) && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective, owner_path: o.owner_path })),
    active_delegations: active.map((d) => ({ delegation_id: d.delegation_id, objective_id: d.objective_id, obligation_id: d.obligation_id || null, state: d.state, valid_for_control_head: d.valid_for_control_head })),
    live_claim_count: claimed.length
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
  if (!expectedPeers.has(lane)) finding('ERROR', 'REPAIR_OWNER_SET_MISMATCH', `repair registry contains non-peer active owner ${lane}`);
  if (!exists(rel)) { finding('ERROR', 'REPAIR_INBOX_MISSING', `repair inbox missing for ${lane}`, { path: rel }); continue; }
  const inbox = readJson(rel);
  repairInboxes[lane] = inbox.active_transactions || [];
}
if (repairRegistry.child_routes && Object.keys(repairRegistry.child_routes).length) finding('ERROR', 'RETIRED_SYSTEM_RESURRECTION', 'repair registry must not contain active child routes after terminal Prose retirement');
if (repairRegistry.retired_system_routes?.PROSE?.active_for_new_transactions !== false || repairRegistry.retired_system_routes?.PROSE?.inherited_repair_route_allowed !== false) finding('ERROR', 'PROSE_REPAIR_ROUTE_DRIFT', 'retired Prose repair route must reject new/inherited transactions');

const derived = {
  generated_at: now(),
  product_root: 'SYSTEM_MASTER',
  topology_id: topology.topology_id || null,
  central_next_objective: central || null,
  highest_discretionary_objective: authority.highest_discretionary_objective || null,
  architectural_peer_systems: [...expectedPeers],
  execution_ready_peer_systems: [...executionReadyPeers],
  admitted_not_execution_ready_peer_systems: [...admittedNotReadyPeers],
  active_systems: systems.map((s) => ({ system_id: s.system_id, parent_id: s.parent_id || null, owner_path: systemOwnerPath(s) })),
  retired_systems: retiredSystems.map((s) => ({ system_id: s.system_id, standing: s.lifecycle || null, historical_owner_path: s.historical_owner_path || null, integration_owner: s.integration_owner || null })),
  owners,
  product_governance: { open_obligations: obligations.filter((o) => o.owner_path === 'SYSTEM_MASTER' && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective })) },
  shared_infrastructure: { open_obligations: obligations.filter((o) => o.owner_path?.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE') && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective })) },
  second_shift_active_lanes: Object.keys(ownerFiles),
  prose_execution_lane: null,
  prose_standing: retiredProse ? 'COMPLETE_RETIRED_TERMINAL' : 'MISSING',
  book_owns_genuinely_open_completed_prose_integration: retiredProse?.integration_owner === 'SYSTEM_MASTER/BOOK',
  documents_receives_prose_work: false,
  repair_active_lanes: Object.keys(repairRegistry.owner_files || {}),
  repair_inboxes: repairInboxes,
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
console.log(`execution_ready_systems=${derived.execution_ready_peer_systems.join(',')}`);
console.log(`retired_systems=${derived.retired_systems.map((s) => s.system_id).join(',')}`);
console.log(`second_shift_lanes=${derived.second_shift_active_lanes.join(',')}`);
for (const f of findings) console.log(`${f.severity}:${f.type}:${f.message}`);
process.exit(errors.length ? 1 : 0);
