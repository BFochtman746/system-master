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

/** Authorized System Master boundary for Learning-owned formative tutor interaction. */
public final class LearningTutorInteractionAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-LEARNING-TUTOR-ADAPTER-V1";
    public static final String TUTOR_BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-TUTOR-BRIDGE-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");

    private interface TutorCommand {
        String toJson();
    }

    public record BeginTutorCommand(
            String operationId,
            String tutorInteractionId,
            String stateKey,
            String journeyId,
            String sessionId,
            String learnerId,
            String courseId,
            long now) implements TutorCommand {
        public BeginTutorCommand {
            require(operationId, "operationId", SAFE_ID);
            require(tutorInteractionId, "tutorInteractionId", SAFE_ID);
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
                    "\"operation\":\"BEGIN_ADAPTIVE_TUTOR_INTERACTION\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"tutor_interaction_id\":\"" + escape(tutorInteractionId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"journey_id\":\"" + escape(journeyId) + "\","+
                    "\"session_id\":\"" + escape(sessionId) + "\","+
                    "\"learner_id\":\"" + escape(learnerId) + "\","+
                    "\"course_id\":\"" + escape(courseId) + "\","+
                    "\"now\":" + now+
                    "}";
        }
    }

    public record SubmitTutorCommand(
            String operationId,
            String tutorInteractionId,
            String turnId,
            String stateKey,
            String response,
            int requestedHelpLevel,
            long submittedAt) implements TutorCommand {
        public SubmitTutorCommand {
            require(operationId, "operationId", SAFE_ID);
            require(tutorInteractionId, "tutorInteractionId", SAFE_ID);
            require(turnId, "turnId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            response = Objects.requireNonNull(response, "response");
            if (response.length() > 8192 || response.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("INVALID:response");
            }
            if (submittedAt < 0) throw new IllegalArgumentException("INVALID:submittedAt");
        }

        @Override
        public String toJson() {
            return "{"+
                    "\"operation\":\"SUBMIT_ADAPTIVE_TUTOR_INTERACTION\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"tutor_interaction_id\":\"" + escape(tutorInteractionId) + "\","+
                    "\"turn_id\":\"" + escape(turnId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"response\":\"" + escape(response) + "\","+
                    "\"requested_help_level\":" + requestedHelpLevel + ","+
                    "\"submitted_at\":" + submittedAt+
                    "}";
        }
    }

    public record TutorResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public TutorResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_TUTOR_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_TUTOR_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("TUTOR_ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonTutorBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonTutorBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_tutor_bridge.py");
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
                throw new IllegalStateException("LEARNING_TUTOR_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            }
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public LearningTutorInteractionAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public TutorResult begin(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            BeginTutorCommand command) throws Exception {
        return execute(authorization, presentedPrincipalRef, now, command, null, true);
    }

    public TutorResult submit(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            SubmitTutorCommand command) throws Exception {
        return execute(authorization, presentedPrincipalRef, now, command, command.response(), false);
    }

    private TutorResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            TutorCommand command,
            String rawLearnerResponse,
            boolean requireAnswerWithheld) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String responseJson = bridgeInvoker.invoke(command.toJson());
        if (!responseJson.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("LEARNING_TUTOR_NONPASS:" + bounded(responseJson));
        }
        if (requireAnswerWithheld && !responseJson.contains("\"answer_withheld\":true")) {
            throw new IllegalStateException("TUTOR_ANSWER_WITHHOLDING_NOT_ATTESTED");
        }
        if (!requireAnswerWithheld && !responseJson.contains("\"tutor_formative_only\":true")) {
            throw new IllegalStateException("TUTOR_FORMATIVE_BOUNDARY_NOT_ATTESTED");
        }
        if (rawLearnerResponse != null && !rawLearnerResponse.isEmpty() && responseJson.contains(rawLearnerResponse)) {
            throw new IllegalStateException("TUTOR_LEARNER_RESPONSE_ECHO_FORBIDDEN");
        }
        return new TutorResult(
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
