'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const registry = require('./book-reader-dimension-registry-v1');
const understanding = require('./book-reader-understanding-v1');
const fx = require('./book-b04-e-fixtures-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');

const EXPECTED_LENSES = [
  'REVEAL_INFORMATION','SITUATION_ORIENTATION','PERSPECTIVE_FOCALIZATION','PURPOSE_NARRATIVE_FUNCTION',
  'EXPECTATION_CURIOSITY_TENSION','ATTENTION_ENGAGEMENT','AFFECT_ABSORPTION','TRUST_EPISTEMIC_ALIGNMENT',
  'EFFORT_CONFUSION_FATIGUE','PACING_MOMENTUM','RESONANCE_MEMORY','CALIBRATION_DISAGREEMENT'
];

const cases = [
  ['perspective lens cardinality is exactly 12', () => assert.equal(registry.LENSES.length,12)],
  ['perspective lens labels are exact and ordered', () => assert.deepEqual([...registry.LENSES],EXPECTED_LENSES)],
  ['dimension-target observation is accepted', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp)); assert.equal(o.target.dimension_id,'PCE013-DIM-001'); }],
  ['lens-target observation is accepted independently', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp,{dimension_id:null,perspective_lens_id:'REVEAL_INFORMATION'})); assert.equal(o.target.perspective_lens_id,'REVEAL_INFORMATION'); }],
  ['observation target cannot omit both dimension and lens', () => { const { exp }=fx.buildExposure(); assert.throws(()=>fx.accept(exp,fx.observationCandidate(exp,{dimension_id:null,perspective_lens_id:null})),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['observation target cannot claim both dimension and lens', () => { const { exp }=fx.buildExposure(); assert.throws(()=>fx.accept(exp,fx.observationCandidate(exp,{dimension_id:'PCE013-DIM-001',perspective_lens_id:'REVEAL_INFORMATION'})),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['DETERMINISTIC source class is accepted without provider authority', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp)); assert.equal(o.source_class,'DETERMINISTIC'); assert.equal(o.provider_admission_ref,null); }],
  ['MODEL source without exact current provider admission is blocked', () => { const { exp }=fx.buildExposure(); const c=fx.observationCandidate(exp,undefined,{source_class:'MODEL',provider_subject_ref:'provider://model',provider_admission_ref:'admission://model'}); assert.throws(()=>fx.accept(exp,c),e=>e.code==='BLOCKED_PROVIDER_SUBJECT_UNADMITTED'); }],
  ['MODEL source with exact current provider admission is accepted', () => { const { exp }=fx.buildExposure(); const p=fx.providerBinding(); const c=fx.observationCandidate(exp,undefined,{source_class:'MODEL',provider_subject_ref:p.provider_subject_ref,provider_admission_ref:p.provider_admission_ref}); const o=fx.accept(exp,c,{provider_admission_binding:p}); assert.equal(o.provider_admission_digest,p.provider_admission_digest); }],
  ['SYNTHETIC_READER requires opaque reader profile', () => { const { exp }=fx.buildExposure(); const p=fx.providerBinding('provider://synthetic','admission://synthetic'); const c=fx.observationCandidate(exp,undefined,{source_class:'SYNTHETIC_READER',provider_subject_ref:p.provider_subject_ref,provider_admission_ref:p.provider_admission_ref}); assert.throws(()=>fx.accept(exp,c,{provider_admission_binding:p}),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['SYNTHETIC_READER with profile remains synthetic and accepted', () => { const { exp }=fx.buildExposure(); const p=fx.providerBinding('provider://synthetic','admission://synthetic'); const c=fx.observationCandidate(exp,undefined,{source_class:'SYNTHETIC_READER',provider_subject_ref:p.provider_subject_ref,provider_admission_ref:p.provider_admission_ref,reader_profile_ref:'reader-profile://synthetic/1'}); const o=fx.accept(exp,c,{provider_admission_binding:p}); assert.equal(o.source_class,'SYNTHETIC_READER'); }],
  ['HUMAN source requires opaque reader profile', () => { const { exp }=fx.buildExposure(); const c=fx.observationCandidate(exp,undefined,{source_class:'HUMAN'}); assert.throws(()=>fx.accept(exp,c),e=>e.code==='BLOCKED_HUMAN_STANDING_SYNTHESIZED'); }],
  ['HUMAN source cannot claim provider admission standing', () => { const { exp }=fx.buildExposure(); const c=fx.observationCandidate(exp,undefined,{source_class:'HUMAN',reader_profile_ref:'reader-profile://human/1',provider_subject_ref:'provider://fake',provider_admission_ref:'admission://fake'}); assert.throws(()=>fx.accept(exp,c),e=>e.code==='BLOCKED_HUMAN_STANDING_SYNTHESIZED'); }],
  ['observed standing requires at least one evidence ref', () => { const { exp }=fx.buildExposure(); const c=fx.observationCandidate(exp,undefined,{evidence_refs:[]}); assert.throws(()=>fx.accept(exp,c),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['ABSTAINED may carry sparse evidence and null confidence', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp,undefined,{standing:'ABSTAINED',evidence_refs:[],confidence:null})); assert.equal(o.standing,'ABSTAINED'); }],
  ['NOT_APPLICABLE may carry sparse evidence and null confidence', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp,undefined,{standing:'NOT_APPLICABLE',evidence_refs:[],confidence:null})); assert.equal(o.standing,'NOT_APPLICABLE'); }],
  ['confidence lower bound zero is accepted', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp,undefined,{confidence:0})); assert.equal(o.confidence,0); }],
  ['confidence upper bound one is accepted', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp,undefined,{confidence:1})); assert.equal(o.confidence,1); }],
  ['confidence outside zero-to-one range is blocked', () => { const { exp }=fx.buildExposure(); assert.throws(()=>fx.accept(exp,fx.observationCandidate(exp,undefined,{confidence:1.01})),e=>e.code==='BLOCKED_OBSERVATION_BINDING_MISMATCH'); }],
  ['OBSERVED_CALIBRATED HUMAN requires exact current calibration binding', () => { const { exp }=fx.buildExposure(); const c=fx.observationCandidate(exp,undefined,{source_class:'HUMAN',standing:'OBSERVED_CALIBRATED',reader_profile_ref:'reader-profile://human/1',calibration_ref:'calibration://human/missing'}); assert.throws(()=>fx.accept(exp,c),e=>e.code==='BLOCKED_CALIBRATION_EVIDENCE_REQUIRED'); }],
  ['exact current HUMAN calibration evidence is preserved when accepted', () => { const { exp }=fx.buildExposure(); const cal=fx.calibrationBinding(); const c=fx.observationCandidate(exp,undefined,{source_class:'HUMAN',standing:'OBSERVED_CALIBRATED',reader_profile_ref:'reader-profile://human/1',calibration_ref:cal.calibration_ref}); const o=fx.accept(exp,c,{calibration_binding:cal}); assert.equal(o.calibration_digest,cal.calibration_digest); assert.equal(o.calibration_class,'HUMAN'); }],
  ['MODEL or SYNTHETIC evidence cannot acquire HUMAN calibration class', () => { const { exp }=fx.buildExposure(); const p=fx.providerBinding(); const cal=fx.calibrationBinding('calibration://wrong-human','HUMAN'); const c=fx.observationCandidate(exp,undefined,{source_class:'MODEL',standing:'OBSERVED_CALIBRATED',provider_subject_ref:p.provider_subject_ref,provider_admission_ref:p.provider_admission_ref,calibration_ref:cal.calibration_ref}); assert.throws(()=>fx.accept(exp,c,{provider_admission_binding:p,calibration_binding:cal}),e=>e.code==='BLOCKED_HUMAN_STANDING_SYNTHESIZED'); }],
  ['hidden reasoning and demographic-essentialist payloads are forbidden', () => { const { exp }=fx.buildExposure(); const cot=fx.observationCandidate(exp); cot.chain_of_thought='forbidden'; assert.throws(()=>fx.accept(exp,cot),e=>e.code==='BLOCKED_RAW_TEXT_FORBIDDEN'); const demo=fx.observationCandidate(exp); demo.demographic_race='forbidden'; assert.throws(()=>fx.accept(exp,demo),e=>e.code==='BLOCKED_DEMOGRAPHIC_ESSENTIALISM_FORBIDDEN'); }],
  ['sealed observation is immutable-content-addressed and noncanonical', () => { const { exp }=fx.buildExposure(); const o=fx.accept(exp,fx.observationCandidate(exp)); assert.match(o.observation_id,/^book-reader-observation-v1:[a-f0-9]{64}$/); assert.equal(understanding.validateReaderObservationV1(o,exp),true); assert.equal(o.canonical_effect,false); }]
];

assert.equal(cases.length,24);
cases.forEach(([name,fn],i)=>test(`${manifest.CASE_IDS.PERSPECTIVE[i]} ${name}`,fn));
