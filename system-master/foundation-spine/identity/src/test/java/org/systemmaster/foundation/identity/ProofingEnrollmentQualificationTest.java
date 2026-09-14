package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import static org.systemmaster.foundation.identity.ProofingContracts.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

public final class ProofingEnrollmentQualificationTest {
    private static int cases;

    public static void main(String[] args) throws Exception {
        profileVersionsAreImmutableAndStaleSafe();
        proofingNotRequiredPath();
        humanAndNonHumanEnrollmentStayDistinct();
        exactPrincipalAndProfileBinding();
        blockedProfileDeniesNewEnrollment();
        beginReplayIsIdempotentAndChangedBytesConflict();
        concurrentBeginHasSingleWinner();
        concurrentProfilePublishHasSingleWinner();
        requiredEvidenceCannotBeOmitted();
        belowRequiredAssuranceCannotPass();
        suppliedAssuranceIsPreservedWithoutElevation();
        authenticationEvidenceDoesNotAuthorizeMutation();
        rawProofingPayloadIsRejected();
        rejectionQuarantineAndUnknownRemainExplicit();
        restartReplayPreservesProofingState();
        corruptJournalFailsClosed();
        principalLifecycleRemainsSeparateFromEnrollment();
        System.out.println("PASS FOUNDATION_IDENTITY_OWP002 cases=" + cases);
    }

    private static Fixture fixture() throws Exception {
        Path dir = Files.createTempDirectory("identity-owp002-");
        IdentityMutationGate gate = IdentityMutationGate.exactBootstrapActor("foundation-bootstrap-admin");
        IdentityJournalStore identityStore = new IdentityJournalStore(dir.resolve("identity.journal"));
        PrincipalRegistry principals = new PrincipalRegistry(identityStore, gate);
        PrincipalLifecycleService lifecycle = new PrincipalLifecycleService(identityStore, gate);
        ProofingJournalStore proofingStore = new ProofingJournalStore(dir.resolve("proofing.journal"));
        return new Fixture(dir, principals, lifecycle, proofingStore,
                new IdentityProofingProfileRegistry(proofingStore, gate),
                new IdentityEnrollmentService(proofingStore, principals, gate));
    }

    private static MutationContext ctx(String id) {
        return new MutationContext(id, "foundation-bootstrap-admin", List.of("ref:bootstrap-authority-v1"));
    }

    private static Principal register(Fixture f, String id, String kind) throws Exception {
        return f.principals.registerPrincipal(new RegisterPrincipalRequest(ctx("reg-" + id), id, new PrincipalKind(kind),
                PrincipalStatus.CANDIDATE, Map.of("label", id), List.of("ref:authority-root"), List.of("ref:principal-evidence"))).principal();
    }

    private static IdentityProofingProfile profile(String id, long version, Set<String> kinds,
            ProofingApplicability applicability, int assurance, ProofingProfileStanding standing) {
        List<String> methods = applicability == ProofingApplicability.NOT_REQUIRED ? List.of() : List.of("METHOD-REF");
        List<String> evidence = applicability == ProofingApplicability.NOT_REQUIRED ? List.of() : List.of("EVIDENCE-REF");
        return new IdentityProofingProfile(id, version, kinds, applicability, assurance, methods, evidence, standing,
                Instant.parse("2026-09-12T05:00:00Z").plusSeconds(version));
    }

    private static void publish(Fixture f, String command, IdentityProofingProfile profile, long expected) throws Exception {
        f.profiles.publishIdentityProofingProfile(new PublishIdentityProofingProfileRequest(ctx(command), profile, expected));
    }

    private static BeginIdentityEnrollmentRequest begin(String command, String enrollment, String principal, ProfileRef ref, String kind) {
        return new BeginIdentityEnrollmentRequest(ctx(command), enrollment, principal, ref, kind, Instant.parse("2026-09-12T05:10:00Z"));
    }

    private static CompleteIdentityEnrollmentRequest complete(String command, String enrollment, List<String> refs,
            int assurance, EnrollmentDecision decision, EnrollmentStanding standing) {
        return new CompleteIdentityEnrollmentRequest(ctx(command), enrollment, refs, assurance, decision, standing,
                Instant.parse("2026-09-12T05:11:00Z"));
    }

    private static void profileVersionsAreImmutableAndStaleSafe() throws Exception {
        Fixture f = fixture();
        var v1 = profile("human-basic", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE);
        publish(f, "p1", v1, 0);
        expect(ErrorCode.STALE_BASE, () -> publish(f, "p2", profile("human-basic", 2, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 2, ProofingProfileStanding.ACTIVE), 0));
        var v2 = profile("human-basic", 2, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 2, ProofingProfileStanding.ACTIVE);
        publish(f, "p3", v2, 1);
        check(f.profiles.getProfile(v1.ref()).requiredAssurance() == 1 && f.profiles.getLatestProfile("human-basic").version() == 2,
                "old profile immutable and latest advances");
        pass();
    }

