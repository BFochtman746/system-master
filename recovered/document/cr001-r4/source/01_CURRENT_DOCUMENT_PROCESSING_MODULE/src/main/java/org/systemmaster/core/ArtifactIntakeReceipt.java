package org.systemmaster.core;

import java.time.Instant;
import java.util.List;

/** Durable evidence for exact bytes admitted or quarantined by PLATFORM-008. */
public record ArtifactIntakeReceipt(
        String intakeId,
        String artifactId,
        String digest,
        String logicalRef,
        long sizeBytes,
        String declaredMediaType,
        String detectedMediaType,
        String disposition,
        String reason,
        String producerRef,
        List<String> parentArtifactRefs,
        List<String> sourceRefs,
        Instant completedAt) {
    public ArtifactIntakeReceipt {
        if (intakeId == null || intakeId.isBlank()) throw new IllegalArgumentException("intakeId");
        if (artifactId == null || artifactId.isBlank()) throw new IllegalArgumentException("artifactId");
        if (digest == null || !digest.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("digest");
        if (!java.util.Objects.equals(logicalRef, "sha256:" + digest)) throw new IllegalArgumentException("logicalRef");
        if (sizeBytes < 0) throw new IllegalArgumentException("sizeBytes");
        if (!SetHolder.DISPOSITIONS.contains(disposition)) throw new IllegalArgumentException("disposition");
        if (reason == null || reason.isBlank()) throw new IllegalArgumentException("reason");
        if (producerRef == null || producerRef.isBlank()) throw new IllegalArgumentException("producerRef");
        parentArtifactRefs = parentArtifactRefs == null ? List.of() : List.copyOf(parentArtifactRefs);
        sourceRefs = sourceRefs == null ? List.of() : List.copyOf(sourceRefs);
        if (completedAt == null) throw new IllegalArgumentException("completedAt");
    }
    private static final class SetHolder {
        private static final java.util.Set<String> DISPOSITIONS = java.util.Set.of("VERIFIED", "QUARANTINED");
    }
}
