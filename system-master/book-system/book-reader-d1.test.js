'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const reg = require('./book-reader-dimension-registry-v1');
const exp = require('./book-reader-exposure-projection-v1');
const kb = require('./book-story-bible-knowledge-v1');
const h = label => kb.sha256(label);
const SA_ID = 'book-source-custody-v1:source-001';
const SA_DIGEST = h('source-acceptance-001');
const PROJ_ID = 'book-normalized-source-projection-v1:projection-001';
const PROJ_DIGEST = h('projection-001');
const MANUSCRIPT_REF = 'MANUSCRIPT:BOOK-001:v1';
const MANUSCRIPT_DIGEST = h('manuscript-v1');
const SOURCE_REGISTRY = path.resolve(__dirname, '../../qualification/book-system/reconstruction/READER-EXPERIENCE-DIMENSION-REGISTRY_v1.0.csv');
function anchor(id, ordinal) { return { anchor_id:id, source_acceptance_id:SA_ID, source_acceptance_digest:SA_DIGEST, projection_id:PROJ_ID, projection_digest:PROJ_DIGEST, manuscript_ref:MANUSCRIPT_REF, unit_ref:'CHAPTER:CH-001:v1', ordinal, span_start:ordinal*10, span_end:ordinal*10+5, span_sha256:h(`span-${id}`), source_current:true, provenance_refs:[`evidence://anchor/${ordinal}`] }; }
function common(anchorId) { return {status:'ASSERTED',confidence:0.9,source_anchor_ids:[anchorId],provenance_refs:[`evidence://record/${anchorId}`],evidence_refs:[],depends_on_refs:[]}; }
function seal(k) { k.knowledge_digest=kb.knowledgeDigest(k); k.knowledge_candidate_id=kb.knowledgeCandidateId(k.knowledge_digest); return k; }
function parseCsvLine(line) { const out=[]; let field=''; let quoted=false; for (let i=0;i<line.length;i+=1) { const ch=line[i]; if (quoted) { if (ch==='"' && line[i+1]==='"') { field+='"'; i+=1; } else if (ch==='"') quoted=false; else field+=ch; } else if (ch==='"') quoted=true; else if (ch===',') { out.push(field); field=''; } else field+=ch; } out.push(field); return out; }
function sourceRows() { const lines=fs.readFileSync(SOURCE_REGISTRY,'utf8').trim().split(/\r?\n/); const headers=parseCsvLine(lines.shift()); return lines.map(line=>Object.fromEntries(headers.map((key,i)=>[key,parseCsvLine(line)[i]]))); }
function candidate() {
  const k={knowledge_schema_version:kb.KNOWLEDGE_SCHEMA_VERSION,book_project_id:'BOOK-PROJECT-001',knowledge_candidate_id:'',knowledge_digest:'',prior_story_bible_ref:null,source_subject_refs:['subject://fixture'],source_acceptance_refs:[{source_acceptance_id:SA_ID,source_acceptance_digest:SA_DIGEST}],projection_refs:[{projection_id:PROJ_ID,projection_digest:PROJ_DIGEST,source_acceptance_id:SA_ID}],manuscript_refs:[{manuscript_ref:MANUSCRIPT_REF,manuscript_digest:MANUSCRIPT_DIGEST}],calibration_policy_ref:'policy://book-knowledge/v1',calibration_policy_digest:h('policy'),anchors:[anchor('ANCHOR:A1',1),anchor('ANCHOR:A2',2),anchor('ANCHOR:A3',3)],
  entities:[{entity_id:'ENTITY:E1',entity_type:'CHARACTER',aliases:['E1'],state_assertion_ids:[],...common('ANCHOR:A1')}],
  events:[{event_id:'EVENT:EARLY',event_family_id:null,participant_entity_ids:['ENTITY:E1'],state_change_ids:[],goal_relation_ids:[],...common('ANCHOR:A2')},{event_id:'EVENT:FUTURE',event_family_id:null,participant_entity_ids:['ENTITY:E1'],state_change_ids:[],goal_relation_ids:[],...common('ANCHOR:A3')}],
  temporal_claims:[],causal_goal_claims:[],state_assertions:[],character_knowledge_claims:[],relationships:[],arcs:[],motifs:[],themes:[],
  promises:[{promise_id:'PROMISE:P1',introduced_event_refs:['EVENT:EARLY'],related_open_question_refs:[],related_setup_payoff_refs:[],resolution_event_refs:['EVENT:FUTURE'],status:'FULFILLED',confidence:0.8,source_anchor_ids:['ANCHOR:A2'],provenance_refs:['evidence://promise/1'],evidence_refs:[],depends_on_refs:['EVENT:EARLY']}],setup_payoffs:[],open_questions:[],identity_lineage:[],standing:'MATERIALIZED_NOT_CANONICAL'};
  return seal(k);
}
function input(k, frontierId='ANCHOR:A2') { const a=k.anchors.find(x=>x.anchor_id===frontierId); return {knowledge:k,story_bible_binding:{story_bible_ref:'STORY_BIBLE:BOOK-001:v1',story_bible_digest:h('story-bible'),knowledge_candidate_id:k.knowledge_candidate_id,knowledge_digest:k.knowledge_digest,current:true},scope:{scope_kind:'CHAPTER',scope_ref:'CHAPTER:CH-001:v1',scope_digest:h('scope')},reveal_frontier:{frontier_anchor_id:a.anchor_id,frontier_ordinal:a.ordinal,frontier_anchor_digest:exp.anchorDigestV1(a)}}; }

