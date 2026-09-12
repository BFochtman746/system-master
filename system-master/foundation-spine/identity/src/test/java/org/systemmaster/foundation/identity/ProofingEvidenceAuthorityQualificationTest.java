package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import static org.systemmaster.foundation.identity.ProofingContracts.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Adversarial qualification for the O-WP-002 evidence-authority seam. */
public final class ProofingEvidenceAuthorityQualificationTest {
    private static int cases;

    public static void main(String[] args) throws Exception {
        callerCannotForgeValidatorOutcome();
        requiredAssuranceUsesValidatedNotAssertedValue();
        validatorPrincipalMismatchFailsClosed();
        validatorProfileMismatchFailsClosed();
        validatorUnavailableFailsClosedWithoutMutation();
        notRequiredPathCannotManufactureEvidence();
        System.out.println("PASS FOUNDATION_IDENTITY_OWP002_EVIDENCE_AUTHORITY cases=" + cases);
    }

    private static void callerCannotForgeValidatorOutcome() throws Exception {
        Fixture f = preparedRequired((principal, profile, request) -> new ValidationResult(
                "ref:provider-receipt-validator-v1", principal.principalId(), profile.ref(), List.of("ref:provider-review-receipt"),
                1, EnrollmentDecision.REVIEW_REQUIRED, EnrollmentStanding.UNKNOWN));
        var record = f.enrollment.completeIdentityEnrollment(complete("c1", "e1", List.of("ref:attacker-supplied-pass"),
                3, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)).enrollment();
        check(record.assertedAssurance() == 1, "validator assurance must replace caller assertion");
        check(record.decision() == EnrollmentDecision.REVIEW_REQUIRED && record.standing() == EnrollmentStanding.UNKNOWN,
                "validator decision/standing must replace caller assertion");
        check(record.proofingEvidenceRefs().equals(List.of("ref:provider-review-receipt")),
                "validator receipts must replace caller evidence references");
        pass();
    }

    private static void requiredAssuranceUsesValidatedNotAssertedValue() throws Exception {
        Fixture f = preparedRequired((principal, profile, request) -> new ValidationResult(
                "ref:provider-receipt-validator-v1", principal.principalId(), profile.ref(), List.of("ref:provider-pass-receipt"),
                1, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED));
        expect(ErrorCode.DENIED, () -> f.enrollment.completeIdentityEnrollment(complete("c1", "e1",
                List.of("ref:caller-claims-a3"), 3, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)));
        check(f.proofing.getEnrollment("e1").standing() == EnrollmentStanding.STARTED,
                "failed validation must not mutate durable enrollment state");
        pass();
    }

    private static void validatorPrincipalMismatchFailsClosed() throws Exception {
        Fixture f = preparedRequired((principal, profile, request) -> new ValidationResult(
                "ref:provider-receipt-validator-v1", "different-principal", profile.ref(), List.of("ref:provider-pass-receipt"),
                2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED));
        expect(ErrorCode.DENIED, () -> f.enrollment.completeIdentityEnrollment(complete("c1", "e1",
                List.of("ref:provider-input"), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)));
        pass();
    }

    private static void validatorProfileMismatchFailsClosed() throws Exception {
        Fixture f = preparedRequired((principal, profile, request) -> new ValidationResult(
                "ref:provider-receipt-validator-v1", principal.principalId(), new ProfileRef(profile.profileId(), profile.version() + 1),
                List.of("ref:provider-pass-receipt"), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED));
        expect(ErrorCode.STALE_BASE, () -> f.enrollment.completeIdentityEnrollment(complete("c1", "e1",
                List.of("ref:provider-input"), 2, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)));
        pass();
    }

