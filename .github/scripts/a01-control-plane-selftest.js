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

assert(policy.runner.name === 'A-01', 'runner name');
assert(policy.runner.global_concurrency_group === 'a01-global', 'global concurrency');
assert(policy.admission.max_outstanding_per_workstream === 1, 'outstanding limit');
assert(policy.admission.allow_arbitrary_command_input === false, 'arbitrary commands disabled');
assert(policy.states.includes('A01_PASSED') && policy.states.includes('SUPERSEDED'), 'standing states');
assert(registry.qualifications['A01-CONTROL-PLANE-SELFTEST'], 'selftest registry entry');
assert(receiptSchema.required.includes('subject_sha') && receiptSchema.required.includes('promotion_authorized'), 'receipt authority fields');
assert(ticketSchema.required.includes('resume_on_pass') && ticketSchema.required.includes('notification_target'), 'return routing fields');
assert(bootstrap.includes('A01-OPERATING-CONTRACT.md'), 'bootstrap authority link');
assert(contract.includes('No valid receipt') || contract.includes('without a valid control-plane receipt'), 'receipt gate contract');
assert(workflow.includes('group: a01-global'), 'shared concurrency in gateway');
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
  fs.writeFileSync(path.join(evidenceDir, 'selftest.txt'), 'A01_CONTROL_PLANE_SELFTEST=PASS\nA01_ENFORCEMENT=PASS\n');
}
console.log('A01_CONTROL_PLANE_SELFTEST=PASS');
