package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/** O-WP-002 typed contracts for identity proofing profiles and enrollment receipts. */
public final class ProofingContracts {
    private ProofingContracts() {}

    private static final Pattern SAFE_REF = Pattern.compile("(?:sha256:[0-9a-f]{64}|ref:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255})");

    public enum ProofingApplicability { REQUIRED, OPTIONAL, NOT_REQUIRED }
    public enum ProofingProfileStanding { ACTIVE, BLOCKED, RETIRED }
    public enum EnrollmentDecision { PENDING, PASSED, FAILED, REVIEW_REQUIRED, NOT_REQUIRED }
    public enum EnrollmentStanding { STARTED, VERIFIED, REJECTED, QUARANTINED, UNKNOWN }

    public record ProfileRef(String profileId, long version) {
        public ProfileRef {
            profileId = requireId("profileId", profileId);
            if (version < 1) throw new IllegalArgumentException("profile version must be >= 1");
        }
    }

    public record IdentityProofingProfile(
            String profileId,
            long version,
            Set<String> principalKinds,
            ProofingApplicability applicability,
            int requiredAssurance,
            List<String> allowedMethods,
            List<String> evidenceRequirements,
            ProofingProfileStanding standing,
            Instant publishedAt) {
        public IdentityProofingProfile {
            profileId = requireId("profileId", profileId);
            if (version < 1) throw new IllegalArgumentException("profile version must be >= 1");
            principalKinds = Set.copyOf(principalKinds == null ? Set.of() : principalKinds);
            if (principalKinds.isEmpty()) throw new IllegalArgumentException("principalKinds must not be empty");
            for (String kind : principalKinds) new PrincipalKind(kind);
            applicability = Objects.requireNonNull(applicability, "applicability");
            if (requiredAssurance < 0 || requiredAssurance > 3) throw new IllegalArgumentException("requiredAssurance must be 0..3");
            if (applicability == ProofingApplicability.NOT_REQUIRED && requiredAssurance != 0) {
                throw new IllegalArgumentException("NOT_REQUIRED profile must have requiredAssurance=0");
            }
            allowedMethods = immutableIdentifiers("allowedMethod", allowedMethods);
            evidenceRequirements = immutableIdentifiers("evidenceRequirement", evidenceRequirements);
            if (applicability == ProofingApplicability.REQUIRED && (allowedMethods.isEmpty() || evidenceRequirements.isEmpty())) {
                throw new IllegalArgumentException("REQUIRED profile must declare methods and evidence requirements");
            }
            standing = Objects.requireNonNull(standing, "standing");
            publishedAt = Objects.requireNonNull(publishedAt, "publishedAt");
        }

        public ProfileRef ref() { return new ProfileRef(profileId, version); }
        public boolean allowsKind(String kind) { return principalKinds.contains(new PrincipalKind(kind).value()); }
    }

    public record IdentityEnrollmentRecord(
            String enrollmentId,
            String principalId,
            String principalKind,
            ProfileRef profileRef,
            List<String> proofingEvidenceRefs,
            int assertedAssurance,
            EnrollmentDecision decision,
            EnrollmentStanding standing,
            Instant createdAt,
            Instant completedAt) {
        public IdentityEnrollmentRecord {
            enrollmentId = requireId("enrollmentId", enrollmentId);
            principalId = requireId("principalId", principalId);
            principalKind = new PrincipalKind(principalKind).value();
            profileRef = Objects.requireNonNull(profileRef, "profileRef");
            proofingEvidenceRefs = immutableEvidenceRefs(proofingEvidenceRefs);
            if (assertedAssurance < 0 || assertedAssurance > 3) throw new IllegalArgumentException("assertedAssurance must be 0..3");
            decision = Objects.requireNonNull(decision, "decision");
            standing = Objects.requireNonNull(standing, "standing");
            createdAt = Objects.requireNonNull(createdAt, "createdAt");
            if (standing == EnrollmentStanding.STARTED) {
                if (decision != EnrollmentDecision.PENDING || completedAt != null) {
                    throw new IllegalArgumentException("STARTED enrollment must be pending and incomplete");
                }
            } else {
                completedAt = Objects.requireNonNull(completedAt, "completedAt");
                if (completedAt.isBefore(createdAt)) throw new IllegalArgumentException("completedAt before createdAt");
            }
            if (standing == EnrollmentStanding.VERIFIED
                    && decision != EnrollmentDecision.PASSED
                    && decision != EnrollmentDecision.NOT_REQUIRED) {
                throw new IllegalArgumentException("VERIFIED enrollment must be PASSED or NOT_REQUIRED");
            }
        }
    }

    public record PublishIdentityProofingProfileRequest(
            MutationContext context,
            IdentityProofingProfile profile,
            long expectedLatestVersion) {
        public PublishIdentityProofingProfileRequest {
            context = Objects.requireNonNull(context, "context");
            profile = Objects.requireNonNull(profile, "profile");
            if (expectedLatestVersion < 0) throw new IllegalArgumentException("expectedLatestVersion must be >= 0");
        }
    }

    public record BeginIdentityEnrollmentRequest(
            MutationContext context,
            String enrollmentId,
            String principalId,
            ProfileRef profileRef,
            String principalKind,
            Instant createdAt) {
        public BeginIdentityEnrollmentRequest {
            context = Objects.requireNonNull(context, "context");
            enrollmentId = requireId("enrollmentId", enrollmentId);
            principalId = requireId("principalId", principalId);
            profileRef = Objects.requireNonNull(profileRef, "profileRef");
            principalKind = new PrincipalKind(principalKind).value();
            createdAt = Objects.requireNonNull(createdAt, "createdAt");
        }
    }

    public record CompleteIdentityEnrollmentRequest(
            MutationContext context,
            String enrollmentId,
            List<String> proofingEvidenceRefs,
            int assertedAssurance,
            EnrollmentDecision decision,
            EnrollmentStanding standing,
            Instant completedAt) {
        public CompleteIdentityEnrollmentRequest {
            context = Objects.requireNonNull(context, "context");
            enrollmentId = requireId("enrollmentId", enrollmentId);
            proofingEvidenceRefs = immutableEvidenceRefs(proofingEvidenceRefs);
            if (assertedAssurance < 0 || assertedAssurance > 3) throw new IllegalArgumentException("assertedAssurance must be 0..3");
            decision = Objects.requireNonNull(decision, "decision");
            standing = Objects.requireNonNull(standing, "standing");
            if (standing == EnrollmentStanding.STARTED) throw new IllegalArgumentException("completion cannot remain STARTED");
            completedAt = Objects.requireNonNull(completedAt, "completedAt");
        }
    }

    public record ProfileMutationResult(long journalRevision, boolean changed, IdentityProofingProfile profile) {}
    public record EnrollmentMutationResult(long journalRevision, boolean changed, IdentityEnrollmentRecord enrollment) {}

    private static List<String> immutableIdentifiers(String name, List<String> values) {
        List<String> safe = List.copyOf(values == null ? List.of() : values);
        for (String value : safe) requireBounded(name, value.toUpperCase(Locale.ROOT), 96);
        return safe;
    }

    static List<String> immutableEvidenceRefs(List<String> refs) {
        List<String> safe = List.copyOf(refs == null ? List.of() : refs);
        for (String ref : safe) {
            Objects.requireNonNull(ref, "evidence ref");
            if (!SAFE_REF.matcher(ref).matches()) throw new IllegalArgumentException("proofing evidence must be digest/reference only");
        }
        return safe;
    }
}
