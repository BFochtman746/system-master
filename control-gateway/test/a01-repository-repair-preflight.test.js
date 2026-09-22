import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { evaluateRepository } from '../src/a01-repository-repair-preflight.js';

function write(root, rel, value) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture({ staleAuthority = false, staleLiveContract = false, historicalOldTopology = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a01-preflight-fixture-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.test']);
  git(root, ['config', 'user.name', 'fixture']);
  const authority = {
    authority_id: 'CURRENT-AUTHORITY-005',
    topology: staleAuthority ? 'governance/MISSING-TOPOLOGY.json' : 'governance/SYSTEM-TOPOLOGY-007.json',
    program_job_lock: 'governance/SYSTEM-PROGRAM-JOB-LOCK-001.json',
    system_completion_status: 'governance/SYSTEM-COMPLETION-STATUS-002.json',
    obligation_registry: 'governance/WORK-OBLIGATION-REGISTRY-017.json',
    repair_inbox_registry: 'governance/repair/REPAIR-INBOX-REGISTRY-001.json',
    repair_ledger_registry: 'governance/repair/REPAIR-LEDGER-REGISTRY-001.json',
    state_reconciler_contract: 'governance/reconciler/SYSTEM-STATE-RECONCILER-001.md',
    state_reconciler_script: '.github/scripts/system-state-reconciler.js',
    second_shift_registry: 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json',
    second_shift_execution_control: 'governance/second-shift/SECOND-SHIFT-EXECUTION-CONTROL-001.md',
    repair_broker_contract: 'governance/repair/A01-REPAIR-BROKER-001.md',
    retired_systems: ['PROSE']
  };
  write(root, 'governance/CURRENT-AUTHORITY.json', authority);
  write(root, 'governance/SYSTEM-TOPOLOGY-007.json', {
    topology_id: 'SYSTEM-TOPOLOGY-007',
    canonical_internal_systems: [{ system_id: 'CORE', owner_path: 'SYSTEM_MASTER/CORE', control_ref: 'core/control-v1' }]
  });
  for (const rel of [
    'governance/SYSTEM-PROGRAM-JOB-LOCK-001.json',
    'governance/SYSTEM-COMPLETION-STATUS-002.json',
    'governance/WORK-OBLIGATION-REGISTRY-017.json',
    'governance/repair/REPAIR-LEDGER-REGISTRY-001.json'
  ]) write(root, rel, {});
  write(root, 'governance/repair/REPAIR-INBOX-REGISTRY-001.json', { owner_files: { CORE: 'governance/repair/CORE-REPAIR-INBOX.json' } });
  write(root, 'governance/repair/CORE-REPAIR-INBOX.json', { active_transactions: [] });
  write(root, 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json', { owner_files: { CORE: 'governance/second-shift/CORE-DELEGATIONS.json' } });
  write(root, 'governance/second-shift/CORE-DELEGATIONS.json', { last_known_control_head: 'a'.repeat(40), active_delegations: [] });
  write(root, 'governance/second-shift/SECOND-SHIFT-EXECUTION-CONTROL-001.md', 'Topology SYSTEM-TOPOLOGY-007\n');
  write(root, 'governance/reconciler/SYSTEM-STATE-RECONCILER-001.md', 'Current authority reconciliation contract\n');
  write(root, '.github/scripts/system-state-reconciler.js', 'process.exit(0);\n');
  write(root, '.github/scripts/a01-repair-broker.js', "const a='CURRENT-AUTHORITY.json'; const b='execution_lane_owner_map';\n");
  write(root, 'governance/repair/A01-REPAIR-BROKER-001.md', staleLiveContract ? 'Canonical broker for SYSTEM-TOPOLOGY-004; PROSE is a completed active specialist child.\n' : 'Canonical broker for SYSTEM-TOPOLOGY-007; PROSE is historically retired.\n');
  if (historicalOldTopology) write(root, 'governance/history/OLD-TOPOLOGY-EVIDENCE.md', 'Historical SYSTEM-TOPOLOGY-004 evidence only.\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'fixture']);
  return root;
}

function evaluate(root) {
  return evaluateRepository(root, { liveHeads: false, runStateReconciler: false, fixtureMode: true });
}

test('healthy live projection is SAFE_TO_REPAIR in fixture mode', () => {
  const root = fixture();
  try {
    const report = evaluate(root);
    assert.equal(report.standing, 'SAFE_TO_REPAIR');
    assert.equal(report.tree_enumeration_complete, true);
    assert.match(report.repository_commit_sha, /^[0-9a-f]{40}$/);
    assert.match(report.repository_tree_sha, /^[0-9a-f]{40}$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('stale authority pointer fails closed', () => {
  const root = fixture({ staleAuthority: true });
  try {
    const report = evaluate(root);
    assert.equal(report.standing, 'REPAIR_BLOCKED_BY_STALE_CONTROL_TRUTH');
    assert.ok(report.findings.some((row) => row.type === 'CURRENT_AUTHORITY_REFERENCE_MISSING'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('stale live broker contract fails closed', () => {
  const root = fixture({ staleLiveContract: true });
  try {
    const report = evaluate(root);
    assert.equal(report.standing, 'REPAIR_BLOCKED_BY_STALE_CONTROL_TRUTH');
    assert.ok(report.findings.some((row) => row.type === 'LIVE_TOPOLOGY_REFERENCE_STALE'));
    assert.ok(report.findings.some((row) => row.type === 'COMPLETION_OR_RETIREMENT_DRIFT'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('historical superseded topology evidence does not block current repair', () => {
  const root = fixture({ historicalOldTopology: true });
  try {
    const report = evaluate(root);
    assert.equal(report.standing, 'SAFE_TO_REPAIR');
    assert.ok(!report.live_control_documents_checked.some((row) => row.path.includes('OLD-TOPOLOGY-EVIDENCE')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('FILE_BLOB owner control resolves from the committed control-record blob', () => {
  const root = fixture();
  try {
    const controlPath = 'governance/control-records/CORE-CONTROL-RECORD-001.json';
    write(root, controlPath, { control_record_id: 'CORE-CONTROL-RECORD-001' });
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'add file blob control']);
    const blob = git(root, ['rev-parse', `HEAD:${controlPath}`]);
    write(root, 'governance/second-shift/CORE-DELEGATIONS.json', {
      control_ref: 'core/control-v1',
      control_binding: { type: 'FILE_BLOB', path: controlPath },
      last_known_control_head: blob,
      active_delegations: []
    });
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'bind file blob control']);
    const report = evaluateRepository(root, { liveHeads: true, runStateReconciler: false, fixtureMode: true });
    assert.equal(report.standing, 'SAFE_TO_REPAIR');
    const owner = report.owner_heads.find((row) => row.lane === 'CORE');
    assert.equal(owner.control_binding_type, 'FILE_BLOB');
    assert.equal(owner.live_sha, blob);
    assert.equal(owner.recorded_sha, blob);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('changed live BRANCH_HEAD fails closed as STALE_DELEGATION', () => {
  const root = fixture();
  try {
    const remote = path.join(root, 'control-origin.git');
    git(root, ['init', '--bare', '-q', remote]);
    git(root, ['remote', 'add', 'origin', remote]);
    git(root, ['push', '-q', 'origin', 'HEAD:refs/heads/core/control-v1']);
    const report = evaluateRepository(root, { liveHeads: true, runStateReconciler: false, fixtureMode: true });
    assert.equal(report.standing, 'REPAIR_BLOCKED_BY_STALE_CONTROL_TRUTH');
    assert.ok(report.findings.some((row) => row.type === 'STALE_DELEGATION' && row.lane === 'CORE'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
