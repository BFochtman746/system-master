package org.systemmaster.core;

import java.time.Instant;
import java.util.List;
import java.util.Set;

public final class GovernanceAuthorizationContracts {
    private GovernanceAuthorizationContracts() {}

    public enum Standing { CURRENT, REVOKED, UNKNOWN }

    public record AuthorizationEvidence(
            String evidenceId,
            String principalRef,
            String action,
            String resourceRef,
            String policyVersion,
            long revocationEpoch,
            Standing standing,
            Instant evaluatedAt,
            Instant expiresAt) {}

    public record PrincipalLineage(
            String principalRef,
            Set<String> equivalentPrincipalRefs,
            Set<String> roles,
            Set<String> attributes) {
        public PrincipalLineage {
            equivalentPrincipalRefs = Set.copyOf(equivalentPrincipalRefs);
            roles = Set.copyOf(roles);
            attributes = Set.copyOf(attributes);
        }
        public boolean sameLogicalPrincipal(String other) {
            return principalRef.equals(other) || equivalentPrincipalRefs.contains(other);
        }
    }

    public record SecretRef(
            String reference,
            String secretClass,
            String providerRef,
            String versionRef,
            Standing standing) {}

    public record ApprovalBinding(
            String changeId,
            long revision,
            String targetDigest,
            long impactAssessmentVersion,
            long recoveryPlanVersion,
            String policyDigest) {}

    public record ApprovalObligation(
            String obligationId,
            String requiredRole,
            boolean independentFromExecutor,
            Instant expiresAt) {}

    public record EmergencyScope(
            String changeId,
            long revision,
            Set<String> targetRefs,
            Set<String> allowedActions,
            Instant notBefore,
            Instant expiresAt,
            String reason,
            boolean postEventReviewRequired,
            List<SecretRef> secretRefs) {
        public EmergencyScope {
            targetRefs = Set.copyOf(targetRefs);
            allowedActions = Set.copyOf(allowedActions);
            secretRefs = List.copyOf(secretRefs);
        }
    }
}
