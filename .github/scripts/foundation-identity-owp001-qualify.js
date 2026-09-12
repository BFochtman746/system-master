'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const tempRoot = process.env.RUNNER_TEMP || os.tmpdir();
const evidence = fs.mkdtempSync(path.join(tempRoot, 'foundation-identity-owp001-'));
const packageRoot = path.join(root, 'system-master', 'foundation-spine', 'identity');
const classes = path.join(evidence, 'classes');
fs.mkdirSync(classes, { recursive: true });

const requiredRq = new Set([
  'O-RQ-001','O-RQ-002','O-RQ-005','O-RQ-051','O-RQ-052','O-RQ-055',
  'O-RQ-102','O-RQ-103','O-RQ-104','O-RQ-157','O-RQ-158','O-RQ-159',
  'O-RQ-160','O-RQ-161','O-RQ-162','O-RQ-163','O-RQ-256','O-RQ-271',
  'O-RQ-288','O-RQ-289','O-RQ-300','O-RQ-316'
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: process.env,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (options.evidence) fs.writeFileSync(path.join(evidence, options.evidence), stdout + stderr, 'utf8');
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error ? result.error.message : `exit ${result.status}`}\n${stdout}${stderr}`);
  }
  return stdout.trim();
}

function collectJava(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJava(absolute));
    else if (entry.isFile() && entry.name.endsWith('.java')) out.push(absolute);
  }
  return out.sort();
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function validateTraceability() {
  const file = path.join(packageRoot, 'O-WP-001-TRACEABILITY.json');
  const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (trace.package_id !== 'O-WP-001') throw new Error('traceability package id mismatch');
  if (trace.historical_package_sha256 !== 'cc8d7567ee2a1f307eba7add206d5c12c25db5a6dfa4fe7d09fc8499db21cc37') {
    throw new Error('historical package digest mismatch');
  }
  if (trace.unaccounted_requirement_count !== 0) throw new Error('unaccounted requirements are nonzero');
  const observed = new Set((trace.requirements || []).map((row) => row.id));
  if (observed.size !== requiredRq.size) throw new Error(`requirement denominator mismatch: ${observed.size}`);
  for (const id of requiredRq) if (!observed.has(id)) throw new Error(`missing exact requirement ${id}`);
  for (const id of observed) if (!requiredRq.has(id)) throw new Error(`unexpected O-WP-001 requirement ${id}`);
  for (const row of trace.requirements) {
    if (!Array.isArray(row.sources) || row.sources.length === 0) throw new Error(`${row.id} missing source mapping`);
    if (!Array.isArray(row.tests) || row.tests.length === 0) throw new Error(`${row.id} missing test/evidence mapping`);
    if (!row.standing) throw new Error(`${row.id} missing standing`);
  }
  fs.writeFileSync(path.join(evidence, 'traceability.json'), JSON.stringify({
    package_id: trace.package_id,
    historical_package_sha256: trace.historical_package_sha256,
    exact_requirement_count: observed.size,
    unaccounted_requirement_count: trace.unaccounted_requirement_count,
    result: 'PASS'
  }, null, 2) + '\n');
}

try {
  const subject = run('git', ['rev-parse', 'HEAD']);
  run('git', ['merge-base', '--is-ancestor', '2e6ab006a48a5908d59642d36c567f447c66f49b', 'HEAD']);
  fs.writeFileSync(path.join(evidence, 'subject.txt'), [
    'component=Foundation Identity O-WP-001',
    `commit=${subject}`,
    'base_core_subject=2e6ab006a48a5908d59642d36c567f447c66f49b',
    'historical_package_sha256=cc8d7567ee2a1f307eba7add206d5c12c25db5a6dfa4fe7d09fc8499db21cc37',
    'qualification_class=HOSTED_PORTABLE_CANDIDATE',
    'production_persistence=NOT_CLAIMED_REFERENCE_ADAPTER_ONLY',
    'a01_native_production=NOT_CLAIMED',
    ''
  ].join('\n'));

  run('java', ['-version'], { evidence: 'java-version.txt' });
  run('javac', ['-version'], { evidence: 'javac-version.txt' });
  validateTraceability();

  const sources = collectJava(path.join(packageRoot, 'src', 'main', 'java'));
  const tests = collectJava(path.join(packageRoot, 'src', 'test', 'java'));
  if (sources.length < 5) throw new Error(`unexpectedly small identity source set: ${sources.length}`);
  if (tests.length < 2) throw new Error(`unexpectedly small identity test set: ${tests.length}`);
  const all = [...sources, ...tests];
  const digests = Object.fromEntries(all.map((file) => [path.relative(root, file), sha256File(file)]));
  fs.writeFileSync(path.join(evidence, 'source-digests.json'), JSON.stringify(digests, null, 2) + '\n');

  run('javac', ['--release', '21', '-Xlint:all,-try', '-Werror', '-d', classes, ...all], { evidence: 'compile.txt' });
  const qualification = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.PrincipalIdentityQualificationTest'], { evidence: 'identity-qualification.txt' });
  if (!qualification.includes('PASS FOUNDATION_IDENTITY_OWP001 tests=24')) throw new Error('identity qualification completion predicate missing');
  const performance = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.PrincipalIdentityPerformanceTest'], { evidence: 'identity-performance.txt' });
  if (!performance.includes('PASS FOUNDATION_IDENTITY_OWP001_PERFORMANCE')) throw new Error('identity performance completion predicate missing');

  // Cumulative regression: the unchanged Foundation System Root must still pass on the exact candidate checkout.
  const rootRegression = run('node', ['.github/scripts/foundation-system-root-qualify.js'], { evidence: 'system-root-cumulative-regression.txt' });
  if (!rootRegression.includes('PASS FOUNDATION_SYSTEM_ROOT_HOSTED')) throw new Error('System Root cumulative regression predicate missing');

  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=PASS\n');
  console.log(qualification);
  console.log(performance);
  console.log('PASS FOUNDATION_IDENTITY_OWP001_HOSTED_PORTABLE');
  console.log('PASS FOUNDATION_SYSTEM_ROOT_PLUS_IDENTITY_OWP001_CUMULATIVE');
  console.log(`evidence_dir=${evidence}`);
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=FAIL\n');
  fs.writeFileSync(path.join(evidence, 'failure.txt'), `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  console.error(`evidence_dir=${evidence}`);
  process.exit(1);
}
