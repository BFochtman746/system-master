export const GITHUB_PRODUCTION_ENFORCEMENT_POLICY_PROTOCOL = 'github-a01-controller.production-enforcement-policy.v1';

export class GitHubProductionEnforcementError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubProductionEnforcementError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) { throw new GitHubProductionEnforcementError(code, message, details); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function string(value, label) { if (typeof value !== 'string' || value.length === 0) fail('ENFORCEMENT_POLICY_INVALID', `${label} must be a non-empty string`); return value; }
function boolean(value, label) { if (typeof value !== 'boolean') fail('ENFORCEMENT_POLICY_INVALID', `${label} must be boolean`); return value; }

export function validateProductionEnforcementPolicy(policy) {
  if (!isObject(policy)) fail('ENFORCEMENT_POLICY_INVALID', 'policy must be an object');
  if (policy.protocol_version !== GITHUB_PRODUCTION_ENFORCEMENT_POLICY_PROTOCOL) fail('ENFORCEMENT_POLICY_INVALID', 'policy protocol mismatch');
  string(policy.operation_id, 'operation_id');
  string(policy.repository, 'repository');
  if (!isObject(policy.writer_identity)) fail('ENFORCEMENT_POLICY_INVALID', 'writer_identity required');
  if (policy.writer_identity.actor_type !== 'Integration') fail('ENFORCEMENT_POLICY_INVALID', 'writer identity must be a dedicated Integration');
  if (policy.writer_identity.actor_id !== null && (!Number.isSafeInteger(policy.writer_identity.actor_id) || policy.writer_identity.actor_id <= 0)) fail('ENFORCEMENT_POLICY_INVALID', 'writer_identity.actor_id must be null or a positive integer');
  string(policy.writer_identity.client_id_variable, 'writer_identity.client_id_variable');
  string(policy.writer_identity.private_key_secret, 'writer_identity.private_key_secret');
  string(policy.writer_identity.environment, 'writer_identity.environment');
  if (!isObject(policy.ruleset)) fail('ENFORCEMENT_POLICY_INVALID', 'ruleset required');
  string(policy.ruleset.name, 'ruleset.name');
  if (policy.ruleset.target !== 'branch' || policy.ruleset.enforcement !== 'active') fail('ENFORCEMENT_POLICY_INVALID', 'ruleset must target branch with active enforcement');
  if (!Array.isArray(policy.ruleset.include_refs) || !policy.ruleset.include_refs.includes('~ALL')) fail('ENFORCEMENT_POLICY_INVALID', 'ruleset must include ~ALL branches');
  if (!Array.isArray(policy.ruleset.exclude_refs) || policy.ruleset.exclude_refs.length !== 0) fail('ENFORCEMENT_POLICY_INVALID', 'ruleset exclusions are forbidden');
  if (!Array.isArray(policy.ruleset.required_rule_types)) fail('ENFORCEMENT_POLICY_INVALID', 'required_rule_types must be an array');
  for (const type of ['creation', 'update', 'deletion', 'non_fast_forward']) if (!policy.ruleset.required_rule_types.includes(type)) fail('ENFORCEMENT_POLICY_INVALID', `required rule missing: ${type}`);
  if (!isObject(policy.credential_separation)) fail('ENFORCEMENT_POLICY_INVALID', 'credential_separation required');
  boolean(policy.credential_separation.chatgpt_direct_writer_forbidden, 'credential_separation.chatgpt_direct_writer_forbidden');
  boolean(policy.credential_separation.dedicated_writer_token_required, 'credential_separation.dedicated_writer_token_required');
  if (!policy.credential_separation.chatgpt_direct_writer_forbidden || !policy.credential_separation.dedicated_writer_token_required) fail('ENFORCEMENT_POLICY_INVALID', 'credential separation must forbid direct ChatGPT writes and require dedicated writer token');
  return true;
}

function parseWriterActorId(actorId) {
  const value = typeof actorId === 'string' && /^[1-9][0-9]*$/.test(actorId.trim()) ? Number(actorId.trim()) : actorId;
  if (!Number.isSafeInteger(value) || value <= 0) fail('WRITER_IDENTITY_BINDING_INVALID', 'dedicated production writer Integration actor ID must be a positive safe integer');
  return value;
}

export function bindProductionWriterIdentity(policy, actorId) {
  validateProductionEnforcementPolicy(policy);
  const boundActorId = parseWriterActorId(actorId);
  if (policy.writer_identity.actor_id !== null && policy.writer_identity.actor_id !== boundActorId) {
    fail('WRITER_IDENTITY_BINDING_MISMATCH', 'runtime Integration actor ID conflicts with the policy-bound writer identity');
  }
  const bound = structuredClone(policy);
  bound.writer_identity.actor_id = boundActorId;
  validateProductionEnforcementPolicy(bound);
  return Object.freeze(bound);
}

export function desiredRepositoryRuleset(policy) {
  validateProductionEnforcementPolicy(policy);
  if (!Number.isSafeInteger(policy.writer_identity.actor_id) || policy.writer_identity.actor_id <= 0) fail('WRITER_IDENTITY_UNBOUND', 'dedicated production writer GitHub App integration ID is not bound');
  return {
    name: policy.ruleset.name,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [{ actor_id: policy.writer_identity.actor_id, actor_type: 'Integration', bypass_mode: 'always' }],
    conditions: { ref_name: { include: [...policy.ruleset.include_refs], exclude: [] } },
    rules: [
      { type: 'creation' },
      { type: 'update', parameters: { update_allows_fetch_and_merge: false } },
      { type: 'deletion' },
      { type: 'non_fast_forward' }
    ]
  };
}

function ruleByType(ruleset, type) { return (ruleset?.rules || []).find((rule) => rule?.type === type); }

export function evaluateProductionEnforcement({ policy, liveRulesets }) {
  validateProductionEnforcementPolicy(policy);
  const gaps = [];
  if (!Number.isSafeInteger(policy.writer_identity.actor_id) || policy.writer_identity.actor_id <= 0) gaps.push('WRITER_IDENTITY_UNBOUND');
  if (!Array.isArray(liveRulesets)) gaps.push('LIVE_RULESETS_UNAVAILABLE');
  const live = Array.isArray(liveRulesets) ? liveRulesets.find((item) => item?.name === policy.ruleset.name) : null;
  if (!live) gaps.push('PRODUCTION_RULESET_MISSING');
  if (live) {
    if (live.target !== 'branch') gaps.push('PRODUCTION_RULESET_TARGET_INVALID');
    if (live.enforcement !== 'active') gaps.push('PRODUCTION_RULESET_NOT_ACTIVE');
    const include = live.conditions?.ref_name?.include;
    const exclude = live.conditions?.ref_name?.exclude;
    if (!Array.isArray(include) || !include.includes('~ALL')) gaps.push('PRODUCTION_RULESET_NOT_ALL_BRANCHES');
    if (!Array.isArray(exclude) || exclude.length !== 0) gaps.push('PRODUCTION_RULESET_HAS_EXCLUSIONS');
    const bypass = Array.isArray(live.bypass_actors) ? live.bypass_actors : null;
    if (!bypass) gaps.push('PRODUCTION_RULESET_BYPASS_ACTORS_UNVERIFIED');
    else if (bypass.length !== 1
      || bypass[0]?.actor_type !== 'Integration'
      || bypass[0]?.actor_id !== policy.writer_identity.actor_id
      || bypass[0]?.bypass_mode !== 'always') gaps.push('PRODUCTION_RULESET_BYPASS_SCOPE_INVALID');
    for (const type of ['creation', 'update', 'deletion', 'non_fast_forward']) if (!ruleByType(live, type)) gaps.push(`PRODUCTION_RULE_MISSING_${type.toUpperCase()}`);
    const update = ruleByType(live, 'update');
    if (update && update.parameters?.update_allows_fetch_and_merge !== false) gaps.push('PRODUCTION_UPDATE_RULE_TOO_BROAD');
  }
  return Object.freeze({ status: gaps.length === 0 ? 'PASS' : 'BLOCKED', gaps: Object.freeze(gaps) });
}
