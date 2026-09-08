'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP;
const runId = process.env.GITHUB_RUN_ID || 'local';
if (!runnerTemp) {
  throw new Error('RUNNER_TEMP_NOT_SET');
}

const packageRoot = path.join(workspace, 'system-master', 'f-wp-001');
const evidenceDir = path.join(runnerTemp, `system-master-fwp001-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });
const gitTrust = ['-c', `safe.directory=${workspace}`];

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function writeEvidence(name, content) {
  fs.writeFileSync(path.join(evidenceDir, name), String(content), 'utf8');
}

function run(command, args, cwd = workspace) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  return {
    status: result.status,
    error: result.error,
    stdout,
    stderr,
    combined: `${stdout}${stderr}`,
  };
}

function runBuffer(command, args, cwd = workspace) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: null,
    windowsHide: true,
    shell: false,
  });
  return {
    status: result.status,
    error: result.error,
    stdout: result.stdout || Buffer.alloc(0),
    stderr: result.stderr || Buffer.alloc(0),
  };
}

function requireSuccess(label, result) {
  if (result.error) {
    throw new Error(`${label}:${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = result.combined !== undefined
      ? result.combined
      : `${result.stdout.toString('utf8')}${result.stderr.toString('utf8')}`;
    throw new Error(`${label}:exit=${result.status}\n${detail}`);
  }
}

function readGitBlob(repoPath) {
  const result = runBuffer('git', [...gitTrust, 'show', `HEAD:${repoPath}`]);
  requireSuccess(`GIT_BLOB_READ_FAILED:${repoPath}`, result);
  return result.stdout;
}

