package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;

public record RecoveryClassification(
        String classificationId,
        String recoveryId,
        String workUnitId,
        RecoveryClass recoveryClass,
        List<String> reasonCodes,
        String checkpointCandidateRef,
        String externalEffectState,
        String compatibilityState,
        String authorityState,
        double confidence,
        List<String> evidenceRefs,
        String evidenceSetDigest,
        Instant createdAt) {
    public RecoveryClassification {
        classificationId = required(classificationId,"classificationId");
        recoveryId = required(recoveryId,"recoveryId");
        workUnitId = required(workUnitId,"workUnitId");
        recoveryClass = java.util.Objects.requireNonNull(recoveryClass,"recoveryClass");
        reasonCodes = List.copyOf(reasonCodes==null?List.of():reasonCodes);
        checkpointCandidateRef = normalize(checkpointCandidateRef);
        externalEffectState = required(externalEffectState,"externalEffectState");
        compatibilityState = required(compatibilityState,"compatibilityState");
        authorityState = required(authorityState,"authorityState");
        if(Double.isNaN(confidence)||confidence<0.0||confidence>1.0)throw new IllegalArgumentException("confidence must be 0..1");
        evidenceRefs = List.copyOf(evidenceRefs==null?List.of():evidenceRefs);
        evidenceSetDigest = required(evidenceSetDigest,"evidenceSetDigest");
        createdAt = java.util.Objects.requireNonNull(createdAt,"createdAt");
    }
    public enum RecoveryClass {
        RESUME,
        RECONCILE_THEN_RESUME,
        RESTART_SAFE_BOUNDARY,
        RESTART_BEGINNING,
        WAIT_DEPENDENCY,
        MIGRATE,
        OLD_RUNTIME,
        MANUAL,
        QUARANTINE,
        TERMINAL
    }
    private static String required(String v,String n){String x=normalize(v);if(x==null)throw new IllegalArgumentException(n+" is required");return x;}
    private static String normalize(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
