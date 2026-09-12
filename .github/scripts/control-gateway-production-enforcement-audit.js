'use strict';

async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    bindProductionWriterIdentity,
    evaluateProductionEnforcement
  } = await import('../../control-gateway/src/github-production-enforcement.js');
  const policyPath = path.resolve(process.env.CONTROL_GATEWAY_ENFORCEMENT_POLICY || 'governance/control-gateway/GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-ENFORCEMENT-POLICY.json');
  const snapshotPath = String(process.env.CONTROL_GATEWAY_RULESET_SNAPSHOT || '').trim();
  const writerIntegrationId = String(process.env.CONTROL_GATEWAY_WRITER_INTEGRATION_ID || '').trim();
  if (!snapshotPath) throw new Error('CONTROL_GATEWAY_RULESET_SNAPSHOT is required; snapshot must come from authenticated live GitHub ruleset read-back');
  if (!writerIntegrationId) throw new Error('CONTROL_GATEWAY_WRITER_INTEGRATION_ID is required; bind the installed dedicated writer GitHub App Integration at cutover runtime');
  const templatePolicy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const policy = bindProductionWriterIdentity(templatePolicy, writerIntegrationId);
  const liveRulesets = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), 'utf8'));
  const result = evaluateProductionEnforcement({ policy, liveRulesets });
  console.log(JSON.stringify({ ...result, writer_integration_id: policy.writer_identity.actor_id }));
  if (result.status !== 'PASS') process.exit(1);
}

main().catch((error) => {
  console.error(`CONTROL_GATEWAY_PRODUCTION_ENFORCEMENT_AUDIT=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});
