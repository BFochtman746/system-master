import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const SHA_RE = /^[0-9a-f]{40}$/i;
const BLOCKING = new Set([
  'CURRENT_AUTHORITY_REFERENCE_MISSING',
  'LIVE_TOPOLOGY_REFERENCE_STALE',
  'COMPLETION_OR_RETIREMENT_DRIFT',
  'OWNER_CONTROL_HEAD_UNRESOLVED',
  'STALE_DELEGATION',
  'OVERLAPPING_MUTATION_CLAIM',
  'MISSING_LIVE_CONTROL',
  'EXECUTABLE_CONTRACT_DIVERGENCE',
  'SYSTEM_STATE_RECONCILER_DRIFT',
  'LIVE_OWNER_HEADS_NOT_CHECKED'
]);

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function readText(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '');
}

function readJson(root, rel) {
  return JSON.parse(readText(root, rel));
}

function exists(root, rel) {
  return typeof rel === 'string' && rel.length > 0 && fs.existsSync(path.join(root, rel));
}

function blobSha(root, rel) {
  try { return git(root, ['rev-parse', `HEAD:${rel}`]); } catch { return null; }
}

function addFinding(findings, severity, type, message, detail = {}) {
  findings.push({ severity, type, message, ...detail });
}

function controlPointers(authority) {
  const keys = [
    'topology',
    'program_job_lock',
    'system_completion_status',
    'obligation_registry',
    'repair_inbox_registry',
    'repair_ledger_registry',
    'state_reconciler_contract',
    'state_reconciler_script',
    'second_shift_registry',
    'second_shift_execution_control',
    'repair_broker_contract'
  ];
  return Object.fromEntries(keys.map((key) => [key, authority[key] || null]));
}

function resolveSelectedControls(root, authority, findings) {
  const out = {};
  for (const [key, rel] of Object.entries(controlPointers(authority))) {
    if (!rel || !exists(root, rel)) {
      addFinding(findings, 'ERROR', 'CURRENT_AUTHORITY_REFERENCE_MISSING', `CURRENT-AUTHORITY selected ${key} is missing`, { key, path: rel });
      out[key] = { path: rel, blob_sha: null };
      continue;
    }
    out[key] = { path: rel, blob_sha: blobSha(root, rel) };
  }
  return out;
}

function topologyOwnerRows(topology) {
  return (topology.canonical_internal_systems || [])
    .filter((row) => row && row.system_id && row.control_ref)
    .map((row) => ({ lane: row.system_id, owner_path: row.owner_path || `SYSTEM_MASTER/${row.system_id}`, control_ref: row.control_ref }));
}

function lsRemote(root, ref) {
  try {
    const value = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return value ? value.split(/\s+/)[0] : null;
  } catch {
    return null;
  }
}

function ownerControlBinding(root, secondShiftRegistry, lane, fallbackRef) {
  const ownerFile = secondShiftRegistry?.owner_files?.[lane];
  if (!ownerFile || !exists(root, ownerFile)) {
    return { recorded_sha: null, type: 'BRANCH_HEAD', ref: fallbackRef };
  }
  try {
    const data = readJson(root, ownerFile);
    const binding = data.control_binding || { type: 'BRANCH_HEAD', ref: data.control_ref || fallbackRef };
    if (binding.type === 'FILE_BLOB') {
      return { recorded_sha: data.last_known_control_head || null, type: 'FILE_BLOB', ref: binding.path || data.control_ref || fallbackRef };
    }
    return { recorded_sha: data.last_known_control_head || null, type: 'BRANCH_HEAD', ref: binding.ref || data.control_ref || fallbackRef };
  } catch {
    return { recorded_sha: null, type: 'BRANCH_HEAD', ref: fallbackRef };
  }
}

