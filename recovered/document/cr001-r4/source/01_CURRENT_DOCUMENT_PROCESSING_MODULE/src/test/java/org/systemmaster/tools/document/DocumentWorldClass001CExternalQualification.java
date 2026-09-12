package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Real LibreOffice + Poppler qualification for DOCUMENT-WORLD-CLASS-001C FINAL promotion. */
public final class DocumentWorldClass001CExternalQualification {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        }
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(
                Path.of(args[0]), Path.of(args[1]), Path.of(args[2]), Path.of(args[3]), Path.of(args[4]));
        Path root = Files.createTempDirectory("document-world-class-001c-external-");
        try {
            qualifyFinalDocx(root.resolve("docx"), worker);
            qualifyFinalPptx(root.resolve("pptx"), worker);
            System.out.println("DOCUMENT_WORLD_CLASS_001C_EXTERNAL_PASS assertions=" + assertions);
        } finally {
            deleteTree(root);
        }
    }

    private static void qualifyFinalDocx(Path root, RenderProofWorker worker) throws Exception {
        byte[] source = accessibleDocx("", "en-US", "External accessibility body");
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        String rootId = rootElement(graph).id();
        DocumentOperationContract operation = new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "001c-external-docx-title",
                graph.sourceSha256(),
                graph.semanticDigest(),
                DocumentOperationContract.Type.ACCESSIBILITY_REPAIR,
                List.of(DocumentSelector.node(rootId)),
                "Apply explicit document title accessibility remediation",
                Map.of("documentTitle", "Externally Proved Accessible Document", "accessibilityProfile", "OFFICE_ACCESSIBLE"),
                DocumentOperationContract.Risk.REVERSIBLE_EDIT,
                graph.sourceSha256(),
                Set.of("docProps/core.xml"),
                DocumentOperationContract.VisualImpact.NONE,
                false,
                List.of(),
                true,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, "001c-ext-docx-source", "001c-ext-docx-result");
        DocumentSpineResult result = spine(root, worker).executeExisting(
                job,
                new ByteArrayInputStream(source),
                new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(rootId), capabilities(), List.of()));
        assertFinal(result, DocumentFormat.DOCX);
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.ACCESSIBILITY && r.status() == DocumentProofReceipt.Status.PASS),
                "DOCX external FINAL has passing accessibility receipt");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS),
                "DOCX external FINAL has LibreOffice/Poppler rendered proof");
    }

    private static void qualifyFinalPptx(Path root, RenderProofWorker worker) throws Exception {
        byte[] source = new PptxFullLaneEngine().createPresentation(
                "Accessible external deck",
                List.of(new PptxFullLaneEngine.SlideSpec("External Alpha", List.of("Readable external body"), "")));
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.PPTX, source);
        String target = graph.elements().stream().filter(e -> e.text().contains("External Alpha")).findFirst().orElseThrow().id();
        DocumentOperationContract operation = DocumentOperationContract.replaceText(
                "001c-external-pptx-replace",
                graph,
                List.of(target),
                "External Alpha",
                "External Omega",
                Set.of("ppt/slides/*"),
                true);
        DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.PPTX, "001c-ext-pptx-source", "001c-ext-pptx-result");
        DocumentSpineResult result = spine(root, worker).executeExisting(
                job,
                new ByteArrayInputStream(source),
                new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(target), capabilities(), List.of()));
        assertFinal(result, DocumentFormat.PPTX);
        check(documents.extractPlainText(DocumentFormat.PPTX, result.resultBytes()).contains("External Omega"), "PPTX external semantic replacement survives render qualification");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.ACCESSIBILITY && r.status() == DocumentProofReceipt.Status.PASS),
                "PPTX external FINAL has passing accessibility receipt");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS),
                "PPTX external FINAL has LibreOffice/Poppler rendered proof");
    }

    private static void assertFinal(DocumentSpineResult result, DocumentFormat format) {
        check(result.sourceFormat() == format, format + " source format remains bound");
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.FINAL, format + " promotes to FINAL");
        check(result.version() != null, format + " FINAL receives immutable version");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), format + " FINAL proof set is complete");
        check(result.proofReceipts().stream().allMatch(r -> r.status() == DocumentProofReceipt.Status.PASS), format + " all collected proof receipts pass");
    }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception {
        Clock clock = Clock.systemUTC();
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"),
                ArtifactIntakePolicy.conservative(64L * 1024 * 1024),
                repository,
                clock);
        return new UniversalDocumentSpine(
                gateway,
                new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints")),
                new FileDocumentSpineVersionStore(root.resolve("spine-versions")),
                new DocumentSpineProofService(new DocumentProcessingService(), worker, clock),
                clock,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(clock));
    }

    private static DocumentSpineJob job(DocumentSpineMode mode, DocumentFormat format, String sourceId, String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                sourceId,
                resultId,
                sourceId + extension(format),
                format.mediaType(),
                mode,
                format,
                DocumentSpinePublicationClass.FINAL,
                capabilities(),
                "DOCUMENT-WORLD-CLASS-001C-EXTERNAL",
                "qualification",
                java.time.Instant.now());
    }

    private static Set<String> capabilities() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 1; i <= 30; i++) ids.add("UDM-ACCESSIBILIT-" + String.format(java.util.Locale.ROOT, "%04d", i));
        ids.add("UDM-FOUNDATION-0040");
        ids.add("UDM-FOUNDATION-0081");
        return Set.copyOf(ids);
    }

    private static CanonicalDocumentGraphV2.Element rootElement(CanonicalDocumentGraphV2 graph) {
        return graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow();
    }

    private static byte[] accessibleDocx(String title, String language, String text) throws Exception {
        String w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        LinkedHashMap<String, byte[]> parts = new LinkedHashMap<>();
        parts.put("[Content_Types].xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/><Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/></Types>"));
        parts.put("_rels/.rels", bytes("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/></Relationships>"));
        parts.put("docProps/core.xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>" + xml(title) + "</dc:title></cp:coreProperties>"));
        parts.put("word/document.xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"" + w + "\"><w:body><w:p><w:r><w:t>" + xml(text) + "</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"));
        parts.put("word/styles.xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:styles xmlns:w=\"" + w + "\"><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val=\"" + xml(language) + "\"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style></w:styles>"));
        parts.put("word/_rels/document.xml.rels", bytes("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>"));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private static String xml(String value) { return (value == null ? "" : value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
    private static String extension(DocumentFormat format) { return switch (format) { case DOCX -> ".docx"; case PPTX -> ".pptx"; default -> ".bin"; }; }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path path : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path); } }
}
