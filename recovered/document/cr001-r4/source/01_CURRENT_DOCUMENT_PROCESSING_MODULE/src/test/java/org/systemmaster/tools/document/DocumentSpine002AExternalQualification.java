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
import org.systemmaster.tools.pdf.PdfStructuralEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Real LibreOffice + Poppler end-to-end qualification for DOCUMENT-SPINE-002A. */
public final class DocumentSpine002AExternalQualification {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        }
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(
                Path.of(args[0]), Path.of(args[1]), Path.of(args[2]), Path.of(args[3]), Path.of(args[4]));
        Path root = Files.createTempDirectory("document-spine-002a-external-");
        try {
            qualifyDocx(root.resolve("docx"), worker);
            qualifyPptx(root.resolve("pptx"), worker);
            qualifyPdf(root.resolve("pdf"), worker);
            System.out.println("DOCUMENT_SPINE_002A_EXTERNAL_PASS assertions=" + assertions);
        } finally {
            deleteTree(root);
        }
    }

    private static void qualifyDocx(Path root, RenderProofWorker worker) throws Exception {
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("External Alpha", "Preserve DOCX paragraph"));
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        String target = textElement(graph, "External Alpha");
        DocumentOperationContract operation = DocumentOperationContract.replaceText(
                "spine-external-docx-replace",
                graph,
                List.of(target),
                "External Alpha",
                "External Omega",
                Set.of("word/document.xml"),
                false);
        DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, "external-docx-source", "external-docx-result");
        DocumentSpineResult result = spine(root, worker).executeExisting(
                job,
                new ByteArrayInputStream(source),
                plan(job, operation, Set.of(target)));
        assertProved(result, DocumentFormat.DOCX, "External Omega");
        check(result.preservation().pass(), "DOCX external spine preservation passes");
        check(result.proofReceipts().stream().anyMatch(receipt -> receipt.gate() == DocumentProofReceipt.Gate.RENDERED
                && receipt.status() == DocumentProofReceipt.Status.PASS), "DOCX independent rendered proof passes");
    }

    private static void qualifyPptx(Path root, RenderProofWorker worker) throws Exception {
        PptxFullLaneEngine engine = new PptxFullLaneEngine();
        byte[] source = engine.createPresentation(
                "Spine External",
                List.of(new PptxFullLaneEngine.SlideSpec("External Alpha", List.of("Preserve PPTX body"), "speaker note")));
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.PPTX, source);
        String target = textElement(graph, "External Alpha");
        DocumentOperationContract operation = DocumentOperationContract.replaceText(
                "spine-external-pptx-replace",
                graph,
                List.of(target),
                "External Alpha",
                "External Omega",
                Set.of("ppt/slides/*"),
                false);
        DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.PPTX, "external-pptx-source", "external-pptx-result");
        DocumentSpineResult result = spine(root, worker).executeExisting(
                job,
                new ByteArrayInputStream(source),
                plan(job, operation, Set.of(target)));
        assertProved(result, DocumentFormat.PPTX, "External Omega");
        check(result.preservation().pass(), "PPTX external spine preservation passes");
        check(result.proofReceipts().stream().anyMatch(receipt -> receipt.gate() == DocumentProofReceipt.Gate.RENDERED
                && receipt.status() == DocumentProofReceipt.Status.PASS), "PPTX independent rendered proof passes");
    }

    private static void qualifyPdf(Path root, RenderProofWorker worker) throws Exception {
        byte[] source = new PdfStructuralEngine().createTextPdf(List.of("External legacy PDF", "Original line"));
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.PDF, source);
        String rootElement = graph.elements().stream()
                .filter(element -> element.type() == CanonicalDocumentGraphV2.ElementType.ROOT)
                .findFirst()
                .orElseThrow()
                .id();
        DocumentOperationContract operation = new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "spine-external-pdf-rebuild",
                graph.sourceSha256(),
                graph.semanticDigest(),
                DocumentOperationContract.Type.CONVERT,
                List.of(DocumentSelector.node(rootElement)),
                "Rebuild PDF as governed same-format semantic derivative",
                Map.of("rebuildText", "External rebuilt PDF\nSecond rebuilt line"),
                DocumentOperationContract.Risk.LOSSY_TRANSFORM,
                graph.sourceSha256(),
                Set.of("<artifact>"),
                DocumentOperationContract.VisualImpact.FULL_RENDER_CHANGE,
                true,
                List.of("ORIGINAL_PDF_LAYOUT_REBUILT_FROM_LITERAL_TEXT"),
                false,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job(DocumentSpineMode.REBUILD, DocumentFormat.PDF, "external-pdf-source", "external-pdf-result");
        DocumentSpineResult result = spine(root, worker).executeExisting(
                job,
                new ByteArrayInputStream(source),
                plan(job, operation, Set.of(rootElement)));
        assertProved(result, DocumentFormat.PDF, "External rebuilt PDF");
        check(result.preservation().pass(), "PDF declared whole-artifact rebuild passes preservation authority");
        check(result.proofReceipts().stream().anyMatch(receipt -> receipt.gate() == DocumentProofReceipt.Gate.RENDERED
                && receipt.status() == DocumentProofReceipt.Status.PASS), "PDF identity render proof passes");
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
                DocumentSpinePublicationClass.VERIFIED_DRAFT,
                spineCapabilities(),
                "DOCUMENT-SPINE-002A-EXTERNAL",
                "qualification",
                java.time.Instant.now());
    }

    private static DocumentSpineExecutionPlan plan(DocumentSpineJob job, DocumentOperationContract operation, Set<String> targets) {
        return new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, targets, spineCapabilities(), List.of());
    }

    private static void assertProved(DocumentSpineResult result, DocumentFormat format, String expectedText) throws Exception {
        DocumentProcessingService documents = new DocumentProcessingService();
        check(result.sourceFormat() == format, format + " source format is bound");
        check(result.publication() != null, format + " verified draft publishes");
        check(result.version() != null, format + " immutable version is committed");
        check(result.finalization().missing().isEmpty(), format + " all draft proof gates are complete");
        check(documents.extractPlainText(format, result.resultBytes()).contains(expectedText), format + " semantic result is present");
        check(result.proofReceipts().stream().allMatch(receipt -> receipt.status() == DocumentProofReceipt.Status.PASS),
                format + " all collected proof receipts pass");
    }

    private static String textElement(CanonicalDocumentGraphV2 graph, String text) {
        return graph.elements().stream()
                .filter(element -> element.text().contains(text))
                .findFirst()
                .orElseThrow(() -> new AssertionError("text element not found: " + text))
                .id();
    }

    private static Set<String> spineCapabilities() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(Locale.ROOT, "%04d", i));
        for (int i = 5; i <= 12; i++) ids.add("UDM-FOUNDATION-" + String.format(Locale.ROOT, "%04d", i));
        ids.add("UDM-FOUNDATION-0049");
        for (int i = 50; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(Locale.ROOT, "%04d", i));
        ids.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(Locale.ROOT, "%04d", i));
        return Set.copyOf(ids);
    }

    private static String extension(DocumentFormat format) {
        return switch (format) {
            case DOCX -> ".docx";
            case PPTX -> ".pptx";
            case PDF -> ".pdf";
            default -> ".bin";
        };
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
