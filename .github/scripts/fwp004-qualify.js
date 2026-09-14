'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const javaSources = require('./lib/java-sources');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-004';
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(process.env.RUNNER_TEMP || path.join(workspace, '.tmp'), `system-master-fwp004-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

function write(name, value) { fs.writeFileSync(path.join(evidenceDir, name), value.endsWith('\n') ? value : value + '\n', 'utf8'); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function git(args, encoding = 'utf8') {
  const r = spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding, shell: false, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error ? r.error.message : String(r.stderr || r.stdout)}`);
  return r.stdout;
}
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true, ...options });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error || r.status !== 0) throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error ? r.error.message : out}`);
  return out;
}

try {
  const head = git(['rev-parse', 'HEAD']).trim();
  const expectedPredecessor = 'd8e7feb803d9c213671db0484598b72852f005de';
  const baseline = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'BASELINE-BINDING.json'), 'utf8'));
  if (baseline.hard_predecessor.qualified_commit !== expectedPredecessor) {
    throw new Error(`F_WP_003_BASELINE_BINDING_MISMATCH:${baseline.hard_predecessor.qualified_commit}`);
  }
  git(['merge-base', '--is-ancestor', expectedPredecessor, 'HEAD']);

  const requirements = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'REQUIREMENTS.json'), 'utf8'));
  const requiredIds = ['F-RQ-009','F-RQ-018','F-RQ-019','F-RQ-020','F-RQ-021','F-RQ-023'].sort();
  const actualIds = requirements.requirements.map(r => r.id).sort();
  if (actualIds.length !== requiredIds.length || actualIds.join('|') !== requiredIds.join('|')) {
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
    if (bytes.length !== entry.size) throw new Error(`SEALED_SIZE_MISMATCH:${entry.path}:${bytes.length}:${entry.size}`);
    if (digest !== entry.sha256) throw new Error(`SEALED_HASH_MISMATCH:${entry.path}:${digest}:${entry.sha256}`);
  }
  write('seal.txt', sealLines.join('\n'));

  const predecessor = run('node', ['.github/scripts/fwp003-qualify.js']);
  if (!predecessor.includes('PASS F-WP-003 tests=25 requirements=5')) {
    throw new Error(`F_WP_003_REGRESSION_NOT_PROVEN:${predecessor}`);
  }
  write('dependency-fwp003.txt', predecessor);

  const classes = path.join(evidenceDir, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  // Derived from the seal-verified SOURCE-SLICE-MANIFEST of this package and its
  // upstream dependencies, so the compiled set cannot drift from the sealed set.
  // Canonical build definition for these sources is the repository-root pom.xml.
  const sources = javaSources.compileList(workspace, packageRoot, [
    'system-master/f-wp-002',
    'system-master/f-wp-003'
  ]);
  const compileOut = run('javac', ['-encoding', 'UTF-8', '-d', classes, ...sources]);
  write('compile.txt', compileOut || 'javac=PASS');
  const testOut = run('java', ['-cp', classes, 'org.systemmaster.core.Fwp004QualificationTest']);
  write('qualification.txt', testOut);
  if (!testOut.includes('PASS F-WP-004 tests=41 requirements=6')) throw new Error(`QUALIFICATION_SENTINEL_MISSING:${testOut}`);

  write('subject.txt', [
    'objective=SYSTEM-MASTER-F-WP-004-A01-IMPLEMENT-QUALIFY-001',
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
    'tests=41',
    'requirements=6',
    'fwp003_regression=PASS'
  ].join('\n'));
  console.log('PASS F-WP-004 tests=41 requirements=6');
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  const detail = error && error.stack ? error.stack : String(error);
  write('failure.txt', detail);
  write('result.txt', 'result=FAIL_OR_INCOMPLETE');
  console.error(detail);
  process.exit(1);
}