function collectOwnerHeads(root, topology, secondShiftRegistry, findings, liveHeads, fixtureMode) {
  const rows = [];
  for (const owner of topologyOwnerRows(topology)) {
    const binding = ownerControlBinding(root, secondShiftRegistry, owner.lane, owner.control_ref);
    const recorded = binding.recorded_sha;
    const live = binding.type === 'FILE_BLOB'
      ? (binding.ref ? blobSha(root, binding.ref) : null)
      : (liveHeads ? lsRemote(root, binding.ref || owner.control_ref) : null);
    if (liveHeads && !SHA_RE.test(live || '')) {
      addFinding(findings, 'ERROR', 'OWNER_CONTROL_HEAD_UNRESOLVED', `live owner head could not be resolved for ${owner.lane}`, {
        lane: owner.lane,
        control_ref: owner.control_ref,
        control_binding_type: binding.type,
        control_binding_ref: binding.ref
      });
    } else if (liveHeads && SHA_RE.test(recorded || '') && SHA_RE.test(live || '') && recorded.toLowerCase() !== live.toLowerCase()) {
      addFinding(findings, 'ERROR', 'STALE_DELEGATION', `recorded owner head is stale for ${owner.lane}`, {
        lane: owner.lane,
        control_ref: owner.control_ref,
        control_binding_type: binding.type,
        control_binding_ref: binding.ref,
        recorded_sha: recorded,
        live_sha: live
      });
    }
    rows.push({
      ...owner,
      control_binding_type: binding.type,
      control_binding_ref: binding.ref,
      recorded_sha: recorded,
      live_sha: live
    });
  }
  if (!liveHeads && !fixtureMode) addFinding(findings, 'ERROR', 'LIVE_OWNER_HEADS_NOT_CHECKED', 'production repair preflight requires fresh live owner heads');
  return rows;
}

function collectClaims(root, secondShiftRegistry, findings) {
  const activeClaims = [];
  for (const [lane, rel] of Object.entries(secondShiftRegistry?.owner_files || {})) {
    if (!exists(root, rel)) continue;
    const data = readJson(root, rel);
    const claimed = (data.active_delegations || []).filter((row) => row.state === 'CLAIMED');
    if (claimed.length > 1) addFinding(findings, 'ERROR', 'OVERLAPPING_MUTATION_CLAIM', `multiple live claims found for ${lane}`, { lane, count: claimed.length });
    for (const row of claimed) activeClaims.push({ lane, delegation_id: row.delegation_id || null, objective_id: row.objective_id || null, valid_for_control_head: row.valid_for_control_head || null });
  }
  return activeClaims;
}

function inspectLiveContracts(root, authority, topology, selectedControls, findings) {
  const checked = [];
  const topologyId = topology.topology_id || null;
  const retired = new Set(authority.retired_systems || []);
  const brokerPath = selectedControls.repair_broker_contract?.path;
  if (brokerPath && exists(root, brokerPath)) {
    const text = readText(root, brokerPath);
    checked.push({ path: brokerPath, blob_sha: blobSha(root, brokerPath), role: 'REPAIR_BROKER_CONTRACT' });
    if (topologyId && !text.includes(topologyId)) {
      addFinding(findings, 'ERROR', 'LIVE_TOPOLOGY_REFERENCE_STALE', 'live repair broker contract does not bind the selected topology', { path: brokerPath, expected_topology_id: topologyId });
    }
    if (retired.has('PROSE') && /completed\s+active\s+specialist\s+child/i.test(text)) {
      addFinding(findings, 'ERROR', 'COMPLETION_OR_RETIREMENT_DRIFT', 'live repair broker contract describes retired PROSE as an active child', { path: brokerPath, system_id: 'PROSE' });
    }
  }
  return checked;
}

function inspectExecutables(root, authority, selectedControls, findings) {
  const checked = [];
  const broker = '.github/scripts/a01-repair-broker.js';
  if (exists(root, broker)) {
    const text = readText(root, broker);
    checked.push({ path: broker, blob_sha: blobSha(root, broker), role: 'REPAIR_BROKER_EXECUTABLE' });
    if (!text.includes('CURRENT-AUTHORITY.json') || !text.includes('execution_lane_owner_map')) {
      addFinding(findings, 'ERROR', 'EXECUTABLE_CONTRACT_DIVERGENCE', 'repair broker executable is not visibly authority/topology driven', { path: broker });
    }
  } else {
    addFinding(findings, 'ERROR', 'MISSING_LIVE_CONTROL', 'repair broker executable is missing', { path: broker });
  }
  for (const key of ['state_reconciler_script']) {
    const rel = selectedControls[key]?.path;
    if (rel && exists(root, rel)) checked.push({ path: rel, blob_sha: blobSha(root, rel), role: key.toUpperCase() });
  }
  return checked;
}

