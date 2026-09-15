import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const normalizeNewlines = (value) => value.replace(/\r\n?/g, '\n');
const ingress = normalizeNewlines(fs.readFileSync(new URL('../../.github/workflows/control-gateway-native-command-ingress.yml', import.meta.url), 'utf8'));
const writer = normalizeNewlines(fs.readFileSync(new URL('../../.github/workflows/control-gateway-production-writer.yml', import.meta.url), 'utf8'));

test('native command ingress is owner-authenticated and issue-triggered', () => {
  assert.ok(ingress.includes('issues:\n    types: [opened]'));
  assert.ok(ingress.includes("github.actor == github.repository_owner"));
  assert.ok(ingress.includes("github.event.issue.author_association == 'OWNER'"));
  assert.ok(ingress.includes("startsWith(github.event.issue.title, '[CONTROL-GATEWAY-COMMAND] ')"));
  assert.ok(ingress.includes("control-gateway.github-native-command.v1"));
  assert.ok(ingress.includes("PRODUCTION_MUTATION"));
});

test('native command ingress binds command, request, plan, and repository identities', () => {
  assert.ok(ingress.includes('test "${request_id}" = "${command_id}"'));
  assert.ok(ingress.includes('test "${plan_id}" = "${command_id}"'));
  assert.ok(ingress.includes('test "${request_repo}" = "${CONTROL_GATEWAY_REPOSITORY}"'));
  assert.ok(ingress.includes('test "${plan_repo}" = "${CONTROL_GATEWAY_REPOSITORY}"'));
  assert.ok(ingress.includes('test "${CONTROL_GATEWAY_ISSUE_TITLE}" = "[CONTROL-GATEWAY-COMMAND] ${command_id}"'));
});

test('native ingress delegates to the existing production writer rather than duplicating mutation logic', () => {
  assert.ok(ingress.includes('uses: ./.github/workflows/control-gateway-production-writer.yml'));
  assert.ok(ingress.includes('secrets: inherit'));
  assert.ok(writer.includes('workflow_call:'));
  assert.ok(writer.includes('node .github/scripts/control-gateway-production-writer.js'));
  assert.ok(writer.includes('environment: control-gateway-production'));
});

test('native ingress stays narrow and does not add alternate remote dispatch surfaces', () => {
  assert.ok(ingress.includes('permissions:\n  contents: read\n  actions: read\n  issues: read'));
  assert.equal(ingress.includes('repository_dispatch'), false);
  assert.equal(ingress.includes('pull_request_target'), false);
  assert.equal(ingress.includes('workflow_dispatch'), false);
});
