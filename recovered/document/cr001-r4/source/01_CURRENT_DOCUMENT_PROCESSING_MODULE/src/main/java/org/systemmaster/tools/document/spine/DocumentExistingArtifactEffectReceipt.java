package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.DocumentFormat;

import java.util.List;

/** Common non-promoting receipt surface for REBUILD and MASTER candidate persistence. */
public interface DocumentExistingArtifactEffectReceipt {
    String schema();
    String jobId();
    String sourceArtifactSha256();
    String sourceSemanticSha256();
    String planDigest();
    String operationIntentSha256();
    String admissionDecisionId();
    String policyRevision();
    String policyDigestSha256();
    String capabilitySetSha256();
    DocumentFormat sourceFormat();
    DocumentFormat targetFormat();
    String candidateArtifactSha256();
    String candidateSemanticSha256();
    String rollbackArtifactSha256();
    String mutationEngine();
    String status();
    boolean resumed();

    default List<String> evidence() {
        return List.of(
                "effect-receipt-schema=" + schema(),
                "effect-receipt-status=" + status(),
                "effect-receipt-resumed=" + resumed(),
                "effect-admission-decision=" + admissionDecisionId(),
                "effect-policy-revision=" + policyRevision(),
                "effect-policy-digest=" + policyDigestSha256(),
                "effect-capability-set-digest=" + capabilitySetSha256(),
                "effect-source-format=" + sourceFormat(),
                "effect-target-format=" + targetFormat(),
                "effect-source-semantic=" + sourceSemanticSha256(),
                "effect-plan-digest=" + planDigest(),
                "effect-operation-intent=" + operationIntentSha256(),
                "effect-candidate-digest=" + candidateArtifactSha256(),
                "effect-candidate-semantic=" + candidateSemanticSha256(),
                "effect-rollback-digest=" + rollbackArtifactSha256(),
                "effect-mutation-engine=" + mutationEngine(),
                "effect-authority-standing=TECHNICAL_CANDIDATE_ONLY__UNPROVEN__UNPUBLISHED",
                "effect-finalCandidate-nonpromotion=true",
                "effect-publication-metadata-nonpromotion=true",
                "effect-author-metadata-nonpromotion=true");
    }
}
