'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const tempRoot = process.env.RUNNER_TEMP || os.tmpdir();
const evidence = fs.mkdtempSync(path.join(tempRoot, 'foundation-identity-delegation-'));
const packageRoot = path.join(root, 'system-master', 'foundation-spine', 'identity');
const classes = path.join(evidence, 'classes');
fs.mkdirSync(classes, { recursive: true });

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
  const file = path.join(packageRoot, 'DELEGATION-BUILD-TRACEABILITY.json');
  const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (trace.package_id !== 'CORE-IDENTITY-DELEGATION-BUILD-001') throw new Error('traceability package id mismatch');
  if (trace.base_owner_subject !== '38c80514298fd1b1509f9fb55bd817b95a5f9f0b') throw new Error('base owner subject mismatch');
  if (trace.unaccounted_requirement_count !== 0) throw new Error('unaccounted requirements nonzero');
  if (trace.isolated_case_denominator !== 36) throw new Error('isolated denominator mismatch');
  if (!Array.isArray(trace.invariants) || trace.invariants.length !== 16) throw new Error('invariant denominator mismatch');
  const ids = new Set(trace.invariants.map((row) => row.id));
  if (ids.size !== 16) throw new Error('duplicate invariant ids');
  for (const row of trace.invariants) {
    for (const field of ['requirement','implementation','durable_state','interface_contract','tests','evidence','environment','blocker']) {
      if (row[field] === undefined || row[field] === null) throw new Error(`${row.id} missing ${field}`);
    }
  }
  const cal = trace.calibration || {};
  if (cal.synthetic_grants !== 128 || cal.synthetic_validations !== 512
      || cal.replay_threshold_ms !== 15000 || cal.validation_threshold_ms !== 15000
      || cal.thresholds_frozen_before_execution !== true) {
    throw new Error('calibration contract mismatch');
  }
  fs.writeFileSync(path.join(evidence, 'traceability.json'), JSON.stringify({
    package_id: trace.package_id,
    base_owner_subject: trace.base_owner_subject,
    invariant_count: trace.invariants.length,
    unaccounted_requirement_count: trace.unaccounted_requirement_count,
    isolated_case_denominator: trace.isolated_case_denominator,
    calibration: trace.calibration,
    external_evidence_fences: trace.external_evidence_fences,
    result: 'PASS'
  }, null, 2) + '\n');
}

try {
  const subject = run('git', ['rev-parse', 'HEAD']);
  run('git', ['merge-base', '--is-ancestor', '38c80514298fd1b1509f9fb55bd817b95a5f9f0b', 'HEAD']);
  fs.writeFileSync(path.join(evidence, 'subject.txt'), [
    'component=Foundation Identity Delegation',
    `commit=${subject}`,
    'base_owner_subject=38c80514298fd1b1509f9fb55bd817b95a5f9f0b',
    'qualification_class=HOSTED_PORTABLE_REFERENCE_AUTHORITY_MECHANICS',
    'real_credentials=NOT_CLAIMED',
    'external_provider_validity=NOT_CLAIMED',
    'keel_runtime_authority=INTERFACE_ONLY_NOT_CLAIMED',
    'effect_authority_commit_permission=OUTSIDE_OWNER_NOT_CLAIMED',
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

  const owp1 = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.PrincipalIdentityQualificationTest'], { evidence: 'owp001-cumulative.txt' });
  if (!owp1.includes('PASS FOUNDATION_IDENTITY_OWP001')) throw new Error('O-WP-001 cumulative predicate missing');
  const owp1Perf = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.PrincipalIdentityPerformanceTest'], { evidence: 'owp001-performance-cumulative.txt' });
  if (!owp1Perf.includes('PASS FOUNDATION_IDENTITY_OWP001_PERFORMANCE')) throw new Error('O-WP-001 performance predicate missing');
  const owp2 = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.ProofingEnrollmentQualificationTest'], { evidence: 'owp002-cumulative.txt' });
  if (!owp2.includes('PASS FOUNDATION_IDENTITY_OWP002 cases=17')) throw new Error('O-WP-002 cumulative predicate missing');
  const owp2Evidence = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.ProofingEvidenceAuthorityQualificationTest'], { evidence: 'owp002-evidence-authority-cumulative.txt' });
  if (!owp2Evidence.includes('PASS FOUNDATION_IDENTITY_OWP002_EVIDENCE_AUTHORITY cases=6')) throw new Error('O-WP-002 evidence-authority predicate missing');

  const isolated = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.DelegationQualificationTest'], { evidence: 'delegation-isolated.txt' });
  if (!isolated.includes('PASS FOUNDATION_IDENTITY_DELEGATION cases=36')) throw new Error('delegation isolated denominator incomplete');
  const calibration = run('java', ['-cp', classes, 'org.systemmaster.foundation.identity.DelegationCalibrationTest'], { evidence: 'delegation-calibration.txt' });
  if (!calibration.includes('PASS FOUNDATION_IDENTITY_DELEGATION_CALIBRATION grants=128 validations=512')) throw new Error('delegation calibration predicate missing');

  const rootRegression = run('node', ['.github/scripts/foundation-system-root-qualify.js'], { evidence: 'system-root-cumulative-regression.txt' });
  if (!rootRegression.includes('PASS FOUNDATION_SYSTEM_ROOT_HOSTED')) throw new Error('System Root cumulative regression predicate missing');

  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=PASS\n');
  console.log(isolated);
  console.log(calibration);
  console.log('PASS FOUNDATION_IDENTITY_DELEGATION_HOSTED_PORTABLE');
  console.log('PASS FOUNDATION_SYSTEM_ROOT_PLUS_IDENTITY_OWP001_OWP002_DELEGATION_CUMULATIVE');
  console.log(`evidence_dir=${evidence}`);
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=FAIL\n');
  fs.writeFileSync(path.join(evidence, 'failure.txt'), `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  console.error(`evidence_dir=${evidence}`);
  process.exit(1);
}
