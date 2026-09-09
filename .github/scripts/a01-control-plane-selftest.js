'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function assert(x, m) { if (!x) throw new Error(m); }

const policy = readJson('qualification/a01/a01-policy.json');
const registry = readJson('qualification/a01/registry.json');
const receiptSchema = readJson('qualification/a01/schema/qualification-receipt.schema.json');
const ticketSchema = readJson('qualification/a01/schema/return-ticket.schema.json');
const overnightTicketSchema = readJson('qualification/a01/overnight/ticket.schema.json');
const legacy = readJson('qualification/a01/legacy-direct-workflows.json');
const bootstrap = fs.readFileSync(path.join(root, 'SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'qualification/a01/A01-OPERATING-CONTRACT.md'), 'utf8');
const operatingMode = fs.readFileSync(path.join(root, 'qualification/a01/A01-OPERATING-MODE-001.md'), 'utf8');
const overnightContract = fs.readFileSync(path.join(root, 'qualification/a01/overnight/A01-OVERNIGHT-001.md'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/a01-control-plane-gateway.yml'), 'utf8');
const nightWorkflow = fs.readFileSync(path.join(root, '.github/workflows/a01-overnight-night-shift.yml'), 'utf8');
const enforcementWorkflow = fs.readFileSync(path.join(root, '.github/workflows/a01-control-plane-enforcement.yml'), 'utf8');

assert(policy.policy_version >= 4, 'policy v4 required');
assert(policy.canonical_ref === 'main', 'canonical main authority');
assert(policy.runner.name === 'A-01', 'runner name');
assert(policy.runner.global_concurrency_group === 'a01-global-r2', 'current global concurrency generation');
assert(policy.runner.concurrency_generation === 2, 'concurrency generation');
assert(policy.runner.queue_mode === 'max' && policy.runner.queue_capacity === 100, 'global queue policy');
assert(policy.admission.max_outstanding_per_workstream === 1, 'outstanding limit');
assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands disabled');
assert(policy.runtime.normal_job_timeout_minutes === 30, 'normal 30-minute envelope must remain');
assert(policy.runtime.max_qualifier_timeout_minutes === 300, 'overnight qualifier cap');
assert(policy.overnight.enabled === true && policy.overnight.timezone === 'America/New_York', 'overnight timezone policy');
assert(policy.overnight.window_start_local === '00:00' && policy.overnight.window_end_local === '07:00', 'overnight window');
assert(policy.overnight.max_ticket_runtime_minutes === 300, 'overnight ticket max');
assert(policy.overnight.checkpoint_required_above_minutes === 180 && policy.overnight.max_checkpoint_interval_minutes === 30, 'checkpoint policy');
assert(policy.overnight.reject_disruptive_post_actions === true, 'overnight disruptive actions must be disabled');
assert(policy.post_actions.allowed.includes('windows_reboot'), 'registered reboot action');
assert(policy.post_actions.receipt_before_action === true && policy.post_actions.evidence_upload_before_action === true, 'disruptive action ordering');
assert(policy.post_actions.windows_reboot_delay_seconds === 30, 'reboot delay');
assert(policy.post_actions.disruption_settle_seconds === 90, 'hosted settle duration');
assert(policy.states.includes('A01_PASSED') && policy.states.includes('SUPERSEDED'), 'standing states');
assert(registry.registry_version >= 6, 'registry v6 required');
assert(registry.qualifications['A01-CONTROL-PLANE-SELFTEST'].source === 'control_plane', 'selftest source');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].source === 'subject', 'subject qualifier registration');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].allowed_post_actions.includes('windows_reboot'), 'continuity post action');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].overnight_eligible === false, 'reboot must be excluded overnight');
assert(registry.qualifications['LITERARY-RESEARCH-OVERNIGHT-DEEP-HARVEST'].overnight_eligible === true, 'literary overnight eligibility');
assert(receiptSchema.required.includes('subject_sha') && receiptSchema.required.includes('promotion_authorized'), 'receipt authority fields');
assert(ticketSchema.required.includes('resume_on_pass') && ticketSchema.required.includes('notification_target'), 'return routing fields');
assert(overnightTicketSchema.required.includes('max_runtime_minutes') && overnightTicketSchema.required.includes('night_date'), 'overnight ticket authority fields');
assert(bootstrap.includes('A01-OVERNIGHT-001.md'), 'bootstrap overnight authority link');
assert(contract.includes('No valid receipt') || contract.includes('without a valid control-plane receipt'), 'receipt gate contract');
assert(contract.includes('hosted settle'), 'hosted disruption settle contract');
assert(operatingMode.includes('A01-OVERNIGHT-001'), 'normal mode must acknowledge overnight extension');
assert(overnightContract.includes('00:00') && overnightContract.includes('07:00'), 'overnight contract window');
assert(workflow.includes('group: a01-global-r2'), 'shared concurrency generation in gateway');
assert(workflow.includes('queue: max'), 'global pending queue');
assert(workflow.includes('repository: ${{ job.workflow_repository }}'), 'called workflow must checkout its own authority source');
assert(workflow.includes('ref: ${{ job.workflow_sha }}'), 'called workflow must pin its own authority SHA');
assert(workflow.includes('path: control-plane') && workflow.includes('path: subject'), 'control/subject checkout split');
assert(workflow.includes('A01_EXECUTION_CONTEXT'), 'execution context missing');
assert(workflow.includes('A01_QUALIFIER_TIMEOUT_MINUTES'), 'qualifier runtime budget missing');
assert(workflow.includes('timeout-minutes: ${{ inputs.job_timeout_minutes || 30 }}'), 'dynamic outer timeout missing');
assert(workflow.includes("steps.control.outputs.post_action == 'windows_reboot'"), 'registered disruptive handoff');
assert(workflow.indexOf('Upload authoritative A-01 evidence') < workflow.indexOf('Schedule registered Windows reboot handoff'), 'evidence must upload before reboot scheduling');
assert(workflow.includes('shutdown.exe /r /t 30'), 'reboot must be delayed so A-01 job can finish');
assert(workflow.includes('Hold A-01 admission through registered reboot window'), 'hosted settle job missing');
assert(workflow.includes("runs-on: ubuntu-latest"), 'hosted settle runner missing');
assert(workflow.includes('sleep 90'), 'hosted settle interval missing');
assert(workflow.includes('runs-on: [self-hosted, Windows, X64]'), 'A-01 runner labels');
assert(!workflow.includes('qualifier_command'), 'gateway must not accept arbitrary qualifier command');
assert(!workflow.includes("shutdown.exe /r /t 0"), 'immediate reboot would recreate stale runner bookkeeping');
assert(nightWorkflow.includes("timezone: 'America/New_York'") || nightWorkflow.includes('timezone: America/New_York'), 'night shift timezone missing');
assert(nightWorkflow.includes("cron: '57 23 * * *'") || nightWorkflow.includes('cron: 57 23 * * *'), 'off-hour kickoff missing');
assert(nightWorkflow.includes('a01-overnight-plan.js'), 'night planner missing');
assert(nightWorkflow.includes('execution_context: overnight'), 'night slots must use overnight context');
assert(legacy.version === 1 && Object.keys(legacy.workflows).length > 0, 'legacy direct-workflow freeze missing');
assert(enforcementWorkflow.includes('runs-on: ubuntu-latest'), 'enforcement must not consume A-01');
assert(enforcementWorkflow.includes('a01-control-plane-enforce.js scan'), 'enforcement scan missing');

