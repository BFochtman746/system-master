package org.systemmaster.tools.document;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Synchronization bridge between CDG-2 reverse adapters and the existing preservation/proof authorities.
 * An adapter cannot promote its own output; every candidate is independently preservation-assessed and
 * finalization-gated after open-world targeting checks.
 */
public final class GovernedCdg2MutationCoordinator {

    public record OperationResult(
            CanonicalDocumentGraphV2NativeAdapter.MutationResult mutation,
            CanonicalDocumentGraphV2 resultGraph,
            NativePartPreservationMap.Assessment preservation,
            DocumentFinalizationGate.Result finalization,
            List<String> diagnostics) {
        public OperationResult {
            Objects.requireNonNull(mutation, "mutation");
            Objects.requireNonNull(resultGraph, "resultGraph");
            Objects.requireNonNull(preservation, "preservation");
            Objects.requireNonNull(finalization, "finalization");
            diagnostics = List.copyOf(Objects.requireNonNullElse(diagnostics, List.of()));
        }
    }
    public record Result(
            CanonicalDocumentGraphV2NativeAdapter.MutationResult mutation,
            NativePartPreservationMap.Assessment preservation,
            DocumentFinalizationGate.Result finalization,
            List<String> diagnostics) {
        public Result {
            Objects.requireNonNull(mutation, "mutation");
            Objects.requireNonNull(preservation, "preservation");
            Objects.requireNonNull(finalization, "finalization");
            diagnostics = List.copyOf(Objects.requireNonNullElse(diagnostics, List.of()));
        }
    }

    private final NativePartPreservationMap preservationMap = new NativePartPreservationMap();
    private final OpenWorldFeatureDiscovery openWorld = new OpenWorldFeatureDiscovery();
    private final DocumentFinalizationGate finalizationGate = new DocumentFinalizationGate();

