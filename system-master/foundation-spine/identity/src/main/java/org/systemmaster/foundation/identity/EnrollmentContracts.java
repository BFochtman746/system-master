package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/** Exact O-WP-002 contracts for proofing profiles and enrollment records. */
public final class EnrollmentContracts {
    private EnrollmentContracts() {}

    private static final Pattern TOKEN = Pattern.compile("[A-Z0-9][A-Z0-9_.:-]{0,95}");
    private static final Pattern REFERENCE = Pattern.compile("(?:sha256:[0-9a-f]{64}|ref:[A-Za-z0-9][A-Za-z0-9._:/@-]{0,383})");

    public enum ProfileApplicability {
        HUMAN_PROOFING_REQUIRED,
        HUMAN_SELF_ASSERTED_ALLOWED,
        NON_HUMAN_ATTESTATION_REQUIRED
    }

    public enum ProfileStanding { ACTIVE, SUSPENDED, RETIRED }

    public enum EnrollmentStanding { OPEN, COMPLETED, REJECTED, QUARANTINED, UNKNOWN }

    public enum EnrollmentDecision {
        PENDING,
        VERIFIED,
        SELF_ASSERTED,
        ATTESTED,
        REJECTED,
        QUARANTINED,
        UNKNOWN
    }

    public enum ValidationOutcome { PASS, REJECT, QUARANTINE, UNKNOWN }

    public record IdentityProofingProfile(
            String profileId,
            long version,
            ProfileApplicability applicability,
            String requiredAssurance,
            Set<String> allowedPrincipalKinds,
            List<String> allowedMethods,
            List<String> evidenceRequirements,
            ProfileStanding standing) {
        public IdentityProofingProfile {
            profileId = requireId("profileId", profileId);
            if (version < 1) throw new IllegalArgumentException("profile version must be >= 1");
            applicability = Objects.requireNonNull(applicability, "applicability");
            requiredAssurance = token("requiredAssurance", requiredAssurance);
            LinkedHashSet<String> normalizedKinds = new LinkedHashSet<>();
            for (String kind : allowedPrincipalKinds == null ? Set.<String>of() : allowedPrincipalKinds) {
                normalizedKinds.add(token("principal kind", kind));
            }
            allowedPrincipalKinds = Set.copyOf(normalizedKinds);
            if (allowedPrincipalKinds.isEmpty()) throw new IllegalArgumentException("allowedPrincipalKinds must not be empty");
            allowedMethods = immutableTokens("allowedMethods", allowedMethods);
            evidenceRequirements = immutableTokens("evidenceRequirements", evidenceRequirements);
            standing = Objects.requireNonNull(standing, "standing");
            validateApplicability(applicability, allowedPrincipalKinds);
            if (applicability != ProfileApplicability.HUMAN_SELF_ASSERTED_ALLOWED && allowedMethods.isEmpty()) {
                throw new IllegalArgumentException("proofing/attestation-required profile needs allowed methods");
            }
            if (applicability != ProfileApplicability.HUMAN_SELF_ASSERTED_ALLOWED && evidenceRequirements.isEmpty()) {
                throw new IllegalArgumentException("proofing/attestation-required profile needs evidence requirements");
            }
        }

        public String ref() { return profileId + "@" + version; }
    }

    public record IdentityEnrollmentRecord(
            String enrollmentId,
            String principalId,
            String profileRef,
            List<String> proofingEvidenceRefs,
            String assurance,
            EnrollmentDecision decision,
            Instant createdAt,
            EnrollmentStanding standing) {
        public IdentityEnrollmentRecord {
            enrollmentId = requireId("enrollmentId", enrollmentId);
            principalId = requireId("principalId", principalId);
            profileRef = bounded("profileRef", profileRef, 192);
            proofingEvidenceRefs = referenceList("proofingEvidenceRefs", proofingEvidenceRefs);
            assurance = token("assurance", assurance);
            decision = Objects.requireNonNull(decision, "decision");
            createdAt = Objects.requireNonNull(createdAt, "createdAt");
            standing = Objects.requireNonNull(standing, "standing");
        }
    }

    public record PublishIdentityProofingProfileRequest(
            MutationContext context,
            String profileId,
            long expectedPreviousVersion,
            ProfileApplicability applicability,
            String requiredAssurance,
            Set<String> allowedPrincipalKinds,
            List<String> allowedMethods,
            List<String> evidenceRequirements,
            ProfileStanding standing) {
        public PublishIdentityProofingProfileRequest {
            context = Objects.requireNonNull(context, "context");
            profileId = requireId("profileId", profileId);
            if (expectedPreviousVersion < 0) throw new IllegalArgumentException("expectedPreviousVersion must be >= 0");
            applicability = Objects.requireNonNull(applicability, "applicability");
            requiredAssurance = token("requiredAssurance", requiredAssurance);
            allowedPrincipalKinds = Set.copyOf(allowedPrincipalKinds == null ? Set.of() : allowedPrincipalKinds);
            allowedMethods = List.copyOf(allowedMethods == null ? List.of() : allowedMethods);
            evidenceRequirements = List.copyOf(evidenceRequirements == null ? List.of() : evidenceRequirements);
            standing = Objects.requireNonNull(standing, "standing");
        }
    }

