package org.systemmaster.continuity;

import java.util.List;
import java.util.Objects;

/** Enforces evidence-bearing terminal recovery transitions while retaining residual references. */
public final class RecoveryClosureCoordinator {
    private final RecoveryRegistry registry;
    public RecoveryClosureCoordinator(RecoveryRegistry registry) { this.registry = Objects.requireNonNull(registry); }

    public RecoveryRecord markRecovered(String recoveryId, long expectedVersion, List<String> verificationEvidence, List<String> residualRefs, String stateDigest) {
        if (verificationEvidence == null || verificationEvidence.isEmpty()) throw new IllegalStateException("verification evidence required");
        List<String> residual = List.copyOf(residualRefs == null ? List.of() : residualRefs);
        String evidence = "verification=" + String.join(",", verificationEvidence) + ";residual=" + String.join(",", residual) + ";digest=" + RecoveryAuthorizationGate.req(stateDigest,"stateDigest");
        RecoveryRecord current = registry.getRecovery(recoveryId).orElseThrow(() -> new IllegalArgumentException("recovery missing"));
        if (current.state() != RecoveryRecord.RecoveryState.VERIFYING) throw new IllegalStateException("recovery must be VERIFYING before RECOVERED");
        return registry.transitionRecovery(recoveryId, expectedVersion, RecoveryRecord.RecoveryState.VERIFYING, RecoveryRecord.RecoveryState.RECOVERED,
                evidence, residual, stateDigest);
    }
}
