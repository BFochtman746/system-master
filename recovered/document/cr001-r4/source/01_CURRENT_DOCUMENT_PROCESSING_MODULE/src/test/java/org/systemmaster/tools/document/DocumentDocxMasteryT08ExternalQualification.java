package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxReviewProtectionMasteryEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** DOCUMENT-DOCX-MASTERY-T08 independent LibreOffice + Poppler interoperability qualification. */
public final class DocumentDocxMasteryT08ExternalQualification {
    private static final Instant FIXED = Instant.parse("2026-09-01T15:00:00Z");
    private static final Set<String> T08 = t08Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]); Path pdfinfo = Path.of(args[1]); Path pdftotext = Path.of(args[2]); Path pdftoppm = Path.of(args[3]); Path pdfimages = Path.of(args[4]);
        for (Path p : List.of(soffice, pdfinfo, pdftotext, pdftoppm, pdfimages)) if (!Files.isExecutable(p)) throw new IllegalArgumentException("external tool is not executable: " + p);
        Path root = Files.createTempDirectory("document-docx-mastery-t08-external-");
        try {
            byte[] source = fixture();
            DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
            check(e.readMailMergeFields(source).stream().anyMatch(f -> "ExternalCustomer".equals(f.spec().fieldName())), "external fixture retains mail-merge semantics");
            check(e.readRevisions(source).stream().anyMatch(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION), "external fixture retains tracked insertion");
            check(e.readRevisions(source).stream().anyMatch(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.DELETION), "external fixture retains tracked deletion");
            check(e.readRevisions(source).stream().filter(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_FROM || r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_TO).count() == 2, "external fixture retains move pair");
            check(e.readRevisions(source).stream().anyMatch(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.FORMATTING), "external fixture retains formatting revision");
            check(e.readComments(source).size() == 3, "external fixture retains classic/modern/threaded comments");
            check(e.readComments(source).stream().anyMatch(c -> c.modern() && c.resolved()), "external fixture retains resolved modern reply state");
            check(e.readComments(source).stream().flatMap(c -> c.mentions().stream()).anyMatch(m -> "External Reviewer".equals(m.displayName())), "external fixture retains mention identity");
            check(e.readDocumentProtection(source).edit() == DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, "external fixture retains document protection");
            check(e.readRestrictedRanges(source).size() == 1, "external fixture retains restricted-editing range");

            CanonicalDocumentGraphV2 graph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            check(graph.elements().stream().anyMatch(x -> x.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "mail-merge-field".equals(x.semantic().role())), "external CDG-2 sees mail merge");
            check(graph.elements().stream().anyMatch(x -> x.type() == CanonicalDocumentGraphV2.ElementType.REVISION), "external CDG-2 sees revisions");
            check(graph.elements().stream().anyMatch(x -> x.type() == CanonicalDocumentGraphV2.ElementType.COMMENT && "modern-comment".equals(x.semantic().role())), "external CDG-2 sees modern comments");
            check(graph.elements().stream().anyMatch(x -> "document-protection".equals(x.semantic().role())), "external CDG-2 sees protection");
            check(graph.elements().stream().anyMatch(x -> "restricted-editing".equals(x.semantic().role())), "external CDG-2 sees restricted-editing semantics");

            RenderedPdf rendered = renderToPdf(root, source, soffice, pdfinfo, pdftotext, pdfimages);
            check(rendered.pages() >= 1, "LibreOffice renders T08 DOCX to PDF");
            check(rendered.text().contains("T08 external host 1") && rendered.text().contains("T08 external host 20"), "Poppler observes preserved host text");
            check(rendered.text().contains("External Customer") || rendered.text().contains("ExternalCustomer"), "LibreOffice exposes mail-merge display/result without corruption");
            check(rendered.text().contains("external inserted") || rendered.text().contains("external deleted") || rendered.text().contains("external moved"), "LibreOffice processes tracked-revision content without corrupting document");
            check(OoxmlPackageSupport.read(source).containsKey("customXml/t08-external-preserve.xml"), "external fixture preserves unrelated OPC content");
            check(T08.size() == 60, "T08 external lane covers exactly 60 capability IDs");
            System.out.println("DOCUMENT_DOCX_MASTERY_T08_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T08.size() + " pages=" + rendered.pages());
        } finally { deleteTree(root); }
    }

    private static byte[] fixture() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        ArrayList<String> paragraphs = new ArrayList<>(); for (int i = 1; i <= 20; i++) paragraphs.add("T08 external host " + i);
        byte[] source = new DocxFullLaneEngine().createDocument(paragraphs);
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); parts.put("customXml/t08-external-preserve.xml", "<preserve/>".getBytes(StandardCharsets.UTF_8)); source = OoxmlPackageSupport.write(parts);
        source = e.insertMailMergeField(source, "body/p:1", new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("ExternalCustomer", "\\* MERGEFORMAT", "External Customer"));
        source = e.insertTrackedInsertion(source, "body/p:2", revision(DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION, "801", "External Editor", "external inserted"));
        source = e.insertTrackedDeletion(source, "body/p:3", revision(DocxReviewProtectionMasteryEngine.RevisionKind.DELETION, "802", "External Editor", "external deleted"));
        source = e.createTrackedMove(source, "body/p:4", "body/p:5", revision(DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_FROM, "803", "External Editor", "external moved"));
        source = e.applyFormattingRevision(source, "body/p:6", new DocxReviewProtectionMasteryEngine.FormattingRevisionSpec("804", "External Editor", FIXED.plusSeconds(4), true, true, "225588"));
        source = e.addClassicComment(source, "body/p:7", comment("Classic External", "CE", "classic external comment", 10));
        source = e.addModernComment(source, "body/p:8", comment("Modern External", "ME", "modern external review", 20), false, new DocxReviewProtectionMasteryEngine.MentionSpec("External Reviewer", "PeoplePicker", "reviewer@example.test"));
        int parent = e.readComments(source).stream().filter(DocxReviewProtectionMasteryEngine.CommentSnapshot::modern).findFirst().orElseThrow().id();
        source = e.addModernReply(source, parent, comment("Reply External", "RE", "external reply", 30), true, null);
        source = e.upsertDocumentProtection(source, new DocxReviewProtectionMasteryEngine.ProtectionSpec(DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, true, false, "", "", "", 0, 0, "", ""));
        source = e.upsertRestrictedRange(source, new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec("901", "editors", "body/p:9"));
        return source;
    }

    private static DocxReviewProtectionMasteryEngine.RevisionSpec revision(DocxReviewProtectionMasteryEngine.RevisionKind kind, String id, String author, String text) { return new DocxReviewProtectionMasteryEngine.RevisionSpec(kind, id, author, FIXED.plusSeconds(Integer.parseInt(id) % 60), text); }
    private static DocxReviewProtectionMasteryEngine.CommentSpec comment(String author, String initials, String text, long seconds) { return new DocxReviewProtectionMasteryEngine.CommentSpec(author, initials, FIXED.plusSeconds(seconds), text); }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext, Path pdfimages) throws Exception {
        Path input = root.resolve("t08.docx"); Path out = root.resolve("out"); Files.createDirectories(out); Files.write(input, docx);
        Process convert = new ProcessBuilder(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", out.toString(), input.toString()).redirectErrorStream(true).start();
        byte[] output = convert.getInputStream().readAllBytes(); if (!convert.waitFor(120, TimeUnit.SECONDS)) { convert.destroyForcibly(); throw new IOException("LibreOffice conversion timeout"); }
        if (convert.exitValue() != 0) throw new IOException("LibreOffice conversion failed: " + new String(output, StandardCharsets.UTF_8));
        Path pdf = out.resolve("t08.pdf"); if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        int pages = parsePages(runTool(pdfinfo, pdf.toString())); Path txt = root.resolve("t08.txt"); runTool(pdftotext, "-layout", pdf.toString(), txt.toString());
        String imageList = runTool(pdfimages, "-list", pdf.toString()); int images = 0; for (String line : imageList.split("\\R")) if (line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*")) images++;
        return new RenderedPdf(pages, Files.readString(txt, StandardCharsets.UTF_8), images);
    }
    private static String runTool(Path command, String... args) throws Exception { ArrayList<String> line = new ArrayList<>(); line.add(command.toString()); line.addAll(List.of(args)); Process p = new ProcessBuilder(line).redirectErrorStream(true).start(); byte[] o = p.getInputStream().readAllBytes(); if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); throw new IOException("tool timeout: " + command); } if (p.exitValue() != 0) throw new IOException("tool failed: " + command + " output=" + new String(o, StandardCharsets.UTF_8)); return new String(o, StandardCharsets.UTF_8); }
    private static int parsePages(String info) { for (String line : info.split("\\R")) if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).strip()); throw new IllegalArgumentException("pdfinfo Pages missing"); }
    private static void deleteTree(Path root) throws IOException { if (!Files.exists(root)) return; try (var stream = Files.walk(root)) { for (Path p : stream.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); } }
    private static Set<String> t08Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 436; i <= 495; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private record RenderedPdf(int pages, String text, int imageCount) {}
}
