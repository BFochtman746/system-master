import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ingress = fs.readFileSync(new URL('../../.github/workflows/control-gateway-native-state-publication-ingress.yml', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/control-gateway-active-work-publisher.yml', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../../.github/scripts/control-gateway-active-work-publisher.js', import.meta.url), 'utf8');

test('native state ingress is owner-authenticated and narrowly issue-triggered', () => {
  assert.ok(ingress.includes('issues:\n    types: [opened]'));
  assert.ok(ingress.includes('github.actor == github.repository_owner'));
  assert.ok(ingress.includes("github.event.issue.author_association == 'OWNER'"));
  assert.ok(ingress.includes("startsWith(github.event.issue.title, '[CONTROL-GATEWAY-STATE] ')"));
  assert.equal(ingress.includes('repository_dispatch'), false);
  assert.equal(ingress.includes('pull_request_target'), false);
});

test('native state ingress permits only terminalization and authority rebind', () => {
  assert.ok(ingress.includes('TERMINATE_CURRENT)'));
  assert.ok(ingress.includes('REBIND_AUTHORITY)'));
  assert.ok(script.includes("['TERMINATE_CURRENT', 'REBIND_AUTHORITY']"));
  assert.ok(script.includes("transitionCurrentOperation"));
  assert.ok(script.includes("rebindAuthority"));
});

test('active-work publisher is reusable, protected, and uses dedicated writer identity', () => {
  assert.ok(workflow.includes('workflow_call:'));
  assert.ok(workflow.includes('environment: control-gateway-production'));
  assert.ok(workflow.includes('CONTROL_GATEWAY_WRITER_PRIVATE_KEY'));
  assert.ok(workflow.includes('permission-contents: write'));
  assert.ok(workflow.includes('node .github/scripts/control-gateway-active-work-publisher.js'));
  assert.ok(workflow.includes('Upload immutable active-work evidence'));
});

test('publisher reconstructs verified durable state before exact-CAS publication', () => {
  assert.ok(script.includes('await publisher.reconstruct()'));
  assert.ok(script.includes("reconstructed.head_commit_sha !== request.expected_head_commit_sha"));
  assert.ok(script.includes("reconstructed.publication_revision !== request.expected_publication_revision"));
  assert.ok(script.includes("reconstructed.packet_digest !== request.expected_packet_digest"));
  assert.ok(script.includes('expectedHeadCommitSha: request.expected_head_commit_sha'));
  assert.ok(script.includes('expectedPublicationRevision: request.expected_publication_revision'));
  assert.ok(script.includes('expectedPacketDigest: request.expected_packet_digest'));
});

test('publisher rejects arbitrary packet replacement and records immutable evidence', () => {
  assert.equal(script.includes('request.packet'), false);
  assert.ok(script.includes("'transition-request.json'"));
  assert.ok(script.includes("'predecessor-envelope.json'"));
  assert.ok(script.includes("'result-envelope.json'"));
  assert.ok(script.includes("'execution-receipt.json'"));
});
