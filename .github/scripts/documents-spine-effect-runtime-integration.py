#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("recovered/document/cr001-r4/source/01_CURRENT_DOCUMENT_PROCESSING_MODULE")
UNIVERSAL = ROOT / "src/main/java/org/systemmaster/tools/document/spine/UniversalDocumentSpine.java"
TEST = ROOT / "src/test/java/org/systemmaster/tools/document/DocumentSpine002APortableTests.java"

u = UNIVERSAL.read_text(encoding="utf-8")
t = TEST.read_text(encoding="utf-8")

u_marker = "DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001"
t_marker = "DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001_TEST"
if u_marker in u and t_marker in t:
    print("integration already applied")
    raise SystemExit(0)
if u_marker in u or t_marker in t:
    raise SystemExit("partial prior integration detected; refusing non-atomic repair")

# Remove the legacy inline effect implementation dependencies. Artifact intake imports remain
# because intake/publish stages continue to use the governed artifact gateway.
u = u.replace("import org.systemmaster.tools.document.GovernedCdg2MutationCoordinator;\n", "")
u = u.replace("import org.systemmaster.tools.document.SemanticCdg2NativeAdapter;\n", "")
u = u.replace('    private static final String ENGINE_ID = "SemanticCdg2NativeAdapter/DOCUMENT-SPINE-002A";\n\n', "")
u = u.replace("    private final GovernedCdg2MutationCoordinator mutationCoordinator = new GovernedCdg2MutationCoordinator();\n", "")

old_fields = """    private final DocumentSpineProofService proofs;\n    private final Clock clock;\n    private final DocumentProcessingService documents = new DocumentProcessingService();\n"""
new_fields = """    private final DocumentSpineProofService proofs;\n    private final Clock clock;\n    // DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001\n    // Null is permitted only so read-only routes retain the legacy five-argument construction surface.\n    // Every effectful route fails closed unless an explicit external admission provider was supplied.\n    private final DocumentExistingArtifactEffectExecutor effectExecutor;\n    private final DocumentProcessingService documents = new DocumentProcessingService();\n"""
if u.count(old_fields) != 1:
    raise SystemExit("unexpected UniversalDocumentSpine field shape")
u = u.replace(old_fields, new_fields)

old_ctor = """    public UniversalDocumentSpine(\n            GovernedArtifactGateway gateway,\n            DocumentSpineCheckpointStore checkpoints,\n            DocumentSpineVersionStore versions,\n            DocumentSpineProofService proofs,\n            Clock clock) {\n        this.gateway = Objects.requireNonNull(gateway, \"gateway\");\n        this.checkpoints = Objects.requireNonNull(checkpoints, \"checkpoints\");\n        this.versions = Objects.requireNonNull(versions, \"versions\");\n        this.proofs = Objects.requireNonNull(proofs, \"proofs\");\n        this.clock = Objects.requireNonNull(clock, \"clock\");\n    }\n"""
new_ctor = """    public UniversalDocumentSpine(\n            GovernedArtifactGateway gateway,\n            DocumentSpineCheckpointStore checkpoints,\n            DocumentSpineVersionStore versions,\n            DocumentSpineProofService proofs,\n            Clock clock) {\n        this(gateway, checkpoints, versions, proofs, clock, null);\n    }\n\n    public UniversalDocumentSpine(\n            GovernedArtifactGateway gateway,\n            DocumentSpineCheckpointStore checkpoints,\n            DocumentSpineVersionStore versions,\n            DocumentSpineProofService proofs,\n            Clock clock,\n            DocumentEffectAdmissionProvider effectAdmissionProvider) {\n        this.gateway = Objects.requireNonNull(gateway, \"gateway\");\n        this.checkpoints = Objects.requireNonNull(checkpoints, \"checkpoints\");\n        this.versions = Objects.requireNonNull(versions, \"versions\");\n        this.proofs = Objects.requireNonNull(proofs, \"proofs\");\n        this.clock = Objects.requireNonNull(clock, \"clock\");\n        this.effectExecutor = effectAdmissionProvider == null\n                ? null\n                : new DocumentExistingArtifactEffectExecutor(gateway, checkpoints, effectAdmissionProvider, clock);\n    }\n"""
if u.count(old_ctor) != 1:
    raise SystemExit("unexpected UniversalDocumentSpine constructor shape")
u = u.replace(old_ctor, new_ctor)

