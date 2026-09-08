package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * System Master Learning capability adapter with the full durable HTTP provider path.
 * Provider credentials are deliberately absent from every command payload. The Python
 * subprocess inherits credentials from the authorized System Master process environment.
 */
public final class LearningCapabilityAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-LEARNING-ADAPTER-V7";
    public static final int MIN_PROVIDER_SAMPLES = 2;
    public static final int MAX_PROVIDER_SAMPLES = 4;

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Pattern SAFE_DOMAIN = Pattern.compile("^[a-z0-9][a-z0-9-]{0,95}$");
    private static final Pattern SAFE_SKILL = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");

    private interface CommandPayload {
        String toJson();
    }

    public record LearningCommand(
            String requestId,
            String stateKey,
            String learnerId,
            String domainKey,
            Set<String> claimedSkillIds,
            long now) implements CommandPayload {
        public LearningCommand {
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            require(domainKey, "domainKey", SAFE_DOMAIN);
            claimedSkillIds = validatedSkills(claimedSkillIds);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        @Override
        public String toJson() {
            return baseJson(
                    "START_ADAPTIVE_ENTRY", requestId, stateKey, learnerId,
                    "\"domain_key\":\"" + escape(domainKey) + "\",",
                    claimedSkillIds, now);
        }
    }

    public record OpenGoalCommand(
            String requestId,
            String stateKey,
            String learnerId,
            String desiredOutcome,
            Set<String> claimedSkillIds,
            long now) implements CommandPayload {
        public OpenGoalCommand {
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            desiredOutcome = requireGoal(desiredOutcome);
            claimedSkillIds = validatedSkills(claimedSkillIds);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        @Override
        public String toJson() {
            return baseJson(
                    "START_OPEN_GOAL_ADAPTIVE_ENTRY", requestId, stateKey, learnerId,
                    "\"desired_outcome\":\"" + escape(desiredOutcome) + "\",",
                    claimedSkillIds, now);
        }
    }

    public record OpenGoalPacketCommand(
            String requestId,
            String stateKey,
            String learnerId,
            String inputPacketId,
            Set<String> claimedSkillIds,
            long now) implements CommandPayload {
        public OpenGoalPacketCommand {
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            require(inputPacketId, "inputPacketId", SAFE_ID);
            claimedSkillIds = validatedSkills(claimedSkillIds);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        @Override
        public String toJson() {
            return baseJson(
                    "START_OPEN_GOAL_PACKET_ADAPTIVE_ENTRY", requestId, stateKey, learnerId,
                    "\"input_packet_id\":\"" + escape(inputPacketId) + "\",",
                    claimedSkillIds, now);
        }
    }

    public record OpenGoalMultiCandidatePacketCommand(
            String requestId,
            String stateKey,
            String learnerId,
            Set<String> inputPacketIds,
            Set<String> claimedSkillIds,
            long now) implements CommandPayload {
        public OpenGoalMultiCandidatePacketCommand {
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            inputPacketIds = validatedPacketIds(inputPacketIds);
            claimedSkillIds = validatedSkills(claimedSkillIds);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        @Override
        public String toJson() {
            return baseJson(
                    "START_OPEN_GOAL_MULTI_CANDIDATE_PACKET_ADAPTIVE_ENTRY",
                    requestId,
                    stateKey,
                    learnerId,
                    "\"input_packet_ids\":" + jsonStringArray(inputPacketIds) + ",",
                    claimedSkillIds,
                    now);
        }
    }

    public record FullHttpProviderCommand(
            String operationId,
            String batchId,
            String requestId,
            String stateKey,
            String learnerId,
            String desiredOutcome,
            int sampleCount,
            String modelId,
            String researchEndpoint,
            String modelEndpoint,
            Set<String> claimedSkillIds,
            long now) implements CommandPayload {
        public FullHttpProviderCommand {
            require(operationId, "operationId", SAFE_ID);
            require(batchId, "batchId", SAFE_ID);
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            desiredOutcome = requireGoal(desiredOutcome);
            if (sampleCount < MIN_PROVIDER_SAMPLES || sampleCount > MAX_PROVIDER_SAMPLES) {
                throw new IllegalArgumentException("PROVIDER_MULTI_SAMPLE_COUNT_OUT_OF_BOUNDS");
            }
            require(modelId, "modelId", SAFE_ID);
            researchEndpoint = requireEndpoint(researchEndpoint, "researchEndpoint");
            modelEndpoint = requireEndpoint(modelEndpoint, "modelEndpoint");
            claimedSkillIds = validatedSkills(claimedSkillIds);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        @Override
        public String toJson() {
            return "{"+
                    "\"operation\":\"START_FULL_HTTP_PROVIDER_ADAPTIVE_ENTRY\","+
                    "\"operation_id\":\"" + escape(operationId) + "\","+
                    "\"batch_id\":\"" + escape(batchId) + "\","+
                    "\"request_id\":\"" + escape(requestId) + "\","+
                    "\"state_key\":\"" + escape(stateKey) + "\","+
                    "\"learner_id\":\"" + escape(learnerId) + "\","+
                    "\"desired_outcome\":\"" + escape(desiredOutcome) + "\","+
                    "\"sample_count\":" + sampleCount + ","+
                    "\"model_id\":\"" + escape(modelId) + "\","+
                    "\"research_endpoint\":\"" + escape(researchEndpoint) + "\","+
                    "\"model_endpoint\":\"" + escape(modelEndpoint) + "\","+
                    "\"claimed_skill_ids\":" + jsonStringArray(claimedSkillIds) + ","+
                    "\"now\":" + now+
                    "}";
        }
    }

    public record LearningResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public LearningResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_LEARNING_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_bridge.py");
            builder.directory(repositoryRoot.toFile());
            builder.environment().put("SYSTEM_MASTER_LEARNING_STATE_ROOT", stateRoot.toString());
            // Provider credentials are intentionally not copied from request JSON.
            // ProcessBuilder inherits the already-authorized System Master environment.
            Process process = builder.start();
            try (var stdin = process.getOutputStream()) {
                stdin.write(requestJson.getBytes(StandardCharsets.UTF_8));
            }
            byte[] stdout = process.getInputStream().readAllBytes();
            byte[] stderr = process.getErrorStream().readAllBytes();
            int rc = process.waitFor();
            String out = new String(stdout, StandardCharsets.UTF_8).trim();
            String err = new String(stderr, StandardCharsets.UTF_8).trim();
            if (rc != 0) throw new IllegalStateException("LEARNING_BRIDGE_EXIT_" + rc + ":" + bounded(out + " " + err));
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public LearningCapabilityAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public LearningResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            LearningCommand command) throws Exception {
        return executePayload(authorization, presentedPrincipalRef, now, command, false);
    }

    public LearningResult executeOpenGoal(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            OpenGoalCommand command) throws Exception {
        return executePayload(authorization, presentedPrincipalRef, now, command, false);
    }

    public LearningResult executeOpenGoalPacket(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            OpenGoalPacketCommand command) throws Exception {
        return executePayload(authorization, presentedPrincipalRef, now, command, false);
    }

    public LearningResult executeOpenGoalMultiCandidatePackets(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            OpenGoalMultiCandidatePacketCommand command) throws Exception {
        return executePayload(authorization, presentedPrincipalRef, now, command, true);
    }

    public LearningResult executeFullHttpProvider(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            FullHttpProviderCommand command) throws Exception {
        return executePayload(authorization, presentedPrincipalRef, now, command, true);
    }

    private LearningResult executePayload(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            CommandPayload command,
            boolean allowQualifiedAbstention) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);

        String response = bridgeInvoker.invoke(command.toJson());
        boolean pass = response.contains("\"status\":\"PASS\"");
        boolean abstain = allowQualifiedAbstention && response.contains("\"status\":\"ABSTAIN\"");
        if (!pass && !abstain) {
            throw new IllegalStateException("LEARNING_BRIDGE_NONPASS:" + bounded(response));
        }
        return new LearningResult(
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

    private static Set<String> validatedPacketIds(Set<String> packetIds) {
        Set<String> out = Set.copyOf(Objects.requireNonNull(packetIds, "inputPacketIds"));
        if (out.size() < 2) throw new IllegalArgumentException("PROVIDER_MULTI_CANDIDATE_SET_TOO_SMALL");
        for (String packetId : out) require(packetId, "inputPacketId", SAFE_ID);
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

    private static String baseJson(
            String operation,
            String requestId,
            String stateKey,
            String learnerId,
            String extraField,
            Set<String> claimedSkillIds,
            long now) {
        StringBuilder skills = new StringBuilder();
        boolean first = true;
        for (String skill : new TreeSet<>(claimedSkillIds)) {
            if (!first) skills.append(',');
            first = false;
            skills.append('"').append(escape(skill)).append('"');
        }
        return "{"+
                "\"operation\":\"" + escape(operation) + "\","+
                "\"request_id\":\"" + escape(requestId) + "\","+
                "\"state_key\":\"" + escape(stateKey) + "\","+
                "\"learner_id\":\"" + escape(learnerId) + "\","+
                extraField+
                "\"claimed_skill_ids\":[" + skills + "],"+
                "\"now\":" + now+
                "}";
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

    private static String requireEndpoint(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        String trimmed = value.trim();
        if (trimmed.length() > 2048) throw new IllegalArgumentException("INVALID:" + name);
        URI uri;
        try {
            uri = URI.create(trimmed);
        } catch (IllegalArgumentException failure) {
            throw new IllegalArgumentException("INVALID:" + name, failure);
        }
        String scheme = uri.getScheme();
        if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) ||
                uri.getHost() == null || uri.getHost().isBlank() || uri.getUserInfo() != null ||
                uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("INVALID:" + name);
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
