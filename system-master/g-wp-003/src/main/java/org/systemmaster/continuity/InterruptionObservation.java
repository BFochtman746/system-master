package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;

public record InterruptionObservation(
        String interruptionId,
        String workUnitId,
        String attemptId,
        String source,
        Instant observedAt,
        Instant lastHeartbeatAt,
        String leaseState,
        String processInstanceRef,
        String providerState,
        List<String> evidenceRefs,
        String dedupeKey,
        String observationDigest) {
    public InterruptionObservation {
        interruptionId = required(interruptionId, "interruptionId");
        workUnitId = required(workUnitId, "workUnitId");
        attemptId = required(attemptId, "attemptId");
        source = required(source, "source");
        observedAt = java.util.Objects.requireNonNull(observedAt, "observedAt");
        leaseState = required(leaseState, "leaseState");
        processInstanceRef = normalize(processInstanceRef);
        providerState = normalize(providerState);
        evidenceRefs = List.copyOf(evidenceRefs == null ? List.of() : evidenceRefs);
        dedupeKey = required(dedupeKey, "dedupeKey");
        observationDigest = required(observationDigest, "observationDigest");
    }
    private static String required(String v, String n){String x=normalize(v);if(x==null)throw new IllegalArgumentException(n+" is required");return x;}
    private static String normalize(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
