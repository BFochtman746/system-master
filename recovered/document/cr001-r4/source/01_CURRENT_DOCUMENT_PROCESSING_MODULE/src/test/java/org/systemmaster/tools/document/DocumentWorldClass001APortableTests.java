package org.systemmaster.tools.document;

import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxPackageEngine;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class DocumentWorldClass001APortableTests {
    static int assertions;

    public static void main(String[] args) throws Exception {
        DocumentProcessingService service = new DocumentProcessingService();
        NativePartPreservationMap preservationEngine = new NativePartPreservationMap();

        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha paragraph", "Beta paragraph"));
        CanonicalDocumentGraph graph = service.projectCanonicalGraph(DocumentFormat.DOCX, source);
        check(graph.nodes().stream().anyMatch(n -> n.type() == CanonicalDocumentGraph.NodeType.ROOT), "CDG root exists");
        check(graph.nativeParts().stream().allMatch(CanonicalDocumentGraph.NativePart::preserveByDefault), "native parts preserve by default");
        String firstParagraph = graph.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.PARAGRAPH).findFirst().orElseThrow().id();
        check(graph.requireNode(firstParagraph).text().contains("Alpha"), "CDG node lookup works");
        check(graph.childrenOf(graph.nodes().getFirst().id()).size() >= 2, "CDG child traversal works");

        DocxPackageEngine.Mutation mutation = new DocxPackageEngine().replaceText(source, "Alpha", "Omega");
        byte[] result = mutation.bytes();
        NativePartPreservationMap.Assessment goodPreservation = preservationEngine.assess(
                DocumentFormat.DOCX, source, result, Set.of("word/document.xml"));
        check(goodPreservation.pass(), "declared DOCX part change passes preservation gate");
        check(goodPreservation.changedParts() == 1, "exactly one DOCX native part changed");
        check(goodPreservation.parts().stream().filter(p -> p.change() == NativePartPreservationMap.Change.PRESERVED).count() > 1, "unrelated DOCX parts preserved byte-for-byte");

        NativePartPreservationMap.Assessment badPreservation = preservationEngine.assess(
                DocumentFormat.DOCX, source, result, Set.of("docProps/core.xml"));
        check(!badPreservation.pass(), "undeclared DOCX part change fails preservation gate");
        check(badPreservation.unexpectedChanges() == 1, "unexpected DOCX part change counted");
        check(badPreservation.diagnostics().stream().anyMatch(v -> v.startsWith("UNEXPECTED_NATIVE_PART_CHANGE:word/document.xml")), "unexpected part diagnostic names native part");

        DocumentOperationContract operation = DocumentOperationContract.replaceText(
                "doc-001a-op-1", graph, List.of(firstParagraph), "Alpha", "Omega", Set.of("word/document.xml"), true);
        check(operation.schemaVersion().equals(DocumentOperationContract.SCHEMA_V1), "operation schema v1 bound");
        check(operation.requiredProofGates().containsAll(EnumSet.allOf(DocumentProofReceipt.Gate.class)), "final candidate requires all proof gates");
        check(operation.intentDigest().matches("[0-9a-f]{64}"), "operation intent digest deterministic");
        check(operation.sourceArtifactSha256().equals(graph.sourceSha256()), "operation binds source artifact digest");
        check(operation.sourceSemanticSha256().equals(graph.semanticDigest()), "operation binds source semantic digest");
        expectFailure(() -> new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1, "bad", graph.sourceSha256(), graph.semanticDigest(),
                DocumentOperationContract.Type.DELETE_CONTENT, List.of(DocumentSelector.node(firstParagraph)), "delete",
                Map.of(), DocumentOperationContract.Risk.REVERSIBLE_EDIT, null, Set.of("word/document.xml"),
                DocumentOperationContract.VisualImpact.TEXT_REFLOW, false, List.of(), false, Set.of()),
                "effectful operation without rollback rejected");
        expectFailure(() -> new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1, "bad-loss", graph.sourceSha256(), graph.semanticDigest(),
                DocumentOperationContract.Type.CONVERT, List.of(DocumentSelector.root()), "convert lossily",
                Map.of(), DocumentOperationContract.Risk.LOSSY_TRANSFORM, graph.sourceSha256(), Set.of("<artifact>"),
                DocumentOperationContract.VisualImpact.FULL_RENDER_CHANGE, false, List.of(), false, Set.of()),
                "lossy transform requires explicit loss declaration");
        expectFailure(() -> DocumentSelector.nativePart("../evil.xml"), "unsafe native part selector rejected");
        expectFailure(() -> new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1, "bad-wildcard", graph.sourceSha256(), graph.semanticDigest(),
                DocumentOperationContract.Type.REPLACE_TEXT, List.of(DocumentSelector.node(firstParagraph)), "replace",
                Map.of("old", "Alpha", "new", "Omega"), DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(), Set.of("*"),
                DocumentOperationContract.VisualImpact.TEXT_REFLOW, false, List.of(), false, Set.of()),
                "blanket expected-part wildcard rejected by operation contract");
        expectFailure(() -> preservationEngine.assess(DocumentFormat.DOCX, source, result, Set.of("*")),
                "blanket expected-part wildcard rejected by preservation engine");

        String resultSha = CanonicalDocumentGraph.sha256(result);
        List<DocumentProofReceipt> independentReceipts = proofReceipts(graph.sourceSha256(), resultSha, "independent-renderer", true);
        DocumentFinalizationGate finalization = new DocumentFinalizationGate();
        DocumentFinalizationGate.Result finalOk = finalization.evaluate(operation, result, goodPreservation, independentReceipts, "DocxPackageEngine");
        check(finalOk.state() == FinalDocumentProofPolicy.State.FINAL_PROOFED, "complete independent proof reaches FINAL_PROOFED");
        check(finalOk.finalPromotionAllowed(), "complete independent proof permits final promotion");
        check(finalOk.missing().isEmpty(), "final proof has no missing gates");

        List<DocumentProofReceipt> noPackageReceipt = proofReceipts(graph.sourceSha256(), resultSha, "independent-renderer", false);
        DocumentFinalizationGate.Result noPackage = finalization.evaluate(operation, result, goodPreservation, noPackageReceipt, "DocxPackageEngine");
        check(!noPackage.finalPromotionAllowed(), "native-part preservation cannot substitute for independent package proof");
        check(noPackage.missing().contains(DocumentProofReceipt.Gate.PACKAGE), "missing package proof is explicitly reported");
        check(noPackage.diagnostics().contains("PACKAGE_PROOF_RECEIPT_REQUIRED"), "package-proof receipt requirement diagnosed");

        ArrayList<DocumentProofReceipt> missingAccessibility = new ArrayList<>(independentReceipts);
        missingAccessibility.removeIf(r -> r.gate() == DocumentProofReceipt.Gate.ACCESSIBILITY);
        DocumentFinalizationGate.Result incomplete = finalization.evaluate(operation, result, goodPreservation, missingAccessibility, "DocxPackageEngine");
        check(!incomplete.finalPromotionAllowed(), "missing accessibility blocks final promotion");
        check(incomplete.missing().contains(DocumentProofReceipt.Gate.ACCESSIBILITY), "missing gate reported");

        DocumentFinalizationGate.Result preserveFail = finalization.evaluate(operation, result, badPreservation, independentReceipts, "DocxPackageEngine");
        check(preserveFail.state() == FinalDocumentProofPolicy.State.PROOF_FAILED, "unexpected native-part change hard-fails finalization");
        check(!preserveFail.finalPromotionAllowed(), "unexpected native-part change blocks final promotion");

        List<DocumentProofReceipt> selfCertified = proofReceipts(graph.sourceSha256(), resultSha, "DocxPackageEngine", true);
        DocumentFinalizationGate.Result selfFail = finalization.evaluate(operation, result, goodPreservation, selfCertified, "DocxPackageEngine");
        check(selfFail.state() == FinalDocumentProofPolicy.State.PROOF_FAILED, "mutation engine cannot self-certify render gate");
        check(selfFail.diagnostics().contains("RENDER_ENGINE_NOT_INDEPENDENT"), "self-certification diagnosed");

        FinalDocumentProofPolicy policy = new FinalDocumentProofPolicy();
        List<DocumentProofReceipt> outOfOrder = List.of(
                receipt(DocumentProofReceipt.Gate.ACCESSIBILITY, graph.sourceSha256(), resultSha, "a11y", Instant.parse("2026-08-30T00:00:00Z"), DocumentProofReceipt.Status.PASS));
        var outOfOrderEval = policy.evaluate(new ProofRequirementProfile(graph.sourceSha256(), resultSha, Set.of(DocumentProofReceipt.Gate.ACCESSIBILITY), Set.of(), "", false), outOfOrder);
        check(outOfOrderEval.state() == FinalDocumentProofPolicy.State.DRAFT, "verification state cannot skip structural/semantic/render prerequisites");

        List<DocumentProofReceipt> latestWins = List.of(
                receipt(DocumentProofReceipt.Gate.PACKAGE, graph.sourceSha256(), resultSha, "pkg", Instant.parse("2026-08-30T00:00:00Z"), DocumentProofReceipt.Status.FAIL),
                receipt(DocumentProofReceipt.Gate.PACKAGE, graph.sourceSha256(), resultSha, "pkg", Instant.parse("2026-08-30T00:01:00Z"), DocumentProofReceipt.Status.PASS));
        var latestEval = policy.evaluate(new ProofRequirementProfile(graph.sourceSha256(), resultSha, Set.of(DocumentProofReceipt.Gate.PACKAGE), Set.of(), "", false), latestWins);
        check(latestEval.state() == FinalDocumentProofPolicy.State.STRUCTURALLY_VERIFIED, "latest gate receipt wins deterministically");
        check(latestEval.diagnostics().stream().noneMatch(v -> v.startsWith("PROOF_FAILED")), "superseded old failure does not poison latest receipt");

        Instant tiedAt = Instant.parse("2026-08-30T00:02:00Z");
        List<DocumentProofReceipt> tiedPassAndFail = List.of(
                receipt(DocumentProofReceipt.Gate.PACKAGE, graph.sourceSha256(), resultSha, "pkg-pass", tiedAt, DocumentProofReceipt.Status.PASS),
                receipt(DocumentProofReceipt.Gate.PACKAGE, graph.sourceSha256(), resultSha, "pkg-fail", tiedAt, DocumentProofReceipt.Status.FAIL));
        var tiedEval = policy.evaluate(new ProofRequirementProfile(graph.sourceSha256(), resultSha, Set.of(DocumentProofReceipt.Gate.PACKAGE), Set.of(), "", false), tiedPassAndFail);
        check(tiedEval.state() == FinalDocumentProofPolicy.State.PROOF_FAILED, "same-timestamp conflicting receipts fail closed");
        check(tiedEval.diagnostics().stream().anyMatch(v -> v.contains("PACKAGE")), "same-timestamp gate failure is diagnosed");

        BufferedImage blank = new BufferedImage(200, 200, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = blank.createGraphics();
        g.setColor(Color.WHITE); g.fillRect(0, 0, 200, 200); g.dispose();
        VisualQaAnalyzer qa = new VisualQaAnalyzer();
        var blankMetrics = qa.analyze(blank);
        check(!blankMetrics.nonBlank(), "blank raster detected");
        check(qa.findings(blankMetrics, 0, 0, true).stream().anyMatch(f -> f.code().equals("BLANK_PAGE") && f.severity() == VisualQaAnalyzer.Severity.ERROR), "required nonblank page emits error");

        BufferedImage clipped = new BufferedImage(200, 200, BufferedImage.TYPE_INT_RGB);
        Graphics2D c = clipped.createGraphics();
        c.setColor(Color.WHITE); c.fillRect(0, 0, 200, 200);
        c.setColor(Color.BLACK); c.fillRect(0, 0, 200, 4); c.fillRect(0, 196, 200, 4); c.fillRect(0, 0, 4, 200); c.fillRect(196, 0, 4, 200); c.dispose();
        var clippedMetrics = qa.analyze(clipped);
        check(clippedMetrics.borderInkCoverage() > 0.25d, "edge ink metric captures synthetic clipping risk");
        check(qa.findings(clippedMetrics, 10, 0, true).stream().anyMatch(f -> f.code().equals("POSSIBLE_EDGE_CLIPPING")), "edge clipping heuristic emits review warning");

        System.out.println("DOCUMENT_WORLD_CLASS_001A_PORTABLE_PASS assertions=" + assertions
                + " cdg=" + CanonicalDocumentGraph.SCHEMA_V1
                + " op=" + DocumentOperationContract.SCHEMA_V1
                + " render=" + RenderProofReceipt.SCHEMA_V1);
    }

    private static List<DocumentProofReceipt> proofReceipts(String sourceSha, String resultSha, String renderEngine, boolean includePackage) {
        ArrayList<DocumentProofReceipt> out = new ArrayList<>();
        for (DocumentProofReceipt.Gate gate : DocumentProofReceipt.Gate.values()) {
            if (!includePackage && gate == DocumentProofReceipt.Gate.PACKAGE) continue;
            String engine = gate == DocumentProofReceipt.Gate.RENDERED ? renderEngine : "independent-" + gate.name().toLowerCase();
            out.add(receipt(gate, sourceSha, resultSha, engine, Instant.parse("2026-08-30T00:00:00Z"), DocumentProofReceipt.Status.PASS));
        }
        return List.copyOf(out);
    }

    private static DocumentProofReceipt receipt(DocumentProofReceipt.Gate gate, String sourceSha, String resultSha, String engine, Instant at, DocumentProofReceipt.Status status) {
        return new DocumentProofReceipt(gate, status, sourceSha, resultSha, engine, "1", at, List.of("evidence:" + gate), Map.of());
    }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expectFailure(Throwing action, String message) throws Exception { assertions++; try { action.run(); throw new AssertionError(message); } catch (IllegalArgumentException expected) { } }
    @FunctionalInterface interface Throwing { void run() throws Exception; }
}
