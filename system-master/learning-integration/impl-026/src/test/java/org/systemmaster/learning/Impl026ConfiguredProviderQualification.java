package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class Impl026ConfiguredProviderQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final String GOAL = "Use Python list and dictionary comprehensions to transform and filter data.";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl026-");
        String researchEndpoint = requiredEnv("SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT");
        String modelEndpoint = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT");
        String researchProviderId = requiredEnv("SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID");
        String modelProviderId = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID");
        String modelId = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_ID");
        String sampleCount = requiredEnv("SYSTEM_MASTER_LEARNING_SAMPLE_COUNT");
        String researchSecret = requiredEnv("SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN");
        String modelSecret = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN");

        Instant authorizedAt = Instant.parse("2026-09-08T14:20:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL026-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                12L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL026-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        AtomicReference<String> lastRequest = new AtomicReference<>();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter.BridgeInvoker countedInvoker = request -> {
            bridgeCalls.incrementAndGet();
            lastRequest.set(request);
            return realInvoker.invoke(request);
        };
        ConfiguredProviderLearningAdapter adapter = new ConfiguredProviderLearningAdapter(countedInvoker);

        var command = new ConfiguredProviderLearningAdapter.ConfiguredProviderCommand(
                "OP-JAVA-IMPL026-SELECT",
                "BATCH-JAVA-IMPL026-SELECT",
                "REQ-JAVA-IMPL026-SELECT",
                "impl026-select",
                "LRN-IMPL026",
                GOAL,
                Set.of(),
                0L);
        String commandJson = command.toJson();
        check(!commandJson.contains(researchEndpoint), "research endpoint must be absent from configured command");
        check(!commandJson.contains(modelEndpoint), "model endpoint must be absent from configured command");
        check(!commandJson.contains(researchProviderId), "research provider ID must be absent from configured command");
        check(!commandJson.contains(modelProviderId), "model provider ID must be absent from configured command");
        check(!commandJson.contains(modelId), "model ID must be absent from configured command");
        check(!commandJson.contains(sampleCount), "sample count configuration must be absent from configured command");
        check(!commandJson.contains(researchSecret), "research credential must be absent from configured command");
        check(!commandJson.contains(modelSecret), "model credential must be absent from configured command");
        check(!commandJson.contains("endpoint"), "configured command must expose no endpoint field");
        check(!commandJson.contains("model_id"), "configured command must expose no model ID field");
        check(!commandJson.contains("sample_count"), "configured command must expose no sample count field");

        expectSecurity(() -> adapter.execute(authorization, "WRONG_PRINCIPAL", useAt, command), "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == 0, "authorization denial must happen before configured bridge/provider execution");

        var first = adapter.execute(authorization, PRINCIPAL, useAt, command);
        check(first.responseJson().contains("\"status\":\"PASS\""), "configured provider path must pass");
        check(first.responseJson().contains("\"selection_decision\":\"SELECT\""), "configured provider path must select independently");
        check(first.responseJson().contains("\"journey_created\":true"), "configured provider selection must enter adaptive journey");
        check(first.responseJson().contains("\"configured_http_runtime_binding_version\":\"SYSTEM-MASTER-CONFIGURED-HTTP-PROVIDER-BINDING-V1\""),
                "configured System Master binding version must be explicit");
        check(first.responseJson().contains("\"production_provider_config_version\":\"LEARNING-PRODUCTION-PROVIDER-CONFIG-V1\""),
                "production provider config version must be explicit");
        check(first.responseJson().contains("\"production_provider_binding_version\":\"LEARNING-PRODUCTION-PROVIDER-BINDING-V1\""),
                "durable configuration binding version must be explicit");
        check(first.responseJson().contains("\"provider_mode\":\"QUALIFICATION_LOCAL\""), "qualification mode must be explicit");
        check(first.responseJson().contains("\"configured_research_provider_id\":\"" + researchProviderId + "\""),
                "configured research provider identity must be reported");
        check(first.responseJson().contains("\"configured_model_provider_id\":\"" + modelProviderId + "\""),
                "configured model provider identity must be reported");
        check(first.responseJson().contains("\"configured_model_id\":\"" + modelId + "\""),
                "configured model identity must be reported");
        check(first.responseJson().contains("\"configured_sample_count\":" + sampleCount),
                "configured sample count must be reported");
        check(first.responseJson().contains("\"model_ranking_used\":false"), "model ranking must remain unused");
        check(first.responseJson().contains("\"scalar_ranking_used\":false"), "scalar ranking must remain unused");
        check(LearningExecutionPort.PORT_VERSION.equals(first.executionPortVersion()), "execution port must remain V1");
        check(ConfiguredProviderLearningAdapter.ADAPTER_VERSION.equals(first.adapterVersion()), "configured adapter version must match");
        check(!first.responseJson().contains(researchSecret), "research secret must not appear in configured response");
        check(!first.responseJson().contains(modelSecret), "model secret must not appear in configured response");
        check(lastRequest.get() != null && lastRequest.get().equals(commandJson), "actual bridge request must equal the configuration-free command JSON");

        int beforeReplay = bridgeCalls.get();
        var replay = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(1), command);
        check(bridgeCalls.get() == beforeReplay + 1, "replay must cross the authorized bridge boundary");
        check(first.responseJson().equals(replay.responseJson()), "configured replay response must be byte stable");
        check(first.responseDigest().equals(replay.responseDigest()), "configured replay digest must be stable");

        LearningCapabilityAdapter legacyAdapter = new LearningCapabilityAdapter(realInvoker);
        var registered = new LearningCapabilityAdapter.LearningCommand(
                "REQ-JAVA-IMPL026-REGISTERED",
                "impl026-registered",
                "LRN-IMPL026",
                "fractions-unlike-denominators",
                Set.of("S-FRAC-ADD-SUB"),
                0L);
        var registeredResult = legacyAdapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(2), registered);
        check(registeredResult.responseJson().contains("\"skill_id\":\"S-FRAC-EQUIV-LCD\""),
                "existing registered-domain route must remain available beside configured provider adapter");

        System.out.println("IMPL026_STATUS=PASS");
        System.out.println("IMPL026_ASSERTIONS=" + assertions);
        System.out.println("IMPL026_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL026_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL026_ADAPTER_VERSION=" + ConfiguredProviderLearningAdapter.ADAPTER_VERSION);
        System.out.println("IMPL026_RUNTIME_CONFIG_FIELDS_IN_COMMAND=NONE");
        System.out.println("IMPL026_PROVIDER_MODE=QUALIFICATION_LOCAL");
        System.out.println("IMPL026_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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
