package org.systemmaster.core;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import static org.systemmaster.core.GovernanceAuthorizationContracts.*;

public final class EmergencyChangeAuthority {
    public record EmergencyGrant(
            String grantId,
            String principalRef,
            EmergencyScope scope,
            String authorizationEvidenceId,
            Instant issuedAt,
            String reviewObligationRef) {}

    private final AuthorizationAdapter authz;
    private final SecretReferenceValidator secrets;

    public EmergencyChangeAuthority(AuthorizationAdapter authz, SecretReferenceValidator secrets) {
        this.authz = Objects.requireNonNull(authz);
        this.secrets = Objects.requireNonNull(secrets);
    }

    public EmergencyGrant authorize(
            PrincipalLineage principal,
            EmergencyScope scope,
            AuthorizationEvidence authorization,
            Instant now,
            long currentRevocationEpoch) {
        Objects.requireNonNull(principal, "principal");
        validateScope(scope, now);
        authz.requireAuthorized(authorization, principal.principalRef(), "CHANGE_EMERGENCY_AUTHORIZE",
                scope.changeId(), now, currentRevocationEpoch);
        secrets.rejectPlaintextSecrets(scope.reason());
        for (SecretRef ref : scope.secretRefs()) secrets.requireUsableReference(ref);
        if (!scope.postEventReviewRequired()) throw new SecurityException("EMERGENCY_REVIEW_OBLIGATION_REQUIRED");
        return new EmergencyGrant(UUID.randomUUID().toString(), principal.principalRef(), scope,
                authorization.evidenceId(), now, "PCR:" + scope.changeId() + ":" + scope.revision());
    }

    public boolean permits(EmergencyGrant grant, String action, String targetRef, Instant now) {
        Objects.requireNonNull(grant, "grant");
        return now != null
                && !now.isBefore(grant.scope().notBefore())
                && now.isBefore(grant.scope().expiresAt())
                && grant.scope().allowedActions().contains(action)
                && grant.scope().targetRefs().contains(targetRef);
    }

    private static void validateScope(EmergencyScope scope, Instant now) {
        Objects.requireNonNull(scope, "scope");
        if (blank(scope.changeId()) || scope.revision() <= 0 || scope.targetRefs().isEmpty()
                || scope.allowedActions().isEmpty() || scope.notBefore() == null || scope.expiresAt() == null
                || !scope.notBefore().isBefore(scope.expiresAt()) || blank(scope.reason())) {
            throw new IllegalArgumentException("INVALID_EMERGENCY_SCOPE");
        }
        if (!scope.expiresAt().isAfter(now)) throw new SecurityException("EMERGENCY_SCOPE_EXPIRED");
        Set<String> allowed = Set.of("EXECUTE", "RECOVERY", "HALT", "ROLL_FORWARD", "ROLLBACK");
        if (!allowed.containsAll(scope.allowedActions())) throw new SecurityException("EMERGENCY_ACTION_OUT_OF_POLICY");
    }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
