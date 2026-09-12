package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.CanonicalDocumentGraphV2;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Objects;

/**
 * Immutable receipt produced by the external Core/policy effect authority.
 * Documents consumes and verifies this receipt; it never manufactures policy approval.
 */
public record DocumentEffectAdmissionDecision(
        String schema,
        String decisionId,
        Disposition disposition,
        String jobId,
        DocumentSpineMode mode,
        String sourceArtifactSha256,
        String sourceSemanticSha256,
        String operationIntentSha256,
        String planDigest,
        String capabilitySetSha256,
        String policyRevision,
        String policyDigestSha256,
        String reasonCode,
        Instant decidedAt) {

    public static final String SCHEMA_V1 = "DOCUMENT-EFFECT-ADMISSION-1";

    public enum Disposition {
        ALLOW,
        DENY,
        DEFER
    }

    public DocumentEffectAdmissionDecision {
        if (!SCHEMA_V1.equals(schema)) {
            throw new IllegalArgumentException("unsupported effect admission schema");
        }
        decisionId = text(decisionId, "decisionId", 512);
        Objects.requireNonNull(disposition, "disposition");
        jobId = text(jobId, "jobId", 128);
        Objects.requireNonNull(mode, "mode");
        requireSha(sourceArtifactSha256, "sourceArtifactSha256");
        requireSha(sourceSemanticSha256, "sourceSemanticSha256");
        requireSha(operationIntentSha256, "operationIntentSha256");
        requireSha(planDigest, "planDigest");
        requireSha(capabilitySetSha256, "capabilitySetSha256");
        policyRevision = text(policyRevision, "policyRevision", 512);
        requireSha(policyDigestSha256, "policyDigestSha256");
        reasonCode = text(reasonCode, "reasonCode", 512);
        Objects.requireNonNull(decidedAt, "decidedAt");
    }

    public void requireAllows(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            CanonicalDocumentGraphV2 sourceGraph) {
        Objects.requireNonNull(job, "job");
        Objects.requireNonNull(plan, "plan");
        Objects.requireNonNull(sourceGraph, "sourceGraph");
        if (disposition != Disposition.ALLOW) {
            throw new SecurityException("effect admission is not ALLOW: " + disposition + ":" + reasonCode);
        }
        if (!job.jobId().equals(jobId) || job.mode() != mode) {
            throw new SecurityException("effect admission job/mode binding mismatch");
        }
        if (!sourceGraph.sourceSha256().equals(sourceArtifactSha256)
                || !sourceGraph.semanticDigest().equals(sourceSemanticSha256)) {
            throw new SecurityException("effect admission source binding mismatch");
        }
        if (plan.operation() == null
                || !plan.operation().intentDigest().equals(operationIntentSha256)
                || !plan.digest().equals(planDigest)) {
            throw new SecurityException("effect admission plan/operation binding mismatch");
        }
        if (!capabilitySetDigest(plan).equals(capabilitySetSha256)) {
            throw new SecurityException("effect admission capability binding mismatch");
        }
    }

    public static String capabilitySetDigest(DocumentSpineExecutionPlan plan) {
        Objects.requireNonNull(plan, "plan");
        String material = plan.capabilityIds().stream().sorted().reduce((a, b) -> a + ";" + b).orElse("");
        return DocumentSpineDigests.sha256(material.getBytes(StandardCharsets.UTF_8));
    }

    private static String text(String value, String name, int max) {
        if (value == null || value.isBlank() || value.length() > max) {
            throw new IllegalArgumentException(name + " required");
        }
        return value;
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(name + " sha256 required");
        }
    }
}
