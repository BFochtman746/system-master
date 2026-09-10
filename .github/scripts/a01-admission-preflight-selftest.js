'use strict';

const path = require('path');
const { preflight, gitHead } = require('./a01-admission-preflight');

const root = path.resolve(__dirname, '..', '..');
const head = gitHead(root);

function mustPass(label, fn) {
  try { fn(); }
  catch (error) { throw new Error(`${label}: expected PASS, got ${error.message}`); }
}
function mustFail(label, code, fn) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  if (!caught) throw new Error(`${label}: expected ${code}, got PASS`);
  if (caught.code !== code) throw new Error(`${label}: expected ${code}, got ${caught.code || caught.message}`);
}

const base = {
  controlRoot: root,
  subjectRoot: root,
  qualificationId: 'A01-CONTROL-PLANE-SELFTEST',
  workstreamId: 'SYSTEM-MASTER',
  subjectSha: head,
  expectedControlPlaneSha: head
};

mustPass('registered control-plane qualification', () => preflight(base));
mustFail('unknown qualification', 'WAITING_FOR_REGISTRATION', () => preflight({ ...base, qualificationId: 'A01-NOT-REGISTERED-TEST' }));
mustFail('wrong workstream', 'WORKSTREAM_MISMATCH', () => preflight({ ...base, workstreamId: 'BOOK-SYSTEM' }));
mustFail('wrong expected control plane', 'CONTROL_PLANE_STALE', () => preflight({ ...base, expectedControlPlaneSha: '0'.repeat(40) }));
mustFail('wrong requested subject', 'SUBJECT_IDENTITY_MISMATCH', () => preflight({ ...base, subjectSha: '1'.repeat(40) }));

const pass = preflight(base);
if (pass.control_plane_sha !== head || pass.subject_checkout_sha !== head) throw new Error('dual identity binding failed');
if (pass.wrapper_source !== 'control_plane') throw new Error('control-plane wrapper source not preserved');
if (!/^[0-9a-f]{64}$/.test(pass.wrapper_sha256)) throw new Error('wrapper sha256 missing');

console.log('A01_ADMISSION_PREFLIGHT_SELFTEST=PASS cases=6');