    public Result execute(
            CanonicalDocumentGraphV2NativeAdapter adapter,
            DocumentOperationContract operation,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            CanonicalDocumentGraphV2 targetGraph,
            Set<String> targetedElementIds,
            List<DocumentProofReceipt> proofReceipts,
            String mutationEngine) throws IOException {
        Objects.requireNonNull(adapter, "adapter");
        Objects.requireNonNull(operation, "operation");
        byte[] source = Objects.requireNonNull(sourceBytes, "sourceBytes").clone();
        Objects.requireNonNull(sourceGraph, "sourceGraph");
        Objects.requireNonNull(targetGraph, "targetGraph");
        Set<String> targets = Set.copyOf(Objects.requireNonNullElse(targetedElementIds, Set.of()));
        List<DocumentProofReceipt> receipts = List.copyOf(Objects.requireNonNullElse(proofReceipts, List.of()));
        if (targets.isEmpty()) {
            throw new IllegalArgumentException("at least one CDG-2 element target is required");
        }
        if (mutationEngine == null || mutationEngine.isBlank()) {
            throw new IllegalArgumentException("mutation engine required");
        }

        DocumentFormat format = sourceGraph.sourceFormat();
        if (adapter.format() != format || targetGraph.sourceFormat() != format) {
            throw new IllegalArgumentException("adapter/source/target format mismatch");
        }
        String sourceSha = CanonicalDocumentGraph.sha256(source);
        if (!sourceSha.equals(sourceGraph.sourceSha256())) {
            throw new IllegalArgumentException("source bytes do not match CDG-2 source digest");
        }
        if (!sourceSha.equals(operation.sourceArtifactSha256())) {
            throw new IllegalArgumentException("operation source artifact digest mismatch");
        }
        if (!sourceGraph.semanticDigest().equals(operation.sourceSemanticSha256())) {
            throw new IllegalArgumentException("operation source semantic digest mismatch");
        }

        LinkedHashSet<String> targetedNativeParts = new LinkedHashSet<>();
        for (String id : targets) {
            CanonicalDocumentGraphV2.Element element = sourceGraph.requireElement(id);
            targetedNativeParts.add(element.nativeAnchor().nativePart());
        }
        for (DocumentSelector selector : operation.selectors()) {
            if (selector.kind() == DocumentSelector.Kind.NATIVE_PART) {
                targetedNativeParts.add(selector.value());
            }
        }
        targetedNativeParts.addAll(operation.expectedChangedNativeParts());
        OpenWorldFeatureDiscovery.LossGateResult lossGate =
                openWorld.evaluateTargetingPatterns(sourceGraph, targetedNativeParts);
        if (!lossGate.allowed()) {
            throw new IllegalStateException(String.join(";", lossGate.diagnostics()));
        }

        CanonicalDocumentGraphV2NativeAdapter.MutationRequest request =
                new CanonicalDocumentGraphV2NativeAdapter.MutationRequest(
                        source,
                        sourceGraph,
                        targetGraph,
                        targets,
                        operation.expectedChangedNativeParts());
        CanonicalDocumentGraphV2NativeAdapter.MutationResult mutation = adapter.apply(request);
        String resultSha = CanonicalDocumentGraph.sha256(mutation.resultBytes());
        if (!sourceSha.equals(mutation.sourceSha256())) {
            throw new IllegalStateException("adapter reported incorrect source digest");
        }
        if (!resultSha.equals(mutation.resultSha256())) {
            throw new IllegalStateException("adapter reported incorrect result digest");
        }
        if (!resultSha.equals(targetGraph.sourceSha256())) {
            throw new IllegalStateException("adapter result does not match target CDG-2 artifact digest");
        }

        NativePartPreservationMap.Assessment preservation = preservationMap.assess(
                format,
                source,
                mutation.resultBytes(),
                operation.expectedChangedNativeParts());
        DocumentFinalizationGate.Result finalization = finalizationGate.evaluate(
                operation,
                mutation.resultBytes(),
                preservation,
                receipts,
                mutationEngine);

        ArrayList<String> diagnostics = new ArrayList<>();
        diagnostics.addAll(lossGate.diagnostics());
        diagnostics.addAll(mutation.diagnostics());
        diagnostics.addAll(preservation.diagnostics());
        diagnostics.addAll(finalization.diagnostics());
        return new Result(mutation, preservation, finalization, diagnostics);
    }
    /**
     * Operation-bound execution used by DOCUMENT-SPINE-002A. The adapter mutates from DOC-OP intent,
     * then the coordinator independently re-projects the result into CDG-2 before preservation/proof evaluation.
     */
    public OperationResult executeOperation(
            CanonicalDocumentGraphV2OperationAdapter adapter,
            DocumentOperationContract operation,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            Set<String> targetedElementIds,
            List<DocumentProofReceipt> proofReceipts,
            String mutationEngine) throws IOException {
        Objects.requireNonNull(adapter, "adapter");
        Objects.requireNonNull(operation, "operation");
        byte[] source = Objects.requireNonNull(sourceBytes, "sourceBytes").clone();
        Objects.requireNonNull(sourceGraph, "sourceGraph");
        Set<String> targets = Set.copyOf(Objects.requireNonNullElse(targetedElementIds, Set.of()));
        List<DocumentProofReceipt> receipts = List.copyOf(Objects.requireNonNullElse(proofReceipts, List.of()));
        if (targets.isEmpty()) {
            throw new IllegalArgumentException("at least one CDG-2 element target is required");
        }
        if (mutationEngine == null || mutationEngine.isBlank()) {
            throw new IllegalArgumentException("mutation engine required");
        }

        DocumentFormat format = sourceGraph.sourceFormat();
        if (adapter.format() != format) {
            throw new IllegalArgumentException("adapter/source format mismatch");
        }
        String sourceSha = CanonicalDocumentGraph.sha256(source);
        if (!sourceSha.equals(sourceGraph.sourceSha256())) {
            throw new IllegalArgumentException("source bytes do not match CDG-2 source digest");
        }
        if (!sourceSha.equals(operation.sourceArtifactSha256())) {
            throw new IllegalArgumentException("operation source artifact digest mismatch");
        }
        if (!sourceGraph.semanticDigest().equals(operation.sourceSemanticSha256())) {
            throw new IllegalArgumentException("operation source semantic digest mismatch");
        }

        LinkedHashSet<String> selectorTargets = new LinkedHashSet<>();
        for (DocumentSelector selector : operation.selectors()) {
            if (selector.kind() == DocumentSelector.Kind.NODE_ID && selector.value().startsWith("e-")) {
                selectorTargets.add(selector.value());
            }
        }
        if (!selectorTargets.isEmpty() && !selectorTargets.equals(targets)) {
            throw new IllegalArgumentException("operation CDG-2 selectors and targeted element ids differ");
        }

        LinkedHashSet<String> targetedNativeParts = targetedNativeParts(operation, sourceGraph, targets);
        OpenWorldFeatureDiscovery.LossGateResult lossGate =
                openWorld.evaluateTargetingPatterns(sourceGraph, targetedNativeParts);
        if (!lossGate.allowed()) {
            throw new IllegalStateException(String.join(";", lossGate.diagnostics()));
        }

        CanonicalDocumentGraphV2OperationAdapter.OperationMutationRequest request =
                new CanonicalDocumentGraphV2OperationAdapter.OperationMutationRequest(
                        source,
                        sourceGraph,
                        operation,
                        targets,
                        operation.expectedChangedNativeParts());
        CanonicalDocumentGraphV2NativeAdapter.MutationResult mutation = adapter.applyOperation(request);
        String resultSha = CanonicalDocumentGraph.sha256(mutation.resultBytes());
        if (!sourceSha.equals(mutation.sourceSha256())) {
            throw new IllegalStateException("adapter reported incorrect source digest");
        }
        if (!resultSha.equals(mutation.resultSha256())) {
            throw new IllegalStateException("adapter reported incorrect result digest");
        }

        CanonicalDocumentGraphV2 resultGraph = new CanonicalDocumentGraphV2Projector().project(format, mutation.resultBytes());
        if (!resultSha.equals(resultGraph.sourceSha256())) {
            throw new IllegalStateException("independent CDG-2 result projection digest mismatch");
        }
        NativePartPreservationMap.Assessment preservation = preservationMap.assess(
                format,
                source,
                mutation.resultBytes(),
                operation.expectedChangedNativeParts());
        DocumentFinalizationGate.Result finalization = finalizationGate.evaluate(
                operation,
                mutation.resultBytes(),
                preservation,
                receipts,
                mutationEngine);

        ArrayList<String> diagnostics = new ArrayList<>();
        diagnostics.addAll(lossGate.diagnostics());
        diagnostics.addAll(mutation.diagnostics());
        diagnostics.addAll(preservation.diagnostics());
        diagnostics.addAll(finalization.diagnostics());
        return new OperationResult(mutation, resultGraph, preservation, finalization, diagnostics);
    }

    private static LinkedHashSet<String> targetedNativeParts(
            DocumentOperationContract operation,
            CanonicalDocumentGraphV2 sourceGraph,
            Set<String> targets) {
        LinkedHashSet<String> targetedNativeParts = new LinkedHashSet<>();
        for (String id : targets) {
            CanonicalDocumentGraphV2.Element element = sourceGraph.requireElement(id);
            targetedNativeParts.add(element.nativeAnchor().nativePart());
        }
        for (DocumentSelector selector : operation.selectors()) {
            if (selector.kind() == DocumentSelector.Kind.NATIVE_PART) {
                targetedNativeParts.add(selector.value());
            }
        }
        targetedNativeParts.addAll(operation.expectedChangedNativeParts());
        return targetedNativeParts;
    }

}
