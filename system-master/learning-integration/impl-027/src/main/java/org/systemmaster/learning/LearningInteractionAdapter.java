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
 * Authorized System Master adapter for continuing an already-started Learning journey.
 *
 * This adapter owns no scoring/mastery policy. It validates execution authorization,
 * invokes the Learning interaction bridge, and requires a sanitized PASS response.
 */
public final class LearningInteractionAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-LEARNING-INTERACTION-ADAPTER-V1";
    public static final String INTERACTION_BRIDGE_VERSION = "SYSTEM-MASTER-LEARNING-INTERACTION-BRIDGE-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");

    public record EvidenceCommand(
            String operationId,
            String interactionId,
            String stateKey,
            String journeyId,
            String sessionId,
            String learnerId,
            String courseId,
            String response,
            long submittedAt,
            boolean assisted,
            boolean answerRevealedBeforeCommit) {
        public EvidenceCommand {
            require(operationId, "operationId", SAFE_ID);
            require(interactionId, "interactionId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(journeyId, "journeyId", SAFE_ID);
            require(sessionId, "sessionId", SAFE_ID);
            require(learnerId, "learnerId", SAFE_ID);
            require(courseId, "courseId", SAFE_ID);
            response = Objects.requireNonNull(response, "response");
            if (response.length() > 8192 || response.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("INVALID:response");
            }
            if (submittedAt < 0) throw new IllegalArgumentException("INVALID:submittedAt");
        }

        public String toJson() {
            return "{" +
                    "\"operation\":\"SUBMIT_ADAPTIVE_JOURNEY_EVIDENCE\"," +
                    "\"operation_id\":\"" + escape(operationId) + "\"," +
                    "\"interaction_id\":\"" + escape(interactionId) + "\"," +
                    "\"state_key\":\"" + escape(stateKey) + "\"," +
                    "\"journey_id\":\"" + escape(journeyId) + "\"," +
                    "\"session_id\":\"" + escape(sessionId) + "\"," +
                    "\"learner_id\":\"" + escape(learnerId) + "\"," +
                    "\"course_id\":\"" + escape(courseId) + "\"," +
                    "\"response\":\"" + escape(response) + "\"," +
                    "\"submitted_at\":" + submittedAt + "," +
                    "\"assisted\":" + assisted + "," +
                    "\"answer_revealed_before_commit\":" + answerRevealedBeforeCommit +
                    "}";
        }
    }

    public record InteractionResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public InteractionResult {
            if (responseJson == null || responseJson.isBlank()) {
                throw new IllegalArgumentException("EMPTY_LEARNING_INTERACTION_RESPONSE");
            }
            if (responseDigest == null || responseDigest.isBlank()) {
                throw new IllegalArgumentException("EMPTY_INTERACTION_RESPONSE_DIGEST");
            }
            if (!ADAPTER_VERSION.equals(adapterVersion)) {
                throw new IllegalArgumentException("INTERACTION_ADAPTER_VERSION_MISMATCH");
            }
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) {
                throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            }
            if (authorizationRef == null || authorizationRef.isBlank()) {
                throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
            }
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonInteractionBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonInteractionBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_interaction_bridge.py");
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
                throw new IllegalStateException("LEARNING_INTERACTION_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            }
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public LearningInteractionAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public InteractionResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            EvidenceCommand command) throws Exception {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(now, "now");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);

        String responseJson = bridgeInvoker.invoke(command.toJson());
        if (!responseJson.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("LEARNING_INTERACTION_NONPASS:" + bounded(responseJson));
        }
        if (!responseJson.contains("\"response_echoed\":false")) {
            throw new IllegalStateException("LEARNER_RESPONSE_SANITIZATION_NOT_ATTESTED");
        }
        if (!command.response().isEmpty() && responseJson.contains(command.response())) {
            throw new IllegalStateException("LEARNER_RESPONSE_ECHO_FORBIDDEN");
        }
        return new InteractionResult(
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
