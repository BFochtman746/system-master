'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const runnerTemp = path.resolve(process.env.RUNNER_TEMP || path.join(workspace, '.tmp'));
const transportDir = path.join(workspace, 'qualification', 'fwp002', 'source-payload');
const packageRoot = path.join(workspace, 'system-master', 'f-wp-002');
const evidenceDir = path.join(runnerTemp, `fwp002-source-rebuild-${process.env.GITHUB_RUN_ID || 'local'}`);
const noGit = process.env.REBUILD_NO_GIT === '1';
fs.mkdirSync(evidenceDir, { recursive: true });

const expectedParts = [
  ['part-000.b64', 'd0671dc20738738b30f2a11e518aa434a22794d8d3041f50bd8ada2c0e4031ed', 6000],
  ['part-001.b64', '9e9aff886a0fc76a7f7cf7cd05f364214877bb6d448def64a0b9ec7475242308', 6000],
  ['part-002.b64', '7f113b837c556da2cc2f7db7d54eeb0d25a08dfd144aa3b7bc1ec908ec166ccb', 6000],
  ['part-003.b64', '7163691fa39fabfe3beef6ec3f1ec77beababc321edb795b4fafc0046e59ff04', 6000],
  ['part-004.b64', '8c038225800c6e981dfb9b02af7c457a09437f50f9a1cbf6756971398d09e116', 1360],
];
const expectedArchiveSha = '0354ed124993c9d7a6eef853082e43d5b24dea7606a0b1d8ceb154e29bbddfa6';
const expectedArchiveSize = 19018;

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function writeEvidence(name, text) { fs.writeFileSync(path.join(evidenceDir, name), String(text), 'utf8'); }
function fail(message) { throw new Error(message); }
function run(command, args, cwd = workspace) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false, windowsHide: true });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : `${result.stdout || ''}${result.stderr || ''}`;
    fail(`${command}_FAILED exit=${result.status}\n${detail}`);
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}
function git(args) { return run('git', ['-c', `safe.directory=${workspace}`, ...args]); }
function cString(buf, offset, length) {
  const view = buf.subarray(offset, offset + length);
  const zero = view.indexOf(0);
  return view.subarray(0, zero < 0 ? view.length : zero).toString('utf8').trim();
}
function octal(buf, offset, length) {
  const text = cString(buf, offset, length).replace(/\0/g, '').trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) fail(`INVALID_TAR_OCTAL:${text}`);
  return Number.parseInt(text, 8);
}
function verifyTarChecksum(header) {
  const stored = octal(header, 148, 8);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += (i >= 148 && i < 156) ? 32 : header[i];
  if (sum !== stored) fail(`TAR_HEADER_CHECKSUM_MISMATCH expected=${stored} actual=${sum}`);
}
function safeRelative(name) {
  const normalized = name.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) fail(`UNSAFE_TAR_PATH:${name}`);
  const pieces = normalized.split('/');
  if (pieces.some((p) => p === '..' || p === '')) fail(`UNSAFE_TAR_PATH:${name}`);
  return normalized;
}
const allowedFiles = new Set([
  'control/REQUIREMENTS.json',
  'control/BASELINE-BINDING.json',
  'control/SOURCE-SLICE-MANIFEST.json',
  'src/test/java/org/systemmaster/core/Fwp002QualificationTest.java',
  'src/main/java/org/systemmaster/core/ChangeRecord.java',
  'src/main/java/org/systemmaster/core/ChangeEvent.java',
  'src/main/java/org/systemmaster/core/ChangeTargetSnapshot.java',
  'src/main/java/org/systemmaster/core/ChangeRevision.java',
  'src/main/java/org/systemmaster/core/ChangeDigest.java',
  'src/main/java/org/systemmaster/core/ChangeRegistry.java',
  '.github/scripts/fwp002-qualify.js',
  '.github/workflows/system-master-f-wp-002-a01.yml',
]);
function destinationFor(name) {
  if (name.startsWith('control/') || name.startsWith('src/')) return path.join(packageRoot, ...name.split('/'));
  if (name.startsWith('.github/')) return path.join(workspace, ...name.split('/'));
  fail(`UNEXPECTED_PAYLOAD_PATH:${name}`);
}
function extractTar(tar) {
  const seen = new Set();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    verifyTarChecksum(header);
    const rawName = cString(header, 0, 100);
    const prefix = cString(header, 345, 155);
    const name = safeRelative(prefix ? `${prefix}/${rawName}` : rawName);
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) fail(`TRUNCATED_TAR_ENTRY:${name}`);
    if (type === '5' || name.endsWith('/')) {
      // Directories carry no authority; file allowlist below is decisive.
    } else if (type === '0' || type === '\0') {
      if (!allowedFiles.has(name)) fail(`UNEXPECTED_PAYLOAD_FILE:${name}`);
      if (seen.has(name)) fail(`DUPLICATE_PAYLOAD_FILE:${name}`);
      const dest = destinationFor(name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, tar.subarray(dataStart, dataEnd));
      seen.add(name);
    } else {
      fail(`DISALLOWED_TAR_ENTRY_TYPE:${name}:${type}`);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  const missing = [...allowedFiles].filter((x) => !seen.has(x));
  if (missing.length) fail(`MISSING_PAYLOAD_FILES:${missing.join(',')}`);
  return [...seen].sort();
}

