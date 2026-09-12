package org.systemmaster.tools.document;

import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

/** Requirements applied by the final proof policy for one candidate artifact. */
public record ProofRequirementProfile(
        String expectedSourceSha256,
        String expectedResultSha256,
        Set<DocumentProofReceipt.Gate> requiredGates,
        Set<DocumentProofReceipt.Gate> allowedNotApplicableGates,
        String mutationEngine,
        boolean requireIndependentRenderedEngine) {

    public ProofRequirementProfile {
        if (expectedSourceSha256 != null) requireSha(expectedSourceSha256, "source");
        requireSha(expectedResultSha256, "result");
        requiredGates = Set.copyOf(Objects.requireNonNullElse(requiredGates, Set.of()));
        allowedNotApplicableGates = Set.copyOf(Objects.requireNonNullElse(allowedNotApplicableGates, Set.of()));
        if (!requiredGates.containsAll(allowedNotApplicableGates)) throw new IllegalArgumentException("N/A gates must be a subset of required gates");
        mutationEngine = Objects.requireNonNullElse(mutationEngine, "").trim();
    }

    public static ProofRequirementProfile finalArtifact(String sourceSha256, String resultSha256, String mutationEngine) {
        return new ProofRequirementProfile(
                sourceSha256,
                resultSha256,
                EnumSet.allOf(DocumentProofReceipt.Gate.class),
                EnumSet.noneOf(DocumentProofReceipt.Gate.class),
                mutationEngine,
                true);
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
