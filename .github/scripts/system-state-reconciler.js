'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const args = new Set(process.argv.slice(2));
const noLive = args.has('--no-live');
const selftest = args.has('--selftest');
const outArg = process.argv.find((v) => v.startsWith('--out='));
const outDir = path.resolve(root, outArg ? outArg.slice('--out='.length) : '.state-reconciler');

function failEarly(message) {
  console.error(`SYSTEM_STATE_RECONCILER_FATAL: ${message}`);
  process.exit(2);
}

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) failEarly(`required file missing: ${rel}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (error) { failEarly(`invalid JSON ${rel}: ${error.message}`); }
}

function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function now() { return new Date().toISOString(); }
function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }

const findings = [];
function finding(severity, type, message, detail = {}) {
  findings.push({ severity, type, message, ...detail });
}

function uniqueCheck(items, field, registryName) {
  const seen = new Set();
  for (const item of items) {
    const value = item && item[field];
    if (!value) {
      finding('ERROR', 'BROKEN_REFERENCE', `${registryName} entry missing ${field}`);
      continue;
    }
    if (seen.has(value)) finding('ERROR', 'DUPLICATE_ID', `${registryName} duplicate ${field}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function liveHead(ref) {
  if (noLive) return null;
  try {
    const output = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (!output) return null;
    return output.split(/\s+/)[0] || null;
  } catch (error) {
    finding('WARN', 'LIVE_HEAD_UNAVAILABLE', `could not resolve live head for ${ref}`, { ref });
    return null;
  }
}

const ownerBases = new Set([
  'SYSTEM_MASTER/CORE',
  'SYSTEM_MASTER/LEARNING',
  'SYSTEM_MASTER/BOOK',
  'SYSTEM_MASTER/BOOK/PROSE',
  'SYSTEM_MASTER/SHARED_INFRASTRUCTURE'
]);

function validOwner(ownerPath) {
  if (typeof ownerPath !== 'string') return false;
  if (ownerPath === 'SYSTEM_MASTER') return true;
  for (const base of ownerBases) {
    if (ownerPath === base || ownerPath.startsWith(`${base}/`)) return true;
  }
  return false;
}

function expectedOwnerPath(id) {
  if (id === 'CORE') return 'SYSTEM_MASTER/CORE';
  if (id === 'LEARNING') return 'SYSTEM_MASTER/LEARNING';
  if (id === 'BOOK') return 'SYSTEM_MASTER/BOOK';
  if (id === 'PROSE') return 'SYSTEM_MASTER/BOOK/PROSE';
  return null;
}

function registeredExecutableMustExistOnCurrentCheckout(q) {
  return q?.source === 'control_plane';
}

function repairAuthorityViolation(tx) {
  return tx?.promotion_authorized === true || tx?.authoritative_pass === true || tx?.a01_pass === true ||
    tx?.publication_authorized === true || tx?.production_authorized === true ||
    String(tx?.result_class || '').toUpperCase() === 'PASS';
}

if (selftest) {
  const checks = [
    ['product_root_owner_is_valid', validOwner('SYSTEM_MASTER') === true],
    ['known_core_owner_is_valid', validOwner('SYSTEM_MASTER/CORE') === true],
    ['unknown_peer_owner_is_invalid', validOwner('SYSTEM_MASTER/UNKNOWN') === false],
    ['control_plane_executable_is_checkout_scoped', registeredExecutableMustExistOnCurrentCheckout({ source: 'control_plane' }) === true],
    ['subject_executable_is_not_main_scoped', registeredExecutableMustExistOnCurrentCheckout({ source: 'subject' }) === false],
    ['repair_worker_cannot_claim_pass', repairAuthorityViolation({ authoritative_pass: true }) === true],
    ['repair_transaction_without_authority_is_clean', repairAuthorityViolation({ promotion_authorized: false, authoritative_pass: false }) === false],
    ['prose_owner_path_is_nested_under_book', expectedOwnerPath('PROSE') === 'SYSTEM_MASTER/BOOK/PROSE']
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`);
  if (failed.length) {
    console.error(`SYSTEM_STATE_RECONCILER_SELFTEST_FAIL count=${failed.length}`);
    process.exit(1);
  }
  console.log('SYSTEM_STATE_RECONCILER_SELFTEST_PASS');
  process.exit(0);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const topology = readJson('governance/SYSTEM-TOPOLOGY-002.json');
const completion = readJson('governance/COMPLETION-LEDGER-001.json');
const obligations = readJson('governance/WORK-OBLIGATION-REGISTRY-001.json');
const expectations = readJson('governance/EXPECTATION-REGISTRY-001.json');
const reallocations = readJson('governance/REALLOCATION-LEDGER-001.json');
const secondShift = readJson('governance/second-shift/SECOND-SHIFT-REGISTRY-001.json');
const repairRegistry = readJson('governance/repair/REPAIR-INBOX-REGISTRY-001.json');
const a01 = readJson('qualification/a01/registry.json');

if (topology.product_root?.product_id !== 'SYSTEM_MASTER') {
  finding('ERROR', 'EVIDENCE_MISMATCH', 'topology product root must be SYSTEM_MASTER');
}

const systems = topology.canonical_internal_systems || [];
const byId = Object.fromEntries(systems.map((s) => [s.system_id, s]));
for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) {
  if (!byId[id]) finding('ERROR', 'EVIDENCE_MISMATCH', `canonical system missing: ${id}`);
}
if (byId.CORE?.parent_id !== 'SYSTEM_MASTER') finding('ERROR', 'EVIDENCE_MISMATCH', 'CORE parent must be SYSTEM_MASTER');
if (byId.LEARNING?.parent_id !== 'SYSTEM_MASTER') finding('ERROR', 'EVIDENCE_MISMATCH', 'LEARNING parent must be SYSTEM_MASTER');
if (byId.BOOK?.parent_id !== 'SYSTEM_MASTER') finding('ERROR', 'EVIDENCE_MISMATCH', 'BOOK parent must be SYSTEM_MASTER');
if (byId.PROSE?.parent_id !== 'BOOK') finding('ERROR', 'EVIDENCE_MISMATCH', 'PROSE parent must be BOOK');

const completionEntries = completion.entries || [];
const obligationEntries = obligations.obligations || [];
uniqueCheck(completionEntries, 'completion_id', 'completion ledger');
uniqueCheck(obligationEntries, 'obligation_id', 'obligation registry');
uniqueCheck([...(expectations.architecture_expectations || []), ...(expectations.operating_expectations || [])], 'id', 'expectation registry');
uniqueCheck(reallocations.entries || [], 'source_label', 'reallocation ledger');

for (const entry of completionEntries) {
  if (!validOwner(entry.owner_path)) {
    finding('ERROR', 'UNALLOCATED', `completion has invalid/unallocated owner: ${entry.completion_id}`, { owner_path: entry.owner_path });
  }
}

const terminalObligationStates = new Set(['CLOSED', 'SUPERSEDED']);
for (const entry of obligationEntries) {
  if (!validOwner(entry.owner_path)) {
    finding('ERROR', 'UNALLOCATED', `obligation has invalid/unallocated owner: ${entry.obligation_id}`, { owner_path: entry.owner_path });
  }
  if (!entry.state) finding('ERROR', 'BROKEN_REFERENCE', `obligation missing state: ${entry.obligation_id}`);
  if (!terminalObligationStates.has(entry.state) && !entry.objective) {
    finding('ERROR', 'BROKEN_REFERENCE', `open obligation missing objective: ${entry.obligation_id}`);
  }
}

const laneMap = topology.execution_lane_owner_map || {};
for (const [qualificationId, q] of Object.entries(a01.qualifications || {})) {
  if (!q.workstream_id || !laneMap[q.workstream_id]) {
    finding('ERROR', 'UNALLOCATED', `A-01 qualification has unmapped workstream: ${qualificationId}`, { workstream_id: q.workstream_id || null });
  }
  if (!['subject', 'control_plane'].includes(q.source)) {
    finding('ERROR', 'EVIDENCE_MISMATCH', `A-01 qualification has unsupported source class: ${qualificationId}`, { source: q.source || null });
  }
  if (registeredExecutableMustExistOnCurrentCheckout(q) && q.executable === 'node' && Array.isArray(q.args) && q.args[0] && q.args[0].startsWith('.')) {
    if (!exists(q.args[0])) {
      finding('ERROR', 'REGISTERED_EXECUTABLE_MISSING', `control-plane A-01 executable missing on current checkout: ${qualificationId}`, {
        executable_path: q.args[0],
        workstream_id: q.workstream_id || null,
        source: q.source || null
      });
    }
  }
}

const live = { main: null, CORE: null, LEARNING: null, BOOK: null, PROSE: null };
if (!noLive) {
  live.main = liveHead('main');
  for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) {
    if (byId[id]?.control_ref) live[id] = liveHead(byId[id].control_ref);
  }
}

const delegationByOwner = {};
for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) {
  const rel = secondShift.owner_files?.[id];
  if (!rel || !exists(rel)) {
    finding('ERROR', 'BROKEN_REFERENCE', `Second Shift owner file missing for ${id}`, { path: rel || null });
    continue;
  }
  const data = readJson(rel);
  delegationByOwner[id] = data;
  const expectedPath = expectedOwnerPath(id);
  if (data.owner_system_id !== id) finding('ERROR', 'EVIDENCE_MISMATCH', `${id} delegation owner_system_id mismatch`);
  if (data.owner_path !== expectedPath) finding('ERROR', 'EVIDENCE_MISMATCH', `${id} delegation owner_path mismatch`, { owner_path: data.owner_path });
  if (data.control_ref !== byId[id]?.control_ref) finding('ERROR', 'EVIDENCE_MISMATCH', `${id} delegation control_ref mismatch`, { control_ref: data.control_ref });

  const active = data.active_delegations || [];
  uniqueCheck(active, 'delegation_id', `${id} delegation file`);
  for (const d of active) {
    const required = ['delegation_id','owner_path','objective_id','state','valid_for_control_ref','valid_for_control_head','created_at','last_revalidated_at','completion_delta','stop_condition','allowed_work','forbidden_authority','on_pass','on_failure'];
    for (const field of required) if (d[field] === undefined || d[field] === null || d[field] === '') {
      finding('ERROR', 'BROKEN_REFERENCE', `${id} active delegation ${d.delegation_id || '<unknown>'} missing ${field}`);
    }
    if (!['CANDIDATE', 'READY', 'CLAIMED'].includes(d.state)) {
      finding('ERROR', 'EVIDENCE_MISMATCH', `${id} active delegation has non-active state`, { delegation_id: d.delegation_id, state: d.state });
    }
    if (d.owner_path !== expectedPath) finding('ERROR', 'UNALLOCATED', `${id} active delegation owner mismatch`, { delegation_id: d.delegation_id });
    if (d.valid_for_control_ref !== byId[id]?.control_ref) finding('ERROR', 'EVIDENCE_MISMATCH', `${id} active delegation control-ref mismatch`, { delegation_id: d.delegation_id });
    if (live[id] && d.valid_for_control_head !== live[id]) {
      finding('ERROR', 'STALE_DELEGATION', `${id} active delegation is bound to a stale control head`, {
        delegation_id: d.delegation_id,
        delegated_head: d.valid_for_control_head,
        live_head: live[id]
      });
    }
  }
}

const allowedRepairStates = new Set([
  'REPAIR_REQUEST_READY', 'CLAIMED', 'CANDIDATE_PREQUAL_REQUIRED', 'A01_REQUEUE_READY',
  'OWNER_ACTION_REQUIRED', 'OWNER_AUTHORITY_REQUIRED', 'WAIT_FOR_PREDECESSOR',
  'REPLAN_ADMISSION', 'RETRY_REQUEST_READY'
]);
const repairInboxByOwner = {};
for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) {
  const rel = repairRegistry.owner_files?.[id];
  if (!rel || !exists(rel)) {
    finding('ERROR', 'BROKEN_REFERENCE', `repair inbox missing for ${id}`, { path: rel || null });
    continue;
  }
  const data = readJson(rel);
  repairInboxByOwner[id] = data;
  const expectedPath = expectedOwnerPath(id);
  if (data.owner_system_id !== id) finding('ERROR', 'REPAIR_OWNER_MISMATCH', `${id} repair inbox owner_system_id mismatch`, { declared: data.owner_system_id || null });
  if (data.owner_path !== expectedPath) finding('ERROR', 'REPAIR_OWNER_MISMATCH', `${id} repair inbox owner_path mismatch`, { owner_path: data.owner_path || null, expected: expectedPath });

  const active = data.active_transactions || [];
  const history = data.transaction_history || [];
  const activeIds = uniqueCheck(active, 'transaction_id', `${id} active repair inbox`);
  const historyIds = uniqueCheck(history, 'transaction_id', `${id} repair history`);
  for (const transactionId of activeIds) {
    if (historyIds.has(transactionId)) finding('ERROR', 'REPAIR_TRANSACTION_DUPLICATE', `${id} repair transaction is both active and historical`, { transaction_id: transactionId });
  }

  for (const tx of active) {
    const required = ['transaction_id','state','owner_path','receipt_id','qualification_id','workstream_id','failed_subject_sha','classification','repair_attempt','max_repair_attempts','created_at'];
    for (const field of required) if (tx[field] === undefined || tx[field] === null || tx[field] === '') {
      finding('ERROR', 'BROKEN_REFERENCE', `${id} repair transaction ${tx.transaction_id || '<unknown>'} missing ${field}`);
    }
    if (!allowedRepairStates.has(tx.state)) finding('ERROR', 'EVIDENCE_MISMATCH', `${id} repair transaction has invalid active state`, { transaction_id: tx.transaction_id, state: tx.state });
    if (!isSha(tx.failed_subject_sha)) finding('ERROR', 'REPAIR_LINEAGE_MISMATCH', `${id} repair transaction has invalid failed subject SHA`, { transaction_id: tx.transaction_id, failed_subject_sha: tx.failed_subject_sha || null });
    if (!Number.isInteger(tx.repair_attempt) || tx.repair_attempt < 0 || !Number.isInteger(tx.max_repair_attempts) || tx.max_repair_attempts < 0 || tx.max_repair_attempts > 2) {
      finding('ERROR', 'REPAIR_LINEAGE_MISMATCH', `${id} repair transaction has invalid attempt budget`, { transaction_id: tx.transaction_id, repair_attempt: tx.repair_attempt, max_repair_attempts: tx.max_repair_attempts });
    }
    if (repairAuthorityViolation(tx)) finding('ERROR', 'REPAIR_AUTHORITY_VIOLATION', `${id} repair transaction attempts to grant authority`, { transaction_id: tx.transaction_id });

    const mappedSystem = laneMap[tx.workstream_id] || null;
    const sharedInfra = tx.owner_path?.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01');
    if (!mappedSystem) {
      finding('ERROR', 'UNALLOCATED_REPAIR', `${id} repair transaction workstream is unmapped`, { transaction_id: tx.transaction_id, workstream_id: tx.workstream_id });
    } else if (sharedInfra) {
      if (id !== 'CORE') finding('ERROR', 'REPAIR_OWNER_MISMATCH', `${id} inbox cannot administratively hold shared A-01 infrastructure transaction`, { transaction_id: tx.transaction_id, owner_path: tx.owner_path });
      if (!['RETRY_REQUEST_READY', 'REPLAN_ADMISSION'].includes(tx.state)) finding('ERROR', 'REPAIR_OWNER_MISMATCH', `shared A-01 infrastructure transaction has unsupported active state`, { transaction_id: tx.transaction_id, state: tx.state });
    } else {
      const mappedOwnerPath = expectedOwnerPath(mappedSystem);
      if (mappedSystem !== id || tx.owner_path !== mappedOwnerPath) {
        finding('ERROR', 'REPAIR_OWNER_MISMATCH', `${id} repair transaction does not match canonical workstream owner`, {
          transaction_id: tx.transaction_id,
          workstream_id: tx.workstream_id,
          mapped_system: mappedSystem,
          owner_path: tx.owner_path,
          expected_owner_path: mappedOwnerPath
        });
      }
    }

    if (tx.state === 'A01_REQUEUE_READY') {
      if (!isSha(tx.replacement_subject_sha) || String(tx.replacement_subject_sha).toLowerCase() === String(tx.failed_subject_sha).toLowerCase()) {
        finding('ERROR', 'REPAIR_LINEAGE_MISMATCH', `${id} A01_REQUEUE_READY transaction lacks a changed exact SHA`, { transaction_id: tx.transaction_id });
      }
      if (!tx.prequalification_evidence_pointer) finding('ERROR', 'REPAIR_LINEAGE_MISMATCH', `${id} A01_REQUEUE_READY transaction lacks prequalification evidence`, { transaction_id: tx.transaction_id });
    }
  }
}

let census = null;
if (authority.active_census && exists(authority.active_census)) {
  census = readJson(authority.active_census);
  const wm = census.watermark || {};
  if (live.main && wm.main && live.main !== wm.main) {
    finding('WARN', 'AUTHORITY_DELTA', 'main advanced after census watermark', { watermark: wm.main, live: live.main });
  }
  for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) {
    if (live[id] && wm[id] && live[id] !== wm[id]) {
      finding('WARN', 'AUTHORITY_DELTA', `${id} advanced after census watermark`, { owner: id, watermark: wm[id], live: live[id] });
    }
  }
}

for (const rel of [
  authority.topology,
  authority.completion_ledger,
  authority.obligation_registry,
  authority.expectation_registry,
  authority.reallocation_ledger,
  authority.second_shift_registry,
  authority.second_shift_operating_mode,
  authority.repair_inbox_registry,
  authority.repair_broker_contract,
  authority.state_reconciler_contract,
  authority.state_reconciler_workflow,
  authority.closed_loop_repair_sidecar,
  authority.active_census
].filter(Boolean)) {
  if (!exists(rel)) finding('ERROR', 'BROKEN_REFERENCE', `CURRENT-AUTHORITY points to missing file: ${rel}`);
}

const openByOwner = {};
for (const owner of ownerBases) openByOwner[owner] = [];
openByOwner.SYSTEM_MASTER = [];
for (const o of obligationEntries.filter((x) => !terminalObligationStates.has(x.state))) {
  (openByOwner[o.owner_path] ||= []).push({ obligation_id: o.obligation_id, state: o.state, objective: o.objective, blocker_class: o.blocker_class || null });
}

const completionCountByOwner = {};
for (const e of completionEntries) completionCountByOwner[e.owner_path] = (completionCountByOwner[e.owner_path] || 0) + 1;

const derived = {
  generated_at: now(),
  product_root: 'SYSTEM_MASTER',
  source_authority: 'governance/CURRENT-AUTHORITY.json',
  live_heads: live,
  owners: {},
  shared_infrastructure: {
    open_obligations: obligationEntries.filter((o) => o.owner_path?.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE') && !terminalObligationStates.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective }))
  },
  product_governance: {
    open_obligations: obligationEntries.filter((o) => o.owner_path === 'SYSTEM_MASTER' && !terminalObligationStates.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective }))
  },
  repair_control: {
    registry_id: repairRegistry.registry_id || null,
    broker_contract: repairRegistry.broker_contract || null,
    active_transaction_count: Object.values(repairInboxByOwner).reduce((sum, inbox) => sum + (inbox.active_transactions || []).length, 0)
  },
  census: census ? { census_id: census.census_id, standing: census.standing, first_incomplete_phase: (census.phases || []).find((p) => p.status !== 'COMPLETE')?.phase_id || null } : null
};
for (const id of ['CORE', 'LEARNING', 'BOOK', 'PROSE']) {
  const ownerPath = expectedOwnerPath(id);
  derived.owners[id] = {
    owner_path: ownerPath,
    control_ref: byId[id]?.control_ref || null,
    live_control_head: live[id],
    completion_count: completionCountByOwner[ownerPath] || 0,
    open_obligations: obligationEntries.filter((o) => o.owner_path === ownerPath && !terminalObligationStates.has(o.state)).map((o) => ({ obligation_id: o.obligation_id, state: o.state, objective: o.objective, blocker_class: o.blocker_class || null })),
    active_delegations: (delegationByOwner[id]?.active_delegations || []).map((d) => ({ delegation_id: d.delegation_id, objective_id: d.objective_id, state: d.state, valid_for_control_head: d.valid_for_control_head })),
    active_repair_transactions: (repairInboxByOwner[id]?.active_transactions || []).map((tx) => ({ transaction_id: tx.transaction_id, state: tx.state, receipt_id: tx.receipt_id, qualification_id: tx.qualification_id, workstream_id: tx.workstream_id, failed_subject_sha: tx.failed_subject_sha, replacement_subject_sha: tx.replacement_subject_sha || null }))
  };
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const warnings = findings.filter((f) => f.severity === 'WARN');
const report = {
  generated_at: now(),
  standing: errors.length ? 'DRIFT_DETECTED' : 'PASS',
  error_count: errors.length,
  warning_count: warnings.length,
  findings
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'DERIVED-CURRENT-STATE.json'), JSON.stringify(derived, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'SYSTEM-STATE-DRIFT-REPORT.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`SYSTEM_STATE_RECONCILER_${report.standing}`);
console.log(`errors=${errors.length}`);
console.log(`warnings=${warnings.length}`);
console.log(`active_repair_transactions=${derived.repair_control.active_transaction_count}`);
for (const f of findings) console.log(`${f.severity}:${f.type}:${f.message}`);

process.exit(errors.length ? 1 : 0);
