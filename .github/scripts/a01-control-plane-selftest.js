'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function text(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(x, m) { if (!x) throw new Error(m); }

const policy = readJson('qualification/a01/a01-policy.json');
const registry = readJson('qualification/a01/registry.json');
const receiptSchema = readJson('qualification/a01/schema/qualification-receipt.schema.json');
const ticketSchema = readJson('qualification/a01/schema/return-ticket.schema.json');
const overnightTicketSchema = readJson('qualification/a01/overnight/ticket.schema.json');
const legacy = readJson('qualification/a01/legacy-direct-workflows.json');
const workflowRetirement = readJson('governance/archive/ACTIONS-WORKFLOW-RETIREMENT-2026-09-10.json');
const bootstrap = text('SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md');
const contract = text('qualification/a01/A01-OPERATING-CONTRACT.md');
const operatingMode = text('qualification/a01/A01-OPERATING-MODE-001.md');
const barrierContract = text('qualification/a01/A01-REGISTRATION-DISPATCH-BARRIER-001.md');
const overnightContract = text('qualification/a01/overnight/A01-OVERNIGHT-001.md');
const secondShiftContract = text('qualification/a01/overnight/A01-SECOND-SHIFT-002.md');
const gateway = text('.github/workflows/a01-control-plane-gateway.yml');
const broker = text('.github/workflows/a01-control-plane-admission-broker.yml');
const executor = text('.github/workflows/a01-control-plane-executor.yml');
const repairRerun = text('.github/workflows/a01-repair-rerun.yml');
const nightWorkflow = text('.github/workflows/a01-overnight-night-shift.yml');
const enforcementWorkflow = text('.github/workflows/a01-control-plane-enforcement.yml');
const runnerGuard = text('.github/scripts/a01-runner-guard.ps1');
const admission = text('.github/scripts/a01-admission-barrier.js');

