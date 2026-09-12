package org.systemmaster.core;

import java.time.Instant;

/** Durable resumable-transfer state; offsets are monotonic and exact. */
public record ArtifactTransferSession(
        String transferId,
        String artifactId,
        String producerRef,
        String declaredMediaType,
        long expectedSizeBytes,
        String expectedSha256,
        long receivedBytes,
        String state,
        Instant createdAt,
        Instant updatedAt) {
    public ArtifactTransferSession {
        if (transferId == null || transferId.isBlank()) throw new IllegalArgumentException("transferId");
        if (artifactId == null || artifactId.isBlank()) throw new IllegalArgumentException("artifactId");
        if (producerRef == null || producerRef.isBlank()) throw new IllegalArgumentException("producerRef");
        if (declaredMediaType == null || declaredMediaType.isBlank()) throw new IllegalArgumentException("declaredMediaType");
        if (expectedSizeBytes < 0 || receivedBytes < 0 || receivedBytes > expectedSizeBytes) throw new IllegalArgumentException("sizes");
        if (expectedSha256 != null && !expectedSha256.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("expectedSha256");
        if (!java.util.Set.of("OPEN","COMPLETE","ABORTED").contains(state)) throw new IllegalArgumentException("state");
        if (createdAt == null || updatedAt == null || updatedAt.isBefore(createdAt)) throw new IllegalArgumentException("time");
    }
}
