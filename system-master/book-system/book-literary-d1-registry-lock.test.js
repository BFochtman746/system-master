'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('./book-literary-diagnostic-lens-registry-v1');

const CSV_PATH = path.resolve(process.cwd(), 'qualification/book-system/reconstruction/LITERARY-DIAGNOSTIC-LENS-REGISTRY_v1.0.csv');

function parseFrozenCsv() {
  const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  assert.deepEqual(header, ['lens_id','label','owner_class','required_owner_dependencies','output_authority','anti_abuse_rule']);
  return lines.map(line => {
    const values = line.split(',');
    assert.equal(values.length, header.length, `unexpected CSV field count: ${line}`);
    return Object.fromEntries(header.map((field, i) => [field, values[i]]));
  });
}

test('REG-LOCK-01 runtime lens registry is field-for-field identical to frozen B05-C CSV', () => {
  const frozen = parseFrozenCsv();
  assert.equal(frozen.length, 16);
  const runtime = registry.LENSES.map(({ index, ...lens }) => lens);
  assert.deepEqual(runtime, frozen);
});

test('REG-LOCK-02 runtime declares the exact frozen source blob and two external B08 seams', () => {
  assert.equal(registry.FROZEN_SOURCE_BLOB_SHA, 'af6770b3ec0f54cba604d041b6abb9e30082209e');
  assert.deepEqual(registry.EXTERNAL_B08_SEAMS, [
    'VOICE_PRESERVATION_EVOLUTION',
    'HOMOGENIZATION_OVEROPTIMIZATION'
  ]);
});
