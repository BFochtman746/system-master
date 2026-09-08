package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class Impl025FullHttpProviderIntegrationQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final String GOAL = "Use Python list and dictionary comprehensions to transform and filter data.";
    private static final String MODEL_ID = "LOCAL-FULL-HTTP-PROVIDER-IMPL024";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl025-");
        String researchEndpoint = requiredEnv("IMPL025_RESEARCH_ENDPOINT");
        String modelEndpoint = requiredEnv("IMPL025_MODEL_ENDPOINT");
        String researchSecret = requiredEnv("SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN");
        String modelSecret = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN");

        Instant authorizedAt = Instant.parse("2026-09-08T13:55:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL025-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                11L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL025-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        AtomicReference<String> lastRequest = new AtomicReference<>();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(request -> {
            bridgeCalls.incrementAndGet();
            lastRequest.set(request);
            return realInvoker.invoke(request);
        });

        var selectCommand = new LearningCapabilityAdapter.FullHttpProviderCommand(
                "OP-JAVA-IMPL025-SELECT",
                "BATCH-JAVA-IMPL025-SELECT",
                "REQ-JAVA-IMPL025-SELECT",
                "impl025-select",
                "LRN-IMPL025",
                GOAL,
                3,
                MODEL_ID,
                researchEndpoint,
                modelEndpoint,
                Set.of(),
                0L);

        check(!selectCommand.toJson().contains(researchSecret), "research credential must never enter command JSON");
        check(!selectCommand.toJson().contains(modelSecret), "model credential must never enter command JSON");
        check(!selectCommand.toJson().toLowerCase().contains("bearer"), "command JSON must have no bearer credential field");

        expectSecurity(
                () -> adapter.executeFullHttpProvider(authorization, "WRONG_PRINCIPAL", useAt, selectCommand),
                "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == 0, "authorization denial must happen before bridge/provider execution");

        var selected = adapter.executeFullHttpProvider(authorization, PRINCIPAL, useAt, selectCommand);
        check(selected.responseJson().contains("\"status\":\"PASS\""), "full HTTP provider path must pass");
        check(selected.responseJson().contains("\"selection_decision\":\"SELECT\""), "candidate selection must be explicit");
        check(selected.responseJson().contains("\"journey_created\":true"), "selected candidate must enter adaptive journey");
        check(selected.responseJson().contains("\"full_http_runtime_binding_version\":\"SYSTEM-MASTER-FULL-HTTP-PROVIDER-BINDING-V1\""),
                "System Master full HTTP binding version must be explicit");
        check(selected.responseJson().contains("\"http_research_provider_version\":\"HTTP-JSON-RESEARCH-PROVIDER-V1\""),
                "qualified HTTP research transport must be bound");
        check(selected.responseJson().contains("\"http_model_provider_version\":\"HTTP-JSON-MODEL-PROVIDER-V1\""),
                "qualified HTTP model transport must be bound");
        check(selected.responseJson().contains("\"model_ranking_used\":false"), "model ranking must remain unused");
        check(selected.responseJson().contains("\"scalar_ranking_used\":false"), "scalar ranking must remain unused");
        check(LearningExecutionPort.PORT_VERSION.equals(selected.executionPortVersion()), "stable execution port remains V1");
        check(LearningCapabilityAdapter.ADAPTER_VERSION.equals(selected.adapterVersion()), "adapter must bind V7 result");
        check(!selected.responseJson().contains(researchSecret), "research credential must not appear in bridge response");
        check(!selected.responseJson().contains(modelSecret), "model credential must not appear in bridge response");
        check(lastRequest.get() != null && !lastRequest.get().contains(researchSecret) && !lastRequest.get().contains(modelSecret),
                "actual Java bridge request must be credential-free");

        int callsBeforeReplay = bridgeCalls.get();
        var replay = adapter.executeFullHttpProvider(authorization, PRINCIPAL, useAt.plusSeconds(1), selectCommand);
        check(bridgeCalls.get() == callsBeforeReplay + 1, "replay must still cross the authorized Java bridge boundary");
        check(selected.responseJson().equals(replay.responseJson()), "full HTTP exact replay must be byte stable");
        check(selected.responseDigest().equals(replay.responseDigest()), "full HTTP replay digest must be stable");

        int callsBeforeInvalid = bridgeCalls.get();
        expectArgument(() -> new LearningCapabilityAdapter.FullHttpProviderCommand(
                "OP-JAVA-IMPL025-INVALID",
                "BATCH-JAVA-IMPL025-INVALID",
                "REQ-JAVA-IMPL025-INVALID",
                "impl025-invalid",
                "LRN-IMPL025",
                GOAL,
                1,
                MODEL_ID,
                researchEndpoint,
                modelEndpoint,
                Set.of(),
                0L), "PROVIDER_MULTI_SAMPLE_COUNT_OUT_OF_BOUNDS");
        check(bridgeCalls.get() == callsBeforeInvalid, "invalid sample count must fail before bridge/provider execution");

        var abstainCommand = new LearningCapabilityAdapter.FullHttpProviderCommand(
                "OP-JAVA-IMPL025-ABSTAIN",
                "BATCH-JAVA-IMPL025-ABSTAIN",
                "REQ-JAVA-IMPL025-ABSTAIN",
                "impl025-abstain",
                "LRN-IMPL025",
                GOAL,
                2,
                MODEL_ID,
                researchEndpoint,
                modelEndpoint,
                Set.of(),
                0L);
        var abstained = adapter.executeFullHttpProvider(authorization, PRINCIPAL, useAt.plusSeconds(2), abstainCommand);
        check(abstained.responseJson().contains("\"status\":\"ABSTAIN\""), "qualified tie must cross Java as abstention");
        check(abstained.responseJson().contains("\"selection_decision\":\"ABSTAIN\""), "abstention decision must be explicit");
        check(abstained.responseJson().contains("NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE"), "abstention reason must survive the port");
        check(abstained.responseJson().contains("\"course_id\":null"), "abstention must not create a course");
        check(abstained.responseJson().contains("\"journey_created\":false"), "abstention must not create a journey");

        scanStateForSecret(stateRoot, researchSecret, "research credential must not persist in System Master state");
        scanStateForSecret(stateRoot, modelSecret, "model credential must not persist in System Master state");

        var registered = new LearningCapabilityAdapter.LearningCommand(
                "REQ-JAVA-IMPL025-REGISTERED",
                "impl025-registered",
                "LRN-IMPL025",
                "fractions-unlike-denominators",
                Set.of("S-FRAC-ADD-SUB"),
                0L);
        var registeredResult = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(3), registered);
        check(registeredResult.responseJson().contains("\"skill_id\":\"S-FRAC-EQUIV-LCD\""),
                "registered-domain route must remain available through V7 adapter");

        System.out.println("IMPL025_STATUS=PASS");
        System.out.println("IMPL025_ASSERTIONS=" + assertions);
        System.out.println("IMPL025_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL025_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL025_ADAPTER_VERSION=" + LearningCapabilityAdapter.ADAPTER_VERSION);
        System.out.println("IMPL025_FULL_HTTP_BINDING=SYSTEM-MASTER-FULL-HTTP-PROVIDER-BINDING-V1");
        System.out.println("IMPL025_CREDENTIAL_COMMAND_FIELDS=NONE");
        System.out.println("IMPL025_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
    }

    private static void scanStateForSecret(Path root, String secret, String message) throws Exception {
        byte[] needle = secret.getBytes(StandardCharsets.UTF_8);
        try (var paths = Files.walk(root)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                byte[] bytes = Files.readAllBytes(path);
                check(indexOf(bytes, needle) < 0, message + ":" + path.getFileName());
            }
        }
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i <= haystack.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) continue outer;
            }
            return i;
        }
        return -1;
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

    private static void expectArgument(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected argument failure containing " + expected);
        } catch (IllegalArgumentException failure) {
            check(failure.getMessage().contains(expected), "argument failure must contain " + expected);
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
