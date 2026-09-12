'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const tempRoot = process.env.RUNNER_TEMP || os.tmpdir();
const evidence = fs.mkdtempSync(path.join(tempRoot, 'foundation-identity-owp002-'));
const packageRoot = path.join(root, 'system-master', 'foundation-spine', 'identity');
const classes = path.join(evidence, 'classes');
fs.mkdirSync(classes, { recursive: true });

const requiredRq = new Set([
  'O-RQ-003','O-RQ-004','O-RQ-053','O-RQ-054','O-RQ-105','O-RQ-106','O-RQ-164',
  'O-RQ-165','O-RQ-166','O-RQ-167','O-RQ-272','O-RQ-310','O-RQ-317'
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
  const file = path.join(packageRoot, 'O-WP-002-TRACEABILITY.json');
  const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (trace.package_id !== 'O-WP-002') throw new Error('traceability package id mismatch');
  if (trace.base_core_subject_at_build_start !== '4da156f9707c2f9aa31984d3fb958fd01e5b375b') throw new Error('base CORE subject mismatch');
  if (trace.unaccounted_requirement_count !== 0) throw new Error('unaccounted requirements are nonzero');
  const observed = new Set((trace.requirements || []).map((row) => row.id));
  if (observed.size !== requiredRq.size) throw new Error(`requirement denominator mismatch: ${observed.size}`);
  for (const id of requiredRq) if (!observed.has(id)) throw new Error(`missing exact requirement ${id}`);
  for (const id of observed) if (!requiredRq.has(id)) throw new Error(`unexpected O-WP-002 requirement ${id}`);
  for (const row of trace.requirements) {
    if (!Array.isArray(row.sources) || row.sources.length === 0) throw new Error(`${row.id} missing source mapping`);
    if (!Array.isArray(row.tests) || row.tests.length === 0) throw new Error(`${row.id} missing test/evidence mapping`);
    if (!row.standing) throw new Error(`${row.id} missing standing`);
  }
  fs.writeFileSync(path.join(evidence, 'traceability.json'), JSON.stringify({
    package_id: trace.package_id,
    base_core_subject_at_build_start: trace.base_core_subject_at_build_start,
    exact_requirement_count: observed.size,
    unaccounted_requirement_count: trace.unaccounted_requirement_count,
    real_human_identity_standing: trace.real_human_identity_standing,
    external_provider_validity_standing: trace.external_provider_validity_standing,
    result: 'PASS'
  }, null, 2) + '\n');
}

try {
  const subject = run('git', ['rev-parse', 'HEAD']);
  run('git', ['merge-base', '--is-ancestor', '4da156f9707c2f9aa31984d3fb958fd01e5b375b', 'HEAD']);
  fs.writeFileSync(path.join(evidence, 'subject.txt'), [
    'component=Foundation Identity O-WP-002',
    `commit=${subject}`,
    'base_core_subject=4da156f9707c2f9aa31984d3fb958fd01e5b375b',
    'qualification_class=HOSTED_PORTABLE_MECHANICS_PLUS_EVIDENCE_AUTHORITY_SEAM',
    'real_human_identity=NOT_CLAIMED',
    'external_provider_validity=NOT_CLAIMED',
    'production_persistence=NOT_CLAIMED_REFERENCE_ADAPTER_ONLY',
    'a01_native_production=NOT_CLAIMED',
    ''
  ].join('\n'));

  run('java', ['-version'], { evidence: 'java-version.txt' });
  run('javac', ['-version'], { evidence: 'javac-version.txt' });
  validateTraceability();

  const sources = collectJava(path.join(packageRoot, 'src', 'main', 'java'));
  const tests = collectJava(path.join(packageRoot, 'src', 'test', 'java'));
  const all = [...sources, ...tests];
  const digests = Object.fromEntries(all.map((file) => [path.relative(root, file), sha256File(file)]));
  fs.writeFileSync(path.join(evidence, 'source-digests.json'), JSON.stringify(digests, null, 2) + '\n');

  run('javac', ['--release', '21', '-Xlint:all,-try', '-Werror', '-d', classes, ...all], { evidence: 'compile.txt' });

  const prior = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.PrincipalIdentityQualificationTest'], { evidence: 'owp001-cumulative.txt' });
  if (!prior.includes('PASS FOUNDATION_IDENTITY_OWP001')) throw new Error('O-WP-001 cumulative predicate missing');
  const priorPerf = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.PrincipalIdentityPerformanceTest'], { evidence: 'owp001-performance-cumulative.txt' });
  if (!priorPerf.includes('PASS FOUNDATION_IDENTITY_OWP001_PERFORMANCE')) throw new Error('O-WP-001 performance cumulative predicate missing');

  const qualification = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.ProofingEnrollmentQualificationTest'], { evidence: 'owp002-qualification.txt' });
  if (!qualification.includes('PASS FOUNDATION_IDENTITY_OWP002 cases=17')) throw new Error('O-WP-002 qualification completion predicate missing');

  const evidenceAuthority = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.ProofingEvidenceAuthorityQualificationTest'], { evidence: 'owp002-evidence-authority.txt' });
  if (!evidenceAuthority.includes('PASS FOUNDATION_IDENTITY_OWP002_EVIDENCE_AUTHORITY cases=6')) throw new Error('O-WP-002 evidence-authority predicate missing');

  const rootRegression = run('node', ['.github/scripts/foundation-system-root-qualify.js'], { evidence: 'system-root-cumulative-regression.txt' });
  if (!rootRegression.includes('PASS FOUNDATION_SYSTEM_ROOT_HOSTED')) throw new Error('System Root cumulative regression predicate missing');

  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=PASS\n');
  console.log(qualification);
  console.log(evidenceAuthority);
  console.log('PASS FOUNDATION_IDENTITY_OWP002_HOSTED_PORTABLE_MECHANICS_PLUS_EVIDENCE_AUTHORITY');
  console.log('PASS FOUNDATION_SYSTEM_ROOT_PLUS_IDENTITY_OWP001_OWP002_CUMULATIVE');
  console.log(`evidence_dir=${evidence}`);
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=FAIL\n');
  fs.writeFileSync(path.join(evidence, 'failure.txt'), `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  console.error(`evidence_dir=${evidence}`);
  process.exit(1);
}
