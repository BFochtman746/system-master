package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxMarkupCompatibilityMasteryEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** DOCUMENT-DOCX-MASTERY-T13 independent LibreOffice + Poppler interoperability qualification. */
public final class DocumentDocxMasteryT13ExternalQualification {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]); Path pdfinfo = Path.of(args[1]); Path pdftotext = Path.of(args[2]); Path pdftoppm = Path.of(args[3]); Path pdfimages = Path.of(args[4]);
        for (Path p : List.of(soffice, pdfinfo, pdftotext, pdftoppm, pdfimages)) if (!Files.isExecutable(p)) throw new IllegalArgumentException("external tool is not executable: " + p);
        Path root = Files.createTempDirectory("document-docx-mastery-t13-external-");
        try {
            DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
            byte[] source = fixture(engine);
            String sourceSha = OoxmlPackageSupport.sha256(source);
            check(engine.inspect(source).alternateContent().size() == 1, "external source retains one AlternateContent block");
            check(engine.resolve(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007()).get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.FALLBACK,
                    "portable base profile resolves external source to fallback");
            check(engine.resolve(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14)).get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.CHOICE,
                    "portable W14 profile resolves external source to Choice");

            var baseView = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
            var w14View = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
            check(OoxmlPackageSupport.sha256(source).equals(sourceSha), "external compatible-view materialization leaves source identity unchanged");
            check(OoxmlPackageSupport.read(baseView.bytes()).containsKey("customXml/t13-external-preserve.xml"), "base derived view preserves unrelated custom XML package part");
            check(OoxmlPackageSupport.read(w14View.bytes()).containsKey("customXml/t13-external-preserve.xml"), "W14 derived view preserves unrelated custom XML package part");

            RenderedPdf sourceRender = renderToPdf(root.resolve("source"), source, soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, "source");
            RenderedPdf baseRender = renderToPdf(root.resolve("base"), baseView.bytes(), soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, "base");
            RenderedPdf w14Render = renderToPdf(root.resolve("w14"), w14View.bytes(), soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, "w14");
            check(sourceRender.pages() >= 1 && baseRender.pages() >= 1 && w14Render.pages() >= 1, "LibreOffice renders source and both compatibility-derived DOCX artifacts");
            check(sourceRender.text().contains("T13 external host 1") && sourceRender.text().contains("T13 external host 5"), "Poppler observes host content in direct source rendering");
            check(baseRender.text().contains("T13-FALLBACK") && !baseRender.text().contains("T13-W14-CHOICE"), "base compatible view renders fallback content independently");
            check(w14Render.text().contains("T13-W14-CHOICE") && !w14Render.text().contains("T13-FALLBACK"), "W14 compatible view renders selected Choice content independently");
            check(baseView.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.SELECT_FALLBACK), "external fallback derived artifact carries degradation receipt");
            check(w14View.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.SELECT_CHOICE), "external W14 derived artifact carries choice-resolution receipt");
            check(new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, source).elements().stream().anyMatch(e -> "alternate-content".equals(e.semantic().role())), "external source CDG-2 exposes AlternateContent semantics");
            System.out.println("DOCUMENT_DOCX_MASTERY_T13_EXTERNAL_PASS assertions=" + assertions + " sourcePages=" + sourceRender.pages() + " basePages=" + baseRender.pages() + " w14Pages=" + w14Render.pages());
        } finally { deleteTree(root); }
    }

    private static byte[] fixture(DocxMarkupCompatibilityMasteryEngine engine) throws Exception {
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("T13 external host 1", "T13 external host 2", "T13 external host 3", "T13 external host 4", "T13 external host 5"));
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("customXml/t13-external-preserve.xml", "<preserve xmlns=\"urn:t13:external\">KEEP</preserve>".getBytes(StandardCharsets.UTF_8));
        source = OoxmlPackageSupport.write(parts);
        return engine.createAlternateContentText(source, 1, "w14", DocxMarkupCompatibilityMasteryEngine.W14, "T13-W14-CHOICE", "T13-FALLBACK").bytes();
    }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext, Path pdftoppm, Path pdfimages, String stem) throws Exception {
        Files.createDirectories(root);
        Path input = root.resolve(stem + ".docx"); Path out = root.resolve("out"); Files.createDirectories(out); Files.write(input, docx);
        Process convert = new ProcessBuilder(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", out.toString(), input.toString()).redirectErrorStream(true).start();
        byte[] output = convert.getInputStream().readAllBytes();
        if (!convert.waitFor(120, TimeUnit.SECONDS)) { convert.destroyForcibly(); throw new IOException("LibreOffice conversion timeout"); }
        if (convert.exitValue() != 0) throw new IOException("LibreOffice conversion failed: " + new String(output, StandardCharsets.UTF_8));
        Path pdf = out.resolve(stem + ".pdf"); if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        int pages = parsePages(runTool(pdfinfo, pdf.toString()));
        Path txt = root.resolve(stem + ".txt"); runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String imageList = runTool(pdfimages, "-list", pdf.toString()); int images = 0;
        for (String line : imageList.split("\\R")) if (line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*")) images++;
        runTool(pdftoppm, "-f", "1", "-singlefile", "-png", "-r", "72", pdf.toString(), root.resolve(stem + "-preview").toString());
        return new RenderedPdf(pages, Files.readString(txt, StandardCharsets.UTF_8), images);
    }

    private static String runTool(Path command, String... args) throws Exception {
        ArrayList<String> line = new ArrayList<>(); line.add(command.toString()); line.addAll(List.of(args));
        Process p = new ProcessBuilder(line).redirectErrorStream(true).start(); byte[] o = p.getInputStream().readAllBytes();
        if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); throw new IOException("tool timeout: " + command); }
        if (p.exitValue() != 0) throw new IOException("tool failed: " + command + " output=" + new String(o, StandardCharsets.UTF_8));
        return new String(o, StandardCharsets.UTF_8);
    }

    private static int parsePages(String info) {
        for (String line : info.split("\\R")) if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip());
        throw new IllegalArgumentException("pdfinfo Pages missing");
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var stream = Files.walk(root)) { for (Path p : stream.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); }
    }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private record RenderedPdf(int pages, String text, int imageCount) {}
}
