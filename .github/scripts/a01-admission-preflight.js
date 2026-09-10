'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

function stripBom(text) { return String(text).replace(/^\uFEFF/, ''); }
function readJson(file) { return JSON.parse(stripBom(fs.readFileSync(file, 'utf8'))); }
function assert(condition, code, detail = '') {
  if (!condition) {
    const error = new Error(detail ? `${code}:${detail}` : code);
    error.code = code;
    throw error;
  }
}
function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }
function safeWrapper(rel) {
  return typeof rel === 'string' && rel.startsWith('.github/scripts/') && !rel.includes('..') && !path.isAbsolute(rel);
}
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function gitHead(root) {
  const safeRoot = path.resolve(root).replace(/\\/g, '/');
  const out = cp.spawnSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', shell: false, windowsHide: true
  });
  assert(out.status === 0, 'GIT_HEAD_UNAVAILABLE', (out.stderr || out.stdout || '').trim());
  return out.stdout.trim();
}
function emit(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
function writeEvidence(dir, payload) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'admission.json'), JSON.stringify(payload, null, 2) + '\n');
}

function preflight(options = {}) {
  const controlRoot = path.resolve(options.controlRoot || process.env.A01_CONTROL_ROOT || process.cwd());
  const subjectRoot = path.resolve(options.subjectRoot || process.env.A01_SUBJECT_ROOT || controlRoot);
  const qualificationId = options.qualificationId || process.env.A01_QUALIFICATION_ID;
  const workstreamId = options.workstreamId || process.env.A01_WORKSTREAM_ID;
  const requestedSubject = String(options.subjectSha || process.env.A01_SUBJECT_SHA || '').trim();
  const expectedControl = String(options.expectedControlPlaneSha || process.env.A01_EXPECTED_CONTROL_PLANE_SHA || '').trim();
  const callerRef = String(options.callerRef || process.env.A01_CALLER_REF || '').trim();
  const evidenceDir = options.evidenceDir || process.env.A01_ADMISSION_EVIDENCE_DIR || '';

  const controlHead = gitHead(controlRoot);
  const subjectHead = gitHead(subjectRoot);
  const policy = readJson(path.join(controlRoot, 'qualification', 'a01', 'a01-policy.json'));
  const registry = readJson(path.join(controlRoot, 'qualification', 'a01', 'registry.json'));
  const canonicalCallerRef = `refs/heads/${policy.canonical_ref}`;

  const base = {
    admission_version: 1,
    result: 'FAIL',
    control_plane_sha: controlHead,
    expected_control_plane_sha: expectedControl || null,
    caller_ref: callerRef || null,
    canonical_caller_ref: canonicalCallerRef,
    policy_version: policy.policy_version,
    registry_version: registry.registry_version,
    qualification_id: qualificationId || null,
    workstream_id: workstreamId || null,
    subject_sha: requestedSubject || null,
    subject_checkout_sha: subjectHead,
    wrapper_source: null,
    wrapper_path: null,
    wrapper_sha256: null,
    admitted_at: new Date().toISOString()
  };

  try {
    assert(policy.control_plane_id === 'A01-CONTROL-PLANE-001', 'CONTROL_PLANE_ID_MISMATCH');
    assert(policy.canonical_ref === 'main', 'CANONICAL_REF_MISMATCH');
    assert(policy.admission && policy.admission.require_registered_qualification === true, 'REGISTERED_QUALIFICATION_NOT_REQUIRED');
    assert(policy.admission.allow_arbitrary_command_input === false, 'ARBITRARY_COMMAND_INPUT_ENABLED');
    assert(isSha(controlHead), 'INVALID_CONTROL_PLANE_SHA', controlHead);
    assert(callerRef, 'CALLER_REF_REQUIRED');
    if (callerRef !== canonicalCallerRef) {
      assert(expectedControl, 'NONCANONICAL_CALLER_REQUIRES_CONTROL_PLANE_PIN', callerRef);
    }
    if (expectedControl) {
      assert(isSha(expectedControl), 'INVALID_EXPECTED_CONTROL_PLANE_SHA', expectedControl);
      assert(controlHead.toLowerCase() === expectedControl.toLowerCase(), 'CONTROL_PLANE_STALE', `${expectedControl}:${controlHead}`);
    }
    assert(qualificationId && typeof qualificationId === 'string', 'QUALIFICATION_ID_REQUIRED');
    const entry = registry.qualifications && registry.qualifications[qualificationId];
    assert(entry, 'WAITING_FOR_REGISTRATION', qualificationId);
    assert(workstreamId === entry.workstream_id, 'WORKSTREAM_MISMATCH', `${workstreamId}:${entry.workstream_id}`);
    assert(isSha(requestedSubject), 'INVALID_SUBJECT_SHA', requestedSubject);
    assert(subjectHead.toLowerCase() === requestedSubject.toLowerCase(), 'SUBJECT_IDENTITY_MISMATCH', `${requestedSubject}:${subjectHead}`);
    assert(entry.executable === 'node', 'UNSUPPORTED_EXECUTABLE', String(entry.executable));
    assert(Array.isArray(entry.args) && entry.args.length === 1, 'INVALID_REGISTERED_ARGS');
    assert(safeWrapper(entry.args[0]), 'UNSAFE_REGISTERED_WRAPPER', String(entry.args && entry.args[0]));
    assert(['control_plane', 'subject'].includes(entry.source), 'INVALID_WRAPPER_SOURCE', String(entry.source));
    const wrapperRoot = entry.source === 'control_plane' ? controlRoot : subjectRoot;
    const wrapper = path.join(wrapperRoot, entry.args[0]);
    assert(fs.existsSync(wrapper), 'REGISTERED_EXECUTABLE_MISSING', `${entry.source}:${entry.args[0]}`);

    const pass = {
      ...base,
      result: 'PASS',
      standing: 'ADMISSION_READY',
      wrapper_source: entry.source,
      wrapper_path: entry.args[0],
      wrapper_sha256: sha256File(wrapper)
    };
    writeEvidence(evidenceDir, pass);
    emit('result', 'PASS'); emit('standing', 'ADMISSION_READY'); emit('control_plane_sha', controlHead);
    emit('policy_version', String(policy.policy_version)); emit('registry_version', String(registry.registry_version));
    console.log(`A01_ADMISSION_PREFLIGHT=PASS qualification=${qualificationId} workstream=${workstreamId} subject=${requestedSubject} control_plane=${controlHead} caller_ref=${callerRef} registry=${registry.registry_version}`);
    return pass;
  } catch (error) {
    const fail = { ...base, result: 'FAIL', standing: error.code || 'ADMISSION_FAILED', reason: error.message };
    writeEvidence(evidenceDir, fail);
    emit('result', 'FAIL'); emit('standing', fail.standing); emit('control_plane_sha', controlHead);
    console.error(`A01_ADMISSION_PREFLIGHT=FAIL standing=${fail.standing} reason=${error.message}`);
    throw error;
  }
}

module.exports = { preflight, gitHead, safeWrapper, isSha };
if (require.main === module) { try { preflight(); } catch (_) { process.exit(1); } }
