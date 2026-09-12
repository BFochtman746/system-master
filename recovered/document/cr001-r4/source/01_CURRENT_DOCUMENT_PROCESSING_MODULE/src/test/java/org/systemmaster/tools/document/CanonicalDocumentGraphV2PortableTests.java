package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxPackageEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class CanonicalDocumentGraphV2PortableTests {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testDocxDeepProjectionAndOpenWorld();
        testPptxGeometryBehaviorAndNotes();
        testPdfAndTextProjection();
        testMigrationAndGraphInvariants();
        testMalformedXmlFailsClosed();
        System.out.println("CANONICAL_DOCUMENT_GRAPH_V2_PORTABLE_PASS assertions=" + assertions + " schema=" + CanonicalDocumentGraphV2.SCHEMA_V2);
    }

    private static void testDocxDeepProjectionAndOpenWorld() throws Exception {
        DocxFullLaneEngine engine = new DocxFullLaneEngine();
        byte[] docx = engine.createDocument(List.of("Alpha", "Beta"));
        docx = engine.addTable(docx, List.of(List.of("R1C1", "R1C2"), List.of("R2C1", "R2C2")));
        docx = engine.addSimpleField(docx, "PAGE", "1");
        docx = addWordStylesAndHeading(docx);
        docx = addUnknownCustomPart(docx, "customXml/item42.xml", "<custom xmlns=\"urn:test\">preserve-me</custom>");
        docx = addRevision(docx);

        DocumentProcessingService service = new DocumentProcessingService();
        CanonicalDocumentGraphV2 first = service.projectCanonicalGraphV2(DocumentFormat.DOCX, docx);
        check(first.kind() == CanonicalDocumentGraphV2.Kind.FLOW_DOCUMENT, "DOCX CDG-2 kind");
        check(count(first, CanonicalDocumentGraphV2.ElementType.PARAGRAPH) >= 7, "DOCX paragraphs projected including table cells");
        check(count(first, CanonicalDocumentGraphV2.ElementType.RUN) >= 7, "DOCX runs projected");
        check(count(first, CanonicalDocumentGraphV2.ElementType.TABLE) == 1, "DOCX table projected");
        check(count(first, CanonicalDocumentGraphV2.ElementType.TABLE_CELL) == 4, "DOCX table cells projected");
        check(count(first, CanonicalDocumentGraphV2.ElementType.FIELD) >= 1, "DOCX field behavior projected");
        check(first.elements().stream().anyMatch(e -> "Heading1".equals(e.style().declaredStyleId())), "DOCX declared style projected");
        check(first.elements().stream().anyMatch(e -> e.style().inheritanceChain().contains("Normal")), "DOCX style inheritance chain projected");
        check(first.elements().stream().anyMatch(e -> !e.review().revisionIds().isEmpty()), "DOCX revision references projected");
        check(first.unknownNativeFeatures().stream().anyMatch(u -> u.nativePart().equals("customXml/item42.xml")), "unknown custom XML detected");
        check(first.nativeParts().stream().anyMatch(p -> p.partName().equals("customXml/item42.xml") && p.preserveByDefault()), "unknown custom XML preserved by default");

        OpenWorldFeatureDiscovery discovery = new OpenWorldFeatureDiscovery();
        List<OpenWorldFeatureDiscovery.ProvisionalCapability> provisional = discovery.discover(first);
        check(provisional.stream().anyMatch(p -> p.nativePart().equals("customXml/item42.xml")), "unknown feature gets provisional capability record");
        OpenWorldFeatureDiscovery.LossGateResult blocked = discovery.evaluateTargeting(first, Set.of("customXml/item42.xml"));
        check(!blocked.allowed() && !blocked.blockingFeatureIds().isEmpty(), "targeting unknown feature is blocked");
        OpenWorldFeatureDiscovery.LossGateResult allowed = discovery.evaluateTargeting(first, Set.of("word/document.xml"));
        check(allowed.allowed(), "targeting represented native part is allowed by open-world gate");

        byte[] semanticallySame = reserializeWordDocument(docx);
        CanonicalDocumentGraphV2 second = service.projectCanonicalGraphV2(DocumentFormat.DOCX, semanticallySame);
        check(first.semanticDigest().equals(second.semanticDigest()), "semantic digest ignores irrelevant XML serialization changes");
        check(ids(first).equals(ids(second)), "stable element IDs survive semantic no-op round trip");
        check(!first.sourceSha256().equals(second.sourceSha256()), "test proves bytes changed while semantics stayed stable");

        byte[] edited = new DocxPackageEngine().replaceText(docx, "Alpha", "Omega").bytes();
        NativePartPreservationMap.Assessment preservation = service.assessNativePreservation(DocumentFormat.DOCX, docx, edited, Set.of("word/document.xml"));
        check(preservation.pass(), "semantic edit preserves unrelated native parts");
        check(preservation.parts().stream().anyMatch(p -> p.partName().equals("customXml/item42.xml") && p.change() == NativePartPreservationMap.Change.PRESERVED), "unknown part remains byte-for-byte unchanged");
    }

    private static void testPptxGeometryBehaviorAndNotes() throws Exception {
        PptxFullLaneEngine engine = new PptxFullLaneEngine();
        byte[] pptx = engine.createPresentation("CDG2", List.of(
                new PptxFullLaneEngine.SlideSpec("Title", List.of("One", "Two"), "Speaker note")));
        pptx = engine.addHyperlink(pptx, 1, "https://example.com");
        pptx = engine.addMediaPart(pptx, "sample.png", new byte[]{1, 2, 3, 4, 5});
        pptx = addPptTransitionTimingAndUnknownPart(pptx);

        CanonicalDocumentGraphV2 graph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.PPTX, pptx);
        check(graph.kind() == CanonicalDocumentGraphV2.Kind.PRESENTATION, "PPTX CDG-2 kind");
        check(count(graph, CanonicalDocumentGraphV2.ElementType.SLIDE) == 1, "PPTX slide projected");
        check(count(graph, CanonicalDocumentGraphV2.ElementType.SHAPE) >= 2, "PPTX shapes projected");
        check(count(graph, CanonicalDocumentGraphV2.ElementType.TEXT_FRAME) >= 2, "PPTX text frames projected");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SHAPE).anyMatch(e -> !e.geometry().width().isBlank() && !e.geometry().height().isBlank()), "PPTX shape geometry projected");
        check(count(graph, CanonicalDocumentGraphV2.ElementType.TRANSITION) == 1, "PPTX transition projected");
        check(count(graph, CanonicalDocumentGraphV2.ElementType.ANIMATION) == 1, "PPTX animation timeline projected");
        check(count(graph, CanonicalDocumentGraphV2.ElementType.SPEAKER_NOTE) == 1, "PPTX speaker note projected");
        check(graph.references().stream().anyMatch(r -> r.external() && r.target().equals("https://example.com")), "PPTX external hyperlink relationship inventoried");
        check(graph.assets().stream().anyMatch(a -> a.nativePart().equals("ppt/media/sample.png")), "PPTX media asset inventoried");
        check(graph.unknownNativeFeatures().stream().anyMatch(u -> u.nativePart().equals("ppt/customData/data1.xml")), "PPTX unknown native part detected");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SHAPE).map(e -> e.geometry().zOrder()).distinct().count() >= 2, "PPTX z-order represented");
    }

    private static void testPdfAndTextProjection() throws Exception {
        DocumentProcessingService service = new DocumentProcessingService();
        byte[] pdf = service.create(DocumentFormat.PDF, "PDF text");
        CanonicalDocumentGraphV2 pdfGraph = service.projectCanonicalGraphV2(DocumentFormat.PDF, pdf);
        check(count(pdfGraph, CanonicalDocumentGraphV2.ElementType.PAGE) == 1, "PDF page projected");
        check(count(pdfGraph, CanonicalDocumentGraphV2.ElementType.TEXT_BLOCK) >= 1, "PDF literal text fallback represented explicitly");
        check(pdfGraph.provenance().get("projectionSlice").equals("PDF_STRUCTURAL_001"), "PDF projection tier explicit");

        byte[] md = service.create(DocumentFormat.MARKDOWN, "# Heading\n\nBody");
        CanonicalDocumentGraphV2 mdGraph = service.projectCanonicalGraphV2(DocumentFormat.MARKDOWN, md);
        check(count(mdGraph, CanonicalDocumentGraphV2.ElementType.TEXT_BLOCK) == 2, "text-family semantic blocks projected");
    }

    private static void testMigrationAndGraphInvariants() throws Exception {
        DocxFullLaneEngine engine = new DocxFullLaneEngine();
        byte[] source = engine.createDocument(List.of("Migrate"));
        DocumentProcessingService service = new DocumentProcessingService();
        CanonicalDocumentGraph v1 = service.projectCanonicalGraph(DocumentFormat.DOCX, source);
        CanonicalDocumentGraphV2 migrated = CanonicalDocumentGraphV2Migration.fromV1(v1);
        check(migrated.schemaVersion().equals(CanonicalDocumentGraphV2.SCHEMA_V2), "CDG-1 migration emits CDG-2");
        check(migrated.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH && e.text().equals("Migrate")), "CDG-1 semantic content migrates");
        check(migrated.provenance().get("migration.sourceSchema").equals(CanonicalDocumentGraph.SCHEMA_V1), "migration provenance explicit");

        CanonicalDocumentGraphV2.NativeAnchor rootAnchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "root", "", "");
        String rootId = CanonicalDocumentGraphV2.stableElementId(DocumentFormat.PLAIN_TEXT, CanonicalDocumentGraphV2.ElementType.ROOT, rootAnchor);
        CanonicalDocumentGraphV2.Element root = new CanonicalDocumentGraphV2.Element(
                rootId,
                CanonicalDocumentGraphV2.ElementType.ROOT,
                null,
                0,
                "",
                CanonicalDocumentGraphV2.SemanticState.empty(),
                CanonicalDocumentGraphV2.StyleState.empty(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                rootAnchor,
                List.of(),
                List.of(),
                Map.of());
        expectFailure(() -> new CanonicalDocumentGraphV2(
                CanonicalDocumentGraphV2.SCHEMA_V2,
                DocumentFormat.PLAIN_TEXT,
                "0".repeat(64),
                CanonicalDocumentGraphV2.Kind.TEXT_DOCUMENT,
                List.of(root, new CanonicalDocumentGraphV2.Element(
                        "child",
                        CanonicalDocumentGraphV2.ElementType.TEXT_BLOCK,
                        "missing-parent",
                        0,
                        "x",
                        CanonicalDocumentGraphV2.SemanticState.empty(),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        CanonicalDocumentGraphV2.BehaviorState.empty(),
                        CanonicalDocumentGraphV2.AccessibilityState.empty(),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "x", "", ""),
                        List.of(),
                        List.of(),
                        Map.of())),
                List.of(),
                List.of(),
                List.of(),
                List.of(new CanonicalDocumentGraph.NativePart("<artifact>", "0".repeat(64), true)),
                Map.of()), "missing parent rejected");
    }

    private static void testMalformedXmlFailsClosed() throws Exception {
        DocxFullLaneEngine engine = new DocxFullLaneEngine();
        byte[] docx = engine.createDocument(List.of("safe"));
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(docx));
        String hostile = "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY y SYSTEM \"file:///etc/passwd\">]><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>&y;</w:t></w:r></w:p></w:body></w:document>";
        parts.put("word/document.xml", hostile.getBytes(StandardCharsets.UTF_8));
        byte[] hostileDocx = rawZip(parts);
        expectIoFailure(() -> new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, hostileDocx), "DOCTYPE/XXE payload rejected");
    }

    private static byte[] addWordStylesAndHeading(byte[] docx) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(docx));
        String styles = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                + "<w:style w:type=\"paragraph\" w:styleId=\"Normal\"><w:rPr><w:sz w:val=\"22\"/></w:rPr></w:style>"
                + "<w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:basedOn w:val=\"Normal\"/><w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr></w:style>"
                + "</w:styles>";
        parts.put("word/styles.xml", styles.getBytes(StandardCharsets.UTF_8));
        String xml = new String(parts.get("word/document.xml"), StandardCharsets.UTF_8);
        xml = xml.replace("<w:p><w:r><w:t>Alpha</w:t></w:r></w:p>", "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>Alpha</w:t></w:r></w:p>");
        parts.put("word/document.xml", xml.getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] addUnknownCustomPart(byte[] docx, String partName, String xml) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(docx));
        parts.put(partName, xml.getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] addRevision(byte[] docx) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(docx));
        String xml = new String(parts.get("word/document.xml"), StandardCharsets.UTF_8);
        xml = xml.replace("<w:r><w:t>Beta</w:t></w:r>", "<w:ins w:id=\"7\" w:author=\"test\"><w:r><w:t>Beta</w:t></w:r></w:ins>");
        parts.put("word/document.xml", xml.getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] reserializeWordDocument(byte[] docx) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(docx));
        byte[] before = parts.get("word/document.xml");
        byte[] serialized = OoxmlPackageSupport.serialize(OoxmlPackageSupport.parseXml(before));
        if (java.util.Arrays.equals(before, serialized)) {
            String xml = new String(before, StandardCharsets.UTF_8).replace("<w:body>", "<w:body>\n");
            serialized = xml.getBytes(StandardCharsets.UTF_8);
        }
        parts.put("word/document.xml", serialized);
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] addPptTransitionTimingAndUnknownPart(byte[] pptx) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(pptx));
        String slide = new String(parts.get("ppt/slides/slide1.xml"), StandardCharsets.UTF_8);
        slide = slide.replace("</p:sld>", "<p:transition spd=\"fast\"/><p:timing><p:tnLst/></p:timing></p:sld>");
        parts.put("ppt/slides/slide1.xml", slide.getBytes(StandardCharsets.UTF_8));
        parts.put("ppt/customData/data1.xml", "<custom xmlns=\"urn:ppt-custom\">x</custom>".getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] rawZip(Map<String, byte[]> entries) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(out)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                java.util.zip.ZipEntry zipEntry = new java.util.zip.ZipEntry(entry.getKey());
                zipEntry.setTime(0L);
                zip.putNextEntry(zipEntry);
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static long count(CanonicalDocumentGraphV2 graph, CanonicalDocumentGraphV2.ElementType type) {
        return graph.elements().stream().filter(e -> e.type() == type).count();
    }

    private static List<String> ids(CanonicalDocumentGraphV2 graph) {
        ArrayList<String> ids = new ArrayList<>();
        for (CanonicalDocumentGraphV2.Element element : graph.elements()) {
            ids.add(element.id());
        }
        ids.sort(String::compareTo);
        return List.copyOf(ids);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void expectFailure(Throwing action, String message) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void expectIoFailure(Throwing action, String message) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IOException expected) {
            // Expected.
        }
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }
}
