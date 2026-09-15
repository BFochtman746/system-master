'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { parseNativeGitHubIngressEvent } from '../../control-gateway/src/native-github-ingress.js';

function appendOutput(name, value) {
  const outputPath = String(process.env.GITHUB_OUTPUT || '').trim();
  if (!outputPath) throw new Error('NATIVE_INGRESS_GITHUB_OUTPUT_MISSING');
  fs.appendFileSync(outputPath, `${name}=${value}\n`, 'utf8');
}

function main() {
  const eventPath = String(process.env.GITHUB_EVENT_PATH || '').trim();
  const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
  const evidenceDir = String(process.env.CONTROL_GATEWAY_WRITER_EVIDENCE_DIR || '').trim();
  if (!eventPath || !repository) throw new Error('NATIVE_INGRESS_RUNTIME_INPUTS_MISSING');

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const parsed = parseNativeGitHubIngressEvent({ event, repository });

  appendOutput('state_ref', parsed.stateRef);
  appendOutput('mutation_id', parsed.mutationId);
  appendOutput('mutation_request_json', parsed.requestJson);
  appendOutput('mutation_plan_json', parsed.planJson);

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const envelope = {
      protocol_version: 'control-gateway.native-github-ingress-evidence.v1',
      issue_number: event.issue?.number ?? null,
      issue_node_id: event.issue?.node_id ?? null,
      issue_html_url: event.issue?.html_url ?? null,
      repository,
      state_ref: parsed.stateRef,
      mutation_id: parsed.mutationId,
      mutation_request: parsed.request,
      mutation_plan: parsed.plan
    };
    fs.writeFileSync(path.join(evidenceDir, 'native-ingress-evidence.json'), `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  }

  console.log(`CONTROL_GATEWAY_NATIVE_INGRESS=PASS mutation_id=${parsed.mutationId}`);
}

try {
  main();
} catch (error) {
  console.error(`CONTROL_GATEWAY_NATIVE_INGRESS=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
}
