package org.systemmaster.core;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;
import static org.systemmaster.core.GovernanceAuthorizationContracts.*;

public final class AuthorizationAdapter {
    private static final Set<String> CHANGE_ACTIONS = Set.of(
            "CHANGE_CREATE", "CHANGE_APPROVE", "CHANGE_EXECUTE",
            "CHANGE_EMERGENCY_AUTHORIZE", "CHANGE_RECOVERY", "CHANGE_CLOSE");

    public AuthorizationEvidence requireAuthorized(
            AuthorizationEvidence evidence,
            String principalRef,
            String action,
            String resourceRef,
            Instant now,
            long currentRevocationEpoch) {
        Objects.requireNonNull(evidence, "evidence");
        requireText(principalRef, "principalRef");
        requireText(action, "action");
        requireText(resourceRef, "resourceRef");
        Objects.requireNonNull(now, "now");
        if (!CHANGE_ACTIONS.contains(action)) throw new SecurityException("UNKNOWN_CHANGE_ACTION:" + action);
        if (!principalRef.equals(evidence.principalRef())) throw new SecurityException("AUTH_PRINCIPAL_MISMATCH");
        if (!action.equals(evidence.action())) throw new SecurityException("AUTH_ACTION_MISMATCH");
        if (!resourceRef.equals(evidence.resourceRef())) throw new SecurityException("AUTH_RESOURCE_MISMATCH");
        if (evidence.standing() != Standing.CURRENT) throw new SecurityException("AUTH_NOT_CURRENT:" + evidence.standing());
        if (evidence.revocationEpoch() != currentRevocationEpoch) throw new SecurityException("AUTH_REVOCATION_EPOCH_STALE");
        if (evidence.expiresAt() == null || !now.isBefore(evidence.expiresAt())) throw new SecurityException("AUTH_EXPIRED");
        return evidence;
    }

    public void requireDistinctActionEvidence(AuthorizationEvidence first, AuthorizationEvidence second) {
        Objects.requireNonNull(first, "first");
        Objects.requireNonNull(second, "second");
        if (first.action().equals(second.action())) throw new SecurityException("ACTION_AUTHORITY_NOT_DISTINCT");
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        return value;
    }
}