    private static void validatorUnavailableFailsClosedWithoutMutation() throws Exception {
        Fixture f = preparedRequired((principal, profile, request) -> {
            throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "provider unavailable");
        });
        expect(ErrorCode.BLOCKED_DEPENDENCY, () -> f.enrollment.completeIdentityEnrollment(complete("c1", "e1",
                List.of("ref:provider-input"), 3, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)));
        check(f.proofing.getEnrollment("e1").standing() == EnrollmentStanding.STARTED,
                "provider outage must leave enrollment durable state unchanged");
        pass();
    }

    private static void notRequiredPathCannotManufactureEvidence() throws Exception {
        Fixture f = fixture((principal, profile, request) -> {
            throw new AssertionError("validator must not run for NOT_REQUIRED profile");
        });
        register(f, "human-1");
        IdentityProofingProfile p = profile("local-only", ProofingApplicability.NOT_REQUIRED, 0);
        f.profiles.publishIdentityProofingProfile(new PublishIdentityProofingProfileRequest(ctx("p1"), p, 0));
        f.enrollment.beginIdentityEnrollment(begin("b1", "e1", p.ref()));
        expect(ErrorCode.DENIED, () -> f.enrollment.completeIdentityEnrollment(complete("c-bad", "e1",
                List.of("ref:manufactured"), 1, EnrollmentDecision.PASSED, EnrollmentStanding.VERIFIED)));
        var record = f.enrollment.completeIdentityEnrollment(complete("c-good", "e1", List.of(), 0,
                EnrollmentDecision.NOT_REQUIRED, EnrollmentStanding.VERIFIED)).enrollment();
        check(record.assertedAssurance() == 0 && record.proofingEvidenceRefs().isEmpty()
                && record.decision() == EnrollmentDecision.NOT_REQUIRED, "NOT_REQUIRED completion remains evidence-free");
        pass();
    }

    private static Fixture preparedRequired(EnrollmentEvidenceValidator validator) throws Exception {
        Fixture f = fixture(validator);
        register(f, "human-1");
        IdentityProofingProfile p = profile("human-required", ProofingApplicability.REQUIRED, 2);
        f.profiles.publishIdentityProofingProfile(new PublishIdentityProofingProfileRequest(ctx("p1"), p, 0));
        f.enrollment.beginIdentityEnrollment(begin("b1", "e1", p.ref()));
        return f;
    }

    private static Fixture fixture(EnrollmentEvidenceValidator validator) throws Exception {
        Path dir = Files.createTempDirectory("identity-owp002-evidence-authority-");
        IdentityMutationGate gate = IdentityMutationGate.exactBootstrapActor("foundation-bootstrap-admin");
        IdentityJournalStore identityStore = new IdentityJournalStore(dir.resolve("identity.journal"));
        PrincipalRegistry principals = new PrincipalRegistry(identityStore, gate);
        ProofingJournalStore proofing = new ProofingJournalStore(dir.resolve("proofing.journal"));
        return new Fixture(principals, proofing, new IdentityProofingProfileRegistry(proofing, gate),
                new IdentityEnrollmentService(proofing, principals, gate, validator));
    }

    private static void register(Fixture f, String principalId) throws Exception {
        f.principals.registerPrincipal(new RegisterPrincipalRequest(ctx("reg-" + principalId), principalId, new PrincipalKind("HUMAN"),
                PrincipalStatus.CANDIDATE, Map.of("label", principalId), List.of("ref:authority-root"), List.of("ref:principal-evidence")));
    }

    private static IdentityProofingProfile profile(String id, ProofingApplicability applicability, int requiredAssurance) {
        List<String> methods = applicability == ProofingApplicability.NOT_REQUIRED ? List.of() : List.of("METHOD-REF");
        List<String> requirements = applicability == ProofingApplicability.NOT_REQUIRED ? List.of() : List.of("EVIDENCE-REF");
        return new IdentityProofingProfile(id, 1, Set.of("HUMAN"), applicability, requiredAssurance, methods, requirements,
                ProofingProfileStanding.ACTIVE, Instant.parse("2026-09-12T06:00:00Z"));
    }

    private static BeginIdentityEnrollmentRequest begin(String command, String enrollmentId, ProfileRef profileRef) {
        return new BeginIdentityEnrollmentRequest(ctx(command), enrollmentId, "human-1", profileRef, "HUMAN",
                Instant.parse("2026-09-12T06:01:00Z"));
    }

    private static CompleteIdentityEnrollmentRequest complete(String command, String enrollmentId, List<String> refs,
            int assurance, EnrollmentDecision decision, EnrollmentStanding standing) {
        return new CompleteIdentityEnrollmentRequest(ctx(command), enrollmentId, refs, assurance, decision, standing,
                Instant.parse("2026-09-12T06:02:00Z"));
    }

    private static MutationContext ctx(String commandId) {
        return new MutationContext(commandId, "foundation-bootstrap-admin", List.of("ref:bootstrap-authority-v1"));
    }

    private static void expect(ErrorCode code, Throwing action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected " + code);
        } catch (IdentityException error) {
            if (error.code() != code) throw new AssertionError("expected " + code + " got " + error.code(), error);
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void pass() { cases++; }

    @FunctionalInterface private interface Throwing { void run() throws Exception; }

    private record Fixture(PrincipalRegistry principals, ProofingJournalStore proofing,
            IdentityProofingProfileRegistry profiles, IdentityEnrollmentService enrollment) {}
}
