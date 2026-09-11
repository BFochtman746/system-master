import test from 'node:test';
import assert from 'node:assert/strict';
import { isControllerTimestamp, isGitObjectId } from '../src/canonical.js';

test('PP-T001 valid UTC controller timestamps are accepted',()=>{assert.equal(isControllerTimestamp('2026-09-11T21:49:33Z'),true);assert.equal(isControllerTimestamp('2024-02-29T23:59:59.123456Z'),true);});
test('PP-T002 impossible calendar dates are rejected',()=>{assert.equal(isControllerTimestamp('2026-02-29T00:00:00Z'),false);assert.equal(isControllerTimestamp('2026-02-31T00:00:00Z'),false);assert.equal(isControllerTimestamp('2026-04-31T00:00:00Z'),false);});
test('PP-T003 invalid time components are rejected',()=>{assert.equal(isControllerTimestamp('2026-09-11T24:00:00Z'),false);assert.equal(isControllerTimestamp('2026-09-11T23:60:00Z'),false);assert.equal(isControllerTimestamp('2026-09-11T23:59:60Z'),false);});
test('PP-T004 non-normalized timezone offsets are rejected at ingress',()=>{assert.equal(isControllerTimestamp('2026-09-11T17:49:33-04:00'),false);assert.equal(isControllerTimestamp('2026-09-11t21:49:33z'),false);});
test('PP-T005 Git SHA-1 and SHA-256 object ids validate with explicit algorithm',()=>{assert.equal(isGitObjectId('sha1','a'.repeat(40)),true);assert.equal(isGitObjectId('sha256','b'.repeat(64)),true);});
test('PP-T006 algorithm/length mismatches and unknown algorithms fail closed',()=>{assert.equal(isGitObjectId('sha1','a'.repeat(64)),false);assert.equal(isGitObjectId('sha256','b'.repeat(40)),false);assert.equal(isGitObjectId('sha512','c'.repeat(128)),false);});
