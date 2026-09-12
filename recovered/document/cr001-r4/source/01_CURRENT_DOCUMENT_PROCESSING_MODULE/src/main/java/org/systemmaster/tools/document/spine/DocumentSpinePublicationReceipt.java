package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.FinalDocumentProofPolicy;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Durable publication outcome; publication is allowed only after the publication-class proof policy passes. */
public record DocumentSpinePublicationReceipt(
        String jobId,
        String resultArtifactId,
        String resultSha256,
        DocumentSpinePublicationClass publicationClass,
        FinalDocumentProofPolicy.State proofState,
        String versionId,
        List<String> evidence,
        Instant publishedAt) {

    public DocumentSpinePublicationReceipt {
        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId required");
        }
        if (resultArtifactId == null || resultArtifactId.isBlank()) {
            throw new IllegalArgumentException("resultArtifactId required");
        }
        if (resultSha256 == null || !resultSha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("result sha256 required");
        }
        Objects.requireNonNull(publicationClass, "publicationClass");
        Objects.requireNonNull(proofState, "proofState");
        if (versionId == null || versionId.isBlank()) {
            throw new IllegalArgumentException("versionId required");
        }
        evidence = List.copyOf(Objects.requireNonNullElse(evidence, List.of()));
        if (evidence.isEmpty()) {
            throw new IllegalArgumentException("publication evidence required");
        }
        Objects.requireNonNull(publishedAt, "publishedAt");
    }
}
