package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Objects;

public record DurableWorkIdentity(
        String taskId,
        String workflowId,
        String stageId,
        String workUnitId,
        String parentWorkUnitId,
        String intentDigest,
        String semanticOwnerRef,
        Instant createdAt,
        String classification) {

    public DurableWorkIdentity {
        taskId = required(taskId, "taskId");
        workflowId = required(workflowId, "workflowId");
        stageId = required(stageId, "stageId");
        workUnitId = required(workUnitId, "workUnitId");
        parentWorkUnitId = normalize(parentWorkUnitId);
        intentDigest = required(intentDigest, "intentDigest");
        semanticOwnerRef = required(semanticOwnerRef, "semanticOwnerRef");
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
        classification = required(classification, "classification");
        if (workUnitId.equals(parentWorkUnitId)) {
            throw new IllegalArgumentException("work unit cannot parent itself");
        }
    }

    private static String required(String value, String name) {
        String normalized = normalize(value);
        if (normalized == null) throw new IllegalArgumentException(name + " is required");
        return normalized;
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
