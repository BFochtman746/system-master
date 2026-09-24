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
  for (const required of ['control-gateway.github-native-command.v1','STATE_TRANSITION','development_response_base64','development_response_receipt','development_response_receipt_json']) assert.ok(ingress.includes(required));
  assert.ok(workflow.includes('CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64'));
  assert.ok(workflow.includes('CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON'));
});
test('native state ingress permits only governed state actions including exact A-01 PASS recording', () => {
  for (const action of ['TERMINATE_CURRENT)','REBIND_AUTHORITY)','AUTHORIZE_AND_START_SUCCESSOR)','RECORD_A01_QUALIFICATION_PASS)']) assert.ok(ingress.includes(action));
  assert.ok(script.includes("['TERMINATE_CURRENT', 'REBIND_AUTHORITY', 'AUTHORIZE_AND_START_SUCCESSOR', 'RECORD_A01_QUALIFICATION_PASS']"));
  for (const required of ['transitionCurrentOperation','rebindAuthority','finalizeActiveWorkPacket','startNextLegalOperation','updateCurrentStanding']) assert.ok(script.includes(required));
});
test('A-01 PASS recording is pending-only, exact-subject, registered, non-promotion, and artifact-backed', () => {
  for (const required of ["packet.current_operation.state !== 'ACTIVE'","packet.qualification_state !== 'PENDING'","packet.github_admission_state !== 'ADMITTED'","packet.a01_state !== 'PENDING'","entry.workstream_id !== packet.workstream_id","entry.source !== 'subject'","promotion_authority !== false","run.conclusion !== 'success'","run.path !== '.github/workflows/a01-control-plane-dispatch-bridge.yml'","a01-control-plane-gateway.yml","a01-control-plane-admission-broker.yml","a01-control-plane-executor.yml","actions/runs/${workflowRunId}/artifacts?per_page=100","artifact.digest !== artifactDigest","updateCurrentStanding(packet, { qualification_state: 'PASSED', a01_state: 'COMPLETED' })","'a01-qualification-evidence.json'"]) assert.ok(script.includes(required), 'missing A-01 state evidence invariant: ' + required);
  assert.ok(ingress.includes('["artifact_digest","artifact_name","qualification_id","subject_sha","workflow_run_id"]'));
});
test('state publisher verifies response authorization before durable state reconstruction', () => {
  assert.ok(script.includes('assertDevelopmentResponseAuthorization({'));
  assert.ok(script.includes("channel: 'GITHUB_ACTIVE_WORK_STATE_TRANSITION'"));
  assert.ok(script.indexOf('assertDevelopmentResponseAuthorization({') < script.indexOf('await publisher.reconstruct()'));
});
test('atomic successor authorization widens scope only through rebind and stages exactly one successor', () => {
  assert.ok(script.includes('allowed_paths_or_effects: request.parameters.allowed_paths_or_effects'));
  assert.ok(script.includes('staged.successor_candidates = [structuredClone(request.parameters.successor_candidate)]'));
  assert.ok(script.includes("startable.next_legal_operation.kind !== 'START_SUCCESSOR'"));
  assert.ok(script.includes('startNextLegalOperation(startable)'));
});
test('active-work publisher remains reusable, protected, and uses dedicated writer identity', () => {
  assert.ok(workflow.includes('workflow_call:'));
  assert.ok(workflow.includes('environment: control-gateway-production'));
  assert.ok(workflow.includes('CONTROL_GATEWAY_WRITER_PRIVATE_KEY'));
  assert.ok(workflow.includes('permission-contents: write'));
  assert.ok(workflow.includes('node .github/scripts/control-gateway-active-work-publisher.js'));
});
test('publisher reconstructs verified durable state before exact-CAS publication', () => {
  for (const required of ['await publisher.reconstruct()','reconstructed.head_commit_sha !== request.expected_head_commit_sha','reconstructed.publication_revision !== request.expected_publication_revision','reconstructed.packet_digest !== request.expected_packet_digest','expectedHeadCommitSha: request.expected_head_commit_sha','expectedPublicationRevision: request.expected_publication_revision','expectedPacketDigest: request.expected_packet_digest']) assert.ok(script.includes(required));
});
test('publisher rejects arbitrary packet replacement and records immutable evidence', () => {
  assert.equal(script.includes('request.packet'), false);
  for (const required of ["'development-response-authority-context.json'","'development-response-receipt.json'","'development-response.txt'","'transition-request.json'","'predecessor-envelope.json'","'result-envelope.json'","'execution-receipt.json'"]) assert.ok(script.includes(required));
});
