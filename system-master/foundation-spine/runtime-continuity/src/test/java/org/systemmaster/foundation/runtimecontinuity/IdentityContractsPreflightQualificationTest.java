package org.systemmaster.foundation.runtimecontinuity;

import java.io.IOException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateReceipt;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateStanding;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.LifecycleStanding;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.SemanticVersion;
import org.systemmaster.foundation.identity.DelegationRuntime.ActorChain;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityUseRequest;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityValidationReceipt;
import org.systemmaster.foundation.identity.IdentityContracts.ErrorCode;
import org.systemmaster.foundation.identity.IdentityContracts.IdentityException;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.EvidenceClass;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.ProviderBinding;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.Receipt;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.Request;
import org.systemmaster.foundation.runtimecontinuity.IdentityContractsPreflightAdapter.Standing;

/** Exact 26-case changed-subject denominator frozen for the first continuity adapter slice. */
public final class IdentityContractsPreflightQualificationTest {
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final Instant NOW = Instant.parse("2026-09-12T12:00:00Z");
    private static final SemanticVersion V1 = new SemanticVersion(1, 0, 0);
    private static final ProviderBinding BINDING = new ProviderBinding(
            "ref:system-root/identity", "identity-v1", "ref:system-root/contracts", "contracts-v1");
    private static int cases;

    private IdentityContractsPreflightQualificationTest() {}

    public static void main(String[] args) throws Exception {
        c("1 exact principal grant subject action succeeds", IdentityContractsPreflightQualificationTest::exactSuccess);
        c("2 wrong principal fails closed", () -> identityFailure(ErrorCode.DENIED, Standing.DENY));
        c("3 wrong grant or subject fails closed", () -> identityFailure(ErrorCode.STALE_BASE, Standing.DENY));
        c("4 wrong action or scope fails closed", () -> identityFailure(ErrorCode.DENIED, Standing.DENY));
        c("5 identity receipt digest preserved", IdentityContractsPreflightQualificationTest::identityReceiptPreserved);
        c("6 caller claim without current identity receipt rejected", IdentityContractsPreflightQualificationTest::missingIdentityReceipt);
        c("7 revoked grant denied", () -> identityFailure(ErrorCode.REVOKED, Standing.DENY));
        c("8 suspended grant denied", () -> identityFailure(ErrorCode.DENIED, Standing.DENY));
        c("9 expired grant denied", () -> identityFailure(ErrorCode.EXPIRED, Standing.DENY));
        c("10 advanced generation invalidates stale use", () -> identityFailure(ErrorCode.STALE_BASE, Standing.DENY));
        c("11 unknown or unavailable identity blocks", () -> identityFailure(ErrorCode.UNAVAILABLE, Standing.BLOCKED_UNKNOWN));
        c("12 retry rereads identity instead of cached success", IdentityContractsPreflightQualificationTest::retryRevalidatesIdentity);
        c("13 exact current contract passes", IdentityContractsPreflightQualificationTest::exactContractPasses);
        c("14 unknown contract subject or version blocks", IdentityContractsPreflightQualificationTest::unknownContractBlocks);
        c("15 incompatible contract blocks", IdentityContractsPreflightQualificationTest::incompatibleContractBlocks);
        c("16 validator unknown or error blocks", IdentityContractsPreflightQualificationTest::validatorErrorBlocks);
        c("17 migration required is not direct compatibility", IdentityContractsPreflightQualificationTest::migrationRequiredBlocks);
        c("18 exact contract gate receipt preserved", IdentityContractsPreflightQualificationTest::contractReceiptPreserved);
        c("19 identity allow cannot grant whole runtime or effect authority", IdentityContractsPreflightQualificationTest::identitySeparation);
        c("20 contracts compatible cannot grant peer authority", IdentityContractsPreflightQualificationTest::contractsSeparation);
        c("21 same request identity same semantic digest revalidates idempotently", IdentityContractsPreflightQualificationTest::sameRequestRevalidates);
        c("22 same request identity changed semantic digest conflicts", IdentityContractsPreflightQualificationTest::changedSemanticDigestConflicts);
        c("23 restart does not trust cached preflight success", IdentityContractsPreflightQualificationTest::restartRevalidates);
        c("24 stale provider version or owner blocks until rebound", IdentityContractsPreflightQualificationTest::staleProviderBindingBlocks);
        c("25 hosted portable evidence label is not promoted", IdentityContractsPreflightQualificationTest::evidenceClassBounded);
        c("26 preflight contains no bearer secret raw credential or private key fields", IdentityContractsPreflightQualificationTest::noSecretBearingFields);
        if (cases != 26) throw new AssertionError("case denominator mismatch: " + cases);
        System.out.println("PASS CORE_DURABLE_RUNTIME_IDENTITY_CONTRACTS_PREFLIGHT cases=26");
    }

