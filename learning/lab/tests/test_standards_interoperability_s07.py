from __future__ import annotations

import unittest

from learning_lab.standards_interoperability import (
    STANDARD_CALIPER,
    STANDARD_CASE,
    STANDARD_CLR,
    STANDARD_QTI,
    ImportLedger,
    StandardsInteroperabilityError,
    build_exchange_envelope,
    claim_guard,
    conformance_report,
    durability_review,
    export_external,
    import_external,
    mapping_decision,
    migrate_envelope,
    validate_sensitive_linkage,
)


VERSIONS = {STANDARD_CASE: "1.1", STANDARD_QTI: "3.0", STANDARD_CALIPER: "1.2", STANDARD_CLR: "2.0"}


def envelope(family=STANDARD_CASE, *, direction="IMPORT", object_id="obj-1", namespace="ns-a", revision="r1", profile=None, payload=None):
    return build_exchange_envelope(
        direction=direction,
        standard_family=family,
        standard_version=VERSIONS[family],
        source_namespace=namespace,
        external_object_id=object_id,
        source_revision=revision,
        profile=profile,
        payload=payload or {"value": 1},
    )


def exact_mapping():
    return mapping_decision(kind="EXACT", round_trip_fields=["value"])


def bounded_mapping():
    return mapping_decision(kind="BOUNDED", constraints=["context-bound"], round_trip_fields=["value"])


def provenance():
    return {"source": "external-test-fixture", "captured_at": "2026-09-15T00:00:00Z"}


def imported(family=STANDARD_CASE, **kwargs):
    base = dict(
        envelope=envelope(family),
        schema_valid=True,
        authorized=True,
        rights_certain=True,
        provenance=provenance(),
        mapping=exact_mapping(),
    )
    base.update(kwargs)
    return import_external(**base)


def source_state(*claims):
    return {"owner_valid": True, "supported_claims": list(claims), "versions": {"source": "v1"}}



