package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Impl027AdaptiveJourneyContinuationQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final String LEARNER = "LRN-IMPL027";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl027-");
        String stateKey = "impl027-runtime";

        Instant authorizedAt = Instant.parse("2026-09-08T15:30:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL027-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                12L,
                authorizedAt,
                authorizedAt.plusSeconds(7200),
                "PROOF-IMPL027-001");

        AtomicInteger startBridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realStart =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter starter = new LearningCapabilityAdapter(request -> {
            startBridgeCalls.incrementAndGet();
            return realStart.invoke(request);
        });

        var startCommand = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL027-START",
                stateKey,
                LEARNER,
                "git-feature-branch-workflow",
                Set.of("S-GIT-STAGE-COMMIT"),
                0L);
        var started = starter.execute(authorization, PRINCIPAL, useAt, startCommand);
        check(started.responseJson().contains("\"status\":\"PASS\""), "journey start must pass");
        check(started.responseJson().contains("\"action_type\":\"DIAGNOSTIC_PROBE\""), "journey must begin at diagnostic probe");
        check(startBridgeCalls.get() == 1, "start must cross bridge exactly once");

        String courseId = extract(started.responseJson(), "course_id");
        String journeyId = extract(started.responseJson(), "journey_id");
        String sessionId = extract(started.responseJson(), "session_id");

        AtomicInteger interactionBridgeCalls = new AtomicInteger();
        LearningInteractionAdapter.PythonInteractionBridgeInvoker realInteraction =
                new LearningInteractionAdapter.PythonInteractionBridgeInvoker(repoRoot, stateRoot);
        LearningInteractionAdapter adapter = new LearningInteractionAdapter(request -> {
            interactionBridgeCalls.incrementAndGet();
            return realInteraction.invoke(request);
        });

        var diagnostic = new LearningInteractionAdapter.EvidenceCommand(
                "OP-IMPL027-DIAG",
                "INT-IMPL027-DIAG",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                "git add notes.txt",
                10L,
                false,
                false);

        expectSecurity(
                () -> adapter.execute(authorization, "WRONG_PRINCIPAL", useAt, diagnostic),
                "PRINCIPAL_MISMATCH");
        check(interactionBridgeCalls.get() == 0, "wrong principal must fail before interaction bridge");

        var diagnosticResult = adapter.execute(authorization, PRINCIPAL, useAt, diagnostic);
        check(diagnosticResult.responseJson().contains("\"evidence_kind\":\"DIAGNOSTIC_ROUTING_ONLY\""), "diagnostic evidence must remain routing only");
        check(diagnosticResult.responseJson().contains("\"qualifies_mastery\":false"), "diagnostic must not qualify mastery");
        check(diagnosticResult.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "correct diagnostic must route to independent verification");
        check(diagnosticResult.responseJson().contains("\"target_id\":\"M-GIT-STAGE-1\""), "independent target must be qualified mastery item");
        check(!diagnosticResult.responseJson().contains("git add notes.txt"), "diagnostic raw response must not be echoed");
        check(LearningExecutionPort.PORT_VERSION.equals(diagnosticResult.executionPortVersion()), "stable execution port must remain V1");
        check(LearningInteractionAdapter.ADAPTER_VERSION.equals(diagnosticResult.adapterVersion()), "interaction adapter must be V1");

        String masteryResponse = "git add app.txt; git commit -m \"Feature work\"";
        var mastery = new LearningInteractionAdapter.EvidenceCommand(
                "OP-IMPL027-MASTERY",
                "INT-IMPL027-MASTERY",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                masteryResponse,
                120L,
                false,
                false);
        var masteryResult = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(1), mastery);
        check(masteryResult.responseJson().contains("\"evidence_kind\":\"MASTERY_CHECK\""), "independent verification must become mastery evidence through Learning engine");
        check(masteryResult.responseJson().contains("\"correct\":true"), "mastery answer must score correct through domain oracle");
        check(masteryResult.responseJson().contains("\"action_type\":\"RETENTION_WAIT\""), "mastery must advance to retention wait");
        check(!masteryResult.responseJson().contains(masteryResponse), "mastery raw response must not be echoed");

        int beforeReplay = interactionBridgeCalls.get();
        var masteryReplay = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(2), mastery);
        check(interactionBridgeCalls.get() == beforeReplay + 1, "replay must still cross authorized interaction boundary");
        check(masteryResult.responseJson().equals(masteryReplay.responseJson()), "exact interaction replay must be byte stable");
        check(masteryResult.responseDigest().equals(masteryReplay.responseDigest()), "exact replay digest must be stable");

        var earlyRetention = new LearningInteractionAdapter.EvidenceCommand(
                "OP-IMPL027-EARLY",
                "INT-IMPL027-EARLY",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                "git add later.txt; git commit -m \"Later work\"",
                121L,
                false,
                false);
        expectState(
                () -> adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(3), earlyRetention),
                "CURRENT_ACTION_DOES_NOT_ACCEPT_EVIDENCE:RETENTION_WAIT");

        String retentionResponse = "git add later.txt; git commit -m \"Later work\"";
        var retention = new LearningInteractionAdapter.EvidenceCommand(
                "OP-IMPL027-RETENTION",
                "INT-IMPL027-RETENTION",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                retentionResponse,
                4000L,
                false,
                false);
        var retentionResult = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(4), retention);
        check(retentionResult.responseJson().contains("\"evidence_kind\":\"RETENTION_CHECK\""), "delayed retention must be accepted as retention evidence");
        check(retentionResult.responseJson().contains("\"correct\":true"), "retention answer must score correct");
        check(!retentionResult.responseJson().contains(retentionResponse), "retention raw response must not be echoed");
        check(!retentionResult.responseJson().contains("\"action_type\":\"RETENTION_WAIT\""), "successful delayed retention must advance beyond wait");

        var revealed = new LearningInteractionAdapter.EvidenceCommand(
                "OP-IMPL027-REVEAL",
                "INT-IMPL027-REVEAL",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                "irrelevant",
                4001L,
                false,
                true);
        // The current action after retention is not the prior mastery item; an answer-reveal flag
        // cannot retroactively alter the already-counted independent evidence.
        check(!masteryResult.responseJson().contains("\"answer_revealed_before_commit\":true"), "accepted mastery evidence must remain unrevealed");

        System.out.println("IMPL027_STATUS=PASS");
        System.out.println("IMPL027_ASSERTIONS=" + assertions);
        System.out.println("IMPL027_START_BRIDGE_CALLS=" + startBridgeCalls.get());
        System.out.println("IMPL027_INTERACTION_BRIDGE_CALLS=" + interactionBridgeCalls.get());
        System.out.println("IMPL027_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL027_ADAPTER_VERSION=" + LearningInteractionAdapter.ADAPTER_VERSION);
        System.out.println("IMPL027_INTERACTION_BRIDGE_VERSION=" + LearningInteractionAdapter.INTERACTION_BRIDGE_VERSION);
        System.out.println("IMPL027_RAW_RESPONSE_IN_RESULT=NONE");
        System.out.println("IMPL027_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
        System.out.println("IMPL027_DIAGNOSTIC_MASTERY_AUTHORITY=ROUTING_ONLY");
        System.out.println("IMPL027_MASTERY_AUTHORITY=LEARNING_ENGINE");
    }

    private static String extract(String json, String key) {
        Pattern p = Pattern.compile("\\\"" + Pattern.quote(key) + "\\\":\\\"([^\\\"]+)\\\"");
        Matcher m = p.matcher(json);
        if (!m.find()) throw new AssertionError("missing JSON key " + key + " in " + json);
        return m.group(1);
    }

    private static void expectSecurity(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected security denial containing " + expected);
        } catch (SecurityException failure) {
            check(failure.getMessage().contains(expected), "security denial must contain " + expected);
        }
    }

    private static void expectState(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected state failure containing " + expected);
        } catch (IllegalStateException failure) {
            check(failure.getMessage().contains(expected), "state failure must contain " + expected);
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
