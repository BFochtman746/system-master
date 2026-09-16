'use strict';

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function writeJsonEvidence(evidenceDir, name, value) {
  if (!evidenceDir) return;
  const fs = await import('node:fs');
  const path = await import('node:path');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeFailureEvidence(error) {
  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  if (!evidenceDir) return;
  await writeJsonEvidence(evidenceDir, 'bootstrap-failure.json', {
    schema_version: 1,
    outcome: 'FAIL',
    code: error?.code || 'UNCLASSIFIED',
    message: error?.message || String(error),
    writer_identity: {
      actual_app_slug: String(process.env.CONTROL_GATEWAY_WRITER_ACTUAL_APP_SLUG || '').trim(),
      expected_app_slug: String(process.env.CONTROL_GATEWAY_WRITER_EXPECTED_APP_SLUG || '').trim(),
      installation_id: String(process.env.CONTROL_GATEWAY_WRITER_INSTALLATION_ID || '').trim()
    },
    github: {
      ref: String(process.env.GITHUB_REF || '').trim(),
      sha: String(process.env.GITHUB_SHA || '').trim(),
      run_id: String(process.env.GITHUB_RUN_ID || '').trim()
    }
  });
}

async function main() {
  const { GitHubActiveWorkPublisher, GitHubActiveWorkRestTransport } = await import('../../control-gateway/src/github-active-work-publication.js');
  const { GitHubAuthorityBootstrapTransport, GitHubAuthorityBootstrapExecutor } = await import('../../control-gateway/src/github-authority-bootstrap.js');

  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  let request;
  try {
    request = JSON.parse(process.env.CONTROL_GATEWAY_BOOTSTRAP_REQUEST_JSON || 'null');
  } catch (error) {
    fail('AUTHORITY_BOOTSTRAP_REQUEST_JSON_INVALID', `AUTHORITY_BOOTSTRAP_REQUEST_JSON_INVALID:${error?.message || String(error)}`);
  }
  await writeJsonEvidence(evidenceDir, 'bootstrap-request.json', request);

  const token = String(process.env.CONTROL_GATEWAY_WRITER_TOKEN || '').trim();
  const writerCredential = {
    actualAppSlug: String(process.env.CONTROL_GATEWAY_WRITER_ACTUAL_APP_SLUG || '').trim(),
    expectedAppSlug: String(process.env.CONTROL_GATEWAY_WRITER_EXPECTED_APP_SLUG || '').trim(),
    installationId: String(process.env.CONTROL_GATEWAY_WRITER_INSTALLATION_ID || '').trim()
  };
  if (!request || !token || !writerCredential.actualAppSlug || !writerCredential.expectedAppSlug || !writerCredential.installationId) {
    fail('AUTHORITY_BOOTSTRAP_INPUTS_MISSING');
  }
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
    fail('AUTHORITY_BOOTSTRAP_REF_FORBIDDEN', `AUTHORITY_BOOTSTRAP_REF_FORBIDDEN:${process.env.GITHUB_REF || '<missing>'}`);
  }

  const parts = String(request.repository || '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) fail('AUTHORITY_BOOTSTRAP_REPOSITORY_INVALID');
  const [owner, repo] = parts;
  const tokenProvider = async () => token;
  const baseTransport = new GitHubActiveWorkRestTransport({ owner, repo, tokenProvider });
  const transport = new GitHubAuthorityBootstrapTransport({ baseTransport });
  const publisher = new GitHubActiveWorkPublisher({ transport, ref: request.state_ref, workstreamId: request.workstream_id, missionVersion: request.mission_version });
  const executor = new GitHubAuthorityBootstrapExecutor({ transport, publisher, writerCredential });
  const receipt = await executor.execute(request);

  await writeJsonEvidence(evidenceDir, 'bootstrap-receipt.json', receipt);
  console.log(`CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP=PASS state_ref=${receipt.state_ref} publication_commit=${receipt.publication_commit_sha} writer_app=${receipt.writer_app_slug} writer_installation=${receipt.writer_installation_id}`);
}

main().catch(async (error) => {
  try {
    await writeFailureEvidence(error);
  } catch (evidenceError) {
    console.error(`CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_EVIDENCE=FAIL message=${evidenceError?.message || String(evidenceError)}`);
  }
  console.error(`CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});