assert(policy.policy_version >= 8, 'policy v8 trusted metadata admission required');
assert(policy.control_plane_id === 'A01-CONTROL-PLANE-001', 'control plane id');
assert(policy.canonical_ref === 'main', 'canonical main authority');
assert(policy.runner.name === 'A-01', 'runner name');
assert(policy.runner.global_concurrency_group === 'a01-global-r2', 'current global concurrency generation');
assert(policy.runner.concurrency_generation === 2, 'concurrency generation');
assert(policy.runner.queue_mode === 'max' && policy.runner.queue_capacity === 100, 'global queue policy');
assert(policy.runner.unavailable_state === 'WAITING_FOR_RUNNER', 'runner offline must be waiting, not subject failure');
assert(policy.runner.github_queue_expiry_hours === 24, 'GitHub self-hosted queue expiry contract');
assert(policy.runner.assignment_requeue_seconds === 60, 'runner assignment requeue contract');
assert(policy.runner.health.min_free_disk_gb >= 10, 'runner disk guard');
assert(policy.runner.health.min_available_memory_gb >= 4, 'runner memory guard');
assert(policy.runner.health.prevent_system_sleep_during_qualification === true, 'runner sleep guard policy');
assert(policy.runner.health.record_preflight_postflight === true, 'runner health evidence policy');
assert(policy.admission.max_outstanding_per_workstream >= 4, 'multi-ticket outstanding limit');
assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands disabled');
assert(policy.admission.mode === 'TRUSTED_SELF_HOSTED_METADATA_ONLY_FOR_NONDISRUPTIVE', 'metadata-only admission mode');
assert(policy.admission.hosted_barrier_required_before_self_hosted_runner === false, 'hosted runner must not be mandatory for non-disruptive admission');
assert(policy.admission.trusted_metadata_barrier_required_before_subject_checkout === true, 'trusted metadata barrier required');
assert(policy.admission.pre_admission_subject_checkout_forbidden === true, 'subject checkout must be forbidden before admission');
assert(policy.admission.pre_admission_subject_execution_forbidden === true, 'subject execution must be forbidden before admission');
assert(policy.admission.verify_control_plane_sha_before_admission === true, 'control-plane SHA precheck required');
assert(policy.admission.verify_subject_commit_metadata_before_subject_checkout === true, 'subject metadata precheck required');
assert(policy.admission.verify_registered_wrapper_metadata_before_subject_checkout === true, 'registered wrapper metadata precheck required');
assert(policy.admission.non_disruptive_only_without_hosted_runner === true, 'metadata fallback must be non-disruptive only');
assert(policy.admission.disruptive_qualifications_fail_closed_without_hosted_admission === true, 'disruptive work must fail closed');
assert(policy.admission.blocked_requests_may_acquire_trusted_admission_runner === true, 'trusted admission may use A-01');
assert(policy.admission.blocked_requests_must_not_checkout_or_execute_subject === true, 'blocked requests may not touch subject bytes');
assert(policy.retry.never_treat_rerun_as_control_plane_refresh === true, 'rerun refresh prohibition required');
assert(policy.retry.after_registry_policy_or_gateway_change.includes('FRESH'), 'fresh-run retry rule missing');
assert(policy.receipt.require_control_plane_sha_binding === true, 'control-plane receipt binding required');
assert(policy.runtime.normal_job_timeout_minutes === 30, 'normal 30-minute envelope must remain');
assert(policy.runtime.max_qualifier_timeout_minutes === 300, 'overnight qualifier cap');
assert(policy.overnight.enabled === true && policy.overnight.timezone === 'America/New_York', 'overnight timezone policy');
assert(policy.overnight.window_start_local === '00:00' && policy.overnight.window_end_local === '07:00', 'overnight window');
assert(policy.overnight.max_ticket_runtime_minutes === 300, 'overnight ticket max');
assert(policy.overnight.checkpoint_required_above_minutes === 180 && policy.overnight.max_checkpoint_interval_minutes === 30, 'checkpoint policy');
assert(policy.overnight.one_ready_ticket_per_workstream_per_night === false, 'single-ticket bottleneck must stay removed');
assert(policy.overnight.max_ready_tickets_per_workstream_per_night >= 4, 'multi-ticket overnight cap');
assert(policy.overnight.dependency_chains.enabled === true, 'dependency chain policy required');
assert(policy.overnight.dependency_chains.depends_on_ticket_id_requires_predecessor_pass === true, 'dependency PASS rule required');
assert(policy.overnight.dependency_chains.dependent_ticket_must_follow_predecessor_immediately === true, 'dependent adjacency rule required');
assert(policy.overnight.reject_disruptive_post_actions === true, 'overnight disruptive actions disabled');
assert(policy.overnight.allow_idle_capacity === true, 'idle capacity valid');
assert(policy.overnight.second_shift.enabled === true, 'second shift policy required');
assert(policy.overnight.second_shift.require_completion_delta_for_ready === true, 'completion delta required');
assert(policy.overnight.second_shift.require_stop_condition_for_ready === true, 'stop condition required');
for (const lane of ['FINISH','BUILD_AHEAD','RESEARCH_AHEAD','PREPARE_NEXT','EXPLORE']) assert(policy.overnight.second_shift.lanes.includes(lane), `missing second-shift lane ${lane}`);
assert(policy.post_actions.allowed.includes('windows_reboot'), 'registered reboot action');
assert(policy.post_actions.receipt_before_action === true && policy.post_actions.evidence_upload_before_action === true, 'disruptive action ordering');
assert(policy.post_actions.trusted_metadata_fallback_supported === false, 'disruptive fallback must remain disabled');
assert(policy.states.includes('A01_PASSED') && policy.states.includes('SUPERSEDED'), 'standing states');
assert(registry.registry_version >= 30, 'registry generation');
assert(registry.qualifications['A01-CONTROL-PLANE-SELFTEST'].source === 'control_plane', 'selftest source');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].source === 'subject', 'subject qualifier registration');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].allowed_post_actions.includes('windows_reboot'), 'continuity post action');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].overnight_eligible === false, 'reboot excluded overnight');
assert(registry.qualifications['LITERARY-RESEARCH-OVERNIGHT-DEEP-HARVEST'].overnight_eligible === true, 'literary overnight eligibility');
assert(receiptSchema.required.includes('subject_sha') && receiptSchema.required.includes('promotion_authorized'), 'receipt authority fields');
assert(receiptSchema.properties.control_plane_sha && receiptSchema.properties.control_plane_checkout_sha && receiptSchema.properties.workflow_run_attempt, 'receipt control-plane provenance fields');
assert(ticketSchema.required.includes('resume_on_pass') && ticketSchema.required.includes('notification_target'), 'return routing fields');
assert(overnightTicketSchema.required.includes('max_runtime_minutes') && overnightTicketSchema.required.includes('night_date'), 'overnight ticket authority fields');
assert(overnightTicketSchema.properties.overnight_lane, 'overnight lane schema missing');
assert(overnightTicketSchema.properties.completion_delta, 'completion delta schema missing');
assert(overnightTicketSchema.properties.stop_condition, 'stop condition schema missing');
assert(overnightTicketSchema.properties.depends_on_ticket_id, 'overnight dependency schema missing');
assert(bootstrap.includes('A01-OVERNIGHT-001.md'), 'bootstrap overnight authority link');
assert(contract.includes('trusted metadata') || contract.includes('metadata-only'), 'operating contract metadata admission law');
assert(contract.includes('fresh workflow') || contract.includes('fresh run'), 'fresh-run contract law');
assert(operatingMode.includes('policy version **8**') || operatingMode.includes('policy version 8'), 'operating mode policy v8');
assert(operatingMode.includes('metadata-only') || operatingMode.includes('trusted metadata'), 'operating mode metadata admission');
assert(operatingMode.includes('A01-REGISTRATION-DISPATCH-BARRIER-001'), 'operating mode repair binding');
assert(overnightContract.includes('00:00') && overnightContract.includes('07:00'), 'overnight contract window');
assert(secondShiftContract.includes('multiple') || secondShiftContract.includes('four READY'), 'second shift multi-ticket portfolio');
assert(barrierContract.includes('WAITING_FOR_REGISTRATION'), 'barrier admission state');
assert(barrierContract.includes('failed-job') || barrierContract.includes('specific-job'), 'barrier rerun law');
assert(barrierContract.includes('metadata-only') || barrierContract.includes('trusted metadata'), 'barrier metadata-only law');

