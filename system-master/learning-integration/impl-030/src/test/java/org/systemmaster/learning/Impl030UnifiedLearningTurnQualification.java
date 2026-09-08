package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Impl030UnifiedLearningTurnQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl030-");
        String stateKey = "impl030-runtime";

        Instant authorizedAt = Instant.parse("2026-09-08T18:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL030-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                15L,
                authorizedAt,
                authorizedAt.plusSeconds(7200),
                "PROOF-IMPL030-001");

        LearningCapabilityAdapter starter = new LearningCapabilityAdapter(
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot));
        AtomicInteger turnBridgeCalls = new AtomicInteger();
        LearningTurnControllerAdapter.PythonTurnBridgeInvoker realTurn =
                new LearningTurnControllerAdapter.PythonTurnBridgeInvoker(repoRoot, stateRoot);
        LearningTurnControllerAdapter turns = new LearningTurnControllerAdapter(request -> {
            turnBridgeCalls.incrementAndGet();
            return realTurn.invoke(request);
        });

        String learnerA = "LRN-IMPL030-A";
        var startA = starter.execute(
                authorization,
                PRINCIPAL,
                useAt,
                new LearningCapabilityAdapter.LearningCommand(
                        "REQ-IMPL030-A",
                        stateKey,
                        learnerA,
                        "git-feature-branch-workflow",
                        Set.of("S-GIT-STAGE-COMMIT"),
                        0L));
        check(startA.responseJson().contains("\"status\":\"PASS\""), "start A must pass");
        String courseA = extract(startA.responseJson(), "course_id");
        String journeyA = extract(startA.responseJson(), "journey_id");
        String sessionA = extract(startA.responseJson(), "session_id");

        var prepareDiagA = new LearningTurnControllerAdapter.PrepareTurnCommand(
                "OP-IMPL030-A-PREP-1", "TURN-IMPL030-A-1", stateKey,
                journeyA, sessionA, learnerA, courseA, 1L);
        expectSecurity(
                () -> turns.prepare(authorization, "WRONG_PRINCIPAL", useAt.plusSeconds(1), prepareDiagA),
                "PRINCIPAL_MISMATCH");
        check(turnBridgeCalls.get() == 0, "unauthorized prepare must fail before unified bridge");

        var diagTurn = turns.prepare(authorization, PRINCIPAL, useAt.plusSeconds(1), prepareDiagA);
        check(diagTurn.responseJson().contains("\"mode\":\"EVIDENCE\""), "diagnostic turn must be evidence mode");
        check(diagTurn.responseJson().contains("\"action_type\":\"DIAGNOSTIC_PROBE\""), "diagnostic action must be bound");
        check(diagTurn.responseJson().contains("notes.txt"), "diagnostic prompt must be rendered");
        check(diagTurn.responseJson().contains("\"answer_withheld\":true"), "diagnostic answer must be withheld");
        String diagBinding = extract(diagTurn.responseJson(), "turn_binding_digest");
        check(diagBinding.matches("[0-9a-f]{64}"), "turn binding must be SHA-256");

        String diagnosticResponse = "git add notes.txt";
        var diagSubmit = turns.submit(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(2),
                new LearningTurnControllerAdapter.SubmitTurnCommand(
                        "OP-IMPL030-A-SUB-1", "TURN-IMPL030-A-1", stateKey,
                        diagBinding, diagnosticResponse, 10L, false, false, 0));
        check(diagSubmit.responseJson().contains("\"submission_authority\":\"LEARNING_EVIDENCE_CONTINUATION\""), "diagnostic submit must delegate to evidence continuation");
        check(diagSubmit.responseJson().contains("\"evidence_kind\":\"DIAGNOSTIC_ROUTING_ONLY\""), "diagnostic remains routing only");
        check(diagSubmit.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "correct diagnostic must route to independent verification");
        check(diagSubmit.responseJson().contains("\"response_echoed\":false"), "diagnostic response must not echo");
        check(!diagSubmit.responseJson().contains(diagnosticResponse), "raw diagnostic response must be absent");

        var verifyTurn = turns.prepare(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(3),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-A-PREP-2", "TURN-IMPL030-A-2", stateKey,
                        journeyA, sessionA, learnerA, courseA, 11L));
        check(verifyTurn.responseJson().contains("\"mode\":\"EVIDENCE\""), "verification must remain evidence mode");
        check(verifyTurn.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "verification action must be current");
        check(verifyTurn.responseJson().contains("app.txt"), "verification prompt must be rendered");
        String verifyBinding = extract(verifyTurn.responseJson(), "turn_binding_digest");
        String masteryResponse = "git add app.txt; git commit -m \"Feature work\"";
        var mastery = turns.submit(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(4),
                new LearningTurnControllerAdapter.SubmitTurnCommand(
                        "OP-IMPL030-A-SUB-2", "TURN-IMPL030-A-2", stateKey,
                        verifyBinding, masteryResponse, 120L, false, false, 0));
        check(mastery.responseJson().contains("\"evidence_kind\":\"MASTERY_CHECK\""), "mastery must be submitted through Learning engine");
        check(mastery.responseJson().contains("\"correct\":true"), "mastery must score correct");
        check(mastery.responseJson().contains("\"action_type\":\"RETENTION_WAIT\""), "mastery must advance to retention wait");
        check(!mastery.responseJson().contains(masteryResponse), "raw mastery response must be absent");

        var waitTurn = turns.prepare(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(5),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-A-PREP-3", "TURN-IMPL030-A-3", stateKey,
                        journeyA, sessionA, learnerA, courseA, 121L));
        check(waitTurn.responseJson().contains("\"mode\":\"WAIT\""), "retention delay must become WAIT turn");
        check(waitTurn.responseJson().contains("\"response_required\":false"), "WAIT must not request response");
        check(waitTurn.responseJson().contains("\"prompt\":null"), "future retention prompt must remain withheld");
        check(waitTurn.responseJson().contains("\"earliest_due_at\":3720"), "WAIT must expose due time");

        String learnerB = "LRN-IMPL030-B";
        var startB = starter.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(6),
                new LearningCapabilityAdapter.LearningCommand(
                        "REQ-IMPL030-B", stateKey, learnerB, "git-feature-branch-workflow",
                        Set.of("S-GIT-STAGE-COMMIT"), 0L));
        String courseB = extract(startB.responseJson(), "course_id");
        String journeyB = extract(startB.responseJson(), "journey_id");
        String sessionB = extract(startB.responseJson(), "session_id");

        var bDiag = turns.prepare(
                authorization, PRINCIPAL, useAt.plusSeconds(7),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-B-PREP-1", "TURN-IMPL030-B-1", stateKey,
                        journeyB, sessionB, learnerB, courseB, 1L));
        String bDiagBinding = extract(bDiag.responseJson(), "turn_binding_digest");
        var bWrong = turns.submit(
                authorization, PRINCIPAL, useAt.plusSeconds(8),
                new LearningTurnControllerAdapter.SubmitTurnCommand(
                        "OP-IMPL030-B-SUB-1", "TURN-IMPL030-B-1", stateKey,
                        bDiagBinding, "git status", 10L, false, false, 0));
        check(bWrong.responseJson().contains("\"action_type\":\"TUTOR_REMEDIATION\""), "wrong diagnostic must route to tutor");

        var tutorOne = turns.prepare(
                authorization, PRINCIPAL, useAt.plusSeconds(9),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-B-PREP-2", "TURN-IMPL030-B-2", stateKey,
                        journeyB, sessionB, learnerB, courseB, 11L));
        check(tutorOne.responseJson().contains("\"mode\":\"TUTOR\""), "controller must select tutor mode itself");
        check(tutorOne.responseJson().contains("\"probe_id\":\"DG-TP-GIT-STAGE-1\""), "controller must auto-begin first Learning tutor probe");
        check(tutorOne.responseJson().contains("demo.txt"), "first tutor prompt must be rendered");
        String tutorOneBinding = extract(tutorOne.responseJson(), "turn_binding_digest");
        String tutorWrong = "git commit -m \"oops\"";
        var tutorOneResult = turns.submit(
                authorization, PRINCIPAL, useAt.plusSeconds(10),
                new LearningTurnControllerAdapter.SubmitTurnCommand(
                        "OP-IMPL030-B-SUB-2", "TURN-IMPL030-B-2", stateKey,
                        tutorOneBinding, tutorWrong, 12L, false, false, 1));
        check(tutorOneResult.responseJson().contains("\"submission_authority\":\"LEARNING_TUTOR_CONTINUATION\""), "tutor submit must delegate to IMPL-028");
        check(tutorOneResult.responseJson().contains("\"evidence_kind\":\"TUTOR_FORMATIVE_ONLY\""), "tutor evidence must remain formative only");
        check(tutorOneResult.responseJson().contains("\"mastery_attempt_written\":false"), "tutor cannot mint mastery");
        check(!tutorOneResult.responseJson().contains(tutorWrong), "raw tutor response must be absent");

        var tutorTwo = turns.prepare(
                authorization, PRINCIPAL, useAt.plusSeconds(11),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-B-PREP-3", "TURN-IMPL030-B-3", stateKey,
                        journeyB, sessionB, learnerB, courseB, 13L));
        check(tutorTwo.responseJson().contains("\"mode\":\"TUTOR\""), "second formative turn remains tutor mode");
        check(tutorTwo.responseJson().contains("\"probe_id\":\"DG-TP-GIT-STAGE-2\""), "fresh tutor family must be selected");
        String tutorTwoBinding = extract(tutorTwo.responseJson(), "turn_binding_digest");
        var tutorPassed = turns.submit(
                authorization, PRINCIPAL, useAt.plusSeconds(12),
                new LearningTurnControllerAdapter.SubmitTurnCommand(
                        "OP-IMPL030-B-SUB-3", "TURN-IMPL030-B-3", stateKey,
                        tutorTwoBinding, "git add report.txt", 14L, false, false, 0));
        check(tutorPassed.responseJson().contains("\"move\":\"INDEPENDENT_RECHECK_PASSED\""), "fresh unaided tutor recheck must pass formative gate");
        check(tutorPassed.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "formative pass must hand off to independent verification");
        check(tutorPassed.responseJson().contains("\"next_authority\":\"TUTOR_FORMATIVE_ROUTING_HANDOFF\""), "handoff must remain routing only");

        var postTutorVerify = turns.prepare(
                authorization, PRINCIPAL, useAt.plusSeconds(13),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-B-PREP-4", "TURN-IMPL030-B-4", stateKey,
                        journeyB, sessionB, learnerB, courseB, 15L));
        check(postTutorVerify.responseJson().contains("\"mode\":\"EVIDENCE\""), "post-tutor verification must return to evidence mode");
        check(postTutorVerify.responseJson().contains("\"target_id\":\"M-GIT-STAGE-1\""), "post-tutor verification target must be qualified mastery item");

        var replayPrepare = turns.prepare(
                authorization, PRINCIPAL, useAt.plusSeconds(14),
                new LearningTurnControllerAdapter.PrepareTurnCommand(
                        "OP-IMPL030-B-PREP-4-RETRY", "TURN-IMPL030-B-4", stateKey,
                        journeyB, sessionB, learnerB, courseB, 15L));
        check(extract(postTutorVerify.responseJson(), "turn_binding_digest").equals(
                extract(replayPrepare.responseJson(), "turn_binding_digest")), "prepare retry must preserve turn binding");

        check(LearningExecutionPort.PORT_VERSION.equals(postTutorVerify.executionPortVersion()), "stable execution port must remain V1");
        check(LearningTurnControllerAdapter.ADAPTER_VERSION.equals(postTutorVerify.adapterVersion()), "turn adapter must be V1");

        System.out.println("IMPL030_STATUS=PASS");
        System.out.println("IMPL030_ASSERTIONS=" + assertions);
        System.out.println("IMPL030_TURN_BRIDGE_CALLS=" + turnBridgeCalls.get());
        System.out.println("IMPL030_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL030_TURN_ADAPTER_VERSION=" + LearningTurnControllerAdapter.ADAPTER_VERSION);
        System.out.println("IMPL030_TURN_BRIDGE_VERSION=" + LearningTurnControllerAdapter.BRIDGE_VERSION);
        System.out.println("IMPL030_CONTROLLER_VERSION=" + LearningTurnControllerAdapter.CONTROLLER_VERSION);
        System.out.println("IMPL030_CALLER_RUNTIME_OPERATIONS=PREPARE_TURN,SUBMIT_TURN");
        System.out.println("IMPL030_TUTOR_MASTERY_AUTHORITY=FORMATIVE_ONLY");
        System.out.println("IMPL030_MASTERY_AUTHORITY=LEARNING_ENGINE");
        System.out.println("IMPL030_RAW_RESPONSE_IN_RESULT=NONE");
        System.out.println("IMPL030_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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
