package org.systemmaster.core;

import java.util.Set;

/** Frozen PLATFORM-008 admission limits. */
public record ArtifactIntakePolicy(
        long maxBytes,
        int maxArchiveEntries,
        long maxArchiveUncompressedBytes,
        double maxArchiveCompressionRatio,
        int maxNestedArchiveDepth,
        Set<String> allowedDeclaredMediaTypes) {
    public ArtifactIntakePolicy {
        if (maxBytes < 1) throw new IllegalArgumentException("maxBytes");
        if (maxArchiveEntries < 1) throw new IllegalArgumentException("maxArchiveEntries");
        if (maxArchiveUncompressedBytes < 1) throw new IllegalArgumentException("maxArchiveUncompressedBytes");
        if (!Double.isFinite(maxArchiveCompressionRatio) || maxArchiveCompressionRatio < 1.0d) {
            throw new IllegalArgumentException("maxArchiveCompressionRatio");
        }
        if (maxNestedArchiveDepth < 0) throw new IllegalArgumentException("maxNestedArchiveDepth");
        allowedDeclaredMediaTypes = allowedDeclaredMediaTypes == null ? Set.of() : Set.copyOf(allowedDeclaredMediaTypes);
        if (allowedDeclaredMediaTypes.stream().anyMatch(v -> v == null || v.isBlank())) {
            throw new IllegalArgumentException("allowedDeclaredMediaTypes");
        }
    }

    public static ArtifactIntakePolicy conservative(long maxBytes) {
        long expanded = maxBytes > Long.MAX_VALUE / 4L ? Long.MAX_VALUE : maxBytes * 4L;
        return new ArtifactIntakePolicy(maxBytes, 10_000, expanded, 100.0d, 0, Set.of());
    }
}
