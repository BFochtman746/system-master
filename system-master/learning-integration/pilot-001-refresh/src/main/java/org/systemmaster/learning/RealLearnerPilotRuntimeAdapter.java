package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Authorized System Master boundary for PILOT-001 current-runtime evidence binding.
 *
 * Assessment values are deliberately absent from every command type. Scores,
 * correctness, response digests, item families, novelty, and evidence authority are
 * derived by the Python binding from already-durable Learning turn/submission receipts.
 */
public final class RealLearnerPilotRuntimeAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-PILOT-001-RUNTIME-ADAPTER-V1";
    public static final String BRIDGE_VERSION = "SYSTEM-MASTER-PILOT-001-RUNTIME-BRIDGE-V1";
    public static final String BINDING_VERSION = "PILOT-001-CURRENT-RUNTIME-BINDING-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Pattern SAFE_PARTICIPANT = Pattern.compile("^[A-Z0-9][A-Z0-9_-]{5,63}$");

    public sealed interface PilotCommand permits StartCommand, CaptureCommand, SummaryCommand, CompleteCommand, WithdrawCommand {
        String stateKey();
        String toJson();
    }

    public record StartCommand(
            String operationId,
            String stateKey,
            String pilotId,
            String participantKey,
            String journeyId,
            String sessionId,
            String learnerId,
            String courseId,
            long startedAt,
            long consentedAt,
            boolean consentRecorded) implements PilotCommand {
        public StartCommand {
            require(operationId, "operationId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(pilotId, "pilotId", SAFE_ID);
            require(participantKey, "participantKey", SAFE_PARTICIPANT);
            require(journeyId, "journeyId", SAFE_ID);
            require(sessionId, "sessionId", SAFE_ID);
            require(learnerId, "learnerId", SAFE_ID);
            require(courseId, "courseId", SAFE_ID);
            if (startedAt < 0 || consentedAt < startedAt) throw new IllegalArgumentException("INVALID:PILOT_TIME");
            if (!consentRecorded) throw new IllegalArgumentException("PILOT_EXPLICIT_CONSENT_REQUIRED");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"START_REAL_LEARNER_PILOT\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"pilot_id\":\"" + escape(pilotId) + "\","+
                    "\"participant_key\":\"" + escape(participantKey) + "\","+
                    "\"journey_id\":\"" + escape(journeyId) + "\","+
                    "\"session_id\":\"" + escape(sessionId) + "\","+
                    "\"learner_id\":\"" + escape(learnerId) + "\","+
                    "\"course_id\":\"" + escape(courseId) + "\","+
                    "\"started_at\":" + startedAt + ","+
                    "\"consented_at\":" + consentedAt + ","+
                    "\"consent_recorded\":true"+
                    "}";
        }
    }

    public record CaptureCommand(
            String operationId,
            String stateKey,
            String pilotId,
            String turnId) implements PilotCommand {
        public CaptureCommand {
            require(operationId, "operationId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(pilotId, "pilotId", SAFE_ID);
            require(turnId, "turnId", SAFE_ID);
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"CAPTURE_REAL_LEARNER_PILOT_TURN\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"pilot_id\":\"" + escape(pilotId) + "\","+
                    "\"turn_id\":\"" + escape(turnId) + "\""+
                    "}";
        }
    }

    public record SummaryCommand(String stateKey, String pilotId) implements PilotCommand {
        public SummaryCommand {
            require(stateKey, "stateKey", SAFE_STATE);
            require(pilotId, "pilotId", SAFE_ID);
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"GET_REAL_LEARNER_PILOT_SUMMARY\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"pilot_id\":\"" + escape(pilotId) + "\""+
                    "}";
        }
    }

    public record CompleteCommand(
            String operationId,
            String stateKey,
            String pilotId,
            long completedAt) implements PilotCommand {
        public CompleteCommand {
            require(operationId, "operationId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(pilotId, "pilotId", SAFE_ID);
            if (completedAt < 0) throw new IllegalArgumentException("INVALID:completedAt");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"COMPLETE_REAL_LEARNER_PILOT\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"pilot_id\":\"" + escape(pilotId) + "\","+
                    "\"completed_at\":" + completedAt+
                    "}";
        }
    }

    public record WithdrawCommand(
            String operationId,
            String stateKey,
            String pilotId,
            long withdrawnAt) implements PilotCommand {
        public WithdrawCommand {
            require(operationId, "operationId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(pilotId, "pilotId", SAFE_ID);
            if (withdrawnAt < 0) throw new IllegalArgumentException("INVALID:withdrawnAt");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"WITHDRAW_REAL_LEARNER_PILOT\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"pilot_id\":\"" + escape(pilotId) + "\","+
                    "\"withdrawn_at\":" + withdrawnAt+
                    "}";
        }
    }

    public record PilotRuntimeResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public PilotRuntimeResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_PILOT_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_PILOT_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("PILOT_ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonPilotRuntimeBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonPilotRuntimeBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_pilot_runtime_bridge.py");
            builder.directory(repositoryRoot.toFile());
            builder.environment().put("SYSTEM_MASTER_LEARNING_STATE_ROOT", stateRoot.toString());
            Process process = builder.start();
            try (var stdin = process.getOutputStream()) {
                stdin.write(requestJson.getBytes(StandardCharsets.UTF_8));
            }
            byte[] stdout = process.getInputStream().readAllBytes();
            byte[] stderr = process.getErrorStream().readAllBytes();
            int rc = process.waitFor();
            String out = new String(stdout, StandardCharsets.UTF_8).trim();
            String err = new String(stderr, StandardCharsets.UTF_8).trim();
            if (rc != 0) throw new IllegalStateException("PILOT_RUNTIME_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public RealLearnerPilotRuntimeAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public PilotRuntimeResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            PilotCommand command) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String request = command.toJson();
        rejectEvidenceInjectionSurface(request);
        String response = bridgeInvoker.invoke(request);
        if (!response.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("PILOT_RUNTIME_NONPASS:" + bounded(response));
        }
        if (!response.contains("\"pilot_runtime_bridge_version\":\"" + BRIDGE_VERSION + "\"")) {
            throw new IllegalStateException("PILOT_RUNTIME_BRIDGE_VERSION_MISMATCH");
        }
        if (response.contains("\"response\":")) {
            throw new IllegalStateException("PILOT_RUNTIME_RAW_RESPONSE_EXPORTED");
        }
        return new PilotRuntimeResult(
                response,
                sha256(response),
                ADAPTER_VERSION,
                LearningExecutionPort.PORT_VERSION,
                authorization.authorizationRef());
    }

    private static void rejectEvidenceInjectionSurface(String request) {
        String[] forbidden = {
                "\"response\":", "\"raw_response\":", "\"score\":", "\"max_score\":",
                "\"passed\":", "\"correct\":", "\"response_digest\":",
                "\"item_family_id\":", "\"family_id\":", "\"novel_context\":"
        };
        for (String key : forbidden) {
            if (request.contains(key)) throw new IllegalArgumentException("PILOT_RUNTIME_EVIDENCE_INJECTION_SURFACE:" + key);
        }
    }

    private static void require(String value, String name, Pattern pattern) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        if (!pattern.matcher(value).matches()) throw new IllegalArgumentException("INVALID:" + name);
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static String bounded(String value) {
        String normalized = value == null ? "" : value.replace('\r', ' ').replace('\n', ' ');
        return normalized.length() <= 512 ? normalized : normalized.substring(0, 512);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
