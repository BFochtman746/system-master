'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WORKSTREAM = 'BOOK-EVAL-LEMONADE-001';
const QUALIFICATION = 'BOOK-EVAL-REPAIR-005-GATE-D-STUDENT-SELECTIVE';
const EXPECTED = {
  baseTraining: '0e3d237405340ae1abf0706c88c39275360c8c9380388b4f53d73275f4f38473',
  provider: '30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53',
  developmentGold: '51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a',
  teacherRaw: 'bb7d3b2c7e455dce271e8098fbbfd19325607b34d4c4aab10f5e5d894a0209be'
};

const ws = process.env.GITHUB_WORKSPACE || process.cwd();
const bundle = path.join(ws, 'qualification', 'book-eval-lemonade-001');
const scripts = path.join(bundle, 'scripts');
const taxonomy = path.join(bundle, 'repair005', 'BOOK-EVAL-HIERARCHICAL-SPECIALIST-TAXONOMY-v1.json');
const loadRequest = path.join(bundle, 'lemonade-load-request.json');
const privateRoot = process.env.BOOK_EVAL_PRIVATE_RECOVERY_ROOT ||
  'C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_REPAIR005_PRIVATE_RECOVERY';
const teacherRoot = process.env.BOOK_EVAL_TEACHER_ROOT ||
  'C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_REPAIR005_GATE_D_TEACHER_V1';
const persistentStudent = process.env.BOOK_EVAL_STUDENT_ROOT ||
  'C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_REPAIR005_GATE_D_STUDENT_V1';
const evidenceDir = process.env.A01_EVIDENCE_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), `book-eval-gate-d-student-selective-evidence-${process.env.GITHUB_RUN_ID || 'local'}`);
const workDir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `book-eval-gate-d-student-selective-${process.env.GITHUB_RUN_ID || 'local'}`);
const summaryPath = path.join(evidenceDir, 'GATE-D-STUDENT-SELECTIVE-QUALIFICATION.json');

const freezeScript = path.join(scripts, 'freeze-repair005-gate-d-teacher.py');
const validateTeacherScript = path.join(scripts, 'validate-repair005-gate-d-teacher.py');
const compileStudentScript = path.join(scripts, 'compile-repair005-gate-d-student.py');
const trainStudentScript = path.join(scripts, 'train-repair005-gate-d.py');
const selectiveScript = path.join(scripts, 'adjudicate-repair005-gate-d-selective-120b.py');
const auditScript = path.join(scripts, 'audit-repair005-gate-d-selective.py');

function writeJson(file, object) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(object, null, 2) + '\n', 'utf8');
}

function fail(message, extra = {}) {
  writeJson(summaryPath, {
    objective: 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
    workstream: WORKSTREAM,
    qualification: QUALIFICATION,
    state: 'GATE_D_STUDENT_SELECTIVE_QUALIFICATION_FAILED',
    failure: message,
    hidden_holdout_used: false,
    visible_regression_used: false,
    raw_private_content_persisted_to_evidence: false,
    private_paths_persisted_to_evidence: false,
    student_model_uploaded_as_evidence: false,
    ...extra
  });
  throw new Error(message);
}

