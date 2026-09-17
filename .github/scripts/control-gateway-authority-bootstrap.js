'use strict';

async function main() {
  const { GitHubActiveWorkPublisher, GitHubActiveWorkRestTransport } = await import('../../control-gateway/src/github-active-work-publication.js');
  const { GitHubAuthorityBootstrapTransport, GitHubAuthorityBootstrapExecutor } = await import('../../control-gateway/src/github-authority-bootstrap.js');
  const { assertDevelopmentResponseAuthorization } = await import('../../control-gateway/src/development-response-governor.js');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const request = JSON.parse(process.env.CONTROL_GATEWAY_BOOTSTRAP_REQUEST_JSON || 'null');
  const responseBase64 = String(process.env.CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64 || '').trim();
  const responseReceipt = JSON.parse(process.env.CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON || 'null');
  const responseText = responseBase64 ? Buffer.from(responseBase64, 'base64').toString('utf8') : '';
  const token = String(process.env.CONTROL_GATEWAY_WRITER_TOKEN || '').trim();
  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  const writerCredential = {
    actualAppSlug: String(process.env.CONTROL_GATEWAY_WRITER_ACTUAL_APP_SLUG || '').trim(),
    expectedAppSlug: String(process.env.CONTROL_GATEWAY_WRITER_EXPECTED_APP_SLUG || '').trim(),
    installationId: String(process.env.CONTROL_GATEWAY_WRITER_INSTALLATION_ID || '').trim()
  };
  
  if (
    !request ||
    !responseBase64 ||
    !responseReceipt ||
    !responseText ||
    !token ||
    !writerCredential.actualAppSlug ||
    !writerCredential.expectedAppSlug ||
    !writerCredential.installationId
) throw new Error('AUTHORITY_BOOTSTRAP_INPUTS_MISSING');
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error(`AUTHORITY_BOOTSTRAP_REF_FORBIDDEN:${process.env.GITHUB_REF || '<missing>'}`);
  const parts = String(request.repository || '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error('AUTHORITY_BOOTSTRAP_REPOSITORY_INVALID');
  const [owner, repo] = parts;
  const authorityContext = {
    channel: 'GITHUB_AUTHORITY_BOOTSTRAP',
    bootstrap_request: request
  };

  assertDevelopmentResponseAuthorization({
    responseText,
    responseReceipt,
    authorityContext
  });
  const tokenProvider = async () => token;
  const baseTransport = new GitHubActiveWorkRestTransport({ owner, repo, tokenProvider });
  const transport = new GitHubAuthorityBootstrapTransport({ baseTransport });
  const publisher = new GitHubActiveWorkPublisher({ transport, ref: request.state_ref, workstreamId: request.workstream_id, missionVersion: request.mission_version });
  const executor = new GitHubAuthorityBootstrapExecutor({ transport, publisher, writerCredential });
  const receipt = await executor.execute(request);

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'development-response-authority-context.json'), `${JSON.stringify(authorityContext, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'development-response-receipt.json'), `${JSON.stringify(responseReceipt, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'development-response.txt'), responseText, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'bootstrap-request.json'), `${JSON.stringify(request, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'bootstrap-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  console.log(`CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP=PASS state_ref=${receipt.state_ref} publication_commit=${receipt.publication_commit_sha} writer_app=${receipt.writer_app_slug} writer_installation=${receipt.writer_installation_id}`);
}

main().catch((error) => {
  console.error(`CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});
