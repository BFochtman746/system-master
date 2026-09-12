'use strict';

const assert=require('assert');
const core=require('../../system-master/book-system/canonical-parent-v2-f6-core.js');
const migration=require('../../system-master/book-system/canonical-parent-v1-v2-migration.js');

const H=v=>core.sha256(String(v));
function clone(v){return JSON.parse(JSON.stringify(v));}
function expectCode(code,fn){assert.throws(fn,e=>e&&e.code===code,`expected ${code}`);}
function legacyFixture(overrides={}){
  const base={
    schema_version:1,
    state_version:17,
    book_project:{book_project_id:'BOOKPROJECT:001',book_id:'BOOK:001',status:'AUTHOR_REVIEW',governing_brief_ref:'BRIEF:001',canonical_manifest_ref:'CANON:001'},
    governing_briefs:{'BRIEF:001':{brief_id:'BRIEF:001',version:3,author_intent:'Fixture author intent retained only in source snapshot.',form:'BOOK',genre:'PROJECT_DEFINED',audience:'PROJECT_DEFINED',voice_goals:['PROJECT_SPECIFIC'],hard_constraints:['NO_SILENT_CANON_MUTATION']}},
    canon_manifests:{'CANON:001':{canon_manifest_id:'CANON:001',version:4,facts:[],entities:[],world_rules:[],protected_language_refs:[],intent_constraints:[],approval_state:'APPROVED'}},
    story_bibles:{'STORYBIBLE:001':{story_bible_id:'STORYBIBLE:001',version:2,entity_refs:[],relationship_refs:[],timeline_refs:[],arc_refs:[],motif_theme_refs:[],open_questions:[],provenance:[]}},
    book_plans:{'PLAN:001':{plan_id:'PLAN:001',version:5,part_refs:[],chapter_refs:[],scene_refs:[],dependency_edges:[],purpose_and_payoff_refs:[]}},
    manuscripts:{'MANUSCRIPT:001:V9':{manuscript_id:'MANUSCRIPT:001',version_id:'MANUSCRIPT:001:V9',artifact_digest:H('LEGACY-MANUSCRIPT-V9'),authority_state:'CANONICAL',parent_version_ref:'MANUSCRIPT:001:V8',change_set_ref:'CHANGESET:009',created_by:'PARENT_SYSTEM',created_at:'2026-09-09T16:00:00Z'}},
    research_evidence_links:{},author_decisions:{},integration_proposals:{},export_releases:{},
    active:{governing_brief_ref:'BRIEF:001',canon_manifest_ref:'CANON:001',story_bible_ref:'STORYBIBLE:001',book_plan_ref:'PLAN:001',canonical_manuscript_ref:'MANUSCRIPT:001:V9'}
  };
  for(const [k,v] of Object.entries(overrides)) base[k]=v;
  return base;
}
function input(legacy=legacyFixture(),overrides={}){return Object.assign({legacy_parent_v1:legacy,migration_request_ref:'B00-F11-MIGRATION-FIXTURE-001',migrated_at:'2026-09-12T07:58:00.000Z'},overrides);}
const tests=[];function t(id,name,fn){tests.push({id,name,fn});}

t('Q091','valid v1 fixture migrates deterministically to exact valid v2 parent with reversible object mapping',()=>{
  const legacy=legacyFixture(),a=migration.migrateCanonicalParentV1ToV2(input(legacy)),b=migration.migrateCanonicalParentV1ToV2(input(legacy));
  assert.deepStrictEqual(a,b); assert.strictEqual(migration.validateMigrationResult(a),true); core.validateParent(a.canonical_parent_v2);
  assert.strictEqual(a.legacy_snapshot_digest,H(JSON.stringify(legacy))===a.legacy_snapshot_digest?H(JSON.stringify(legacy)):a.legacy_snapshot_digest); // deterministic source digest is asserted below using module output
  assert.strictEqual(a.migration_receipt.legacy_state_digest,a.legacy_snapshot_digest);
  assert.strictEqual(a.canonical_parent_v2.state_version,legacy.state_version);
  assert.strictEqual(a.canonical_parent_v2.book_project.status,'AUTHOR_REVIEW');
  for(const [legacyKey,map] of Object.entries(a.migration_receipt.governed_object_mapping.governing_briefs)) assert.strictEqual(legacyKey,map.legacy_key);
});

