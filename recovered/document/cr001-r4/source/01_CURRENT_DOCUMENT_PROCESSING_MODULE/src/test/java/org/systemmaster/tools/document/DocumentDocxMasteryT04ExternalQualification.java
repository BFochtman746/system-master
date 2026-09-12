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
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxTableImageMasteryEngine;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** LibreOffice + Poppler qualification for DOCUMENT-DOCX-MASTERY-T04. */
public final class DocumentDocxMasteryT04ExternalQualification {
    private static final Set<String> T04_CAPABILITIES = t04Capabilities();
    private static final byte[] PNG = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=");
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]); Path pdfinfo = Path.of(args[1]); Path pdftotext = Path.of(args[2]); Path pdftoppm = Path.of(args[3]); Path pdfimages = Path.of(args[4]);
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(soffice, pdfinfo, pdftotext, pdftoppm, pdfimages);
        Path root = Files.createTempDirectory("document-docx-mastery-t04-external-");
        try { qualify(root, worker, soffice, pdfinfo, pdftotext, pdfimages); System.out.println("DOCUMENT_DOCX_MASTERY_T04_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T04_CAPABILITIES.size()); }
        finally { deleteTree(root); }
    }

    private static void qualify(Path root, RenderProofWorker worker, Path soffice, Path pdfinfo, Path pdftotext, Path pdfimages) throws Exception {
        DocxTableImageMasteryEngine engine = new DocxTableImageMasteryEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("T04 External Host", "T04 Floating Host", "T04 Tail"));
        DocxTableImageMasteryEngine.BorderEdge border = new DocxTableImageMasteryEngine.BorderEdge("single", 8, 0, "4472C4");
        source = engine.insertTable(source, "body/p:1", new DocxTableImageMasteryEngine.TableSpec(List.of(
                row(true, "T04 HEADER A", "T04 HEADER B"), row(false, "T04 CELL A1", "T04 CELL B1"), row(false, "T04 CELL A2", "T04 CELL B2")),
                new DocxTableImageMasteryEngine.TableFormat(new DocxTableImageMasteryEngine.Width(7000, "dxa"), new DocxTableImageMasteryEngine.CellMargins(100, 100, 100, 100), new DocxTableImageMasteryEngine.TableBorders(border, border, border, border, border, border), new DocxTableImageMasteryEngine.Shading("clear", "EAF2F8", "AUTO"))));
        source = engine.formatCell(source, "body/tbl:1/tr:2/tc:2", new DocxTableImageMasteryEngine.CellMargins(80, 80, 80, 80), "center");
        source = engine.insertInlineImage(source, "body/p:2", image("T04 Inline", "T04 inline image"));
        source = engine.insertFloatingImage(source, "body/p:3", image("T04 Floating", "T04 floating image"), new DocxTableImageMasteryEngine.FloatingPlacement(457200, 457200, "column", "paragraph", "square"));

        CanonicalDocumentGraphV2 graph = project(source);
        String imageId = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE && "inline".equals(e.semantic().properties().get("placement"))).findFirst().orElseThrow().id();
        DocumentOperationContract op = new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "t04-external-image-format", graph.sourceSha256(), graph.semanticDigest(), DocumentOperationContract.Type.FORMAT,
                List.of(DocumentSelector.node(imageId)), "T04 external table/image proof", Map.of("docx.action", "FORMAT_IMAGE", "image.widthEmu", "1371600", "image.heightEmu", "685800", "image.altText", "T04 governed inline image"),
                DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(), Set.of("word/document.xml"), DocumentOperationContract.VisualImpact.LAYOUT_CHANGE, false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job("t04-external-source", "t04-external-result");
        DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), op, Set.of(imageId), allCapabilities(), List.of());
        DocumentSpineResult result = spine(root, worker).executeExisting(job, new ByteArrayInputStream(source), plan);
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "external T04 publishes verified draft");
        check(result.preservation() != null && result.preservation().pass(), "external T04 preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), "external T04 proof set complete");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS), "LibreOffice/Poppler render proof passes");

        List<DocxTableImageMasteryEngine.TableSnapshot> tables = engine.readTables(result.resultBytes());
        check(tables.size() == 1 && tables.get(0).rows().size() == 3, "external candidate retains native table structure");
        check(tables.get(0).rows().get(0).repeatHeader(), "external candidate retains repeating header row");
        check("center".equals(tables.get(0).rows().get(1).cells().get(1).verticalAlignment()), "external candidate retains cell vertical alignment");
        List<DocxTableImageMasteryEngine.ImageSnapshot> images = engine.readImages(result.resultBytes());
        check(images.size() == 2, "external candidate retains inline and floating images");
        check(images.stream().anyMatch(i -> "floating".equals(i.placement()) && i.xEmu() == 457200), "external candidate retains floating geometry");
        check(images.stream().anyMatch(i -> "inline".equals(i.placement()) && i.widthEmu() == 1371600 && "T04 governed inline image".equals(i.altText())), "external candidate retains governed inline image format");

        CanonicalDocumentGraphV2 projected = project(result.resultBytes());
        check(projected.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE).count() == 1, "external candidate reprojects native table");
        check(projected.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE).count() == 2, "external candidate reprojects both images");

        RenderedPdf rendered = renderToPdf(root.resolve("manual-oracle"), result.resultBytes(), soffice, pdfinfo, pdftotext, pdfimages);
        check(rendered.pages() >= 1, "LibreOffice renders T04 candidate to PDF");
        check(rendered.text().contains("T04 HEADER A") && rendered.text().contains("T04 CELL B2"), "Poppler extracts native table text");
        check(rendered.imageCount() >= 2, "Poppler observes at least two rendered image objects");
    }

    private static DocxTableImageMasteryEngine.RowSpec row(boolean header, String a, String b) { return new DocxTableImageMasteryEngine.RowSpec(List.of(DocxTableImageMasteryEngine.CellSpec.text(a), DocxTableImageMasteryEngine.CellSpec.text(b)), DocxTableImageMasteryEngine.RowHeight.empty(), header); }
    private static DocxTableImageMasteryEngine.ImageSpec image(String name, String alt) { return new DocxTableImageMasteryEngine.ImageSpec(PNG, "png", 914400, 914400, name, "", alt); }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext, Path pdfimages) throws Exception {
        Files.createDirectories(root); Path input = root.resolve("t04.docx"); Path out = root.resolve("out"); Files.createDirectories(out); Files.write(input, docx);
        Process convert = new ProcessBuilder(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", out.toString(), input.toString()).redirectErrorStream(true).start();
        byte[] output = convert.getInputStream().readAllBytes(); if (!convert.waitFor(120, TimeUnit.SECONDS)) { convert.destroyForcibly(); throw new IOException("LibreOffice conversion timeout"); }
        if (convert.exitValue() != 0) throw new IOException("LibreOffice conversion failed: " + new String(output, StandardCharsets.UTF_8));
        Path pdf = out.resolve("t04.pdf"); if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        int pages = parsePages(runTool(pdfinfo, pdf.toString())); Path txt = root.resolve("t04.txt"); runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String imageList = runTool(pdfimages, "-list", pdf.toString());
        int imageCount = 0; for (String line : imageList.split("\\R")) if (line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*")) imageCount++;
        return new RenderedPdf(pages, Files.readString(txt, StandardCharsets.UTF_8), imageCount);
    }
    private static String runTool(Path command, String... args) throws Exception { ArrayList<String> line = new ArrayList<>(); line.add(command.toString()); line.addAll(List.of(args)); Process p = new ProcessBuilder(line).redirectErrorStream(true).start(); byte[] o = p.getInputStream().readAllBytes(); if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); throw new IOException("tool timeout: " + command); } if (p.exitValue() != 0) throw new IOException("tool failed: " + command + " output=" + new String(o, StandardCharsets.UTF_8)); return new String(o, StandardCharsets.UTF_8); }
    private static int parsePages(String info) { for (String line : info.split("\\R")) if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip()); throw new IllegalArgumentException("pdfinfo Pages missing"); }
    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception { Clock clock = Clock.systemUTC(); FilePlatform008Repository repo = new FilePlatform008Repository(root.resolve("platform008-meta")); GovernedArtifactGateway gateway = new GovernedArtifactGateway(root.resolve("platform008-bytes"), ArtifactIntakePolicy.conservative(32L * 1024 * 1024), repo, clock); return new UniversalDocumentSpine(gateway, new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints")), new FileDocumentSpineVersionStore(root.resolve("spine-versions")), new DocumentSpineProofService(new DocumentProcessingService(), worker, clock), clock); }
    private static DocumentSpineJob job(String sourceId, String resultId) { return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T04-EXTERNAL", "qualification", java.time.Instant.now()); }
    private static Set<String> allCapabilities() { LinkedHashSet<String> ids = new LinkedHashSet<>(T04_CAPABILITIES); for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i)); for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); ids.add("UDM-FOUNDATION-0064"); for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(ids); }
    private static Set<String> t04Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 196; i <= 255; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path p : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); } }
    private record RenderedPdf(int pages, String text, int imageCount) {}
}
