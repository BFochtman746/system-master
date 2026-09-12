package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import static org.systemmaster.foundation.identity.ProofingContracts.*;

import java.io.IOException;
import java.util.Objects;

/** O-WP-002 enrollment service. Proofing evidence is referenced, never fabricated or stored raw. */
public final class IdentityEnrollmentService {
    private final ProofingJournalStore store;
    private final PrincipalRegistry principalRegistry;
    private final IdentityMutationGate gate;

    public IdentityEnrollmentService(ProofingJournalStore store, PrincipalRegistry principalRegistry, IdentityMutationGate gate) {
        this.store = Objects.requireNonNull(store, "store");
        this.principalRegistry = Objects.requireNonNull(principalRegistry, "principalRegistry");
        this.gate = Objects.requireNonNull(gate, "gate");
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
        return store.complete(request);
    }

    public IdentityEnrollmentRecord getEnrollmentStanding(String enrollmentId) throws IOException {
        return store.getEnrollment(enrollmentId);
    }
}
