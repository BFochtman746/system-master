'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const kb = require('./book-story-bible-knowledge-v1');
const exposure = require('./book-reader-exposure-projection-v1');
const understanding = require('./book-reader-understanding-v1');

const h = v => kb.sha256(v);
const SA_ID = 'book-source-custody-v1:d2-hardening';
const SA_DIGEST = h('d2-hardening-source');
const PROJ_ID = 'book-normalized-source-projection-v1:d2-hardening';
const PROJ_DIGEST = h('d2-hardening-projection');

function anchor() {
  return { anchor_id:'ANCHOR:D2-H1', source_acceptance_id:SA_ID, source_acceptance_digest:SA_DIGEST, projection_id:PROJ_ID, projection_digest:PROJ_DIGEST, manuscript_ref:'MANUSCRIPT:D2-H:v1', unit_ref:'CHAPTER:D2-H:v1', ordinal:1, span_start:0, span_end:5, span_sha256:h('d2-hardening-span'), source_current:true, provenance_refs:['evidence://d2-hardening/anchor'] };
}
function sealKnowledge(k) { k.knowledge_digest=kb.knowledgeDigest(k); k.knowledge_candidate_id=kb.knowledgeCandidateId(k.knowledge_digest); return k; }
function expFixture() {
  const a=anchor();
  const k=sealKnowledge({knowledge_schema_version:kb.KNOWLEDGE_SCHEMA_VERSION,book_project_id:'BOOK-D2-H',knowledge_candidate_id:'',knowledge_digest:'',prior_story_bible_ref:null,source_subject_refs:['subject://d2-hardening'],source_acceptance_refs:[{source_acceptance_id:SA_ID,source_acceptance_digest:SA_DIGEST}],projection_refs:[{projection_id:PROJ_ID,projection_digest:PROJ_DIGEST,source_acceptance_id:SA_ID}],manuscript_refs:[{manuscript_ref:'MANUSCRIPT:D2-H:v1',manuscript_digest:h('d2-hardening-manuscript')}],calibration_policy_ref:'policy://d2-hardening',calibration_policy_digest:h('d2-hardening-policy'),anchors:[a],entities:[],events:[],temporal_claims:[],causal_goal_claims:[],state_assertions:[],character_knowledge_claims:[],relationships:[],arcs:[],motifs:[],themes:[],promises:[],setup_payoffs:[],open_questions:[],identity_lineage:[],standing:'MATERIALIZED_NOT_CANONICAL'});
  return exposure.buildReaderExposureProjectionV1({knowledge:k,story_bible_binding:{story_bible_ref:'STORY_BIBLE:D2-H:v1',story_bible_digest:h('d2-hardening-story'),knowledge_candidate_id:k.knowledge_candidate_id,knowledge_digest:k.knowledge_digest,current:true},scope:{scope_kind:'CHAPTER',scope_ref:'CHAPTER:D2-H:v1',scope_digest:h('d2-hardening-scope')},reveal_frontier:{frontier_anchor_id:a.anchor_id,frontier_ordinal:a.ordinal,frontier_anchor_digest:exposure.anchorDigestV1(a)}});
}
function candidate(exp, overrides={}) {
  return {observation_schema_version:understanding.OBSERVATION_SCHEMA_VERSION,exposure_projection_id:exp.exposure_projection_id,exposure_projection_digest:exp.exposure_projection_digest,target:{dimension_id:'PCE013-DIM-001',perspective_lens_id:null},source_class:'DETERMINISTIC',standing:'OBSERVED_UNCALIBRATED',provider_subject_ref:null,provider_admission_ref:null,reader_profile_ref:null,evidence_refs:['evidence://d2-hardening/default'],confidence:0.8,calibration_ref:null,reveal_frontier:JSON.parse(JSON.stringify(exp.reveal_frontier)),canonical_effect:false,...overrides};
}
function reseal(o) {
  const semantic=JSON.parse(JSON.stringify(o));
  delete semantic.observation_id;
  delete semantic.observation_digest;
  const d=h(semantic);
  o.observation_digest=d;
  o.observation_id=`${understanding.OBSERVATION_PREFIX}${d}`;
  return o;
}

test('D2-28 sealed HUMAN observation cannot be forged with provider standing',()=>{
  const exp=expFixture();
  const human=understanding.acceptReaderObservationV1({candidate:candidate(exp,{source_class:'HUMAN',reader_profile_ref:'reader-profile://observed/hardening',evidence_refs:['evidence://human/hardening'] }),exposure_projection:exp});
  human.provider_subject_ref='provider://forged-model';
  human.provider_admission_ref='provider-admission://forged-model';
  human.provider_admission_digest=h('forged-provider-admission');
  reseal(human);
  assert.throws(()=>understanding.validateReaderObservationV1(human,exp),e=>e.code==='BLOCKED_HUMAN_STANDING_SYNTHESIZED');
});

test('D2-29 sealed MODEL observation cannot forge HUMAN calibration class',()=>{
  const exp=expFixture();
  const provider={provider_subject_ref:'provider://model/hardening',provider_admission_ref:'provider-admission://model/hardening',provider_admission_digest:h('provider-model-hardening'),current:true};
  const calibration={calibration_ref:'calibration://model/hardening',calibration_digest:h('calibration-model-hardening'),calibration_class:'MODEL',current:true};
  const model=understanding.acceptReaderObservationV1({candidate:candidate(exp,{source_class:'MODEL',standing:'OBSERVED_CALIBRATED',provider_subject_ref:provider.provider_subject_ref,provider_admission_ref:provider.provider_admission_ref,calibration_ref:calibration.calibration_ref,evidence_refs:['evidence://model/hardening']}),exposure_projection:exp,provider_admission_binding:provider,calibration_binding:calibration});
  model.calibration_class='HUMAN';
  model.calibration_digest=h('forged-human-calibration');
  reseal(model);
  assert.throws(()=>understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[model]}),e=>e.code==='BLOCKED_HUMAN_STANDING_SYNTHESIZED');
});

test('D2-30 provider admission and calibration digests survive sealing and assembly binding',()=>{
  const exp=expFixture();
  const provider={provider_subject_ref:'provider://model/exact',provider_admission_ref:'provider-admission://model/exact',provider_admission_digest:h('provider-model-exact'),current:true};
  const calibration={calibration_ref:'calibration://model/exact',calibration_digest:h('calibration-model-exact'),calibration_class:'MODEL',current:true};
  const model=understanding.acceptReaderObservationV1({candidate:candidate(exp,{source_class:'MODEL',standing:'OBSERVED_CALIBRATED',provider_subject_ref:provider.provider_subject_ref,provider_admission_ref:provider.provider_admission_ref,calibration_ref:calibration.calibration_ref,evidence_refs:['evidence://model/exact']}),exposure_projection:exp,provider_admission_binding:provider,calibration_binding:calibration});
  assert.equal(model.provider_admission_digest,provider.provider_admission_digest);
  assert.equal(model.calibration_digest,calibration.calibration_digest);
  assert.equal(model.calibration_class,'MODEL');
  const p=understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[model]});
  assert.deepEqual(p.provider_admission_digests,[provider.provider_admission_digest]);
  assert.deepEqual(p.calibration_digests,[calibration.calibration_digest]);
});
