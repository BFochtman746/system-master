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
import org.systemmaster.tools.docx.DocxPageArchitectureEngine;

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

/** LibreOffice + Poppler qualification for DOCUMENT-DOCX-MASTERY-T02. */
public final class DocumentDocxMasteryT02ExternalQualification {
    private static final Set<String> T02_CAPABILITIES = t02Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        }
        Path soffice = Path.of(args[0]);
        Path pdfinfo = Path.of(args[1]);
        Path pdftotext = Path.of(args[2]);
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(
                soffice, pdfinfo, pdftotext, Path.of(args[3]), Path.of(args[4]));
        Path root = Files.createTempDirectory("document-docx-mastery-t02-external-");
        try {
            qualifyPageArchitecture(root, worker, soffice, pdfinfo, pdftotext);
            System.out.println("DOCUMENT_DOCX_MASTERY_T02_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T02_CAPABILITIES.size());
        } finally {
            deleteTree(root);
        }
    }

    private static void qualifyPageArchitecture(
            Path root,
            RenderProofWorker worker,
            Path soffice,
            Path pdfinfo,
            Path pdftotext) throws Exception {
        DocxPageArchitectureEngine engine = new DocxPageArchitectureEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of(
                "External Page One Body", "External Page Two Body", "External Page Three Body", "External Page Four Body"));
        String section = "body/sectPr:1";
        DocxPageArchitectureEngine.BorderEdge edge = new DocxPageArchitectureEngine.BorderEdge("single", 12, 6, "4472C4");
        source = engine.formatPageBorders(source, section, new DocxPageArchitectureEngine.PageBorders("page", "allPages", "front", edge, edge, edge, edge));
        source = engine.formatPageBackground(source, new DocxPageArchitectureEngine.PageBackground("FFF9E6", "", "", ""));
        source = engine.formatColumns(source, section, new DocxPageArchitectureEngine.ColumnLayout(2, 720, false, true, List.of()));
        source = engine.formatLineNumbering(source, section, new DocxPageArchitectureEngine.LineNumbering(1, 1, 240, "continuous"));
        source = engine.formatPageNumbering(source, section, new DocxPageArchitectureEngine.PageNumbering(1, "decimal", null, ""));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "default", "DEFAULT HEADER T02"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "first", "FIRST HEADER T02"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "even", "EVEN HEADER T02"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("footer", "default", "DEFAULT FOOTER T02"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("footer", "first", "FIRST FOOTER T02"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("footer", "even", "EVEN FOOTER T02"));
        source = engine.insertBreak(source, "body/p:1", new DocxPageArchitectureEngine.BreakSpec("page"));
        source = engine.insertBreak(source, "body/p:2", new DocxPageArchitectureEngine.BreakSpec("page"));
        source = engine.insertBreak(source, "body/p:3", new DocxPageArchitectureEngine.BreakSpec("page"));
        source = engine.insertSectionBreak(source, "body/p:3", new DocxPageArchitectureEngine.SectionBreakSpec("continuous"));

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element finalSection = graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "body/sectPr:1".equals(e.nativeAnchor().locator()))
                .findFirst().orElseThrow();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "FORMAT_PAGE_NUMBERING");
        params.put("pageNumbering.start", "2");
        params.put("pageNumbering.format", "decimal");
        DocumentOperationContract operation = new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "docx-mastery-t02-external-page-numbering",
                graph.sourceSha256(),
                graph.semanticDigest(),
                DocumentOperationContract.Type.FORMAT,
                List.of(DocumentSelector.node(finalSection.id())),
                "DOCUMENT-DOCX-MASTERY-T02 independent external page architecture proof",
                params,
                DocumentOperationContract.Risk.REVERSIBLE_EDIT,
                graph.sourceSha256(),
                Set.of("word/document.xml"),
                DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,
                false,
                List.of(),
                false,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job("t02-external-source", "t02-external-result");
        DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(
                job.jobId(), job.mode(), operation, Set.of(finalSection.id()), allCapabilities(), List.of());
        DocumentSpineResult result = spine(root, worker).executeExisting(job, new ByteArrayInputStream(source), plan);
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "external T02 spine publishes verified draft");
        check(result.preservation() != null && result.preservation().pass(), "external T02 native preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), "external T02 proof set complete");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS), "LibreOffice/Poppler render proof passes");
        check(Integer.valueOf(2).equals(engine.readPageNumbering(result.resultBytes(), section).start()), "external candidate retains page-number mutation");
        List<DocxPageArchitectureEngine.HeaderFooterSnapshot> headerFooters = engine.readHeaderFooters(result.resultBytes());
        check(List.of(
                "header:default:DEFAULT HEADER T02",
                "header:first:FIRST HEADER T02",
                "header:even:EVEN HEADER T02",
                "footer:default:DEFAULT FOOTER T02",
                "footer:first:FIRST FOOTER T02",
                "footer:even:EVEN FOOTER T02").stream().allMatch(expected -> {
                    String[] pieces = expected.split(":", 3);
                    return headerFooters.stream().anyMatch(snapshot -> pieces[0].equals(snapshot.kind())
                            && pieces[1].equals(snapshot.variant())
                            && snapshot.text().contains(pieces[2]));
                }), "external candidate retains all header/footer variants across inherited/new sections");
        check(project(result.resultBytes()).elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.BREAK && "page".equals(e.semantic().properties().get("type"))).count() == 3, "external candidate retains page-break semantics");
        check(project(result.resultBytes()).elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "continuous".equals(e.semantic().properties().get("sectionBreak.type"))), "external candidate retains section-break semantics");

        RenderedPdf rendered = renderToPdf(root.resolve("manual-oracle"), result.resultBytes(), soffice, pdfinfo, pdftotext);
        check(rendered.pages() >= 4, "LibreOffice renders page-break architecture to at least four pages");
        check(rendered.text().contains("FIRST HEADER T02"), "LibreOffice renders first-page header variant");
        check(rendered.text().contains("EVEN HEADER T02"), "LibreOffice renders even-page header variant");
        check(rendered.text().contains("DEFAULT HEADER T02"), "LibreOffice renders default odd-page header variant");
        check(rendered.text().contains("FIRST FOOTER T02"), "LibreOffice renders first-page footer variant");
        check(rendered.text().contains("EVEN FOOTER T02"), "LibreOffice renders even-page footer variant");
        check(rendered.text().contains("DEFAULT FOOTER T02"), "LibreOffice renders default odd-page footer variant");
        check(rendered.text().contains("External Page One Body") && rendered.text().contains("External Page Four Body"), "LibreOffice/Poppler preserve body content across page architecture");
    }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext) throws Exception {
        Files.createDirectories(root);
        Path input = root.resolve("t02.docx");
        Path out = root.resolve("out");
        Files.createDirectories(out);
        Files.write(input, docx);
        Process convert = new ProcessBuilder(
                soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", out.toString(), input.toString())
                .redirectErrorStream(true).start();
        byte[] convertOutput = convert.getInputStream().readAllBytes();
        if (!convert.waitFor(120, TimeUnit.SECONDS)) {
            convert.destroyForcibly();
            throw new IOException("LibreOffice conversion timeout");
        }
        if (convert.exitValue() != 0) throw new IOException("LibreOffice conversion failed: " + new String(convertOutput, StandardCharsets.UTF_8));
        Path pdf = out.resolve("t02.pdf");
        if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        String info = runTool(pdfinfo, pdf.toString());
        int pages = parsePages(info);
        Path txt = root.resolve("t02.txt");
        runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String text = Files.readString(txt, StandardCharsets.UTF_8);
        return new RenderedPdf(pages, text);
    }

    private static String runTool(Path command, String... args) throws Exception {
        ArrayList<String> commandLine = new ArrayList<>();
        commandLine.add(command.toString());
        commandLine.addAll(List.of(args));
        Process process = new ProcessBuilder(commandLine).redirectErrorStream(true).start();
        byte[] output = process.getInputStream().readAllBytes();
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("tool timeout: " + command);
        }
        if (process.exitValue() != 0) throw new IOException("tool failed: " + command + " output=" + new String(output, StandardCharsets.UTF_8));
        return new String(output, StandardCharsets.UTF_8);
    }

    private static int parsePages(String info) {
        for (String line : info.split("\\R")) {
            if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip());
        }
        throw new IllegalArgumentException("pdfinfo Pages field missing");
    }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception {
        Clock clock = Clock.systemUTC();
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"), ArtifactIntakePolicy.conservative(32L * 1024 * 1024), repository, clock);
        return new UniversalDocumentSpine(
                gateway,
                new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints")),
                new FileDocumentSpineVersionStore(root.resolve("spine-versions")),
                new DocumentSpineProofService(new DocumentProcessingService(), worker, clock),
                clock,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(clock));
    }

    private static DocumentSpineJob job(String sourceId, String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx",
                DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX,
                DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T02-EXTERNAL", "qualification", java.time.Instant.now());
    }

    private static Set<String> allCapabilities() {
        LinkedHashSet<String> ids = new LinkedHashSet<>(T02_CAPABILITIES);
        for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        ids.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(ids);
    }

    private static Set<String> t02Capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (int i = 76; i <= 135; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception {
        return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    private record RenderedPdf(int pages, String text) {}
}
