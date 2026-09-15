'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const registry = require('./book-reader-dimension-registry-v1');
const understanding = require('./book-reader-understanding-v1');
const fx = require('./book-b04-e-fixtures-v1');
const manifest = require('./book-b04-e-denominator-manifest-v1');

const SOURCE_REGISTRY = path.resolve(__dirname, '../../qualification/book-system/reconstruction/READER-EXPERIENCE-DIMENSION-REGISTRY_v1.0.csv');
function parseCsvLine(line) { const out=[]; let field=''; let quoted=false; for (let i=0;i<line.length;i+=1) { const ch=line[i]; if (quoted) { if (ch==='"' && line[i+1]==='"') { field+='"'; i+=1; } else if (ch==='"') quoted=false; else field+=ch; } else if (ch==='"') quoted=true; else if (ch===',') { out.push(field); field=''; } else field+=ch; } out.push(field); return out; }
function sourceRows() { const lines=fs.readFileSync(SOURCE_REGISTRY,'utf8').trim().split(/\r?\n/); const headers=parseCsvLine(lines.shift()); return lines.map(line => { const values=parseCsvLine(line); return Object.fromEntries(headers.map((key,i)=>[key,values[i]])); }); }
function oneDisposition(standing) { const { exp } = fx.buildExposure(); const o=fx.accept(exp, fx.observationCandidate(exp, { dimension_id:'PCE013-DIM-001', perspective_lens_id:null }, { standing, evidence_refs: standing.startsWith('OBSERVED') ? ['evidence://b04-e/dim-disposition'] : [], confidence: standing.startsWith('OBSERVED') ? 0.5 : null })); return understanding.assembleReaderUnderstandingProjectionV1({ exposure_projection:exp, observations:[o] }).dimension_dispositions[0]; }

const groupCases = Object.entries(registry.GROUP_COUNTS).map(([group,count]) => [`group ${group} cardinality is exact`, () => assert.equal(registry.DIMENSIONS.filter(d=>d.group===group).length,count)]);
const cases = [
  ['registry validator passes exact frozen contract', () => assert.equal(registry.validateRegistryV1(), true)],
  ['registry contains exactly 64 dimensions', () => assert.equal(registry.DIMENSIONS.length,64)],
  ['first immutable ID is PCE013-DIM-001', () => assert.equal(registry.DIMENSIONS[0].dimension_id,'PCE013-DIM-001')],
  ['last immutable ID is PCE013-DIM-064', () => assert.equal(registry.DIMENSIONS[63].dimension_id,'PCE013-DIM-064')],
  ['all immutable IDs preserve exact sequence', () => registry.DIMENSIONS.forEach((d,i)=>assert.equal(d.dimension_id,`PCE013-DIM-${String(i+1).padStart(3,'0')}`))],
  ['dimension IDs are unique', () => assert.equal(new Set(registry.DIMENSIONS.map(d=>d.dimension_id)).size,64)],
  ['dimension keys are unique', () => assert.equal(new Set(registry.DIMENSIONS.map(d=>d.key)).size,64)],
  ['registry contains exactly nine groups', () => assert.equal(new Set(registry.DIMENSIONS.map(d=>d.group)).size,9)],
  ['lens registry remains separate at exactly 12 lenses', () => assert.equal(registry.LENSES.length,12)],
  ...groupCases,
  ['measurement posture is exact on all 64 dimensions', () => registry.DIMENSIONS.forEach(d=>assert.equal(d.measurement_posture,'INTENT_RELATIVE_MULTIMODAL_EVIDENCE'))],
  ['anti-gaming rule is exact on all 64 dimensions', () => registry.DIMENSIONS.forEach(d=>assert.equal(d.anti_gaming_rule,'Never optimize the dimension without its intent envelope; preserve uncertainty and reader plurality.'))],
  ['recovered CSV contains exactly 64 source rows', () => assert.equal(sourceRows().length,64)],
  ['executable registry matches recovered CSV field-for-field', () => { const rows=sourceRows(); rows.forEach((row,index)=>{ const d=registry.DIMENSIONS[index]; assert.equal(String(d.index),row.index); assert.equal(d.dimension_id,row.dimension_id); assert.equal(d.group,row.group); assert.equal(d.key,row.key); assert.equal(d.name,row.name); assert.equal(d.evaluation_question,row.evaluation_question); assert.equal(d.measurement_posture,row.measurement_posture); assert.equal(d.anti_gaming_rule,row.anti_gaming_rule); }); }],
  ['unknown dimension ID fails closed', () => assert.throws(()=>registry.getDimensionV1('PCE013-DIM-999'),/BLOCKED_DIMENSION_UNKNOWN/)],
  ['unknown perspective lens fails closed', () => assert.throws(()=>registry.assertLensV1('LEGACY_FAKE_AXIS'),/BLOCKED_LENS_UNKNOWN/)],
  ['dimension registry exposes no scalar score field', () => registry.DIMENSIONS.forEach(d=>assert.equal(Object.keys(d).some(k=>/score/i.test(k)),false))],
  ['dimension registry exposes no rating or rank field', () => registry.DIMENSIONS.forEach(d=>assert.equal(Object.keys(d).some(k=>/rating|rank/i.test(k)),false))],
  ['empty understanding leaves every dimension UNOBSERVED', () => { const { exp }=fx.buildExposure(); const p=understanding.assembleReaderUnderstandingProjectionV1({exposure_projection:exp,observations:[]}); assert.equal(p.dimension_dispositions.length,64); assert.ok(p.dimension_dispositions.every(d=>d.disposition==='UNOBSERVED')); }],
  ['NOT_APPLICABLE remains an explicit sparse disposition', () => assert.equal(oneDisposition('NOT_APPLICABLE').disposition,'NOT_APPLICABLE')],
  ['ABSTAINED remains an explicit sparse disposition', () => assert.equal(oneDisposition('ABSTAINED').disposition,'ABSTAINED')],
  ['observed evidence maps to OBSERVED without a numeric dimension score', () => { const d=oneDisposition('OBSERVED_UNCALIBRATED'); assert.equal(d.disposition,'OBSERVED'); assert.equal(Object.keys(d).some(k=>/score|rating|rank|percentile|aggregate/i.test(k)),false); }],
  ['universal reader score payload is rejected', () => { const { exp }=fx.buildExposure(); const c=fx.observationCandidate(exp); c.universal_reader_score=0.9; assert.throws(()=>fx.accept(exp,c),e=>e.code==='BLOCKED_UNIVERSAL_READER_SCORE_FORBIDDEN'); }]
];

assert.equal(cases.length,32);
cases.forEach(([name,fn],i)=>test(`${manifest.CASE_IDS.DIMENSION[i]} ${name}`,fn));
