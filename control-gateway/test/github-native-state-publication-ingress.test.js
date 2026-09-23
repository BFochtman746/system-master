import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readText = (url) => fs.readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const ingress = readText(new URL('../../.github/workflows/control-gateway-native-state-publication-ingress.yml', import.meta.url));
const workflow = readText(new URL('../../.github/workflows/control-gateway-active-work-publisher.yml', import.meta.url));
const script = readText(new URL('../../.github/scripts/control-gateway-active-work-publisher.js', import.meta.url));

test('native state ingress is owner-authenticated and narrowly issue-triggered', () => {
  assert.ok(ingress.includes('issues:\n    types: [opened]'));
  assert.ok(ingress.includes('github.actor == github.repository_owner'));
  assert.ok(ingress.includes("github.event.issue.author_association == 'OWNER'"));
  assert.ok(ingress.includes("startsWith(github.event.issue.title, '[CONTROL-GATEWAY-STATE] ')"));
  assert.equal(ingress.includes('repository_dispatch'), false);
  assert.equal(ingress.includes('pull_request_target'), false);
});

test('native state ingress requires exact development response and receipt envelope', () => {
  assert.ok(ingress.includes("control-gateway.github-native-command.v1"));
  assert.ok(ingress.includes("STATE_TRANSITION"));
  assert.ok(ingress.includes('development_response_base64'));
  assert.ok(ingress.includes('development_response_receipt'));
  assert.ok(ingress.includes('development_response_receipt_json'));
  assert.ok(workflow.includes('development_response_base64:'));
  assert.ok(workflow.includes('development_response_receipt_json:'));
  assert.ok(workflow.includes('CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64'));
  assert.ok(workflow.includes('CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON'));
});

test('native state ingress permits only governed terminalization, rebind, or atomic successor authorization', () => {
  assert.ok(ingress.includes('TERMINATE_CURRENT)'));
  assert.ok(ingress.includes('REBIND_AUTHORITY)'));
  assert.ok(ingress.includes('AUTHORIZE_AND_START_SUCCESSOR)'));
  assert.ok(script.includes("['TERMINATE_CURRENT', 'REBIND_AUTHORITY', 'AUTHORIZE_AND_START_SUCCESSOR']"));
  assert.ok(script.includes('transitionCurrentOperation'));
  assert.ok(script.includes('rebindAuthority'));
  assert.ok(script.includes('finalizeActiveWorkPacket'));
  assert.ok(script.includes('startNextLegalOperation'));
});

test('state publisher verifies response authorization before durable state reconstruction', () => {
  assert.ok(script.includes('assertDevelopmentResponseAuthorization({'));
  assert.ok(script.includes("channel: 'GITHUB_ACTIVE_WORK_STATE_TRANSITION'"));
  assert.ok(script.includes('CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64'));
  assert.ok(script.includes('CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON'));
  assert.ok(script.indexOf('assertDevelopmentResponseAuthorization({') < script.indexOf('await publisher.reconstruct()'));
});

test('atomic successor authorization widens scope only through rebind and stages exactly one successor', () => {
  assert.ok(script.includes('allowed_paths_or_effects: request.parameters.allowed_paths_or_effects'));
  assert.ok(script.includes('staged.successor_candidates = [structuredClone(request.parameters.successor_candidate)]'));
  assert.ok(script.includes("startable.next_legal_operation.kind !== 'START_SUCCESSOR'"));
  assert.ok(script.includes('startNextLegalOperation(startable)'));
  assert.ok(ingress.includes("test \"$(jq -c '.parameters.allowed_paths_or_effects | keys' \"${request_file}\")\" = '[\"effects\",\"paths\"]'"));
  assert.ok(ingress.includes("test \"$(jq -c '.parameters.successor_candidate | keys' \"${request_file}\")\" = '[\"a01_state\",\"github_admission_state\",\"operation_id\",\"predecessor_receipt_id\",\"qualification_state\",\"required_receipt_ids\"]'"));
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
  assert.ok(script.includes("'development-response-authority-context.json'"));
  assert.ok(script.includes("'development-response-receipt.json'"));
  assert.ok(script.includes("'development-response.txt'"));
  assert.ok(script.includes("'transition-request.json'"));
  assert.ok(script.includes("'predecessor-envelope.json'"));
  assert.ok(script.includes("'result-envelope.json'"));
  assert.ok(script.includes("'execution-receipt.json'"));
});
