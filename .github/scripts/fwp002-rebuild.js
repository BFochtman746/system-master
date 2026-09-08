'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = path.join(workspace, 'system-master', 'f-wp-002');
const branch = process.env.GITHUB_REF_NAME || 'system-master/f-wp-002-a01';

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true, ...options });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error || r.status !== 0) throw new Error(`${cmd.toUpperCase()}_FAILED:${args.join(' ')}:${r.error ? r.error.message : out}`);
  return (r.stdout || '').trim();
}
function git(args) { return run('git', ['-c', `safe.directory=${workspace}`, ...args]); }
function parts(dir) {
  return fs.readdirSync(dir).filter(n => /^part-\d+$/.test(n)).sort().map(n => fs.readFileSync(path.join(dir, n), 'utf8')).join('');
}
function reconstruct(transportRel, targetRel, expectedSha, expectedSize) {
  const b64 = parts(path.join(packageRoot, transportRel));
  const bytes = Buffer.from(b64, 'base64');
  const digest = sha256(bytes);
  if (bytes.length !== expectedSize) throw new Error(`RECONSTRUCTED_SIZE_MISMATCH:${targetRel}:${bytes.length}:${expectedSize}`);
  if (digest !== expectedSha) throw new Error(`RECONSTRUCTED_HASH_MISMATCH:${targetRel}:${digest}:${expectedSha}`);
  const target = path.join(packageRoot, targetRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  console.log(`RECONSTRUCTED ${targetRel} ${bytes.length} ${digest}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json'), 'utf8'));
const byPath = Object.fromEntries(manifest.files.map(x => [x.path, x]));
const mainRel = 'src/main/java/org/systemmaster/core/ChangeRegistry.java';
const testRel = 'src/test/java/org/systemmaster/core/Fwp002QualificationTest.java';

try {
  git(['fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  const trigger = git(['rev-parse', 'HEAD']);
  const remote = git(['rev-parse', `refs/remotes/origin/${branch}`]);
  if (trigger !== remote) throw new Error(`BRANCH_ADVANCED trigger=${trigger} remote=${remote}`);

  reconstruct('transport/main', mainRel, byPath[mainRel].sha256, byPath[mainRel].size);
  reconstruct('transport/test', testRel, byPath[testRel].sha256, byPath[testRel].size);

  git(['config', 'user.name', 'system-master-a01']);
  git(['config', 'user.email', 'system-master-a01@users.noreply.github.com']);
  git(['add', `system-master/f-wp-002/${mainRel}`, `system-master/f-wp-002/${testRel}`]);
  const diff = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'diff', '--cached', '--quiet'], { cwd: workspace, shell: false, windowsHide: true });
  if (diff.status === 1) {
    git(['commit', '-m', 'fwp002: reconstruct sealed authoritative source slice']);
    git(['push', 'origin', `HEAD:${branch}`]);
  } else if (diff.status !== 0) {
    throw new Error('GIT_DIFF_CHECK_FAILED');
  }
  const rebuilt = git(['rev-parse', 'HEAD']);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `rebuilt_commit=${rebuilt}\n`, 'utf8');
  console.log(`PASS_FWP002_REBUILD commit=${rebuilt}`);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
