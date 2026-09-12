package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.DocumentFormat;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Immutable local version snapshot. Bytes are copied at creation and retrieval boundaries. */
public record DocumentVersionSnapshot(
        String versionId,
        DocumentFormat format,
        String artifactSha256,
        String semanticDigest,
        List<String> parentVersionIds,
        String branch,
        String author,
        Instant createdAt,
        String message,
        byte[] artifactBytes) {

    public DocumentVersionSnapshot {
        if (versionId == null || !versionId.matches("ver-[0-9a-f]{20}")) throw new IllegalArgumentException("invalid version id");
        Objects.requireNonNull(format, "format");
        requireSha(artifactSha256, "artifact");
        requireSha(semanticDigest, "semantic");
        parentVersionIds = List.copyOf(Objects.requireNonNullElse(parentVersionIds, List.of()));
        if (parentVersionIds.size() > 2) throw new IllegalArgumentException("at most two parents supported");
        branch = requireText(branch, "branch", 128);
        author = requireText(author, "author", 256);
        Objects.requireNonNull(createdAt, "createdAt");
        message = Objects.requireNonNullElse(message, "");
        if (message.length() > 4096) throw new IllegalArgumentException("message too long");
        artifactBytes = Objects.requireNonNull(artifactBytes, "artifactBytes").clone();
        if (!ReviewDigests.sha256(artifactBytes).equals(artifactSha256)) throw new IllegalArgumentException("artifact digest mismatch");
    }

    @Override public byte[] artifactBytes() { return artifactBytes.clone(); }
    private static String requireText(String v, String n, int max) { if (v == null || v.isBlank() || v.length() > max) throw new IllegalArgumentException(n + " required"); return v; }
    private static void requireSha(String v, String n) { if (v == null || !v.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(n + " sha256 required"); }
}
