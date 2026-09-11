package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxConformanceProfileMasteryEngine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** DOCUMENT-DOCX-MASTERY-T14 independent LibreOffice + Poppler Strict/Transitional qualification. */
public final class DocumentDocxMasteryT14ExternalQualification {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]);
        Path pdfinfo = Path.of(args[1]);
        Path pdftotext = Path.of(args[2]);
        Path pdftoppm = Path.of(args[3]);
        Path pdfimages = Path.of(args[4]);
        for (Path p : List.of(soffice, pdfinfo, pdftotext, pdftoppm, pdfimages)) {
            if (!Files.isExecutable(p)) throw new IllegalArgumentException("external tool is not executable: " + p);
        }

        Path root = Files.createTempDirectory("document-docx-mastery-t14-external-");
        try {
            DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
            byte[] source = new DocxFullLaneEngine().createDocument(List.of(
                    "T14 profile external host 1",
                    "T14 profile external host 2",
                    "T14 profile external host 3"));
            String sourceSha = OoxmlPackageSupport.sha256(source);
            var sourceSnapshot = engine.inspect(source);
            check(sourceSnapshot.profile() == DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL, "source is detected as Transitional");
            check(sourceSnapshot.profileCoherent(), "source Transitional profile is coherent");

            var strict = engine.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT);
            check(strict.resultSnapshot().profile() == DocxConformanceProfileMasteryEngine.Profile.STRICT, "converted artifact is detected as Strict");
            check(strict.resultSnapshot().profileCoherent(), "converted Strict profile is coherent");
            check("strict".equalsIgnoreCase(strict.resultSnapshot().declaredConformance()), "Strict artifact declares strict conformance");
            check(OoxmlPackageSupport.sha256(source).equals(sourceSha), "Strict conversion leaves source bytes unchanged");

            var transitional = engine.convert(strict.bytes(), DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL);
            check(transitional.resultSnapshot().profile() == DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL, "Strict artifact converts back to Transitional");
            check(transitional.resultSnapshot().profileCoherent(), "round-trip Transitional profile is coherent");

            RenderedPdf sourceRender = renderToPdf(root.resolve("source"), source, soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, "source");
            RenderedPdf strictRender = renderToPdf(root.resolve("strict"), strict.bytes(), soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, "strict");
            RenderedPdf transitionalRender = renderToPdf(root.resolve("transitional"), transitional.bytes(), soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, "transitional");
            check(sourceRender.pages() >= 1 && strictRender.pages() >= 1 && transitionalRender.pages() >= 1,
                    "LibreOffice renders Transitional source, Strict conversion, and Transitional round-trip");
            check(strictRender.text().contains("T14 profile external host 1") && strictRender.text().contains("T14 profile external host 3"),
                    "Poppler observes host text after Strict conversion");
            check(transitionalRender.text().contains("T14 profile external host 1") && transitionalRender.text().contains("T14 profile external host 3"),
                    "Poppler observes host text after Transitional round-trip");

            CanonicalDocumentGraphV2 strictGraph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, strict.bytes());
            check(strictGraph.elements().stream().anyMatch(e -> "docx-conformance-profile".equals(e.semantic().role())
                    && "STRICT".equals(e.semantic().properties().get("profile"))),
                    "CDG-2 independently projects Strict profile metadata");
            check(strictGraph.sourceSha256().equals(strict.resultSha256()), "CDG-2 Strict projection is bound to exact Strict artifact digest");
            check(!strict.resultSnapshot().fullSchemaConformanceClaimed(), "external qualification does not overclaim full schema conformance");

            System.out.println("DOCUMENT_DOCX_MASTERY_T14_EXTERNAL_PASS assertions=" + assertions
                    + " sourcePages=" + sourceRender.pages()
                    + " strictPages=" + strictRender.pages()
                    + " transitionalPages=" + transitionalRender.pages());
        } finally {
            deleteTree(root);
        }
    }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext,
                                           Path pdftoppm, Path pdfimages, String stem) throws Exception {
        Files.createDirectories(root);
        Path input = root.resolve(stem + ".docx");
        Path out = root.resolve("out");
        Files.createDirectories(out);
        Files.write(input, docx);
        Process convert = new ProcessBuilder(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir",
                out.toString(), input.toString()).redirectErrorStream(true).start();
        byte[] output = convert.getInputStream().readAllBytes();
        if (!convert.waitFor(120, TimeUnit.SECONDS)) {
            convert.destroyForcibly();
            throw new IOException("LibreOffice conversion timeout");
        }
        if (convert.exitValue() != 0) {
            throw new IOException("LibreOffice conversion failed: " + new String(output, StandardCharsets.UTF_8));
        }
        Path pdf = out.resolve(stem + ".pdf");
        if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        int pages = parsePages(runTool(pdfinfo, pdf.toString()));
        Path txt = root.resolve(stem + ".txt");
        runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String imageList = runTool(pdfimages, "-list", pdf.toString());
        int images = 0;
        for (String line : imageList.split("\\R")) {
            if (line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*")) images++;
        }
        runTool(pdftoppm, "-f", "1", "-singlefile", "-png", "-r", "72", pdf.toString(), root.resolve(stem + "-preview").toString());
        return new RenderedPdf(pages, Files.readString(txt, StandardCharsets.UTF_8), images);
    }

    private static String runTool(Path command, String... args) throws Exception {
        ArrayList<String> line = new ArrayList<>();
        line.add(command.toString());
        line.addAll(List.of(args));
        Process p = new ProcessBuilder(line).redirectErrorStream(true).start();
        byte[] output = p.getInputStream().readAllBytes();
        if (!p.waitFor(60, TimeUnit.SECONDS)) {
            p.destroyForcibly();
            throw new IOException("tool timeout: " + command);
        }
        if (p.exitValue() != 0) {
            throw new IOException("tool failed: " + command + " output=" + new String(output, StandardCharsets.UTF_8));
        }
        return new String(output, StandardCharsets.UTF_8);
    }

    private static int parsePages(String info) {
        for (String line : info.split("\\R")) {
            if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip());
        }
        throw new IllegalArgumentException("pdfinfo Pages missing");
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var stream = Files.walk(root)) {
            for (Path p : stream.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p);
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private record RenderedPdf(int pages, String text, int imageCount) {}
}
