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
import org.systemmaster.tools.docx.DocxNativeMasteryEngine;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** LibreOffice + Poppler qualification for DOCUMENT-DOCX-MASTERY/T01. */
public final class DocumentDocxMasteryT01ExternalQualification {
    private static final Set<String> T01_CAPABILITIES = t01Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        }
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(
                Path.of(args[0]), Path.of(args[1]), Path.of(args[2]), Path.of(args[3]), Path.of(args[4]));
        Path root = Files.createTempDirectory("document-docx-mastery-t01-external-");
        try {
            qualifySemanticNativeRoundTrip(root, worker);
            System.out.println("DOCUMENT_DOCX_MASTERY_T01_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T01_CAPABILITIES.size());
        } finally {
            deleteTree(root);
        }
    }

    private static void qualifySemanticNativeRoundTrip(Path root, RenderProofWorker worker) throws Exception {
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Mastery Alpha", "Mastery Beta"));
        UniversalDocumentSpine spine = spine(root, worker);

        CanonicalDocumentGraphV2 graph = project(source);
        String rootId = graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT)
                .findFirst().orElseThrow().id();
        Map<String, String> style = new LinkedHashMap<>();
        style.put("docx.action", "UPSERT_STYLE");
        style.put("style.id", "ExternalMastery");
        style.put("style.type", "paragraph");
        style.put("style.name", "External Mastery");
        style.put("style.run.fontAscii", "Liberation Sans");
        style.put("style.run.sizeHalfPoints", "24");
        style.put("style.run.bold", "true");
        style.put("style.paragraph.spacingAfterTwips", "160");
        DocumentSpineResult styled = execute(
                spine, source, graph, rootId, DocumentOperationContract.Type.FORMAT, style,
                Set.of("word/styles.xml", "[Content_Types].xml", "word/_rels/document.xml.rels"), "create-style");
        assertProved(styled, "create-style");
        check(new DocxNativeMasteryEngine().readStyles(styled.resultBytes()).containsKey("ExternalMastery"), "LibreOffice-qualified style remains semantically readable");

        CanonicalDocumentGraphV2 styledGraph = project(styled.resultBytes());
        String alpha = element(styledGraph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Mastery Alpha").id();
        Map<String, String> insert = new LinkedHashMap<>();
        insert.put("docx.action", "INSERT_PARAGRAPH");
        insert.put("text", "Externally Rendered Mastery Paragraph");
        insert.put("paragraph.styleId", "ExternalMastery");
        insert.put("paragraph.alignment", "center");
        insert.put("paragraph.keepNext", "true");
        insert.put("run.colorHex", "1F4E79");
        insert.put("run.language", "en-US");
        DocumentSpineResult inserted = execute(
                spine, styled.resultBytes(), styledGraph, alpha, DocumentOperationContract.Type.INSERT_CONTENT, insert,
                Set.of("word/document.xml"), "insert-paragraph");
        assertProved(inserted, "insert-paragraph");
        check(new DocumentProcessingService().extractPlainText(DocumentFormat.DOCX, inserted.resultBytes())
                .contains("Externally Rendered Mastery Paragraph"), "LibreOffice-qualified DOCX preserves inserted semantic text");
        CanonicalDocumentGraphV2 insertedGraph = project(inserted.resultBytes());
        CanonicalDocumentGraphV2.Element paragraph = element(insertedGraph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Externally Rendered Mastery Paragraph");
        check("ExternalMastery".equals(paragraph.style().declaredStyleId()), "inserted paragraph retains native paragraph style");
        check(paragraph.style().inheritanceChain().contains("ExternalMastery"), "CDG-2 resolves inserted style through native round trip");
        check(inserted.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS),
                "LibreOffice/Poppler render proof passes for styled paragraph");

        String sectionId = insertedGraph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION)
                .findFirst().orElseThrow().id();
        Map<String, String> section = new LinkedHashMap<>();
        section.put("docx.action", "FORMAT_SECTION");
        section.put("section.widthTwips", "15840");
        section.put("section.heightTwips", "12240");
        section.put("section.orientation", "landscape");
        section.put("section.marginLeftTwips", "1080");
        section.put("section.marginRightTwips", "1080");
        section.put("section.marginTopTwips", "900");
        section.put("section.marginBottomTwips", "900");
        DocumentSpineResult sectioned = execute(
                spine, inserted.resultBytes(), insertedGraph, sectionId, DocumentOperationContract.Type.FORMAT, section,
                Set.of("word/document.xml"), "format-section");
        assertProved(sectioned, "format-section");
        CanonicalDocumentGraphV2 sectionGraph = project(sectioned.resultBytes());
        CanonicalDocumentGraphV2.Element masteredSection = sectionGraph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION)
                .findFirst().orElseThrow();
        check("landscape".equals(masteredSection.geometry().properties().get("orientation")), "LibreOffice-qualified DOCX retains landscape section orientation");
        check("1080".equals(masteredSection.geometry().properties().get("margin.leftTwips")), "LibreOffice-qualified DOCX retains section margin");
        check(sectioned.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS),
                "LibreOffice/Poppler render proof passes after section geometry mutation");
    }

    private static DocumentSpineResult execute(
            UniversalDocumentSpine spine,
            byte[] source,
            CanonicalDocumentGraphV2 graph,
            String targetId,
            DocumentOperationContract.Type type,
            Map<String, String> parameters,
            Set<String> expectedParts,
            String label) throws Exception {
        DocumentOperationContract operation = new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "docx-mastery-t01-external-" + label,
                graph.sourceSha256(),
                graph.semanticDigest(),
                type,
                List.of(DocumentSelector.node(targetId)),
                "DOCUMENT-DOCX-MASTERY/T01 external semantic native operation " + label,
                parameters,
                DocumentOperationContract.Risk.REVERSIBLE_EDIT,
                graph.sourceSha256(),
                expectedParts,
                DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,
                false,
                List.of(),
                false,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job(label + "-source", label + "-result");
        DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(
                job.jobId(), job.mode(), operation, Set.of(targetId), allCapabilities(), List.of());
        return spine.executeExisting(job, new ByteArrayInputStream(source), plan);
    }

    private static void assertProved(DocumentSpineResult result, String label) {
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT,
                label + " publishes as verified draft");
        check(result.preservation() != null && result.preservation().pass(), label + " native preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), label + " proof set is complete");
        check(result.version() != null, label + " receives immutable version");
    }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception {
        Clock clock = Clock.systemUTC();
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"),
                ArtifactIntakePolicy.conservative(32L * 1024 * 1024),
                repository,
                clock);
        return new UniversalDocumentSpine(
                gateway,
                new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints")),
                new FileDocumentSpineVersionStore(root.resolve("spine-versions")),
                new DocumentSpineProofService(new DocumentProcessingService(), worker, clock),
                clock);
    }

    private static DocumentSpineJob job(String sourceId, String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                sourceId,
                resultId,
                sourceId + ".docx",
                DocumentFormat.DOCX.mediaType(),
                DocumentSpineMode.MASTER,
                DocumentFormat.DOCX,
                DocumentSpinePublicationClass.VERIFIED_DRAFT,
                allCapabilities(),
                "DOCUMENT-DOCX-MASTERY-T01-EXTERNAL",
                "qualification",
                java.time.Instant.now());
    }

    private static Set<String> allCapabilities() {
        LinkedHashSet<String> ids = new LinkedHashSet<>(T01_CAPABILITIES);
        for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        ids.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(ids);
    }

    private static Set<String> t01Capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        addRange(out, 6, 25);
        addRange(out, 36, 40);
        addRange(out, 56, 75);
        return Set.copyOf(out);
    }

    private static void addRange(Set<String> out, int from, int to) {
        for (int i = from; i <= to; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i));
    }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception {
        return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes);
    }

    private static CanonicalDocumentGraphV2.Element element(CanonicalDocumentGraphV2 graph, CanonicalDocumentGraphV2.ElementType type, String text) {
        return graph.elements().stream()
                .filter(e -> e.type() == type && e.text().contains(text))
                .findFirst()
                .orElseThrow(() -> new AssertionError("element not found: " + type + " text=" + text));
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
}
