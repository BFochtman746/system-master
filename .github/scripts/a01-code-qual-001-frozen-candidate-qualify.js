'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || '.');
const EVIDENCE_DIR = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(ROOT, '.a01-code-qual-evidence'));
const EXPECTED_SHA = String(process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();
const SHA_RE = /^[0-9a-f]{40}$/;
const CANDIDATE_REL = 'qualification/a01/fixture/a01-code-qual-001/live-candidate';
const CONTROL_REL = 'qualification/a01/fixture/a01-code-qual-001';

function fail(message) { throw new Error(message); }
function run(exe, args, options = {}) {
  const result = cp.spawnSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${exe} spawn failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${exe} ${args.join(' ')} failed with exit ${result.status}`);
  return result;
}
function git(args) { return run('git', args).stdout.trim(); }
function gitHead() { return git(['rev-parse', 'HEAD']).toLowerCase(); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256Bytes(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function listFiles(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  walk(root);
  return out.sort();
}
function treeDigest(root) {
  const rows = listFiles(root).map((file) => [
    path.relative(root, file).split(path.sep).join('/'),
    sha256Bytes(fs.readFileSync(file)),
  ]);
  return {
    digest: sha256Bytes(Buffer.from(JSON.stringify(rows), 'utf8')),
    rows,
  };
}
function matchesAllowed(relativePath) {
  const normalized = relativePath.split('\\').join('/');
  const prefix = `${CANDIDATE_REL}/`;
  if (normalized.startsWith(`${prefix}python/`)) return true;
  if (normalized.startsWith(`${prefix}javascript/`)) return true;
  if (normalized.startsWith(`${prefix}java/src/main/`)) return true;
  if (normalized.startsWith(`${prefix}tests-visible/added/`)) return true;
  if (/^qualification\/a01\/fixture\/a01-code-qual-001\/A01-CODE-QUAL-001-RUN-[^/]+-(START|SUBMIT)\.json$/.test(normalized)) return true;
  return false;
}

function main() {
  const subject = SHA_RE.test(EXPECTED_SHA) ? EXPECTED_SHA : gitHead();
  if (!SHA_RE.test(subject)) fail(`INVALID_A01_SUBJECT_SHA:${subject}`);
  const actual = gitHead();
  if (actual !== subject) fail(`SUBJECT_CHECKOUT_MISMATCH expected=${subject} actual=${actual}`);

  const candidateRoot = path.join(ROOT, CANDIDATE_REL);
  const controlRoot = path.join(ROOT, CONTROL_REL);
  if (!fs.existsSync(candidateRoot)) fail('A01_CODE_QUAL_CANDIDATE_ROOT_MISSING');
  const controlNames = fs.readdirSync(controlRoot);
  const startNames = controlNames.filter((name) => /^A01-CODE-QUAL-001-RUN-.+-START\.json$/.test(name));
  const sealNames = controlNames.filter((name) => /^A01-CODE-QUAL-001-RUN-.+-SEAL\.json$/.test(name));
  if (startNames.length !== 1) fail(`A01_CODE_QUAL_START_MARKER_COUNT:${startNames.length}`);
  if (sealNames.length !== 1) fail(`A01_CODE_QUAL_SEAL_COUNT:${sealNames.length}`);
  const start = readJson(path.join(controlRoot, startNames[0]));
  const seal = readJson(path.join(controlRoot, sealNames[0]));
  const setupSha = String(start.setup_sha || '').trim().toLowerCase();
  if (!SHA_RE.test(setupSha)) fail(`A01_CODE_QUAL_INVALID_SETUP_SHA:${setupSha}`);

  const changed = git(['diff', '--name-only', `${setupSha}..${actual}`])
    .split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  const unauthorized = changed.filter((file) => !matchesAllowed(file));
  if (unauthorized.length) fail(`A01_CODE_QUAL_SCOPE_VIOLATION:${unauthorized.join(',')}`);

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  run('python', ['tests-visible/run_all.py'], { cwd: candidateRoot, timeout: 420000 });

  const tree = treeDigest(candidateRoot);
  const evidence = {
    evidence_version: 1,
    qualification_id: process.env.A01_QUALIFICATION_ID || 'A01-CODE-QUAL-001-FROZEN-CANDIDATE-WINDOWS',
    workstream_id: process.env.A01_WORKSTREAM_ID || 'SYSTEM-MASTER',
    subject_sha: actual,
    setup_sha: setupSha,
    run_id: start.run_id || seal.run_id || null,
    runner_name: process.env.RUNNER_NAME || null,
    operating_system: process.platform,
    architecture: process.arch,
    candidate_root: CANDIDATE_REL,
    candidate_tree_sha256: tree.digest,
    candidate_files: tree.rows,
    changed_paths: changed,
    unauthorized_paths: unauthorized,
    candidate_scope: 'PASS',
    visible_multilanguage_suite: 'PASS',
    hidden_evaluator_executed: false,
    hidden_evaluator_available_to_a01: false,
    authoring_attribution: 'SECOND_SHIFT_CHATGPT_NOT_A01',
  };
  writeJson(path.join(EVIDENCE_DIR, 'a01-code-qual-001-frozen-candidate-windows.json'), evidence);
  console.log(`A01_CODE_QUAL_001_SUBJECT_SHA=${actual}`);
  console.log(`A01_CODE_QUAL_001_CANDIDATE_TREE_SHA256=${tree.digest}`);
  console.log('A01_CODE_QUAL_001_FROZEN_WINDOWS_VISIBLE=PASS');
}

try { main(); }
catch (error) {
  console.error(`A01_CODE_QUAL_001_FROZEN_WINDOWS_VISIBLE=FAIL ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
