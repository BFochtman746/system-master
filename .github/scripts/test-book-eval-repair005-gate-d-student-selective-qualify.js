'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..');
const qualifierPath = path.join(__dirname, 'book-eval-repair005-gate-d-student-selective-qualify.js');
const source = fs.readFileSync(qualifierPath, 'utf8');

function index(marker) {
  const i = source.indexOf(marker);
  assert(i >= 0, `missing contract marker: ${marker}`);
  return i;
}

const expectedHashes = [
  '0e3d237405340ae1abf0706c88c39275360c8c9380388b4f53d73275f4f38473',
  '30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53',
  '51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a',
  'bb7d3b2c7e455dce271e8098fbbfd19325607b34d4c4aab10f5e5d894a0209be'
];
for (const hash of expectedHashes) assert(source.includes(hash), `missing frozen hash ${hash}`);

const teacher = index('// 1. VERIFY TEACHER v3 440/440 FREEZE.');
const ingest = index('// 2. INGEST FROZEN TEACHER ARTIFACT into exact 612+440=1,052 corpus.');
const train = index('// 3. RETRAIN 1,052-RECORD TASK-QUALIFIED HIERARCHICAL STUDENT and source-held-out phase 1.');
const selective = index('// 4. SOURCE-HELD-OUT + SELECTIVE-120B ESCALATION ADJUDICATION.');
assert(teacher < ingest && ingest < train && train < selective, 'Gate-D execution order drift');

const phaseGate = index('if (!phase1.gate_d_student_advancement_pass)');
const modelLoad = index("SELECTIVE_120B_MODEL_LOAD_FAILED");
assert(phaseGate < modelLoad, '120B model load must remain behind student advancement gate');

const selectiveCallStart = index("requireSuccess('SELECTIVE_120B_ADJUDICATION_FAILED'");
const selectiveCallEnd = index('const selective = JSON.parse');
const selectiveCall = source.slice(selectiveCallStart, selectiveCallEnd);
assert(!selectiveCall.includes('developmentGold'), 'development gold must never be supplied to selective 120B');
assert(selectiveCall.includes("'--provider', provider"), 'selective 120B must use provider-visible input');

assert(source.includes('development_gold_supplied_to_120b !== false'), 'missing fail-closed 120B gold-boundary assertion');
assert(source.includes('visible_regression_used !== false'), 'missing visible-regression boundary assertion');
assert(source.includes('hidden_holdout_used !== false'), 'missing hidden-holdout boundary assertion');
assert(source.includes('SCORING_PRIVATE_MATERIAL_PRESENT_IN_REPOSITORY_BUNDLE'), 'missing repository private-material guard');

assert(!source.includes('actions/upload-artifact'), 'qualifier must not upload private derived artifacts');
assert(!source.includes('GATE-D-STUDENT-PRIVATE.zip'), 'qualifier must not package private student model as evidence');
assert(source.includes('student_model_uploaded_as_evidence: false'), 'missing explicit model evidence boundary');
assert(source.includes('source_heldout_predictions_persisted_to_evidence: false'), 'missing predictions evidence boundary');
assert(source.includes('selective_case_rows_persisted_to_evidence: false'), 'missing selective rows evidence boundary');

const copyStatements = source.match(/fs\.copyFileSync\([^\n]+/g) || [];
assert(copyStatements.length === 1, 'unexpected model/private copy operation count');
assert(copyStatements[0].includes('persistentStudent'), 'derived model copy must target A-01 local persistent student root');
assert(!copyStatements[0].includes('evidenceDir'), 'derived model must not be copied to evidence');

for (const relative of [
  'qualification/book-eval-lemonade-001/scripts/freeze-repair005-gate-d-teacher.py',
  'qualification/book-eval-lemonade-001/scripts/validate-repair005-gate-d-teacher.py',
  'qualification/book-eval-lemonade-001/scripts/compile-repair005-gate-d-student.py',
  'qualification/book-eval-lemonade-001/scripts/train-repair005-gate-d.py',
  'qualification/book-eval-lemonade-001/scripts/adjudicate-repair005-gate-d-selective-120b.py',
  'qualification/book-eval-lemonade-001/scripts/audit-repair005-gate-d-selective.py',
  'qualification/book-eval-lemonade-001/lemonade-load-request.json'
]) {
  assert(fs.existsSync(path.join(root, relative)), `required subject file missing: ${relative}`);
}

console.log('PASS qualifier exact frozen hashes');
console.log('PASS qualifier Gate-D execution order');
console.log('PASS 120B dependency and provider-only boundary');
console.log('PASS evidence/private-model custody boundary');
console.log('PASS required subject files present');
console.log('ALL GATE-D STUDENT SELECTIVE QUALIFIER CONTRACT TESTS PASS');
