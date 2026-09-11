package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactMediaDetector;
import java.nio.charset.StandardCharsets;

public final class DocumentProcessingPortableTests {
    static int n;
    public static void main(String[] args) throws Exception {
        DocumentProcessingService svc = new DocumentProcessingService();
        ArtifactMediaDetector media = new ArtifactMediaDetector();

        byte[] md = "# Title\n\nA [link](https://example.com) and **bold** text.\n".getBytes(StandardCharsets.UTF_8);
        check(media.detect(md).equals("text/plain"), "generic utf8 is text/plain byte truth");
        check(svc.detect(md, "note.md", "text/markdown") == DocumentFormat.MARKDOWN, "markdown hint resolved");
        var mdi = svc.inspect(DocumentFormat.MARKDOWN, md);
        check(mdi.facts().get("headings").equals("1"), "markdown heading counted");
        check(mdi.facts().get("links").equals("1"), "markdown link counted");
        String mdText = svc.extractPlainText(DocumentFormat.MARKDOWN, md);
        check(mdText.contains("Title") && mdText.contains("A link and bold text."), "markdown plain text projection");

        byte[] html = svc.create(DocumentFormat.HTML, "Alpha\n\nBeta & Gamma");
        check(media.detect(html).equals("text/html"), "html detected by bytes");
        check(svc.extractPlainText(DocumentFormat.HTML, html).contains("Beta & Gamma"), "html entities round trip");
        byte[] scripted = "<html><body>ok<script>alert(1)</script></body></html>".getBytes(StandardCharsets.UTF_8);
        check(svc.extractPlainText(DocumentFormat.HTML, scripted).equals("ok"), "html script content removed from text projection");
        check(svc.inspect(DocumentFormat.HTML, scripted).diagnostics().contains("ACTIVE_HTML_SCRIPT_IGNORED"), "html active-content diagnostic");

        byte[] rtf = svc.create(DocumentFormat.RTF, "One\nTwo");
        check(media.detect(rtf).equals("text/rtf"), "rtf detected by bytes");
        check(svc.extractPlainText(DocumentFormat.RTF, rtf).contains("One\nTwo"), "rtf portable round trip");

        byte[] txt = svc.create(DocumentFormat.PLAIN_TEXT, "plain text");
        check(media.detect(txt).equals("text/plain"), "plain text detected");
        var txtEdit = svc.replaceText(DocumentFormat.PLAIN_TEXT, txt, "plain", "edited");
        check(txtEdit.replacements() == 1, "plain text replacement count");
        check(new String(txtEdit.bytes(), StandardCharsets.UTF_8).equals("edited text"), "plain text replacement result");

        byte[] docx = svc.create(DocumentFormat.DOCX, "First paragraph\n\nSecond paragraph");
        check(media.detect(docx).equals(ArtifactMediaDetector.DOCX), "docx detected from OOXML package");
        check(svc.inspect(DocumentFormat.DOCX, docx).facts().get("paragraphs").equals("2"), "docx paragraph inventory");
        check(svc.extractPlainText(DocumentFormat.DOCX, docx).contains("Second paragraph"), "docx text extraction");
        var docxEdit = svc.replaceText(DocumentFormat.DOCX, docx, "Second", "Updated");
        check(docxEdit.replacements() == 1, "docx edit routed to recovered engine");
        check(svc.extractPlainText(DocumentFormat.DOCX, docxEdit.bytes()).contains("Updated paragraph"), "docx edit verified");

        byte[] pdf = svc.create(DocumentFormat.PDF, "PDF Alpha\nPDF Beta");
        check(media.detect(pdf).equals("application/pdf"), "pdf detected by bytes");
        check(svc.inspect(DocumentFormat.PDF, pdf).facts().get("pages").equals("1"), "pdf structural page inspection");
        check(!svc.extractPlainText(DocumentFormat.PDF, pdf).isBlank(), "pdf portable literal text projection available");

        byte[] pptx = svc.create(DocumentFormat.PPTX, "Roadmap\nPoint A\nPoint B\n\nProofing\nAccessibility\nVisual diff");
        check(media.detect(pptx).equals(ArtifactMediaDetector.PPTX), "pptx detected from OOXML package");
        check(svc.inspect(DocumentFormat.PPTX, pptx).facts().get("slides").equals("2"), "pptx slide inventory");
        check(svc.extractPlainText(DocumentFormat.PPTX, pptx).contains("Point A"), "pptx text extraction");
        var pptxEdit = svc.replaceText(DocumentFormat.PPTX, pptx, "Visual diff", "Render diff");
        check(pptxEdit.replacements() == 1, "pptx edit routed to recovered engine");
        check(svc.extractPlainText(DocumentFormat.PPTX, pptxEdit.bytes()).contains("Render diff"), "pptx edit verified");

        var mdToDocx = svc.convert(DocumentFormat.MARKDOWN, DocumentFormat.DOCX, md);
        check(mdToDocx.fidelity().equals("SEMANTIC_TEXT_DERIVATIVE"), "cross-format fidelity is explicit");
        check(mdToDocx.lossLedger().contains("LAYOUT_AND_FORMATTING_NOT_GUARANTEED"), "cross-format loss ledger present");
        check(svc.extractPlainText(DocumentFormat.DOCX, mdToDocx.bytes()).contains("Title"), "markdown to docx semantic conversion");

        var docxToPdf = svc.convert(DocumentFormat.DOCX, DocumentFormat.PDF, docx);
        check(media.detect(docxToPdf.bytes()).equals("application/pdf"), "docx to pdf semantic derivative created");
        check(!docxToPdf.lossLedger().isEmpty(), "docx to pdf loss ledger explicit");

        var mdToPptx = svc.convert(DocumentFormat.MARKDOWN, DocumentFormat.PPTX, md);
        check(media.detect(mdToPptx.bytes()).equals(ArtifactMediaDetector.PPTX), "markdown to pptx semantic derivative created");
        check(mdToPptx.lossLedger().contains("PRESENTATION_THEME_LAYOUT_MEDIA_AND_ANIMATION_NOT_GUARANTEED_IN_SEMANTIC_CONVERSION"), "presentation loss ledger explicit");
        check(svc.extractPlainText(DocumentFormat.PPTX, mdToPptx.bytes()).contains("Title"), "markdown to pptx semantic content retained");

        var pptxToMd = svc.convert(DocumentFormat.PPTX, DocumentFormat.MARKDOWN, pptx);
        check(new String(pptxToMd.bytes(), StandardCharsets.UTF_8).contains("Roadmap"), "pptx to markdown semantic derivative created");

        var pdfToMd = svc.convert(DocumentFormat.PDF, DocumentFormat.MARKDOWN, pdf);
        check(new String(pdfToMd.bytes(), StandardCharsets.UTF_8).contains("PDF Alpha"), "pdf to markdown portable semantic fallback");
        check(pdfToMd.lossLedger().contains("PDF_PORTABLE_EXTRACTION_IS_LITERAL_TEXT_FALLBACK"), "pdf fallback truth recorded");

        boolean pdfEditRejected = false;
        try { svc.replaceText(DocumentFormat.PDF, pdf, "Alpha", "Gamma"); }
        catch (UnsupportedOperationException e) { pdfEditRejected = true; }
        check(pdfEditRejected, "unsafe direct PDF edit rejected");

        byte[] binary = new byte[]{0,1,2,3};
        check(svc.detect(binary, "draft.odt", "application/vnd.oasis.opendocument.text") == DocumentFormat.ODT, "odt recognized for routing");
        check(svc.detect(binary, "old.ppt", "application/vnd.ms-powerpoint") == DocumentFormat.LEGACY_PPT, "legacy ppt recognized for routing");
        check(!DocumentFormat.ODT.portableFoundation(), "odt engine not falsely claimed complete");
        check(DocumentFormatCapabilities.all().size() == 25, "universal document boundary ledger complete");
        check(DocumentFormatCapabilities.all().stream().anyMatch(c -> c.format().equals("PDF")), "pdf owned by universal document module");
        check(DocumentFormatCapabilities.all().stream().anyMatch(c -> c.format().equals("PPTX/PPTM")), "powerpoint owned by universal document module");
        check(DocumentFormatCapabilities.all().stream().anyMatch(c -> c.capability().contains("XLSX/XLSM")), "spreadsheet boundary explicit");

        System.out.println("UNIVERSAL_DOCUMENT_PROCESSING_PORTABLE_PASS assertions=" + n + " active=DOCX,DOCM,PDF,PPTX,PPTM,MD,TXT,HTML,RTF recognized=ODT,EPUB,DOC,PPT,ODP,PPSX,POTX");
    }

    static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