start = u.index("    private EffectResult mutateOrResume(")
end = u.index("    private void collectRender(", start)
new_mutate = """    private EffectResult mutateOrResume(\n            DocumentSpineJob job,\n            DocumentSpineExecutionPlan plan,\n            DocumentFormat format,\n            byte[] sourceBytes,\n            CanonicalDocumentGraphV2 sourceGraph) throws Exception {\n        DocumentSpineStage actionStage = job.mode() == DocumentSpineMode.REBUILD\n                ? DocumentSpineStage.REBUILD\n                : DocumentSpineStage.MASTER;\n        recordActionStagesBefore(job, actionStage, sourceGraph.sourceSha256(), plan.digest());\n        String key = stageKey(job, actionStage, sourceGraph.sourceSha256(), null, plan.digest());\n\n        if (effectExecutor == null) {\n            failStage(\n                    job,\n                    actionStage,\n                    sourceGraph.sourceSha256(),\n                    sourceGraph.sourceSha256(),\n                    key,\n                    List.of(\n                            \"effect-runtime=\" + DocumentExistingArtifactEffectExecutor.ENGINE_ID,\n                            \"effect-admission-provider=ABSENT\"),\n                    List.of(\"EFFECT_ADMISSION_PROVIDER_REQUIRED__EFFECTFUL_ROUTE_BLOCKED\"));\n            throw new SecurityException(\n                    \"effectful document execution requires explicit DocumentEffectAdmissionProvider\");\n        }\n\n        DocumentExistingArtifactEffectExecutor.Outcome outcome = effectExecutor.executeOrResume(\n                job,\n                plan,\n                format,\n                sourceBytes,\n                sourceGraph,\n                actionStage,\n                key);\n        recordActionStagesAfter(job, actionStage, sourceGraph.sourceSha256(), plan.digest());\n        return new EffectResult(\n                outcome.resultBytes(),\n                outcome.resultGraph(),\n                outcome.preservation(),\n                outcome.resultSha256());\n    }\n\n"""
u = u[:start] + new_mutate + u[end:]

# Test harness now supplies an explicit test-only admission decision for all effectful portable paths.
import_anchor = "import org.systemmaster.tools.document.spine.DocumentSpineCheckpointStore;\n"
imports = """import org.systemmaster.tools.document.spine.DocumentEffectAdmissionDecision;\nimport org.systemmaster.tools.document.spine.DocumentEffectAdmissionProvider;\n"""
if t.count(import_anchor) != 1:
    raise SystemExit("unexpected portable test import shape")
t = t.replace(import_anchor, imports + import_anchor)

main_anchor = """        testMaliciousIntakeFailsClosed();\n        testCreateRouteDoesNotInflateCompletion();\n"""
main_replacement = """        testMaliciousIntakeFailsClosed();\n        testEffectAdmissionBoundary();\n        testCreateRouteDoesNotInflateCompletion();\n"""
if t.count(main_anchor) != 1:
    raise SystemExit("unexpected portable test main shape")
t = t.replace(main_anchor, main_replacement)

test_anchor = "    private static void testCreateRouteDoesNotInflateCompletion() throws Exception {\n"
new_test = r'''    // DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001_TEST
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

'''
if t.count(test_anchor) != 1:
    raise SystemExit("unexpected portable test insertion point")
t = t.replace(test_anchor, new_test + test_anchor)

old_helper = """        DocumentSpineProofService proofs = new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK);\n        return new UniversalDocumentSpine(gateway, checkpoints, versions, proofs, CLOCK);\n    }\n\n    private static FileDocumentSpineCheckpointStore checkpointStore(Path root) throws Exception {\n"""
new_helper = """        DocumentSpineProofService proofs = new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK);\n        return new UniversalDocumentSpine(gateway, checkpoints, versions, proofs, CLOCK, effectAdmission());\n    }\n\n    private static DocumentEffectAdmissionProvider effectAdmission() {\n        return (job, plan, sourceGraph) -> new DocumentEffectAdmissionDecision(\n                DocumentEffectAdmissionDecision.SCHEMA_V1,\n                \"portable-explicit-\" + job.jobId(),\n                DocumentEffectAdmissionDecision.Disposition.ALLOW,\n                job.jobId(),\n                job.mode(),\n                sourceGraph.sourceSha256(),\n                sourceGraph.semanticDigest(),\n                plan.operation().intentDigest(),\n                plan.digest(),\n                DocumentEffectAdmissionDecision.capabilitySetDigest(plan),\n                \"portable-integration-r1\",\n                sha(\"portable-integration-policy-r1\".getBytes(StandardCharsets.UTF_8)),\n                \"TEST_ONLY_EXPLICIT_ALLOW\",\n                FIXED);\n    }\n\n    private static FileDocumentSpineCheckpointStore checkpointStore(Path root) throws Exception {\n"""
if t.count(old_helper) != 1:
    raise SystemExit("unexpected portable test spine helper shape")
t = t.replace(old_helper, new_helper)

UNIVERSAL.write_text(u, encoding="utf-8")
TEST.write_text(t, encoding="utf-8")
print("applied DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001 source + portable test patch")
