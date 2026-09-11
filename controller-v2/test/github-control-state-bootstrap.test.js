import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapControlStateRefs, EmptyJournalCheckpoint } from '../src/github-control-state-bootstrap.js';
import { GitHubJournalPaths } from '../src/github-durable-journal.js';
import { GitHubAnchorPaths, EmptyAnchorHead } from '../src/github-checkpoint-anchor.js';
import { FakeGitTransport } from '../test-support/fake-git-transport.js';

test('BCS-T001 bootstrap creates two sibling authority refs with explicit empty state',async()=>{
  const t=new FakeGitTransport();const base=t.genesisSha;const r=await bootstrapControlStateRefs({transport:t,baseSha:base});
  assert.equal(r.journal.created,true);assert.equal(r.anchor.created,true);assert.notEqual(r.journal.sha,r.anchor.sha);
  assert.deepEqual(JSON.parse(await t.readFile(r.journal.sha,GitHubJournalPaths.checkpoint)),EmptyJournalCheckpoint);
  assert.deepEqual(JSON.parse(await t.readFile(r.anchor.sha,GitHubAnchorPaths.head)),EmptyAnchorHead);
  assert.equal((await t.getCommit(r.journal.sha)).parents[0],base);assert.equal((await t.getCommit(r.anchor.sha)).parents[0],base);
});

test('BCS-T002 bootstrap is idempotent and never rewrites existing authority refs',async()=>{const t=new FakeGitTransport();const first=await bootstrapControlStateRefs({transport:t,baseSha:t.genesisSha});const second=await bootstrapControlStateRefs({transport:t,baseSha:t.genesisSha});assert.equal(second.journal.created,false);assert.equal(second.anchor.created,false);assert.equal(second.journal.sha,first.journal.sha);assert.equal(second.anchor.sha,first.anchor.sha);});

test('BCS-T003 journal and anchor ref names cannot collide',async()=>{const t=new FakeGitTransport();await assert.rejects(bootstrapControlStateRefs({transport:t,baseSha:t.genesisSha,journalBranch:'same',anchorBranch:'same'}),e=>e.code==='BOOTSTRAP_REF_COLLISION');});

test('BCS-T004 invalid base object identity fails closed before any ref creation',async()=>{const t=new FakeGitTransport();await assert.rejects(bootstrapControlStateRefs({transport:t,baseSha:'BAD'}),e=>e.code==='BOOTSTRAP_BASE_INVALID');assert.equal(t.refs.size,0);});
