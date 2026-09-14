package org.systemmaster.foundation.identity;

import java.util.Objects;

/** Explicit external authorization seam. O-WP-001 never self-grants mutation authority. */
@FunctionalInterface
public interface IdentityMutationGate {
    void authorize(IdentityContracts.MutationContext context, String action, String targetPrincipalId);

    static IdentityMutationGate denyAll() {
        return (context, action, target) -> {
            throw new IdentityContracts.IdentityException(IdentityContracts.ErrorCode.DENIED,
                    "identity mutation requires explicit external authorization");
        };
    }

    static IdentityMutationGate exactBootstrapActor(String actorPrincipalRef) {
        Objects.requireNonNull(actorPrincipalRef, "actorPrincipalRef");
        return (context, action, target) -> {
            if (!actorPrincipalRef.equals(context.actorPrincipalRef())) {
                throw new IdentityContracts.IdentityException(IdentityContracts.ErrorCode.DENIED,
                        "actor is not the explicitly configured bootstrap authority");
            }
        };
    }
}
