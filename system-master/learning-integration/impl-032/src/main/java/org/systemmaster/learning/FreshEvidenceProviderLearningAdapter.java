package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * System Master capability adapter for provider-generated fresh evidence recovery.
 * Provider/model/endpoints/credentials are intentionally absent from this command schema.
 */
public final class FreshEvidenceProviderLearningAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-FRESH-EVIDENCE-PROVIDER-ADAPTER-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Set<String> ALLOWED_KINDS = Set.of("maintenance", "transfer");

    public record FreshEvidenceCommand(
            String operationId,
            String requestId,
            String stateKey,
            String courseId,
            String kind,
            String skillId,
            String criterionId,
            long requestedAt,
            long admittedAt) {
        public FreshEvidenceCommand {
            require(operationId, "operationId", SAFE_ID);
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(courseId, "courseId", SAFE_ID);
            require(skillId, "skillId", SAFE_ID);
            require(criterionId, "criterionId", SAFE_ID);
            if (!ALLOWED_KINDS.contains(kind)) throw new IllegalArgumentException("INVALID:kind");
            if (requestedAt < 0) throw new IllegalArgumentException("INVALID:requestedAt");
            if (admittedAt < 0) throw new IllegalArgumentException("INVALID:admittedAt");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"ACQUIRE_CONFIGURED_FRESH_EVIDENCE\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"request_id\":\"" + escape(requestId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"course_id\":\"" + escape(courseId) + "\","+
                    "\"kind\":\"" + escape(kind) + "\","+
                    "\"skill_id\":\"" + escape(skillId) + "\","+
                    "\"criterion_id\":\"" + escape(criterionId) + "\","+
                    "\"requested_at\":" + requestedAt + ","+
                    "\"admitted_at\":" + admittedAt+
                    "}";
        }
    }

    public record FreshEvidenceResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public FreshEvidenceResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_LEARNING_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    private final LearningCapabilityAdapter.BridgeInvoker bridgeInvoker;

    public FreshEvidenceProviderLearningAdapter(LearningCapabilityAdapter.BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public FreshEvidenceResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            FreshEvidenceCommand command) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String response = bridgeInvoker.invoke(command.toJson());
        if (!response.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("LEARNING_BRIDGE_NONPASS:" + bounded(response));
        }
        return new FreshEvidenceResult(
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
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private static String bounded(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ');
        return normalized.length() <= 400 ? normalized : normalized.substring(0, 400);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
