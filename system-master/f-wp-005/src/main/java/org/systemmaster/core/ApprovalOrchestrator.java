package org.systemmaster.core;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import static org.systemmaster.core.GovernanceAuthorizationContracts.*;

public final class ApprovalOrchestrator {
    public record ApprovalDecision(
            String approvalId,
            String obligationId,
            ApprovalBinding binding,
            String approvingPrincipalRef,
            String decision,
            Instant decidedAt,
            Instant expiresAt,
            String authorizationEvidenceId,
            String decisionDigest) {}

    private final AuthorizationAdapter authz;
    private final Map<String, ApprovalDecision> decisionsByObligation = new LinkedHashMap<>();

    public ApprovalOrchestrator(AuthorizationAdapter authz) { this.authz = Objects.requireNonNull(authz); }

    public ApprovalDecision approve(
            ApprovalObligation obligation,
            ApprovalBinding binding,
            PrincipalLineage approver,
            String executorPrincipalRef,
            AuthorizationEvidence authorization,
            Instant now,
            long currentRevocationEpoch) {
        Objects.requireNonNull(obligation, "obligation");
        validateBinding(binding);
        Objects.requireNonNull(approver, "approver");
        Objects.requireNonNull(now, "now");
        if (obligation.expiresAt() == null || !now.isBefore(obligation.expiresAt())) throw new SecurityException("APPROVAL_OBLIGATION_EXPIRED");
        if (!approver.roles().contains(obligation.requiredRole())) throw new SecurityException("APPROVER_ROLE_MISSING");
        if (obligation.independentFromExecutor() && approver.sameLogicalPrincipal(executorPrincipalRef)) {
            throw new SecurityException("SEPARATION_OF_DUTIES_VIOLATION");
        }
        authz.requireAuthorized(authorization, approver.principalRef(), "CHANGE_APPROVE", binding.changeId(), now, currentRevocationEpoch);
        ApprovalDecision existing = decisionsByObligation.get(obligation.obligationId());
        String digest = digest(binding, approver.principalRef(), "APPROVE", authorization.evidenceId());
        if (existing != null) {
            if (existing.decisionDigest().equals(digest)) return existing;
            throw new IllegalStateException("APPROVAL_REPLAY_CONFLICT");
        }
        ApprovalDecision decision = new ApprovalDecision(UUID.randomUUID().toString(), obligation.obligationId(), binding,
                approver.principalRef(), "APPROVE", now, obligation.expiresAt(), authorization.evidenceId(), digest);
        decisionsByObligation.put(obligation.obligationId(), decision);
        return decision;
    }

    public boolean isCurrent(ApprovalDecision decision, ApprovalBinding currentBinding, Instant now) {
        Objects.requireNonNull(decision, "decision");
        validateBinding(currentBinding);
        return decision.binding().equals(currentBinding)
                && decision.expiresAt() != null
                && now.isBefore(decision.expiresAt());
    }

    private static void validateBinding(ApprovalBinding b) {
        Objects.requireNonNull(b, "binding");
        if (blank(b.changeId()) || b.revision() <= 0 || blank(b.targetDigest())
                || b.impactAssessmentVersion() <= 0 || b.recoveryPlanVersion() <= 0 || blank(b.policyDigest())) {
            throw new IllegalArgumentException("INCOMPLETE_APPROVAL_BINDING");
        }
    }

    private static String digest(ApprovalBinding b, String principal, String decision, String evidenceId) {
        return Integer.toHexString(Objects.hash(b, principal, decision, evidenceId));
    }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
