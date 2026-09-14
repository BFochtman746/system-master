'use strict';

const assert = require('assert');
const routing = require('./book-capability-routing-interface');

function expectCode(fn, code) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    assert.strictEqual(err && err.code, code, `expected ${code}, got ${err && err.code}`);
  }
  assert.ok(threw, `expected ${code} to be thrown`);
}

const registry = routing.loadDefaultRegistry();
const migration = routing.loadMigrationRecord();
assert.strictEqual(routing.validateRegistry(registry), true);
assert.strictEqual(registry.contract_id, 'BOOK-CAPABILITY-ROUTING-INTERFACE-002');
assert.strictEqual(registry.owner_path, 'SYSTEM_MASTER/BOOK');
assert.strictEqual(migration.migration_id, 'BOOK-WRITING-PROSE-MIGRATION-001');
assert.strictEqual(migration.target_component, 'BOOK-COMP-07');
assert.strictEqual(migration.prose_system_standing, 'COMPLETE_RETIRED_TERMINAL');

assert.strictEqual(registry.capabilities.some(cap => cap.capability_id.startsWith('PROSE.')), false);
assert.strictEqual(registry.capabilities.some(cap => cap.owner_path === 'PROSE' || cap.owner_path.startsWith('SYSTEM_MASTER/PROSE')), false);

const mappings = {
  'PROSE.ANALYZE_PASSAGE': 'BOOK.WRITING.ANALYZE_PASSAGE',
  'PROSE.GENERATE_REVISION_CANDIDATE': 'BOOK.WRITING.GENERATE_REVISION_CANDIDATE',
  'PROSE.ASSESS_VOICE': 'BOOK.WRITING.ASSESS_VOICE',
  'PROSE.ASSESS_HOMOGENIZATION': 'BOOK.WRITING.ASSESS_HOMOGENIZATION'
};

for (const [legacyId, canonicalId] of Object.entries(mappings)) {
  const translation = routing.translateLegacyCapabilityId(legacyId);
  assert.strictEqual(translation.canonical_capability_id, canonicalId);
  assert.strictEqual(translation.owner_path, 'SYSTEM_MASTER/BOOK');
  assert.strictEqual(translation.book_component_id, 'BOOK-COMP-07');
  assert.strictEqual(translation.dispatchable, false);
  expectCode(() => routing.resolveCapability({ capability_id: legacyId, required_authority_domain: 'BOOK_WRITING_INTELLIGENCE' }, registry), 'RETIRED_PROSE_CAPABILITY');

  const canonical = routing.resolveCapability({ capability_id: canonicalId, required_authority_domain: 'BOOK_WRITING_INTELLIGENCE' }, registry);
  assert.strictEqual(canonical.owner_path, 'SYSTEM_MASTER/BOOK');
  assert.strictEqual(canonical.book_component_id, 'BOOK-COMP-07');
  assert.strictEqual(canonical.callable, false);
  expectCode(() => routing.resolveCallableCapability({ capability_id: canonicalId, required_authority_domain: 'BOOK_WRITING_INTELLIGENCE' }, registry), 'CAPABILITY_NOT_CALLABLE');
}

const unknownLegacy = routing.translateLegacyCapabilityId('PROSE.UNKNOWN_CAPABILITY');
assert.strictEqual(unknownLegacy.canonical_capability_id, null);
assert.strictEqual(unknownLegacy.dispatchable, false);
expectCode(() => routing.resolveCapability({ capability_id: 'PROSE.UNKNOWN_CAPABILITY', required_authority_domain: 'BOOK_WRITING_INTELLIGENCE' }, registry), 'RETIRED_PROSE_CAPABILITY');

const canonicalWriters = registry.capabilities.filter(cap => cap.authority_domain === 'CANONICAL_MANUSCRIPT_MUTATION');
assert.strictEqual(canonicalWriters.length, 1);
assert.strictEqual(canonicalWriters[0].capability_id, 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION');
assert.strictEqual(canonicalWriters[0].owner_path, 'SYSTEM_MASTER/BOOK');
assert.strictEqual(canonicalWriters[0].book_component_id, 'BOOK-COMP-02');
assert.strictEqual(canonicalWriters[0].canonical_write_authority, true);

for (const cap of registry.capabilities.filter(cap => cap.capability_id !== 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION')) {
  assert.strictEqual(cap.canonical_write_authority, false, cap.capability_id);
  assert.strictEqual(routing.assertNoCanonicalWrite(cap), true);
}
expectCode(() => routing.assertNoCanonicalWrite(canonicalWriters[0]), 'CANONICAL_WRITE_DESCRIPTOR_NOT_DISPATCHABLE');

const injectedLegacy = JSON.parse(JSON.stringify(registry));
injectedLegacy.capabilities.push({
  capability_id: 'PROSE.BAD_ACTIVE_ALIAS', owner_path: 'SYSTEM_MASTER/BOOK', book_component_id: 'BOOK-COMP-07',
  authority_domain: 'BOOK_WRITING_INTELLIGENCE', dispatch_class: 'DECLARED_AUTHORITY_NO_CALLABLE_INTERFACE', callable: false,
  service_id: null, operation_id: null, contract_ref: 'bad', canonical_write_authority: false
});
expectCode(() => routing.validateRegistry(injectedLegacy), 'RETIRED_PROSE_CAPABILITY_IN_ACTIVE_REGISTRY');

const injectedOwner = JSON.parse(JSON.stringify(registry));
injectedOwner.capabilities[0].owner_path = 'SYSTEM_MASTER/PROSE';
expectCode(() => routing.validateRegistry(injectedOwner), 'RETIRED_PROSE_OWNER_IN_ACTIVE_REGISTRY');

const duplicateWriter = JSON.parse(JSON.stringify(registry));
duplicateWriter.capabilities.push({ ...canonicalWriters[0], capability_id: 'BOOK.SECOND_CANONICAL_WRITER' });
expectCode(() => routing.validateRegistry(duplicateWriter), 'CANONICAL_MUTATION_AUTHORITY_VIOLATION');

expectCode(() => routing.resolveCapability({ capability_id: 'BOOK.WRITING.ANALYZE_PASSAGE', required_authority_domain: 'WRONG' }, registry), 'AUTHORITY_DOMAIN_MISMATCH');
expectCode(() => routing.resolveCapability({ capability_id: 'BOOK.WRITING.DOES_NOT_EXIST', required_authority_domain: 'BOOK_WRITING_INTELLIGENCE' }, registry), 'UNKNOWN_CAPABILITY');

console.log('BOOK_WRITING_PROSE_MIGRATION_TESTS_PASS');
