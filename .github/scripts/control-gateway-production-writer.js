'use strict';

async function main() {
  const {
    GitHubActiveWorkPublisher,
    GitHubChatReconstructionAdapter,
    GitHubActiveWorkRestTransport
  } = await import('../../control-gateway/src/github-active-work-publication.js');
  const { GitHubMutationAuthorityAdapter } = await import('../../control-gateway/src/github-mutation-authority-adapter.js');
  const { GovernedGitHubMutationAdmissionGate } = await import('../../control-gateway/src/governed-execution-admission.js');
  const {
    GitHubProductionMutationGate,
    GitHubReceiptConsumingCasWriter
  } = await import('../../control-gateway/src/github-production-mutation.js');
  const { GitHubReadConsistentReceiptCasRestTransport } = await import('../../control-gateway/src/github-production-read-consistency.js');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const request = JSON.parse(process.env.CONTROL_GATEWAY_MUTATION_REQUEST_JSON || 'null');
  const plan = JSON.parse(process.env.CONTROL_GATEWAY_MUTATION_PLAN_JSON || 'null');
  const responseBase64 = String(process.env.CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64 || '').trim();
  const responseReceipt = JSON.parse(process.env.CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON || 'null');
  const responseText = responseBase64 ? Buffer.from(responseBase64, 'base64').toString('utf8') : '';
  const stateRef = String(process.env.CONTROL_GATEWAY_STATE_REF || '').trim();
  const token = String(process.env.CONTROL_GATEWAY_WRITER_TOKEN || '').trim();
  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  if (!request || !plan || !responseBase64 || !responseReceipt || !responseText || !stateRef || !token) throw new Error('PRODUCTION_WRITER_INPUTS_MISSING');
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error(`PRODUCTION_WRITER_REF_FORBIDDEN:${process.env.GITHUB_REF || '<missing>'}`);
  const parts = String(request.repository || '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error('PRODUCTION_WRITER_REPOSITORY_INVALID');
  const [owner, repo] = parts;
  const tokenProvider = async () => token;

  const authorityTransport = new GitHubActiveWorkRestTransport({ owner, repo, tokenProvider });
  const publisher = new GitHubActiveWorkPublisher({
    transport: authorityTransport,
    ref: stateRef,
    workstreamId: request.workstream_id,
    missionVersion: request.mission_version
  });
  const chatAdapter = new GitHubChatReconstructionAdapter({ publisher });
  const authorityAdapter = new GitHubMutationAuthorityAdapter({ chatReconstructionAdapter: chatAdapter });
  const governedAdmissionGate = new GovernedGitHubMutationAdmissionGate({
  reconstructionAdapter: authorityAdapter,
  mutationTransport: authorityTransport
});
const governedAdmission = await governedAdmissionGate.admit(request, { responseText, responseReceipt });
const admissionReceipt = governedAdmission.admission_receipt;
const governedFreshnessGate = {
  verifyGrantFresh: async (_receipt, freshRequest) =>
    governedAdmissionGate.verifyGrantFresh(governedAdmission, freshRequest, responseText)
};
  const productionGate = new GitHubProductionMutationGate({ admissionGate: governedFreshnessGate });
  const productionGrant = await productionGate.authorize({ receipt: admissionReceipt, request, plan });
  
  const writerTransport = new GitHubReadConsistentReceiptCasRestTransport({ owner, repo, tokenProvider });
  const writer = new GitHubReceiptConsumingCasWriter({ transport: writerTransport });
  const executionReceipt = await writer.execute({ grant: productionGrant, plan });

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const write = (name, value) => fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    write('governed-admission.json', governedAdmission);
    write('development-response-receipt.json', responseReceipt);
    fs.writeFileSync(path.join(evidenceDir, 'development-response.txt'), responseText, 'utf8');
    write('admission-receipt.json', admissionReceipt);
    write('production-grant.json', productionGrant);
    write('execution-receipt.json', executionReceipt);
    write('request.json', request);
    write('plan.json', plan);
  }
  console.log(`CONTROL_GATEWAY_PRODUCTION_MUTATION=PASS mutation_id=${executionReceipt.mutation_id} result_commit=${executionReceipt.result_commit_sha} replay=${executionReceipt.idempotent_replay}`);
}

main().catch((error) => {
  console.error(`CONTROL_GATEWAY_PRODUCTION_MUTATION=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});