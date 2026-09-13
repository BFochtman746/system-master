'use strict';

async function main() {
  const { GitHubWorkflowDispatchRestTransport, dispatchA01AndCorrelate } = await import('../../control-gateway/src/github-workflow-dispatch.js');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const request = JSON.parse(process.env.GITHUB_ADAPTER_DISPATCH_REQUEST_JSON || 'null');
  const token = String(process.env.GITHUB_ADAPTER_TOKEN || '').trim();
  const evidenceDir = String(process.env.GITHUB_ADAPTER_EVIDENCE_DIR || '').trim();
  if (!request || !token) throw new Error('GITHUB_ADAPTER_DISPATCH_INPUTS_MISSING');
  const [owner, repo, extra] = String(request.repository || '').split('/');
  if (!owner || !repo || extra) throw new Error('GITHUB_ADAPTER_REPOSITORY_INVALID');

  const transport = new GitHubWorkflowDispatchRestTransport({ owner, repo, tokenProvider: async () => token });
  const receipt = await dispatchA01AndCorrelate({ transport, ref: request.ref || 'main', inputs: request.inputs });
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'dispatch-request.json'), `${JSON.stringify(request, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'dispatch-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  console.log(`GITHUB_ADAPTER_WORKFLOW_DISPATCH=PASS run_id=${receipt.workflow_run.id} jobs=${receipt.jobs.map((j) => j.id).join(',')}`);
}

main().catch((error) => {
  console.error(`GITHUB_ADAPTER_WORKFLOW_DISPATCH=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});
