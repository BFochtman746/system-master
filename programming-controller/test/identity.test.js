'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CanonicalEntityId,
  IdentityAllocator,
  IdentityError,
  IdentitySchemeRegistry,
  UuidV7Generator,
  assertVariantAndVersion,
  bytesToUuid,
  uuidToBytes,
  uuidV4,
  uuidVersion
} = require('../src/identity');

const zeroRandom = (length) => Buffer.alloc(length, 0);

test('default internal allocation uses RFC 9562 UUIDv7 and records exact profile', () => {
  const allocator = new IdentityAllocator({ clock: () => 1700000000000, randomBytes: zeroRandom });
  const result = allocator.allocateCandidate({ entity_kind: 'MODEL_ENTITY', command_id: 'CMD-1' });
  assert.equal(result.scheme_profile_id, 'uuidv7-internal-v1');
  assert.equal(result.scheme_kind, 'UUIDV7');
  assert.equal(uuidVersion(result.entity_id), 7);
  assert.equal(assertVariantAndVersion(result.entity_id, 7), true);
  assert.equal(result.persistence_standing, 'UNPROBED_NOT_COMMITTED');
});

test('external/security-sensitive allocation defaults to RFC 9562 UUIDv4', () => {
  const allocator = new IdentityAllocator({ randomBytes: zeroRandom });
  const external = allocator.allocateCandidate({ entity_kind: 'PUBLIC_HANDLE', exposure_class: 'EXTERNAL', command_id: 'CMD-2' });
  const sensitive = allocator.allocateCandidate({ entity_kind: 'SECRET_REF', exposure_class: 'SECURITY_SENSITIVE', command_id: 'CMD-3' });
  assert.equal(external.scheme_profile_id, 'uuidv4-opaque-v1');
  assert.equal(sensitive.scheme_profile_id, 'uuidv4-opaque-v1');
  assert.equal(uuidVersion(external.entity_id), 4);
  assert.equal(assertVariantAndVersion(sensitive.entity_id, 4), true);
});

test('scheme registry requires a registered active profile and preserves profile metadata', () => {
  const registry = new IdentitySchemeRegistry();
  assert.deepEqual(registry.get('uuidv7-internal-v1'), {
    scheme_profile_id: 'uuidv7-internal-v1',
    scheme_kind: 'UUIDV7',
    version: 1,
    encoding: 'RFC9562_CANONICAL_TEXT',
    exposure_class: 'INTERNAL',
    status: 'ACTIVE'
  });
  assert.throws(() => registry.get('missing'), (error) => error instanceof IdentityError && error.code === 'INVALID_ID_PROFILE');
});

test('UUIDv7 generator is monotonic within the same millisecond without changing identity semantics', () => {
  const generator = new UuidV7Generator({ clock: () => 1700000000000, randomBytes: zeroRandom });
  const a = generator.next();
  const b = generator.next();
  const c = generator.next();
  assert.equal(a < b && b < c, true);
  assert.equal(uuidVersion(a), 7);
  assert.equal(uuidVersion(c), 7);
});

test('UUIDv7 generator never moves backwards when the supplied clock regresses', () => {
  const values = [1700000000001, 1700000000000];
  const generator = new UuidV7Generator({ clock: () => values.shift(), randomBytes: zeroRandom });
  const first = generator.next();
  const second = generator.next();
  assert.equal(second > first, true);
  assert.equal(uuidToBytes(second).subarray(0, 6).compare(uuidToBytes(first).subarray(0, 6)), 0);
});

test('collision probe causes bounded regeneration and never treats a collision as success', () => {
  let probes = 0;
  const allocator = new IdentityAllocator({
    clock: () => 1700000000000,
    randomBytes: zeroRandom,
    uniquenessProbe: () => { probes += 1; return probes === 1; },
    maxCollisionRetries: 2
  });
  const result = allocator.allocateCandidate({ entity_kind: 'MODEL_ENTITY', command_id: 'CMD-4' });
  assert.equal(result.allocation_attempt, 2);
  assert.equal(result.persistence_standing, 'PROBED_NOT_COMMITTED');
  assert.equal(probes, 2);
});

test('collision exhaustion fails explicitly instead of overwriting or silently accepting', () => {
  const allocator = new IdentityAllocator({
    clock: () => 1700000000000,
    randomBytes: zeroRandom,
    uniquenessProbe: () => true,
    maxCollisionRetries: 1
  });
  assert.throws(
    () => allocator.allocateCandidate({ entity_kind: 'MODEL_ENTITY', command_id: 'CMD-5' }),
    (error) => error instanceof IdentityError && error.code === 'IDENTITY_COLLISION' && error.details.attempts === 2
  );
});

test('generator failure is fail-closed and never falls back to a weaker random source', () => {
  const allocator = new IdentityAllocator({ randomBytes: () => { throw new Error('entropy offline'); } });
  assert.throws(
    () => allocator.allocateCandidate({ entity_kind: 'PUBLIC_HANDLE', exposure_class: 'EXTERNAL', command_id: 'CMD-6' }),
    (error) => error instanceof IdentityError && error.code === 'GENERATOR_UNAVAILABLE'
  );
});

test('canonical UUID bytes/text round-trip without endian or formatting identity changes', () => {
  const value = uuidV4((length) => Buffer.from(Array.from({ length }, (_, index) => index)));
  const bytes = uuidToBytes(value);
  assert.equal(bytes.length, 16);
  assert.equal(bytesToUuid(bytes), value);
  const canonical = new CanonicalEntityId({ value: value.toUpperCase(), scheme_profile_id: 'uuidv4-opaque-v1' });
  assert.equal(canonical.toString(), value);
  assert.equal(canonical.equals(value.toUpperCase()), true);
  assert.deepEqual(canonical.toBytes(), bytes);
});

test('canonical IDs do not encode supplied mutable business names or locators', () => {
  const allocator = new IdentityAllocator({ clock: () => 1700000000000, randomBytes: zeroRandom });
  const result = allocator.allocateCandidate({ entity_kind: 'customer@example.com/tenant/acme/path/tmp', command_id: 'CMD-7' });
  assert.equal(result.entity_id.includes('customer'), false);
  assert.equal(result.entity_id.includes('acme'), false);
  assert.match(result.entity_id, /^[0-9a-f-]{36}$/);
});

test('identity allocation returns a candidate only and does not pretend persistence or authorization occurred', () => {
  const allocator = new IdentityAllocator({ clock: () => 1700000000000, randomBytes: zeroRandom });
  const result = allocator.allocateCandidate({ entity_kind: 'MODEL_ENTITY', command_id: 'CMD-8' });
  assert.equal(result.persistence_standing, 'UNPROBED_NOT_COMMITTED');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'authorized'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'committed'), false);
});
