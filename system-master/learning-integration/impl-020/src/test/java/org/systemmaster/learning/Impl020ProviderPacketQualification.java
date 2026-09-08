package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class Impl020ProviderPacketQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl020-");
        String stateKey = "impl020-java";
        String packetId = "PACKET-JAVA-IMPL020";

        ProcessBuilder prep = new ProcessBuilder(
                "python", "learning/lab/qualification_impl020_prepare_packet.py",
                "--state-root", stateRoot.toString(),
                "--state-key", stateKey,
                "--packet-id", packetId);
        prep.directory(repoRoot.toFile());
        prep.redirectErrorStream(true);
        Process prepProcess = prep.start();
        String prepOutput = new String(prepProcess.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        int prepRc = prepProcess.waitFor();
        if (prepRc != 0) throw new IllegalStateException("PACKET_PREP_FAILED:" + prepOutput);
        check(prepOutput.contains("IMPL020_PACKET_PREP_STATUS=PASS"), "provider packet preparation must pass");
        check(prepOutput.contains("IMPL020_PACKET_STANDING=SEALED_PROVIDER_INPUT_PACKET_NOT_COURSE_VERIFIED"),
                "packet preparation must not claim course verification");

        Instant authorizedAt = Instant.parse("2026-09-08T04:31:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL020-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                7L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL020-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(request -> {
            bridgeCalls.incrementAndGet();
            return realInvoker.invoke(request);
        });

        var command = new LearningCapabilityAdapter.OpenGoalPacketCommand(
                "REQ-JAVA-IMPL020-PACKET",
                stateKey,
                "LRN-IMPL020",
                packetId,
                Set.of(),
                0L);
        var first = adapter.executeOpenGoalPacket(authorization, PRINCIPAL, useAt, command);
        check(first.responseJson().contains("\"status\":\"PASS\""), "admitted packet must enter runtime");
        check(first.responseJson().contains("\"packet_id\":\"" + packetId + "\""), "packet identity must cross runtime boundary");
        check(first.responseJson().contains("\"packet_standing\":\"SEALED_PROVIDER_INPUT_PACKET_NOT_COURSE_VERIFIED\""),
                "packet standing must remain non-authoritative");
        check(first.responseJson().contains("\"provider_packet_runtime_version\":\"OPEN-GOAL-PROVIDER-PACKET-RUNTIME-V1\""),
                "provider packet runtime version must be explicit");
        check(first.responseJson().contains("\"domain_key\":\"python-comprehensions\""),
                "packet must resolve dynamic Python domain");
        check(first.responseJson().contains("\"validation_status\":\"MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED\""),
                "independent course validation must remain required");
        check(first.responseJson().contains("\"model_id\":\"A01-PROVIDER-MODEL-IMPL020\""),
                "fresh provider model identity must survive admission/runtime");
        check(first.responseJson().contains("\"skill_id\":\"S-PY-LISTCOMP\""),
                "admitted packet must enter existing adaptive sequencing");
        check(LearningExecutionPort.PORT_VERSION.equals(first.executionPortVersion()), "stable port remains V1");
        check(LearningCapabilityAdapter.ADAPTER_VERSION.equals(first.adapterVersion()), "adapter must bind V5 result");

        var replay = adapter.executeOpenGoalPacket(authorization, PRINCIPAL, useAt.plusSeconds(1), command);
        check(first.responseJson().equals(replay.responseJson()), "exact packet command replay must be byte stable");
        check(first.responseDigest().equals(replay.responseDigest()), "exact packet replay digest must be stable");

        int callsBeforeDenied = bridgeCalls.get();
        expectSecurity(() -> adapter.executeOpenGoalPacket(authorization, "WRONG_PRINCIPAL", useAt, command),
                "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenied, "authorization denial must happen before packet bridge invocation");

        var missing = new LearningCapabilityAdapter.OpenGoalPacketCommand(
                "REQ-JAVA-IMPL020-MISSING",
                stateKey,
                "LRN-IMPL020",
                "PACKET-MISSING-IMPL020",
                Set.of(),
                0L);
        expectBridgeFailure(() -> adapter.executeOpenGoalPacket(authorization, PRINCIPAL, useAt, missing),
                "OPEN_GOAL_INPUT_PACKET_NOT_FOUND");

        var registered = new LearningCapabilityAdapter.LearningCommand(
                "REQ-JAVA-IMPL020-REGISTERED",
                "impl020-registered",
                "LRN-IMPL020",
                "fractions-unlike-denominators",
                Set.of("S-FRAC-ADD-SUB"),
                0L);
        var registeredResult = adapter.execute(authorization, PRINCIPAL, useAt, registered);
        check(registeredResult.responseJson().contains("\"skill_id\":\"S-FRAC-EQUIV-LCD\""),
                "registered-domain route must remain available");

        System.out.println("IMPL020_STATUS=PASS");
        System.out.println("IMPL020_ASSERTIONS=" + assertions);
        System.out.println("IMPL020_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL020_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL020_ADAPTER_VERSION=" + LearningCapabilityAdapter.ADAPTER_VERSION);
        System.out.println("IMPL020_PACKET_RUNTIME=OPEN-GOAL-PROVIDER-PACKET-RUNTIME-V1");
        System.out.println("IMPL020_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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
