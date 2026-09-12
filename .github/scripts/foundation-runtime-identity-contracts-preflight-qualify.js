'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const evidence = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'foundation-runtime-preflight-'));
const classes = path.join(evidence, 'classes');
fs.mkdirSync(classes, { recursive: true });

function run(command, args, name) {
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, env: process.env });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (name) fs.writeFileSync(path.join(evidence, name), out, 'utf8');
  if (r.error || r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${r.error ? r.error.message : `exit ${r.status}`}\n${out}`);
  return (r.stdout || '').trim();
}
function java(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...java(p));
    else if (entry.isFile() && entry.name.endsWith('.java')) out.push(p);
  }
  return out.sort();
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

try {
  const subject = run('git', ['rev-parse', 'HEAD']);
  run('git', ['merge-base', '--is-ancestor', '170860ea430da7b1a26a402512b1d54fb89b5a69', 'HEAD']);
  fs.writeFileSync(path.join(evidence, 'subject.txt'), [
    'component=Foundation Durable Runtime Identity Contracts Preflight',
    `commit=${subject}`,
    'base_subject=170860ea430da7b1a26a402512b1d54fb89b5a69',
    'changed_subject_cases=26',
    'qualification_class=HOSTED_PORTABLE_REFERENCE_CONTRACT_AUTHORITY_MECHANICS',
    'whole_runtime_authority=NOT_CLAIMED',
    'a01_native_production=NOT_CLAIMED',
    'live_postgresql=NOT_CLAIMED',
    'blocked_peer_providers=NOT_CLAIMED',
    ''
  ].join('\n'));

  run('java', ['-version'], 'java-version.txt');
  run('javac', ['-version'], 'javac-version.txt');

  const dirs = [
    path.join(root, 'system-master', 'foundation-spine', 'identity', 'src', 'main', 'java'),
    path.join(root, 'system-master', 'foundation-spine', 'contracts', 'src', 'main', 'java'),
    path.join(root, 'system-master', 'foundation-spine', 'runtime-continuity', 'src', 'main', 'java'),
    path.join(root, 'system-master', 'foundation-spine', 'runtime-continuity', 'src', 'test', 'java')
  ];
  const sources = dirs.flatMap(java);
  if (sources.length === 0) throw new Error('no Java sources found');
  fs.writeFileSync(path.join(evidence, 'source-digests.json'), JSON.stringify(Object.fromEntries(
    sources.map(f => [path.relative(root, f), sha(f)])), null, 2) + '\n');

  run('javac', ['--release', '21', '-Xlint:all,-try', '-Werror', '-d', classes, ...sources], 'compile.txt');
  const changed = run('java', ['-cp', classes, 'org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightQualificationTest'], 'changed-subject-26.txt');
  if (!changed.includes('PASS CORE_DURABLE_RUNTIME_IDENTITY_CONTRACTS_PREFLIGHT cases=26')) throw new Error('26-case predicate missing');

  const cumulative = run('node', ['.github/scripts/foundation-contracts-versioning-qualify.js'], 'root-identity-contracts-cumulative.txt');
  if (!cumulative.includes('PASS FOUNDATION_CONTRACTS_VERSIONING_HOSTED_PORTABLE')) throw new Error('Contracts regression missing');
  if (!cumulative.includes('PASS FOUNDATION_ROOT_IDENTITY_CONTRACTS_CUMULATIVE')) throw new Error('Root/Identity/Contracts cumulative regression missing');

  fs.writeFileSync(path.join(evidence, 'result.txt'), [
    'result=PASS',
    'changed_subject_cases=26',
    'identity_cases=36_via_cumulative',
    'contracts_cases=48_via_cumulative',
    'system_root_affected_regression=PASS_via_cumulative',
    'f003_base_regression=SEPARATE_VERIFIED_CUSTODY_EVIDENCE_REQUIRED',
    'a01_native_production=NOT_CLAIMED',
    ''
  ].join('\n'));
  console.log(changed);
  console.log('PASS CORE_DURABLE_RUNTIME_IDENTITY_CONTRACTS_PREFLIGHT_HOSTED_PORTABLE');
  console.log('PASS CORE_DURABLE_RUNTIME_IDENTITY_CONTRACTS_PREFLIGHT_CUMULATIVE_FOUNDATION');
  console.log(`evidence_dir=${evidence}`);
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=FAIL_OR_INCOMPLETE\n');
  fs.writeFileSync(path.join(evidence, 'failure.txt'), `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  console.error(`evidence_dir=${evidence}`);
  process.exit(1);
}
