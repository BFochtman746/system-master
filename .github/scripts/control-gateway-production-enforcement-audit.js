'use strict';

async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { evaluateProductionEnforcement } = await import('../../control-gateway/src/github-production-enforcement.js');
  const policyPath = path.resolve(process.env.CONTROL_GATEWAY_ENFORCEMENT_POLICY || 'governance/control-gateway/GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-ENFORCEMENT-POLICY.json');
  const snapshotPath = String(process.env.CONTROL_GATEWAY_RULESET_SNAPSHOT || '').trim();
  if (!snapshotPath) throw new Error('CONTROL_GATEWAY_RULESET_SNAPSHOT is required; snapshot must come from authenticated live GitHub ruleset read-back');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const liveRulesets = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), 'utf8'));
  const result = evaluateProductionEnforcement({ policy, liveRulesets });
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exit(1);
}

main().catch((error) => {
  console.error(`CONTROL_GATEWAY_PRODUCTION_ENFORCEMENT_AUDIT=FAIL code=${error?.code || 'UNCLASSIFIED'} message=${error?.message || String(error)}`);
  process.exit(1);
});
