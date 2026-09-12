package org.systemmaster.tools.docx;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.ArtifactMediaDetector;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.InMemoryCapabilityRegistry;
import org.systemmaster.core.InMemoryPlatform008Repository;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Clock;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class DocxToolPortableTests {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        var root = Files.createTempDirectory("docx-tool-portable-");
        var gateway = new GovernedArtifactGateway(root, ArtifactIntakePolicy.conservative(32 * 1024 * 1024), new InMemoryPlatform008Repository(), Clock.systemUTC());
        var service = new DocxToolService(gateway, Clock.systemUTC());

        byte[] sourceBytes = sample(false);
        var inspected = service.ingestAndInspect("book-chapter.docx", new ByteArrayInputStream(sourceBytes));
        check(DocxToolService.DOCX_MEDIA_TYPE.equals(inspected.version().mediaType()), "OOXML media detection");
        check(inspected.packageInspection().paragraphs().equals(List.of("Hello world", "Second paragraph")), "paragraph extraction");
        check(!inspected.packageInspection().activeContent().macroProject(), "passive docx has no macro");
        check(inspected.packageInspection().entryNames().contains("customXml/item1.xml"), "unknown/custom OOXML preserved in inventory");

        var edit = service.replaceText(inspected.version(), "book-chapter-v2.docx", "Hello", "Greetings");
        check(edit.replacements() == 1, "one replacement");
        check(!edit.sourceSemanticDigest().equals(edit.resultSemanticDigest()), "semantic digest changes");
        check(!edit.source().digest().equals(edit.result().digest()), "immutable child version has new digest");
        var result = service.inspect(edit.result());
        check(result.packageInspection().paragraphs().getFirst().equals("Greetings world"), "replacement visible");
        check(result.packageInspection().entryNames().contains("customXml/item1.xml"), "custom OOXML preserved after edit");

        boolean noMatch = false;
        try { service.replaceText(edit.result(), "v3.docx", "missing text", "x"); }
        catch (IllegalArgumentException expected) { noMatch = true; }
        check(noMatch, "no-match edit fails closed");

        var active = service.ingestAndInspect("macro-shaped.docx", new ByteArrayInputStream(sample(true)));
        check(active.packageInspection().activeContent().macroProject(), "macro project inventory detected");
        check(active.packageInspection().activeContent().externalRelationships(), "external relationship inventory detected");

        var registry = new InMemoryCapabilityRegistry(DocxCapabilityDescriptors.portableCore());
        check(registry.resolve("MOD-DOCX-001.INSPECT", "1.0.0").isPresent(), "inspect capability registered");
        check(registry.resolve("MOD-DOCX-001.REPLACE_TEXT", "1.0.0").isPresent(), "edit capability registered");
        check(registry.descriptorDigest("MOD-DOCX-001.INSPECT", "1.0.0").orElseThrow().matches("[0-9a-f]{64}"), "descriptor digest bound");

        var detector = new ArtifactMediaDetector();
        check(ArtifactMediaDetector.XLSX.equals(detector.detect(sampleOffice("xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", false))), "XLSX package detection");
        check(ArtifactMediaDetector.XLSM.equals(detector.detect(sampleOffice("xl/workbook.xml", "application/vnd.ms-excel.sheet.macroEnabled.main+xml", true))), "XLSM package detection");
        check(ArtifactMediaDetector.PPTX.equals(detector.detect(sampleOffice("ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml", false))), "PPTX package detection");
        check(ArtifactMediaDetector.PPTM.equals(detector.detect(sampleOffice("ppt/presentation.xml", "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml", true))), "PPTM package detection");

        System.out.println("DOCX_TOOL_PORTABLE_PASS assertions=" + assertions);
    }

    private static byte[] sample(boolean active) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            put(zip, "[Content_Types].xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                    </Types>
                    """);
            put(zip, "_rels/.rels", """
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                    </Relationships>
                    """);
            put(zip, "word/document.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
                      <w:p><w:r><w:t>Hello world</w:t></w:r></w:p>
                      <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
                    </w:body></w:document>
                    """);
            put(zip, "word/_rels/document.xml.rels", active ? """
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
                    </Relationships>
                    """ : "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>");
            put(zip, "customXml/item1.xml", "<root><preserve>true</preserve></root>");
            if (active) put(zip, "word/vbaProject.bin", "not-executed");
        }
        return out.toByteArray();
    }

    private static byte[] sampleOffice(String mainPart, String mainContentType, boolean macro) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            put(zip, "[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Override PartName=\"/" + mainPart + "\" ContentType=\"" + mainContentType + "\"/></Types>");
            put(zip, mainPart, "<root/>");
            if (macro) put(zip, mainPart.startsWith("xl/") ? "xl/vbaProject.bin" : "ppt/vbaProject.bin", "macro");
        }
        return out.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String value) throws Exception {
        ZipEntry entry = new ZipEntry(name);
        entry.setTime(0L);
        zip.putNextEntry(entry);
        zip.write(value.stripLeading().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
