const cp = require('child_process');
const fs = require('fs');
const path = require('path');

function fail(message) {
  process.stderr.write(`SECOND_SHIFT_001F_CANARY_FAIL:${message}\n`);
  process.exit(1);
}

if (process.argv.length !== 2) fail('wrapper accepts no command arguments');
const root = path.resolve(process.env.A01_SUBJECT_ROOT || process.cwd());
const subject = String(process.env.A01_SUBJECT_SHA || '').toLowerCase();
const evidenceDir = path.resolve(process.env.A01_EVIDENCE_DIR || '');
if (!/^[0-9a-f]{40}$/.test(subject)) fail('A01_SUBJECT_SHA must be lowercase SHA-1');
if (!process.env.A01_EVIDENCE_DIR) fail('A01_EVIDENCE_DIR is required');
const qualifier = path.join(root, 'control-gateway', 'python', 'a01_second_shift_001f_canary.py');
if (!fs.existsSync(qualifier)) fail('001F canary module is missing');
fs.mkdirSync(evidenceDir, { recursive: true });
const child = cp.spawnSync('python', [qualifier], {
  cwd: root,
  env: { ...process.env, A01_SUBJECT_ROOT: root, A01_SUBJECT_SHA: subject, A01_EVIDENCE_DIR: evidenceDir },
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
  timeout: 15 * 60 * 1000,
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.error) fail(child.error.message);
if (child.status !== 0) fail(`python qualifier exited ${child.status}`);
const summaryPath = path.join(evidenceDir, 'second-shift-001f-canary-summary.json');
if (!fs.existsSync(summaryPath)) fail('001F canary summary was not produced');
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
if (
  summary.state !== 'PASS' ||
  summary.canary_tasks_passed !== 3 ||
  summary.live_ready_queue_touched !== false ||
  summary.live_scheduler_cutover_authorized !== false ||
  summary.production_freeze_authorized !== false ||
  summary.promotion_authorized !== false ||
  summary.authorization_leaks !== 0
) fail('001F canary summary did not satisfy frozen PASS contract');
