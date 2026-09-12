package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxAdvancedSemanticMasteryEngine;
import org.systemmaster.tools.docx.DocxDrawingChartMasteryEngine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** LibreOffice + Poppler qualification for DOCUMENT-DOCX-MASTERY-T06. */
public final class DocumentDocxMasteryT06ExternalQualification {
    private static final Set<String> T06 = t06Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]);
        Path pdfinfo = Path.of(args[1]);
        Path pdftotext = Path.of(args[2]);
        Path pdftoppm = Path.of(args[3]);
        Path pdfimages = Path.of(args[4]);
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(soffice, pdfinfo, pdftotext, pdftoppm, pdfimages);
        Path root = Files.createTempDirectory("document-docx-mastery-t06-external-");
        try {
            qualify(root, worker, soffice, pdfinfo, pdftotext, pdfimages);
            System.out.println("DOCUMENT_DOCX_MASTERY_T06_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T06.size());
        } finally {
            deleteTree(root);
        }
    }

    private static void qualify(Path root, RenderProofWorker worker, Path soffice, Path pdfinfo, Path pdftotext, Path pdfimages) throws Exception {
        ArrayList<String> paragraphs = new ArrayList<>();
        for (int i = 1; i <= 18; i++) paragraphs.add("T06 HOST " + i);
        byte[] source = new DocxFullLaneEngine().createDocument(paragraphs);
        DocxDrawingChartMasteryEngine charts = new DocxDrawingChartMasteryEngine();
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        source = charts.insertChart(source, "body/p:1", new DocxDrawingChartMasteryEngine.ChartSpec("bar", "T06 Revenue", 5000000, 3000000,
                List.of(new DocxDrawingChartMasteryEngine.ChartSeries("Series A", List.of("A", "B", "C"), List.of(10.0, 20.0, 30.0)))));
        source = engine.upsertChartWorkbook(source, "body/p:1/chart:1", new DocxAdvancedSemanticMasteryEngine.WorkbookSpec("T06Data", List.of("A", "B", "C"), List.of(10.0, 20.0, 30.0)));
        source = engine.formatChartDecorations(source, "body/p:1/chart:1", new DocxAdvancedSemanticMasteryEngine.ChartDecorations("T06 Revenue", "Quarter", "USD", "r", true, true));
        source = engine.insertSmartArt(source, "body/p:3", new DocxAdvancedSemanticMasteryEngine.SmartArtSpec("T06 Process", List.of(
                new DocxAdvancedSemanticMasteryEngine.SmartArtNode("n1", "Start"),
                new DocxAdvancedSemanticMasteryEngine.SmartArtNode("n2", "Review"),
                new DocxAdvancedSemanticMasteryEngine.SmartArtNode("n3", "Finish"))));
        source = engine.insertEquation(source, "body/p:5", new DocxAdvancedSemanticMasteryEngine.EquationSpec("E=mc^2"));
        source = engine.insertBookmark(source, "body/p:6", "T06Target");
        source = engine.insertHyperlink(source, "body/p:7", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Jump to target", "#T06Target", "Internal reference"));
        source = engine.insertCrossReference(source, "body/p:8", new DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec("T06Target", "Target reference", true));
        source = engine.insertSimpleField(source, "body/p:9", new DocxAdvancedSemanticMasteryEngine.FieldSpec("DATE \\@ yyyy-MM-dd", "2026-08-31"));
        source = engine.insertComplexField(source, "body/p:10", new DocxAdvancedSemanticMasteryEngine.FieldSpec("AUTHOR", "System Master"));
        source = engine.insertCaption(source, "body/p:11", new DocxAdvancedSemanticMasteryEngine.CaptionSpec("Figure", "T06 Architecture", "Figure"));
        source = engine.insertFootnote(source, "body/p:12", "T06 footnote semantic");
        source = engine.insertEndnote(source, "body/p:13", "T06 endnote semantic");

        CanonicalDocumentGraphV2 graph = project(source);
        String chartId = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.CHART).findFirst().orElseThrow().id();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "UPSERT_CHART_WORKBOOK");
        params.put("chartWorkbook.sheetName", "GovernedT06");
        params.put("chartWorkbook.categories", "A;B;C");
        params.put("chartWorkbook.values", "12;24;36");
        DocumentOperationContract op = new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1, "t06-external-workbook", graph.sourceSha256(), graph.semanticDigest(), DocumentOperationContract.Type.FORMAT,
                List.of(DocumentSelector.node(chartId)), "T06 external chart workbook proof", params, DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(),
                Set.of("word/document.xml", "word/charts/*", "word/embeddings/*", "[Content_Types].xml"), DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,
                false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job("t06-external-source", "t06-external-result");
        DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), op, Set.of(chartId), allCapabilities(), List.of());
        DocumentSpineResult result = spine(root, worker).executeExisting(job, new ByteArrayInputStream(source), plan);

        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "external T06 publishes verified draft");
        check(result.preservation() != null && result.preservation().pass(), "external T06 preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), "external T06 proof complete");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS), "LibreOffice/Poppler render proof passes");
        check(engine.readChartWorkbooks(result.resultBytes()).stream().anyMatch(w -> "GovernedT06".equals(w.workbook().sheetName()) && w.workbook().values().equals(List.of(12.0, 24.0, 36.0))), "external candidate retains governed chart workbook");
        check("Quarter".equals(engine.readChartDecorations(result.resultBytes(), "body/p:1/chart:1").categoryAxisTitle()), "external candidate retains chart axis decorations");
        check(engine.readSmartArt(result.resultBytes()).stream().anyMatch(s -> s.spec().nodes().size() == 3), "external candidate retains SmartArt semantics");
        check(engine.readEquations(result.resultBytes()).stream().anyMatch(e -> e.linearText().contains("E=mc^2")), "external candidate retains OMML equation");
        check(engine.readHyperlinks(result.resultBytes()).stream().anyMatch(h -> "#T06Target".equals(h.target())), "external candidate retains internal hyperlink");
        check(engine.readBookmarks(result.resultBytes()).stream().anyMatch(b -> "T06Target".equals(b.name())), "external candidate retains bookmark");
        check(engine.readCrossReferences(result.resultBytes()).stream().anyMatch(r -> "T06Target".equals(r.bookmarkName())), "external candidate retains cross-reference");
        check(engine.readSimpleFields(result.resultBytes()).stream().anyMatch(f -> f.instruction().startsWith("DATE")), "external candidate retains simple field");
        check(engine.readComplexFields(result.resultBytes()).stream().anyMatch(f -> "AUTHOR".equals(f.instruction())), "external candidate retains complex field");
        check(engine.readCaptions(result.resultBytes()).stream().anyMatch(c -> c.text().contains("T06 Architecture")), "external candidate retains caption");
        check(engine.readFootnotes(result.resultBytes()).stream().anyMatch(n -> n.text().contains("T06 footnote")), "external candidate retains footnote");
        check(engine.readEndnotes(result.resultBytes()).stream().anyMatch(n -> n.text().contains("T06 endnote")), "external candidate retains endnote");

        CanonicalDocumentGraphV2 projected = project(result.resultBytes());
        check(projected.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.DIAGRAM && "smartart".equals(e.semantic().role())), "external candidate reprojects SmartArt semantics");
        check(projected.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.EQUATION), "external candidate reprojects equation semantics");
        check(projected.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FOOTNOTE), "external candidate reprojects footnote semantics");
        check(projected.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ENDNOTE), "external candidate reprojects endnote semantics");

        RenderedPdf rendered = renderToPdf(root.resolve("manual"), result.resultBytes(), soffice, pdfinfo, pdftotext, pdfimages);
        check(rendered.pages() >= 1, "LibreOffice renders T06 candidate to PDF");
        check(rendered.text().contains("T06 HOST 1") && rendered.text().contains("T06 HOST 13"), "Poppler observes host text after T06 operations");
        check(rendered.text().contains("T06 Architecture") || rendered.text().contains("Jump to target"), "LibreOffice exposes T06 reference/caption content to PDF text layer");
    }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext, Path pdfimages) throws Exception {
        Files.createDirectories(root); Path input = root.resolve("t06.docx"); Path out = root.resolve("out"); Files.createDirectories(out); Files.write(input, docx);
        Process convert = new ProcessBuilder(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", out.toString(), input.toString()).redirectErrorStream(true).start();
        byte[] output = convert.getInputStream().readAllBytes(); if (!convert.waitFor(120, TimeUnit.SECONDS)) { convert.destroyForcibly(); throw new IOException("LibreOffice conversion timeout"); }
        if (convert.exitValue() != 0) throw new IOException("LibreOffice conversion failed: " + new String(output, StandardCharsets.UTF_8));
        Path pdf = out.resolve("t06.pdf"); if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        int pages = parsePages(runTool(pdfinfo, pdf.toString())); Path txt = root.resolve("t06.txt"); runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String imageList = runTool(pdfimages, "-list", pdf.toString()); int images = 0; for (String line : imageList.split("\\R")) if (line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*")) images++;
        return new RenderedPdf(pages, Files.readString(txt, StandardCharsets.UTF_8), images);
    }

    private static String runTool(Path command, String... args) throws Exception { ArrayList<String> line = new ArrayList<>(); line.add(command.toString()); line.addAll(List.of(args)); Process p = new ProcessBuilder(line).redirectErrorStream(true).start(); byte[] o = p.getInputStream().readAllBytes(); if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); throw new IOException("tool timeout: " + command); } if (p.exitValue() != 0) throw new IOException("tool failed: " + command + " output=" + new String(o, StandardCharsets.UTF_8)); return new String(o, StandardCharsets.UTF_8); }
    private static int parsePages(String info) { for (String line : info.split("\\R")) if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip()); throw new IllegalArgumentException("pdfinfo Pages missing"); }
    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception { Clock clock = Clock.systemUTC(); FilePlatform008Repository repo = new FilePlatform008Repository(root.resolve("meta")); GovernedArtifactGateway gateway = new GovernedArtifactGateway(root.resolve("bytes"), ArtifactIntakePolicy.conservative(64L * 1024 * 1024), repo, clock); return new UniversalDocumentSpine(gateway, new FileDocumentSpineCheckpointStore(root.resolve("cp")), new FileDocumentSpineVersionStore(root.resolve("versions")), new DocumentSpineProofService(new DocumentProcessingService(), worker, clock), clock); }
    private static DocumentSpineJob job(String sourceId, String resultId) { return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T06-EXTERNAL", "qualification", java.time.Instant.now()); }
    private static Set<String> allCapabilities() { LinkedHashSet<String> ids = new LinkedHashSet<>(T06); for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i)); for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); ids.add("UDM-FOUNDATION-0064"); for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(ids); }
    private static Set<String> t06Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 316; i <= 375; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path p : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); } }
    private record RenderedPdf(int pages, String text, int imageCount) {}
}
