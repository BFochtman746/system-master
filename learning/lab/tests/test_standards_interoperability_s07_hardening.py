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
    validate_sensitive_linkage,
)

VERSIONS = {STANDARD_CASE: "1.1", STANDARD_QTI: "3.0", STANDARD_CALIPER: "1.2", STANDARD_CLR: "2.0"}

def envelope(family=STANDARD_CLR, *, direction="IMPORT", object_id="obj-1", namespace="issuer-a", revision="r1", profile=None, payload=None, extensions=None):
    return build_exchange_envelope(
        direction=direction,
        standard_family=family,
        standard_version=VERSIONS[family],
        source_namespace=namespace,
        external_object_id=object_id,
        source_revision=revision,
        profile=profile,
        payload=payload or {"value": 1},
        extensions=extensions,
    )

def exact_mapping():
    return mapping_decision(kind="EXACT", round_trip_fields=["value"])

def lossy_mapping():
    return mapping_decision(kind="LOSSY", omitted_fields=["private_note"], round_trip_fields=["value"])

def provenance():
    return {"source": "external-test-fixture", "captured_at": "2026-09-15T00:00:00Z"}

def imported(family=STANDARD_CLR, **kwargs):
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
    return {"owner_valid": True, "supported_claims": list(claims), "versions": {"source": "v1", "curriculum": "c7"}}

def exported(*, claims=(), mapping=None, **kwargs):
    base = dict(
        source_state=source_state(*claims),
        target_standard=STANDARD_CLR,
        target_version="2.0",
        authorized=True,
        consent=True,
        rights_certain=True,
        purpose="learner-requested portability",
        minimum_necessary=True,
        mapping=mapping or exact_mapping(),
        requested_claims=list(claims),
        transformation_version="tx-1",
    )
    base.update(kwargs)
    return export_external(**base)


