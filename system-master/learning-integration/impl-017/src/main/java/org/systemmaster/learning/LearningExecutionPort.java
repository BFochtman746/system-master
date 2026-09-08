package org.systemmaster.learning;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

/**
 * Stable boundary owned by the Learning integration, not by a System Master
 * foundation work package. Foundation implementations may change behind this
 * port without forcing Learning to rebind to each F-WP revision.
 */
public final class LearningExecutionPort {
    private LearningExecutionPort() {}

    public static final String PORT_VERSION = "LEARNING-EXECUTION-PORT-V1";
    public static final String ACTION = "LEARNING_EXECUTE";
    public static final Set<String> TARGETS = Set.of("learning:adaptive-entry");

    public record AuthorizedExecution(
            String authorizationRef,
            String principalRef,
            String action,
            Set<String> targetRefs,
            long authorizationRevocationEpoch,
            Instant authorizedAt,
            Instant expiresAt,
            String proofDigest) {
        public AuthorizedExecution {
            requireText(authorizationRef, "authorizationRef");
            requireText(principalRef, "principalRef");
            requireText(action, "action");
            targetRefs = Set.copyOf(Objects.requireNonNull(targetRefs, "targetRefs"));
            if (targetRefs.isEmpty()) throw new IllegalArgumentException("TARGETS_REQUIRED");
            if (authorizationRevocationEpoch < 0) throw new IllegalArgumentException("INVALID_REVOCATION_EPOCH");
            authorizedAt = Objects.requireNonNull(authorizedAt, "authorizedAt");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            if (!authorizedAt.isBefore(expiresAt)) throw new IllegalArgumentException("INVALID_AUTHORIZATION_WINDOW");
            requireText(proofDigest, "proofDigest");
        }
    }

    public static void requireUsable(AuthorizedExecution authorization, String presentedPrincipalRef, Instant now) {
        Objects.requireNonNull(authorization, "authorization");
        Objects.requireNonNull(now, "now");
        requireText(presentedPrincipalRef, "presentedPrincipalRef");
        if (!authorization.principalRef().equals(presentedPrincipalRef)) {
            throw new SecurityException("LEARNING_EXECUTION_DENIED:PRINCIPAL_MISMATCH");
        }
        if (!ACTION.equals(authorization.action())) {
            throw new SecurityException("LEARNING_EXECUTION_DENIED:ACTION_MISMATCH");
        }
        if (!TARGETS.equals(authorization.targetRefs())) {
            throw new SecurityException("LEARNING_EXECUTION_DENIED:TARGET_SCOPE_MISMATCH");
        }
        if (!now.isBefore(authorization.expiresAt())) {
            throw new SecurityException("LEARNING_EXECUTION_DENIED:AUTHORIZATION_EXPIRED");
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
    }
}
