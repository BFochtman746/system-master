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
const legacyScript = path.join(root, '.github/scripts/system-state-reconciler-legacy.js');
const coverageScript = path.join(root, '.github/scripts/second-shift-owner-coverage.js');

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`required file missing: ${rel}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '')); }
function now() { return new Date().toISOString(); }
function localFileBlob(rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) { return null; }
}
function liveHead(ref) {
  if (noLive) return null;
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return out ? out.split(/\s+/)[0] : null;
  } catch (_) { return null; }
}
function runNode(script, childArgs) {
  const r = spawnSync(process.execPath, [script, ...childArgs], { cwd: root, encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r;
}
function ownerControlHead(owner) {
  const binding = owner.control_binding || { type: 'BRANCH_HEAD', ref: owner.control_ref };
  if (binding.type === 'FILE_BLOB') return localFileBlob(binding.path || owner.control_ref);
  return noLive ? owner.last_known_control_head : liveHead(binding.ref || owner.control_ref);
}

if (selftest) {
  const legacy = runNode(legacyScript, ['--selftest']);
  const coverage = runNode(coverageScript, ['--selftest']);
  const authority = readJson('governance/CURRENT-AUTHORITY.json');
  const checks = [
    ['current_obligation_registry_selected', Boolean(authority.obligation_registry && exists(authority.obligation_registry))],
    ['current_second_shift_registry_selected', Boolean(authority.second_shift_registry && exists(authority.second_shift_registry))],
    ['legacy_reconciler_preserved', fs.existsSync(legacyScript)],
    ['owner_coverage_guard_present', fs.existsSync(coverageScript)]
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  if (legacy.status !== 0 || coverage.status !== 0 || failed) {
    console.error('SYSTEM_STATE_RECONCILER_SELFTEST_FAIL');
    process.exit(1);
  }
  console.log('SYSTEM_STATE_RECONCILER_SELFTEST_PASS');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
const legacyOut = path.join(outDir, 'legacy');
const legacyArgs = args.filter((v) => !v.startsWith('--out='));
legacyArgs.push(`--out=${path.relative(root, legacyOut)}`);
const legacyRun = runNode(legacyScript, legacyArgs);

const coverageArgs = noLive ? ['--no-live'] : ['--watchdog'];
const coverageRun = runNode(coverageScript, coverageArgs);

const findings = [];
const finding = (severity, type, message, detail = {}) => findings.push({ severity, type, message, ...detail });

let legacyReport = null;
const legacyReportPath = path.join(legacyOut, 'SYSTEM-STATE-DRIFT-REPORT.json');
if (fs.existsSync(legacyReportPath)) {
  try { legacyReport = JSON.parse(fs.readFileSync(legacyReportPath, 'utf8')); }
  catch (e) { finding('ERROR', 'LEGACY_RECONCILER_REPORT_INVALID', e.message); }
}
if (legacyRun.status !== 0) finding('ERROR', 'LEGACY_RECONCILER_FAILED', 'preserved reconciler compatibility checks failed', { exit_status: legacyRun.status });
if (coverageRun.status !== 0) finding('ERROR', 'SECOND_SHIFT_OWNER_COVERAGE_FAILED', 'registry-driven Second Shift owner coverage failed', { exit_status: coverageRun.status });

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const selected = {
  topology: authority.topology || 'governance/SYSTEM-TOPOLOGY-002.json',
  completion_ledger: authority.completion_ledger || 'governance/COMPLETION-LEDGER-001.json',
  obligation_registry: authority.obligation_registry,
  expectation_registry: authority.expectation_registry || 'governance/EXPECTATION-REGISTRY-001.json',
  reallocation_ledger: authority.reallocation_ledger || 'governance/REALLOCATION-LEDGER-001.json',
  second_shift_registry: authority.second_shift_registry || 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json',
  repair_inbox_registry: authority.repair_inbox_registry || 'governance/repair/REPAIR-INBOX-REGISTRY-001.json'
};
for (const [key, rel] of Object.entries(selected)) {
  if (!rel || !exists(rel)) finding('ERROR', 'CURRENT_AUTHORITY_REFERENCE_MISSING', `CURRENT-AUTHORITY selected ${key} is missing`, { path: rel || null });
}

const topology = selected.topology && exists(selected.topology) ? readJson(selected.topology) : {};
const completion = selected.completion_ledger && exists(selected.completion_ledger) ? readJson(selected.completion_ledger) : {};
const obligationsDoc = selected.obligation_registry && exists(selected.obligation_registry) ? readJson(selected.obligation_registry) : {};
const secondShift = selected.second_shift_registry && exists(selected.second_shift_registry) ? readJson(selected.second_shift_registry) : {};
const repairRegistry = selected.repair_inbox_registry && exists(selected.repair_inbox_registry) ? readJson(selected.repair_inbox_registry) : {};
const obligations = obligationsDoc.obligations || [];
const terminal = new Set(['CLOSED', 'SUPERSEDED']);
const completionEntries = completion.entries || [];

if (topology.product_root?.product_id !== 'SYSTEM_MASTER') finding('ERROR', 'TOPOLOGY_ROOT_MISMATCH', 'topology product root must be SYSTEM_MASTER');
const systems = topology.canonical_internal_systems || [];
const byId = Object.fromEntries(systems.map((s) => [s.system_id, s]));
for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) if (!byId[id]) finding('ERROR', 'CANONICAL_SYSTEM_MISSING', `canonical system missing: ${id}`);

const ownerFiles = secondShift.owner_files || {};
const owners = {};
const ownerPaths = new Set(['SYSTEM_MASTER']);
for (const [lane, rel] of Object.entries(ownerFiles)) {
  if (!rel || !exists(rel)) {
    finding('ERROR', 'SECOND_SHIFT_OWNER_FILE_MISSING', `registry-declared owner file missing for ${lane}`, { path: rel || null });
    continue;
  }
  const data = readJson(rel);
  ownerPaths.add(data.owner_path);
  const resolvedHead = ownerControlHead(data);
  if (!isSha(data.last_known_control_head)) finding('ERROR', 'OWNER_CONTROL_HEAD_INVALID', `invalid last_known_control_head for ${lane}`);
  if (resolvedHead && resolvedHead !== data.last_known_control_head) {
    finding('ERROR', 'STALE_DELEGATION', `${lane} owner selector is stale against current control binding`, { recorded_head: data.last_known_control_head, resolved_head: resolvedHead });
  }
  const ownerPath = data.owner_path || (lane === 'SYSTEM_MASTER' ? 'SYSTEM_MASTER' : null);
  owners[lane] = {
    owner_path: ownerPath,
    control_ref: data.control_ref || null,
    control_binding: data.control_binding || { type: 'BRANCH_HEAD', ref: data.control_ref || null },
    live_control_head: resolvedHead,
    recorded_control_head: data.last_known_control_head || null,
    completion_count: completionEntries.filter((e) => e.owner_path === ownerPath).length,
    open_obligations: obligations.filter((o) => o.owner_path === ownerPath && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective, blocker_class: o.blocker_class || null })),
    active_delegations: (data.active_delegations || []).map((d) => ({ delegation_id: d.delegation_id, objective_id: d.objective_id, obligation_id: d.obligation_id || null, state: d.state, valid_for_control_head: d.valid_for_control_head }))
  };
}

for (const o of obligations) {
  if (!o || !o.obligation_id) {
    finding('ERROR', 'OBLIGATION_ID_MISSING', 'current obligation registry contains an entry without obligation_id');
    continue;
  }
  if (!o.owner_path) finding('ERROR', 'OBLIGATION_OWNER_MISSING', `current obligation lacks owner_path: ${o.obligation_id}`);
  if (!terminal.has(o.state) && !o.objective) finding('ERROR', 'OBLIGATION_OBJECTIVE_MISSING', `open current obligation lacks objective: ${o.obligation_id}`);
}

const central = authority.central_next_objective || null;
if (central) {
  const current = obligations.find((o) => o.obligation_id === central);
  if (!current) finding('ERROR', 'CENTRAL_NEXT_OBJECTIVE_MISSING', 'central_next_objective is absent from authority-selected obligation registry', { objective_id: central, obligation_registry: selected.obligation_registry });
  else if (terminal.has(current.state)) finding('ERROR', 'CENTRAL_NEXT_OBJECTIVE_TERMINAL', 'central_next_objective is already terminal', { objective_id: central, state: current.state });
}

const repairInboxes = {};
for (const [lane, rel] of Object.entries(repairRegistry.owner_files || {})) {
  if (rel && exists(rel)) {
    const inbox = readJson(rel);
    repairInboxes[lane] = (inbox.active_transactions || []).map((tx) => ({
      transaction_id: tx.transaction_id,
      state: tx.state,
      receipt_id: tx.receipt_id,
      qualification_id: tx.qualification_id,
      workstream_id: tx.workstream_id,
      failed_subject_sha: tx.failed_subject_sha,
      replacement_subject_sha: tx.replacement_subject_sha || null
    }));
    if (owners[lane]) owners[lane].active_repair_transactions = repairInboxes[lane];
  }
}
for (const owner of Object.values(owners)) if (!owner.active_repair_transactions) owner.active_repair_transactions = [];

const derived = {
  generated_at: now(),
  product_root: 'SYSTEM_MASTER',
  source_authority: 'governance/CURRENT-AUTHORITY.json',
  authority_selected_sources: selected,
  central_next_objective: central,
  second_shift_lane_source: `${selected.second_shift_registry}::owner_files`,
  owners,
  shared_infrastructure: {
    open_obligations: obligations.filter((o) => o.owner_path?.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE') && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective }))
  },
  product_governance: {
    open_obligations: obligations.filter((o) => o.owner_path === 'SYSTEM_MASTER' && !terminal.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective }))
  },
  repair_control: {
    registry_id: repairRegistry.registry_id || null,
    broker_contract: repairRegistry.broker_contract || null,
    active_transaction_count: Object.values(repairInboxes).reduce((n, items) => n + items.length, 0)
  },
  compatibility_reconciler: legacyReport ? { standing: legacyReport.standing, error_count: legacyReport.error_count, warning_count: legacyReport.warning_count } : { standing: legacyRun.status === 0 ? 'PASS_NO_REPORT' : 'FAILED' },
  second_shift_owner_coverage: coverageRun.status === 0 ? 'PASS' : 'DRIFT_DETECTED'
};

const legacyErrors = legacyReport?.findings?.filter((f) => f.severity === 'ERROR') || [];
const legacyWarnings = legacyReport?.findings?.filter((f) => f.severity === 'WARN') || [];
for (const f of legacyErrors) findings.push({ ...f, source: 'LEGACY_COMPATIBILITY_CHECK' });
for (const f of legacyWarnings) findings.push({ ...f, source: 'LEGACY_COMPATIBILITY_CHECK' });

const errors = findings.filter((f) => f.severity === 'ERROR');
const warnings = findings.filter((f) => f.severity === 'WARN');
const report = {
  generated_at: now(),
  standing: errors.length ? 'DRIFT_DETECTED' : 'PASS',
  error_count: errors.length,
  warning_count: warnings.length,
  current_obligation_registry: selected.obligation_registry || null,
  registry_declared_second_shift_lanes: Object.keys(ownerFiles),
  findings
};

fs.writeFileSync(path.join(outDir, 'DERIVED-CURRENT-STATE.json'), JSON.stringify(derived, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'SYSTEM-STATE-DRIFT-REPORT.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`SYSTEM_STATE_RECONCILER_${report.standing}`);
console.log(`errors=${errors.length}`);
console.log(`warnings=${warnings.length}`);
console.log(`current_obligation_registry=${selected.obligation_registry || '<unset>'}`);
console.log(`second_shift_lanes=${Object.keys(ownerFiles).join(',')}`);
for (const f of findings) console.log(`${f.severity}:${f.type}:${f.message}`);
process.exit(errors.length ? 1 : 0);
