package org.systemmaster.tools.document;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Binds operation intent, preservation evidence, proof receipts, and final-state promotion. */
public final class DocumentFinalizationGate {
    public record Result(
            String operationIntentDigest,
            String resultArtifactSha256,
            FinalDocumentProofPolicy.State state,
            boolean finalPromotionAllowed,
            Set<DocumentProofReceipt.Gate> passed,
            Set<DocumentProofReceipt.Gate> missing,
            List<String> diagnostics) {}

    private final FinalDocumentProofPolicy policy = new FinalDocumentProofPolicy();

    public Result evaluate(
            DocumentOperationContract operation,
            byte[] candidateArtifact,
            NativePartPreservationMap.Assessment preservation,
            List<DocumentProofReceipt> receipts,
            String mutationEngine) {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(candidateArtifact, "candidateArtifact");
        Objects.requireNonNull(preservation, "preservation");
        Objects.requireNonNull(receipts, "receipts");
        String resultSha = CanonicalDocumentGraph.sha256(candidateArtifact);
        ArrayList<String> diagnostics = new ArrayList<>();
        boolean hardFailure = false;

        if (!operation.sourceArtifactSha256().equals(preservation.sourceArtifactSha256())) {
            diagnostics.add("PRESERVATION_SOURCE_DIGEST_MISMATCH");
            hardFailure = true;
        }
        if (!resultSha.equals(preservation.resultArtifactSha256())) {
            diagnostics.add("PRESERVATION_RESULT_DIGEST_MISMATCH");
            hardFailure = true;
        }
        if (!operation.expectedChangedNativeParts().equals(preservation.expectedChangePatterns())) {
            diagnostics.add("PRESERVATION_EXPECTATION_SET_MISMATCH");
            hardFailure = true;
        }
        if (!preservation.pass()) {
            diagnostics.add("NATIVE_PART_PRESERVATION_FAILED");
            diagnostics.addAll(preservation.diagnostics());
            hardFailure = true;
        }

        ArrayList<DocumentProofReceipt> allReceipts = new ArrayList<>(receipts);
        if (allReceipts.stream().noneMatch(r -> r.gate() == DocumentProofReceipt.Gate.PACKAGE)) {
            diagnostics.add("PACKAGE_PROOF_RECEIPT_REQUIRED");
        }

        Set<DocumentProofReceipt.Gate> required = operation.finalCandidate()
                ? EnumSet.allOf(DocumentProofReceipt.Gate.class)
                : operation.requiredProofGates();
        ProofRequirementProfile profile = new ProofRequirementProfile(
                operation.sourceArtifactSha256(),
                resultSha,
                required,
                Set.of(),
                mutationEngine,
                operation.visualImpact() != DocumentOperationContract.VisualImpact.NONE);
        FinalDocumentProofPolicy.Evaluation evaluation = policy.evaluate(profile, allReceipts);
        diagnostics.addAll(evaluation.diagnostics());
        FinalDocumentProofPolicy.State state = hardFailure ? FinalDocumentProofPolicy.State.PROOF_FAILED : evaluation.state();
        boolean finalAllowed = operation.finalCandidate()
                && !hardFailure
                && state == FinalDocumentProofPolicy.State.FINAL_PROOFED
                && evaluation.missing().isEmpty();
        return new Result(operation.intentDigest(), resultSha, state, finalAllowed, evaluation.passed(), evaluation.missing(), List.copyOf(diagnostics));
    }
}
