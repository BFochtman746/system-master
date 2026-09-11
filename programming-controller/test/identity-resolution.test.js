'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { IdentityError } = require('../src/identity');
const { AliasRegistry, IdentityNamespaceRegistry, LocatorRegistry } = require('../src/identity-namespaces');
const {
  ExternalIdentityRegistry,
  IdentityReferenceValidator,
  IdentityResolver,
  ResolutionCache,
  createAliasResolutionSource
} = require('../src/identity-resolution');

const A = '018bcfe5-6800-7000-8000-000000000001';
const B = '018bcfe5-6800-7000-8000-000000000002';
const C = '018bcfe5-6800-7000-8000-000000000003';

function entitySource(records) {
  const map = new Map(records.map((x) => [x.entity_id, { lifecycle: 'ACTIVE', scope: 'PROGRAMMING', ...x }]));
  return { revision: 1, getEntity: (id) => map.get(id) || null, map };
}

function aliasFixture({ nonUnique = false } = {}) {
  const namespaces = new IdentityNamespaceRegistry();
  namespaces.registerNamespace({
    namespace_id: 'ns:user', namespace_key: 'user', purpose: 'test', owner_authority_ref: '001N',
    initial_policy: {
      normalization_profile_id: 'unicode-nfkc-lower', normalization_profile_version: 1,
      uniqueness_class: nonUnique ? 'NON_UNIQUE' : 'UNIQUE_ACTIVE',
      reuse_policy: nonUnique ? 'AFTER_END' : 'NEVER_REUSE', confusable_policy: 'NONE', max_aliases: 8
    }
  });
  const aliases = new AliasRegistry({ namespaceRegistry: namespaces });
  let revision = 1;
  return { namespaces, aliases, source: createAliasResolutionSource({ aliasRegistry: aliases, namespaceRegistry: namespaces, versionProvider: () => revision }), bump: () => { revision += 1; } };
}

test('canonical resolution returns one typed UNIQUE result for active exact entity identity', () => {
  const entities = entitySource([{ entity_id: A, entity_kind: 'PROJECT' }]);
  const resolver = new IdentityResolver({ entitySource: entities });
  const resolved = resolver.resolveCanonical(A.toUpperCase());
  assert.equal(resolved.outcome, 'UNIQUE');
  assert.equal(resolved.authoritative, true);
  assert.equal(resolved.entity_id, A);
  assert.equal(resolved.entity.entity_kind, 'PROJECT');
});

test('alias ambiguity remains AMBIGUOUS and never selects first/lexical candidate', () => {
  const fx = aliasFixture({ nonUnique: true });
  fx.aliases.registerAlias({ alias_id: 'ALIAS-Z', entity_id: B, namespace_id: 'ns:user', raw_value: 'Alice' });
  fx.aliases.registerAlias({ alias_id: 'ALIAS-A', entity_id: A, namespace_id: 'ns:user', raw_value: 'ＡLICE' });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'USER' }, { entity_id: B, entity_kind: 'USER' }]), aliasSource: fx.source });
  const resolved = resolver.resolveAlias({ namespace_id: 'ns:user', raw_value: 'alice' });
  assert.equal(resolved.outcome, 'AMBIGUOUS');
  assert.equal(resolved.authoritative, false);
  assert.deepEqual(resolved.candidates, [A, B]);
});

test('conflicted alias produces CONFLICTED instead of guessing through it', () => {
  const fx = aliasFixture();
  fx.namespaces.changePolicy({ namespace_id: 'ns:user', expected_policy_version: 1, new_policy: { normalization_profile_id: 'unicode-nfkc-lower', normalization_profile_version: 1, uniqueness_class: 'UNIQUE_ACTIVE', reuse_policy: 'NEVER_REUSE', confusable_policy: 'ESCALATE', max_aliases: 8 } });
  fx.aliases.unicode.inspectFn = () => ({ detector_id: 'test', detector_version: '1', findings: [{ finding_type: 'CONFUSABLE' }] });
  fx.aliases.registerAlias({ alias_id: 'A1', entity_id: A, namespace_id: 'ns:user', raw_value: 'alice' });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'USER' }]), aliasSource: fx.source });
  assert.equal(resolver.resolveAlias({ namespace_id: 'ns:user', raw_value: 'alice' }).outcome, 'CONFLICTED');
});

