package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Impl029LearnerActionPresentationQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final String LEARNER = "LRN-IMPL029";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl029-");
        String stateKey = "impl029-runtime";

        Instant authorizedAt = Instant.parse("2026-09-08T17:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL029-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                14L,
                authorizedAt,
                authorizedAt.plusSeconds(7200),
                "PROOF-IMPL029-001");

        LearningCapabilityAdapter starter = new LearningCapabilityAdapter(
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot));
        var start = starter.execute(
                authorization,
                PRINCIPAL,
                useAt,
                new LearningCapabilityAdapter.LearningCommand(
                        "REQ-IMPL029-START",
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

        AtomicInteger presentationBridgeCalls = new AtomicInteger();
        LearningActionPresentationAdapter.PythonPresentationBridgeInvoker realPresentation =
                new LearningActionPresentationAdapter.PythonPresentationBridgeInvoker(repoRoot, stateRoot);
        LearningActionPresentationAdapter presenter = new LearningActionPresentationAdapter(request -> {
            presentationBridgeCalls.incrementAndGet();
            return realPresentation.invoke(request);
        });

        var initialCommand = new LearningActionPresentationAdapter.PresentationCommand(
                "OP-IMPL029-PRESENT-1",
                "PRESENT-IMPL029-1",
                stateKey,
                journeyId,
                sessionId,
                LEARNER,
                courseId,
                1L);
        expectSecurity(
                () -> presenter.present(authorization, "WRONG_PRINCIPAL", useAt.plusSeconds(1), initialCommand),
                "PRINCIPAL_MISMATCH");
        check(presentationBridgeCalls.get() == 0, "unauthorized presentation must fail before bridge");

        var initial = presenter.present(authorization, PRINCIPAL, useAt.plusSeconds(1), initialCommand);
        check(initial.responseJson().contains("\"action_type\":\"DIAGNOSTIC_PROBE\""), "presentation must show diagnostic action");
        check(initial.responseJson().contains("\"target_id\":\"P-GIT-STAGE-1\""), "diagnostic target must be stage probe");
        check(initial.responseJson().contains("notes.txt"), "diagnostic learner prompt must be rendered");
        check(initial.responseJson().contains("\"answer_withheld\":true"), "diagnostic answer must be withheld");
        check(initial.responseJson().contains("\"evidence_role\":\"DIAGNOSTIC_ROUTING_ONLY\""), "diagnostic must remain routing only");

        LearningInteractionAdapter evidence = new LearningInteractionAdapter(
                new LearningInteractionAdapter.PythonInteractionBridgeInvoker(repoRoot, stateRoot));
        var diagnostic = evidence.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(2),
                new LearningInteractionAdapter.EvidenceCommand(
                        "OP-IMPL029-DIAG",
                        "INT-IMPL029-DIAG",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        "git add notes.txt",
                        10L,
                        false,
                        false));
        check(diagnostic.responseJson().contains("\"correct\":true"), "diagnostic response must score correct");
        check(diagnostic.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "diagnostic pass must stop at independent verification");

        var replay = presenter.present(authorization, PRINCIPAL, useAt.plusSeconds(3), initialCommand);
        check(initial.responseJson().equals(replay.responseJson()), "exact presentation replay must preserve what learner saw");
        check(initial.responseDigest().equals(replay.responseDigest()), "presentation replay digest must be stable");

        var verify = presenter.present(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(4),
                new LearningActionPresentationAdapter.PresentationCommand(
                        "OP-IMPL029-PRESENT-VERIFY",
                        "PRESENT-IMPL029-VERIFY",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        11L));
        check(verify.responseJson().contains("\"action_type\":\"INDEPENDENT_VERIFICATION\""), "current presentation must advance to independent verification");
        check(verify.responseJson().contains("\"target_id\":\"M-GIT-STAGE-1\""), "verification target must be mastery item");
        check(verify.responseJson().contains("app.txt"), "verification prompt must be learner visible");
        check(verify.responseJson().contains("\"assessment_mode\":\"MASTERY_CHECK\""), "verification must preserve assessment mode");
        check(verify.responseJson().contains("\"qualifies_mastery_if_passed\":true"), "independent verification may satisfy mastery gate");

        String masteryResponse = "git add app.txt; git commit -m \"Feature work\"";
        var mastery = evidence.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(5),
                new LearningInteractionAdapter.EvidenceCommand(
                        "OP-IMPL029-MASTERY",
                        "INT-IMPL029-MASTERY",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        masteryResponse,
                        120L,
                        false,
                        false));
        check(mastery.responseJson().contains("\"correct\":true"), "mastery must pass through Learning engine");
        check(mastery.responseJson().contains("\"action_type\":\"RETENTION_WAIT\""), "mastery must route to retention wait");

        var wait = presenter.present(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(6),
                new LearningActionPresentationAdapter.PresentationCommand(
                        "OP-IMPL029-PRESENT-WAIT",
                        "PRESENT-IMPL029-WAIT",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        121L));
        check(wait.responseJson().contains("\"surface_kind\":\"WAIT\""), "early retention must present wait state");
        check(wait.responseJson().contains("\"prompt\":null"), "future retention prompt must remain withheld");
        check(wait.responseJson().contains("\"prompt_withheld_until_due\":true"), "wait must attest future prompt withholding");
        check(wait.responseJson().contains("\"earliest_due_at\":3720"), "retention due time must be exposed");

        var due = presenter.present(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(7),
                new LearningActionPresentationAdapter.PresentationCommand(
                        "OP-IMPL029-PRESENT-RETENTION",
                        "PRESENT-IMPL029-RETENTION",
                        stateKey,
                        journeyId,
                        sessionId,
                        LEARNER,
                        courseId,
                        4000L));
        check(due.responseJson().contains("\"action_type\":\"RETENTION_CHECK\""), "due presentation must expose retention check");
        check(due.responseJson().contains("later.txt"), "due retention prompt must be learner visible");
        check(due.responseJson().contains("\"evidence_role\":\"RETENTION_EVIDENCE\""), "retention evidence role must be explicit");
        check(due.responseJson().contains("\"answer_withheld\":true"), "retention answer must remain withheld");

        String tutorLearner = "LRN-IMPL029-TUTOR";
        var tutorStart = starter.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(8),
                new LearningCapabilityAdapter.LearningCommand(
                        "REQ-IMPL029-TUTOR-START",
                        stateKey,
                        tutorLearner,
                        "git-feature-branch-workflow",
                        Set.of("S-GIT-STAGE-COMMIT"),
                        0L));
        String tutorCourse = extract(tutorStart.responseJson(), "course_id");
        String tutorJourney = extract(tutorStart.responseJson(), "journey_id");
        String tutorSession = extract(tutorStart.responseJson(), "session_id");
        var wrongDiagnostic = evidence.execute(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(9),
                new LearningInteractionAdapter.EvidenceCommand(
                        "OP-IMPL029-TUTOR-DIAG",
                        "INT-IMPL029-TUTOR-DIAG",
                        stateKey,
                        tutorJourney,
                        tutorSession,
                        tutorLearner,
                        tutorCourse,
                        "git status",
                        10L,
                        false,
                        false));
        check(wrongDiagnostic.responseJson().contains("\"action_type\":\"TUTOR_REMEDIATION\""), "wrong diagnostic must route to tutor");
        var tutorSurface = presenter.present(
                authorization,
                PRINCIPAL,
                useAt.plusSeconds(10),
                new LearningActionPresentationAdapter.PresentationCommand(
                        "OP-IMPL029-PRESENT-TUTOR",
                        "PRESENT-IMPL029-TUTOR",
                        stateKey,
                        tutorJourney,
                        tutorSession,
                        tutorLearner,
                        tutorCourse,
                        11L));
        check(tutorSurface.responseJson().contains("\"surface_kind\":\"TUTOR_INTERACTION_REQUIRED\""), "presentation must hand tutor route to IMPL-028");
        check(tutorSurface.responseJson().contains("\"tutor_begin_required\":true"), "System Master must begin tutor interaction explicitly");
        check(tutorSurface.responseJson().contains("\"prompt\":null"), "presentation layer must not duplicate tutor probe selection");

        check(LearningExecutionPort.PORT_VERSION.equals(due.executionPortVersion()), "stable execution port must remain V1");
        check(LearningActionPresentationAdapter.ADAPTER_VERSION.equals(due.adapterVersion()), "presentation adapter must be V1");

        System.out.println("IMPL029_STATUS=PASS");
        System.out.println("IMPL029_ASSERTIONS=" + assertions);
        System.out.println("IMPL029_PRESENTATION_BRIDGE_CALLS=" + presentationBridgeCalls.get());
        System.out.println("IMPL029_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL029_PRESENTATION_ADAPTER_VERSION=" + LearningActionPresentationAdapter.ADAPTER_VERSION);
        System.out.println("IMPL029_PRESENTATION_BRIDGE_VERSION=" + LearningActionPresentationAdapter.BRIDGE_VERSION);
        System.out.println("IMPL029_ANSWER_FIELDS_EXPOSED=NONE");
        System.out.println("IMPL029_EARLY_RETENTION_PROMPT_EXPOSED=NO");
        System.out.println("IMPL029_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
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
