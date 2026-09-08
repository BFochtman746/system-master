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
const legacy = readJson('qualification/a01/legacy-direct-workflows.json');
const bootstrap = fs.readFileSync(path.join(root, 'SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'qualification/a01/A01-OPERATING-CONTRACT.md'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/a01-control-plane-gateway.yml'), 'utf8');
const enforcementWorkflow = fs.readFileSync(path.join(root, '.github/workflows/a01-control-plane-enforcement.yml'), 'utf8');

assert(policy.policy_version >= 2, 'policy v2 required');
assert(policy.canonical_ref === 'main', 'canonical main authority');
assert(policy.runner.name === 'A-01', 'runner name');
assert(policy.runner.global_concurrency_group === 'a01-global', 'global concurrency');
assert(policy.runner.queue_mode === 'max' && policy.runner.queue_capacity === 100, 'global queue policy');
assert(policy.admission.max_outstanding_per_workstream === 1, 'outstanding limit');
assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands disabled');
assert(policy.post_actions.allowed.includes('windows_reboot'), 'registered reboot action');
assert(policy.post_actions.receipt_before_action === true && policy.post_actions.evidence_upload_before_action === true, 'disruptive action ordering');
assert(policy.states.includes('A01_PASSED') && policy.states.includes('SUPERSEDED'), 'standing states');
assert(registry.registry_version >= 2, 'registry v2 required');
assert(registry.qualifications['A01-CONTROL-PLANE-SELFTEST'].source === 'control_plane', 'selftest source');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].source === 'subject', 'subject qualifier registration');
assert(registry.qualifications['CONTINUITY-TARGET-WINDOWS-REBOOT'].allowed_post_actions.includes('windows_reboot'), 'continuity post action');
assert(receiptSchema.required.includes('subject_sha') && receiptSchema.required.includes('promotion_authorized'), 'receipt authority fields');
assert(ticketSchema.required.includes('resume_on_pass') && ticketSchema.required.includes('notification_target'), 'return routing fields');
assert(bootstrap.includes('A01-OPERATING-CONTRACT.md'), 'bootstrap authority link');
assert(contract.includes('No valid receipt') || contract.includes('without a valid control-plane receipt'), 'receipt gate contract');
assert(workflow.includes('group: a01-global'), 'shared concurrency in gateway');
assert(workflow.includes('queue: max'), 'global pending queue');
assert(workflow.includes('repository: ${{ job.workflow_repository }}'), 'called workflow must checkout its own authority source');
assert(workflow.includes('ref: ${{ job.workflow_sha }}'), 'called workflow must pin its own authority SHA');
assert(workflow.includes('path: control-plane') && workflow.includes('path: subject'), 'control/subject checkout split');
assert(workflow.includes("steps.control.outputs.post_action == 'windows_reboot'"), 'registered disruptive handoff');
assert(workflow.indexOf('Upload authoritative A-01 evidence') < workflow.indexOf('Apply registered Windows reboot handoff'), 'evidence must upload before reboot');
assert(workflow.includes('runs-on: [self-hosted, Windows, X64]'), 'A-01 runner labels');
assert(!workflow.includes('qualifier_command'), 'gateway must not accept arbitrary qualifier command');
assert(legacy.version === 1 && Object.keys(legacy.workflows).length > 0, 'legacy direct-workflow freeze missing');
assert(enforcementWorkflow.includes('runs-on: ubuntu-latest'), 'enforcement must not consume A-01');
assert(enforcementWorkflow.includes('a01-control-plane-enforce.js scan'), 'enforcement scan missing');

const validation = cp.spawnSync('node', ['.github/scripts/a01-control-plane.js', 'validate'], { cwd: root, encoding: 'utf8', shell: false });
assert(validation.status === 0, `validator failed: ${validation.stderr || validation.stdout}`);
const enforcementSelftest = cp.spawnSync('node', ['.github/scripts/a01-control-plane-enforce.js', 'selftest'], { cwd: root, encoding: 'utf8', shell: false });
assert(enforcementSelftest.status === 0, `enforcement selftest failed: ${enforcementSelftest.stderr || enforcementSelftest.stdout}`);
const enforcementScan = cp.spawnSync('node', ['.github/scripts/a01-control-plane-enforce.js', 'scan'], { cwd: root, encoding: 'utf8', shell: false });
assert(enforcementScan.status === 0, `enforcement scan failed: ${enforcementScan.stderr || enforcementScan.stdout}`);

const evidenceDir = process.env.A01_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'selftest.txt'), 'A01_CONTROL_PLANE_SELFTEST=PASS\nA01_ENFORCEMENT=PASS\nA01_GLOBAL_QUEUE=MAX\nA01_CROSS_REF_AUTHORITY=PASS\nA01_DISRUPTIVE_HANDOFF_POLICY=PASS\n');
}
console.log('A01_CONTROL_PLANE_SELFTEST=PASS');
