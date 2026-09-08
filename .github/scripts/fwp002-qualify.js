'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-002';
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(process.env.RUNNER_TEMP || path.join(workspace, '.tmp'), `system-master-fwp002-${runId}`);
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
  const baseline = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'BASELINE-BINDING.json'), 'utf8'));
  if (baseline.hard_predecessor.qualified_commit !== '2fa0748ca431152a248a0f2f6ca0835fda22e083') {
    throw new Error('F_WP_001_BASELINE_BINDING_MISMATCH');
  }
  git(['merge-base', '--is-ancestor', baseline.hard_predecessor.qualified_commit, 'HEAD']);

  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json'), 'utf8'));
  for (const entry of manifest.files) {
    const repoPath = `${packageRoot}/${entry.path}`;
    const bytes = git(['show', `HEAD:${repoPath}`], null);
    if (bytes.length !== entry.size) throw new Error(`SEALED_SIZE_MISMATCH:${entry.path}:${bytes.length}:${entry.size}`);
    const digest = sha256(bytes);
    if (digest !== entry.sha256) throw new Error(`SEALED_HASH_MISMATCH:${entry.path}:${digest}:${entry.sha256}`);
  }

  const predecessor = run('node', ['.github/scripts/fwp001-qualify.js']);
  if (!predecessor.includes('PASS F-WP-001 tests=12 requirements=60')) {
    throw new Error(`F_WP_001_REGRESSION_NOT_PROVEN:${predecessor}`);
  }
  write('dependency-fwp001.txt', predecessor);

  const classes = path.join(evidenceDir, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  const mainSource = path.join(workspace, packageRoot, 'src', 'main', 'java', 'org', 'systemmaster', 'core', 'ChangeRegistry.java');
  const testSource = path.join(workspace, packageRoot, 'src', 'test', 'java', 'org', 'systemmaster', 'core', 'Fwp002QualificationTest.java');
  const compileOut = run('javac', ['-encoding', 'UTF-8', '-d', classes, mainSource, testSource]);
  write('compile.txt', compileOut || 'javac=PASS');
  const testOut = run('java', ['-cp', classes, 'org.systemmaster.core.Fwp002QualificationTest']);
  write('qualification.txt', testOut);
  if (!testOut.includes('PASS F-WP-002 tests=18 requirements=6')) throw new Error(`QUALIFICATION_SENTINEL_MISSING:${testOut}`);

  write('subject.txt', [
    `objective=SYSTEM-MASTER-F-WP-002-A01-IMPLEMENT-QUALIFY-001`,
    `commit=${head}`,
    `branch=${process.env.GITHUB_REF_NAME || ''}`,
    `runner=${process.env.RUNNER_NAME || ''}`,
    `machine=${process.env.COMPUTERNAME || ''}`,
    `predecessor_commit=${baseline.hard_predecessor.qualified_commit}`,
    `predecessor_run=${baseline.hard_predecessor.workflow_run_id}`,
    `predecessor_evidence_sha256=${baseline.hard_predecessor.evidence_artifact_sha256}`
  ].join('\n'));
  write('result.txt', 'result=PASS\ntests=18\nrequirements=6\nfwp001_regression=PASS');
  console.log('PASS F-WP-002 tests=18 requirements=6');
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  const detail = error && error.stack ? error.stack : String(error);
  write('failure.txt', detail);
  write('result.txt', 'result=FAIL_OR_INCOMPLETE');
  console.error(detail);
  process.exit(1);
}