    private static void proofingNotRequiredPath() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-local", 1, Set.of("HUMAN"), ProofingApplicability.NOT_REQUIRED, 0, ProofingProfileStanding.ACTIVE); publish(f, "p1", p, 0);
        f.enrollment.beginIdentityEnrollment(begin("b1", "e1", "human-1", p.ref(), "HUMAN"));
        var result = f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of(), 0, EnrollmentDecision.NOT_REQUIRED, EnrollmentStanding.VERIFIED));
        check(result.enrollment().assertedAssurance() == 0 && result.enrollment().proofingEvidenceRefs().isEmpty(), "not-required path cannot invent proofing assurance");
        pass();
    }

    private static void humanAndNonHumanEnrollmentStayDistinct() throws Exception {
        Fixture f = fixture(); register(f, "svc-1", "SERVICE");
        var human = profile("human-only", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE); publish(f, "p1", human, 0);
        expect(ErrorCode.DENIED, () -> f.enrollment.beginIdentityEnrollment(begin("b1", "e1", "svc-1", human.ref(), "SERVICE")));
        var service = profile("service-attestation", 1, Set.of("SERVICE"), ProofingApplicability.OPTIONAL, 0, ProofingProfileStanding.ACTIVE); publish(f, "p2", service, 0);
        check(f.enrollment.beginIdentityEnrollment(begin("b2", "e2", "svc-1", service.ref(), "SERVICE")).enrollment().principalKind().equals("SERVICE"), "non-human enrollment remains typed");
        pass();
    }

    private static void exactPrincipalAndProfileBinding() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-basic", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE); publish(f, "p1", p, 0);
        var record = f.enrollment.beginIdentityEnrollment(begin("b1", "e1", "human-1", p.ref(), "HUMAN")).enrollment();
        check(record.principalId().equals("human-1") && record.profileRef().equals(p.ref()), "exact principal/profile binding");
        pass();
    }

    private static void blockedProfileDeniesNewEnrollment() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-blocked", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.BLOCKED); publish(f, "p1", p, 0);
        expect(ErrorCode.BLOCKED_DEPENDENCY, () -> f.enrollment.beginIdentityEnrollment(begin("b1", "e1", "human-1", p.ref(), "HUMAN")));
        pass();
    }

    private static void beginReplayIsIdempotentAndChangedBytesConflict() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-basic", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE); publish(f, "p1", p, 0);
        var request = begin("same-command", "e1", "human-1", p.ref(), "HUMAN");
        check(f.enrollment.beginIdentityEnrollment(request).changed(), "first command changes state");
        check(!f.enrollment.beginIdentityEnrollment(request).changed(), "same command replay idempotent");
        expect(ErrorCode.CONFLICT, () -> f.enrollment.beginIdentityEnrollment(begin("same-command", "e2", "human-1", p.ref(), "HUMAN")));
        pass();
    }

    private static void concurrentBeginHasSingleWinner() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-basic", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE); publish(f, "p1", p, 0);
        CountDownLatch go = new CountDownLatch(1); AtomicInteger success = new AtomicInteger(); AtomicInteger conflict = new AtomicInteger();
        Thread a = new Thread(() -> concurrentBegin(f, p, "c-a", go, success, conflict));
        Thread b = new Thread(() -> concurrentBegin(f, p, "c-b", go, success, conflict)); a.start(); b.start(); go.countDown(); a.join(); b.join();
        check(success.get() == 1 && conflict.get() == 1, "concurrent begin single winner"); pass();
    }

    private static void concurrentBegin(Fixture f, IdentityProofingProfile p, String cmd, CountDownLatch go, AtomicInteger success, AtomicInteger conflict) {
        try { go.await(); f.enrollment.beginIdentityEnrollment(begin(cmd, "same-enrollment", "human-1", p.ref(), "HUMAN")); success.incrementAndGet(); }
        catch (IdentityException e) { if (e.code() == ErrorCode.CONFLICT) conflict.incrementAndGet(); else throw e; }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    private static void concurrentProfilePublishHasSingleWinner() throws Exception {
        Fixture f = fixture(); CountDownLatch go = new CountDownLatch(1); AtomicInteger success = new AtomicInteger(); AtomicInteger stale = new AtomicInteger();
        Thread a = new Thread(() -> concurrentPublish(f, "p-a", go, success, stale)); Thread b = new Thread(() -> concurrentPublish(f, "p-b", go, success, stale));
        a.start(); b.start(); go.countDown(); a.join(); b.join(); check(success.get() == 1 && stale.get() == 1, "concurrent profile publication single winner"); pass();
    }

    private static void concurrentPublish(Fixture f, String cmd, CountDownLatch go, AtomicInteger success, AtomicInteger stale) {
        try { go.await(); publish(f, cmd, profile("race-profile", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE), 0); success.incrementAndGet(); }
        catch (IdentityException e) { if (e.code() == ErrorCode.STALE_BASE || e.code() == ErrorCode.CONFLICT) stale.incrementAndGet(); else throw e; }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    private static void requiredEvidenceCannotBeOmitted() throws Exception {
        Fixture f = preparedRequired(); expect(ErrorCode.DENIED, () -> f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of(), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED))); pass();
    }

    private static void belowRequiredAssuranceCannotPass() throws Exception {
        Fixture f = preparedRequired(); expect(ErrorCode.DENIED, () -> f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of("ref:provider-result"), 1, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED))); pass();
    }

    private static void suppliedAssuranceIsPreservedWithoutElevation() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-optional", 1, Set.of("HUMAN"), ProofingApplicability.OPTIONAL, 0, ProofingProfileStanding.ACTIVE); publish(f, "p1", p, 0);
        f.enrollment.beginIdentityEnrollment(begin("b1", "e1", "human-1", p.ref(), "HUMAN"));
        var record = f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of("ref:provider-assertion-2"), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)).enrollment();
        check(record.assertedAssurance() == 2, "supplied assurance preserved exactly"); pass();
    }

    private static void authenticationEvidenceDoesNotAuthorizeMutation() throws Exception {
        Path dir = Files.createTempDirectory("identity-owp002-deny-");
        ProofingJournalStore store = new ProofingJournalStore(dir.resolve("proofing.journal"));
        IdentityProofingProfileRegistry denied = new IdentityProofingProfileRegistry(store, IdentityMutationGate.denyAll());
        MutationContext authOnly = new MutationContext("cmd-auth", "human-actor", List.of("ref:authentication-success"));
        expect(ErrorCode.DENIED, () -> denied.publishIdentityProofingProfile(new PublishIdentityProofingProfileRequest(authOnly,
                profile("human-basic", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 1, ProofingProfileStanding.ACTIVE), 0)));
        pass();
    }

    private static void rawProofingPayloadIsRejected() throws Exception {
        boolean rejected = false;
        try { complete("c1", "e1", List.of("passport-number-123"), 1, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED); }
        catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, "raw proofing payload rejected"); pass();
    }

    private static void rejectionQuarantineAndUnknownRemainExplicit() throws Exception {
        for (EnrollmentStanding standing : List.of(EnrollmentStanding.REJECTED, EnrollmentStanding.QUARANTINED, EnrollmentStanding.UNKNOWN)) {
            Fixture f = preparedRequired(); EnrollmentDecision decision = standing == EnrollmentStanding.REJECTED ? EnrollmentDecision.FAILED : EnrollmentDecision.REVIEW_REQUIRED;
            var record = f.enrollment.completeIdentityEnrollment(complete("c-" + standing, "e1", List.of("ref:review-evidence"), 0, decision, standing)).enrollment();
            check(record.standing() == standing, "explicit terminal standing " + standing);
        }
        pass();
    }

    private static void restartReplayPreservesProofingState() throws Exception {
        Fixture f = preparedRequired(); f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of("ref:provider-result"), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED));
        ProofingJournalStore restarted = new ProofingJournalStore(f.proofing.path());
        var record = restarted.getEnrollment("e1"); check(record.standing() == EnrollmentStanding.VERIFIED && restarted.getLatestProfile("human-required").version() == 1, "restart replay preserves state"); pass();
    }

    private static void corruptJournalFailsClosed() throws Exception {
        Fixture f = preparedRequired(); Files.write(f.proofing.path(), new byte[]{0x01}, java.nio.file.StandardOpenOption.APPEND);
        expect(ErrorCode.CORRUPT_STATE, () -> f.proofing.load()); pass();
    }

    private static void principalLifecycleRemainsSeparateFromEnrollment() throws Exception {
        Fixture f = preparedRequired(); f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of("ref:provider-result"), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED));
        Principal principal = f.principals.getPrincipal("human-1"); check(principal.status() == PrincipalStatus.CANDIDATE, "proofing does not silently mutate principal lifecycle");
        principal = f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("lifecycle-enroll"), "human-1", principal.currentRevision(), PrincipalStatus.ENROLLED,
                "separate lifecycle authority accepted proofing evidence", null, null, List.of("ref:enrollment-e1"))).principal();
        check(principal.status() == PrincipalStatus.ENROLLED, "explicit lifecycle authority performs lifecycle transition"); pass();
    }

    private static Fixture preparedRequired() throws Exception {
        Fixture f = fixture(); register(f, "human-1", "HUMAN");
        var p = profile("human-required", 1, Set.of("HUMAN"), ProofingApplicability.REQUIRED, 2, ProofingProfileStanding.ACTIVE); publish(f, "p1", p, 0);
        f.enrollment.beginIdentityEnrollment(begin("b1", "e1", "human-1", p.ref(), "HUMAN")); return f;
    }

    private static void expect(ErrorCode code, Throwing action) throws Exception {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (IdentityException error) { if (error.code() != code) throw new AssertionError("expected " + code + " got " + error.code(), error); }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void pass() { cases++; }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }
    private record Fixture(Path dir, PrincipalRegistry principals, PrincipalLifecycleService lifecycle, ProofingJournalStore proofing,
            IdentityProofingProfileRegistry profiles, IdentityEnrollmentService enrollment) {}
}
