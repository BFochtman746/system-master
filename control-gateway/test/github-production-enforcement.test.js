import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GITHUB_PRODUCTION_ENFORCEMENT_POLICY_PROTOCOL,
  desiredRepositoryRuleset,
  evaluateProductionEnforcement,
  GitHubProductionEnforcementError
} from '../src/github-production-enforcement.js';

function policy(actorId = 12345) {
  return {
    protocol_version: GITHUB_PRODUCTION_ENFORCEMENT_POLICY_PROTOCOL,
    operation_id: 'GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C',
    repository: 'BFochtman746/system-master',
    writer_identity: {
      actor_type: 'Integration',
      actor_id: actorId,
      client_id_variable: 'CONTROL_GATEWAY_WRITER_CLIENT_ID',
      private_key_secret: 'CONTROL_GATEWAY_WRITER_PRIVATE_KEY',
      environment: 'control-gateway-production'
    },
    ruleset: {
      name: 'System Master Control Gateway Production Mutation Boundary',
      target: 'branch',
      enforcement: 'active',
      include_refs: ['~ALL'],
      exclude_refs: [],
      required_rule_types: ['creation', 'update', 'deletion', 'non_fast_forward']
    },
    credential_separation: {
      chatgpt_direct_writer_forbidden: true,
      dedicated_writer_token_required: true
    }
  };
}

test('desired ruleset blocks branch create/update/delete/force except dedicated Integration', () => {
  const desired = desiredRepositoryRuleset(policy());
  assert.deepEqual(desired.conditions.ref_name.include, ['~ALL']);
  assert.deepEqual(desired.bypass_actors, [{ actor_id: 12345, actor_type: 'Integration', bypass_mode: 'always' }]);
  assert.deepEqual(desired.rules.map((rule) => rule.type), ['creation', 'update', 'deletion', 'non_fast_forward']);
  assert.equal(desired.rules[1].parameters.update_allows_fetch_and_merge, false);
});

test('unbound writer identity fails closed before ruleset generation', () => {
  assert.throws(() => desiredRepositoryRuleset(policy(null)), (error) => error instanceof GitHubProductionEnforcementError && error.code === 'WRITER_IDENTITY_UNBOUND');
});

test('exact live ruleset passes enforcement audit', () => {
  const p = policy();
  assert.equal(evaluateProductionEnforcement({ policy: p, liveRulesets: [desiredRepositoryRuleset(p)] }).status, 'PASS');
});

test('missing ruleset and direct-bypass expansion remain blocked', () => {
  const p = policy();
  assert.equal(evaluateProductionEnforcement({ policy: p, liveRulesets: [] }).status, 'BLOCKED');
  const live = desiredRepositoryRuleset(p);
  live.bypass_actors.push({ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' });
  const result = evaluateProductionEnforcement({ policy: p, liveRulesets: [live] });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.gaps.includes('PRODUCTION_RULESET_BYPASS_SCOPE_INVALID'));
});
