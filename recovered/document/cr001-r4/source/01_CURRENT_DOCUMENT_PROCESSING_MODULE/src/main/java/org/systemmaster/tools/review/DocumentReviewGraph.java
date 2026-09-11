package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.DocumentFormat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Format-neutral immutable proposal graph binding a semantic diff to exact source and target artifacts. */
public record DocumentReviewGraph(
        String schemaVersion,
        String reviewId,
        DocumentFormat format,
        String baseArtifactSha256,
        String targetArtifactSha256,
        String baseSemanticDigest,
        String targetSemanticDigest,
        Instant createdAt,
        List<ReviewChange> changes) {

    public static final String SCHEMA_V1 = "REVIEW-GRAPH-1";

    public DocumentReviewGraph {
        if (!SCHEMA_V1.equals(schemaVersion)) throw new IllegalArgumentException("unsupported review graph schema");
        if (reviewId == null || !reviewId.matches("review-[0-9a-f]{20}")) throw new IllegalArgumentException("invalid review id");
        Objects.requireNonNull(format, "format");
        requireSha(baseArtifactSha256, "base artifact");
        requireSha(targetArtifactSha256, "target artifact");
        requireSha(baseSemanticDigest, "base semantic");
        requireSha(targetSemanticDigest, "target semantic");
        Objects.requireNonNull(createdAt, "createdAt");
        changes = List.copyOf(Objects.requireNonNull(changes, "changes"));
        Set<String> ids = new HashSet<>();
        for (ReviewChange change : changes) if (!ids.add(change.changeId())) throw new IllegalArgumentException("duplicate review change id");
    }

    public String digest() {
        StringBuilder b = new StringBuilder();
        b.append(schemaVersion).append('|').append(reviewId).append('|').append(format).append('|')
                .append(baseArtifactSha256).append('|').append(targetArtifactSha256).append('|')
                .append(baseSemanticDigest).append('|').append(targetSemanticDigest).append('|').append(createdAt).append('\n');
        for (ReviewChange c : changes) {
            b.append(c.changeId()).append('|').append(c.type()).append('|').append(c.anchor().stableKey()).append('|')
                    .append(c.anchor().startOffset()).append('|').append(c.anchor().endOffset()).append('|')
                    .append(escape(c.beforeText())).append('|').append(escape(c.afterText())).append('|')
                    .append(escape(c.author())).append('|').append(c.proposedAt()).append('|').append(c.confidence()).append('\n');
        }
        return ReviewDigests.sha256(b.toString().getBytes(StandardCharsets.UTF_8));
    }

    public ReviewChange requireChange(String changeId) {
        for (ReviewChange c : changes) if (c.changeId().equals(changeId)) return c;
        throw new IllegalArgumentException("review change not found: " + changeId);
    }

    private static String escape(String value) {
        return Objects.requireNonNullElse(value, "").replace("\\", "\\\\").replace("|", "\\|").replace("\n", "\\n");
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
