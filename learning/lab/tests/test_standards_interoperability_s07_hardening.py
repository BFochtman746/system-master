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



class TestStandardsInteroperabilityS07Hardening(unittest.TestCase):
    def test_t49_clr_verification_separate(self):
        r=imported(STANDARD_CLR,cryptographically_verified=True,source_trust="verified-issuer"); self.assertTrue(r["cryptographically_verified"]); self.assertEqual(r["owner_admission"],"SOURCE_ONLY")

    def test_t50_clr_identity_separate(self):
        r=imported(STANDARD_CLR,cryptographically_verified=True,identity_link_authorized=False); self.assertEqual(r["canonical_identity_effect"],"NONE")

    def test_t51_clr_not_mastery(self):
        r=imported(STANDARD_CLR,cryptographically_verified=True); self.assertEqual(r["mastery_effect"],"NONE")

    def test_t52_clr_not_retention_transfer(self):
        r=imported(STANDARD_CLR); self.assertEqual(r["retention_effect"],"NONE"); self.assertEqual(r["transfer_effect"],"NONE")

    def test_t53_clr_not_equivalence(self):
        r=imported(STANDARD_CLR); self.assertEqual(r["competency_equivalence_effect"],"NONE")

    def test_t54_clr_export_no_certification_broadening(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"CLAIM_BROADENING_FORBIDDEN"): export_external(source_state=source_state("ACHIEVEMENT"),target_standard="CLR",target_version="2.0",authorized=True,consent=True,rights_certain=True,purpose="share",minimum_necessary=True,mapping=exact_mapping(),requested_claims=["CERTIFICATION"])

    def test_t55_clr_issuer_authority_not_duplicated(self):
        r=imported(STANDARD_CLR); self.assertFalse(r["issuer_authority_duplicated"])

    def test_t56_clr_revocation_preserves_history(self):
        l=ImportLedger(); e=envelope(STANDARD_CLR); l.apply(operation_id="a",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); x=l.revoke_external(e,reason="issuer revocation"); self.assertFalse(x["historical_evidence_erased"])

    def test_t57_import_source_provenance_first(self):
        r=imported(); self.assertIn("payload_digest",r); self.assertIn("provenance",r)

    def test_t58_import_schema_validation(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"SCHEMA_VALIDATION_FAILED"): imported(schema_valid=False)

    def test_t59_import_privacy_authorization(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"IMPORT_AUTHORIZATION_REQUIRED"): imported(authorized=False)

    def test_t60_import_mapping_lossiness_before_admission(self):
        r=imported(mapping=mapping_decision(kind="LOSSY",omitted_fields=["x"])); self.assertTrue(r["mapping"]["lossy"])

    def test_t61_import_owner_admission_separate(self):
        r=imported(owner_admission="SOURCE_ONLY"); self.assertTrue(r["owner_admission_is_separate_from_translation"]); self.assertEqual(r["owner_admission"],"SOURCE_ONLY")

    def test_t62_import_partial_admission(self):
        r=imported(owner_admission="PARTIAL",partial_admission={"accepted":["a"],"rejected":["b"],"deferred":["c"]}); self.assertEqual(r["partial_admission"]["rejected"],["b"])

    def test_t63_import_insufficient_provenance(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"PROVENANCE_REQUIRED"): imported(provenance={})

    def test_t64_import_ambiguity_fail_closed(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"AMBIGUOUS_IMPORT_FAIL_CLOSED"): imported(ambiguous=True)

    def test_t65_export_owner_valid_source(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"OWNER_VALID_SOURCE_REQUIRED"): export_external(source_state={"owner_valid":False},target_standard="CASE",target_version="1.1",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=exact_mapping())

    def test_t66_export_consent(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"EXPORT_CONSENT_REQUIRED"): export_external(source_state=source_state(),target_standard="CASE",target_version="1.1",authorized=True,consent=False,rights_certain=True,purpose="x",minimum_necessary=True,mapping=exact_mapping())

    def test_t67_export_target_version_pinned(self):
        r=export_external(source_state=source_state(),target_standard="QTI",target_version="3.0",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=exact_mapping()); self.assertEqual(r["target_version"],"3.0")

    def test_t68_export_supported_semantics_only(self):
        r=export_external(source_state=source_state("ACHIEVEMENT"),target_standard="CLR",target_version="2.0",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=bounded_mapping(),requested_claims=["ACHIEVEMENT"]); self.assertEqual(r["requested_claims"],["ACHIEVEMENT"])

    def test_t69_export_omissions_visible(self):
        m=mapping_decision(kind="LOSSY",omitted_fields=["private_detail"]); r=export_external(source_state=source_state(),target_standard="CASE",target_version="1.1",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=m); self.assertTrue(r["lossy"]); self.assertEqual(r["omissions"],["private_detail"])

    def test_t70_export_no_invented_claims(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"UNSUPPORTED_EXPORT_CLAIM"): export_external(source_state=source_state(),target_standard="CASE",target_version="1.1",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=exact_mapping(),requested_claims=["MADE_UP"])

    def test_t71_export_provenance_versions(self):
        r=export_external(source_state=source_state(),target_standard="CASE",target_version="1.1",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=exact_mapping(),transformation_version="tx-9"); self.assertEqual(r["transformation_version"],"tx-9"); self.assertEqual(r["source_versions"]["source"],"v1")

    def test_t72_export_no_claim_broadening(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"CLAIM_BROADENING_FORBIDDEN"): export_external(source_state=source_state("ACHIEVEMENT"),target_standard="CLR",target_version="2.0",authorized=True,consent=True,rights_certain=True,purpose="x",minimum_necessary=True,mapping=exact_mapping(),requested_claims=["HIRING_ELIGIBILITY"])

    def test_t73_idempotent_same_import(self):
        l=ImportLedger(); e=envelope(); a=l.apply(operation_id="same",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); b=l.apply(operation_id="same",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); self.assertEqual(a.revision,b.revision)

    def test_t74_idempotency_conflicting_payload(self):
        l=ImportLedger(); e=envelope(); l.apply(operation_id="same",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY");
        with self.assertRaisesRegex(StandardsInteroperabilityError,"IDEMPOTENCY_PAYLOAD_CONFLICT"): l.apply(operation_id="same",envelope=e,translation=bounded_mapping(),admission="SOURCE_ONLY")

    def test_t75_replay_durable(self):
        l=ImportLedger(); e=envelope(); a=l.apply(operation_id="one",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); self.assertEqual(l.history(e)[0],a)

    def test_t76_correction_supersession_lineage(self):
        l=ImportLedger(); e=envelope(); l.apply(operation_id="one",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); c=l.correct(operation_id="two",envelope=e,translation=bounded_mapping(),admission="PROPOSED",expected_revision=1); self.assertEqual(c.supersedes,1); self.assertEqual(c.revision,2)

    def test_t77_historical_versions_auditable(self):
        l=ImportLedger(); e=envelope(); l.apply(operation_id="one",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); l.correct(operation_id="two",envelope=e,translation=bounded_mapping(),admission="PROPOSED",expected_revision=1); self.assertEqual([x.revision for x in l.history(e)],[1,2])

    def test_t78_correction_reprojection_owner(self):
        l=ImportLedger(); e=envelope(); l.apply(operation_id="one",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); x=l.revoke_external(e,reason="correction"); self.assertEqual(x["downstream_reprojection_owner"],"PROPER_SEMANTIC_OWNER")

    def test_t79_deletion_no_history_erasure(self):
        l=ImportLedger(); e=envelope(); l.apply(operation_id="one",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY"); x=l.revoke_external(e,reason="delete upstream"); self.assertFalse(x["historical_evidence_erased"]); self.assertEqual(x["history_revisions"],[1])

    def test_t80_concurrent_import_conflict(self):
        l=ImportLedger(); e=envelope(); l.apply(operation_id="one",envelope=e,translation=exact_mapping(),admission="SOURCE_ONLY");
        with self.assertRaisesRegex(StandardsInteroperabilityError,"CONCURRENT_IMPORT_REVISION_CONFLICT"): l.apply(operation_id="two",envelope=e,translation=exact_mapping(),admission="PROPOSED",expected_revision=0)

    def test_t81_public_standard_not_permission(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"EXPORT_CONSENT_REQUIRED"): export_external(source_state=source_state(),target_standard="CLR",target_version="2.0",authorized=True,consent=False,rights_certain=True,purpose="public-standard",minimum_necessary=True,mapping=exact_mapping())

    def test_t82_minimum_necessary(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"MINIMUM_NECESSARY_REQUIRED"): export_external(source_state=source_state(),target_standard="CLR",target_version="2.0",authorized=True,consent=True,rights_certain=True,purpose="share",minimum_necessary=False,mapping=exact_mapping())

    def test_t83_rights_uncertainty_blocks(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"EXPORT_RIGHTS_REQUIRED"): export_external(source_state=source_state(),target_standard="CASE",target_version="1.1",authorized=True,consent=True,rights_certain=False,purpose="share",minimum_necessary=True,mapping=exact_mapping())

    def test_t84_source_trust_unknown_explicit(self):
        r=imported(source_trust="UNKNOWN"); self.assertEqual(r["source_trust"],"UNKNOWN")

    def test_t85_identity_linkage_fail_closed(self):
        r=imported(identity_link_authorized=False); self.assertEqual(r["canonical_identity_effect"],"NONE")

    def test_t86_unknown_extensions_not_guessed(self):
        m=mapping_decision(kind="BOUNDED",constraints=["known-only"],opaque_extensions={"x-unknown":{"a":1}}); self.assertEqual(m["opaque_extensions"]["x-unknown"],{"a":1}); self.assertEqual(m["canonical_semantic_effect"],"NONE")

    def test_t87_outage_no_fabricated_success(self):
        report=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=False,translation_success=False,owner_admitted=False); self.assertEqual(report["transport"],"FAIL"); self.assertEqual(report["owner_admission"],"NOT_ADMITTED")

    def test_t88_unsupported_version_explicit(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"STANDARD_VERSION_UNSUPPORTED"): build_exchange_envelope(direction="IMPORT",standard_family="CLR",standard_version="1.0",source_namespace="n",external_object_id="x",payload={})

    def test_t89_schema_vs_adapter_conformance(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=False,transport_success=True,translation_success=True,owner_admitted=True); self.assertEqual(r["schema_conformance"],"PASS"); self.assertEqual(r["adapter_software_conformance"],"NOT_QUALIFIED")

    def test_t90_transport_vs_translation_vs_admission(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=True,translation_success=False,owner_admitted=False); self.assertEqual(r["transport"],"SUCCESS"); self.assertEqual(r["translation"],"FAIL"); self.assertEqual(r["owner_admission"],"NOT_ADMITTED")

    def test_t91_interop_not_validity_effectiveness(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=True,transport_success=True,translation_success=True,owner_admitted=True); self.assertFalse(r["assessment_validity_proven"]); self.assertFalse(r["educational_effectiveness_proven"])

    def test_t92_byte_change_requalification(self):
        r=durability_review(executable_bytes_changed=True,semantic_mapping_policy_changed=False,prior_software_pass=True); self.assertTrue(r["fresh_software_qualification_required"]); self.assertFalse(r["prior_software_pass_reusable"])

    def test_t93_mapping_policy_requalification(self):
        r=durability_review(executable_bytes_changed=False,semantic_mapping_policy_changed=True,prior_software_pass=True); self.assertTrue(r["semantic_reconciliation_required"]); self.assertFalse(r["prior_software_pass_reusable"])

    def test_t94_software_pass_not_equivalence(self):
        with self.assertRaisesRegex(StandardsInteroperabilityError,"DOWNSTREAM_CLAIM_FORBIDDEN"): claim_guard(claim="COMPETENCY_EQUIVALENCE",evidence_kind="ADAPTER_SOFTWARE_PASS")

    def test_t95_runtime_pass_requires_exact_qualification(self):
        r=durability_review(executable_bytes_changed=False,semantic_mapping_policy_changed=False,prior_software_pass=False); self.assertFalse(r["prior_software_pass_reusable"]); self.assertFalse(r["runtime_pass_is_external_authority_proof"])

    def test_t96_foundation_freeze_no_runtime_claim(self):
        r=conformance_report(schema_valid=True,adapter_software_qualified=False,transport_success=False,translation_success=False,owner_admitted=False); self.assertFalse(r["credential_acceptance_proven"]); self.assertFalse(r["certification_proven"]); self.assertFalse(r["eligibility_proven"])


if __name__ == "__main__":
    unittest.main()
