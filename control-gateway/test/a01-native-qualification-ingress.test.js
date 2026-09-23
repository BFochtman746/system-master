import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const normalizeNewlines = (value) => value.replace(/\r\n?/g, '\n');
const gateway = normalizeNewlines(fs.readFileSync(path.join(ROOT, '.github/workflows/a01-control-plane-gateway.yml'), 'utf8'));
const ingress = normalizeNewlines(fs.readFileSync(path.join(ROOT, '.github/workflows/control-gateway-native-a01-qualification-ingress.yml'), 'utf8'));

test('public pull-request events cannot enter the reusable A-01 gateway', () => {
  assert.match(gateway, /if: \$\{\{ github\.event_name != 'pull_request' && github\.event_name != 'pull_request_target' \}\}/);
});

test('native A-01 ingress is owner authenticated and uses hosted validation only', () => {
  assert.match(ingress, /github\.actor == github\.repository_owner/);
  assert.match(ingress, /github\.event\.issue\.author_association == 'OWNER'/);
  assert.match(ingress, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(ingress, /runs-on:\s*\[[^\]]*self-hosted/i);
});

test('native A-01 ingress has least privilege and cannot write repository contents', () => {
  assert.match(ingress, /permissions:\n  actions: write\n  contents: read\n  issues: read/);
  assert.doesNotMatch(ingress, /contents:\s*write/);
});

test('native A-01 ingress binds the exact active 001H authority and exact subject', () => {
  for (const required of [
    'SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001H',
    'SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS',
    'control-gateway-state/active-work/second-shift-production-master-completion-001h-main-reconciliation-001',
    "test \"${subject_sha}\" = \"${EVENT_MAIN_SHA}\"",
    "test \"$(jq -r '.packet.current_operation.state' \"${state_file}\")\" = 'ACTIVE'",
    "test \"$(jq -r '.packet.qualification_state' \"${state_file}\")\" = 'PASSED'",
    "test \"$(jq -r '.packet.github_admission_state' \"${state_file}\")\" = 'ADMITTED'",
  ]) assert.ok(ingress.includes(required), `missing authority guard: ${required}`);
});

test('native A-01 ingress dispatches the existing bridge instead of a second executor', () => {
  assert.match(ingress, /actions\/workflows\/a01-control-plane-dispatch-bridge\.yml\/dispatches/);
  assert.doesNotMatch(ingress, /a01-control-plane-executor\.yml\/dispatches/);
  assert.match(ingress, /repository_write_authority=false/);
  assert.match(ingress, /promotion_authority=false/);
});
