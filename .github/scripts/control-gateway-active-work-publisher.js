'use strict';

async function main() {
  const { GitHubActiveWorkPublisher, GitHubActiveWorkRestTransport } = await import('../../control-gateway/src/github-active-work-publication.js');
  const { transitionCurrentOperation, rebindAuthority, finalizeActiveWorkPacket, startNextLegalOperation, updateCurrentStanding } = await import('../../control-gateway/src/active-work-state.js');
  const { assertDevelopmentResponseAuthorization } = await import('../../control-gateway/src/development-response-governor.js');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const request = JSON.parse(process.env.CONTROL_GATEWAY_STATE_TRANSITION_REQUEST_JSON || 'null');
  const responseBase64 = String(process.env.CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64 || '').trim();
  const responseReceipt = JSON.parse(process.env.CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON || 'null');
  const responseText = responseBase64 ? Buffer.from(responseBase64, 'base64').toString('utf8') : '';
  const token = String(process.env.CONTROL_GATEWAY_WRITER_TOKEN || '').trim();
  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  const actualAppSlug = String(process.env.CONTROL_GATEWAY_WRITER_ACTUAL_APP_SLUG || '').trim();
  const expectedAppSlug = String(process.env.CONTROL_GATEWAY_WRITER_EXPECTED_APP_SLUG || '').trim();
  const installationId = String(process.env.CONTROL_GATEWAY_WRITER_INSTALLATION_ID || '').trim();

  if (!request || !responseBase64 || !responseReceipt || !responseText || !token || !actualAppSlug || !expectedAppSlug || !installationId) throw new Error('ACTIVE_WORK_PUBLICATION_INPUTS_MISSING');
  if (actualAppSlug !== expectedAppSlug) throw new Error(`ACTIVE_WORK_PUBLICATION_WRITER_APP_MISMATCH:${actualAppSlug}`);
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error(`ACTIVE_WORK_PUBLICATION_REF_FORBIDDEN:${process.env.GITHUB_REF || '<missing>'}`);

  const authorityContext = {
    channel: 'GITHUB_ACTIVE_WORK_STATE_TRANSITION',
    transition_request: request
  };
  assertDevelopmentResponseAuthorization({
    responseText,
    responseReceipt,
    authorityContext
  });

  const exactKeys = (value, expected, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_INVALID`);
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label}_KEYS_INVALID:${actual.join(',')}`);
  };

  exactKeys(request, [
    'protocol_version', 'transition_id', 'repository', 'state_ref', 'mission_version', 'workstream_id',
    'expected_head_commit_sha', 'expected_publication_revision', 'expected_packet_digest', 'action', 'parameters'
  ], 'ACTIVE_WORK_PUBLICATION_REQUEST');
  if (request.protocol_version !== 'control-gateway.active-work-transition-request.v1') throw new Error('ACTIVE_WORK_PUBLICATION_PROTOCOL_INVALID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(request.transition_id || '')) throw new Error('ACTIVE_WORK_PUBLICATION_TRANSITION_ID_INVALID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(request.state_ref || '') || request.state_ref.includes('..') || request.state_ref.includes('//') || request.state_ref.endsWith('/')) throw new Error('ACTIVE_WORK_PUBLICATION_STATE_REF_INVALID');
  if (!/^[0-9a-f]{40}$/.test(request.expected_head_commit_sha || '')) throw new Error('ACTIVE_WORK_PUBLICATION_EXPECTED_HEAD_INVALID');
  if (!Number.isSafeInteger(request.expected_publication_revision) || request.expected_publication_revision < 1) throw new Error('ACTIVE_WORK_PUBLICATION_EXPECTED_REVISION_INVALID');
  if (!/^[0-9a-f]{64}$/.test(request.expected_packet_digest || '')) throw new Error('ACTIVE_WORK_PUBLICATION_EXPECTED_PACKET_DIGEST_INVALID');
  if (!['TERMINATE_CURRENT', 'REBIND_AUTHORITY', 'AUTHORIZE_AND_START_SUCCESSOR', 'RECORD_A01_QUALIFICATION_PASS'].includes(request.action)) throw new Error('ACTIVE_WORK_PUBLICATION_ACTION_INVALID');

  const parts = String(request.repository || '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error('ACTIVE_WORK_PUBLICATION_REPOSITORY_INVALID');
  const [owner, repo] = parts;
  const transport = new GitHubActiveWorkRestTransport({ owner, repo, tokenProvider: async () => token });
  const publisher = new GitHubActiveWorkPublisher({ transport, ref: request.state_ref, workstreamId: request.workstream_id, missionVersion: request.mission_version });
  const reconstructed = await publisher.reconstruct();

  if (reconstructed.head_commit_sha !== request.expected_head_commit_sha) throw new Error('ACTIVE_WORK_PUBLICATION_HEAD_CONFLICT');
  if (reconstructed.publication_revision !== request.expected_publication_revision) throw new Error('ACTIVE_WORK_PUBLICATION_REVISION_CONFLICT');
  if (reconstructed.packet_digest !== request.expected_packet_digest) throw new Error('ACTIVE_WORK_PUBLICATION_PACKET_CONFLICT');
  if (reconstructed.envelope.packet.repository !== request.repository) throw new Error('ACTIVE_WORK_PUBLICATION_REPOSITORY_MISMATCH');

  let nextPacket;
  let qualificationEvidence = null;
  if (request.action === 'TERMINATE_CURRENT') {
    exactKeys(request.parameters, ['terminal_receipt', 'successor_candidates'], 'ACTIVE_WORK_PUBLICATION_TERMINATE_PARAMETERS');
    nextPacket = transitionCurrentOperation(reconstructed.envelope.packet, {
      state: 'TERMINAL',
      terminal_receipt: request.parameters.terminal_receipt,
      successor_candidates: request.parameters.successor_candidates
    });
  } else if (request.action === 'REBIND_AUTHORITY') {
    exactKeys(request.parameters, ['receipt_id', 'authoritative_subject'], 'ACTIVE_WORK_PUBLICATION_REBIND_PARAMETERS');
    nextPacket = rebindAuthority(reconstructed.envelope.packet, {
      receipt_id: request.parameters.receipt_id,
      authoritative_subject: request.parameters.authoritative_subject
    });
  } else if (request.action === 'RECORD_A01_QUALIFICATION_PASS') {
    exactKeys(request.parameters, ['artifact_digest', 'artifact_name', 'qualification_id', 'subject_sha', 'workflow_run_id'], 'ACTIVE_WORK_PUBLICATION_A01_RESULT_PARAMETERS');
    const qualificationId = String(request.parameters.qualification_id || '');
    const subjectSha = String(request.parameters.subject_sha || '');
    const artifactName = String(request.parameters.artifact_name || '');
    const artifactDigest = String(request.parameters.artifact_digest || '');
    const workflowRunId = request.parameters.workflow_run_id;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(qualificationId)) throw new Error('ACTIVE_WORK_PUBLICATION_A01_QUALIFICATION_ID_INVALID');
    if (!/^[0-9a-f]{40}$/.test(subjectSha)) throw new Error('ACTIVE_WORK_PUBLICATION_A01_SUBJECT_INVALID');
    if (!Number.isSafeInteger(workflowRunId) || workflowRunId < 1) throw new Error('ACTIVE_WORK_PUBLICATION_A01_RUN_ID_INVALID');
    if (!/^sha256:[0-9a-f]{64}$/.test(artifactDigest)) throw new Error('ACTIVE_WORK_PUBLICATION_A01_ARTIFACT_DIGEST_INVALID');

    const packet = reconstructed.envelope.packet;
    if (packet.current_operation.state !== 'ACTIVE') throw new Error('ACTIVE_WORK_PUBLICATION_A01_OPERATION_NOT_ACTIVE');
    if (packet.qualification_state !== 'PENDING') throw new Error('ACTIVE_WORK_PUBLICATION_A01_QUALIFICATION_NOT_PENDING');
    if (packet.github_admission_state !== 'ADMITTED') throw new Error('ACTIVE_WORK_PUBLICATION_A01_GITHUB_NOT_ADMITTED');
    if (packet.a01_state !== 'PENDING') throw new Error('ACTIVE_WORK_PUBLICATION_A01_STATE_NOT_PENDING');
    if (packet.authoritative_subject.algorithm !== 'sha1' || packet.authoritative_subject.oid !== subjectSha) throw new Error('ACTIVE_WORK_PUBLICATION_A01_SUBJECT_MISMATCH');

    const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'qualification', 'a01', 'registry.json'), 'utf8'));
    const policy = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'qualification', 'a01', 'a01-policy.json'), 'utf8'));
    const entry = registry.qualifications?.[qualificationId];
    if (!entry) throw new Error('ACTIVE_WORK_PUBLICATION_A01_QUALIFICATION_UNREGISTERED');
    if (entry.workstream_id !== packet.workstream_id) throw new Error('ACTIVE_WORK_PUBLICATION_A01_WORKSTREAM_MISMATCH');
    if (entry.source !== 'subject') throw new Error('ACTIVE_WORK_PUBLICATION_A01_SOURCE_NOT_SUBJECT');
    if (!entry.gate_class || policy.gate_classes?.[entry.gate_class]?.promotion_authority !== false) throw new Error('ACTIVE_WORK_PUBLICATION_A01_PROMOTION_GATE_FORBIDDEN');
    if (entry.allowed_post_actions !== undefined && (!Array.isArray(entry.allowed_post_actions) || entry.allowed_post_actions.length !== 0)) throw new Error('ACTIVE_WORK_PUBLICATION_A01_POST_ACTION_FORBIDDEN');

    const expectedArtifactName = `${qualificationId}-${workflowRunId}-evidence`;
    if (artifactName !== expectedArtifactName) throw new Error('ACTIVE_WORK_PUBLICATION_A01_ARTIFACT_NAME_MISMATCH');
    const apiHeaders = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'system-master-active-work-a01-evidence' };
    const getJson = async (apiPath) => {
      const response = await fetch(`https://api.github.com${apiPath}`, { headers: apiHeaders });
      if (!response.ok) throw new Error(`ACTIVE_WORK_PUBLICATION_A01_EVIDENCE_HTTP_${response.status}`);
      return response.json();
    };
    const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const run = await getJson(`${repoPath}/actions/runs/${workflowRunId}`);
    if (run.id !== workflowRunId || run.repository?.full_name !== request.repository) throw new Error('ACTIVE_WORK_PUBLICATION_A01_RUN_REPOSITORY_MISMATCH');
    if (run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/a01-control-plane-dispatch-bridge.yml') throw new Error('ACTIVE_WORK_PUBLICATION_A01_RUN_WORKFLOW_MISMATCH');
    if (run.status !== 'completed' || run.conclusion !== 'success') throw new Error('ACTIVE_WORK_PUBLICATION_A01_RUN_NOT_SUCCESSFUL');
    if (run.head_sha !== subjectSha || run.head_branch !== packet.branch_or_ref) throw new Error('ACTIVE_WORK_PUBLICATION_A01_RUN_SUBJECT_MISMATCH');
    const referenced = Array.isArray(run.referenced_workflows) ? run.referenced_workflows : [];
    for (const workflowName of ['a01-control-plane-gateway.yml', 'a01-control-plane-admission-broker.yml', 'a01-control-plane-executor.yml']) {
      const exactPath = `${request.repository}/.github/workflows/${workflowName}@${subjectSha}`;
      if (!referenced.some((item) => item.path === exactPath && item.sha === subjectSha && item.ref === `refs/heads/${packet.branch_or_ref}`)) throw new Error(`ACTIVE_WORK_PUBLICATION_A01_REFERENCED_WORKFLOW_MISMATCH:${workflowName}`);
    }
    const artifactsPayload = await getJson(`${repoPath}/actions/runs/${workflowRunId}/artifacts?per_page=100`);
    const artifacts = Array.isArray(artifactsPayload.artifacts) ? artifactsPayload.artifacts.filter((item) => item.name === expectedArtifactName) : [];
    if (artifacts.length !== 1) throw new Error('ACTIVE_WORK_PUBLICATION_A01_ARTIFACT_COUNT_INVALID');
    const artifact = artifacts[0];
    if (artifact.expired === true || artifact.size_in_bytes < 1 || artifact.digest !== artifactDigest) throw new Error('ACTIVE_WORK_PUBLICATION_A01_ARTIFACT_INVALID');
    if (artifact.workflow_run?.id !== workflowRunId || artifact.workflow_run?.head_sha !== subjectSha || artifact.workflow_run?.head_branch !== packet.branch_or_ref) throw new Error('ACTIVE_WORK_PUBLICATION_A01_ARTIFACT_SUBJECT_MISMATCH');

    qualificationEvidence = {
      qualification_id: qualificationId, workflow_run_id: workflowRunId, workflow_path: run.path, subject_sha: subjectSha,
      artifact_id: artifact.id, artifact_name: artifact.name, artifact_digest: artifact.digest,
      artifact_size_in_bytes: artifact.size_in_bytes, gate_class: entry.gate_class, promotion_authority: false
    };
    nextPacket = updateCurrentStanding(packet, { qualification_state: 'PASSED', a01_state: 'COMPLETED' });
  } else {
    exactKeys(request.parameters, ['receipt_id', 'authoritative_subject', 'allowed_paths_or_effects', 'successor_candidate'], 'ACTIVE_WORK_PUBLICATION_SUCCESSOR_PARAMETERS');
    const rebound = rebindAuthority(reconstructed.envelope.packet, {
      receipt_id: request.parameters.receipt_id,
      authoritative_subject: request.parameters.authoritative_subject,
      allowed_paths_or_effects: request.parameters.allowed_paths_or_effects
    });
    const staged = structuredClone(rebound);
    staged.successor_candidates = [structuredClone(request.parameters.successor_candidate)];
    const startable = finalizeActiveWorkPacket(staged);
    if (startable.next_legal_operation.kind !== 'START_SUCCESSOR') throw new Error(`ACTIVE_WORK_PUBLICATION_SUCCESSOR_NOT_STARTABLE:${startable.next_legal_operation.kind}`);
    if (startable.next_legal_operation.operation_id !== request.parameters.successor_candidate.operation_id) throw new Error('ACTIVE_WORK_PUBLICATION_SUCCESSOR_ID_MISMATCH');
    nextPacket = startNextLegalOperation(startable);
  }

  const result = await publisher.publish(nextPacket, {
    expectedHeadCommitSha: request.expected_head_commit_sha,
    expectedPublicationRevision: request.expected_publication_revision,
    expectedPacketDigest: request.expected_packet_digest
  });

  const receipt = {
    protocol_version: 'control-gateway.active-work-transition-execution-receipt.v1',
    transition_id: request.transition_id,
    action: request.action,
    state_ref: request.state_ref,
    predecessor_commit_sha: request.expected_head_commit_sha,
    predecessor_packet_digest: request.expected_packet_digest,
    publication_commit_sha: result.head_commit_sha,
    publication_revision: result.publication_revision,
    packet_digest: result.packet_digest,
    publication_digest: result.publication_digest,
    idempotent: result.idempotent === true,
    writer_app_slug: actualAppSlug,
    writer_installation_id: installationId
  };

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'development-response-authority-context.json'), `${JSON.stringify(authorityContext, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'development-response-receipt.json'), `${JSON.stringify(responseReceipt, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'development-response.txt'), responseText, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'transition-request.json'), `${JSON.stringify(request, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'predecessor-envelope.json'), `${JSON.stringify(reconstructed.envelope, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'result-envelope.json'), `${JSON.stringify(result.envelope, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'execution-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    if (qualificationEvidence) fs.writeFileSync(path.join(evidenceDir, 'a01-qualification-evidence.json'), `${JSON.stringify(qualificationEvidence, null, 2)}\n`, 'utf8');
  }

  console.log(`CONTROL_GATEWAY_ACTIVE_WORK_PUBLICATION=PASS transition=${request.transition_id} action=${request.action} publication_commit=${receipt.publication_commit_sha} revision=${receipt.publication_revision} packet_digest=${receipt.packet_digest} idempotent=${receipt.idempotent}`);
}

main().catch((error) => {
  console.error(`CONTROL_GATEWAY_ACTIVE_WORK_PUBLICATION=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});
