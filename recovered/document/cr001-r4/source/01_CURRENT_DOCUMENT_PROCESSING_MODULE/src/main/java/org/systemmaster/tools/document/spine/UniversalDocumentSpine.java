package org.systemmaster.tools.document.spine;

import org.systemmaster.core.ArtifactIntakeReceipt;
import org.systemmaster.core.ArtifactIntakeRequest;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.CanonicalDocumentGraphV2;
import org.systemmaster.tools.document.DocumentFinalizationGate;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentOperationContract;
import org.systemmaster.tools.document.DocumentProcessingService;
import org.systemmaster.tools.document.DocumentProofReceipt;
import org.systemmaster.tools.document.FinalDocumentProofPolicy;
import org.systemmaster.tools.document.GovernedCdg2MutationCoordinator;
import org.systemmaster.tools.document.NativePartPreservationMap;
import org.systemmaster.tools.document.OpenWorldFeatureDiscovery;
import org.systemmaster.tools.document.SemanticCdg2NativeAdapter;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * DOCUMENT-SPINE-002A governed execution authority.
 *
 * Every existing-artifact job is admitted through PLATFORM-008, projected to CDG-2, planned,
 * and (when effectful) mutated only through the governed CDG-2 coordinator. Candidate bytes are
 * persisted before later proof stages so restart can continue without replaying the native mutation.
 */
public final class UniversalDocumentSpine {
    private static final String ENGINE_ID = "SemanticCdg2NativeAdapter/DOCUMENT-SPINE-002A";

    private final GovernedArtifactGateway gateway;
    private final DocumentSpineCheckpointStore checkpoints;
    private final DocumentSpineVersionStore versions;
    private final DocumentSpineProofService proofs;
    private final Clock clock;
    private final DocumentProcessingService documents = new DocumentProcessingService();
    private final GovernedCdg2MutationCoordinator mutationCoordinator = new GovernedCdg2MutationCoordinator();
    private final OpenWorldFeatureDiscovery openWorld = new OpenWorldFeatureDiscovery();
    private final DocumentFinalizationGate finalizationGate = new DocumentFinalizationGate();