assert(gateway.includes('a01-control-plane-admission-broker.yml'), 'gateway routes through broker');
assert(!gateway.includes('qualifier_command'), 'gateway arbitrary commands prohibited');
assert(broker.includes('runs-on: [self-hosted, Windows, X64]'), 'trusted admission must use A-01');
assert(broker.includes('a01-admission-barrier.js" evaluate-remote'), 'remote metadata admission evaluator missing');
assert(broker.includes('Checkout exact trusted control-plane authority only'), 'trusted control-plane checkout missing');
assert(!/^\s*path\s*:\s*subject\s*$/im.test(broker), 'admission broker must never checkout subject');
assert(!/^\s*ref\s*:\s*\$\{\{\s*inputs\.subject_sha\s*\}\}\s*$/im.test(broker), 'admission broker must never fetch subject checkout');
assert(broker.includes("needs.admit.result == 'success'"), 'executor requires successful admission job');
assert(broker.includes("needs.admit.outputs.admitted == 'true'"), 'executor must depend on admission PASS');
assert(!broker.includes('qualifier_command'), 'broker arbitrary commands prohibited');
assert(executor.includes('runs-on: [self-hosted, Windows, X64]'), 'executor runner labels');
assert(executor.includes('control_plane_sha'), 'executor exact control-plane binding');
assert(executor.includes('ref: ${{ inputs.control_plane_sha }}'), 'executor checks out admitted control SHA');
assert(executor.includes('group: a01-global-r2') && executor.includes('cancel-in-progress: false'), 'global execution remains serialized without cancelling the active qualification');
assert(!/^\s*queue\s*:/m.test(executor), 'unsupported workflow concurrency queue key must remain absent');
assert(executor.includes('Guard A-01 runner health before subject acquisition'), 'runner preflight missing');
assert(executor.indexOf('Guard A-01 runner health before subject acquisition') < executor.indexOf('Checkout exact qualification subject'), 'subject checkout must follow runner guard');
assert(executor.includes('A01QualificationSleepGuard'), 'qualification sleep prevention missing');
assert(executor.includes('Record A-01 postflight and clean stale job temp'), 'runner postflight missing');
assert(executor.includes("steps.control.outputs.post_action == 'windows_reboot'"), 'registered disruptive handoff');
assert(executor.indexOf('Upload authoritative A-01 evidence') < executor.indexOf('Schedule registered Windows reboot handoff'), 'evidence before reboot scheduling');
assert(!executor.includes('qualifier_command'), 'executor arbitrary commands prohibited');
assert(admission.includes('WAITING_FOR_REGISTRATION'), 'admission waiting state missing');
assert(admission.includes('REGISTERED_EXECUTABLE_MISSING'), 'admission wrapper precheck missing');
assert(admission.includes('TRUSTED_SELF_HOSTED_METADATA_ONLY'), 'metadata-only admission identity missing');
assert(admission.includes('pre_admission_subject_checkout: false'), 'metadata admission must record no subject checkout');
assert(admission.includes('DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER'), 'disruptive fail-closed state missing');
assert(admission.includes('A01_FRESH_DISPATCH_REQUIRED'), 'fresh dispatch instruction missing');
assert(repairRerun.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'repair rerun must use same-commit gateway');
assert(!repairRerun.includes('a01-control-plane-gateway.yml@main'), 'repair rerun floating gateway forbidden');
assert(runnerGuard.includes('LOW_DISK'), 'runner disk failure classification missing');
assert(runnerGuard.includes('LOW_MEMORY'), 'runner memory failure classification missing');
assert(runnerGuard.includes('SetThreadExecutionState'), 'runner sleep capability probe missing');
assert(runnerGuard.includes('STALE_TEMP_CLEANUP_FAILED'), 'runner stale temp hygiene missing');
assert(nightWorkflow.includes('GitHub Scheduler Retired'), 'retired GitHub night scheduler standing missing');
assert(nightWorkflow.includes('SecondShiftSupervisorV2'), 'A-01 supervisor night scheduling owner missing');
assert(nightWorkflow.includes('MANUAL_AUDIT_ONLY'), 'retired GitHub scheduler must remain manual audit only');
assert(!nightWorkflow.includes('cron:'), 'retired GitHub scheduler must not retain cron authority');
assert(!nightWorkflow.includes('a01-overnight-plan.js'), 'retired GitHub scheduler must not construct night plans');
assert(!nightWorkflow.includes('a01-control-plane-gateway.yml'), 'retired GitHub scheduler must not dispatch A-01 execution');
assert(legacy.version === 2, 'legacy direct-workflow freeze generation');
const frozenLegacyWorkflows = Object.keys(legacy.workflows || {}).sort();
const retainedRunnerSupport = [...(workflowRetirement.retained_runner_support || [])].sort();
assert(frozenLegacyWorkflows.length > 0, 'legacy direct-workflow freeze missing');
assert(JSON.stringify(frozenLegacyWorkflows) === JSON.stringify(retainedRunnerSupport), 'legacy direct-workflow freeze must match retained runner support');
assert(enforcementWorkflow.includes('runs-on: ubuntu-latest'), 'repository enforcement remains separate from A-01 qualification capacity');
assert(enforcementWorkflow.includes('a01-control-plane-enforce.js scan'), 'enforcement scan missing');
assert(enforcementWorkflow.includes('a01-admission-barrier.js selftest'), 'admission enforcement selftest missing');

