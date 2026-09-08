'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const WORKSTREAM = 'BOOK-EVAL-LEMONADE-001';
const QUALIFICATION = 'BOOK-EVAL-REPAIR-005-GATE-D-PRIVATE-GOLD-RECOVERY';
const CONTROL_PLANE_BASELINE = 'c51046152eaf749d672ce923ea983e1c7893d3f2';
const LEGACY_WORKFLOW_BLOB = '1e3cc163620a5b4b1172a543f87046e9bd6d219d';

const ws = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), `book-eval-private-gold-recovery-${process.env.GITHUB_RUN_ID || 'local'}`);
const bundle = path.join(ws, 'qualification', 'book-eval-lemonade-001');
const persistent = 'C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_REPAIR005_PRIVATE_RECOVERY';
const manifestPath = path.join(evidenceDir, 'PRIVATE-GOLD-RECOVERY-MANIFEST.json');
const summaryPath = path.join(evidenceDir, 'PRIVATE-GOLD-RECOVERY-SUMMARY.txt');
const envOut = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `book-eval-private-gold-recovery-${process.env.GITHUB_RUN_ID || 'local'}.env`);

function write(name, value) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, name), String(value).endsWith('\n') ? String(value) : String(value) + '\n', 'utf8');
}

function addRoot(roots, candidate) {
  if (!candidate) return;
  try {
    if (!fs.existsSync(candidate)) return;
    const key = path.resolve(candidate).toLowerCase();
    if (!roots.some(x => path.resolve(x).toLowerCase() === key)) roots.push(candidate);
  } catch (_) {}
}

function addAncestors(roots, candidate, levels) {
  if (!candidate) return;
  let current = path.resolve(candidate);
  for (let i = 0; i < levels; i++) {
    addRoot(roots, current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function findPython() {
  if (process.env.PYTHON_EXE && fs.existsSync(process.env.PYTHON_EXE)) return process.env.PYTHON_EXE;
  const found = spawnSync('where.exe', ['python.exe'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (found.error || found.status !== 0) return null;
  return String(found.stdout || '').split(/\r?\n/).map(x => x.trim()).find(Boolean) || null;
}

fs.mkdirSync(evidenceDir, { recursive: true });
write('MIGRATION-EQUIVALENCE.json', JSON.stringify({
  qualification: QUALIFICATION,
  workstream: WORKSTREAM,
  control_plane_baseline: CONTROL_PLANE_BASELINE,
  legacy_workflow_blob: LEGACY_WORKFLOW_BLOB,
  boundary_preserved: 'exact SHA-only private authority recovery; no Teacher verification, student training, selective 120B, visible-regression, or hidden-holdout qualification',
  private_bytes_uploaded_as_evidence: false
}, null, 2));

try {
  if (fs.existsSync(path.join(bundle, 'scoring-private'))) {
    throw new Error('SCORING_PRIVATE_MATERIAL_PRESENT_IN_REPOSITORY_BUNDLE');
  }
  const recoveryScript = path.join(bundle, 'scripts', 'recover-repair005-gate-d-inputs.py');
  if (!fs.existsSync(recoveryScript)) throw new Error('RECOVERY_SCRIPT_MISSING');

  const python = findPython();
  if (!python) {
    write('INFRA-FAILURE-HINT.txt', 'python.exe was not resolvable for the A-01 runner identity.');
    throw new Error('PYTHON_NOT_RESOLVABLE_ON_A01');
  }

  const pyCheck = spawnSync(python, ['-m', 'py_compile', recoveryScript], {
    cwd: ws, encoding: 'utf8', shell: false, windowsHide: true
  });
  if (pyCheck.error || pyCheck.status !== 0) {
    write('PREQUALIFICATION-FAILURE.txt', `${pyCheck.error ? pyCheck.error.message : ''}\n${pyCheck.stdout || ''}\n${pyCheck.stderr || ''}`);
    throw new Error('RECOVERY_SCRIPT_PY_COMPILE_FAILED');
  }

  fs.mkdirSync(persistent, { recursive: true });
  const roots = [];
  addRoot(roots, 'C:\\AI Test Kit');
  addRoot(roots, 'C:\\Users');
  addRoot(roots, 'C:\\actions-runner');
  addAncestors(roots, process.env.GITHUB_WORKSPACE, 4);
  addAncestors(roots, process.env.RUNNER_TEMP, 3);

  const args = [
    recoveryScript,
    '--bundle', bundle,
    '--out-dir', persistent,
    '--manifest', manifestPath,
    '--env-out', envOut
  ];
  for (const root of roots) args.push('--root', root);

  const run = spawnSync(python, args, {
    cwd: ws, encoding: 'utf8', shell: false, windowsHide: true
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) {
    write('INFRA-FAILURE-HINT.txt', `python spawn failed: ${run.error.message}`);
    throw run.error;
  }

  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const rebuilt = manifest.deterministic_rebuild;
    const summary = [
      `objective=${QUALIFICATION}`,
      `state=${String(manifest.state || '')}`,
      `exact_hash_binding=${Boolean(manifest.exact_hash_binding)}`,
      `recovered_roles=${Array.isArray(manifest.recovered_roles) ? manifest.recovered_roles.join(',') : ''}`,
      `missing_required_roles=${Array.isArray(manifest.missing_required_roles) ? manifest.missing_required_roles.join(',') : ''}`,
      `sealed_archive_match_count=${Array.isArray(manifest.sealed_archive_matches) ? manifest.sealed_archive_matches.length : 0}`,
      `deterministic_rebuild_attempted=${Boolean(rebuilt && rebuilt.attempted)}`,
      'private_paths_persisted_to_evidence=false',
      'raw_private_content_persisted_to_evidence=false',
      'qualification_rerun=false',
      'teacher_verification_run=false',
      'student_training_run=false',
      'selective_120b_run=false'
    ].join('\n') + '\n';
    fs.writeFileSync(summaryPath, summary, 'utf8');
  }

  if (run.status !== 0) throw new Error(`PRIVATE_AUTHORITY_RECOVERY_EXIT_${run.status}`);
  if (!manifest || manifest.exact_hash_binding !== true) throw new Error('EXACT_HASH_BINDING_NOT_PROVEN');
  if (Array.isArray(manifest.missing_required_roles) && manifest.missing_required_roles.length !== 0) {
    throw new Error('REQUIRED_PRIVATE_ROLE_STILL_MISSING');
  }

  write('QUALIFIER-STANDING.txt', 'PASS_PRIVATE_GOLD_RECOVERY_EXACT_HASH_BINDING');
  console.log('PASS_PRIVATE_GOLD_RECOVERY_EXACT_HASH_BINDING');
} catch (error) {
  const detail = error && error.stack ? error.stack : String(error);
  write('QUALIFIER-STANDING.txt', 'FAIL_PRIVATE_GOLD_RECOVERY');
  write('failure.txt', detail);
  console.error(detail);
  process.exit(1);
}
