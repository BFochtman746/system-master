package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxPackageEngine;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class Df002aQh001SyncGatePortableTests {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testCdg2SelectorCompatibility();
        testGovernedCdg2MutationRequiresPreservationAndProof();
        testUndeclaredNativeChangeCannotPromote();
        testUnknownNativeTargetIsBlockedBeforeAdapter();
        System.out.println("DF002A_QH001_SYNC_GATE_PORTABLE_PASS assertions=" + assertions);
    }

    private static void testCdg2SelectorCompatibility() {
        DocumentSelector cdg1 = DocumentSelector.node("n-legacy");
        DocumentSelector cdg2 = DocumentSelector.node("e-0123456789abcdef01234567");
        check(cdg1.value().startsWith("n-"), "CDG-1 selector remains compatible");
        check(cdg2.value().startsWith("e-"), "CDG-2 element selector is accepted");
        expectIllegalArgument(() -> DocumentSelector.node("x-invalid"), "unknown selector prefix fails closed");
    }

    private static void testGovernedCdg2MutationRequiresPreservationAndProof() throws Exception {
        DocumentProcessingService service = new DocumentProcessingService();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha"));
        byte[] result = new DocxPackageEngine().replaceText(source, "Alpha", "Omega").bytes();
        CanonicalDocumentGraphV2 sourceGraph = service.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        CanonicalDocumentGraphV2 targetGraph = service.projectCanonicalGraphV2(DocumentFormat.DOCX, result);
        String targetId = findTextElement(sourceGraph, "Alpha");
        DocumentOperationContract operation = DocumentOperationContract.replaceText(
                "sync-gate-replace",
                sourceGraph,
                List.of(targetId),
                "Alpha",
                "Omega",
                Set.of("word/document.xml"),
                true);

        GovernedCdg2MutationCoordinator coordinator = new GovernedCdg2MutationCoordinator();
        StaticDocxAdapter adapter = new StaticDocxAdapter(result);
        List<DocumentProofReceipt> completeProof = completeProof(
                sourceGraph.sourceSha256(),
                targetGraph.sourceSha256(),
                "sync-adapter");
        GovernedCdg2MutationCoordinator.Result accepted = coordinator.execute(
                adapter,
                operation,
                source,
                sourceGraph,
                targetGraph,
                Set.of(targetId),
                completeProof,
                "sync-adapter");
        check(accepted.preservation().pass(), "governed CDG-2 mutation preserves unrelated native parts");
        check(accepted.finalization().finalPromotionAllowed(), "complete independent proof can promote final candidate");
        check(accepted.finalization().missing().isEmpty(), "complete proof has no missing gates");

        ArrayList<DocumentProofReceipt> missingSecurity = new ArrayList<>(completeProof);
        missingSecurity.removeIf(receipt -> receipt.gate() == DocumentProofReceipt.Gate.SECURITY);
        GovernedCdg2MutationCoordinator.Result incomplete = coordinator.execute(
                adapter,
                operation,
                source,
                sourceGraph,
                targetGraph,
                Set.of(targetId),
                missingSecurity,
                "sync-adapter");
        check(!incomplete.finalization().finalPromotionAllowed(), "missing security proof cannot promote final candidate");
        check(incomplete.finalization().missing().contains(DocumentProofReceipt.Gate.SECURITY), "security proof remains explicitly missing");
    }

    private static void testUndeclaredNativeChangeCannotPromote() throws Exception {
        DocumentProcessingService service = new DocumentProcessingService();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha"));
        byte[] textEdited = new DocxPackageEngine().replaceText(source, "Alpha", "Omega").bytes();
        byte[] result = addNativePart(textEdited, "customXml/surprise.xml", "<surprise xmlns=\"urn:sync\">x</surprise>");
        CanonicalDocumentGraphV2 sourceGraph = service.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        CanonicalDocumentGraphV2 targetGraph = service.projectCanonicalGraphV2(DocumentFormat.DOCX, result);
        String targetId = findTextElement(sourceGraph, "Alpha");
        DocumentOperationContract operation = DocumentOperationContract.replaceText(
                "sync-gate-undeclared-change",
                sourceGraph,
                List.of(targetId),
                "Alpha",
                "Omega",
                Set.of("word/document.xml"),
                true);
        GovernedCdg2MutationCoordinator.Result rejected = new GovernedCdg2MutationCoordinator().execute(
                new StaticDocxAdapter(result),
                operation,
                source,
                sourceGraph,
                targetGraph,
                Set.of(targetId),
                completeProof(sourceGraph.sourceSha256(), targetGraph.sourceSha256(), "sync-adapter"),
                "sync-adapter");
        check(!rejected.preservation().pass(), "undeclared native-part addition fails preservation");
        check(!rejected.finalization().finalPromotionAllowed(), "preservation failure cannot promote final candidate");
        check(rejected.finalization().diagnostics().stream().anyMatch(value -> value.contains("NATIVE_PART_PRESERVATION_FAILED")), "preservation failure is diagnosable");
    }

    private static void testUnknownNativeTargetIsBlockedBeforeAdapter() throws Exception {
        DocumentProcessingService service = new DocumentProcessingService();
        byte[] baseSource = new DocxFullLaneEngine().createDocument(List.of("Alpha"));
        byte[] source = addNativePart(baseSource, "customXml/item42.xml", "<custom xmlns=\"urn:test\">preserve</custom>");
        CanonicalDocumentGraphV2 sourceGraph = service.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        String targetId = findTextElement(sourceGraph, "Alpha");
        DocumentOperationContract operation = new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "sync-gate-unknown-target",
                sourceGraph.sourceSha256(),
                sourceGraph.semanticDigest(),
                DocumentOperationContract.Type.METADATA_UPDATE,
                List.of(DocumentSelector.node(targetId), DocumentSelector.nativePart("customXml/item42.xml")),
                "Attempt to mutate an unmodeled native feature",
                Map.of(),
                DocumentOperationContract.Risk.REVERSIBLE_EDIT,
                sourceGraph.sourceSha256(),
                Set.of("customXml/item42.xml"),
                DocumentOperationContract.VisualImpact.NONE,
                false,
                List.of(),
                false,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        CountingDocxAdapter adapter = new CountingDocxAdapter(source);
        expectIllegalState(
                () -> new GovernedCdg2MutationCoordinator().execute(
                        adapter,
                        operation,
                        source,
                        sourceGraph,
                        sourceGraph,
                        Set.of(targetId),
                        List.of(),
                        "sync-adapter"),
                "unknown native feature targeting fails closed");
        check(adapter.calls == 0, "unknown-feature gate blocks before adapter mutation executes");
    }

    private static List<DocumentProofReceipt> completeProof(String sourceSha, String resultSha, String mutationEngine) {
        ArrayList<DocumentProofReceipt> receipts = new ArrayList<>();
        for (DocumentProofReceipt.Gate gate : DocumentProofReceipt.Gate.values()) {
            String engine = gate == DocumentProofReceipt.Gate.RENDERED ? "independent-render" : "proof-" + gate.name().toLowerCase();
            if (engine.equalsIgnoreCase(mutationEngine)) {
                engine = "independent-" + engine;
            }
            receipts.add(new DocumentProofReceipt(
                    gate,
                    DocumentProofReceipt.Status.PASS,
                    sourceSha,
                    resultSha,
                    engine,
                    "1",
                    Instant.parse("2026-08-31T16:00:00Z"),
                    List.of("sync-gate-evidence:" + gate),
                    Map.of("gate", gate.name())));
        }
        return List.copyOf(receipts);
    }

    private static String findTextElement(CanonicalDocumentGraphV2 graph, String text) {
        return graph.elements().stream()
                .filter(element -> text.equals(element.text()))
                .map(CanonicalDocumentGraphV2.Element::id)
                .findFirst()
                .orElseThrow(() -> new AssertionError("text element not found: " + text));
    }

    private static byte[] addNativePart(byte[] source, String partName, String xml) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put(partName, xml.getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void expectIllegalArgument(Throwing action, String message) {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected.
        } catch (Exception unexpected) {
            throw new AssertionError(message, unexpected);
        }
    }

    private static void expectIllegalState(Throwing action, String message) {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalStateException expected) {
            // Expected.
        } catch (Exception unexpected) {
            throw new AssertionError(message, unexpected);
        }
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }

    private static class StaticDocxAdapter implements CanonicalDocumentGraphV2NativeAdapter {
        private final byte[] result;

        StaticDocxAdapter(byte[] result) {
            this.result = result.clone();
        }

        @Override
        public DocumentFormat format() {
            return DocumentFormat.DOCX;
        }

        @Override
        public MutationResult apply(MutationRequest request) {
            return new MutationResult(
                    result,
                    CanonicalDocumentGraph.sha256(request.sourceBytes()),
                    CanonicalDocumentGraph.sha256(result),
                    List.of("word/document.xml"),
                    List.of("static-test-adapter"));
        }
    }

    private static final class CountingDocxAdapter extends StaticDocxAdapter {
        private int calls;

        CountingDocxAdapter(byte[] result) {
            super(result);
        }

        @Override
        public MutationResult apply(MutationRequest request) {
            calls++;
            return super.apply(request);
        }
    }
}
