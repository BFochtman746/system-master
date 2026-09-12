package org.systemmaster.tools.review;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.CanonicalDocumentGraphProjector;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.NativePartPreservationMap;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxPackageEngine;
import org.systemmaster.tools.pdf.PdfStructuralEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class DocumentWorldClass001BPortableTests {
    static int assertions;

    public static void main(String[] args) throws Exception {
        CanonicalDocumentGraphProjector projector = new CanonicalDocumentGraphProjector();
        DocxFullLaneEngine docx = new DocxFullLaneEngine();
        DocxPackageEngine docxPackage = new DocxPackageEngine();
        SemanticDocumentDiffEngine diff = new SemanticDocumentDiffEngine();
        Instant t0 = Instant.parse("2026-08-31T12:00:00Z");

        byte[] baseBytes = docx.createDocument(List.of("Alpha", "Beta", "Gamma"));
        byte[] targetBytes = new DocxPackageEngine().replaceText(baseBytes, "Beta", "Beta revised").bytes();
        CanonicalDocumentGraph base = projector.project(DocumentFormat.DOCX, baseBytes);
        CanonicalDocumentGraph target = projector.project(DocumentFormat.DOCX, targetBytes);
        DocumentReviewGraph review = diff.diff(base, target, "Reviewer", t0);
        check(review.changes().size() == 1, "single paragraph replacement becomes one review change");
        ReviewChange change = review.changes().getFirst();
        check(change.type() == ReviewChange.Type.REPLACE, "same locator text mutation is replacement");
        check(change.beforeText().equals("Beta") && change.afterText().equals("Beta revised"), "replacement preserves before/after text");
        check(change.anchor().locator().equals("paragraph:2"), "replacement anchor is stable paragraph locator");
        check(review.digest().matches("[0-9a-f]{64}"), "review graph has stable digest");
        check(review.requireChange(change.changeId()).equals(change), "review graph lookup works");

        ReviewDecisionLedger ledger = new ReviewDecisionLedger(review);
        var accept = ledger.append(change.changeId(), ReviewDecisionReceipt.Decision.ACCEPT, "Alice", t0.plusSeconds(1), "approved");
        check(ledger.states().get(change.changeId()) == ReviewDecisionLedger.State.ACCEPTED, "accept decision derives accepted state");
        var reopen = ledger.append(change.changeId(), ReviewDecisionReceipt.Decision.REOPEN, "Alice", t0.plusSeconds(2), "needs another look");
        check(reopen.previousReceiptDigest().equals(accept.receiptDigest()), "decision receipts form hash chain");
        check(ledger.states().get(change.changeId()) == ReviewDecisionLedger.State.OPEN, "reopen restores open state without deleting history");
        ledger.append(change.changeId(), ReviewDecisionReceipt.Decision.REJECT, "Bob", t0.plusSeconds(3), "not supported");
        check(ledger.states().get(change.changeId()) == ReviewDecisionLedger.State.REJECTED, "later decision derives rejected state");
        check(ledger.receipts().size() == 3, "decision history remains append-only");
        expectStateFailure(() -> ledger.append(change.changeId(), ReviewDecisionReceipt.Decision.ACCEPT, "Bob", t0.plusSeconds(4), "must reopen first"), "resolved change cannot be silently overwritten without reopen");
        expectFailure(() -> ledger.append("chg-ffffffffffffffffffff", ReviewDecisionReceipt.Decision.ACCEPT, "Bob", t0.plusSeconds(4), "unknown"), "unknown review change rejected at append time");
        expectStateFailure(() -> ledger.append(change.changeId(), ReviewDecisionReceipt.Decision.REOPEN, "Bob", t0.minusSeconds(1), "backwards"), "review decision timestamps cannot move backwards");
        var resolvedPlan = new ReviewResolutionPlanner().plan(review, ledger);
        check(resolvedPlan.rejected().size() == 1 && resolvedPlan.unresolved().isEmpty(), "resolution planner derives final rejected decision without mutating graph");
        check(resolvedPlan.finalizable(), "fully decided review is finalizable");
        expectFailure(() -> new ReviewDecisionLedger(null), "ledger rejects missing review graph");

        InMemoryDocumentVersionStore store = new InMemoryDocumentVersionStore();
        DocumentVersionSnapshot v1 = store.initialize(DocumentFormat.DOCX, baseBytes, "main", "Alice", t0, "baseline");
        DocumentVersionSnapshot v2 = store.commit("main", v1.versionId(), targetBytes, "Alice", t0.plusSeconds(10), "revise beta");
        check(store.requireHead("main").equals(v2.versionId()), "commit advances branch head");
        check(v2.parentVersionIds().equals(List.of(v1.versionId())), "commit records immutable parent");
        expectStateFailure(() -> store.commit("main", v1.versionId(), targetBytes, "Alice", t0.plusSeconds(11), "stale"), "stale branch head rejected");
        store.createBranch("experiment", v1.versionId());
        byte[] experimental = new DocxPackageEngine().replaceText(baseBytes, "Gamma", "Gamma experiment").bytes();
        DocumentVersionSnapshot vx = store.commit("experiment", v1.versionId(), experimental, "Bob", t0.plusSeconds(12), "experiment gamma");
        check(store.requireHead("experiment").equals(vx.versionId()), "independent branch head advances");
        DocumentVersionSnapshot rollback = store.rollback("main", v2.versionId(), v1.versionId(), "Alice", t0.plusSeconds(13), "restore baseline");
        check(rollback.artifactSha256().equals(v1.artifactSha256()), "rollback restores exact prior artifact bytes");
        check(rollback.parentVersionIds().equals(List.of(v2.versionId())), "rollback is a new descendant, not history deletion");
        check(store.versions().size() == 4, "version DAG retains all snapshots");
        VersionProofReceipt versionProof = VersionProofReceipt.from(v2);
        check(versionProof.verifies(v2), "version proof receipt verifies immutable version node");
        check(versionProof.proofDigest().matches("[0-9a-f]{64}"), "version proof carries deterministic digest");

        byte[] oursBytes = new DocxPackageEngine().replaceText(baseBytes, "Alpha", "Alpha ours").bytes();
        byte[] theirsBytes = new DocxPackageEngine().replaceText(baseBytes, "Gamma", "Gamma theirs").bytes();
        ThreeWaySemanticMerge merger = new ThreeWaySemanticMerge();
        var mergeOk = merger.plan(base, projector.project(DocumentFormat.DOCX, oursBytes), projector.project(DocumentFormat.DOCX, theirsBytes));
        check(mergeOk.autoMergeAllowed(), "independent anchor edits auto-merge at plan level");
        check(mergeOk.conflicts().isEmpty(), "independent edits have no conflicts");
        byte[] theirsConflictBytes = new DocxPackageEngine().replaceText(baseBytes, "Alpha", "Alpha theirs").bytes();
        var mergeConflict = merger.plan(base, projector.project(DocumentFormat.DOCX, oursBytes), projector.project(DocumentFormat.DOCX, theirsConflictBytes));
        check(!mergeConflict.autoMergeAllowed(), "divergent same-anchor edits do not auto-merge");
        check(mergeConflict.conflicts().size() == 1, "same-anchor divergence creates explicit conflict");

        DocxTrackedRevisionMapper tracked = new DocxTrackedRevisionMapper();
        var trackedResult = tracked.applyReplacement(baseBytes, change, "Alice", t0.plusSeconds(20));
        var trackedInventory = docx.inventory(trackedResult.bytes());
        check(trackedInventory.revisions() >= 2, "native DOCX contains insertion and deletion revision elements");
        String trackedXml = new String(OoxmlPackageSupport.read(trackedResult.bytes()).get("word/document.xml"), StandardCharsets.UTF_8);
        check(trackedXml.contains("<w:del") && trackedXml.contains("<w:ins"), "native WordprocessingML revision markup emitted");
        check(trackedXml.contains("Beta revised"), "inserted replacement text present in native tracked revision");
        check(trackedResult.receipt().changedParts().equals(List.of("word/document.xml")), "tracked revision receipt binds exact changed part");
        DocxCommentMapper docxComments = new DocxCommentMapper();
        var commentedDocx = docxComments.addParagraphComment(baseBytes, change.anchor(), "Verify the revised percentage", "Alice Reviewer", "AR", t0.plusSeconds(21));
        Map<String,byte[]> docxCommentParts = OoxmlPackageSupport.read(commentedDocx.bytes());
        check(docxCommentParts.containsKey("word/comments.xml"), "native DOCX comments part created");
        check(new String(docxCommentParts.get("word/document.xml"), StandardCharsets.UTF_8).contains("commentRangeStart"), "DOCX comment range anchor emitted");
        check(new String(docxCommentParts.get("word/comments.xml"), StandardCharsets.UTF_8).contains("Verify the revised percentage"), "DOCX native comment content preserved");
        check(commentedDocx.receipt().mappingMode().equals("WORDPROCESSINGML_COMMENT"), "DOCX comment mapping mode is explicit");
        var preservation = new NativePartPreservationMap().assess(DocumentFormat.DOCX, baseBytes, trackedResult.bytes(), java.util.Set.of("word/document.xml"));
        check(preservation.pass(), "native tracked revision preserves unrelated DOCX parts");
        expectFailure(() -> tracked.applyReplacement(baseBytes, new ReviewChange(change.changeId(), ReviewChange.Type.INSERT, change.anchor(), "", "x", "A", t0, ReviewChange.Confidence.HIGH, Map.of(), List.of()), "A", t0), "DOCX mapper rejects unsupported review change type");

        PptxFullLaneEngine pptx = new PptxFullLaneEngine();
        byte[] deck = pptx.createPresentation("Review Deck", List.of(new PptxFullLaneEngine.SlideSpec("Decision", List.of("Evidence"), "notes")));
        PptxClassicCommentMapper pptComment = new PptxClassicCommentMapper();
        var commented = pptComment.addComment(deck, 1, "Strengthen the evidence", "Alice Reviewer", "AR", t0);
        Map<String,byte[]> pptParts = OoxmlPackageSupport.read(commented.bytes());
        check(pptParts.containsKey("ppt/comments/comment1.xml"), "PPTX comment part created");
        check(pptParts.containsKey("ppt/commentAuthors.xml"), "PPTX comment author part created");
        check(new String(pptParts.get("ppt/comments/comment1.xml"), StandardCharsets.UTF_8).contains("Strengthen the evidence"), "PPTX comment content preserved");
        check(new String(pptParts.get("ppt/slides/_rels/slide1.xml.rels"), StandardCharsets.UTF_8).contains("/comments"), "slide relationship points to comment part");
        check(commented.receipt().mappingMode().equals("PRESENTATIONML_CLASSIC_COMMENT"), "PPTX review mapping mode is explicit");
        check(commented.receipt().diagnostics().contains("MODERN_POWERPOINT_COMMENT_MAPPING_PENDING"), "modern PowerPoint comment limitation remains explicit");

        PdfStructuralEngine pdf = new PdfStructuralEngine();
        byte[] pdfBytes = pdf.createTextPdf(List.of("First page"));
        CanonicalDocumentGraph pdfGraph = projector.project(DocumentFormat.PDF, pdfBytes);
        CanonicalDocumentGraph.Node page = pdfGraph.nodes().stream().filter(n -> n.type() == CanonicalDocumentGraph.NodeType.PAGE).findFirst().orElseThrow();
        ReviewChange pdfComment = new ReviewChange("chg-0123456789abcdefabcd", ReviewChange.Type.COMMENT, ReviewAnchor.wholeNode(page), "", "Check source citation", "Alice", t0, ReviewChange.Confidence.EXACT, Map.of(), List.of());
        DocumentReviewGraph pdfReview = new DocumentReviewGraph(DocumentReviewGraph.SCHEMA_V1, "review-0123456789abcdefabcd", DocumentFormat.PDF,
                pdfGraph.sourceSha256(), pdfGraph.sourceSha256(), pdfGraph.semanticDigest(), pdfGraph.semanticDigest(), t0, List.of(pdfComment));
        var xfdf = new PdfXfdfReviewExporter().export(pdfReview, "report.pdf");
        String xfdfText = new String(xfdf.xfdfBytes(), StandardCharsets.UTF_8);
        check(xfdfText.contains("<xfdf") && xfdfText.contains("page=\"0\""), "PDF review exports page-bound XFDF sidecar");
        check(xfdfText.contains("Check source citation"), "XFDF preserves review comment text");
        check(xfdf.diagnostics().contains("XFDF_SIDECAR_NOT_EMBEDDED_PDF_ANNOTATION"), "PDF sidecar does not masquerade as embedded annotation");

        BufferedImage before = white(120, 80); BufferedImage after = white(120, 80);
        Graphics2D g = after.createGraphics(); g.setColor(Color.BLACK); g.fillRect(10, 10, 20, 20); g.dispose();
        VisualDiffAnalyzer.Metrics visual = new VisualDiffAnalyzer().compare(before, after, 10);
        check(visual.changedPixels() == 400, "visual diff counts changed pixels");
        check(visual.changedRatio() > 0.04 && visual.changedRatio() < 0.05, "visual diff reports bounded changed ratio");
        check(visual.maxChannelDelta() == 255, "visual diff captures maximum channel delta");
        expectFailure(() -> new VisualDiffAnalyzer().compare(before, new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB), 10), "visual diff rejects dimension mismatch");

        check(docxPackage.inspect(trackedResult.bytes()).paragraphs().contains("Beta revised"), "portable DOCX reader sees accepted inserted text path");
        System.out.println("DOCUMENT_WORLD_CLASS_001B_PORTABLE_PASS assertions=" + assertions + " review=" + DocumentReviewGraph.SCHEMA_V1 + " decision=" + ReviewDecisionReceipt.SCHEMA_V1);
    }

    private static BufferedImage white(int w, int h) { BufferedImage image=new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB); Graphics2D g=image.createGraphics(); g.setColor(Color.WHITE); g.fillRect(0,0,w,h); g.dispose(); return image; }
    private static void check(boolean condition,String message){assertions++; if(!condition) throw new AssertionError(message);}
    private static void expectFailure(Throwing action,String message)throws Exception{assertions++; try{action.run(); throw new AssertionError(message);}catch(IllegalArgumentException|UnsupportedOperationException expected){}}
    private static void expectStateFailure(Throwing action,String message)throws Exception{assertions++; try{action.run(); throw new AssertionError(message);}catch(IllegalStateException expected){}}
    @FunctionalInterface interface Throwing{void run()throws Exception;}
}
