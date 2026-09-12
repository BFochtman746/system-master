package org.systemmaster.tools.document;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Immutable evidence receipt for one independent proof gate. */
public record DocumentProofReceipt(
        Gate gate,
        Status status,
        String sourceSha256,
        String resultSha256,
        String engine,
        String engineVersion,
        Instant completedAt,
        List<String> evidence,
        Map<String,String> measurements) {

    public enum Gate { PACKAGE, SEMANTIC, RENDERED, ACCESSIBILITY, SECURITY, PROVENANCE }
    public enum Status { PASS, FAIL, NOT_APPLICABLE }

    public DocumentProofReceipt {
        Objects.requireNonNull(gate, "gate");
        Objects.requireNonNull(status, "status");
        requireSha(sourceSha256, "source");
        requireSha(resultSha256, "result");
        if (engine == null || engine.isBlank()) throw new IllegalArgumentException("engine required");
        engineVersion = Objects.requireNonNullElse(engineVersion, "unknown");
        Objects.requireNonNull(completedAt, "completedAt");
        evidence = List.copyOf(Objects.requireNonNullElse(evidence, List.of()));
        measurements = Map.copyOf(Objects.requireNonNullElse(measurements, Map.of()));
        if (status == Status.PASS && evidence.isEmpty()) throw new IllegalArgumentException("passing proof requires evidence");
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
