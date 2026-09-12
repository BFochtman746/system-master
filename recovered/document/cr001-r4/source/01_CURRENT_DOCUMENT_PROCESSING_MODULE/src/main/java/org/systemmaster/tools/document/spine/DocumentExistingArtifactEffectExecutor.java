package org.systemmaster.tools.document.spine;

import org.systemmaster.core.ArtifactIntakeReceipt;
import org.systemmaster.core.ArtifactIntakeRequest;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.tools.document.CanonicalDocumentGraphV2;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentOperationContract;
import org.systemmaster.tools.document.DocumentProcessingService;
import org.systemmaster.tools.document.GovernedCdg2MutationCoordinator;
import org.systemmaster.tools.document.NativePartPreservationMap;
import org.systemmaster.tools.document.SemanticCdg2NativeAdapter;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Shared effect executor for existing-artifact REBUILD and MASTER.
 *
 * The executor consumes a separately owned effect-admission receipt, performs deterministic Documents-owned
 * mutation/preservation work, records the expected candidate digest durably before persistence, and persists
 * the candidate before any proof/version/publication stage. A PREPARED checkpoint is never blindly replayed:
 * restart first reconciles the expected digest against the governed artifact store and either resumes the
 * already-persisted candidate or fails closed for explicit reconciliation.
 */
public final class DocumentExistingArtifactEffectExecutor {
    public static final String ENGINE_ID = "SemanticCdg2NativeAdapter/DOCUMENT-SPINE-EFFECT-1";

    public record Outcome(
            byte[] resultBytes,
            CanonicalDocumentGraphV2 resultGraph,
            NativePartPreservationMap.Assessment preservation,
            String resultSha256,
            DocumentExistingArtifactEffectReceipt receipt) {
        public Outcome {
            resultBytes = Objects.requireNonNull(resultBytes, "resultBytes").clone();
            Objects.requireNonNull(resultGraph, "resultGraph");
            Objects.requireNonNull(preservation, "preservation");
            requireSha(resultSha256, "resultSha256");
            Objects.requireNonNull(receipt, "receipt");
            if (!resultSha256.equals(receipt.candidateArtifactSha256())) {
                throw new IllegalArgumentException("effect outcome/receipt candidate mismatch");
            }
        }

        @Override
        public byte[] resultBytes() {
            return resultBytes.clone();
        }
    }

    private final GovernedArtifactGateway gateway;
    private final DocumentSpineCheckpointStore checkpoints;
    private final DocumentEffectAdmissionProvider admissionProvider;
    private final Clock clock;
    private final DocumentProcessingService documents = new DocumentProcessingService();
    private final GovernedCdg2MutationCoordinator coordinator = new GovernedCdg2MutationCoordinator();

