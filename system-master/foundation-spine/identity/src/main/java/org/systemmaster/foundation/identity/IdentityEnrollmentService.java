package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import static org.systemmaster.foundation.identity.ProofingContracts.*;

import java.io.IOException;
import java.util.List;
import java.util.Objects;

/**
 * O-WP-002 enrollment service. Proofing evidence is referenced, never fabricated or stored raw.
 * Caller-supplied assurance/decision/standing are not authority: public completion requires a
 * validator-produced result bound to the exact principal and proofing profile.
 */
public final class IdentityEnrollmentService {
    private final ProofingJournalStore store;
    private final PrincipalRegistry principalRegistry;
    private final IdentityMutationGate gate;
    private final EnrollmentEvidenceValidator evidenceValidator;

    /**
     * Public runtime constructor. External/provider validation authority must be supplied explicitly.
     */
    public IdentityEnrollmentService(ProofingJournalStore store, PrincipalRegistry principalRegistry,
            IdentityMutationGate gate, EnrollmentEvidenceValidator evidenceValidator) {
        this.store = Objects.requireNonNull(store, "store");
        this.principalRegistry = Objects.requireNonNull(principalRegistry, "principalRegistry");
        this.gate = Objects.requireNonNull(gate, "gate");
        this.evidenceValidator = Objects.requireNonNull(evidenceValidator, "evidenceValidator");
    }

    /**
     * Package-only compatibility seam for the existing portable O-WP-002 qualification corpus.
     * It deliberately does not create a public runtime path that trusts transport assertions.
     */
    IdentityEnrollmentService(ProofingJournalStore store, PrincipalRegistry principalRegistry, IdentityMutationGate gate) {
        this(store, principalRegistry, gate, (principal, profile, request) -> new ValidationResult(
                "ref:portable-qualification-reference-validator",
                principal.principalId(),
                profile.ref(),
                request.proofingEvidenceRefs(),
                request.assertedAssurance(),
                request.decision(),
                request.standing()));
    }

    public EnrollmentMutationResult beginIdentityEnrollment(BeginIdentityEnrollmentRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "BeginIdentityEnrollment", request.principalId());
        Principal principal = principalRegistry.getPrincipal(request.principalId());
        if (!principal.kind().value().equals(request.principalKind())) {
            throw new IdentityException(ErrorCode.DENIED, "principal kind does not match canonical principal");
        }
        if (principal.status() == PrincipalStatus.DISABLED || principal.status() == PrincipalStatus.RETIRED || principal.status() == PrincipalStatus.QUARANTINED) {
            throw new IdentityException(ErrorCode.REVOKED, "principal standing blocks enrollment");
        }
        IdentityProofingProfile profile = store.getProfile(request.profileRef());
        if (profile.standing() != ProofingProfileStanding.ACTIVE) {
            throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "proofing profile not active");
        }
        if (!profile.allowsKind(request.principalKind())) {
            throw new IdentityException(ErrorCode.DENIED, "proofing profile does not allow principal kind");
        }
        return store.begin(request);
    }

    public EnrollmentMutationResult completeIdentityEnrollment(CompleteIdentityEnrollmentRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        IdentityEnrollmentRecord current = store.getEnrollment(request.enrollmentId());
        gate.authorize(request.context(), "CompleteIdentityEnrollment", current.principalId());
        Principal principal = principalRegistry.getPrincipal(current.principalId());
        if (principal.status() == PrincipalStatus.DISABLED || principal.status() == PrincipalStatus.RETIRED || principal.status() == PrincipalStatus.QUARANTINED) {
            throw new IdentityException(ErrorCode.REVOKED, "principal standing changed before enrollment completion");
        }
        IdentityProofingProfile profile = store.getProfile(current.profileRef());
        ValidationResult validated = profile.applicability() == ProofingApplicability.NOT_REQUIRED
                ? notRequiredResult(principal, profile, request)
                : Objects.requireNonNull(evidenceValidator.validate(principal, profile, request), "evidence validator result");
        CompleteIdentityEnrollmentRequest trusted = trustedCompletion(current, profile, request, validated);
        return store.complete(trusted);
    }

    public IdentityEnrollmentRecord getEnrollmentStanding(String enrollmentId) throws IOException {
        return store.getEnrollment(enrollmentId);
    }

    private static ValidationResult notRequiredResult(Principal principal, IdentityProofingProfile profile,
            CompleteIdentityEnrollmentRequest request) {
        if (!request.proofingEvidenceRefs().isEmpty() || request.assertedAssurance() != 0
                || request.decision() != EnrollmentDecision.NOT_REQUIRED
                || request.standing() != EnrollmentStanding.VERIFIED) {
            throw new IdentityException(ErrorCode.DENIED, "NOT_REQUIRED proofing cannot accept asserted evidence or assurance");
        }
        return new ValidationResult("ref:not-required-policy", principal.principalId(), profile.ref(), List.of(), 0,
                EnrollmentDecision.NOT_REQUIRED, EnrollmentStanding.VERIFIED);
    }

    private static CompleteIdentityEnrollmentRequest trustedCompletion(IdentityEnrollmentRecord current,
            IdentityProofingProfile profile, CompleteIdentityEnrollmentRequest request, ValidationResult validated) {
        if (!validated.principalId().equals(current.principalId())) {
            throw new IdentityException(ErrorCode.DENIED, "validator result principal mismatch");
        }
        if (!validated.profileRef().equals(current.profileRef())) {
            throw new IdentityException(ErrorCode.STALE_BASE, "validator result profile mismatch");
        }
        if (validated.standing() == EnrollmentStanding.VERIFIED) {
            if (profile.applicability() == ProofingApplicability.REQUIRED) {
                if (validated.decision() != EnrollmentDecision.PASSED) {
                    throw new IdentityException(ErrorCode.DENIED, "required proofing validator did not pass");
                }
                if (validated.evidenceReceiptRefs().isEmpty()) {
                    throw new IdentityException(ErrorCode.DENIED, "required proofing validator returned no evidence receipt");
                }
                if (validated.validatedAssurance() < profile.requiredAssurance()) {
                    throw new IdentityException(ErrorCode.DENIED, "validated assurance below profile requirement");
                }
            } else if (validated.decision() == EnrollmentDecision.PASSED && validated.evidenceReceiptRefs().isEmpty()) {
                throw new IdentityException(ErrorCode.DENIED, "verified proofing pass requires validator evidence receipt");
            }
        }
        return new CompleteIdentityEnrollmentRequest(
                request.context(),
                request.enrollmentId(),
                validated.evidenceReceiptRefs(),
                validated.validatedAssurance(),
                validated.decision(),
                validated.standing(),
                request.completedAt());
    }
}
