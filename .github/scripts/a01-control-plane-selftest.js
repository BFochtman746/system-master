'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(x, m) { if (!x) throw new Error(m); }
function run(args) {
  const r = cp.spawnSync('node', args, { cwd: root, encoding: 'utf8', shell: false });
  assert(r.status === 0, `${args.join(' ')} failed: ${r.stderr || r.stdout}`);
}

const policy = readJson('qualification/a01/a01-policy.json');
const registry = readJson('qualification/a01/registry.json');
const receiptSchema = readJson('qualification/a01/schema/qualification-receipt.schema.json');
const ticketSchema = readJson('qualification/a01/schema/return-ticket.schema.json');
const overnightTicketSchema = readJson('qualification/a01/overnight/ticket.schema.json');
const legacy = readJson('qualification/a01/legacy-direct-workflows.json');
const bootstrap = read('SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md');
const contract = read('qualification/a01/A01-OPERATING-CONTRACT.md');
const operatingMode = read('qualification/a01/A01-OPERATING-MODE-001.md');
const overnightContract = read('qualification/a01/overnight/A01-OVERNIGHT-001.md');
const secondShiftContract = read('qualification/a01/overnight/A01-SECOND-SHIFT-002.md');
const gateway = read('.github/workflows/a01-control-plane-gateway.yml');
const executor = read('.github/workflows/a01-control-plane-executor.yml');
const frontDoor = read('.github/workflows/a01-qualification-dispatch.yml');
const repairRerun = read('.github/workflows/a01-repair-rerun.yml');
const nightWorkflow = read('.github/workflows/a01-overnight-night-shift.yml');
const enforcementWorkflow = read('.github/workflows/a01-control-plane-enforcement.yml');
const runnerGuard = read('.github/scripts/a01-runner-guard.ps1');

assert(policy.policy_version >= 7, 'policy v7 required');
assert(policy.canonical_ref === 'main', 'canonical main authority');
assert(policy.canonical_front_door === '.github/workflows/a01-qualification-dispatch.yml', 'canonical front door');
assert(policy.admission_gateway === '.github/workflows/a01-control-plane-gateway.yml', 'hosted gateway path');
assert(policy.internal_executor === '.github/workflows/a01-control-plane-executor.yml', 'internal executor path');
assert(policy.runner.name === 'A-01', 'runner name');
assert(policy.runner.global_concurrency_group === 'a01-global-r2', 'current global concurrency generation');
assert(policy.runner.concurrency_generation === 2, 'concurrency generation');
assert(policy.runner.queue_mode === 'max' && policy.runner.queue_capacity === 100, 'global queue policy');
assert(policy.runner.health.min_free_disk_gb >= 10, 'runner disk guard');
assert(policy.runner.health.min_available_memory_gb >= 4, 'runner memory guard');
assert(policy.runner.health.prevent_system_sleep_during_qualification === true, 'runner sleep guard policy');
assert(policy.admission.max_outstanding_per_workstream >= 4, 'multi-ticket outstanding limit');
assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands disabled');
assert(policy.admission.require_hosted_registration_barrier_before_self_hosted === true, 'hosted barrier policy');
assert(policy.admission.require_exact_control_plane_sha === true, 'control-plane identity policy');
assert(policy.admission.require_exact_subject_sha === true, 'subject identity policy');
assert(policy.admission.require_registered_wrapper_exists_before_self_hosted === true, 'wrapper preflight policy');
assert(policy.admission.control_plane_change_retry === 'FRESH_DEFAULT_BRANCH_DISPATCH_ONLY', 'fresh dispatch retry law');
assert(policy.admission.failed_or_specific_job_rerun_after_control_plane_change === 'PROHIBITED', 'stale partial rerun prohibition');
assert(policy.admission.floating_gateway_ref === 'PROHIBITED', 'floating gateway refs prohibited');
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
assert(policy.overnight.reject_disruptive_post_actions === true, 'overnight disruptive actions disabled');
assert(policy.overnight.second_shift.enabled === true, 'second shift policy required');
for (const lane of ['FINISH','BUILD_AHEAD','RESEARCH_AHEAD','PREPARE_NEXT','EXPLORE']) assert(policy.overnight.second_shift.lanes.includes(lane), `missing second-shift lane ${lane}`);
assert(policy.post_actions.allowed.includes('windows_reboot'), 'registered reboot action');
assert(policy.post_actions.receipt_before_action === true && policy.post_actions.evidence_upload_before_action === true, 'disruptive action ordering');
assert(policy.states.includes('A01_PASSED') && policy.states.includes('SUPERSEDED'), 'standing states');

