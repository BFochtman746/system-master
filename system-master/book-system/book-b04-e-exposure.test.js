'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const exp = require('./book-reader-exposure-projection-v1');
const d3 = require('./book-reader-currentness-runtime-v1');
const fx = require('./book-b04-e-fixtures-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');

const cases = [
  ['schema version is exact', () => { const { exp: p } = fx.buildExposure(); assert.equal(p.exposure_schema_version, 'BOOK_READER_EXPOSURE_V1'); }],
  ['projection identity is content addressed', () => { const { exp: p } = fx.buildExposure(); assert.match(p.exposure_projection_id, /^book-reader-exposure-v1:[a-f0-9]{64}$/); }],
  ['Story Bible ref is bound exactly', () => { const { exp: p } = fx.buildExposure(); assert.equal(p.story_bible_ref, 'STORY_BIBLE:BOOK-B04-E:v1'); }],
  ['Story Bible digest is bound exactly', () => { const { exp: p } = fx.buildExposure(); assert.equal(p.story_bible_digest, fx.h('b04-e-story-bible')); }],
  ['B03 knowledge identity is bound exactly', () => { const { knowledge, exp: p } = fx.buildExposure(); assert.equal(p.knowledge_candidate_id, knowledge.knowledge_candidate_id); assert.equal(p.knowledge_digest, knowledge.knowledge_digest); }],
  ['CHAPTER scope is accepted', () => { const { exp: p } = fx.buildExposure({ scope_kind: 'CHAPTER' }); assert.equal(p.scope.scope_kind, 'CHAPTER'); }],
  ['PASSAGE scope is accepted', () => { const { exp: p } = fx.buildExposure({ scope_kind: 'PASSAGE', scope_ref: 'PASSAGE:B04-E-P1:v1' }); assert.equal(p.scope.scope_kind, 'PASSAGE'); }],
  ['SCENE scope is accepted', () => { const { exp: p } = fx.buildExposure({ scope_kind: 'SCENE', scope_ref: 'SCENE:B04-E-S1:v1' }); assert.equal(p.scope.scope_kind, 'SCENE'); }],
  ['unsupported BOOK scope fails closed', () => { const k = fx.knowledgeFixture(); const i = fx.exposureInput(k, { scope_kind: 'BOOK' }); assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_SCOPE_INVALID'); }],
  ['non-current Story Bible binding fails closed', () => { const k = fx.knowledgeFixture(); const i = fx.exposureInput(k, { story_bible_current: false }); assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_STORY_BIBLE_BINDING_MISMATCH'); }],
  ['Story Bible to knowledge mismatch fails closed', () => { const k = fx.knowledgeFixture(); const i = fx.exposureInput(k); i.story_bible_binding.knowledge_digest = fx.h('wrong-knowledge'); assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_STORY_BIBLE_BINDING_MISMATCH'); }],
  ['frontier anchor identity is preserved', () => { const { exp: p } = fx.buildExposure(); assert.equal(p.reveal_frontier.frontier_anchor_id, 'ANCHOR:B04-E-A2'); }],
  ['frontier ordinal is preserved', () => { const { exp: p } = fx.buildExposure(); assert.equal(p.reveal_frontier.frontier_ordinal, 2); }],
  ['frontier digest binds exact anchor', () => { const { knowledge, exp: p } = fx.buildExposure(); assert.equal(p.reveal_frontier.frontier_anchor_digest, exp.anchorDigestV1(knowledge.anchors[1])); }],
  ['missing frontier anchor fails closed', () => { const k = fx.knowledgeFixture(); const i = fx.exposureInput(k); i.reveal_frontier.frontier_anchor_id = 'ANCHOR:MISSING'; assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_FRONTIER_UNRESOLVED'); }],
  ['frontier ordinal mismatch fails closed', () => { const k = fx.knowledgeFixture(); const i = fx.exposureInput(k); i.reveal_frontier.frontier_ordinal = 99; assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_FRONTIER_BINDING_MISMATCH'); }],
  ['frontier digest mismatch fails closed', () => { const k = fx.knowledgeFixture(); const i = fx.exposureInput(k); i.reveal_frontier.frontier_anchor_digest = fx.h('wrong-frontier'); assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_FRONTIER_BINDING_MISMATCH'); }],
  ['visible anchors stop at frontier', () => { const { exp: p } = fx.buildExposure(); assert.deepEqual(p.visible_anchor_refs, ['ANCHOR:B04-E-A1','ANCHOR:B04-E-A2']); }],
  ['future anchor is hidden', () => { const { exp: p } = fx.buildExposure(); assert.equal(p.visible_anchor_refs.includes('ANCHOR:B04-E-A3'), false); }],
  ['frontier-visible event is exposed', () => { const { exp: p } = fx.buildExposure(); assert.deepEqual(p.visible_semantic_refs.events, ['EVENT:B04-E-EARLY']); }],
  ['future semantic event is hidden', () => { const { exp: p } = fx.buildExposure(); assert.equal(JSON.stringify(p).includes('EVENT:B04-E-FUTURE'), false); }],
  ['lifecycle object is visible from its introduction', () => { const { exp: p } = fx.buildExposure(); assert.deepEqual(p.visible_semantic_refs.promises, ['PROMISE:B04-E-P1']); }],
  ['future lifecycle resolution ref is not leaked', () => { const { exp: p } = fx.buildExposure(); assert.equal(JSON.stringify(p).includes('EVENT:B04-E-FUTURE'), false); }],
  ['final lifecycle status is not leaked', () => { const { exp: p } = fx.buildExposure(); assert.equal(JSON.stringify(p).includes('FULFILLED'), false); }],
  ['advancing frontier exposes later event without copying lifecycle status', () => { const { exp: p } = fx.buildExposure({ frontier_id: 'ANCHOR:B04-E-A3' }); assert.ok(p.visible_semantic_refs.events.includes('EVENT:B04-E-FUTURE')); assert.equal(JSON.stringify(p).includes('FULFILLED'), false); }],
  ['dependency refs contain exact knowledge binding', () => { const { knowledge, exp: p } = fx.buildExposure(); assert.ok(p.dependency_refs.includes(`knowledge:${knowledge.knowledge_candidate_id}@${knowledge.knowledge_digest}`)); }],
  ['dependency refs contain exact Story Bible binding', () => { const { exp: p } = fx.buildExposure(); assert.ok(p.dependency_refs.includes(`story_bible:${p.story_bible_ref}@${p.story_bible_digest}`)); }],
  ['dependency refs contain exact scope binding', () => { const { exp: p } = fx.buildExposure(); assert.ok(p.dependency_refs.includes(`scope:${p.scope.scope_kind}:${p.scope.scope_ref}@${p.scope.scope_digest}`)); }],
  ['dependency refs contain exact frontier binding', () => { const { exp: p } = fx.buildExposure(); assert.ok(p.dependency_refs.includes(`frontier:${p.reveal_frontier.frontier_anchor_id}@${p.reveal_frontier.frontier_anchor_digest}:${p.reveal_frontier.frontier_ordinal}`)); }],
  ['raw manuscript text shaped input is forbidden', () => { const k = fx.knowledgeFixture(); k.raw_manuscript_text = 'forbidden'; const i = fx.exposureInput(k); assert.throws(() => exp.buildReaderExposureProjectionV1(i), e => e.code === 'BLOCKED_RAW_TEXT_FORBIDDEN'); }],
  ['projection is deterministic and validates content address', () => { const k = fx.knowledgeFixture(); const a = exp.buildReaderExposureProjectionV1(fx.exposureInput(k)); const b = exp.buildReaderExposureProjectionV1(fx.exposureInput(k)); assert.deepEqual(a,b); assert.equal(exp.validateReaderExposureProjectionV1(a), true); }],
  ['stale exposure cannot be returned as current', () => { const f = fx.fixture(); const bindings = fx.clone(f.current_bindings); bindings.scope.current = false; const currentness = fx.compute(f, bindings); assert.throws(() => d3.getReaderExposureProjectionV1({ exposure_projection: f.exp, currentness }), e => e.code === 'BLOCKED_CURRENTNESS_REQUIRED'); }]
];

assert.equal(cases.length, 32);
cases.forEach(([name, fn], i) => test(`${manifest.CASE_IDS.EXPOSURE[i]} ${name}`, fn));
