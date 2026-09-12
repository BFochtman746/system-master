import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubActiveWorkPublisher, GitHubChatReconstructionAdapter, GitHubActiveWorkRestTransport } from '../src/github-active-work-publication.js';
import { CG001_MISSION_VERSION } from '../src/active-work-state.js';

const ref = process.env.CG004_LIVE_REF;
const expectedCommit = process.env.CG004_EXPECTED_PUBLICATION_COMMIT;
const token = process.env.CG004_GITHUB_TOKEN;

const options = ref && expectedCommit && token ? {} : { skip: 'CG004 live GitHub qualification environment not configured' };

test('live GitHub state ref reconstructs exact controller continuation without chat memory', options, async () => {
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746',
    repo: 'system-master',
    tokenProvider: async () => token
  });
  const publisher = new GitHubActiveWorkPublisher({
    transport,
    ref,
    workstreamId: 'SECOND-SHIFT-CONTROL-GATEWAY',
    missionVersion: CG001_MISSION_VERSION
  });
  const adapter = new GitHubChatReconstructionAdapter({ publisher });
  const state = await adapter.reconstructContinuation();
  assert.equal(state.source, 'GITHUB_DURABLE_ACTIVE_WORK');
  assert.equal(state.publication_commit_sha, expectedCommit);
  assert.equal(state.publication_revision, 1);
  assert.equal(state.workstream_id, 'SECOND-SHIFT-CONTROL-GATEWAY');
  assert.equal(state.current_operation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004');
  assert.equal(state.current_operation.state, 'TERMINAL');
  assert.equal(state.next_legal_operation.kind, 'START_SUCCESSOR');
  assert.equal(state.next_legal_operation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005');
});
