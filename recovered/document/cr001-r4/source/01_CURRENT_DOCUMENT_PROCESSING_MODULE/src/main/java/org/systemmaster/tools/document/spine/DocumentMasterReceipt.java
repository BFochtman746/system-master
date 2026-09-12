package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.DocumentFormat;

import java.util.Objects;

/** Durable technical receipt for a persisted same-format MASTER candidate. It is never proof or publication authority. */
public record DocumentMasterReceipt(
        String schema,
        String jobId,
        String sourceArtifactSha256,
        String sourceSemanticSha256,
        String planDigest,
        String operationIntentSha256,
        String admissionDecisionId,
        String policyRevision,
        String policyDigestSha256,
        String capabilitySetSha256,
        DocumentFormat sourceFormat,
        DocumentFormat targetFormat,
        String candidateArtifactSha256,
        String candidateSemanticSha256,
        String rollbackArtifactSha256,
        String mutationEngine,
        String status,
        boolean resumed) implements DocumentExistingArtifactEffectReceipt {

    public static final String SCHEMA_V1 = "DOCUMENT-MASTER-RECEIPT-1";
    public static final String STATUS_PERSISTED = "MASTER_CANDIDATE_PERSISTED_UNPROVEN";
    public static final String STATUS_RESUMED = "MASTER_CANDIDATE_PERSISTED_UNPROVEN_RESUMED";

    public DocumentMasterReceipt {
        if (!SCHEMA_V1.equals(schema)) throw new IllegalArgumentException("unsupported master receipt schema");
        text(jobId, "jobId");
        sha(sourceArtifactSha256, "sourceArtifactSha256");
        sha(sourceSemanticSha256, "sourceSemanticSha256");
        sha(planDigest, "planDigest");
        sha(operationIntentSha256, "operationIntentSha256");
        text(admissionDecisionId, "admissionDecisionId");
        text(policyRevision, "policyRevision");
        sha(policyDigestSha256, "policyDigestSha256");
        sha(capabilitySetSha256, "capabilitySetSha256");
        Objects.requireNonNull(sourceFormat, "sourceFormat");
        Objects.requireNonNull(targetFormat, "targetFormat");
        if (sourceFormat != targetFormat) throw new IllegalArgumentException("MASTER must remain same-format");
        sha(candidateArtifactSha256, "candidateArtifactSha256");
        sha(candidateSemanticSha256, "candidateSemanticSha256");
        sha(rollbackArtifactSha256, "rollbackArtifactSha256");
        text(mutationEngine, "mutationEngine");
        if (!(STATUS_PERSISTED.equals(status) || STATUS_RESUMED.equals(status))) {
            throw new IllegalArgumentException("unsupported master status");
        }
        if (resumed != STATUS_RESUMED.equals(status)) {
            throw new IllegalArgumentException("master resumed/status mismatch");
        }
    }

    private static void sha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }

    private static void text(String value, String name) {
        if (value == null || value.isBlank() || value.length() > 512) throw new IllegalArgumentException(name + " required");
    }
}