    public DocumentExistingArtifactEffectExecutor(
            GovernedArtifactGateway gateway,
            DocumentSpineCheckpointStore checkpoints,
            DocumentEffectAdmissionProvider admissionProvider,
            Clock clock) {
        this.gateway = Objects.requireNonNull(gateway, "gateway");
        this.checkpoints = Objects.requireNonNull(checkpoints, "checkpoints");
        this.admissionProvider = Objects.requireNonNull(admissionProvider, "admissionProvider");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Outcome executeOrResume(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentSpineStage actionStage,
            String idempotencyKey) throws Exception {
        validate(job, plan, sourceFormat, sourceBytes, sourceGraph, actionStage, idempotencyKey);

        Optional<DocumentSpineStageReceipt> prior = checkpoints.latest(job.jobId(), actionStage);
        if (prior.isPresent() && prior.get().resumable(idempotencyKey)) {
            return resumePersisted(job, plan, sourceFormat, sourceBytes, sourceGraph, prior.get());
        }
        if (prior.isPresent() && prior.get().prepared(idempotencyKey)) {
            return resumePrepared(job, plan, sourceFormat, sourceBytes, sourceGraph, actionStage, idempotencyKey, prior.get());
        }
        if (prior.isPresent()
                && (prior.get().status() == DocumentSpineStageReceipt.Status.PASS
                || prior.get().status() == DocumentSpineStageReceipt.Status.PREPARED)
                && !prior.get().idempotencyKey().equals(idempotencyKey)) {
            throw new IllegalStateException("existing effect checkpoint is bound to a different idempotency key");
        }

        DocumentEffectAdmissionDecision admission;
        try {
            admission = admissionProvider.decide(job, plan, sourceGraph);
            Objects.requireNonNull(admission, "effect admission decision");
            admission.requireAllows(job, plan, sourceGraph);
        } catch (Exception exception) {
            recordFailure(
                    job,
                    actionStage,
                    sourceGraph.sourceSha256(),
                    sourceGraph.sourceSha256(),
                    idempotencyKey,
                    List.of("effect-admission-provider=" + admissionProvider.identity()),
                    List.of("EFFECT_ADMISSION_REJECTED", describe(exception)));
            throw exception;
        }

        GovernedCdg2MutationCoordinator.OperationResult mutation;
        try {
            mutation = coordinator.executeOperation(
                    new SemanticCdg2NativeAdapter(sourceFormat),
                    plan.operation(),
                    sourceBytes,
                    sourceGraph,
                    plan.targetedElementIds(),
                    List.of(),
                    ENGINE_ID);
        } catch (Exception exception) {
            recordFailure(
                    job,
                    actionStage,
                    sourceGraph.sourceSha256(),
                    sourceGraph.sourceSha256(),
                    idempotencyKey,
                    List.of(
                            "effect-admission-decision=" + admission.decisionId(),
                            "effect-policy-digest=" + admission.policyDigestSha256(),
                            "operation-intent=" + plan.operation().intentDigest()),
                    List.of("MUTATION_ABORTED_BEFORE_CANDIDATE", describe(exception)));
            throw exception;
        }
        if (!mutation.preservation().pass()) {
            recordFailure(
                    job,
                    actionStage,
                    sourceGraph.sourceSha256(),
                    mutation.mutation().resultSha256(),
                    idempotencyKey,
                    List.of("effect-admission-decision=" + admission.decisionId()),
                    mutation.preservation().diagnostics());
            throw new IllegalStateException("native preservation failed");
        }

        String candidateSha = mutation.mutation().resultSha256();
        List<String> preparedEvidence = preparationEvidence(job, plan, sourceFormat, mutation, admission);
        checkpoints.record(new DocumentSpineStageReceipt(
                DocumentSpineStageReceipt.SCHEMA_V1,
                job.jobId(),
                actionStage,
                DocumentSpineStageReceipt.Status.PREPARED,
                sourceGraph.sourceSha256(),
                candidateSha,
                idempotencyKey,
                Instant.now(clock),
                preparedEvidence,
                List.of("CANDIDATE_DIGEST_PREPARED__PERSISTENCE_RECONCILIATION_REQUIRED_UNTIL_PASS")));

        ArtifactIntakeReceipt candidate = gateway.ingest(
                new ArtifactIntakeRequest(
                        "spine-candidate-" + job.jobId(),
                        job.resultArtifactId() + "#candidate",
                        ENGINE_ID,
                        sourceFormat.mediaType(),
                        candidateSha,
                        (long) mutation.mutation().resultBytes().length,
                        List.of(job.sourceArtifactId()),
                        List.of(
                                "project:" + job.projectId(),
                                "job:" + job.jobId(),
                                "mode:" + job.mode(),
                                "operation:" + plan.operation().intentDigest(),
                                "effect-admission:" + admission.decisionId()),
                        Instant.now(clock)),
                new ByteArrayInputStream(mutation.mutation().resultBytes()));
        if (!"VERIFIED".equals(candidate.disposition()) || !candidateSha.equals(candidate.digest())) {
            throw new SecurityException("candidate artifact failed governed persistence: " + candidate.reason());
        }

        DocumentExistingArtifactEffectReceipt receipt = effectReceipt(
                job,
                plan,
                sourceFormat,
                sourceGraph,
                mutation.resultGraph(),
                admission.decisionId(),
                admission.policyRevision(),
                admission.policyDigestSha256(),
                admission.capabilitySetSha256(),
                candidateSha,
                false);
        ArrayList<String> evidence = new ArrayList<>(receipt.evidence());
        evidence.add("candidate-intake=" + candidate.intakeId());
        evidence.add("changed-native-parts=" + mutation.preservation().changedParts());
        checkpoints.record(new DocumentSpineStageReceipt(
                DocumentSpineStageReceipt.SCHEMA_V1,
                job.jobId(),
                actionStage,
                DocumentSpineStageReceipt.Status.PASS,
                sourceGraph.sourceSha256(),
                candidateSha,
                idempotencyKey,
                Instant.now(clock),
                evidence,
                concat(mutation.mutation().diagnostics(), mutation.preservation().diagnostics())));
        return new Outcome(
                mutation.mutation().resultBytes(),
                mutation.resultGraph(),
                mutation.preservation(),
                candidateSha,
                receipt);
    }

    private Outcome resumePrepared(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentSpineStage actionStage,
            String idempotencyKey,
            DocumentSpineStageReceipt prepared) throws Exception {
        String candidateSha = requireOutputDigest(prepared);
        byte[] candidateBytes;
        try {
            candidateBytes = gateway.readVerified(candidateSha, gateway.maxBytes());
        } catch (IOException missing) {
            throw new IllegalStateException(
                    "ambiguous prepared effect has no verified candidate; mutation replay forbidden", missing);
        }
        Outcome resumed = rebuildOutcomeFromEvidence(
                job,
                plan,
                sourceFormat,
                sourceBytes,
                sourceGraph,
                prepared,
                candidateBytes,
                true);
        checkpoints.record(new DocumentSpineStageReceipt(
                DocumentSpineStageReceipt.SCHEMA_V1,
                job.jobId(),
                actionStage,
                DocumentSpineStageReceipt.Status.PASS,
                sourceGraph.sourceSha256(),
                resumed.resultSha256(),
                idempotencyKey,
                Instant.now(clock),
                resumed.receipt().evidence(),
                List.of("RESUMED_FROM_PREPARED_CANDIDATE__MUTATION_NOT_REPLAYED")));
        return resumed;
    }

    private Outcome resumePersisted(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentSpineStageReceipt persisted) throws Exception {
        String candidateSha = requireOutputDigest(persisted);
        byte[] candidateBytes = gateway.readVerified(candidateSha, gateway.maxBytes());
        return rebuildOutcomeFromEvidence(
                job,
                plan,
                sourceFormat,
                sourceBytes,
                sourceGraph,
                persisted,
                candidateBytes,
                true);
    }

    private Outcome rebuildOutcomeFromEvidence(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentSpineStageReceipt stageReceipt,
            byte[] candidateBytes,
            boolean resumed) throws IOException {
        Map<String, String> evidence = evidenceMap(stageReceipt.evidence());
        String candidateSha = DocumentSpineDigests.sha256(candidateBytes);
        if (!candidateSha.equals(requireOutputDigest(stageReceipt))) {
            throw new IllegalStateException("resumed candidate digest mismatch");
        }
        CanonicalDocumentGraphV2 resultGraph = documents.projectCanonicalGraphV2(sourceFormat, candidateBytes);
        NativePartPreservationMap.Assessment preservation = documents.assessNativePreservation(
                sourceFormat,
                sourceBytes,
                candidateBytes,
                plan.operation().expectedChangedNativeParts());
        if (!preservation.pass()) {
            throw new IllegalStateException("resumed candidate no longer satisfies preservation assessment");
        }
        DocumentExistingArtifactEffectReceipt receipt = effectReceipt(
                job,
                plan,
                sourceFormat,
                sourceGraph,
                resultGraph,
                requireEvidence(evidence, "effect-admission-decision"),
                requireEvidence(evidence, "effect-policy-revision"),
                requireEvidence(evidence, "effect-policy-digest"),
                requireEvidence(evidence, "effect-capability-set-digest"),
                candidateSha,
                resumed);
        return new Outcome(candidateBytes, resultGraph, preservation, candidateSha, receipt);
    }

    private static DocumentExistingArtifactEffectReceipt effectReceipt(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            CanonicalDocumentGraphV2 sourceGraph,
            CanonicalDocumentGraphV2 resultGraph,
            String decisionId,
            String policyRevision,
            String policyDigest,
            String capabilityDigest,
            String candidateSha,
            boolean resumed) {
        DocumentOperationContract operation = Objects.requireNonNull(plan.operation(), "operation");
        String rollback = Objects.requireNonNull(operation.rollbackArtifactSha256(), "rollbackArtifactSha256");
        if (job.mode() == DocumentSpineMode.MASTER) {
            return new DocumentMasterReceipt(
                    DocumentMasterReceipt.SCHEMA_V1,
                    job.jobId(),
                    sourceGraph.sourceSha256(),
                    sourceGraph.semanticDigest(),
                    plan.digest(),
                    operation.intentDigest(),
                    decisionId,
                    policyRevision,
                    policyDigest,
                    capabilityDigest,
                    sourceFormat,
                    job.requestedTargetFormat(),
                    candidateSha,
                    resultGraph.semanticDigest(),
                    rollback,
                    ENGINE_ID,
                    resumed ? DocumentMasterReceipt.STATUS_RESUMED : DocumentMasterReceipt.STATUS_PERSISTED,
                    resumed);
        }
        return new DocumentRebuildReceipt(
                DocumentRebuildReceipt.SCHEMA_V1,
                job.jobId(),
                sourceGraph.sourceSha256(),
                sourceGraph.semanticDigest(),
                plan.digest(),
                operation.intentDigest(),
                decisionId,
                policyRevision,
                policyDigest,
                capabilityDigest,
                sourceFormat,
                job.requestedTargetFormat(),
                candidateSha,
                resultGraph.semanticDigest(),
                rollback,
                ENGINE_ID,
                resumed ? DocumentRebuildReceipt.STATUS_RESUMED : DocumentRebuildReceipt.STATUS_PERSISTED,
                resumed);
    }

    private static List<String> preparationEvidence(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            GovernedCdg2MutationCoordinator.OperationResult mutation,
            DocumentEffectAdmissionDecision admission) {
        return List.of(
                "effect-prepared=true",
                "effect-admission-decision=" + admission.decisionId(),
                "effect-policy-revision=" + admission.policyRevision(),
                "effect-policy-digest=" + admission.policyDigestSha256(),
                "effect-capability-set-digest=" + admission.capabilitySetSha256(),
                "effect-source-format=" + sourceFormat,
                "effect-target-format=" + job.requestedTargetFormat(),
                "effect-source-semantic=" + admission.sourceSemanticSha256(),
                "effect-plan-digest=" + plan.digest(),
                "effect-operation-intent=" + plan.operation().intentDigest(),
                "effect-candidate-digest=" + mutation.mutation().resultSha256(),
                "effect-candidate-semantic=" + mutation.resultGraph().semanticDigest(),
                "effect-rollback-digest=" + plan.operation().rollbackArtifactSha256(),
                "effect-mutation-engine=" + ENGINE_ID,
                "effect-authority-standing=TECHNICAL_CANDIDATE_ONLY__PERSISTENCE_NOT_YET_RECONCILED");
    }

    private static void validate(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentFormat sourceFormat,
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentSpineStage actionStage,
            String idempotencyKey) {
        Objects.requireNonNull(job, "job");
        Objects.requireNonNull(plan, "plan");
        Objects.requireNonNull(sourceFormat, "sourceFormat");
        Objects.requireNonNull(sourceBytes, "sourceBytes");
        Objects.requireNonNull(sourceGraph, "sourceGraph");
        requireSha(idempotencyKey, "idempotencyKey");
        if (job.mode() != DocumentSpineMode.MASTER && job.mode() != DocumentSpineMode.REBUILD) {
            throw new IllegalArgumentException("shared effect executor accepts MASTER or REBUILD only");
        }
        DocumentSpineStage expected = job.mode() == DocumentSpineMode.MASTER
                ? DocumentSpineStage.MASTER
                : DocumentSpineStage.REBUILD;
        if (actionStage != expected || plan.mode() != job.mode() || !job.jobId().equals(plan.jobId())) {
            throw new IllegalArgumentException("effect job/plan/stage identity mismatch");
        }
        if (plan.operation() == null || plan.operation().risk() == DocumentOperationContract.Risk.READ_ONLY) {
            throw new IllegalArgumentException("effectful operation contract required");
        }
        String sourceSha = DocumentSpineDigests.sha256(sourceBytes);
        if (!sourceSha.equals(sourceGraph.sourceSha256())
                || !sourceSha.equals(plan.operation().sourceArtifactSha256())
                || !sourceGraph.semanticDigest().equals(plan.operation().sourceSemanticSha256())) {
            throw new IllegalArgumentException("effect source binding mismatch");
        }
        if (job.mode() == DocumentSpineMode.MASTER && job.requestedTargetFormat() != sourceFormat) {
            throw new IllegalArgumentException("MASTER is same-format only");
        }
        if (job.mode() == DocumentSpineMode.REBUILD && job.requestedTargetFormat() != sourceFormat) {
            throw new UnsupportedOperationException("cross-format REBUILD requires a dedicated qualified converter");
        }
        if (sourceGraph.sourceFormat() != sourceFormat) {
            throw new IllegalArgumentException("source graph format mismatch");
        }
    }

    private void recordFailure(
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

    private static Map<String, String> evidenceMap(List<String> values) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        for (String value : values) {
            int split = value.indexOf('=');
            if (split > 0) {
                out.put(value.substring(0, split), value.substring(split + 1));
            }
        }
        return Map.copyOf(out);
    }

    private static String requireEvidence(Map<String, String> evidence, String key) {
        String value = evidence.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("effect checkpoint lacks evidence: " + key);
        }
        return value;
    }

    private static String requireOutputDigest(DocumentSpineStageReceipt receipt) {
        String value = receipt.outputSha256();
        requireSha(value, "effect output");
        return value;
    }

    private static List<String> concat(List<String> first, List<String> second) {
        ArrayList<String> out = new ArrayList<>();
        out.addAll(first);
        out.addAll(second);
        return List.copyOf(out);
    }

    private static String describe(Exception exception) {
        return exception.getClass().getName() + ":" + Objects.requireNonNullElse(exception.getMessage(), "");
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(name + " sha256 required");
        }
    }
}
