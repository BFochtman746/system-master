package org.systemmaster.tools.document;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Deterministic, reversible intent contract. Models propose these; format engines execute validated operations. */
public record UniversalDocumentOperation(
        String operationId,
        String sourceSha256,
        Type type,
        List<String> targetNodeIds,
        Map<String,String> parameters,
        Risk risk,
        String rollbackArtifactSha256,
        Set<DocumentProofReceipt.Gate> requiredProofGates) {

    public enum Type { REPLACE_TEXT, INSERT_CONTENT, DELETE_CONTENT, REORDER, FORMAT, CONVERT, ACCESSIBILITY_REPAIR, METADATA_UPDATE }
    public enum Risk { READ_ONLY, REVERSIBLE_EDIT, LOSSY_TRANSFORM, SECURITY_SENSITIVE }

    public UniversalDocumentOperation {
        if (operationId == null || operationId.isBlank()) throw new IllegalArgumentException("operation id required");
        requireSha(sourceSha256, "source");
        Objects.requireNonNull(type, "type");
        targetNodeIds = List.copyOf(Objects.requireNonNullElse(targetNodeIds, List.of()));
        parameters = Map.copyOf(Objects.requireNonNullElse(parameters, Map.of()));
        Objects.requireNonNull(risk, "risk");
        if (rollbackArtifactSha256 != null) requireSha(rollbackArtifactSha256, "rollback artifact");
        requiredProofGates = Set.copyOf(Objects.requireNonNullElse(requiredProofGates, Set.of()));
        if (risk != Risk.READ_ONLY && rollbackArtifactSha256 == null) throw new IllegalArgumentException("effectful operation requires rollback artifact digest");
    }

    public String deterministicIdMaterial() {
        StringBuilder b = new StringBuilder(sourceSha256).append('|').append(type).append('|').append(risk);
        targetNodeIds.stream().sorted().forEach(v -> b.append("|target=").append(v));
        parameters.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> b.append('|').append(e.getKey()).append('=').append(e.getValue()));
        requiredProofGates.stream().sorted().forEach(g -> b.append("|proof=").append(g));
        return CanonicalDocumentGraph.sha256(b.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