test('stale locator returns STALE_LOCATOR and never authorizes its candidate entity', () => {
  const observed = Date.parse('2026-09-11T22:00:00.000Z');
  const locators = new LocatorRegistry({ clock: () => observed + 10001 });
  locators.registerLocator({ locator_id: 'L1', entity_id: A, locator_kind: 'HOST', value: 'runner-1', context_scope: 'qualification', source_ref: 'RUNNER', observed_at: new Date(observed).toISOString(), freshness_ms: 10000 });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'RUNNER' }]), locatorSource: locators });
  const resolved = resolver.resolveLocator({ locator_id: 'L1' });
  assert.equal(resolved.outcome, 'STALE_LOCATOR');
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.candidate_entity_id, A);
});

test('external bindings require exact authority plus namespace plus value provenance', () => {
  const external = new ExternalIdentityRegistry({ clock: () => 1700000000000 });
  external.registerNamespace({ external_authority: 'GITHUB', external_namespace: 'repository-id', unique_active: true });
  external.bind({ binding_id: 'B1', entity_id: A, external_authority: 'GITHUB', external_namespace: 'repository-id', external_value: '1360399247', provenance_ref: 'github:repo:1360399247' });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'REPOSITORY' }]), externalRegistry: external });
  assert.equal(resolver.resolveExternal({ external_authority: 'GITHUB', external_namespace: 'repository-id', external_value: '1360399247' }).outcome, 'UNIQUE');
  assert.equal(resolver.resolveExternal({ external_authority: 'OTHER', external_namespace: 'repository-id', external_value: '1360399247' }).outcome, 'NOT_FOUND');
});

test('external unique namespace refuses conflicting active binding while non-unique namespace resolves ambiguity explicitly', () => {
  const external = new ExternalIdentityRegistry();
  external.registerNamespace({ external_authority: 'PROVIDER', external_namespace: 'unique-key', unique_active: true });
  external.bind({ binding_id: 'B1', entity_id: A, external_authority: 'PROVIDER', external_namespace: 'unique-key', external_value: 'same', provenance_ref: 'P1' });
  assert.throws(() => external.bind({ binding_id: 'B2', entity_id: B, external_authority: 'PROVIDER', external_namespace: 'unique-key', external_value: 'same', provenance_ref: 'P2' }), (error) => error instanceof IdentityError && error.code === 'EXTERNAL_ID_CONFLICT');

  external.registerNamespace({ external_authority: 'PROVIDER', external_namespace: 'shared-key', unique_active: false });
  external.bind({ binding_id: 'B3', entity_id: A, external_authority: 'PROVIDER', external_namespace: 'shared-key', external_value: 'same', provenance_ref: 'P3' });
  external.bind({ binding_id: 'B4', entity_id: B, external_authority: 'PROVIDER', external_namespace: 'shared-key', external_value: 'same', provenance_ref: 'P4' });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'X' }, { entity_id: B, entity_kind: 'X' }]), externalRegistry: external });
  assert.deepEqual(resolver.resolveExternal({ external_authority: 'PROVIDER', external_namespace: 'shared-key', external_value: 'same' }).candidates, [A, B]);
  assert.equal(resolver.resolveExternal({ external_authority: 'PROVIDER', external_namespace: 'shared-key', external_value: 'same' }).outcome, 'AMBIGUOUS');
});

test('retired and superseded entity lifecycle is preserved as typed resolution outcome', () => {
  const source = entitySource([
    { entity_id: A, entity_kind: 'PROJECT', lifecycle: 'RETIRED' },
    { entity_id: B, entity_kind: 'PROJECT', lifecycle: 'SUPERSEDED', successor_entity_id: C },
    { entity_id: C, entity_kind: 'PROJECT', lifecycle: 'ACTIVE' }
  ]);
  const resolver = new IdentityResolver({ entitySource: source });
  assert.equal(resolver.resolveCanonical(A).outcome, 'RETIRED');
  const superseded = resolver.resolveCanonical(B);
  assert.equal(superseded.outcome, 'SUPERSEDED');
  assert.equal(superseded.successor_entity_id, C);
});