assert(registry.registry_version >= 26, 'registry v26 required');
assert(registry.qualifications['A01-CONTROL-PLANE-SELFTEST'].source === 'control_plane', 'selftest source');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].source === 'subject', 'subject qualifier registration');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].allowed_post_actions.includes('windows_reboot'), 'continuity post action');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].overnight_eligible === false, 'reboot excluded overnight');
assert(registry.qualifications['LITERARY-RESEARCH-OVERNIGHT-DEEP-HARVEST'].overnight_eligible === true, 'literary overnight eligibility');
assert(receiptSchema.required.includes('subject_sha') && receiptSchema.required.includes('promotion_authorized'), 'receipt authority fields');
assert(ticketSchema.required.includes('resume_on_pass') && ticketSchema.required.includes('notification_target'), 'return routing fields');
assert(overnightTicketSchema.required.includes('max_runtime_minutes') && overnightTicketSchema.required.includes('night_date'), 'overnight ticket authority fields');
assert(overnightTicketSchema.properties.overnight_lane && overnightTicketSchema.properties.completion_delta && overnightTicketSchema.properties.stop_condition && overnightTicketSchema.properties.depends_on_ticket_id, 'overnight portfolio schema');

assert(bootstrap.includes('A01-OVERNIGHT-001.md'), 'bootstrap overnight authority link');
assert(contract.includes('No valid receipt') || contract.includes('without a valid control-plane receipt'), 'receipt gate contract');
assert(operatingMode.includes('A01-OVERNIGHT-001'), 'normal mode acknowledges overnight extension');
assert(overnightContract.includes('00:00') && overnightContract.includes('07:00'), 'overnight contract window');
assert(secondShiftContract.includes('multiple') || secondShiftContract.includes('four READY'), 'second shift multi-ticket portfolio');

// Hosted gateway owns registration/freshness admission and contains no direct self-hosted job.
assert(gateway.includes('Hosted registration and exact-identity admission'), 'hosted admission job missing');
assert(gateway.includes('runs-on: ubuntu-latest'), 'hosted admission runner missing');
assert(gateway.includes('a01-admission-preflight.js'), 'admission preflight invocation missing');
assert(gateway.includes('A01_EXPECTED_CONTROL_PLANE_SHA'), 'expected control-plane SHA missing');
assert(gateway.includes('A01_CALLER_REF'), 'caller ref binding missing');
assert(gateway.includes('uses: ./.github/workflows/a01-control-plane-executor.yml'), 'gateway must call frozen executor relatively');
assert(!gateway.includes('runs-on: [self-hosted, Windows, X64]'), 'hosted gateway must not acquire A-01 directly');

// Internal executor preserves the already-qualified Windows behavior byte-for-byte.
assert(executor.includes('group: a01-global-r2') && executor.includes('queue: max'), 'global queue must remain in executor');
assert(executor.includes('repository: ${{ job.workflow_repository }}'), 'executor checks out own authority source');
assert(executor.includes('ref: ${{ job.workflow_sha }}'), 'executor pins own authority SHA');
assert(executor.includes('path: control-plane') && executor.includes('path: subject'), 'control/subject checkout split');
assert(executor.includes('A01_EXECUTION_CONTEXT') && executor.includes('A01_QUALIFIER_TIMEOUT_MINUTES'), 'runtime context/budget missing');
assert(executor.includes('Guard A-01 runner health before subject acquisition'), 'runner preflight missing');
assert(executor.includes('A01QualificationSleepGuard'), 'qualification sleep prevention missing');
assert(executor.includes('Record A-01 postflight and clean stale job temp'), 'runner postflight missing');
assert(executor.includes("steps.control.outputs.post_action == 'windows_reboot'"), 'registered disruptive handoff');
assert(executor.indexOf('Upload authoritative A-01 evidence') < executor.indexOf('Schedule registered Windows reboot handoff'), 'evidence before reboot');
assert(executor.includes('shutdown.exe /r /t 30'), 'delayed reboot required');
assert(executor.includes('Hold A-01 admission through registered reboot window') && executor.includes('sleep 90'), 'hosted settle missing');
assert(executor.includes('runs-on: [self-hosted, Windows, X64]'), 'A-01 runner labels');
assert(!executor.includes('qualifier_command'), 'arbitrary qualifier command prohibited');
assert(!executor.includes('shutdown.exe /r /t 0'), 'immediate reboot prohibited');

