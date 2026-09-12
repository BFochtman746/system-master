package org.systemmaster.core;

import java.time.Instant;
import java.util.List;

/** Canonical PLATFORM-008 request; domain semantics remain outside this authority. */
public record ArtifactIntakeRequest(
        String intakeId,
        String artifactId,
        String producerRef,
        String declaredMediaType,
        String expectedSha256,
        Long expectedSizeBytes,
        List<String> parentArtifactRefs,
        List<String> sourceRefs,
        Instant requestedAt) {
    public ArtifactIntakeRequest {
        intakeId = text(intakeId, "intakeId");
        artifactId = text(artifactId, "artifactId");
        producerRef = text(producerRef, "producerRef");
        declaredMediaType = media(declaredMediaType);
        if (expectedSha256 != null && !expectedSha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("expectedSha256");
        }
        if (expectedSizeBytes != null && expectedSizeBytes < 0) throw new IllegalArgumentException("expectedSizeBytes");
        parentArtifactRefs = refs(parentArtifactRefs);
        sourceRefs = refs(sourceRefs);
        if (parentArtifactRefs.contains(artifactId)) throw new IllegalArgumentException("artifact cannot parent itself");
        if (requestedAt == null) throw new IllegalArgumentException("requestedAt");
    }

    private static String text(String v, String n) {
        if (v == null || v.isBlank() || v.length() > 512) throw new IllegalArgumentException(n);
        return v;
    }
    private static String media(String v) {
        v = text(v, "declaredMediaType").toLowerCase(java.util.Locale.ROOT);
        if (!v.matches("[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+")) throw new IllegalArgumentException("declaredMediaType");
        return v;
    }
    private static List<String> refs(List<String> values) {
        if (values == null) return List.of();
        var copy = List.copyOf(values);
        if (copy.size() > 256 || copy.stream().anyMatch(v -> v == null || v.isBlank())) throw new IllegalArgumentException("refs");
        if (copy.stream().distinct().count() != copy.size()) throw new IllegalArgumentException("duplicate refs");
        return copy;
    }
}