    public UniversalDocumentSpine(
            GovernedArtifactGateway gateway,
            DocumentSpineCheckpointStore checkpoints,
            DocumentSpineVersionStore versions,
            DocumentSpineProofService proofs,
            Clock clock) {
        this.gateway = Objects.requireNonNull(gateway, "gateway");
        this.checkpoints = Objects.requireNonNull(checkpoints, "checkpoints");
        this.versions = Objects.requireNonNull(versions, "versions");
        this.proofs = Objects.requireNonNull(proofs, "proofs");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public DocumentSpineResult executeExisting(
            DocumentSpineJob job,
            InputStream sourceInput,
            DocumentSpineExecutionPlan plan) throws Exception {
        Objects.requireNonNull(job, "job");
        Objects.requireNonNull(plan, "plan");
        validateJobAndPlan(job, plan);
        if (job.mode() == DocumentSpineMode.CREATE) {
            throw new UnsupportedOperationException("CREATE source-intent route remains a later DOCUMENT-SPINE-002A slice");
        }

        byte[] sourceBytes = intake(job, sourceInput);
        String sourceSha = DocumentSpineDigests.sha256(sourceBytes);
        DocumentFormat format = identify(job, sourceBytes, sourceSha);
        DocumentProcessingService.Inspection inspection = secure(job, format, sourceBytes, sourceSha);
        forensics(job, format, inspection, sourceSha);
        CanonicalDocumentGraphV2 sourceGraph = parse(job, format, sourceBytes, sourceSha);
        String extractedText = extract(job, format, sourceBytes, sourceSha);
        understand(job, sourceGraph, sourceSha);
        plan(job, plan, sourceGraph, sourceSha);

        if (job.mode() == DocumentSpineMode.READ || job.mode() == DocumentSpineMode.EXTRACT) {
            completeReadOnlyStages(job, sourceSha, plan.digest());
            return new DocumentSpineResult(
                    job,
                    format,
                    sourceBytes,
                    sourceGraph,
                    extractedText,
                    null,
                    null,
                    null,
                    List.of(),
                    null,
                    null,
                    null,
                    checkpoints.receipts(job.jobId()));
        }

        EffectResult effect = mutateOrResume(job, plan, format, sourceBytes, sourceGraph);
        ArrayList<DocumentProofReceipt> receipts = new ArrayList<>();
        collectRender(job, plan, format, effect.resultBytes(), receipts);
        collectSemanticComparison(job, plan, format, sourceBytes, effect, receipts);
        collectPackageValidation(job, plan, format, effect, receipts);
        collectAccessibility(job, plan, format, effect, receipts);
        collectSecurityProof(job, plan, format, effect, receipts);
        DocumentFinalizationGate.Result finalization = prove(job, plan, effect, receipts);
        DocumentSpineVersionReceipt version = version(job, plan, format, sourceSha, effect, finalization, receipts);
        DocumentSpinePublicationReceipt publication = publish(job, plan, format, effect, finalization, version);

        return new DocumentSpineResult(
                job,
                format,
                sourceBytes,
                sourceGraph,
                extractedText,
                effect.resultBytes(),
                effect.resultGraph(),
                effect.preservation(),
                receipts,
                finalization,
                version,
                publication,
                checkpoints.receipts(job.jobId()));
    }

    private byte[] intake(DocumentSpineJob job, InputStream sourceInput) throws Exception {
        String key = stageKey(job, DocumentSpineStage.INTAKE, null, null, job.identityMaterial());
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), DocumentSpineStage.INTAKE);
        if (prior.isPresent() && prior.get().resumable(key)) {
            String digest = requireOutputDigest(prior.get(), DocumentSpineStage.INTAKE);
            return gateway.readVerified(digest, gateway.maxBytes());
        }
        if (sourceInput == null) {
            throw new IllegalArgumentException("sourceInput required when intake has not completed");
        }
        ArtifactIntakeRequest request = new ArtifactIntakeRequest(
                "spine-source-" + job.jobId(),
                job.sourceArtifactId(),
                job.producerRef(),
                job.declaredMediaType(),
                null,
                null,
                List.of(),
                List.of("project:" + job.projectId(), "job:" + job.jobId()),
                Instant.now(clock));
        ArtifactIntakeReceipt receipt = gateway.ingest(request, sourceInput);
        if (!"VERIFIED".equals(receipt.disposition())) {
            failStage(
                    job,
                    DocumentSpineStage.INTAKE,
                    null,
                    receipt.digest(),
                    key,
                    List.of("intake-id=" + receipt.intakeId()),
                    List.of(receipt.reason()));
            throw new SecurityException("artifact intake blocked: " + receipt.reason());
        }
        passStage(
                job,
                DocumentSpineStage.INTAKE,
                null,
                receipt.digest(),
                key,
                List.of(
                        "intake-id=" + receipt.intakeId(),
                        "artifact-id=" + receipt.artifactId(),
                        "declared-media=" + receipt.declaredMediaType(),
                        "detected-media=" + receipt.detectedMediaType(),
                        "bytes=" + receipt.sizeBytes()),
                List.of());
        return gateway.readVerified(receipt.digest(), gateway.maxBytes());
    }

    private DocumentFormat identify(DocumentSpineJob job, byte[] sourceBytes, String sourceSha) throws Exception {
        String key = stageKey(job, DocumentSpineStage.IDENTIFY, sourceSha, sourceSha, job.declaredMediaType());
        DocumentFormat format = documents.detect(sourceBytes, job.sourceFileName(), job.declaredMediaType());
        if (format == DocumentFormat.UNKNOWN) {
            failStage(job, DocumentSpineStage.IDENTIFY, sourceSha, sourceSha, key, List.of(), List.of("UNKNOWN_DOCUMENT_FORMAT"));
            throw new IllegalArgumentException("unknown document format");
        }
        if (format != job.requestedTargetFormat() && job.mode() != DocumentSpineMode.REBUILD) {
            failStage(
                    job,
                    DocumentSpineStage.IDENTIFY,
                    sourceSha,
                    sourceSha,
                    key,
                    List.of("detected=" + format),
                    List.of("REQUESTED_TARGET_FORMAT_MISMATCH:" + job.requestedTargetFormat()));
            throw new IllegalArgumentException("requested target format differs from detected source format");
        }
        passStageIfNeeded(
                job,
                DocumentSpineStage.IDENTIFY,
                sourceSha,
                sourceSha,
                key,
                List.of("format=" + format, "media-type=" + format.mediaType()),
                List.of());
        return format;
    }

    private DocumentProcessingService.Inspection secure(
            DocumentSpineJob job,
            DocumentFormat format,
            byte[] sourceBytes,
            String sourceSha) throws Exception {
        String key = stageKey(job, DocumentSpineStage.SECURE, sourceSha, sourceSha, format.name());
        DocumentProcessingService.Inspection inspection = documents.inspect(format, sourceBytes);
        ArrayList<String> activeFindings = new ArrayList<>();
        for (String diagnostic : inspection.diagnostics()) {
            if (diagnostic.contains("ACTIVE_CONTENT")) {
                activeFindings.add(diagnostic);
            }
        }
        String activeParts = inspection.facts().getOrDefault("activeContentParts", "0");
        if (!"0".equals(activeParts)) {
            activeFindings.add("ACTIVE_CONTENT_PARTS=" + activeParts);
        }
        boolean effectful = job.mode() == DocumentSpineMode.MASTER || job.mode() == DocumentSpineMode.REBUILD;
        if (effectful && !activeFindings.isEmpty()) {
            failStage(
                    job,
                    DocumentSpineStage.SECURE,
                    sourceSha,
                    sourceSha,
                    key,
                    List.of("format=" + format),
                    activeFindings);
            throw new SecurityException("effectful mutation of active-content artifact is blocked by DOCUMENT-SPINE-002A");
        }
        passStageIfNeeded(
                job,
                DocumentSpineStage.SECURE,
                sourceSha,
                sourceSha,
                key,
                List.of("security-posture=" + (activeFindings.isEmpty() ? "INERT" : "READ_ONLY_ACTIVE_CONTENT")),
                activeFindings);
        return inspection;
    }

    private void forensics(
            DocumentSpineJob job,
            DocumentFormat format,
            DocumentProcessingService.Inspection inspection,
            String sourceSha) throws Exception {
        String key = stageKey(job, DocumentSpineStage.FORENSICS, sourceSha, sourceSha, inspection.sha256());
        ArrayList<String> evidence = new ArrayList<>();
        evidence.add("format=" + format);
        inspection.facts().entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> evidence.add(entry.getKey() + "=" + entry.getValue()));
        passStageIfNeeded(
                job,
                DocumentSpineStage.FORENSICS,
                sourceSha,
                sourceSha,
                key,
                evidence,
                inspection.diagnostics());
    }

    private CanonicalDocumentGraphV2 parse(
            DocumentSpineJob job,
            DocumentFormat format,
            byte[] sourceBytes,
            String sourceSha) throws Exception {
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(format, sourceBytes);
        if (!sourceSha.equals(graph.sourceSha256())) {
            throw new IllegalStateException("CDG-2 source digest mismatch");
        }
        String key = stageKey(job, DocumentSpineStage.PARSE, sourceSha, sourceSha, graph.semanticDigest());
        passStageIfNeeded(
                job,
                DocumentSpineStage.PARSE,
                sourceSha,
                sourceSha,
                key,
                List.of(
                        "schema=" + graph.schemaVersion(),
                        "semantic-digest=" + graph.semanticDigest(),
                        "elements=" + graph.elements().size(),
                        "native-parts=" + graph.nativeParts().size()),
                List.of());
        return graph;
    }

    private String extract(
            DocumentSpineJob job,
            DocumentFormat format,
            byte[] sourceBytes,
            String sourceSha) throws Exception {
        String text = documents.extractPlainText(format, sourceBytes);
        String textSha = DocumentSpineDigests.sha256(text.getBytes(StandardCharsets.UTF_8));
        String key = stageKey(job, DocumentSpineStage.EXTRACT, sourceSha, sourceSha, textSha);
        passStageIfNeeded(
                job,
                DocumentSpineStage.EXTRACT,
                sourceSha,
                sourceSha,
                key,
                List.of("text-sha256=" + textSha, "characters=" + text.length()),
                List.of());
        return text;
    }

    private void understand(DocumentSpineJob job, CanonicalDocumentGraphV2 sourceGraph, String sourceSha) throws Exception {
        List<OpenWorldFeatureDiscovery.ProvisionalCapability> provisional = openWorld.discover(sourceGraph);
        String material = sourceGraph.semanticDigest() + "|unknown=" + provisional.size();
        String key = stageKey(job, DocumentSpineStage.UNDERSTAND, sourceSha, sourceSha, material);
        ArrayList<String> evidence = new ArrayList<>();
        evidence.add("semantic-digest=" + sourceGraph.semanticDigest());
        evidence.add("unknown-native-features=" + provisional.size());
        for (OpenWorldFeatureDiscovery.ProvisionalCapability capability : provisional) {
            evidence.add("provisional=" + capability.provisionalId() + ":" + capability.nativePart());
        }
        passStageIfNeeded(job, DocumentSpineStage.UNDERSTAND, sourceSha, sourceSha, key, evidence, List.of());
    }

    private void plan(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            CanonicalDocumentGraphV2 sourceGraph,
            String sourceSha) throws Exception {
        if (!job.jobId().equals(plan.jobId()) || job.mode() != plan.mode()) {
            throw new IllegalArgumentException("job/plan identity mismatch");
        }
        if (!job.capabilityIds().containsAll(plan.capabilityIds())) {
            throw new IllegalArgumentException("plan contains capability ids not bound to job");
        }
        if (plan.operation() != null) {
            if (!sourceSha.equals(plan.operation().sourceArtifactSha256())) {
                throw new IllegalArgumentException("plan operation source digest mismatch");
            }
            if (!sourceGraph.semanticDigest().equals(plan.operation().sourceSemanticSha256())) {
                throw new IllegalArgumentException("plan operation source semantic mismatch");
            }
            if (plan.targetedElementIds().isEmpty()) {
                throw new IllegalArgumentException("effectful plan requires CDG-2 targets");
            }
            for (String id : plan.targetedElementIds()) {
                sourceGraph.requireElement(id);
            }
        }
        String key = stageKey(job, DocumentSpineStage.PLAN, sourceSha, sourceSha, plan.digest());
        passStageIfNeeded(
                job,
                DocumentSpineStage.PLAN,
                sourceSha,
                sourceSha,
                key,
                List.of(
                        "plan-digest=" + plan.digest(),
                        "mode=" + plan.mode(),
                        "capabilities=" + String.join(";", plan.capabilityIds().stream().sorted().toList()),
                        "operation-intent=" + (plan.operation() == null ? "READ_ONLY" : plan.operation().intentDigest())),
                plan.declaredLimitations());
    }

    private EffectResult mutateOrResume(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph) throws Exception {
        DocumentSpineStage actionStage = job.mode() == DocumentSpineMode.REBUILD
                ? DocumentSpineStage.REBUILD
                : DocumentSpineStage.MASTER;
        recordActionStagesBefore(job, actionStage, sourceGraph.sourceSha256(), plan.digest());
        String key = stageKey(job, actionStage, sourceGraph.sourceSha256(), null, plan.digest());
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), actionStage);
        if (prior.isPresent() && prior.get().resumable(key)) {
            String resultSha = requireOutputDigest(prior.get(), actionStage);
            byte[] resultBytes = gateway.readVerified(resultSha, gateway.maxBytes());
            CanonicalDocumentGraphV2 resultGraph = documents.projectCanonicalGraphV2(format, resultBytes);
            NativePartPreservationMap.Assessment preservation = documents.assessNativePreservation(
                    format,
                    sourceBytes,
                    resultBytes,
                    plan.operation().expectedChangedNativeParts());
            if (!preservation.pass()) {
                throw new IllegalStateException("resumed candidate no longer satisfies preservation assessment");
            }
            recordActionStagesAfter(job, actionStage, sourceGraph.sourceSha256(), plan.digest());
            return new EffectResult(resultBytes, resultGraph, preservation, resultSha);
        }

        SemanticCdg2NativeAdapter adapter = new SemanticCdg2NativeAdapter(format);
        GovernedCdg2MutationCoordinator.OperationResult mutation;
        try {
            mutation = mutationCoordinator.executeOperation(
                    adapter,
                    plan.operation(),
                    sourceBytes,
                    sourceGraph,
                    plan.targetedElementIds(),
                    List.of(),
                    ENGINE_ID);
        } catch (Exception exception) {
            failStage(
                    job,
                    actionStage,
                    sourceGraph.sourceSha256(),
                    sourceGraph.sourceSha256(),
                    key,
                    List.of(
                            "mutation-engine=" + ENGINE_ID,
                            "operation-intent=" + plan.operation().intentDigest()),
                    List.of(
                            "MUTATION_ABORTED_BEFORE_CANDIDATE",
                            exception.getClass().getName() + ":" + Objects.requireNonNullElse(exception.getMessage(), "")));
            throw exception;
        }
        if (!mutation.preservation().pass()) {
            failStage(
                    job,
                    actionStage,
                    sourceGraph.sourceSha256(),
                    mutation.mutation().resultSha256(),
                    key,
                    mutation.mutation().diagnostics(),
                    mutation.preservation().diagnostics());
            throw new IllegalStateException("native preservation failed");
        }
        ArtifactIntakeRequest candidateRequest = new ArtifactIntakeRequest(
                "spine-candidate-" + job.jobId(),
                job.resultArtifactId() + "#candidate",
                ENGINE_ID,
                format.mediaType(),
                mutation.mutation().resultSha256(),
                (long) mutation.mutation().resultBytes().length,
                List.of(job.sourceArtifactId()),
                List.of("project:" + job.projectId(), "job:" + job.jobId(), "operation:" + plan.operation().intentDigest()),
                Instant.now(clock));
        ArtifactIntakeReceipt candidateReceipt = gateway.ingest(
                candidateRequest,
                new java.io.ByteArrayInputStream(mutation.mutation().resultBytes()));
        if (!"VERIFIED".equals(candidateReceipt.disposition())) {
            failStage(
                    job,
                    actionStage,
                    sourceGraph.sourceSha256(),
                    candidateReceipt.digest(),
                    key,
                    List.of("candidate-intake=" + candidateReceipt.intakeId()),
                    List.of(candidateReceipt.reason()));
            throw new SecurityException("candidate artifact failed governed intake");
        }
        passStage(
                job,
                actionStage,
                sourceGraph.sourceSha256(),
                candidateReceipt.digest(),
                key,
                List.of(
                        "candidate-intake=" + candidateReceipt.intakeId(),
                        "operation-intent=" + plan.operation().intentDigest(),
                        "result-semantic=" + mutation.resultGraph().semanticDigest(),
                        "changed-native-parts=" + mutation.preservation().changedParts(),
                        "mutation-engine=" + ENGINE_ID),
                concatDiagnostics(mutation.mutation().diagnostics(), mutation.preservation().diagnostics()));
        recordActionStagesAfter(job, actionStage, sourceGraph.sourceSha256(), plan.digest());
        return new EffectResult(
                mutation.mutation().resultBytes(),
                mutation.resultGraph(),
                mutation.preservation(),
                candidateReceipt.digest());
    }

    private void collectRender(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            byte[] resultBytes,
            List<DocumentProofReceipt> receipts) throws Exception {
        DocumentOperationContract operation = plan.operation();
        if (!operation.requiredProofGates().contains(DocumentProofReceipt.Gate.RENDERED)) {
            notRequired(job, DocumentSpineStage.RENDER, operation.sourceArtifactSha256(), DocumentSpineDigests.sha256(resultBytes), plan.digest(), "render-proof-not-required");
            return;
        }
        String resultSha = DocumentSpineDigests.sha256(resultBytes);
        String key = stageKey(job, DocumentSpineStage.RENDER, resultSha, resultSha, plan.digest() + "|" + proofs.identity());
        Optional<DocumentProofReceipt> resumed = resumedProof(job, DocumentSpineStage.RENDER, key);
        if (resumed.isPresent()) {
            receipts.add(resumed.get());
            return;
        }
        Optional<DocumentProofReceipt> proof = proofs.render(job, operation, format, resultBytes);
        if (proof.isEmpty()) {
            failStage(
                    job,
                    DocumentSpineStage.RENDER,
                    resultSha,
                    resultSha,
                    key,
                    List.of("proof-service=" + proofs.identity()),
                    List.of("RENDER_PROOF_REQUIRED_BUT_RENDERER_UNAVAILABLE"));
            throw new IllegalStateException("render proof required but unavailable");
        }
        requirePassingProof(job, DocumentSpineStage.RENDER, key, proof.get());
        receipts.add(proof.get());
    }

    private void collectSemanticComparison(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            byte[] sourceBytes,
            EffectResult effect,
            List<DocumentProofReceipt> receipts) throws Exception {
        String key = stageKey(job, DocumentSpineStage.COMPARE, effect.resultSha256(), effect.resultSha256(), plan.digest());
        Optional<DocumentProofReceipt> resumed = resumedProof(job, DocumentSpineStage.COMPARE, key);
        if (resumed.isPresent()) {
            receipts.add(resumed.get());
            return;
        }
        DocumentProofReceipt proof = proofs.semanticProof(
                plan.operation(),
                format,
                sourceBytes,
                effect.resultBytes(),
                effect.resultGraph());
        requirePassingProof(job, DocumentSpineStage.COMPARE, key, proof);
        receipts.add(proof);
    }

    private void collectPackageValidation(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            EffectResult effect,
            List<DocumentProofReceipt> receipts) throws Exception {
        String key = stageKey(job, DocumentSpineStage.VALIDATE, effect.resultSha256(), effect.resultSha256(), plan.digest());
        Optional<DocumentProofReceipt> resumed = resumedProof(job, DocumentSpineStage.VALIDATE, key);
        if (resumed.isPresent()) {
            receipts.add(resumed.get());
            return;
        }
        DocumentProofReceipt proof = proofs.packageProof(
                plan.operation(),
                format,
                effect.resultBytes(),
                effect.resultGraph(),
                effect.preservation());
        requirePassingProof(job, DocumentSpineStage.VALIDATE, key, proof);
        receipts.add(proof);
    }

    private void collectAccessibility(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            EffectResult effect,
            List<DocumentProofReceipt> receipts) throws Exception {
        DocumentOperationContract operation = plan.operation();
        String resultSha = effect.resultSha256();
        String key = stageKey(job, DocumentSpineStage.ACCESSIBILITY, resultSha, resultSha, plan.digest() + "|" + proofs.identity());
        if (!operation.requiredProofGates().contains(DocumentProofReceipt.Gate.ACCESSIBILITY)) {
            notRequired(job, DocumentSpineStage.ACCESSIBILITY, resultSha, resultSha, plan.digest(), "accessibility-proof-not-required-for-publication-class");
            return;
        }
        Optional<DocumentProofReceipt> resumed = resumedProof(job, DocumentSpineStage.ACCESSIBILITY, key);
        if (resumed.isPresent()) {
            receipts.add(resumed.get());
            return;
        }
        DocumentProofReceipt proof = proofs.accessibilityProof(
                operation,
                format,
                effect.resultBytes(),
                effect.resultGraph());
        requirePassingProof(job, DocumentSpineStage.ACCESSIBILITY, key, proof);
        receipts.add(proof);
    }

    private void collectSecurityProof(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            EffectResult effect,
            List<DocumentProofReceipt> receipts) throws Exception {
        String key = stageKey(job, DocumentSpineStage.SECURITY_PROOF, effect.resultSha256(), effect.resultSha256(), plan.digest());
        Optional<DocumentProofReceipt> resumed = resumedProof(job, DocumentSpineStage.SECURITY_PROOF, key);
        if (resumed.isPresent()) {
            receipts.add(resumed.get());
            return;
        }
        DocumentProofReceipt proof = proofs.securityProof(
                plan.operation(),
                format,
                effect.resultBytes(),
                effect.resultGraph());
        requirePassingProof(job, DocumentSpineStage.SECURITY_PROOF, key, proof);
        receipts.add(proof);
    }

    private DocumentFinalizationGate.Result prove(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            EffectResult effect,
            List<DocumentProofReceipt> receipts) throws Exception {
        String key = stageKey(job, DocumentSpineStage.PROVE, effect.resultSha256(), effect.resultSha256(), plan.digest() + "|" + proofs.identity());
        DocumentProofReceipt provenance = proofs.provenanceProof(
                job,
                plan,
                plan.operation(),
                ENGINE_ID,
                effect.resultGraph());
        receipts.add(provenance);
        DocumentFinalizationGate.Result finalization = finalizationGate.evaluate(
                plan.operation(),
                effect.resultBytes(),
                effect.preservation(),
                receipts,
                ENGINE_ID);
        if (provenance.status() != DocumentProofReceipt.Status.PASS
                || finalization.state() == FinalDocumentProofPolicy.State.PROOF_FAILED
                || !finalization.missing().isEmpty()) {
            failStage(
                    job,
                    DocumentSpineStage.PROVE,
                    effect.resultSha256(),
                    effect.resultSha256(),
                    key,
                    List.of("proof-state=" + finalization.state(), "missing=" + finalization.missing()),
                    finalization.diagnostics());
            throw new IllegalStateException("required proof gates did not pass: " + finalization.diagnostics());
        }
        if (job.publicationClass() == DocumentSpinePublicationClass.FINAL && !finalization.finalPromotionAllowed()) {
            failStage(
                    job,
                    DocumentSpineStage.PROVE,
                    effect.resultSha256(),
                    effect.resultSha256(),
                    key,
                    List.of("proof-state=" + finalization.state()),
                    List.of("FINAL_PUBLICATION_REQUIRES_FINAL_PROOFED"));
            throw new IllegalStateException("final publication requires FINAL_PROOFED");
        }
        passStageIfNeeded(
                job,
                DocumentSpineStage.PROVE,
                effect.resultSha256(),
                effect.resultSha256(),
                key,
                List.of(
                        "proof-state=" + finalization.state(),
                        "passed-gates=" + finalization.passed(),
                        "operation-intent=" + finalization.operationIntentDigest(),
                        "PROOF=" + DocumentSpineProofService.serialize(provenance)),
                finalization.diagnostics());
        return finalization;
    }

    private DocumentSpineVersionReceipt version(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            String sourceSha,
            EffectResult effect,
            DocumentFinalizationGate.Result finalization,
            List<DocumentProofReceipt> receipts) throws Exception {
        String key = stageKey(job, DocumentSpineStage.VERSION, effect.resultSha256(), effect.resultSha256(), plan.digest());
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), DocumentSpineStage.VERSION);
        if (prior.isPresent() && prior.get().resumable(key)) {
            return versions.byJobId(job.jobId())
                    .orElseThrow(() -> new IllegalStateException("version stage receipt exists without durable version ledger entry"));
        }
        String versionMaterial = String.join("|",
                job.projectId(),
                job.jobId(),
                job.sourceArtifactId(),
                job.resultArtifactId(),
                sourceSha,
                effect.resultSha256(),
                plan.operation().intentDigest());
        String versionId = "spv-" + DocumentSpineDigests.sha256(versionMaterial.getBytes(StandardCharsets.UTF_8)).substring(0, 24);
        List<String> evidence = receipts.stream()
                .map(receipt -> receipt.gate() + ":" + receipt.status() + ":" + receipt.engine())
                .toList();
        DocumentSpineVersionReceipt version = new DocumentSpineVersionReceipt(
                versionId,
                job.jobId(),
                job.projectId(),
                job.sourceArtifactId(),
                job.resultArtifactId(),
                format,
                sourceSha,
                effect.resultSha256(),
                plan.operation().intentDigest(),
                finalization.state(),
                plan.capabilityIds().stream().sorted().toList(),
                evidence,
                Instant.now(clock));
        DocumentSpineVersionReceipt committed = versions.commit(version);
        passStage(
                job,
                DocumentSpineStage.VERSION,
                effect.resultSha256(),
                effect.resultSha256(),
                key,
                List.of("version-id=" + committed.versionId(), "proof-state=" + committed.proofState()),
                List.of());
        return committed;
    }

    private DocumentSpinePublicationReceipt publish(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat format,
            EffectResult effect,
            DocumentFinalizationGate.Result finalization,
            DocumentSpineVersionReceipt version) throws Exception {
        if (job.publicationClass() == DocumentSpinePublicationClass.NONE) {
            notRequired(job, DocumentSpineStage.PUBLISH, effect.resultSha256(), effect.resultSha256(), plan.digest(), "publication-class-none");
            return null;
        }
        boolean allowed = switch (job.publicationClass()) {
            case NONE -> false;
            case VERIFIED_DRAFT -> finalization.state() != FinalDocumentProofPolicy.State.PROOF_FAILED
                    && finalization.missing().isEmpty();
            case FINAL -> finalization.finalPromotionAllowed();
        };
        if (!allowed) {
            throw new IllegalStateException("publication class proof requirements are not satisfied");
        }
        String key = stageKey(job, DocumentSpineStage.PUBLISH, effect.resultSha256(), effect.resultSha256(), plan.digest() + "|" + version.versionId());
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), DocumentSpineStage.PUBLISH);
        if (prior.isPresent() && prior.get().resumable(key)) {
            return new DocumentSpinePublicationReceipt(
                    job.jobId(),
                    job.resultArtifactId(),
                    effect.resultSha256(),
                    job.publicationClass(),
                    finalization.state(),
                    version.versionId(),
                    prior.get().evidence(),
                    prior.get().completedAt());
        }
        ArtifactIntakeRequest publishRequest = new ArtifactIntakeRequest(
                "spine-publish-" + job.jobId(),
                job.resultArtifactId(),
                ENGINE_ID,
                format.mediaType(),
                effect.resultSha256(),
                (long) effect.resultBytes().length,
                List.of(job.sourceArtifactId()),
                List.of(
                        "project:" + job.projectId(),
                        "job:" + job.jobId(),
                        "version:" + version.versionId(),
                        "operation:" + plan.operation().intentDigest()),
                Instant.now(clock));
        ArtifactIntakeReceipt published = gateway.ingest(
                publishRequest,
                new java.io.ByteArrayInputStream(effect.resultBytes()));
        if (!"VERIFIED".equals(published.disposition())) {
            failStage(
                    job,
                    DocumentSpineStage.PUBLISH,
                    effect.resultSha256(),
                    published.digest(),
                    key,
                    List.of("publish-intake=" + published.intakeId()),
                    List.of(published.reason()));
            throw new SecurityException("publication intake failed");
        }
        List<String> evidence = List.of(
                "publish-intake=" + published.intakeId(),
                "artifact-id=" + job.resultArtifactId(),
                "version-id=" + version.versionId(),
                "publication-class=" + job.publicationClass(),
                "proof-state=" + finalization.state());
        passStage(
                job,
                DocumentSpineStage.PUBLISH,
                effect.resultSha256(),
                published.digest(),
                key,
                evidence,
                List.of());
        return new DocumentSpinePublicationReceipt(
                job.jobId(),
                job.resultArtifactId(),
                published.digest(),
                job.publicationClass(),
                finalization.state(),
                version.versionId(),
                evidence,
                Instant.now(clock));
    }

    private void completeReadOnlyStages(DocumentSpineJob job, String sourceSha, String planDigest) throws Exception {
        notRequired(job, DocumentSpineStage.REBUILD, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.MASTER, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.CREATE, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.RENDER, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.COMPARE, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.VALIDATE, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.ACCESSIBILITY, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.SECURITY_PROOF, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.PROVE, sourceSha, sourceSha, planDigest, "read-only-mode");
        notRequired(job, DocumentSpineStage.VERSION, sourceSha, sourceSha, planDigest, "no-derived-version");
        notRequired(job, DocumentSpineStage.PUBLISH, sourceSha, sourceSha, planDigest, "no-derived-publication");
    }

    private void recordActionStagesBefore(
            DocumentSpineJob job,
            DocumentSpineStage active,
            String sourceSha,
            String planDigest) throws Exception {
        for (DocumentSpineStage stage : List.of(DocumentSpineStage.REBUILD, DocumentSpineStage.MASTER, DocumentSpineStage.CREATE)) {
            if (stage.order() >= active.order()) {
                return;
            }
            notRequired(job, stage, sourceSha, sourceSha, planDigest, "mode=" + job.mode());
        }
    }

    private void recordActionStagesAfter(
            DocumentSpineJob job,
            DocumentSpineStage active,
            String sourceSha,
            String planDigest) throws Exception {
        for (DocumentSpineStage stage : List.of(DocumentSpineStage.REBUILD, DocumentSpineStage.MASTER, DocumentSpineStage.CREATE)) {
            if (stage.order() > active.order()) {
                notRequired(job, stage, sourceSha, sourceSha, planDigest, "mode=" + job.mode());
            }
        }
    }

    private Optional<DocumentProofReceipt> resumedProof(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String key) throws Exception {
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), stage);
        if (prior.isEmpty() || !prior.get().resumable(key)) {
            return Optional.empty();
        }
        for (String evidence : prior.get().evidence()) {
            if (evidence.startsWith("PROOF=")) {
                return Optional.of(DocumentSpineProofService.deserialize(evidence.substring("PROOF=".length())));
            }
        }
        throw new IllegalStateException("resumable proof stage lacks serialized proof receipt: " + stage);
    }

    private void requirePassingProof(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String key,
            DocumentProofReceipt proof) throws Exception {
        if (proof.status() != DocumentProofReceipt.Status.PASS) {
            failStage(
                    job,
                    stage,
                    proof.resultSha256(),
                    proof.resultSha256(),
                    key,
                    List.of("PROOF=" + DocumentSpineProofService.serialize(proof)),
                    proof.evidence());
            throw new IllegalStateException(stage + " proof failed");
        }
        passStage(
                job,
                stage,
                proof.resultSha256(),
                proof.resultSha256(),
                key,
                List.of("PROOF=" + DocumentSpineProofService.serialize(proof)),
                List.of());
    }

    private void notRequired(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String inputSha,
            String outputSha,
            String material,
            String reason) throws Exception {
        String key = stageKey(job, stage, inputSha, outputSha, material);
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), stage);
        if (prior.isPresent()
                && prior.get().status() == DocumentSpineStageReceipt.Status.NOT_REQUIRED
                && prior.get().idempotencyKey().equals(key)) {
            return;
        }
        checkpoints.record(new DocumentSpineStageReceipt(
                DocumentSpineStageReceipt.SCHEMA_V1,
                job.jobId(),
                stage,
                DocumentSpineStageReceipt.Status.NOT_REQUIRED,
                inputSha,
                outputSha,
                key,
                Instant.now(clock),
                List.of(reason),
                List.of()));
    }

    private static List<String> concatDiagnostics(List<String> first, List<String> second) {
        ArrayList<String> combined = new ArrayList<>();
        combined.addAll(first);
        combined.addAll(second);
        return List.copyOf(combined);
    }

    private void passStageIfNeeded(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String inputSha,
            String outputSha,
            String key,
            List<String> evidence,
            List<String> diagnostics) throws Exception {
        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), stage);
        if (prior.isPresent() && prior.get().resumable(key)) {
            return;
        }
        passStage(job, stage, inputSha, outputSha, key, evidence, diagnostics);
    }

    private void passStage(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String inputSha,
            String outputSha,
            String key,
            List<String> evidence,
            List<String> diagnostics) throws Exception {
        checkpoints.record(new DocumentSpineStageReceipt(
                DocumentSpineStageReceipt.SCHEMA_V1,
                job.jobId(),
                stage,
                DocumentSpineStageReceipt.Status.PASS,
                inputSha,
                outputSha,
                key,
                Instant.now(clock),
                evidence,
                diagnostics));
    }

    private void failStage(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String inputSha,
            String outputSha,
            String key,
            List<String> evidence,
            List<String> diagnostics) throws Exception {
        checkpoints.record(new DocumentSpineStageReceipt(
                DocumentSpineStageReceipt.SCHEMA_V1,
                job.jobId(),
                stage,
                DocumentSpineStageReceipt.Status.FAIL,
                inputSha,
                outputSha,
                key,
                Instant.now(clock),
                evidence,
                diagnostics));
    }

    private static void validateJobAndPlan(DocumentSpineJob job, DocumentSpineExecutionPlan plan) {
        if (!job.jobId().equals(plan.jobId())) {
            throw new IllegalArgumentException("jobId mismatch");
        }
        if (job.mode() != plan.mode()) {
            throw new IllegalArgumentException("job mode mismatch");
        }
        if (!job.capabilityIds().containsAll(plan.capabilityIds())) {
            throw new IllegalArgumentException("job must bind every plan capability");
        }
        if (job.publicationClass() == DocumentSpinePublicationClass.FINAL
                && plan.operation() != null
                && !plan.operation().finalCandidate()) {
            throw new IllegalArgumentException("FINAL publication requires finalCandidate operation");
        }
    }

    private static String stageKey(
            DocumentSpineJob job,
            DocumentSpineStage stage,
            String inputSha,
            String outputSha,
            String material) {
        String value = job.identityMaterial()
                + "|stage=" + stage
                + "|input=" + Objects.requireNonNullElse(inputSha, "-")
                + "|output=" + Objects.requireNonNullElse(outputSha, "-")
                + "|material=" + Objects.requireNonNullElse(material, "-");
        return DocumentSpineDigests.sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String requireOutputDigest(DocumentSpineStageReceipt receipt, DocumentSpineStage stage) {
        if (receipt.outputSha256() == null) {
            throw new IllegalStateException("resumable " + stage + " receipt lacks output digest");
        }
        return receipt.outputSha256();
    }

    private record EffectResult(
            byte[] resultBytes,
            CanonicalDocumentGraphV2 resultGraph,
            NativePartPreservationMap.Assessment preservation,
            String resultSha256) {
        EffectResult {
            resultBytes = resultBytes.clone();
            Objects.requireNonNull(resultGraph, "resultGraph");
            Objects.requireNonNull(preservation, "preservation");
            if (resultSha256 == null || !resultSha256.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("result sha256 required");
            }
        }

        @Override
        public byte[] resultBytes() {
            return resultBytes.clone();
        }
    }
}
