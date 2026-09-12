'use strict';

async function main() {
  const {
    GitHubActiveWorkPublisher,
    GitHubChatReconstructionAdapter,
    GitHubActiveWorkRestTransport
  } = await import('../../control-gateway/src/github-active-work-publication.js');
  const { GitHubMutationAuthorityAdapter } = await import('../../control-gateway/src/github-mutation-authority-adapter.js');
  const { GitHubMutationAdmissionGate } = await import('../../control-gateway/src/github-mutation-admission.js');
  const {
    GitHubProductionMutationGate,
    GitHubReceiptConsumingCasWriter
  } = await import('../../control-gateway/src/github-production-mutation.js');
  const { GitHubReadConsistentReceiptCasRestTransport } = await import('../../control-gateway/src/github-production-read-consistency.js');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const request = JSON.parse(process.env.CONTROL_GATEWAY_MUTATION_REQUEST_JSON || 'null');
  const plan = JSON.parse(process.env.CONTROL_GATEWAY_MUTATION_PLAN_JSON || 'null');
  const stateRef = String(process.env.CONTROL_GATEWAY_STATE_REF || '').trim();
  const token = String(process.env.CONTROL_GATEWAY_WRITER_TOKEN || '').trim();
  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  if (!request || !plan || !stateRef || !token) throw new Error('R01_LIVE_PROOF_INPUTS_MISSING');
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error(`R01_LIVE_PROOF_REF_FORBIDDEN:${process.env.GITHUB_REF || '<missing>'}`);
  }

  const parts = String(request.repository || '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error('R01_LIVE_PROOF_REPOSITORY_INVALID');
  const [owner, repo] = parts;
  const tokenProvider = async () => token;

  if (evidenceDir) fs.mkdirSync(evidenceDir, { recursive: true });

  const authorityTransport = new GitHubActiveWorkRestTransport({ owner, repo, tokenProvider });
  const publisher = new GitHubActiveWorkPublisher({
    transport: authorityTransport,
    ref: stateRef,
    workstreamId: request.workstream_id,
    missionVersion: request.mission_version
  });
  const chatAdapter = new GitHubChatReconstructionAdapter({ publisher });
  const authorityAdapter = new GitHubMutationAuthorityAdapter({ chatReconstructionAdapter: chatAdapter });
  const admissionGate = new GitHubMutationAdmissionGate({
    reconstructionAdapter: authorityAdapter,
    mutationTransport: authorityTransport
  });
  const admissionReceipt = await admissionGate.admit(request);
  const productionGate = new GitHubProductionMutationGate({ admissionGate });
  const productionGrant = await productionGate.authorize({ receipt: admissionReceipt, request, plan });
  const writerTransport = new GitHubReadConsistentReceiptCasRestTransport({ owner, repo, tokenProvider });
  const writer = new GitHubReceiptConsumingCasWriter({ transport: writerTransport });

  const first = await writer.execute({ grant: productionGrant, plan });
  const mode = first.idempotent_replay ? 'RECOVERED_EXACT_REPLAY' : 'FRESH_CAS_THEN_EXACT_REPLAY';
  const replay = await writer.execute({ grant: productionGrant, plan });
  if (replay.idempotent_replay !== true) throw new Error('R01_LIVE_PROOF_REPLAY_NOT_IDEMPOTENT');
  if (replay.result_commit_sha !== first.result_commit_sha || replay.result_tree_sha !== first.result_tree_sha) {
    throw new Error('R01_LIVE_PROOF_REPLAY_IDENTITY_MISMATCH');
  }

  if (evidenceDir) {
    const write = (name, value) =>
      fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    write('admission-receipt.json', admissionReceipt);
    write('production-grant.json', productionGrant);
    write('first-execution-receipt.json', first);
    write('replay-execution-receipt.json', replay);
    write('request.json', request);
    write('plan.json', plan);
    write('live-proof-summary.json', {
      protocol_version: 'control-gateway.r01-live-proof-summary.v2',
      mode,
      result_commit_sha: first.result_commit_sha,
      result_tree_sha: first.result_tree_sha,
      first_idempotent_replay: first.idempotent_replay,
      replay_idempotent_replay: replay.idempotent_replay
    });
  }

  console.log(
    `CONTROL_GATEWAY_R01_LIVE_PROOF=PASS mode=${mode} mutation_id=${first.mutation_id} result_commit=${first.result_commit_sha} replay_commit=${replay.result_commit_sha}`
  );
}

main().catch((error) => {
  console.error(`CONTROL_GATEWAY_R01_LIVE_PROOF=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});