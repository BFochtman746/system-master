package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.DocumentOperationContract;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Immutable capability-bound plan produced after CDG-2 understanding. */
public record DocumentSpineExecutionPlan(
        String jobId,
        DocumentSpineMode mode,
        DocumentOperationContract operation,
        Set<String> targetedElementIds,
        Set<String> capabilityIds,
        List<String> declaredLimitations) {

    public DocumentSpineExecutionPlan {
        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId required");
        }
        Objects.requireNonNull(mode, "mode");
        if ((mode == DocumentSpineMode.MASTER || mode == DocumentSpineMode.REBUILD) && operation == null) {
            throw new IllegalArgumentException("effectful existing-artifact mode requires operation");
        }
        if (mode == DocumentSpineMode.READ || mode == DocumentSpineMode.EXTRACT) {
            if (operation != null) {
                throw new IllegalArgumentException("read/extract mode cannot carry mutation operation");
            }
        }
        targetedElementIds = Set.copyOf(Objects.requireNonNullElse(targetedElementIds, Set.of()));
        capabilityIds = Set.copyOf(Objects.requireNonNullElse(capabilityIds, Set.of()));
        if (capabilityIds.isEmpty()) {
            throw new IllegalArgumentException("plan capability ids required");
        }
        declaredLimitations = List.copyOf(Objects.requireNonNullElse(declaredLimitations, List.of()));
    }

    public String digest() {
        String operationDigest = operation == null ? "READ_ONLY" : operation.intentDigest();
        String material = jobId + "|" + mode + "|" + operationDigest
                + "|targets=" + targetedElementIds.stream().sorted().reduce((a, b) -> a + ";" + b).orElse("")
                + "|caps=" + capabilityIds.stream().sorted().reduce((a, b) -> a + ";" + b).orElse("")
                + "|limits=" + declaredLimitations.stream().sorted().reduce((a, b) -> a + ";" + b).orElse("");
        return DocumentSpineDigests.sha256(material.getBytes(StandardCharsets.UTF_8));
    }
}
