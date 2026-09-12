package org.systemmaster.foundation.runtime;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.systemmaster.foundation.contracts.ContractAuthorityRuntime;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.CompatibilityMode;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.CompatibilityPolicyV1;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.CompatibilityScope;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.ContractKind;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.ContractSubjectV1;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.Decision;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.MatrixCompatibilityValidator;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.SemanticVersion;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.VersionDraft;
import org.systemmaster.foundation.identity.DelegationRuntime;
import org.systemmaster.foundation.identity.DelegationRuntime.ActorChain;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityGrant;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityUseRequest;
import org.systemmaster.foundation.identity.DelegationRuntime.DelegationCeilingReceipt;
import org.systemmaster.foundation.identity.DelegationRuntime.DelegationHop;
import org.systemmaster.foundation.identity.DelegationRuntime.DelegationJournalStore;
import org.systemmaster.foundation.identity.DelegationRuntime.DelegationService;
import org.systemmaster.foundation.identity.DelegationRuntime.ExternalAuthorizationReceipt;
import org.systemmaster.foundation.identity.DelegationRuntime.GrantBody;
import org.systemmaster.foundation.identity.DelegationRuntime.IssueGrantRequest;
import org.systemmaster.foundation.identity.DelegationRuntime.ReceiptAuthority;
import org.systemmaster.foundation.identity.DelegationRuntime.ReceiptStanding;
import org.systemmaster.foundation.identity.DelegationRuntime.StandingChangeRequest;
import org.systemmaster.foundation.identity.IdentityContracts.MutationContext;
import org.systemmaster.foundation.identity.IdentityContracts.Principal;
import org.systemmaster.foundation.identity.IdentityContracts.PrincipalKind;
import org.systemmaster.foundation.identity.IdentityContracts.PrincipalStatus;
import org.systemmaster.foundation.root.AuthorityRegistry;
import org.systemmaster.foundation.root.FoundationAuthorityBootstrap;
import org.systemmaster.foundation.runtime.IdentityContractsPreflightAdapter.ContractUse;
import org.systemmaster.foundation.runtime.IdentityContractsPreflightAdapter.PreflightRequest;
import org.systemmaster.foundation.runtime.IdentityContractsPreflightAdapter.PreflightResult;
import org.systemmaster.foundation.runtime.IdentityContractsPreflightAdapter.Standing;

public final class IdentityContractsPreflightAdapterQualificationTest {
    private static int cases;

    private IdentityContractsPreflightAdapterQualificationTest() {}

    public static void main(String[] args) throws Exception {
        run("IC-A01 exact principal grant subject action binding", IdentityContractsPreflightAdapterQualificationTest::case01);
        run("IC-A02 wrong principal fails closed", IdentityContractsPreflightAdapterQualificationTest::case02);
        run("IC-A03 wrong grant subject fails closed", IdentityContractsPreflightAdapterQualificationTest::case03);
        run("IC-A04 wrong action scope fails closed", IdentityContractsPreflightAdapterQualificationTest::case04);
        run("IC-A05 receipt digests preserved", IdentityContractsPreflightAdapterQualificationTest::case05);
        run("IC-A06 caller boolean claim cannot substitute receipt", IdentityContractsPreflightAdapterQualificationTest::case06);
        run("IC-B07 revoked grant denied", IdentityContractsPreflightAdapterQualificationTest::case07);
        run("IC-B08 suspended grant denied", IdentityContractsPreflightAdapterQualificationTest::case08);
        run("IC-B09 expired grant denied", IdentityContractsPreflightAdapterQualificationTest::case09);
        run("IC-B10 generation advance invalidates stale grant", IdentityContractsPreflightAdapterQualificationTest::case10);
        run("IC-B11 unavailable principal blocks", IdentityContractsPreflightAdapterQualificationTest::case11);
        run("IC-B12 retry rereads identity", IdentityContractsPreflightAdapterQualificationTest::case12);
        run("IC-C13 exact current compatible contract passes", IdentityContractsPreflightAdapterQualificationTest::case13);
        run("IC-C14 unknown contract blocks", IdentityContractsPreflightAdapterQualificationTest::case14);
        run("IC-C15 incompatible decision blocks", IdentityContractsPreflightAdapterQualificationTest::case15);
        run("IC-C16 validator unknown error blocks", IdentityContractsPreflightAdapterQualificationTest::case16);
        run("IC-C17 migration required is not direct compatibility", IdentityContractsPreflightAdapterQualificationTest::case17);
        run("IC-C18 gate compatibility digest preserved", IdentityContractsPreflightAdapterQualificationTest::case18);
        run("IC-D19 identity allow cannot grant effect permission", IdentityContractsPreflightAdapterQualificationTest::case19);
        run("IC-D20 contracts compatible cannot grant foreign authority", IdentityContractsPreflightAdapterQualificationTest::case20);
        run("IC-D21 same semantic request id is idempotent", IdentityContractsPreflightAdapterQualificationTest::case21);
        run("IC-D22 changed semantic digest conflicts with request id", IdentityContractsPreflightAdapterQualificationTest::case22);
        run("IC-E23 restart revalidates current providers", IdentityContractsPreflightAdapterQualificationTest::case23);
        run("IC-E24 stale provider identity blocks until rebound", IdentityContractsPreflightAdapterQualificationTest::case24);
        run("IC-E25 evidence class remains hosted portable", IdentityContractsPreflightAdapterQualificationTest::case25);
        run("IC-E26 no bearer secret raw credential private key output", IdentityContractsPreflightAdapterQualificationTest::case26);
        if (cases != 26) throw new AssertionError("denominator narrowed: " + cases);
        System.out.println("PASS FOUNDATION_DURABLE_RUNTIME_IDENTITY_CONTRACTS_PREFLIGHT cases=26");
    }

