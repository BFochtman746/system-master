package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.document.spine.DocumentEffectAdmissionDecision;
import org.systemmaster.tools.document.spine.DocumentEffectAdmissionProvider;
import org.systemmaster.tools.document.spine.DocumentExistingArtifactEffectExecutor;
import org.systemmaster.tools.document.spine.DocumentMasterReceipt;
import org.systemmaster.tools.document.spine.DocumentRebuildReceipt;
import org.systemmaster.tools.document.spine.DocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineStage;
import org.systemmaster.tools.document.spine.DocumentSpineStageReceipt;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.pdf.PdfStructuralEngine;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/** Frozen portable denominator: REBUILD-48 + MASTER-44 for the shared existing-artifact effect executor. */
public final class DocumentSpineEffectRuntimePortableTests {
    private static final Instant FIXED = Instant.parse("2026-09-12T09:30:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static int masterCases;
    private static int rebuildCases;

    public static void main(String[] args) throws Exception {
        testMasterHappyAndResume();
        testMasterAdmissionAndAuthorityFences();
        testRebuildHappyAndResume();
        testRebuildAmbiguityAndAuthorityFences();
        if (masterCases != 44) throw new AssertionError("MASTER denominator mismatch: " + masterCases);
        if (rebuildCases != 48) throw new AssertionError("REBUILD denominator mismatch: " + rebuildCases);
        System.out.println("DOCUMENT_SPINE_EFFECT_RUNTIME_PORTABLE_PASS REBUILD=" + rebuildCases + " MASTER=" + masterCases);
    }

    private static void testMasterHappyAndResume() throws Exception {
        Path root = Files.createTempDirectory("effect-master-");
        try {
            Fixture fixture = fixture(root, DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentFormat.DOCX, false);
            AtomicInteger admissions = new AtomicInteger();
            DocumentEffectAdmissionProvider provider = allowing(fixture, admissions, "master-allow");
            DocumentExistingArtifactEffectExecutor executor = executor(fixture, provider);
            var first = executor.executeOrResume(
                    fixture.job(), fixture.plan(), fixture.sourceFormat(), fixture.source(), fixture.sourceGraph(),
                    DocumentSpineStage.MASTER, fixture.effectKey());

            m(first.receipt() instanceof DocumentMasterReceipt, "MASTER emits DocumentMasterReceipt v1");
            m(DocumentMasterReceipt.SCHEMA_V1.equals(first.receipt().schema()), "MASTER receipt schema bound");
            m(DocumentMasterReceipt.STATUS_PERSISTED.equals(first.receipt().status()), "MASTER success is persisted-unproven only");
            m(!first.receipt().resumed(), "first MASTER receipt is not resumed");
            m(first.receipt().sourceFormat() == DocumentFormat.DOCX, "MASTER source format bound");
            m(first.receipt().targetFormat() == DocumentFormat.DOCX, "MASTER same target format bound");
            m(first.resultSha256().equals(first.receipt().candidateArtifactSha256()), "MASTER candidate digest bound");
            m(fixture.sourceGraph().sourceSha256().equals(first.receipt().sourceArtifactSha256()), "MASTER source digest bound");
            m(fixture.sourceGraph().semanticDigest().equals(first.receipt().sourceSemanticSha256()), "MASTER source semantic bound");
            m(fixture.plan().digest().equals(first.receipt().planDigest()), "MASTER plan digest bound");
            m(fixture.plan().operation().intentDigest().equals(first.receipt().operationIntentSha256()), "MASTER operation intent bound");
            m("master-allow".equals(first.receipt().admissionDecisionId()), "MASTER external admission decision bound");
            m("portable-policy-r1".equals(first.receipt().policyRevision()), "MASTER policy revision bound");
            m(policyDigest().equals(first.receipt().policyDigestSha256()), "MASTER policy digest bound");
            m(DocumentEffectAdmissionDecision.capabilitySetDigest(fixture.plan()).equals(first.receipt().capabilitySetSha256()), "MASTER capability set bound");
            m(fixture.plan().operation().rollbackArtifactSha256().equals(first.receipt().rollbackArtifactSha256()), "MASTER rollback evidence bound");
            m(DocumentExistingArtifactEffectExecutor.ENGINE_ID.equals(first.receipt().mutationEngine()), "MASTER mutation engine bound");
            m(first.preservation().pass() && text(DocumentFormat.DOCX, first.resultBytes()).contains("Omega"), "MASTER candidate preserved and changed");

            int before = fixture.checkpoints().receipts(fixture.job().jobId()).size();
            var resumed = executor.executeOrResume(
                    fixture.job(), fixture.plan(), fixture.sourceFormat(), fixture.source(), fixture.sourceGraph(),
                    DocumentSpineStage.MASTER, fixture.effectKey());
            m(admissions.get() == 1, "MASTER persisted resume does not reconsult policy or replay effect");
            m(DocumentMasterReceipt.STATUS_RESUMED.equals(resumed.receipt().status()), "MASTER persisted resume status explicit");
            m(resumed.receipt().resumed(), "MASTER persisted resume flag explicit");
            m(first.resultSha256().equals(resumed.resultSha256()), "MASTER resume exact candidate digest");
            m(first.resultGraph().semanticDigest().equals(resumed.resultGraph().semanticDigest()), "MASTER resume exact semantic digest");
            m(java.util.Arrays.equals(first.resultBytes(), resumed.resultBytes()), "MASTER resume exact bytes");
            m(fixture.checkpoints().receipts(fixture.job().jobId()).size() == before, "MASTER PASS resume appends no duplicate checkpoint");
            m(count(fixture.checkpoints(), fixture.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 1, "MASTER records exactly one pre-persistence checkpoint");

            FileDocumentSpineCheckpointStore recoveryStore = new FileDocumentSpineCheckpointStore(root.resolve("prepared-recovery"));
            DocumentSpineStageReceipt prepared = fixture.checkpoints().receipts(fixture.job().jobId()).stream()
                    .filter(r -> r.stage() == DocumentSpineStage.MASTER && r.status() == DocumentSpineStageReceipt.Status.PREPARED)
                    .findFirst().orElseThrow();
            recoveryStore.record(prepared);
            AtomicInteger recoveryAdmissions = new AtomicInteger();
            DocumentExistingArtifactEffectExecutor recoveryExecutor = new DocumentExistingArtifactEffectExecutor(
                    fixture.gateway(), recoveryStore, allowing(fixture, recoveryAdmissions, "should-not-run"), CLOCK);
            var recovered = recoveryExecutor.executeOrResume(
                    fixture.job(), fixture.plan(), fixture.sourceFormat(), fixture.source(), fixture.sourceGraph(),
                    DocumentSpineStage.MASTER, fixture.effectKey());
            m(recoveryAdmissions.get() == 0, "MASTER prepared recovery never reauthorizes or replays mutation");
            m(recovered.receipt().resumed(), "MASTER prepared recovery marked resumed");
            m(DocumentMasterReceipt.STATUS_RESUMED.equals(recovered.receipt().status()), "MASTER prepared recovery status explicit");
            m(first.resultSha256().equals(recovered.resultSha256()), "MASTER prepared recovery reconciles expected candidate digest");
            m(count(recoveryStore, fixture.job().jobId(), DocumentSpineStageReceipt.Status.PASS) == 1, "MASTER prepared recovery seals one PASS");
            m(recoveryStore.receipts(fixture.job().jobId()).size() == 2, "MASTER prepared recovery preserves PREPARED then PASS history");
            m(recoveryStore.receipts(fixture.job().jobId()).get(1).diagnostics().contains("RESUMED_FROM_PREPARED_CANDIDATE__MUTATION_NOT_REPLAYED"), "MASTER prepared recovery proves no replay");
            m(text(DocumentFormat.DOCX, recovered.resultBytes()).contains("Omega"), "MASTER prepared recovery returns persisted candidate");
        } finally {
            deleteTree(root);
        }
    }

    private static void testMasterAdmissionAndAuthorityFences() throws Exception {
        Path denyRoot = Files.createTempDirectory("effect-master-deny-");
        Path mismatchRoot = Files.createTempDirectory("effect-master-mismatch-");
        Path crossRoot = Files.createTempDirectory("effect-master-cross-");
        Path finalRoot = Files.createTempDirectory("effect-master-final-");
        try {
            Fixture denied = fixture(denyRoot, DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentFormat.DOCX, false);
            AtomicInteger denyCalls = new AtomicInteger();
            DocumentEffectAdmissionProvider deny = (job, plan, graph) -> {
                denyCalls.incrementAndGet();
                return decision(denied, "master-deny", DocumentEffectAdmissionDecision.Disposition.DENY,
                        graph.sourceSha256(), graph.semanticDigest(), plan.operation().intentDigest(), plan.digest(),
                        DocumentEffectAdmissionDecision.capabilitySetDigest(plan));
            };
            mex(() -> executor(denied, deny).executeOrResume(denied.job(), denied.plan(), denied.sourceFormat(), denied.source(), denied.sourceGraph(), DocumentSpineStage.MASTER, denied.effectKey()), SecurityException.class, "MASTER DENY blocks before mutation");
            m(denyCalls.get() == 1, "MASTER DENY consults policy once");
            m(count(denied.checkpoints(), denied.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 0, "MASTER DENY creates no candidate preparation");

            Fixture mismatch = fixture(mismatchRoot, DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentFormat.DOCX, false);
            DocumentEffectAdmissionProvider wrongSource = (job, plan, graph) -> decision(
                    mismatch, "master-wrong-source", DocumentEffectAdmissionDecision.Disposition.ALLOW,
                    "0".repeat(64), graph.semanticDigest(), plan.operation().intentDigest(), plan.digest(),
                    DocumentEffectAdmissionDecision.capabilitySetDigest(plan));
            mex(() -> executor(mismatch, wrongSource).executeOrResume(mismatch.job(), mismatch.plan(), mismatch.sourceFormat(), mismatch.source(), mismatch.sourceGraph(), DocumentSpineStage.MASTER, mismatch.effectKey()), SecurityException.class, "MASTER rejects admission source mismatch");
            m(count(mismatch.checkpoints(), mismatch.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 0, "MASTER source mismatch cannot reach PREPARED");

            Fixture cross = fixture(crossRoot, DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentFormat.PDF, false);
            AtomicInteger crossCalls = new AtomicInteger();
            mex(() -> executor(cross, allowing(cross, crossCalls, "master-cross")).executeOrResume(cross.job(), cross.plan(), cross.sourceFormat(), cross.source(), cross.sourceGraph(), DocumentSpineStage.MASTER, cross.effectKey()), IllegalArgumentException.class, "MASTER rejects cross-format target");
            m(crossCalls.get() == 0, "MASTER same-format fence runs before policy call");

            Fixture finalCandidate = fixture(finalRoot, DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentFormat.DOCX, true);
            var finalOutcome = executor(finalCandidate, allowing(finalCandidate, new AtomicInteger(), "master-final")).executeOrResume(
                    finalCandidate.job(), finalCandidate.plan(), finalCandidate.sourceFormat(), finalCandidate.source(), finalCandidate.sourceGraph(), DocumentSpineStage.MASTER, finalCandidate.effectKey());
            m(DocumentMasterReceipt.STATUS_PERSISTED.equals(finalOutcome.receipt().status()), "finalCandidate cannot promote MASTER candidate");
            m(finalOutcome.receipt().evidence().contains("effect-finalCandidate-nonpromotion=true"), "MASTER receipt records finalCandidate nonpromotion");
            m(finalOutcome.receipt().evidence().contains("effect-publication-metadata-nonpromotion=true")
                    && finalOutcome.receipt().evidence().contains("effect-author-metadata-nonpromotion=true"),
                    "MASTER receipt records publication/author metadata nonpromotion");
        } finally {
            deleteTree(denyRoot);
            deleteTree(mismatchRoot);
            deleteTree(crossRoot);
            deleteTree(finalRoot);
        }
    }

    private static void testRebuildHappyAndResume() throws Exception {
        Path root = Files.createTempDirectory("effect-rebuild-");
        try {
            Fixture fixture = fixture(root, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.PDF, false);
            AtomicInteger admissions = new AtomicInteger();
            DocumentExistingArtifactEffectExecutor executor = executor(fixture, allowing(fixture, admissions, "rebuild-allow"));
            var first = executor.executeOrResume(
                    fixture.job(), fixture.plan(), fixture.sourceFormat(), fixture.source(), fixture.sourceGraph(),
                    DocumentSpineStage.REBUILD, fixture.effectKey());

            r(first.receipt() instanceof DocumentRebuildReceipt, "REBUILD emits DocumentRebuildReceipt v1");
            r(DocumentRebuildReceipt.SCHEMA_V1.equals(first.receipt().schema()), "REBUILD receipt schema bound");
            r(DocumentRebuildReceipt.STATUS_PERSISTED.equals(first.receipt().status()), "REBUILD success is persisted-unproven only");
            r(!first.receipt().resumed(), "first REBUILD receipt is not resumed");
            r(first.receipt().sourceFormat() == DocumentFormat.PDF, "REBUILD source format bound");
            r(first.receipt().targetFormat() == DocumentFormat.PDF, "REBUILD target format bound");
            r(first.resultSha256().equals(first.receipt().candidateArtifactSha256()), "REBUILD candidate digest bound");
            r(fixture.sourceGraph().sourceSha256().equals(first.receipt().sourceArtifactSha256()), "REBUILD source digest bound");
            r(fixture.sourceGraph().semanticDigest().equals(first.receipt().sourceSemanticSha256()), "REBUILD source semantic bound");
            r(fixture.plan().digest().equals(first.receipt().planDigest()), "REBUILD plan digest bound");
            r(fixture.plan().operation().intentDigest().equals(first.receipt().operationIntentSha256()), "REBUILD operation intent bound");
            r("rebuild-allow".equals(first.receipt().admissionDecisionId()), "REBUILD admission decision bound");
            r("portable-policy-r1".equals(first.receipt().policyRevision()), "REBUILD policy revision bound");
            r(policyDigest().equals(first.receipt().policyDigestSha256()), "REBUILD policy digest bound");
            r(DocumentEffectAdmissionDecision.capabilitySetDigest(fixture.plan()).equals(first.receipt().capabilitySetSha256()), "REBUILD capability set bound");
            r(fixture.plan().operation().rollbackArtifactSha256().equals(first.receipt().rollbackArtifactSha256()), "REBUILD rollback evidence bound");
            r(DocumentExistingArtifactEffectExecutor.ENGINE_ID.equals(first.receipt().mutationEngine()), "REBUILD mutation engine bound");
            r(first.preservation().pass() && text(DocumentFormat.PDF, first.resultBytes()).contains("Rebuilt Omega"), "REBUILD candidate persisted with declared loss/preservation result");

            int before = fixture.checkpoints().receipts(fixture.job().jobId()).size();
            var resumed = executor.executeOrResume(
                    fixture.job(), fixture.plan(), fixture.sourceFormat(), fixture.source(), fixture.sourceGraph(),
                    DocumentSpineStage.REBUILD, fixture.effectKey());
            r(admissions.get() == 1, "REBUILD persisted resume does not reconsult policy or replay effect");
            r(DocumentRebuildReceipt.STATUS_RESUMED.equals(resumed.receipt().status()), "REBUILD persisted resume status explicit");
            r(resumed.receipt().resumed(), "REBUILD persisted resume flag explicit");
            r(first.resultSha256().equals(resumed.resultSha256()), "REBUILD resume exact candidate digest");
            r(first.resultGraph().semanticDigest().equals(resumed.resultGraph().semanticDigest()), "REBUILD resume exact semantic digest");
            r(java.util.Arrays.equals(first.resultBytes(), resumed.resultBytes()), "REBUILD resume exact bytes");
            r(fixture.checkpoints().receipts(fixture.job().jobId()).size() == before, "REBUILD PASS resume appends no duplicate checkpoint");
            r(count(fixture.checkpoints(), fixture.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 1, "REBUILD records exactly one pre-persistence checkpoint");
        } finally {
            deleteTree(root);
        }
    }

    private static void testRebuildAmbiguityAndAuthorityFences() throws Exception {
        Path ambiguousRoot = Files.createTempDirectory("effect-rebuild-ambiguous-");
        Path denyRoot = Files.createTempDirectory("effect-rebuild-deny-");
        Path capabilityRoot = Files.createTempDirectory("effect-rebuild-capability-");
        Path operationRoot = Files.createTempDirectory("effect-rebuild-operation-");
        Path crossRoot = Files.createTempDirectory("effect-rebuild-cross-");
        Path metadataRoot = Files.createTempDirectory("effect-rebuild-metadata-");
        try {
            Fixture ambiguous = fixture(ambiguousRoot, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.PDF, false);
            String fake = "f".repeat(64);
            ambiguous.checkpoints().record(new DocumentSpineStageReceipt(
                    DocumentSpineStageReceipt.SCHEMA_V1,
                    ambiguous.job().jobId(),
                    DocumentSpineStage.REBUILD,
                    DocumentSpineStageReceipt.Status.PREPARED,
                    ambiguous.sourceGraph().sourceSha256(),
                    fake,
                    ambiguous.effectKey(),
                    FIXED,
                    preparationEvidence(ambiguous, "ambiguous-decision", fake),
                    List.of("CANDIDATE_DIGEST_PREPARED__PERSISTENCE_RECONCILIATION_REQUIRED_UNTIL_PASS")));
            AtomicInteger ambiguousCalls = new AtomicInteger();
            rex(() -> executor(ambiguous, allowing(ambiguous, ambiguousCalls, "must-not-run")).executeOrResume(ambiguous.job(), ambiguous.plan(), ambiguous.sourceFormat(), ambiguous.source(), ambiguous.sourceGraph(), DocumentSpineStage.REBUILD, ambiguous.effectKey()), IllegalStateException.class, "REBUILD ambiguous PREPARED state forbids mutation replay");
            r(ambiguousCalls.get() == 0, "REBUILD ambiguous recovery does not reconsult policy");
            r(ambiguous.checkpoints().receipts(ambiguous.job().jobId()).size() == 1, "REBUILD ambiguous state remains durable and unchanged");
            r(count(ambiguous.checkpoints(), ambiguous.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 1, "REBUILD ambiguous state remains PREPARED");
            r(count(ambiguous.checkpoints(), ambiguous.job().jobId(), DocumentSpineStageReceipt.Status.PASS) == 0, "REBUILD ambiguous state cannot become PASS");
            r(fake.equals(ambiguous.checkpoints().latest(ambiguous.job().jobId(), DocumentSpineStage.REBUILD).orElseThrow().outputSha256()), "REBUILD ambiguity retains expected candidate digest");
            r(ambiguous.checkpoints().latest(ambiguous.job().jobId(), DocumentSpineStage.REBUILD).orElseThrow().diagnostics().contains("CANDIDATE_DIGEST_PREPARED__PERSISTENCE_RECONCILIATION_REQUIRED_UNTIL_PASS"), "REBUILD ambiguity retains reconciliation reason");
            r(ambiguous.checkpoints().latest(ambiguous.job().jobId(), DocumentSpineStage.REBUILD).orElseThrow().prepared(ambiguous.effectKey()), "REBUILD prepared checkpoint remains idempotency-bound");

            Fixture denied = fixture(denyRoot, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.PDF, false);
            AtomicInteger denyCalls = new AtomicInteger();
            DocumentEffectAdmissionProvider deny = (job, plan, graph) -> {
                denyCalls.incrementAndGet();
                return decision(denied, "rebuild-deny", DocumentEffectAdmissionDecision.Disposition.DENY,
                        graph.sourceSha256(), graph.semanticDigest(), plan.operation().intentDigest(), plan.digest(),
                        DocumentEffectAdmissionDecision.capabilitySetDigest(plan));
            };
            rex(() -> executor(denied, deny).executeOrResume(denied.job(), denied.plan(), denied.sourceFormat(), denied.source(), denied.sourceGraph(), DocumentSpineStage.REBUILD, denied.effectKey()), SecurityException.class, "REBUILD DENY blocks before mutation");
            r(denyCalls.get() == 1, "REBUILD DENY consults policy once");
            r(count(denied.checkpoints(), denied.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 0, "REBUILD DENY creates no candidate preparation");

            Fixture capability = fixture(capabilityRoot, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.PDF, false);
            DocumentEffectAdmissionProvider wrongCapability = (job, plan, graph) -> decision(
                    capability, "rebuild-wrong-capability", DocumentEffectAdmissionDecision.Disposition.ALLOW,
                    graph.sourceSha256(), graph.semanticDigest(), plan.operation().intentDigest(), plan.digest(), "1".repeat(64));
            rex(() -> executor(capability, wrongCapability).executeOrResume(capability.job(), capability.plan(), capability.sourceFormat(), capability.source(), capability.sourceGraph(), DocumentSpineStage.REBUILD, capability.effectKey()), SecurityException.class, "REBUILD rejects capability-set mismatch");
            r(count(capability.checkpoints(), capability.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 0, "REBUILD capability mismatch cannot prepare candidate");
            r(count(capability.checkpoints(), capability.job().jobId(), DocumentSpineStageReceipt.Status.FAIL) == 1, "REBUILD capability mismatch records bounded reasoned rejection");

            Fixture operation = fixture(operationRoot, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.PDF, false);
            DocumentEffectAdmissionProvider wrongOperation = (job, plan, graph) -> decision(
                    operation, "rebuild-wrong-operation", DocumentEffectAdmissionDecision.Disposition.ALLOW,
                    graph.sourceSha256(), graph.semanticDigest(), "2".repeat(64), plan.digest(),
                    DocumentEffectAdmissionDecision.capabilitySetDigest(plan));
            rex(() -> executor(operation, wrongOperation).executeOrResume(operation.job(), operation.plan(), operation.sourceFormat(), operation.source(), operation.sourceGraph(), DocumentSpineStage.REBUILD, operation.effectKey()), SecurityException.class, "REBUILD rejects operation-intent mismatch");
            r(count(operation.checkpoints(), operation.job().jobId(), DocumentSpineStageReceipt.Status.PREPARED) == 0, "REBUILD operation mismatch cannot prepare candidate");
            r(count(operation.checkpoints(), operation.job().jobId(), DocumentSpineStageReceipt.Status.FAIL) == 1, "REBUILD operation mismatch records bounded rejection");

            Fixture cross = fixture(crossRoot, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.DOCX, false);
            AtomicInteger crossCalls = new AtomicInteger();
            rex(() -> executor(cross, allowing(cross, crossCalls, "rebuild-cross")).executeOrResume(cross.job(), cross.plan(), cross.sourceFormat(), cross.source(), cross.sourceGraph(), DocumentSpineStage.REBUILD, cross.effectKey()), UnsupportedOperationException.class, "cross-format REBUILD fails closed until dedicated converter exists");
            r(crossCalls.get() == 0, "cross-format REBUILD capability fence runs before policy call");
            r(cross.checkpoints().receipts(cross.job().jobId()).isEmpty(), "cross-format REBUILD creates no mutation checkpoint");

            Fixture metadata = fixture(metadataRoot, DocumentSpineMode.REBUILD, DocumentFormat.PDF, DocumentFormat.PDF, true);
            var outcome = executor(metadata, allowing(metadata, new AtomicInteger(), "rebuild-metadata")).executeOrResume(
                    metadata.job(), metadata.plan(), metadata.sourceFormat(), metadata.source(), metadata.sourceGraph(), DocumentSpineStage.REBUILD, metadata.effectKey());
            r(DocumentRebuildReceipt.STATUS_PERSISTED.equals(outcome.receipt().status()), "REBUILD finalCandidate remains unproven candidate");
            r(outcome.receipt().evidence().contains("effect-finalCandidate-nonpromotion=true"), "REBUILD receipt records metadata nonpromotion fence");
        } finally {
            deleteTree(ambiguousRoot);
            deleteTree(denyRoot);
            deleteTree(capabilityRoot);
            deleteTree(operationRoot);
            deleteTree(crossRoot);
            deleteTree(metadataRoot);
        }
    }

    private static Fixture fixture(
            Path root,
            DocumentSpineMode mode,
            DocumentFormat sourceFormat,
            DocumentFormat targetFormat,
            boolean finalCandidate) throws Exception {
        byte[] source;
        CanonicalDocumentGraphV2 graph;
        DocumentOperationContract operation;
        DocumentProcessingService documents = new DocumentProcessingService();
        if (sourceFormat == DocumentFormat.DOCX) {
            source = new DocxFullLaneEngine().createDocument(List.of("Alpha", "Preserve this"));
            graph = documents.projectCanonicalGraphV2(sourceFormat, source);
            String target = graph.elements().stream().filter(e -> e.text().contains("Alpha")).findFirst().orElseThrow().id();
            operation = DocumentOperationContract.replaceText(
                    "effect-docx-replace", graph, List.of(target), "Alpha", "Omega", Set.of("word/document.xml"), finalCandidate);
        } else if (sourceFormat == DocumentFormat.PDF) {
            source = new PdfStructuralEngine().createTextPdf(List.of("Legacy Alpha", "Original line"));
            graph = documents.projectCanonicalGraphV2(sourceFormat, source);
            String target = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow().id();
            operation = new DocumentOperationContract(
                    DocumentOperationContract.SCHEMA_V1,
                    "effect-pdf-rebuild",
                    graph.sourceSha256(),
                    graph.semanticDigest(),
                    DocumentOperationContract.Type.CONVERT,
                    List.of(DocumentSelector.node(target)),
                    "Rebuild PDF as governed semantic derivative",
                    Map.of("rebuildText", "Rebuilt Omega\nSecond rebuilt line"),
                    DocumentOperationContract.Risk.LOSSY_TRANSFORM,
                    graph.sourceSha256(),
                    Set.of("<artifact>"),
                    DocumentOperationContract.VisualImpact.FULL_RENDER_CHANGE,
                    true,
                    List.of("ORIGINAL_PDF_LAYOUT_REBUILT_FROM_LITERAL_TEXT"),
                    finalCandidate,
                    Set.of());
        } else {
            throw new IllegalArgumentException("fixture source format");
        }
        Set<String> capabilities = Set.of("UDM-SPINE-0009", "UDM-SPINE-0010", "UDM-FOUNDATION-0008");
        DocumentSpineJob job = new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                "effect-source",
                "effect-result",
                "source." + sourceFormat.name().toLowerCase(java.util.Locale.ROOT),
                sourceFormat.mediaType(),
                mode,
                targetFormat,
                finalCandidate ? DocumentSpinePublicationClass.FINAL : DocumentSpinePublicationClass.VERIFIED_DRAFT,
                capabilities,
                "transport-metadata-must-not-authorize",
                "author-metadata-must-not-authorize",
                FIXED);
        Set<String> targets = operation.selectors().stream().filter(s -> s.kind() == DocumentSelector.Kind.NODE_ID).map(DocumentSelector::value).collect(java.util.stream.Collectors.toUnmodifiableSet());
        DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), mode, operation, targets, capabilities, List.of());
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"), ArtifactIntakePolicy.conservative(32L * 1024 * 1024), repository, CLOCK);
        FileDocumentSpineCheckpointStore checkpoints = new FileDocumentSpineCheckpointStore(root.resolve("checkpoints"));
        String effectKey = sha((job.identityMaterial() + "|" + mode + "|" + graph.sourceSha256() + "|" + plan.digest()).getBytes(StandardCharsets.UTF_8));
        return new Fixture(root, sourceFormat, source, graph, job, plan, gateway, checkpoints, effectKey);
    }

    private static DocumentExistingArtifactEffectExecutor executor(Fixture fixture, DocumentEffectAdmissionProvider provider) {
        return new DocumentExistingArtifactEffectExecutor(fixture.gateway(), fixture.checkpoints(), provider, CLOCK);
    }

    private static DocumentEffectAdmissionProvider allowing(Fixture fixture, AtomicInteger calls, String decisionId) {
        return (job, plan, graph) -> {
            calls.incrementAndGet();
            return decision(fixture, decisionId, DocumentEffectAdmissionDecision.Disposition.ALLOW,
                    graph.sourceSha256(), graph.semanticDigest(), plan.operation().intentDigest(), plan.digest(),
                    DocumentEffectAdmissionDecision.capabilitySetDigest(plan));
        };
    }

    private static DocumentEffectAdmissionDecision decision(
            Fixture fixture,
            String decisionId,
            DocumentEffectAdmissionDecision.Disposition disposition,
            String sourceSha,
            String semanticSha,
            String operationSha,
            String planSha,
            String capabilitySha) {
        return new DocumentEffectAdmissionDecision(
                DocumentEffectAdmissionDecision.SCHEMA_V1,
                decisionId,
                disposition,
                fixture.job().jobId(),
                fixture.job().mode(),
                sourceSha,
                semanticSha,
                operationSha,
                planSha,
                capabilitySha,
                "portable-policy-r1",
                policyDigest(),
                disposition.name() + "_PORTABLE_TEST",
                FIXED);
    }

    private static List<String> preparationEvidence(Fixture fixture, String decisionId, String candidateSha) {
        return List.of(
                "effect-prepared=true",
                "effect-admission-decision=" + decisionId,
                "effect-policy-revision=portable-policy-r1",
                "effect-policy-digest=" + policyDigest(),
                "effect-capability-set-digest=" + DocumentEffectAdmissionDecision.capabilitySetDigest(fixture.plan()),
                "effect-source-format=" + fixture.sourceFormat(),
                "effect-target-format=" + fixture.job().requestedTargetFormat(),
                "effect-source-semantic=" + fixture.sourceGraph().semanticDigest(),
                "effect-plan-digest=" + fixture.plan().digest(),
                "effect-operation-intent=" + fixture.plan().operation().intentDigest(),
                "effect-candidate-digest=" + candidateSha,
                "effect-candidate-semantic=" + fixture.sourceGraph().semanticDigest(),
                "effect-rollback-digest=" + fixture.plan().operation().rollbackArtifactSha256(),
                "effect-mutation-engine=" + DocumentExistingArtifactEffectExecutor.ENGINE_ID,
                "effect-authority-standing=TECHNICAL_CANDIDATE_ONLY__PERSISTENCE_NOT_YET_RECONCILED");
    }

    private static long count(DocumentSpineCheckpointStore store, String jobId, DocumentSpineStageReceipt.Status status) throws Exception {
        return store.receipts(jobId).stream().filter(r -> r.status() == status).count();
    }

    private static String text(DocumentFormat format, byte[] bytes) {
        try {
            return new DocumentProcessingService().extractPlainText(format, bytes);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("portable text extraction failed", exception);
        }
    }

    private static String policyDigest() {
        return sha("portable-policy-r1".getBytes(StandardCharsets.UTF_8));
    }

    private static String sha(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void m(boolean condition, String message) {
        masterCases++;
        if (!condition) throw new AssertionError(message);
    }

    private static void r(boolean condition, String message) {
        rebuildCases++;
        if (!condition) throw new AssertionError(message);
    }

    private static void mex(Throwing action, Class<? extends Throwable> type, String message) throws Exception {
        masterCases++;
        expect(action, type, message);
    }

    private static void rex(Throwing action, Class<? extends Throwable> type, String message) throws Exception {
        rebuildCases++;
        expect(action, type, message);
    }

    private static void expect(Throwing action, Class<? extends Throwable> type, String message) throws Exception {
        try {
            action.run();
            throw new AssertionError(message);
        } catch (Throwable throwable) {
            if (!type.isInstance(throwable)) {
                if (throwable instanceof Exception exception) throw exception;
                throw throwable;
            }
        }
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }

    private record Fixture(
            Path root,
            DocumentFormat sourceFormat,
            byte[] source,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            GovernedArtifactGateway gateway,
            FileDocumentSpineCheckpointStore checkpoints,
            String effectKey) {
        Fixture {
            source = source.clone();
        }

        @Override
        public byte[] source() {
            return source.clone();
        }
    }
}
