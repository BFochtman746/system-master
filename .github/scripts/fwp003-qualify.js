'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const javaSources = require('./lib/java-sources');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-003';
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(process.env.RUNNER_TEMP || path.join(workspace, '.tmp'), `system-master-fwp003-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

function write(name, value) {
  fs.writeFileSync(path.join(evidenceDir, name), value.endsWith('\n') ? value : value + '\n', 'utf8');
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function git(args, encoding = 'utf8') {
  const r = spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], {
    cwd: workspace, encoding, shell: false, windowsHide: true
  });
  if (r.error || r.status !== 0) {
    throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error ? r.error.message : String(r.stderr || r.stdout)}`);
  }
  return r.stdout;
}
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, {
    cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true, ...options
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error || r.status !== 0) throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error ? r.error.message : out}`);
  return out;
}
function gate(gates, authority) {
  const found = gates.find(g => g.authority === authority);
  if (!found) throw new Error(`CONTRACT_GATE_MISSING:${authority}`);
  return found;
}

try {
  const head = git(['rev-parse', 'HEAD']).trim();
  const baseline = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'BASELINE-BINDING.json'), 'utf8'));
  const expectedPredecessor = '9a540c7f2d06c71c61d01de27f7076571fa8aeb5';
  if (baseline.hard_predecessor.qualified_commit !== expectedPredecessor) {
    throw new Error(`F_WP_002_BASELINE_BINDING_MISMATCH:${baseline.hard_predecessor.qualified_commit}`);
  }
  git(['merge-base', '--is-ancestor', expectedPredecessor, 'HEAD']);

  const contracts = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'CONTRACT-GATE-BINDING.json'), 'utf8'));
  if (contracts.gate_adjudication !== 'SATISFIED_FOR_F_WP_003_BOUNDED_READ_ONLY_CONSUMPTION') {
    throw new Error(`CONTRACT_GATE_ADJUDICATION_MISMATCH:${contracts.gate_adjudication}`);
  }
  const n = gate(contracts.gates, '021N');
  const q = gate(contracts.gates, '021Q');
  const k = gate(contracts.gates, '021K');
  const y = gate(contracts.gates, '021Y');
  const closed = 'ARCHITECTURE_BUILD_SPEC_CLOSED_REQUALIFIED_DEPENDENCY_VALID';
  if (n.standing !== closed || q.standing !== closed || k.standing !== closed) {
    throw new Error(`N_Q_K_CONTRACT_GATE_NOT_CLOSED:n=${n.standing}:q=${q.standing}:k=${k.standing}`);
  }
  if (y.standing !== 'SOURCE_SURFACE_ADAPTER_LOGICAL_CONTRACT_FROZEN_PARENT_ADVANCEMENT_NOT_CLAIMED'
      || y.mode !== 'READ_ONLY_BOUNDED') {
    throw new Error(`Y_CONTRACT_GATE_BOUNDARY_MISMATCH:${y.standing}:${y.mode}`);
  }
  if (!Array.isArray(contracts.not_claimed)
      || !contracts.not_claimed.includes('021Y full computer implementation')
      || !contracts.not_claimed.includes('021Y executable qualification')) {
    throw new Error('Y_NONCLAIM_BOUNDARY_MISSING');
  }

  const requirements = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'REQUIREMENTS.json'), 'utf8'));
  const requiredIds = ['F-RQ-002', 'F-RQ-005', 'F-RQ-006', 'F-RQ-007', 'F-RQ-008'];
  const actualIds = requirements.requirements.map(r => r.id).sort();
  if (actualIds.length !== requiredIds.length || actualIds.join('|') !== [...requiredIds].sort().join('|')) {
    throw new Error(`REQUIREMENT_SET_MISMATCH:${actualIds.join(',')}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json'), 'utf8'));
  if (manifest.predecessor_commit !== expectedPredecessor || manifest.files.length !== 5) {
    throw new Error('SOURCE_MANIFEST_SCOPE_MISMATCH');
  }
  const sealLines = [];
  for (const entry of manifest.files) {
    const repoPath = `${packageRoot}/${entry.path}`;
    const bytes = git(['show', `HEAD:${repoPath}`], null);
    const digest = sha256(bytes);
    sealLines.push(`${entry.path}\t${bytes.length}\t${digest}`);
    if (bytes.length !== entry.size) {
      throw new Error(`SEALED_SIZE_MISMATCH:${entry.path}:${bytes.length}:${entry.size}`);
    }
    if (digest !== entry.sha256) {
      throw new Error(`SEALED_HASH_MISMATCH:${entry.path}:${digest}:${entry.sha256}`);
    }
  }
  write('seal.txt', sealLines.join('\n'));

  const predecessor = run('node', ['.github/scripts/fwp002-qualify.js']);
  if (!predecessor.includes('PASS F-WP-002 tests=18 requirements=6')) {
    throw new Error(`F_WP_002_REGRESSION_NOT_PROVEN:${predecessor}`);
  }
  write('dependency-fwp002.txt', predecessor);

  const classes = path.join(evidenceDir, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  // Derived from the seal-verified SOURCE-SLICE-MANIFEST of this package and its
  // upstream dependency, so the compiled set cannot drift from the sealed set.
  // Canonical build definition for these sources is the repository-root pom.xml.
  const sources = javaSources.compileList(workspace, packageRoot, [
    'system-master/f-wp-002'
  ]);
  const compileOut = run('javac', ['-encoding', 'UTF-8', '-d', classes, ...sources]);
  write('compile.txt', compileOut || 'javac=PASS');

  const testOut = run('java', ['-cp', classes, 'org.systemmaster.core.Fwp003QualificationTest']);
  write('qualification.txt', testOut);
  if (!testOut.includes('PASS F-WP-003 tests=25 requirements=5')) {
    throw new Error(`QUALIFICATION_SENTINEL_MISSING:${testOut}`);
  }

  write('contract-gates.txt', [
    `021N=${n.standing}`,
    `021Q=${q.standing}`,
    `021K=${k.standing}`,
    `021Y=${y.standing}`,
    `021Y_mode=${y.mode}`,
    `gate_adjudication=${contracts.gate_adjudication}`
  ].join('\n'));
  write('subject.txt', [
    'objective=SYSTEM-MASTER-F-WP-003-CONTRACT-GATE-VERIFY-A01-IMPLEMENT-QUALIFY-001',
    `commit=${head}`,
    `branch=${process.env.GITHUB_REF_NAME || ''}`,
    `runner=${process.env.RUNNER_NAME || ''}`,
    `machine=${process.env.COMPUTERNAME || ''}`,
    `predecessor_commit=${baseline.hard_predecessor.qualified_commit}`,
    `predecessor_run=${baseline.hard_predecessor.workflow_run_id}`,
    `predecessor_evidence_sha256=${baseline.hard_predecessor.evidence_artifact_sha256}`
  ].join('\n'));
  write('result.txt', [
    'result=PASS',
    'tests=25',
    'requirements=5',
    'fwp002_regression=PASS',
    'contract_gate=PASS_BOUNDED',
    '021Y_full_implementation_claimed=false'
  ].join('\n'));
  console.log('PASS F-WP-003 tests=25 requirements=5');
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  const detail = error && error.stack ? error.stack : String(error);
  write('failure.txt', detail);
  write('result.txt', 'result=FAIL_OR_INCOMPLETE');
  console.error(detail);
  process.exit(1);
}