test('registry preserves exact cardinalities and groups',()=>{ assert.equal(reg.DIMENSIONS.length,64); assert.equal(reg.LENSES.length,12); assert.equal(reg.validateRegistryV1(),true); assert.equal(reg.DIMENSIONS[0].dimension_id,'PCE013-DIM-001'); assert.equal(reg.DIMENSIONS[63].dimension_id,'PCE013-DIM-064'); });
test('executable dimension registry exactly matches recovered source registry',()=>{ const rows=sourceRows(); assert.equal(rows.length,64); rows.forEach((row,index)=>{ const actual=reg.DIMENSIONS[index]; assert.equal(String(actual.index),row.index); assert.equal(actual.dimension_id,row.dimension_id); assert.equal(actual.group,row.group); assert.equal(actual.key,row.key); assert.equal(actual.name,row.name); assert.equal(actual.evaluation_question,row.evaluation_question); assert.equal(actual.measurement_posture,row.measurement_posture); assert.equal(actual.anti_gaming_rule,row.anti_gaming_rule); }); });
test('unknown dimension and lens fail closed',()=>{ assert.throws(()=>reg.getDimensionV1('PCE013-DIM-999'),/BLOCKED_DIMENSION_UNKNOWN/); assert.throws(()=>reg.assertLensV1('LEGACY_FAKE_AXIS'),/BLOCKED_LENS_UNKNOWN/); });
test('exposure hides future anchor and future event',()=>{ const p=exp.buildReaderExposureProjectionV1(input(candidate())); assert.deepEqual(p.visible_anchor_refs,['ANCHOR:A1','ANCHOR:A2']); assert.deepEqual(p.visible_semantic_refs.entities,['ENTITY:E1']); assert.deepEqual(p.visible_semantic_refs.events,['EVENT:EARLY']); assert.equal(JSON.stringify(p).includes('EVENT:FUTURE'),false); });
test('lifecycle object may be exposed from visible introduction without leaking future resolution or status',()=>{ const p=exp.buildReaderExposureProjectionV1(input(candidate())); assert.deepEqual(p.visible_semantic_refs.promises,['PROMISE:P1']); const s=JSON.stringify(p); assert.equal(s.includes('EVENT:FUTURE'),false); assert.equal(s.includes('FULFILLED'),false); });
test('advancing frontier exposes future event but lifecycle status remains absent',()=>{ const p=exp.buildReaderExposureProjectionV1(input(candidate(),'ANCHOR:A3')); assert.deepEqual(p.visible_semantic_refs.events,['EVENT:EARLY','EVENT:FUTURE']); assert.deepEqual(p.visible_semantic_refs.promises,['PROMISE:P1']); assert.equal(JSON.stringify(p).includes('FULFILLED'),false); });
test('projection is deterministic and content addressed',()=>{ const k=candidate(); const a=exp.buildReaderExposureProjectionV1(input(k)); const b=exp.buildReaderExposureProjectionV1(input(k)); assert.deepEqual(a,b); assert.equal(exp.validateReaderExposureProjectionV1(a),true); });
test('frontier digest mismatch fails closed',()=>{ const i=input(candidate()); i.reveal_frontier.frontier_anchor_digest=h('wrong'); assert.throws(()=>exp.buildReaderExposureProjectionV1(i),e=>e.code==='BLOCKED_FRONTIER_BINDING_MISMATCH'); });
test('story bible binding mismatch fails closed',()=>{ const i=input(candidate()); i.story_bible_binding.knowledge_digest=h('wrong'); assert.throws(()=>exp.buildReaderExposureProjectionV1(i),e=>e.code==='BLOCKED_STORY_BIBLE_BINDING_MISMATCH'); });
test('raw text shaped fields are rejected with B04 error',()=>{ const i=input(candidate()); i.knowledge.raw_manuscript_text='secret'; assert.throws(()=>exp.buildReaderExposureProjectionV1(i),e=>e.code==='BLOCKED_RAW_TEXT_FORBIDDEN'); });
test('invalid scope fails closed',()=>{ const i=input(candidate()); i.scope.scope_kind='BOOK'; assert.throws(()=>exp.buildReaderExposureProjectionV1(i),e=>e.code==='BLOCKED_SCOPE_INVALID'); });