for (const [cmd, args] of [
  ['node', ['.github/scripts/a01-control-plane.js', 'validate']],
  ['node', ['.github/scripts/a01-admission-barrier.js', 'selftest']],
  ['node', ['.github/scripts/a01-admission-barrier.js', 'integration-selftest']],
  ['node', ['.github/scripts/a01-overnight-plan-selftest.js']],
  ['node', ['.github/scripts/a01-control-plane-enforce.js', 'selftest']],
  ['node', ['.github/scripts/a01-control-plane-enforce.js', 'scan']],
]) {
  const r = cp.spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: false });
  assert(r.status === 0, `${args.join(' ')} failed: ${r.stderr || r.stdout}`);
}

const evidenceDir = process.env.A01_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'selftest.txt'), [
    'A01_CONTROL_PLANE_SELFTEST=PASS',
    'A01_ENFORCEMENT=PASS',
    'A01_TRUSTED_METADATA_ADMISSION_BARRIER=PASS',
    'A01_PRE_ADMISSION_SUBJECT_CHECKOUT=FORBIDDEN',
    'A01_PRE_ADMISSION_SUBJECT_EXECUTION=FORBIDDEN',
    'A01_DISRUPTIVE_METADATA_FALLBACK=DISABLED',
    'A01_CONTROL_PLANE_SHA_BINDING=PASS',
    'A01_FRESH_DISPATCH_RULE=PASS',
    'A01_GLOBAL_QUEUE=MAX',
    'A01_CONCURRENCY_GENERATION=2',
    'A01_CROSS_REF_AUTHORITY=PASS',
    'A01_OVERNIGHT_POLICY=PASS',
    'A01_OVERNIGHT_PLANNER=PASS',
    'A01_SECOND_SHIFT=PASS',
    'A01_MULTI_TICKET_PORTFOLIO=PASS',
    'A01_PASS_DEPENDENCY=PASS',
    'A01_RUNNER_GUARD=PASS',
    ''
  ].join('\n'));
}
console.log('A01_CONTROL_PLANE_SELFTEST=PASS');