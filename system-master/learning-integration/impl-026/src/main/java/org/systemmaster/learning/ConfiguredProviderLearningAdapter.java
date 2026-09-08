package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Thin System Master command adapter for the provider configuration boundary.
 * Endpoint/model/provider/sample configuration is deliberately absent from this command schema.
 */
public final class ConfiguredProviderLearningAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-CONFIGURED-PROVIDER-ADAPTER-V1";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Pattern SAFE_SKILL = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");

    public record ConfiguredProviderCommand(
            String operationId,
            String batchId,
            String requestId,
            String stateKey,
            String learnerId,
            String desiredOutcome,
            Set<String> claimedSkillIds,
            long now) {
        public ConfiguredProviderCommand {
            require(operationId, "operationId", SAFE_ID);
            require(batchId, "batchId", SAFE_ID);
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            desiredOutcome = requireGoal(desiredOutcome);
            claimedSkillIds = validatedSkills(claimedSkillIds);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        public String toJson() {
            return "{"+
                    "\"operation\":\"START_CONFIGURED_FULL_HTTP_PROVIDER_ADAPTIVE_ENTRY\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"batch_id\":\"" + escape(batchId) + "\","+
                    "\"request_id\":\"" + escape(requestId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"learner_id\":\"" + escape(learnerId) + "\","+
                    "\"desired_outcome\":\"" + escape(desiredOutcome) + "\","+
                    "\"claimed_skill_ids\":" + jsonStringArray(claimedSkillIds) + ","+
                    "\"now\":" + now+
                    "}";
        }
    }

    public record ConfiguredProviderResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public ConfiguredProviderResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_LEARNING_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    private final LearningCapabilityAdapter.BridgeInvoker bridgeInvoker;

    public ConfiguredProviderLearningAdapter(LearningCapabilityAdapter.BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public ConfiguredProviderResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            ConfiguredProviderCommand command) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);
        String response = bridgeInvoker.invoke(command.toJson());
        boolean pass = response.contains("\"status\":\"PASS\"");
        boolean abstain = response.contains("\"status\":\"ABSTAIN\"");
        if (!pass && !abstain) {
            throw new IllegalStateException("LEARNING_BRIDGE_NONPASS:" + bounded(response));
        }
        return new ConfiguredProviderResult(
                response,
                sha256(response),
                ADAPTER_VERSION,
                LearningExecutionPort.PORT_VERSION,
                authorization.authorizationRef());
    }

    private static Set<String> validatedSkills(Set<String> skills) {
        Set<String> out = Set.copyOf(Objects.requireNonNull(skills, "claimedSkillIds"));
        for (String skill : out) require(skill, "claimedSkillId", SAFE_SKILL);
        return out;
    }

    private static String jsonStringArray(Set<String> values) {
        StringBuilder out = new StringBuilder("[");
        boolean first = true;
        for (String value : new TreeSet<>(values)) {
            if (!first) out.append(',');
            first = false;
            out.append('"').append(escape(value)).append('"');
        }
        return out.append(']').toString();
    }

    private static String requireGoal(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:desiredOutcome");
        String trimmed = value.trim();
        if (trimmed.length() > 1000) throw new IllegalArgumentException("INVALID:desiredOutcome");
        for (int i = 0; i < trimmed.length(); i++) {
            char ch = trimmed.charAt(i);
            if (ch < 32 && ch != '\t' && ch != '\n' && ch != '\r') {
                throw new IllegalArgumentException("INVALID:desiredOutcome");
            }
        }
        return trimmed;
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