function runReconciler(root, authority, findings, enabled) {
  if (!enabled) return { executed: false, standing: 'NOT_RUN', report: null };
  const script = authority.state_reconciler_script;
  if (!script || !exists(root, script)) {
    addFinding(findings, 'ERROR', 'MISSING_LIVE_CONTROL', 'state reconciler script is missing', { path: script || null });
    return { executed: false, standing: 'MISSING', report: null };
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a01-repair-preflight-'));
  try {
    const result = spawnSync(process.execPath, [path.join(root, script), `--out=${outDir}`], { cwd: root, encoding: 'utf8' });
    const reportPath = path.join(outDir, 'SYSTEM-STATE-DRIFT-REPORT.json');
    const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
    if (result.status !== 0 || report?.standing !== 'PASS') {
      addFinding(findings, 'ERROR', 'SYSTEM_STATE_RECONCILER_DRIFT', 'System State Reconciler did not report PASS', { exit_status: result.status, reconciler_standing: report?.standing || null });
    }
    return { executed: true, standing: report?.standing || (result.status === 0 ? 'PASS' : 'FAIL'), report };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

export function evaluateRepository(root, options = {}) {
  const liveHeads = options.liveHeads !== false;
  const runStateReconciler = options.runStateReconciler !== false;
  const fixtureMode = options.fixtureMode === true;
  const findings = [];
  const repositoryCommitSha = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toLowerCase();
  const repositoryTreeSha = git(root, ['rev-parse', '--verify', 'HEAD^{tree}']).toLowerCase();
  const treeEntries = git(root, ['ls-tree', '-r', '--full-tree', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean);
  const authorityPath = 'governance/CURRENT-AUTHORITY.json';
  const authority = readJson(root, authorityPath);
  const authorityBlob = blobSha(root, authorityPath);
  if (!SHA_RE.test(authorityBlob || '')) throw new Error('CURRENT_AUTHORITY_BLOB_UNRESOLVED');
  const selectedControls = resolveSelectedControls(root, authority, findings);
  const topology = selectedControls.topology?.path && exists(root, selectedControls.topology.path) ? readJson(root, selectedControls.topology.path) : {};
  const secondShiftRegistry = selectedControls.second_shift_registry?.path && exists(root, selectedControls.second_shift_registry.path) ? readJson(root, selectedControls.second_shift_registry.path) : {};
  const ownerHeads = collectOwnerHeads(root, topology, secondShiftRegistry, findings, liveHeads, fixtureMode);
  const activeClaims = collectClaims(root, secondShiftRegistry, findings);
  const liveControlDocumentsChecked = inspectLiveContracts(root, authority, topology, selectedControls, findings);
  const executableControlsChecked = inspectExecutables(root, authority, selectedControls, findings);
  const reconciler = runReconciler(root, authority, findings, runStateReconciler);
  const blocking = findings.filter((row) => row.severity === 'ERROR' && BLOCKING.has(row.type));
  return {
    report_version: 1,
    read_only: true,
    repository_commit_sha: repositoryCommitSha,
    repository_tree_sha: repositoryTreeSha,
    tree_entry_count: treeEntries.length,
    tree_enumeration_complete: true,
    authority_id: String(authority.authority_id || ''),
    current_authority_blob_sha: authorityBlob.toLowerCase(),
    selected_controls: selectedControls,
    owner_heads: ownerHeads,
    active_claims: activeClaims,
    live_control_documents_checked: liveControlDocumentsChecked,
    executable_controls_checked: executableControlsChecked,
    findings,
    standing: blocking.length === 0 ? 'SAFE_TO_REPAIR' : 'REPAIR_BLOCKED_BY_STALE_CONTROL_TRUTH',
    captured_at: new Date().toISOString(),
    invalidated_by: [
      'repository_commit_changed',
      'current_authority_blob_changed',
      'selected_control_blob_changed',
      'owner_control_head_changed',
      'mutation_claim_changed'
    ],
    reconciler: { executed: reconciler.executed, standing: reconciler.standing }
  };
}
