'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const bundle = path.join(root, 'qualification', 'book-eval-lemonade-001');
const teacherRoot = process.env.BOOK_EVAL_TEACHER_ROOT || 'C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_REPAIR005_GATE_D_TEACHER_V1';
const raw = path.join(teacherRoot, 'GATE-D-TEACHER-SYNTHETIC.jsonl');
const status = path.join(teacherRoot, 'GATE-D-TEACHER-STATUS.json');
const taxonomy = path.join(bundle, 'repair005', 'BOOK-EVAL-HIERARCHICAL-SPECIALIST-TAXONOMY-v1.json');
const freeze = path.join(bundle, 'scripts', 'freeze-repair005-gate-d-teacher.py');
const validate = path.join(bundle, 'scripts', 'validate-repair005-gate-d-teacher.py');
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || root, 'book-eval-gate-d-teacher-freeze-evidence');
const workDir = path.join(process.env.RUNNER_TEMP || root, `book-eval-gate-d-teacher-freeze-${process.env.GITHUB_RUN_ID || 'local'}`);
const canonical = path.join(workDir, 'GATE-D-TEACHER-CANONICAL-440.jsonl');
const manifest = path.join(evidenceDir, 'GATE-D-TEACHER-FREEZE-MANIFEST.json');
const validationLog = path.join(evidenceDir, 'GATE-D-TEACHER-VALIDATION.txt');
const summaryPath = path.join(evidenceDir, 'GATE-D-TEACHER-FREEZE-QUALIFICATION.json');
const EXPECTED_RAW_SHA = 'bb7d3b2c7e455dce271e8098fbbfd19325607b34d4c4aab10f5e5d894a0209be';

function fail(message, extra = {}) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify({
    objective: 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
    qualification: 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE',
    state: 'TEACHER_FREEZE_QUALIFICATION_FAILED',
    failure: message,
    hidden_holdout_gold_used: false,
    visible_regression_gold_used: false,
    private_training_used: false,
    development_gold_used: false,
    ...extra
  }, null, 2) + '\n');
  throw new Error(message);
}

function run(command, args) {
  return cp.spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
}

function pythonExe() {
  const candidates = [process.env.PYTHON_EXE, 'python.exe', 'python'].filter(Boolean);
  for (const candidate of candidates) {
    const r = run(candidate, ['--version']);
    if (r.status === 0) return candidate;
  }
  fail('usable Python interpreter not found');
}

function sha256File(file) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

try {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  if (fs.existsSync(path.join(bundle, 'scoring-private'))) fail('repository bundle contains scoring-private material');
  if (fs.existsSync(path.join(teacherRoot, 'scoring-private'))) fail('teacher root contains scoring-private material');
  for (const p of [raw, status, taxonomy, freeze, validate]) {
    if (!fs.existsSync(p)) fail(`required teacher-freeze input missing: ${p}`);
  }

  const rawSha = sha256File(raw);
  if (rawSha !== EXPECTED_RAW_SHA) fail('teacher raw SHA-256 differs from frozen v3 evidence', { observed_raw_sha256: rawSha, expected_raw_sha256: EXPECTED_RAW_SHA });

  const py = pythonExe();
  const frozen = run(py, [freeze, '--raw', raw, '--status', status, '--taxonomy', taxonomy, '--output', canonical, '--manifest', manifest, '--expected-raw-sha', EXPECTED_RAW_SHA]);
  if (frozen.stdout) process.stdout.write(frozen.stdout);
  if (frozen.stderr) process.stderr.write(frozen.stderr);
  if (frozen.status !== 0) fail('teacher freeze integrity/canonicalization failed', { child_exit_code: frozen.status });

  const checked = run(py, [validate, '--rows', canonical, '--taxonomy', taxonomy, '--examples-per-token', '8']);
  fs.writeFileSync(validationLog, `${checked.stdout || ''}${checked.stderr || ''}`);
  if (checked.stdout) process.stdout.write(checked.stdout);
  if (checked.stderr) process.stderr.write(checked.stderr);
  if (checked.status !== 0) fail('canonical 440-row teacher validator failed', { child_exit_code: checked.status });

  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (m.state !== 'TEACHER_SYNTHETIC_CANONICAL_FROZEN') fail('teacher freeze manifest did not reach canonical frozen state');
  if (m.canonical_records !== 440 || m.unique_teacher_ids !== 440) fail('teacher canonical cardinality is not 440/440');
  if (m.hidden_holdout_gold_used !== false || m.visible_regression_gold_used !== false || m.gold_boundary_pass !== true) fail('teacher freeze manifest violates gold boundary');
  if (Array.isArray(m.conflicting_duplicate_ids) && m.conflicting_duplicate_ids.length !== 0) fail('teacher freeze contains conflicting duplicate payloads');

  const summary = {
    objective: 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
    qualification: 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE',
    state: 'TEACHER_FREEZE_QUALIFIED',
    expected_raw_sha256: EXPECTED_RAW_SHA,
    canonical_teacher_sha256: m.canonical_teacher_sha256,
    raw_physical_records: m.raw_physical_records,
    unique_teacher_ids: m.unique_teacher_ids,
    canonical_records: m.canonical_records,
    duplicate_teacher_id_count: m.duplicate_teacher_id_count,
    duplicate_physical_rows_removed: m.duplicate_physical_rows_removed,
    hidden_holdout_gold_used: false,
    visible_regression_gold_used: false,
    private_training_used: false,
    development_gold_used: false,
    raw_teacher_persisted_to_evidence: false,
    canonical_teacher_persisted_to_evidence: false,
    promotion_authorized: false,
    next_boundary: 'private BASE_TRAINING and DEVELOPMENT_GOLD exact-hash authority must be restored before 1,052-record student ingest/retraining'
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(`PASS BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE canonical_sha256=${summary.canonical_teacher_sha256}`);
} catch (error) {
  if (!fs.existsSync(summaryPath)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(summaryPath, JSON.stringify({ objective: 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D', qualification: 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE', state: 'TEACHER_FREEZE_QUALIFICATION_FAILED', failure: error.message, hidden_holdout_gold_used: false, visible_regression_gold_used: false, private_training_used: false, development_gold_used: false }, null, 2) + '\n');
  }
  console.error(error.stack || error.message);
  process.exit(1);
}
