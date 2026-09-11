'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { IdentityError } = require('../src/identity');
const {
  AliasRegistry,
  IdentityNamespaceRegistry,
  LocatorRegistry,
  NormalizationProfileRegistry,
  UnicodeSecurityPort
} = require('../src/identity-namespaces');

const ENTITY_A = '018bcfe5-6800-7000-8000-000000000001';
const ENTITY_B = '018bcfe5-6800-7000-8000-000000000002';

function namespace(registry, overrides = {}) {
  return registry.registerNamespace({
    namespace_id: overrides.namespace_id || 'ns:username',
    namespace_key: overrides.namespace_key || 'username',
    purpose: overrides.purpose || 'Human-visible username aliases',
    owner_authority_ref: overrides.owner_authority_ref || 'PROGRAMMING-FOUNDATION-001N',
    scope_kind: overrides.scope_kind || 'WORKSPACE',
    initial_policy: {
      normalization_profile_id: 'unicode-nfc-case-sensitive',
      normalization_profile_version: 1,
      uniqueness_class: 'UNIQUE_ACTIVE',
      reuse_policy: 'NEVER_REUSE',
      confusable_policy: 'NONE',
      max_aliases: 4,
      ...(overrides.initial_policy || {})
    }
  });
}

test('namespace records owner, scope, lifecycle and exact versioned policy', () => {
  const registry = new IdentityNamespaceRegistry();
  const ns = namespace(registry);
  const policy = registry.getPolicy(ns.namespace_id);
  assert.equal(ns.owner_authority_ref, 'PROGRAMMING-FOUNDATION-001N');
  assert.equal(ns.scope_kind, 'WORKSPACE');
  assert.equal(ns.policy_version, 1);
  assert.equal(ns.lifecycle, 'ACTIVE');
  assert.equal(policy.normalization_profile_id, 'unicode-nfc-case-sensitive');
  assert.equal(policy.normalization_profile_version, 1);
});

test('namespace policy changes are immutable versions and stale expected versions fail', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry);
  const next = registry.changePolicy({
    namespace_id: 'ns:username',
    expected_policy_version: 1,
    new_policy: {
      normalization_profile_id: 'unicode-nfkc-lower',
      normalization_profile_version: 1,
      uniqueness_class: 'UNIQUE_ACTIVE',
      reuse_policy: 'AFTER_END',
      confusable_policy: 'WARN',
      max_aliases: 8
    }
  });
  assert.equal(next.policy_version, 2);
  assert.equal(registry.getPolicy('ns:username', 1).normalization_profile_id, 'unicode-nfc-case-sensitive');
  assert.equal(registry.getPolicy('ns:username', 2).normalization_profile_id, 'unicode-nfkc-lower');
  assert.throws(
    () => registry.changePolicy({ namespace_id: 'ns:username', expected_policy_version: 1, new_policy: { ...next } }),
    (error) => error instanceof IdentityError && error.code === 'STALE_POLICY'
  );
});

test('normalization is namespace-profile-specific rather than one universal lowercase rule', () => {
  const profiles = new NormalizationProfileRegistry();
  const registry = new IdentityNamespaceRegistry({ normalizationProfiles: profiles });
  namespace(registry, { namespace_id: 'ns:case', namespace_key: 'case-sensitive' });
  namespace(registry, {
    namespace_id: 'ns:folded',
    namespace_key: 'folded',
    initial_policy: { normalization_profile_id: 'unicode-nfkc-lower', normalization_profile_version: 1 }
  });
  const aliases = new AliasRegistry({ namespaceRegistry: registry, clock: () => 1700000000000 });
  const raw = 'Ａlice';
  const caseSensitive = aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:case', raw_value: raw });
  const folded = aliases.registerAlias({ alias_id: 'A2', entity_id: ENTITY_A, namespace_id: 'ns:folded', raw_value: raw });
  assert.equal(caseSensitive.raw_value, raw);
  assert.equal(caseSensitive.normalized_value, raw.normalize('NFC'));
  assert.equal(folded.raw_value, raw);
  assert.equal(folded.normalized_value, 'alice');
  assert.notEqual(caseSensitive.normalized_value, folded.normalized_value);
});

test('alias lifecycle is temporal and never changes canonical entity identity', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry);
  const aliases = new AliasRegistry({ namespaceRegistry: registry, clock: () => 1700000000000 });
  const active = aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:username', raw_value: 'Alice' });
  const deprecated = aliases.deprecateAlias(active.alias_id);
  const ended = aliases.endAlias(active.alias_id, '2026-09-11T22:00:00.000Z');
  assert.equal(active.entity_id, ENTITY_A);
  assert.equal(deprecated.entity_id, ENTITY_A);
  assert.equal(ended.entity_id, ENTITY_A);
  assert.equal(deprecated.state, 'DEPRECATED');
  assert.equal(ended.state, 'ENDED');
  assert.equal(ended.valid_to, '2026-09-11T22:00:00.000Z');
});

test('unique-active namespace refuses normalized alias collision across entities', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry, { initial_policy: { normalization_profile_id: 'unicode-nfkc-lower', normalization_profile_version: 1 } });
  const aliases = new AliasRegistry({ namespaceRegistry: registry });
  aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:username', raw_value: 'Alice' });
  assert.throws(
    () => aliases.registerAlias({ alias_id: 'A2', entity_id: ENTITY_B, namespace_id: 'ns:username', raw_value: 'ＡLICE' }),
    (error) => error instanceof IdentityError && error.code === 'DUPLICATE_ALIAS'
  );
});