assert(frontDoor.includes('workflow_dispatch:'), 'default-branch front door dispatch missing');
assert(frontDoor.includes('refs/heads/main'), 'front door must require main');
assert(frontDoor.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'front door same-commit gateway');
assert(frontDoor.includes('expected_control_plane_sha:'), 'front door control-plane binding missing');
assert(!repairRerun.includes('a01-control-plane-gateway.yml@main'), 'repair rerun floating gateway ref prohibited');
assert(repairRerun.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'repair rerun same-commit gateway');
assert(repairRerun.includes('expected_control_plane_sha: ${{ github.sha }}'), 'repair rerun control-plane binding');

assert(runnerGuard.includes('LOW_DISK') && runnerGuard.includes('LOW_MEMORY'), 'runner resource classifications');
assert(runnerGuard.includes('SetThreadExecutionState'), 'runner sleep capability probe missing');
assert(runnerGuard.includes('STALE_TEMP_CLEANUP_FAILED'), 'runner stale temp hygiene missing');
assert(nightWorkflow.includes("cron: '57 23 * * *'") || nightWorkflow.includes('cron: 57 23 * * *'), 'off-hour kickoff missing');
assert(nightWorkflow.includes('a01-overnight-plan.js'), 'night planner missing');
assert(nightWorkflow.includes('execution_context: overnight'), 'night slots overnight context');
assert(nightWorkflow.includes('requires_previous_pass') && nightWorkflow.includes("outputs.result_class == 'PASS'"), 'night successor PASS dependency');
assert(nightWorkflow.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'night scheduler inherits hosted gateway');
assert(legacy.version === 1 && Object.keys(legacy.workflows).length > 0, 'legacy direct-workflow freeze missing');
assert(enforcementWorkflow.includes('runs-on: ubuntu-latest'), 'enforcement must not consume A-01');
assert(enforcementWorkflow.includes('a01-admission-preflight-selftest.js'), 'admission selftest must be mandatory CI');
assert(enforcementWorkflow.includes('a01-control-plane-enforce.js scan'), 'enforcement scan missing');

run(['.github/scripts/a01-control-plane.js', 'validate']);
run(['.github/scripts/a01-admission-preflight-selftest.js']);
run(['.github/scripts/a01-overnight-plan-selftest.js']);
run(['.github/scripts/a01-control-plane-enforce.js', 'selftest']);
run(['.github/scripts/a01-control-plane-enforce.js', 'scan']);
run(['.github/scripts/a01-repair-rerun-selftest.js']);

const evidenceDir = process.env.A01_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'selftest.txt'), [
    'A01_CONTROL_PLANE_SELFTEST=PASS',
    'A01_POLICY_V7=PASS',
    'A01_HOSTED_ADMISSION=PASS',
    'A01_CANONICAL_FRONT_DOOR=PASS',
    'A01_INTERNAL_EXECUTOR_PRESERVED=PASS',
    'A01_FLOATING_GATEWAY_ENFORCEMENT=PASS',
    'A01_FRESH_DISPATCH_RULE=PASS',
    'A01_REPAIR_001C_REGRESSION=PASS',
    'A01_OVERNIGHT_REGRESSION=PASS',
    'A01_RUNNER_GUARD=PASS',
    ''
  ].join('\n'));
}
console.log('A01_CONTROL_PLANE_SELFTEST=PASS policy=7 admission_generation=1');