function run(command, args, options = {}) {
  const env = { ...process.env, ...(options.env || {}) };
  const result = spawnSync(command, args, {
    cwd: ws,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function requireSuccess(label, result) {
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label}_EXIT_${result.status}`);
}

function findPython() {
  for (const candidate of [process.env.PYTHON_EXE, 'python.exe', 'python'].filter(Boolean)) {
    const result = run(candidate, ['--version']);
    if (result.status === 0) return candidate;
  }
  fail('PYTHON_NOT_RESOLVABLE_ON_A01');
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function findExactSha(root, expectedSha) {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  const matches = [];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > 50 * 1024 * 1024) continue;
        if (sha256File(full) === expectedSha) matches.push(full);
      } catch (_) {}
    }
  }
  matches.sort();
  return matches.length ? matches[0] : null;
}

function safePhase1(metrics) {
  return {
    development_cases: metrics.development_cases,
    base_training_records: metrics.base_training_records,
    teacher_synthetic_records: metrics.teacher_synthetic_records,
    combined_training_records: metrics.combined_training_records,
    source_heldout_router_accuracy: metrics.source_heldout_router_accuracy,
    source_heldout_leaf_accuracy_with_oracle_specialist: metrics.source_heldout_leaf_accuracy_with_oracle_specialist,
    source_heldout_end_to_end_accuracy: metrics.source_heldout_end_to_end_accuracy,
    source_heldout_missing_specialist_cases: metrics.source_heldout_missing_specialist_cases,
    source_heldout_clean_control_accuracy: metrics.source_heldout_clean_control_accuracy,
    source_heldout_prohibited_hard_gate_violations: metrics.source_heldout_prohibited_hard_gate_violations,
    evidence_precision: metrics.evidence_precision,
    gate_d_student_advancement_pass: Boolean(metrics.gate_d_student_advancement_pass),
    visible_regression_used: Boolean(metrics.visible_regression_used),
    hidden_holdout_used: Boolean(metrics.hidden_holdout_used)
  };
}

function safeHybrid(hybrid) {
  hybrid = hybrid || {};
  return {
    accuracy: hybrid.accuracy,
    count: hybrid.count,
    rate: hybrid.rate,
    automatic_accuracy: hybrid.automatic_accuracy,
    automatic_coverage: hybrid.automatic_coverage,
    clean_control_accuracy: hybrid.clean_control_accuracy,
    hard_gate_violations: hybrid.hard_gate_violations,
    pairwise_swap_cases: hybrid.pairwise_swap_cases,
    pairwise_swap_symmetric_cases: hybrid.pairwise_swap_symmetric_cases,
    pairwise_swap_symmetry_rate: hybrid.pairwise_swap_symmetry_rate,
    pairwise_swap_symmetry_pass: hybrid.pairwise_swap_symmetry_pass,
    target_met: Boolean(hybrid.target_met)
  };
}

try {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  if (fs.existsSync(path.join(bundle, 'scoring-private'))) {
    fail('SCORING_PRIVATE_MATERIAL_PRESENT_IN_REPOSITORY_BUNDLE');
  }

  for (const required of [
    taxonomy,
    loadRequest,
    freezeScript,
    validateTeacherScript,
    compileStudentScript,
    trainStudentScript,
    selectiveScript,
    auditScript
  ]) {
    if (!fs.existsSync(required)) fail('REQUIRED_SUBJECT_FILE_MISSING', { missing_file_name: path.basename(required) });
  }

  // Dependency preflight only. This does not rebuild or synthesize private authority.
  const baseTraining = findExactSha(privateRoot, EXPECTED.baseTraining);
  const provider = findExactSha(privateRoot, EXPECTED.provider);
  const developmentGold = findExactSha(privateRoot, EXPECTED.developmentGold);
  if (!baseTraining || !provider || !developmentGold) {
    fail('PRIVATE_RECOVERY_PREREQUISITE_NOT_PRESENT', {
      exact_base_training_present: Boolean(baseTraining),
      exact_provider_present: Boolean(provider),
      exact_development_gold_present: Boolean(developmentGold)
    });
  }

  const teacherRaw = path.join(teacherRoot, 'GATE-D-TEACHER-SYNTHETIC.jsonl');
  const teacherStatus = path.join(teacherRoot, 'GATE-D-TEACHER-STATUS.json');
  if (!fs.existsSync(teacherRaw) || !fs.existsSync(teacherStatus)) fail('TEACHER_V3_PERSISTENT_AUTHORITY_MISSING');
  const observedTeacherRawSha = sha256File(teacherRaw);
  if (observedTeacherRawSha !== EXPECTED.teacherRaw) {
    fail('TEACHER_V3_RAW_SHA_DRIFT', { observed_teacher_raw_sha256: observedTeacherRawSha, expected_teacher_raw_sha256: EXPECTED.teacherRaw });
  }

  const py = findPython();
  const compileCheck = run(py, [
    '-m', 'py_compile', freezeScript, validateTeacherScript, compileStudentScript,
    trainStudentScript, selectiveScript, auditScript
  ]);
  requireSuccess('PYTHON_BOUNDARY_COMPILE_FAILED', compileCheck);

  // 1. VERIFY TEACHER v3 440/440 FREEZE.
  const canonicalTeacher = path.join(workDir, 'GATE-D-TEACHER-CANONICAL-440.jsonl');
  const teacherManifest = path.join(workDir, 'GATE-D-TEACHER-FREEZE-MANIFEST.json');
  requireSuccess('TEACHER_FREEZE_FAILED', run(py, [
    freezeScript,
    '--raw', teacherRaw,
    '--status', teacherStatus,
    '--taxonomy', taxonomy,
    '--output', canonicalTeacher,
    '--manifest', teacherManifest,
    '--expected-raw-sha', EXPECTED.teacherRaw
  ]));
  requireSuccess('TEACHER_VALIDATION_FAILED', run(py, [
    validateTeacherScript,
    '--rows', canonicalTeacher,
    '--taxonomy', taxonomy,
    '--examples-per-token', '8'
  ]));
  const teacher = JSON.parse(fs.readFileSync(teacherManifest, 'utf8'));
  if (teacher.state !== 'TEACHER_SYNTHETIC_CANONICAL_FROZEN' || teacher.canonical_records !== 440 || teacher.unique_teacher_ids !== 440) {
    fail('TEACHER_FREEZE_DID_NOT_REACH_440_OF_440');
  }
  if (teacher.hidden_holdout_gold_used !== false || teacher.visible_regression_gold_used !== false || teacher.gold_boundary_pass !== true) {
    fail('TEACHER_FREEZE_GOLD_BOUNDARY_FAILED');
  }
  if (Array.isArray(teacher.conflicting_duplicate_ids) && teacher.conflicting_duplicate_ids.length) {
    fail('TEACHER_FREEZE_CONFLICTING_DUPLICATES');
  }

  // 2. INGEST FROZEN TEACHER ARTIFACT into exact 612+440=1,052 corpus.
  const combinedTraining = path.join(workDir, 'GATE-D-STUDENT-TRAINING-1052.jsonl');
  const ingestManifest = path.join(workDir, 'GATE-D-STUDENT-INGEST-MANIFEST.json');
  requireSuccess('STUDENT_INGEST_FAILED', run(py, [
    compileStudentScript,
    '--base-training', baseTraining,
    '--teacher', canonicalTeacher,
    '--taxonomy', taxonomy,
    '--output', combinedTraining,
    '--manifest', ingestManifest
  ]));
  const ingest = JSON.parse(fs.readFileSync(ingestManifest, 'utf8'));
  if (ingest.base_records !== 612 || ingest.teacher_records !== 440 || ingest.combined_records !== 1052) {
    fail('STUDENT_INGEST_CARDINALITY_DRIFT');
  }
  if ((ingest.missing_specialists || []).length || ingest.hidden_holdout_gold_used !== false || ingest.visible_regression_gold_used_by_teacher !== false) {
    fail('STUDENT_INGEST_QUALIFICATION_BOUNDARY_FAILED');
  }

  // 3. RETRAIN 1,052-RECORD TASK-QUALIFIED HIERARCHICAL STUDENT and source-held-out phase 1.
  const studentRun = path.join(workDir, 'student');
  requireSuccess('STUDENT_SOURCE_HELDOUT_TRAINING_FAILED', run(py, [
    trainStudentScript,
    '--training', baseTraining,
    '--teacher', canonicalTeacher,
    '--provider', provider,
    '--gold', developmentGold,
    '--taxonomy', taxonomy,
    '--output-dir', studentRun
  ]));
  const phase1Path = path.join(studentRun, 'GATE-D-METRICS.json');
  const predictions = path.join(studentRun, 'GATE-D-SOURCE-HELDOUT-PREDICTIONS.jsonl');
  if (!fs.existsSync(phase1Path) || !fs.existsSync(predictions)) fail('STUDENT_PHASE1_EVIDENCE_MISSING');
  const phase1 = JSON.parse(fs.readFileSync(phase1Path, 'utf8'));
  if (phase1.base_training_records !== 612 || phase1.teacher_synthetic_records !== 440 || phase1.combined_training_records !== 1052) {
    fail('STUDENT_PHASE1_CARDINALITY_DRIFT');
  }
  if (phase1.visible_regression_used !== false || phase1.hidden_holdout_used !== false) {
    fail('STUDENT_PHASE1_FORBIDDEN_GOLD_USE');
  }
  if (!phase1.gate_d_student_advancement_pass) {
    fail('STUDENT_GENERALIZATION_GATE_FAILED', { phase1: safePhase1(phase1) });
  }

  // 4. SOURCE-HELD-OUT + SELECTIVE-120B ESCALATION ADJUDICATION.
  const loadResponse = path.join(workDir, 'GATE-D-SELECTIVE-MODEL-LOAD.json');
  const curl = process.env.CURL_EXE || 'curl.exe';
  requireSuccess('SELECTIVE_120B_MODEL_LOAD_FAILED', run(curl, [
    '--fail', '--silent', '--show-error',
    '-X', 'POST', 'http://127.0.0.1:13305/v1/load',
    '-H', 'Content-Type: application/json',
    '--data-binary', `@${loadRequest}`,
    '-o', loadResponse
  ]));

  const fallback = path.join(workDir, 'GATE-D-SELECTIVE-120B.jsonl');
  const selectiveManifestPath = path.join(workDir, 'GATE-D-SELECTIVE-120B-MANIFEST.json');
  const selectiveEnv = {
    BOOK_EVAL_MODEL: 'user.gpt-oss-120b-MXFP4',
    BOOK_EVAL_ENDPOINT: 'http://127.0.0.1:13305/v1/responses',
    BOOK_EVAL_MAX_OUTPUT_TOKENS: '300',
    BOOK_EVAL_TEMPERATURE: '0.0',
    BOOK_EVAL_MAX_ATTEMPTS: '3',
    BOOK_EVAL_SELECTIVE_ATTEMPTS: '4',
    BOOK_EVAL_TIMEOUT_SECONDS: '240'
  };
  requireSuccess('SELECTIVE_120B_ADJUDICATION_FAILED', run(py, [
    selectiveScript,
    '--predictions', predictions,
    '--provider', provider,
    '--taxonomy', taxonomy,
    '--output', fallback,
    '--manifest', selectiveManifestPath
  ], { env: selectiveEnv }));
  const selective = JSON.parse(fs.readFileSync(selectiveManifestPath, 'utf8'));
  if (selective.hidden_holdout_gold_used !== false || selective.visible_regression_gold_used !== false || selective.development_gold_supplied_to_120b !== false) {
    fail('SELECTIVE_120B_GOLD_BOUNDARY_FAILED');
  }
  if (selective.selected_original_rate > 0.35 + 1e-12) fail('SELECTIVE_120B_ESCALATION_RATE_EXCEEDED');

  const finalPath = path.join(workDir, 'GATE-D-FINAL-METRICS.json');
  requireSuccess('SELECTIVE_SWAP_AUDIT_FAILED', run(py, [
    auditScript,
    '--training', baseTraining,
    '--teacher', canonicalTeacher,
    '--provider', provider,
    '--gold', developmentGold,
    '--taxonomy', taxonomy,
    '--phase1-metrics', phase1Path,
    '--phase1-predictions', predictions,
    '--fallback120b', fallback,
    '--output', finalPath
  ]));
  const final = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
  if (final.visible_regression_used !== false || final.hidden_holdout_used !== false) fail('FINAL_AUDIT_FORBIDDEN_GOLD_USE');

  const summary = {
    objective: 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
    workstream: WORKSTREAM,
    qualification: QUALIFICATION,
    state: final.gate_d_pass ? 'PASS_GATE_D__VISIBLE_REGRESSION_REVALIDATION_ALLOWED' : 'GATE_D_OPEN__SELECTIVE_OR_SYMMETRY_GATE_FAILED',
    subject_sha: process.env.GITHUB_SHA || null,
    exact_hash_binding: {
      base_training_sha256: EXPECTED.baseTraining,
      provider_sha256: EXPECTED.provider,
      development_gold_sha256: EXPECTED.developmentGold,
      teacher_raw_sha256: EXPECTED.teacherRaw
    },
    teacher_freeze: {
      canonical_teacher_sha256: teacher.canonical_teacher_sha256,
      raw_physical_records: teacher.raw_physical_records,
      unique_teacher_ids: teacher.unique_teacher_ids,
      canonical_records: teacher.canonical_records,
      duplicate_physical_rows_removed: teacher.duplicate_physical_rows_removed,
      conflicting_duplicate_count: Array.isArray(teacher.conflicting_duplicate_ids) ? teacher.conflicting_duplicate_ids.length : 0,
      gold_boundary_pass: teacher.gold_boundary_pass
    },
    student_ingest: {
      base_records: ingest.base_records,
      teacher_records: ingest.teacher_records,
      combined_records: ingest.combined_records,
      specialists_total: ingest.specialists_total,
      specialists_covered: ingest.specialists_covered,
      missing_specialist_count: Array.isArray(ingest.missing_specialists) ? ingest.missing_specialists.length : 0,
      combined_training_sha256: ingest.combined_training_sha256,
      ontology_token_leaks: ingest.ontology_token_leaks
    },
    phase1: safePhase1(phase1),
    selective_120b: {
      selection_policy: selective.selection_policy,
      development_cases: selective.development_cases,
      max_escalation_rate: selective.max_escalation_rate,
      selected_original_cases: selective.selected_original_cases,
      selected_original_rate: selective.selected_original_rate,
      original_120b_calls: selective.original_120b_calls,
      pairwise_swap_invariance_calls: selective.pairwise_swap_invariance_calls,
      development_gold_supplied_to_120b: selective.development_gold_supplied_to_120b
    },
    final_hybrid: safeHybrid(final.selective_hybrid),
    gate_d_pass: Boolean(final.gate_d_pass),
    visible_regression_allowed: Boolean(final.visible_regression_allowed),
    visible_regression_used: false,
    hidden_holdout_used: false,
    raw_private_content_persisted_to_evidence: false,
    private_paths_persisted_to_evidence: false,
    source_heldout_predictions_persisted_to_evidence: false,
    selective_case_rows_persisted_to_evidence: false,
    student_model_uploaded_as_evidence: false,
    student_model_local_persisted: false
  };

  if (!final.gate_d_pass) {
    writeJson(summaryPath, summary);
    throw new Error('GATE_D_SELECTIVE_OR_SYMMETRY_TARGET_NOT_MET');
  }

  // Persist only the qualified derived model locally on A-01. Never place it in evidence/artifact upload paths.
  fs.rmSync(persistentStudent, { recursive: true, force: true });
  fs.mkdirSync(persistentStudent, { recursive: true });
  for (const name of ['vectorizer.joblib', 'routers.joblib', 'leaf-models.joblib', 'MODEL-MANIFEST.json', 'GATE-D-METRICS.json']) {
    const src = path.join(studentRun, name);
    if (!fs.existsSync(src)) fail('QUALIFIED_STUDENT_MODEL_COMPONENT_MISSING', { missing_file_name: name });
    fs.copyFileSync(src, path.join(persistentStudent, name));
  }
  summary.student_model_local_persisted = true;
  writeJson(path.join(persistentStudent, 'GATE-D-A01-QUALIFICATION-RECEIPT.json'), summary);
  writeJson(summaryPath, summary);
  console.log('PASS BOOK-EVAL-REPAIR-005-GATE-D-STUDENT-SELECTIVE');
} catch (error) {
  if (!fs.existsSync(summaryPath)) {
    writeJson(summaryPath, {
      objective: 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
      workstream: WORKSTREAM,
      qualification: QUALIFICATION,
      state: 'GATE_D_STUDENT_SELECTIVE_QUALIFICATION_FAILED',
      failure: error && error.message ? error.message : String(error),
      hidden_holdout_used: false,
      visible_regression_used: false,
      raw_private_content_persisted_to_evidence: false,
      private_paths_persisted_to_evidence: false,
      student_model_uploaded_as_evidence: false
    });
  }
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
