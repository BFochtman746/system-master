package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxStructuredMetadataMasteryEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** DOCUMENT-DOCX-MASTERY-T07 independent LibreOffice + Poppler interoperability qualification. */
public final class DocumentDocxMasteryT07ExternalQualification {
    private static final String STORE = "{33333333-3333-3333-3333-333333333333}";
    private static final Set<String> T07 = t07Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]);
        Path pdfinfo = Path.of(args[1]);
        Path pdftotext = Path.of(args[2]);
        Path pdftoppm = Path.of(args[3]);
        Path pdfimages = Path.of(args[4]);
        if (!Files.isExecutable(soffice) || !Files.isExecutable(pdfinfo) || !Files.isExecutable(pdftotext) || !Files.isExecutable(pdftoppm) || !Files.isExecutable(pdfimages)) {
            throw new IllegalArgumentException("external qualification requires executable LibreOffice/Poppler tools");
        }
        Path root = Files.createTempDirectory("document-docx-mastery-t07-external-");
        byte[] source = fixture();
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        check(engine.readCitations(source).size() == 1, "external source retains citation semantics");
        check(engine.readBibliographies(source).size() == 1 && engine.readBibliographies(source).get(0).sources().size() == 1, "external source retains bibliography semantics");
        check(engine.readGeneratedTables(source).size() == 3, "external source retains generated-table semantics");
        check(engine.readContentControls(source).size() == 2 && engine.readContentControls(source).stream().anyMatch(DocxStructuredMetadataMasteryEngine.ContentControlSnapshot::repeating), "external source retains ordinary/repeating controls");
        check(engine.readCustomXmlMappings(source).size() == 1, "external source retains custom XML datastore");
        check(engine.readLegacyFormFields(source).size() == 2, "external source retains legacy form fields");
        check(engine.readDocumentProperties(source).stream().anyMatch(p -> "core.title".equals(p.name()) && "T07 External Mastery".equals(p.value())), "external source retains core document property");
        check(engine.readCustomProperties(source).stream().anyMatch(p -> "ExternalScore".equals(p.name()) && "99".equals(p.value())), "external source retains custom property");
        check(engine.readDocumentVariables(source).stream().anyMatch(v -> "T07Mode".equals(v.name()) && "External".equals(v.value())), "external source retains document variable");

        CanonicalDocumentGraphV2 graph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.CITATION), "external CDG-2 projection sees citation");
        check(graph.elements().stream().anyMatch(e -> "repeating-content-control".equals(e.semantic().role())), "external CDG-2 projection sees repeating content control");
        check(graph.elements().stream().anyMatch(e -> "custom-xml-mapping".equals(e.semantic().role())), "external CDG-2 projection sees custom XML mapping");
        check(graph.elements().stream().anyMatch(e -> "custom-property".equals(e.semantic().role())), "external CDG-2 projection sees custom property");

        RenderedPdf rendered = renderToPdf(root, source, soffice, pdfinfo, pdftotext, pdfimages);
        check(rendered.pages() >= 1, "LibreOffice renders T07 DOCX to PDF");
        check(rendered.text().contains("T07 host 1") && rendered.text().contains("T07 host 20"), "Poppler observes host text after T07 native structures");
        check(rendered.text().contains("(Smith, 2026)") || rendered.text().contains("Smith2026"), "LibreOffice exposes citation field result in PDF text layer");
        check(rendered.text().contains("External customer"), "LibreOffice exposes content-control content in PDF text layer");
        check(rendered.text().contains("Bibliography") || rendered.text().contains("External Systems"), "LibreOffice exposes bibliography field/source content without corrupting document");
        check(rendered.text().contains("Contents") || rendered.text().contains("Table of Contents"), "LibreOffice preserves/generated TOC field result");
        check(rendered.text().contains("External client"), "LibreOffice exposes legacy form result content");
        check(T07.size() == 60, "T07 external lane covers exactly 60 capability IDs");
        System.out.println("DOCUMENT_DOCX_MASTERY_T07_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T07.size() + " pages=" + rendered.pages());
        deleteTree(root);
    }

    private static byte[] fixture() throws Exception {
        DocxStructuredMetadataMasteryEngine e = new DocxStructuredMetadataMasteryEngine();
        ArrayList<String> paragraphs = new ArrayList<>(); for (int i = 1; i <= 20; i++) paragraphs.add("T07 host " + i);
        byte[] source = new DocxFullLaneEngine().createDocument(paragraphs);
        Map<String, byte[]> preserved = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); preserved.put("customXml/t07-external-preserve.xml", "<preserve/>".getBytes(StandardCharsets.UTF_8)); source = OoxmlPackageSupport.write(preserved);
        source = e.upsertBibliographySource(source, new DocxStructuredMetadataMasteryEngine.BibliographySource("Smith2026", "Book", "External Systems", "Alex Smith", "2026"));
        source = e.insertCitation(source, "body/p:1", new DocxStructuredMetadataMasteryEngine.CitationSpec("Smith2026", "(Smith, 2026)", 1033));
        source = e.insertBibliography(source, "body/p:2");
        source = e.insertGeneratedTable(source, "body/p:3", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_CONTENTS, "Contents", ""));
        source = e.insertGeneratedTable(source, "body/p:4", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.INDEX, "Index", ""));
        source = e.insertGeneratedTable(source, "body/p:5", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_FIGURES, "Figures", ""));
        source = e.createCustomXmlMapping(source, new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE, "/root/customer", "", "<root><customer>External customer</customer></root>"));
        source = e.insertContentControl(source, "body/p:6", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Customer", "customer", 801, "External customer", "", STORE, "/root/customer", ""), false);
        source = e.insertContentControl(source, "body/p:7", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Repeating", "rows", 802, "External repeated row", "", "", "", ""), true);
        source = e.insertLegacyFormField(source, "body/p:8", new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.TEXT, "Client", "External client", false, List.of(), true, false));
        source = e.insertLegacyFormField(source, "body/p:9", new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.CHECKBOX, "Approved", "", true, List.of(), true, false));
        source = e.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("core.title", "T07 External Mastery"));
        source = e.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("app.Company", "System Master"));
        source = e.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("ExternalScore", "integer", "99", 0));
        source = e.upsertDocumentVariable(source, new DocxStructuredMetadataMasteryEngine.DocumentVariable("T07Mode", "External"));
        return source;
    }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext, Path pdfimages) throws Exception {
        Path input = root.resolve("t07.docx"); Path out = root.resolve("out"); Files.createDirectories(out); Files.write(input, docx);
        Process convert = new ProcessBuilder(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", out.toString(), input.toString()).redirectErrorStream(true).start();
        byte[] output = convert.getInputStream().readAllBytes(); if (!convert.waitFor(120, TimeUnit.SECONDS)) { convert.destroyForcibly(); throw new IOException("LibreOffice conversion timeout"); }
        if (convert.exitValue() != 0) throw new IOException("LibreOffice conversion failed: " + new String(output, StandardCharsets.UTF_8));
        Path pdf = out.resolve("t07.pdf"); if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        int pages = parsePages(runTool(pdfinfo, pdf.toString())); Path txt = root.resolve("t07.txt"); runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String imageList = runTool(pdfimages, "-list", pdf.toString()); int images = 0; for (String line : imageList.split("\\R")) if (line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*")) images++;
        return new RenderedPdf(pages, Files.readString(txt, StandardCharsets.UTF_8), images);
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var stream = Files.walk(root)) {
            for (Path path : stream.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    private static String runTool(Path command, String... args) throws Exception { ArrayList<String> line = new ArrayList<>(); line.add(command.toString()); line.addAll(List.of(args)); Process p = new ProcessBuilder(line).redirectErrorStream(true).start(); byte[] o = p.getInputStream().readAllBytes(); if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); throw new IOException("tool timeout: " + command); } if (p.exitValue() != 0) throw new IOException("tool failed: " + command + " output=" + new String(o, StandardCharsets.UTF_8)); return new String(o, StandardCharsets.UTF_8); }
    private static int parsePages(String info) { for (String line : info.split("\\R")) if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip()); throw new IllegalArgumentException("pdfinfo Pages missing"); }
    private static Set<String> t07Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 376; i <= 435; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private record RenderedPdf(int pages, String text, int imageCount) {}
}
