package org.systemmaster.tools.design;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.LocalLibreOfficePopplerRenderWorker;
import org.systemmaster.tools.document.RenderProofReceipt;
import org.systemmaster.tools.document.RenderProofWorker;
import org.systemmaster.tools.docx.DocxPackageEngine;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

public final class MasterpieceDocxRenderQualification {
    private static int n;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        BrandDesignProfile brand = BrandDesignProfile.executiveDefault("docx-render-brand-v1");
        DocumentFormattingPlan plan = new DocumentFormattingPlan("Publication-quality decision brief", "executive leadership", "support a decision", List.of(
                new DocumentPageBrief(1, PageArchetype.COVER, "Publication-quality decision brief", List.of("Local design intelligence qualification"), List.of()),
                new DocumentPageBrief(2, PageArchetype.EXECUTIVE_SUMMARY, "Executive summary", List.of(
                        "The recommendation is built from explicit evidence, clear hierarchy, and a reversible implementation path.",
                        "This document is rendered after formatting so layout failures are caught before final promotion."), List.of("DOC-E-001")),
                new DocumentPageBrief(3, PageArchetype.BODY_TEXT, "Why the recommendation works", List.of(
                        "First, the information architecture separates decision-critical claims from supporting detail.",
                        "Second, typography, spacing, margins, and paragraph controls are expressed as native WordprocessingML styles rather than visual hacks.",
                        "Third, final proof uses an independent renderer and PDF raster inspection."), List.of("DOC-E-002")),
                new DocumentPageBrief(4, PageArchetype.TABLE_FOCUS, "Decision evidence", List.of("Strategic value | High", "Execution speed | High", "Delivery risk | Controlled"), List.of("DOC-E-003")),
                new DocumentPageBrief(5, PageArchetype.QUOTE_FOCUS, "Design principle", List.of("A final artifact should be judged after rendering, not only after generation."), List.of("DOC-E-004")),
                new DocumentPageBrief(6, PageArchetype.REFERENCES, "References", List.of("DOC-E-001 Evidence summary", "DOC-E-002 Architecture review", "DOC-E-003 Decision model", "DOC-E-004 Design authority"), List.of("DOC-E-001"))));
        byte[] docx = new MasterpieceDocxExporter().export(plan, brand);
        check(docx.length > 1500, "docx produced");
        DocxPackageEngine.Inspection inspection = new DocxPackageEngine().inspect(docx);
        check(inspection.paragraphs().stream().anyMatch(p -> p.contains("Executive summary")), "heading present");
        check(!inspection.activeContent().macroProject(), "no macro");
        check(!inspection.activeContent().externalRelationships(), "no external targets");
        String styles = new String(OoxmlPackageSupport.read(docx).get("word/styles.xml"), StandardCharsets.UTF_8);
        check(styles.contains("widowControl") && styles.contains("keepNext"), "reflow safeguards present");

        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(
                Path.of(args[0]), Path.of(args[1]), Path.of(args[2]), Path.of(args[3]), Path.of(args[4]));
        RenderProofWorker.Result proof = worker.prove(new RenderProofWorker.Request(
                DocumentFormat.DOCX, docx, "masterpiece.docx", null, 3,
                List.of("Executive summary", "Decision evidence", "References"), 0, true));
        check(proof.receipt().pass(), "render proof passes: " + proof.receipt().findings());
        check(proof.receipt().pages().size() >= 3, "multi-page output");
        check(proof.receipt().findings().stream().noneMatch(f -> f.severity() == RenderProofReceipt.Severity.ERROR), "no render errors");
        check(proof.renderedPdf().length > 1000, "rendered PDF produced");
        check(proof.receipt().pages().stream().allMatch(p -> p.rasterWidthPx() > 100 && p.rasterHeightPx() > 100), "all pages rasterized");
        check(proof.receipt().pages().stream().allMatch(p -> p.inkCoverage() > .0001), "all pages visibly nonblank");
        check(proof.receipt().renderer().equals("LibreOffice"), "independent renderer recorded");
        check(proof.receipt().pdfOracle().equals("Poppler"), "PDF oracle recorded");

        System.out.println("MASTERPIECE_DOCX_RENDER_QUALIFICATION_PASS assertions=" + n + " pages=" + proof.receipt().pages().size() + " renderer=" + proof.receipt().renderer());
    }

    private static void check(boolean condition, String message) { n++; if (!condition) throw new AssertionError(message); }
}
