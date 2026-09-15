'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const manifest = require('./BOOK-RECONSTRUCTION-B04-F-FREEZE-MANIFEST-001.json');
const root = path.resolve(__dirname, '../../..');

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function lines(value) {
  if (!value.trim()) return [];
  return value.trim().split(/\r?\n/).filter(Boolean);
}

function blob(ref, filePath) {
  return git(['rev-parse', `${ref}:${filePath}`]);
}

function verify() {
  assert.equal(manifest.freeze_manifest_schema_version, 'BOOK_B04_F_FREEZE_MANIFEST_V1');
  assert.equal(manifest.domain, 'BOOK-RECONSTRUCTION-B04');
  assert.equal(manifest.stage, 'B04-F_DETERMINISTIC_CONTROL_FREEZE');

  const qualified = manifest.qualified_subject.sha;
  const closure = manifest.predecessor.closure_commit;
  const head = git(['rev-parse', 'HEAD']);

  assert.equal(git(['cat-file', '-t', qualified]), 'commit');
  assert.equal(git(['cat-file', '-t', closure]), 'commit');
  assert.equal(git(['show', '-s', '--format=%T', qualified]), manifest.qualified_subject.tree);
  assert.equal(git(['show', '-s', '--format=%T', closure]), manifest.predecessor.closure_tree);

  execFileSync('git', ['merge-base', '--is-ancestor', qualified, closure], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['merge-base', '--is-ancestor', closure, head], { cwd: root, stdio: 'ignore' });

  const qualifiedToClosure = lines(git(['diff', '--name-only', `${qualified}..${closure}`]));
  assert.deepEqual(qualifiedToClosure, [manifest.predecessor.closure_receipt_path], 'B04_E_CLOSURE_NOT_DOCUMENTATION_ONLY');
  assert.equal(blob(closure, manifest.predecessor.closure_receipt_path), manifest.predecessor.closure_receipt_blob_sha);
  assert.equal(blob('HEAD', manifest.predecessor.closure_receipt_path), manifest.predecessor.closure_receipt_blob_sha);

  for (const binding of manifest.runtime_blobs) {
    assert.equal(blob(qualified, binding.path), binding.blob_sha, `QUALIFIED_RUNTIME_BLOB_DRIFT:${binding.path}`);
    assert.equal(blob('HEAD', binding.path), binding.blob_sha, `CURRENT_RUNTIME_BLOB_DRIFT:${binding.path}`);
  }

  for (const binding of manifest.frozen_contract_blobs) {
    assert.equal(blob(qualified, binding.path), binding.blob_sha, `QUALIFIED_CONTRACT_BLOB_DRIFT:${binding.path}`);
    assert.equal(blob('HEAD', binding.path), binding.blob_sha, `CURRENT_CONTRACT_BLOB_DRIFT:${binding.path}`);
  }

  const allowedFreezeFiles = new Set([
    'qualification/book-system/reconstruction/BOOK-RECONSTRUCTION-B04-F-FREEZE-MANIFEST-001.json',
    'qualification/book-system/reconstruction/BOOK-RECONSTRUCTION-B04-F-FREEZE-VERIFY-001.js',
    'qualification/book-system/reconstruction/BOOK-RECONSTRUCTION-B04-F-CONTROL-FREEZE-001.md',
    '.github/workflows/book-b04-f-control-freeze-qualification.yml'
  ]);
  const closureToHead = lines(git(['diff', '--name-only', `${closure}..HEAD`]));
  assert.ok(closureToHead.length >= 2, 'B04_F_FREEZE_EVIDENCE_MISSING');
  for (const filePath of closureToHead) {
    assert.ok(allowedFreezeFiles.has(filePath), `B04_F_UNEXPECTED_CHANGED_PATH:${filePath}`);
    assert.ok(!filePath.startsWith('system-master/book-system/'), `B04_F_RUNTIME_CHANGE_FORBIDDEN:${filePath}`);
  }

  const denominator = require(path.join(root, 'system-master/book-system/book-b04-e-denominator-manifest-v1.js'));
  assert.equal(denominator.validateDenominatorManifestV1(), true);
  assert.deepEqual(denominator.EXPECTED_COUNTS, manifest.isolated_denominator && {
    E: manifest.isolated_denominator.E,
    D: manifest.isolated_denominator.D,
    P: manifest.isolated_denominator.P,
    U: manifest.isolated_denominator.U,
    I: manifest.isolated_denominator.I
  });
  assert.equal(denominator.TOTAL, 128);
  assert.equal(manifest.isolated_denominator.total, 128);
  assert.equal(manifest.isolated_denominator.denominator_shrinkage, 0);

  const understanding = require(path.join(root, 'system-master/book-system/book-reader-understanding-v1.js'));
  assert.deepEqual([...understanding.EXTERNAL_CALIBRATION_FENCES], manifest.external_fences);
  assert.equal(manifest.external_fences.length, 4);

  assert.equal(manifest.frozen_invariants.historical_pass_transferred, 0);
  assert.equal(manifest.frozen_invariants.canonical_effect, false);
  assert.equal(manifest.frozen_invariants.b01_provider_registry_widened, false);
  assert.equal(manifest.frozen_invariants.second_canonical_truth_graph_created, false);
  assert.equal(manifest.frozen_invariants.runtime_semantics_changed_by_freeze, false);
  assert.equal(manifest.frozen_invariants.external_fences_closed_by_deterministic_freeze, 0);
  assert.equal(manifest.control_observed_before_freeze.policy, 'NO_DIRECT_CONTROL_REF_UPDATE_FROM_B04_F');

  const result = {
    result: 'PASS',
    freeze_manifest: manifest.freeze_manifest_schema_version,
    freeze_verification_subject: head,
    qualified_b04_e_subject: qualified,
    qualified_b04_e_tree: manifest.qualified_subject.tree,
    predecessor_closure: closure,
    runtime_blob_bindings_verified: manifest.runtime_blobs.length,
    frozen_contract_bindings_verified: manifest.frozen_contract_blobs.length,
    isolated_denominator: denominator.TOTAL,
    denominator_shrinkage: 0,
    historical_pass_transferred: 0,
    external_fences_closed: 0,
    canonical_effect: false,
    runtime_semantics_changed_by_freeze: false
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (require.main === module) verify();

module.exports = { verify };
