package org.systemmaster.tools.document;

import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.nio.file.Path;
import java.util.List;

/** End-to-end independent render proof for DOCX, PPTX, and PDF candidates. */
public final class DocumentWorldClass001ARenderQualification {
    static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(
                Path.of(args[0]), Path.of(args[1]), Path.of(args[2]), Path.of(args[3]), Path.of(args[4]));

        byte[] docx = new DocxFullLaneEngine().createDocument(List.of("001A DOCX render proof", "Second paragraph"));
        var docxProof = worker.prove(new RenderProofWorker.Request(
                DocumentFormat.DOCX, docx, "001a-proof.docx", null, 1,
                List.of("001A DOCX render proof", "Second paragraph"), 0, true));
        assertHealthy(docxProof, DocumentFormat.DOCX);
        check(docxProof.receipt().renderer().equals("LibreOffice"), "DOCX uses independent LibreOffice renderer");
        check(docxProof.receipt().isolation().privateUserProfile(), "DOCX render uses private LibreOffice profile");
        check(docxProof.receipt().isolation().networkIsolation() == RenderProofReceipt.NetworkIsolation.NOT_KERNEL_ENFORCED_LOCAL_QUALIFICATION,
                "local qualification does not falsely claim kernel network isolation");

        PptxFullLaneEngine pptxEngine = new PptxFullLaneEngine();
        byte[] pptx = pptxEngine.createPresentation("001A", List.of(
                new PptxFullLaneEngine.SlideSpec("001A PPTX slide one", List.of("Alpha", "Beta"), "note one"),
                new PptxFullLaneEngine.SlideSpec("001A PPTX slide two", List.of("Gamma"), null)));
        var pptxProof = worker.prove(new RenderProofWorker.Request(
                DocumentFormat.PPTX, pptx, "001a-proof.pptx", 2, 2,
                List.of("001A PPTX slide one", "001A PPTX slide two"), 0, true));
        assertHealthy(pptxProof, DocumentFormat.PPTX);
        check(pptxProof.receipt().pages().size() == 2, "PPTX slide/page count preserved");

        DocumentProcessingService service = new DocumentProcessingService();
        byte[] pdf = service.create(DocumentFormat.PDF, "001A PDF render proof");
        var pdfProof = worker.prove(new RenderProofWorker.Request(
                DocumentFormat.PDF, pdf, "001a-proof.pdf", 1, 1,
                List.of("001A PDF render proof"), 0, true));
        assertHealthy(pdfProof, DocumentFormat.PDF);
        check(pdfProof.receipt().renderer().equals("PDF_IDENTITY_RENDER_TARGET"), "PDF proof does not round-trip through LibreOffice");
        check(pdfProof.receipt().renderedPdfSha256().equals(pdfProof.receipt().proofedArtifactSha256()), "PDF identity render target preserves exact bytes");

        var imageRequirementFail = worker.prove(new RenderProofWorker.Request(
                DocumentFormat.PDF, pdf, "001a-no-images.pdf", 1, 1,
                List.of("001A PDF render proof"), 1, true));
        check(!imageRequirementFail.receipt().pass(), "image presence requirement can fail proof");
        check(imageRequirementFail.receipt().findings().stream().anyMatch(f -> f.code().equals("IMAGE_COUNT_BELOW_MINIMUM") && f.severity() == RenderProofReceipt.Severity.ERROR), "missing image diagnostic emitted");

        byte[] blankPdf = service.create(DocumentFormat.PDF, "");
        var blankProof = worker.prove(new RenderProofWorker.Request(
                DocumentFormat.PDF, blankPdf, "001a-blank.pdf", 1, 1,
                List.of(), 0, true));
        check(!blankProof.receipt().pass(), "blank required page fails rendered proof");
        check(blankProof.receipt().findings().stream().anyMatch(f -> f.code().equals("BLANK_PAGE")), "blank page finding emitted");

        System.out.println("DOCUMENT_WORLD_CLASS_001A_RENDER_PASS assertions=" + assertions
                + " docxPages=" + docxProof.receipt().pages().size()
                + " pptxSlides=" + pptxProof.receipt().pages().size()
                + " pdfPages=" + pdfProof.receipt().pages().size()
                + " renderer=" + docxProof.receipt().renderer()
                + " oracle=" + docxProof.receipt().pdfOracle());
    }

    private static void assertHealthy(RenderProofWorker.Result result, DocumentFormat format) {
        check(result.renderedPdf().length > 100, format + " rendered PDF exists");
        check(result.receipt().sourceFormat() == format, format + " receipt binds source format");
        check(result.receipt().pass(), format + " render proof passes");
        check(!result.receipt().pages().isEmpty(), format + " page evidence exists");
        check(result.receipt().pages().stream().allMatch(p -> p.widthPoints() > 0 && p.heightPoints() > 0), format + " page geometry captured");
        check(result.receipt().pages().stream().allMatch(p -> p.rasterSha256().matches("[0-9a-f]{64}")), format + " raster digests captured");
        check(result.receipt().pages().stream().allMatch(p -> p.rasterWidthPx() >= 50 && p.rasterHeightPx() >= 50), format + " raster dimensions sane");
        check(result.receipt().measurements().containsKey("textCharacters"), format + " text presence measured");
        check(result.receipt().measurements().containsKey("imageCount"), format + " image presence measured");
    }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}
