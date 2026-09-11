import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerError } from '../src/errors.js';
import {
  CONTROL_STATE_ACTIVATION_PROTOCOL,
  CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT,
  closeQualifiedControlStateActivation,
  summarizeQualifiedControlStateActivation
} from '../src/control-state-activation-closure.js';

const genesis = '1'.repeat(40);
const revision = '2'.repeat(40);
const head = '3'.repeat(64);
const anchorDigest = '4'.repeat(64);

function runtime({ size = 2, anchored = true, anchorCount = 1 } = {}) {
  return {
    authority: {
      authoritative: true,
      subjectRepository: 'bfochtman746/system-master',
      controlStateRepository: 'bfochtman746/system-master-control-state',
      controlStateRepositoryId: '999',
      journalBranch: 'controller-journal/v1',
      anchorBranch: 'controller-anchor/v1',
      journalPrincipal: { kind: 'github-app', id: '101' },
      anchorPrincipal: { kind: 'github-app', id: '202' }
    },
    journalVerification: {
      checkpoint: { size, head_digest: size ? head : null },
      checkpoint_document: { size, head_digest: size ? head : null },
      transport_revision: revision
    },
    anchorCount,
    anchoredExtension: anchored
      ? { anchored: true, record: { anchor_digest: anchorDigest, checkpoint: { size: 1, head_digest: head } } }
      : { anchored: false }
  };
}

function code(fn, expected) {
  assert.throws(fn, (error) => error instanceof ControllerError && error.code === expected);
}

test('C1 emits deterministic content-addressed activation standing', () => {
  const a = summarizeQualifiedControlStateActivation(runtime(), { genesisSha: genesis });
  const b = summarizeQualifiedControlStateActivation(runtime(), { genesisSha: genesis });
  assert.equal(a.protocol_version, CONTROL_STATE_ACTIVATION_PROTOCOL);
  assert.equal(a.qualified_002c_subject, CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT);
  assert.equal(a.activation_fingerprint, b.activation_fingerprint);
  assert.match(a.activation_fingerprint, /^[0-9a-f]{64}$/);
});

test('C1 permits a verified empty authority before the first anchor', () => {
  const value = summarizeQualifiedControlStateActivation(runtime({ size: 0, anchored: false, anchorCount: 0 }), { genesisSha: genesis });
  assert.equal(value.journal.size, 0);
  assert.equal(value.anchor.count, 0);
  assert.equal(value.anchor.anchored, false);
});

test('C1 rejects wrong qualified subject', () => code(
  () => summarizeQualifiedControlStateActivation(runtime(), { genesisSha: genesis, qualifiedSubject: '0'.repeat(40) }),
  'ACTIVATION_SUBJECT_MISMATCH'
));

test('C1 rejects non-authoritative runtime', () => {
  const value = runtime();
  value.authority.authoritative = false;
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_NOT_AUTHORITATIVE');
});

test('C1 rejects subject/control repository collision', () => {
  const value = runtime();
  value.authority.controlStateRepository = value.authority.subjectRepository;
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_AUTHORITY_INVALID');
});

test('C1 rejects shared journal/anchor principal', () => {
  const value = runtime();
  value.authority.anchorPrincipal = { ...value.authority.journalPrincipal };
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_AUTHORITY_INVALID');
});

test('C1 rejects mismatched verified/durable checkpoint', () => {
  const value = runtime();
  value.journalVerification.checkpoint_document = { size: 3, head_digest: head };
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_JOURNAL_MISMATCH');
});

test('C1 rejects invalid transport revision', () => {
  const value = runtime();
  value.journalVerification.transport_revision = 'main';
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_EVIDENCE_INVALID');
});

test('C1 rejects anchor count/standing disagreement', () => {
  const value = runtime({ anchored: false, anchorCount: 1 });
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_ANCHOR_MISMATCH');
});

test('C1 rejects anchor ahead of journal', () => {
  const value = runtime();
  value.anchoredExtension.record.checkpoint = { size: 3, head_digest: head };
  code(() => summarizeQualifiedControlStateActivation(value, { genesisSha: genesis }), 'ACTIVATION_ANCHOR_MISMATCH');
});

test('C1 closure composes qualified 002C authoritative constructor exactly once', async () => {
  let calls = 0;
  const expected = runtime();
  const out = await closeQualifiedControlStateActivation({
    config: { x: 1 },
    observation: { y: 2 },
    journalTransport: {},
    anchorTransport: {},
    genesisSha: genesis,
    maxBatchEvents: 77,
    activate: async (args) => {
      calls += 1;
      assert.equal(args.genesisSha, genesis);
      assert.equal(args.maxBatchEvents, 77);
      return expected;
    }
  });
  assert.equal(calls, 1);
  assert.equal(out.runtime, expected);
  assert.match(out.receipt.activation_fingerprint, /^[0-9a-f]{64}$/);
});
