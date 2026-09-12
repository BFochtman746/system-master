'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const SUBJECT = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || '.');
const EVIDENCE = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(SUBJECT, '.a01-cg011-host-evidence'));
const RUNNER_TEMP = path.resolve(process.env.RUNNER_TEMP || path.join(SUBJECT, '.tmp'));
const RUN_ID = String(process.env.GITHUB_RUN_ID || 'local');
const EXPECTED_SHA = String(process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();

function fail(message) { throw new Error(message); }
function run(exe, args) {
  const r = cp.spawnSync(exe, args, {
    cwd: SUBJECT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GITHUB_WORKSPACE: SUBJECT, A01_SUBJECT_ROOT: SUBJECT, A01_EVIDENCE_DIR: EVIDENCE }
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) fail(`${exe} spawn failed: ${r.error.message}`);
  if (r.status !== 0) fail(`${exe} ${args.join(' ')} failed with exit ${r.status}`);
  return `${r.stdout || ''}${r.stderr || ''}`;
}
function copyTree(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
  return true;
}
function collectFoundation() {
  const rows = [];
  for (let i = 1; i <= 12; i += 1) {
    const n = String(i).padStart(3, '0');
    const src = path.join(RUNNER_TEMP, `system-master-fwp${n}-${RUN_ID}`);
    const dst = path.join(EVIDENCE, 'foundation', `F-WP-${n}`);
    const copied = copyTree(src, dst);
    const resultPath = path.join(src, 'result.txt');
    const result = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8').trim() : '';
    rows.push({ id: `F-WP-${n}`, copied, result });
  }
  return rows;
}

fs.mkdirSync(EVIDENCE, { recursive: true });
let foundationRows = [];
let foundationPass = false;
let supervisorPass = false;
try {
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) fail(`INVALID_A01_SUBJECT_SHA:${EXPECTED_SHA}`);
  const actual = run('git', ['rev-parse', 'HEAD']).trim().toLowerCase();
  if (actual !== EXPECTED_SHA) fail(`SUBJECT_CHECKOUT_MISMATCH expected=${EXPECTED_SHA} actual=${actual}`);

  const foundationOut = run('node', ['.github/scripts/fwp012-qualify.js']);
  if (!foundationOut.includes('PASS F-WP-012 tests=47 requirements=4')) fail('F_WP_012_CUMULATIVE_SENTINEL_MISSING');
  foundationRows = collectFoundation();
  const missing = foundationRows.filter(row => !row.copied || !row.result.includes('result=PASS'));
  if (missing.length) fail(`FOUNDATION_EVIDENCE_INCOMPLETE:${JSON.stringify(missing)}`);
  foundationPass = true;

  const supervisorOut = run('node', ['.github/scripts/a01-second-shift-supervisor-v2-qualify.js']);
  if (!supervisorOut.includes('CG008_A01_SUPERVISOR_QUALIFIER=PASS')) fail('SUPERVISOR_A01_SENTINEL_MISSING');
  supervisorPass = true;

  const summary = {
    qualification: 'CG011-A01-FOUNDATION-CUMULATIVE-HOST-001',
    subject_sha: EXPECTED_SHA,
    runner_name: process.env.RUNNER_NAME || null,
    runner_os: process.env.RUNNER_OS || null,
    runner_arch: process.env.RUNNER_ARCH || null,
    machine: process.env.COMPUTERNAME || null,
    foundation_chain: foundationRows,
    foundation_cumulative_pass: foundationPass,
    supervisor_host_stress_pass: supervisorPass,
    promotion_authorized: false
  };
  fs.writeFileSync(path.join(EVIDENCE, 'cg011-host-qualification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log('CG011_A01_HOST_QUALIFICATION=PASS foundation=F-WP-001..012 supervisor_stress=PASS');
} catch (error) {
  foundationRows = foundationRows.length ? foundationRows : collectFoundation();
  const failure = {
    qualification: 'CG011-A01-FOUNDATION-CUMULATIVE-HOST-001',
    subject_sha: EXPECTED_SHA,
    foundation_chain: foundationRows,
    foundation_cumulative_pass: foundationPass,
    supervisor_host_stress_pass: supervisorPass,
    error: error && error.stack ? error.stack : String(error)
  };
  fs.writeFileSync(path.join(EVIDENCE, 'cg011-host-qualification-failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(failure.error);
  process.exit(1);
}
