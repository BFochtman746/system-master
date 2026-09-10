'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const policy = readJson('governance/github/CANONICAL-WRITER-POLICY-001.json');
const topology = readJson('governance/SYSTEM-TOPOLOGY-003.json');
const sha40 = (v) => /^[0-9a-f]{40}$/i.test(String(v || ''));
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const toPosix = (p) => String(p).replace(/\\/g, '/');

function git(cwd, args, options = {}) {
  return execFileSync('git', ['-c', `safe.directory=${cwd}`, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe']
  }).trim();
}
function canonicalRefs() {
  const refs = new Set([policy.canonical_ref_discovery.product_ref || 'main']);
  for (const s of topology.canonical_internal_systems || []) if (s?.control_ref) refs.add(String(s.control_ref));
  return refs;
}
function safeRelative(rel) {
  const normalized = toPosix(rel).replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`UNSAFE_PATH:${rel}`);
  return normalized;
}
function verifyManifest(sourceRoot, manifest) {
  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('MANIFEST_FILES_REQUIRED');
  const seen = new Set();
  const verified = [];
  for (const row of manifest.files) {
    const rel = safeRelative(row.path);
    if (seen.has(rel)) throw new Error(`DUPLICATE_MANIFEST_PATH:${rel}`);
    seen.add(rel);
    const full = path.resolve(sourceRoot, ...rel.split('/'));
    const rootPrefix = path.resolve(sourceRoot) + path.sep;
    if (full !== path.resolve(sourceRoot) && !full.startsWith(rootPrefix)) throw new Error(`UNSAFE_PATH:${rel}`);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`SOURCE_FILE_MISSING:${rel}`);
    const bytes = fs.statSync(full).size;
    const digest = sha256File(full);
    if (Number(row.bytes) !== bytes) throw new Error(`SOURCE_BYTES_MISMATCH:${rel}`);
    if (String(row.sha256 || '').toLowerCase() !== digest) throw new Error(`SOURCE_SHA256_MISMATCH:${rel}`);
    verified.push({ path: rel, bytes, sha256: digest });
  }
  return verified;
}
function remoteHead(repoRoot, remote, branch) {
  const out = git(repoRoot, ['ls-remote', '--heads', remote, `refs/heads/${branch}`]);
  if (!out) return null;
  return out.split(/\s+/)[0];
}
function assertCandidateBranch(branch) {
  if (!branch || canonicalRefs().has(branch)) throw new Error('CANDIDATE_BRANCH_CANONICAL_FORBIDDEN');
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..')) throw new Error('CANDIDATE_BRANCH_INVALID');
}
function prepareCandidate({ repoRoot, sourceRoot, manifest, candidateBranch, expectedBaseSha, commitMessage }) {
  if (!sha40(expectedBaseSha)) throw new Error('EXPECTED_BASE_SHA_INVALID');
  assertCandidateBranch(candidateBranch);
  const current = git(repoRoot, ['rev-parse', 'HEAD']);
  if (current !== expectedBaseSha) throw new Error(`STALE_LOCAL_BASE:${current}`);
  const verified = verifyManifest(sourceRoot, manifest);

  git(repoRoot, ['checkout', '-B', candidateBranch, expectedBaseSha]);
  for (const row of verified) {
    const src = path.resolve(sourceRoot, ...row.path.split('/'));
    const dst = path.resolve(repoRoot, ...row.path.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  git(repoRoot, ['add', '--', ...verified.map((x) => x.path)]);
  const staged = git(repoRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB']).split(/\r?\n/).filter(Boolean).map(toPosix).sort();
  const expectedPaths = verified.map((x) => x.path).sort();
  if (JSON.stringify(staged) !== JSON.stringify(expectedPaths)) throw new Error(`STAGED_PATH_SET_MISMATCH:${JSON.stringify(staged)}`);
  git(repoRoot, ['diff', '--cached', '--check']);
  git(repoRoot, ['-c', 'user.name=System Master Controller', '-c', 'user.email=system-master@invalid', 'commit', '-m', commitMessage || 'System Master native Git candidate']);
  const candidateSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const parentSha = git(repoRoot, ['rev-parse', 'HEAD^']);
  if (!sha40(candidateSha) || parentSha !== expectedBaseSha) throw new Error('CANDIDATE_PARENT_MISMATCH');
  for (const row of verified) {
    const committed = git(repoRoot, ['show', `${candidateSha}:${row.path}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const working = fs.readFileSync(path.resolve(repoRoot, ...row.path.split('/')));
    const committedBuffer = Buffer.from(committed, 'utf8');
    if (crypto.createHash('sha256').update(committedBuffer).digest('hex') !== crypto.createHash('sha256').update(working).digest('hex')) {
      throw new Error(`COMMITTED_BYTES_MISMATCH:${row.path}`);
    }
  }
  return { candidateBranch, expectedBaseSha, candidateSha, fileCount: verified.length, files: verified };
}
function pushCandidate({ repoRoot, remote = 'origin', candidateBranch, candidateSha }) {
  assertCandidateBranch(candidateBranch);
  const local = git(repoRoot, ['rev-parse', candidateBranch]);
  if (candidateSha && local !== candidateSha) throw new Error('CANDIDATE_SHA_MISMATCH');
  git(repoRoot, ['push', '--porcelain', remote, `${local}:refs/heads/${candidateBranch}`]);
  const actual = remoteHead(repoRoot, remote, candidateBranch);
  if (actual !== local) throw new Error('REMOTE_CANDIDATE_VERIFY_FAILED');
  return { candidateBranch, candidateSha: local, remoteSha: actual };
}
function admitCanonical({ repoRoot, remote = 'origin', targetBranch = 'main', candidateSha, expectedBaseSha }) {
  if (!canonicalRefs().has(targetBranch)) throw new Error('TARGET_NOT_CANONICAL');
  if (!sha40(candidateSha) || !sha40(expectedBaseSha)) throw new Error('ADMISSION_SHA_INVALID');
  const liveBefore = remoteHead(repoRoot, remote, targetBranch);
  if (liveBefore === candidateSha) return { outcome: 'NOOP_REPLAY', beforeSha: expectedBaseSha, afterSha: candidateSha };
  if (liveBefore !== expectedBaseSha) throw new Error(`STALE_BASE:${liveBefore}`);
  const parent = git(repoRoot, ['rev-parse', `${candidateSha}^`]);
  if (parent !== expectedBaseSha) throw new Error(`CANDIDATE_PARENT_MISMATCH:${parent}`);
  git(repoRoot, ['merge-base', '--is-ancestor', expectedBaseSha, candidateSha]);
  try {
    git(repoRoot, ['push', '--porcelain', remote, `${candidateSha}:refs/heads/${targetBranch}`]);
  } catch (e) {
    const observed = remoteHead(repoRoot, remote, targetBranch);
    throw new Error(`CANONICAL_PUSH_REJECTED:${observed || 'UNKNOWN'}`);
  }
  const after = remoteHead(repoRoot, remote, targetBranch);
  if (after !== candidateSha) throw new Error(`CANONICAL_VERIFY_FAILED:${after}`);
  return { outcome: 'APPLIED', beforeSha: expectedBaseSha, afterSha: candidateSha };
}

function writeFileWithManifest(sourceRoot, rel, content) {
  const full = path.join(sourceRoot, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return { path: rel, bytes: fs.statSync(full).size, sha256: sha256File(full) };
}
function selftest() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-native-git-'));
  const remote = path.join(temp, 'remote.git');
  const seed = path.join(temp, 'seed');
  const worker = path.join(temp, 'worker');
  const racer = path.join(temp, 'racer');
  const source = path.join(temp, 'source');
  fs.mkdirSync(source, { recursive: true });
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  execFileSync('git', ['clone', remote, seed], { stdio: 'ignore' });
  fs.writeFileSync(path.join(seed, 'README.md'), 'base\n');
  git(seed, ['add', 'README.md']);
  git(seed, ['-c', 'user.name=Seed', '-c', 'user.email=seed@invalid', 'commit', '-m', 'base']);
  git(seed, ['branch', '-M', 'main']);
  git(seed, ['push', 'origin', 'main']);
  const base = git(seed, ['rev-parse', 'HEAD']);

  execFileSync('git', ['clone', '--branch', 'main', remote, worker], { stdio: 'ignore' });
  const manifest = { files: [
    writeFileWithManifest(source, 'documents/a.txt', 'alpha\n'),
    writeFileWithManifest(source, 'documents/nested/b.txt', 'beta\n')
  ] };
  const prepared = prepareCandidate({ repoRoot: worker, sourceRoot: source, manifest, candidateBranch: 'work/documents/native-selftest', expectedBaseSha: base, commitMessage: 'native transport selftest' });
  const pushed = pushCandidate({ repoRoot: worker, remote: 'origin', candidateBranch: prepared.candidateBranch, candidateSha: prepared.candidateSha });
  if (pushed.remoteSha !== prepared.candidateSha) throw new Error('SELFTEST_CANDIDATE_PUSH');
  const admitted = admitCanonical({ repoRoot: worker, remote: 'origin', targetBranch: 'main', candidateSha: prepared.candidateSha, expectedBaseSha: base });
  if (admitted.outcome !== 'APPLIED' || admitted.afterSha !== prepared.candidateSha) throw new Error('SELFTEST_CANONICAL_ADMISSION');

  execFileSync('git', ['clone', '--branch', 'main', remote, racer], { stdio: 'ignore' });
  fs.writeFileSync(path.join(racer, 'RACE.txt'), 'advance\n');
  git(racer, ['add', 'RACE.txt']);
  git(racer, ['-c', 'user.name=Racer', '-c', 'user.email=racer@invalid', 'commit', '-m', 'advance main']);
  git(racer, ['push', 'origin', 'main']);
  const advanced = git(racer, ['rev-parse', 'HEAD']);
  let staleRejected = false;
  try { admitCanonical({ repoRoot: worker, remote: 'origin', targetBranch: 'main', candidateSha: prepared.candidateSha, expectedBaseSha: base }); } catch (e) { staleRejected = String(e.message).startsWith('STALE_BASE:'); }
  if (!staleRejected) throw new Error('SELFTEST_STALE_BASE_NOT_REJECTED');
  if (remoteHead(worker, 'origin', 'main') !== advanced) throw new Error('SELFTEST_STALE_ATTEMPT_MUTATED_MAIN');

  let canonicalCandidateRejected = false;
  try { assertCandidateBranch('main'); } catch (e) { canonicalCandidateRejected = e.message === 'CANDIDATE_BRANCH_CANONICAL_FORBIDDEN'; }
  if (!canonicalCandidateRejected) throw new Error('SELFTEST_CANONICAL_CANDIDATE_ALLOWED');

  const sourceText = fs.readFileSync(__filename, 'utf8');
  if (/base64/i.test(sourceText)) throw new Error('SELFTEST_TEXT_CARRIER_REFERENCE_PRESENT');
  console.log(JSON.stringify({ status: 'PASS', tests: {
    source_manifest_sha256_verified: true,
    one_complete_candidate_commit: true,
    candidate_parent_exact_base: true,
    native_git_candidate_push: true,
    fast_forward_canonical_admission: true,
    stale_base_rejected_before_mutation: true,
    stale_attempt_left_remote_unchanged: true,
    canonical_ref_forbidden_as_candidate: true,
    no_base64_transport_path: true
  }, base_sha: base, candidate_sha: prepared.candidateSha, advanced_main_sha: advanced }, null, 2));
}

if (require.main === module) {
  const mode = process.argv[2] || 'selftest';
  if (mode === 'selftest') selftest();
  else throw new Error(`UNKNOWN_MODE:${mode}`);
}

module.exports = { verifyManifest, prepareCandidate, pushCandidate, admitCanonical, canonicalRefs, remoteHead };
