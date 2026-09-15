'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');
const f = require('./book-b04-e-fixtures-v1');

const c = (name, run) => ({ name, run });
const code = expected => err => err && err.code === expected;

manifest.registerFamilyTests(test, 'E', [
  c('current chapter exposure binds exact B03 and Story Bible identities', () => {
    const x = f.exposureFixture();
    assert.equal(x.exp.knowledge_candidate_id, x.knowledge.knowledge_candidate_id);
    assert.equal(x.exp.story_bible_ref, x.story_bible_binding.story_bible_ref);
    assert.equal(x.exp.scope.scope_kind, 'CHAPTER');
  }),
  c('PASSAGE scope is allowed', () => assert.equal(f.exposureFixture({ scope_kind: 'PASSAGE' }).exp.scope.scope_kind, 'PASSAGE')),
  c('SCENE scope is allowed', () => assert.equal(f.exposureFixture({ scope_kind: 'SCENE' }).exp.scope.scope_kind, 'SCENE')),
  c('invalid scope fails closed', () => {
    const k = f.knowledgeFixture();
    const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'BOOK', scope_ref: 'BOOK:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_SCOPE_INVALID'));
  }),
  c('missing frontier anchor fails closed', () => {
    const k = f.knowledgeFixture();
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: 'ANCHOR:MISSING', frontier_ordinal: 2, frontier_anchor_digest: f.h('missing') } }), code('BLOCKED_FRONTIER_UNRESOLVED'));
  }),
  c('frontier ordinal mismatch fails closed', () => {
    const k = f.knowledgeFixture(); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: 1, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_FRONTIER_BINDING_MISMATCH'));
  }),
  c('frontier digest mismatch fails closed', () => {
    const k = f.knowledgeFixture(); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: f.h('wrong') } }), code('BLOCKED_FRONTIER_BINDING_MISMATCH'));
  }),
  c('Story Bible current false is rejected', () => {
    const k = f.knowledgeFixture(); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k, { current: false }), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_STORY_BIBLE_BINDING_MISMATCH'));
  }),
  c('Story Bible knowledge binding mismatch is rejected', () => {
    const k = f.knowledgeFixture(); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k, { knowledge_digest: f.h('wrong') }), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_STORY_BIBLE_BINDING_MISMATCH'));
  }),
  c('ineligible B03 knowledge standing is rejected', () => {
    const k = f.knowledgeFixture({ standing: 'BLOCKED_STALE' }); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_KNOWLEDGE_INVALID'));
  }),
  c('tampered B03 knowledge digest is rejected', () => {
    const k = f.knowledgeFixture(); k.knowledge_digest = f.h('tampered'); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_KNOWLEDGE_INVALID'));
  }),
  c('noncurrent source anchor is rejected by B03 knowledge validity before B04 exposure', () => {
    const k = f.knowledgeFixture({ a2_current: false }); const a = k.anchors[2];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), err => err && err.code === 'BLOCKED_KNOWLEDGE_INVALID' && err.detail === 'ANCHOR_SOURCE_NOT_CURRENT');
  }),
  c('frontier hides future anchor', () => {
    const x = f.exposureFixture(); assert.equal(x.exp.visible_anchor_refs.includes('ANCHOR:B04E-A3'), false);
  }),
  c('frontier hides future event', () => {
    const x = f.exposureFixture(); assert.equal((x.exp.visible_semantic_refs.events || []).includes('EVENT:B04E-FUTURE'), false);
  }),
  c('visible direct anchor cannot expose semantic record with future dependency', () => {
    const x = f.exposureFixture(); assert.equal((x.exp.visible_semantic_refs.events || []).includes('EVENT:B04E-DEPENDENT-FUTURE'), false);
  }),
  c('advancing frontier exposes complete eligible dependency chain', () => {
    const x = f.exposureFixture({ frontier_ordinal: 3 });
    assert.ok(x.exp.visible_semantic_refs.events.includes('EVENT:B04E-FUTURE'));
    assert.ok(x.exp.visible_semantic_refs.events.includes('EVENT:B04E-DEPENDENT-FUTURE'));
  }),
  c('semantic dependency cycle is blocked rather than leaked', () => {
    const k = f.knowledgeFixture({ cycle: true }); const a = k.anchors[2];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_FUTURE_TEXT_LEAKAGE'));
  }),
  c('future semantic IDs are absent from serialized exposure output', () => {
    const x = f.exposureFixture(); assert.equal(JSON.stringify(x.exp).includes('EVENT:B04E-FUTURE'), false);
  }),
  c('hidden semantic counts are not emitted', () => {
    const x = f.exposureFixture(); const s = JSON.stringify(x.exp); assert.equal(/hidden.*count|future.*count/i.test(s), false);
  }),
  c('visible anchors are exactly valid current anchors at or before frontier', () => {
    const x = f.exposureFixture();
    assert.deepEqual(x.exp.visible_anchor_refs, ['ANCHOR:B04E-A1','ANCHOR:B04E-A2']);
    assert.equal(x.knowledge.anchors.filter(a => a.ordinal <= 2).every(a => a.source_current === true), true);
  }),
  c('dependency refs bind exact knowledge identity and digest', () => {
    const x = f.exposureFixture(); assert.ok(x.exp.dependency_refs.includes(`knowledge:${x.knowledge.knowledge_candidate_id}@${x.knowledge.knowledge_digest}`));
  }),
  c('dependency refs bind exact Story Bible identity and digest', () => {
    const x = f.exposureFixture(); assert.ok(x.exp.dependency_refs.includes(`story_bible:${x.exp.story_bible_ref}@${x.exp.story_bible_digest}`));
  }),
  c('dependency refs bind exact scope identity and digest', () => {
    const x = f.exposureFixture(); assert.ok(x.exp.dependency_refs.includes(`scope:${x.exp.scope.scope_kind}:${x.exp.scope.scope_ref}@${x.exp.scope.scope_digest}`));
  }),
  c('dependency refs bind exact reveal frontier', () => {
    const x = f.exposureFixture(); const r = x.exp.reveal_frontier; assert.ok(x.exp.dependency_refs.includes(`frontier:${r.frontier_anchor_id}@${r.frontier_anchor_digest}:${r.frontier_ordinal}`));
  }),
  c('visible semantic records contribute content-addressed anchor dependency refs', () => {
    const x = f.exposureFixture(); assert.ok(x.exp.dependency_refs.some(r => r.startsWith('anchor:ANCHOR:B04E-A1@')));
  }),
  c('dependency refs are sorted and deduplicated', () => {
    const x = f.exposureFixture(); assert.deepEqual(x.exp.dependency_refs, [...new Set(x.exp.dependency_refs)].sort());
  }),
  c('identical exposure input is deterministic and content addressed', () => {
    const k = f.knowledgeFixture(); const a = k.anchors[1]; const input = { knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:DET', scope_digest: f.h('det-scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } };
    const a1 = exposure.buildReaderExposureProjectionV1(input); const a2 = exposure.buildReaderExposureProjectionV1(f.clone(input)); assert.deepEqual(a1, a2);
  }),
  c('projection digest tampering is rejected', () => {
    const x = f.exposureFixture(); const p = f.clone(x.exp); p.exposure_projection_digest = f.h('tampered'); assert.throws(() => exposure.validateReaderExposureProjectionV1(p), code('BLOCKED_DIGEST_MISMATCH'));
  }),
  c('raw manuscript-shaped payload is rejected', () => {
    const k = f.knowledgeFixture(); k.raw_manuscript_text = 'forbidden'; k.knowledge_digest = kb.knowledgeDigest(k); k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_RAW_TEXT_FORBIDDEN'));
  }),
  c('quoted-text-shaped payload is rejected', () => {
    const k = f.knowledgeFixture(); k.quoted_text = 'forbidden'; k.knowledge_digest = kb.knowledgeDigest(k); k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_RAW_TEXT_FORBIDDEN'));
  }),
  c('full-text-shaped payload is rejected', () => {
    const k = f.knowledgeFixture(); k.full_text = 'forbidden'; k.knowledge_digest = kb.knowledgeDigest(k); k.knowledge_candidate_id = kb.knowledgeCandidateId(k.knowledge_digest); const a = k.anchors[1];
    assert.throws(() => exposure.buildReaderExposureProjectionV1({ knowledge: k, story_bible_binding: f.storyBibleBinding(k), scope: { scope_kind: 'CHAPTER', scope_ref: 'CHAPTER:X', scope_digest: f.h('scope') }, reveal_frontier: { frontier_anchor_id: a.anchor_id, frontier_ordinal: a.ordinal, frontier_anchor_digest: exposure.anchorDigestV1(a) } }), code('BLOCKED_RAW_TEXT_FORBIDDEN'));
  }),
  c('exposure output is bounded refs and metadata with no raw-text or canonical-write field', () => {
    const x = f.exposureFixture(); const s = JSON.stringify(x.exp); assert.equal(/raw_manuscript|quoted_text|full_text|canonical_write/i.test(s), false); assert.equal(exposure.validateReaderExposureProjectionV1(x.exp), true);
  })
]);