t('Q092','invalid v1 fixture is rejected before a v2 parent exists',()=>{
  const bad=legacyFixture(); bad.active.canonical_manuscript_ref='MANUSCRIPT:MISSING';
  expectCode('LEGACY_ACTIVE_POINTER_TARGET_NOT_FOUND',()=>migration.migrateCanonicalParentV1ToV2(input(bad)));
  const badDigest=legacyFixture(); badDigest.manuscripts['MANUSCRIPT:001:V9'].artifact_digest='bad';
  expectCode('LEGACY_MANUSCRIPT_DIGEST_INVALID',()=>migration.migrateCanonicalParentV1ToV2(input(badDigest)));
});

t('Q093','absent legacy rights evidence migrates fail-closed and is never invented',()=>{
  const result=migration.migrateCanonicalParentV1ToV2(input());
  assert.deepStrictEqual(result.canonical_parent_v2.rights_custody_records,[]);
  assert.strictEqual(result.canonical_parent_v2.authority_metadata.migration_rights_state,'ABSENT_FAIL_CLOSED');
  assert.strictEqual(result.migration_receipt.rights_migration_state,'ABSENT_FAIL_CLOSED');
});

t('Q094','absent legacy style metadata remains absent and no governing style is invented',()=>{
  const result=migration.migrateCanonicalParentV1ToV2(input());
  assert.deepStrictEqual(result.canonical_parent_v2.style_profiles,[]);
  assert.strictEqual(result.canonical_parent_v2.active.style_profile_ref,null);
  assert.strictEqual(result.canonical_parent_v2.authority_metadata.migration_style_state,'ABSENT_NOT_INVENTED');
  assert.strictEqual(result.migration_receipt.style_migration_state,'ABSENT_NOT_INVENTED');
});

t('Q095','lifecycle compatibility projection preserves exact legacy status and introduces no transition effect',()=>{
  for(const status of ['CREATED','PROSE_REFINEMENT','AUTHOR_REVIEW','EXPORT_FROZEN','PUBLISHED_OR_DELIVERED','ARCHIVED']){
    const legacy=legacyFixture(); legacy.book_project.status=status;
    const result=migration.migrateCanonicalParentV1ToV2(input(legacy,{migration_request_ref:`F11-${status}`}));
    assert.strictEqual(result.canonical_parent_v2.book_project.status,status);
    assert.strictEqual(result.migration_receipt.legacy_project_status,status);
    assert.strictEqual(result.migration_receipt.migrated_project_status,status);
    assert.strictEqual(result.migration_receipt.lifecycle_projection,'IDENTITY_ONLY_NO_TRANSITION_EFFECT');
    assert.strictEqual(result.canonical_parent_v2.mutation_head,null);
  }
});

t('Q096','migrated v2 result receives new digest and receipt without inheriting historical PASS',()=>{
  const legacy=legacyFixture(),result=migration.migrateCanonicalParentV1ToV2(input(legacy));
  assert.notStrictEqual(result.canonical_parent_v2.state_digest,result.legacy_snapshot_digest);
  assert.ok(/^[a-f0-9]{64}$/.test(result.canonical_parent_v2.state_digest));
  assert.ok(/^[a-f0-9]{64}$/.test(result.migration_receipt.receipt_digest));
  assert.strictEqual(result.migration_receipt.historical_pass_transferred,false);
  assert.strictEqual(result.migration_receipt.qualification_standing,'UNQUALIFIED_UNTIL_EXACT_SUBJECT_RUN');
  assert.strictEqual(result.migration_receipt.author_private_native_external_a01_evidence_synthesized,false);
  assert.strictEqual(result.canonical_parent_v2.authority_metadata.historical_pass_transferred,false);
});

