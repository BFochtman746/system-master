package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

public final class Pilot001RefreshRuntimeBindingQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Path.of(requiredEnv("SYSTEM_MASTER_LEARNING_STATE_ROOT")).toAbsolutePath().normalize();
        String courseId = requiredEnv("PILOT_REFRESH_COURSE_ID");
        String learnerId = requiredEnv("PILOT_REFRESH_LEARNER_ID");
        String journeyId = requiredEnv("PILOT_REFRESH_JOURNEY_ID");
        String sessionId = requiredEnv("PILOT_REFRESH_SESSION_ID");
        String diagTurnId = requiredEnv("PILOT_REFRESH_DIAG_TURN_ID");
        String verifyTurnId = requiredEnv("PILOT_REFRESH_VERIFY_TURN_ID");
        String diagResponse = requiredEnv("PILOT_REFRESH_DIAG_RAW_RESPONSE");
        String verifyResponse = requiredEnv("PILOT_REFRESH_VERIFY_RAW_RESPONSE");

        Instant authorizedAt = Instant.parse("2026-09-08T21:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-PILOT-REFRESH-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                34L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-PILOT-REFRESH-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        var realInvoker = new RealLearnerPilotRuntimeAdapter.PythonPilotRuntimeBridgeInvoker(repoRoot, stateRoot);
        RealLearnerPilotRuntimeAdapter.BridgeInvoker counted = request -> {
            bridgeCalls.incrementAndGet();
            return realInvoker.invoke(request);
        };
        var adapter = new RealLearnerPilotRuntimeAdapter(counted);

        var start = new RealLearnerPilotRuntimeAdapter.StartCommand(
                "OP-JAVA-PILOT-START",
                "pilot-refresh-java",
                "PILOT-001-REFRESH-JAVA-0001",
                "LRN-REFRESH-JAVA-0001",
                journeyId,
                sessionId,
                learnerId,
                courseId,
                0L,
                1L,
                true);
        assertNoEvidenceInjectionFields(start.toJson());
        expectSecurity(() -> adapter.execute(authorization, "WRONG_PRINCIPAL", useAt, start), "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == 0, "authorization denial must precede pilot bridge execution");

        var startResult = adapter.execute(authorization, PRINCIPAL, useAt, start);
        check(startResult.responseJson().contains("\"standing\":\"CONSENTED_RUNTIME_BINDING_READY\""),
                "pilot must start only after consent binding");
        check(startResult.responseJson().contains("\"binding_version\":\"PILOT-001-CURRENT-RUNTIME-BINDING-V1\""),
                "runtime binding version must be explicit");

        var captureDiag = new RealLearnerPilotRuntimeAdapter.CaptureCommand(
                "OP-JAVA-PILOT-CAPTURE-DIAG",
                "pilot-refresh-java",
                "PILOT-001-REFRESH-JAVA-0001",
                diagTurnId);
        assertNoEvidenceInjectionFields(captureDiag.toJson());
        var diagResult = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(1), captureDiag);
        check(diagResult.responseJson().contains("\"captured_action_type\":\"DIAGNOSTIC_PROBE\""),
                "diagnostic turn must bind from durable runtime receipt");

        var captureVerify = new RealLearnerPilotRuntimeAdapter.CaptureCommand(
                "OP-JAVA-PILOT-CAPTURE-VERIFY",
                "pilot-refresh-java",
                "PILOT-001-REFRESH-JAVA-0001",
                verifyTurnId);
        assertNoEvidenceInjectionFields(captureVerify.toJson());
        var verifyResult = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(2), captureVerify);
        check(verifyResult.responseJson().contains("\"captured_action_type\":\"INDEPENDENT_VERIFICATION\""),
                "verification turn must bind from durable runtime receipt");

        var summary = new RealLearnerPilotRuntimeAdapter.SummaryCommand(
                "pilot-refresh-java",
                "PILOT-001-REFRESH-JAVA-0001");
        assertNoEvidenceInjectionFields(summary.toJson());
        var summaryResult = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(3), summary);
        String body = summaryResult.responseJson();
        check(body.contains("\"status\":\"VALID_IN_PROGRESS\""), "pilot record must remain valid in progress");
        check(body.contains("\"participant_outcome\":\"INCOMPLETE\""), "no delayed evidence may be fabricated");
        check(body.contains("\"event_type\":\"BASELINE_COMPLETED\""), "baseline event must be materialized");
        check(body.contains("\"event_type\":\"INDEPENDENT_VERIFICATION_COMPLETED\""),
                "verification event must be materialized");
        check(body.contains("\"item_family_id\":\"F-GIT-STAGE-M1\""),
                "verification family must derive from frozen runtime task metadata");
        check(body.contains("\"response_digest\":"), "pilot record must contain response digest evidence");
        check(!body.contains(diagResponse), "diagnostic raw answer must not be exported");
        check(!body.contains(verifyResponse), "verification raw answer must not be exported");
        check(!body.contains("\"response\":"), "raw response field must not be exported");
        check(body.contains("\"pilot_scores_supplied_by_caller\":false"), "caller score authority must be false");
        check(body.contains("\"a01_may_manufacture_human_evidence\":false"), "A-01 human-evidence authority must be false");
        check(body.contains("\"real_learner_effectiveness\":\"NOT_PROVEN\""), "effectiveness must remain unproven");

        var withdraw = new RealLearnerPilotRuntimeAdapter.WithdrawCommand(
                "OP-JAVA-PILOT-WITHDRAW",
                "pilot-refresh-java",
                "PILOT-001-REFRESH-JAVA-0001",
                130L);
        var withdrawal = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(4), withdraw);
        check(withdrawal.responseJson().contains("\"participant_outcome\":\"WITHDRAWN\""),
                "withdrawal must remain a valid terminal outcome");
        check(withdrawal.responseJson().contains("\"eligible_for_effectiveness_review\":false"),
                "withdrawn record must remain excluded from effectiveness review");

        check(bridgeCalls.get() == 5, "expected start + two captures + summary + withdrawal bridge calls");
        check(LearningExecutionPort.PORT_VERSION.equals(summaryResult.executionPortVersion()),
                "Learning execution port must remain V1");
        check(RealLearnerPilotRuntimeAdapter.ADAPTER_VERSION.equals(summaryResult.adapterVersion()),
                "pilot adapter version must match");

        System.out.println("PILOT_REFRESH_STATUS=PASS");
        System.out.println("PILOT_REFRESH_ASSERTIONS=" + assertions);
        System.out.println("PILOT_REFRESH_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("PILOT_REFRESH_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("PILOT_REFRESH_ADAPTER_VERSION=" + RealLearnerPilotRuntimeAdapter.ADAPTER_VERSION);
        System.out.println("PILOT_REFRESH_CALLER_EVIDENCE_FIELDS=NONE");
        System.out.println("PILOT_REFRESH_RAW_RESPONSE_EXPORT=NONE");
        System.out.println("PILOT_REFRESH_HUMAN_EVIDENCE=NOT_MANUFACTURED");
    }

    private static void assertNoEvidenceInjectionFields(String request) {
        String[] forbidden = {
                "\"response\":", "\"raw_response\":", "\"score\":", "\"max_score\":",
                "\"passed\":", "\"correct\":", "\"response_digest\":",
                "\"item_family_id\":", "\"family_id\":", "\"novel_context\":"
        };
        for (String key : forbidden) {
            check(!request.contains(key), "pilot command must not expose evidence field " + key);
        }
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
