'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const runId = process.env.GITHUB_RUN_ID || 'local';
const runnerTemp = process.env.RUNNER_TEMP || path.join(root, '.tmp');
const legacyEvidenceDir = path.join(runnerTemp, `system-master-continuity-011-015-${runId}`);
const evidenceDir = process.env.A01_EVIDENCE_DIR || legacyEvidenceDir;

function run(command, args, options = {}) {
  return cp.spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: options.env || process.env
  });
}

function ensureFullHistory() {
  const shallow = run('git', ['rev-parse', '--is-shallow-repository']);
  if (shallow.status !== 0 || String(shallow.stdout || '').trim() !== 'true') return;
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('SHALLOW_CHECKOUT_REQUIRES_GITHUB_TOKEN');
  const auth = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  const env = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`
  };
  const fetched = run('git', ['fetch', '--no-tags', '--prune', '--unshallow', 'origin', '+refs/heads/*:refs/remotes/origin/*'], { env });
  if (fetched.status !== 0) throw new Error(`UNSHALLOW_FAILED:${fetched.stderr || fetched.stdout}`);
}

function copyLegacyEvidence() {
  if (!fs.existsSync(legacyEvidenceDir)) return;
  fs.mkdirSync(evidenceDir, { recursive: true });
  const target = path.join(evidenceDir, 'legacy-equivalence');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(legacyEvidenceDir, target, { recursive: true });
}

try {
  ensureFullHistory();
  const child = run('node', ['.github/scripts/g-continuity-011-015-consolidated-qualify.js']);
  copyLegacyEvidence();
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'migration-equivalence.txt'), [
    'control_plane_baseline=c51046152eaf749d672ce923ea983e1c7893d3f2',
    'qualification_id=SYSTEM-MASTER-CONTINUITY-G-WP-011-015-CONSOLIDATED',
    `legacy_child_exit_code=${typeof child.status === 'number' ? child.status : 1}`,
    'legacy_boundary=143_assertions_29_new_requirements_A01_ORDINARY_INTEGRATION',
    'TARGET_WINDOWS_REBOOT=NOT_SATISFIED',
    'TARGET_IOS_CLIENT_SUSPEND_RESUME=NOT_SATISFIED',
    'EMPIRICAL_HUMAN_EVIDENCE=NOT_SATISFIED',
    'production_authorized=false'
  ].join('\n') + '\n');
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(typeof child.status === 'number' ? child.status : 1);
  console.log('PASS A01-CONTROL-PLANE-MIGRATION-EQUIVALENCE qualification=SYSTEM-MASTER-CONTINUITY-G-WP-011-015-CONSOLIDATED');
} catch (error) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'migration-wrapper-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
