package org.systemmaster.foundation.runtimecontinuity;

import java.time.Instant;
import java.util.List;

import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateReceipt;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateStanding;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.LifecycleStanding;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.SemanticVersion;
import org.systemmaster.foundation.identity.DelegationRuntime.ActorChain;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityUseRequest;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityValidationReceipt;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.ProviderBinding;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.Request;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.Standing;

/** Supplemental adversarial cases; additive to, not a replacement for, the frozen 26-case denominator. */
public final class IdentityContractsPreflightReceiptBindingHardeningTest {
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final Instant NOW = Instant.parse("2026-09-12T12:00:00Z");
    private static final SemanticVersion V1 = new SemanticVersion(1, 0, 0);
    private static final ProviderBinding BINDING = new ProviderBinding(
            "ref:system-root/identity", "identity-v1", "ref:system-root/contracts", "contracts-v1");
    private static int cases;

    private IdentityContractsPreflightReceiptBindingHardeningTest() {}

    public static void main(String[] args) {
        identityWrongGrantFailsClosed();
        identityWrongActorOrTimeFailsClosed();
        contractWrongSubjectFailsClosed();
        contractWrongVersionOrDigestFailsClosed();
        if (cases != 4) throw new AssertionError("hardening denominator mismatch: " + cases);
        System.out.println("PASS CORE_DURABLE_RUNTIME_PREFLIGHT_RECEIPT_BINDING_HARDENING cases=4");
    }

    private static void identityWrongGrantFailsClosed() {
        Request q = request("h01");
        CapabilityValidationReceipt wrong = new CapabilityValidationReceipt(
                "grant-other", q.capabilityUseRequest().grantDigest(), q.capabilityUseRequest().actorChain().chainDigest(),
                7L, q.capabilityUseRequest().now(), C);
        var r = adapter(req -> wrong, IdentityContractsPreflightReceiptBindingHardeningTest::admitted).preflight(q);
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        truth(r.reasonCodes().contains("IDENTITY_RECEIPT_BINDING_MISMATCH"));
        pass();
    }

    private static void identityWrongActorOrTimeFailsClosed() {
        Request q = request("h02");
        CapabilityValidationReceipt wrong = new CapabilityValidationReceipt(
                q.capabilityUseRequest().grantId(), q.capabilityUseRequest().grantDigest(), A,
                7L, q.capabilityUseRequest().now().plusSeconds(1), C);
        var r = adapter(req -> wrong, IdentityContractsPreflightReceiptBindingHardeningTest::admitted).preflight(q);
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        truth(r.reasonCodes().contains("IDENTITY_RECEIPT_BINDING_MISMATCH"));
        pass();
    }

    private static void contractWrongSubjectFailsClosed() {
        Request q = request("h03");
        var r = adapter(IdentityContractsPreflightReceiptBindingHardeningTest::validIdentity,
                (subject, version, digest) -> gate("contract.other", version, digest))
                .preflight(q);
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        truth(r.reasonCodes().contains("CONTRACT_GATE_BINDING_MISMATCH"));
        pass();
    }

    private static void contractWrongVersionOrDigestFailsClosed() {
        Request q = request("h04");
        var r = adapter(IdentityContractsPreflightReceiptBindingHardeningTest::validIdentity,
                (subject, version, digest) -> gate(subject, new SemanticVersion(1, 0, 1), A))
                .preflight(q);
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        truth(r.reasonCodes().contains("CONTRACT_GATE_BINDING_MISMATCH"));
        pass();
    }

    private static IdentityContractsPreflightAdapter adapter(
            IdentityContractsPreflightAdapter.IdentityValidator identity,
            IdentityContractsPreflightAdapter.ContractGateResolver contracts) {
        return new IdentityContractsPreflightAdapter(identity, contracts, () -> BINDING, BINDING);
    }

    private static Request request(String id) {
        ActorChain chain = ActorChain.create("principal-user", "principal-user", List.of());
        CapabilityUseRequest use = new CapabilityUseRequest(
                "grant-runtime", A, chain, "principal-user", "read",
                "resource:runtime", "purpose:runtime", "audience:runtime", "target:runtime", NOW);
        return new Request(id, use, "contract.runtime.command", V1, B);
    }

    private static CapabilityValidationReceipt validIdentity(CapabilityUseRequest request) {
        return new CapabilityValidationReceipt(
                request.grantId(), request.grantDigest(), request.actorChain().chainDigest(),
                7L, request.now(), C);
    }

    private static GateReceipt admitted(String subject, SemanticVersion version, String digest) {
        return gate(subject, version, digest);
    }

    private static GateReceipt gate(String subject, SemanticVersion version, String digest) {
        return new GateReceipt(subject, version, digest, version, digest, LifecycleStanding.ACTIVE,
                C, null, 9L, GateStanding.ADMITTED, List.of());
    }

    private static void pass() { cases++; }

    private static void truth(boolean value) {
        if (!value) throw new AssertionError("expected true");
    }

    private static void eq(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError("expected=" + expected + " actual=" + actual);
        }
    }
}
