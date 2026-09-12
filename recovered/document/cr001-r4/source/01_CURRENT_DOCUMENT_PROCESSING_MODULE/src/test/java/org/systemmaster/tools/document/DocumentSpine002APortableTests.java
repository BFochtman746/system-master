package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.document.spine.DocumentEffectAdmissionDecision;
import org.systemmaster.tools.document.spine.DocumentEffectAdmissionProvider;
import org.systemmaster.tools.document.spine.DocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.DocumentSpineStage;
import org.systemmaster.tools.document.spine.DocumentSpineStageReceipt;
import org.systemmaster.tools.document.spine.DocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.pdf.PdfStructuralEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class DocumentSpine002APortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T17:30:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testDurableReadOnlySpineResume();
        testDocxMasterBlocksWithoutRendererThenResumesWithoutMutationReplay();
        testPptxMasterAndPdfRebuild();
        testFinalPublicationFailsClosedUntilAccessibility();
        testMaliciousIntakeFailsClosed();
        testEffectAdmissionBoundary();
        testCreateRouteDoesNotInflateCompletion();
        System.out.println("DOCUMENT_SPINE_002A_PORTABLE_PASS assertions=" + assertions);
    }

    private static void testDurableReadOnlySpineResume() throws Exception {
        Path root = Files.createTempDirectory("spine-readonly-");
        try {
            byte[] source = new DocxFullLaneEngine().createDocument(List.of("Read-only Alpha", "Second paragraph"));
            DocumentSpineJob job = job(DocumentSpineMode.EXTRACT, DocumentFormat.DOCX, DocumentSpinePublicationClass.NONE, "readonly-source", "readonly-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(
                    job.jobId(),
                    DocumentSpineMode.EXTRACT,
                    null,
                    Set.of(),
                    spineCapabilities(),
                    List.of("read-only path; no native mutation"));

            UniversalDocumentSpine first = spine(root, null);
            DocumentSpineResult result = first.executeExisting(job, new ByteArrayInputStream(source), plan);
            check(result.extractedText().contains("Read-only Alpha"), "read-only spine extracts content");
            check(result.publication() == null, "read-only spine does not publish derivative");
            check(latestByStage(result.stageReceipts()).size() == DocumentSpineStage.values().length, "read-only route adjudicates every spine stage");
            check(latestByStage(result.stageReceipts()).get(DocumentSpineStage.PUBLISH).status() == DocumentSpineStageReceipt.Status.NOT_REQUIRED,
                    "read-only publish stage is explicitly not required");

            int before = result.stageReceipts().size();
            UniversalDocumentSpine resumed = spine(root, null);
            DocumentSpineResult resumedResult = resumed.executeExisting(job, null, plan);
            check(resumedResult.extractedText().contains("Read-only Alpha"), "restart reads verified source from durable PLATFORM-008 receipt");
            check(resumedResult.stageReceipts().size() == before, "unchanged read-only resume does not append duplicate stage receipts");
        } finally {
            deleteTree(root);
        }
    }

    private static void testDocxMasterBlocksWithoutRendererThenResumesWithoutMutationReplay() throws Exception {
        Path root = Files.createTempDirectory("spine-docx-master-");
        try {
            byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha", "Preserve this"));
            DocumentProcessingService documents = new DocumentProcessingService();
            CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            String targetId = textElement(graph, "Alpha");
            DocumentOperationContract operation = DocumentOperationContract.replaceText(
                    "spine-docx-replace",
                    graph,
                    List.of(targetId),
                    "Alpha",
                    "Omega",
                    Set.of("word/document.xml"),
                    false);
            DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, "docx-source", "docx-result");
            DocumentSpineExecutionPlan plan = plan(job, operation, Set.of(targetId));

            UniversalDocumentSpine withoutRenderer = spine(root, null);
            expectFailure(
                    () -> withoutRenderer.executeExisting(job, new ByteArrayInputStream(source), plan),
                    "render proof required but unavailable",
                    IllegalStateException.class);
            List<DocumentSpineStageReceipt> interrupted = checkpointStore(root).receipts(job.jobId());
            check(count(interrupted, DocumentSpineStage.MASTER, DocumentSpineStageReceipt.Status.PASS) == 1,
                    "native mutation completed once before render interruption");
            DocumentSpineStageReceipt masterReceipt = interrupted.stream()
                    .filter(receipt -> receipt.stage() == DocumentSpineStage.MASTER && receipt.status() == DocumentSpineStageReceipt.Status.PASS)
                    .findFirst()
                    .orElseThrow();
            check(masterReceipt.diagnostics().stream().noneMatch(value -> value.contains("PROOF_RECEIPT_REQUIRED") || value.contains("MISSING")),
                    "mutation-stage PASS evidence excludes downstream proof-gate diagnostics");
            check(count(interrupted, DocumentSpineStage.RENDER, DocumentSpineStageReceipt.Status.FAIL) == 1,
                    "missing render oracle is a durable FAIL checkpoint");
            check(count(interrupted, DocumentSpineStage.PUBLISH, DocumentSpineStageReceipt.Status.PASS) == 0,
                    "proof failure cannot publish");

            CountingRenderWorker renderer = new CountingRenderWorker();
            UniversalDocumentSpine resumed = spine(root, renderer);
            DocumentSpineResult completed = resumed.executeExisting(job, null, plan);
            check(renderer.calls == 1, "resume runs only the missing render proof");
            check(documents.extractPlainText(DocumentFormat.DOCX, completed.resultBytes()).contains("Omega"), "DOCX master applies semantic replacement");
            check(completed.preservation().pass(), "DOCX master preserves undeclared native parts");
            check(completed.finalization().missing().isEmpty(), "draft publication has all required proof gates");
            check(completed.version() != null, "proved derivative receives immutable version identity");
            check(completed.publication() != null, "proved draft publishes through governed artifact authority");
            check(count(completed.stageReceipts(), DocumentSpineStage.MASTER, DocumentSpineStageReceipt.Status.PASS) == 1,
                    "resume does not replay completed native mutation");
            check(versionStore(root).all().size() == 1, "version commit is idempotent and unique");

            CountingRenderWorker thirdRenderer = new CountingRenderWorker();
            UniversalDocumentSpine secondResume = spine(root, thirdRenderer);
            DocumentSpineResult third = secondResume.executeExisting(job, null, plan);
            check(thirdRenderer.calls == 0, "completed render proof resumes from durable serialized receipt");
            check(versionStore(root).all().size() == 1, "completed version is not replayed");
            check(count(third.stageReceipts(), DocumentSpineStage.PUBLISH, DocumentSpineStageReceipt.Status.PASS) == 1,
                    "completed publication is not replayed");
        } finally {
            deleteTree(root);
        }
    }

    private static void testPptxMasterAndPdfRebuild() throws Exception {
        Path pptxRoot = Files.createTempDirectory("spine-pptx-");
        Path pdfRoot = Files.createTempDirectory("spine-pdf-");
        try {
            DocumentProcessingService documents = new DocumentProcessingService();
            PptxFullLaneEngine pptxEngine = new PptxFullLaneEngine();
            byte[] pptx = pptxEngine.createPresentation(
                    "Spine",
                    List.of(new PptxFullLaneEngine.SlideSpec("Alpha", List.of("Keep me"), "speaker note")));
            CanonicalDocumentGraphV2 pptxGraph = documents.projectCanonicalGraphV2(DocumentFormat.PPTX, pptx);
            String pptxTarget = textElement(pptxGraph, "Alpha");
            DocumentOperationContract pptxOperation = DocumentOperationContract.replaceText(
                    "spine-pptx-replace",
                    pptxGraph,
                    List.of(pptxTarget),
                    "Alpha",
                    "Omega",
                    Set.of("ppt/slides/*"),
                    false);
            DocumentSpineJob pptxJob = job(DocumentSpineMode.MASTER, DocumentFormat.PPTX, DocumentSpinePublicationClass.VERIFIED_DRAFT, "pptx-source", "pptx-result");
            DocumentSpineResult pptxResult = spine(pptxRoot, new CountingRenderWorker()).executeExisting(
                    pptxJob,
                    new ByteArrayInputStream(pptx),
                    plan(pptxJob, pptxOperation, Set.of(pptxTarget)));
            check(documents.extractPlainText(DocumentFormat.PPTX, pptxResult.resultBytes()).contains("Omega"), "PPTX master runs through spine");
            check(pptxResult.preservation().pass(), "PPTX unrelated native parts are preserved");
            check(pptxResult.publication() != null, "PPTX proved draft publishes");

            byte[] pdf = new PdfStructuralEngine().createTextPdf(List.of("Legacy Alpha", "Original line"));
            CanonicalDocumentGraphV2 pdfGraph = documents.projectCanonicalGraphV2(DocumentFormat.PDF, pdf);
            String pdfRootElement = pdfGraph.elements().stream()
                    .filter(element -> element.type() == CanonicalDocumentGraphV2.ElementType.ROOT)
                    .findFirst()
                    .orElseThrow()
                    .id();
            DocumentOperationContract pdfOperation = new DocumentOperationContract(
                    DocumentOperationContract.SCHEMA_V1,
                    "spine-pdf-rebuild",
                    pdfGraph.sourceSha256(),
                    pdfGraph.semanticDigest(),
                    DocumentOperationContract.Type.CONVERT,
                    List.of(DocumentSelector.node(pdfRootElement)),
                    "Rebuild fixed-layout PDF as a governed same-format semantic derivative",
                    Map.of("rebuildText", "Rebuilt Omega\nSecond rebuilt line"),
                    DocumentOperationContract.Risk.LOSSY_TRANSFORM,
                    pdfGraph.sourceSha256(),
                    Set.of("<artifact>"),
                    DocumentOperationContract.VisualImpact.FULL_RENDER_CHANGE,
                    true,
                    List.of("ORIGINAL_PDF_LAYOUT_REBUILT_FROM_LITERAL_TEXT"),
                    false,
                    EnumSet.noneOf(DocumentProofReceipt.Gate.class));
            DocumentSpineJob pdfJob = job(DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentSpinePublicationClass.VERIFIED_DRAFT, "pdf-source", "pdf-result");
            DocumentSpineResult pdfResult = spine(pdfRoot, new CountingRenderWorker()).executeExisting(
                    pdfJob,
                    new ByteArrayInputStream(pdf),
                    plan(pdfJob, pdfOperation, Set.of(pdfRootElement)));
            check(documents.extractPlainText(DocumentFormat.PDF, pdfResult.resultBytes()).contains("Rebuilt Omega"), "PDF rebuild produces semantic derivative through spine");
            check(pdfResult.preservation().pass(), "PDF whole-artifact change is explicitly declared");
            check(pdfResult.publication() != null, "PDF proved draft publishes");
        } finally {
            deleteTree(pptxRoot);
            deleteTree(pdfRoot);
        }
    }

    private static void testFinalPublicationFailsClosedUntilAccessibility() throws Exception {
        Path root = Files.createTempDirectory("spine-final-a11y-");
        try {
            byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha"));
            DocumentProcessingService documents = new DocumentProcessingService();
            CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            String targetId = textElement(graph, "Alpha");
            DocumentOperationContract operation = DocumentOperationContract.replaceText(
                    "spine-final-replace",
                    graph,
                    List.of(targetId),
                    "Alpha",
                    "Omega",
                    Set.of("word/document.xml"),
                    true);
            DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.FINAL, "final-source", "final-result");
            expectFailure(
                    () -> spine(root, new CountingRenderWorker()).executeExisting(
                            job,
                            new ByteArrayInputStream(source),
                            plan(job, operation, Set.of(targetId))),
                    "final publication fails closed until accessibility authority exists",
                    IllegalStateException.class);
            List<DocumentSpineStageReceipt> receipts = checkpointStore(root).receipts(job.jobId());
            check(count(receipts, DocumentSpineStage.ACCESSIBILITY, DocumentSpineStageReceipt.Status.FAIL) == 1,
                    "accessibility gap is explicit and durable");
            check(count(receipts, DocumentSpineStage.VERSION, DocumentSpineStageReceipt.Status.PASS) == 0,
                    "unproved final artifact cannot receive accepted version");
            check(count(receipts, DocumentSpineStage.PUBLISH, DocumentSpineStageReceipt.Status.PASS) == 0,
                    "unproved final artifact cannot publish");
        } finally {
            deleteTree(root);
        }
    }

    private static void testMaliciousIntakeFailsClosed() throws Exception {
        Path root = Files.createTempDirectory("spine-malicious-");
        try {
            DocumentSpineJob job = job(DocumentSpineMode.EXTRACT, DocumentFormat.DOCX, DocumentSpinePublicationClass.NONE, "evil-source", "evil-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(
                    job.jobId(),
                    DocumentSpineMode.EXTRACT,
                    null,
                    Set.of(),
                    spineCapabilities(),
                    List.of());
            byte[] executableLike = new byte[]{'M', 'Z', 0, 0, 1, 2, 3, 4};
            expectFailure(
                    () -> spine(root, null).executeExisting(job, new ByteArrayInputStream(executableLike), plan),
                    "executable input is quarantined before parsing",
                    SecurityException.class);
            List<DocumentSpineStageReceipt> receipts = checkpointStore(root).receipts(job.jobId());
            check(count(receipts, DocumentSpineStage.INTAKE, DocumentSpineStageReceipt.Status.FAIL) == 1,
                    "malicious intake has durable failure receipt");
            check(receipts.stream().noneMatch(receipt -> receipt.stage() == DocumentSpineStage.PARSE),
                    "malicious bytes never reach native parser");
        } finally {
            deleteTree(root);
        }
    }

    // DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001_TEST
    private static void testEffectAdmissionBoundary() throws Exception {
        Path root = Files.createTempDirectory("spine-effect-admission-");
        try {
            byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha", "Preserve this"));
            DocumentProcessingService documents = new DocumentProcessingService();
            CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            String targetId = textElement(graph, "Alpha");
            DocumentOperationContract operation = DocumentOperationContract.replaceText(
                    "spine-effect-admission-replace",
                    graph,
                    List.of(targetId),
                    "Alpha",
                    "Omega",
                    Set.of("word/document.xml"),
                    false);
            DocumentSpineJob job = job(
                    DocumentSpineMode.MASTER,
                    DocumentFormat.DOCX,
                    DocumentSpinePublicationClass.VERIFIED_DRAFT,
                    "effect-admission-source",
                    "effect-admission-result");
            DocumentSpineExecutionPlan plan = plan(job, operation, Set.of(targetId));

            FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
            GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                    root.resolve("platform008-bytes"),
                    ArtifactIntakePolicy.conservative(32L * 1024 * 1024),
                    repository,
                    CLOCK);
            DocumentSpineCheckpointStore checkpoints = checkpointStore(root);
            DocumentSpineVersionStore versions = versionStore(root);
            DocumentSpineProofService proofs = new DocumentSpineProofService(
                    new DocumentProcessingService(), new CountingRenderWorker(), CLOCK);

            UniversalDocumentSpine withoutAdmission = new UniversalDocumentSpine(
                    gateway, checkpoints, versions, proofs, CLOCK);
            expectFailure(
                    () -> withoutAdmission.executeExisting(job, new ByteArrayInputStream(source), plan),
                    "effectful route must fail closed without external admission",
                    SecurityException.class);
            List<DocumentSpineStageReceipt> blocked = checkpointStore(root).receipts(job.jobId());
            check(count(blocked, DocumentSpineStage.MASTER, DocumentSpineStageReceipt.Status.PASS) == 0,
                    "missing admission cannot create MASTER PASS");
            check(count(blocked, DocumentSpineStage.MASTER, DocumentSpineStageReceipt.Status.FAIL) == 1,
                    "missing admission records one durable MASTER failure");
            check(blocked.stream().anyMatch(receipt -> receipt.stage() == DocumentSpineStage.MASTER
                            && receipt.diagnostics().contains("EFFECT_ADMISSION_PROVIDER_REQUIRED__EFFECTFUL_ROUTE_BLOCKED")),
                    "missing admission failure carries bounded reason code");

            UniversalDocumentSpine admitted = new UniversalDocumentSpine(
                    gateway, checkpoints, versions, proofs, CLOCK, effectAdmission());
            DocumentSpineResult completed = admitted.executeExisting(job, null, plan);
            check(documents.extractPlainText(DocumentFormat.DOCX, completed.resultBytes()).contains("Omega"),
                    "explicit admission allows governed MASTER execution");
            DocumentSpineStageReceipt master = completed.stageReceipts().stream()
                    .filter(receipt -> receipt.stage() == DocumentSpineStage.MASTER
                            && receipt.status() == DocumentSpineStageReceipt.Status.PASS)
                    .findFirst().orElseThrow();
            check(master.evidence().stream().anyMatch(value -> value.startsWith("effect-admission-decision=")),
                    "MASTER PASS binds immutable external admission decision");
            check(master.evidence().stream().anyMatch(value -> value.startsWith("effect-policy-digest=")),
                    "MASTER PASS binds immutable policy digest rather than mutable transport metadata");
        } finally {
            deleteTree(root);
        }
    }

    private static void testCreateRouteDoesNotInflateCompletion() throws Exception {
        Path root = Files.createTempDirectory("spine-create-pending-");
        try {
            DocumentSpineJob job = job(DocumentSpineMode.CREATE, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, "intent-source", "create-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(
                    job.jobId(),
                    DocumentSpineMode.CREATE,
                    null,
                    Set.of(),
                    spineCapabilities(),
                    List.of("CREATE remains explicitly partial in DOCUMENT-SPINE-002A"));
            expectFailure(
                    () -> spine(root, new CountingRenderWorker()).executeExisting(
                            job,
                            new ByteArrayInputStream("Create a report".getBytes(StandardCharsets.UTF_8)),
                            plan),
                    "CREATE route remains explicit partial rather than being falsely certified",
                    UnsupportedOperationException.class);
        } finally {
            deleteTree(root);
        }
    }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception {
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"),
                ArtifactIntakePolicy.conservative(32L * 1024 * 1024),
                repository,
                CLOCK);
        DocumentSpineCheckpointStore checkpoints = checkpointStore(root);
        DocumentSpineVersionStore versions = versionStore(root);
        DocumentSpineProofService proofs = new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK);
        return new UniversalDocumentSpine(gateway, checkpoints, versions, proofs, CLOCK, effectAdmission());
    }

    private static DocumentEffectAdmissionProvider effectAdmission() {
        return (job, plan, sourceGraph) -> new DocumentEffectAdmissionDecision(
                DocumentEffectAdmissionDecision.SCHEMA_V1,
                "portable-explicit-" + job.jobId(),
                DocumentEffectAdmissionDecision.Disposition.ALLOW,
                job.jobId(),
                job.mode(),
                sourceGraph.sourceSha256(),
                sourceGraph.semanticDigest(),
                plan.operation().intentDigest(),
                plan.digest(),
                DocumentEffectAdmissionDecision.capabilitySetDigest(plan),
                "portable-integration-r1",
                sha("portable-integration-policy-r1".getBytes(StandardCharsets.UTF_8)),
                "TEST_ONLY_EXPLICIT_ALLOW",
                FIXED);
    }

    private static FileDocumentSpineCheckpointStore checkpointStore(Path root) throws Exception {
        return new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints"));
    }

    private static FileDocumentSpineVersionStore versionStore(Path root) throws Exception {
        return new FileDocumentSpineVersionStore(root.resolve("spine-versions"));
    }

    private static DocumentSpineJob job(
            DocumentSpineMode mode,
            DocumentFormat format,
            DocumentSpinePublicationClass publicationClass,
            String sourceId,
            String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                sourceId,
                resultId,
                sourceId + extension(format),
                format.mediaType(),
                mode,
                format,
                publicationClass,
                spineCapabilities(),
                "portable-test",
                "portable-test",
                FIXED);
    }

    private static DocumentSpineExecutionPlan plan(
            DocumentSpineJob job,
            DocumentOperationContract operation,
            Set<String> targets) {
        return new DocumentSpineExecutionPlan(
                job.jobId(),
                job.mode(),
                operation,
                targets,
                spineCapabilities(),
                List.of());
    }

    private static Set<String> spineCapabilities() {
        java.util.LinkedHashSet<String> ids = new java.util.LinkedHashSet<>();
        for (int i = 1; i <= 21; i++) {
            ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        }
        ids.add("UDM-FOUNDATION-0005");
        ids.add("UDM-FOUNDATION-0006");
        ids.add("UDM-FOUNDATION-0007");
        ids.add("UDM-FOUNDATION-0008");
        ids.add("UDM-FOUNDATION-0009");
        ids.add("UDM-FOUNDATION-0010");
        ids.add("UDM-FOUNDATION-0011");
        ids.add("UDM-FOUNDATION-0012");
        ids.add("UDM-FOUNDATION-0049");
        ids.add("UDM-FOUNDATION-0050");
        ids.add("UDM-FOUNDATION-0051");
        ids.add("UDM-FOUNDATION-0052");
        ids.add("UDM-FOUNDATION-0053");
        ids.add("UDM-FOUNDATION-0054");
        ids.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) {
            ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        }
        return Set.copyOf(ids);
    }

    private static String textElement(CanonicalDocumentGraphV2 graph, String text) {
        return graph.elements().stream()
                .filter(element -> element.text().contains(text))
                .findFirst()
                .orElseThrow(() -> new AssertionError("text element not found: " + text))
                .id();
    }

    private static Map<DocumentSpineStage, DocumentSpineStageReceipt> latestByStage(List<DocumentSpineStageReceipt> receipts) {
        EnumMap<DocumentSpineStage, DocumentSpineStageReceipt> latest = new EnumMap<>(DocumentSpineStage.class);
        for (DocumentSpineStageReceipt receipt : receipts) {
            latest.put(receipt.stage(), receipt);
        }
        return Map.copyOf(latest);
    }

    private static long count(
            List<DocumentSpineStageReceipt> receipts,
            DocumentSpineStage stage,
            DocumentSpineStageReceipt.Status status) {
        return receipts.stream().filter(receipt -> receipt.stage() == stage && receipt.status() == status).count();
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
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void expectFailure(
            Throwing action,
            String message,
            Class<? extends Throwable> expectedType) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (Throwable throwable) {
            if (!expectedType.isInstance(throwable)) {
                if (throwable instanceof Exception exception) {
                    throw exception;
                }
                throw throwable;
            }
        }
    }

    private static String sha(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) {
            return;
        }
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(java.util.Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }

    private static final class CountingRenderWorker implements RenderProofWorker {
        private int calls;

        @Override
        public Result prove(Request request) {
            calls++;
            byte[] rendered = ("%PDF-1.4\n% synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            String rasterSha = sha(("raster:" + request.format()).getBytes(StandardCharsets.UTF_8));
            RenderProofReceipt receipt = new RenderProofReceipt(
                    RenderProofReceipt.SCHEMA_V1,
                    request.format(),
                    sha(request.artifact()),
                    sha(rendered),
                    "SyntheticIndependentRenderer",
                    "test-1",
                    "SyntheticRasterOracle",
                    "test-1",
                    FIXED,
                    new RenderProofReceipt.IsolationEvidence(
                            true,
                            true,
                            true,
                            RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX,
                            10_000,
                            8 * 1024 * 1024,
                            "C.UTF-8",
                            "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(
                            1,
                            612,
                            792,
                            0,
                            816,
                            1056,
                            rasterSha,
                            0.10,
                            0.01,
                            10,
                            0)),
                    List.of(),
                    Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }
}
