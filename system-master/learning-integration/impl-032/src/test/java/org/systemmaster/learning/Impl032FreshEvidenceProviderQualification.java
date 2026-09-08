package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class Impl032FreshEvidenceProviderQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Path.of(requiredEnv("SYSTEM_MASTER_LEARNING_STATE_ROOT")).toAbsolutePath().normalize();
        String courseId = requiredEnv("IMPL032_COURSE_ID");
        String modelEndpoint = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT");
        String modelProviderId = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID");
        String modelId = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_ID");
        String modelCredential = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN");

        Instant authorizedAt = Instant.parse("2026-09-08T20:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL032-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                32L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL032-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        AtomicReference<String> lastRequest = new AtomicReference<>();
        var realInvoker = new FreshEvidenceProviderLearningAdapter.PythonFreshEvidenceBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter.BridgeInvoker countedInvoker = request -> {
            bridgeCalls.incrementAndGet();
            lastRequest.set(request);
            return realInvoker.invoke(request);
        };
        var adapter = new FreshEvidenceProviderLearningAdapter(countedInvoker);
        var command = new FreshEvidenceProviderLearningAdapter.FreshEvidenceCommand(
                "OP-JAVA-IMPL032",
                "REQ-JAVA-IMPL032",
                "impl032-java",
                courseId,
                "maintenance",
                "S-FRAC-EQUIV-LCD",
                "C-FRAC-EQUIV-LCD",
                200000L,
                200001L);

        String commandJson = command.toJson();
        check(!commandJson.contains(modelEndpoint), "model endpoint must be absent from command");
        check(!commandJson.contains(modelProviderId), "provider ID must be absent from command");
        check(!commandJson.contains(modelId), "model ID must be absent from command");
        check(!commandJson.contains(modelCredential), "credential must be absent from command");
        check(!commandJson.contains("endpoint"), "command must expose no endpoint field");
        check(!commandJson.contains("model_id"), "command must expose no model ID field");
        check(!commandJson.contains("provider_id"), "command must expose no provider ID field");

        expectSecurity(() -> adapter.execute(authorization, "WRONG_PRINCIPAL", useAt, command), "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == 0, "authorization denial must happen before bridge/provider execution");

        var first = adapter.execute(authorization, PRINCIPAL, useAt, command);
        check(first.responseJson().contains("\"status\":\"PASS\""), "fresh evidence provider path must pass");
        check(first.responseJson().contains("\"capture_standing\":\"SEALED_PROVIDER_FRESH_EVIDENCE_CANDIDATE_UNVERIFIED\""),
                "provider capture must remain explicitly unverified");
        check(first.responseJson().contains("\"standing\":\"INDEPENDENT_ORACLE_VALIDATED_FRESH_EVIDENCE_TASK\""),
                "IMPL-031 admission standing must be present");
        check(first.responseJson().contains("\"configured_fresh_evidence_provider_version\":\"CONFIGURED-FRESH-EVIDENCE-PROVIDER-V1\""),
                "configured fresh evidence provider version must be explicit");
        check(first.responseJson().contains("\"credential_storage\":\"ENVIRONMENT_ONLY_NOT_PERSISTED\""),
                "credential storage boundary must be explicit");
        check(!first.responseJson().contains(modelCredential), "credential must not appear in response");
        check(LearningExecutionPort.PORT_VERSION.equals(first.executionPortVersion()), "execution port must remain V1");
        check(FreshEvidenceProviderLearningAdapter.ADAPTER_VERSION.equals(first.adapterVersion()), "adapter version must match");
        check(lastRequest.get() != null && lastRequest.get().equals(commandJson), "bridge request must equal command JSON");

        int beforeReplay = bridgeCalls.get();
        var replay = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(1), command);
        check(bridgeCalls.get() == beforeReplay + 1, "authorized replay must cross bridge boundary");
        check(first.responseJson().equals(replay.responseJson()), "replay response must be byte stable");
        check(first.responseDigest().equals(replay.responseDigest()), "replay digest must be stable");

        System.out.println("IMPL032_STATUS=PASS");
        System.out.println("IMPL032_ASSERTIONS=" + assertions);
        System.out.println("IMPL032_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL032_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL032_ADAPTER_VERSION=" + FreshEvidenceProviderLearningAdapter.ADAPTER_VERSION);
        System.out.println("IMPL032_RUNTIME_PROVIDER_CONFIG_FIELDS_IN_COMMAND=NONE");
        System.out.println("IMPL032_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
    }

    private static String requiredEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("REQUIRED_ENV:" + name);
        return value;
    }

    private static void expectSecurity(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected security denial containing " + expected);
        } catch (SecurityException failure) {
            check(failure.getMessage().contains(expected), "security denial must contain " + expected);
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