try {
  const head = run('git', [...gitTrust, 'rev-parse', 'HEAD']);
  requireSuccess('GIT_HEAD_FAILED', head);
  const commit = head.stdout.trim();

  writeEvidence('subject.txt', [
    'objective=SYSTEM-MASTER-F-WP-001-A01-REPO-BIND-IMPLEMENT-QUALIFY-001',
    `repository=${process.env.GITHUB_REPOSITORY || ''}`,
    `commit=${commit}`,
    `runner_name=${process.env.RUNNER_NAME || ''}`,
    `runner_os=${process.env.RUNNER_OS || ''}`,
    `runner_arch=${process.env.RUNNER_ARCH || ''}`,
    'source_standing=BOUNDED_RECOVERY_REBASE_ENGINEERING_BASELINE__NOT_LATEST_ORIGINAL_SOURCE',
    '',
  ].join('\n'));

  const javaVersion = run('java', ['-version']);
  requireSuccess('JAVA_NOT_AVAILABLE', javaVersion);
  writeEvidence('java-version.txt', javaVersion.combined);

  const javacVersion = run('javac', ['-version']);
  requireSuccess('JAVAC_NOT_AVAILABLE', javacVersion);
  writeEvidence('javac-version.txt', javacVersion.combined);

  const manifestPath = path.join(packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestBlob = readGitBlob('system-master/f-wp-001/control/SOURCE-SLICE-MANIFEST.json');
  const sliceReport = [
    `manifest_git_blob_sha256=${sha256Bytes(manifestBlob)}`,
    `manifest_worktree_sha256=${sha256File(manifestPath)}`,
    'verification_byte_source=git_blob_at_exact_HEAD',
  ];

  for (const entry of manifest.files) {
    const target = path.join(packageRoot, ...entry.path.split('/'));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error(`MISSING_WORKTREE_FILE:${entry.path}`);
    }
    const repoPath = `system-master/f-wp-001/${entry.path}`;
    const blob = readGitBlob(repoPath);
    const actualHash = sha256Bytes(blob);
    const actualSize = blob.length;
    sliceReport.push(`path=${entry.path} sha256=${actualHash} size=${actualSize}`);
    if (actualHash !== String(entry.sha256).toLowerCase()) {
      throw new Error(`SLICE_HASH_MISMATCH:${entry.path}`);
    }
    if (actualSize !== Number(entry.size)) {
      throw new Error(`SLICE_SIZE_MISMATCH:${entry.path}`);
    }
  }
  sliceReport.push('slice_verification=PASS');
  writeEvidence('source-slice-verification.txt', `${sliceReport.join('\n')}\n`);

  const transportEntries = manifest.files
    .filter((entry) => entry.kind === 'FIXTURE_TRANSPORT')
    .sort((a, b) => a.path.localeCompare(b.path));
  if (transportEntries.length !== 5) {
    throw new Error(`TRACE_FIXTURE_PART_COUNT_MISMATCH:${transportEntries.length}`);
  }

  const b64 = transportEntries
    .map((entry) => readGitBlob(`system-master/f-wp-001/${entry.path}`).toString('utf8').replace(/\s+/g, ''))
    .join('');
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new Error('TRACE_FIXTURE_BASE64_INVALID');
  }
  const fixtureBytes = Buffer.from(b64, 'base64');
  const normalizedRoundTrip = fixtureBytes.toString('base64').replace(/=+$/, '');
  if (normalizedRoundTrip !== b64.replace(/=+$/, '')) {
    throw new Error('TRACE_FIXTURE_BASE64_ROUNDTRIP_MISMATCH');
  }

  const fixture = path.join(runnerTemp, `021F-R1-ATOMIC-REQUIREMENTS-TRACEABILITY-${runId}.csv`);
  fs.writeFileSync(fixture, fixtureBytes);
  const fixtureHash = sha256File(fixture);
  const expectedFixtureHash = String(manifest.reconstructed_traceability_fixture_sha256).toLowerCase();
  writeEvidence('fixture-reconstruction.txt', [
    `parts=${transportEntries.length}`,
    `fixture_sha256=${fixtureHash}`,
    `expected_sha256=${expectedFixtureHash}`,
    '',
  ].join('\n'));
  if (fixtureHash !== expectedFixtureHash) {
    throw new Error('TRACE_FIXTURE_HASH_MISMATCH');
  }

  const classesDir = path.join(runnerTemp, `fwp001-classes-${runId}`);
  fs.mkdirSync(classesDir, { recursive: true });
  const sources = [
    path.join(packageRoot, 'src', 'main', 'java', 'org', 'systemmaster', 'core', 'TraceLink.java'),
    path.join(packageRoot, 'src', 'main', 'java', 'org', 'systemmaster', 'core', 'TraceabilityRegistry.java'),
    path.join(packageRoot, 'src', 'main', 'java', 'org', 'systemmaster', 'core', 'RebuildGovernance.java'),
    path.join(packageRoot, 'src', 'test', 'java', 'org', 'systemmaster', 'core', 'Fwp001QualificationTest.java'),
  ];
  const compile = run('javac', ['--release', String(manifest.java_release || 21), '-d', classesDir, ...sources]);
  writeEvidence('compile.txt', compile.combined);
  requireSuccess('F_WP_001_COMPILE_FAILED', compile);

  const baselineBinding = path.join(packageRoot, 'control', 'BASELINE-BINDING.json');
  const qualification = run('java', [
    '-cp', classesDir,
    'org.systemmaster.core.Fwp001QualificationTest',
    fixture,
    baselineBinding,
  ]);
  writeEvidence('qualification.txt', qualification.combined);
  requireSuccess('F_WP_001_QUALIFICATION_FAILED', qualification);

  const completionPredicate = String(manifest.completion_predicate);
  if (!qualification.combined.includes(completionPredicate)) {
    throw new Error(`F_WP_001_COMPLETION_PREDICATE_MISSING:${completionPredicate}`);
  }

  writeEvidence('result.txt', 'result=PASS\n');
  console.log(completionPredicate);
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  writeEvidence('result.txt', 'result=FAIL\n');
  writeEvidence('failure.txt', `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