try {
  const report = [];
  let b64 = '';
  for (const [name, expectedSha, expectedSize] of expectedParts) {
    const p = path.join(transportDir, name);
    if (!fs.existsSync(p)) fail(`MISSING_TRANSPORT_PART:${name}`);
    const raw = fs.readFileSync(p);
    if (raw.length !== expectedSize) fail(`TRANSPORT_SIZE_MISMATCH:${name}:${raw.length}`);
    if (sha256(raw) !== expectedSha) fail(`TRANSPORT_HASH_MISMATCH:${name}`);
    const text = raw.toString('utf8');
    if (/\s/.test(text)) fail(`TRANSPORT_WHITESPACE_NOT_ALLOWED:${name}`);
    b64 += text;
    report.push(`${name}|${expectedSha}|${expectedSize}`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) fail('INVALID_COMBINED_BASE64');
  const archive = Buffer.from(b64, 'base64');
  if (archive.length !== expectedArchiveSize || sha256(archive) !== expectedArchiveSha) fail('ARCHIVE_IDENTITY_MISMATCH');
  const tar = zlib.gunzipSync(archive);

  fs.rmSync(packageRoot, { recursive: true, force: true });
  const extracted = extractTar(tar);

  const manifestPath = path.join(packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest.files) {
    const target = path.join(packageRoot, ...entry.path.split('/'));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`MISSING_SEALED_FILE:${entry.path}`);
    const raw = fs.readFileSync(target);
    if (raw.length !== Number(entry.size) || sha256(raw) !== String(entry.sha256).toLowerCase()) {
      fail(`SEALED_FILE_IDENTITY_MISMATCH:${entry.path}`);
    }
  }

  const classes = path.join(runnerTemp, `fwp002-rebuild-classes-${process.env.GITHUB_RUN_ID || 'local'}`);
  const testStore = path.join(runnerTemp, `fwp002-rebuild-test-${process.env.GITHUB_RUN_ID || 'local'}`);
  fs.rmSync(classes, { recursive: true, force: true });
  fs.rmSync(testStore, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  const javaSources = manifest.files.filter((x) => x.path.endsWith('.java')).map((x) => path.join(packageRoot, ...x.path.split('/')));
  const compile = run('javac', ['--release', String(manifest.java_release || 21), '-d', classes, ...javaSources]);
  writeEvidence('compile.txt', compile);
  const qualification = run('java', ['-cp', classes, 'org.systemmaster.core.Fwp002QualificationTest', testStore]);
  writeEvidence('qualification.txt', qualification);
  if (!qualification.includes(String(manifest.completion_predicate))) fail('COMPLETION_PREDICATE_MISSING');

  writeEvidence('transport.txt', `${report.join('\n')}\narchive_sha256=${expectedArchiveSha}\narchive_size=${expectedArchiveSize}\n`);
  writeEvidence('extracted.txt', `${extracted.join('\n')}\n`);

  if (!noGit) {
    const branch = process.env.GITHUB_REF_NAME || 'system-master/f-wp-002-a01';
    if (branch !== 'system-master/f-wp-002-a01') fail(`WRONG_BRANCH:${branch}`);
    git(['config', 'user.name', 'github-actions[bot]']);
    git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    git(['add', '--', 'system-master/f-wp-002', '.github/scripts/fwp002-qualify.js', '.github/workflows/system-master-f-wp-002-a01.yml']);
    const status = git(['status', '--porcelain', '--', 'system-master/f-wp-002', '.github/scripts/fwp002-qualify.js', '.github/workflows/system-master-f-wp-002-a01.yml']);
    if (!status.trim()) fail('NO_SOURCE_CHANGES_TO_COMMIT');
    git(['commit', '-m', 'fwp002: bind ChangeRegistry authoritative store source slice']);
    const newHead = git(['rev-parse', 'HEAD']).trim();
    git(['push', 'origin', `HEAD:${branch}`]);
    writeEvidence('commit.txt', `commit=${newHead}\nbranch=${branch}\n`);
    console.log(`source_commit=${newHead}`);
  }

  writeEvidence('result.txt', 'result=PASS\n');
  console.log('PASS F-WP-002 SOURCE REBUILD tests=18 requirements=6');
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  writeEvidence('result.txt', 'result=FAIL\n');
  writeEvidence('failure.txt', `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
