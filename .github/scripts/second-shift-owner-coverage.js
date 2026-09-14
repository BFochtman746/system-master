'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const args = new Set(process.argv.slice(2));
const selftest = args.has('--selftest');
const watchdog = args.has('--watchdog');
const noLive = args.has('--no-live');

const ACTIVE_DELEGATION_STATES = new Set(['CANDIDATE', 'READY', 'CLAIMED']);
const ACTIVE_OBLIGATION_STATES = new Set(['READY', 'ACTIVE']);
const TERMINAL_OBLIGATION_STATES = new Set(['CLOSED', 'SUPERSEDED']);
const REQUIRED_DELEGATION_FIELDS = [
  'delegation_id', 'owner_path', 'objective_id', 'state',
  'valid_for_control_ref', 'valid_for_control_head', 'created_at',
  'last_revalidated_at', 'completion_delta', 'stop_condition',
  'allowed_work', 'forbidden_authority', 'on_pass', 'on_failure'
];

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`required file missing: ${rel}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '')); }
function nonEmpty(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function isSameOrDescendant(candidate, ownerPath) {
  return candidate === ownerPath || String(candidate || '').startsWith(`${ownerPath}/`);
}
// Binding resolution returns a classified status so that an infrastructure
// outage is never reported as a governance violation, and so that an offline
// run can never be mistaken for a verified one.
//   RESOLVED   - git answered and the ref exists
//   ABSENT     - git answered and the ref genuinely does not exist
//   INFRA_DOWN - git could not answer (no remote, no network, no credentials)
//   OFFLINE    - --no-live was requested, so nothing was verified at all
function branchHead(ref) {
  if (noLive) return { status: 'OFFLINE', head: null, detail: 'no-live requested' };
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (!out) return { status: 'ABSENT', head: null, detail: 'remote has no such branch' };
    return { status: 'RESOLVED', head: out.split(/\s+/)[0], detail: null };
  } catch (err) {
    return { status: 'INFRA_DOWN', head: null, detail: String((err && err.message) || err).slice(0, 200) };
  }
}
function localFileBlob(rel) {
  if (noLive) return { status: 'OFFLINE', head: null, detail: 'no-live requested' };
  try {
    const out = execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (!out) return { status: 'ABSENT', head: null, detail: 'path not present in HEAD' };
    return { status: 'RESOLVED', head: out, detail: null };
  } catch (err) {
    const msg = String((err && err.message) || err);
    const infra = /not a git repository|could not read|unable to access|Could not resolve host/i.test(msg);
    return { status: infra ? 'INFRA_DOWN' : 'ABSENT', head: null, detail: msg.slice(0, 200) };
  }
}
function resolveBinding(owner) {
  const binding = owner.control_binding || { type: 'BRANCH_HEAD', ref: owner.control_ref };
  if (binding.type === 'FILE_BLOB') {
    const rel = binding.path || owner.control_ref;
    const r = localFileBlob(rel);
    return { type: 'FILE_BLOB', ref: rel, head: r.head, status: r.status, detail: r.detail };
  }
  const ref = binding.ref || owner.control_ref;
  const r = branchHead(ref);
  return { type: 'BRANCH_HEAD', ref, head: r.head, status: r.status, detail: r.detail };
}
function validExhaustion(record) {
  const allowed = new Set(['COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED', 'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION']);
  return Boolean(record && Array.isArray(record.rungs) && record.rungs.length === 8 &&
    record.independent_work_remaining === false && record.rungs.every((r, i) =>
      r && Number(r.rung) === i + 1 && allowed.has(r.disposition) &&
      nonEmpty(r.evidence_or_blocker) && nonEmpty(r.independent_preparation_assessment) &&
      nonEmpty(r.next_executable_condition)));
}
function isExplicitNonPeerObligation(o) {
  if (!o) return false;
  if (o.second_shift_state === 'NO_PEER_LANE_BEFORE_TOPOLOGY_ADMISSION') return true;
  if (o.program_id && o.owner_path === 'SYSTEM_MASTER') return true;
  return false;
}

function runSelftest() {
  const good = {
    rungs: Array.from({ length: 8 }, (_, i) => ({
      rung: i + 1,
      disposition: 'DEPENDENCY_BLOCKED',
      evidence_or_blocker: `B${i + 1}`,
      independent_preparation_assessment: 'none',
      next_executable_condition: 'dependency changes'
    })),
    independent_work_remaining: false
  };
  if (!validExhaustion(good) || validExhaustion({ ...good, rungs: good.rungs.slice(0, 7) }) ||
      !isSameOrDescendant('SYSTEM_MASTER/BOOK/X', 'SYSTEM_MASTER/BOOK') ||
      isSameOrDescendant('SYSTEM_MASTER/LEARNING', 'SYSTEM_MASTER/BOOK') ||
      !isExplicitNonPeerObligation({ program_id: 'PROGRAMMING', owner_path: 'SYSTEM_MASTER', second_shift_state: 'NO_PEER_LANE_BEFORE_TOPOLOGY_ADMISSION' })) {
    console.error('SECOND_SHIFT_OWNER_COVERAGE_SELFTEST_FAIL');
    process.exit(1);
  }
  console.log('SECOND_SHIFT_OWNER_COVERAGE_SELFTEST_PASS');
  process.exit(0);
}
if (selftest) runSelftest();

const findings = [];
const add = (severity, type, message, detail = {}) => findings.push({ severity, type, message, ...detail });

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const topologyRel = authority.topology;
if (!topologyRel || !exists(topologyRel)) {
  add('ERROR', 'CURRENT_TOPOLOGY_MISSING', `CURRENT-AUTHORITY does not select an accessible topology: ${topologyRel || '<unset>'}`);
}
const topology = topologyRel && exists(topologyRel) ? readJson(topologyRel) : { peer_system_ids: [], retired_systems: [] };
const topologyPeers = new Set(topology.peer_system_ids || []);
const retiredSystems = new Map((topology.retired_systems || []).filter(Boolean).map((r) => [r.system_id, r]));

const registryRel = authority.second_shift_registry || 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json';
const registry = readJson(registryRel);
const obligationRel = authority.obligation_registry;
if (!obligationRel || !exists(obligationRel)) {
  add('ERROR', 'CURRENT_OBLIGATION_REGISTRY_MISSING', `CURRENT-AUTHORITY does not select an accessible obligation registry: ${obligationRel || '<unset>'}`);
}
const obligations = obligationRel && exists(obligationRel) ? (readJson(obligationRel).obligations || []) : [];
const ownerFiles = registry.owner_files || {};
const laneEntries = Object.entries(ownerFiles);
if (!laneEntries.length) add('ERROR', 'SECOND_SHIFT_REGISTRY_EMPTY', 'Second Shift registry declares no owner lanes');

for (const peer of topologyPeers) {
  if (!ownerFiles[peer]) {
    const system = (topology.canonical_internal_systems || []).find((s) => s && s.system_id === peer);
    const candidates = obligations.filter((o) => o && ACTIVE_OBLIGATION_STATES.has(o.state) && isSameOrDescendant(o.owner_path, system?.owner_path || `SYSTEM_MASTER/${peer}`));
    const machineResolvable = Boolean(system?.control_ref && system?.parent_id === 'SYSTEM_MASTER' && candidates.length > 0);
    add('ERROR', 'SECOND_SHIFT_PEER_COVERAGE_MISSING', 'topology-declared active peer has no Second Shift owner file', {
      lane: peer,
      control_ref: system?.control_ref || null,
      owner_path: system?.owner_path || `SYSTEM_MASTER/${peer}`,
      machine_resolvable_for_controller_autoprovision: machineResolvable
    });
  }
}
for (const [lane] of laneEntries) {
  if (!topologyPeers.has(lane)) {
    const retired = retiredSystems.get(lane);
    add('ERROR', retired ? 'RETIRED_SYSTEM_PROVISIONED' : 'SECOND_SHIFT_ORPHAN_ACTIVE_LANE', retired ?
      'retired system appears in active Second Shift owner_files and must be removed without replacement' :
      'registry declares an active lane that is not a topology peer', { lane, retired: Boolean(retired) });
  }
}
for (const [retiredId] of retiredSystems) {
  if (ownerFiles[retiredId]) add('ERROR', 'RETIRED_SYSTEM_PROVISIONED', 'retired system must never be auto-provisioned or retained as an active owner lane', { lane: retiredId });
}

const eventSchemaRel = registry.utilization_event_schema;
if (!eventSchemaRel || !exists(eventSchemaRel)) {
  add('ERROR', 'SECOND_SHIFT_EVENT_SCHEMA_MISSING', 'registry utilization_event_schema is absent or inaccessible', { path: eventSchemaRel || null });
} else {
  const eventSchema = readJson(eventSchemaRel);
  const allowed = new Set(eventSchema.allowed_lanes || []);
  for (const [lane] of laneEntries) {
    if (!allowed.has(lane)) add('ERROR', 'SECOND_SHIFT_TELEMETRY_LANE_MISSING', 'registry-declared owner lane is absent from utilization allowed_lanes', { lane, event_schema: eventSchemaRel });
  }
  for (const lane of allowed) {
    if (!ownerFiles[lane]) add('ERROR', 'SECOND_SHIFT_TELEMETRY_LANE_ORPHANED', 'utilization allowed_lanes contains a lane not declared by owner_files', { lane, event_schema: eventSchemaRel });
    if (!topologyPeers.has(lane)) add('ERROR', 'SECOND_SHIFT_TELEMETRY_NONPEER_LANE', 'utilization allowed_lanes contains a non-peer or retired system', { lane, event_schema: eventSchemaRel });
  }
  for (const [retiredId] of retiredSystems) {
    if (allowed.has(retiredId)) add('ERROR', 'RETIRED_SYSTEM_TELEMETRY_ACTIVE', 'retired system is present in active utilization allowed_lanes', { lane: retiredId });
  }
}

const ownerDataByLane = new Map();
for (const [lane, rel] of laneEntries) {
  if (!rel || !exists(rel)) {
    add('ERROR', 'MISSING_OWNER_FILE', `registry-declared owner file is missing: ${rel || '<unset>'}`, { lane });
    continue;
  }
  const owner = readJson(rel);
  ownerDataByLane.set(lane, owner);
  if (!owner.owner_path) add('ERROR', 'OWNER_PATH_MISSING', 'owner file has no owner_path', { lane, owner_file: rel });
  if (!isSha(owner.last_known_control_head)) add('ERROR', 'OWNER_CONTROL_HEAD_INVALID', 'owner file lacks a valid 40-character control binding', { lane });
  const resolved = resolveBinding(owner);
  // One severity policy, owned here, identical no matter which gate invoked this
  // script. --watchdog no longer changes the verdict; it only changes reporting.
  if (!resolved.head || !isSha(resolved.head)) {
    if (resolved.status === 'ABSENT') {
      add('ERROR', 'OWNER_CONTROL_BINDING_MISSING', 'owner control binding does not exist', { lane, control_ref: resolved.ref, control_type: resolved.type, detail: resolved.detail || null });
    } else if (resolved.status === 'INFRA_DOWN') {
      add('WARN', 'OWNER_CONTROL_BINDING_UNVERIFIABLE_INFRASTRUCTURE', 'git could not answer, so the binding was not verified; this is an environment fault, not a governance fault', { lane, control_ref: resolved.ref, control_type: resolved.type, detail: resolved.detail || null });
    } else {
      add('WARN', 'OWNER_CONTROL_BINDING_NOT_VERIFIED_OFFLINE', 'offline mode was requested, so no binding was verified; this run is not evidence of a correct binding', { lane, control_ref: resolved.ref, control_type: resolved.type });
    }
  } else if (resolved.head !== owner.last_known_control_head) {
    add('ERROR', 'OWNER_CONTROL_BINDING_STALE', 'owner selector does not match its current control binding', { lane, recorded_head: owner.last_known_control_head, resolved_head: resolved.head, control_type: resolved.type });
  }

  const active = Array.isArray(owner.active_delegations) ? owner.active_delegations : [];
  for (const d of active) {
    for (const f of REQUIRED_DELEGATION_FIELDS) if (!nonEmpty(d[f])) add('ERROR', 'DELEGATION_CONTRACT_DRIFT', `active delegation missing ${f}`, { lane, delegation_id: d.delegation_id || null });
    if (!ACTIVE_DELEGATION_STATES.has(d.state)) add('ERROR', 'DELEGATION_STATE_INVALID', 'active delegation has unsupported active state', { lane, delegation_id: d.delegation_id || null, state: d.state || null });
    if (d.owner_path !== owner.owner_path) add('ERROR', 'DELEGATION_OWNER_MISMATCH', 'delegation owner_path differs from owner file', { lane, delegation_id: d.delegation_id || null });
    if (d.valid_for_control_ref !== owner.control_ref) add('ERROR', 'DELEGATION_CONTROL_REF_MISMATCH', 'delegation control ref differs from owner file', { lane, delegation_id: d.delegation_id || null });
    if (d.valid_for_control_head !== owner.last_known_control_head) add('ERROR', 'DELEGATION_CONTROL_HEAD_MISMATCH', 'delegation is not bound to the owner selector head', { lane, delegation_id: d.delegation_id || null });
    const oid = d.obligation_id || d.objective_id;
    const o = obligations.find((x) => x && x.obligation_id === oid);
    if (d.obligation_id && !o) add('ERROR', 'OBJECTIVE_AUTHORITY_MISSING', 'explicit active delegation obligation is not in the authority-selected current obligation registry', { lane, delegation_id: d.delegation_id || null, obligation_id: oid });
    if (o) {
      if (!isSameOrDescendant(o.owner_path, owner.owner_path)) add('ERROR', 'OBJECTIVE_OWNER_MISMATCH', 'delegated obligation is outside the owner lane subtree', { lane, obligation_id: oid, obligation_owner: o.owner_path, delegation_owner: owner.owner_path });
      if (TERMINAL_OBLIGATION_STATES.has(o.state)) add('ERROR', 'SEMANTIC_STALE_DELEGATION', 'delegated obligation is terminal', { lane, obligation_id: oid, obligation_state: o.state });
    }
  }
  if (active.length === 0 && owner.empty_is_valid === true && !validExhaustion(owner.all_rungs_exhausted)) {
    add('ERROR', 'FALSE_EMPTY', 'empty_is_valid=true without a valid all-eight-rungs exhaustion proof', { lane });
  }
}

const coverageRoutes = registry.coverage_routes || {};
function routeLane(ownerPath) {
  const explicit = Object.entries(coverageRoutes)
    .filter(([prefix]) => isSameOrDescendant(ownerPath, prefix))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (explicit) return explicit[1];
  const inherited = [...ownerDataByLane.entries()]
    .filter(([, owner]) => owner?.owner_path && isSameOrDescendant(ownerPath, owner.owner_path))
    .sort((a, b) => b[1].owner_path.length - a[1].owner_path.length)[0];
  return inherited ? inherited[0] : null;
}

for (const [prefix, lane] of Object.entries(coverageRoutes)) {
  if (!ownerDataByLane.has(lane)) add('ERROR', 'SECOND_SHIFT_COVERAGE_ROUTE_INVALID', 'coverage route points to a missing Second Shift lane', { owner_prefix: prefix, routed_lane: lane });
  for (const [, retired] of retiredSystems) {
    if (retired?.historical_owner_path && isSameOrDescendant(prefix, retired.historical_owner_path)) {
      add('ERROR', 'RETIRED_SYSTEM_COVERAGE_ROUTE_ACTIVE', 'active coverage route points into a retired system path', { owner_prefix: prefix, routed_lane: lane, retired_system_id: retired.system_id });
    }
  }
}

for (const o of obligations.filter((x) => x && ACTIVE_OBLIGATION_STATES.has(x.state))) {
  if (isExplicitNonPeerObligation(o)) continue;
  const retired = [...retiredSystems.values()].find((r) => r?.historical_owner_path && isSameOrDescendant(o.owner_path, r.historical_owner_path));
  if (retired) {
    add('ERROR', 'RETIRED_SYSTEM_ACTIVE_OBLIGATION', 'active obligation is owned by or beneath a retired system path', { obligation_id: o.obligation_id, owner_path: o.owner_path, retired_system_id: retired.system_id });
    continue;
  }
  const lane = routeLane(o.owner_path);
  if (!lane) add('ERROR', 'SECOND_SHIFT_OWNER_COVERAGE_MISSING', 'READY/ACTIVE obligation owner_path has no registry-declared Second Shift owner route', { obligation_id: o.obligation_id, owner_path: o.owner_path });
}

const central = authority.central_next_objective;
if (central) {
  const o = obligations.find((x) => x && x.obligation_id === central);
  if (!o) add('ERROR', 'CENTRAL_NEXT_OBJECTIVE_MISSING', 'central_next_objective is absent from the authority-selected current obligation registry', { objective_id: central });
  else if (ACTIVE_OBLIGATION_STATES.has(o.state)) {
    const lane = routeLane(o.owner_path);
    const owner = lane ? ownerDataByLane.get(lane) : null;
    const active = owner && Array.isArray(owner.active_delegations) ? owner.active_delegations : [];
    const bound = active.some((d) => d && ACTIVE_DELEGATION_STATES.has(d.state) && (d.obligation_id === central || d.objective_id === central));
    if (!bound) add('ERROR', 'CENTRAL_OBJECTIVE_SECOND_SHIFT_UNBOUND', 'current central objective has no active delegation in its registry-routed owner lane', { objective_id: central, owner_path: o.owner_path, lane: lane || null });
  }
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const report = {
  authority_topology: topologyRel || null,
  authority_obligation_registry: obligationRel || null,
  registry: registryRel,
  utilization_event_schema: eventSchemaRel || null,
  topology_peer_lanes: [...topologyPeers],
  registry_declared_lanes: laneEntries.map(([lane]) => lane),
  retired_system_ids: [...retiredSystems.keys()],
  central_next_objective: central || null,
  standing: errors.length ? 'DRIFT_DETECTED' : 'PASS',
  error_count: errors.length,
  findings
};
console.log(JSON.stringify(report, null, 2));
console.log(`SECOND_SHIFT_OWNER_COVERAGE_${report.standing}`);
process.exit(errors.length ? 1 : 0);
