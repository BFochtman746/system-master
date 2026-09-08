'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const packageRoot = 'system-master/f-wp-001';
const manifestPath = path.join(workspace, packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function gitBlob(repoPath) {
  const r = spawnSync('git', ['show', `HEAD:${repoPath}`], { cwd: workspace, encoding: null, shell: false, windowsHide: true });
  if (r.error || r.status !== 0) {
    const detail = r.error ? r.error.message : Buffer.concat([r.stdout || Buffer.alloc(0), r.stderr || Buffer.alloc(0)]).toString('utf8');
    throw new Error(`GIT_BLOB_READ_FAILED:${repoPath}:${detail}`);
  }
  return r.stdout || Buffer.alloc(0);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

console.log(`seal_audit_commit=${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).stdout.trim()}`);
for (const entry of manifest.files) {
  const bytes = gitBlob(`${packageRoot}/${entry.path}`);
  console.log(`SEAL ${entry.path}|${sha256(bytes)}|${bytes.length}|expected=${String(entry.sha256).toLowerCase()}|expected_size=${entry.size}`);
}
console.log('SEAL_AUDIT_COMPLETE');
