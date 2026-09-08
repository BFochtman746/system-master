package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record RecoveryEvent(
        String recoveryId,
        long eventSeq,
        String eventType,
        Instant eventTime,
        Instant recordedAt,
        String actorRef,
        String causationRef,
        String correlationRef,
        String payloadDigest,
        List<String> evidenceRefs) {

    public RecoveryEvent {
        recoveryId = required(recoveryId, "recoveryId");
        if (eventSeq < 1) throw new IllegalArgumentException("eventSeq must be >= 1");
        eventType = required(eventType, "eventType");
        eventTime = Objects.requireNonNull(eventTime, "eventTime");
        recordedAt = Objects.requireNonNull(recordedAt, "recordedAt");
        actorRef = required(actorRef, "actorRef");
        causationRef = normalize(causationRef);
        correlationRef = normalize(correlationRef);
        payloadDigest = required(payloadDigest, "payloadDigest");
        evidenceRefs = List.copyOf(evidenceRefs == null ? List.of() : evidenceRefs);
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
