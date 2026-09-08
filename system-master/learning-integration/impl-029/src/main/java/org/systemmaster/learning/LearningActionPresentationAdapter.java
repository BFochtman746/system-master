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

/** Authorized System Master boundary for answer-withheld Learning action presentation. */
public final class LearningActionPresentationAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-LEARNING-ACTION-PRESENTATION-ADAPTER-V1";
    public static final String BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-ACTION-PRESENTATION-BRIDGE-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");

    public record PresentationCommand(
            String operationId,
            String presentationId,
            String stateKey,
            String journeyId,
            String sessionId,
            String learnerId,
            String courseId,
            long now) {
        public PresentationCommand {
            require(operationId, "operationId", SAFE_ID);
            require(presentationId, "presentationId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(journeyId, "journeyId", SAFE_ID);
            require(sessionId, "sessionId", SAFE_ID);
            require(learnerId, "learnerId", SAFE_ID);
            require(courseId, "courseId", SAFE_ID);
            if (now < 0) throw new IllegalArgumentException("INVALID:now");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"PRESENT_CURRENT_LEARNING_ACTION\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"presentation_id\":\"" + escape(presentationId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"journey_id\":\"" + escape(journeyId) + "\","+
                    "\"session_id\":\"" + escape(sessionId) + "\","+
                    "\"learner_id\":\"" + escape(learnerId) + "\","+
                    "\"course_id\":\"" + escape(courseId) + "\","+
                    "\"now\":" + now+
                    "}";
        }
    }

    public record PresentationResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public PresentationResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_PRESENTATION_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_PRESENTATION_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("PRESENTATION_ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonPresentationBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonPresentationBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_action_presentation_bridge.py");
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
                throw new IllegalStateException("LEARNING_PRESENTATION_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            }
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public LearningActionPresentationAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public PresentationResult present(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            PresentationCommand command) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String response = bridgeInvoker.invoke(command.toJson());
        if (!response.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("LEARNING_PRESENTATION_NONPASS:" + bounded(response));
        }
        if (!response.contains("\"answer_withheld\":true")) {
            throw new IllegalStateException("LEARNING_PRESENTATION_ANSWER_WITHHOLDING_NOT_ATTESTED");
        }
        if (response.contains("\"answer\":") || response.contains("\"rationale\":") || response.contains("\"response\":")) {
            throw new IllegalStateException("LEARNING_PRESENTATION_SECRET_FIELD_LEAK");
        }
        return new PresentationResult(
                response,
                sha256(response),
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
