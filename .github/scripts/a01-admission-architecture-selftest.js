'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function json(rel) { return JSON.parse(read(rel)); }
function assert(v, m) { if (!v) throw new Error(m); }
function spawn(script) {
  const r = cp.spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`${script} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

const policy = json('qualification/a01/a01-policy.json');
const receipt = json('qualification/a01/schema/qualification-receipt.schema.json');
const gateway = read('.github/workflows/a01-control-plane-gateway.yml');
const broker = read('.github/workflows/a01-admission-broker.yml');
const repair = read('.github/workflows/a01-repair-rerun.yml');
const overnight = read('.github/workflows/a01-overnight-night-shift.yml');
const research = read('qualification/a01/research/A01-ADMISSION-DISPATCH-BARRIER-001.md');

assert(policy.policy_version >= 7, 'policy v7 admission semantics required');
const binding = policy.admission && policy.admission.control_plane_binding;
assert(binding, 'control_plane_binding policy missing');
assert(binding.normal_cross_lane_entry_workflow === '.github/workflows/a01-admission-broker.yml', 'central admission broker must be normal cross-lane entry');
assert(binding.fresh_dispatch_required_after_control_plane_change === true, 'fresh dispatch rule missing');
assert(binding.hosted_preflight_before_self_hosted === true, 'hosted preflight rule missing');
assert(binding.same_commit_gateway_required === true, 'same-commit gateway rule missing');
assert(binding.job_level_rerun_is_authority_refresh === false, 'job rerun must not refresh authority');
assert(binding.receipt_requires_control_plane_sha === true, 'receipt control-plane binding missing');
assert(binding.unregistered_must_fail_before_self_hosted === true, 'unregistered admission must fail before A-01');

assert(Array.isArray(receipt.properties.receipt_version.enum) && receipt.properties.receipt_version.enum.includes(1) && receipt.properties.receipt_version.enum.includes(2), 'receipt v1/v2 compatibility missing');
assert(receipt.properties.control_plane_sha && receipt.properties.control_plane_checkout_sha, 'receipt control-plane properties missing');
assert(Array.isArray(receipt.allOf) && receipt.allOf.length > 0, 'v2 receipt conditional requirement missing');

assert(broker.includes('workflow_dispatch:'), 'broker dispatch entry missing');
assert(broker.includes("refs/heads/main"), 'broker must require canonical main dispatch');
assert(broker.includes('ref: ${{ github.sha }}'), 'broker must checkout dispatch-time control plane');
assert(broker.includes('a01-admission-preflight.js'), 'broker preflight missing');
assert(broker.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'broker must call local same-commit gateway');
assert(!broker.includes('a01-control-plane-gateway.yml@main'), 'broker mutable @main gateway forbidden');
assert(broker.includes('control_plane_sha: ${{ needs.admission.outputs.control_plane_sha }}'), 'broker must pass exact control-plane SHA');

assert(gateway.includes('admission_guard:'), 'gateway hosted admission guard missing');
assert(gateway.includes('runs-on: ubuntu-latest'), 'gateway hosted admission must not consume A-01');
assert(gateway.includes('a01-admission-preflight.js'), 'gateway admission preflight missing');
assert(gateway.includes('A01_CONTROL_PLANE_SHA'), 'gateway exact control-plane environment missing');
assert(gateway.includes('needs: [admission_guard, repair_lineage_guard]'), 'A-01 must depend on hosted admission and lineage guard');
assert(gateway.includes('ref: ${{ needs.admission_guard.outputs.control_plane_sha }}'), 'gateway downstream control-plane pin missing');
assert(!gateway.includes('Checkout live durable repair state'), 'live-main repair authority mixing must be removed');
assert(gateway.includes('a01-control-plane-execute-v2.js'), 'v2 receipt binding execution wrapper missing');

assert(repair.includes('ref: ${{ github.sha }}'), 'repair prepare must use dispatch-time immutable control plane');
assert(repair.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'repair rerun must call local gateway');
assert(!repair.includes('a01-control-plane-gateway.yml@main'), 'repair mutable @main gateway forbidden');
assert(repair.includes('control_plane_sha: ${{ needs.prepare.outputs.control_plane_sha }}'), 'repair rerun must pass exact control-plane SHA');

assert(overnight.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), 'overnight slots must use same-commit local gateway');
assert(!overnight.includes('a01-control-plane-gateway.yml@main'), 'overnight mutable @main gateway forbidden');

assert(research.includes('job-level/failed-job rerun') || research.includes('job-level rerun'), 'research must preserve rerun root cause');
assert(research.includes('control_plane_sha'), 'research must bind dual exact identities');

spawn('.github/scripts/a01-admission-preflight-selftest.js');
console.log('A01_ADMISSION_ARCHITECTURE_SELFTEST=PASS');