test('Unicode WARN findings remain separate security records and never become normalized identity keys', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry, { initial_policy: { confusable_policy: 'WARN' } });
  const unicode = new UnicodeSecurityPort({
    detector_id: 'test-uts39-adapter',
    detector_version: '1',
    inspect: () => ({ findings: [{ finding_type: 'CONFUSABLE', severity: 'HIGH', evidence: { skeleton_fingerprint: 'fp:123' } }] })
  });
  const aliases = new AliasRegistry({ namespaceRegistry: registry, unicodeSecurity: unicode });
  const alias = aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:username', raw_value: 'раypal' });
  const findings = aliases.listFindings(alias.alias_id);
  assert.equal(alias.state, 'ACTIVE');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].finding_type, 'CONFUSABLE');
  assert.equal(findings[0].disposition, 'WARNED');
  assert.notEqual(alias.normalized_value, findings[0].evidence.skeleton_fingerprint);
});

test('Unicode BLOCK policy rejects finding without persisting alias', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry, { initial_policy: { confusable_policy: 'BLOCK' } });
  const unicode = new UnicodeSecurityPort({ inspect: () => ({ detector_id: 'test', detector_version: '1', findings: [{ finding_type: 'MIXED_SCRIPT' }] }) });
  const aliases = new AliasRegistry({ namespaceRegistry: registry, unicodeSecurity: unicode });
  assert.throws(
    () => aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:username', raw_value: 'aА' }),
    (error) => error instanceof IdentityError && error.code === 'CONFUSABLE_IDENTIFIER'
  );
  assert.deepEqual(aliases.listAliases(ENTITY_A), []);
});

test('required Unicode detector fails closed when no qualified adapter is bound', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry, { initial_policy: { confusable_policy: 'ESCALATE' } });
  const aliases = new AliasRegistry({ namespaceRegistry: registry });
  assert.throws(
    () => aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:username', raw_value: 'Alice' }),
    (error) => error instanceof IdentityError && error.code === 'UNICODE_SECURITY_UNAVAILABLE'
  );
});

test('aliases retain exact creation policy/profile version after namespace policy advances', () => {
  const registry = new IdentityNamespaceRegistry();
  namespace(registry);
  const aliases = new AliasRegistry({ namespaceRegistry: registry });
  const first = aliases.registerAlias({ alias_id: 'A1', entity_id: ENTITY_A, namespace_id: 'ns:username', raw_value: 'Alice' });
  registry.changePolicy({
    namespace_id: 'ns:username',
    expected_policy_version: 1,
    new_policy: {
      normalization_profile_id: 'unicode-nfkc-lower',
      normalization_profile_version: 1,
      uniqueness_class: 'UNIQUE_ACTIVE',
      reuse_policy: 'AFTER_END',
      confusable_policy: 'NONE',
      max_aliases: 8
    }
  });
  assert.equal(first.namespace_policy_version, 1);
  assert.equal(first.normalization_profile_id, 'unicode-nfc-case-sensitive');
  assert.equal(first.normalization_profile_version, 1);
  assert.equal(aliases.getAlias('A1').raw_value, 'Alice');
});

test('locator records paths/URIs/hosts/process/provider locations as observations, not canonical IDs', () => {
  const locators = new LocatorRegistry({ clock: () => 1700000000000 });
  const record = locators.registerLocator({
    locator_id: 'L1',
    entity_id: ENTITY_A,
    locator_kind: 'REPOSITORY_PATH',
    value: 'programming-controller/src/identity.js',
    context_scope: 'BFochtman746/system-master@2366c7b',
    source_ref: 'GITHUB',
    observed_at: '2026-09-11T22:00:00.000Z',
    freshness_ms: 3600000
  });
  assert.equal(record.entity_id, ENTITY_A);
  assert.equal(record.raw_locator, 'programming-controller/src/identity.js');
  assert.equal(record.context_scope, 'BFochtman746/system-master@2366c7b');
  assert.notEqual(record.raw_locator, record.entity_id);
});

test('locator freshness produces explicit STALE_LOCATOR without changing entity identity', () => {
  const observed = Date.parse('2026-09-11T22:00:00.000Z');
  const locators = new LocatorRegistry({ clock: () => observed + 5001 });
  locators.registerLocator({ locator_id: 'L1', entity_id: ENTITY_A, locator_kind: 'HOST', value: 'runner-1', context_scope: 'qualification', source_ref: 'RUNNER', observed_at: new Date(observed).toISOString(), freshness_ms: 5000 });
  const result = locators.getLocator('L1');
  assert.equal(result.standing, 'STALE_LOCATOR');
  assert.equal(result.record.entity_id, ENTITY_A);
});

test('ending a locator preserves historical observation and canonical entity identity', () => {
  const locators = new LocatorRegistry({ clock: () => 1700000000000 });
  locators.registerLocator({ locator_id: 'L1', entity_id: ENTITY_A, locator_kind: 'URI', value: 'https://example.invalid/resource', context_scope: 'external', source_ref: 'PROVIDER' });
  const ended = locators.endLocator('L1', '2026-09-11T22:30:00.000Z');
  assert.equal(ended.state, 'ENDED');
  assert.equal(ended.valid_to, '2026-09-11T22:30:00.000Z');
  assert.equal(ended.entity_id, ENTITY_A);
  assert.equal(locators.getLocator('L1').standing, 'ENDED');
});
