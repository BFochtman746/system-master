'use strict';
const fs = require('fs');
const crypto = require('crypto');

function fail(message) { throw new Error(message); }
function requireObject(v, name) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${name}_OBJECT_REQUIRED`); return v; }
function requireString(v, name) { if (typeof v !== 'string' || !v.trim()) fail(`${name}_STRING_REQUIRED`); return v.trim(); }
function eq(actual, expected, name) { if (actual !== expected) fail(`${name}_MISMATCH:${actual}:${expected}`); }

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

function validateEvidence(e) {
  requireObject(e, 'evidence');
  eq(e.evidence_class, 'TARGET_IOS_CLIENT_SUSPEND_RESUME', 'EVIDENCE_CLASS');
  eq(e.qualification_id, 'CONTINUITY-IOS-SUSPEND-RESUME-001', 'QUALIFICATION_ID');
  if (!/^[0-9a-f]{40}$/.test(requireString(e.subject_commit, 'subject_commit'))) fail('SUBJECT_COMMIT_INVALID');

  const runtime = requireObject(e.runtime, 'runtime');
  eq(runtime.platform, 'iOS', 'RUNTIME_PLATFORM');
  if (!['IOS_SIMULATOR','IOS_PHYSICAL_DEVICE'].includes(runtime.runtime_kind)) fail('RUNTIME_KIND_INVALID');
  requireString(runtime.os_version, 'runtime.os_version');
  requireString(runtime.device_or_simulator_id, 'runtime.device_or_simulator_id');

  const client = requireObject(e.client, 'client');
  requireString(client.bundle_id, 'client.bundle_id');
  requireString(client.build_id, 'client.build_id');
  requireString(client.launch_instance_before, 'client.launch_instance_before');
  requireString(client.launch_instance_after, 'client.launch_instance_after');

  requireString(e.work_unit_id, 'work_unit_id');
  const lifecycle = requireObject(e.lifecycle, 'lifecycle');
  eq(lifecycle.background_or_suspend_observed, true, 'IOS_BACKGROUND_OR_SUSPEND');
  eq(lifecycle.reactivation_observed, true, 'IOS_REACTIVATION');
  if (!Array.isArray(lifecycle.events) || lifecycle.events.length < 2) fail('LIFECYCLE_EVENTS_INSUFFICIENT');
  for (const event of lifecycle.events) { requireString(event.event, 'lifecycle.event'); requireString(event.observed_at_utc, 'lifecycle.observed_at_utc'); }

  const reconnect = requireObject(e.reconnect, 'reconnect');
  eq(reconnect.same_work_unit_id, true, 'RECONNECT_SAME_WORK_UNIT');
  eq(reconnect.ephemeral_session_required, false, 'EPHEMERAL_SESSION_MUST_NOT_BE_REQUIRED');
  eq(reconnect.status_queried_after_reactivation, true, 'STATUS_QUERY_AFTER_REACTIVATION');
  eq(reconnect.progress_basis_explicit, true, 'PROGRESS_BASIS_EXPLICIT');

  const reconcile = requireObject(e.command_reconciliation, 'command_reconciliation');
  eq(reconcile.unknown_outcome_exercised, true, 'UNKNOWN_OUTCOME_REQUIRED');
  eq(reconcile.reconcile_before_recommand, true, 'RECONCILE_BEFORE_RECOMMAND');
  eq(reconcile.duplicate_effect_observed, false, 'DUPLICATE_EFFECT_FORBIDDEN');
  requireString(reconcile.command_id, 'command_id');

  const requirements = requireObject(e.requirements, 'requirements');
  eq(requirements['G-RQ-049'], 'PASS', 'G_RQ_049');
  eq(requirements['G-RQ-050'], 'PASS', 'G_RQ_050');
  eq(requirements['G-RQ-072'], 'PASS_TARGET_IOS_ARM_ONLY', 'G_RQ_072');
  requireString(e.observed_at_utc, 'observed_at_utc');

  const suppliedDigest = requireString(e.evidence_digest, 'evidence_digest');
  if (!/^[0-9a-f]{64}$/.test(suppliedDigest)) fail('EVIDENCE_DIGEST_INVALID');
  const copy = JSON.parse(JSON.stringify(e));
  delete copy.evidence_digest;
  const calculated = crypto.createHash('sha256').update(canonical(copy)).digest('hex');
  if (calculated !== suppliedDigest) fail(`EVIDENCE_DIGEST_MISMATCH:${calculated}:${suppliedDigest}`);
  return { result:'PASS', evidence_class:e.evidence_class, runtime_kind:runtime.runtime_kind, requirements:['G-RQ-049','G-RQ-050','G-RQ-072'] };
}

function selftest() {
  const base = {
    evidence_class:'TARGET_IOS_CLIENT_SUSPEND_RESUME', qualification_id:'CONTINUITY-IOS-SUSPEND-RESUME-001', subject_commit:'a'.repeat(40),
    runtime:{platform:'iOS',os_version:'target',runtime_kind:'IOS_SIMULATOR',device_or_simulator_id:'selftest-runtime'},
    client:{bundle_id:'selftest.systemmaster',build_id:'selftest',launch_instance_before:'before',launch_instance_after:'after'},
    work_unit_id:'work-selftest',
    lifecycle:{background_or_suspend_observed:true,reactivation_observed:true,events:[{event:'background',observed_at_utc:'t1'},{event:'active',observed_at_utc:'t2'}]},
    reconnect:{same_work_unit_id:true,ephemeral_session_required:false,status_queried_after_reactivation:true,progress_basis_explicit:true},
    command_reconciliation:{unknown_outcome_exercised:true,reconcile_before_recommand:true,duplicate_effect_observed:false,command_id:'cmd-selftest'},
    requirements:{'G-RQ-049':'PASS','G-RQ-050':'PASS','G-RQ-072':'PASS_TARGET_IOS_ARM_ONLY'},observed_at_utc:'selftest'
  };
  base.evidence_digest = crypto.createHash('sha256').update(canonical(base)).digest('hex');
  validateEvidence(base);
  let rejected = 0;
  for (const mutate of [
    e => e.evidence_class='PORTABLE_NON_TARGET',
    e => e.runtime.platform='Windows',
    e => e.lifecycle.background_or_suspend_observed=false,
    e => e.reconnect.ephemeral_session_required=true,
    e => e.command_reconciliation.reconcile_before_recommand=false,
    e => e.command_reconciliation.duplicate_effect_observed=true
  ]) {
    const bad = JSON.parse(JSON.stringify(base)); mutate(bad); bad.evidence_digest = crypto.createHash('sha256').update(canonical(Object.fromEntries(Object.entries(bad).filter(([k])=>k!=='evidence_digest')))).digest('hex');
    try { validateEvidence(bad); } catch (_) { rejected++; }
  }
  if (rejected !== 6) fail(`SELFTEST_REJECTION_COUNT:${rejected}`);
  console.log('PASS TARGET-IOS-EVIDENCE-VALIDATOR selftest valid=1 rejected=6 target_evidence=NOT_STARTED');
}

if (require.main === module) {
  try {
    if (process.argv[2] === '--selftest') selftest();
    else {
      const file = process.argv[2]; if (!file) fail('EVIDENCE_FILE_REQUIRED');
      const result = validateEvidence(JSON.parse(fs.readFileSync(file,'utf8')));
      console.log(`PASS TARGET-IOS-EVIDENCE runtime=${result.runtime_kind} requirements=${result.requirements.length}`);
    }
  } catch (e) { console.error(e && e.stack ? e.stack : String(e)); process.exit(1); }
}

module.exports = { validateEvidence, canonical };
