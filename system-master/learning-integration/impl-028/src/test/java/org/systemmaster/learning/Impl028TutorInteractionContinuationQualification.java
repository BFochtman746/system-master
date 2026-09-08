package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Impl028TutorInteractionContinuationQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final String LEARNER = "LRN-IMPL028";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl028-");
        String stateKey = "impl028-runtime";

        Instant authorizedAt = Instant.parse("2026-09-08T16:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL028-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                13L,
                authorizedAt,
                authorizedAt.plusSeconds(7200),
                "PROOF-IMPL028-001");

        LearningCapabilityAdapter starter = new LearningCapabilityAdapter(
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot));
        var start = starter.execute(
                authorization,
                PRINCIPAL,
                useAt,
                new LearningCapabilityAdapter.LearningCommand(
                        "REQ-IMPL028-START",
                        stateKey,
                        LEARNER,
                        "git-feature-branch-workflow",
                        Set.of("S-GIT-STAGE-COMMIT"),
                        0L));
        check(start.responseJson().contains("\"status\":\"PASS\""), "start must pass");
        check(start.responseJson().contains("\"action_type\":\"DIAGNOSTIC_PROBE\""), "start must enter diagnostic");
        String courseId = extract(start.responseJson(), "course_id");
        String journeyId = extract(start.responseJson(), "journey_id");
        String sessionId = extract(start.responseJson(), "session_id");

        LearningInteractionAdapter evidence = new LearningInteractionAdapter(
                new LearningInteractionAdapter.PythonInteractionBridgeInvoker(repoRoot, stateRoot));
        var diagnostic = evidence.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(1),
                new LearningInteractionAdapter.EvidenceCommand(
                        "OP-IMPL028-DIAG",
                        "INT-IMPL028-DIAG",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        "git status",
                        10L,
                        false,
                        false));
        check(diagnostic.responseJson().contains("\"evidence_kind\":\"DIAGNOSTIC_ROUTING_ONLY\""), "diagnostic must remain routing only");
        check(diagnostic.responseJson().contains("\"correct\":false"), "diagnostic gap must be observed");
        check(diagnostic.responseJson().contains("\"action_type\":\"TUTOR_REMEDIATION\""), "gap must route to tutor remediation");

        AtomicInteger tutorBridgeCalls = new AtomicInteger();
        LearningTutorInteractionAdapter.PythonTutorBridgeInvoker realTutor =
                new LearningTutorInteractionAdapter.PythonTutorBridgeInvoker(repoRoot, stateRoot);
        LearningTutorInteractionAdapter tutor = new LearningTutorInteractionAdapter(request -> {
            tutorBridgeCalls.incrementAndGet();
            return realTutor.invoke(request);
        });

        var beginOne = new LearningTutorInteractionAdapter.BeginTutorCommand(
                "OP-IMPL028-BEGIN-1",
                "TI-IMPL028-1",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                20L);
        expectSecurity(
                () -> tutor.begin(authorization, "WRONG_PRINCIPAL", useAt.plusSeconds(2), beginOne),
                "PRINCIPAL_MISMATCH");
        check(tutorBridgeCalls.get() == 0, "unauthorized tutor begin must fail before bridge");

        var begunOne = tutor.begin(authorization, PRINCIPAL, useAt.plusSeconds(2), beginOne);
        check(begunOne.responseJson().contains("\"action_type\":\"TUTOR_REMEDIATION\""), "tutor begin must preserve remediation route");
        check(begunOne.responseJson().contains("\"probe_id\":\"DG-TP-GIT-STAGE-1\""), "Learning must choose first formative probe");
        check(begunOne.responseJson().contains("\"answer_withheld\":true"), "tutor prompt answer must be withheld");
        check(begunOne.responseJson().contains("\"qualifies_mastery\":false"), "tutor prompt cannot qualify mastery");

        String wrongTutorResponse = "git commit -m \"oops\"";
        var firstTurnCommand = new LearningTutorInteractionAdapter.SubmitTutorCommand(
                "OP-IMPL028-TURN-1",
                "TI-IMPL028-1",
                "TURN-IMPL028-1",
                stateKey,
                wrongTutorResponse,
                1,
                21L);
        var firstTurn = tutor.submit(authorization, PRINCIPAL, useAt.plusSeconds(3), firstTurnCommand);
        check(firstTurn.responseJson().contains("\"tutor_formative_only\":true"), "tutor turn must attest formative-only authority");
        check(firstTurn.responseJson().contains("\"mastery_attempt_written\":false"), "tutor turn must not write mastery attempt");
        check(firstTurn.responseJson().contains("\"formative_handoff\":null"), "supported first turn cannot skip to mastery");
        check(!firstTurn.responseJson().contains(wrongTutorResponse), "raw tutor response must not be echoed");

        var begunTwo = tutor.begin(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(4),
                new LearningTutorInteractionAdapter.BeginTutorCommand(
                        "OP-IMPL028-BEGIN-2",
                        "TI-IMPL028-2",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        22L));
        check(begunTwo.responseJson().contains("\"probe_id\":\"DG-TP-GIT-STAGE-2\""), "second tutor interaction must use fresh probe family");
        check(!begunTwo.responseJson().contains("DG-TP-GIT-STAGE-1\",\"probe_family_id"), "second probe must not replay first probe identity");

        String freshCorrect = "git add report.txt";
        var secondTurnCommand = new LearningTutorInteractionAdapter.SubmitTutorCommand(
                "OP-IMPL028-TURN-2",
                "TI-IMPL028-2",
                "TURN-IMPL028-2",
                stateKey,
                freshCorrect,
                0,
                23L);
        var secondTurn = tutor.submit(authorization, PRINCIPAL, useAt.plusSeconds(5), secondTurnCommand);
        check(secondTurn.responseJson().contains("\"move\":\"INDEPENDENT_RECHECK_PASSED\""), "fresh unaided recheck must pass formative gate");
        check(secondTurn.responseJson().contains("FORMATIVE_RECHECK_PASSED_REQUIRES_INDEPENDENT_VERIFICATION"), "formative handoff must require independent verification");
        check(secondTurn.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "handoff must route to independent verification");
        check(secondTurn.responseJson().contains("\"target_id\":\"M-GIT-STAGE-1\""), "handoff target must be qualified mastery item");
        check(secondTurn.responseJson().contains("\"next_authority\":\"TUTOR_FORMATIVE_ROUTING_HANDOFF\""), "handoff authority must remain routing only");
        check(!secondTurn.responseJson().contains(freshCorrect), "fresh tutor response must not be echoed");

        int beforeReplay = tutorBridgeCalls.get();
        var replay = tutor.submit(authorization, PRINCIPAL, useAt.plusSeconds(6), secondTurnCommand);
        check(tutorBridgeCalls.get() == beforeReplay + 1, "authorized replay must cross tutor bridge");
        check(secondTurn.responseJson().equals(replay.responseJson()), "exact completed tutor replay must be stable");
        check(secondTurn.responseDigest().equals(replay.responseDigest()), "tutor replay digest must be stable");

        String masteryResponse = "git add app.txt; git commit -m \"Feature work\"";
        var mastery = evidence.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(7),
                new LearningInteractionAdapter.EvidenceCommand(
                        "OP-IMPL028-MASTERY",
                        "INT-IMPL028-MASTERY",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        masteryResponse,
                        120L,
                        false,
                        false));
        check(mastery.responseJson().contains("\"before_authority\":\"TUTOR_FORMATIVE_ROUTING_HANDOFF\""), "existing evidence continuation must honor tutor handoff");
        check(mastery.responseJson().contains("\"evidence_kind\":\"MASTERY_CHECK\""), "handoff verification must write mastery only through Learning engine");
        check(mastery.responseJson().contains("\"correct\":true"), "independent mastery response must score correct");
        check(mastery.responseJson().contains("\"action_type\":\"RETENTION_WAIT\""), "verified mastery must proceed to retention wait");
        check(!mastery.responseJson().contains(masteryResponse), "raw mastery response must not be echoed");

        check(LearningExecutionPort.PORT_VERSION.equals(secondTurn.executionPortVersion()), "stable execution port must remain V1");
        check(LearningTutorInteractionAdapter.ADAPTER_VERSION.equals(secondTurn.adapterVersion()), "tutor adapter must be V1");

        System.out.println("IMPL028_STATUS=PASS");
        System.out.println("IMPL028_ASSERTIONS=" + assertions);
        System.out.println("IMPL028_TUTOR_BRIDGE_CALLS=" + tutorBridgeCalls.get());
        System.out.println("IMPL028_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL028_TUTOR_ADAPTER_VERSION=" + LearningTutorInteractionAdapter.ADAPTER_VERSION);
        System.out.println("IMPL028_TUTOR_BRIDGE_VERSION=" + LearningTutorInteractionAdapter.TUTOR_BRIDGE_VERSION);
        System.out.println("IMPL028_TUTOR_MASTERY_AUTHORITY=FORMATIVE_ONLY");
        System.out.println("IMPL028_MASTERY_AUTHORITY=LEARNING_ENGINE");
        System.out.println("IMPL028_RAW_TUTOR_RESPONSE_IN_RESULT=NONE");
        System.out.println("IMPL028_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