    private static void case01() throws Exception {
        Fixture f = fixture();
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, f.adapter.evaluate(f.request).standing());
    }

    private static void case02() throws Exception {
        Fixture f = fixture();
        CapabilityUseRequest u = new CapabilityUseRequest(f.use.grantId(), f.use.grantDigest(), f.use.actorChain(),
                "intruder", f.use.action(), f.use.resourceRef(), f.use.purposeRef(), f.use.audienceRef(), f.use.targetRef(), f.use.now());
        eq(Standing.DENY, f.adapter.evaluate(PreflightRequest.create(u, f.contractUse)).standing());
    }

    private static void case03() throws Exception {
        Fixture f = fixture();
        CapabilityUseRequest u = new CapabilityUseRequest("missing-grant", f.use.grantDigest(), f.use.actorChain(),
                f.use.presentedCurrentActorPrincipalId(), f.use.action(), f.use.resourceRef(), f.use.purposeRef(),
                f.use.audienceRef(), f.use.targetRef(), f.use.now());
        notAllow(f.adapter.evaluate(PreflightRequest.create(u, f.contractUse)));
    }

    private static void case04() throws Exception {
        Fixture f = fixture();
        CapabilityUseRequest u = new CapabilityUseRequest(f.use.grantId(), f.use.grantDigest(), f.use.actorChain(),
                f.use.presentedCurrentActorPrincipalId(), "DeleteEverything", f.use.resourceRef(), f.use.purposeRef(),
                f.use.audienceRef(), f.use.targetRef(), f.use.now());
        eq(Standing.DENY, f.adapter.evaluate(PreflightRequest.create(u, f.contractUse)).standing());
    }

    private static void case05() throws Exception {
        Fixture f = fixture();
        PreflightResult r = f.adapter.evaluate(f.request);
        eq(f.grant.grantId(), r.identityReceipt().grantId());
        eq(f.grant.grantDigest(), r.identityReceipt().grantDigest());
        eq(f.contractUse.requestedDigest(), r.contractGate().requestedDigest());
        check(r.identityReceipt().validationDigest().matches("[0-9a-f]{64}"), "identity validation digest missing");
    }

    private static void case06() {
        boolean booleanInput = false;
        for (var component : PreflightRequest.class.getRecordComponents()) {
            if (component.getType() == boolean.class || component.getType() == Boolean.class) booleanInput = true;
        }
        check(!booleanInput, "boolean claim accepted by request contract");
    }

    private static void case07() throws Exception {
        Fixture f = fixture();
        long rev = f.identity.getStanding(f.grant.grantId()).standingRevision();
        f.identity.revoke(new StandingChangeRequest(ctx("revoke-1"), f.grant.grantId(), rev, "ref:revoke", List.of("ref:evidence")));
        eq(Standing.DENY, f.adapter.evaluate(f.request).standing());
    }

    private static void case08() throws Exception {
        Fixture f = fixture();
        long rev = f.identity.getStanding(f.grant.grantId()).standingRevision();
        f.identity.suspend(new StandingChangeRequest(ctx("suspend-1"), f.grant.grantId(), rev, "ref:suspend", List.of("ref:evidence")));
        eq(Standing.DENY, f.adapter.evaluate(f.request).standing());
    }

    private static void case09() throws Exception {
        Fixture f = fixture();
        CapabilityUseRequest u = new CapabilityUseRequest(f.use.grantId(), f.use.grantDigest(), f.use.actorChain(),
                f.use.presentedCurrentActorPrincipalId(), f.use.action(), f.use.resourceRef(), f.use.purposeRef(),
                f.use.audienceRef(), f.use.targetRef(), f.expiresAt.plusSeconds(1));
        eq(Standing.DENY, f.adapter.evaluate(PreflightRequest.create(u, f.contractUse)).standing());
    }

    private static void case10() throws Exception {
        Fixture f = fixture();
        f.identity.advanceAuthorityGeneration(new DelegationRuntime.AdvanceGenerationRequest(
                ctx("advance-1"), 1, "ref:generation", List.of("ref:evidence")));
        eq(Standing.DENY, f.adapter.evaluate(f.request).standing());
    }

    private static void case11() throws Exception {
        Fixture f = fixture();
        f.principals.unavailable = true;
        eq(Standing.UNKNOWN_BLOCKED, f.adapter.evaluate(f.request).standing());
    }

    private static void case12() throws Exception {
        Fixture f = fixture();
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, f.adapter.evaluate(f.request).standing());
        long rev = f.identity.getStanding(f.grant.grantId()).standingRevision();
        f.identity.revoke(new StandingChangeRequest(ctx("revoke-retry"), f.grant.grantId(), rev, "ref:revoke", List.of("ref:evidence")));
        eq(Standing.DENY, f.adapter.evaluate(f.request).standing());
    }

    private static void case13() throws Exception {
        Fixture f = fixture();
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, f.adapter.evaluate(f.request).standing());
    }

    private static void case14() throws Exception {
        Fixture f = fixture();
        ContractUse unknown = new ContractUse("unknown-subject", new SemanticVersion(1, 0, 0), ContractAuthorityRuntime.sha256("missing"));
        eq(Standing.UNKNOWN_BLOCKED, f.adapter.evaluate(PreflightRequest.create(f.use, unknown)).standing());
    }

    private static void case15() throws Exception {
        Fixture f = fixtureWithSecondVersion();
        f.validator.decide(CompatibilityMode.BACKWARD, f.v1Digest, f.v2Digest, Decision.INCOMPATIBLE);
        PreflightResult r = f.adapter.evaluate(PreflightRequest.create(f.use, new ContractUse(f.subjectId, f.v1, f.v1Digest)));
        eq(Standing.DENY, r.standing());
    }

    private static void case16() throws Exception {
        Fixture f = fixtureWithSecondVersion();
        f.validator.decide(CompatibilityMode.BACKWARD, f.v1Digest, f.v2Digest, Decision.UNKNOWN);
        PreflightResult unknown = f.adapter.evaluate(PreflightRequest.create(f.use, new ContractUse(f.subjectId, f.v1, f.v1Digest)));
        eq(Standing.UNKNOWN_BLOCKED, unknown.standing());
        f.validator.throwError(true);
        PreflightResult error = f.adapter.evaluate(PreflightRequest.create(f.use, new ContractUse(f.subjectId, f.v1, f.v1Digest)));
        eq(Standing.UNKNOWN_BLOCKED, error.standing());
    }

    private static void case17() throws Exception {
        Fixture f = fixtureWithSecondVersion();
        f.validator.decide(CompatibilityMode.BACKWARD, f.v1Digest, f.v2Digest, Decision.MIGRATION_REQUIRED);
        PreflightResult r = f.adapter.evaluate(PreflightRequest.create(f.use, new ContractUse(f.subjectId, f.v1, f.v1Digest)));
        eq(Standing.UNKNOWN_BLOCKED, r.standing());
        check(r.contractGate() != null, "migration gate missing");
    }

    private static void case18() throws Exception {
        Fixture f = fixtureWithSecondVersion();
        PreflightResult r = f.adapter.evaluate(PreflightRequest.create(f.use, new ContractUse(f.subjectId, f.v1, f.v1Digest)));
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, r.standing());
        eq(f.subjectId, r.contractGate().subjectId());
        eq(f.v1, r.contractGate().requestedVersion());
        eq(f.v1Digest, r.contractGate().requestedDigest());
        check(r.contractGate().compatibilityDecisionDigest() != null
                && r.contractGate().compatibilityDecisionDigest().matches("[0-9a-f]{64}"), "compatibility digest missing");
    }

    private static void case19() throws Exception {
        Fixture f = fixture();
        PreflightResult r = f.adapter.evaluate(f.request);
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, r.standing());
        for (var component : PreflightResult.class.getRecordComponents()) {
            check(!component.getName().toLowerCase().contains("effectpermission"), "effect permission leaked into result");
        }
    }

    private static void case20() throws Exception {
        Fixture f = fixture();
        PreflightResult r = f.adapter.evaluate(f.request);
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, r.standing());
        String names = java.util.Arrays.stream(PreflightResult.class.getRecordComponents())
                .map(c -> c.getName().toLowerCase()).reduce("", (a, b) -> a + "|" + b);
        check(!names.contains("resourcegrant") && !names.contains("placementassignment")
                && !names.contains("runtimeauthorization") && !names.contains("effectauthorization"),
                "foreign authority leaked into result");
    }

    private static void case21() throws Exception {
        Fixture f = fixture();
        PreflightResult first = f.adapter.evaluate(f.request);
        PreflightResult second = f.adapter.evaluate(f.request);
        eq(first, second);
    }

    private static void case22() throws Exception {
        Fixture f = fixture();
        CapabilityUseRequest changed = new CapabilityUseRequest(f.use.grantId(), f.use.grantDigest(), f.use.actorChain(),
                f.use.presentedCurrentActorPrincipalId(), "DifferentAction", f.use.resourceRef(), f.use.purposeRef(),
                f.use.audienceRef(), f.use.targetRef(), f.use.now());
        expect(IllegalArgumentException.class, () -> new PreflightRequest(f.request.requestId(), changed, f.contractUse));
    }

    private static void case23() throws Exception {
        Fixture f = fixture();
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, f.adapter.evaluate(f.request).standing());
        long rev = f.identity.getStanding(f.grant.grantId()).standingRevision();
        f.identity.revoke(new StandingChangeRequest(ctx("restart-revoke"), f.grant.grantId(), rev, "ref:revoke", List.of("ref:evidence")));
        IdentityContractsPreflightAdapter restarted = new IdentityContractsPreflightAdapter(f.identity, f.contracts, f.root);
        eq(Standing.DENY, restarted.evaluate(f.request).standing());
    }

    private static void case24() throws Exception {
        Fixture f = fixture();
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, f.adapter.evaluate(f.request).standing());
        long rev = f.root.snapshot().revision();
        f.root.apply(new AuthorityRegistry.AdvancePointer(
                "test-rebind-identity", rev, IdentityContractsPreflightAdapter.IDENTITY_AUTHORITY_ID,
                "architecture", "system-master/foundation-spine/SYSTEM-SPECIFICATION-rebound.md"));
        eq(Standing.UNKNOWN_BLOCKED, f.adapter.evaluate(f.request).standing());
        IdentityContractsPreflightAdapter rebound = new IdentityContractsPreflightAdapter(f.identity, f.contracts, f.root);
        eq(Standing.ALLOW_CURRENT_PREREQUISITES, rebound.evaluate(f.request).standing());
    }

    private static void case25() throws Exception {
        Fixture f = fixture();
        PreflightResult r = f.adapter.evaluate(f.request);
        eq(IdentityContractsPreflightAdapter.QUALIFICATION_CLASS, r.qualificationClass());
        String q = r.qualificationClass().toUpperCase();
        check(!q.contains("A01") && !q.contains("NATIVE") && !q.contains("PRODUCTION"), "evidence class promoted");
    }

    private static void case26() throws Exception {
        Fixture f = fixture();
        CapabilityUseRequest secretUse = new CapabilityUseRequest(f.use.grantId(), f.use.grantDigest(), f.use.actorChain(),
                f.use.presentedCurrentActorPrincipalId(), f.use.action(), f.use.resourceRef(), f.use.purposeRef(),
                f.use.audienceRef(), "Bearer very-secret-value", f.use.now());
        PreflightResult r = f.adapter.evaluate(PreflightRequest.create(secretUse, f.contractUse));
        eq(Standing.DENY, r.standing());
        String out = r.toString().toLowerCase();
        check(!out.contains("very-secret-value") && !out.contains("bearer ")
                && !out.contains("begin private key") && !out.contains("password="), "secret material leaked");
    }

    private static Fixture fixture() throws Exception {
        Instant now = Instant.now();
        MutablePrincipals principals = new MutablePrincipals(now);
        DelegationJournalStore store = new DelegationJournalStore(Files.createTempDirectory("ic-preflight-identity-"));
        DelegationService[] holder = new DelegationService[1];

        ActorChain issuanceChain = ActorChain.create("subject", "subject", List.of());
        Instant expiresAt = now.plusSeconds(3600);
        GrantBody body = new GrantBody(
                "grant-1", "subject", "subject", "actor", null, null, issuanceChain.chainDigest(),
                Set.of("ResumeDurableJob"), Set.of("runtime:job:job-1"), Set.of("continuity"),
                Set.of("durable-runtime"), Set.of("job-1"), now.minusSeconds(60), expiresAt,
                false, 0, 1, "ref:keel-ceiling", DelegationRuntime.sha256("keel-ceiling"),
                List.of("ref:authority-evidence"), now);
        String grantDigest = DelegationRuntime.digestGrant(body);
        ReceiptAuthority receipts = new ReceiptAuthority() {
            @Override public ExternalAuthorizationReceipt externalAuthorization(String receiptRef) {
                return new ExternalAuthorizationReceipt(receiptRef, grantDigest, ReceiptStanding.CURRENT, now, now.plusSeconds(600));
            }
            @Override public DelegationCeilingReceipt delegationCeiling(String receiptRef) {
                return new DelegationCeilingReceipt(receiptRef, body.keelCeilingRef(), body.keelCeilingDigest(),
                        grantDigest, ReceiptStanding.CURRENT, now, now.plusSeconds(600));
            }
        };
        holder[0] = new DelegationService(store, principals, receipts, (context, action, target) -> { });
        DelegationService identity = holder[0];
        CapabilityGrant grant = identity.issue(new IssueGrantRequest(
                ctx("issue-grant-1"), body, issuanceChain, "ref:external-auth", "ref:keel-receipt", 1));
        ActorChain useChain = ActorChain.create("subject", "actor", List.of(new DelegationHop(
                grant.grantId(), grant.grantDigest(), grant.delegatorPrincipalId(), grant.delegatePrincipalId())));
        CapabilityUseRequest use = new CapabilityUseRequest(
                grant.grantId(), grant.grantDigest(), useChain, "actor", "ResumeDurableJob",
                "runtime:job:job-1", "continuity", "durable-runtime", "job-1", now);

        ContractFixture contractFixture = contractsFixture();
        AuthorityRegistry root = FoundationAuthorityBootstrap.createRegistry();
        IdentityContractsPreflightAdapter adapter = new IdentityContractsPreflightAdapter(identity, contractFixture.runtime, root);
        ContractUse contractUse = new ContractUse(contractFixture.subjectId, contractFixture.v1, contractFixture.v1Digest);
        PreflightRequest request = PreflightRequest.create(use, contractUse);
        return new Fixture(identity, principals, grant, use, expiresAt, contractFixture.runtime, contractFixture.validator,
                root, adapter, contractUse, request, contractFixture.subjectId, contractFixture.v1, contractFixture.v1Digest,
                contractFixture.v2, contractFixture.v2Digest);
    }

    private static Fixture fixtureWithSecondVersion() throws Exception {
        Fixture f = fixture();
        f.validator.decide(CompatibilityMode.BACKWARD, f.v1Digest, f.v2Digest, Decision.COMPATIBLE);
        f.contracts.registerVersion("register-v2", f.contracts.registryRevision(),
                new VersionDraft(f.subjectId, f.v2, f.v2Digest, "canon", "ref:schema-v2"), null);
        return f;
    }

    private static ContractFixture contractsFixture() throws IOException {
        Path dir = Files.createTempDirectory("ic-preflight-contracts-");
        MatrixCompatibilityValidator validator = new MatrixCompatibilityValidator("matrix", "1");
        ContractAuthorityRuntime runtime = new ContractAuthorityRuntime(dir, owner -> true, canon -> true, List.of(validator));
        String subjectId = "runtime-envelope";
        SemanticVersion v1 = new SemanticVersion(1, 0, 0);
        SemanticVersion v2 = new SemanticVersion(1, 1, 0);
        String d1 = ContractAuthorityRuntime.sha256("schema-v1");
        String d2 = ContractAuthorityRuntime.sha256("schema-v2");
        runtime.createSubject("subject-v1", runtime.registryRevision(),
                new ContractSubjectV1(subjectId, ContractKind.STATE_SCHEMA, "DURABLE_RUNTIME", "java-record", "semver", "ref:created"));
        runtime.setPolicy("policy-v1", runtime.registryRevision(),
                new CompatibilityPolicyV1(subjectId, "policy", 1, CompatibilityMode.BACKWARD,
                        CompatibilityScope.LATEST, validator.id(), validator.version(), null));
        runtime.registerVersion("register-v1", runtime.registryRevision(),
                new VersionDraft(subjectId, v1, d1, "canon", "ref:schema-v1"), null);
        return new ContractFixture(runtime, validator, subjectId, v1, d1, v2, d2);
    }

    private static MutationContext ctx(String commandId) {
        return new MutationContext(commandId, "subject", List.of("ref:authority-evidence"));
    }

    private static void run(String name, ThrowingRunnable test) throws Exception {
        test.run();
        cases++;
        System.out.println("PASS " + name);
    }

    private static void notAllow(PreflightResult result) {
        check(result.standing() != Standing.ALLOW_CURRENT_PREREQUISITES, "unexpected allow");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void eq(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError("expected=" + expected + " actual=" + actual);
        }
    }

    private static <T extends Throwable> void expect(Class<T> type, ThrowingRunnable action) throws Exception {
        try {
            action.run();
        } catch (Throwable ex) {
            if (type.isInstance(ex)) return;
            throw new AssertionError("wrong exception " + ex, ex);
        }
        throw new AssertionError("expected exception " + type.getName());
    }

    @FunctionalInterface
    private interface ThrowingRunnable { void run() throws Exception; }

    private static final class MutablePrincipals implements DelegationRuntime.PrincipalAuthority {
        private final Map<String, Principal> principals = new HashMap<>();
        private boolean unavailable;
        MutablePrincipals(Instant now) {
            PrincipalKind kind = new PrincipalKind("HUMAN");
            for (String id : List.of("subject", "actor", "intruder")) {
                principals.put(id, new Principal(id, kind, PrincipalStatus.ACTIVE, now.minusSeconds(3600), 1,
                        List.of("ref:authority"), List.of("ref:evidence")));
            }
        }
        @Override public Principal getPrincipal(String principalId) throws IOException {
            if (unavailable) throw new IOException("simulated unavailable principal authority");
            return principals.get(principalId);
        }
    }

    private record ContractFixture(
            ContractAuthorityRuntime runtime,
            MatrixCompatibilityValidator validator,
            String subjectId,
            SemanticVersion v1,
            String v1Digest,
            SemanticVersion v2,
            String v2Digest) {}

    private record Fixture(
            DelegationService identity,
            MutablePrincipals principals,
            CapabilityGrant grant,
            CapabilityUseRequest use,
            Instant expiresAt,
            ContractAuthorityRuntime contracts,
            MatrixCompatibilityValidator validator,
            AuthorityRegistry root,
            IdentityContractsPreflightAdapter adapter,
            ContractUse contractUse,
            PreflightRequest request,
            String subjectId,
            SemanticVersion v1,
            String v1Digest,
            SemanticVersion v2,
            String v2Digest) {}
}
