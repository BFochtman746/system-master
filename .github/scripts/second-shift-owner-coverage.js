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
function branchHead(ref) {
  if (noLive) return null;
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return out ? out.split(/\s+/)[0] : null;
  } catch (_) {
    return null;
  }
}
function localFileBlob(rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (_) {
    return null;
  }
}
function resolveBinding(owner) {
  const binding = owner.control_binding || { type: 'BRANCH_HEAD', ref: owner.control_ref };
  if (binding.type === 'FILE_BLOB') {
    const rel = binding.path || owner.control_ref;
    return { type: 'FILE_BLOB', ref: rel, head: localFileBlob(rel) };
  }
  const ref = binding.ref || owner.control_ref;
  return { type: 'BRANCH_HEAD', ref, head: noLive ? owner.last_known_control_head : branchHead(ref) };
}
function validExhaustion(record) {
  const allowed = new Set(['COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED', 'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION']);
  return Boolean(record && Array.isArray(record.rungs) && record.rungs.length === 8 &&
    record.independent_work_remaining === false && record.rungs.every((r, i) =>
      r && Number(r.rung) === i + 1 && allowed.has(r.disposition) &&
      nonEmpty(r.evidence_or_blocker) && nonEmpty(r.independent_preparation_assessment) &&
      nonEmpty(r.next_executable_condition)));
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
  if (!validExhaustion(good) || validExhaustion({ ...good, rungs: good.rungs.slice(0, 7) })) {
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

const ownerDataByLane = new Map();
const ownerPathToLane = new Map();
for (const [lane, rel] of laneEntries) {
  if (!rel || !exists(rel)) {
    add('ERROR', 'MISSING_OWNER_FILE', `registry-declared owner file is missing: ${rel || '<unset>'}`, { lane });
    continue;
  }
  const owner = readJson(rel);
  ownerDataByLane.set(lane, owner);
  if (!owner.owner_path) add('ERROR', 'OWNER_PATH_MISSING', 'owner file has no owner_path', { lane, owner_file: rel });
  else {
    if (ownerPathToLane.has(owner.owner_path)) add('ERROR', 'DUPLICATE_OWNER_PATH', 'multiple Second Shift lanes claim the same owner_path', { lane, owner_path: owner.owner_path });
    ownerPathToLane.set(owner.owner_path, lane);
  }
  if (!isSha(owner.last_known_control_head)) add('ERROR', 'OWNER_CONTROL_HEAD_INVALID', 'owner file lacks a valid 40-character control binding', { lane });
  const resolved = resolveBinding(owner);
  if (!resolved.head || !isSha(resolved.head)) {
    add(watchdog && !noLive ? 'ERROR' : 'WARN', 'OWNER_CONTROL_BINDING_UNRESOLVED', 'could not resolve owner control binding', { lane, control_ref: resolved.ref, control_type: resolved.type });
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
    if (!o) add('ERROR', 'OBJECTIVE_AUTHORITY_MISSING', 'active delegation is not bound to the authority-selected current obligation registry', { lane, delegation_id: d.delegation_id || null, obligation_id: oid });
    else {
      if (o.owner_path !== owner.owner_path) add('ERROR', 'OBJECTIVE_OWNER_MISMATCH', 'delegated obligation belongs to a different owner', { lane, obligation_id: oid, obligation_owner: o.owner_path, delegation_owner: owner.owner_path });
      if (TERMINAL_OBLIGATION_STATES.has(o.state)) add('ERROR', 'SEMANTIC_STALE_DELEGATION', 'delegated obligation is terminal', { lane, obligation_id: oid, obligation_state: o.state });
    }
  }
  if (active.length === 0 && owner.empty_is_valid === true && !validExhaustion(owner.all_rungs_exhausted)) {
    add('ERROR', 'FALSE_EMPTY', 'empty_is_valid=true without a valid all-eight-rungs exhaustion proof', { lane });
  }
}

const coverageRoutes = registry.coverage_routes || {};
for (const o of obligations.filter((x) => x && ACTIVE_OBLIGATION_STATES.has(x.state))) {
  const exactLane = ownerPathToLane.get(o.owner_path);
  const routedLane = coverageRoutes[o.owner_path];
  if (!exactLane && !routedLane) {
    add('ERROR', 'SECOND_SHIFT_OWNER_COVERAGE_MISSING', 'READY/ACTIVE obligation owner_path has no registry-declared Second Shift owner route', { obligation_id: o.obligation_id, owner_path: o.owner_path });
  } else if (routedLane && !ownerDataByLane.has(routedLane)) {
    add('ERROR', 'SECOND_SHIFT_COVERAGE_ROUTE_INVALID', 'coverage route points to a missing Second Shift lane', { obligation_id: o.obligation_id, owner_path: o.owner_path, routed_lane: routedLane });
  }
}

const central = authority.central_next_objective;
if (central) {
  const o = obligations.find((x) => x && x.obligation_id === central);
  if (!o) add('ERROR', 'CENTRAL_NEXT_OBJECTIVE_MISSING', 'central_next_objective is absent from the authority-selected current obligation registry', { objective_id: central });
  else if (ACTIVE_OBLIGATION_STATES.has(o.state)) {
    const lane = ownerPathToLane.get(o.owner_path) || coverageRoutes[o.owner_path];
    const owner = lane ? ownerDataByLane.get(lane) : null;
    const active = owner && Array.isArray(owner.active_delegations) ? owner.active_delegations : [];
    const bound = active.some((d) => d && ACTIVE_DELEGATION_STATES.has(d.state) && (d.obligation_id === central || d.objective_id === central));
    if (!bound) add('ERROR', 'CENTRAL_OBJECTIVE_SECOND_SHIFT_UNBOUND', 'current central objective has no active delegation in its registry-declared owner lane', { objective_id: central, owner_path: o.owner_path, lane: lane || null });
  }
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const report = {
  authority_obligation_registry: obligationRel || null,
  registry: registryRel,
  registry_declared_lanes: laneEntries.map(([lane]) => lane),
  central_next_objective: central || null,
  standing: errors.length ? 'DRIFT_DETECTED' : 'PASS',
  error_count: errors.length,
  findings
};
console.log(JSON.stringify(report, null, 2));
console.log(`SECOND_SHIFT_OWNER_COVERAGE_${report.standing}`);
process.exit(errors.length ? 1 : 0);