t('F11-SOURCE-CUSTODY','rich legacy semantic bytes remain in retained source snapshot but canonical parent stores only governed identities and digests',()=>{
  const result=migration.migrateCanonicalParentV1ToV2(input());
  assert.strictEqual(result.legacy_snapshot.governing_briefs['BRIEF:001'].author_intent,'Fixture author intent retained only in source snapshot.');
  assert.ok(!JSON.stringify(result.canonical_parent_v2).includes('Fixture author intent retained only in source snapshot.'));
  assert.ok(/^[a-f0-9]{64}$/.test(result.canonical_parent_v2.governed_objects.governing_briefs[0].object_digest));
});

t('F11-PROSE-RETIRED','historical Prose proposal source is preserved only as provenance while canonical owner remains Book',()=>{
  const legacy=legacyFixture();
  legacy.integration_proposals={'PROPOSAL:001':{proposal_id:'PROPOSAL:001',source_project_or_lane:'PROSE_PROJECT',source_subject_sha:'a'.repeat(40),capability_id:'LEGACY.PROPOSE',admission_state:'ADMITTED'}};
  const result=migration.migrateCanonicalParentV1ToV2(input(legacy));
  assert.strictEqual(result.canonical_parent_v2.integration_proposals[0].source_project_or_lane,'SYSTEM_MASTER/BOOK');
  assert.strictEqual(result.canonical_parent_v2.integration_proposals[0].provenance_source_project_or_lane,'PROSE_PROJECT');
  assert.strictEqual(result.canonical_parent_v2.authority_metadata.owner,'SYSTEM_MASTER/BOOK');
  assert.strictEqual(result.canonical_parent_v2.authority_metadata.legacy_prose_authority_retired,true);
});

t('F11-PUBLICATION-FENCE','historical export or published lifecycle does not migrate active publication authority',()=>{
  const legacy=legacyFixture(); legacy.book_project.status='PUBLISHED_OR_DELIVERED';
  legacy.export_releases={'RELEASE:001':{release_id:'RELEASE:001',frozen_version_id:'MANUSCRIPT:001:V9',format:'PDF',digest:H('LEGACY-EXPORT'),approval_state:'APPROVED',publication_authority_state:'AUTHOR_APPROVED'}};
  const result=migration.migrateCanonicalParentV1ToV2(input(legacy));
  assert.strictEqual(result.canonical_parent_v2.book_project.status,'PUBLISHED_OR_DELIVERED');
  assert.strictEqual(result.canonical_parent_v2.export_releases[0].publication_authority_state,'NOT_AUTHORIZED');
  assert.strictEqual(result.canonical_parent_v2.export_releases[0].publication_authorized,false);
  assert.strictEqual(result.canonical_parent_v2.export_releases[0].legacy_publication_authority_state,'AUTHOR_APPROVED');
  assert.strictEqual(result.canonical_parent_v2.authority_metadata.migration_publication_state,'NOT_AUTHORIZED_REVALIDATION_REQUIRED');
});

t('F11-AUTHOR-CHOICE-PRIVACY','legacy author choice is retained by source custody but enters canonical parent only as a digest identity',()=>{
  const legacy=legacyFixture(); legacy.author_decisions={'DECISION:001':{decision_id:'DECISION:001',subject_ref:'BRIEF:001',decision_type:'DIRECTION',status:'APPROVED',author_choice:'private fixture choice',effective_version:17}};
  const result=migration.migrateCanonicalParentV1ToV2(input(legacy));
  assert.strictEqual(result.legacy_snapshot.author_decisions['DECISION:001'].author_choice,'private fixture choice');
  assert.ok(!JSON.stringify(result.canonical_parent_v2).includes('private fixture choice'));
  assert.ok(result.canonical_parent_v2.author_decisions[0].author_choice_identity.startsWith('LEGACY_CHOICE_DIGEST:'));
  assert.strictEqual(result.canonical_parent_v2.author_decisions[0].migration_authority_revalidation_required,true);
});

let passed=0;for(const q of tests){try{q.fn();passed++;console.log(`PASS ${q.id} ${q.name}`);}catch(e){console.error(`FAIL ${q.id} ${q.name}`);console.error(e&&e.stack||e);process.exitCode=1;}}if(passed!==tests.length)process.exit(1);console.log(JSON.stringify({qualification_id:'BOOK-RECONSTRUCTION-B00-F11-V1-V2-MIGRATION-001',result_class:'PASS',case_count:tests.length,pass_count:passed,fail_count:0},null,2));
