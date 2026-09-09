'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const root = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const controlRoot = path.resolve(process.env.A01_CONTROL_ROOT || root);
const evidenceDir = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || root, 'a01-assurance-recon-001b-evidence'));
const deadlineMs = Date.parse(process.env.A01_QUALIFIER_DEADLINE_UTC || '') || (Date.now() + 120 * 60 * 1000);
const repo = process.env.GITHUB_REPOSITORY || 'BFochtman746/system-master';
const token = process.env.GITHUB_TOKEN || '';
const expectedSha = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();
const workstreamRoot = path.join(root, 'system-master', 'assurance-reconciliation-001');

fs.mkdirSync(evidenceDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function write(name, value) {
  const out = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(path.join(evidenceDir, name), out.endsWith('\n') ? out : `${out}\n`, 'utf8');
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: options.encoding === null ? null : 'utf8',
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    const stdout = result.stdout ? String(result.stdout) : '';
    const stderr = result.stderr ? String(result.stderr) : '';
    throw new Error(`${command.toUpperCase()}_FAILED status=${result.status} ${result.error ? result.error.message : ''}\n${stdout}\n${stderr}`);
  }
  return result.stdout || '';
}
function git(args, options = {}) {
  const safe = root.replace(/\\/g, '/');
  return run('git', ['-c', `safe.directory=${safe}`, ...args], options);
}
function remainingMs() {
  return deadlineMs - Date.now();
}
function requireTime(label, minMs = 30000) {
  if (remainingMs() < minMs) throw new Error(`QUALIFIER_DEADLINE_TOO_CLOSE:${label}:remaining_ms=${remainingMs()}`);
}
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function parseCsvHeader(file) {
  const first = fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0];
  return first.split(',').map(x => x.trim());
}
async function apiJson(url) {
  requireTime(`api:${url}`, 15000);
  assert(token, 'GITHUB_TOKEN_REQUIRED_FOR_BRANCH_CENSUS');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'system-master-assurance-reconciliation-001b'
    }
  });
  if (response.status === 404) return { __not_found: true };
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GITHUB_API_${response.status}:${url}:${body.slice(0, 500)}`);
  }
  return await response.json();
}
async function listBranches() {
  const branches = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await apiJson(`https://api.github.com/repos/${repo}/branches?per_page=100&page=${page}`);
    assert(Array.isArray(batch), `BRANCH_LIST_NOT_ARRAY:page=${page}`);
    branches.push(...batch.map(b => ({ name: b.name, sha: b.commit && b.commit.sha ? b.commit.sha : '' })));
    if (batch.length < 100) break;
  }
  return branches;
}
async function treeForCommit(sha) {
  const commit = await apiJson(`https://api.github.com/repos/${repo}/git/commits/${sha}`);
  if (commit.__not_found) return null;
  assert(commit.tree && commit.tree.sha, `COMMIT_TREE_MISSING:${sha}`);
  const tree = await apiJson(`https://api.github.com/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  assert(!tree.__not_found && Array.isArray(tree.tree), `TREE_MISSING:${sha}`);
  return { commit, tree };
}
function relevantPath(p) {
  return /(^|\/)(assurance|qualification|uaf001|system-model|system_model|orchestrator|foundation-006|data-001|platform-006|a01)(\/|[-_.])/i.test(p)
    || /CQ[_-]?003/i.test(p)
    || /RECON[-_]?001/i.test(p);
}
function branchCandidate(name) {
  return /(assurance|cq003|uaf|foundation|system-model|orchestrator|continuity|a01|qualification|genesis|recon)/i.test(name);
}
function extractShaRefs(text) {
  return [...new Set((text.match(/\b[0-9a-f]{40}\b/gi) || []).map(x => x.toLowerCase()))].sort();
}

(async () => {
  try {
    requireTime('start');
    const head = String(git(['rev-parse', 'HEAD'])).trim().toLowerCase();
    assert(/^[0-9a-f]{40}$/.test(expectedSha), `INVALID_EXPECTED_SHA:${expectedSha}`);
    assert(head === expectedSha, `SUBJECT_SHA_MISMATCH expected=${expectedSha} actual=${head}`);

    const required = [
      'RECONCILIATION-CONTRACT.md',
      'RECON-001A-CURRENT-AUTHORITY-SYSTEM-CENSUS.csv',
      'RECON-001A-EVIDENCE-SOURCE-MAP.md',
      'RECON-001A-STATUS.json',
      'RECON-001B-RESEARCH-METHOD.md'
    ];
    for (const rel of required) assert(fs.existsSync(path.join(workstreamRoot, rel)), `MISSING_RECON_ARTIFACT:${rel}`);

    const status = JSON.parse(fs.readFileSync(path.join(workstreamRoot, 'RECON-001A-STATUS.json'), 'utf8'));
    assert(status.work_item === 'RECON-001A', 'RECON001A_STATUS_ID_MISMATCH');
    assert(status.next_objective && status.next_objective.startsWith('RECON-001B'), 'RECON001A_NEXT_OBJECTIVE_MISMATCH');
    const censusHeader = parseCsvHeader(path.join(workstreamRoot, 'RECON-001A-CURRENT-AUTHORITY-SYSTEM-CENSUS.csv'));
    for (const requiredColumn of ['system_id', 'system_name', 'current_implementation_standing', 'current_portable_evidence', 'current_target_native_evidence']) {
      assert(censusHeader.includes(requiredColumn), `CENSUS_COLUMN_MISSING:${requiredColumn}`);
    }

    const fileManifest = [];
    for (const file of walk(workstreamRoot).sort()) {
      const bytes = fs.readFileSync(file);
      fileManifest.push({ path: path.relative(root, file).replace(/\\/g, '/'), size: bytes.length, sha256: sha256(bytes) });
    }
    write('reconciliation-artifact-manifest.json', { subject_sha: head, files: fileManifest });

    requireTime('git-fsck', 60000);
    const fsck = String(git(['fsck', '--full']));
    write('git-fsck.txt', fsck || 'git fsck --full: PASS');

    requireTime('foundation-regression', 120000);
    const fwp = run('node', ['.github/scripts/fwp012-qualify.js'], {
      env: { GITHUB_WORKSPACE: root, A01_SUBJECT_ROOT: root }
    });
    assert(String(fwp).includes('PASS F-WP-012 tests=47 requirements=4'), `FWP012_SENTINEL_MISSING:${String(fwp).slice(-2000)}`);
    write('foundation-chain-regression.txt', String(fwp));

    const researchText = [
      fs.readFileSync(path.join(workstreamRoot, 'RECON-001A-EVIDENCE-SOURCE-MAP.md'), 'utf8'),
      fs.readFileSync(path.join(workstreamRoot, 'RECON-001A-STATUS.json'), 'utf8'),
      fs.readFileSync(path.join(workstreamRoot, 'RECONCILIATION-CONTRACT.md'), 'utf8')
    ].join('\n');
    const referencedShas = extractShaRefs(researchText);
    const reachability = [];
    for (const sha of referencedShas) {
      const item = await apiJson(`https://api.github.com/repos/${repo}/commits/${sha}`);
      reachability.push({ sha, reachable: !item.__not_found, message: item.__not_found ? null : (item.commit && item.commit.message ? item.commit.message.split(/\r?\n/, 1)[0] : null) });
    }
    write('referenced-sha-reachability.json', { checked: reachability.length, items: reachability });

    const branches = await listBranches();
    const candidates = branches.filter(b => branchCandidate(b.name)).sort((a, b) => a.name.localeCompare(b.name));
    const branchEvidence = [];
    for (const branch of candidates) {
      requireTime(`branch:${branch.name}`, 30000);
      const loaded = await treeForCommit(branch.sha);
      if (!loaded) {
        branchEvidence.push({ ...branch, reachable: false });
        continue;
      }
      const paths = loaded.tree.tree.filter(e => e.type === 'blob').map(e => e.path);
      const related = paths.filter(relevantPath);
      const assuranceMain = paths.filter(p => /(^|\/)src\/main\/java\/org\/systemmaster\/assurance\//i.test(p));
      const assuranceTests = paths.filter(p => /(^|\/)src\/test\/java\/org\/systemmaster\/assurance\//i.test(p));
      branchEvidence.push({
        name: branch.name,
        sha: branch.sha,
        tree_sha: loaded.commit.tree.sha,
        total_blob_paths: paths.length,
        relevant_path_count: related.length,
        assurance_main_java_count: assuranceMain.length,
        assurance_test_java_count: assuranceTests.length,
        qualification_artifact_count: related.filter(p => /qualification/i.test(p)).length,
        sample_relevant_paths: related.slice(0, 80),
        source_bearing_assurance: assuranceMain.length > 0 && assuranceTests.length > 0
      });
    }
    write('branch-assurance-source-census.json', {
      repository: repo,
      branch_count_total: branches.length,
      candidate_branch_count: candidates.length,
      source_bearing_assurance_branches: branchEvidence.filter(x => x.source_bearing_assurance).map(x => ({ name: x.name, sha: x.sha, main: x.assurance_main_java_count, tests: x.assurance_test_java_count })),
      branches: branchEvidence
    });

    const controlPolicy = JSON.parse(fs.readFileSync(path.join(controlRoot, 'qualification', 'a01', 'a01-policy.json'), 'utf8'));
    const controlRegistry = JSON.parse(fs.readFileSync(path.join(controlRoot, 'qualification', 'a01', 'registry.json'), 'utf8'));
    assert(controlPolicy.policy_version >= 4, 'CONTROL_POLICY_TOO_OLD');
    assert(controlRegistry.qualifications && controlRegistry.qualifications['ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS'], 'OVERNIGHT_QUALIFIER_NOT_REGISTERED');

    const ticketDir = path.join(controlRoot, 'qualification', 'a01', 'overnight', 'requests');
    const ownTickets = fs.existsSync(ticketDir)
      ? fs.readdirSync(ticketDir).filter(n => /ASSURANCE-RECON/i.test(n) && n.endsWith('.json'))
      : [];
    const ticketFacts = [];
    for (const name of ownTickets) {
      const value = JSON.parse(fs.readFileSync(path.join(ticketDir, name), 'utf8'));
      ticketFacts.push({ name, state: value.state, night_date: value.night_date, qualification_id: value.qualification_id, subject_sha: value.subject_sha });
    }
    write('overnight-ticket-observation.json', { tickets: ticketFacts });

    const readyForSubject = ticketFacts.filter(t => t.state === 'READY' && String(t.subject_sha).toLowerCase() === head && t.qualification_id === 'ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS');
    assert(readyForSubject.length === 1, `EXPECTED_ONE_READY_TICKET_FOR_SUBJECT:found=${readyForSubject.length}`);

    const finalStatus = String(git(['status', '--porcelain'])).trim();
    assert(finalStatus === '', `SUBJECT_WORKTREE_DIRTY_AFTER_CHALLENGE:${finalStatus}`);

    const result = {
      result: 'PASS',
      objective: 'RECON-001B-OVERNIGHT-DEEP-CENSUS',
      subject_sha: head,
      fwp001_through_fwp012_regression: 'PASS',
      git_object_integrity: 'PASS',
      referenced_sha_count: reachability.length,
      unreachable_referenced_sha_count: reachability.filter(x => !x.reachable).length,
      repository_branch_count: branches.length,
      deep_candidate_branch_count: candidates.length,
      assurance_source_bearing_branch_count: branchEvidence.filter(x => x.source_bearing_assurance).length,
      note: 'PASS means the bounded census and regression campaign executed successfully. It does not assert ASSURANCE-001 capability completeness or production standing.'
    };
    write('assurance-recon-001b-overnight-result.json', result);
    write('result.txt', `PASS ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS subject=${head} branches=${branches.length} candidates=${candidates.length} assurance_source_branches=${result.assurance_source_bearing_branch_count}`);
    console.log(`PASS ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS subject=${head} branches=${branches.length} candidates=${candidates.length} assurance_source_branches=${result.assurance_source_bearing_branch_count}`);
  } catch (error) {
    const detail = error && error.stack ? error.stack : String(error);
    write('failure.txt', detail);
    write('result.txt', 'FAIL ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS');
    console.error(detail);
    process.exit(1);
  }
})();
