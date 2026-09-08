package org.systemmaster.learning;

import org.systemmaster.core.ExecutionGrantContracts.EligibilitySnapshot;
import org.systemmaster.core.ExecutionGrantContracts.ExecutionGrant;
import org.systemmaster.core.ExecutionGrantIssuer;
import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.time.Instant;
import java.util.Objects;

/**
 * Replaceable compatibility shim for the current System Master authorization model.
 * LearningCapabilityAdapter does not depend on these foundation classes.
 */
public final class CurrentSystemMasterLearningAuthorizer {
    public static final String SHIM_VERSION = "SYSTEM-MASTER-LEARNING-AUTH-SHIM-V1";

    private final ExecutionGrantIssuer grantIssuer;

    public CurrentSystemMasterLearningAuthorizer(ExecutionGrantIssuer grantIssuer) {
        this.grantIssuer = Objects.requireNonNull(grantIssuer, "grantIssuer");
    }

    public AuthorizedExecution authorize(
            ExecutionGrant grant,
            EligibilitySnapshot currentSnapshot,
            String presentedPrincipalRef,
            long currentAuthorizationRevocationEpoch,
            Instant now) {
        Objects.requireNonNull(now, "now");
        var validation = grantIssuer.validateForUse(
                grant,
                currentSnapshot,
                presentedPrincipalRef,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                currentAuthorizationRevocationEpoch,
                now);
        if (!validation.valid()) {
            throw new SecurityException("LEARNING_EXECUTION_DENIED:" + String.join(",", validation.reasons()));
        }
        return new AuthorizedExecution(
                grant.grantDigest(),
                grant.executorPrincipalRef(),
                grant.action(),
                grant.targetRefs(),
                grant.authorizationRevocationEpoch(),
                grant.issuedAt(),
                grant.expiresAt(),
                grant.snapshotDigest());
    }
}
