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
 * Authorized System Master adapter for preparing a Learning turn with automatic
 * fresh-evidence blocker recovery. Provider configuration and recovery scope are
 * intentionally absent from the caller command.
 */
public final class UnifiedFreshEvidenceRecoveryLearningAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-UNIFIED-FRESH-EVIDENCE-RECOVERY-ADAPTER-V1";
    public static final String RECOVERY_VERSION = "UNIFIED-FRESH-EVIDENCE-RECOVERY-V1";
    public static final String BRIDGE_VERSION = "SYSTEM-MASTER-RECOVERY-TURN-BRIDGE-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");

    public record PrepareWithRecoveryCommand(
            String operationId,
            String recoveryId,
            String turnId,
            String stateKey,
            String journeyId,
            String sessionId,
            String learnerId,
            String courseId,
            long now) {
        public PrepareWithRecoveryCommand {
            require(operationId, "operationId", SAFE_ID);
            require(recoveryId, "recoveryId", SAFE_ID);
            require(turnId, "turnId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(journeyId, "journeyId", SAFE_ID);
            require(sessionId, "sessionId", SAFE_ID);
            require(learnerId, "learnerId", SAFE_ID);
            require(courseId, "courseId", SAFE_ID);
            if (now < 0) throw new IllegalArgumentException("INVALID:now");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"PREPARE_LEARNING_TURN_WITH_FRESH_EVIDENCE_RECOVERY\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"recovery_id\":\"" + escape(recoveryId) + "\","+
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

    public record RecoveryTurnResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public RecoveryTurnResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_RECOVERY_TURN_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_RECOVERY_TURN_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("RECOVERY_ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonRecoveryTurnBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonRecoveryTurnBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_recovery_turn_bridge.py");
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
                throw new IllegalStateException("RECOVERY_TURN_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            }
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public UnifiedFreshEvidenceRecoveryLearningAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public RecoveryTurnResult prepare(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            PrepareWithRecoveryCommand command) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String response = bridgeInvoker.invoke(command.toJson());
        if (!response.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("RECOVERY_TURN_NONPASS:" + bounded(response));
        }
        if (!response.contains("\"fresh_evidence_recovery_version\":\"" + RECOVERY_VERSION + "\"")) {
            throw new IllegalStateException("RECOVERY_VERSION_MISMATCH");
        }
        if (!response.contains("\"answer_withheld\":true")) {
            throw new IllegalStateException("RECOVERY_TURN_ANSWER_WITHHOLDING_NOT_ATTESTED");
        }
        if (response.contains("\"recovery_performed\":true")) {
            if (!response.contains("\"admission_standing\":\"INDEPENDENT_ORACLE_VALIDATED_FRESH_EVIDENCE_TASK\"")) {
                throw new IllegalStateException("RECOVERY_INDEPENDENT_ADMISSION_NOT_ATTESTED");
            }
            if (!response.contains("\"caller_selects_recovery_scope\":false")) {
                throw new IllegalStateException("RECOVERY_CALLER_SCOPE_AUTHORITY_NOT_REJECTED");
            }
        }
        return new RecoveryTurnResult(
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
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
