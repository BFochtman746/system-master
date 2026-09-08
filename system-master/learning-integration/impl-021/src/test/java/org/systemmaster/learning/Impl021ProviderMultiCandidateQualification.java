package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class Impl021ProviderMultiCandidateQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl021-");
        String stateKey = "impl021-java";

        ProcessBuilder prep = new ProcessBuilder(
                "python", "learning/lab/qualification_impl021_prepare_packets.py",
                "--state-root", stateRoot.toString(),
                "--state-key", stateKey);
        prep.directory(repoRoot.toFile());
        prep.redirectErrorStream(true);
        Process prepProcess = prep.start();
        String prepOutput = new String(prepProcess.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int prepRc = prepProcess.waitFor();
        if (prepRc != 0) throw new IllegalStateException("PACKET_PREP_FAILED:" + prepOutput);
        check(prepOutput.contains("IMPL021_PACKET_PREP_STATUS=PASS"), "provider candidate packet preparation must pass");
        check(prepOutput.contains("IMPL021_PACKET_COUNT=4"), "qualification must prepare four independent packet samples");
        check(prepOutput.contains("IMPL021_PACKET_STANDING=SEALED_PROVIDER_INPUT_PACKET_NOT_COURSE_VERIFIED"),
                "packet preparation must remain below course verification");

        Instant authorizedAt = Instant.parse("2026-09-08T07:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL021-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                8L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL021-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(request -> {
            bridgeCalls.incrementAndGet();
            return realInvoker.invoke(request);
        });

        var selectCommand = new LearningCapabilityAdapter.OpenGoalMultiCandidatePacketCommand(
                "REQ-JAVA-IMPL021-SELECT",
                stateKey,
                "LRN-IMPL021",
                Set.of("PACKET-JAVA-IMPL021-C", "PACKET-JAVA-IMPL021-A", "PACKET-JAVA-IMPL021-B"),
                Set.of("S-PY-DICTCOMP"),
                0L);
        var selected = adapter.executeOpenGoalMultiCandidatePackets(
                authorization, PRINCIPAL, useAt, selectCommand);
        check(selected.responseJson().contains("\"status\":\"PASS\""), "A/B/C packet set must select a candidate");
        check(selected.responseJson().contains("\"selection_decision\":\"SELECT\""), "selection decision must be explicit");
        check(selected.responseJson().contains("\"selected_packet_id\":\"PACKET-JAVA-IMPL021-A\""),
                "independent selector must choose candidate A rather than first packet order");
        check(selected.responseJson().contains("\"provider_multi_candidate_runtime_version\":\"OPEN-GOAL-PROVIDER-MULTI-CANDIDATE-RUNTIME-V1\""),
                "multi-candidate runtime version must be explicit");
        check(selected.responseJson().contains("\"selection_policy_version\":\"INDEPENDENT-PARETO-SELECTION-V1\""),
                "existing independent selection authority must remain bound");
        check(selected.responseJson().contains("\"model_ranking_used\":false"), "model ranking must remain unused");
        check(selected.responseJson().contains("\"scalar_ranking_used\":false"), "scalar ranking must remain unused");
        check(selected.responseJson().contains("\"journey_created\":true"), "selected candidate must enter adaptive journey");
        check(selected.responseJson().contains("\"validation_status\":\"MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED\""),
                "selected course must preserve human-review boundary");
        check(selected.responseJson().contains("\"skill_id\":\"S-PY-LISTCOMP\""),
                "selected course must enter conservative adaptive sequencing");
        check(LearningExecutionPort.PORT_VERSION.equals(selected.executionPortVersion()), "stable execution port remains V1");
        check(LearningCapabilityAdapter.ADAPTER_VERSION.equals(selected.adapterVersion()), "adapter must bind V6 result");

        var replay = adapter.executeOpenGoalMultiCandidatePackets(
                authorization, PRINCIPAL, useAt.plusSeconds(1), selectCommand);
        check(selected.responseJson().equals(replay.responseJson()), "exact selected-set replay must be byte stable");
        check(selected.responseDigest().equals(replay.responseDigest()), "selected-set replay digest must be stable");

        int callsBeforeDenied = bridgeCalls.get();
        expectSecurity(
                () -> adapter.executeOpenGoalMultiCandidatePackets(authorization, "WRONG_PRINCIPAL", useAt, selectCommand),
                "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenied, "authorization denial must happen before multi-candidate bridge invocation");

        var abstainCommand = new LearningCapabilityAdapter.OpenGoalMultiCandidatePacketCommand(
                "REQ-JAVA-IMPL021-ABSTAIN",
                stateKey,
                "LRN-IMPL021",
                Set.of("PACKET-JAVA-IMPL021-D", "PACKET-JAVA-IMPL021-A"),
                Set.of(),
                0L);
        var abstained = adapter.executeOpenGoalMultiCandidatePackets(
                authorization, PRINCIPAL, useAt.plusSeconds(2), abstainCommand);
        check(abstained.responseJson().contains("\"status\":\"ABSTAIN\""),
                "qualified abstention must cross Java boundary as a valid outcome");
        check(abstained.responseJson().contains("\"selection_decision\":\"ABSTAIN\""),
                "tie must remain an explicit abstention decision");
        check(abstained.responseJson().contains("NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE"),
                "tie abstention reason must survive the port");
        check(abstained.responseJson().contains("\"course_id\":null"), "abstention must not create a course");
        check(abstained.responseJson().contains("\"journey_created\":false"), "abstention must not create adaptive journey");
        check(abstained.responseJson().contains("\"model_ranking_used\":false"), "abstention cannot use model ranking");
        check(abstained.responseJson().contains("\"scalar_ranking_used\":false"), "abstention cannot use scalar ranking");

        var missing = new LearningCapabilityAdapter.OpenGoalMultiCandidatePacketCommand(
                "REQ-JAVA-IMPL021-MISSING",
                stateKey,
                "LRN-IMPL021",
                Set.of("PACKET-JAVA-IMPL021-A", "PACKET-JAVA-IMPL021-MISSING"),
                Set.of(),
                0L);
        expectBridgeFailure(
                () -> adapter.executeOpenGoalMultiCandidatePackets(authorization, PRINCIPAL, useAt, missing),
                "OPEN_GOAL_INPUT_PACKET_NOT_FOUND");

        var registered = new LearningCapabilityAdapter.LearningCommand(
                "REQ-JAVA-IMPL021-REGISTERED",
                "impl021-registered",
                "LRN-IMPL021",
                "fractions-unlike-denominators",
                Set.of("S-FRAC-ADD-SUB"),
                0L);
        var registeredResult = adapter.execute(authorization, PRINCIPAL, useAt, registered);
        check(registeredResult.responseJson().contains("\"skill_id\":\"S-FRAC-EQUIV-LCD\""),
                "registered-domain route must remain available through V6 adapter");

        System.out.println("IMPL021_STATUS=PASS");
        System.out.println("IMPL021_ASSERTIONS=" + assertions);
        System.out.println("IMPL021_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL021_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL021_ADAPTER_VERSION=" + LearningCapabilityAdapter.ADAPTER_VERSION);
        System.out.println("IMPL021_MULTI_CANDIDATE_RUNTIME=OPEN-GOAL-PROVIDER-MULTI-CANDIDATE-RUNTIME-V1");
        System.out.println("IMPL021_SELECTION_POLICY=INDEPENDENT-PARETO-SELECTION-V1");
        System.out.println("IMPL021_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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
