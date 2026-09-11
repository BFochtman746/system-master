package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.FinalDocumentProofPolicy;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Immutable lineage record committed only after the required proof gates pass. */
public record DocumentSpineVersionReceipt(
        String versionId,
        String jobId,
        String projectId,
        String sourceArtifactId,
        String resultArtifactId,
        DocumentFormat format,
        String sourceSha256,
        String resultSha256,
        String operationIntentDigest,
        FinalDocumentProofPolicy.State proofState,
        List<String> capabilityIds,
        List<String> evidence,
        Instant createdAt) {

    public DocumentSpineVersionReceipt {
        if (versionId == null || !versionId.matches("spv-[0-9a-f]{24}")) {
            throw new IllegalArgumentException("versionId required");
        }
        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId required");
        }
        if (projectId == null || projectId.isBlank()) {
            throw new IllegalArgumentException("projectId required");
        }
        if (sourceArtifactId == null || sourceArtifactId.isBlank()) {
            throw new IllegalArgumentException("sourceArtifactId required");
        }
        if (resultArtifactId == null || resultArtifactId.isBlank()) {
            throw new IllegalArgumentException("resultArtifactId required");
        }
        Objects.requireNonNull(format, "format");
        requireSha(sourceSha256, "source");
        requireSha(resultSha256, "result");
        requireSha(operationIntentDigest, "operation intent");
        Objects.requireNonNull(proofState, "proofState");
        capabilityIds = List.copyOf(Objects.requireNonNullElse(capabilityIds, List.of()));
        evidence = List.copyOf(Objects.requireNonNullElse(evidence, List.of()));
        if (capabilityIds.isEmpty() || evidence.isEmpty()) {
            throw new IllegalArgumentException("version requires capability and evidence bindings");
        }
        Objects.requireNonNull(createdAt, "createdAt");
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(name + " sha256 required");
        }
    }
}
