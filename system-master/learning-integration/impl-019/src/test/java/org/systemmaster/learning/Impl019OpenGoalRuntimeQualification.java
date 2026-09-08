package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class Impl019OpenGoalRuntimeQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final String GOAL = "Use Python list and dictionary comprehensions to transform and filter data.";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl019-");
        Instant authorizedAt = Instant.parse("2026-09-08T04:10:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL019-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                7L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL019-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(request -> {
            bridgeCalls.incrementAndGet();
            return realInvoker.invoke(request);
        });

        var command = new LearningCapabilityAdapter.OpenGoalCommand(
                "REQ-IMPL019-OPEN",
                "impl019-open",
                "LRN-IMPL019",
                GOAL,
                Set.of("S-PY-DICTCOMP"),
                0L);
        var first = adapter.executeOpenGoal(authorization, PRINCIPAL, useAt, command);
        check(first.responseJson().contains("\"status\":\"PASS\""), "supported open goal must pass");
        check(first.responseJson().contains("\"domain_key\":\"python-comprehensions\""), "open goal must generate Python domain");
        check(first.responseJson().contains("\"open_goal_runtime_binding_version\":\"LEARNING-OPEN-GOAL-RUNTIME-BINDING-V1\""), "open-goal binding version must be explicit");
        check(first.responseJson().contains("\"skill_id\":\"S-PY-LISTCOMP\""), "downstream dict claim must probe list prerequisite");
        check(first.responseJson().contains("\"model_id\":\"GPT-5.6 Sol\""), "model provenance must survive runtime boundary");
        check(first.responseJson().contains("\"oracle_type\":\"PYTHON_COMPREHENSION_EXPRESSION\""), "oracle provenance must survive runtime boundary");
        check(first.responseJson().contains("\"validation_status\":\"MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED\""), "human review boundary must survive runtime boundary");
        check(LearningExecutionPort.PORT_VERSION.equals(first.executionPortVersion()), "stable execution port remains V1");

        var replay = adapter.executeOpenGoal(authorization, PRINCIPAL, useAt.plusSeconds(1), command);
        check(first.responseJson().equals(replay.responseJson()), "exact open-goal replay must be byte stable");
        check(first.responseDigest().equals(replay.responseDigest()), "exact open-goal replay digest must be stable");

        int callsBeforeAuthDenial = bridgeCalls.get();
        expectSecurity(() -> adapter.executeOpenGoal(authorization, "WRONG_PRINCIPAL", useAt, command), "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeAuthDenial, "authorization denial must occur before bridge invocation");

        var unsupported = new LearningCapabilityAdapter.OpenGoalCommand(
                "REQ-IMPL019-UNSUPPORTED",
                "impl019-unsupported",
                "LRN-IMPL019",
                "Learn Italian Renaissance painting conservation chemistry",
                Set.of(),
                0L);
        expectBridgeFailure(() -> adapter.executeOpenGoal(authorization, PRINCIPAL, useAt, unsupported),
                "LIVE_OPEN_GOAL_UNSUPPORTED_OR_INSUFFICIENT_RESEARCH");

        var unpinned = new LearningCapabilityAdapter.OpenGoalCommand(
                "REQ-IMPL019-UNPINNED",
                "impl019-unpinned",
                "LRN-IMPL019",
                "Use Python comprehensions to filter and transform lists and dictionaries.",
                Set.of(),
                0L);
        expectBridgeFailure(() -> adapter.executeOpenGoal(authorization, PRINCIPAL, useAt, unpinned),
                "MODEL_TRACE_GOAL_MISMATCH");

        var registered = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL019-REGISTERED",
                "impl019-registered",
                "LRN-IMPL019",
                "fractions-unlike-denominators",
                Set.of("S-FRAC-ADD-SUB"),
                0L);
        var registeredResult = adapter.execute(authorization, PRINCIPAL, useAt, registered);
        check(registeredResult.responseJson().contains("\"skill_id\":\"S-FRAC-EQUIV-LCD\""),
                "registered-domain path must remain available in latest adapter");

        System.out.println("IMPL019_STATUS=PASS");
        System.out.println("IMPL019_ASSERTIONS=" + assertions);
        System.out.println("IMPL019_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL019_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL019_ADAPTER_VERSION=" + LearningCapabilityAdapter.ADAPTER_VERSION);
        System.out.println("IMPL019_OPEN_GOAL_DOMAIN=python-comprehensions");
        System.out.println("IMPL019_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
    }

    private static void expectSecurity(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected security denial containing " + expected);
        } catch (SecurityException failure) {
            check(failure.getMessage().contains(expected), "security denial must contain " + expected);
        }
    }

    private static void expectBridgeFailure(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected bridge failure containing " + expected);
        } catch (IllegalStateException failure) {
            check(failure.getMessage().contains(expected), "bridge failure must contain " + expected + " but was " + failure.getMessage());
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
