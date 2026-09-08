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

/** Authorized System Master adapter exposing PREPARE TURN and SUBMIT TURN only. */
public final class LearningTurnControllerAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-LEARNING-TURN-ADAPTER-V1";
    public static final String BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-TURN-BRIDGE-V1";
    public static final String CONTROLLER_VERSION = "SYSTEM-MASTER-UNIFIED-LEARNING-TURN-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");

    private interface TurnCommand {
        String toJson();
    }

    public record PrepareTurnCommand(
            String operationId,
            String turnId,
            String stateKey,
            String journeyId,
            String sessionId,
            String learnerId,
            String courseId,
            long now) implements TurnCommand {
        public PrepareTurnCommand {
            require(operationId, "operationId", SAFE_ID);
            require(turnId, "turnId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(journeyId, "journeyId", SAFE_ID);
            require(sessionId, "sessionId", SAFE_ID);
            require(learnerId, "learnerId", SAFE_ID);
            require(courseId, "courseId", SAFE_ID);
            if (now < 0) throw new IllegalArgumentException("INVALID:now");
        }

        @Override
        public String toJson() {
            return "{"+
                    "\"operation\":\"PREPARE_LEARNING_TURN\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"turn_id\":\"" + escape(turnId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"journey_id\":\"" + escape(journeyId) + "\","+
                    "\"session_id\":\"" + escape(sessionId) + "\","+
                    "\"learner_id\":\"" + escape(learnerId) + "\","+
                    "\"course_id\":\"" + escape(courseId) + "\","+
                    "\"now\":" + now+
                    "}";
        }
    }

    public record SubmitTurnCommand(
            String operationId,
            String turnId,
            String stateKey,
            String turnBindingDigest,
            String response,
            long submittedAt,
            boolean assisted,
            boolean answerRevealedBeforeCommit,
            int requestedHelpLevel) implements TurnCommand {
        public SubmitTurnCommand {
            require(operationId, "operationId", SAFE_ID);
            require(turnId, "turnId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(turnBindingDigest, "turnBindingDigest", SHA256);
            response = Objects.requireNonNull(response, "response");
            if (response.length() > 8192 || response.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("INVALID:response");
            }
            if (submittedAt < 0) throw new IllegalArgumentException("INVALID:submittedAt");
        }

        @Override
        public String toJson() {
            return "{"+
                    "\"operation\":\"SUBMIT_LEARNING_TURN\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"turn_id\":\"" + escape(turnId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"turn_binding_digest\":\"" + escape(turnBindingDigest) + "\","+
                    "\"response\":\"" + escape(response) + "\","+
                    "\"submitted_at\":" + submittedAt + ","+
                    "\"assisted\":" + assisted + ","+
                    "\"answer_revealed_before_commit\":" + answerRevealedBeforeCommit + ","+
                    "\"requested_help_level\":" + requestedHelpLevel+
                    "}";
        }
    }

    public record TurnResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public TurnResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_TURN_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_TURN_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("TURN_ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonTurnBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonTurnBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_turn_bridge.py");
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
            if (rc != 0) {
                throw new IllegalStateException("LEARNING_TURN_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            }
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public LearningTurnControllerAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public TurnResult prepare(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            PrepareTurnCommand command) throws Exception {
        return execute(authorization, presentedPrincipalRef, now, command, null, true);
    }

    public TurnResult submit(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            SubmitTurnCommand command) throws Exception {
        return execute(authorization, presentedPrincipalRef, now, command, command.response(), false);
    }

    private TurnResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            TurnCommand command,
            String rawLearnerResponse,
            boolean prepare) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String responseJson = bridgeInvoker.invoke(command.toJson());
        if (!responseJson.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("LEARNING_TURN_NONPASS:" + bounded(responseJson));
        }
        if (!responseJson.contains("\"controller_version\":\"" + CONTROLLER_VERSION + "\"")) {
            throw new IllegalStateException("LEARNING_TURN_CONTROLLER_VERSION_MISMATCH");
        }
        if (prepare && !responseJson.contains("\"answer_withheld\":true")) {
            throw new IllegalStateException("LEARNING_TURN_ANSWER_WITHHOLDING_NOT_ATTESTED");
        }
        if (!prepare && !responseJson.contains("\"response_echoed\":false")) {
            throw new IllegalStateException("LEARNING_TURN_RESPONSE_ECHO_BOUNDARY_NOT_ATTESTED");
        }
        if (rawLearnerResponse != null && !rawLearnerResponse.isEmpty() && responseJson.contains(rawLearnerResponse)) {
            throw new IllegalStateException("LEARNING_TURN_RAW_RESPONSE_ECHO_FORBIDDEN");
        }
        return new TurnResult(
                responseJson,
                sha256(responseJson),
                ADAPTER_VERSION,
                LearningExecutionPort.PORT_VERSION,
                authorization.authorizationRef());
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
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
