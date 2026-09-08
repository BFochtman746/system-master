package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Objects;

public record RecoveryRecord(
        String recoveryId,
        String workUnitId,
        long expectedWorkVersion,
        long recoveryEpoch,
        RecoveryState state,
        String interruptionRef,
        String classificationRef,
        String recoveryPlanRef,
        String currentClaimRef,
        String checkpointRef,
        ExternalEffectUncertainty externalEffectUncertainty,
        String blockedReason,
        Instant createdAt,
        Instant updatedAt,
        long version) {

    public RecoveryRecord {
        recoveryId = required(recoveryId, "recoveryId");
        workUnitId = required(workUnitId, "workUnitId");
        if (expectedWorkVersion < 0) throw new IllegalArgumentException("expectedWorkVersion must be >= 0");
        if (recoveryEpoch < 1) throw new IllegalArgumentException("recoveryEpoch must be >= 1");
        state = Objects.requireNonNull(state, "state");
        interruptionRef = required(interruptionRef, "interruptionRef");
        classificationRef = normalize(classificationRef);
        recoveryPlanRef = normalize(recoveryPlanRef);
        currentClaimRef = normalize(currentClaimRef);
        checkpointRef = normalize(checkpointRef);
        externalEffectUncertainty = Objects.requireNonNull(externalEffectUncertainty, "externalEffectUncertainty");
        blockedReason = normalize(blockedReason);
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        if (version < 1) throw new IllegalArgumentException("version must be >= 1");
    }

    public enum ExternalEffectUncertainty { NONE, UNKNOWN, DIVERGED }

    public enum RecoveryState {
        DETECTED,
        CLASSIFYING,
        PLAN_READY,
        CLAIMED,
        RECONCILING,
        RESTORING,
        RESUMING,
        VERIFYING,
        RECOVERED,
        WAITING_DEPENDENCY,
        BLOCKED,
        MANUAL_DECISION,
        QUARANTINED,
        TERMINAL_FAILED,
        CANCELLED_RECONCILED;

        public boolean terminal() {
            return this == RECOVERED || this == TERMINAL_FAILED || this == CANCELLED_RECONCILED;
        }
    }

    private static String required(String value, String name) {
        String normalized = normalize(value);
        if (normalized == null) throw new IllegalArgumentException(name + " is required");
        return normalized;
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