class TestStandardsInteroperabilityS07(unittest.TestCase):
    def test_t01_authority_translation_only(self):
        r=imported(); self.assertEqual(r["mastery_effect"], "NONE"); self.assertEqual(r["canonical_curriculum_effect"], "NONE")

    def test_t02_case_no_mastery_writer(self):
        r=imported(STANDARD_CASE, owner_admission="ADMITTED"); self.assertEqual(r["mastery_effect"], "NONE")

    def test_t03_qti_no_validity_writer(self):
        r=imported(STANDARD_QTI, owner_admission="ADMITTED"); self.assertEqual(r["assessment_attempt_effect"], "NONE"); self.assertEqual(r["mastery_effect"], "NONE")

    def test_t04_caliper_no_mastery_writer(self):
        r=imported(STANDARD_CALIPER); self.assertEqual(r["learning_evidence_effect"], "NONE"); self.assertEqual(r["retention_effect"], "NONE")

    def test_t05_clr_no_eligibility_writer(self):
        r=imported(STANDARD_CLR, cryptographically_verified=True); self.assertEqual(r["certification_effect"], "NONE"); self.assertEqual(r["job_eligibility_effect"], "NONE")

    def test_t06_external_id_no_identity_writer(self):
        r=imported(identity_link_authorized=False); self.assertEqual(r["canonical_identity_effect"], "NONE")

    def test_t07_no_second_semantic_writer(self):
        r=imported(STANDARD_CLR); self.assertEqual(r["credential_acceptance_effect"], "NONE"); self.assertEqual(r["assessment_attempt_effect"], "NONE")

    def test_t08_runtime_not_semantic_authority(self):
        r=imported(); self.assertTrue(r["owner_admission_is_separate_from_translation"])

    def test_t09_bind_standard_version(self):
        e=envelope(STANDARD_QTI); self.assertEqual((e["standard_family"],e["standard_version"]),("QTI","3.0"))

    def test_t10_preserve_profile(self):
        e=envelope(STANDARD_CALIPER, profile="metric-profile-a"); self.assertEqual(e["profile"],"metric-profile-a")

    def test_t11_preserve_namespace(self):
        e=envelope(namespace="issuer-a", object_id="42"); self.assertEqual(e["external_identity"],"issuer-a:42")

    def test_t12_namespace_collision_not_merged(self):
        a=envelope(namespace="a",object_id="42"); b=envelope(namespace="b",object_id="42"); self.assertNotEqual(a["external_identity"],b["external_identity"])

    def test_t13_preserve_revision(self):
        e=envelope(revision="rev-7"); self.assertEqual(e["source_revision"],"rev-7")

    def test_t14_historical_version_pinned(self):
        e=envelope(); self.assertEqual(e["standard_version"],"1.1"); self.assertIn("payload_digest",e)

    def test_t15_migration_version_provenance(self):
        m=migrate_envelope(envelope(STANDARD_CASE),to_version="1.1.0",transformation_version="tx-1",provenance=provenance()); self.assertEqual(m["transformation_version"],"tx-1"); self.assertFalse(m["historical_payload_reinterpreted"])

    def test_t16_missing_or_unsupported_version_fails(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"STANDARD_VERSION_UNSUPPORTED"): build_exchange_envelope(direction="IMPORT",standard_family="QTI",standard_version="9.9",source_namespace="n",external_object_id="x",payload={})

    def test_t17_exact_mapping_bounded(self):
        m=mapping_decision(kind="EXACT",round_trip_fields=["x"]); self.assertEqual(m["equivalence_claim"],"EXACT_BOUNDED_ONLY"); self.assertFalse(m["lossy"])

    def test_t18_bounded_constraints_explicit(self):
        m=mapping_decision(kind="BOUNDED",constraints=["only-profile-a"]); self.assertEqual(m["constraints"],["only-profile-a"])

    def test_t19_lossy_labeled(self):
        m=mapping_decision(kind="LOSSY",omitted_fields=["x"]); self.assertTrue(m["lossy"]); self.assertEqual(m["equivalence_claim"],"NOT_CLAIMED")

    def test_t20_proposed_non_authoritative(self):
        m=mapping_decision(kind="PROPOSED"); self.assertFalse(m["authoritative"])

    def test_t21_unmapped_preserved(self):
        m=mapping_decision(kind="UNMAPPED"); self.assertTrue(m["unmapped"])

    def test_t22_mapping_conflict_visible(self):
        m=mapping_decision(kind="CONFLICT",conflict_candidates=[{"id":"a"},{"id":"b"}]); self.assertEqual(len(m["conflict_candidates"]),2); self.assertFalse(m["authoritative"])

    def test_t23_roundtrip_fields_explicit(self):
        m=mapping_decision(kind="EXACT",round_trip_fields=["a","b"]); self.assertEqual(m["round_trip_fields"],["a","b"])

    def test_t24_opaque_extension_not_canonical(self):
        m=mapping_decision(kind="BOUNDED",constraints=["c"],opaque_extensions={"vendor":"opaque"}); self.assertEqual(m["opaque_extensions"]["vendor"],"opaque"); self.assertEqual(m["canonical_semantic_effect"],"NONE")

    def test_t25_case_source_until_admitted(self):
        r=imported(STANDARD_CASE); self.assertEqual(r["framework_material_standing"],"EXTERNAL_SOURCE_OR_PROPOSED")

    def test_t26_case_id_not_skill_id(self):
        r=imported(STANDARD_CASE); self.assertEqual(r["competency_equivalence_effect"],"NONE")

    def test_t27_case_association_not_prereq(self):
        r=imported(STANDARD_CASE); self.assertEqual(r["prerequisite_truth_effect"],"NONE")

    def test_t28_case_alignment_not_equivalence(self):
        r=imported(STANDARD_CASE); self.assertEqual(r["competency_equivalence_effect"],"NONE")

    def test_t29_unresolved_cross_domain_equivalence(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"MAPPING_CONFLICT_UNRESOLVED"): imported(STANDARD_CASE,mapping=mapping_decision(kind="CONFLICT",conflict_candidates=[{"id":"LRN-069"},{"id":"LRN-EXT-002"}]))

    def test_t30_case_rubric_no_overwrite(self):
        r=imported(STANDARD_CASE,owner_admission="SOURCE_ONLY"); self.assertEqual(r["canonical_curriculum_effect"],"NONE")

    def test_t31_case_provenance_preserved(self):
        r=imported(STANDARD_CASE); self.assertEqual(r["provenance"]["source"],"external-test-fixture"); self.assertEqual(r["standard_version"],"1.1")

    def test_t32_case_conformance_not_approval(self):
        r=imported(STANDARD_CASE); self.assertEqual(r["owner_admission"],"SOURCE_ONLY")

    def test_t33_qti_source_until_admitted(self):
        r=imported(STANDARD_QTI); self.assertEqual(r["assessment_material_standing"],"EXTERNAL_SOURCE_OR_PROPOSED")

    def test_t34_qti_schema_not_construct_validity(self):
        r=imported(STANDARD_QTI); self.assertEqual(r["mastery_effect"],"NONE")

    def test_t35_qti_scoring_no_rubric_bypass(self):
        r=imported(STANDARD_QTI); self.assertEqual(r["canonical_curriculum_effect"],"NONE")

    def test_t36_qti_result_no_attempt_writer(self):
        r=imported(STANDARD_QTI); self.assertEqual(r["assessment_attempt_effect"],"NONE")

    def test_t37_qti_score_no_learning_truth(self):
        r=imported(STANDARD_QTI); self.assertEqual(r["mastery_effect"],"NONE"); self.assertEqual(r["retention_effect"],"NONE"); self.assertEqual(r["transfer_effect"],"NONE")

    def test_t38_qti_async_score_ingress_closed(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"EXTERNAL_SCORE_COMMIT_INGRESS_UNRESOLVED"): imported(STANDARD_QTI,external_score_commit=True)

    def test_t39_qti_definition_lineage(self):
        e=envelope(STANDARD_QTI,revision="assessment-v3"); r=import_external(envelope=e,schema_valid=True,authorized=True,rights_certain=True,provenance=provenance(),mapping=exact_mapping()); self.assertEqual(r["source_revision"],"assessment-v3")

    def test_t40_qti_edit_no_historical_reinterpretation(self):
        a=envelope(STANDARD_QTI,revision="v1"); b=envelope(STANDARD_QTI,revision="v2"); self.assertNotEqual(a["exchange_digest"],b["exchange_digest"])

    def test_t41_caliper_observation_only(self):
        r=imported(STANDARD_CALIPER); self.assertTrue(r["event_observation_only"]); self.assertEqual(r["mastery_effect"],"NONE")

    def test_t42_caliper_not_learning_evidence(self):
        r=imported(STANDARD_CALIPER); self.assertEqual(r["learning_evidence_effect"],"NONE")

    def test_t43_activity_not_competence(self):
        r=imported(STANDARD_CALIPER); self.assertEqual(r["competence_effect"],"NONE"); self.assertEqual(r["learning_gain_effect"],"NONE")

    def test_t44_telemetry_not_mental_state(self):
        r=imported(STANDARD_CALIPER); self.assertFalse(r["mental_state_inference"])

    def test_t45_caliper_actor_external(self):
        r=imported(STANDARD_CALIPER,identity_link_authorized=False); self.assertEqual(r["canonical_identity_effect"],"NONE")

    def test_t46_caliper_profile_preserved(self):
        e=envelope(STANDARD_CALIPER,profile="caliper-metric-v1"); self.assertEqual(e["profile"],"caliper-metric-v1")

    def test_t47_caliper_retry_idempotent(self):
        l=ImportLedger(); e=envelope(STANDARD_CALIPER); a=l.apply(operation_id="op",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); b=l.apply(operation_id="op",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); self.assertEqual(a,b)

    def test_t48_caliper_unsupported_profile(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"PROFILE_VALIDATION_FAILED"): imported(STANDARD_CALIPER,envelope=envelope(STANDARD_CALIPER,profile="unknown"),profile_valid=False)


if __name__ == "__main__":
    unittest.main()
