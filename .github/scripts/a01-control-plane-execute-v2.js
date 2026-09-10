'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function assert(condition, message) { if (!condition) throw new Error(message); }
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '').trim()); }
function gitHead(root) {
  const safeRoot = path.resolve(root).replace(/\\/g, '/');
  const result = cp.spawnSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(`CONTROL_PLANE_GIT_HEAD_FAILED:${result.stderr || result.stdout}`);
  return result.stdout.trim().toLowerCase();
}
function parseJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

function main() {
  const controlRoot = path.resolve(process.env.A01_CONTROL_ROOT || path.resolve(__dirname, '..', '..'));
  const evidenceDir = path.resolve(process.env.A01_EVIDENCE_DIR || process.env.RUNNER_TEMP || controlRoot);
  const expected = String(process.env.A01_CONTROL_PLANE_SHA || '').trim().toLowerCase();
  assert(isSha(expected), `INVALID_A01_CONTROL_PLANE_SHA:${expected}`);
  const actual = gitHead(controlRoot);
  assert(actual === expected, `CONTROL_PLANE_CHECKOUT_MISMATCH:expected=${expected}:actual=${actual}`);

  const startedAt = new Date().toISOString();
  const child = cp.spawnSync(process.execPath, [path.join(controlRoot, '.github', 'scripts', 'a01-control-plane.js'), 'execute'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);

  const receiptPath = path.join(evidenceDir, 'receipt.json');
  if (fs.existsSync(receiptPath)) {
    const receipt = parseJson(receiptPath);
    const bound = {
      ...receipt,
      receipt_version: 2,
      control_plane_sha: expected,
      control_plane_checkout_sha: actual
    };
    writeJson(receiptPath, bound);
    const requestPath = path.join(evidenceDir, 'request.json');
    if (fs.existsSync(requestPath)) {
      const request = parseJson(requestPath);
      writeJson(requestPath, {
        ...request,
        request_version: Math.max(Number(request.request_version || 0), 4),
        control_plane_sha: expected,
        control_plane_checkout_sha: actual
      });
    }
    writeJson(path.join(evidenceDir, 'control-plane-binding.json'), {
      binding_version: 1,
      expected_control_plane_sha: expected,
      control_plane_checkout_sha: actual,
      subject_sha: receipt.subject_sha,
      subject_checkout_sha: receipt.checkout_sha,
      qualification_id: receipt.qualification_id,
      registry_version: receipt.registry_version,
      policy_version: receipt.policy_version,
      started_at: startedAt,
      bound_at: new Date().toISOString()
    });
    console.log(`A01_BOUND_RECEIPT=${JSON.stringify(bound)}`);
  } else {
    writeJson(path.join(evidenceDir, 'control-plane-binding.json'), {
      binding_version: 1,
      expected_control_plane_sha: expected,
      control_plane_checkout_sha: actual,
      subject_sha: process.env.A01_SUBJECT_SHA || null,
      qualification_id: process.env.A01_QUALIFICATION_ID || null,
      started_at: startedAt,
      bound_at: new Date().toISOString(),
      receipt_present: false
    });
  }

  process.exit(typeof child.status === 'number' ? child.status : 1);
}

try { main(); }
catch (error) {
  const evidenceDir = process.env.A01_EVIDENCE_DIR;
  if (evidenceDir) {
    try {
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, 'control-plane-binding-failure.txt'), `${error.stack || error.message}\n`);
    } catch (_) {}
  }
  console.error(error.stack || error.message);
  process.exit(2);
}
