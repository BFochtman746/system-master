'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const { stageExactPrivateFile } = require('./book-eval-repair005-stage-private-gold.js');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function expectFailure(name, fn, expected) {
  let observed = null;
  try {
    fn();
  } catch (error) {
    observed = error.message;
  }
  assert.strictEqual(observed, expected, `${name}: unexpected failure class`);
  console.log(`PASS ${name}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'book-eval-private-stage-test-'));
try {
  const repo = path.join(root, 'repo');
  const inbound = path.join(root, 'inbound');
  const privateRoot = path.join(root, 'private');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(inbound, { recursive: true });

  const payload = Buffer.from('synthetic private-authority staging fixture\n', 'utf8');
  const expectedSha = sha256(payload);
  const source = path.join(inbound, 'candidate.jsonl');
  fs.writeFileSync(source, payload);

  const staged = stageExactPrivateFile({
    sourcePath: source,
    destinationRoot: privateRoot,
    expectedSha256: expectedSha,
    expectedBytes: payload.length,
    repoRoot: repo,
    destinationFilename: 'gold.jsonl'
  });
  assert.strictEqual(staged.state, 'STAGED_EXACT');
  assert.strictEqual(staged.sha256, expectedSha);
  assert.strictEqual(staged.bytes, payload.length);
  assert.strictEqual(staged.destination_path_disclosed, false);
  assert.strictEqual(staged.content_disclosed, false);
  assert.deepStrictEqual(fs.readFileSync(path.join(privateRoot, 'gold.jsonl')), payload);
  console.log('PASS exact atomic stage');

  const repeated = stageExactPrivateFile({
    sourcePath: source,
    destinationRoot: privateRoot,
    expectedSha256: expectedSha,
    expectedBytes: payload.length,
    repoRoot: repo,
    destinationFilename: 'gold.jsonl'
  });
  assert.strictEqual(repeated.state, 'ALREADY_STAGED_EXACT');
  console.log('PASS idempotent exact stage');

  expectFailure('wrong source hash rejected', () => stageExactPrivateFile({
    sourcePath: source,
    destinationRoot: path.join(root, 'private-wrong-hash'),
    expectedSha256: '0'.repeat(64),
    expectedBytes: payload.length,
    repoRoot: repo
  }), 'SOURCE_SHA256_MISMATCH');

  expectFailure('wrong source size rejected', () => stageExactPrivateFile({
    sourcePath: source,
    destinationRoot: path.join(root, 'private-wrong-size'),
    expectedSha256: expectedSha,
    expectedBytes: payload.length + 1,
    repoRoot: repo
  }), 'SOURCE_BYTE_COUNT_MISMATCH');

  const repoSource = path.join(repo, 'forbidden-source.jsonl');
  fs.writeFileSync(repoSource, payload);
  expectFailure('repository source rejected', () => stageExactPrivateFile({
    sourcePath: repoSource,
    destinationRoot: path.join(root, 'private-repo-source'),
    expectedSha256: expectedSha,
    expectedBytes: payload.length,
    repoRoot: repo
  }), 'SOURCE_INSIDE_REPOSITORY_REFUSED');

  expectFailure('repository destination rejected', () => stageExactPrivateFile({
    sourcePath: source,
    destinationRoot: path.join(repo, 'private'),
    expectedSha256: expectedSha,
    expectedBytes: payload.length,
    repoRoot: repo
  }), 'DESTINATION_INSIDE_REPOSITORY_REFUSED');

  const conflictRoot = path.join(root, 'conflict');
  fs.mkdirSync(conflictRoot, { recursive: true });
  fs.writeFileSync(path.join(conflictRoot, 'gold.jsonl'), Buffer.from('different\n', 'utf8'));
  expectFailure('existing destination conflict rejected', () => stageExactPrivateFile({
    sourcePath: source,
    destinationRoot: conflictRoot,
    expectedSha256: expectedSha,
    expectedBytes: payload.length,
    repoRoot: repo,
    destinationFilename: 'gold.jsonl'
  }), 'EXISTING_DESTINATION_CONFLICT_REFUSED');

  const sourceBytes = fs.readFileSync(source);
  assert.deepStrictEqual(sourceBytes, payload, 'source must remain unchanged');
  console.log('PASS source remains unchanged');
  console.log('ALL PRIVATE GOLD STAGING TESTS PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
