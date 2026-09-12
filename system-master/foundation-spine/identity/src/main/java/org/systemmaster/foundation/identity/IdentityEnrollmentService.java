package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.EnrollmentContracts.*;
import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.io.IOException;
import java.util.List;
import java.util.Objects;

/** O-WP-002 enrollment state machine. External proofing validity is never synthesized here. */
public final class IdentityEnrollmentService {
    private final EnrollmentJournalStore store;
    private final PrincipalRegistry principals;
    private final IdentityMutationGate gate;
    private final EnrollmentEvidenceValidator validator;
    private final PrincipalEnrollmentPromoter promoter;

    public IdentityEnrollmentService(EnrollmentJournalStore store,
                                     PrincipalRegistry principals,
                                     IdentityMutationGate gate,
                                     EnrollmentEvidenceValidator validator,
                                     PrincipalEnrollmentPromoter promoter) {
        this.store = Objects.requireNonNull(store, "store");
        this.principals = Objects.requireNonNull(principals, "principals");
        this.gate = Objects.requireNonNull(gate, "gate");
        this.validator = Objects.requireNonNull(validator, "validator");
        this.promoter = Objects.requireNonNull(promoter, "promoter");
    }

    public EnrollmentMutationResult beginIdentityEnrollment(BeginIdentityEnrollmentRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "BeginIdentityEnrollment", request.principalId());
        Principal principal = principals.getPrincipal(request.principalId());
        if (principal.status() != PrincipalStatus.CANDIDATE && principal.status() != PrincipalStatus.ENROLLED) {
            throw new IdentityException(ErrorCode.CONFLICT, "principal standing does not permit enrollment");
        }
        return store.begin(new EnrollmentJournalStore.Begin(request, principal.kind().value()));
    }

    public EnrollmentMutationResult completeIdentityEnrollment(CompleteIdentityEnrollmentRequest request) throws Exception {
        Objects.requireNonNull(request, "request");
        EnrollmentJournalStore.Snapshot snapshot = store.load();
        IdentityEnrollmentRecord current = snapshot.enrollments().get(requireId("enrollmentId", request.enrollmentId()));
        if (current == null) throw new IdentityException(ErrorCode.NOT_FOUND, "enrollment not found");
        gate.authorize(request.context(), "CompleteIdentityEnrollment", current.principalId());

        String fingerprint = EnrollmentJournalStore.fingerprintCompleteRequest(request);
        IdentityEnrollmentRecord replay = store.existingCommandEnrollment(request.context().commandId(), fingerprint);
        if (replay != null) {
            reconcilePrincipal(replay);
            return new EnrollmentMutationResult(snapshot.journalRevision(), false, replay);
        }

        IdentityProofingProfile profile = snapshot.profiles().get(current.profileRef());
        if (profile == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "enrollment references missing profile");
        Principal principal = principals.getPrincipal(current.principalId());
        ValidationResult result;
        if (profile.applicability() == ProfileApplicability.HUMAN_SELF_ASSERTED_ALLOWED) {
            result = new ValidationResult(ValidationOutcome.PASS, "SELF_ASSERTED", List.of());
        } else {
            result = Objects.requireNonNull(validator.validate(principal, profile, request), "validator result");
        }

        EnrollmentMutationResult completed = store.complete(new EnrollmentJournalStore.Complete(request, result));
        reconcilePrincipal(completed.enrollment());
        return completed;
    }

    public IdentityEnrollmentRecord getEnrollmentStanding(String enrollmentId) throws IOException {
        IdentityEnrollmentRecord enrollment = store.load().enrollments().get(requireId("enrollmentId", enrollmentId));
        if (enrollment == null) throw new IdentityException(ErrorCode.NOT_FOUND, "enrollment not found");
        return enrollment;
    }

    private void reconcilePrincipal(IdentityEnrollmentRecord enrollment) throws Exception {
        if (successfulDecision(enrollment.decision())) promoter.reconcile(enrollment);
    }

    /** Adapter that requests the O-WP-001 lifecycle owner to promote a successful candidate to ENROLLED. */
    public static PrincipalEnrollmentPromoter lifecyclePromoter(PrincipalRegistry principals,
                                                                 PrincipalLifecycleService lifecycle,
                                                                 MutationContext authorityContext) {
        Objects.requireNonNull(principals, "principals");
        Objects.requireNonNull(lifecycle, "lifecycle");
        Objects.requireNonNull(authorityContext, "authorityContext");
        return enrollment -> {
            Principal current = principals.getPrincipal(enrollment.principalId());
            if (current.status() == PrincipalStatus.ENROLLED || current.status() == PrincipalStatus.ACTIVE) return;
            if (current.status() != PrincipalStatus.CANDIDATE) {
                throw new IdentityException(ErrorCode.CONFLICT, "successful enrollment cannot promote current principal standing");
            }
            String commandId = authorityContext.commandId() + ":promote:" + enrollment.enrollmentId();
            MutationContext promotion = new MutationContext(commandId, authorityContext.actorPrincipalRef(), authorityContext.authorityEvidenceRefs());
            lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(promotion, current.principalId(), current.currentRevision(),
                    PrincipalStatus.ENROLLED, "ENROLLMENT:" + enrollment.enrollmentId() + ":" + enrollment.decision(), null, null,
                    enrollment.proofingEvidenceRefs().isEmpty() ? List.of("ref:enrollment:" + enrollment.enrollmentId()) : enrollment.proofingEvidenceRefs()));
        };
    }
}
