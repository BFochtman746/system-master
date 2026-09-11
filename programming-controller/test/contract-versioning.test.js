'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ContractService,
  ContractVersioningError,
  VersionSchemeRegistry,
  compareSemVer,
  parseSemVer
} = require('../src/contract-versioning');

function fixture() {
  let next = 0;
  const service = new ContractService({ identityAllocator: (kind) => `${kind}:${++next}` });
  const family = service.registerContractFamily({
    name: 'Programming Controller API',
    owner_ref: 'PROGRAMMING',
    surface_classes: ['COMMAND', 'QUERY'],
    default_version_scheme_id: 'scheme:semver-2.0.0'
  });
  return { service, family };
}

function draftFor(service, family, label = '1.0.0', base = null) {
  return service.createContractDraft({
    contract_family_id: family.contract_family_id,
    base_version_id: base,
    version_scheme_id: 'scheme:semver-2.0.0',
    version_label: label,
    candidate_artifact_ref: `artifact:${label}`,
    semantic_metadata: { promise: 'stable' }
  });
}

function publish(service, draft, command = `cmd:${draft.draft_id}`) {
  return service.publishContractVersion({ command_id: command, draft_id: draft.draft_id, expected_revision: draft.draft_revision, actor_ref: 'PROGRAMMING' });
}

test('contract family identity is opaque/delegated and surface classes are explicit', () => {
  const { service, family } = fixture();
  assert.match(family.contract_family_id, /^CONTRACT_FAMILY:/);
  assert.equal(family.name, 'Programming Controller API');
  assert.deepEqual(family.surfaces.map((surface) => surface.kind), ['COMMAND', 'QUERY']);
  assert.equal(service.persistence_standing, 'PORTABLE_IN_MEMORY_CANDIDATE__001P_NOT_BOUND');
});

test('version identity is independent of mutable version label metadata', () => {
  const { service, family } = fixture();
  const draft = draftFor(service, family, '1.2.3');
  const receipt = publish(service, draft);
  const version = service.getContractVersion(receipt.contract_version_id);
  assert.match(version.contract_version_id, /^CONTRACT_VERSION:/);
  assert.equal(version.version_label, '1.2.3');
  assert.notEqual(version.contract_version_id, version.version_label);
});

test('unknown version schemes fail closed', () => {
  const { service, family } = fixture();
  assert.throws(
    () => service.resolveContractVersion({ contract_family_id: family.contract_family_id, version_scheme_id: 'missing', version_label: '1.0.0' }),
    (error) => error instanceof ContractVersioningError && error.code === 'UNKNOWN_VERSION_SCHEME'
  );
});

test('SemVer 2.0.0 parser rejects leading zeros and honors official precedence vector', () => {
  assert.throws(() => parseSemVer('01.0.0'), (error) => error.code === 'INVALID_VERSION_LABEL');
  const vector = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i < vector.length - 1; i += 1) assert.equal(compareSemVer(vector[i], vector[i + 1]), -1);
  assert.equal(compareSemVer('1.0.0+build.1', '1.0.0+build.2'), 0);
});

test('registered custom scheme remains deterministic and separate from compatibility semantics', () => {
  const schemes = new VersionSchemeRegistry();
  schemes.registerVersionScheme({
    version_scheme_id: 'scheme:date-v1',
    scheme_type: 'DATE',
    parser_version: '1',
    parse: (label) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) throw new ContractVersioningError('INVALID_VERSION_LABEL', 'bad date');
      return { label };
    },
    compare: (a, b) => String(a.label || a).localeCompare(String(b.label || b))
  });
  assert.equal(schemes.compare('scheme:date-v1', '2026-09-10', '2026-09-11'), -1);
});

test('published version records are deeply immutable', () => {
  const { service, family } = fixture();
  const draft = draftFor(service, family);
  const receipt = publish(service, draft);
  const version = service.getContractVersion(receipt.contract_version_id);
  assert.throws(() => { version.semantic_metadata.promise = 'mutated'; }, TypeError);
  assert.equal(version.semantic_metadata.promise, 'stable');
});

test('draft updates use optimistic revision compare-and-set', () => {
  const { service, family } = fixture();
  const draft = draftFor(service, family);
  const changed = service.applyContractDraftChange({ draft_id: draft.draft_id, expected_revision: 0, patch: { version_label: '1.0.1' } });
  assert.equal(changed.draft_revision, 1);
  assert.throws(
    () => service.applyContractDraftChange({ draft_id: draft.draft_id, expected_revision: 0, patch: { version_label: '1.0.2' } }),
    (error) => error.code === 'STALE_DRAFT_BASE'
  );
});

test('identical command retry returns the original publish receipt', () => {
  const { service, family } = fixture();
  const draft = draftFor(service, family);
  const first = publish(service, draft, 'publish:1');
  const second = service.publishContractVersion({ command_id: 'publish:1', draft_id: draft.draft_id, expected_revision: 0, actor_ref: 'PROGRAMMING' });
  assert.equal(second, first);
});

test('command identity reuse with different semantics fails instead of replaying a different effect', () => {
  const { service, family } = fixture();
  const firstDraft = draftFor(service, family, '1.0.0');
  publish(service, firstDraft, 'publish:1');
  const secondDraft = draftFor(service, family, '2.0.0', service.listContractVersions(family.contract_family_id)[0].contract_version_id);
  assert.throws(
    () => service.publishContractVersion({ command_id: 'publish:1', draft_id: secondDraft.draft_id, expected_revision: 0, actor_ref: 'PROGRAMMING' }),
    (error) => error.code === 'DUPLICATE_COMMAND'
  );
});

test('family + scheme + label is unique and never overwritten', () => {
  const { service, family } = fixture();
  const d1 = draftFor(service, family, '1.0.0');
  const r1 = publish(service, d1);
  const base = r1.contract_version_id;
  const d2 = draftFor(service, family, '1.0.0', base);
  assert.throws(() => publish(service, d2), (error) => error.code === 'DUPLICATE_VERSION_LABEL');
  assert.equal(service.listContractVersions(family.contract_family_id).length, 1);
});

test('a draft cannot publish after the family advances underneath its exact base', () => {
  const { service, family } = fixture();
  const initial = draftFor(service, family, '1.0.0');
  const initialReceipt = publish(service, initial);
  const base = initialReceipt.contract_version_id;
  const stale = draftFor(service, family, '1.1.0', base);
  const competing = draftFor(service, family, '1.0.1', base);
  publish(service, competing);
  assert.throws(() => publish(service, stale), (error) => error.code === 'STALE_DRAFT_BASE');
});

test('surface-less generic contract families are rejected', () => {
  let n = 0;
  const service = new ContractService({ identityAllocator: (kind) => `${kind}:${++n}` });
  assert.throws(
    () => service.registerContractFamily({ name: 'blob', owner_ref: 'PROGRAMMING', surface_classes: [] }),
    (error) => error.code === 'INCOMPLETE_CONTRACT_INPUT'
  );
});