    public record BeginIdentityEnrollmentRequest(
            MutationContext context,
            String enrollmentId,
            String principalId,
            String profileId,
            long profileVersion) {
        public BeginIdentityEnrollmentRequest {
            context = Objects.requireNonNull(context, "context");
            enrollmentId = requireId("enrollmentId", enrollmentId);
            principalId = requireId("principalId", principalId);
            profileId = requireId("profileId", profileId);
            if (profileVersion < 1) throw new IllegalArgumentException("profileVersion must be >= 1");
        }
    }

    public record CompleteIdentityEnrollmentRequest(
            MutationContext context,
            String enrollmentId,
            String selectedMethod,
            String assertedAssurance,
            List<String> evidenceRefs) {
        public CompleteIdentityEnrollmentRequest {
            context = Objects.requireNonNull(context, "context");
            enrollmentId = requireId("enrollmentId", enrollmentId);
            selectedMethod = token("selectedMethod", selectedMethod);
            assertedAssurance = token("assertedAssurance", assertedAssurance);
            evidenceRefs = referenceList("evidenceRefs", evidenceRefs);
        }
    }

    public record ValidationResult(
            ValidationOutcome outcome,
            String validatedAssurance,
            List<String> evidenceReceiptRefs) {
        public ValidationResult {
            outcome = Objects.requireNonNull(outcome, "outcome");
            validatedAssurance = token("validatedAssurance", validatedAssurance);
            evidenceReceiptRefs = referenceList("evidenceReceiptRefs", evidenceReceiptRefs);
        }
    }

    public record EnrollmentMutationResult(long journalRevision, boolean changed, IdentityEnrollmentRecord enrollment) {}
    public record ProfileMutationResult(long journalRevision, boolean changed, IdentityProofingProfile profile) {}

    @FunctionalInterface
    public interface EnrollmentEvidenceValidator {
        ValidationResult validate(IdentityContracts.Principal principal,
                                  IdentityProofingProfile profile,
                                  CompleteIdentityEnrollmentRequest request);
    }

    @FunctionalInterface
    public interface PrincipalEnrollmentPromoter {
        void reconcile(IdentityEnrollmentRecord enrollment) throws Exception;

        static PrincipalEnrollmentPromoter noPromotion() { return enrollment -> {}; }
    }

    static boolean successfulDecision(EnrollmentDecision decision) {
        return decision == EnrollmentDecision.VERIFIED || decision == EnrollmentDecision.SELF_ASSERTED || decision == EnrollmentDecision.ATTESTED;
    }

    static String token(String name, String value) {
        Objects.requireNonNull(value, name);
        String normalized = value.toUpperCase(Locale.ROOT);
        if (!TOKEN.matcher(normalized).matches()) throw new IllegalArgumentException(name + " invalid");
        return normalized;
    }

    static String bounded(String name, String value, int max) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + " invalid length");
        return value;
    }

    static List<String> immutableTokens(String name, List<String> values) {
        List<String> safe = List.copyOf(values == null ? List.of() : values);
        return safe.stream().map(v -> token(name, v)).toList();
    }

    static List<String> referenceList(String name, List<String> values) {
        List<String> safe = List.copyOf(values == null ? List.of() : values);
        for (String value : safe) {
            Objects.requireNonNull(value, name);
            if (!REFERENCE.matcher(value).matches()) throw new IllegalArgumentException(name + " must contain references/digests only");
        }
        return safe;
    }

    private static void validateApplicability(ProfileApplicability applicability, Set<String> kinds) {
        boolean hasHuman = kinds.contains("HUMAN");
        if ((applicability == ProfileApplicability.HUMAN_PROOFING_REQUIRED || applicability == ProfileApplicability.HUMAN_SELF_ASSERTED_ALLOWED) && (!hasHuman || kinds.size() != 1)) {
            throw new IllegalArgumentException("human profile must apply only to HUMAN");
        }
        if (applicability == ProfileApplicability.NON_HUMAN_ATTESTATION_REQUIRED && hasHuman) {
            throw new IllegalArgumentException("non-human attestation profile cannot include HUMAN");
        }
    }
}
