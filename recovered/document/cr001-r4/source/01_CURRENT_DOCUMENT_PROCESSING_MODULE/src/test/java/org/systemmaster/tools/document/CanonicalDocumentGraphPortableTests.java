package org.systemmaster.tools.document;

import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

public final class CanonicalDocumentGraphPortableTests {
    static int assertions;

    public static void main(String[] args) throws Exception {
        DocumentProcessingService service = new DocumentProcessingService();

        byte[] docx = new DocxFullLaneEngine().createDocument(List.of("Alpha", "Beta"));
        CanonicalDocumentGraph d1 = service.projectCanonicalGraph(DocumentFormat.DOCX, docx);
        CanonicalDocumentGraph d2 = service.projectCanonicalGraph(DocumentFormat.DOCX, docx);
        check(d1.kind() == CanonicalDocumentGraph.Kind.FLOW_DOCUMENT, "DOCX projects as flow document");
        check(d1.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.PARAGRAPH).count() == 2, "DOCX paragraphs projected");
        check(d1.nativeParts().stream().anyMatch(p -> p.partName().equals("word/document.xml")), "DOCX native part ledger retained");
        check(d1.nativeParts().stream().allMatch(CanonicalDocumentGraph.NativePart::preserveByDefault), "native parts preserve by default");
        check(d1.semanticDigest().equals(d2.semanticDigest()), "CDG semantic digest deterministic");
        check(d1.nodes().equals(d2.nodes()), "CDG stable node ids deterministic");

        PptxFullLaneEngine pptxEngine = new PptxFullLaneEngine();
        byte[] pptx = pptxEngine.createPresentation("CDG", List.of(
                new PptxFullLaneEngine.SlideSpec("One", List.of("A", "B"), "note"),
                new PptxFullLaneEngine.SlideSpec("Two", List.of("C"), null)));
        CanonicalDocumentGraph pg = service.projectCanonicalGraph(DocumentFormat.PPTX, pptx);
        check(pg.kind() == CanonicalDocumentGraph.Kind.PRESENTATION, "PPTX projects as presentation");
        check(pg.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.SLIDE).count() == 2, "PPTX slides projected");
        check(pg.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.SLIDE_TEXT).count() >= 5, "PPTX text projected");
        check(pg.nodes().stream().anyMatch(n -> n.sourceAnchor().nativePart().equals("ppt/slides/slide1.xml")), "PPTX source anchors retained");
        check(pg.nativeParts().stream().anyMatch(p -> p.partName().equals("ppt/presentation.xml")), "PPTX native part ledger retained");

        byte[] pdf = service.create(DocumentFormat.PDF, "Fixed layout proof");
        CanonicalDocumentGraph pdfGraph = service.projectCanonicalGraph(DocumentFormat.PDF, pdf);
        check(pdfGraph.kind() == CanonicalDocumentGraph.Kind.FIXED_LAYOUT, "PDF projects as fixed layout");
        check(pdfGraph.nodes().stream().anyMatch(n -> n.type() == CanonicalDocumentGraph.NodeType.PAGE), "PDF page projected");
        check(pdfGraph.nativeParts().size() == 1 && pdfGraph.nativeParts().getFirst().partName().equals("<artifact>"), "PDF native artifact retained");

        byte[] md = service.create(DocumentFormat.MARKDOWN, "Heading\n\nBody");
        CanonicalDocumentGraph mdGraph = service.projectCanonicalGraph(DocumentFormat.MARKDOWN, md);
        check(mdGraph.kind() == CanonicalDocumentGraph.Kind.TEXT_DOCUMENT, "Markdown projects as text document");
        check(mdGraph.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.TEXT_BLOCK).count() == 2, "Markdown blocks projected");

        String rollback = d1.sourceSha256();
        UniversalDocumentOperation op = new UniversalDocumentOperation(
                "op-1", d1.sourceSha256(), UniversalDocumentOperation.Type.REPLACE_TEXT,
                List.of(d1.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.PARAGRAPH).findFirst().orElseThrow().id()),
                Map.of("search", "Alpha", "replacement", "Omega"),
                UniversalDocumentOperation.Risk.REVERSIBLE_EDIT, rollback,
                EnumSet.of(DocumentProofReceipt.Gate.PACKAGE, DocumentProofReceipt.Gate.SEMANTIC, DocumentProofReceipt.Gate.RENDERED));
        check(op.deterministicIdMaterial().matches("[0-9a-f]{64}"), "operation deterministic digest available");
        check(op.requiredProofGates().contains(DocumentProofReceipt.Gate.RENDERED), "operation declares proof requirements");
        expectFailure(() -> new UniversalDocumentOperation("bad", d1.sourceSha256(), UniversalDocumentOperation.Type.DELETE_CONTENT, List.of(), Map.of(), UniversalDocumentOperation.Risk.REVERSIBLE_EDIT, null, EnumSet.noneOf(DocumentProofReceipt.Gate.class)), "effectful operation without rollback rejected");

        String resultSha = d1.sourceSha256();
        ArrayList<DocumentProofReceipt> receipts = new ArrayList<>();
        for (DocumentProofReceipt.Gate gate : DocumentProofReceipt.Gate.values()) {
            receipts.add(new DocumentProofReceipt(gate, DocumentProofReceipt.Status.PASS, d1.sourceSha256(), resultSha, "test-independent-" + gate.name().toLowerCase(), "1", Instant.parse("2026-08-30T00:00:00Z"), List.of("evidence:" + gate), Map.of()));
        }
        FinalDocumentProofPolicy policy = new FinalDocumentProofPolicy();
        var finalEvaluation = policy.evaluate(resultSha, receipts);
        check(finalEvaluation.state() == FinalDocumentProofPolicy.State.FINAL_PROOFED, "all six proof gates promote final");
        check(finalEvaluation.missing().isEmpty(), "final proof has no missing gates");

        var partial = policy.evaluate(resultSha, receipts.subList(0, 3));
        check(partial.state() == FinalDocumentProofPolicy.State.RENDER_VERIFIED, "partial receipts do not over-promote");
        check(partial.missing().contains(DocumentProofReceipt.Gate.ACCESSIBILITY), "partial proof reports missing accessibility");
        check(partial.missing().contains(DocumentProofReceipt.Gate.SECURITY), "partial proof reports missing security");
        check(partial.missing().contains(DocumentProofReceipt.Gate.PROVENANCE), "partial proof reports missing provenance");

        var badDigestReceipt = new DocumentProofReceipt(DocumentProofReceipt.Gate.PACKAGE, DocumentProofReceipt.Status.PASS, d1.sourceSha256(), "0".repeat(64), "other", "1", Instant.parse("2026-08-30T00:00:00Z"), List.of("x"), Map.of());
        var bad = policy.evaluate(resultSha, List.of(badDigestReceipt));
        check(bad.state() == FinalDocumentProofPolicy.State.PROOF_FAILED, "mismatched result digest fails proof");
        check(bad.diagnostics().stream().anyMatch(v -> v.startsWith("RESULT_DIGEST_MISMATCH")), "digest mismatch diagnosed");

        System.out.println("CANONICAL_DOCUMENT_GRAPH_PORTABLE_PASS assertions=" + assertions + " schema=" + CanonicalDocumentGraph.SCHEMA_V1 + " proofGates=" + DocumentProofReceipt.Gate.values().length);
    }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expectFailure(Throwing action, String message) throws Exception { assertions++; try { action.run(); throw new AssertionError(message); } catch (IllegalArgumentException expected) { } }
    @FunctionalInterface interface Throwing { void run() throws Exception; }
}
