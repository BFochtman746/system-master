'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const PRODUCTION_SPEC = {
  headRef: 'refs/heads/uaf-f006i-reference-schema',
  commits: [
    '75b643d740e0f6d27ecc5da603a188074455fa22',
    '238fa67703c0818a9b84cf9d613512ddd6689d83',
    'f0c567467462744d28fbff67d26807ad5779349e',
    '9bac3e6b289b3af627bc2ee3f3d066c6047d5d78',
    '6274f172ef2a8057bf466e6d552fa355171e2bbb'
  ],
  ancestry: [
    ['75b643d740e0f6d27ecc5da603a188074455fa22', '238fa67703c0818a9b84cf9d613512ddd6689d83'],
    ['238fa67703c0818a9b84cf9d613512ddd6689d83', 'f0c567467462744d28fbff67d26807ad5779349e'],
    ['f0c567467462744d28fbff67d26807ad5779349e', '9bac3e6b289b3af627bc2ee3f3d066c6047d5d78'],
    ['9bac3e6b289b3af627bc2ee3f3d066c6047d5d78', '6274f172ef2a8057bf466e6d552fa355171e2bbb']
  ],
  sourceCountCommit: '75b643d740e0f6d27ecc5da603a188074455fa22',
  expectedMainCount: 26,
  expectedTestCount: 12
};

function run(cmd, args, options = {}) {
  const result = cp.spawnSync(cmd, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: options.env || process.env
  });
  if (result.error) throw result.error;
  if (options.allowFailure !== true && result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function git(args, cwd, allowFailure = false) {
  return run('git', args, { cwd, allowFailure });
}

function sha256(file) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function listTree(repo, commit) {
  return git(['ls-tree', '-r', '--name-only', commit], repo).stdout.split(/\r?\n/).filter(Boolean);
}

function verifyBundle(bundlePath, spec, evidenceDir) {
  if (!fs.existsSync(bundlePath)) throw new Error(`BUNDLE_NOT_FOUND:${bundlePath}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recon001c-'));
  const repo = path.join(tempRoot, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(['init', '-q'], repo);

  const bundleVerify = git(['bundle', 'verify', path.resolve(bundlePath)], repo);
  const heads = git(['bundle', 'list-heads', path.resolve(bundlePath)], repo).stdout.trim().split(/\r?\n/).filter(Boolean);
  const expectedHead = heads.find(line => line.endsWith(` ${spec.headRef}`));
  if (!expectedHead) throw new Error(`EXPECTED_BUNDLE_REF_MISSING:${spec.headRef}`);
  const headSha = expectedHead.split(/\s+/)[0];

  git(['fetch', '-q', path.resolve(bundlePath), `${spec.headRef}:refs/remotes/sealed/recon001c`], repo);

  const reachability = [];
  for (const commit of spec.commits) {
    const ok = git(['cat-file', '-e', `${commit}^{commit}`], repo, true).status === 0;
    reachability.push({ commit, reachable: ok });
    if (!ok) throw new Error(`SEALED_COMMIT_UNREACHABLE:${commit}`);
  }

  const ancestry = [];
  for (const [ancestor, descendant] of spec.ancestry) {
    const ok = git(['merge-base', '--is-ancestor', ancestor, descendant], repo, true).status === 0;
    ancestry.push({ ancestor, descendant, is_ancestor: ok });
    if (!ok) throw new Error(`SEALED_ANCESTRY_FAILED:${ancestor}:${descendant}`);
  }

  const paths = listTree(repo, spec.sourceCountCommit);
  const mainFiles = paths.filter(p => /^src\/main\/java\/org\/systemmaster\/assurance\/.*\.java$/.test(p));
  const testFiles = paths.filter(p => /^src\/test\/java\/org\/systemmaster\/assurance\/.*\.java$/.test(p));
  if (mainFiles.length !== spec.expectedMainCount) throw new Error(`ASSURANCE_MAIN_COUNT_MISMATCH:${mainFiles.length}:${spec.expectedMainCount}`);
  if (testFiles.length !== spec.expectedTestCount) throw new Error(`ASSURANCE_TEST_COUNT_MISMATCH:${testFiles.length}:${spec.expectedTestCount}`);

  const result = {
    verification_version: 1,
    result: 'PASS',
    bundle_sha256: sha256(bundlePath),
    bundle_ref: spec.headRef,
    bundle_head_sha: headSha,
    complete_history_signal: /complete history/i.test(bundleVerify.stdout + bundleVerify.stderr),
    reachability,
    ancestry,
    assurance_source_counts: {
      commit: spec.sourceCountCommit,
      main_java: mainFiles.length,
      test_java: testFiles.length
    },
    assurance_main_files: mainFiles,
    assurance_test_files: testFiles,
    github_native_import_performed: false,
    production_authorized: false
  };

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'recon-001c-sealed-history-verification.json'), JSON.stringify(result, null, 2) + '\n');
    fs.writeFileSync(path.join(evidenceDir, 'bundle-verify.txt'), bundleVerify.stdout + bundleVerify.stderr);
  }
  return result;
}

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon001c-selftest-'));
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  git(['init', '-q'], src);
  git(['config', 'user.name', 'RECON-001C Selftest'], src);
  git(['config', 'user.email', 'recon001c@example.invalid'], src);

  writeFile(path.join(src, 'src/main/java/org/systemmaster/assurance/A.java'), 'class A {}\n');
  writeFile(path.join(src, 'src/main/java/org/systemmaster/assurance/B.java'), 'class B {}\n');
  writeFile(path.join(src, 'src/test/java/org/systemmaster/assurance/ATest.java'), 'class ATest {}\n');
  git(['add', '.'], src);
  git(['commit', '-q', '-m', 'a'], src);
  const a = git(['rev-parse', 'HEAD'], src).stdout.trim();
  writeFile(path.join(src, 'marker.txt'), 'b\n');
  git(['add', '.'], src);
  git(['commit', '-q', '-m', 'b'], src);
  const b = git(['rev-parse', 'HEAD'], src).stdout.trim();
  git(['branch', 'sealed-head', b], src);
  const bundle = path.join(root, 'selftest.gitbundle');
  git(['bundle', 'create', bundle, 'refs/heads/sealed-head'], src);

  const spec = {
    headRef: 'refs/heads/sealed-head',
    commits: [a, b],
    ancestry: [[a, b]],
    sourceCountCommit: a,
    expectedMainCount: 2,
    expectedTestCount: 1
  };
  const result = verifyBundle(bundle, spec, null);
  if (result.result !== 'PASS') throw new Error('SELFTEST_POSITIVE_FAILED');
  let negativePassed = false;
  try {
    verifyBundle(bundle, { ...spec, expectedMainCount: 3 }, null);
  } catch (error) {
    negativePassed = /ASSURANCE_MAIN_COUNT_MISMATCH/.test(String(error.message));
  }
  if (!negativePassed) throw new Error('SELFTEST_FAIL_CLOSED_FAILED');
  console.log('ASSURANCE_RECON_001C_SELFTEST=PASS');
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const bundle = arg('--bundle');
  if (!bundle) throw new Error('USAGE: --bundle <gitbundle> [--evidence-dir <dir>]');
  const result = verifyBundle(bundle, PRODUCTION_SPEC, arg('--evidence-dir'));
  console.log(`ASSURANCE_RECON_001C=${JSON.stringify(result)}`);
}