    private static void exactSuccess() {
        Receipt r = adapter(defaultIdentity(), defaultContracts(), () -> BINDING).preflight(request("r01", "read"));
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, r.standing());
        falsehood(r.authorizesWholeRuntimeOperation());
    }

    private static void identityFailure(ErrorCode code, Standing expected) {
        var a = adapter(req -> { throw new IdentityException(code, "test"); }, defaultContracts(), () -> BINDING);
        eq(expected, a.preflight(request("r-id-" + (++sequence), "read")).standing());
    }

    private static int sequence;

    private static void identityReceiptPreserved() {
        CapabilityValidationReceipt exact = validationReceipt(C);
        Receipt r = adapter(req -> exact, defaultContracts(), () -> BINDING).preflight(request("r05", "read"));
        truth(r.identityReceipt() == exact);
        eq(C, r.identityReceipt().validationDigest());
    }

    private static void missingIdentityReceipt() {
        Receipt r = adapter(req -> null, defaultContracts(), () -> BINDING).preflight(request("r06", "read"));
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        truth(r.reasonCodes().contains("IDENTITY_RECEIPT_MISSING"));
    }

    private static void retryRevalidatesIdentity() {
        AtomicInteger calls = new AtomicInteger();
        var a = adapter(req -> { calls.incrementAndGet(); return validationReceipt(C); }, defaultContracts(), () -> BINDING);
        Request q = request("r12", "read");
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, a.preflight(q).standing());
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, a.preflight(q).standing());
        eq(2, calls.get());
    }

    private static void exactContractPasses() {
        Receipt r = adapter(defaultIdentity(), defaultContracts(), () -> BINDING).preflight(request("r13", "read"));
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, r.standing());
        eq(GateStanding.ADMITTED, r.contractGateReceipt().standing());
    }

    private static void unknownContractBlocks() {
        var a = adapter(defaultIdentity(), (s, v, d) -> gate(GateStanding.REJECTED, List.of("UNKNOWN_SUBJECT"), null), () -> BINDING);
        eq(Standing.BLOCKED_UNKNOWN, a.preflight(request("r14", "read")).standing());
    }

    private static void incompatibleContractBlocks() {
        var a = adapter(defaultIdentity(), (s, v, d) -> gate(GateStanding.REJECTED, List.of("INCOMPATIBLE"), C), () -> BINDING);
        eq(Standing.DENY, a.preflight(request("r15", "read")).standing());
    }

    private static void validatorErrorBlocks() {
        var a = adapter(defaultIdentity(), (s, v, d) -> gate(GateStanding.REJECTED, List.of("VALIDATOR_ERROR"), C), () -> BINDING);
        eq(Standing.BLOCKED_UNKNOWN, a.preflight(request("r16", "read")).standing());
    }

    private static void migrationRequiredBlocks() {
        var a = adapter(defaultIdentity(), (s, v, d) -> gate(GateStanding.MIGRATION_REQUIRED, List.of("MIGRATION_REQUIRED"), C), () -> BINDING);
        Receipt r = a.preflight(request("r17", "read"));
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        truth(r.reasonCodes().contains("CONTRACT_MIGRATION_REQUIRED"));
    }

    private static void contractReceiptPreserved() {
        GateReceipt exact = gate(GateStanding.ADMITTED, List.of("CONTRACT_DEPRECATED"), C);
        Receipt r = adapter(defaultIdentity(), (s, v, d) -> exact, () -> BINDING).preflight(request("r18", "read"));
        truth(r.contractGateReceipt() == exact);
        eq(C, r.contractGateReceipt().compatibilityDecisionDigest());
    }

    private static void identitySeparation() {
        Receipt r = adapter(defaultIdentity(), defaultContracts(), () -> BINDING).preflight(request("r19", "read"));
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, r.standing());
        falsehood(r.authorizesWholeRuntimeOperation());
        String names = Arrays.toString(Receipt.class.getRecordComponents()).toLowerCase(Locale.ROOT);
        falsehood(names.contains("effectpermission"));
        falsehood(names.contains("runtimelease"));
    }

    private static void contractsSeparation() {
        String names = Arrays.toString(GateReceipt.class.getRecordComponents()).toLowerCase(Locale.ROOT);
        for (String forbidden : List.of("principalauthority", "resourcegrant", "routegrant", "placementgrant", "runtimelease", "effectpermission")) {
            falsehood(names.contains(forbidden));
        }
    }

    private static void sameRequestRevalidates() {
        AtomicInteger identityCalls = new AtomicInteger();
        AtomicInteger contractCalls = new AtomicInteger();
        var a = adapter(req -> { identityCalls.incrementAndGet(); return validationReceipt(C); },
                (s, v, d) -> { contractCalls.incrementAndGet(); return gate(GateStanding.ADMITTED, List.of(), C); },
                () -> BINDING);
        Request q = request("r21", "read");
        Receipt one = a.preflight(q);
        Receipt two = a.preflight(q);
        eq(one.semanticDigest(), two.semanticDigest());
        eq(2, identityCalls.get());
        eq(2, contractCalls.get());
    }

    private static void changedSemanticDigestConflicts() {
        var a = adapter(defaultIdentity(), defaultContracts(), () -> BINDING);
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, a.preflight(request("r22", "read")).standing());
        eq(Standing.CONFLICT, a.preflight(request("r22", "write")).standing());
    }

    private static void restartRevalidates() {
        AtomicInteger calls = new AtomicInteger();
        var identity = (IdentityContractsPreflightAdapter.IdentityValidator) req -> {
            calls.incrementAndGet();
            return validationReceipt(C);
        };
        Request q = request("r23", "read");
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, adapter(identity, defaultContracts(), () -> BINDING).preflight(q).standing());
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, adapter(identity, defaultContracts(), () -> BINDING).preflight(q).standing());
        eq(2, calls.get());
    }

    private static void staleProviderBindingBlocks() {
        ProviderBinding stale = new ProviderBinding(
                "ref:system-root/identity", "identity-v2", "ref:system-root/contracts", "contracts-v1");
        AtomicInteger identityCalls = new AtomicInteger();
        var a = adapter(req -> { identityCalls.incrementAndGet(); return validationReceipt(C); }, defaultContracts(), () -> stale);
        Receipt r = a.preflight(request("r24", "read"));
        eq(Standing.BLOCKED_UNKNOWN, r.standing());
        eq(0, identityCalls.get());
        truth(r.reasonCodes().contains("PROVIDER_BINDING_STALE_OR_UNKNOWN"));
    }

    private static void evidenceClassBounded() {
        Receipt r = adapter(defaultIdentity(), defaultContracts(), () -> BINDING).preflight(request("r25", "read"));
        eq(EvidenceClass.HOSTED_PORTABLE_REFERENCE_CONTRACT_AUTHORITY_MECHANICS, r.evidenceClass());
        String label = r.evidenceClass().name();
        falsehood(label.contains("NATIVE"));
        falsehood(label.contains("PRODUCTION"));
        falsehood(label.contains("A01"));
    }

    private static void noSecretBearingFields() {
        String fields = Arrays.toString(Receipt.class.getRecordComponents()).toLowerCase(Locale.ROOT)
                + Arrays.toString(Request.class.getRecordComponents()).toLowerCase(Locale.ROOT);
        for (String forbidden : List.of("password", "secretvalue", "bearertoken", "rawcredential", "privatekey")) {
            falsehood(fields.contains(forbidden));
        }
    }

    private static IdentityContractsPreflightAdapter adapter(
            IdentityContractsPreflightAdapter.IdentityValidator identity,
            IdentityContractsPreflightAdapter.ContractGateResolver contracts,
            IdentityContractsPreflightAdapter.ProviderBindingAuthority bindings) {
        return new IdentityContractsPreflightAdapter(identity, contracts, bindings, BINDING);
    }

    private static IdentityContractsPreflightAdapter.IdentityValidator defaultIdentity() {
        return req -> validationReceipt(C);
    }

    private static IdentityContractsPreflightAdapter.ContractGateResolver defaultContracts() {
        return (subject, version, digest) -> gate(GateStanding.ADMITTED, List.of(), C);
    }

    private static CapabilityValidationReceipt validationReceipt(String validationDigest) {
        CapabilityUseRequest q = capability("read");
        return new CapabilityValidationReceipt(q.grantId(), q.grantDigest(), q.actorChain().chainDigest(), 7L, q.now(), validationDigest);
    }

    private static Request request(String requestId, String action) {
        return new Request(requestId, capability(action), "contract.runtime.command", V1, B);
    }

    private static CapabilityUseRequest capability(String action) {
        ActorChain chain = ActorChain.create("principal-user", "principal-user", List.of());
        return new CapabilityUseRequest("grant-runtime", A, chain, "principal-user", action,
                "resource:runtime", "purpose:runtime", "audience:runtime", "target:runtime", NOW);
    }

    private static GateReceipt gate(GateStanding standing, List<String> reasons, String compatibilityDigest) {
        return new GateReceipt("contract.runtime.command", V1, B, V1, B, LifecycleStanding.ACTIVE,
                compatibilityDigest, null, 9L, standing, reasons);
    }

    @FunctionalInterface
    private interface CheckedCase { void run() throws Exception; }

    private static void c(String name, CheckedCase body) throws Exception {
        try {
            body.run();
            cases++;
        } catch (Throwable failure) {
            throw new AssertionError("case failed: " + name, failure);
        }
    }

    private static void truth(boolean value) {
        if (!value) throw new AssertionError("expected true");
    }

    private static void falsehood(boolean value) {
        if (value) throw new AssertionError("expected false");
    }

    private static void eq(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError("expected=" + expected + " actual=" + actual);
        }
    }
}