test('access denial is typed and canonical ID possession never grants authority', () => {
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'SECRET' }]), accessPolicy: () => ({ allowed: false, reason: '001Q_DENIED' }) });
  const resolved = resolver.resolveCanonical(A);
  assert.equal(resolved.outcome, 'ACCESS_DENIED');
  assert.equal(resolved.authoritative, false);
  assert.equal(resolved.reason, '001Q_DENIED');
});

test('high-consequence reference validation rejects wrong kind, wrong scope and non-UNIQUE outcomes', () => {
  const observed = Date.parse('2026-09-11T22:00:00.000Z');
  const locators = new LocatorRegistry({ clock: () => observed + 2000 });
  locators.registerLocator({ locator_id: 'L1', entity_id: A, locator_kind: 'PATH', value: '/tmp/x', context_scope: 'host', source_ref: 'FS', observed_at: new Date(observed).toISOString(), freshness_ms: 1000 });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'PROJECT', scope: 'PROGRAMMING' }]), locatorSource: locators });
  const validator = new IdentityReferenceValidator({ resolver });
  assert.equal(validator.validate({ reference: { kind: 'CANONICAL_ID', entity_id: A }, expected_entity_kind: 'RUNNER' }).standing, 'WRONG_ENTITY_KIND');
  assert.equal(validator.validate({ reference: { kind: 'CANONICAL_ID', entity_id: A }, expected_scope: 'CORE' }).standing, 'WRONG_SCOPE');
  assert.equal(validator.validate({ reference: { kind: 'LOCATOR', locator_id: 'L1' }, expected_entity_kind: 'PROJECT' }).standing, 'STALE_LOCATOR');
});

test('content digest identity remains an explicit 001U boundary and is never promoted to EntityId', () => {
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'ARTIFACT' }]) });
  const resolved = resolver.resolveReference({ kind: 'CONTENT_DIGEST', algorithm: 'sha256', digest: 'abc' });
  assert.equal(resolved.outcome, 'NOT_FOUND');
  assert.equal(resolved.boundary, 'CONTENT_IDENTITY_OWNED_BY_001U_NOT_ENTITY_ID');
});

test('resolution cache is version-keyed, disposable and cannot preserve stale alias result after source revision advances', () => {
  const fx = aliasFixture({ nonUnique: true });
  const cache = new ResolutionCache();
  fx.aliases.registerAlias({ alias_id: 'A1', entity_id: A, namespace_id: 'ns:user', raw_value: 'alice' });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'USER' }, { entity_id: B, entity_kind: 'USER' }]), aliasSource: fx.source, cache });
  assert.equal(resolver.resolveAlias({ namespace_id: 'ns:user', raw_value: 'alice' }).outcome, 'UNIQUE');
  assert.equal(cache.size, 1);
  fx.aliases.registerAlias({ alias_id: 'A2', entity_id: B, namespace_id: 'ns:user', raw_value: 'alice' });
  fx.bump();
  assert.equal(resolver.resolveAlias({ namespace_id: 'ns:user', raw_value: 'alice' }).outcome, 'AMBIGUOUS');
  assert.equal(cache.size, 2);
  assert.equal(cache.invalidate(() => true), 2);
  assert.equal(cache.size, 0);
});

test('DID is only an optional external namespace; core has no DID resolver or ledger dependency', () => {
  const external = new ExternalIdentityRegistry();
  external.registerNamespace({ external_authority: 'DID', external_namespace: 'did-method-value', unique_active: true });
  external.bind({ binding_id: 'D1', entity_id: A, external_authority: 'DID', external_namespace: 'did-method-value', external_value: 'did:example:123', provenance_ref: 'external-fixture' });
  const resolver = new IdentityResolver({ entitySource: entitySource([{ entity_id: A, entity_kind: 'SUBJECT' }]), externalRegistry: external });
  assert.equal(typeof resolver.resolveDid, 'undefined');
  assert.equal(resolver.resolveExternal({ external_authority: 'DID', external_namespace: 'did-method-value', external_value: 'did:example:123' }).outcome, 'UNIQUE');
});
