package org.systemmaster.tools.document.spine;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Durable one-stage checkpoint. PASS receipts are resumable only under the same idempotency key. */
public record DocumentSpineStageReceipt(
        String schema,
        String jobId,
        DocumentSpineStage stage,
        Status status,
        String inputSha256,
        String outputSha256,
        String idempotencyKey,
        Instant completedAt,
        List<String> evidence,
        List<String> diagnostics) {

    public static final String SCHEMA_V1 = "DOCUMENT-SPINE-STAGE-1";

    public enum Status {
        PASS,
        NOT_REQUIRED,
        FAIL
    }

    public DocumentSpineStageReceipt {
        if (!SCHEMA_V1.equals(schema)) {
            throw new IllegalArgumentException("unsupported stage receipt schema");
        }
        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId required");
        }
        Objects.requireNonNull(stage, "stage");
        Objects.requireNonNull(status, "status");
        requireOptionalSha(inputSha256, "input");
        requireOptionalSha(outputSha256, "output");
        requireSha(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(completedAt, "completedAt");
        evidence = List.copyOf(Objects.requireNonNullElse(evidence, List.of()));
        diagnostics = List.copyOf(Objects.requireNonNullElse(diagnostics, List.of()));
        if (status == Status.PASS && evidence.isEmpty()) {
            throw new IllegalArgumentException("PASS stage receipt requires evidence");
        }
    }

    public boolean resumable(String expectedKey) {
        return status == Status.PASS && idempotencyKey.equals(expectedKey);
    }

    private static void requireOptionalSha(String value, String name) {
        if (value != null) {
            requireSha(value, name);
        }
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(name + " sha256 required");
        }
    }
}
