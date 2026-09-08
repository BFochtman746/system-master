'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const safeRoot = root.replace(/\\/g, '/');
const runId = process.env.GITHUB_RUN_ID || 'local';
const runnerTemp = process.env.RUNNER_TEMP || path.join(root, '.tmp');
const legacyEvidenceDir = path.join(runnerTemp, `system-master-continuity-011-015-${runId}`);
const evidenceDir = process.env.A01_EVIDENCE_DIR || legacyEvidenceDir;
const predecessor = 'ba5713958cd2930c7c54e3d5fdadc41dd7a7a9ca';
const continuityBranch = 'system-master/g-wp-011-015-continuity-slice';

function run(command, args, options = {}) {
  const actualArgs = command === 'git' ? ['-c', `safe.directory=${safeRoot}`, ...args] : args;
  return cp.spawnSync(command, actualArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: options.env || process.env
  });
}

function gitAuthEnv() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('CONTINUITY_ANCESTRY_FETCH_REQUIRES_GITHUB_TOKEN');
  const auth = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`
  };
}

function ancestorAvailable() {
  const have = run('git', ['cat-file', '-e', `${predecessor}^{commit}`]);
  if (have.status !== 0) return false;
  const ancestry = run('git', ['merge-base', '--is-ancestor', predecessor, 'HEAD']);
  return ancestry.status === 0;
}

function ensureContinuityAncestry() {
  if (ancestorAvailable()) return;
  const env = gitAuthEnv();
  const shallow = run('git', ['rev-parse', '--is-shallow-repository']);
  if (shallow.status !== 0) throw new Error(`SHALLOW_STATE_UNAVAILABLE:${shallow.stderr || shallow.stdout}`);
  const isShallow = String(shallow.stdout || '').trim() === 'true';
  const refspec = `+refs/heads/${continuityBranch}:refs/remotes/origin/${continuityBranch}`;
  const args = ['fetch', '--no-tags', '--prune'];
  if (isShallow) args.push('--unshallow');
  args.push('origin', refspec);
  const fetched = run('git', args, { env });
  if (fetched.status !== 0) throw new Error(`CONTINUITY_ANCESTRY_FETCH_FAILED:${fetched.stderr || fetched.stdout}`);
  if (!ancestorAvailable()) throw new Error(`CONTINUITY_PREDECESSOR_ANCESTRY_NOT_PROVEN:${predecessor}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'ancestry-fetch.txt'), [
    `branch=${continuityBranch}`,
    `predecessor=${predecessor}`,
    `checkout=${run('git', ['rev-parse', 'HEAD']).stdout.trim()}`,
    `repository_was_shallow=${isShallow}`,
    'safe_directory_explicit=true',
    'ancestor_proven=true'
  ].join('\n') + '\n');
}

function copyLegacyEvidence() {
  if (!fs.existsSync(legacyEvidenceDir)) return;
  fs.mkdirSync(evidenceDir, { recursive: true });
  const target = path.join(evidenceDir, 'legacy-equivalence');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(legacyEvidenceDir, target, { recursive: true });
}

try {
  ensureContinuityAncestry();
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