const validation = cp.spawnSync('node', ['.github/scripts/a01-control-plane.js', 'validate'], { cwd: root, encoding: 'utf8', shell: false });
assert(validation.status === 0, `validator failed: ${validation.stderr || validation.stdout}`);
const overnightSelftest = cp.spawnSync('node', ['.github/scripts/a01-overnight-plan-selftest.js'], { cwd: root, encoding: 'utf8', shell: false });
assert(overnightSelftest.status === 0, `overnight planner selftest failed: ${overnightSelftest.stderr || overnightSelftest.stdout}`);
const enforcementSelftest = cp.spawnSync('node', ['.github/scripts/a01-control-plane-enforce.js', 'selftest'], { cwd: root, encoding: 'utf8', shell: false });
assert(enforcementSelftest.status === 0, `enforcement selftest failed: ${enforcementSelftest.stderr || enforcementSelftest.stdout}`);
const enforcementScan = cp.spawnSync('node', ['.github/scripts/a01-control-plane-enforce.js', 'scan'], { cwd: root, encoding: 'utf8', shell: false });
assert(enforcementScan.status === 0, `enforcement scan failed: ${enforcementScan.stderr || enforcementScan.stdout}`);

const evidenceDir = process.env.A01_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'selftest.txt'), 'A01_CONTROL_PLANE_SELFTEST=PASS\nA01_ENFORCEMENT=PASS\nA01_GLOBAL_QUEUE=MAX\nA01_CONCURRENCY_GENERATION=2\nA01_CROSS_REF_AUTHORITY=PASS\nA01_DISRUPTIVE_SETTLE=PASS\nA01_OVERNIGHT_POLICY=PASS\nA01_OVERNIGHT_PLANNER=PASS\n');
}
console.log('A01_CONTROL_PLANE_SELFTEST=PASS');
