'use strict';

const path = require('path');
const cp = require('child_process');
const { evaluate } = require('./a01-admission-preflight');

const root = path.resolve(__dirname, '..', '..');
function head() {
  const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim().toLowerCase();
}
function expectFailure(label, fn, pattern) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  if (!caught) throw new Error(`${label}: expected failure`);
  if (!String(caught.message).includes(pattern)) throw new Error(`${label}: expected ${pattern}, got ${caught.message}`);
}

const sha = head();
const ok = evaluate({
  controlRoot: root,
  subjectRoot: root,
  qualificationId: 'A01-CONTROL-PLANE-SELFTEST',
  workstreamId: 'SYSTEM-MASTER',
  subjectSha: sha,
  expectedControlPlaneSha: sha
});
if (ok.admission_state !== 'READY' || ok.result_class !== 'PASS') throw new Error('valid admission did not become READY');
if (ok.control_plane_sha !== sha || ok.subject_checkout_sha !== sha) throw new Error('exact identity binding failed');

expectFailure('unknown registration', () => evaluate({
  controlRoot: root, subjectRoot: root,
  qualificationId: 'DOES-NOT-EXIST', workstreamId: 'SYSTEM-MASTER',
  subjectSha: sha, expectedControlPlaneSha: sha
}), 'REGISTRATION_PENDING:DOES-NOT-EXIST');

expectFailure('wrong workstream', () => evaluate({
  controlRoot: root, subjectRoot: root,
  qualificationId: 'A01-CONTROL-PLANE-SELFTEST', workstreamId: 'BOOK-SYSTEM',
  subjectSha: sha, expectedControlPlaneSha: sha
}), 'WORKSTREAM_MISMATCH');

expectFailure('wrong control plane', () => evaluate({
  controlRoot: root, subjectRoot: root,
  qualificationId: 'A01-CONTROL-PLANE-SELFTEST', workstreamId: 'SYSTEM-MASTER',
  subjectSha: sha, expectedControlPlaneSha: '0000000000000000000000000000000000000000'
}), 'CONTROL_PLANE_SHA_MISMATCH');

expectFailure('invalid subject', () => evaluate({
  controlRoot: root, subjectRoot: root,
  qualificationId: 'A01-CONTROL-PLANE-SELFTEST', workstreamId: 'SYSTEM-MASTER',
  subjectSha: 'not-a-sha', expectedControlPlaneSha: sha
}), 'INVALID_SUBJECT_SHA');

console.log('A01_ADMISSION_PREFLIGHT_SELFTEST=PASS cases=5');
