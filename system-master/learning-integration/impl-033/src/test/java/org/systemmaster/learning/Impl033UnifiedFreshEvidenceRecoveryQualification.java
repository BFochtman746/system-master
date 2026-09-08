package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class Impl033UnifiedFreshEvidenceRecoveryQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Path.of(requiredEnv("SYSTEM_MASTER_LEARNING_STATE_ROOT")).toAbsolutePath().normalize();
        String courseId = requiredEnv("IMPL033_COURSE_ID");
        String learnerId = requiredEnv("IMPL033_LEARNER_ID");
        String journeyId = requiredEnv("IMPL033_JOURNEY_ID");
        String sessionId = requiredEnv("IMPL033_SESSION_ID");
        long recoveryAt = Long.parseLong(requiredEnv("IMPL033_RECOVERY_AT"));
        String modelEndpoint = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT");
        String modelProviderId = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID");
        String modelId = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_ID");
        String modelCredential = requiredEnv("SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN");

        Instant authorizedAt = Instant.parse("2026-09-08T21:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL033-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                33L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL033-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        AtomicReference<String> lastRequest = new AtomicReference<>();
        var realInvoker = new UnifiedFreshEvidenceRecoveryLearningAdapter.PythonRecoveryTurnBridgeInvoker(repoRoot, stateRoot);
        UnifiedFreshEvidenceRecoveryLearningAdapter.BridgeInvoker countedInvoker = request -> {
            bridgeCalls.incrementAndGet();
            lastRequest.set(request);
            return realInvoker.invoke(request);
        };
        var adapter = new UnifiedFreshEvidenceRecoveryLearningAdapter(countedInvoker);
        var command = new UnifiedFreshEvidenceRecoveryLearningAdapter.PrepareWithRecoveryCommand(
                "OP-JAVA-IMPL033",
                "REC-JAVA-IMPL033",
                "TURN-JAVA-IMPL033",
                "impl033-java",
                journeyId,
                sessionId,
                learnerId,
                courseId,
                recoveryAt);

        String commandJson = command.toJson();
        check(!commandJson.contains(modelEndpoint), "model endpoint must be absent from command");
        check(!commandJson.contains(modelProviderId), "provider ID must be absent from command");
        check(!commandJson.contains(modelId), "model ID must be absent from command");
        check(!commandJson.contains(modelCredential), "credential must be absent from command");
        check(!commandJson.contains("endpoint"), "command must expose no endpoint field");
        check(!commandJson.contains("model_id"), "command must expose no model ID field");
        check(!commandJson.contains("provider_id"), "command must expose no provider ID field");
        check(!commandJson.contains("criterion_id"), "caller must not select criterion scope");
        check(!commandJson.contains("skill_id"), "caller must not select skill scope");
        check(!commandJson.contains("\"kind\""), "caller must not select recovery kind");

        expectSecurity(() -> adapter.prepare(authorization, "WRONG_PRINCIPAL", useAt, command), "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == 0, "authorization denial must happen before bridge/provider execution");

        var first = adapter.prepare(authorization, PRINCIPAL, useAt, command);
        check(first.responseJson().contains("\"recovery_performed\":true"), "blocked turn must auto-recover");
        check(first.responseJson().contains("\"recovery_kind\":\"maintenance\""), "Learning state must derive maintenance recovery");
        check(first.responseJson().contains("\"recovery_skill_id\":\"S-FRAC-EQUIV-LCD\""), "Learning state must derive skill scope");
        check(first.responseJson().contains("\"recovery_criterion_id\":\"C-FRAC-EQUIV-LCD\""), "Learning state must derive criterion scope");
        check(first.responseJson().contains("\"action_type\":\"MAINTENANCE_RECHECK\""), "recovery must resume maintenance evidence");
        check(first.responseJson().contains("\"mode\":\"EVIDENCE\""), "recovery must resume normal evidence turn");
        check(first.responseJson().contains("\"answer_withheld\":true"), "resumed turn must withhold answer");
        check(first.responseJson().contains("\"admission_standing\":\"INDEPENDENT_ORACLE_VALIDATED_FRESH_EVIDENCE_TASK\""),
                "IMPL-031 admission must remain authoritative");
        check(first.responseJson().contains("\"caller_selects_recovery_scope\":false"),
                "caller recovery-scope authority must remain false");
        check(!first.responseJson().contains(modelCredential), "credential must not appear in response");
        check(LearningExecutionPort.PORT_VERSION.equals(first.executionPortVersion()), "execution port must remain V1");
        check(UnifiedFreshEvidenceRecoveryLearningAdapter.ADAPTER_VERSION.equals(first.adapterVersion()), "adapter version must match");
        check(lastRequest.get() != null && lastRequest.get().equals(commandJson), "bridge request must equal command JSON");

        int beforeReplay = bridgeCalls.get();
        var replay = adapter.prepare(authorization, PRINCIPAL, useAt.plusSeconds(1), command);
        check(bridgeCalls.get() == beforeReplay + 1, "authorized replay must cross bridge boundary");
        check(first.responseJson().equals(replay.responseJson()), "replay response must be byte stable");
        check(first.responseDigest().equals(replay.responseDigest()), "replay digest must be stable");

        System.out.println("IMPL033_STATUS=PASS");
        System.out.println("IMPL033_ASSERTIONS=" + assertions);
        System.out.println("IMPL033_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL033_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL033_ADAPTER_VERSION=" + UnifiedFreshEvidenceRecoveryLearningAdapter.ADAPTER_VERSION);
        System.out.println("IMPL033_CALLER_RECOVERY_SCOPE_FIELDS=NONE");
        System.out.println("IMPL033_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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