class TestStandardsInteroperabilityS07Hardening(unittest.TestCase):
    def test_t49_clr_verification_separate_from_semantic_acceptance(self):
        r=imported(cryptographically_verified=True, source_trust="verified_issuer"); self.assertTrue(r["cryptographically_verified"]); self.assertFalse(r["verification_is_semantic_acceptance"])

    def test_t50_clr_verification_not_identity_authority(self):
        r=imported(cryptographically_verified=True, identity_link_authorized=False); self.assertEqual(r["canonical_identity_effect"], "NONE")

    def test_t51_clr_achievement_not_mastery(self):
        self.assertEqual(imported(cryptographically_verified=True)["mastery_effect"], "NONE")

    def test_t52_clr_achievement_not_retention_or_transfer(self):
        r=imported(cryptographically_verified=True); self.assertEqual(r["retention_effect"], "NONE"); self.assertEqual(r["transfer_effect"], "NONE")

    def test_t53_clr_alignment_not_equivalence(self):
        self.assertEqual(imported()["competency_equivalence_effect"], "NONE")

    def test_t54_clr_export_cannot_broaden_claim(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "CLAIM_BROADENING_FORBIDDEN"):
            exported(claims=(), requested_claims=["CERTIFICATION"])

    def test_t55_issuer_authority_not_duplicated(self):
        self.assertFalse(imported(cryptographically_verified=True)["issuer_authority_duplicated"])

    def test_t56_revocation_preserves_history_and_routes_owner(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="i1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY")
        r=l.revoke_external(e, reason="issuer revoked"); self.assertFalse(r["historical_evidence_erased"]); self.assertEqual(r["downstream_reprojection_owner"], "PROPER_SEMANTIC_OWNER")

    def test_t57_import_preserves_source_provenance(self):
        r=imported(); self.assertEqual(r["provenance"], provenance()); self.assertTrue(r["payload_digest"])

    def test_t58_import_schema_validation_required(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "SCHEMA_VALIDATION_FAILED"):
            imported(schema_valid=False)

    def test_t59_import_authorization_and_rights_required(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "IMPORT_AUTHORIZATION_REQUIRED"): imported(authorized=False)
        with self.assertRaisesRegex(StandardsInteroperabilityError, "IMPORT_RIGHTS_REQUIRED"): imported(rights_certain=False)

    def test_t60_translation_records_lossiness_before_admission(self):
        r=imported(mapping=lossy_mapping(), owner_admission="PARTIAL"); self.assertTrue(r["mapping"]["lossy"]); self.assertEqual(r["owner_admission"], "PARTIAL")

    def test_t61_owner_admission_separate_from_translation(self):
        r=imported(owner_admission="SOURCE_ONLY"); self.assertTrue(r["owner_admission_is_separate_from_translation"]); self.assertEqual(r["owner_admission"], "SOURCE_ONLY")

    def test_t62_partial_admission_records_disposition(self):
        r=imported(owner_admission="PARTIAL", partial_admission={"accepted":["a"],"rejected":["b"],"deferred":["c"]}); self.assertEqual(r["partial_admission"]["accepted"],["a"]); self.assertEqual(r["partial_admission"]["rejected"],["b"])

    def test_t63_insufficient_provenance_blocks_canonical_admission(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "PROVENANCE_REQUIRED"):
            imported(provenance={})

    def test_t64_ambiguous_import_fails_closed(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "AMBIGUOUS_IMPORT_FAIL_CLOSED"):
            imported(ambiguous=True)

    def test_t65_export_requires_owner_valid_source(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "OWNER_VALID_SOURCE_REQUIRED"):
            exported(source_state={"owner_valid":False,"supported_claims":[]})

    def test_t66_export_authorization_consent_and_rights_required(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "EXPORT_AUTHORIZATION_REQUIRED"): exported(authorized=False)
        with self.assertRaisesRegex(StandardsInteroperabilityError, "EXPORT_CONSENT_REQUIRED"): exported(consent=False)
        with self.assertRaisesRegex(StandardsInteroperabilityError, "EXPORT_RIGHTS_REQUIRED"): exported(rights_certain=False)

    def test_t67_export_pins_target_standard_profile_version(self):
        r=exported(target_profile="clr-profile-a"); self.assertEqual((r["target_standard"],r["target_version"],r["target_profile"]),("CLR","2.0","clr-profile-a"))

    def test_t68_export_requires_resolved_mapping(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "EXPORT_MAPPING_UNRESOLVED"):
            exported(mapping=mapping_decision(kind="UNMAPPED"))

    def test_t69_export_exposes_omissions_and_lossiness(self):
        r=exported(mapping=lossy_mapping()); self.assertTrue(r["lossy"]); self.assertEqual(r["omissions"],["private_note"])

    def test_t70_export_cannot_invent_missing_claim(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "UNSUPPORTED_EXPORT_CLAIM"):
            exported(claims=(), requested_claims=["PORTABLE_NOTE"])

    def test_t71_export_records_source_and_transformation_versions(self):
        r=exported(); self.assertEqual(r["source_versions"]["source"],"v1"); self.assertEqual(r["transformation_version"],"tx-1")

    def test_t72_bounded_claim_cannot_upgrade_to_eligibility(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError, "CLAIM_BROADENING_FORBIDDEN"):
            exported(claims=(), requested_claims=["JOB_ELIGIBILITY"])

    def test_t73_repeated_import_is_idempotent(self):
        e=envelope(); m=exact_mapping(); l=ImportLedger()
        a=l.apply(operation_id="op-1", envelope=e, translation=m, admission="SOURCE_ONLY"); b=l.apply(operation_id="op-1", envelope=e, translation=m, admission="SOURCE_ONLY")
        self.assertEqual(a,b); self.assertEqual(len(l.history(e)),1)

    def test_t74_same_operation_changed_payload_conflicts(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="op-1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY")
        with self.assertRaisesRegex(StandardsInteroperabilityError, "IDEMPOTENCY_PAYLOAD_CONFLICT"):
            l.apply(operation_id="op-1", envelope=e, translation=lossy_mapping(), admission="PARTIAL")

    def test_t75_replay_reconstructs_same_fingerprint(self):
        e=envelope(); m=exact_mapping(); a=ImportLedger().apply(operation_id="op-a", envelope=e, translation=m, admission="SOURCE_ONLY"); b=ImportLedger().apply(operation_id="op-b", envelope=e, translation=m, admission="SOURCE_ONLY")
        self.assertEqual(a.fingerprint,b.fingerprint); self.assertEqual(a.standing,b.standing)

    def test_t76_correction_creates_supersession_lineage(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="op-1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY")
        c=l.correct(operation_id="op-2", envelope=e, translation=lossy_mapping(), admission="PARTIAL", expected_revision=1); self.assertEqual((c.revision,c.supersedes),(2,1))

    def test_t77_historical_versions_remain_auditable(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="op-1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY"); l.correct(operation_id="op-2", envelope=e, translation=lossy_mapping(), admission="PARTIAL", expected_revision=1)
        self.assertEqual([x.revision for x in l.history(e)],[1,2])

    def test_t78_correction_reprojection_routes_through_owner(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="op-1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY"); l.correct(operation_id="op-2", envelope=e, translation=lossy_mapping(), admission="PARTIAL", expected_revision=1)
        self.assertEqual(l.revoke_external(e,reason="corrected")["downstream_reprojection_owner"],"PROPER_SEMANTIC_OWNER")

    def test_t79_external_revocation_does_not_erase_history(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="op-1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY")
        r=l.revoke_external(e,reason="deleted upstream"); self.assertFalse(r["historical_evidence_erased"]); self.assertEqual(r["history_revisions"],[1])

    def test_t80_concurrent_import_stale_revision_conflicts(self):
        e=envelope(); l=ImportLedger(); l.apply(operation_id="op-1", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY", expected_revision=0)
        with self.assertRaisesRegex(StandardsInteroperabilityError,"CONCURRENT_IMPORT_REVISION_CONFLICT"):
            l.apply(operation_id="op-2", envelope=e, translation=exact_mapping(), admission="SOURCE_ONLY", expected_revision=0)

    def test_t81_public_standard_not_disclosure_permission(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"EXPORT_AUTHORIZATION_REQUIRED"):
            exported(authorized=False)

    def test_t82_minimum_necessary_required(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"MINIMUM_NECESSARY_REQUIRED"):
            exported(minimum_necessary=False)

    def test_t83_rights_uncertainty_blocks_export(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"EXPORT_RIGHTS_REQUIRED"):
            exported(rights_certain=False)

    def test_t84_missing_source_trust_remains_explicit(self):
        self.assertEqual(imported(source_trust="UNKNOWN")["source_trust"],"UNKNOWN")

    def test_t85_unapproved_external_identity_linkage_fails_closed(self):
        r=imported(identity_link_authorized=False); self.assertFalse(r["identity_link_authorized"]); self.assertEqual(r["canonical_identity_effect"],"NONE")

    def test_t86_unknown_extensions_remain_opaque(self):
        e=envelope(extensions={"vendor-x":{"mystery":7}}); self.assertEqual(e["opaque_extensions"]["vendor-x"]["mystery"],7); self.assertEqual(e["canonical_learning_effect"],"NONE")

    def test_t87_transport_failure_cannot_fabricate_success(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=False,translation_success=False,owner_admitted=False); self.assertEqual(r["transport"],"FAIL"); self.assertEqual(r["translation"],"FAIL"); self.assertEqual(r["owner_admission"],"NOT_ADMITTED")

    def test_t88_unsupported_standard_version_is_explicit(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"STANDARD_VERSION_UNSUPPORTED"):
            build_exchange_envelope(direction="IMPORT",standard_family="CLR",standard_version="9.9",source_namespace="n",external_object_id="x",payload={})

    def test_t89_payload_and_adapter_conformance_separate(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=False,transport_success=True,translation_success=True,owner_admitted=True); self.assertEqual(r["schema_conformance"],"PASS"); self.assertEqual(r["adapter_software_conformance"],"NOT_QUALIFIED")

    def test_t90_transport_translation_admission_separate(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=True,translation_success=False,owner_admitted=False); self.assertEqual(r["transport"],"SUCCESS"); self.assertEqual(r["translation"],"FAIL"); self.assertEqual(r["owner_admission"],"NOT_ADMITTED")

    def test_t91_interoperability_not_validity_or_effectiveness(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=True,translation_success=True,owner_admitted=True); self.assertFalse(r["assessment_validity_proven"]); self.assertFalse(r["mastery_validity_proven"]); self.assertFalse(r["educational_effectiveness_proven"])

    def test_t92_changed_executable_bytes_require_fresh_qualification(self):
        r=durability_review(executable_bytes_changed=True,semantic_mapping_policy_changed=False,prior_software_pass=True); self.assertTrue(r["fresh_software_qualification_required"]); self.assertFalse(r["prior_software_pass_reusable"])

    def test_t93_changed_mapping_policy_requires_requalification(self):
        r=durability_review(executable_bytes_changed=False,semantic_mapping_policy_changed=True,prior_software_pass=True); self.assertTrue(r["fresh_software_qualification_required"]); self.assertTrue(r["semantic_reconciliation_required"])

    def test_t94_software_pass_not_external_authority_proof(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=True,translation_success=True,owner_admitted=True); self.assertFalse(r["competency_equivalence_proven"]); self.assertFalse(r["credential_acceptance_proven"]); self.assertFalse(r["certification_proven"]); self.assertFalse(r["eligibility_proven"])

    def test_t95_adapter_software_pass_cannot_prove_broad_claim(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"DOWNSTREAM_CLAIM_FORBIDDEN"):
            claim_guard(claim="COMPETENCY_EQUIVALENCE",evidence_kind="ADAPTER_SOFTWARE_PASS")

    def test_t96_foundation_freeze_is_not_runtime_conformance(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=False,transport_success=False,translation_success=False,owner_admitted=False); self.assertEqual(r["adapter_software_conformance"],"NOT_QUALIFIED"); self.assertFalse(r["certification_proven"])


if __name__ == "__main__":
    unittest.main()
